import { ICustomerMembershipRepository } from '../../application/ports/index.js';
import { CustomerMembership } from '../../domain/entities/CustomerMembership.js';
import { GlobalCustomerIdentity } from '../../domain/entities/GlobalCustomerIdentity.js';
export declare class PostgresCustomerMembershipRepository implements ICustomerMembershipRepository {
    private getDb;
    /**
     * Resolves authoritative `customers.full_name` from each mapped, ACTIVE tenant DB
     * strictly scoped by `(id, organization_id)`. Never invents fake names and never
     * breaks control-plane membership listing when a tenant DB is unmapped or offline
     * (returns `null` for `customerName` in that case so partial-outage callers can proceed).
     */
    private resolveTenantCustomerNames;
    findGlobalIdentityByPhone(phoneE164: string): Promise<GlobalCustomerIdentity | null>;
    createGlobalIdentity(phoneE164: string): Promise<GlobalCustomerIdentity>;
    listMembershipsByGlobalId(globalCustomerId: string): Promise<CustomerMembership[]>;
    findMembership(globalCustomerId: string, organizationId: string): Promise<CustomerMembership | null>;
    saveMembership(membership: CustomerMembership): Promise<void>;
    updateMembershipStatus(organizationId: string, tenantCustomerId: string, status: string, farmerCode?: string, _customerName?: string): Promise<void>;
    getMembershipCount(globalCustomerId: string): Promise<number>;
}
//# sourceMappingURL=PostgresCustomerMembershipRepository.d.ts.map