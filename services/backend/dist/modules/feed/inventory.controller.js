import { FeedService } from './feed.service.js';
import { ApiResponse } from '../../shared/response/api-response.js';
import { CreateInventoryTransferSchema, CreateInventoryAdjustmentSchema, } from '@dfarm/shared-validation';
export class InventoryController {
    static async getInventory(req, res, next) {
        try {
            const centerId = req.query['centerId'];
            const productId = req.query['productId'];
            const inventory = await FeedService.getInventory(centerId, productId, req.auth);
            ApiResponse.success(res, inventory);
        }
        catch (err) {
            next(err);
        }
    }
    static async getMovements(req, res, next) {
        try {
            const movements = await FeedService.getMovements(req.query, req.auth);
            ApiResponse.success(res, movements);
        }
        catch (err) {
            next(err);
        }
    }
    static async transferStock(req, res, next) {
        try {
            const parsed = CreateInventoryTransferSchema.parse(req.body);
            const result = await FeedService.transferStock(parsed, req.auth);
            ApiResponse.success(res, result, 201);
        }
        catch (err) {
            next(err);
        }
    }
    static async adjustStock(req, res, next) {
        try {
            const parsed = CreateInventoryAdjustmentSchema.parse(req.body);
            const result = await FeedService.adjustStock(parsed, req.auth);
            ApiResponse.success(res, result, 201);
        }
        catch (err) {
            next(err);
        }
    }
    static async getReports(req, res, next) {
        try {
            const reports = await FeedService.getReports(req.query, req.auth);
            ApiResponse.success(res, reports);
        }
        catch (err) {
            next(err);
        }
    }
}
//# sourceMappingURL=inventory.controller.js.map