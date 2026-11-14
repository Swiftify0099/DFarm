import { BillingCycleType, BillingPeriodStatus, type BillingPeriod, type MonthlyBill, type CustomerStatementSummary } from '@dfarm/shared-types';
import type { AuthContext } from '../../middleware/authenticate.js';
export declare class BillingService {
    /**
     * 1. Create a new billing period for a center.
     */
    static createPeriod(data: {
        centerId: string;
        periodName: string;
        startDate: string;
        endDate: string;
        cycleType?: BillingCycleType;
    }, auth: AuthContext): Promise<BillingPeriod>;
    /**
     * 2. List billing periods with center/org filters and pagination.
     */
    static listPeriods(filter: {
        centerId?: string;
        status?: BillingPeriodStatus;
        page?: number;
        limit?: number;
    }, auth: AuthContext): Promise<{
        periods: BillingPeriod[];
        total: number;
        page: number;
        limit: number;
    }>;
    /**
     * 3. Get single billing period by ID.
     */
    static getPeriod(periodId: string, auth: AuthContext): Promise<BillingPeriod & {
        billsSummary: any;
    }>;
    /**
     * 4. Get period generation progress.
     */
    static getPeriodProgress(periodId: string, auth: AuthContext): Promise<any>;
    /**
     * 5. Generate Bills for a Billing Period (All customers or single customer).
     * Follows strict financial model:
     * Closing Balance = Opening Balance + Credits - Debits - Settled Payouts.
     */
    static generateBills(periodId: string, options: {
        customerId?: string | null;
        idempotencyKey?: string;
    }, auth: AuthContext): Promise<{
        periodId: string;
        billsGenerated: number;
        failedCount: number;
        totalGrossMilkAmount: number;
        totalNetPayableAmount: number;
        durationMs: number;
    }>;
    /**
     * 6. Submit Bill for Review.
     */
    static submitForReview(billId: string, _notes: string | undefined, _auth: AuthContext): Promise<MonthlyBill>;
    /**
     * 7. Approve Bill.
     * Allowed roles: Center Manager, Dairy Owner, Super Admin.
     */
    static approveBill(billId: string, _notes: string | undefined, auth: AuthContext): Promise<MonthlyBill>;
    /**
     * 8. Finalize Bill.
     * Allowed roles: Dairy Owner, Super Admin.
     * Generates PDF, computes cryptographic hash, locks statement immutability.
     */
    static finalizeBill(billId: string, _notes: string | undefined, auth: AuthContext): Promise<MonthlyBill>;
    /**
     * Finalize the entire billing period and create cryptographic audit record.
     */
    static finalizePeriod(periodId: string, finalizedByUserId: string): Promise<void>;
    /**
     * 9. Adjust Bill (Controlled Audited Adjustment).
     * Authorized roles: Accountant, Center Manager, Dairy Owner, Super Admin.
     */
    static adjustBill(billId: string, data: {
        adjustmentType: 'CREDIT' | 'DEBIT';
        amount: number;
        reason: string;
    }, auth: AuthContext): Promise<MonthlyBill>;
    /**
     * 10. Get Customer Statement Summary.
     * Enforces customer ownership: Customer A cannot access Customer B's statement.
     */
    static getCustomerStatement(customerId: string, periodId: string | undefined, auth: AuthContext): Promise<CustomerStatementSummary>;
    /**
     * Internal helper to build CustomerStatementSummary data structure.
     */
    static getCustomerStatementSummary(customerId: string, periodId: string): Promise<CustomerStatementSummary>;
    /**
     * Helper to calculate a customer statement preview without saving to database.
     */
    private static calculateCustomerStatementPreview;
    /**
     * 11. Fetch or generate PDF statement for a bill.
     */
    static getPdfStatement(billId: string, auth: AuthContext): Promise<{
        buffer: Buffer;
        filename: string;
        sha256Hash: string;
    }>;
    /**
     * Generates a short-lived authorized download link for a finalized statement.
     */
    static getSignedStatementDownloadUrl(billId: string, auth: AuthContext, expiresInSeconds?: number): Promise<string | null>;
    /**
     * Mapper helper for BillingPeriod.
     */
    private static mapBillingPeriod;
    /**
     * Mapper helper for MonthlyBill.
     */
    private static mapMonthlyBill;
    /**
     * Mapper helper for MonthlyBillItem.
     */
    private static mapMonthlyBillItem;
}
//# sourceMappingURL=billing.service.d.ts.map