import { pool, query } from '../../config/db.js';
import { ConflictError, NotFoundError, BadRequestError } from '../../shared/errors/app-error.js';
export class FeedRepository {
    // ==========================================================================
    // Categories
    // ==========================================================================
    static async createCategory(orgId, data) {
        try {
            const res = await query(`INSERT INTO feed_categories (organization_id, code, name, description)
         VALUES ($1, $2, $3, $4)
         RETURNING id, organization_id as "organizationId", code, name, description, is_active as "isActive", created_at as "createdAt", updated_at as "updatedAt"`, [orgId, data.code.toUpperCase(), data.name, data.description || null]);
            return res.rows[0];
        }
        catch (err) {
            if (err.code === '23505') {
                throw new ConflictError(`Feed category with code '${data.code}' already exists in this organization`);
            }
            throw err;
        }
    }
    static async getCategories(orgId) {
        const res = await query(`SELECT id, organization_id as "organizationId", code, name, description, is_active as "isActive", created_at as "createdAt", updated_at as "updatedAt"
       FROM feed_categories
       WHERE organization_id = $1
       ORDER BY name ASC`, [orgId]);
        return res.rows;
    }
    // ==========================================================================
    // Products
    // ==========================================================================
    static async createProduct(orgId, data) {
        try {
            const res = await query(`INSERT INTO feed_products (
           organization_id, category_id, code, name, description,
           base_unit, pack_size, pack_unit, default_purchase_price,
           selling_price, tax_rate_percent, hsn_code, status, minimum_stock_level, weighted_avg_cost
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $9)
         RETURNING 
           id, organization_id as "organizationId", category_id as "categoryId",
           code, name, description, base_unit as "baseUnit", pack_size as "packSize",
           pack_unit as "packUnit", default_purchase_price as "defaultPurchasePrice",
           selling_price as "sellingPrice", tax_rate_percent as "taxRatePercent",
           hsn_code as "hsnCode", status, minimum_stock_level as "minimumStockLevel",
           weighted_avg_cost as "weightedAvgCost", created_at as "createdAt", updated_at as "updatedAt"`, [
                orgId,
                data.categoryId,
                data.code.toUpperCase(),
                data.name,
                data.description || null,
                data.baseUnit,
                data.packSize || 1,
                data.packUnit || data.baseUnit,
                data.defaultPurchasePrice || 0,
                data.sellingPrice,
                data.taxRatePercent || 0,
                data.hsnCode || null,
                data.status || 'ACTIVE',
                data.minimumStockLevel || 0,
            ]);
            return res.rows[0];
        }
        catch (err) {
            if (err.code === '23505') {
                throw new ConflictError(`Feed product with code '${data.code}' already exists in this organization`);
            }
            throw err;
        }
    }
    static async updateProduct(orgId, productId, data) {
        const fields = [];
        const values = [orgId, productId];
        let idx = 3;
        if (data.categoryId !== undefined) {
            fields.push(`category_id = $${idx++}`);
            values.push(data.categoryId);
        }
        if (data.name !== undefined) {
            fields.push(`name = $${idx++}`);
            values.push(data.name);
        }
        if (data.description !== undefined) {
            fields.push(`description = $${idx++}`);
            values.push(data.description);
        }
        if (data.baseUnit !== undefined) {
            fields.push(`base_unit = $${idx++}`);
            values.push(data.baseUnit);
        }
        if (data.packSize !== undefined) {
            fields.push(`pack_size = $${idx++}`);
            values.push(data.packSize);
        }
        if (data.packUnit !== undefined) {
            fields.push(`pack_unit = $${idx++}`);
            values.push(data.packUnit);
        }
        if (data.defaultPurchasePrice !== undefined) {
            fields.push(`default_purchase_price = $${idx++}`);
            values.push(data.defaultPurchasePrice);
        }
        if (data.sellingPrice !== undefined) {
            fields.push(`selling_price = $${idx++}`);
            values.push(data.sellingPrice);
        }
        if (data.taxRatePercent !== undefined) {
            fields.push(`tax_rate_percent = $${idx++}`);
            values.push(data.taxRatePercent);
        }
        if (data.hsnCode !== undefined) {
            fields.push(`hsn_code = $${idx++}`);
            values.push(data.hsnCode);
        }
        if (data.status !== undefined) {
            fields.push(`status = $${idx++}`);
            values.push(data.status);
        }
        if (data.minimumStockLevel !== undefined) {
            fields.push(`minimum_stock_level = $${idx++}`);
            values.push(data.minimumStockLevel);
        }
        if (fields.length === 0) {
            return this.getProductById(orgId, productId);
        }
        const res = await query(`UPDATE feed_products
       SET ${fields.join(', ')}, updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING 
         id, organization_id as "organizationId", category_id as "categoryId",
         code, name, description, base_unit as "baseUnit", pack_size as "packSize",
         pack_unit as "packUnit", default_purchase_price as "defaultPurchasePrice",
         selling_price as "sellingPrice", tax_rate_percent as "taxRatePercent",
         hsn_code as "hsnCode", status, minimum_stock_level as "minimumStockLevel",
         weighted_avg_cost as "weightedAvgCost", created_at as "createdAt", updated_at as "updatedAt"`, values);
        if (res.rows.length === 0) {
            throw new NotFoundError(`Feed product '${productId}' not found`);
        }
        return res.rows[0];
    }
    static async getProductById(orgId, productId) {
        const res = await query(`SELECT 
         id, organization_id as "organizationId", category_id as "categoryId",
         code, name, description, base_unit as "baseUnit", pack_size as "packSize",
         pack_unit as "packUnit", default_purchase_price as "defaultPurchasePrice",
         selling_price as "sellingPrice", tax_rate_percent as "taxRatePercent",
         hsn_code as "hsnCode", status, minimum_stock_level as "minimumStockLevel",
         weighted_avg_cost as "weightedAvgCost", created_at as "createdAt", updated_at as "updatedAt"
       FROM feed_products
       WHERE organization_id = $1 AND id = $2`, [orgId, productId]);
        if (res.rows.length === 0) {
            throw new NotFoundError(`Feed product '${productId}' not found`);
        }
        return res.rows[0];
    }
    static async getProducts(orgId, filters) {
        let sql = `
      SELECT 
        p.id, p.organization_id as "organizationId", p.category_id as "categoryId",
        p.code, p.name, p.description, p.base_unit as "baseUnit", p.pack_size as "packSize",
        p.pack_unit as "packUnit", p.default_purchase_price as "defaultPurchasePrice",
        p.selling_price as "sellingPrice", p.tax_rate_percent as "taxRatePercent",
        p.hsn_code as "hsnCode", p.status, p.minimum_stock_level as "minimumStockLevel",
        p.weighted_avg_cost as "weightedAvgCost", p.created_at as "createdAt", p.updated_at as "updatedAt",
        c.name as "categoryName"
      FROM feed_products p
      JOIN feed_categories c ON p.category_id = c.id
      WHERE p.organization_id = $1
    `;
        const params = [orgId];
        let idx = 2;
        if (filters?.categoryId) {
            sql += ` AND p.category_id = $${idx++}`;
            params.push(filters.categoryId);
        }
        if (filters?.status) {
            sql += ` AND p.status = $${idx++}`;
            params.push(filters.status);
        }
        if (filters?.search) {
            sql += ` AND (p.name ILIKE $${idx} OR p.code ILIKE $${idx})`;
            params.push(`%${filters.search}%`);
            idx++;
        }
        sql += ` ORDER BY p.name ASC`;
        const res = await query(sql, params);
        return res.rows;
    }
    // ==========================================================================
    // Suppliers
    // ==========================================================================
    static async createSupplier(orgId, data) {
        try {
            const res = await query(`INSERT INTO feed_suppliers (
           organization_id, supplier_code, name, contact_person,
           phone_number, email, address, gst_number, pan_number, status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING 
           id, organization_id as "organizationId", supplier_code as "supplierCode",
           name, contact_person as "contactPerson", phone_number as "phoneNumber",
           email, address, gst_number as "gstNumber", pan_number as "panNumber",
           outstanding_balance as "outstandingBalance", status,
           created_at as "createdAt", updated_at as "updatedAt"`, [
                orgId,
                data.supplierCode.toUpperCase(),
                data.name,
                data.contactPerson || null,
                data.phoneNumber,
                data.email || null,
                data.address || null,
                data.gstNumber || null,
                data.panNumber || null,
                data.status || 'ACTIVE',
            ]);
            return res.rows[0];
        }
        catch (err) {
            if (err.code === '23505') {
                throw new ConflictError(`Supplier with code '${data.supplierCode}' already exists in this organization`);
            }
            throw err;
        }
    }
    static async getSuppliers(orgId) {
        const res = await query(`SELECT 
         id, organization_id as "organizationId", supplier_code as "supplierCode",
         name, contact_person as "contactPerson", phone_number as "phoneNumber",
         email, address, gst_number as "gstNumber", pan_number as "panNumber",
         outstanding_balance as "outstandingBalance", status,
         created_at as "createdAt", updated_at as "updatedAt"
       FROM feed_suppliers
       WHERE organization_id = $1
       ORDER BY name ASC`, [orgId]);
        return res.rows;
    }
    // ==========================================================================
    // Purchases & Receiving
    // ==========================================================================
    static async createPurchase(orgId, userId, data) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // Check idempotency
            const existing = await client.query(`SELECT id, status, total_amount as "totalAmount" FROM feed_purchases WHERE idempotency_key = $1`, [data.idempotencyKey]);
            if (existing.rows.length > 0) {
                await client.query('ROLLBACK');
                return this.getPurchaseById(orgId, existing.rows[0].id);
            }
            // Calculate totals and convert units
            let subtotal = 0;
            let totalTax = 0;
            const computedItems = [];
            for (const item of data.items) {
                const prodRes = await client.query(`SELECT id, base_unit as "baseUnit", pack_size as "packSize", pack_unit as "packUnit"
           FROM feed_products
           WHERE id = $1 AND organization_id = $2`, [item.productId, orgId]);
                if (prodRes.rows.length === 0) {
                    throw new NotFoundError(`Product '${item.productId}' not found`);
                }
                const product = prodRes.rows[0];
                let baseQuantity = item.quantity;
                if (item.unit === product.packUnit) {
                    baseQuantity = item.quantity * Number(product.packSize);
                }
                else if (item.unit !== product.baseUnit) {
                    throw new BadRequestError(`Invalid unit '${item.unit}' for product. Expected '${product.baseUnit}' or '${product.packUnit}'`);
                }
                const itemSubtotal = Math.round(item.quantity * item.unitCost * 100) / 100;
                const taxRate = item.taxRatePercent || 0;
                const itemTax = Math.round(itemSubtotal * (taxRate / 100) * 100) / 100;
                const itemTotal = itemSubtotal + itemTax;
                subtotal += itemSubtotal;
                totalTax += itemTax;
                computedItems.push({
                    ...item,
                    baseQuantity,
                    taxRatePercent: taxRate,
                    taxAmount: itemTax,
                    totalCost: itemTotal,
                });
            }
            const totalAmount = Math.round((subtotal + totalTax) * 100) / 100;
            // Insert Purchase Header
            const purchaseRes = await client.query(`INSERT INTO feed_purchases (
           organization_id, center_id, supplier_id, purchase_order_number,
           supplier_invoice_number, purchase_date, status, subtotal,
           tax_amount, total_amount, idempotency_key, created_by, notes
         ) VALUES ($1, $2, $3, $4, $5, $6, 'ORDERED', $7, $8, $9, $10, $11, $12)
         RETURNING id`, [
                orgId,
                data.centerId,
                data.supplierId,
                data.purchaseOrderNumber || null,
                data.supplierInvoiceNumber,
                data.purchaseDate,
                subtotal,
                totalTax,
                totalAmount,
                data.idempotencyKey,
                userId,
                data.notes || null,
            ]);
            const purchaseId = purchaseRes.rows[0].id;
            // Insert Purchase Items
            for (const item of computedItems) {
                await client.query(`INSERT INTO feed_purchase_items (
             purchase_id, product_id, quantity, unit, base_quantity,
             unit_cost, tax_rate_percent, tax_amount, total_cost,
             batch_number, expiry_date
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`, [
                    purchaseId,
                    item.productId,
                    item.quantity,
                    item.unit,
                    item.baseQuantity,
                    item.unitCost,
                    item.taxRatePercent,
                    item.taxAmount,
                    item.totalCost,
                    item.batchNumber || null,
                    item.expiryDate || null,
                ]);
            }
            await client.query('COMMIT');
            return this.getPurchaseById(orgId, purchaseId);
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    static async getPurchaseById(orgId, purchaseId) {
        const res = await query(`SELECT 
         p.id, p.organization_id as "organizationId", p.center_id as "centerId",
         p.supplier_id as "supplierId", p.purchase_order_number as "purchaseOrderNumber",
         p.supplier_invoice_number as "supplierInvoiceNumber", p.purchase_date as "purchaseDate",
         p.status, p.subtotal, p.tax_amount as "taxAmount", p.total_amount as "totalAmount",
         p.idempotency_key as "idempotencyKey", p.created_by as "createdBy",
         p.received_by as "receivedBy", p.received_at as "receivedAt",
         p.notes, p.created_at as "createdAt", p.updated_at as "updatedAt",
         s.name as "supplierName", s.supplier_code as "supplierCode"
       FROM feed_purchases p
       JOIN feed_suppliers s ON p.supplier_id = s.id
       WHERE p.organization_id = $1 AND p.id = $2`, [orgId, purchaseId]);
        if (res.rows.length === 0) {
            throw new NotFoundError(`Purchase '${purchaseId}' not found`);
        }
        const itemsRes = await query(`SELECT 
         i.id, i.purchase_id as "purchaseId", i.product_id as "productId",
         i.quantity, i.unit, i.base_quantity as "baseQuantity",
         i.unit_cost as "unitCost", i.tax_rate_percent as "taxRatePercent",
         i.tax_amount as "taxAmount", i.total_cost as "totalCost",
         i.batch_number as "batchNumber", i.expiry_date as "expiryDate",
         pr.name as "productName", pr.code as "productCode"
       FROM feed_purchase_items i
       JOIN feed_products pr ON i.product_id = pr.id
       WHERE i.purchase_id = $1`, [purchaseId]);
        return {
            ...res.rows[0],
            items: itemsRes.rows,
        };
    }
    static async receivePurchase(purchaseId, receivedBy, idempotencyKey) {
        const res = await query(`SELECT public.receive_feed_purchase($1, $2, $3) as result`, [purchaseId, receivedBy, idempotencyKey]);
        return res.rows[0].result;
    }
    // ==========================================================================
    // Inventory & Movements
    // ==========================================================================
    static async getCenterInventory(orgId, centerId, productId) {
        let sql = `
      SELECT 
        inv.id, inv.organization_id as "organizationId", inv.center_id as "centerId",
        inv.product_id as "productId", inv.current_stock as "currentStock",
        inv.reserved_stock as "reservedStock", inv.reorder_threshold as "reorderThreshold",
        inv.last_movement_at as "lastMovementAt", inv.updated_at as "updatedAt",
        p.code as "productCode", p.name as "productName", p.base_unit as "baseUnit",
        p.selling_price as "sellingPrice", p.weighted_avg_cost as "weightedAvgCost",
        p.minimum_stock_level as "minimumStockLevel",
        c.name as "centerName"
      FROM center_product_inventory inv
      JOIN feed_products p ON inv.product_id = p.id
      JOIN dairy_centers c ON inv.center_id = c.id
      WHERE inv.organization_id = $1
    `;
        const params = [orgId];
        let idx = 2;
        if (centerId) {
            sql += ` AND inv.center_id = $${idx++}`;
            params.push(centerId);
        }
        if (productId) {
            sql += ` AND inv.product_id = $${idx++}`;
            params.push(productId);
        }
        sql += ` ORDER BY c.name ASC, p.name ASC`;
        const res = await query(sql, params);
        return res.rows;
    }
    static async getStockMovements(orgId, filters) {
        let sql = `
      SELECT 
        m.id, m.organization_id as "organizationId", m.center_id as "centerId",
        m.product_id as "productId", m.movement_type as "movementType",
        m.direction, m.quantity, m.quantity_delta as "quantityDelta",
        m.base_unit as "baseUnit", m.balance_after as "balanceAfter",
        m.unit_cost as "unitCost", m.reference_transaction_type as "referenceTransactionType",
        m.reference_id as "referenceId", m.batch_number as "batchNumber",
        m.actor_id as "actorId", m.approved_by as "approvedBy",
        m.idempotency_key as "idempotencyKey", m.movement_timestamp as "movementTimestamp",
        m.notes, p.name as "productName", p.code as "productCode",
        c.name as "centerName", u.full_name as "actorName"
      FROM stock_movements m
      JOIN feed_products p ON m.product_id = p.id
      JOIN dairy_centers c ON m.center_id = c.id
      JOIN users u ON m.actor_id = u.id
      WHERE m.organization_id = $1
    `;
        const params = [orgId];
        let idx = 2;
        if (filters?.centerId) {
            sql += ` AND m.center_id = $${idx++}`;
            params.push(filters.centerId);
        }
        if (filters?.productId) {
            sql += ` AND m.product_id = $${idx++}`;
            params.push(filters.productId);
        }
        if (filters?.movementType) {
            sql += ` AND m.movement_type = $${idx++}`;
            params.push(filters.movementType);
        }
        sql += ` ORDER BY m.movement_timestamp DESC LIMIT $${idx++} OFFSET $${idx++}`;
        params.push(filters?.limit || 50, filters?.offset || 0);
        const res = await query(sql, params);
        return res.rows;
    }
    static async transferStock(orgId, sourceCenterId, destinationCenterId, productId, quantity, unit, initiatedBy, approvedBy, idempotencyKey, notes) {
        const res = await query(`SELECT public.process_inventory_transfer($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) as result`, [
            orgId,
            sourceCenterId,
            destinationCenterId,
            productId,
            quantity,
            unit,
            initiatedBy,
            approvedBy,
            idempotencyKey,
            notes || null,
        ]);
        return res.rows[0].result;
    }
    static async adjustStock(orgId, centerId, productId, adjustmentType, quantity, direction, reason, approvedBy, idempotencyKey) {
        const res = await query(`SELECT public.process_inventory_adjustment($1, $2, $3, $4, $5, $6, $7, $8, $9) as result`, [
            orgId,
            centerId,
            productId,
            adjustmentType,
            quantity,
            direction,
            reason,
            approvedBy,
            idempotencyKey,
        ]);
        return res.rows[0].result;
    }
    // ==========================================================================
    // Customer Sales & Returns
    // ==========================================================================
    static async createSale(orgId, centerId, customerId, operatorId, paymentMode, items, discountAmount, discountApprovedBy, idempotencyKey, clientSaleUuid) {
        const res = await query(`SELECT public.process_customer_feed_sale($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) as result`, [
            orgId,
            centerId,
            customerId,
            operatorId,
            paymentMode,
            JSON.stringify(items),
            discountAmount,
            discountApprovedBy,
            idempotencyKey,
            clientSaleUuid || null,
        ]);
        return res.rows[0].result;
    }
    static async getSaleById(orgId, saleId) {
        const res = await query(`SELECT 
         s.id, s.organization_id as "organizationId", s.center_id as "centerId",
         s.customer_id as "customerId", s.invoice_number as "invoiceNumber",
         s.receipt_number as "receiptNumber", s.sale_date as "saleDate",
         s.subtotal, s.discount_amount as "discountAmount", s.tax_amount as "taxAmount",
         s.total_amount as "totalAmount", s.payment_mode as "paymentMode",
         s.status, s.discount_approved_by as "discountApprovedBy",
         s.idempotency_key as "idempotencyKey", s.client_sale_uuid as "clientSaleUuid",
         s.ledger_transaction_id as "ledgerTransactionId", s.sync_status as "syncStatus",
         s.created_by as "createdBy", s.created_at as "createdAt", s.updated_at as "updatedAt",
         c.full_name as "customerName", c.farmer_code as "farmerCode",
         dc.name as "centerName"
       FROM feed_sales s
       JOIN customers c ON s.customer_id = c.id
       JOIN dairy_centers dc ON s.center_id = dc.id
       WHERE s.organization_id = $1 AND s.id = $2`, [orgId, saleId]);
        if (res.rows.length === 0) {
            throw new NotFoundError(`Feed sale '${saleId}' not found`);
        }
        const itemsRes = await query(`SELECT 
         i.id, i.sale_id as "saleId", i.product_id as "productId",
         i.quantity, i.unit, i.base_quantity as "baseQuantity",
         i.unit_price as "unitPrice", i.tax_rate_percent as "taxRatePercent",
         i.tax_amount as "taxAmount", i.discount_amount as "discountAmount",
         i.total_amount as "totalAmount", p.name as "productName", p.code as "productCode"
       FROM feed_sale_items i
       JOIN feed_products p ON i.product_id = p.id
       WHERE i.sale_id = $1`, [saleId]);
        return {
            ...res.rows[0],
            items: itemsRes.rows,
        };
    }
    static async getSales(orgId, filters) {
        let sql = `
      SELECT 
        s.id, s.organization_id as "organizationId", s.center_id as "centerId",
        s.customer_id as "customerId", s.invoice_number as "invoiceNumber",
        s.receipt_number as "receiptNumber", s.sale_date as "saleDate",
        s.subtotal, s.discount_amount as "discountAmount", s.tax_amount as "taxAmount",
        s.total_amount as "totalAmount", s.payment_mode as "paymentMode",
        s.status, s.discount_approved_by as "discountApprovedBy",
        s.idempotency_key as "idempotencyKey", s.client_sale_uuid as "clientSaleUuid",
        s.ledger_transaction_id as "ledgerTransactionId", s.sync_status as "syncStatus",
        s.created_by as "createdBy", s.created_at as "createdAt", s.updated_at as "updatedAt",
        c.full_name as "customerName", c.farmer_code as "farmerCode",
        dc.name as "centerName"
      FROM feed_sales s
      JOIN customers c ON s.customer_id = c.id
      JOIN dairy_centers dc ON s.center_id = dc.id
      WHERE s.organization_id = $1
    `;
        const params = [orgId];
        let idx = 2;
        if (filters?.centerId) {
            sql += ` AND s.center_id = $${idx++}`;
            params.push(filters.centerId);
        }
        if (filters?.customerId) {
            sql += ` AND s.customer_id = $${idx++}`;
            params.push(filters.customerId);
        }
        if (filters?.status) {
            sql += ` AND s.status = $${idx++}`;
            params.push(filters.status);
        }
        sql += ` ORDER BY s.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
        params.push(filters?.limit || 50, filters?.offset || 0);
        const res = await query(sql, params);
        return res.rows;
    }
    static async processReturn(orgId, saleId, saleItemId, returnQuantity, stockCondition, reason, approvedBy, idempotencyKey) {
        const res = await query(`SELECT public.process_feed_return($1, $2, $3, $4, $5, $6, $7, $8) as result`, [
            orgId,
            saleId,
            saleItemId,
            returnQuantity,
            stockCondition,
            reason,
            approvedBy,
            idempotencyKey,
        ]);
        return res.rows[0].result;
    }
    // ==========================================================================
    // Inventory Reports
    // ==========================================================================
    static async getLowStockReport(orgId, centerId) {
        let sql = `
      SELECT 
        inv.center_id as "centerId", c.name as "centerName",
        inv.product_id as "productId", p.name as "productName", p.code as "productCode",
        p.base_unit as "baseUnit", inv.current_stock as "currentStock",
        p.minimum_stock_level as "minimumStockLevel",
        (p.minimum_stock_level - inv.current_stock) as "deficit"
      FROM center_product_inventory inv
      JOIN feed_products p ON inv.product_id = p.id
      JOIN dairy_centers c ON inv.center_id = c.id
      WHERE inv.organization_id = $1 AND inv.current_stock <= p.minimum_stock_level
    `;
        const params = [orgId];
        if (centerId) {
            sql += ` AND inv.center_id = $2`;
            params.push(centerId);
        }
        sql += ` ORDER BY (p.minimum_stock_level - inv.current_stock) DESC`;
        const res = await query(sql, params);
        return res.rows;
    }
    static async getStockValuationReport(orgId, centerId) {
        let sql = `
      SELECT 
        inv.center_id as "centerId", c.name as "centerName",
        inv.product_id as "productId", p.name as "productName", p.code as "productCode",
        p.base_unit as "baseUnit", inv.current_stock as "currentStock",
        p.weighted_avg_cost as "weightedAvgCost",
        ROUND(inv.current_stock * p.weighted_avg_cost, 2) as "valuationAmount"
      FROM center_product_inventory inv
      JOIN feed_products p ON inv.product_id = p.id
      JOIN dairy_centers c ON inv.center_id = c.id
      WHERE inv.organization_id = $1
    `;
        const params = [orgId];
        if (centerId) {
            sql += ` AND inv.center_id = $2`;
            params.push(centerId);
        }
        sql += ` ORDER BY c.name, p.name`;
        const res = await query(sql, params);
        const totalValuation = res.rows.reduce((sum, r) => sum + Number(r.valuationAmount || 0), 0);
        return {
            costingMethod: 'WEIGHTED_AVERAGE_COST',
            totalValuation: Math.round(totalValuation * 100) / 100,
            currency: 'INR',
            items: res.rows,
        };
    }
    static async getDailySalesPurchasesReport(orgId, startDate, endDate, centerId) {
        let salesSql = `
      SELECT 
        DATE(s.sale_date) as "date",
        COUNT(s.id) as "saleCount",
        SUM(s.total_amount) as "totalSalesAmount"
      FROM feed_sales s
      WHERE s.organization_id = $1 AND s.sale_date >= $2 AND s.sale_date <= $3
    `;
        const salesParams = [orgId, startDate, endDate];
        if (centerId) {
            salesSql += ` AND s.center_id = $4`;
            salesParams.push(centerId);
        }
        salesSql += ` GROUP BY DATE(s.sale_date) ORDER BY DATE(s.sale_date) ASC`;
        const salesRes = await query(salesSql, salesParams);
        let purchaseSql = `
      SELECT 
        p.purchase_date as "date",
        COUNT(p.id) as "purchaseCount",
        SUM(p.total_amount) as "totalPurchaseAmount"
      FROM feed_purchases p
      WHERE p.organization_id = $1 AND p.purchase_date >= $2 AND p.purchase_date <= $3 AND p.status = 'RECEIVED'
    `;
        const purchaseParams = [orgId, startDate, endDate];
        if (centerId) {
            purchaseSql += ` AND p.center_id = $4`;
            purchaseParams.push(centerId);
        }
        purchaseSql += ` GROUP BY p.purchase_date ORDER BY p.purchase_date ASC`;
        const purchaseRes = await query(purchaseSql, purchaseParams);
        return {
            dailySales: salesRes.rows,
            dailyPurchases: purchaseRes.rows,
        };
    }
}
//# sourceMappingURL=feed.repository.js.map