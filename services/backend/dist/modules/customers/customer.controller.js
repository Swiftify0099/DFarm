import { CustomerService } from './customer.service.js';
import { ApiResponse } from '../../shared/response/api-response.js';
import { UnauthorizedError } from '../../shared/errors/app-error.js';
export class CustomerController {
    static async create(req, res, next) {
        try {
            if (!req.auth) {
                throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
            }
            const result = await CustomerService.createCustomer(req.body, req.auth);
            return ApiResponse.success(res, result, 201);
        }
        catch (err) {
            next(err);
        }
    }
    static async getById(req, res, next) {
        try {
            if (!req.auth) {
                throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
            }
            const { customerId } = req.params;
            const result = await CustomerService.getCustomer(customerId, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async list(req, res, next) {
        try {
            if (!req.auth) {
                throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
            }
            const query = req.query;
            const result = await CustomerService.listCustomers(query, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async update(req, res, next) {
        try {
            if (!req.auth) {
                throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
            }
            const { customerId } = req.params;
            const result = await CustomerService.updateCustomer(customerId, req.body, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async softDelete(req, res, next) {
        try {
            if (!req.auth) {
                throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
            }
            const { customerId } = req.params;
            const { reason } = req.body;
            const result = await CustomerService.softDeleteCustomer(customerId, reason, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async restore(req, res, next) {
        try {
            if (!req.auth) {
                throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
            }
            const { customerId } = req.params;
            const { reason } = req.body;
            const result = await CustomerService.restoreCustomer(customerId, reason, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async getDashboard(req, res, next) {
        try {
            if (!req.auth) {
                throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
            }
            const { customerId } = req.params;
            const result = await CustomerService.getDashboard(customerId, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async getNotifications(req, res, next) {
        try {
            if (!req.auth) {
                throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
            }
            const { customerId } = req.params;
            const result = await CustomerService.getNotifications(customerId, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async markNotificationRead(req, res, next) {
        try {
            if (!req.auth) {
                throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
            }
            const { customerId, notificationId } = req.params;
            const result = await CustomerService.markNotificationRead(customerId, notificationId, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async markAllNotificationsRead(req, res, next) {
        try {
            if (!req.auth) {
                throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
            }
            const { customerId } = req.params;
            const result = await CustomerService.markAllNotificationsRead(customerId, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
    static async updateProfileSelfService(req, res, next) {
        try {
            if (!req.auth) {
                throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
            }
            const { customerId } = req.params;
            const result = await CustomerService.updateProfileSelfService(customerId, req.body, req.auth);
            return ApiResponse.success(res, result, 200);
        }
        catch (err) {
            next(err);
        }
    }
}
//# sourceMappingURL=customer.controller.js.map