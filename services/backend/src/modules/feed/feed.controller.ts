import type { Request, Response, NextFunction } from 'express';
import { FeedService } from './feed.service.js';
import { ApiResponse } from '../../shared/response/api-response.js';
import {
  CreateFeedCategorySchema,
  CreateFeedProductSchema,
  UpdateFeedProductSchema,
  CreateFeedSupplierSchema,
  CreateFeedPurchaseSchema,
  ReceiveFeedPurchaseSchema,
  CreateFeedSaleSchema,
  CreateFeedReturnSchema,
} from '@dfarm/shared-validation';

export class FeedController {
  // Categories
  public static async getCategories(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const categories = await FeedService.getCategories(req.auth!);
      ApiResponse.success(res, categories);
    } catch (err) {
      next(err);
    }
  }

  public static async createCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = CreateFeedCategorySchema.parse(req.body);
      const category = await FeedService.createCategory(parsed, req.auth!);
      ApiResponse.success(res, category, 201);
    } catch (err) {
      next(err);
    }
  }

  // Products
  public static async getProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const products = await FeedService.getProducts(req.query, req.auth!);
      ApiResponse.success(res, products);
    } catch (err) {
      next(err);
    }
  }

  public static async createProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = CreateFeedProductSchema.parse(req.body);
      const product = await FeedService.createProduct(parsed, req.auth!);
      ApiResponse.success(res, product, 201);
    } catch (err) {
      next(err);
    }
  }

  public static async updateProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const productId = req.params['productId'] as string;
      const parsed = UpdateFeedProductSchema.parse(req.body);
      const product = await FeedService.updateProduct(productId, parsed, req.auth!);
      ApiResponse.success(res, product);
    } catch (err) {
      next(err);
    }
  }

  // Suppliers
  public static async getSuppliers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const suppliers = await FeedService.getSuppliers(req.auth!);
      ApiResponse.success(res, suppliers);
    } catch (err) {
      next(err);
    }
  }

  public static async createSupplier(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = CreateFeedSupplierSchema.parse(req.body);
      const supplier = await FeedService.createSupplier(parsed, req.auth!);
      ApiResponse.success(res, supplier, 201);
    } catch (err) {
      next(err);
    }
  }

  // Purchases
  public static async createPurchase(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = CreateFeedPurchaseSchema.parse(req.body);
      const purchase = await FeedService.createPurchase(parsed, req.auth!);
      ApiResponse.success(res, purchase, 201);
    } catch (err) {
      next(err);
    }
  }

  public static async receivePurchase(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const purchaseId = req.params['purchaseId'] as string;
      const parsed = ReceiveFeedPurchaseSchema.parse(req.body);
      const result = await FeedService.receivePurchase(purchaseId, parsed, req.auth!);
      ApiResponse.success(res, result);
    } catch (err) {
      next(err);
    }
  }

  // Sales
  public static async createSale(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = CreateFeedSaleSchema.parse(req.body);
      const result = await FeedService.createSale(parsed, req.auth!);
      ApiResponse.success(res, result, 201);
    } catch (err) {
      next(err);
    }
  }

  public static async getSales(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sales = await FeedService.getSales(req.query, req.auth!);
      ApiResponse.success(res, sales);
    } catch (err) {
      next(err);
    }
  }

  public static async getSaleById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const saleId = req.params['saleId'] as string;
      const sale = await FeedService.getSaleById(saleId, req.auth!);
      ApiResponse.success(res, sale);
    } catch (err) {
      next(err);
    }
  }

  // Returns
  public static async processReturn(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const saleId = req.params['saleId'] as string;
      const parsed = CreateFeedReturnSchema.parse(req.body);
      const result = await FeedService.processReturn(saleId, parsed, req.auth!);
      ApiResponse.success(res, result, 201);
    } catch (err) {
      next(err);
    }
  }
}

