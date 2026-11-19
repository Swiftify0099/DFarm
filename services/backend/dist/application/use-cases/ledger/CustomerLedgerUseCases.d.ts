import { ILedgerRepository } from '../../ports/index.js';
export declare class GetCustomerKhataSummaryUseCase {
    private readonly ledgerRepo;
    constructor(ledgerRepo: ILedgerRepository);
    execute(customerId: string, organizationId?: string): Promise<{
        customerId: string;
        currentBalance: number;
        totalMilkEarnings: number;
        totalDeductions: number;
        lastUpdated: string;
    }>;
}
export declare class GetCustomerLedgerEntriesUseCase {
    private readonly ledgerRepo;
    constructor(ledgerRepo: ILedgerRepository);
    execute(customerId: string, limit?: number, offset?: number, organizationId?: string): Promise<import("../../../domain/entities/CustomerLedgerAccount.js").LedgerEntry[]>;
}
export declare class GetCustomerBillsUseCase {
    execute(customerId: string, limit?: number, organizationId?: string): Promise<any>;
}
//# sourceMappingURL=CustomerLedgerUseCases.d.ts.map