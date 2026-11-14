import type { Request, Response, NextFunction } from 'express';
import { IdentificationService } from './identification.service.js';
import { IdentificationRepository } from './identification.repository.js';
import { ApiResponse } from '../../shared/response/api-response.js';
import { UnauthorizedError } from '../../shared/errors/app-error.js';

export class IdentificationController {
  public static async startSession(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError('Authentication required');
      const { centerId, deviceId } = req.body;
      const session = IdentificationService.startSession({
        centerId: centerId || req.auth.primaryCenterId,
        deviceId: deviceId || 'COLLECTION_APP',
        authContext: req.auth,
      });
      return ApiResponse.success(res, session, 201);
    } catch (err) {
      next(err);
    }
  }

  public static async identifyByFace(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError('Authentication required');
      const centerId = req.body.centerId || req.auth.primaryCenterId;
      const result = await IdentificationService.identifyByFace(
        { ...req.body, centerId },
        req.auth
      );
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async identifyByRfid(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError('Authentication required');
      const centerId = req.body.centerId || req.auth.primaryCenterId;
      const result = await IdentificationService.identifyByRfid(
        { ...req.body, centerId },
        req.auth
      );
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async verifyBySupervisor(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError('Authentication required');
      const centerId = req.body.centerId || req.auth.primaryCenterId;
      const result = await IdentificationService.verifyBySupervisor(
        { ...req.body, centerId },
        req.auth
      );
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async getSession(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError('Authentication required');
      const { sessionId } = req.params;
      const session = IdentificationService.getSession(sessionId as string, req.auth);
      return ApiResponse.success(res, session, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async getAuditLogs(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError('Authentication required');
      const { centerId, customerId, limit } = req.query;
      const logs = await IdentificationRepository.queryAuditLogs({
        organizationId: req.auth.organizationId,
        centerId: centerId as string | undefined,
        customerId: customerId as string | undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
      });
      return ApiResponse.success(res, logs, 200);
    } catch (err) {
      next(err);
    }
  }
}
