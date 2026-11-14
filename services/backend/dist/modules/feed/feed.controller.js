import { FeedService } from './feed.service.js';
import { ApiResponse } from '../../shared/response/api-response.js';
import { CreateFeedCategorySchema, CreateFeedProductSchema, UpdateFeedProductSchema, CreateFeedSupplierSchema, CreateFeedPurchaseSchema, ReceiveFeedPurchaseSchema, CreateFeedSaleSchema, CreateFeedReturnSchema, } from '@dfarm/shared-validation';
export class FeedController {
    // Categories
    static async getCategories(req, res, next) {
        try {
            const categories = await FeedService.getCategories(req.auth);
            ApiResponse.success(res, categories);
        }
        catch (err) {
            next(err);
        }
    }
    static async createCategory(req, res, next) {
        try {
            const parsed = CreateFeedCategorySchema.parse(req.body);
            const category = await FeedService.createCategory(parsed, req.auth);
            ApiResponse.success(res, category, 201);
        }
        catch (err) {
            next(err);
        }
    }
    // Products
    static async getProducts(req, res, next) {
        try {
            const products = await FeedService.getProducts(req.query, req.auth);
            ApiResponse.success(res, products);
        }
        catch (err) {
            next(err);
        }
    }
    static async createProduct(req, res, next) {
        try {
            const parsed = CreateFeedProductSchema.parse(req.body);
            const product = await FeedService.createProduct(parsed, req.auth);
            ApiResponse.success(res, product, 201);
        }
        catch (err) {
            next(err);
        }
    }
    static async updateProduct(req, res, next) {
        try {
            const productId = req.params['productId'];
            const parsed = UpdateFeedProductSchema.parse(req.body);
            const product = await FeedService.updateProduct(productId, parsed, req.auth);
            ApiResponse.success(res, product);
        }
        catch (err) {
            next(err);
        }
    }
    // Suppliers
    static async getSuppliers(req, res, next) {
        try {
            const suppliers = await FeedService.getSuppliers(req.auth);
            ApiResponse.success(res, suppliers);
        }
        catch (err) {
            next(err);
        }
    }
    static async createSupplier(req, res, next) {
        try {
            const parsed = CreateFeedSupplierSchema.parse(req.body);
            const supplier = await FeedService.createSupplier(parsed, req.auth);
            ApiResponse.success(res, supplier, 201);
        }
        catch (err) {
            next(err);
        }
    }
    // Purchases
    static async createPurchase(req, res, next) {
        try {
            const parsed = CreateFeedPurchaseSchema.parse(req.body);
            const purchase = await FeedService.createPurchase(parsed, req.auth);
            ApiResponse.success(res, purchase, 201);
        }
        catch (err) {
            next(err);
        }
    }
    static async receivePurchase(req, res, next) {
        try {
            const purchaseId = req.params['purchaseId'];
            const parsed = ReceiveFeedPurchaseSchema.parse(req.body);
            const result = await FeedService.receivePurchase(purchaseId, parsed, req.auth);
            ApiResponse.success(res, result);
        }
        catch (err) {
            next(err);
        }
    }
    // Sales
    static async createSale(req, res, next) {
        try {
            const parsed = CreateFeedSaleSchema.parse(req.body);
            const result = await FeedService.createSale(parsed, req.auth);
            ApiResponse.success(res, result, 201);
        }
        catch (err) {
            next(err);
        }
    }
    static async getSales(req, res, next) {
        try {
            const sales = await FeedService.getSales(req.query, req.auth);
            ApiResponse.success(res, sales);
        }
        catch (err) {
            next(err);
        }
    }
    static async getSaleById(req, res, next) {
        try {
            const saleId = req.params['saleId'];
            const sale = await FeedService.getSaleById(saleId, req.auth);
            ApiResponse.success(res, sale);
        }
        catch (err) {
            next(err);
        }
    }
    // Returns
    static async processReturn(req, res, next) {
        try {
            const saleId = req.params['saleId'];
            const parsed = CreateFeedReturnSchema.parse(req.body);
            const approvedBy = parsed.approvedBy || req.auth.userId;
            const result = await FeedService.processReturn(saleId, { ...parsed, approvedBy }, req.auth);
            ApiResponse.success(res, result, 201);
        }
        catch (err) {
            next(err);
        }
    }
}
//# sourceMappingURL=feed.controller.js.map