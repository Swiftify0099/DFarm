import { RfidService } from './rfid.service.js';
import { ApiResponse } from '../../shared/response/api-response.js';
import { UnauthorizedError } from '../../shared/errors/app-error.js';
export class RfidController {
    static async assign(req, res, next) {
        try {
            if (!req.auth) {
                throw new UnauthorizedError('Authentication required');
            }
            const customerId = req.params['customerId'] || req.body.customerId;
            const result = await RfidService.assignRfidCard({ ...req.body, customerId }, req.auth);
            return ApiResponse.success(res, result, 201);
        }
        catch (err) {
            next(err);
        }
    }
    static async replace(req, res, next) {
        try {
            if (!req.auth) {
                throw new UnauthorizedError('Authentication required');
            }
            const customerId = req.params['customerId'] || req.body.customerId;
            const result = await RfidService.replaceRfidCard({ ...req.body, customerId }, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async revoke(req, res, next) {
        try {
            if (!req.auth) {
                throw new UnauthorizedError('Authentication required');
            }
            const cardId = req.params['cardId'];
            const result = await RfidService.revokeRfidCard(cardId, req.body, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async block(req, res, next) {
        try {
            if (!req.auth) {
                throw new UnauthorizedError('Authentication required');
            }
            const cardId = req.params['cardId'];
            const reason = req.body.reason || 'Card reported blocked';
            const result = await RfidService.blockRfidCard(cardId, reason, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async getStatus(req, res, next) {
        try {
            if (!req.auth) {
                throw new UnauthorizedError('Authentication required');
            }
            const customerId = req.params['customerId'];
            const result = await RfidService.getCustomerRfidStatus(customerId, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
}
//# sourceMappingURL=rfid.controller.js.map