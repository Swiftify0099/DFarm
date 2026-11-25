// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// MILK RATE MANAGEMENT & PRICING ROUTES (PHASE 11)
// ==============================================================================

import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
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

// 1b. GET & POST /api/v1/rates/sync - Complete Authoritative Rate Matrix Delivery (Prompt 4 & 5.2.1)
export const handleRateSync = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userOrgId = req.auth?.organizationId || req.user?.organizationId;
    if (!userOrgId) {
      res.status(401).json({ success: false, error: 'Authenticated organization context is required' });
      return;
    }

    const requestedOrgId =
      (req.headers['x-dairy-tenant-id'] as string) ||
      (req.headers['x-organization-id'] as string) ||
      (req.body?.organizationId as string) ||
      (req.body?.dairyId as string) ||
      (req.query['organizationId'] as string) ||
      (req.query['dairyId'] as string);

    if (requestedOrgId && requestedOrgId.trim().toLowerCase() !== userOrgId.trim().toLowerCase()) {
      res.status(403).json({ success: false, error: 'Cross-tenant rate access forbidden: Organization ID mismatch' });
      return;
    }

    const rawScope = (
      req.body?.scope ||
      req.query['scope'] ||
      req.headers['x-rate-scope']
    ) as string | undefined;

    if (!rawScope || typeof rawScope !== 'string' || !rawScope.trim()) {
      res.status(400).json({
        success: false,
        error: 'Explicit rate scope ("ORGANIZATION_WIDE" | "CENTER_SPECIFIC") is required. Missing centerId never implies organization-wide.',
      });
      return;
    }

    const scope = rawScope.trim();
    if (scope !== 'ORGANIZATION_WIDE' && scope !== 'CENTER_SPECIFIC') {
      res.status(400).json({
        success: false,
        error: 'Invalid rate scope: must be "ORGANIZATION_WIDE" or "CENTER_SPECIFIC"',
      });
      return;
    }

    const explicitCenterId = (
      (req.body?.centerId as string) ||
      (req.query['centerId'] as string) ||
      (req.headers['x-center-id'] as string) ||
      ''
    ).trim();

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (scope === 'ORGANIZATION_WIDE') {
      if (explicitCenterId.length > 0) {
        res.status(400).json({
          success: false,
          error: 'Contradictory scope: centerId cannot be provided for ORGANIZATION_WIDE rate scope',
        });
        return;
      }
    } else if (scope === 'CENTER_SPECIFIC') {
      if (!explicitCenterId) {
        res.status(400).json({
          success: false,
          error: 'Missing centerId: centerId is required for CENTER_SPECIFIC rate scope',
        });
        return;
      }
      if (!uuidRegex.test(explicitCenterId)) {
        res.status(400).json({
          success: false,
          error: 'Invalid centerId UUID format',
        });
        return;
      }
    }

    const callerRole = req.auth?.role || req.user?.role;
    const isOrgWideCaller =
      callerRole === UserRole.SUPER_ADMIN ||
      callerRole === UserRole.DAIRY_OWNER ||
      callerRole === UserRole.DAIRY_ADMIN ||
      (callerRole as any) === 'PRIMARY_DAIRY_ADMIN';

    const callerCenterIds: string[] = [
      ...(Array.isArray(req.auth?.centerIds) ? req.auth.centerIds : []),
      ...(req.auth?.primaryCenterId ? [req.auth.primaryCenterId] : []),
      ...(req.auth?.centerId ? [req.auth.centerId] : []),
      ...(req.user?.centerId ? [req.user.centerId] : []),
      ...(Array.isArray((req.auth as any)?.assignedCenters) ? (req.auth as any).assignedCenters : []),
    ]
      .filter(Boolean)
      .map((c) => c.trim().toLowerCase());

    if (scope === 'CENTER_SPECIFIC' && !isOrgWideCaller) {
      if (!callerCenterIds.includes(explicitCenterId.toLowerCase())) {
        res.status(403).json({
          success: false,
          error: 'Cross-centre rate access forbidden: caller is not assigned to requested centerId',
        });
        return;
      }
    }

    const organizationId = userOrgId;
    const targetCenterId = scope === 'CENTER_SPECIFIC' ? explicitCenterId : null;
    const businessDate = (req.body?.businessDate as string) || (req.query['businessDate'] as string) || undefined;

    const payload = await RateService.getSyncRateCharts(organizationId, targetCenterId, businessDate, scope);

    // Strict ambiguous metadata verification
    for (const chart of payload.charts) {
      if (scope === 'ORGANIZATION_WIDE') {
        if (chart.centerScope !== 'ORGANIZATION_WIDE' || chart.centerId !== null) {
          res.status(500).json({
            success: false,
            error: 'Ambiguous chart metadata: server returned center-specific chart for ORGANIZATION_WIDE scope',
          });
          return;
        }
      } else if (scope === 'CENTER_SPECIFIC') {
        if (
          chart.centerScope !== 'CENTER_SPECIFIC' ||
          !chart.centerId ||
          chart.centerId.toLowerCase() !== explicitCenterId.toLowerCase()
        ) {
          res.status(500).json({
            success: false,
            error: 'Ambiguous chart metadata: server returned mismatched center chart for CENTER_SPECIFIC scope',
          });
          return;
        }
      }
    }

    // Cryptographic SHA-256 ETag over tenant, center, scope, metadata, formula factors, and grid cells
    const hashInput = JSON.stringify({
      organizationId,
      centerId: payload.centerId,
      scope,
      charts: payload.charts.map((c: any) => ({
        chartId: c.chartId,
        versionId: c.versionId,
        versionNumber: c.versionNumber,
        centerScope: c.centerScope,
        centerId: c.centerId,
        pricingType: c.pricingType,
        effectiveFrom: c.effectiveFrom,
        effectiveTo: c.effectiveTo,
        baseRate: c.baseRate,
        baseFat: c.baseFat,
        baseSnf: c.baseSnf,
        fatFactor: c.fatFactor,
        snfFactor: c.snfFactor,
        fatMin: c.fatMin,
        fatMax: c.fatMax,
        snfMin: c.snfMin,
        snfMax: c.snfMax,
        cells: c.cells,
      })),
    });
    const digest = crypto.createHash('sha256').update(hashInput).digest('hex').slice(0, 32);
    const etag = `"${digest}"`;

    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');

    const ifNoneMatchRaw = req.headers['if-none-match'];
    if (ifNoneMatchRaw) {
      const tags = String(ifNoneMatchRaw)
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      if (tags.includes('*') || tags.includes(etag) || tags.includes(`W/${etag}`)) {
        res.status(304).end();
        return;
      }
    }

    res.json({
      success: true,
      data: payload,
    });
  } catch (err) {
    next(err);
  }
};

rateRouter.get('/sync', handleRateSync);
rateRouter.post('/sync', handleRateSync);

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
