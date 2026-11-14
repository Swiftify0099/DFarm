import { IdentificationService } from './identification.service.js';
import { IdentificationRepository } from './identification.repository.js';
import { ApiResponse } from '../../shared/response/api-response.js';
import { UnauthorizedError } from '../../shared/errors/app-error.js';
export class IdentificationController {
    static async startSession(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError('Authentication required');
            const { centerId, deviceId } = req.body;
            const session = IdentificationService.startSession({
                centerId: centerId || req.auth.primaryCenterId,
                deviceId: deviceId || 'COLLECTION_APP',
                authContext: req.auth,
            });
            return ApiResponse.success(res, session, 201);
        }
        catch (err) {
            next(err);
        }
    }
    static async identifyByFace(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError('Authentication required');
            const centerId = req.body.centerId || req.auth.primaryCenterId;
            const result = await IdentificationService.identifyByFace({ ...req.body, centerId }, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async identifyByRfid(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError('Authentication required');
            const centerId = req.body.centerId || req.auth.primaryCenterId;
            const result = await IdentificationService.identifyByRfid({ ...req.body, centerId }, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async verifyBySupervisor(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError('Authentication required');
            const centerId = req.body.centerId || req.auth.primaryCenterId;
            const result = await IdentificationService.verifyBySupervisor({ ...req.body, centerId }, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async getSession(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError('Authentication required');
            const { sessionId } = req.params;
            const session = IdentificationService.getSession(sessionId, req.auth);
            return ApiResponse.success(res, session, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async getAuditLogs(req, res, next) {
        try {
            if (!req.auth)
                throw new UnauthorizedError('Authentication required');
            const { centerId, customerId, limit } = req.query;
            const logs = await IdentificationRepository.queryAuditLogs({
                organizationId: req.auth.organizationId,
                centerId: centerId,
                customerId: customerId,
                limit: limit ? parseInt(limit, 10) : undefined,
            });
            return ApiResponse.success(res, logs, 200);
        }
        catch (err) {
            next(err);
        }
    }
}
//# sourceMappingURL=identification.controller.js.map