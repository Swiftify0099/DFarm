import { BillingCycleType, BillingPeriodStatus, BillStatus, BillItemType, Shift, MilkCategory } from './enums.js';
export interface BillingPeriod {
    id: string;
    organizationId: string;
    centerId: string;
    periodName: string;
    startDate: string;
    endDate: string;
    cycleType: BillingCycleType;
    status: BillingPeriodStatus;
    totalFarmersBilled: number;
    totalMilkWeight: number;
    totalGrossMilkAmount: number;
    totalNetPayableAmount: number;
    generatedAt?: string | null;
    generatedBy?: string | null;
    approvedAt?: string | null;
    approvedBy?: string | null;
    finalizedAt?: string | null;
    finalizedBy?: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface MonthlyBill {
    id: string;
    billingPeriodId: string;
    customerId: string;
    centerId: string;
    organizationId: string;
    billNumber: string;
    billStatus: BillStatus;
    openingBalance: number;
    totalCowMilkWeight: number;
    totalCowMilkAmount: number;
    cowCollectionsCount: number;
    totalBuffaloMilkWeight: number;
    totalBuffaloMilkAmount: number;
    buffaloCollectionsCount: number;
    totalMilkCollectionsCount: number;
    totalMilkWeight: number;
    grossMilkAmount: number;
    otherCreditsAmount: number;
    totalCredits: number;
    feedPurchasesDebit: number;
    advancesDebit: number;
    deductionsDebit: number;
    otherDebitsAmount: number;
    totalDebits: number;
    settledPayoutsAmount: number;
    closingBalance: number;
    netPayableAmount: number;
    isNegativeBalance: boolean;
    pdfStoragePath?: string | null;
    pdfSha256Hash?: string | null;
    generatedAt?: string | null;
    generatedBy?: string | null;
    approvedAt?: string | null;
    approvedBy?: string | null;
    finalizedAt?: string | null;
    finalizedBy?: string | null;
    version: number;
    createdAt: string;
    updatedAt: string;
}
export interface MonthlyBillItem {
    id: string;
    billId: string;
    itemType: BillItemType;
    referenceId?: string | null;
    itemDate: string;
    shiftType?: Shift | null;
    milkCategory?: MilkCategory | null;
    quantity: number;
    measurementUnit: string;
    fatPercentage?: number | null;
    snfPercentage?: number | null;
    ratePerUnit?: number | null;
    amount: number;
    direction: 'CREDIT' | 'DEBIT';
    description?: string | null;
    createdAt: string;
}
export interface MonthlyBillAdjustment {
    id: string;
    billId: string;
    adjustmentType: 'CREDIT' | 'DEBIT';
    amount: number;
    reason: string;
    authorizedBy: string;
    createdAt: string;
}
export interface BillFinalizationRecord {
    id: string;
    billingPeriodId: string;
    totalFarmersBilled: number;
    totalGrossMilkAmount: number;
    totalNetPayoutAmount: number;
    totalFeedDeductions: number;
    totalAdvancesDeductions: number;
    totalOtherDeductions: number;
    totalSettledPayouts: number;
    snapshotChecksum: string;
    finalizedBy: string;
    finalizedAt: string;
}
export interface CustomerStatementSummary {
    bill: MonthlyBill;
    customer: {
        id: string;
        farmerCode: string;
        fullName: string;
        mobileNumber: string;
        maskedMobileNumber: string;
        bankName?: string | null;
        bankAccountNumber?: string | null;
        bankIfscCode?: string | null;
    };
    period: BillingPeriod;
    dairy: {
        organizationName: string;
        centerName: string;
        centerCode: string;
    };
    milkBreakdown: {
        cow: {
            totalQuantityKg: number;
            collectionsCount: number;
            totalAmount: number;
        };
        buffalo: {
            totalQuantityKg: number;
            collectionsCount: number;
            totalAmount: number;
        };
        totalQuantityKg: number;
        totalCollectionsCount: number;
        totalAmount: number;
    };
    items: MonthlyBillItem[];
    adjustments: MonthlyBillAdjustment[];
}
//# sourceMappingURL=billing.d.ts.map