import type { Request, Response, NextFunction } from 'express';
import { HealthService } from './health.service.js';
import { ApiResponse } from '../../shared/response/api-response.js';

export class HealthController {
  public static live(_req: Request, res: Response): Response {
    const data = HealthService.getLiveness();
    return ApiResponse.success(res, data, 200);
  }

  public static async ready(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const data = await HealthService.getReadiness();
      const statusCode = data.status === 'READY' ? 200 : 503;
      return ApiResponse.success(res, data, statusCode);
    } catch (err) {
      next(err);
    }
  }
}

