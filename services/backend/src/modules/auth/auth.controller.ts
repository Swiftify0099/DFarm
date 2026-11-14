import type { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service.js';
import { ApiResponse } from '../../shared/response/api-response.js';
import { UnauthorizedError } from '../../shared/errors/app-error.js';

export class AuthController {
  public static async login(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const username = (req.body?.username || req.body?.email || req.body?.identifier) as string;
      const data = await AuthService.loginStaff(username);
      return ApiResponse.success(res, data, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async me(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) {
        throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
      }
      const data = await AuthService.getMe(req.auth);
      return ApiResponse.success(res, data, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async getCenters(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) {
        throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
      }
      const data = await AuthService.getCenters(req.auth);
      return ApiResponse.success(res, data, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async sendOtp(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { phone } = req.body as { phone: string };
      const data = await AuthService.sendCustomerOtp(phone);
      return ApiResponse.success(res, data, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async verifyOtp(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { phone, token } = req.body as { phone: string; token: string };
      const data = await AuthService.verifyCustomerOtp(phone, token);
      return ApiResponse.success(res, data, 200);
    } catch (err) {
      next(err);
    }
  }
}
