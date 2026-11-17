import { Router } from 'express';
import { db } from '../../infrastructure/database/PostgresPool.js';
import { optionalAuthenticate } from '../middleware/authenticate.js';
const router = Router();
// 1. List Rate Charts for Dairy
router.get('/', optionalAuthenticate, async (req, res, next) => {
    try {
        const organizationId = req.user?.organizationId || req.headers['x-dairy-id'] || req.query['organizationId'];
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
        const result = await db.query(query, [organizationId]);
        const charts = result.rows.map((row) => ({
            id: row.version_id || row.chart_id,
            chartId: row.chart_id,
            name: row.name,
            milkCategory: row.milk_category,
            pricingType: row.pricing_type,
            versionNumber: row.version_number || 1,
            baseRatePerLiter: Number(row.base_rate || (row.milk_category === 'COW' ? 38.0 : 62.0)),
            baseFat: Number(row.base_fat || (row.milk_category === 'COW' ? 3.5 : 6.0)),
            baseSnf: Number(row.base_snf || (row.milk_category === 'COW' ? 8.5 : 9.0)),
            status: row.is_active ? 'ACTIVE' : 'DRAFT',
            effectiveFrom: row.effective_from ? new Date(row.effective_from).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            effectiveTo: row.effective_to ? new Date(row.effective_to).toISOString().split('T')[0] : undefined,
        }));
        res.json({ success: true, count: charts.length, data: charts });
    }
    catch (err) {
        next(err);
    }
});
// 2. Create Draft Rate Chart Version
router.post('/draft', optionalAuthenticate, async (req, res, next) => {
    try {
        const organizationId = req.user?.organizationId || req.headers['x-dairy-id'] || req.body.dairyId;
        const { title, milkCategory, baseRatePerLiter, minFat, maxFat: _maxFat, minSnf, maxSnf: _maxSnf, effectiveDate } = req.body;
        // Check or insert master rate chart
        let chartId;
        const existingChart = await db.query(`SELECT id FROM rate_charts WHERE organization_id = $1 AND milk_category = $2 LIMIT 1;`, [organizationId, milkCategory]);
        if (existingChart.rows.length > 0) {
            chartId = existingChart.rows[0].id;
        }
        else {
            const inserted = await db.query(`INSERT INTO rate_charts (organization_id, name, milk_category, pricing_type, is_active)
         VALUES ($1, $2, $3, 'GRID', TRUE) RETURNING id;`, [organizationId, title || `${milkCategory} Standard Chart`, milkCategory]);
            chartId = inserted.rows[0].id;
        }
        const versionRes = await db.query(`INSERT INTO rate_chart_versions (rate_chart_id, version_number, base_rate, base_fat, base_snf, effective_from)
       VALUES ($1, (SELECT COALESCE(MAX(version_number), 0) + 1 FROM rate_chart_versions WHERE rate_chart_id = $1), $2, $3, $4, $5)
       RETURNING id, version_number;`, [chartId, baseRatePerLiter, minFat || 3.5, minSnf || 8.5, effectiveDate || new Date()]);
        res.status(201).json({
            success: true,
            message: 'Draft rate chart version created successfully',
            data: {
                chartId,
                versionId: versionRes.rows[0].id,
                versionNumber: versionRes.rows[0].version_number,
            },
        });
    }
    catch (err) {
        next(err);
    }
});
// 3. Activate Rate Chart Version
router.post('/:id/activate', optionalAuthenticate, async (req, res, next) => {
    try {
        const { id } = req.params;
        await db.query(`UPDATE rate_charts SET is_active = TRUE WHERE id = $1;`, [id]);
        res.json({ success: true, message: `Rate chart ${id} activated successfully` });
    }
    catch (err) {
        next(err);
    }
});
export const rateChartsRoutes = router;
//# sourceMappingURL=rate-charts.routes.js.map