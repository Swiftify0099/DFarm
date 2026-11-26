import type { AuthContext } from '../../middleware/authenticate.js';
import { getAdminSupabaseClient } from '../../config/supabase.js';
import { normalizeE164Phone } from '../../shared/utils/phone.js';
import { NotFoundError, UnauthorizedError, ForbiddenError, AppError } from '../../shared/errors/app-error.js';
import { query } from '../../config/db.js';

const DAIRY_WIDE_CENTER_ROLES = new Set([
  'PRIMARY_DAIRY_ADMIN',
  'DAIRY_ADMIN',
  'DAIRY_OWNER',
  'BRANCH_MANAGER',
  'CENTER_MANAGER',
]);

export interface MeResponse {
  authUserId: string;
  internalId: string;
  actorType: 'STAFF' | 'CUSTOMER';
  role: string;
  organizationId: string;
  authorizedCenterIds: string[];
  primaryCenterId?: string;
  customerProfile?: {
    customerId: string;
    farmerCode: string;
  };
  officer?: {
    id: string;
    fullName: string;
    role: string;
    organizationId: string;
    centerId?: string | null;
    assignedCenters: Array<{ id: string; code: string; name: string; isPrimary: boolean }>;
  };
  accountStatus: string;
}

export class AuthService {
  public static async getMe(context: AuthContext): Promise<MeResponse> {
    const officer = context.actorType === 'STAFF' ? {
      id: context.userId,
      fullName: context.authUser?.user_metadata?.full_name || context.role,
      role: context.role,
      organizationId: context.organizationId,
      centerId: context.primaryCenterId || null,
      assignedCenters: context.centerIds.map(cId => ({
        id: cId,
        code: '',
        name: '',
        isPrimary: cId === context.primaryCenterId,
      })),
    } : undefined;

    return {
      authUserId: context.authUser.id,
      internalId: context.userId,
      actorType: context.actorType,
      role: context.role,
      organizationId: context.organizationId,
      authorizedCenterIds: context.centerIds,
      primaryCenterId: context.primaryCenterId,
      customerProfile: context.customerProfile,
      officer,
      accountStatus: 'ACTIVE',
    };
  }

  public static async getCenters(
    context: AuthContext,
    requestedOrganizationId?: string
  ): Promise<Array<{ id: string; code: string; name: string }>> {
    const role = String(context.role || '').trim().toUpperCase();
    const isPlatformAdmin = role === 'SUPER_ADMIN' || role === 'PLATFORM_OPERATOR';
    const isDairyWideRole = DAIRY_WIDE_CENTER_ROLES.has(role);

    if (
      requestedOrganizationId &&
      !isPlatformAdmin &&
      requestedOrganizationId.trim().toLowerCase() !== String(context.organizationId || '').toLowerCase()
    ) {
      throw new ForbiddenError(
        'Cross-tenant center directory access is forbidden.',
        'CROSS_TENANT_ACCESS_DENIED'
      );
    }

    const effectiveOrgId = isPlatformAdmin
      ? requestedOrganizationId?.trim() || context.organizationId || ''
      : String(context.organizationId || '').trim();

    if (isPlatformAdmin && !effectiveOrgId) {
      return [];
    }

    let res;
    try {
      if (isPlatformAdmin) {
        res = await query(
          `SELECT dc.id, dc.code, dc.name
           FROM dairy_centers dc
           JOIN organizations o ON o.id = dc.organization_id
           WHERE dc.organization_id::text = $1
             AND o.status = 'ACTIVE'
             AND dc.status = 'ACTIVE'
           ORDER BY dc.code ASC;`,
          [effectiveOrgId]
        );
        return res.rows;
      }

      if (!effectiveOrgId) {
        return [];
      }

      res = await query(
        `SELECT dc.id, dc.code, dc.name
         FROM dairy_centers dc
         JOIN user_center_assignments uca ON uca.center_id = dc.id
         JOIN organizations o ON o.id = dc.organization_id
         WHERE uca.user_id::text = $1
           AND dc.organization_id::text = $2
           AND o.status = 'ACTIVE'
           AND dc.status = 'ACTIVE'
         ORDER BY dc.code ASC;`,
        [context.userId, effectiveOrgId]
      );

      if (res.rows.length === 0 && isDairyWideRole) {
        res = await query(
          `SELECT dc.id, dc.code, dc.name
           FROM dairy_centers dc
           JOIN organizations o ON o.id = dc.organization_id
           WHERE dc.organization_id::text = $1
             AND o.status = 'ACTIVE'
             AND dc.status = 'ACTIVE'
           ORDER BY dc.code ASC;`,
          [effectiveOrgId]
        );
      }
    } catch {
      throw new AppError(
        'Center lookup database is unavailable',
        503,
        'AUTH_DB_UNAVAILABLE'
      );
    }

    return res.rows;
  }

  /**
   * Passwordless staff login is permanently disabled (DF-001).
   * Staff must authenticate via verified OTP + device/admin checks.
   */
  public static async loginStaff(_username: string): Promise<never> {
    throw new UnauthorizedError(
      'Passwordless staff login is permanently disabled. Please authenticate using verified OTP.',
      'AUTH_METHOD_DISABLED'
    );
  }

  /**
   * Request an OTP for a registered customer mobile number using official Supabase Auth.
   * Does NOT fabricate success or send through a dummy provider.
   */
  public static async sendCustomerOtp(rawPhone: string): Promise<{ message: string; phone: string }> {
    const normalizedPhone = normalizeE164Phone(rawPhone);
    const adminClient = getAdminSupabaseClient();

    // Verify that the mobile number corresponds to an active, registered customer
    const { data: customer, error: dbError } = await adminClient
      .from('customers')
      .select('id, organization_id, status, is_deleted')
      .eq('normalized_mobile_number', normalizedPhone)
      .eq('is_deleted', false)
      .maybeSingle();

    if (dbError) {
      throw dbError;
    }

    if (!customer) {
      throw new NotFoundError(
        'The provided mobile number is not registered as a customer in the dairy system',
        'CUSTOMER_NOT_FOUND'
      );
    }

    if (customer.status === 'SUSPENDED') {
      throw new UnauthorizedError(
        'Customer account is suspended. Please contact dairy center management.',
        'ACCOUNT_SUSPENDED'
      );
    }

    // Call Supabase Auth OTP delivery
    const { error: otpError } = await adminClient.auth.signInWithOtp({
      phone: normalizedPhone,
      options: {
        shouldCreateUser: false, // Strictly do not create unapproved identities
      },
    });

    if (otpError) {
      throw new AppError(
        `External SMS OTP delivery failed: ${otpError.message}. Verify that an external SMS gateway (e.g. MSG91, Twilio) is configured in Supabase.`,
        502,
        'EXTERNAL_SMS_PROVIDER_ERROR'
      );
    }

    return {
      message: 'OTP sent successfully to registered mobile number',
      phone: normalizedPhone,
    };
  }

  /**
   * Verify customer OTP using Supabase Auth.
   */
  public static async verifyCustomerOtp(rawPhone: string, token: string): Promise<{ session: unknown }> {
    const normalizedPhone = normalizeE164Phone(rawPhone);
    const adminClient = getAdminSupabaseClient();

    const { data, error } = await adminClient.auth.verifyOtp({
      phone: normalizedPhone,
      token,
      type: 'sms',
    });

    if (error || !data.session) {
      throw new UnauthorizedError(
        error?.message || 'Invalid or expired OTP',
        'INVALID_OTP'
      );
    }

    // If customer has no auth_user_id yet, link it
    if (data.user) {
      await adminClient
        .from('customers')
        .update({ auth_user_id: data.user.id })
        .eq('normalized_mobile_number', normalizedPhone)
        .is('auth_user_id', null);
    }

    return { session: data.session };
  }
}
