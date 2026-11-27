import { ICollectionTransactionRepository, AtomicMilkIntakeParams, AtomicMilkIntakeResult } from '../../application/ports/index.js';
import { MilkCollectionTransaction } from '../../domain/entities/MilkCollectionTransaction.js';
export interface AuthorizedMembershipRef {
    organizationId: string;
    tenantCustomerId: string;
    dairyName?: string;
}
export interface ConsolidatedHistoryUnavailableDairy {
    organizationId: string;
    dairyName?: string;
    code: string;
    message: string;
}
export interface ConsolidatedHistoryResult {
    transactions: MilkCollectionTransaction[];
    partial: boolean;
    unavailableDairies: ConsolidatedHistoryUnavailableDairy[];
}
export declare class PostgresCollectionTransactionRepository implements ICollectionTransactionRepository {
    private mapRowToTransaction;
    private assertValidOrganizationId;
    private getAuthorizedTenantDb;
    private isConstraintOrDomainError;
    private queryTenant;
    private validateOperationalContext;
    save(transaction: MilkCollectionTransaction): Promise<void>;
    findById(id: string, organizationId: string): Promise<MilkCollectionTransaction | null>;
    findByIdempotencyKey(key: string, organizationId: string): Promise<MilkCollectionTransaction | null>;
    private resolveExistingReplay;
    saveAtomicIntake(params: AtomicMilkIntakeParams): Promise<AtomicMilkIntakeResult>;
    listRecentBySession(sessionId: string, limit?: number, organizationId?: string): Promise<MilkCollectionTransaction[]>;
    listByCustomer(customerId: string, limit?: number, offset?: number, organizationId?: string): Promise<MilkCollectionTransaction[]>;
    listConsolidatedForMemberships(params: {
        memberships: AuthorizedMembershipRef[];
        limit?: number;
        offset?: number;
    }): Promise<ConsolidatedHistoryResult>;
    getMonthlySummary(customerId: string, monthYear: string, organizationId?: string): Promise<{
        monthYear: string;
        totalLiters: number;
        cowLiters: number;
        buffaloLiters: number;
        avgFat: number;
        avgSnf: number;
        totalAmount: number;
        transactionCount: number;
    }>;
}
//# sourceMappingURL=PostgresCollectionTransactionRepository.d.ts.map