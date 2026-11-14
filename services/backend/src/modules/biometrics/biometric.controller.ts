// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// BIOMETRICS REST API CONTROLLER
// ==============================================================================

import type { Request, Response, NextFunction } from 'express';
import { BiometricService } from './biometric.service.js';
import { ApiResponse } from '../../shared/response/api-response.js';
import { UnauthorizedError } from '../../shared/errors/app-error.js';

export class BiometricController {
  /**
   * POST /api/v1/customers/:customerId/face-enroll
   */
  public static async enrollFace(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) {
        throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
      }
      const { customerId } = req.params as { customerId: string };
      const result = await BiometricService.enrollCustomerFace(customerId, req.body, req.auth);
      return ApiResponse.success(res, result, 201);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/customers/:customerId/face-status
   */
  public static async getFaceStatus(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) {
        throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
      }
      const { customerId } = req.params as { customerId: string };
      const result = await BiometricService.getCustomerFaceStatus(customerId, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/customers/:customerId/face-revoke
   */
  public static async revokeFace(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) {
        throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
      }
      const { customerId } = req.params as { customerId: string };
      const result = await BiometricService.revokeCustomerFace(customerId, req.body, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/identity/face-models
   */
  public static async listModels(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const result = await BiometricService.listModels(req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }
}
