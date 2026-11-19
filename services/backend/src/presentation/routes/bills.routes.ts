import { Router, Request, Response, NextFunction } from 'express';
import { GetCustomerBillsUseCase } from '../../application/use-cases/index.js';
import { db } from '../../infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../../infrastructure/database/TenantDatabaseManager.js';
import { optionalAuthenticate } from '../middleware/authenticate.js';

const router = Router();
const getBillsUseCase = new GetCustomerBillsUseCase();

const getTenantDb = async (organizationId?: string) => {
  if (organizationId) {
    try {
      return await tenantDbManager.getTenantDb(organizationId);
    } catch {
      return db;
    }
  }
  return db;
};

router.get('/', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    let customerId = req.query['customerId'] as string | undefined;

    if (req.user?.role === 'FARMER_CUSTOMER') {
      if (customerId && customerId !== req.user.userId) {
        res.status(403).json({
          success: false,
          error: 'Cross-customer query blocked: customer can only view their own bills.',
        });
        return;
      }
      customerId = req.user.userId;
    }
    const organizationId = req.user?.organizationId || (req.headers['x-dairy-tenant-id'] as string) || (req.headers['x-dairy-id'] as string) || (req.query['organizationId'] as string);

    if (customerId) {
      const limit = req.query['limit'] ? Number(req.query['limit']) : 12;
      const data = await getBillsUseCase.execute(customerId, limit, organizationId);
      res.json({ success: true, count: data.length, data });
      return;
    }

    if (!organizationId) {
      res.status(400).json({ success: false, error: 'Dairy context (organizationId) or customerId is required' });
      return;
    }

    const query = `
      SELECT 
        mb.id,
        mb.bill_number,
        mb.bill_status,
        mb.customer_id,
        mb.total_milk_weight,
        mb.gross_milk_amount,
        mb.feed_purchases_debit,
        mb.net_payable_amount,
        mb.created_at,
        c.farmer_code,
        c.full_name
      FROM monthly_bills mb
      JOIN customers c ON c.id = mb.customer_id
      WHERE mb.organization_id = $1
      ORDER BY mb.created_at DESC
      LIMIT 100;
    `;
    const client = await getTenantDb(organizationId);
    let result;
    try {
      result = await client.query(query, [organizationId]);
    } catch {
      result = await db.query(query, [organizationId]);
    }
    const bills = result.rows.map((b: any) => ({
      id: b.id,
      billNumber: b.bill_number,
      status: b.bill_status,
      customerId: b.customer_id,
      customerCode: b.farmer_code || 'C-100',
      customerName: b.full_name || 'Farmer',
      totalMilkWeight: Number(b.total_milk_weight),
      grossMilkAmount: Number(b.gross_milk_amount),
      feedPurchasesDebit: Number(b.feed_purchases_debit),
      netPayableAmount: Number(b.net_payable_amount),
      generatedAt: b.created_at ? new Date(b.created_at).toISOString() : new Date().toISOString(),
    }));
    res.json({ success: true, count: bills.length, data: bills });
  } catch (err) {
    next(err);
  }
});

router.post('/generate', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { customerId, periodStart, periodEnd, cycleName: _cycleName, operatorName: _operatorName } = req.body;
    const organizationId = req.user?.organizationId || (req.headers['x-dairy-id'] as string);

    if (!customerId || !organizationId) {
      res.status(400).json({ success: false, error: 'customerId and organizationId are required' });
      return;
    }

    // Resolve customer and center
    const custRes = await db.query(`SELECT primary_center_id, farmer_code, full_name FROM customers WHERE id = $1`, [customerId]);
    if (custRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Customer not found' });
      return;
    }
    const customer = custRes.rows[0];
    const centerId = customer.primary_center_id || '00000000-0000-0000-0000-000000000002';

    // Sum collections in date range
    const collRes = await db.query(
      `SELECT COALESCE(SUM(net_weight), 0) AS total_weight, COALESCE(SUM(total_amount), 0) AS total_amount
       FROM milk_collections
       WHERE customer_id = $1 AND business_date BETWEEN $2 AND $3;`,
      [customerId, periodStart || '2026-01-01', periodEnd || '2026-12-31']
    );
    const totalWeight = Number(collRes.rows[0]?.total_weight || 0);
    const totalGross = Number(collRes.rows[0]?.total_amount || 0);

    const billNumber = `BILL-${Date.now().toString().slice(-6)}`;
    const billRes = await db.query(
      `INSERT INTO monthly_bills (
        billing_period_id, customer_id, center_id, organization_id, bill_number, bill_status,
        total_milk_weight, gross_milk_amount, net_payable_amount
       ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, 'GENERATED',
        $5, $6, $6
       ) RETURNING id;`,
      [customerId, centerId, organizationId, billNumber, totalWeight, totalGross]
    );

    res.status(201).json({
      success: true,
      message: `Bill ${billNumber} generated for ${customer.full_name}`,
      data: {
        id: billRes.rows[0].id,
        billNumber,
        customerId,
        totalMilkWeight: totalWeight,
        netPayableAmount: totalGross,
      },
    });
  } catch (err) {
    next(err);
  }
});

export const billsRoutes = router;
