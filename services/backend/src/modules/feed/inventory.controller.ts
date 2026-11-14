import type { Request, Response, NextFunction } from 'express';
import { FeedService } from './feed.service.js';
import { ApiResponse } from '../../shared/response/api-response.js';
import {
  CreateInventoryTransferSchema,
  CreateInventoryAdjustmentSchema,
} from '@dfarm/shared-validation';

export class InventoryController {
  public static async getInventory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const centerId = req.query['centerId'] as string | undefined;
      const productId = req.query['productId'] as string | undefined;
      const inventory = await FeedService.getInventory(centerId, productId, req.auth!);
      ApiResponse.success(res, inventory);
    } catch (err) {
      next(err);
    }
  }

  public static async getMovements(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movements = await FeedService.getMovements(req.query, req.auth!);
      ApiResponse.success(res, movements);
    } catch (err) {
      next(err);
    }
  }

  public static async transferStock(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = CreateInventoryTransferSchema.parse(req.body);
      const result = await FeedService.transferStock(parsed, req.auth!);
      ApiResponse.success(res, result, 201);
    } catch (err) {
      next(err);
    }
  }

  public static async adjustStock(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = CreateInventoryAdjustmentSchema.parse(req.body);
      const result = await FeedService.adjustStock(parsed, req.auth!);
      ApiResponse.success(res, result, 201);
    } catch (err) {
      next(err);
    }
  }

  public static async getReports(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const reports = await FeedService.getReports(req.query, req.auth!);
      ApiResponse.success(res, reports);
    } catch (err) {
      next(err);
    }
  }
}

