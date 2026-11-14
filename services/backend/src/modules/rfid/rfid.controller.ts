import type { Request, Response, NextFunction } from 'express';
import { RfidService } from './rfid.service.js';
import { ApiResponse } from '../../shared/response/api-response.js';
import { UnauthorizedError } from '../../shared/errors/app-error.js';

export class RfidController {
  public static async assign(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) {
        throw new UnauthorizedError('Authentication required');
      }
      const customerId = (req.params['customerId'] as string) || req.body.customerId;
      const result = await RfidService.assignRfidCard({ ...req.body, customerId }, req.auth);
      return ApiResponse.success(res, result, 201);
    } catch (err) {
      next(err);
    }
  }

  public static async replace(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) {
        throw new UnauthorizedError('Authentication required');
      }
      const customerId = (req.params['customerId'] as string) || req.body.customerId;
      const result = await RfidService.replaceRfidCard({ ...req.body, customerId }, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async revoke(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) {
        throw new UnauthorizedError('Authentication required');
      }
      const cardId = req.params['cardId'] as string;
      const result = await RfidService.revokeRfidCard(cardId, req.body, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async block(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) {
        throw new UnauthorizedError('Authentication required');
      }
      const cardId = req.params['cardId'] as string;
      const reason = req.body.reason || 'Card reported blocked';
      const result = await RfidService.blockRfidCard(cardId, reason, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async getStatus(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) {
        throw new UnauthorizedError('Authentication required');
      }
      const customerId = req.params['customerId'] as string;
      const result = await RfidService.getCustomerRfidStatus(customerId, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }
}

