import { Router, Request, Response, NextFunction } from 'express';
import {
  GetActiveShiftSessionUseCase,
  OpenShiftSessionUseCase,
  CloseShiftSessionUseCase,
  ProcessMilkIntakeUseCase,
  GetCustomerCollectionHistoryUseCase,
  GetMonthlyMilkSummaryUseCase,
} from '../../application/use-cases/index.js';
import {
  PostgresCustomerRepository,
  PostgresShiftSessionRepository,
  PostgresCollectionTransactionRepository,
  PostgresRateChartRepository,
  PostgresLedgerRepository,
} from '../../infrastructure/index.js';
import { authenticate, optionalAuthenticate } from '../middleware/authenticate.js';

const router = Router();
const customerRepo = new PostgresCustomerRepository();
const sessionRepo = new PostgresShiftSessionRepository();
const transactionRepo = new PostgresCollectionTransactionRepository();
const rateChartRepo = new PostgresRateChartRepository();
const ledgerRepo = new PostgresLedgerRepository();

const getActiveSessionUseCase = new GetActiveShiftSessionUseCase(sessionRepo);
const openSessionUseCase = new OpenShiftSessionUseCase(sessionRepo);
const closeSessionUseCase = new CloseShiftSessionUseCase(sessionRepo);
const processMilkIntakeUseCase = new ProcessMilkIntakeUseCase(
  customerRepo,
  sessionRepo,
  transactionRepo,
  rateChartRepo,
  ledgerRepo
);
const getHistoryUseCase = new GetCustomerCollectionHistoryUseCase(transactionRepo);
const getSummaryUseCase = new GetMonthlyMilkSummaryUseCase(transactionRepo);

// 1. Get active shift session
router.get('/sessions/active', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const centerId = (req.query['centerId'] as string) || req.user?.centerId || '00000000-0000-0000-0000-000000000002';
    const organizationId = req.user?.organizationId || '00000000-0000-0000-0000-000000000001';
    const operatorId = req.user?.userId || '00000000-0000-0000-0000-000000000003';
    const deviceId = (req.query['deviceId'] as string) || 'KIOSK_MAIN';

    const session = await getActiveSessionUseCase.execute({
      centerId,
      organizationId,
      operatorId,
      operatorName: 'Counter Operator',
      deviceIdentifier: deviceId,
    });

    res.json({
      success: true,
      data: session.toJSON(),
    });
  } catch (err) {
    next(err);
  }
});

// 2. Open new shift session
router.post('/sessions/open', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const centerId = req.user?.centerId || (req.body.centerId as string) || '00000000-0000-0000-0000-000000000002';
    const organizationId = req.user?.organizationId || '00000000-0000-0000-0000-000000000001';
    const operatorId = req.user?.userId || '00000000-0000-0000-0000-000000000003';
    const deviceId = (req.body.deviceId as string) || 'KIOSK_MAIN';
    const shift = req.body.shift;
    const businessDate = req.body.businessDate;

    const session = await openSessionUseCase.execute({
      centerId,
      organizationId,
      operatorId,
      operatorName: 'Counter Operator',
      shift,
      businessDate,
      deviceIdentifier: deviceId,
    });

    res.status(201).json({
      success: true,
      message: `Shift session ${session.sessionCode} opened successfully.`,
      data: session.toJSON(),
    });
  } catch (err) {
    next(err);
  }
});

// 3. Close active shift session
router.post('/sessions/close', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionCode } = req.body;
    const session = await closeSessionUseCase.execute({
      sessionCode,
      operatorId: req.user!.userId,
      operatorName: 'Counter Operator',
    });

    res.json({
      success: true,
      message: `Shift session ${sessionCode} closed successfully.`,
      data: session.toJSON(),
    });
  } catch (err) {
    next(err);
  }
});

// 4. Atomic Milk Intake Transaction
router.post('/transactions', authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = req.body;
    const customer = await customerRepo.findById(body.customerId);
    if (!customer) {
      res.status(404).json({ success: false, error: `Customer ${body.customerId} not found` });
      return;
    }

    // Strict multi-dairy isolation: verify customer belongs to operator's dairy
    if (req.user?.organizationId && customer.organizationId !== req.user.organizationId) {
      res.status(403).json({
        success: false,
        error: 'Cross-dairy collection blocked: Customer does not belong to authorized dairy.',
      });
      return;
    }

    const result = await processMilkIntakeUseCase.execute({
      sessionId: body.sessionId,
      sessionCode: body.sessionCode,
      customerId: body.customerId,
      milkCategory: body.milkCategory || body.category,
      weightLiters: Number(body.weightLiters || body.netWeight || body.quantity),
      fatPercentage: Number(body.fatPercentage || body.fat),
      snfPercentage: Number(body.snfPercentage || body.snf),
      clrDensity: body.clrDensity ? Number(body.clrDensity) : undefined,
      identificationMethod: body.identificationMethod || 'MANUAL_SEARCH',
      deviceId: body.deviceId || 'KIOSK_MAIN',
      operatorId: req.user?.userId || '00000000-0000-0000-0000-000000000003',
      operatorName: 'Counter Operator',
      idempotencyKey: body.idempotencyKey || (req.headers['idempotency-key'] as string),
    });

    res.status(201).json({
      success: true,
      data: result.transaction.toJSON(),
      receiptNumber: result.receiptNumber,
      customerBalanceAfter: result.customerBalanceAfter,
      isIdempotentReplay: result.isIdempotentReplay,
    });
  } catch (err) {
    next(err);
  }
});

// 4. Recent transactions for session
router.get('/transactions/recent', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.query['sessionId'] as string;
    if (!sessionId) {
      res.json({ success: true, data: [] });
      return;
    }
    const list = await transactionRepo.listRecentBySession(sessionId);
    res.json({ success: true, data: list.map((t) => t.toJSON()) });
  } catch (err) {
    next(err);
  }
});

// 5. Customer Delivery History (Farmer App)
router.get('/history', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customerId = (req.query['customerId'] as string) || req.user?.userId;
    const limit = req.query['limit'] ? Number(req.query['limit']) : 50;
    const offset = req.query['offset'] ? Number(req.query['offset']) : 0;

    const data = await getHistoryUseCase.execute(customerId!, limit, offset);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// 6. Monthly Milk Summary (Farmer App)
router.get('/summary/monthly', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customerId = (req.query['customerId'] as string) || req.user?.userId;
    const monthYear = req.query['monthYear'] as string;

    const data = await getSummaryUseCase.execute(customerId!, monthYear);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

export const collectionRoutes = router;
