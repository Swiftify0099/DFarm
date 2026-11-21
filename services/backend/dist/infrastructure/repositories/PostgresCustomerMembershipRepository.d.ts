import { ICustomerMembershipRepository } from '../../application/ports/index.js';
import { CustomerMembership } from '../../domain/entities/CustomerMembership.js';
import { GlobalCustomerIdentity } from '../../domain/entities/GlobalCustomerIdentity.js';
export declare class PostgresCustomerMembershipRepository implements ICustomerMembershipRepository {
    private getDb;
    findGlobalIdentityByPhone(phoneE164: string): Promise<GlobalCustomerIdentity | null>;
    createGlobalIdentity(phoneE164: string): Promise<GlobalCustomerIdentity>;
    listMembershipsByGlobalId(globalCustomerId: string): Promise<CustomerMembership[]>;
    findMembership(globalCustomerId: string, organizationId: string): Promise<CustomerMembership | null>;
    saveMembership(membership: CustomerMembership): Promise<void>;
    updateMembershipStatus(organizationId: string, tenantCustomerId: string, status: string, farmerCode?: string, customerName?: string): Promise<void>;
    getMembershipCount(globalCustomerId: string): Promise<number>;
}
//# sourceMappingURL=PostgresCustomerMembershipRepository.d.ts.map