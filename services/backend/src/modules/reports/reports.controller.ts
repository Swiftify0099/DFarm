import type { Request, Response, NextFunction } from 'express';
import { ReportsService } from './reports.service.js';
import { ApiResponse } from '../../shared/response/api-response.js';

export class ReportsController {
  public static async getDailyCollection(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const date = (req.query['date'] as string) || new Date().toISOString().split('T')[0]!;
      const centerId = req.query['centerId'] as string | undefined;
      const data = await ReportsService.getDailyCollectionReport(req.auth!, date, centerId);
      ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  public static async getMonthlyCollection(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const month = parseInt((req.query['month'] as string) || String(new Date().getMonth() + 1), 10);
      const year = parseInt((req.query['year'] as string) || String(new Date().getFullYear()), 10);
      const centerId = req.query['centerId'] as string | undefined;
      const data = await ReportsService.getMonthlyCollectionReport(req.auth!, month, year, centerId);
      ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  public static async getFarmerWise(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startDate = (req.query['startDate'] as string) || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]!;
      const endDate = (req.query['endDate'] as string) || new Date().toISOString().split('T')[0]!;
      const centerId = req.query['centerId'] as string | undefined;
      const data = await ReportsService.getFarmerWiseReport(req.auth!, startDate, endDate, centerId);
      ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  public static async getCowBuffalo(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startDate = (req.query['startDate'] as string) || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]!;
      const endDate = (req.query['endDate'] as string) || new Date().toISOString().split('T')[0]!;
      const centerId = req.query['centerId'] as string | undefined;
      const data = await ReportsService.getCowBuffaloComparison(req.auth!, startDate, endDate, centerId);
      ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  public static async getFatSnf(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startDate = (req.query['startDate'] as string) || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]!;
      const endDate = (req.query['endDate'] as string) || new Date().toISOString().split('T')[0]!;
      const centerId = req.query['centerId'] as string | undefined;
      const data = await ReportsService.getFatSnfDistribution(req.auth!, startDate, endDate, centerId);
      ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  public static async getBilling(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const periodId = req.query['periodId'] as string | undefined;
      const centerId = req.query['centerId'] as string | undefined;
      const data = await ReportsService.getBillingReport(req.auth!, periodId, centerId);
      ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  public static async getPayouts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startDate = req.query['startDate'] as string | undefined;
      const endDate = req.query['endDate'] as string | undefined;
      const centerId = req.query['centerId'] as string | undefined;
      const data = await ReportsService.getPayoutsReport(req.auth!, startDate, endDate, centerId);
      ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }
}
