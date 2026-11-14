import { CustomerLedgerSummary, LedgerStatement, ReconciliationReport, FeedDebitIntegrationContract } from '@dfarm/shared-types';
import { AuthContext } from '../../middleware/authenticate.js';
export declare class LedgerService {
    /**
     * Helper: Resolves customer and validates access.
     */
    private static getCustomerOrThrow;
    /**
     * 1. Get List of Customer Ledger Accounts
     */
    static getAccounts(query: any, auth: AuthContext): Promise<{
        accounts: {
            customerId: any;
            customerName: any;
            farmerCode: any;
            centerId: any;
            centerName: any;
            accountId: any;
            currency: any;
            currentBalance: number;
            status: any;
            lastTransactionAt: any;
            updatedAt: any;
        }[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    /**
     * 2. Customer Ledger Summary
     */
    static getCustomerSummary(customerId: string, auth: AuthContext): Promise<CustomerLedgerSummary>;
    /**
     * 3. Paginated Transactions with Filters
     */
    static getCustomerTransactions(customerId: string, query: any, auth: AuthContext): Promise<{
        transactions: {
            id: any;
            transactionType: any;
            direction: any;
            amount: number;
            balanceAfter: number;
            referenceEntity: any;
            referenceId: any;
            description: any;
            idempotencyKey: any;
            receiptNumber: string;
            createdAt: any;
        }[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    /**
     * 4. Customer Statement for a Period
     */
    static getCustomerStatement(customerId: string, query: {
        startDate?: string;
        endDate?: string;
    }, auth: AuthContext): Promise<LedgerStatement>;
    /**
     * 5. Create Customer Advance
     */
    static createAdvance(customerId: string, payload: any, auth: AuthContext): Promise<any>;
    /**
     * 6. Approve Pending Customer Advance
     */
    static approveAdvance(advanceId: string, approvedAmount: number | undefined, auth: AuthContext): Promise<any>;
    /**
     * 7. Reject Pending Customer Advance
     */
    static rejectAdvance(advanceId: string, reason: string, auth: AuthContext): Promise<any>;
    /**
     * 8. Recover Customer Advance (Partial or Full)
     */
    static recoverAdvance(advanceId: string, payload: any, auth: AuthContext): Promise<any>;
    /**
     * 9. Post Customer Authorized Deduction
     */
    static createDeduction(customerId: string, payload: any, auth: AuthContext): Promise<any>;
    /**
     * 10. Post Opening Balance
     */
    static createOpeningBalance(customerId: string, payload: any, auth: AuthContext): Promise<any>;
    /**
     * 11. Post Controlled Ledger Adjustment
     */
    static createAdjustment(customerId: string, payload: any, auth: AuthContext): Promise<any>;
    /**
     * 12. Account Reconciliation
     */
    static reconcile(customerId?: string, centerId?: string, auth?: AuthContext): Promise<ReconciliationReport | ReconciliationReport[]>;
    /**
     * 13. Financial Reports
     */
    static getCustomerBalancesReport(filters: any, auth: AuthContext): Promise<{
        totalCustomers: number;
        totalPayableLiability: number;
        totalCustomerDebt: number;
        netDairyPosition: number;
        balances: {
            customerId: any;
            customerName: any;
            farmerCode: any;
            centerId: any;
            centerName: any;
            currentBalance: number;
            balancePosition: any;
            lastTransactionAt: any;
        }[];
    }>;
    static getDailySummaryReport(filters: any, auth: AuthContext): Promise<{
        summary: {
            date: any;
            totalCredits: number;
            totalDebits: number;
            milkCredits: number;
            advanceDebits: number;
            deductionDebits: number;
            transactionCount: number;
        }[];
    }>;
    static getCenterLiabilitiesReport(filters: any, auth: AuthContext): Promise<{
        centers: {
            centerId: any;
            centerName: any;
            centerCode: any;
            activeFarmers: number;
            totalPayableLiability: number;
            totalRecoverableDebt: number;
            netLiability: number;
        }[];
    }>;
    static getOutstandingAdvancesReport(filters: any, auth: AuthContext): Promise<{
        count: number;
        totalPrincipal: number;
        totalRecovered: number;
        totalOutstanding: number;
        advances: {
            advanceId: any;
            customerId: any;
            customerName: any;
            farmerCode: any;
            centerId: any;
            centerName: any;
            advanceDate: any;
            principalAmount: number;
            totalRecoveredAmount: number;
            outstandingAmount: number;
            status: any;
            reason: any;
            disbursedAt: any;
        }[];
    }>;
    static getTransactionRegisterReport(filters: any, auth: AuthContext): Promise<{
        transactions: {
            id: any;
            date: any;
            customerId: any;
            customerName: any;
            farmerCode: any;
            centerId: any;
            centerName: any;
            transactionType: any;
            direction: any;
            amount: number;
            balanceAfter: number;
            referenceEntity: any;
            description: any;
            createdByName: any;
        }[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    /**
     * 14. Feed Purchase Debit Integration Contract
     * Adheres strictly to the defined FeedDebitIntegrationContract for Phase 14 handoff.
     * Does NOT generate fake sales; processes authentic feed sales when called with contract.
     */
    static processFeedPurchaseDebit(contract: FeedDebitIntegrationContract, auth: AuthContext): Promise<{
        transactionId: any;
        balanceAfter: number;
        isIdempotentReplay: boolean;
        customerId?: undefined;
        totalDebitAmount?: undefined;
        previousBalance?: undefined;
        newBalance?: undefined;
        invoiceNumber?: undefined;
    } | {
        transactionId: any;
        customerId: string;
        totalDebitAmount: number;
        previousBalance: number;
        newBalance: number;
        invoiceNumber: string;
        isIdempotentReplay: boolean;
        balanceAfter?: undefined;
    }>;
}
//# sourceMappingURL=ledger.service.d.ts.map