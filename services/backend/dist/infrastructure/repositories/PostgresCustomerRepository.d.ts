import { ICustomerRepository } from '../../application/ports/index.js';
import { Customer, MilkCategory } from '../../domain/entities/Customer.js';
export declare class PostgresCustomerRepository implements ICustomerRepository {
    private static readonly fallbackStore;
    private mapRowToCustomer;
    private getBaseSelectQuery;
    findById(id: string): Promise<Customer | null>;
    findByFarmerCode(farmerCode: string, organizationId: string): Promise<Customer | null>;
    findByRfid(cardUid: string, organizationId?: string): Promise<Customer | null>;
    findByPhone(phoneE164: string, organizationId?: string): Promise<Customer | null>;
    listCustomers(params: {
        organizationId: string;
        centerId?: string;
        search?: string;
        category?: MilkCategory;
        limit?: number;
        offset?: number;
    }): Promise<Customer[]>;
    save(customer: Customer): Promise<void>;
    listPendingRegistrations(organizationId?: string): Promise<Customer[]>;
    updateFaceEnrollment(customerId: string, modelVersion: string, encryptedPayload: string): Promise<void>;
}
//# sourceMappingURL=PostgresCustomerRepository.d.ts.map