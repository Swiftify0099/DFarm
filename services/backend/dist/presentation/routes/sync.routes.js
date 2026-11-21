import { Router } from 'express';
import { ProcessOfflineSyncBatchUseCase, ProcessMilkIntakeUseCase, } from '../../application/use-cases/index.js';
import { PostgresCustomerRepository, PostgresShiftSessionRepository, PostgresCollectionTransactionRepository, PostgresRateChartRepository, PostgresLedgerRepository, } from '../../infrastructure/index.js';
import { optionalAuthenticate } from '../middleware/authenticate.js';
import { syncRouter } from '../../modules/sync/sync.routes.js';
const router = Router();
const customerRepo = new PostgresCustomerRepository();
const sessionRepo = new PostgresShiftSessionRepository();
const transactionRepo = new PostgresCollectionTransactionRepository();
const rateChartRepo = new PostgresRateChartRepository();
const ledgerRepo = new PostgresLedgerRepository();
const intakeUseCase = new ProcessMilkIntakeUseCase(customerRepo, sessionRepo, transactionRepo, rateChartRepo, ledgerRepo);
const syncUseCase = new ProcessOfflineSyncBatchUseCase(intakeUseCase);
const handleSyncBatch = async (req, res, next) => {
    try {
        const { deviceId, transactions } = req.body;
        const operatorId = req.user?.userId || '00000000-0000-0000-0000-000000000003';
        const operatorName = req.user?.fullName || 'Counter Operator';
        const result = await syncUseCase.execute({
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
router.post('/transactions', optionalAuthenticate, handleSyncBatch);
router.post('/push', optionalAuthenticate, handleSyncBatch);
// Mount the comprehensive syncRouter for /push, /pull, /acknowledge, /status
router.use('/', syncRouter);
export const syncRoutes = router;
//# sourceMappingURL=sync.routes.js.map