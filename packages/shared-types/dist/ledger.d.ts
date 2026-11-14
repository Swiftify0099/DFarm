import { LedgerTransactionType, LedgerDirection, AdvanceStatus, DeductionCategory } from './enums.js';
export interface CustomerLedgerAccount {
    id: string;
    customerId: string;
    organizationId: string;
    currency: string;
    currentBalance: number;
    status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
    lastTransactionAt?: string | null;
    updatedAt: string;
}
export interface CustomerLedgerSummary {
    customerId: string;
    customerName: string;
    farmerCode: string;
    organizationId: string;
    centerId: string;
    centerName?: string;
    currency: string;
    openingBalance: number;
    totalMilkCredits: number;
    otherApprovedCredits: number;
    totalCredits: number;
    totalDebits: number;
    advances: number;
    deductions: number;
    settledPayouts: number;
    otherDebits: number;
    currentBalance: number;
    latestTransaction?: {
        id: string;
        transactionType: LedgerTransactionType;
        direction: LedgerDirection;
        amount: number;
        createdAt: string;
        description?: string;
    } | null;
    accountStatus: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
}
export interface LedgerEntry {
    id?: string;
    transactionId: string;
    accountId: string;
    accountType: 'CUSTOMER_PAYABLE' | 'MILK_PURCHASE_EXPENSE' | 'FEED_INVENTORY' | 'CASH_BANK' | 'ADVANCE_RECEIVABLE' | 'DEDUCTION_INCOME' | 'INCENTIVE_EXPENSE' | 'OPENING_BALANCE_EQUITY' | 'RECONCILIATION_SUSPENSE';
    entryType: 'DEBIT' | 'CREDIT';
    amount: number;
}
export interface LedgerTransaction {
    id: string;
    organizationId: string;
    centerId: string;
    customerId: string;
    transactionType: LedgerTransactionType;
    direction: LedgerDirection;
    amount: number;
    balanceAfter: number;
    referenceEntity: string;
    referenceId: string;
    description?: string | null;
    idempotencyKey: string;
    createdBy: string;
    createdAt: string;
    receiptNumber?: string;
    entries?: LedgerEntry[];
}
export interface CustomerAdvance {
    id: string;
    customerId: string;
    centerId: string;
    advanceDate: string;
    principalAmount: number;
    requestedAmount: number;
    approvedAmount: number;
    recoveryType: 'MONTHLY_BILL_DEDUCTION' | 'INSTALLMENTS' | 'MANUAL';
    totalRecoveredAmount: number;
    outstandingAmount: number;
    status: AdvanceStatus;
    reason: string;
    approvedBy?: string | null;
    approvedAt?: string | null;
    rejectionReason?: string | null;
    disbursedBy?: string | null;
    disbursedAt?: string | null;
}
export interface CustomerDeduction {
    id: string;
    customerId: string;
    centerId: string;
    deductionCategory: DeductionCategory;
    amount: number;
    description?: string | null;
    supportingReference?: string | null;
    status: 'POSTED' | 'APPLIED_TO_BILL' | 'CANCELLED';
    approvedBy: string;
    ledgerTransactionId?: string | null;
    createdAt: string;
}
export interface CustomerAdjustment {
    id: string;
    customerId: string;
    adjustmentType: 'CREDIT' | 'DEBIT';
    amount: number;
    reason: string;
    approvedBy: string;
    originalTransactionId?: string | null;
    ledgerTransactionId?: string | null;
    createdAt: string;
}
export interface LedgerStatement {
    customerId: string;
    customerName: string;
    farmerCode: string;
    organizationName: string;
    centerName: string;
    statementPeriod: {
        startDate: string;
        endDate: string;
    };
    openingBalance: number;
    totalCredits: number;
    totalDebits: number;
    closingBalance: number;
    transactions: Array<{
        id: string;
        date: string;
        transactionType: LedgerTransactionType;
        direction: LedgerDirection;
        amount: number;
        balanceAfter: number;
        referenceEntity: string;
        receiptNumber: string;
        description: string;
    }>;
    generatedAt: string;
}
export interface ReconciliationDiscrepancy {
    type: 'RUNNING_BALANCE_MISMATCH' | 'UNBALANCED_JOURNAL' | 'ORPHAN_TRANSACTION' | 'MISSING_LEDGER_ENTRY' | 'DUPLICATE_POSTING' | 'INVALID_REFERENCE';
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
    message: string;
    transactionId?: string;
    collectionId?: string;
    referenceId?: string;
    expectedAmount?: number;
    debitSum?: number;
    creditSum?: number;
    storedBalance?: number;
    computedBalance?: number;
    difference?: number;
}
export interface ReconciliationReport {
    customerId: string;
    customerName: string;
    farmerCode: string;
    isReconciled: boolean;
    discrepancyCount: number;
    accountBalance: number;
    computedBalance: number;
    summary: {
        totalCredits: number;
        totalDebits: number;
        totalMilkCredits: number;
        totalAdvanceDebits: number;
        totalRecoveryCredits: number;
        totalDeductionDebits: number;
        totalPayoutDebits: number;
        totalAdjustmentsCredit: number;
        totalAdjustmentsDebit: number;
        journalTotalDebits: number;
        journalTotalCredits: number;
    };
    discrepancies: ReconciliationDiscrepancy[];
    reconciledAt: string;
}
/**
 * Defined Interface Contract for Feed Purchase Debit Integration (P14 handoff).
 * Until P14 is completed, other modules must adhere strictly to this contract.
 */
export interface FeedDebitIntegrationContract {
    customerId: string;
    centerId: string;
    organizationId: string;
    feedSaleId: string;
    saleInvoiceNumber: string;
    totalDebitAmount: number;
    items: Array<{
        feedProductId: string;
        productName: string;
        quantityBags: number;
        unitPrice: number;
        itemTotal: number;
    }>;
    soldByUserId: string;
    idempotencyKey: string;
    transactionDate?: string;
}
//# sourceMappingURL=ledger.d.ts.map