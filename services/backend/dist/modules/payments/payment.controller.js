import { payoutService } from './payout.service.js';
import { receiptService } from './receipt.service.js';
import { batchService } from './batch.service.js';
import { ApiResponse } from '../../shared/response/api-response.js';
import { UnauthorizedError } from '../../shared/errors/app-error.js';
import { extractTargetOrganizationId, getStrictPaymentTenantDb, resolveOperationalOrganizationId, } from './tenant-payment-context.js';
export class PaymentController {
    // Payout Endpoints
    static async createPayout(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError();
            const result = await payoutService.createPayout(req.body, req.auth);
            return ApiResponse.success(res, result, 201);
        }
        catch (err) {
            next(err);
        }
    }
    static async approvePayout(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError();
            const { payoutId } = req.params;
            const result = await payoutService.approvePayout(payoutId, req.auth, req.body?.comments);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async submitPayout(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError();
            const { payoutId } = req.params;
            const result = await payoutService.submitPayout(payoutId, req.auth, req.body?.paymentReference);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async confirmPayout(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError();
            const { payoutId } = req.params;
            const { paymentReference, settledAt, notes } = req.body;
            const result = await payoutService.confirmPayout(payoutId, req.auth, paymentReference, settledAt, notes);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async failPayout(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError();
            const { payoutId } = req.params;
            const { failureReason } = req.body;
            const result = await payoutService.failPayout(payoutId, req.auth, failureReason);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async reversePayout(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError();
            const { payoutId } = req.params;
            const { reason, idempotencyKey } = req.body;
            const result = await payoutService.reversePayout(payoutId, req.auth, reason, idempotencyKey);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async getPayoutById(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError();
            const { paymentId } = req.params;
            const result = await payoutService.getPayoutById(paymentId, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async getPayoutReceipt(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError();
            const { paymentId } = req.params;
            const result = await payoutService.getPayoutReceipt(paymentId, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async getCustomerPayouts(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError();
            const { customerId } = req.params;
            const limit = req.query['limit'] ? parseInt(req.query['limit'], 10) : 20;
            const offset = req.query['offset'] ? parseInt(req.query['offset'], 10) : 0;
            const result = await payoutService.getCustomerPayouts(customerId, req.auth, { limit, offset });
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async getCustomerPaymentSummary(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError();
            const { customerId } = req.params;
            const result = await payoutService.getCustomerPaymentSummary(customerId, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    // Receipt Endpoints (Farmer Debt Repayment)
    static async createReceipt(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError();
            const result = await receiptService.createReceipt(req.body, req.auth);
            return ApiResponse.success(res, result, 201);
        }
        catch (err) {
            next(err);
        }
    }
    static async confirmReceipt(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError();
            const { receiptId } = req.params;
            const { referenceNumber } = req.body || {};
            const result = await receiptService.confirmReceipt(receiptId, req.auth, referenceNumber);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async getReceiptById(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError();
            const { receiptId } = req.params;
            const result = await receiptService.getReceiptById(receiptId, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    // Batch Endpoints
    static async calculateSettlementPreview(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError();
            const periodStart = req.query['periodStart'] || req.body?.periodStart;
            const periodEnd = req.query['periodEnd'] || req.body?.periodEnd;
            const centerId = req.query['centerId'] || req.body?.centerId;
            let customerIds = undefined;
            if (req.query['customerIds']) {
                const qCust = req.query['customerIds'];
                customerIds = qCust.split(',').map(s => s.trim()).filter(Boolean);
            }
            else if (Array.isArray(req.body?.customerIds)) {
                customerIds = req.body.customerIds;
            }
            const excludeUnverifiedBankDetails = req.query['excludeUnverifiedBankDetails'] === 'true' || Boolean(req.body?.excludeUnverifiedBankDetails);
            const result = await batchService.calculateSettlementPreview({
                organizationId: req.auth.organizationId,
                centerId: centerId || null,
                periodStart,
                periodEnd,
                customerIds,
                excludeUnverifiedBankDetails,
            }, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async createBatch(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError();
            const result = await batchService.createBatch(req.body, req.auth);
            return ApiResponse.success(res, result, 201);
        }
        catch (err) {
            next(err);
        }
    }
    static async submitForReview(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError();
            const { batchId } = req.params;
            const result = await batchService.submitForReview(batchId, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async rejectBatch(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError();
            const { batchId } = req.params;
            const { reason } = req.body || {};
            const result = await batchService.rejectBatch(batchId, reason, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async submitBatchToUnionBank(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError();
            const { batchId } = req.params;
            const targetOrganizationId = extractTargetOrganizationId(req);
            const result = await batchService.submitBatchToUnionBank(batchId, { ...req.body, targetOrganizationId: targetOrganizationId || req.body?.targetOrganizationId }, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async reconcileBatchWithUnionBank(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError();
            const { batchId } = req.params;
            const targetOrganizationId = extractTargetOrganizationId(req, 'CROSS_ORG_RECONCILIATION_DENIED');
            const responsePayload = req.body?.data || req.body?.items || req.body?.fileContent || req.body;
            const result = await batchService.reconcileBatchWithUnionBank(batchId, responsePayload, req.auth, targetOrganizationId);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async queryBatchItemStatus(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError();
            const { itemId } = req.params;
            const targetOrganizationId = extractTargetOrganizationId(req);
            const result = await batchService.queryBatchItemStatus(itemId, req.auth, targetOrganizationId);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async markBatchTimeout(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError();
            const { batchId } = req.params;
            const { reason } = req.body || {};
            const targetOrganizationId = extractTargetOrganizationId(req);
            const result = await batchService.markBatchTimeout(batchId, reason, req.auth, targetOrganizationId);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async getBeneficiaryAuditHistory(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError();
            const { customerId } = req.params;
            const result = await batchService.getBeneficiaryAuditHistory(customerId, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async updateBeneficiaryBankDetails(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError();
            const { customerId } = req.params;
            const result = await batchService.updateBeneficiaryBankDetails(customerId, req.body, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async getFarmerPaymentOverview(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError();
            const targetOrganizationId = extractTargetOrganizationId(req);
            const orgId = resolveOperationalOrganizationId(req.auth, targetOrganizationId);
            const tenantDb = await getStrictPaymentTenantDb(orgId);
            const centerId = req.query['centerId'];
            const data = await tenantDb.withTransaction(async (client) => {
                let payableQuery = `
          SELECT COALESCE(SUM(current_balance), 0.00)::numeric(12,2) as total_payable
          FROM customer_ledger_accounts cla
          JOIN customers c ON c.id = cla.customer_id
          WHERE cla.organization_id = $1 AND c.is_deleted = FALSE AND cla.current_balance > 0
        `;
                let paidQuery = `
          SELECT COALESCE(SUM(amount), 0.00)::numeric(12,2) as total_paid, COUNT(id)::int as paid_count
          FROM customer_payouts
          WHERE organization_id = $1 AND status IN ('SETTLED', 'PAID')
        `;
                let pendingQuery = `
          SELECT COALESCE(SUM(amount), 0.00)::numeric(12,2) as pending_amount, COUNT(id)::int as pending_count
          FROM customer_payouts
          WHERE organization_id = $1 AND status IN ('DRAFT', 'CALCULATED', 'UNDER_REVIEW', 'APPROVED', 'SUBMITTED', 'PROCESSING')
        `;
                let failedQuery = `
          SELECT COALESCE(SUM(amount), 0.00)::numeric(12,2) as failed_amount, COUNT(id)::int as failed_count
          FROM customer_payouts
          WHERE organization_id = $1 AND status = 'FAILED'
        `;
                let unreconciledQuery = `
          SELECT COALESCE(SUM(amount), 0.00)::numeric(12,2) as unreconciled_amount, COUNT(id)::int as unreconciled_count
          FROM customer_payouts
          WHERE organization_id = $1 AND status IN ('SUBMITTED', 'PROCESSING', 'RECONCILIATION_REQUIRED', 'UNKNOWN')
        `;
                const queryParams = [orgId];
                if (centerId) {
                    queryParams.push(centerId);
                    payableQuery += ` AND c.primary_center_id = $2;`;
                    paidQuery += ` AND center_id = $2;`;
                    pendingQuery += ` AND center_id = $2;`;
                    failedQuery += ` AND center_id = $2;`;
                    unreconciledQuery += ` AND center_id = $2;`;
                }
                else {
                    payableQuery += `;`;
                    paidQuery += `;`;
                    pendingQuery += `;`;
                    failedQuery += `;`;
                    unreconciledQuery += `;`;
                }
                // Execute sequentially on the shared transaction client
                const payableRes = await client.query(payableQuery, queryParams);
                const paidRes = await client.query(paidQuery, queryParams);
                const pendingRes = await client.query(pendingQuery, queryParams);
                const failedRes = await client.query(failedQuery, queryParams);
                const unreconciledRes = await client.query(unreconciledQuery, queryParams);
                return {
                    totalPayableAmount: Number(payableRes.rows[0].total_payable),
                    totalPaidAmount: Number(paidRes.rows[0].total_paid),
                    paidCount: Number(paidRes.rows[0].paid_count),
                    pendingAmount: Number(pendingRes.rows[0].pending_amount),
                    pendingCount: Number(pendingRes.rows[0].pending_count),
                    failedAmount: Number(failedRes.rows[0].failed_amount),
                    failedCount: Number(failedRes.rows[0].failed_count),
                    unreconciledAmount: Number(unreconciledRes.rows[0].unreconciled_amount),
                    unreconciledCount: Number(unreconciledRes.rows[0].unreconciled_count),
                };
            });
            return ApiResponse.success(res, data, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async getBatchById(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError();
            const { batchId } = req.params;
            const result = await batchService.getBatchById(batchId, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async approveBatch(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError();
            const { batchId } = req.params;
            const result = await batchService.approveBatch(batchId, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async submitBatch(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError();
            const { batchId } = req.params;
            const result = await batchService.submitBatch(batchId, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async reconcileBatch(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError();
            const { batchId } = req.params;
            const { results } = req.body;
            const result = await batchService.reconcileBatch(batchId, results, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async exportBatch(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError();
            const { batchId } = req.params;
            const format = req.query['format'] || 'NEFT_STANDARD';
            const targetOrganizationId = extractTargetOrganizationId(req);
            const debitAccountNumber = typeof req.query['debitAccountNumber'] === 'string' && req.query['debitAccountNumber'].trim().length > 0
                ? req.query['debitAccountNumber'].trim()
                : undefined;
            const result = await batchService.exportBatch(batchId, format, req.auth, {
                debitAccountNumber,
                targetOrganizationId,
            });
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async downloadBatch(req, res, next) {
        try {
            const token = req.query['token'] || '';
            if (!token) {
                res.status(400).json({ success: false, error: 'Download token is required' });
                return;
            }
            const file = batchService.downloadBatch(token);
            res.setHeader('Content-Type', file.mimeType);
            res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.setHeader('X-Checksum-SHA256', file.checksumSha256);
            res.status(200).send(file.content);
        }
        catch (err) {
            next(err);
        }
    }
}
//# sourceMappingURL=payment.controller.js.map