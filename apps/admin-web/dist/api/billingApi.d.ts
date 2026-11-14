export interface BillingPeriod {
    id: string;
    organizationId: string;
    centerId: string;
    centerName?: string;
    periodName: string;
    periodType: 'TEN_DAY' | 'MONTHLY' | 'CUSTOM';
    startDate: string;
    endDate: string;
    status: 'OPEN' | 'CALCULATING' | 'READY_FOR_REVIEW' | 'APPROVED' | 'FINALIZED' | 'CLOSED';
    totalBills: number;
    totalGrossAmount: number;
    totalDeductions: number;
    totalNetAmount: number;
    totalQuantityLiters: number;
    createdAt: string;
}
export interface MonthlyBill {
    id: string;
    billingPeriodId: string;
    customerId: string;
    customerName?: string;
    farmerCode?: string;
    billNumber: string;
    totalQuantityLiters: number;
    averageFat: number;
    averageSnf: number;
    grossAmount: number;
    feedDeductions: number;
    advanceDeductions: number;
    otherDeductions: number;
    totalDeductions: number;
    netPayableAmount: number;
    status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'FINALIZED' | 'PAID';
    finalizedAt?: string | null;
    sha256Checksum?: string;
    createdAt: string;
}
export declare const billingApi: {
    listPeriods: (params?: {
        centerId?: string;
        status?: string;
        page?: number;
        limit?: number;
    }) => Promise<any>;
    createPeriod: (data: {
        centerId: string;
        periodName: string;
        periodType: string;
        startDate: string;
        endDate: string;
    }) => Promise<BillingPeriod>;
    getPeriod: (periodId: string) => Promise<any>;
    generateBills: (periodId: string, options?: {
        forceRecalculate?: boolean;
        customerIds?: string[];
    }) => Promise<any>;
    getPeriodProgress: (periodId: string) => Promise<any>;
    submitReview: (billId: string, notes?: string) => Promise<MonthlyBill>;
    approveBill: (billId: string, notes?: string) => Promise<MonthlyBill>;
    finalizeBill: (billId: string, notes?: string) => Promise<MonthlyBill>;
    adjustBill: (billId: string, data: {
        adjustmentType: string;
        amount: number;
        reason: string;
    }) => Promise<MonthlyBill>;
    downloadPdf: (billId: string, billNumber?: string) => Promise<void>;
};
//# sourceMappingURL=billingApi.d.ts.map