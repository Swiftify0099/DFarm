export interface LedgerEntry {
    id: string;
    transactionDate: string;
    type: 'MILK_CREDIT' | 'FEED_DEBIT' | 'CASH_ADVANCE_DEBIT' | 'BANK_PAYOUT' | 'ADJUSTMENT';
    description: string;
    creditAmount: number;
    debitAmount: number;
    runningBalance: number;
    referenceId?: string;
}
export interface CustomerLedgerAccountProps {
    id: string;
    customerId: string;
    organizationId: string;
    currentBalance: number;
    totalMilkEarnings: number;
    totalDeductions: number;
    lastUpdated: string;
}
export declare class CustomerLedgerAccount {
    private props;
    constructor(props: CustomerLedgerAccountProps);
    get id(): string;
    get customerId(): string;
    get currentBalance(): number;
    get totalMilkEarnings(): number;
    get totalDeductions(): number;
    postCredit(amount: number, description: string, referenceId?: string): LedgerEntry;
    postDebit(amount: number, type: 'FEED_DEBIT' | 'CASH_ADVANCE_DEBIT' | 'BANK_PAYOUT', description: string, referenceId?: string): LedgerEntry;
    toKhataSummary(): {
        customerId: string;
        currentBalance: number;
        totalMilkEarnings: number;
        totalDeductions: number;
        lastUpdated: string;
    };
}
//# sourceMappingURL=CustomerLedgerAccount.d.ts.map