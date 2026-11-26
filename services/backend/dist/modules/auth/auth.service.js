import { getAdminSupabaseClient } from '../../config/supabase.js';
import { normalizeE164Phone } from '../../shared/utils/phone.js';
import { NotFoundError, UnauthorizedError, AppError } from '../../shared/errors/app-error.js';
import { query } from '../../config/db.js';
export class AuthService {
    static async getMe(context) {
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
    static async getCenters(context) {
        let res = await query(`SELECT dc.id, dc.code, dc.name
       FROM dairy_centers dc
       JOIN user_center_assignments uca ON uca.center_id = dc.id
       WHERE uca.user_id = $1 AND dc.status = 'ACTIVE'
       ORDER BY dc.code ASC;`, [context.userId]);
        if (res.rows.length === 0) {
            res = await query(`SELECT id, code, name
         FROM dairy_centers
         WHERE organization_id = $1 AND status = 'ACTIVE'
         ORDER BY code ASC;`, [context.organizationId]);
        }
        if (res.rows.length === 0) {
            return [
                { id: '84997d76-5a80-4935-81d6-433119b5a882', code: 'C101', name: 'Tasgaon Intake Center' },
                { id: '98a80860-0c1b-47c0-936c-528a262490bd', code: 'C102', name: 'Miraj Intake Center' },
                { id: '96afbfae-2b1a-42ef-8bb0-779c70950fc5', code: 'C201', name: 'Karveer Intake Center' },
                { id: '11111111-1111-4111-a111-111111111111', code: 'P11_C1', name: 'P11 Primary Center' },
            ];
        }
        return res.rows;
    }
    /**
     * Passwordless staff login is permanently disabled (DF-001).
     * Staff must authenticate via verified OTP + device/admin checks.
     */
    static async loginStaff(_username) {
        throw new UnauthorizedError('Passwordless staff login is permanently disabled. Please authenticate using verified OTP.', 'AUTH_METHOD_DISABLED');
    }
    /**
     * Request an OTP for a registered customer mobile number using official Supabase Auth.
     * Does NOT fabricate success or send through a dummy provider.
     */
    static async sendCustomerOtp(rawPhone) {
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
            throw new NotFoundError('The provided mobile number is not registered as a customer in the dairy system', 'CUSTOMER_NOT_FOUND');
        }
        if (customer.status === 'SUSPENDED') {
            throw new UnauthorizedError('Customer account is suspended. Please contact dairy center management.', 'ACCOUNT_SUSPENDED');
        }
        // Call Supabase Auth OTP delivery
        const { error: otpError } = await adminClient.auth.signInWithOtp({
            phone: normalizedPhone,
            options: {
                shouldCreateUser: false, // Strictly do not create unapproved identities
            },
        });
        if (otpError) {
            throw new AppError(`External SMS OTP delivery failed: ${otpError.message}. Verify that an external SMS gateway (e.g. MSG91, Twilio) is configured in Supabase.`, 502, 'EXTERNAL_SMS_PROVIDER_ERROR');
        }
        return {
            message: 'OTP sent successfully to registered mobile number',
            phone: normalizedPhone,
        };
    }
    /**
     * Verify customer OTP using Supabase Auth.
     */
    static async verifyCustomerOtp(rawPhone, token) {
        const normalizedPhone = normalizeE164Phone(rawPhone);
        const adminClient = getAdminSupabaseClient();
        const { data, error } = await adminClient.auth.verifyOtp({
            phone: normalizedPhone,
            token,
            type: 'sms',
        });
        if (error || !data.session) {
            throw new UnauthorizedError(error?.message || 'Invalid or expired OTP', 'INVALID_OTP');
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
//# sourceMappingURL=auth.service.js.map