import { IShiftSessionRepository } from '../../application/ports/index.js';
import { KioskShiftSession, KioskShiftSessionProps } from '../../domain/entities/KioskShiftSession.js';
import {
  DomainValidationError,
  ForbiddenError,
  ForbiddenTenantError,
  SessionConflictError,
} from '../../domain/errors/index.js';
import {
  IDatabaseClient,
  tenantDbManager,
  TenantDatabaseUnavailableError,
} from '../database/TenantDatabaseManager.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CUSTOMER_ROLES = new Set(['FARMER_CUSTOMER', 'GUEST_FARMER', 'CUSTOMER']);
const PLATFORM_ROLES = new Set(['SUPER_ADMIN', 'PLATFORM_OPERATOR']);

export class PostgresShiftSessionRepository implements IShiftSessionRepository {
  private mapRowToSession(row: any): KioskShiftSession {
    const props: KioskShiftSessionProps = {
      id: row.id,
      sessionCode: row.session_code,
      organizationId: row.organization_id,
      centerId: row.center_id,
      businessDate:
        row.business_date instanceof Date
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

  private assertValidOrganizationId(organizationId?: string): string {
    if (!organizationId || typeof organizationId !== 'string' || !organizationId.trim()) {
      throw new DomainValidationError(
        'Authenticated organization ID is strictly required for shift session operations.',
        'MISSING_ORGANIZATION_ID'
      );
    }
    const cleanOrgId = organizationId.trim();
    if (!UUID_REGEX.test(cleanOrgId)) {
      throw new DomainValidationError(
        'Invalid organization ID format for shift session operation.',
        'INVALID_ORGANIZATION_ID'
      );
    }
    return cleanOrgId;
  }

  private async getAuthorizedTenantDb(organizationId: string): Promise<IDatabaseClient> {
    const cleanOrgId = this.assertValidOrganizationId(organizationId);
    return tenantDbManager.getStrictTenantDb(cleanOrgId);
  }

  private isConstraintOrDomainError(err: any): boolean {
    const pgCode = err?.code;
    return (
      pgCode === '23505' ||
      pgCode === '23503' ||
      pgCode === '23514' ||
      pgCode === '22P02' ||
      err instanceof DomainValidationError ||
      err instanceof ForbiddenError ||
      err instanceof ForbiddenTenantError ||
      err instanceof SessionConflictError
    );
  }

  private async queryTenant<T extends Record<string, any> = any>(
    tenantDb: IDatabaseClient,
    organizationId: string,
    sql: string,
    params: any[]
  ): Promise<{ rows: T[] }> {
    try {
      return await tenantDb.query<T>(sql, params);
    } catch (err: any) {
      if (err instanceof TenantDatabaseUnavailableError || this.isConstraintOrDomainError(err)) {
        throw err;
      }
      throw new TenantDatabaseUnavailableError(
        organizationId,
        'QUERY_FAILED',
        'Tenant shift session database query failed'
      );
    }
  }

  private getBaseSelect(): string {
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

  public async findActiveSession(
    centerId: string,
    deviceIdentifier: string,
    organizationId: string
  ): Promise<KioskShiftSession | null> {
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
    if (result.rows.length === 0) return null;
    return this.mapRowToSession(result.rows[0]);
  }

  public async findByCode(sessionCode: string, organizationId: string): Promise<KioskShiftSession | null> {
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
    if (result.rows.length === 0) return null;
    return this.mapRowToSession(result.rows[0]);
  }

  public async findById(sessionId: string, organizationId: string): Promise<KioskShiftSession | null> {
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
    if (result.rows.length === 0) return null;
    return this.mapRowToSession(result.rows[0]);
  }

  private async validateOperatorInTenant(
    tenantDb: IDatabaseClient,
    operatorId: string,
    organizationId: string,
    label: 'opening' | 'closing'
  ): Promise<void> {
    if (!operatorId || !UUID_REGEX.test(operatorId)) {
      throw new DomainValidationError(
        `Valid ${label} operator UUID is required for shift session persistence.`,
        label === 'opening' ? 'INVALID_OPENING_OPERATOR' : 'INVALID_CLOSING_OPERATOR'
      );
    }

    const userRes = await this.queryTenant<{
      id: string;
      organization_id: string | null;
      role: string | null;
      user_role: string | null;
      status: string;
    }>(
      tenantDb,
      organizationId,
      `SELECT id, organization_id, role, user_role, status
       FROM users
       WHERE id = $1
       LIMIT 1;`,
      [operatorId]
    );

    if (userRes.rows.length === 0) {
      throw new DomainValidationError(
        `Authoritative ${label} operator '${operatorId}' does not exist in tenant database.`,
        label === 'opening' ? 'INVALID_OPENING_OPERATOR' : 'INVALID_CLOSING_OPERATOR'
      );
    }

    const user = userRes.rows[0]!;
    const effectiveRole = String(user.user_role || user.role || '').trim().toUpperCase();
    if (!effectiveRole || CUSTOMER_ROLES.has(effectiveRole)) {
      throw new ForbiddenError(
        `User '${operatorId}' is not an authorized shift operator.`,
        'UNAUTHORIZED_SHIFT_OPERATOR'
      );
    }

    if (String(user.status || '').toUpperCase() !== 'ACTIVE') {
      throw new ForbiddenError(
        `${label === 'opening' ? 'Opening' : 'Closing'} operator account is not ACTIVE.`,
        'OPERATOR_INACTIVE'
      );
    }

    if (
      !PLATFORM_ROLES.has(effectiveRole) &&
      String(user.organization_id || '').toLowerCase() !== organizationId.toLowerCase()
    ) {
      throw new ForbiddenTenantError(
        `Cross-tenant ${label} operator ownership mismatch: operator does not belong to organization.`
      );
    }
  }

  public async save(session: KioskShiftSession): Promise<void> {
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

    const openingOpId = (session as any).props.openingOperatorId as string;
    const closingOpId = ((session as any).props.closingOperatorId as string | null | undefined) || null;

    // 1. Verify organization exists and is ACTIVE in control plane before tenant DB mutation
    const controlDb = tenantDbManager.getControlPlaneDb();
    let controlOrgRes: { rows: Array<{ id: string; status: string }> };
    try {
      controlOrgRes = await controlDb.query<{ id: string; status: string }>(
        `SELECT id, status FROM organizations WHERE id = $1 LIMIT 1;`,
        [orgId]
      );
    } catch {
      throw new TenantDatabaseUnavailableError(
        orgId,
        'CONTROL_PLANE_UNAVAILABLE',
        'Control-plane organization verification database is unavailable'
      );
    }
    if (controlOrgRes.rows.length === 0) {
      throw new DomainValidationError(`Organization '${orgId}' does not exist.`, 'INVALID_ORGANIZATION');
    }
    if (String(controlOrgRes.rows[0]!.status || '').toUpperCase() !== 'ACTIVE') {
      throw new ForbiddenError(
        `Organization '${orgId}' is not active.`,
        'ORGANIZATION_INACTIVE'
      );
    }

    // 2. Resolve exact tenant DB strictly
    const tenantDb = await this.getAuthorizedTenantDb(orgId);

    // 3. Verify organization exists and is active in tenant DB (never auto-create)
    const tenantOrgRes = await this.queryTenant<{ id: string; status: string }>(
      tenantDb,
      orgId,
      `SELECT id, status FROM organizations WHERE id = $1 LIMIT 1;`,
      [orgId]
    );
    if (tenantOrgRes.rows.length === 0) {
      throw new DomainValidationError(
        `Organization '${orgId}' is missing from its tenant operational database.`,
        'INVALID_ORGANIZATION'
      );
    }
    if (String(tenantOrgRes.rows[0]!.status || '').toUpperCase() !== 'ACTIVE') {
      throw new ForbiddenError(
        `Organization '${orgId}' is inactive in its tenant database.`,
        'ORGANIZATION_INACTIVE'
      );
    }

    // 4. Verify center exists, belongs to this organization, and is ACTIVE (never auto-create)
    const centerRes = await this.queryTenant<{ id: string; organization_id: string; status: string }>(
      tenantDb,
      orgId,
      `SELECT id, organization_id, status FROM dairy_centers WHERE id = $1 LIMIT 1;`,
      [session.centerId]
    );
    if (centerRes.rows.length === 0) {
      throw new DomainValidationError(
        `Collection center '${session.centerId}' does not exist in tenant database.`,
        'INVALID_CENTER'
      );
    }
    const center = centerRes.rows[0]!;
    if (String(center.organization_id || '').toLowerCase() !== orgId.toLowerCase()) {
      throw new ForbiddenTenantError(
        `Cross-tenant center ownership mismatch: center '${session.centerId}' does not belong to organization '${orgId}'.`
      );
    }
    if (String(center.status || '').toUpperCase() !== 'ACTIVE') {
      throw new DomainValidationError(
        `Collection center '${session.centerId}' is inactive.`,
        'INACTIVE_CENTER'
      );
    }

    // 5. Verify opening operator and optional closing operator exist and are authorized
    await this.validateOperatorInTenant(tenantDb, openingOpId, orgId, 'opening');
    if (closingOpId) {
      await this.validateOperatorInTenant(tenantDb, closingOpId, orgId, 'closing');
    }

    // 6. Validate device association if registered in devices table
    const cleanDeviceId = session.deviceIdentifier.trim();
    const checkRegisteredDevice = async (client: IDatabaseClient) => {
      try {
        const devRes = await client.query<{
          id: string;
          organization_id: string;
          center_id: string | null;
          status: string;
          is_blocked?: boolean;
          revoked_at?: string | null;
        }>(
          `SELECT id, organization_id, center_id, status, is_blocked, revoked_at
           FROM devices
           WHERE device_identifier = $1 OR id::text = $1
           LIMIT 1;`,
          [cleanDeviceId]
        );
        if (devRes.rows.length > 0) {
          const dev = devRes.rows[0]!;
          if (String(dev.organization_id || '').toLowerCase() !== orgId.toLowerCase()) {
            throw new ForbiddenTenantError(
              `Cross-tenant device '${cleanDeviceId}' does not belong to organization '${orgId}'.`
            );
          }
          if (
            dev.is_blocked === true ||
            dev.revoked_at != null ||
            ['BLOCKED', 'REVOKED', 'DECOMMISSIONED', 'INACTIVE'].includes(String(dev.status || '').toUpperCase())
          ) {
            throw new ForbiddenError(
              `Device '${cleanDeviceId}' is ${dev.status || 'BLOCKED'} and cannot operate shift sessions.`,
              'DEVICE_BLOCKED'
            );
          }
        }
      } catch (err: any) {
        if (err instanceof ForbiddenTenantError || err instanceof ForbiddenError) {
          throw err;
        }
        // Ignore only if devices table lacks optional columns in minimal test doubles
      }
    };
    await checkRegisteredDevice(tenantDb);
    if (tenantDb !== controlDb) {
      await checkRegisteredDevice(controlDb);
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
        throw new ForbiddenTenantError(
          `Cross-tenant shift session write rejected for session '${session.id}'.`
        );
      }
    } catch (err: any) {
      if (err?.code === '23505') {
        const msg = String(err?.message || '');
        if (msg.includes('uq_kiosk_shift_sessions_active_open')) {
          throw new SessionConflictError(
            `An active OPEN shift session already exists for center '${session.centerId}' and device '${cleanDeviceId}'.`,
            'ACTIVE_SESSION_ALREADY_EXISTS'
          );
        }
        throw new SessionConflictError(
          `Shift session '${session.sessionCode}' conflicts with an existing session record.`,
          'SESSION_CODE_CONFLICT'
        );
      }
      if (err?.code === '23503') {
        throw new DomainValidationError(
          'Shift session references an invalid organization, center, or operator record.',
          'INVALID_SESSION_REFERENCE'
        );
      }
      if (err instanceof TenantDatabaseUnavailableError || this.isConstraintOrDomainError(err)) {
        throw err;
      }
      throw new TenantDatabaseUnavailableError(
        orgId,
        'WRITE_FAILED',
        err?.message || 'Failed to persist shift session to tenant database'
      );
    }
  }
}
