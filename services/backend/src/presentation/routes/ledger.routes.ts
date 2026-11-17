import { Router, Request, Response, NextFunction } from 'express';
import {
  GetCustomerKhataSummaryUseCase,
  GetCustomerLedgerEntriesUseCase,
} from '../../application/use-cases/index.js';
import { PostgresLedgerRepository } from '../../infrastructure/index.js';
import { db } from '../../infrastructure/database/PostgresPool.js';
import { optionalAuthenticate } from '../middleware/authenticate.js';

const router = Router();
const ledgerRepo = new PostgresLedgerRepository();
const getKhataSummary = new GetCustomerKhataSummaryUseCase(ledgerRepo);
const getLedgerEntries = new GetCustomerLedgerEntriesUseCase(ledgerRepo);

router.get('/summary', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customerId = (req.query['customerId'] as string) || req.user?.userId;
    if (!customerId) {
      res.status(400).json({ success: false, error: 'customerId is required' });
      return;
    }
    const data = await getKhataSummary.execute(customerId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.get('/entries', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customerId = (req.query['customerId'] as string) || req.user?.userId;
    const organizationId = req.user?.organizationId || (req.headers['x-dairy-id'] as string) || (req.query['organizationId'] as string);

    if (customerId) {
      const limit = req.query['limit'] ? Number(req.query['limit']) : 50;
      const offset = req.query['offset'] ? Number(req.query['offset']) : 0;
      const data = await getLedgerEntries.execute(customerId, limit, offset);
      res.json({ success: true, count: data.length, data });
      return;
    }

    if (!organizationId) {
      res.status(400).json({ success: false, error: 'Dairy context (organizationId) or customerId is required' });
      return;
    }

    const query = `
      SELECT 
        cle.id,
        cle.customer_id,
        cle.entry_type,
        cle.amount,
        cle.balance_after,
        cle.source_module,
        cle.description,
        cle.created_at,
        c.farmer_code,
        c.full_name
      FROM customer_ledger_entries cle
      JOIN customers c ON c.id = cle.customer_id
      WHERE c.organization_id = $1
      ORDER BY cle.created_at DESC
      LIMIT 100;
    `;
    const result = await db.query(query, [organizationId]);
    const entries = result.rows.map((r: any) => ({
      id: r.id,
      customerId: r.customer_id,
      customerCode: r.farmer_code || 'C-100',
      customerName: r.full_name || 'Farmer',
      type: r.entry_type,
      amount: Number(r.amount),
      runningBalance: Number(r.balance_after),
      source: r.source_module,
      description: r.description,
      timestamp: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    }));
    res.json({ success: true, count: entries.length, data: entries });
  } catch (err) {
    next(err);
  }
});

router.post('/adjustment', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { customerId, type, amount, reason, description, operatorName } = req.body;
    if (!customerId || !type || !amount) {
      res.status(400).json({ success: false, error: 'customerId, type, and amount are required' });
      return;
    }

    await ledgerRepo.appendEntry({
      customerId,
      entryType: type,
      amount: Number(amount),
      balanceAfter: 0,
      sourceModule: 'MANUAL_ADJUSTMENT',
      description: `${description || reason || 'Manual adjustment'} by ${operatorName || 'Admin'}`,
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
