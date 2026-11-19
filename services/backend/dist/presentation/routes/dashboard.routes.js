import { Router } from 'express';
import { db } from '../../infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../../infrastructure/database/TenantDatabaseManager.js';
import { optionalAuthenticate } from '../middleware/authenticate.js';
const router = Router();
const getDashboardData = async (req, res, next) => {
    try {
        const tokenOrgId = req.user?.organizationId;
        const queryOrgId = req.query['organizationId'];
        const headerOrgId = req.headers['x-dairy-tenant-id'] || req.headers['x-dairy-id'];
        if (tokenOrgId && (queryOrgId || headerOrgId)) {
            const requestedOrg = queryOrgId || headerOrgId;
            if (requestedOrg !== tokenOrgId && req.user?.role !== 'SUPER_ADMIN') {
                res.status(403).json({
                    success: false,
                    error: 'Cross-dairy dashboard access blocked: Token tenant context does not match requested tenant.',
                });
                return;
            }
        }
        const organizationId = tokenOrgId || headerOrgId || queryOrgId;
        if (!organizationId) {
            res.status(400).json({ success: false, error: 'Dairy context (organizationId) is required' });
            return;
        }
        let tenantDb;
        try {
            tenantDb = await tenantDbManager.getTenantDb(organizationId);
        }
        catch {
            tenantDb = db;
        }
        // 0. Dairy profile from central DB
        const controlDb = tenantDbManager.getControlPlaneDb();
        let dairyName = req.user?.dairyName || 'Dairy Cooperative';
        let dairyCode = req.user?.dairyCode || 'DAIRY';
        try {
            const orgRes = await controlDb.query(`SELECT name, code FROM organizations WHERE id = $1 LIMIT 1;`, [organizationId]);
            if (orgRes.rows.length > 0) {
                if (orgRes.rows[0].name)
                    dairyName = orgRes.rows[0].name;
                if (orgRes.rows[0].code)
                    dairyCode = orgRes.rows[0].code;
            }
        }
        catch {
            // ignore
        }
        // 1. Customer metrics from tenant DB
        let cStats = {};
        try {
            const custRes = await tenantDb.query(`SELECT 
          COUNT(*) AS total_customers,
          COUNT(CASE WHEN status = 'ACTIVE' AND is_deleted = FALSE THEN 1 END) AS active_customers,
          COUNT(CASE WHEN registration_status = 'PENDING_APPROVAL' THEN 1 END) AS pending_approvals
         FROM customers
         WHERE organization_id = $1;`, [organizationId]);
            cStats = custRes.rows[0] || {};
        }
        catch {
            // Fallback
        }
        // 2. Today's collections metrics from tenant DB
        let mStats = {};
        try {
            const todayRes = await tenantDb.query(`SELECT 
          COALESCE(SUM(mc.net_weight), 0) AS total_liters,
          COALESCE(SUM(CASE WHEN mc.milk_category = 'COW' THEN mc.net_weight ELSE 0 END), 0) AS cow_liters,
          COALESCE(SUM(CASE WHEN mc.milk_category = 'BUFFALO' THEN mc.net_weight ELSE 0 END), 0) AS buffalo_liters,
          COUNT(*) AS transaction_count,
          COALESCE(SUM(mc.total_amount), 0) AS total_amount
         FROM milk_collections mc
         JOIN customers c ON c.id = mc.customer_id
         WHERE c.organization_id = $1 AND mc.business_date = CURRENT_DATE;`, [organizationId]);
            mStats = todayRes.rows[0] || {};
        }
        catch {
            // Fallback
        }
        // 3. Feed stock alerts from tenant DB
        let feedProductCount = 0;
        let feedAlertCount = 0;
        try {
            const feedRes = await tenantDb.query(`SELECT COUNT(*) AS count, COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END) AS active_count FROM feed_products WHERE organization_id = $1;`, [organizationId]);
            feedProductCount = Number(feedRes.rows[0]?.count || 0);
            feedAlertCount = Number(feedRes.rows[0]?.active_count || 0);
        }
        catch {
            // Table may be empty
        }
        const totalLiters = Number(mStats.total_liters) || 0;
        const cowLiters = Number(mStats.cow_liters) || 0;
        const buffaloLiters = Number(mStats.buffalo_liters) || 0;
        const txnCount = Number(mStats.transaction_count) || 0;
        const totalAmount = Number(mStats.total_amount) || 0;
        const pendingApprovals = Number(cStats.pending_approvals) || 0;
        const activeCustomers = Number(cStats.active_customers) || 0;
        const totalCustomers = Number(cStats.total_customers) || 0;
        res.json({
            success: true,
            data: {
                // Structured contract for apps/dfarm-dairy-admin
                dairyProfile: {
                    name: dairyName,
                    code: dairyCode,
                    subscription: 'ENTERPRISE',
                },
                todayCollection: {
                    totalLiters,
                    cowLiters,
                    buffaloLiters,
                    transactionCount: txnCount,
                    totalAmount,
                },
                customers: {
                    pendingApprovals,
                    activeCustomers,
                    totalCustomers,
                },
                systemStatus: {
                    connectedDevicesCount: 1,
                    offlineDevicesCount: 0,
                },
                finance: {
                    pendingCustomerBalances: totalAmount,
                },
                inventory: {
                    totalProducts: feedProductCount,
                    lowStockItemCount: feedAlertCount,
                },
                // Flattened legacy aliases for backward compatibility
                activeFarmersCount: activeCustomers,
                activeCustomersCount: activeCustomers,
                todayTotalMilkQtyKg: totalLiters,
                todayCowMilkQtyKg: cowLiters,
                todayBuffaloMilkQtyKg: buffaloLiters,
                todayTotalCollections: txnCount,
                todayTotalMilkValue: totalAmount,
                pendingCustomerRegistrations: pendingApprovals,
                deviceStatus: {
                    active: 1,
                    inactive: 0,
                    blocked: 0,
                },
                totalCustomerPayables: totalAmount,
                feedStockAlerts: feedAlertCount,
            },
        });
    }
    catch (err) {
        next(err);
    }
};
router.get('/metrics', optionalAuthenticate, getDashboardData);
router.get('/summary', optionalAuthenticate, getDashboardData);
export const dashboardRoutes = router;
//# sourceMappingURL=dashboard.routes.js.map