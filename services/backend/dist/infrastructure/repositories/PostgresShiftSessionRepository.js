import { KioskShiftSession } from '../../domain/entities/KioskShiftSession.js';
import { DomainValidationError, ForbiddenError, ForbiddenTenantError, SessionConflictError, } from '../../domain/errors/index.js';
import { tenantDbManager, TenantDatabaseUnavailableError, } from '../database/TenantDatabaseManager.js';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CUSTOMER_ROLES = new Set(['FARMER_CUSTOMER', 'GUEST_FARMER', 'CUSTOMER']);
const PLATFORM_ROLES = new Set(['SUPER_ADMIN', 'PLATFORM_OPERATOR']);
export class PostgresShiftSessionRepository {
    mapRowToSession(row) {
        const props = {
            id: row.id,
            sessionCode: row.session_code,
            organizationId: row.organization_id,
            centerId: row.center_id,
            businessDate: row.business_date instanceof Date
                ? `${row.business_date.getFullYear()}-${String(row.business_date.getMonth() + 1).padStart(2, '0')}-${String(row.business_date.getDate()).padStart(2, '0')}`
                : String(row.business_date).split('T')[0] || '',
            shift: row.shift,
            status: row.status,
            openedAt: row.opened_at?.toISOString?.() || String(row.opened_at),
            closedAt: row.closed_at ? row.closed_at?.toISOString?.() || String(row.closed_at) : null,
            openingOperatorId: row.opening_operator_id,
            openingOperatorName: row.opening_operator_name || 'Operator',
            closingOperatorId: row.closing_operator_id || null,
            closingOperatorName: row.closing_operator_name || null,
            deviceIdentifier: row.device_identifier,
            deviceName: row.device_name || 'Counter Kiosk',
            totalLiters: Number(row.total_liters || 0),
            cowLiters: Number(row.cow_liters || 0),
            buffaloLiters: Number(row.buffalo_liters || 0),
            transactionCount: Number(row.transaction_count || 0),
            totalAmount: Number(row.total_amount || 0),
            averageFat: Number(row.average_fat || 0),
            averageSnf: Number(row.average_snf || 0),
            timezone: row.timezone || row.center_timezone || 'Asia/Kolkata',
        };
        return new KioskShiftSession(props);
    }
    assertValidOrganizationId(organizationId) {
        if (!organizationId || typeof organizationId !== 'string' || !organizationId.trim()) {
            throw new DomainValidationError('Authenticated organization ID is strictly required for shift session operations.', 'MISSING_ORGANIZATION_ID');
        }
        const cleanOrgId = organizationId.trim();
        if (!UUID_REGEX.test(cleanOrgId)) {
            throw new DomainValidationError('Invalid organization ID format for shift session operation.', 'INVALID_ORGANIZATION_ID');
        }
        return cleanOrgId;
    }
    async getAuthorizedTenantDb(organizationId) {
        const cleanOrgId = this.assertValidOrganizationId(organizationId);
        return tenantDbManager.getStrictTenantDb(cleanOrgId);
    }
    isConstraintOrDomainError(err) {
        const pgCode = err?.code;
        return (pgCode === '23505' ||
            pgCode === '23503' ||
            pgCode === '23514' ||
            pgCode === '22P02' ||
            err instanceof DomainValidationError ||
            err instanceof ForbiddenError ||
            err instanceof ForbiddenTenantError ||
            err instanceof SessionConflictError);
    }
    async queryTenant(tenantDb, organizationId, sql, params) {
        try {
            return await tenantDb.query(sql, params);
        }
        catch (err) {
            if (err instanceof TenantDatabaseUnavailableError || this.isConstraintOrDomainError(err)) {
                throw err;
            }
            throw new TenantDatabaseUnavailableError(organizationId, 'QUERY_FAILED', 'Tenant shift session database query failed');
        }
    }
    getBaseSelect() {
        return `
      SELECT
        s.*,
        dc.timezone AS center_timezone,
        u_open.full_name AS opening_operator_name,
        u_close.full_name AS closing_operator_name
      FROM kiosk_shift_sessions s
      LEFT JOIN dairy_centers dc ON dc.id = s.center_id
      LEFT JOIN users u_open ON u_open.id = s.opening_operator_id
      LEFT JOIN users u_close ON u_close.id = s.closing_operator_id
    `;
    }
    async findActiveSession(centerId, deviceIdentifier, organizationId) {
        const orgId = this.assertValidOrganizationId(organizationId);
        if (!centerId || !UUID_REGEX.test(centerId.trim())) {
            throw new DomainValidationError('Valid collection center ID is required.', 'INVALID_CENTER_ID');
        }
        if (!deviceIdentifier || !deviceIdentifier.trim()) {
            throw new DomainValidationError('Device identifier is required.', 'INVALID_DEVICE_IDENTIFIER');
        }
        const tenantDb = await this.getAuthorizedTenantDb(orgId);
        const sql = `${this.getBaseSelect()}
      WHERE s.center_id = $1
        AND s.device_identifier = $2
        AND s.organization_id = $3
        AND s.status = 'OPEN'
      ORDER BY s.opened_at DESC
      LIMIT 1;`;
        const result = await this.queryTenant(tenantDb, orgId, sql, [
            centerId.trim(),
            deviceIdentifier.trim(),
            orgId,
        ]);
        if (result.rows.length === 0)
            return null;
        return this.mapRowToSession(result.rows[0]);
    }
    async findByCode(sessionCode, organizationId) {
        const orgId = this.assertValidOrganizationId(organizationId);
        if (!sessionCode || !sessionCode.trim()) {
            return null;
        }
        const tenantDb = await this.getAuthorizedTenantDb(orgId);
        const sql = `${this.getBaseSelect()}
      WHERE s.session_code = $1
        AND s.organization_id = $2
      LIMIT 1;`;
        const result = await this.queryTenant(tenantDb, orgId, sql, [sessionCode.trim(), orgId]);
        if (result.rows.length === 0)
            return null;
        return this.mapRowToSession(result.rows[0]);
    }
    async findById(sessionId, organizationId) {
        const orgId = this.assertValidOrganizationId(organizationId);
        if (!sessionId || !UUID_REGEX.test(sessionId.trim())) {
            return null;
        }
        const tenantDb = await this.getAuthorizedTenantDb(orgId);
        const sql = `${this.getBaseSelect()}
      WHERE s.id = $1
        AND s.organization_id = $2
      LIMIT 1;`;
        const result = await this.queryTenant(tenantDb, orgId, sql, [sessionId.trim(), orgId]);
        if (result.rows.length === 0)
            return null;
        return this.mapRowToSession(result.rows[0]);
    }
    async validateOperatorInTenant(tenantDb, operatorId, organizationId, label) {
        if (!operatorId || !UUID_REGEX.test(operatorId)) {
            throw new DomainValidationError(`Valid ${label} operator UUID is required for shift session persistence.`, label === 'opening' ? 'INVALID_OPENING_OPERATOR' : 'INVALID_CLOSING_OPERATOR');
        }
        const userRes = await this.queryTenant(tenantDb, organizationId, `SELECT id, organization_id, role, status
       FROM users
       WHERE id = $1
       LIMIT 1;`, [operatorId]);
        if (userRes.rows.length === 0) {
            throw new DomainValidationError(`Authoritative ${label} operator '${operatorId}' does not exist in tenant database.`, label === 'opening' ? 'INVALID_OPENING_OPERATOR' : 'INVALID_CLOSING_OPERATOR');
        }
        const user = userRes.rows[0];
        const effectiveRole = String(user.role || '').trim().toUpperCase();
        if (!effectiveRole || CUSTOMER_ROLES.has(effectiveRole)) {
            throw new ForbiddenError(`User '${operatorId}' is not an authorized shift operator.`, 'UNAUTHORIZED_SHIFT_OPERATOR');
        }
        if (String(user.status || '').toUpperCase() !== 'ACTIVE') {
            throw new ForbiddenError(`${label === 'opening' ? 'Opening' : 'Closing'} operator account is not ACTIVE.`, 'OPERATOR_INACTIVE');
        }
        if (!PLATFORM_ROLES.has(effectiveRole) &&
            String(user.organization_id || '').toLowerCase() !== organizationId.toLowerCase()) {
            throw new ForbiddenTenantError(`Cross-tenant ${label} operator ownership mismatch: operator does not belong to organization.`);
        }
    }
    async save(session) {
        const orgId = this.assertValidOrganizationId(session.organizationId);
        if (!session.id || !UUID_REGEX.test(session.id)) {
            throw new DomainValidationError('Valid session UUID is required.', 'INVALID_SESSION_ID');
        }
        if (!session.centerId || !UUID_REGEX.test(session.centerId)) {
            throw new DomainValidationError('Valid collection center UUID is required.', 'INVALID_CENTER_ID');
        }
        if (!session.sessionCode || !session.sessionCode.trim()) {
            throw new DomainValidationError('Session code is required.', 'INVALID_SESSION_CODE');
        }
        if (!session.deviceIdentifier || !session.deviceIdentifier.trim()) {
            throw new DomainValidationError('Device identifier is required.', 'INVALID_DEVICE_IDENTIFIER');
        }
        const openingOpId = session.props.openingOperatorId;
        const closingOpId = session.props.closingOperatorId || null;
        // 1. Verify organization exists and is ACTIVE in control plane before tenant DB mutation
        const controlDb = tenantDbManager.getControlPlaneDb();
        let controlOrgRes;
        try {
            controlOrgRes = await controlDb.query(`SELECT id, status FROM organizations WHERE id = $1 LIMIT 1;`, [orgId]);
        }
        catch {
            throw new TenantDatabaseUnavailableError(orgId, 'CONTROL_PLANE_UNAVAILABLE', 'Control-plane organization verification database is unavailable');
        }
        if (controlOrgRes.rows.length === 0) {
            throw new DomainValidationError(`Organization '${orgId}' does not exist.`, 'INVALID_ORGANIZATION');
        }
        if (String(controlOrgRes.rows[0].status || '').toUpperCase() !== 'ACTIVE') {
            throw new ForbiddenError(`Organization '${orgId}' is not active.`, 'ORGANIZATION_INACTIVE');
        }
        // 2. Resolve exact tenant DB strictly
        const tenantDb = await this.getAuthorizedTenantDb(orgId);
        // 3. Verify organization exists and is active in tenant DB (never auto-create)
        const tenantOrgRes = await this.queryTenant(tenantDb, orgId, `SELECT id, status FROM organizations WHERE id = $1 LIMIT 1;`, [orgId]);
        if (tenantOrgRes.rows.length === 0) {
            throw new DomainValidationError(`Organization '${orgId}' is missing from its tenant operational database.`, 'INVALID_ORGANIZATION');
        }
        if (String(tenantOrgRes.rows[0].status || '').toUpperCase() !== 'ACTIVE') {
            throw new ForbiddenError(`Organization '${orgId}' is inactive in its tenant database.`, 'ORGANIZATION_INACTIVE');
        }
        // 4. Verify center exists, belongs to this organization, and is ACTIVE (never auto-create)
        const centerRes = await this.queryTenant(tenantDb, orgId, `SELECT id, organization_id, status FROM dairy_centers WHERE id = $1 LIMIT 1;`, [session.centerId]);
        if (centerRes.rows.length === 0) {
            throw new DomainValidationError(`Collection center '${session.centerId}' does not exist in tenant database.`, 'INVALID_CENTER');
        }
        const center = centerRes.rows[0];
        if (String(center.organization_id || '').toLowerCase() !== orgId.toLowerCase()) {
            throw new ForbiddenTenantError(`Cross-tenant center ownership mismatch: center '${session.centerId}' does not belong to organization '${orgId}'.`);
        }
        if (String(center.status || '').toUpperCase() !== 'ACTIVE') {
            throw new DomainValidationError(`Collection center '${session.centerId}' is inactive.`, 'INACTIVE_CENTER');
        }
        // 5. Verify opening operator and optional closing operator exist and are authorized
        await this.validateOperatorInTenant(tenantDb, openingOpId, orgId, 'opening');
        if (closingOpId) {
            await this.validateOperatorInTenant(tenantDb, closingOpId, orgId, 'closing');
        }
        // 6. Validate device association if registered in devices table
        const cleanDeviceId = session.deviceIdentifier.trim();
        const validateDeviceRow = (dev) => {
            if (String(dev.organization_id || '').toLowerCase() !== orgId.toLowerCase()) {
                throw new ForbiddenTenantError(`Cross-tenant device '${cleanDeviceId}' does not belong to organization '${orgId}'.`);
            }
            if (dev.is_blocked === true ||
                dev.revoked_at != null ||
                ['BLOCKED', 'REVOKED', 'DECOMMISSIONED', 'INACTIVE'].includes(String(dev.status || '').toUpperCase())) {
                throw new ForbiddenError(`Device '${cleanDeviceId}' is ${dev.status || 'BLOCKED'} and cannot operate shift sessions.`, 'DEVICE_BLOCKED');
            }
        };
        const isUndefinedTableError = (err) => err?.code === '42P01' || /relation\s+"?devices"?\s+does not exist/i.test(String(err?.message || ''));
        const isUndefinedColumnError = (err) => err?.code === '42703' || /column\s+"?(?:is_blocked|revoked_at)"?\s+does not exist/i.test(String(err?.message || ''));
        const checkRegisteredDevice = async (client, isControlPlane) => {
            try {
                const devRes = await client.query(`SELECT id, organization_id, center_id, status, is_blocked, revoked_at
           FROM devices
           WHERE device_identifier = $1 OR id::text = $1
           LIMIT 1;`, [cleanDeviceId]);
                if (devRes.rows.length > 0) {
                    validateDeviceRow(devRes.rows[0]);
                }
            }
            catch (err) {
                if (err instanceof ForbiddenTenantError ||
                    err instanceof ForbiddenError ||
                    err instanceof TenantDatabaseUnavailableError) {
                    throw err;
                }
                // Minimal test doubles may have `devices` without 041 columns (`is_blocked`, `revoked_at`).
                // Retry with core columns instead of silently skipping device authorization.
                if (isUndefinedColumnError(err)) {
                    const fallbackRes = await client.query(`SELECT id, organization_id, center_id, status
             FROM devices
             WHERE device_identifier = $1 OR id::text = $1
             LIMIT 1;`, [cleanDeviceId]);
                    if (fallbackRes.rows.length > 0) {
                        validateDeviceRow(fallbackRes.rows[0]);
                    }
                    return;
                }
                // `devices` is a TENANT_OPERATIONAL table (migration 010) and is intentionally absent
                // from the separate control-plane DB. On tenantDb, only allow missing `devices` table
                // in minimal offline unit test doubles (never when REQUIRE_REAL_POSTGRES=1).
                if (isUndefinedTableError(err)) {
                    if (isControlPlane || process.env['REQUIRE_REAL_POSTGRES'] !== '1') {
                        return;
                    }
                    throw new TenantDatabaseUnavailableError(orgId, 'SCHEMA_MISSING', 'Required tenant table "devices" is missing in tenant database');
                }
                // Do not hide unrelated schema, permission, or connection failures.
                throw new TenantDatabaseUnavailableError(orgId, 'QUERY_FAILED', err?.message || 'Device registry verification failed');
            }
        };
        await checkRegisteredDevice(tenantDb, false);
        if (tenantDb !== controlDb) {
            await checkRegisteredDevice(controlDb, true);
        }
        const totals = session.totals;
        const upsertSql = `
      INSERT INTO kiosk_shift_sessions (
        id, session_code, organization_id, center_id, business_date, shift,
        status, opened_at, closed_at, opening_operator_id, closing_operator_id,
        device_identifier, device_name, total_liters, cow_liters, buffalo_liters,
        transaction_count, total_amount, average_fat, average_snf, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16,
        $17, $18, $19, $20, NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        closed_at = EXCLUDED.closed_at,
        closing_operator_id = EXCLUDED.closing_operator_id,
        total_liters = EXCLUDED.total_liters,
        cow_liters = EXCLUDED.cow_liters,
        buffalo_liters = EXCLUDED.buffalo_liters,
        transaction_count = EXCLUDED.transaction_count,
        total_amount = EXCLUDED.total_amount,
        average_fat = EXCLUDED.average_fat,
        average_snf = EXCLUDED.average_snf,
        updated_at = NOW()
      WHERE kiosk_shift_sessions.organization_id = EXCLUDED.organization_id;
    `;
        const params = [
            session.id,
            session.sessionCode.trim(),
            orgId,
            session.centerId,
            session.businessDate,
            session.shift,
            session.status,
            session.openedAt,
            session.closedAt || null,
            openingOpId,
            closingOpId,
            cleanDeviceId,
            session.deviceName,
            totals.totalLiters,
            totals.cowLiters,
            totals.buffaloLiters,
            totals.transactionCount,
            totals.totalAmount,
            totals.averageFat,
            totals.averageSnf,
        ];
        try {
            const writeRes = await tenantDb.query(upsertSql, params);
            if (typeof writeRes.rowCount === 'number' && writeRes.rowCount === 0) {
                throw new ForbiddenTenantError(`Cross-tenant shift session write rejected for session '${session.id}'.`);
            }
        }
        catch (err) {
            if (err?.code === '23505') {
                const msg = String(err?.message || '');
                if (msg.includes('uq_kiosk_shift_sessions_active_open')) {
                    throw new SessionConflictError(`An active OPEN shift session already exists for center '${session.centerId}' and device '${cleanDeviceId}'.`, 'ACTIVE_SESSION_ALREADY_EXISTS');
                }
                throw new SessionConflictError(`Shift session '${session.sessionCode}' conflicts with an existing session record.`, 'SESSION_CODE_CONFLICT');
            }
            if (err?.code === '23503') {
                throw new DomainValidationError('Shift session references an invalid organization, center, or operator record.', 'INVALID_SESSION_REFERENCE');
            }
            if (err instanceof TenantDatabaseUnavailableError || this.isConstraintOrDomainError(err)) {
                throw err;
            }
            throw new TenantDatabaseUnavailableError(orgId, 'WRITE_FAILED', err?.message || 'Failed to persist shift session to tenant database');
        }
    }
}
//# sourceMappingURL=PostgresShiftSessionRepository.js.map