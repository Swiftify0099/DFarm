import crypto from 'node:crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../../infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../../infrastructure/database/TenantDatabaseManager.js';
import { optionalAuthenticate } from '../middleware/authenticate.js';
import { paymentRouter } from '../../modules/payments/payment.routes.js';

const router = Router();

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

// 1. Get Payment Records for Dairy
router.get('/', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId || (req.headers['x-dairy-tenant-id'] as string) || (req.headers['x-dairy-id'] as string) || (req.query['organizationId'] as string);
    if (!organizationId) {
      res.status(400).json({ success: false, error: 'Dairy context (organizationId) is required' });
      return;
    }

    const filterCustomerId = (req.user?.role === 'FARMER_CUSTOMER' ? req.user.userId : req.query['customerId']) as string | undefined;

    // Query ledger payments
    let query = `
      SELECT 
        lt.id,
        lt.customer_id,
        lt.amount,
        lt.description,
        lt.created_at,
        c.farmer_code,
        c.full_name
      FROM ledger_transactions lt
      JOIN customers c ON c.id = lt.customer_id
      WHERE c.organization_id = $1 AND lt.direction = 'DEBIT' AND lt.reference_entity IN ('CUSTOMER_PAYMENT', 'MANUAL_ADJUSTMENT', 'CUSTOMER_PAYOUT', 'PAYMENT_BATCH')
    `;
    const params: any[] = [organizationId];

    if (filterCustomerId) {
      query += ` AND (lt.customer_id = $2 OR c.global_customer_id = $2)`;
      params.push(filterCustomerId);
    }

    query += `
      ORDER BY lt.created_at DESC
      LIMIT 100;
    `;

    const client = await getTenantDb(organizationId);
    let result;
    try {
      result = await client.query(query, params);
    } catch {
      result = await db.query(query, params);
    }
    const payments = result.rows.map((p: any) => ({
      id: p.id,
      customerId: p.customer_id,
      customerCode: p.farmer_code || 'C-100',
      customerName: p.full_name || 'Farmer',
      amount: Number(p.amount),
      paymentMethod: 'BANK_TRANSFER',
      transactionReference: `PAY-${p.id.slice(0, 8)}`,
      status: 'COMPLETED',
      disbursedAt: p.created_at ? new Date(p.created_at).toISOString() : new Date().toISOString(),
      notes: p.description,
    }));

    res.json({ success: true, count: payments.length, data: payments });
  } catch (err) {
    next(err);
  }
});

// 2. Record Customer Payment / Payout
router.post('/', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { customerId, amount, paymentMethod, transactionReference, notes, operatorName } = req.body;
    if (!customerId || !amount) {
      res.status(400).json({ success: false, error: 'customerId and amount are required' });
      return;
    }

    const organizationId = req.user?.organizationId || (req.headers['x-dairy-tenant-id'] as string) || (req.headers['x-dairy-id'] as string) || (req.body.organizationId as string);
    const numAmount = Number(amount);
    const paymentId = crypto.randomUUID();

    if (organizationId) {
      const client = await getTenantDb(organizationId);
      const custRes = await client.query(
        `SELECT id, primary_center_id FROM customers WHERE (id = $1 OR global_customer_id = $1) LIMIT 1;`,
        [customerId]
      );
      const effectiveCustomerId = custRes.rows[0]?.id || customerId;
      const centerId = custRes.rows[0]?.primary_center_id || '00000000-0000-0000-0000-000000000083';

      let accRes = await client.query(
        `SELECT id, current_balance FROM customer_ledger_accounts WHERE customer_id = $1 LIMIT 1;`,
        [effectiveCustomerId]
      );
      if (accRes.rows.length === 0) {
        accRes = await client.query(
          `INSERT INTO customer_ledger_accounts (id, customer_id, organization_id, current_balance)
           VALUES (gen_random_uuid(), $1, $2, 0.00) RETURNING id, current_balance;`,
          [effectiveCustomerId, organizationId]
        );
      }
      const accountId = accRes.rows[0].id;
      const oldBalance = Number(accRes.rows[0].current_balance || 0);
      const balanceAfter = oldBalance - numAmount;

      await client.query(
        `INSERT INTO ledger_transactions (
           id, organization_id, center_id, customer_id, transaction_type,
           direction, amount, balance_after, reference_entity, reference_id,
           description, idempotency_key, created_by
         ) VALUES (
           $1, $2, $3, $4, 'PAYMENT_PAYOUT_DEBIT',
           'DEBIT', $5, $6, 'CUSTOMER_PAYMENT', $1,
           $7, $8, $9
         );`,
        [
          paymentId,
          organizationId,
          centerId,
          effectiveCustomerId,
          numAmount,
          balanceAfter,
          `Disbursed ₹${numAmount} via ${paymentMethod || 'BANK_TRANSFER'} Ref: ${transactionReference || 'N/A'} by ${operatorName || 'Admin'}: ${notes || ''}`,
          `PAY-${paymentId}-${Date.now()}`,
          req.user?.userId || '00000000-0000-0000-0000-000000000084',
        ]
      );

      await client.query(
        `UPDATE customer_ledger_accounts SET current_balance = $1, last_transaction_at = NOW(), updated_at = NOW() WHERE id = $2;`,
        [balanceAfter, accountId]
      );
    }

    res.status(201).json({
      success: true,
      message: `Payment of ₹${numAmount} recorded successfully`,
      data: {
        id: paymentId,
        customerId,
        amount: numAmount,
        status: 'COMPLETED',
        transactionReference: transactionReference || `PAY-${paymentId.slice(0, 8)}`,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.use('/', paymentRouter);

export const paymentsRoutes = router;
