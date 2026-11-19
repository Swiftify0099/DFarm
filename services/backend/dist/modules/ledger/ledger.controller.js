import { pool } from '../../db.js';
import { LedgerService } from './ledger.service.js';
import { ApiResponse } from '../../shared/response/api-response.js';
import { UnauthorizedError } from '../../shared/errors/app-error.js';
export class LedgerController {
    /**
     * GET /api/v1/ledger/entries (Farmer Passbook Stream)
     */
    static async getFarmerPassbookEntries(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError('Authentication required');
            const customerId = req.auth.customerProfile?.customerId || req.auth.userId;
            const txns = await pool.query(`SELECT * FROM ledger_transactions WHERE customer_id = $1 ORDER BY created_at DESC;`, [customerId]);
            const mapped = txns.rows.map((tx) => ({
                id: tx.id,
                transactionType: tx.transaction_type,
                direction: tx.direction,
                amount: parseFloat(tx.amount),
                balanceAfter: parseFloat(tx.balance_after),
                referenceEntity: tx.reference_entity,
                referenceId: tx.reference_id,
                description: tx.description,
                createdAt: tx.created_at,
            }));
            return ApiResponse.success(res, mapped, 200);
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * GET /api/v1/ledger/summary (Farmer Khata Summary)
     */
    static async getMySummary(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError('Authentication required');
            const customerId = req.auth.userId;
            const result = await LedgerService.getCustomerSummary(customerId, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * 1. GET /api/v1/ledger/accounts
     */
    static async getAccounts(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError('Authentication required');
            const result = await LedgerService.getAccounts(req.query, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * 2. GET /api/v1/customers/:customerId/ledger/summary OR /api/v1/ledger/:customerId/summary
     */
    static async getSummary(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError('Authentication required');
            const { customerId } = req.params;
            const result = await LedgerService.getCustomerSummary(customerId, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * 3. GET /api/v1/customers/:customerId/ledger/transactions OR /api/v1/ledger/:customerId/transactions
     */
    static async getTransactions(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError('Authentication required');
            const { customerId } = req.params;
            const result = await LedgerService.getCustomerTransactions(customerId, req.query, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * 4. GET /api/v1/customers/:customerId/ledger/statement
     */
    static async getStatement(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError('Authentication required');
            const { customerId } = req.params;
            const result = await LedgerService.getCustomerStatement(customerId, req.query, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * 5. GET /api/v1/customers/:customerId/ledger (Combined overview with summary and recent transactions)
     */
    static async getCustomerLedger(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError('Authentication required');
            const { customerId } = req.params;
            const summary = await LedgerService.getCustomerSummary(customerId, req.auth);
            const txns = await LedgerService.getCustomerTransactions(customerId, req.query, req.auth);
            return ApiResponse.success(res, { summary, ...txns }, 200);
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * 6. POST /api/v1/ledger/:customerId/advances
     */
    static async createAdvance(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError('Authentication required');
            const { customerId } = req.params;
            const result = await LedgerService.createAdvance(customerId, req.body, req.auth);
            return ApiResponse.success(res, result, 201);
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * 7. POST /api/v1/ledger/advances/:advanceId/approve
     */
    static async approveAdvance(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError('Authentication required');
            const { advanceId } = req.params;
            const result = await LedgerService.approveAdvance(advanceId, req.body.approvedAmount, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * 8. POST /api/v1/ledger/advances/:advanceId/reject
     */
    static async rejectAdvance(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError('Authentication required');
            const { advanceId } = req.params;
            const result = await LedgerService.rejectAdvance(advanceId, req.body.reason, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * 9. POST /api/v1/ledger/advances/:advanceId/recover
     */
    static async recoverAdvance(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError('Authentication required');
            const { advanceId } = req.params;
            const result = await LedgerService.recoverAdvance(advanceId, req.body, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * 10. POST /api/v1/ledger/:customerId/deductions
     */
    static async createDeduction(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError('Authentication required');
            const { customerId } = req.params;
            const result = await LedgerService.createDeduction(customerId, req.body, req.auth);
            return ApiResponse.success(res, result, 201);
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * 11. POST /api/v1/ledger/:customerId/opening-balance
     */
    static async createOpeningBalance(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError('Authentication required');
            const { customerId } = req.params;
            const result = await LedgerService.createOpeningBalance(customerId, req.body, req.auth);
            return ApiResponse.success(res, result, 201);
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * 12. POST /api/v1/ledger/:customerId/adjustments
     */
    static async createAdjustment(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError('Authentication required');
            const { customerId } = req.params;
            const result = await LedgerService.createAdjustment(customerId, req.body, req.auth);
            return ApiResponse.success(res, result, 201);
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * 13. POST /api/v1/ledger/reconcile
     */
    static async reconcile(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError('Authentication required');
            const customerId = req.body.customerId || req.query.customerId;
            const centerId = req.body.centerId || req.query.centerId;
            const result = await LedgerService.reconcile(customerId, centerId, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * 14. Reports
     */
    static async getBalancesReport(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError('Authentication required');
            const result = await LedgerService.getCustomerBalancesReport(req.query, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async getDailySummaryReport(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError('Authentication required');
            const result = await LedgerService.getDailySummaryReport(req.query, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async getCenterLiabilitiesReport(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError('Authentication required');
            const result = await LedgerService.getCenterLiabilitiesReport(req.query, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async getOutstandingAdvancesReport(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError('Authentication required');
            const result = await LedgerService.getOutstandingAdvancesReport(req.query, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async getTransactionRegisterReport(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError('Authentication required');
            const result = await LedgerService.getTransactionRegisterReport(req.query, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * 15. Feed Debit Integration Contract Endpoint (For module handoff)
     */
    static async processFeedPurchase(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError('Authentication required');
            const result = await LedgerService.processFeedPurchaseDebit(req.body, req.auth);
            return ApiResponse.success(res, result, 201);
        }
        catch (err) {
            next(err);
        }
    }
}
//# sourceMappingURL=ledger.controller.js.map