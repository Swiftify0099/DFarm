import type { Request, Response, NextFunction } from 'express';
import { DashboardService } from './dashboard.service.js';
import { ApiResponse } from '../../shared/response/api-response.js';

export class DashboardController {
  public static async getMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const centerId = req.query['centerId'] as string | undefined;
      const targetDate = req.query['date'] as string | undefined;
      const metrics = await DashboardService.getMetrics(req.auth!, centerId, targetDate);
      ApiResponse.success(res, metrics);
    } catch (err) {
      next(err);
    }
  }
}
