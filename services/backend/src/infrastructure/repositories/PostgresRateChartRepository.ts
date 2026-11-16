import { IRateChartRepository } from '../../application/ports/index.js';
import { MilkCategory } from '../../domain/entities/Customer.js';
import { RateChart, RateChartProps, RateMatrixCell } from '../../domain/entities/RateChart.js';
import { db } from '../database/PostgresPool.js';

export class PostgresRateChartRepository implements IRateChartRepository {
  public async getActiveRateChart(
    centerId: string,
    organizationId: string,
    category: MilkCategory,
    businessDate: string
  ): Promise<RateChart> {
    // 1. Try to find Center-specific or Organization-wide active chart
    const query = `
      SELECT 
        rc.id AS chart_id,
        rc.organization_id,
        rc.center_id,
        rc.name,
        rc.milk_category,
        rc.pricing_type,
        rcv.id AS version_id,
        rcv.version_number,
        rcv.base_rate,
        rcv.base_fat,
        rcv.base_snf,
        rcv.formula_definition,
        rcv.effective_from
      FROM rate_charts rc
      JOIN rate_chart_versions rcv ON rcv.rate_chart_id = rc.id
      WHERE rc.organization_id = $1
        AND rc.milk_category = $2
        AND rc.is_active = TRUE
        AND (rc.center_id = $3 OR rc.center_id IS NULL)
        AND rcv.effective_from <= $4::timestamptz
        AND (rcv.effective_to IS NULL OR rcv.effective_to >= $4::timestamptz)
      ORDER BY (CASE WHEN rc.center_id IS NOT NULL THEN 1 ELSE 2 END) ASC, rcv.version_number DESC
      LIMIT 1;
    `;

    const result = await db.query(query, [organizationId, category, centerId, businessDate]);

    if (result.rows.length > 0) {
      const row = result.rows[0];
      // Fetch cells if pricing type is GRID
      const cellsResult = await db.query(
        `SELECT fat_percentage, snf_percentage, rate_per_unit 
         FROM rate_chart_cells 
         WHERE rate_chart_version_id = $1`,
        [row.version_id]
      );

      const cells: RateMatrixCell[] = cellsResult.rows.map((c: any) => ({
        fat: Number(c.fat_percentage),
        snf: Number(c.snf_percentage),
        ratePerLiter: Number(c.rate_per_unit),
      }));

      const formula = row.formula_definition || {};

      const props: RateChartProps = {
        id: row.chart_id,
        organizationId: row.organization_id,
        centerId: row.center_id,
        name: row.name,
        milkCategory: row.milk_category,
        pricingType: row.pricing_type === 'GRID' ? 'GRID' : 'FORMULA',
        version: row.version_number,
        versionId: row.version_id,
        baseRatePerLiter: Number(row.base_rate || (category === 'COW' ? 38.0 : 62.0)),
        fatFactor: formula.fatFactor ? Number(formula.fatFactor) : undefined,
        snfFactor: formula.snfFactor ? Number(formula.snfFactor) : undefined,
        cells,
        isActive: true,
        effectiveFrom: row.effective_from?.toISOString?.() || String(row.effective_from),
      };

      return new RateChart(props);
    }

    // 2. If no rate chart in DB, lazily initialize a standard approved version in DB
    const defaultBaseRate = category === 'COW' ? 38.0 : 62.0;
    const defaultBaseFat = category === 'COW' ? 3.5 : 6.0;
    const defaultBaseSnf = category === 'COW' ? 8.5 : 9.0;

    let chartId: string;
    let versionId: string;

    const existingChart = await db.query(
      `SELECT id FROM rate_charts WHERE organization_id = $1 AND milk_category = $2 LIMIT 1`,
      [organizationId, category]
    );

    if (existingChart.rows.length > 0) {
      chartId = existingChart.rows[0].id;
    } else {
      const insertedChart = await db.query(
        `INSERT INTO rate_charts (organization_id, center_id, name, milk_category, pricing_type, is_active)
         VALUES ($1, $2, $3, $4, 'GRID', TRUE)
         RETURNING id`,
        [organizationId, centerId, `Standard ${category} Rate Chart`, category]
      );
      chartId = insertedChart.rows[0].id;
    }

    const insertedVersion = await db.query(
      `INSERT INTO rate_chart_versions (
        rate_chart_id, version_number, effective_from, base_fat, base_snf, base_rate, is_approved
      ) VALUES ($1, 1, NOW(), $2, $3, $4, TRUE)
      ON CONFLICT (rate_chart_id, version_number) DO UPDATE SET updated_at = NOW()
      RETURNING id, version_number`,
      [chartId, defaultBaseFat, defaultBaseSnf, defaultBaseRate]
    );

    versionId = insertedVersion.rows[0].id;

    return new RateChart({
      id: chartId,
      organizationId,
      centerId,
      name: `Standard ${category} Rate Chart`,
      milkCategory: category,
      pricingType: 'GRID',
      version: 1,
      versionId,
      baseRatePerLiter: defaultBaseRate,
      isActive: true,
      effectiveFrom: new Date().toISOString(),
    });
  }
}
