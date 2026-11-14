import { Router } from 'express';
import { FeedController } from './feed.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
export const feedRouter = Router();
// All feed routes require authentication
feedRouter.use(authenticate);
// Categories
feedRouter.get('/categories', FeedController.getCategories);
feedRouter.post('/categories', FeedController.createCategory);
// Products
feedRouter.get('/products', FeedController.getProducts);
feedRouter.post('/products', FeedController.createProduct);
feedRouter.patch('/products/:productId', FeedController.updateProduct);
// Suppliers
feedRouter.get('/suppliers', FeedController.getSuppliers);
feedRouter.post('/suppliers', FeedController.createSupplier);
// Purchases & Receiving
feedRouter.post('/purchases', FeedController.createPurchase);
feedRouter.post('/purchases/:purchaseId/receive', FeedController.receivePurchase);
// Sales & Returns
feedRouter.post('/sales', FeedController.createSale);
feedRouter.get('/sales', FeedController.getSales);
feedRouter.get('/sales/:saleId', FeedController.getSaleById);
feedRouter.post('/sales/:saleId/return', FeedController.processReturn);
//# sourceMappingURL=feed.routes.js.map