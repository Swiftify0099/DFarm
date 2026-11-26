import { Router, Request, Response, NextFunction } from 'express';
import {
  GetCustomerKhataSummaryUseCase,
  GetCustomerLedgerEntriesUseCase,
} from '../../application/use-cases/index.js';
import { PostgresLedgerRepository } from '../../infrastructure/index.js';
import { db } from '../../infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../../infrastructure/database/TenantDatabaseManager.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizePermission } from '../middleware/authorize.js';

const router = Router();
const ledgerRepo = new PostgresLedgerRepository();
const getKhataSummary = new GetCustomerKhataSummaryUseCase(ledgerRepo);
const getLedgerEntries = new GetCustomerLedgerEntriesUseCase(ledgerRepo);

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

const handleGetBalanceSummary = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    let customerId = (req.params['customerId'] as string) || req.user?.userId;
    if (req.user?.role === 'FARMER_CUSTOMER') {
      const queryId = (req.params['customerId'] as string) || (req.query['customerId'] as string);
      if (queryId && queryId !== req.user.userId) {
        res.status(403).json({
          success: false,
          error: 'Cross-customer query blocked: customer can only view their own ledger summary.',
        });
        return;
      }
    } else {
      customerId = (req.params['customerId'] as string) || (req.query['customerId'] as string) || req.user?.userId;
    }

    if (!customerId) {
      res.status(400).json({ success: false, error: 'customerId is required' });
      return;
    }
    const requestedOrgId =
      (req.headers['x-dairy-tenant-id'] as string) ||
      (req.headers['x-dairy-id'] as string) ||
      (req.headers['x-organization-id'] as string) ||
      (req.query['organizationId'] as string);
    if (requestedOrgId && req.user?.organizationId && requestedOrgId !== req.user.organizationId && req.user?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ success: false, error: 'Cross-dairy ledger access blocked.' });
      return;
    }
    const organizationId = req.user?.role === 'SUPER_ADMIN'
      ? (requestedOrgId || req.user?.organizationId)
      : req.user?.organizationId;
    const data = await getKhataSummary.execute(customerId, organizationId);
    res.json({ success: true, data, balance: data.currentBalance, currentBalance: data.currentBalance });
  } catch (err) {
    next(err);
  }
};

router.get('/accounts/:customerId', authenticate, authorizePermission('passbook:view_own', 'billing:read', 'billing:manage', 'collections:view_all'), handleGetBalanceSummary);
router.get('/summary', authenticate, authorizePermission('passbook:view_own', 'billing:read', 'billing:manage', 'collections:view_all'), handleGetBalanceSummary);
router.get('/balance', authenticate, authorizePermission('passbook:view_own', 'billing:read', 'billing:manage', 'collections:view_all'), handleGetBalanceSummary);

router.get('/entries', authenticate, authorizePermission('passbook:view_own', 'billing:read', 'billing:manage', 'collections:view_all'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    let customerId = req.user?.userId;
    if (req.user?.role === 'FARMER_CUSTOMER') {
      const queryId = req.query['customerId'] as string;
      if (queryId && queryId !== req.user.userId) {
        res.status(403).json({
          success: false,
          error: 'Cross-customer query blocked: customer can only view their own ledger entries.',
        });
        return;
      }
    } else {
      customerId = (req.query['customerId'] as string) || undefined;
    }

    const requestedOrgId =
      (req.headers['x-dairy-tenant-id'] as string) ||
      (req.headers['x-dairy-id'] as string) ||
      (req.headers['x-organization-id'] as string) ||
      (req.query['organizationId'] as string);
    if (requestedOrgId && req.user?.organizationId && requestedOrgId !== req.user.organizationId && req.user?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ success: false, error: 'Cross-dairy ledger entries query blocked.' });
      return;
    }
    const organizationId = req.user?.role === 'SUPER_ADMIN'
      ? (requestedOrgId || req.user?.organizationId)
      : req.user?.organizationId;

    if (customerId) {
      const limit = req.query['limit'] ? Number(req.query['limit']) : 50;
      const offset = req.query['offset'] ? Number(req.query['offset']) : 0;
      const data = await getLedgerEntries.execute(customerId, limit, offset, organizationId);
      res.json({ success: true, count: data.length, data });
      return;
    }

    if (!organizationId) {
      res.status(400).json({ success: false, error: 'Dairy context (organizationId) or customerId is required' });
      return;
    }

    const query = `
      SELECT 
        lt.id,
        lt.customer_id,
        lt.direction AS entry_type,
        lt.transaction_type,
        lt.amount,
        lt.balance_after,
        lt.reference_entity AS source_module,
        lt.description,
        lt.created_at,
        c.farmer_code,
        c.full_name
      FROM ledger_transactions lt
      JOIN customers c ON c.id = lt.customer_id
      WHERE c.organization_id = $1
      ORDER BY lt.created_at DESC
      LIMIT 100;
    `;
    const client = await getTenantDb(organizationId);
    let result;
    try {
      result = await client.query(query, [organizationId]);
    } catch {
      result = await db.query(query, [organizationId]);
    }
    const entries = result.rows.map((r: any) => ({
      id: r.id,
      customerId: r.customer_id,
      customerCode: r.farmer_code || 'C-100',
      customerName: r.full_name || 'Farmer',
      type: r.entry_type,
      direction: r.entry_type,
      transactionType: r.transaction_type,
      amount: Number(r.amount),
      runningBalance: Number(r.balance_after),
      source: r.source_module,
      sourceModule: r.source_module,
      description: r.description,
      timestamp: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    }));
    res.json({ success: true, count: entries.length, data: entries });
  } catch (err) {
    next(err);
  }
});

router.post('/adjustment', authenticate, authorizePermission('billing:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { customerId, type, amount, reason, description, operatorName } = req.body;
    if (!customerId || !type || !amount) {
      res.status(400).json({ success: false, error: 'customerId, type, and amount are required' });
      return;
    }

    const organizationId = req.user?.organizationId;
    if (organizationId && req.user?.role !== 'SUPER_ADMIN') {
      const client = await getTenantDb(organizationId);
      const custRes = await client.query(
        `SELECT organization_id FROM customers WHERE (id = $1 OR global_customer_id = $1) LIMIT 1;`,
        [customerId]
      );
      if (custRes.rows.length > 0 && custRes.rows[0].organization_id !== organizationId) {
        res.status(403).json({ success: false, error: 'Cross-dairy ledger adjustment blocked.' });
        return;
      }
    }

    await ledgerRepo.appendEntry({
      customerId,
      entryType: type,
      amount: Number(amount),
      balanceAfter: 0,
      sourceModule: 'MANUAL_ADJUSTMENT',
      description: `${description || reason || 'Manual adjustment'} by ${operatorName || req.user?.fullName || 'Admin'}`,
    });

    res.json({
      success: true,
      message: 'Ledger adjustment posted successfully',
    });
  } catch (err) {
    next(err);
  }
});

export const ledgerRoutes = router;
