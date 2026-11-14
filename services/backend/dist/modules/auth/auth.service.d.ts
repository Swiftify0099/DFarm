import type { AuthContext } from '../../middleware/authenticate.js';
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
        assignedCenters: Array<{
            id: string;
            code: string;
            name: string;
            isPrimary: boolean;
        }>;
    };
    accountStatus: string;
}
export declare class AuthService {
    static getMe(context: AuthContext): Promise<MeResponse>;
    static getCenters(context: AuthContext): Promise<Array<{
        id: string;
        code: string;
        name: string;
    }>>;
    /**
     * Internal staff login by username for administration / field officer onboarding.
     */
    static loginStaff(username: string): Promise<{
        token: string;
        user: Record<string, unknown>;
    }>;
    /**
     * Request an OTP for a registered customer mobile number using official Supabase Auth.
     * Does NOT fabricate success or send through a dummy provider.
     */
    static sendCustomerOtp(rawPhone: string): Promise<{
        message: string;
        phone: string;
    }>;
    /**
     * Verify customer OTP using Supabase Auth.
     */
    static verifyCustomerOtp(rawPhone: string, token: string): Promise<{
        session: unknown;
    }>;
}
//# sourceMappingURL=auth.service.d.ts.map