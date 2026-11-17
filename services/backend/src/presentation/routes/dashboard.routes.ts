import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../../infrastructure/database/PostgresPool.js';
import { optionalAuthenticate } from '../middleware/authenticate.js';

const router = Router();

router.get('/metrics', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId || (req.headers['x-dairy-id'] as string) || (req.query['organizationId'] as string);
    if (!organizationId) {
      res.status(400).json({ success: false, error: 'Dairy context (organizationId) is required' });
      return;
    }

    // 1. Customer metrics
    const custRes = await db.query(
      `SELECT 
        COUNT(*) AS total_customers,
        COUNT(CASE WHEN status = 'ACTIVE' AND is_deleted = FALSE THEN 1 END) AS active_customers,
        COUNT(CASE WHEN registration_status = 'PENDING_APPROVAL' THEN 1 END) AS pending_approvals
       FROM customers
       WHERE organization_id = $1;`,
      [organizationId]
    );
    const cStats = custRes.rows[0] || {};

    // 2. Today's collections metrics
    const todayRes = await db.query(
      `SELECT 
        COALESCE(SUM(mc.net_weight), 0) AS total_liters,
        COALESCE(SUM(CASE WHEN mc.milk_category = 'COW' THEN mc.net_weight ELSE 0 END), 0) AS cow_liters,
        COALESCE(SUM(CASE WHEN mc.milk_category = 'BUFFALO' THEN mc.net_weight ELSE 0 END), 0) AS buffalo_liters,
        COUNT(*) AS transaction_count,
        COALESCE(SUM(mc.total_amount), 0) AS total_amount
       FROM milk_collections mc
       JOIN customers c ON c.id = mc.customer_id
       WHERE c.organization_id = $1 AND mc.business_date = CURRENT_DATE;`,
      [organizationId]
    );
    const mStats = todayRes.rows[0] || {};

    // 3. Feed stock alerts
    let feedAlertCount = 0;
    try {
      const feedRes = await db.query(
        `SELECT COUNT(*) AS count FROM feed_products WHERE organization_id = $1 AND status = 'ACTIVE';`,
        [organizationId]
      );
      feedAlertCount = Number(feedRes.rows[0]?.count || 0);
    } catch {
      // Table may be empty
    }

    res.json({
      success: true,
      data: {
        todayTotalMilkQtyKg: Number(mStats.total_liters) || 0,
        todayCowMilkQtyKg: Number(mStats.cow_liters) || 0,
        todayBuffaloMilkQtyKg: Number(mStats.buffalo_liters) || 0,
        todayTotalCollections: Number(mStats.transaction_count) || 0,
        todayTotalMilkValue: Number(mStats.total_amount) || 0,
        pendingCustomerRegistrations: Number(cStats.pending_approvals) || 0,
        activeCustomers: Number(cStats.active_customers) || 0,
        totalCustomers: Number(cStats.total_customers) || 0,
        deviceStatus: {
          active: 1,
          inactive: 0,
          blocked: 0,
        },
        totalCustomerPayables: Number(mStats.total_amount) || 0,
        feedStockAlerts: feedAlertCount,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/summary', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  // Alias for /metrics
  return (router as any).handle({ ...req, url: '/metrics' }, res, next);
});

export const dashboardRoutes = router;
