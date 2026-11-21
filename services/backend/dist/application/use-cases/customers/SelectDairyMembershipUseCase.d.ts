import { ICustomerMembershipRepository, ITokenService, ICustomerRepository } from '../../ports/index.js';
export interface SelectDairyMembershipParams {
    globalCustomerId?: string;
    dairyId: string;
    phone?: string;
    tenantCustomerId?: string;
}
export declare class SelectDairyMembershipUseCase {
    private readonly membershipRepo;
    private readonly tokenService;
    private readonly customerRepo?;
    constructor(membershipRepo: ICustomerMembershipRepository, tokenService: ITokenService, customerRepo?: ICustomerRepository | undefined);
    execute(params: SelectDairyMembershipParams): Promise<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
        selectedDairy: {
            dairyId: string;
            dairyName: string;
            dairyCode?: string | null;
            farmerCode?: string | null;
            tenantCustomerId: string;
            membershipStatus: string;
            centerId?: string | null;
            centerName?: string | null;
        };
        user: {
            id: string;
            globalCustomerId?: string;
            selectedDairyId: string;
            status: string;
            farmerCode?: string | null;
            customerProfile: {
                name: string;
                dairyName: string;
                village?: string;
            };
        };
    }>;
}
//# sourceMappingURL=SelectDairyMembershipUseCase.d.ts.map