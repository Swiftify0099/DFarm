import { payoutService } from './payout.service.js';
import { receiptService } from './receipt.service.js';
import { batchService } from './batch.service.js';
import { ApiResponse } from '../../shared/response/api-response.js';
import { UnauthorizedError } from '../../shared/errors/app-error.js';
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
}
//# sourceMappingURL=payment.controller.js.map