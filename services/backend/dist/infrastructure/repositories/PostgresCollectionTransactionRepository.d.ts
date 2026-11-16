import { ICollectionTransactionRepository } from '../../application/ports/index.js';
import { MilkCollectionTransaction } from '../../domain/entities/MilkCollectionTransaction.js';
export declare class PostgresCollectionTransactionRepository implements ICollectionTransactionRepository {
    private mapRowToTransaction;
    save(transaction: MilkCollectionTransaction): Promise<void>;
    findByIdempotencyKey(key: string): Promise<MilkCollectionTransaction | null>;
    listRecentBySession(sessionId: string, limit?: number): Promise<MilkCollectionTransaction[]>;
    listByCustomer(customerId: string, limit?: number, offset?: number): Promise<MilkCollectionTransaction[]>;
    getMonthlySummary(customerId: string, monthYear: string): Promise<{
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