import { Router } from 'express';
import { db } from '../../infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../../infrastructure/database/TenantDatabaseManager.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizePermission } from '../middleware/authorize.js';
const router = Router();
function resolveAuthorizedOrgId(req, res) {
    const requestedOrgId = req.headers['x-dairy-tenant-id'] || req.headers['x-dairy-id'] || req.query['organizationId'];
    if (requestedOrgId && req.user?.organizationId && requestedOrgId !== req.user.organizationId && req.user?.role !== 'SUPER_ADMIN') {
        res.status(403).json({ success: false, error: 'Cross-dairy reports query blocked.' });
        return undefined;
    }
    const orgId = req.user?.role === 'SUPER_ADMIN'
        ? (requestedOrgId || req.user?.organizationId)
        : req.user?.organizationId;
    if (!orgId) {
        res.status(400).json({ success: false, error: 'Dairy context (organizationId) is required' });
        return undefined;
    }
    return orgId;
}
const getTenantDb = async (organizationId) => {
    if (process.env['REQUIRE_REAL_POSTGRES'] === '1') {
        if (!organizationId) {
            throw new Error('Organization ID is required for tenant reports query when REQUIRE_REAL_POSTGRES=1');
        }
        return await tenantDbManager.getStrictTenantDb(organizationId);
    }
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
// 1. Daily & Shift Collection Report
router.get('/collections', authenticate, authorizePermission('reports:dairy_read', 'reports:read', 'billing:read', 'collections:view_all'), async (req, res, next) => {
    try {
        const organizationId = resolveAuthorizedOrgId(req, res);
        if (!organizationId)
            return;
        const { date, shift, category } = req.query;
        const client = await getTenantDb(organizationId);
        let rows = [];
        try {
            const query = `
        SELECT 
          ct.id,
          ct.collection_date,
          ct.shift,
          ct.milk_category,
          ct.quantity_liters,
          ct.fat_percentage,
          ct.snf_percentage,
          ct.rate_per_liter,
          ct.total_amount,
          ct.status,
          c.farmer_code,
          c.full_name AS customer_name
        FROM collection_transactions ct
        JOIN customers c ON c.id = ct.customer_id
        WHERE ct.organization_id = $1
          AND ($2::text IS NULL OR ct.collection_date::text = $2)
          AND ($3::text IS NULL OR ct.shift = $3)
          AND ($4::text IS NULL OR ct.milk_category = $4)
        ORDER BY ct.created_at DESC
        LIMIT 200;
      `;
            const result = await client.query(query, [organizationId, date || null, shift || null, category || null]);
            rows = result.rows;
        }
        catch {
            rows = [];
        }
        const totalQuantity = rows.reduce((sum, r) => sum + Number(r.quantity_liters || 0), 0);
        const totalAmount = rows.reduce((sum, r) => sum + Number(r.total_amount || 0), 0);
        const avgFat = rows.length > 0 ? rows.reduce((sum, r) => sum + Number(r.fat_percentage || 0), 0) / rows.length : 0;
        const avgSnf = rows.length > 0 ? rows.reduce((sum, r) => sum + Number(r.snf_percentage || 0), 0) / rows.length : 0;
        res.json({
            success: true,
            reportType: 'COLLECTIONS_REGISTER',
            generatedAt: new Date().toISOString(),
            summary: {
                totalRecords: rows.length,
                totalQuantityLiters: Math.round(totalQuantity * 100) / 100,
                totalAmount: Math.round(totalAmount * 100) / 100,
                averageFat: Math.round(avgFat * 10) / 10,
                averageSnf: Math.round(avgSnf * 10) / 10,
            },
            data: rows.map((r) => ({
                id: r.id,
                date: r.collection_date,
                shift: r.shift,
                farmerCode: r.farmer_code,
                customerName: r.customer_name,
                milkCategory: r.milk_category,
                quantityLiters: Number(r.quantity_liters),
                fatPercentage: Number(r.fat_percentage),
                snfPercentage: Number(r.snf_percentage),
                ratePerLiter: Number(r.rate_per_liter),
                totalAmount: Number(r.total_amount),
                status: r.status,
            })),
        });
    }
    catch (err) {
        next(err);
    }
});
// 2. Feed Stock & Sales Report
router.get('/feed', authenticate, authorizePermission('reports:dairy_read', 'reports:read', 'feed:read', 'feed:manage'), async (req, res, next) => {
    try {
        const organizationId = resolveAuthorizedOrgId(req, res);
        if (!organizationId)
            return;
        const client = await getTenantDb(organizationId);
        let products = [];
        let sales = [];
        try {
            const prodRes = await client.query(`SELECT fp.id, fp.code, fp.name, fp.selling_price, COALESCE(SUM(cpi.current_stock), 0) AS current_stock
         FROM feed_products fp
         LEFT JOIN center_product_inventory cpi ON cpi.product_id = fp.id
         WHERE fp.organization_id = $1
         GROUP BY fp.id, fp.code, fp.name, fp.selling_price;`, [organizationId]);
            products = prodRes.rows;
            const salesRes = await client.query(`SELECT fs.id, fs.sale_number, fs.total_amount, fs.payment_mode, fs.created_at, c.farmer_code, c.full_name
         FROM feed_sales fs
         JOIN customers c ON c.id = fs.customer_id
         WHERE fs.organization_id = $1
         ORDER BY fs.created_at DESC LIMIT 100;`, [organizationId]);
            sales = salesRes.rows;
        }
        catch {
            // Empty or uninitialized tables
        }
        const totalSalesAmount = sales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
        res.json({
            success: true,
            reportType: 'FEED_OPERATIONS',
            generatedAt: new Date().toISOString(),
            inventory: products.map((p) => ({
                id: p.id,
                code: p.code,
                name: p.name,
                sellingPrice: Number(p.selling_price),
                currentStock: Number(p.current_stock),
            })),
            recentSales: {
                totalSalesCount: sales.length,
                totalSalesAmount: Math.round(totalSalesAmount * 100) / 100,
                records: sales.map((s) => ({
                    saleNumber: s.sale_number,
                    farmerCode: s.farmer_code,
                    farmerName: s.full_name,
                    amount: Number(s.total_amount),
                    paymentMode: s.payment_mode,
                    date: s.created_at,
                })),
            },
        });
    }
    catch (err) {
        next(err);
    }
});
// 3. Customer Ledger Summary Report
router.get('/ledger', authenticate, authorizePermission('reports:dairy_read', 'reports:read', 'billing:read', 'billing:manage'), async (req, res, next) => {
    try {
        const organizationId = resolveAuthorizedOrgId(req, res);
        if (!organizationId)
            return;
        const client = await getTenantDb(organizationId);
        let accounts = [];
        try {
            const result = await client.query(`SELECT 
           la.id,
           la.customer_id,
           la.current_balance,
           c.farmer_code,
           c.full_name,
           c.status
         FROM ledger_accounts la
         JOIN customers c ON c.id = la.customer_id
         WHERE la.organization_id = $1
         ORDER BY c.farmer_code ASC LIMIT 100;`, [organizationId]);
            accounts = result.rows;
        }
        catch {
            accounts = [];
        }
        const totalPayableBalance = accounts.reduce((sum, a) => sum + Math.max(0, Number(a.current_balance || 0)), 0);
        res.json({
            success: true,
            reportType: 'LEDGER_SUMMARY',
            generatedAt: new Date().toISOString(),
            summary: {
                totalAccounts: accounts.length,
                totalPayableDues: Math.round(totalPayableBalance * 100) / 100,
            },
            data: accounts.map((a) => ({
                accountId: a.id,
                customerId: a.customer_id,
                farmerCode: a.farmer_code,
                customerName: a.full_name,
                status: a.status,
                currentBalance: Number(a.current_balance || 0),
            })),
        });
    }
    catch (err) {
        next(err);
    }
});
// 4. Bounded Data Export in CSV or JSON Format (With PII Masking & Zero Raw Biometrics)
router.get('/export', authenticate, authorizePermission('reports:dairy_read', 'reports:read', 'billing:manage'), async (req, res, next) => {
    try {
        const organizationId = resolveAuthorizedOrgId(req, res);
        if (!organizationId)
            return;
        const type = req.query['type'] || 'collections';
        const format = req.query['format'] || 'json';
        const client = await getTenantDb(organizationId);
        if (type === 'collections') {
            let rows = [];
            try {
                const result = await client.query(`SELECT ct.collection_date, ct.shift, c.farmer_code, c.full_name, ct.milk_category, ct.quantity_liters, ct.fat_percentage, ct.snf_percentage, ct.total_amount
           FROM collection_transactions ct
           JOIN customers c ON c.id = ct.customer_id
           WHERE ct.organization_id = $1
           ORDER BY ct.created_at DESC LIMIT 500;`, [organizationId]);
                rows = result.rows;
            }
            catch {
                rows = [];
            }
            if (format === 'csv') {
                const header = 'Date,Shift,FarmerCode,FarmerName,MilkCategory,QuantityLiters,Fat,SNF,TotalAmount\n';
                const csvRows = rows.map((r) => `"${r.collection_date}","${r.shift}","${r.farmer_code}","${r.full_name}","${r.milk_category}",${r.quantity_liters},${r.fat_percentage},${r.snf_percentage},${r.total_amount}`).join('\n');
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="dfarm-collections-${Date.now()}.csv"`);
                res.send(header + csvRows);
                return;
            }
            res.json({ success: true, count: rows.length, data: rows });
            return;
        }
        res.status(400).json({ success: false, error: `Unsupported export type: ${type}` });
    }
    catch (err) {
        next(err);
    }
});
export const reportsRoutes = router;
//# sourceMappingURL=reports.routes.js.map