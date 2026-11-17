import { ICollectionTransactionRepository } from '../../application/ports/index.js';
import { MilkCollectionTransaction } from '../../domain/entities/MilkCollectionTransaction.js';
export declare class PostgresCollectionTransactionRepository implements ICollectionTransactionRepository {
    private mapRowToTransaction;
    private getDb;
    save(transaction: MilkCollectionTransaction): Promise<void>;
    findByIdempotencyKey(key: string, organizationId?: string): Promise<MilkCollectionTransaction | null>;
    listRecentBySession(sessionId: string, limit?: number, organizationId?: string): Promise<MilkCollectionTransaction[]>;
    listByCustomer(customerId: string, limit?: number, offset?: number, organizationId?: string): Promise<MilkCollectionTransaction[]>;
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