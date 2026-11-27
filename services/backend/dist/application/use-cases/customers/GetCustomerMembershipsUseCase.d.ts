import { ICustomerMembershipRepository, ICustomerRepository } from '../../ports/index.js';
import { CustomerMembership, MembershipStatus } from '../../../domain/entities/CustomerMembership.js';
export interface GetCustomerMembershipsParams {
    globalCustomerId?: string;
    phone?: string;
    customerId?: string;
    organizationId?: string;
}
export interface ReconcileCustomerMembershipsParams {
    organizationId: string;
    normalizedMobileNumber?: string;
    tenantCustomerId?: string;
    limit?: number;
}
export interface ReconciledMembershipRecord {
    globalCustomerId: string;
    organizationId: string;
    tenantCustomerId: string;
    membershipStatus: MembershipStatus;
    action: 'CREATED' | 'ALREADY_EXISTS';
    linkedTenantRow: boolean;
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
/**
 * Dedicated, bounded, idempotent administrative reconciliation command for backfilling
 * historical tenant customer records into the central customer_dairy_memberships index.
 * Must NEVER be invoked on ordinary customer request paths.
 */
export declare class ReconcileCustomerMembershipsUseCase {
    private readonly membershipRepo;
    constructor(membershipRepo: ICustomerMembershipRepository);
    execute(params: ReconcileCustomerMembershipsParams): Promise<{
        organizationId: string;
        scannedCount: number;
        createdCount: number;
        linkedCount: number;
        records: ReconciledMembershipRecord[];
    }>;
}
//# sourceMappingURL=GetCustomerMembershipsUseCase.d.ts.map