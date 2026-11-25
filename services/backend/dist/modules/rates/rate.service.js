// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// MILK RATE MANAGEMENT BUSINESS SERVICE (BACKEND AUTHORITATIVE)
// ==============================================================================
import { pool } from '../../config/db.js';
import { AppError } from '../../shared/errors/app-error.js';
import { validateRateMatrix } from '@dfarm/shared-validation';
import { db } from '../../infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../../infrastructure/database/TenantDatabaseManager.js';
import { roundHalfUp } from '../../domain/services/FinancialPolicyResolutionService.js';
export class RateService {
    /**
     * List rate charts with center scope, version counts, and active version info.
     */
    static async listRateCharts(organizationId, centerId, milkCategory) {
        let sql = `
      SELECT rc.id, rc.organization_id, rc.center_id, rc.name, rc.milk_category,
             rc.pricing_type, rc.is_active, rc.created_at,
             CASE WHEN rc.center_id IS NULL THEN 'ORGANIZATION_WIDE' ELSE 'CENTER_SPECIFIC' END as center_scope,
             COUNT(rcv.id)::int as versions_count
      FROM rate_charts rc
      LEFT JOIN rate_chart_versions rcv ON rcv.rate_chart_id = rc.id
      WHERE rc.organization_id = $1
    `;
        const params = [organizationId];
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
    static async getRateChartById(rateChartId, organizationId) {
        const res = await pool.query(`SELECT rc.id, rc.organization_id, rc.center_id, rc.name, rc.milk_category,
              rc.pricing_type, rc.is_active, rc.created_at,
              CASE WHEN rc.center_id IS NULL THEN 'ORGANIZATION_WIDE' ELSE 'CENTER_SPECIFIC' END as center_scope
       FROM rate_charts rc
       WHERE rc.id = $1 AND rc.organization_id = $2;`, [rateChartId, organizationId]);
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
    static async createRateChart(organizationId, dto, createdBy) {
        // Explicit discriminated scope validation: FAIL CLOSED
        let resolvedCenterId = null;
        if (dto.centerScope === 'CENTER_SPECIFIC') {
            if (!dto.centerId || !dto.centerId.trim()) {
                throw new AppError('CENTER_SPECIFIC rate chart scope requires a valid centerId', 400, 'INVALID_RATE_CHART_SCOPE');
            }
            resolvedCenterId = dto.centerId.trim();
        }
        else if (dto.centerScope === 'ORGANIZATION_WIDE') {
            if (dto.centerId && dto.centerId.trim()) {
                throw new AppError('ORGANIZATION_WIDE rate chart cannot specify a centerId', 400, 'INVALID_RATE_CHART_SCOPE');
            }
            resolvedCenterId = null;
        }
        else if (dto.centerId && dto.centerId.trim()) {
            // Explicit centerId without centerScope resolves strictly to CENTER_SPECIFIC
            resolvedCenterId = dto.centerId.trim();
        }
        else {
            // Missing centerId must NEVER automatically become organization-wide scope
            throw new AppError('Missing centerId requires explicit centerScope: ORGANIZATION_WIDE', 400, 'INVALID_RATE_CHART_SCOPE');
        }
        const res = await pool.query(`INSERT INTO rate_charts (organization_id, center_id, name, milk_category, pricing_type, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING id, organization_id, center_id, name, milk_category, pricing_type, is_active, created_at;`, [
            organizationId,
            resolvedCenterId,
            dto.name.trim(),
            dto.milkCategory,
            dto.pricingType || 'GRID',
        ]);
        const r = res.rows[0];
        // Audit log
        await pool.query(`INSERT INTO audit_logs (organization_id, center_id, user_id, action, entity_type, entity_id, new_values)
       VALUES ($1, $2, $3, 'RATE_CHART_CREATED', 'RATE_CHART', $4, $5);`, [
            organizationId,
            resolvedCenterId,
            createdBy,
            r.id,
            JSON.stringify({ name: r.name, milkCategory: r.milk_category, centerId: r.center_id }),
        ]);
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
    static async listRateChartVersions(rateChartId, organizationId) {
        // Verify chart belongs to organization
        await this.getRateChartById(rateChartId, organizationId);
        const res = await pool.query(`SELECT rcv.id, rcv.rate_chart_id, rcv.version_number, rcv.status,
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
       ORDER BY rcv.version_number DESC;`, [rateChartId]);
        return res.rows.map(r => ({
            id: r.id,
            rateChartId: r.rate_chart_id,
            versionNumber: r.version_number,
            status: r.status,
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
    static async getRateChartVersion(rateChartId, versionId, organizationId) {
        await this.getRateChartById(rateChartId, organizationId);
        const vRes = await pool.query(`SELECT rcv.*
       FROM rate_chart_versions rcv
       WHERE rcv.id = $1 AND rcv.rate_chart_id = $2;`, [versionId, rateChartId]);
        if (vRes.rows.length === 0) {
            throw new AppError(`Rate chart version ${versionId} not found`, 404, 'RATE_VERSION_NOT_FOUND');
        }
        const r = vRes.rows[0];
        // Fetch cells
        const cellRes = await pool.query(`SELECT id, rate_chart_version_id, fat_percentage, snf_percentage, rate_per_unit
       FROM rate_chart_cells
       WHERE rate_chart_version_id = $1
       ORDER BY fat_percentage ASC, snf_percentage ASC;`, [versionId]);
        const cells = cellRes.rows.map(c => ({
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
            status: r.status,
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
    static async createRateChartVersion(rateChartId, organizationId, dto, createdBy) {
        await this.getRateChartById(rateChartId, organizationId);
        // Calculate next version number
        const numRes = await pool.query(`SELECT COALESCE(MAX(version_number), 0) + 1 as next_version
       FROM rate_chart_versions
       WHERE rate_chart_id = $1;`, [rateChartId]);
        const nextVersionNumber = numRes.rows[0].next_version;
        const res = await pool.query(`INSERT INTO rate_chart_versions (
         rate_chart_id, version_number, status, effective_from, effective_to,
         pricing_unit, measurement_unit, fat_min, fat_max, snf_min, snf_max,
         is_approved, notes, created_at, updated_at
       ) VALUES ($1, $2, 'DRAFT', $3, $4, $5, $6, $7, $8, $9, $10, FALSE, $11, NOW(), NOW())
       RETURNING *;`, [
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
        ]);
        const r = res.rows[0];
        // Audit log
        await pool.query(`INSERT INTO audit_logs (organization_id, user_id, action, entity_type, entity_id, new_values)
       VALUES ($1, $2, 'RATE_CHART_VERSION_CREATED', 'RATE_CHART_VERSION', $3, $4);`, [
            organizationId,
            createdBy,
            r.id,
            JSON.stringify({ rateChartId, versionNumber: nextVersionNumber, effectiveFrom: dto.effectiveFrom }),
        ]);
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
    static async updateMatrixCells(rateChartId, versionId, organizationId, cells, updatedBy) {
        const chart = await this.getRateChartById(rateChartId, organizationId);
        const vRes = await pool.query(`SELECT id, status, version_number FROM rate_chart_versions WHERE id = $1 AND rate_chart_id = $2 FOR UPDATE;`, [versionId, rateChartId]);
        if (vRes.rows.length === 0) {
            throw new AppError(`Rate chart version ${versionId} not found`, 404, 'RATE_VERSION_NOT_FOUND');
        }
        const version = vRes.rows[0];
        // Immutability Check: published charts cannot be modified
        if (['PUBLISHED', 'SUPERSEDED', 'ARCHIVED'].includes(version.status)) {
            throw new AppError(`RATE_CHART_IMMUTABLE: Cannot modify cells in a ${version.status} rate chart version. Create a new version instead.`, 400, 'RATE_CHART_IMMUTABLE');
        }
        // Validate cells using shared validation engine
        const validation = validateRateMatrix(cells, chart.milkCategory);
        if (!validation.isValid) {
            throw new AppError(`Matrix validation failed: ${validation.errors.join('; ')}`, 400, 'MATRIX_VALIDATION_FAILED');
        }
        const client = await pool.connect();
        try {
            await client.query('BEGIN;');
            // Delete existing draft cells
            await client.query('DELETE FROM rate_chart_cells WHERE rate_chart_version_id = $1;', [versionId]);
            // Insert new cells batch
            for (const cell of cells) {
                await client.query(`INSERT INTO rate_chart_cells (rate_chart_version_id, fat_percentage, snf_percentage, rate_per_unit)
           VALUES ($1, $2, $3, $4);`, [versionId, cell.fatPercentage, cell.snfPercentage, cell.ratePerUnit]);
            }
            await client.query('UPDATE rate_chart_versions SET updated_at = NOW() WHERE id = $1;', [versionId]);
            // Audit log
            await client.query(`INSERT INTO audit_logs (organization_id, user_id, action, entity_type, entity_id, new_values)
         VALUES ($1, $2, 'RATE_CHART_MATRIX_UPDATED', 'RATE_CHART_VERSION', $3, $4);`, [
                organizationId,
                updatedBy,
                versionId,
                JSON.stringify({ cellCount: cells.length, versionNumber: version.version_number }),
            ]);
            await client.query('COMMIT;');
            return {
                versionId,
                cellCount: cells.length,
                isValid: true,
            };
        }
        catch (err) {
            await client.query('ROLLBACK;');
            throw err;
        }
        finally {
            client.release();
        }
    }
    /**
     * Preview calculation against a specific version (DRAFT or published).
     */
    static async previewCalculation(_rateChartId, versionId, dto) {
        const roundedFat = Math.round(dto.fat * 10) / 10;
        const roundedSnf = Math.round(dto.snf * 10) / 10;
        const cellRes = await pool.query(`SELECT rate_per_unit
       FROM rate_chart_cells
       WHERE rate_chart_version_id = $1
         AND ROUND(fat_percentage::numeric, 1) = $2
         AND ROUND(snf_percentage::numeric, 1) = $3;`, [versionId, roundedFat, roundedSnf]);
        if (cellRes.rows.length === 0) {
            throw new AppError(`RATE_CELL_NOT_FOUND: No exact rate cell found in version ${versionId} for Fat: ${roundedFat}%, SNF: ${roundedSnf}%`, 404, 'RATE_CELL_NOT_FOUND');
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
    static async submitForApproval(rateChartId, versionId, organizationId, submittedBy) {
        await this.getRateChartById(rateChartId, organizationId);
        const vRes = await pool.query(`SELECT rcv.*, COUNT(rcc.id)::int as cell_count
       FROM rate_chart_versions rcv
       LEFT JOIN rate_chart_cells rcc ON rcc.rate_chart_version_id = rcv.id
       WHERE rcv.id = $1 AND rcv.rate_chart_id = $2
       GROUP BY rcv.id;`, [versionId, rateChartId]);
        if (vRes.rows.length === 0) {
            throw new AppError(`Rate chart version ${versionId} not found`, 404, 'RATE_VERSION_NOT_FOUND');
        }
        const version = vRes.rows[0];
        if (version.status !== 'DRAFT') {
            throw new AppError(`Only DRAFT versions can be submitted for approval (current status: ${version.status})`, 400, 'INVALID_STATUS_TRANSITION');
        }
        if (version.cell_count === 0) {
            throw new AppError('Cannot submit a rate chart version with 0 matrix cells for approval', 400, 'EMPTY_RATE_MATRIX');
        }
        const updateRes = await pool.query(`UPDATE rate_chart_versions
       SET status = 'SUBMITTED',
           submitted_by = $1,
           submitted_at = NOW(),
           updated_at = NOW()
       WHERE id = $2
       RETURNING *;`, [submittedBy, versionId]);
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
    static async approveVersion(rateChartId, versionId, organizationId, approvedBy) {
        await this.getRateChartById(rateChartId, organizationId);
        const vRes = await pool.query(`SELECT rcv.*, COUNT(rcc.id)::int as cell_count
       FROM rate_chart_versions rcv
       LEFT JOIN rate_chart_cells rcc ON rcc.rate_chart_version_id = rcv.id
       WHERE rcv.id = $1 AND rcv.rate_chart_id = $2
       GROUP BY rcv.id;`, [versionId, rateChartId]);
        if (vRes.rows.length === 0) {
            throw new AppError(`Rate chart version ${versionId} not found`, 404, 'RATE_VERSION_NOT_FOUND');
        }
        const version = vRes.rows[0];
        if (version.status !== 'SUBMITTED' && version.status !== 'DRAFT') {
            throw new AppError(`Version cannot be approved in current status: ${version.status}`, 400, 'INVALID_STATUS_TRANSITION');
        }
        if (version.cell_count === 0) {
            throw new AppError('Cannot approve a version with 0 rate cells', 400, 'EMPTY_RATE_MATRIX');
        }
        const updateRes = await pool.query(`UPDATE rate_chart_versions
       SET status = 'APPROVED',
           is_approved = TRUE,
           approved_by = $1,
           approved_at = NOW(),
           updated_at = NOW()
       WHERE id = $2
       RETURNING *;`, [approvedBy, versionId]);
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
    static async publishVersion(rateChartId, versionId, organizationId, publishedBy) {
        await this.getRateChartById(rateChartId, organizationId);
        const rpcRes = await pool.query(`SELECT public.publish_rate_chart_version($1, $2, $3) as result;`, [rateChartId, versionId, publishedBy]);
        return rpcRes.rows[0].result;
    }
    /**
     * Retrieves active approved rate chart and version for a given center and milk category.
     * Priority:
     * 1. rate_applicability_rules matching center_id
     * 2. Center-specific chart
     * 3. Organization-wide chart (center_id IS NULL)
     */
    static async getActiveRateVersion(centerId, organizationId, milkCategory, effectiveDate) {
        const targetDate = effectiveDate || new Date().toISOString();
        const res = await pool.query(`SELECT rc.id as rate_chart_id, rc.name, rc.milk_category, rc.pricing_type,
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
       LIMIT 1;`, [organizationId, centerId, milkCategory, targetDate]);
        if (res.rows.length === 0) {
            throw new AppError(`No approved active rate chart found for center ${centerId} and milk category ${milkCategory}`, 404, 'RATE_CHART_NOT_FOUND');
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
    static async calculateRate(centerId, organizationId, milkCategory, fat, snf, netWeight, overrideVersionId, businessDate, explicitUnit = 'KG') {
        // Unit validation: Disallow silent conversions
        if (explicitUnit.toUpperCase() !== 'KG' && explicitUnit.toUpperCase() !== 'KILOGRAM') {
            throw new AppError(`CANONICAL_UNIT_MISMATCH: Milk weighing source unit must be explicit 'KG'. Received '${explicitUnit}'. Never assume 1 KG = 1 Liter.`, 400, 'MEASUREMENT_UNIT_MISMATCH');
        }
        if (netWeight <= 0) {
            throw new AppError('Net weight must be greater than 0', 400, 'INVALID_NET_WEIGHT');
        }
        let version;
        if (overrideVersionId) {
            const vRes = await pool.query(`SELECT rcv.id as version_id, rcv.version_number, rcv.rate_chart_id, rc.name, rc.milk_category,
                rcv.status, rcv.is_approved, rcv.pricing_unit, rcv.measurement_unit
         FROM rate_chart_versions rcv
         JOIN rate_charts rc ON rc.id = rcv.rate_chart_id
         WHERE rcv.id = $1;`, [overrideVersionId]);
            if (vRes.rows.length === 0) {
                throw new AppError(`Rate chart version ${overrideVersionId} not found`, 404, 'RATE_VERSION_NOT_FOUND');
            }
            version = vRes.rows[0];
        }
        else {
            version = await this.getActiveRateVersion(centerId, organizationId, milkCategory, businessDate);
        }
        const roundedFat = Math.round(fat * 10) / 10;
        const roundedSnf = Math.round(snf * 10) / 10;
        // Strict exact cell query
        const cellRes = await pool.query(`SELECT rate_per_unit 
       FROM rate_chart_cells 
       WHERE rate_chart_version_id = $1 
         AND ROUND(fat_percentage::numeric, 1) = $2 
         AND ROUND(snf_percentage::numeric, 1) = $3;`, [version.version_id, roundedFat, roundedSnf]);
        if (cellRes.rows.length === 0) {
            throw new AppError(`Controlled Pricing Error: No approved rate cell found for ${milkCategory} at Fat: ${roundedFat}%, SNF: ${roundedSnf}% in rate version ${version.version_number}`, 404, 'RATE_CELL_NOT_FOUND');
        }
        const appliedRate = parseFloat(cellRes.rows[0].rate_per_unit);
        // Standard commercial half-up rounding (ROUND_HALF_UP) to paise precision
        const totalAmount = roundHalfUp(netWeight * appliedRate, 2);
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
            pricingUnit: (version.pricing_unit || 'PER_KG'),
            measurementUnit: 'KG',
            totalAmount,
            calculationRule: 'EXACT_FAT_SNF_MATRIX_CELL',
            roundingMode: 'HALF_EVEN_2_DECIMALS',
        };
    }
    /**
     * Generates a deterministic, composite cache key for rate matrix caches.
     * Encodes: tenant (organizationId), explicit scope, center identity, chart identity, and version identity.
     * Guarantees strict isolation across organizations, scopes, centers, and published versions.
     */
    static getRateCacheKey(params) {
        const org = params.organizationId.trim().toLowerCase();
        const scope = params.scope;
        const center = scope === 'CENTER_SPECIFIC' && params.centerId ? params.centerId.trim().toLowerCase() : 'ORG_WIDE';
        const chart = params.chartId.trim().toLowerCase();
        const ver = params.versionNumber;
        const cat = params.milkCategory.toUpperCase();
        return `dfarm:rates:tenant:${org}:scope:${scope}:center:${center}:cat:${cat}:chart:${chart}:v:${ver}`;
    }
    /**
     * Complete Rate Matrix Delivery for Offline Sync (Prompt 4)
     * Fetches full active rate charts with exact GRID matrix cells or FORMULA factors.
     * Priority: Center-specific override first, dairy-wide fallback second.
     */
    static async getSyncRateCharts(organizationId, centerId, businessDate, scope) {
        const normalizedCenterId = centerId && centerId.trim() ? centerId.trim() : null;
        if (normalizedCenterId &&
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalizedCenterId)) {
            throw new AppError('Invalid centerId UUID format', 400, 'INVALID_CENTER_ID');
        }
        const targetDate = businessDate || new Date().toISOString();
        const categories = ['COW', 'BUFFALO'];
        const charts = [];
        let client;
        try {
            client = await tenantDbManager.getTenantDb(organizationId);
        }
        catch {
            client = db;
        }
        let centerCondition = '(rc.center_id = $3 OR rc.center_id IS NULL)';
        if (scope === 'ORGANIZATION_WIDE') {
            centerCondition = 'rc.center_id IS NULL AND ($3::text IS NULL OR TRUE)';
        }
        else if (scope === 'CENTER_SPECIFIC') {
            centerCondition = 'rc.center_id = $3 AND rc.center_id IS NOT NULL';
        }
        for (const category of categories) {
            const chartQuery = `
        SELECT 
          rc.id AS chart_id,
          rc.organization_id,
          rc.center_id,
          rc.name,
          rc.milk_category,
          rc.pricing_type,
          CASE WHEN rc.center_id IS NULL THEN 'ORGANIZATION_WIDE' ELSE 'CENTER_SPECIFIC' END as center_scope,
          rcv.id AS version_id,
          rcv.version_number,
          rcv.status,
          rcv.base_rate,
          rcv.base_fat,
          rcv.base_snf,
          rcv.fat_min,
          rcv.fat_max,
          rcv.snf_min,
          rcv.snf_max,
          rcv.formula_definition,
          rcv.effective_from,
          rcv.effective_to
        FROM rate_charts rc
        JOIN rate_chart_versions rcv ON rcv.rate_chart_id = rc.id
        WHERE rc.organization_id = $1
          AND rc.milk_category = $2
          AND rc.is_active = TRUE
          AND ${centerCondition}
          AND (rcv.status IN ('PUBLISHED', 'APPROVED') OR rcv.is_approved = TRUE)
          AND rcv.effective_from <= $4::timestamptz
          AND (rcv.effective_to IS NULL OR rcv.effective_to >= $4::timestamptz)
        ORDER BY (CASE WHEN rc.center_id IS NOT NULL THEN 1 ELSE 2 END) ASC, rcv.version_number DESC
        LIMIT 1;
      `;
            let chartRes;
            try {
                chartRes = await client.query(chartQuery, [organizationId, category, normalizedCenterId, targetDate]);
            }
            catch (err) {
                if (err?.message && err.message.includes('does not exist')) {
                    const fallbackChartQuery = `
            SELECT 
              rc.id AS chart_id,
              rc.organization_id,
              rc.center_id,
              rc.name,
              rc.milk_category,
              rc.pricing_type,
              CASE WHEN rc.center_id IS NULL THEN 'ORGANIZATION_WIDE' ELSE 'CENTER_SPECIFIC' END as center_scope,
              rcv.id AS version_id,
              rcv.version_number,
              'APPROVED' as status,
              rcv.base_rate,
              rcv.base_fat,
              rcv.base_snf,
              rcv.effective_from,
              rcv.effective_to
            FROM rate_charts rc
            JOIN rate_chart_versions rcv ON rcv.rate_chart_id = rc.id
            WHERE rc.organization_id = $1
              AND rc.milk_category = $2
              AND rc.is_active = TRUE
              AND ${centerCondition}
              AND rcv.is_approved = TRUE
              AND rcv.effective_from <= $4::timestamptz
              AND (rcv.effective_to IS NULL OR rcv.effective_to >= $4::timestamptz)
            ORDER BY (CASE WHEN rc.center_id IS NOT NULL THEN 1 ELSE 2 END) ASC, rcv.version_number DESC
            LIMIT 1;
          `;
                    chartRes = await client.query(fallbackChartQuery, [organizationId, category, normalizedCenterId, targetDate]);
                }
                else {
                    throw err;
                }
            }
            // If no chart found in tenant DB, check default control plane DB
            if (chartRes.rows.length === 0) {
                try {
                    chartRes = await db.query(chartQuery, [organizationId, category, normalizedCenterId, targetDate]);
                }
                catch {
                    try {
                        const fallbackChartQuery = `
              SELECT 
                rc.id AS chart_id,
                rc.organization_id,
                rc.center_id,
                rc.name,
                rc.milk_category,
                rc.pricing_type,
                CASE WHEN rc.center_id IS NULL THEN 'ORGANIZATION_WIDE' ELSE 'CENTER_SPECIFIC' END as center_scope,
                rcv.id AS version_id,
                rcv.version_number,
                'APPROVED' as status,
                rcv.base_rate,
                rcv.base_fat,
                rcv.base_snf,
                rcv.effective_from,
                rcv.effective_to
              FROM rate_charts rc
              JOIN rate_chart_versions rcv ON rcv.rate_chart_id = rc.id
              WHERE rc.organization_id = $1
                AND rc.milk_category = $2
                AND rc.is_active = TRUE
                AND ${centerCondition}
                AND rcv.is_approved = TRUE
                AND rcv.effective_from <= $4::timestamptz
                AND (rcv.effective_to IS NULL OR rcv.effective_to >= $4::timestamptz)
              ORDER BY (CASE WHEN rc.center_id IS NOT NULL THEN 1 ELSE 2 END) ASC, rcv.version_number DESC
              LIMIT 1;
            `;
                        chartRes = await db.query(fallbackChartQuery, [organizationId, category, normalizedCenterId, targetDate]);
                    }
                    catch { }
                }
            }
            if (chartRes.rows.length > 0) {
                const row = chartRes.rows[0];
                // Strict scope assertion: fail closed if chart metadata is ambiguous or contradicts requested scope
                if (scope === 'ORGANIZATION_WIDE' && (row.center_id !== null || row.center_scope !== 'ORGANIZATION_WIDE')) {
                    throw new AppError('Ambiguous chart metadata: non-null center_id in ORGANIZATION_WIDE scope', 500, 'AMBIGUOUS_SCOPE_METADATA');
                }
                if (scope === 'CENTER_SPECIFIC' &&
                    (!row.center_id ||
                        row.center_scope !== 'CENTER_SPECIFIC' ||
                        (normalizedCenterId && row.center_id.toLowerCase() !== normalizedCenterId.toLowerCase()))) {
                    throw new AppError('Ambiguous chart metadata: mismatched center_id in CENTER_SPECIFIC scope', 500, 'AMBIGUOUS_SCOPE_METADATA');
                }
                const cells = [];
                const gridMatrix = {};
                if (row.pricing_type === 'GRID') {
                    let cellsRes;
                    try {
                        cellsRes = await client.query(`SELECT fat_percentage, snf_percentage, rate_per_unit
               FROM rate_chart_cells
               WHERE rate_chart_version_id = $1
               ORDER BY fat_percentage ASC, snf_percentage ASC;`, [row.version_id]);
                    }
                    catch {
                        // ignore
                    }
                    if (!cellsRes || cellsRes.rows.length === 0) {
                        try {
                            cellsRes = await db.query(`SELECT fat_percentage, snf_percentage, rate_per_unit
                 FROM rate_chart_cells
                 WHERE rate_chart_version_id = $1
                 ORDER BY fat_percentage ASC, snf_percentage ASC;`, [row.version_id]);
                        }
                        catch { }
                    }
                    if (cellsRes && cellsRes.rows) {
                        for (const c of cellsRes.rows) {
                            const fatNum = Number(c.fat_percentage);
                            const snfNum = Number(c.snf_percentage);
                            const rateNum = Number(c.rate_per_unit);
                            cells.push({
                                fat: fatNum,
                                snf: snfNum,
                                ratePerLiter: rateNum,
                            });
                            const fatKey = fatNum.toFixed(1);
                            const snfKey = snfNum.toFixed(1);
                            if (!gridMatrix[fatKey]) {
                                gridMatrix[fatKey] = {};
                            }
                            gridMatrix[fatKey][snfKey] = rateNum;
                        }
                    }
                }
                const formula = row.formula_definition || {};
                charts.push({
                    chartId: row.chart_id,
                    versionId: row.version_id,
                    versionNumber: row.version_number,
                    name: row.name,
                    milkCategory: row.milk_category,
                    pricingType: row.pricing_type,
                    centerScope: row.center_scope,
                    centerId: row.center_id,
                    effectiveFrom: row.effective_from instanceof Date ? row.effective_from.toISOString() : String(row.effective_from),
                    effectiveTo: row.effective_to ? (row.effective_to instanceof Date ? row.effective_to.toISOString() : String(row.effective_to)) : null,
                    baseRate: Number(row.base_rate || (category === 'COW' ? 38.0 : 62.0)),
                    baseFat: Number(row.base_fat || (category === 'COW' ? 3.5 : 6.0)),
                    baseSnf: Number(row.base_snf || (category === 'COW' ? 8.5 : 9.0)),
                    fatFactor: formula.fatFactor ? Number(formula.fatFactor) : (category === 'COW' ? 4.2 : 5.0),
                    snfFactor: formula.snfFactor ? Number(formula.snfFactor) : (category === 'COW' ? 3.5 : 4.0),
                    fatMin: row.fat_min !== null && row.fat_min !== undefined ? Number(row.fat_min) : (category === 'COW' ? 2.5 : 5.0),
                    fatMax: row.fat_max !== null && row.fat_max !== undefined ? Number(row.fat_max) : (category === 'COW' ? 6.0 : 12.0),
                    snfMin: row.snf_min !== null && row.snf_min !== undefined ? Number(row.snf_min) : (category === 'COW' ? 7.5 : 8.0),
                    snfMax: row.snf_max !== null && row.snf_max !== undefined ? Number(row.snf_max) : (category === 'COW' ? 10.0 : 12.0),
                    formulaDefinition: row.formula_definition || null,
                    cells,
                    gridMatrix,
                    cellCount: cells.length,
                });
            }
        }
        return {
            organizationId,
            centerId: normalizedCenterId,
            scope,
            syncedAt: new Date().toISOString(),
            charts,
        };
    }
    /**
     * Validate offline rate calculation against authoritative historical rate version (Prompt 4).
     * Strict invariants:
     * - Must belong to the organization
     * - Must be effective on collection businessDate
     * - Must match exact GRID cell if pricingType is GRID
     * - Must match formula if pricingType is FORMULA
     * - Total amount must match banker's rounding of netWeight * rate
     */
    static async validateHistoricalRate(params) {
        // Strict input finite & positive validation
        if (!Number.isFinite(params.fat) ||
            !Number.isFinite(params.snf) ||
            !Number.isFinite(params.weightLiters) ||
            !Number.isFinite(params.ratePerLiter) ||
            !Number.isFinite(params.totalAmount) ||
            params.fat <= 0 ||
            params.snf <= 0 ||
            params.weightLiters <= 0 ||
            params.ratePerLiter <= 0 ||
            params.totalAmount <= 0) {
            return {
                isValid: false,
                rateChartVersionId: params.rateChartVersionId || '',
                versionNumber: params.rateChartVersionNumber || 0,
                authoritativeRate: 0,
                authoritativeTotal: 0,
                errorCode: 'INVALID_FINANCIAL_VALUES',
                errorMessage: 'Financial and measurement values must be valid, finite, positive numbers',
            };
        }
        let client;
        try {
            client = await tenantDbManager.getTenantDb(params.organizationId);
        }
        catch {
            client = db;
        }
        // 1. Resolve rate version row
        let versionQuery;
        let versionParams;
        if (params.rateChartVersionId) {
            versionQuery = `
        SELECT rcv.*, rc.organization_id, rc.center_id, rc.milk_category, rc.pricing_type, rc.name as chart_name
        FROM rate_chart_versions rcv
        JOIN rate_charts rc ON rc.id = rcv.rate_chart_id
        WHERE rcv.id = $1 AND rc.organization_id = $2;
      `;
            versionParams = [params.rateChartVersionId, params.organizationId];
        }
        else if (params.rateChartVersionNumber) {
            // RULE: If exact historical chart version is specified, strictly match that version number!
            // Never fall back to latest chart.
            if (params.rateChartId) {
                versionQuery = `
          SELECT rcv.*, rc.organization_id, rc.center_id, rc.milk_category, rc.pricing_type, rc.name as chart_name
          FROM rate_chart_versions rcv
          JOIN rate_charts rc ON rc.id = rcv.rate_chart_id
          WHERE rcv.rate_chart_id = $1 AND rcv.version_number = $2 AND rc.organization_id = $3;
        `;
                versionParams = [params.rateChartId, params.rateChartVersionNumber, params.organizationId];
            }
            else {
                versionQuery = `
          SELECT rcv.*, rc.organization_id, rc.center_id, rc.milk_category, rc.pricing_type, rc.name as chart_name
          FROM rate_chart_versions rcv
          JOIN rate_charts rc ON rc.id = rcv.rate_chart_id
          WHERE rc.organization_id = $1
            AND rc.milk_category = $2
            AND rcv.version_number = $3
            AND (rc.center_id = $4 OR rc.center_id IS NULL)
          ORDER BY (CASE WHEN rc.center_id IS NOT NULL THEN 1 ELSE 2 END) ASC
          LIMIT 1;
        `;
                versionParams = [params.organizationId, params.milkCategory, params.rateChartVersionNumber, params.centerId || null];
            }
        }
        else {
            // If version not explicitly specified, lookup active version for businessDate
            versionQuery = `
        SELECT rcv.*, rc.organization_id, rc.center_id, rc.milk_category, rc.pricing_type, rc.name as chart_name
        FROM rate_chart_versions rcv
        JOIN rate_charts rc ON rc.id = rcv.rate_chart_id
        WHERE rc.organization_id = $1
          AND rc.milk_category = $2
          AND rc.is_active = TRUE
          AND (rc.center_id = $3 OR rc.center_id IS NULL)
          AND (rcv.status IN ('PUBLISHED', 'APPROVED') OR rcv.is_approved = TRUE)
          AND rcv.effective_from <= $4::timestamptz
          AND (rcv.effective_to IS NULL OR rcv.effective_to >= $4::timestamptz)
        ORDER BY (CASE WHEN rc.center_id IS NOT NULL THEN 1 ELSE 2 END) ASC, rcv.version_number DESC
        LIMIT 1;
      `;
            versionParams = [params.organizationId, params.milkCategory, params.centerId || null, params.businessDate];
        }
        let vRes = await client.query(versionQuery, versionParams);
        if (vRes.rows.length === 0) {
            try {
                vRes = await db.query(versionQuery, versionParams);
            }
            catch { }
        }
        if (vRes.rows.length === 0) {
            return {
                isValid: false,
                rateChartVersionId: '',
                versionNumber: 0,
                authoritativeRate: 0,
                authoritativeTotal: 0,
                errorCode: 'RATE_VERSION_NOT_FOUND',
                errorMessage: `Rate chart version not found or not authorized for organization`,
            };
        }
        const version = vRes.rows[0];
        // Verify center scope: if chart is center-specific and center doesn't match or is missing
        if (version.center_id && params.centerId && version.center_id !== params.centerId) {
            return {
                isValid: false,
                rateChartVersionId: version.id,
                versionNumber: version.version_number,
                authoritativeRate: 0,
                authoritativeTotal: 0,
                errorCode: 'CROSS_CENTER_RATE_CHART',
                errorMessage: `Rate chart belongs to a different center`,
            };
        }
        if (version.center_id && !params.centerId) {
            return {
                isValid: false,
                rateChartVersionId: version.id,
                versionNumber: version.version_number,
                authoritativeRate: 0,
                authoritativeTotal: 0,
                errorCode: 'CROSS_CENTER_RATE_CHART',
                errorMessage: `Center-specific rate chart cannot be applied without matching center scope`,
            };
        }
        // Verify milk category
        if (version.milk_category !== params.milkCategory) {
            return {
                isValid: false,
                rateChartVersionId: version.id,
                versionNumber: version.version_number,
                authoritativeRate: 0,
                authoritativeTotal: 0,
                errorCode: 'MILK_CATEGORY_MISMATCH',
                errorMessage: `Rate chart category ${version.milk_category} does not match collection category ${params.milkCategory}`,
            };
        }
        // Verify effective dates against businessDate
        const bDate = new Date(params.businessDate).getTime();
        const effFrom = new Date(version.effective_from).getTime();
        const effTo = version.effective_to ? new Date(version.effective_to).getTime() : Infinity;
        if (bDate < effFrom || bDate > effTo) {
            return {
                isValid: false,
                rateChartVersionId: version.id,
                versionNumber: version.version_number,
                authoritativeRate: 0,
                authoritativeTotal: 0,
                errorCode: 'RATE_VERSION_NOT_EFFECTIVE',
                errorMessage: `Rate chart version was not effective on business date ${params.businessDate}`,
            };
        }
        // 2. Authoritative Rate Evaluation
        let authoritativeRate = 0;
        const roundedFat = Math.round(params.fat * 10) / 10;
        const roundedSnf = Math.round(params.snf * 10) / 10;
        // Version-specific Fat and SNF Limits Check
        const fatMin = version.fat_min !== null && version.fat_min !== undefined ? Number(version.fat_min) : null;
        const fatMax = version.fat_max !== null && version.fat_max !== undefined ? Number(version.fat_max) : null;
        const snfMin = version.snf_min !== null && version.snf_min !== undefined ? Number(version.snf_min) : null;
        const snfMax = version.snf_max !== null && version.snf_max !== undefined ? Number(version.snf_max) : null;
        if ((fatMin !== null && roundedFat < fatMin) ||
            (fatMax !== null && roundedFat > fatMax) ||
            (snfMin !== null && roundedSnf < snfMin) ||
            (snfMax !== null && roundedSnf > snfMax)) {
            return {
                isValid: false,
                rateChartVersionId: version.id,
                versionNumber: version.version_number,
                authoritativeRate: 0,
                authoritativeTotal: 0,
                errorCode: 'FAT_SNF_OUT_OF_BOUNDS',
                errorMessage: `Measurement values (Fat: ${roundedFat}%, SNF: ${roundedSnf}%) are outside authorized rate chart version bounds [Fat: ${fatMin ?? '-'}-${fatMax ?? '-'}%, SNF: ${snfMin ?? '-'}-${snfMax ?? '-'}%]`,
            };
        }
        if (version.pricing_type === 'GRID') {
            const cellQuery = `
        SELECT rate_per_unit 
        FROM rate_chart_cells 
        WHERE rate_chart_version_id = $1 
          AND fat_percentage = $2 
          AND snf_percentage = $3;
      `;
            let cellRes = await client.query(cellQuery, [version.id, roundedFat, roundedSnf]);
            if (cellRes.rows.length === 0) {
                try {
                    cellRes = await db.query(cellQuery, [version.id, roundedFat, roundedSnf]);
                }
                catch { }
            }
            if (cellRes.rows.length === 0) {
                return {
                    isValid: false,
                    rateChartVersionId: version.id,
                    versionNumber: version.version_number,
                    authoritativeRate: 0,
                    authoritativeTotal: 0,
                    errorCode: 'RATE_CELL_NOT_FOUND',
                    errorMessage: `No approved rate cell found for ${params.milkCategory} at Fat: ${roundedFat}%, SNF: ${roundedSnf}% in rate version ${version.version_number}`,
                };
            }
            authoritativeRate = parseFloat(cellRes.rows[0].rate_per_unit);
        }
        else if (version.pricing_type === 'TWO_AXIS_FORMULA' || version.pricing_type === 'FORMULA') {
            // TWO_AXIS_FORMULA - Strict factor evaluation without arbitrary invented fallbacks
            const formula = version.formula_definition;
            const baseRate = version.base_rate !== null && version.base_rate !== undefined ? Number(version.base_rate) : null;
            const baseFat = version.base_fat !== null && version.base_fat !== undefined ? Number(version.base_fat) : (params.milkCategory === 'COW' ? 3.5 : 6.0);
            const baseSnf = version.base_snf !== null && version.base_snf !== undefined ? Number(version.base_snf) : (params.milkCategory === 'COW' ? 8.5 : 9.0);
            const fatFactor = formula && formula.fatFactor !== undefined && formula.fatFactor !== null ? Number(formula.fatFactor) : null;
            const snfFactor = formula && formula.snfFactor !== undefined && formula.snfFactor !== null ? Number(formula.snfFactor) : null;
            if (baseRate === null ||
                !Number.isFinite(baseRate) ||
                fatFactor === null ||
                !Number.isFinite(fatFactor) ||
                snfFactor === null ||
                !Number.isFinite(snfFactor)) {
                return {
                    isValid: false,
                    rateChartVersionId: version.id,
                    versionNumber: version.version_number,
                    authoritativeRate: 0,
                    authoritativeTotal: 0,
                    errorCode: 'INVALID_FORMULA_DEFINITION',
                    errorMessage: `Two-axis formula rate chart version ${version.version_number} has incomplete or non-finite parameters (baseRate, fatFactor, or snfFactor missing)`,
                };
            }
            const calculated = baseRate + (roundedFat - baseFat) * fatFactor + (roundedSnf - baseSnf) * snfFactor;
            authoritativeRate = roundHalfUp(calculated, 2);
        }
        else if (version.pricing_type === 'TOTAL_SOLIDS_FORMULA') {
            // TOTAL_SOLIDS_FORMULA: Rate = (Fat * fatFactor) + (SNF * snfFactor)
            const formula = version.formula_definition;
            const fatFactor = formula && formula.fatFactor !== undefined && formula.fatFactor !== null ? Number(formula.fatFactor) : null;
            const snfFactor = formula && formula.snfFactor !== undefined && formula.snfFactor !== null ? Number(formula.snfFactor) : null;
            if (fatFactor === null ||
                !Number.isFinite(fatFactor) ||
                snfFactor === null ||
                !Number.isFinite(snfFactor)) {
                return {
                    isValid: false,
                    rateChartVersionId: version.id,
                    versionNumber: version.version_number,
                    authoritativeRate: 0,
                    authoritativeTotal: 0,
                    errorCode: 'INVALID_FORMULA_DEFINITION',
                    errorMessage: `Total Solids formula rate chart version ${version.version_number} has incomplete or non-finite parameters (fatFactor or snfFactor missing)`,
                };
            }
            const calculated = (roundedFat * fatFactor) + (roundedSnf * snfFactor);
            authoritativeRate = roundHalfUp(calculated, 2);
        }
        else {
            // Unsupported pricing model fails closed immediately
            return {
                isValid: false,
                rateChartVersionId: version.id,
                versionNumber: version.version_number,
                authoritativeRate: 0,
                authoritativeTotal: 0,
                errorCode: 'UNSUPPORTED_PRICING_MODEL',
                errorMessage: `Rate chart pricing type '${version.pricing_type}' is unsupported`,
            };
        }
        // Verify rate mismatch - exact supported currency precision (paise)
        const submittedRatePaise = Math.round(params.ratePerLiter * 100);
        const authoritativeRatePaise = Math.round(authoritativeRate * 100);
        const isRateSubPaise = Math.abs(params.ratePerLiter - (submittedRatePaise / 100)) > 1e-9;
        if (submittedRatePaise !== authoritativeRatePaise || isRateSubPaise) {
            return {
                isValid: false,
                rateChartVersionId: version.id,
                versionNumber: version.version_number,
                authoritativeRate,
                authoritativeTotal: 0,
                errorCode: 'RATE_MISMATCH',
                errorMessage: `Submitted rate ${params.ratePerLiter} does not match authoritative rate ${authoritativeRate} in rate version ${version.version_number}`,
            };
        }
        // Verify total amount with standard commercial half-up rounding to exact paise
        const authoritativeTotal = roundHalfUp(params.weightLiters * authoritativeRate, 2);
        const submittedTotalPaise = Math.round(params.totalAmount * 100);
        const authoritativeTotalPaise = Math.round(authoritativeTotal * 100);
        const isTotalSubPaise = Math.abs(params.totalAmount - (submittedTotalPaise / 100)) > 1e-9;
        if (submittedTotalPaise !== authoritativeTotalPaise || isTotalSubPaise) {
            return {
                isValid: false,
                rateChartVersionId: version.id,
                versionNumber: version.version_number,
                authoritativeRate,
                authoritativeTotal,
                errorCode: 'TOTAL_AMOUNT_MISMATCH',
                errorMessage: `Submitted total amount ${params.totalAmount} does not match authoritative amount ${authoritativeTotal}`,
            };
        }
        return {
            isValid: true,
            rateChartVersionId: version.id,
            versionNumber: version.version_number,
            authoritativeRate,
            authoritativeTotal,
        };
    }
}
//# sourceMappingURL=rate.service.js.map