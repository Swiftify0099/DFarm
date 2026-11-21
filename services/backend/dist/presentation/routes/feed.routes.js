import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from '../../infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../../infrastructure/database/TenantDatabaseManager.js';
import { authenticate, optionalAuthenticate } from '../middleware/authenticate.js';
import { authorizePermission } from '../middleware/authorize.js';
const router = Router();
const getTenantDb = async (organizationId) => {
    if (organizationId) {
        try {
            return await tenantDbManager.getTenantDb(organizationId);
        }
        catch {
            return db;
        }
    }
    return db;
};
// 1. Get Feed Products Catalog with Genuine Stock from Inventory
router.get('/products', optionalAuthenticate, async (req, res, next) => {
    try {
        const organizationId = req.user?.organizationId || req.headers['x-dairy-tenant-id'] || req.headers['x-dairy-id'] || req.query['organizationId'];
        if (!organizationId) {
            res.status(400).json({ success: false, error: 'Dairy context (organizationId) is required' });
            return;
        }
        const client = await getTenantDb(organizationId);
        let result;
        try {
            result = await client.query(`SELECT 
           fp.id,
           fp.code,
           fp.name,
           fp.description,
           fp.base_unit,
           fp.pack_size,
           fp.selling_price,
           fp.status,
           fp.minimum_stock_level,
           COALESCE(SUM(cpi.current_stock), 0) AS current_stock
         FROM feed_products fp
         LEFT JOIN center_product_inventory cpi ON cpi.product_id = fp.id
         WHERE fp.organization_id = $1
         GROUP BY fp.id, fp.code, fp.name, fp.description, fp.base_unit, fp.pack_size, fp.selling_price, fp.status, fp.minimum_stock_level
         ORDER BY fp.name ASC;`, [organizationId]);
        }
        catch {
            // Fallback if center_product_inventory is empty or not yet joined
            result = await client.query(`SELECT id, code, name, description, base_unit, pack_size, selling_price, status, minimum_stock_level, 0 AS current_stock
         FROM feed_products
         WHERE organization_id = $1
         ORDER BY name ASC;`, [organizationId]).catch(() => ({ rows: [] }));
        }
        const products = result.rows.map((p) => ({
            id: p.id,
            code: p.code,
            name: p.name,
            description: p.description || '',
            unit: p.base_unit || 'KG',
            packSize: Number(p.pack_size || 1),
            pricePerUnit: Number(p.selling_price || 0),
            status: p.status || 'ACTIVE',
            currentStock: Number(p.current_stock || 0),
            minimumStockAlert: Number(p.minimum_stock_level || 0),
        }));
        res.json({ success: true, count: products.length, data: products });
    }
    catch (err) {
        next(err);
    }
});
// 2. Create New Feed Product
router.post('/products', authenticate, authorizePermission('feed:manage'), async (req, res, next) => {
    try {
        const organizationId = req.user?.organizationId;
        if (!organizationId) {
            res.status(401).json({ success: false, error: 'Unauthorized: missing dairy tenant context' });
            return;
        }
        const { code, name, description, baseUnit, packSize, sellingPrice, defaultPurchasePrice, minimumStockLevel, categoryId } = req.body;
        if (!name || !sellingPrice) {
            res.status(400).json({ success: false, error: 'Product name and sellingPrice are required.' });
            return;
        }
        const client = await getTenantDb(organizationId);
        const prodCode = code || `FEED-${Date.now().toString().slice(-4)}`;
        // Default or ensure category exists
        let catId = categoryId;
        if (!catId) {
            const catRes = await client.query(`SELECT id FROM feed_categories WHERE organization_id = $1 LIMIT 1;`, [organizationId]).catch(() => ({ rows: [] }));
            if (catRes.rows.length > 0) {
                catId = catRes.rows[0].id;
            }
            else {
                const newCat = await client.query(`INSERT INTO feed_categories (organization_id, code, name) VALUES ($1, 'GENERAL', 'General Cattle Feed') RETURNING id;`, [organizationId]).catch(() => ({ rows: [{ id: crypto.randomUUID() }] }));
                catId = newCat.rows[0].id;
            }
        }
        const insertRes = await client.query(`INSERT INTO feed_products (
         organization_id, category_id, code, name, description, base_unit, pack_size,
         default_purchase_price, selling_price, minimum_stock_level, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ACTIVE')
       RETURNING id, code, name, selling_price, status;`, [
            organizationId,
            catId,
            prodCode,
            name,
            description || '',
            baseUnit || 'BAG',
            packSize || 50,
            defaultPurchasePrice || Number(sellingPrice) * 0.85,
            sellingPrice,
            minimumStockLevel || 10,
        ]);
        const product = insertRes.rows[0];
        res.status(201).json({
            success: true,
            message: `Feed product '${name}' created successfully.`,
            data: product,
        });
    }
    catch (err) {
        next(err);
    }
});
// 3. Add Feed Stock / Receive Inventory
router.post('/stock', authenticate, authorizePermission('feed:manage'), async (req, res, next) => {
    try {
        const organizationId = req.user?.organizationId;
        if (!organizationId) {
            res.status(401).json({ success: false, error: 'Unauthorized: missing dairy tenant context' });
            return;
        }
        const { productId, quantity, centerId, unitCost, referenceNumber, notes } = req.body;
        const qty = Number(quantity);
        if (!productId || isNaN(qty) || qty <= 0) {
            res.status(400).json({ success: false, error: 'Valid productId and positive quantity are required.' });
            return;
        }
        const client = await getTenantDb(organizationId);
        // Verify product exists in dairy
        const prodRes = await client.query(`SELECT id, name, selling_price FROM feed_products WHERE id = $1 AND organization_id = $2;`, [productId, organizationId]);
        if (prodRes.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Feed product not found in this dairy.' });
            return;
        }
        // Resolve centerId
        let effectiveCenterId = centerId;
        if (!effectiveCenterId) {
            const centerRes = await client.query(`SELECT id FROM dairy_centers WHERE organization_id = $1 LIMIT 1;`, [organizationId]).catch(() => ({ rows: [] }));
            effectiveCenterId = centerRes.rows[0]?.id || '00000000-0000-0000-0000-000000000002';
        }
        // Record Stock Movement
        const movementType = 'PURCHASE_RECEIPT';
        const cost = Number(unitCost || prodRes.rows[0].selling_price || 0);
        const ref = referenceNumber || `REC-${Date.now().toString().slice(-6)}`;
        await client.query(`INSERT INTO stock_movements (
         organization_id, center_id, product_id, movement_type, quantity, unit_cost, total_cost, reference_number, notes
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`, [organizationId, effectiveCenterId, productId, movementType, qty, cost, qty * cost, ref, notes || 'Stock receipt by Dairy Admin']).catch(() => { });
        // Update / Upsert center_product_inventory
        let newStock = qty;
        try {
            const invRes = await client.query(`SELECT id, current_stock FROM center_product_inventory WHERE product_id = $1 AND center_id = $2;`, [productId, effectiveCenterId]);
            if (invRes.rows.length > 0) {
                const updated = await client.query(`UPDATE center_product_inventory
           SET current_stock = current_stock + $1, last_movement_at = NOW(), updated_at = NOW()
           WHERE id = $2
           RETURNING current_stock;`, [qty, invRes.rows[0].id]);
                newStock = Number(updated.rows[0].current_stock);
            }
            else {
                const inserted = await client.query(`INSERT INTO center_product_inventory (organization_id, center_id, product_id, current_stock, last_movement_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())
           RETURNING current_stock;`, [organizationId, effectiveCenterId, productId, qty]);
                newStock = Number(inserted.rows[0].current_stock);
            }
        }
        catch (err) {
            console.error('Error updating center_product_inventory:', err);
        }
        res.json({
            success: true,
            message: `Stock added successfully: +${qty} units. Current stock: ${newStock}.`,
            data: {
                productId,
                quantityAdded: qty,
                currentStock: newStock,
                centerId: effectiveCenterId,
            },
        });
    }
    catch (err) {
        next(err);
    }
});
// 4. Record Farmer Feed Sale with Atomic Stock Decrement & Balanced Double-Entry Ledger Posting
router.post('/sales', authenticate, authorizePermission('feed:sell'), async (req, res, next) => {
    try {
        const organizationId = req.user?.organizationId;
        if (!organizationId) {
            res.status(401).json({ success: false, error: 'Unauthorized: missing dairy tenant context' });
            return;
        }
        const { customerId, productId, quantity, centerId, paymentMode = 'CREDIT', notes, idempotencyKey: _idempotencyKey } = req.body;
        const qty = Number(quantity);
        if (!customerId || !productId || isNaN(qty) || qty <= 0) {
            res.status(400).json({ success: false, error: 'customerId, productId, and positive quantity are required.' });
            return;
        }
        const client = await getTenantDb(organizationId);
        // 1. Verify Customer exists and belongs to this dairy
        const custRes = await client.query(`SELECT id, farmer_code, full_name, status, is_deleted FROM customers WHERE id = $1 AND organization_id = $2;`, [customerId, organizationId]);
        if (custRes.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Customer not found in this dairy.' });
            return;
        }
        const customer = custRes.rows[0];
        if (customer.status === 'SUSPENDED' || customer.is_deleted) {
            res.status(400).json({ success: false, error: `Customer ${customer.full_name} is suspended or inactive.` });
            return;
        }
        // 2. Verify Product exists and is active
        const prodRes = await client.query(`SELECT id, name, selling_price, status FROM feed_products WHERE id = $1 AND organization_id = $2;`, [productId, organizationId]);
        if (prodRes.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Feed product not found.' });
            return;
        }
        const product = prodRes.rows[0];
        if (product.status !== 'ACTIVE') {
            res.status(400).json({ success: false, error: `Product '${product.name}' is inactive or discontinued.` });
            return;
        }
        // 3. Resolve Center
        let effectiveCenterId = centerId;
        if (!effectiveCenterId) {
            const centerRes = await client.query(`SELECT id FROM dairy_centers WHERE organization_id = $1 LIMIT 1;`, [organizationId]).catch(() => ({ rows: [] }));
            effectiveCenterId = centerRes.rows[0]?.id || '00000000-0000-0000-0000-000000000002';
        }
        // 4. Check Stock Availability & Decrement Atomically (Prevent Negative Stock)
        let currentStock = 0;
        const invRes = await client.query(`SELECT id, current_stock FROM center_product_inventory WHERE product_id = $1 AND center_id = $2;`, [productId, effectiveCenterId]).catch(() => ({ rows: [] }));
        if (invRes.rows.length > 0) {
            currentStock = Number(invRes.rows[0].current_stock);
            if (currentStock < qty) {
                res.status(400).json({
                    success: false,
                    error: `Insufficient stock for product '${product.name}'. Available: ${currentStock}, Requested: ${qty}.`,
                });
                return;
            }
            // Atomic stock decrement
            const decrementRes = await client.query(`UPDATE center_product_inventory
         SET current_stock = current_stock - $1, updated_at = NOW()
         WHERE id = $2 AND current_stock >= $1
         RETURNING current_stock;`, [qty, invRes.rows[0].id]);
            if (decrementRes.rows.length === 0) {
                res.status(400).json({
                    success: false,
                    error: 'Concurrent transaction conflict: Insufficient stock at checkout time.',
                });
                return;
            }
            currentStock = Number(decrementRes.rows[0].current_stock);
        }
        else {
            res.status(400).json({
                success: false,
                error: `Product '${product.name}' has no available stock inventory recorded in this center.`,
            });
            return;
        }
        // 5. Calculate Financials
        const unitPrice = Number(product.selling_price);
        const totalAmount = qty * unitPrice;
        const saleNumber = `FS-${Date.now().toString().slice(-6)}`;
        // 6. Record Feed Sale & Sale Items
        const saleInsert = await client.query(`INSERT INTO feed_sales (
         organization_id, center_id, customer_id, invoice_number, receipt_number, subtotal, tax_amount, total_amount,
         payment_mode, status, idempotency_key, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, 0.00, $6, $7, 'COMPLETED', $8, $9)
       RETURNING id;`, [
            organizationId,
            effectiveCenterId,
            customerId,
            saleNumber,
            `REC-${saleNumber}`,
            totalAmount,
            paymentMode === 'CASH' ? 'CASH' : 'CREDIT',
            `IDEMP-${saleNumber}-${Date.now()}`,
            req.user?.userId || '00000000-0000-0000-0000-000000000084',
        ]);
        const saleId = saleInsert.rows[0].id;
        await client.query(`INSERT INTO feed_sale_items (sale_id, product_id, quantity, unit, base_quantity, unit_price, total_amount)
       VALUES ($1, $2, $3, $4, $3, $5, $6);`, [saleId, productId, qty, product.base_unit || 'BAG', unitPrice, totalAmount]).catch((err) => {
            console.error('Error inserting feed_sale_items:', err);
        });
        // 7. Record Stock Movement (CUSTOMER_SALE)
        await client.query(`INSERT INTO stock_movements (
         organization_id, center_id, product_id, movement_type, quantity, unit_cost, total_cost, reference_number, notes
       ) VALUES ($1, $2, $3, 'CUSTOMER_SALE', $4, $5, $6, $7, $8);`, [organizationId, effectiveCenterId, productId, qty, unitPrice, totalAmount, saleNumber, notes || `Feed sale to ${customer.full_name}`]).catch(() => { });
        // 8. Balanced Double-Entry Ledger Posting for Credit Purchases
        let ledgerReference = null;
        let balanceAfter = null;
        if (paymentMode === 'CREDIT' || paymentMode === 'CREDIT_LEDGER') {
            try {
                // Query customer's payable ledger account
                let accRes = await client.query(`SELECT id, current_balance FROM customer_ledger_accounts WHERE customer_id = $1 LIMIT 1;`, [customerId]);
                if (accRes.rows.length === 0) {
                    accRes = await client.query(`INSERT INTO customer_ledger_accounts (id, customer_id, organization_id, current_balance)
             VALUES (gen_random_uuid(), $1, $2, 0.00) RETURNING id, current_balance;`, [customerId, organizationId]);
                }
                const accountId = accRes.rows[0].id;
                const oldBalance = Number(accRes.rows[0].current_balance || 0);
                balanceAfter = oldBalance - totalAmount;
                const idempotencyKey = `FEED-SALE-${saleId}-${Date.now()}`;
                const txnRes = await client.query(`INSERT INTO ledger_transactions (
             id, organization_id, center_id, customer_id, transaction_type,
             direction, amount, balance_after, reference_entity, reference_id,
             description, idempotency_key, created_by
           ) VALUES (
             gen_random_uuid(), $1, $2, $3, 'FEED_PURCHASE_DEBIT',
             'DEBIT', $4, $5, 'FEED_SALE', $6,
             $7, $8, $9
           ) RETURNING id;`, [
                    organizationId,
                    effectiveCenterId,
                    customerId,
                    totalAmount,
                    balanceAfter,
                    saleId,
                    `Feed purchase: ${qty}x ${product.name} (${saleNumber})`,
                    idempotencyKey,
                    req.user?.userId || '00000000-0000-0000-0000-000000000084',
                ]);
                ledgerReference = txnRes.rows[0]?.id;
                // Insert balanced double entries into ledger_entries
                await client.query(`INSERT INTO ledger_entries (transaction_id, account_id, account_type, entry_type, amount)
           VALUES ($1, $2, 'CUSTOMER_PAYABLE', 'DEBIT', $3),
                  ($1, $2, 'FEED_INVENTORY', 'CREDIT', $3);`, [ledgerReference, accountId, totalAmount]).catch(() => { });
                // Update customer_ledger_accounts running balance
                await client.query(`UPDATE customer_ledger_accounts SET current_balance = $1, last_transaction_at = NOW(), updated_at = NOW() WHERE id = $2;`, [balanceAfter, accountId]);
            }
            catch (err) {
                // Log ledger error
                console.error('Error posting feed sale to ledger:', err);
            }
        }
        res.status(201).json({
            success: true,
            message: `Feed sale recorded successfully for ${customer.full_name} (${qty}x ${product.name} = ₹${totalAmount}).`,
            data: {
                id: saleId,
                saleNumber,
                customerId,
                customerName: customer.full_name,
                farmerCode: customer.farmer_code,
                productId,
                productName: product.name,
                quantity: qty,
                unitPrice,
                totalAmount,
                paymentMode,
                remainingStock: currentStock,
                ledgerReference,
                balanceAfter,
            },
        });
    }
    catch (err) {
        next(err);
    }
});
// 5. Get Feed Sales (Filtered by Dairy or Specific Customer)
router.get('/sales', optionalAuthenticate, async (req, res, next) => {
    try {
        let customerId = req.query['customerId'];
        if (req.user?.role === 'FARMER_CUSTOMER') {
            if (customerId && customerId !== req.user.userId) {
                res.status(403).json({
                    success: false,
                    error: 'Cross-customer query blocked: customer can only view their own feed purchases.',
                });
                return;
            }
            customerId = req.user.userId;
        }
        const organizationId = req.user?.organizationId || req.headers['x-dairy-tenant-id'] || req.headers['x-dairy-id'] || req.query['organizationId'];
        if (!organizationId) {
            res.status(400).json({ success: false, error: 'Dairy context (organizationId) is required' });
            return;
        }
        const client = await getTenantDb(organizationId);
        let sales = [];
        try {
            const query = `
        SELECT 
          fs.id,
          fs.invoice_number AS sale_number,
          fs.customer_id,
          c.full_name AS customer_name,
          c.farmer_code,
          fs.total_amount,
          fs.payment_mode,
          fs.status AS payment_status,
          fs.created_at,
          COALESCE(fp.name, 'Feed Product') AS product_name,
          COALESCE(fsi.quantity, 1) AS quantity,
          COALESCE(fsi.unit_price, fs.total_amount) AS unit_price
        FROM feed_sales fs
        JOIN customers c ON c.id = fs.customer_id
        LEFT JOIN feed_sale_items fsi ON fsi.sale_id = fs.id
        LEFT JOIN feed_products fp ON fp.id = fsi.product_id
        WHERE fs.organization_id = $1
          AND ($2::uuid IS NULL OR fs.customer_id = $2)
        ORDER BY fs.created_at DESC LIMIT 100;
      `;
            const result = await client.query(query, [organizationId, customerId || null]);
            sales = result.rows.map((r) => ({
                id: r.id,
                saleNumber: r.sale_number,
                customerId: r.customer_id,
                customerName: r.customer_name,
                customerCode: r.farmer_code,
                productName: r.product_name,
                quantity: Number(r.quantity),
                unitPrice: Number(r.unit_price),
                amount: Number(r.total_amount),
                totalAmount: Number(r.total_amount),
                paymentMode: r.payment_mode,
                status: r.payment_status,
                date: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
            }));
        }
        catch {
            sales = [];
        }
        res.json({ success: true, count: sales.length, data: sales });
    }
    catch (err) {
        next(err);
    }
});
// 6. Get Feed Stock Movements
router.get('/movements', optionalAuthenticate, async (req, res, next) => {
    try {
        const organizationId = req.user?.organizationId || req.headers['x-dairy-tenant-id'] || req.headers['x-dairy-id'] || req.query['organizationId'];
        if (!organizationId) {
            res.status(400).json({ success: false, error: 'Dairy context (organizationId) is required' });
            return;
        }
        const client = await getTenantDb(organizationId);
        let movements = [];
        try {
            const result = await client.query(`SELECT 
           sm.id,
           sm.product_id,
           fp.name AS product_name,
           sm.movement_type,
           sm.quantity,
           sm.unit_cost,
           sm.total_cost,
           sm.reference_number,
           sm.notes,
           sm.created_at
         FROM stock_movements sm
         JOIN feed_products fp ON fp.id = sm.product_id
         WHERE sm.organization_id = $1
         ORDER BY sm.created_at DESC LIMIT 50;`, [organizationId]);
            movements = result.rows.map((m) => ({
                id: m.id,
                productId: m.product_id,
                productName: m.product_name,
                movementType: m.movement_type,
                quantity: Number(m.quantity),
                unitCost: Number(m.unit_cost),
                totalCost: Number(m.total_cost),
                referenceNumber: m.reference_number,
                notes: m.notes,
                createdAt: m.created_at ? new Date(m.created_at).toISOString() : new Date().toISOString(),
            }));
        }
        catch {
            movements = [];
        }
        res.json({ success: true, count: movements.length, data: movements });
    }
    catch (err) {
        next(err);
    }
});
export const feedRoutes = router;
//# sourceMappingURL=feed.routes.js.map