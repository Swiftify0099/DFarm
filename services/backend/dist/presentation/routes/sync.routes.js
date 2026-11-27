import { Router } from 'express';
import { ProcessOfflineSyncBatchUseCase, ProcessMilkIntakeUseCase, BulkCollectionSyncUseCase, } from '../../application/use-cases/index.js';
import { PostgresCustomerRepository, PostgresShiftSessionRepository, PostgresCollectionTransactionRepository, PostgresRateChartRepository, PostgresLedgerRepository, } from '../../infrastructure/index.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizePermission } from '../middleware/authorize.js';
import { syncRouter } from '../../modules/sync/sync.routes.js';
const router = Router();
const customerRepo = new PostgresCustomerRepository();
const sessionRepo = new PostgresShiftSessionRepository();
const transactionRepo = new PostgresCollectionTransactionRepository();
const rateChartRepo = new PostgresRateChartRepository();
const ledgerRepo = new PostgresLedgerRepository();
const intakeUseCase = new ProcessMilkIntakeUseCase(customerRepo, sessionRepo, transactionRepo, rateChartRepo, ledgerRepo);
const syncUseCase = new ProcessOfflineSyncBatchUseCase(intakeUseCase);
const bulkCollectionSyncUseCase = new BulkCollectionSyncUseCase(customerRepo, sessionRepo, transactionRepo);
const handleBulkSync = async (req, res, next) => {
    try {
        const orgId = req.user?.organizationId;
        const operatorId = req.user?.userId;
        if (!orgId || !operatorId) {
            res.status(401).json({ success: false, error: 'Authenticated organization and operator context is required for bulk sync' });
            return;
        }
        const requestedOrgId = req.headers['x-organization-id'] ||
            req.headers['x-dairy-tenant-id'] ||
            req.headers['x-dairy-id'] ||
            req.body?.organizationId ||
            req.body?.dairyId;
        if (requestedOrgId && requestedOrgId !== orgId) {
            res.status(403).json({ success: false, error: 'Cross-tenant bulk sync blocked: Organization ID mismatch' });
            return;
        }
        const operatorName = req.user?.fullName || 'Counter Operator';
        const authenticatedDeviceId = req.user?.deviceId;
        const requestId = req.headers['x-request-id'] || `req-${Date.now().toString(36)}`;
        const { batchId, schemaVersion, deviceId, transactions } = req.body;
        if (!Array.isArray(transactions)) {
            res.status(400).json({ success: false, error: 'Invalid batch: transactions must be an array' });
            return;
        }
        const result = await bulkCollectionSyncUseCase.execute({
            organizationId: orgId,
            operatorId,
            operatorName,
            authenticatedDeviceId,
            requestId,
            batch: {
                batchId: batchId || `batch-${Date.now().toString(36)}`,
                schemaVersion: schemaVersion || 1,
                deviceId: deviceId || 'KIOSK_MAIN',
                transactions,
            },
        });
        res.status(200).json({
            success: true,
            ...result,
        });
    }
    catch (err) {
        if (err.statusCode === 413 || err.code === 'BATCH_SIZE_EXCEEDED') {
            res.status(413).json({ success: false, error: err.message });
            return;
        }
        next(err);
    }
};
router.post('/bulk', authenticate, authorizePermission('collections:intake', 'sessions:manage'), handleBulkSync);
const handleSyncBatch = async (req, res, next) => {
    try {
        const orgId = req.user?.organizationId;
        const operatorId = req.user?.userId;
        if (!orgId || !operatorId) {
            res.status(401).json({ success: false, error: 'Authenticated organization and operator context is required for sync batch' });
            return;
        }
        const requestedOrgId = req.headers['x-organization-id'] ||
            req.headers['x-dairy-tenant-id'] ||
            req.headers['x-dairy-id'] ||
            req.body?.organizationId ||
            req.body?.dairyId;
        if (requestedOrgId && requestedOrgId !== orgId) {
            res.status(403).json({ success: false, error: 'Cross-tenant sync blocked: Organization ID mismatch' });
            return;
        }
        const { deviceId, transactions } = req.body;
        const operatorName = req.user?.fullName || 'Counter Operator';
        const result = await syncUseCase.execute({
            organizationId: orgId,
            deviceId: deviceId || 'KIOSK_MAIN',
            operatorId,
            operatorName,
            transactions: Array.isArray(transactions) ? transactions : [],
        });
        res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
};
router.post('/transactions', authenticate, authorizePermission('collections:intake', 'sessions:manage'), handleSyncBatch);
// Mount device-authenticated syncRouter for /push, /pull, /acknowledge, /status (and /conflicts, /events)
// /push must NEVER be shadowed by operator-authenticated handleSyncBatch.
router.use('/', syncRouter);
export const syncRoutes = router;
//# sourceMappingURL=sync.routes.js.map