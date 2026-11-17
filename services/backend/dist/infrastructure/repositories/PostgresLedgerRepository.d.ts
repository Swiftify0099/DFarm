import { ILedgerRepository } from '../../application/ports/index.js';
import { CustomerLedgerAccount, LedgerEntry } from '../../domain/entities/CustomerLedgerAccount.js';
export declare class PostgresLedgerRepository implements ILedgerRepository {
    private getDb;
    appendEntry(params: {
        customerId: string;
        entryType: 'CREDIT' | 'DEBIT';
        amount: number;
        balanceAfter?: number;
        referenceId?: string;
        sourceModule?: string;
        description: string;
    }): Promise<void>;
    findByCustomer(customerId: string, organizationId?: string): Promise<CustomerLedgerAccount | null>;
    save(account: CustomerLedgerAccount, newEntry?: LedgerEntry): Promise<void>;
    listEntries(customerId: string, limit?: number, offset?: number, organizationId?: string): Promise<LedgerEntry[]>;
}
//# sourceMappingURL=PostgresLedgerRepository.d.ts.map