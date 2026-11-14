export interface PayoutRecord {
    id: string;
    organizationId: string;
    centerId: string;
    customerId: string;
    customerName?: string;
    farmerCode?: string;
    direction: 'DAIRY_PAYS_CUSTOMER';
    amount: number;
    paymentMethod: 'BANK_TRANSFER' | 'CASH' | 'CHEQUE' | 'UPI';
    status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'SETTLED' | 'FAILED' | 'REVERSED';
    referenceNumber: string;
    bankAccountMask?: string | null;
    bankIfsc?: string | null;
    createdAt: string;
    settledAt?: string | null;
}
export interface PaymentBatch {
    id: string;
    batchNumber: string;
    status: 'DRAFT' | 'APPROVED' | 'SUBMITTED' | 'PARTIALLY_SETTLED' | 'SETTLED';
    totalBeneficiaries: number;
    totalAmount: number;
    successfulCount?: number;
    successfulAmount?: number;
    failedCount?: number;
    failedAmount?: number;
    paymentMethod: string;
    billingPeriodStart?: string | null;
    billingPeriodEnd?: string | null;
    createdAt: string;
    items?: any[];
}
export interface CustomerAdvance {
    id: string;
    customerId: string;
    customerName?: string;
    farmerCode?: string;
    principalAmount: number;
    balanceAmount: number;
    recoveryPercentage: number;
    purpose: string;
    status: 'REQUESTED' | 'APPROVED' | 'DISBURSED' | 'RECOVERING' | 'RECOVERED' | 'REJECTED';
    disbursedAt?: string;
    createdAt: string;
}
export declare const paymentApi: {
    createPayout: (data: {
        customerId: string;
        centerId: string;
        amount: number;
        paymentMethod: string;
        referenceNumber?: string;
        idempotencyKey: string;
    }) => Promise<PayoutRecord>;
    approvePayout: (payoutId: string) => Promise<any>;
    submitPayout: (payoutId: string) => Promise<any>;
    confirmPayout: (payoutId: string, data: {
        bankTransactionReference: string;
    }) => Promise<any>;
    failPayout: (payoutId: string, reason: string) => Promise<any>;
    reversePayout: (payoutId: string, reason: string) => Promise<any>;
    getPayoutById: (payoutId: string) => Promise<PayoutRecord>;
    getPayoutReceipt: (payoutId: string) => Promise<any>;
    createReceipt: (data: any) => Promise<any>;
    confirmReceipt: (receiptId: string, data: any) => Promise<any>;
    getReceiptById: (receiptId: string) => Promise<any>;
    createBatch: (data: {
        centerId?: string;
        billingCycleId?: string;
        billingPeriodStart?: string;
        billingPeriodEnd?: string;
        paymentMethod?: string;
        customerIds?: string[];
        idempotencyKey: string;
    }) => Promise<PaymentBatch>;
    getBatchById: (batchId: string) => Promise<PaymentBatch>;
    approveBatch: (batchId: string) => Promise<any>;
    submitBatch: (batchId: string) => Promise<any>;
    reconcileBatch: (batchId: string, results: any[]) => Promise<any>;
    importStatement: (data: {
        centerId?: string;
        statementDate: string;
        records: any[];
    }) => Promise<any>;
    getReconciliationRecords: (params?: {
        centerId?: string;
        status?: string;
        startDate?: string;
        endDate?: string;
    }) => Promise<any[]>;
    resolveRecord: (recordId: string, data: {
        resolution: string;
        notes?: string;
    }) => Promise<any>;
    createAdvance: (customerId: string, data: {
        principalAmount: number;
        recoveryPercentage: number;
        purpose: string;
        centerId: string;
    }) => Promise<any>;
    approveAdvance: (advanceId: string, data: {
        approvedAmount: number;
    }) => Promise<any>;
    rejectAdvance: (advanceId: string, reason: string) => Promise<any>;
    recoverAdvance: (advanceId: string, amount: number) => Promise<any>;
    createDeduction: (customerId: string, data: {
        amount: number;
        deductionCategory: string;
        reason: string;
        centerId: string;
    }) => Promise<any>;
    getAccounts: (params?: {
        centerId?: string;
        accountType?: string;
        minBalance?: number;
        limit?: number;
    }) => Promise<any[]>;
    reconcileAccount: (data: {
        customerId: string;
    }) => Promise<any>;
};
//# sourceMappingURL=paymentApi.d.ts.map