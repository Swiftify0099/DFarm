import crypto from 'node:crypto';
import { Router } from 'express';
import { db } from '../../infrastructure/database/PostgresPool.js';
import { PostgresLedgerRepository } from '../../infrastructure/index.js';
import { optionalAuthenticate } from '../middleware/authenticate.js';
const router = Router();
const ledgerRepo = new PostgresLedgerRepository();
// 1. Get Payment Records for Dairy
router.get('/', optionalAuthenticate, async (req, res, next) => {
    try {
        const organizationId = req.user?.organizationId || req.headers['x-dairy-id'] || req.query['organizationId'];
        if (!organizationId) {
            res.status(400).json({ success: false, error: 'Dairy context (organizationId) is required' });
            return;
        }
        // Query ledger payments
        const query = `
      SELECT 
        cle.id,
        cle.customer_id,
        cle.amount,
        cle.description,
        cle.created_at,
        c.farmer_code,
        c.full_name
      FROM customer_ledger_entries cle
      JOIN customers c ON c.id = cle.customer_id
      WHERE c.organization_id = $1 AND cle.entry_type = 'DEBIT' AND cle.source_module IN ('PAYMENT', 'SETTLEMENT', 'MANUAL_ADJUSTMENT')
      ORDER BY cle.created_at DESC
      LIMIT 100;
    `;
        const result = await db.query(query, [organizationId]);
        const payments = result.rows.map((p) => ({
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
    }
    catch (err) {
        next(err);
    }
});
// 2. Record Customer Payment / Payout
router.post('/', optionalAuthenticate, async (req, res, next) => {
    try {
        const { customerId, amount, paymentMethod, transactionReference, notes, operatorName } = req.body;
        if (!customerId || !amount) {
            res.status(400).json({ success: false, error: 'customerId and amount are required' });
            return;
        }
        const numAmount = Number(amount);
        const paymentId = crypto.randomUUID();
        await ledgerRepo.appendEntry({
            customerId,
            entryType: 'DEBIT',
            amount: numAmount,
            balanceAfter: 0,
            referenceId: paymentId,
            sourceModule: 'PAYMENT',
            description: `Disbursed ₹${numAmount} via ${paymentMethod || 'BANK_TRANSFER'} Ref: ${transactionReference || 'N/A'} by ${operatorName || 'Admin'}: ${notes || ''}`,
        });
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
    }
    catch (err) {
        next(err);
    }
});
export const paymentsRoutes = router;
//# sourceMappingURL=payments.routes.js.map