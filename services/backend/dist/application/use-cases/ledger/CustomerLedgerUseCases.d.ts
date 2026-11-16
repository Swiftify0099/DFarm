import { ILedgerRepository } from '../../ports/index.js';
export declare class GetCustomerKhataSummaryUseCase {
    private readonly ledgerRepo;
    constructor(ledgerRepo: ILedgerRepository);
    execute(customerId: string): Promise<{
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
    execute(customerId: string, limit?: number, offset?: number): Promise<import("../../../domain/entities/CustomerLedgerAccount.js").LedgerEntry[]>;
}
export declare class GetCustomerBillsUseCase {
    execute(customerId: string, limit?: number): Promise<{
        id: any;
        billNumber: any;
        periodStart: any;
        periodEnd: any;
        totalLiters: number;
        grossAmount: number;
        deductionsAmount: number;
        netPayableAmount: number;
        status: any;
        paidAt: any;
    }[]>;
}
//# sourceMappingURL=CustomerLedgerUseCases.d.ts.map