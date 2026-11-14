import { reconciliationService } from './reconciliation.service.js';
import { ApiResponse } from '../../shared/response/api-response.js';
import { UnauthorizedError } from '../../shared/errors/app-error.js';
export class ReconciliationController {
    static async importBankStatement(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError();
            const result = await reconciliationService.importBankStatementCsv(req.body, req.auth);
            return ApiResponse.success(res, result, 201);
        }
        catch (err) {
            next(err);
        }
    }
    static async getRecords(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError();
            const status = req.query['status'];
            const limit = req.query['limit'] ? parseInt(req.query['limit'], 10) : 20;
            const offset = req.query['offset'] ? parseInt(req.query['offset'], 10) : 0;
            const result = await reconciliationService.getReconciliationRecords(req.auth, { status, limit, offset });
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async resolveRecord(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError();
            const { recordId } = req.params;
            const { action, notes, matchedPayoutId } = req.body;
            const result = await reconciliationService.resolveRecord(recordId, action, notes, req.auth, matchedPayoutId);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async handleWebhook(req, res, next) {
        try {
            const signature = (req.headers['x-webhook-signature'] || req.headers['x-hub-signature-256'] || req.headers['x-signature']);
            const timestamp = (req.headers['x-webhook-timestamp'] || req.headers['x-timestamp']);
            const rawPayload = JSON.stringify(req.body);
            const result = await reconciliationService.processWebhook(rawPayload, signature, timestamp, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
}
//# sourceMappingURL=reconciliation.controller.js.map