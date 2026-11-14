// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// MILK RATE MANAGEMENT & PRICING ROUTES (PHASE 11)
// ==============================================================================

import { Router, Request, Response, NextFunction } from 'express';
import { RateService } from './rate.service.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/authorize.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { ApiResponse } from '../../shared/response/api-response.js';
import { UserRole, MilkCategory } from '@dfarm/shared-types';
import {
  CreateRateChartSchema,
  CreateRateVersionSchema,
  RateMatrixSubmissionSchema,
  RateCalculationRequestSchema,
  RatePreviewCalculationSchema,
} from '@dfarm/shared-validation';
import { z } from 'zod';

export const rateRouter = Router();

rateRouter.use(authenticate);

const RateChartIdParamSchema = z.object({
  rateChartId: z.string().uuid('Rate Chart ID must be a valid UUID'),
});

const RateVersionIdParamSchema = z.object({
  rateChartId: z.string().uuid('Rate Chart ID must be a valid UUID'),
  versionId: z.string().uuid('Version ID must be a valid UUID'),
});

// 1. GET /api/v1/rates/active - Get currently applicable rate chart version
rateRouter.get('/active', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const centerId = (req.query['centerId'] as string) || req.auth?.primaryCenterId || '';
    const organizationId = req.auth?.organizationId || '';
    const milkCategory = (req.query['milkCategory'] as string) as MilkCategory;
    const businessDate = req.query['businessDate'] as string | undefined;

    const version = await RateService.getActiveRateVersion(centerId, organizationId, milkCategory, businessDate);
    ApiResponse.success(res, version);
  } catch (err) {
    next(err);
  }
});

// 2. POST /api/v1/rates/calculate - Authoritative backend calculation
rateRouter.post(
  '/calculate',
  validateRequest({ body: RateCalculationRequestSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { centerId, milkCategory, fat, snf, netWeight, quantity, measurementUnit, businessDate, versionId } = req.body;
      const organizationId = req.auth?.organizationId || '';
      const weight = Number(netWeight ?? quantity);

      const result = await RateService.calculateRate(
        centerId || req.auth?.primaryCenterId,
        organizationId,
        milkCategory as MilkCategory,
        Number(fat),
        Number(snf),
        weight,
        versionId,
        businessDate,
        measurementUnit || 'KG'
      );
      ApiResponse.success(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// 3. GET /api/v1/rates - List all rate charts for organization
rateRouter.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.auth?.organizationId || '';
    const centerId = req.query['centerId'] as string | undefined;
    const milkCategory = req.query['milkCategory'] as MilkCategory | undefined;

    const charts = await RateService.listRateCharts(organizationId, centerId, milkCategory);
    ApiResponse.success(res, charts);
  } catch (err) {
    next(err);
  }
});

// 4. POST /api/v1/rates - Create a new rate chart
rateRouter.post(
  '/',
  requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER]),
  validateRequest({ body: CreateRateChartSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.auth?.organizationId || '';
      const chart = await RateService.createRateChart(
        organizationId,
        req.body,
        req.auth?.userId || ''
      );
      ApiResponse.created(res, chart);
    } catch (err) {
      next(err);
    }
  }
);

// 5. GET /api/v1/rates/:rateChartId - Get rate chart details
rateRouter.get(
  '/:rateChartId',
  validateRequest({ params: RateChartIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.auth?.organizationId || '';
      const chart = await RateService.getRateChartById(req.params['rateChartId'] as string, organizationId);
      ApiResponse.success(res, chart);
    } catch (err) {
      next(err);
    }
  }
);

// 6. GET /api/v1/rates/:rateChartId/versions - List all versions of rate chart
rateRouter.get(
  '/:rateChartId/versions',
  validateRequest({ params: RateChartIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.auth?.organizationId || '';
      const versions = await RateService.listRateChartVersions(req.params['rateChartId'] as string, organizationId);
      ApiResponse.success(res, versions);
    } catch (err) {
      next(err);
    }
  }
);

// 7. POST /api/v1/rates/:rateChartId/versions - Create a new version for rate chart
rateRouter.post(
  '/:rateChartId/versions',
  requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER]),
  validateRequest({ params: RateChartIdParamSchema, body: CreateRateVersionSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.auth?.organizationId || '';
      const version = await RateService.createRateChartVersion(
        req.params['rateChartId'] as string,
        organizationId,
        req.body,
        req.auth?.userId || ''
      );
      ApiResponse.created(res, version);
    } catch (err) {
      next(err);
    }
  }
);

// 8. GET /api/v1/rates/:rateChartId/versions/:versionId - Get specific version with matrix cells
rateRouter.get(
  '/:rateChartId/versions/:versionId',
  validateRequest({ params: RateVersionIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.auth?.organizationId || '';
      const version = await RateService.getRateChartVersion(
        req.params['rateChartId'] as string,
        req.params['versionId'] as string,
        organizationId
      );
      ApiResponse.success(res, version);
    } catch (err) {
      next(err);
    }
  }
);

// 9. PUT /api/v1/rates/:rateChartId/versions/:versionId/matrix - Configure matrix cells for draft version
rateRouter.put(
  '/:rateChartId/versions/:versionId/matrix',
  requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER]),
  validateRequest({ params: RateVersionIdParamSchema, body: RateMatrixSubmissionSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.auth?.organizationId || '';
      const result = await RateService.updateMatrixCells(
        req.params['rateChartId'] as string,
        req.params['versionId'] as string,
        organizationId,
        req.body.cells,
        req.auth?.userId || ''
      );
      ApiResponse.success(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// 10. POST /api/v1/rates/:rateChartId/versions/:versionId/preview - Preview rate calculation against version
rateRouter.post(
  '/:rateChartId/versions/:versionId/preview',
  validateRequest({ params: RateVersionIdParamSchema, body: RatePreviewCalculationSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await RateService.previewCalculation(
        req.params['rateChartId'] as string,
        req.params['versionId'] as string,
        req.body
      );
      ApiResponse.success(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// 11. POST /api/v1/rates/:rateChartId/versions/:versionId/submit - Submit version for approval
rateRouter.post(
  '/:rateChartId/versions/:versionId/submit',
  requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER]),
  validateRequest({ params: RateVersionIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.auth?.organizationId || '';
      const result = await RateService.submitForApproval(
        req.params['rateChartId'] as string,
        req.params['versionId'] as string,
        organizationId,
        req.auth?.userId || ''
      );
      ApiResponse.success(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// 12. POST /api/v1/rates/:rateChartId/versions/:versionId/approve - Approve rate version (Owner/Admin)
rateRouter.post(
  '/:rateChartId/versions/:versionId/approve',
  requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER]),
  validateRequest({ params: RateVersionIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.auth?.organizationId || '';
      const result = await RateService.approveVersion(
        req.params['rateChartId'] as string,
        req.params['versionId'] as string,
        organizationId,
        req.auth?.userId || ''
      );
      ApiResponse.success(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// 13. POST /api/v1/rates/:rateChartId/versions/:versionId/publish - Publish rate version (Owner/Admin)
rateRouter.post(
  '/:rateChartId/versions/:versionId/publish',
  requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER]),
  validateRequest({ params: RateVersionIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.auth?.organizationId || '';
      const result = await RateService.publishVersion(
        req.params['rateChartId'] as string,
        req.params['versionId'] as string,
        organizationId,
        req.auth?.userId || ''
      );
      ApiResponse.success(res, result);
    } catch (err) {
      next(err);
    }
  }
);
