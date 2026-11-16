import { Router, Request, Response, NextFunction } from 'express';
import {
  ProcessOfflineSyncBatchUseCase,
  ProcessMilkIntakeUseCase,
} from '../../application/use-cases/index.js';
import {
  PostgresCustomerRepository,
  PostgresShiftSessionRepository,
  PostgresCollectionTransactionRepository,
  PostgresRateChartRepository,
  PostgresLedgerRepository,
} from '../../infrastructure/index.js';
import { optionalAuthenticate } from '../middleware/authenticate.js';

const router = Router();
const customerRepo = new PostgresCustomerRepository();
const sessionRepo = new PostgresShiftSessionRepository();
const transactionRepo = new PostgresCollectionTransactionRepository();
const rateChartRepo = new PostgresRateChartRepository();
const ledgerRepo = new PostgresLedgerRepository();

const intakeUseCase = new ProcessMilkIntakeUseCase(
  customerRepo,
  sessionRepo,
  transactionRepo,
  rateChartRepo,
  ledgerRepo
);
const syncUseCase = new ProcessOfflineSyncBatchUseCase(intakeUseCase);

router.post('/push', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { deviceId, transactions } = req.body;
    const operatorId = req.user?.userId || '00000000-0000-0000-0000-000000000003';
    const operatorName = 'Counter Operator';

    const result = await syncUseCase.execute({
      deviceId: deviceId || 'KIOSK_MAIN',
      operatorId,
      operatorName,
      transactions: Array.isArray(transactions) ? transactions : [],
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

export const syncRoutes = router;
