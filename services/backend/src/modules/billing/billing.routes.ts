import { Router, Request, Response, NextFunction } from 'express';
import { BillingService } from './billing.service.js';
import { BillingScheduler } from './billing.scheduler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole, requireCustomerOwnership } from '../../middleware/authorize.js';
import { ApiResponse } from '../../shared/response/api-response.js';
import { UserRole } from '@dfarm/shared-types';
import {
  CreateBillingPeriodSchema,
  GenerateBillsSchema,
  AdjustBillSchema,
  SubmitReviewSchema,
  ApproveBillSchema,
  FinalizeBillSchema,
  ListBillingPeriodsQuerySchema,
  BillingSchedulerRunSchema,
} from '@dfarm/shared-validation';

export const billingRouter = Router();

billingRouter.use(authenticate);

/**
 * 1. GET /api/v1/billing/periods
 * List billing periods.
 */
billingRouter.get('/periods', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedQuery = ListBillingPeriodsQuerySchema.parse(req.query);
    const result = await BillingService.listPeriods(validatedQuery, req.auth!);
    ApiResponse.success(res, result.periods, 200, {
      total: result.total,
      page: result.page,
      limit: result.limit,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 2. POST /api/v1/billing/periods
 * Create a new billing period.
 */
billingRouter.post(
  '/periods',
  requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER, UserRole.ACCOUNTANT]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validatedBody = CreateBillingPeriodSchema.parse(req.body);
      const period = await BillingService.createPeriod(validatedBody, req.auth!);
      ApiResponse.success(res, period, 201);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * 3. GET /api/v1/billing/periods/:periodId
 * Get period details & bills summary.
 */
billingRouter.get('/periods/:periodId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const periodId = req.params['periodId'] as string;
    const period = await BillingService.getPeriod(periodId, req.auth!);
    ApiResponse.success(res, period);
  } catch (err) {
    next(err);
  }
});

/**
 * 4. POST /api/v1/billing/periods/:periodId/generate
 * Trigger bill generation for a period.
 */
billingRouter.post(
  '/periods/:periodId/generate',
  requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER, UserRole.ACCOUNTANT]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const periodId = req.params['periodId'] as string;
      const validatedBody = GenerateBillsSchema.parse(req.body || {});
      const result = await BillingService.generateBills(periodId, validatedBody, req.auth!);
      ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * 5. GET /api/v1/billing/periods/:periodId/progress
 * Get bill generation progress.
 */
billingRouter.get('/periods/:periodId/progress', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const periodId = req.params['periodId'] as string;
    const progress = await BillingService.getPeriodProgress(periodId, req.auth!);
    ApiResponse.success(res, progress);
  } catch (err) {
    next(err);
  }
});

/**
 * 6. GET /api/v1/billing/customers/:customerId/statement
 * Get customer statement (P18 Mobile App restricted access).
 */
billingRouter.get(
  '/customers/:customerId/statement',
  requireCustomerOwnership(req => req.params['customerId'] as string),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const customerId = req.params['customerId'] as string;
      const periodId = req.query['periodId'] as string | undefined;
      const statement = await BillingService.getCustomerStatement(customerId, periodId, req.auth!);
      ApiResponse.success(res, statement);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * 7. POST /api/v1/billing/scheduler/run
 * Manual trigger for automatic billing scheduler.
 */
billingRouter.post(
  '/scheduler/run',
  requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = BillingSchedulerRunSchema.parse(req.body || {});
      const results = await BillingScheduler.executeScheduledBilling({
        centerId: validated.centerId,
        targetDate: validated.targetDate,
        triggerType: 'MANUAL',
        dryRun: validated.dryRun,
        callerAuth: req.auth!,
      });
      ApiResponse.success(res, results);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * 8. POST /api/v1/billing/:billId/submit-review
 * Submit bill for review.
 */
billingRouter.post(
  '/:billId/submit-review',
  requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER, UserRole.ACCOUNTANT]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const billId = req.params['billId'] as string;
      const validated = SubmitReviewSchema.parse(req.body || {});
      const bill = await BillingService.submitForReview(billId, validated.notes || undefined, req.auth!);
      ApiResponse.success(res, bill);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * 9. POST /api/v1/billing/:billId/approve
 * Approve bill.
 */
billingRouter.post(
  '/:billId/approve',
  requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const billId = req.params['billId'] as string;
      const validated = ApproveBillSchema.parse(req.body || {});
      const bill = await BillingService.approveBill(billId, validated.notes || undefined, req.auth!);
      ApiResponse.success(res, bill);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * 10. POST /api/v1/billing/:billId/finalize
 * Finalize bill & statement (Requires Dairy Owner or Super Admin).
 */
billingRouter.post(
  '/:billId/finalize',
  requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const billId = req.params['billId'] as string;
      const validated = FinalizeBillSchema.parse(req.body || {});
      const bill = await BillingService.finalizeBill(billId, validated.notes || undefined, req.auth!);
      ApiResponse.success(res, bill);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * 11. POST /api/v1/billing/:billId/adjust
 * Add controlled versioned adjustment to bill.
 */
billingRouter.post(
  '/:billId/adjust',
  requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER, UserRole.ACCOUNTANT]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const billId = req.params['billId'] as string;
      const validated = AdjustBillSchema.parse(req.body);
      const bill = await BillingService.adjustBill(billId, validated, req.auth!);
      ApiResponse.success(res, bill);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * 12. GET /api/v1/billing/:billId/pdf
 * Download PDF Statement.
 */
billingRouter.get('/:billId/pdf', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const billId = req.params['billId'] as string;
    const { buffer, filename, sha256Hash } = await BillingService.getPdfStatement(billId, req.auth!);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Statement-Checksum', sha256Hash);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});
