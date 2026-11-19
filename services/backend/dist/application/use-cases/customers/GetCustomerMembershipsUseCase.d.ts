import { ICustomerMembershipRepository, ICustomerRepository } from '../../ports/index.js';
import { CustomerMembership } from '../../../domain/entities/CustomerMembership.js';
export interface GetCustomerMembershipsParams {
    globalCustomerId?: string;
    phone?: string;
    customerId?: string;
    organizationId?: string;
}
export declare class GetCustomerMembershipsUseCase {
    private readonly membershipRepo;
    private readonly customerRepo?;
    constructor(membershipRepo: ICustomerMembershipRepository, customerRepo?: ICustomerRepository | undefined);
    execute(params: GetCustomerMembershipsParams): Promise<{
        globalCustomerId: string;
        normalizedMobileNumber?: string;
        memberships: ReturnType<CustomerMembership['toJSON']>[];
    }>;
}
//# sourceMappingURL=GetCustomerMembershipsUseCase.d.ts.map