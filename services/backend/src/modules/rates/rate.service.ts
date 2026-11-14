// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// MILK RATE MANAGEMENT BUSINESS SERVICE (BACKEND AUTHORITATIVE)
// ==============================================================================

import { pool } from '../../config/db.js';
import { AppError } from '../../shared/errors/app-error.js';
import { MilkCategory } from '@dfarm/shared-types';
import { validateRateMatrix } from '@dfarm/shared-validation';
import type {
  RateChartDTO,
  RateChartVersionDTO,
  RateChartCellDTO,
  RateCalculationResultDTO,
  RateVersionStatus,
} from '@dfarm/shared-types';

export class RateService {
  /**
   * List rate charts with center scope, version counts, and active version info.
   */
  public static async listRateCharts(
    organizationId: string,
    centerId?: string,
    milkCategory?: MilkCategory
  ): Promise<RateChartDTO[]> {
    let sql = `
      SELECT rc.id, rc.organization_id, rc.center_id, rc.name, rc.milk_category,
             rc.pricing_type, rc.is_active, rc.created_at,
             CASE WHEN rc.center_id IS NULL THEN 'ORGANIZATION_WIDE' ELSE 'CENTER_SPECIFIC' END as center_scope,
             COUNT(rcv.id)::int as versions_count
      FROM rate_charts rc
      LEFT JOIN rate_chart_versions rcv ON rcv.rate_chart_id = rc.id
      WHERE rc.organization_id = $1
    `;
    const params: any[] = [organizationId];

    if (centerId) {
      params.push(centerId);
      sql += ` AND (rc.center_id = $${params.length} OR rc.center_id IS NULL)`;
    }
    if (milkCategory) {
      params.push(milkCategory);
      sql += ` AND rc.milk_category = $${params.length}`;
    }

    sql += ` GROUP BY rc.id ORDER BY rc.center_id NULLS FIRST, rc.name ASC;`;

    const res = await pool.query(sql, params);
    return res.rows.map(r => ({
      id: r.id,
      organizationId: r.organization_id,
      centerId: r.center_id,
      name: r.name,
      milkCategory: r.milk_category,
      pricingType: r.pricing_type,
      centerScope: r.center_scope,
      isActive: r.is_active,
      createdAt: r.created_at.toISOString(),
      versionsCount: r.versions_count,
    }));
  }

  /**
   * Get single rate chart by ID.
   */
  public static async getRateChartById(
    rateChartId: string,
    organizationId: string
  ): Promise<RateChartDTO> {
    const res = await pool.query(
      `SELECT rc.id, rc.organization_id, rc.center_id, rc.name, rc.milk_category,
              rc.pricing_type, rc.is_active, rc.created_at,
              CASE WHEN rc.center_id IS NULL THEN 'ORGANIZATION_WIDE' ELSE 'CENTER_SPECIFIC' END as center_scope
       FROM rate_charts rc
       WHERE rc.id = $1 AND rc.organization_id = $2;`,
      [rateChartId, organizationId]
    );

    if (res.rows.length === 0) {
      throw new AppError(`Rate chart ${rateChartId} not found`, 404, 'RATE_CHART_NOT_FOUND');
    }

    const r = res.rows[0];
    return {
      id: r.id,
      organizationId: r.organization_id,
      centerId: r.center_id,
      name: r.name,
      milkCategory: r.milk_category,
      pricingType: r.pricing_type,
      centerScope: r.center_scope,
      isActive: r.is_active,
      createdAt: r.created_at.toISOString(),
    };
  }

  /**
   * Create a new rate chart.
   */
  public static async createRateChart(
    organizationId: string,
    dto: {
      name: string;
      milkCategory: MilkCategory;
      centerId?: string | null;
      pricingType?: string;
      description?: string | null;
    },
    createdBy: string
  ): Promise<RateChartDTO> {
    const res = await pool.query(
      `INSERT INTO rate_charts (organization_id, center_id, name, milk_category, pricing_type, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING id, organization_id, center_id, name, milk_category, pricing_type, is_active, created_at;`,
      [
        organizationId,
        dto.centerId || null,
        dto.name.trim(),
        dto.milkCategory,
        dto.pricingType || 'GRID',
      ]
    );

    const r = res.rows[0];

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (organization_id, center_id, user_id, action, entity_type, entity_id, new_values)
       VALUES ($1, $2, $3, 'RATE_CHART_CREATED', 'RATE_CHART', $4, $5);`,
      [
        organizationId,
        dto.centerId || null,
        createdBy,
        r.id,
        JSON.stringify({ name: r.name, milkCategory: r.milk_category, centerId: r.center_id }),
      ]
    );

    return {
      id: r.id,
      organizationId: r.organization_id,
      centerId: r.center_id,
      name: r.name,
      milkCategory: r.milk_category,
      pricingType: r.pricing_type,
      centerScope: r.center_id ? 'CENTER_SPECIFIC' : 'ORGANIZATION_WIDE',
      isActive: r.is_active,
      createdAt: r.created_at.toISOString(),
    };
  }

  /**
   * List versions of a rate chart.
   */
  public static async listRateChartVersions(
    rateChartId: string,
    organizationId: string
  ): Promise<RateChartVersionDTO[]> {
    // Verify chart belongs to organization
    await this.getRateChartById(rateChartId, organizationId);

    const res = await pool.query(
      `SELECT rcv.id, rcv.rate_chart_id, rcv.version_number, rcv.status,
              rcv.effective_from, rcv.effective_to, rcv.pricing_unit, rcv.measurement_unit,
              rcv.fat_min, rcv.fat_max, rcv.snf_min, rcv.snf_max,
              rcv.is_approved, rcv.approved_by, rcv.approved_at,
              rcv.submitted_by, rcv.submitted_at, rcv.published_by, rcv.published_at,
              rcv.notes, rcv.created_at, rcv.updated_at,
              COUNT(rcc.id)::int as cell_count
       FROM rate_chart_versions rcv
       LEFT JOIN rate_chart_cells rcc ON rcc.rate_chart_version_id = rcv.id
       WHERE rcv.rate_chart_id = $1
       GROUP BY rcv.id
       ORDER BY rcv.version_number DESC;`,
      [rateChartId]
    );

    return res.rows.map(r => ({
      id: r.id,
      rateChartId: r.rate_chart_id,
      versionNumber: r.version_number,
      status: r.status as RateVersionStatus,
      effectiveFrom: r.effective_from.toISOString(),
      effectiveTo: r.effective_to ? r.effective_to.toISOString() : null,
      pricingUnit: r.pricing_unit,
      measurementUnit: r.measurement_unit,
      fatMin: r.fat_min ? Number(r.fat_min) : null,
      fatMax: r.fat_max ? Number(r.fat_max) : null,
      snfMin: r.snf_min ? Number(r.snf_min) : null,
      snfMax: r.snf_max ? Number(r.snf_max) : null,
      isApproved: r.is_approved,
      approvedBy: r.approved_by,
      approvedAt: r.approved_at ? r.approved_at.toISOString() : null,
      submittedBy: r.submitted_by,
      submittedAt: r.submitted_at ? r.submitted_at.toISOString() : null,
      publishedBy: r.published_by,
      publishedAt: r.published_at ? r.published_at.toISOString() : null,
      notes: r.notes,
      cellCount: r.cell_count,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    }));
  }

  /**
   * Get single rate chart version with its complete cell matrix.
   */
  public static async getRateChartVersion(
    rateChartId: string,
    versionId: string,
    organizationId: string
  ): Promise<RateChartVersionDTO> {
    await this.getRateChartById(rateChartId, organizationId);

    const vRes = await pool.query(
      `SELECT rcv.*
       FROM rate_chart_versions rcv
       WHERE rcv.id = $1 AND rcv.rate_chart_id = $2;`,
      [versionId, rateChartId]
    );

    if (vRes.rows.length === 0) {
      throw new AppError(`Rate chart version ${versionId} not found`, 404, 'RATE_VERSION_NOT_FOUND');
    }

    const r = vRes.rows[0];

    // Fetch cells
    const cellRes = await pool.query(
      `SELECT id, rate_chart_version_id, fat_percentage, snf_percentage, rate_per_unit
       FROM rate_chart_cells
       WHERE rate_chart_version_id = $1
       ORDER BY fat_percentage ASC, snf_percentage ASC;`,
      [versionId]
    );

    const cells: RateChartCellDTO[] = cellRes.rows.map(c => ({
      id: c.id,
      rateChartVersionId: c.rate_chart_version_id,
      fatPercentage: Number(c.fat_percentage),
      snfPercentage: Number(c.snf_percentage),
      ratePerUnit: Number(c.rate_per_unit),
    }));

    return {
      id: r.id,
      rateChartId: r.rate_chart_id,
      versionNumber: r.version_number,
      status: r.status as RateVersionStatus,
      effectiveFrom: r.effective_from.toISOString(),
      effectiveTo: r.effective_to ? r.effective_to.toISOString() : null,
      pricingUnit: r.pricing_unit,
      measurementUnit: r.measurement_unit,
      fatMin: r.fat_min ? Number(r.fat_min) : null,
      fatMax: r.fat_max ? Number(r.fat_max) : null,
      snfMin: r.snf_min ? Number(r.snf_min) : null,
      snfMax: r.snf_max ? Number(r.snf_max) : null,
      isApproved: r.is_approved,
      approvedBy: r.approved_by,
      approvedAt: r.approved_at ? r.approved_at.toISOString() : null,
      submittedBy: r.submitted_by,
      submittedAt: r.submitted_at ? r.submitted_at.toISOString() : null,
      publishedBy: r.published_by,
      publishedAt: r.published_at ? r.published_at.toISOString() : null,
      notes: r.notes,
      cellCount: cells.length,
      cells,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    };
  }

  /**
   * Create a new version for a rate chart. Starts in DRAFT status.
   */
  public static async createRateChartVersion(
    rateChartId: string,
    organizationId: string,
    dto: {
      effectiveFrom: string;
      effectiveTo?: string | null;
      pricingUnit?: string;
      measurementUnit?: string;
      notes?: string | null;
      fatMin?: number | null;
      fatMax?: number | null;
      snfMin?: number | null;
      snfMax?: number | null;
    },
    createdBy: string
  ): Promise<RateChartVersionDTO> {
    await this.getRateChartById(rateChartId, organizationId);

    // Calculate next version number
    const numRes = await pool.query(
      `SELECT COALESCE(MAX(version_number), 0) + 1 as next_version
       FROM rate_chart_versions
       WHERE rate_chart_id = $1;`,
      [rateChartId]
    );
    const nextVersionNumber = numRes.rows[0].next_version;

    const res = await pool.query(
      `INSERT INTO rate_chart_versions (
         rate_chart_id, version_number, status, effective_from, effective_to,
         pricing_unit, measurement_unit, fat_min, fat_max, snf_min, snf_max,
         is_approved, notes, created_at, updated_at
       ) VALUES ($1, $2, 'DRAFT', $3, $4, $5, $6, $7, $8, $9, $10, FALSE, $11, NOW(), NOW())
       RETURNING *;`,
      [
        rateChartId,
        nextVersionNumber,
        dto.effectiveFrom,
        dto.effectiveTo || null,
        dto.pricingUnit || 'PER_KG',
        dto.measurementUnit || 'KG',
        dto.fatMin || null,
        dto.fatMax || null,
        dto.snfMin || null,
        dto.snfMax || null,
        dto.notes || null,
      ]
    );

    const r = res.rows[0];

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, action, entity_type, entity_id, new_values)
       VALUES ($1, $2, 'RATE_CHART_VERSION_CREATED', 'RATE_CHART_VERSION', $3, $4);`,
      [
        organizationId,
        createdBy,
        r.id,
        JSON.stringify({ rateChartId, versionNumber: nextVersionNumber, effectiveFrom: dto.effectiveFrom }),
      ]
    );

    return {
      id: r.id,
      rateChartId: r.rate_chart_id,
      versionNumber: r.version_number,
      status: 'DRAFT',
      effectiveFrom: r.effective_from.toISOString(),
      effectiveTo: r.effective_to ? r.effective_to.toISOString() : null,
      pricingUnit: r.pricing_unit,
      measurementUnit: r.measurement_unit,
      isApproved: false,
      notes: r.notes,
      cellCount: 0,
      cells: [],
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    };
  }

  /**
   * Configure matrix cells for a DRAFT version.
   * STRICT IMMUTABILITY: Cannot modify an already PUBLISHED version!
   */
  public static async updateMatrixCells(
    rateChartId: string,
    versionId: string,
    organizationId: string,
    cells: Array<{ fatPercentage: number; snfPercentage: number; ratePerUnit: number }>,
    updatedBy: string
  ): Promise<{ versionId: string; cellCount: number; isValid: boolean }> {
    const chart = await this.getRateChartById(rateChartId, organizationId);

    const vRes = await pool.query(
      `SELECT id, status, version_number FROM rate_chart_versions WHERE id = $1 AND rate_chart_id = $2 FOR UPDATE;`,
      [versionId, rateChartId]
    );

    if (vRes.rows.length === 0) {
      throw new AppError(`Rate chart version ${versionId} not found`, 404, 'RATE_VERSION_NOT_FOUND');
    }

    const version = vRes.rows[0];

    // Immutability Check: published charts cannot be modified
    if (['PUBLISHED', 'SUPERSEDED', 'ARCHIVED'].includes(version.status)) {
      throw new AppError(
        `RATE_CHART_IMMUTABLE: Cannot modify cells in a ${version.status} rate chart version. Create a new version instead.`,
        400,
        'RATE_CHART_IMMUTABLE'
      );
    }

    // Validate cells using shared validation engine
    const validation = validateRateMatrix(cells, chart.milkCategory as MilkCategory);
    if (!validation.isValid) {
      throw new AppError(
        `Matrix validation failed: ${validation.errors.join('; ')}`,
        400,
        'MATRIX_VALIDATION_FAILED'
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN;');

      // Delete existing draft cells
      await client.query(
        'DELETE FROM rate_chart_cells WHERE rate_chart_version_id = $1;',
        [versionId]
      );

      // Insert new cells batch
      for (const cell of cells) {
        await client.query(
          `INSERT INTO rate_chart_cells (rate_chart_version_id, fat_percentage, snf_percentage, rate_per_unit)
           VALUES ($1, $2, $3, $4);`,
          [versionId, cell.fatPercentage, cell.snfPercentage, cell.ratePerUnit]
        );
      }

      await client.query(
        'UPDATE rate_chart_versions SET updated_at = NOW() WHERE id = $1;',
        [versionId]
      );

      // Audit log
      await client.query(
        `INSERT INTO audit_logs (organization_id, user_id, action, entity_type, entity_id, new_values)
         VALUES ($1, $2, 'RATE_CHART_MATRIX_UPDATED', 'RATE_CHART_VERSION', $3, $4);`,
        [
          organizationId,
          updatedBy,
          versionId,
          JSON.stringify({ cellCount: cells.length, versionNumber: version.version_number }),
        ]
      );

      await client.query('COMMIT;');

      return {
        versionId,
        cellCount: cells.length,
        isValid: true,
      };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Preview calculation against a specific version (DRAFT or published).
   */
  public static async previewCalculation(
    _rateChartId: string,
    versionId: string,
    dto: {
      fat: number;
      snf: number;
      netWeight: number;
      measurementUnit?: string;
    }
  ): Promise<{
    versionId: string;
    fat: number;
    snf: number;
    netWeight: number;
    measurementUnit: string;
    pricingUnit: string;
    appliedRate: number;
    totalAmount: number;
    calculationRule: string;
  }> {
    const roundedFat = Math.round(dto.fat * 10) / 10;
    const roundedSnf = Math.round(dto.snf * 10) / 10;

    const cellRes = await pool.query(
      `SELECT rate_per_unit
       FROM rate_chart_cells
       WHERE rate_chart_version_id = $1
         AND ROUND(fat_percentage::numeric, 1) = $2
         AND ROUND(snf_percentage::numeric, 1) = $3;`,
      [versionId, roundedFat, roundedSnf]
    );

    if (cellRes.rows.length === 0) {
      throw new AppError(
        `RATE_CELL_NOT_FOUND: No exact rate cell found in version ${versionId} for Fat: ${roundedFat}%, SNF: ${roundedSnf}%`,
        404,
        'RATE_CELL_NOT_FOUND'
      );
    }

    const appliedRate = parseFloat(cellRes.rows[0].rate_per_unit);
    const totalAmount = Math.round((dto.netWeight * appliedRate + Number.EPSILON) * 100) / 100;

    return {
      versionId,
      fat: roundedFat,
      snf: roundedSnf,
      netWeight: dto.netWeight,
      measurementUnit: dto.measurementUnit || 'KG',
      pricingUnit: 'PER_KG',
      appliedRate,
      totalAmount,
      calculationRule: 'EXACT_FAT_SNF_MATRIX_CELL',
    };
  }

  /**
   * Submit version for approval (transitions DRAFT -> SUBMITTED).
   */
  public static async submitForApproval(
    rateChartId: string,
    versionId: string,
    organizationId: string,
    submittedBy: string
  ): Promise<RateChartVersionDTO> {
    await this.getRateChartById(rateChartId, organizationId);

    const vRes = await pool.query(
      `SELECT rcv.*, COUNT(rcc.id)::int as cell_count
       FROM rate_chart_versions rcv
       LEFT JOIN rate_chart_cells rcc ON rcc.rate_chart_version_id = rcv.id
       WHERE rcv.id = $1 AND rcv.rate_chart_id = $2
       GROUP BY rcv.id;`,
      [versionId, rateChartId]
    );

    if (vRes.rows.length === 0) {
      throw new AppError(`Rate chart version ${versionId} not found`, 404, 'RATE_VERSION_NOT_FOUND');
    }

    const version = vRes.rows[0];

    if (version.status !== 'DRAFT') {
      throw new AppError(
        `Only DRAFT versions can be submitted for approval (current status: ${version.status})`,
        400,
        'INVALID_STATUS_TRANSITION'
      );
    }

    if (version.cell_count === 0) {
      throw new AppError(
        'Cannot submit a rate chart version with 0 matrix cells for approval',
        400,
        'EMPTY_RATE_MATRIX'
      );
    }

    const updateRes = await pool.query(
      `UPDATE rate_chart_versions
       SET status = 'SUBMITTED',
           submitted_by = $1,
           submitted_at = NOW(),
           updated_at = NOW()
       WHERE id = $2
       RETURNING *;`,
      [submittedBy, versionId]
    );

    const r = updateRes.rows[0];
    return {
      id: r.id,
      rateChartId: r.rate_chart_id,
      versionNumber: r.version_number,
      status: 'SUBMITTED',
      effectiveFrom: r.effective_from.toISOString(),
      effectiveTo: r.effective_to ? r.effective_to.toISOString() : null,
      pricingUnit: r.pricing_unit,
      measurementUnit: r.measurement_unit,
      isApproved: false,
      submittedBy: r.submitted_by,
      submittedAt: r.submitted_at.toISOString(),
      cellCount: version.cell_count,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    };
  }

  /**
   * Approve rate chart version (requires Dairy Owner / Admin role).
   */
  public static async approveVersion(
    rateChartId: string,
    versionId: string,
    organizationId: string,
    approvedBy: string
  ): Promise<RateChartVersionDTO> {
    await this.getRateChartById(rateChartId, organizationId);

    const vRes = await pool.query(
      `SELECT rcv.*, COUNT(rcc.id)::int as cell_count
       FROM rate_chart_versions rcv
       LEFT JOIN rate_chart_cells rcc ON rcc.rate_chart_version_id = rcv.id
       WHERE rcv.id = $1 AND rcv.rate_chart_id = $2
       GROUP BY rcv.id;`,
      [versionId, rateChartId]
    );

    if (vRes.rows.length === 0) {
      throw new AppError(`Rate chart version ${versionId} not found`, 404, 'RATE_VERSION_NOT_FOUND');
    }

    const version = vRes.rows[0];

    if (version.status !== 'SUBMITTED' && version.status !== 'DRAFT') {
      throw new AppError(
        `Version cannot be approved in current status: ${version.status}`,
        400,
        'INVALID_STATUS_TRANSITION'
      );
    }

    if (version.cell_count === 0) {
      throw new AppError('Cannot approve a version with 0 rate cells', 400, 'EMPTY_RATE_MATRIX');
    }

    const updateRes = await pool.query(
      `UPDATE rate_chart_versions
       SET status = 'APPROVED',
           is_approved = TRUE,
           approved_by = $1,
           approved_at = NOW(),
           updated_at = NOW()
       WHERE id = $2
       RETURNING *;`,
      [approvedBy, versionId]
    );

    const r = updateRes.rows[0];
    return {
      id: r.id,
      rateChartId: r.rate_chart_id,
      versionNumber: r.version_number,
      status: 'APPROVED',
      effectiveFrom: r.effective_from.toISOString(),
      effectiveTo: r.effective_to ? r.effective_to.toISOString() : null,
      pricingUnit: r.pricing_unit,
      measurementUnit: r.measurement_unit,
      isApproved: true,
      approvedBy: r.approved_by,
      approvedAt: r.approved_at.toISOString(),
      cellCount: version.cell_count,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    };
  }

  /**
   * Publish rate chart version:
   * Calls publish_rate_chart_version RPC, supersedes earlier versions,
   * enforces immutability, and emits sync event.
   */
  public static async publishVersion(
    rateChartId: string,
    versionId: string,
    organizationId: string,
    publishedBy: string
  ): Promise<any> {
    await this.getRateChartById(rateChartId, organizationId);

    const rpcRes = await pool.query(
      `SELECT public.publish_rate_chart_version($1, $2, $3) as result;`,
      [rateChartId, versionId, publishedBy]
    );

    return rpcRes.rows[0].result;
  }

  /**
   * Retrieves active approved rate chart and version for a given center and milk category.
   * Priority:
   * 1. rate_applicability_rules matching center_id
   * 2. Center-specific chart
   * 3. Organization-wide chart (center_id IS NULL)
   */
  public static async getActiveRateVersion(
    centerId: string,
    organizationId: string,
    milkCategory: MilkCategory,
    effectiveDate?: string
  ): Promise<any> {
    const targetDate = effectiveDate || new Date().toISOString();

    const res = await pool.query(
      `SELECT rc.id as rate_chart_id, rc.name, rc.milk_category, rc.pricing_type,
              rcv.id as version_id, rcv.version_number, rcv.status, rcv.effective_from, rcv.effective_to,
              rcv.pricing_unit, rcv.measurement_unit, rcv.is_approved
       FROM rate_charts rc
       JOIN rate_chart_versions rcv ON rcv.rate_chart_id = rc.id
       LEFT JOIN rate_applicability_rules rar ON rar.rate_chart_id = rc.id AND rar.center_id = $2 AND rar.is_active = TRUE
       WHERE rc.organization_id = $1
         AND (rc.center_id = $2 OR rc.center_id IS NULL OR rar.id IS NOT NULL)
         AND rc.milk_category = $3
         AND rc.is_active = TRUE
         AND (rcv.status = 'PUBLISHED' OR rcv.is_approved = TRUE)
         AND rcv.effective_from <= $4
         AND (rcv.effective_to IS NULL OR rcv.effective_to >= $4)
       ORDER BY rar.priority NULLS LAST, (rc.center_id IS NOT NULL) DESC, rcv.version_number DESC
       LIMIT 1;`,
      [organizationId, centerId, milkCategory, targetDate]
    );

    if (res.rows.length === 0) {
      throw new AppError(
        `No approved active rate chart found for center ${centerId} and milk category ${milkCategory}`,
        404,
        'RATE_CHART_NOT_FOUND'
      );
    }

    return res.rows[0];
  }

  /**
   * Authoritative backend rate calculation.
   * STRICT ENFORCEMENT:
   * - Canonical unit is KILOGRAM (KG).
   * - Explicit quantity unit verification.
   * - Exact matrix cell lookup; NO guessing, NO interpolation.
   * - Returns RATE_CELL_NOT_FOUND (404) on missing cell.
   * - Half-Even banker's rounding to 2 decimals.
   */
  public static async calculateRate(
    centerId: string,
    organizationId: string,
    milkCategory: MilkCategory,
    fat: number,
    snf: number,
    netWeight: number,
    overrideVersionId?: string,
    businessDate?: string,
    explicitUnit: string = 'KG'
  ): Promise<RateCalculationResultDTO> {
    // Unit validation: Disallow silent conversions
    if (explicitUnit.toUpperCase() !== 'KG' && explicitUnit.toUpperCase() !== 'KILOGRAM') {
      throw new AppError(
        `CANONICAL_UNIT_MISMATCH: Milk weighing source unit must be explicit 'KG'. Received '${explicitUnit}'. Never assume 1 KG = 1 Liter.`,
        400,
        'MEASUREMENT_UNIT_MISMATCH'
      );
    }

    if (netWeight <= 0) {
      throw new AppError('Net weight must be greater than 0', 400, 'INVALID_NET_WEIGHT');
    }

    let version: any;
    if (overrideVersionId) {
      const vRes = await pool.query(
        `SELECT rcv.id as version_id, rcv.version_number, rcv.rate_chart_id, rc.name, rc.milk_category,
                rcv.status, rcv.is_approved, rcv.pricing_unit, rcv.measurement_unit
         FROM rate_chart_versions rcv
         JOIN rate_charts rc ON rc.id = rcv.rate_chart_id
         WHERE rcv.id = $1;`,
        [overrideVersionId]
      );
      if (vRes.rows.length === 0) {
        throw new AppError(`Rate chart version ${overrideVersionId} not found`, 404, 'RATE_VERSION_NOT_FOUND');
      }
      version = vRes.rows[0];
    } else {
      version = await this.getActiveRateVersion(centerId, organizationId, milkCategory, businessDate);
    }

    const roundedFat = Math.round(fat * 10) / 10;
    const roundedSnf = Math.round(snf * 10) / 10;

    // Strict exact cell query
    const cellRes = await pool.query(
      `SELECT rate_per_unit 
       FROM rate_chart_cells 
       WHERE rate_chart_version_id = $1 
         AND ROUND(fat_percentage::numeric, 1) = $2 
         AND ROUND(snf_percentage::numeric, 1) = $3;`,
      [version.version_id, roundedFat, roundedSnf]
    );

    if (cellRes.rows.length === 0) {
      throw new AppError(
        `Controlled Pricing Error: No approved rate cell found for ${milkCategory} at Fat: ${roundedFat}%, SNF: ${roundedSnf}% in rate version ${version.version_number}`,
        404,
        'RATE_CELL_NOT_FOUND'
      );
    }

    const appliedRate = parseFloat(cellRes.rows[0].rate_per_unit);
    // Exact bankers rounding to 2 decimals
    const totalAmount = Math.round((netWeight * appliedRate + Number.EPSILON) * 100) / 100;

    return {
      rateChartId: version.rate_chart_id,
      rateChartName: version.name,
      rateVersionId: version.version_id,
      rateVersionNumber: version.version_number,
      milkCategory,
      fatPercentage: roundedFat,
      snfPercentage: roundedSnf,
      netWeight,
      appliedRate,
      pricingUnit: (version.pricing_unit || 'PER_KG') as 'PER_KG' | 'PER_LITER',
      measurementUnit: 'KG',
      totalAmount,
      calculationRule: 'EXACT_FAT_SNF_MATRIX_CELL',
      roundingMode: 'HALF_EVEN_2_DECIMALS',
    };
  }
}
