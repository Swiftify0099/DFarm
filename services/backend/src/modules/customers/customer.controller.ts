import type { Request, Response, NextFunction } from 'express';
import { CustomerService } from './customer.service.js';
import { ApiResponse } from '../../shared/response/api-response.js';
import { UnauthorizedError } from '../../shared/errors/app-error.js';
import type { CustomerQueryDTO } from './customer.service.js';

export class CustomerController {
  public static async create(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) {
        throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
      }
      const result = await CustomerService.createCustomer(req.body, req.auth);
      return ApiResponse.success(res, result, 201);
    } catch (err) {
      next(err);
    }
  }

  public static async getById(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) {
        throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
      }
      const { customerId } = req.params as { customerId: string };
      const result = await CustomerService.getCustomer(customerId, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async list(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) {
        throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
      }
      const query = req.query as unknown as CustomerQueryDTO;
      const result = await CustomerService.listCustomers(query, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async update(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) {
        throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
      }
      const { customerId } = req.params as { customerId: string };
      const result = await CustomerService.updateCustomer(customerId, req.body, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async softDelete(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) {
        throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
      }
      const { customerId } = req.params as { customerId: string };
      const { reason } = req.body as { reason: string };
      const result = await CustomerService.softDeleteCustomer(customerId, reason, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async restore(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) {
        throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
      }
      const { customerId } = req.params as { customerId: string };
      const { reason } = req.body as { reason: string };
      const result = await CustomerService.restoreCustomer(customerId, reason, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async getDashboard(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) {
        throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
      }
      const { customerId } = req.params as { customerId: string };
      const result = await CustomerService.getDashboard(customerId, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async getNotifications(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) {
        throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
      }
      const { customerId } = req.params as { customerId: string };
      const result = await CustomerService.getNotifications(customerId, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async markNotificationRead(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) {
        throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
      }
      const { customerId, notificationId } = req.params as { customerId: string; notificationId: string };
      const result = await CustomerService.markNotificationRead(customerId, notificationId, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async markAllNotificationsRead(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) {
        throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
      }
      const { customerId } = req.params as { customerId: string };
      const result = await CustomerService.markAllNotificationsRead(customerId, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async updateProfileSelfService(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) {
        throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
      }
      const { customerId } = req.params as { customerId: string };
      const result = await CustomerService.updateProfileSelfService(customerId, req.body, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }
}

