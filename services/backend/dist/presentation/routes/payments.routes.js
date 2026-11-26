import crypto from 'node:crypto';
import { Router } from 'express';
import { db } from '../../infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../../infrastructure/database/TenantDatabaseManager.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizePermission } from '../middleware/authorize.js';
import { paymentRouter } from '../../modules/payments/payment.routes.js';
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
// 1. Get Payment Records for Dairy
router.get('/', authenticate, authorizePermission('billing:read', 'billing:manage', 'passbook:view_own'), async (req, res, next) => {
    try {
        const requestedOrgId = req.headers['x-dairy-tenant-id'] || req.headers['x-dairy-id'] || req.query['organizationId'];
        if (requestedOrgId && req.user?.organizationId && requestedOrgId !== req.user.organizationId && req.user?.role !== 'SUPER_ADMIN') {
            res.status(403).json({ success: false, error: 'Cross-dairy payments access blocked.' });
            return;
        }
        const organizationId = req.user?.role === 'SUPER_ADMIN'
            ? (requestedOrgId || req.user?.organizationId)
            : req.user?.organizationId;
        if (!organizationId) {
            res.status(400).json({ success: false, error: 'Dairy context (organizationId) is required' });
            return;
        }
        const filterCustomerId = (req.user?.role === 'FARMER_CUSTOMER' ? req.user.userId : req.query['customerId']);
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
        const params = [organizationId];
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
        }
        catch {
            result = await db.query(query, params);
        }
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
router.post('/', authenticate, authorizePermission('billing:manage'), async (req, res, next) => {
    try {
        const { customerId, amount, paymentMethod, transactionReference, notes, operatorName } = req.body;
        if (!customerId || !amount) {
            res.status(400).json({ success: false, error: 'customerId and amount are required' });
            return;
        }
        const requestedOrgId = req.headers['x-dairy-tenant-id'] || req.headers['x-dairy-id'] || req.body.organizationId;
        if (requestedOrgId && req.user?.organizationId && requestedOrgId !== req.user.organizationId && req.user?.role !== 'SUPER_ADMIN') {
            res.status(403).json({ success: false, error: 'Cross-dairy payment recording blocked.' });
            return;
        }
        const organizationId = req.user?.role === 'SUPER_ADMIN'
            ? (requestedOrgId || req.user?.organizationId)
            : req.user?.organizationId;
        if (!organizationId || !req.user?.userId) {
            res.status(400).json({ success: false, error: 'Authenticated dairy organization and operator context are required' });
            return;
        }
        const numAmount = Number(amount);
        const paymentId = crypto.randomUUID();
        if (organizationId) {
            const client = await getTenantDb(organizationId);
            const custRes = await client.query(`SELECT id, organization_id, primary_center_id FROM customers WHERE (id = $1 OR global_customer_id = $1) LIMIT 1;`, [customerId]);
            if (custRes.rows.length > 0 && custRes.rows[0].organization_id !== organizationId && req.user?.role !== 'SUPER_ADMIN') {
                res.status(403).json({ success: false, error: 'Cross-dairy customer payout blocked.' });
                return;
            }
            const effectiveCustomerId = custRes.rows[0]?.id || customerId;
            const centerId = custRes.rows[0]?.primary_center_id || req.user.centerId;
            if (!centerId) {
                res.status(400).json({ success: false, error: 'Customer or operator centerId could not be resolved' });
                return;
            }
            let accRes = await client.query(`SELECT id, current_balance FROM customer_ledger_accounts WHERE customer_id = $1 LIMIT 1;`, [effectiveCustomerId]);
            if (accRes.rows.length === 0) {
                accRes = await client.query(`INSERT INTO customer_ledger_accounts (id, customer_id, organization_id, current_balance)
           VALUES (gen_random_uuid(), $1, $2, 0.00) RETURNING id, current_balance;`, [effectiveCustomerId, organizationId]);
            }
            const accountId = accRes.rows[0].id;
            const oldBalance = Number(accRes.rows[0].current_balance || 0);
            const balanceAfter = oldBalance - numAmount;
            await client.query(`INSERT INTO ledger_transactions (
           id, organization_id, center_id, customer_id, transaction_type,
           direction, amount, balance_after, reference_entity, reference_id,
           description, idempotency_key, created_by
         ) VALUES (
           $1, $2, $3, $4, 'PAYMENT_PAYOUT_DEBIT',
           'DEBIT', $5, $6, 'CUSTOMER_PAYMENT', $1,
           $7, $8, $9
         );`, [
                paymentId,
                organizationId,
                centerId,
                effectiveCustomerId,
                numAmount,
                balanceAfter,
                `Disbursed ₹${numAmount} via ${paymentMethod || 'BANK_TRANSFER'} Ref: ${transactionReference || 'N/A'} by ${operatorName || req.user?.fullName || 'Admin'}: ${notes || ''}`,
                `PAY-${paymentId}-${Date.now()}`,
                req.user.userId,
            ]);
            await client.query(`UPDATE customer_ledger_accounts SET current_balance = $1, last_transaction_at = NOW(), updated_at = NOW() WHERE id = $2;`, [balanceAfter, accountId]);
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
    }
    catch (err) {
        next(err);
    }
});
router.use('/', paymentRouter);
export const paymentsRoutes = router;
//# sourceMappingURL=payments.routes.js.map