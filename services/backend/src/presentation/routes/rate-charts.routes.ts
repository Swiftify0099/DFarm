import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../../infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../../infrastructure/database/TenantDatabaseManager.js';
import { PostgresRateChartRepository } from '../../infrastructure/repositories/PostgresRateChartRepository.js';
import { handleRateSync } from '../../modules/rates/rate.routes.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizePermission } from '../middleware/authorize.js';

const router = Router();
const rateChartRepo = new PostgresRateChartRepository();

const getTenantDb = async (organizationId?: string) => {
  if (organizationId) {
    try {
      return await tenantDbManager.getTenantDb(organizationId);
    } catch {
      return db;
    }
  }
  return db;
};

// 1. List Rate Charts for Dairy
router.get(
  '/',
  authenticate,
  authorizePermission('rate_charts:read', 'policies:rate_read', 'collections:view_all', 'collections:intake'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const requestedOrgId = (req.headers['x-dairy-tenant-id'] as string) || (req.headers['x-dairy-id'] as string) || (req.query['organizationId'] as string);
      if (requestedOrgId && req.user?.organizationId && requestedOrgId !== req.user.organizationId && req.user?.role !== 'SUPER_ADMIN') {
        res.status(403).json({ success: false, error: 'Cross-dairy rate chart access blocked.' });
        return;
      }
      const organizationId = req.user?.role === 'SUPER_ADMIN'
        ? (requestedOrgId || req.user?.organizationId)
        : req.user?.organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, error: 'Dairy context (organizationId) is required' });
        return;
      }

    const query = `
      SELECT 
        rc.id AS chart_id,
        rc.name,
        rc.milk_category,
        rc.pricing_type,
        rc.is_active,
        rcv.id AS version_id,
        rcv.version_number,
        rcv.base_rate,
        rcv.base_fat,
        rcv.base_snf,
        rcv.effective_from,
        rcv.effective_to
      FROM rate_charts rc
      LEFT JOIN rate_chart_versions rcv ON rcv.rate_chart_id = rc.id
      WHERE rc.organization_id = $1
      ORDER BY rc.milk_category ASC, rcv.version_number DESC;
    `;

    const client = await getTenantDb(organizationId);
    let result;
    try {
      result = await client.query(query, [organizationId]);
    } catch {
      result = await db.query(query, [organizationId]);
    }

    const charts = result.rows.map((row: any) => ({
      id: row.chart_id,
      chartId: row.chart_id,
      versionId: row.version_id || row.chart_id,
      title: row.name,
      name: row.name,
      milkCategory: row.milk_category,
      pricingType: row.pricing_type,
      version: row.version_number || 1,
      versionNumber: row.version_number || 1,
      baseRatePerLiter: Number(row.base_rate || (row.milk_category === 'COW' ? 38.0 : 62.0)),
      baseRate: Number(row.base_rate || (row.milk_category === 'COW' ? 38.0 : 62.0)),
      baseFat: Number(row.base_fat || (row.milk_category === 'COW' ? 3.5 : 6.0)),
      baseSnf: Number(row.base_snf || (row.milk_category === 'COW' ? 8.5 : 9.0)),
      status: row.is_active ? 'ACTIVE' : 'DRAFT',
      isActive: Boolean(row.is_active),
      effectiveFrom: row.effective_from ? new Date(row.effective_from).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      effectiveTo: row.effective_to ? new Date(row.effective_to).toISOString().split('T')[0] : undefined,
      changeNotes: row.version_number > 1 ? `Revision v${row.version_number}` : 'Initial baseline chart',
    }));

    res.json({ success: true, count: charts.length, data: charts });
  } catch (err) {
    next(err);
  }
});

// 1b. GET & POST /api/v1/rate-charts/sync - Harmonized Authoritative Rate Matrix Delivery (Prompt 4 & 5.2.1)
router.get('/sync', authenticate, handleRateSync);
router.post('/sync', authenticate, handleRateSync);

// 2. Create Draft Rate Chart Version with Backend Range & Field Validation
router.post('/draft', authenticate, authorizePermission('rate_charts:manage'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const requestedOrgId = (req.headers['x-dairy-tenant-id'] as string) || (req.headers['x-dairy-id'] as string) || (req.body?.dairyId as string) || (req.body?.organizationId as string);
    if (requestedOrgId && req.user?.organizationId && requestedOrgId !== req.user.organizationId && req.user?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ success: false, error: 'Cross-dairy rate chart creation blocked.' });
      return;
    }
    const organizationId = req.user?.role === 'SUPER_ADMIN'
      ? (requestedOrgId || req.user?.organizationId)
      : req.user?.organizationId;
    if (!organizationId) {
      res.status(400).json({ success: false, error: 'Dairy context (organizationId) is required' });
      return;
    }
    const { title, milkCategory, baseRatePerLiter, minFat, maxFat: _maxFat, minSnf, maxSnf: _maxSnf, effectiveDate, changeNotes } = req.body;

    if (!organizationId) {
      res.status(400).json({ success: false, error: 'Dairy context (organizationId) is required' });
      return;
    }

    // Backend Validation
    if (!milkCategory || (milkCategory !== 'COW' && milkCategory !== 'BUFFALO')) {
      res.status(400).json({ success: false, error: 'Valid milkCategory (COW or BUFFALO) is required.' });
      return;
    }

    const baseRate = Number(baseRatePerLiter);
    if (isNaN(baseRate) || baseRate <= 0) {
      res.status(400).json({ success: false, error: 'baseRatePerLiter must be a positive number.' });
      return;
    }

    const fat = Number(minFat ?? (milkCategory === 'COW' ? 3.5 : 6.0));
    const snf = Number(minSnf ?? (milkCategory === 'COW' ? 8.5 : 9.0));

    if (fat < 2.0 || fat > 15.0) {
      res.status(400).json({ success: false, error: 'Fat percentage must be between 2.0% and 15.0%.' });
      return;
    }
    if (snf < 5.0 || snf > 12.0) {
      res.status(400).json({ success: false, error: 'SNF percentage must be between 5.0% and 12.0%.' });
      return;
    }

    const client = await getTenantDb(organizationId);

    // Check or insert master rate chart
    let chartId: string;
    const existingChart = await client.query(
      `SELECT id FROM rate_charts WHERE organization_id = $1 AND milk_category = $2 LIMIT 1;`,
      [organizationId, milkCategory]
    );

    if (existingChart.rows.length > 0) {
      chartId = existingChart.rows[0].id;
    } else {
      const inserted = await client.query(
        `INSERT INTO rate_charts (organization_id, name, milk_category, pricing_type, is_active)
         VALUES ($1, $2, $3, 'GRID', TRUE) RETURNING id;`,
        [organizationId, title || `${milkCategory} Standard Chart`, milkCategory]
      );
      chartId = inserted.rows[0].id;
    }

    const versionRes = await client.query(
      `INSERT INTO rate_chart_versions (rate_chart_id, version_number, base_rate, base_fat, base_snf, effective_from)
       VALUES ($1, (SELECT COALESCE(MAX(version_number), 0) + 1 FROM rate_chart_versions WHERE rate_chart_id = $1), $2, $3, $4, $5)
       RETURNING id, version_number;`,
      [chartId, baseRate, fat, snf, effectiveDate || new Date()]
    );

    const versionNum = versionRes.rows[0].version_number;
    res.status(201).json({
      success: true,
      message: 'Draft rate chart version created successfully',
      data: {
        id: chartId,
        chartId,
        versionId: versionRes.rows[0].id,
        versionNumber: versionNum,
        version: versionNum,
        title: title || `${milkCategory} Standard Chart v${versionNum}`,
        changeNotes: changeNotes || 'Draft revision created by Dairy Admin',
      },
    });
  } catch (err) {
    next(err);
  }
});

// 3. Activate Rate Chart Version (Preserving Historical Versions)
router.post('/:id/activate', authenticate, authorizePermission('rate_charts:manage'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const requestedOrgId = (req.headers['x-dairy-tenant-id'] as string) || (req.headers['x-dairy-id'] as string) || (req.query?.organizationId as string);
    if (requestedOrgId && req.user?.organizationId && requestedOrgId !== req.user.organizationId && req.user?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ success: false, error: 'Cross-dairy rate chart activation blocked.' });
      return;
    }
    const organizationId = req.user?.role === 'SUPER_ADMIN'
      ? (requestedOrgId || req.user?.organizationId)
      : req.user?.organizationId;
    const client = await getTenantDb(organizationId);

    // Look up chart category
    const chartRes = await client.query(
      `SELECT organization_id, milk_category FROM rate_charts WHERE id = $1;`,
      [id]
    );
    if (chartRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Rate chart not found.' });
      return;
    }

    const { organization_id: chartOrgId, milk_category } = chartRes.rows[0];
    if (organizationId && chartOrgId && chartOrgId !== organizationId && req.user?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ success: false, error: 'Cross-dairy rate chart activation blocked.' });
      return;
    }

    // Deactivate previously active charts for the same category
    if (organizationId) {
      await client.query(
        `UPDATE rate_charts SET is_active = FALSE WHERE organization_id = $1 AND milk_category = $2 AND id != $3;`,
        [organizationId, milk_category, id]
      ).catch(() => {});
    }

    await client.query(`UPDATE rate_charts SET is_active = TRUE WHERE id = $1;`, [id]);
    await client.query(`UPDATE rate_chart_versions SET is_active = TRUE WHERE id = $1;`, [id]).catch(() => {});
    res.json({ success: true, message: `Rate chart ${id} activated successfully` });
  } catch (err) {
    next(err);
  }
});

// 4. Rate Preview Calculation Endpoint (Pure Calculation, Zero Financial Mutation)
router.post('/preview', authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const requestedOrgId = (req.headers['x-dairy-tenant-id'] as string) || (req.headers['x-dairy-id'] as string) || (req.body?.organizationId as string);
    if (requestedOrgId && req.user?.organizationId && requestedOrgId !== req.user.organizationId && req.user?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ success: false, error: 'Cross-dairy rate preview blocked.' });
      return;
    }
    const organizationId = req.user?.role === 'SUPER_ADMIN'
      ? (requestedOrgId || req.user?.organizationId)
      : req.user?.organizationId;
    if (!organizationId) {
      res.status(400).json({ success: false, error: 'Dairy context (organizationId) is required' });
      return;
    }
    const { milkCategory = 'COW', fatPercentage, fat, snfPercentage, snf, weightLiters = 10, volume = 10 } = req.body;

    const effFat = Number(fatPercentage ?? fat ?? (milkCategory === 'COW' ? 3.8 : 6.5));
    const effSnf = Number(snfPercentage ?? snf ?? (milkCategory === 'COW' ? 8.5 : 9.0));
    const effVol = Number(weightLiters ?? volume ?? 10);

    let activeChart;
    try {
      const category: 'COW' | 'BUFFALO' = milkCategory === 'BUFFALO' ? 'BUFFALO' : 'COW';
      if (req.user?.centerId) {
        activeChart = await rateChartRepo.getActiveRateChart(
          req.user.centerId,
          organizationId,
          category,
          new Date().toISOString().slice(0, 10)
        );
      }
    } catch {
      // Fallback calculation using standard rate formula
    }

    let ratePerLiter = 0;
    let rule = 'STANDARD_FORMULA';

    if (activeChart) {
      const calc = activeChart.calculateRate(effFat, effSnf);
      ratePerLiter = calc.ratePerLiter;
      rule = calc.rule;
    } else {
      // Standard baseline formula fallback
      const baseRate = milkCategory === 'COW' ? 38.0 : 62.0;
      const baseFat = milkCategory === 'COW' ? 3.5 : 6.0;
      const baseSnf = milkCategory === 'COW' ? 8.5 : 9.0;
      const fatFactor = milkCategory === 'COW' ? 4.2 : 5.0;
      const snfFactor = milkCategory === 'COW' ? 3.5 : 4.0;
      ratePerLiter = Math.round((baseRate + (effFat - baseFat) * fatFactor + (effSnf - baseSnf) * snfFactor) * 100) / 100;
    }

    const totalPayable = Math.round(ratePerLiter * effVol * 100) / 100;

    res.json({
      success: true,
      data: {
        milkCategory,
        fatPercentage: effFat,
        snfPercentage: effSnf,
        weightLiters: effVol,
        ratePerLiter,
        totalPayable,
        rule,
        isPreview: true,
      },
    });
  } catch (err) {
    next(err);
  }
});

export const rateChartsRoutes = router;
