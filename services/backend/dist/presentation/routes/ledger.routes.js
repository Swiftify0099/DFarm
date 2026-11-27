import { Router } from 'express';
import { GetCustomerKhataSummaryUseCase, GetCustomerLedgerEntriesUseCase, } from '../../application/use-cases/index.js';
import { PostgresLedgerRepository } from '../../infrastructure/index.js';
import { tenantDbManager } from '../../infrastructure/database/TenantDatabaseManager.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizePermission } from '../middleware/authorize.js';
const router = Router();
const ledgerRepo = new PostgresLedgerRepository();
const getKhataSummary = new GetCustomerKhataSummaryUseCase(ledgerRepo);
const getLedgerEntries = new GetCustomerLedgerEntriesUseCase(ledgerRepo);
const handleGetBalanceSummary = async (req, res, next) => {
    try {
        let customerId = req.params['customerId'] || req.user?.userId;
        if (req.user?.role === 'FARMER_CUSTOMER') {
            const queryId = req.params['customerId'] || req.query['customerId'];
            if (queryId && queryId !== req.user.userId && (!req.user.globalCustomerId || queryId !== req.user.globalCustomerId)) {
                res.status(403).json({
                    success: false,
                    error: 'Cross-customer query blocked: customer can only view their own ledger summary.',
                });
                return;
            }
        }
        else {
            customerId = req.params['customerId'] || req.query['customerId'] || req.user?.userId;
        }
        if (!customerId) {
            res.status(400).json({ success: false, error: 'customerId is required' });
            return;
        }
        const requestedOrgId = req.headers['x-dairy-tenant-id'] ||
            req.headers['x-dairy-id'] ||
            req.headers['x-organization-id'] ||
            req.query['organizationId'];
        if (requestedOrgId && req.user?.organizationId && requestedOrgId !== req.user.organizationId && req.user?.role !== 'SUPER_ADMIN') {
            res.status(403).json({ success: false, error: 'Cross-dairy ledger access blocked.' });
            return;
        }
        const organizationId = req.user?.role === 'SUPER_ADMIN'
            ? (requestedOrgId || req.user?.organizationId)
            : req.user?.organizationId;
        if (!organizationId) {
            res.status(400).json({ success: false, error: 'Dairy context (organizationId) is required' });
            return;
        }
        const data = await getKhataSummary.execute(customerId, organizationId);
        res.json({ success: true, data, balance: data.currentBalance, currentBalance: data.currentBalance });
    }
    catch (err) {
        next(err);
    }
};
router.get('/accounts/:customerId', authenticate, authorizePermission('passbook:view_own', 'billing:read', 'billing:manage', 'collections:view_all'), handleGetBalanceSummary);
router.get('/summary', authenticate, authorizePermission('passbook:view_own', 'billing:read', 'billing:manage', 'collections:view_all'), handleGetBalanceSummary);
router.get('/balance', authenticate, authorizePermission('passbook:view_own', 'billing:read', 'billing:manage', 'collections:view_all'), handleGetBalanceSummary);
router.get('/entries', authenticate, authorizePermission('passbook:view_own', 'billing:read', 'billing:manage', 'collections:view_all'), async (req, res, next) => {
    try {
        let customerId = req.user?.userId;
        if (req.user?.role === 'FARMER_CUSTOMER') {
            const queryId = req.query['customerId'];
            if (queryId && queryId !== req.user.userId) {
                res.status(403).json({
                    success: false,
                    error: 'Cross-customer query blocked: customer can only view their own ledger entries.',
                });
                return;
            }
        }
        else {
            customerId = req.query['customerId'] || undefined;
        }
        const requestedOrgId = req.headers['x-dairy-tenant-id'] ||
            req.headers['x-dairy-id'] ||
            req.headers['x-organization-id'] ||
            req.query['organizationId'];
        if (requestedOrgId && req.user?.organizationId && requestedOrgId !== req.user.organizationId && req.user?.role !== 'SUPER_ADMIN') {
            res.status(403).json({ success: false, error: 'Cross-dairy ledger entries query blocked.' });
            return;
        }
        const organizationId = req.user?.role === 'SUPER_ADMIN'
            ? (requestedOrgId || req.user?.organizationId)
            : req.user?.organizationId;
        if (!organizationId) {
            res.status(400).json({ success: false, error: 'Dairy context (organizationId) is required' });
            return;
        }
        if (customerId) {
            const limit = req.query['limit'] ? Number(req.query['limit']) : 50;
            const offset = req.query['offset'] ? Number(req.query['offset']) : 0;
            const data = await getLedgerEntries.execute(customerId, limit, offset, organizationId);
            res.json({ success: true, count: data.length, data });
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
      WHERE lt.organization_id = $1
        AND c.organization_id = $1
      ORDER BY lt.created_at DESC
      LIMIT 100;
    `;
        const client = await tenantDbManager.getStrictTenantDb(organizationId);
        const result = await client.query(query, [organizationId]);
        const entries = result.rows.map((r) => ({
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
    }
    catch (err) {
        next(err);
    }
});
router.post('/adjustment', authenticate, authorizePermission('billing:manage'), async (req, res, next) => {
    try {
        const { customerId, type, amount, reason, description, operatorName } = req.body;
        if (!customerId || !type || !amount) {
            res.status(400).json({ success: false, error: 'customerId, type, and amount are required' });
            return;
        }
        const requestedOrgId = req.headers['x-dairy-tenant-id'] ||
            req.headers['x-dairy-id'] ||
            req.headers['x-organization-id'] ||
            req.body?.organizationId;
        if (requestedOrgId && req.user?.organizationId && requestedOrgId !== req.user.organizationId && req.user?.role !== 'SUPER_ADMIN') {
            res.status(403).json({ success: false, error: 'Cross-dairy ledger adjustment blocked.' });
            return;
        }
        const organizationId = req.user?.role === 'SUPER_ADMIN'
            ? (requestedOrgId || req.user?.organizationId)
            : req.user?.organizationId;
        if (!organizationId || !req.user?.userId) {
            res.status(400).json({ success: false, error: 'Authenticated dairy organization and operator context are required.' });
            return;
        }
        const client = await tenantDbManager.getStrictTenantDb(organizationId);
        const custRes = await client.query(`SELECT id, organization_id FROM customers WHERE (id = $1 OR global_customer_id = $1) AND organization_id = $2 LIMIT 1;`, [customerId, organizationId]);
        if (custRes.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Customer not found in authorized dairy.' });
            return;
        }
        await ledgerRepo.appendEntry({
            organizationId,
            customerId: custRes.rows[0].id,
            operatorId: req.user.userId,
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
    }
    catch (err) {
        next(err);
    }
});
export const ledgerRoutes = router;
//# sourceMappingURL=ledger.routes.js.map