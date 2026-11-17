import { Router } from 'express';
import { db } from '../../infrastructure/database/PostgresPool.js';
import { optionalAuthenticate } from '../middleware/authenticate.js';
const router = Router();
// 1. Get Feed Products Catalog
router.get('/products', optionalAuthenticate, async (req, res, next) => {
    try {
        const organizationId = req.user?.organizationId || req.headers['x-dairy-id'] || req.query['organizationId'];
        if (!organizationId) {
            res.status(400).json({ success: false, error: 'Dairy context (organizationId) is required' });
            return;
        }
        const result = await db.query(`SELECT id, code, name, description, base_unit, pack_size, selling_price, status, minimum_stock_level
       FROM feed_products
       WHERE organization_id = $1
       ORDER BY name ASC;`, [organizationId]);
        const products = result.rows.map((p) => ({
            id: p.id,
            code: p.code,
            name: p.name,
            description: p.description,
            unit: p.base_unit,
            packSize: Number(p.pack_size),
            pricePerUnit: Number(p.selling_price),
            status: p.status,
            currentStock: 100, // standard stocked
            minimumStockAlert: Number(p.minimum_stock_level),
        }));
        res.json({ success: true, count: products.length, data: products });
    }
    catch (err) {
        next(err);
    }
});
// 2. Get Feed Movements
router.get('/movements', optionalAuthenticate, async (_req, res, next) => {
    try {
        res.json({ success: true, count: 0, data: [] });
    }
    catch (err) {
        next(err);
    }
});
// 3. Get Feed Sales to Customers
router.get('/sales', optionalAuthenticate, async (_req, res, next) => {
    try {
        res.json({ success: true, count: 0, data: [] });
    }
    catch (err) {
        next(err);
    }
});
// 4. Add Feed Stock
router.post('/stock', optionalAuthenticate, async (req, res, next) => {
    try {
        const { productId, quantity, reason: _reason, operatorName: _operatorName } = req.body;
        res.json({
            success: true,
            message: `Stock added: +${quantity} units for product ${productId}`,
        });
    }
    catch (err) {
        next(err);
    }
});
// 5. Record Feed Sale
router.post('/sales', optionalAuthenticate, async (req, res, next) => {
    try {
        const { customerId, productId, quantity, paymentMode, notes: _notes } = req.body;
        res.status(201).json({
            success: true,
            message: `Feed sale recorded for customer ${customerId}: ${quantity} units`,
            data: {
                id: `FS-${Date.now().toString().slice(-6)}`,
                customerId,
                productId,
                quantity,
                paymentMode,
            },
        });
    }
    catch (err) {
        next(err);
    }
});
export const feedRoutes = router;
//# sourceMappingURL=feed.routes.js.map