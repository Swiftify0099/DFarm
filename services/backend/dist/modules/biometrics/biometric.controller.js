// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// BIOMETRICS REST API CONTROLLER
// ==============================================================================
import { BiometricService } from './biometric.service.js';
import { ApiResponse } from '../../shared/response/api-response.js';
import { UnauthorizedError } from '../../shared/errors/app-error.js';
export class BiometricController {
    /**
     * POST /api/v1/customers/:customerId/face-enroll
     */
    static async enrollFace(req, res, next) {
        try {
            if (!req.auth) {
                throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
            }
            const { customerId } = req.params;
            const result = await BiometricService.enrollCustomerFace(customerId, req.body, req.auth);
            return ApiResponse.success(res, result, 201);
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * GET /api/v1/customers/:customerId/face-status
     */
    static async getFaceStatus(req, res, next) {
        try {
            if (!req.auth) {
                throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
            }
            const { customerId } = req.params;
            const result = await BiometricService.getCustomerFaceStatus(customerId, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * POST /api/v1/customers/:customerId/face-revoke
     */
    static async revokeFace(req, res, next) {
        try {
            if (!req.auth) {
                throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
            }
            const { customerId } = req.params;
            const result = await BiometricService.revokeCustomerFace(customerId, req.body, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * GET /api/v1/identity/face-models
     */
    static async listModels(req, res, next) {
        try {
            const result = await BiometricService.listModels(req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
}
//# sourceMappingURL=biometric.controller.js.map