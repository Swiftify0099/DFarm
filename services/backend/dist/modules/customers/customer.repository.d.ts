import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreateCustomerParams, UpdateCustomerParams, CustomerQueryFilter, PaginatedCustomersResult, CustomerProfile } from './customer.types.js';
export declare class CustomerRepository {
    static getClient(overrideClient?: SupabaseClient): SupabaseClient;
    static createCustomerAtomic(params: CreateCustomerParams, _overrideClient?: SupabaseClient): Promise<CustomerProfile>;
    static getCustomerById(customerId: string, overrideClient?: SupabaseClient): Promise<CustomerProfile | null>;
    static findById(customerId: string, organizationId: string, _overrideClient?: SupabaseClient): Promise<CustomerProfile | null>;
    static findAll(filter: CustomerQueryFilter, overrideClient?: SupabaseClient): Promise<PaginatedCustomersResult>;
    static listPaginated(filter: CustomerQueryFilter, _overrideClient?: SupabaseClient): Promise<PaginatedCustomersResult>;
    static update(customerId: string, organizationId: string, params: UpdateCustomerParams, updatedBy: string, _overrideClient?: SupabaseClient): Promise<CustomerProfile>;
    static softDeleteAtomic(customerId: string, organizationId: string, deletedBy: string, reason: string, _overrideClient?: SupabaseClient): Promise<CustomerProfile>;
    static restoreAtomic(customerId: string, organizationId: string, restoredBy: string, reason: string, _overrideClient?: SupabaseClient): Promise<CustomerProfile>;
}
//# sourceMappingURL=customer.repository.d.ts.map