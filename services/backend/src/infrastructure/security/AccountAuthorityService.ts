import { DomainError, ForbiddenError } from '../../domain/errors/index.js';
import { logger } from '../../shared/logger/index.js';
import { db } from '../database/PostgresPool.js';
import { tenantDbManager } from '../database/TenantDatabaseManager.js';

export interface VerifiedStaffAuthority {
  found: true;
  actorType: 'STAFF';
  userId: string;
  organizationId: string;
  role: string;
  fullName?: string;
  phoneNumber?: string;
  centerIds: string[];
  primaryCenterId?: string;
}

export interface VerifiedCustomerAuthority {
  found: true;
  actorType: 'CUSTOMER';
  userId: string;
  organizationId?: string;
  centerId?: string;
  globalCustomerId?: string;
  role: 'FARMER_CUSTOMER' | 'GUEST_FARMER';
  fullName?: string;
  phoneNumber?: string;
  farmerCode?: string;
  registrationStatus?: string;
  accountStatus: string;
}

export type VerifiedAuthorityResult = VerifiedStaffAuthority | VerifiedCustomerAuthority;

/**
 * Shared authoritative identity and organization verification service.
 * Used by both `middleware/authenticate.ts` and `presentation/middleware/authenticate.ts`
 * plus `RefreshTokenUseCase` so all authentication paths enforce identical fail-closed rules.
 */
export class AccountAuthorityService {
  private throwUnavailable(context: string, err: unknown): never {
    logger.error(
      { context, err: err instanceof Error ? err.message : 'unknown' },
      '[AccountAuthorityService] Database verification failed (failing closed)'
    );
    throw new DomainError(
      'Authentication verification database is unavailable',
      'AUTH_DB_UNAVAILABLE',
      503
    );
  }

  public async verifyStaff(params: {
    userId: string;
    claimedOrganizationId?: string;
    loadCenterAssignments?: boolean;
  }): Promise<VerifiedStaffAuthority | null> {
    let staffRow: any = null;
    try {
      const staffRes = await db.query(
        `SELECT u.id, u.organization_id, u.username, u.full_name, u.email, u.phone_number,
                u.role, u.user_role, u.status, o.status AS org_status
         FROM users u
         LEFT JOIN organizations o ON o.id = u.organization_id
         WHERE u.id::text = $1
         LIMIT 1;`,
        [params.userId]
      );
      if (staffRes.rows.length > 0) {
        staffRow = staffRes.rows[0];
      }
    } catch (err) {
      this.throwUnavailable('verifyStaff.userLookup', err);
    }

    if (!staffRow) {
      return null;
    }

    const userStatus = String(staffRow.status || '').toUpperCase();
    if (userStatus !== 'ACTIVE') {
      throw new ForbiddenError(
        `Staff account status is ${staffRow.status || 'INACTIVE'}. Access denied.`,
        'ACCOUNT_SUSPENDED'
      );
    }

    const resolvedRole = String(staffRow.user_role || staffRow.role || '').trim().toUpperCase();
    if (!resolvedRole) {
      throw new ForbiddenError('Staff account has no valid authoritative role.', 'ROLE_MISSING');
    }

    const isPlatformStaff = resolvedRole === 'SUPER_ADMIN' || resolvedRole === 'PLATFORM_OPERATOR';
    const dbOrgId = staffRow.organization_id ? String(staffRow.organization_id) : undefined;

    if (!isPlatformStaff) {
      if (!dbOrgId) {
        throw new ForbiddenError('Staff account is not mapped to an active dairy cooperative.', 'ORG_MISSING');
      }
      if (String(staffRow.org_status || '').toUpperCase() !== 'ACTIVE') {
        throw new ForbiddenError(
          'Assigned dairy cooperative is currently inactive or suspended.',
          'ORG_SUSPENDED'
        );
      }
      if (
        params.claimedOrganizationId &&
        params.claimedOrganizationId.trim().toLowerCase() !== dbOrgId.toLowerCase()
      ) {
        throw new ForbiddenError(
          'Token organization context does not match authoritative user organization.',
          'TENANT_CONTEXT_MISMATCH'
        );
      }
    }

    const resolvedOrgId = dbOrgId || params.claimedOrganizationId || '';
    let centerIds: string[] = [];
    let primaryCenterId: string | undefined;

    if (params.loadCenterAssignments !== false) {
      try {
        const assignRes = await db.query(
          `SELECT uca.center_id, uca.is_primary
           FROM user_center_assignments uca
           JOIN dairy_centers dc ON dc.id = uca.center_id
           WHERE uca.user_id::text = $1
             AND ($2::text = '' OR dc.organization_id::text = $2);`,
          [staffRow.id, dbOrgId || '']
        );
        const rows = assignRes.rows as Array<{ center_id: string; is_primary: boolean }>;
        centerIds = rows.map((r) => String(r.center_id));
        const primaryRow = rows.find((r) => r.is_primary);
        primaryCenterId = primaryRow ? String(primaryRow.center_id) : centerIds[0];
      } catch (err) {
        this.throwUnavailable('verifyStaff.centerAssignments', err);
      }
    }

    return {
      found: true,
      actorType: 'STAFF',
      userId: String(staffRow.id),
      organizationId: resolvedOrgId,
      role: resolvedRole,
      fullName: staffRow.full_name || undefined,
      phoneNumber: staffRow.phone_number || undefined,
      centerIds,
      primaryCenterId,
    };
  }

  public async verifyCustomer(params: {
    userId: string;
    claimedRole?: string;
    organizationId?: string;
    globalCustomerId?: string;
    allowGuestFarmer: boolean;
    strictActiveOnly: boolean;
  }): Promise<VerifiedCustomerAuthority | null> {
    const claimedRoleUpper = String(params.claimedRole || '').trim().toUpperCase();
    const isGuestSubject = params.userId.startsWith('unregistered:');

    if (claimedRoleUpper === 'GUEST_FARMER' || isGuestSubject) {
      if (!params.allowGuestFarmer) {
        return null;
      }
      const guestPhone = isGuestSubject ? params.userId.slice('unregistered:'.length).trim() : '';
      let identityRow: any = null;
      try {
        const res = await db.query(
          `SELECT id, normalized_mobile_number, phone_verified_at
           FROM global_customer_identities
           WHERE ($1::text IS NOT NULL AND id::text = $1)
              OR ($2::text <> '' AND normalized_mobile_number = $2)
           LIMIT 1;`,
          [params.globalCustomerId || null, guestPhone]
        );
        if (res.rows.length > 0) {
          identityRow = res.rows[0];
        }
      } catch (err) {
        this.throwUnavailable('verifyCustomer.guestIdentity', err);
      }

      if (!identityRow || !identityRow.phone_verified_at) {
        return null;
      }

      return {
        found: true,
        actorType: 'CUSTOMER',
        userId: `unregistered:${identityRow.normalized_mobile_number}`,
        globalCustomerId: String(identityRow.id),
        role: 'GUEST_FARMER',
        phoneNumber: String(identityRow.normalized_mobile_number),
        registrationStatus: 'UNREGISTERED',
        accountStatus: 'GUEST',
      };
    }

    // Registered Customer verification across central + membership + tenant DB
    let customerRow: any = null;
    let membershipRow: any = null;
    let orgStatus: string | null = null;

    try {
      const custRes = await db.query(
        `SELECT c.id, c.organization_id, c.primary_center_id, c.farmer_code, c.full_name,
                c.normalized_mobile_number, c.status, c.registration_status, c.is_deleted,
                c.global_customer_id, o.status AS org_status
         FROM customers c
         LEFT JOIN organizations o ON o.id = c.organization_id
         WHERE c.id::text = $1
         LIMIT 1;`,
        [params.userId]
      );
      if (custRes.rows.length > 0) {
        customerRow = custRes.rows[0];
        orgStatus = customerRow.org_status || null;
      }

      const memRes = await db.query(
        `SELECT m.tenant_customer_id, m.global_customer_id, m.organization_id, m.center_id,
                m.farmer_code, m.membership_status, o.status AS org_status
         FROM customer_dairy_memberships m
         LEFT JOIN organizations o ON o.id = m.organization_id
         WHERE m.tenant_customer_id::text = $1
           AND ($2::text IS NULL OR m.organization_id::text = $2)
         LIMIT 1;`,
        [params.userId, params.organizationId || null]
      );
      if (memRes.rows.length > 0) {
        membershipRow = memRes.rows[0];
        if (!orgStatus && membershipRow.org_status) {
          orgStatus = membershipRow.org_status;
        }
      }

      const targetOrgId =
        params.organizationId || customerRow?.organization_id || membershipRow?.organization_id;

      if (!customerRow && targetOrgId) {
        const tenantDb = await tenantDbManager.getTenantDb(String(targetOrgId));
        const tenantCustRes = await tenantDb.query(
          `SELECT id, organization_id, primary_center_id, farmer_code, full_name,
                  normalized_mobile_number, status, registration_status, is_deleted, global_customer_id
           FROM customers
           WHERE id::text = $1
           LIMIT 1;`,
          [params.userId]
        );
        if (tenantCustRes.rows.length > 0) {
          customerRow = tenantCustRes.rows[0];
        }
      }

      const authoritativeOrgId =
        customerRow?.organization_id || membershipRow?.organization_id || params.organizationId;
      if ((customerRow || membershipRow) && authoritativeOrgId && !orgStatus) {
        const orgRes = await db.query(
          `SELECT status FROM organizations WHERE id::text = $1 LIMIT 1;`,
          [String(authoritativeOrgId)]
        );
        if (orgRes.rows.length > 0) {
          orgStatus = orgRes.rows[0].status;
        } else {
          const tenantDb = await tenantDbManager.getTenantDb(String(authoritativeOrgId));
          const tenantOrgRes = await tenantDb.query(
            `SELECT status FROM organizations WHERE id::text = $1 LIMIT 1;`,
            [String(authoritativeOrgId)]
          );
          if (tenantOrgRes.rows.length > 0) {
            orgStatus = tenantOrgRes.rows[0].status;
          }
        }
      }
    } catch (err) {
      if (err instanceof DomainError) throw err;
      this.throwUnavailable('verifyCustomer.lookup', err);
    }

    if (!customerRow && !membershipRow) {
      return null;
    }

    if (customerRow?.is_deleted) {
      throw new ForbiddenError('Customer account has been soft-deleted.', 'ACCOUNT_DELETED');
    }

    const custStatus = String(customerRow?.status || '').toUpperCase();
    const regStatus = String(
      customerRow?.registration_status || membershipRow?.membership_status || ''
    ).toUpperCase();
    const memStatus = String(membershipRow?.membership_status || '').toUpperCase();

    if (
      custStatus === 'SUSPENDED' ||
      custStatus === 'SOFT_DELETED' ||
      regStatus === 'REJECTED' ||
      memStatus === 'SUSPENDED' ||
      memStatus === 'REJECTED'
    ) {
      throw new ForbiddenError('Customer account or membership is suspended or rejected.', 'ACCOUNT_SUSPENDED');
    }

    if (params.strictActiveOnly) {
      if (customerRow && custStatus !== 'ACTIVE') {
        throw new ForbiddenError('Customer account is not active.', 'ACCOUNT_SUSPENDED');
      }
    } else if (customerRow && custStatus === 'INACTIVE' && regStatus !== 'PENDING_APPROVAL') {
      throw new ForbiddenError('Customer account is inactive or suspended.', 'ACCOUNT_SUSPENDED');
    }

    const authoritativeOrgId = String(
      customerRow?.organization_id || membershipRow?.organization_id || params.organizationId || ''
    );
    if (!authoritativeOrgId) {
      throw new ForbiddenError('Customer tenant organization mapping is missing.', 'ORG_MISSING');
    }
    if (!orgStatus || String(orgStatus).toUpperCase() !== 'ACTIVE') {
      throw new ForbiddenError('Customer dairy cooperative is inactive or suspended.', 'ORG_SUSPENDED');
    }

    return {
      found: true,
      actorType: 'CUSTOMER',
      userId: String(customerRow?.id || membershipRow?.tenant_customer_id || params.userId),
      organizationId: authoritativeOrgId,
      centerId: customerRow?.primary_center_id || membershipRow?.center_id || undefined,
      globalCustomerId:
        customerRow?.global_customer_id ||
        membershipRow?.global_customer_id ||
        params.globalCustomerId,
      role: 'FARMER_CUSTOMER',
      fullName: customerRow?.full_name || undefined,
      phoneNumber: customerRow?.normalized_mobile_number || undefined,
      farmerCode: customerRow?.farmer_code || membershipRow?.farmer_code || undefined,
      registrationStatus: regStatus || undefined,
      accountStatus: custStatus || memStatus || 'ACTIVE',
    };
  }
}

export const accountAuthorityService = new AccountAuthorityService();
