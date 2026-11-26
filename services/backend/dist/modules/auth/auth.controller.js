import { AuthService } from './auth.service.js';
import { ApiResponse } from '../../shared/response/api-response.js';
import { UnauthorizedError } from '../../shared/errors/app-error.js';
export class AuthController {
    static async me(req, res, next) {
        try {
            if (!req.auth) {
                throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
            }
            const data = await AuthService.getMe(req.auth);
            return ApiResponse.success(res, data, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async getCenters(req, res, next) {
        try {
            if (!req.auth) {
                throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
            }
            const requestedOrgId = (typeof req.query['organizationId'] === 'string' && req.query['organizationId']) ||
                (typeof req.headers['x-organization-id'] === 'string' && req.headers['x-organization-id']) ||
                (typeof req.headers['x-dairy-tenant-id'] === 'string' && req.headers['x-dairy-tenant-id']) ||
                undefined;
            const data = await AuthService.getCenters(req.auth, requestedOrgId);
            return ApiResponse.success(res, data, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async sendOtp(req, res, next) {
        try {
            const { phone } = req.body;
            const data = await AuthService.sendCustomerOtp(phone);
            return ApiResponse.success(res, data, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async verifyOtp(req, res, next) {
        try {
            const { phone, token } = req.body;
            const data = await AuthService.verifyCustomerOtp(phone, token);
            return ApiResponse.success(res, data, 200);
        }
        catch (err) {
            next(err);
        }
    }
}
//# sourceMappingURL=auth.controller.js.map