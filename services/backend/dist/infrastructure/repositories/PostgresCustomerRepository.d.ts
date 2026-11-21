import { ICustomerRepository } from '../../application/ports/index.js';
import { Customer, MilkCategory } from '../../domain/entities/Customer.js';
export declare class PostgresCustomerRepository implements ICustomerRepository {
    private mapRowToCustomer;
    private getBaseSelectQuery;
    private hydrateDetails;
    /**
     * Finds customer by ID strictly within the authorized dairy tenant database.
     * Cross-tenant scatter-gather queries are strictly prohibited.
     */
    findById(id: string, organizationId?: string, includeDeleted?: boolean): Promise<Customer | null>;
    findByFarmerCode(farmerCode: string, organizationId: string): Promise<Customer | null>;
    /**
     * Finds customer by RFID card strictly within the authorized dairy tenant database.
     */
    findByRfid(cardUid: string, organizationId?: string): Promise<Customer | null>;
    /**
     * Finds customer by normalized phone number strictly within the authorized dairy tenant database.
     */
    findByPhone(phoneE164: string, organizationId?: string): Promise<Customer | null>;
    listCustomers(params: {
        organizationId: string;
        centerId?: string;
        search?: string;
        category?: MilkCategory;
        limit?: number;
        offset?: number;
        includeSoftDeleted?: boolean;
    }): Promise<Customer[]>;
    save(customer: Customer): Promise<void>;
    listPendingRegistrations(organizationId?: string): Promise<Customer[]>;
    assignRfidCard(customerId: string, cardUid: string, organizationId?: string): Promise<void>;
    updateFaceEnrollment(customerId: string, modelVersion: string, encryptedPayload: string, organizationId?: string): Promise<void>;
}
//# sourceMappingURL=PostgresCustomerRepository.d.ts.map