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
export declare class AccountAuthorityService {
    private throwUnavailable;
    verifyStaff(params: {
        userId: string;
        claimedOrganizationId?: string;
        loadCenterAssignments?: boolean;
    }): Promise<VerifiedStaffAuthority | null>;
    verifyCustomer(params: {
        userId: string;
        claimedRole?: string;
        organizationId?: string;
        globalCustomerId?: string;
        allowGuestFarmer: boolean;
        strictActiveOnly: boolean;
    }): Promise<VerifiedCustomerAuthority | null>;
}
export declare const accountAuthorityService: AccountAuthorityService;
//# sourceMappingURL=AccountAuthorityService.d.ts.map