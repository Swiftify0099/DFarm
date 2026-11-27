import { ILedgerRepository } from '../../application/ports/index.js';
import { CustomerLedgerAccount, LedgerEntry } from '../../domain/entities/CustomerLedgerAccount.js';
export declare class PostgresLedgerRepository implements ILedgerRepository {
    private assertValidOrganizationId;
    private getAuthorizedTenantDb;
    private isConstraintOrDomainError;
    private queryTenant;
    private validateCustomerCenterAndOperator;
    appendEntry(params: {
        organizationId: string;
        customerId: string;
        operatorId: string;
        entryType: 'CREDIT' | 'DEBIT';
        amount: number;
        balanceAfter?: number;
        referenceId?: string;
        sourceModule?: string;
        description: string;
        idempotencyKey?: string;
    }): Promise<{
        ledgerTransactionId: string;
        balanceAfter: number;
        isIdempotentReplay: boolean;
    }>;
    findById(accountId: string, organizationId: string): Promise<CustomerLedgerAccount | null>;
    findByCustomer(customerId: string, organizationId: string): Promise<CustomerLedgerAccount | null>;
    save(account: CustomerLedgerAccount, newEntry?: LedgerEntry, options?: {
        operatorId?: string;
    }): Promise<void>;
    listEntries(customerId: string, limit?: number, offset?: number, organizationId?: string): Promise<LedgerEntry[]>;
}
//# sourceMappingURL=PostgresLedgerRepository.d.ts.map