import { ILedgerRepository } from '../../application/ports/index.js';
import { CustomerLedgerAccount, LedgerEntry } from '../../domain/entities/CustomerLedgerAccount.js';
export declare class PostgresLedgerRepository implements ILedgerRepository {
    findByCustomer(customerId: string): Promise<CustomerLedgerAccount | null>;
    save(account: CustomerLedgerAccount, newEntry?: LedgerEntry): Promise<void>;
    listEntries(customerId: string, limit?: number, offset?: number): Promise<LedgerEntry[]>;
}
//# sourceMappingURL=PostgresLedgerRepository.d.ts.map