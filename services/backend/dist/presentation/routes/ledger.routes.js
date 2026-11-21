import { Router } from 'express';
import { GetCustomerKhataSummaryUseCase, GetCustomerLedgerEntriesUseCase, } from '../../application/use-cases/index.js';
import { PostgresLedgerRepository } from '../../infrastructure/index.js';
import { db } from '../../infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../../infrastructure/database/TenantDatabaseManager.js';
import { optionalAuthenticate } from '../middleware/authenticate.js';
const router = Router();
const ledgerRepo = new PostgresLedgerRepository();
const getKhataSummary = new GetCustomerKhataSummaryUseCase(ledgerRepo);
const getLedgerEntries = new GetCustomerLedgerEntriesUseCase(ledgerRepo);
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
const handleGetBalanceSummary = async (req, res, next) => {
    try {
        let customerId = req.params['customerId'] || req.user?.userId;
        if (req.user?.role === 'FARMER_CUSTOMER') {
            const queryId = req.params['customerId'] || req.query['customerId'];
            if (queryId && queryId !== req.user.userId) {
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
        const organizationId = req.user?.organizationId ||
            req.headers['x-dairy-tenant-id'] ||
            req.headers['x-dairy-id'] ||
            req.headers['x-organization-id'] ||
            req.query['organizationId'];
        const data = await getKhataSummary.execute(customerId, organizationId);
        res.json({ success: true, data, balance: data.currentBalance, currentBalance: data.currentBalance });
    }
    catch (err) {
        next(err);
    }
};
router.get('/accounts/:customerId', optionalAuthenticate, handleGetBalanceSummary);
router.get('/summary', optionalAuthenticate, handleGetBalanceSummary);
router.get('/balance', optionalAuthenticate, handleGetBalanceSummary);
router.get('/entries', optionalAuthenticate, async (req, res, next) => {
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
            customerId = req.query['customerId'] || req.user?.userId;
        }
        const organizationId = req.user?.organizationId ||
            req.headers['x-dairy-tenant-id'] ||
            req.headers['x-dairy-id'] ||
            req.headers['x-organization-id'] ||
            req.query['organizationId'];
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
        }
        catch {
            result = await db.query(query, [organizationId]);
        }
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
router.post('/adjustment', optionalAuthenticate, async (req, res, next) => {
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
    }
    catch (err) {
        next(err);
    }
});
export const ledgerRoutes = router;
//# sourceMappingURL=ledger.routes.js.map