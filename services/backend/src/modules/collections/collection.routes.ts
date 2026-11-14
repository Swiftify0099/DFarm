import { Router, Request, Response, NextFunction } from 'express';
import { CollectionService } from './collection.service.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole, requireCustomerOwnership } from '../../middleware/authorize.js';
import { ApiResponse } from '../../shared/response/api-response.js';
import { UserRole, Shift } from '@dfarm/shared-types';

export const collectionRouter = Router();

collectionRouter.use(authenticate);

/**
 * POST /api/v1/collections/sessions
 * Initializes a new collection session.
 */
collectionRouter.post('/sessions', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await CollectionService.createSession(req.body, req.auth!);
    ApiResponse.success(res, result, 201);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/collections/sessions/:sessionId/measurements
 * Ingests measurements into session.
 */
collectionRouter.post('/sessions/:sessionId/measurements', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const sessionId = (req.params['sessionId'] || '') as string;
    const result = await CollectionService.recordMeasurements(sessionId, req.body, req.auth!);
    ApiResponse.success(res, result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/collections/sessions/:sessionId/validate
 * Validates session measurements.
 */
collectionRouter.post('/sessions/:sessionId/validate', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const sessionId = (req.params['sessionId'] || '') as string;
    const result = await CollectionService.recordMeasurements(sessionId, req.body, req.auth!);
    ApiResponse.success(res, result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/collections/sessions/:sessionId/complete
 * Atomically completes collection session and posts double-entry ledger entries.
 */
collectionRouter.post('/sessions/:sessionId/complete', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const sessionId = (req.params['sessionId'] || '') as string;
    const result = await CollectionService.completeSession(sessionId, req.body, req.auth!);
    ApiResponse.success(res, result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/collections/sessions/:sessionId/cancel
 * Cancels active collection session with audit reason.
 */
collectionRouter.post('/sessions/:sessionId/cancel', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const sessionId = (req.params['sessionId'] || '') as string;
    const { reason } = req.body;
    const result = await CollectionService.cancelSession(sessionId, reason, req.auth!);
    ApiResponse.success(res, result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/collections/sessions/:sessionId/adjust
 * Supervisor correction or reversal with audit trail.
 */
collectionRouter.post(
  '/sessions/:sessionId/adjust',
  requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER, UserRole.SUPERVISOR]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionId = (req.params['sessionId'] || '') as string;
      const result = await CollectionService.adjustCollection(sessionId, req.body, req.auth!);
      ApiResponse.success(res, result);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/collections/sessions/:sessionId/receipt
 * Retrieves 40-column thermal slip text.
 */
collectionRouter.get('/sessions/:sessionId/receipt', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const sessionId = (req.params['sessionId'] || '') as string;
    const receiptText = await CollectionService.getReceiptText(sessionId, req.auth!);
    ApiResponse.success(res, { receiptText });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/collections/shift-summary
 */
collectionRouter.get('/shift-summary', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const centerId = ((req.query['centerId'] as string) || req.auth?.primaryCenterId || '') as string;
    const shift = (req.query['shift'] as Shift) || Shift.MORNING;
    const date = ((req.query['date'] as string) || new Date().toISOString().split('T')[0]) as string;
    const summary = await CollectionService.getShiftSummary(centerId, shift, date, req.auth!);
    ApiResponse.success(res, summary);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/collections/history
 */
collectionRouter.get('/history', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const centerId = ((req.query['centerId'] as string) || req.auth?.primaryCenterId || '') as string;
    const date = req.query['date'] ? (req.query['date'] as string).trim() : undefined;
    const shift = req.query['shift'] as Shift | undefined;
    const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : undefined;
    const history = await CollectionService.getHistory(centerId, date, shift, req.auth!, limit);
    ApiResponse.success(res, history);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/collections/customer/:customerId
 * Customer milk collection history (P18 Mobile App restricted access).
 */
collectionRouter.get(
  '/customer/:customerId',
  requireCustomerOwnership(req => req.params['customerId'] as string),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const customerId = req.params['customerId'] as string;
      const filters = {
        startDate: req.query['startDate'] as string | undefined,
        endDate: req.query['endDate'] as string | undefined,
        category: req.query['category'] as string | undefined,
        shift: req.query['shift'] as string | undefined,
        limit: req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 50,
        offset: req.query['offset'] ? parseInt(req.query['offset'] as string, 10) : 0,
      };
      const result = await CollectionService.getCustomerCollections(customerId, filters, req.auth!);
      ApiResponse.success(res, result);
    } catch (err) {
      next(err);
    }
  }
);
