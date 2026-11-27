import crypto from 'node:crypto';
import {
  ICollectionTransactionRepository,
  AtomicMilkIntakeParams,
  AtomicMilkIntakeResult,
} from '../../application/ports/index.js';
import { MilkCollectionTransaction, MilkCollectionTransactionProps } from '../../domain/entities/MilkCollectionTransaction.js';
import {
  DomainValidationError,
  ForbiddenError,
  ForbiddenTenantError,
} from '../../domain/errors/index.js';
import {
  IDatabaseClient,
  tenantDbManager,
  TenantDatabaseUnavailableError,
} from '../database/TenantDatabaseManager.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AuthorizedMembershipRef {
  organizationId: string;
  tenantCustomerId: string;
  dairyName?: string;
}

export interface ConsolidatedHistoryUnavailableDairy {
  organizationId: string;
  dairyName?: string;
  code: string;
  message: string;
}

export interface ConsolidatedHistoryResult {
  transactions: MilkCollectionTransaction[];
  partial: boolean;
  unavailableDairies: ConsolidatedHistoryUnavailableDairy[];
}

export class PostgresCollectionTransactionRepository implements ICollectionTransactionRepository {
  private mapRowToTransaction(row: any): MilkCollectionTransaction {
    const props: MilkCollectionTransactionProps = {
      id: row.id,
      transactionCode: `TXN-${row.id.substring(0, 8).toUpperCase()}`,
      sessionId: row.session_id,
      dairyId: row.organization_id || row.dairy_id,
      centerId: row.center_id,
      customerId: row.customer_id,
      customerCode: row.farmer_code || '',
      customerName: row.full_name || '',
      timestamp: row.created_at?.toISOString?.() || String(row.created_at),
      date: row.business_date instanceof Date
        ? `${row.business_date.getFullYear()}-${String(row.business_date.getMonth() + 1).padStart(2, '0')}-${String(row.business_date.getDate()).padStart(2, '0')}`
        : (String(row.business_date).split('T')[0] || ''),
      shift: row.shift_type,
      milkCategory: row.milk_category,
      weightLiters: Number(row.net_weight),
      fatPercentage: Number(row.fat_percentage),
      snfPercentage: Number(row.snf_percentage),
      clrDensity: row.clr_density ? Number(row.clr_density) : 28.0,
      appliedRatePerLiter: Number(row.applied_rate_per_unit),
      rateChartVersion: row.rate_chart_version || 1,
      totalAmount: Number(row.total_amount),
      identificationMethod: row.identification_method || 'MANUAL_SEARCH',
      syncStatus: 'SYNCED_CLOUD',
      deviceId: row.device_id || 'KIOSK_MAIN',
      operatorName: row.operator_name || 'Operator',
      idempotencyKey: row.idempotency_key,
    };

    return new MilkCollectionTransaction(props);
  }

  private assertValidOrganizationId(organizationId?: string): string {
    if (!organizationId || typeof organizationId !== 'string' || !organizationId.trim()) {
      throw new DomainValidationError(
        'Authenticated organization ID is strictly required for collection transaction operations.',
        'MISSING_ORGANIZATION_ID'
      );
    }
    const cleanOrgId = organizationId.trim();
    if (!UUID_REGEX.test(cleanOrgId)) {
      throw new DomainValidationError(
        'Invalid organization ID format for collection transaction operation.',
        'INVALID_ORGANIZATION_ID'
      );
    }
    return cleanOrgId;
  }

  private async getAuthorizedTenantDb(organizationId?: string): Promise<{ orgId: string; tenantDb: IDatabaseClient }> {
    const orgId = this.assertValidOrganizationId(organizationId);
    const tenantDb = await tenantDbManager.getStrictTenantDb(orgId);
    return { orgId, tenantDb };
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
      err?.code === 'IDEMPOTENCY_PAYLOAD_MISMATCH'
    );
  }

  private async queryTenant<T extends Record<string, any> = any>(
    client: { query: (text: string, params?: any[]) => Promise<{ rows: T[] }> },
    organizationId: string,
    sql: string,
    params: any[]
  ): Promise<{ rows: T[] }> {
    try {
      return await client.query(sql, params);
    } catch (err: any) {
      if (err instanceof TenantDatabaseUnavailableError || this.isConstraintOrDomainError(err)) {
        throw err;
      }
      throw new TenantDatabaseUnavailableError(
        organizationId,
        'QUERY_FAILED',
        'Tenant collection database query failed'
      );
    }
  }

  private async validateOperationalContext(
    client: { query: (text: string, params?: any[]) => Promise<{ rows: any[] }> },
    params: {
      organizationId: string;
      centerId?: string;
      customerId: string;
      operatorId?: string;
      sessionId?: string;
    }
  ): Promise<string> {
    const { organizationId, centerId, customerId, operatorId, sessionId } = params;

    // 1. Validate organization exists and is ACTIVE in tenant DB (never auto-create)
    const orgRes = await this.queryTenant<{ id: string; status: string }>(
      client,
      organizationId,
      `SELECT id, status FROM organizations WHERE id = $1 LIMIT 1;`,
      [organizationId]
    );
    if (orgRes.rows.length === 0) {
      throw new DomainValidationError(
        `Organization '${organizationId}' does not exist in tenant database.`,
        'INVALID_ORGANIZATION'
      );
    }
    if (String(orgRes.rows[0]!.status || '').toUpperCase() !== 'ACTIVE') {
      throw new ForbiddenError(
        `Organization '${organizationId}' is not active.`,
        'ORGANIZATION_INACTIVE'
      );
    }

    // 2. Validate center exists, belongs to this organization, and is ACTIVE (never auto-create C-01)
    if (!centerId || !UUID_REGEX.test(centerId)) {
      throw new DomainValidationError('Valid collection center ID is required.', 'INVALID_CENTER_ID');
    }
    const centerRes = await this.queryTenant<{ id: string; organization_id: string; status: string }>(
      client,
      organizationId,
      `SELECT id, organization_id, status FROM dairy_centers WHERE id = $1 LIMIT 1;`,
      [centerId]
    );
    if (centerRes.rows.length === 0) {
      throw new DomainValidationError(
        `Collection center '${centerId}' does not exist in tenant database.`,
        'INVALID_CENTER'
      );
    }
    const center = centerRes.rows[0]!;
    if (String(center.organization_id || '').toLowerCase() !== organizationId.toLowerCase()) {
      throw new ForbiddenTenantError(
        `Cross-tenant center '${centerId}' does not belong to organization '${organizationId}'.`
      );
    }
    if (String(center.status || '').toUpperCase() !== 'ACTIVE') {
      throw new DomainValidationError(
        `Collection center '${centerId}' is inactive.`,
        'INACTIVE_CENTER'
      );
    }

    // 3. Validate customer exists, belongs to this organization, and is not soft-deleted
    if (!customerId || !UUID_REGEX.test(customerId)) {
      throw new DomainValidationError('Valid customer ID is required.', 'INVALID_CUSTOMER_ID');
    }
    const custRes = await this.queryTenant<{ id: string; organization_id: string; is_deleted: boolean }>(
      client,
      organizationId,
      `SELECT id, organization_id, is_deleted FROM customers WHERE id = $1 LIMIT 1;`,
      [customerId]
    );
    if (custRes.rows.length === 0) {
      throw new DomainValidationError(
        `Customer '${customerId}' does not exist in tenant database.`,
        'INVALID_CUSTOMER'
      );
    }
    const cust = custRes.rows[0]!;
    if (String(cust.organization_id || '').toLowerCase() !== organizationId.toLowerCase()) {
      throw new ForbiddenTenantError(
        `Cross-tenant customer '${customerId}' does not belong to organization '${organizationId}'.`
      );
    }
    if (cust.is_deleted) {
      throw new DomainValidationError(`Customer '${customerId}' is deleted.`, 'CUSTOMER_DELETED');
    }

    // 4. Resolve and validate operator from authoritative tenant session/user records (never fabricate)
    let resolvedOperatorId = operatorId;
    if (sessionId && UUID_REGEX.test(sessionId)) {
      const sessRes = await this.queryTenant<{ id: string; organization_id: string; opening_operator_id: string }>(
        client,
        organizationId,
        `SELECT id, organization_id, opening_operator_id FROM kiosk_shift_sessions WHERE id = $1 LIMIT 1;`,
        [sessionId]
      );
      if (sessRes.rows.length === 0) {
        throw new DomainValidationError(
          `Shift session '${sessionId}' does not exist in tenant database.`,
          'INVALID_SESSION'
        );
      }
      if (String(sessRes.rows[0]!.organization_id || '').toLowerCase() !== organizationId.toLowerCase()) {
        throw new ForbiddenTenantError(
          `Cross-tenant shift session '${sessionId}' does not belong to organization '${organizationId}'.`
        );
      }
      if (!resolvedOperatorId) {
        resolvedOperatorId = sessRes.rows[0]!.opening_operator_id;
      }
    }

    if (!resolvedOperatorId || !UUID_REGEX.test(resolvedOperatorId)) {
      throw new DomainValidationError(
        'Valid authoritative operator ID is required for collection persistence.',
        'INVALID_OPERATOR'
      );
    }

    const opRes = await this.queryTenant<{ id: string; organization_id: string | null; role: string | null; user_role: string | null; status: string }>(
      client,
      organizationId,
      `SELECT id, organization_id, role, user_role, status FROM users WHERE id = $1 LIMIT 1;`,
      [resolvedOperatorId]
    );
    if (opRes.rows.length === 0) {
      throw new DomainValidationError(
        `Authoritative operator '${resolvedOperatorId}' does not exist in tenant database.`,
        'INVALID_OPERATOR'
      );
    }
    const op = opRes.rows[0]!;
    const effRole = String(op.user_role || op.role || '').trim().toUpperCase();
    if (effRole === 'FARMER_CUSTOMER' || effRole === 'GUEST_FARMER' || effRole === 'CUSTOMER') {
      throw new ForbiddenError(`User '${resolvedOperatorId}' is not authorized to record collections.`, 'UNAUTHORIZED_OPERATOR');
    }
    if (String(op.status || '').toUpperCase() !== 'ACTIVE') {
      throw new ForbiddenError(`Operator '${resolvedOperatorId}' is not ACTIVE.`, 'OPERATOR_INACTIVE');
    }
    if (
      effRole !== 'SUPER_ADMIN' &&
      effRole !== 'PLATFORM_OPERATOR' &&
      String(op.organization_id || '').toLowerCase() !== organizationId.toLowerCase()
    ) {
      throw new ForbiddenTenantError(
        `Cross-tenant operator '${resolvedOperatorId}' does not belong to organization '${organizationId}'.`
      );
    }

    return resolvedOperatorId;
  }

  public async save(transaction: MilkCollectionTransaction): Promise<void> {
    const t = transaction.toJSON();
    const { orgId, tenantDb } = await this.getAuthorizedTenantDb(t.dairyId);

    await tenantDb.withTransaction(async (client) => {
      const opId = await this.validateOperationalContext(client, {
        organizationId: orgId,
        centerId: t.centerId,
        customerId: t.customerId,
        sessionId: t.sessionId,
      });

      // 1. Ensure shift exists in collection_shifts for verified center & shift
      const shiftRes = await this.queryTenant<{ id: string }>(
        client,
        orgId,
        `INSERT INTO collection_shifts (center_id, shift_type, start_time, end_time, grace_period_minutes, is_active)
         VALUES ($1, $2, '05:00:00'::time, '21:00:00'::time, 30, TRUE)
         ON CONFLICT (center_id, shift_type) DO UPDATE SET is_active = EXCLUDED.is_active
         RETURNING id`,
        [t.centerId, t.shift]
      );
      const shiftId = shiftRes.rows[0]!.id;

      // 2. Cleanly map identification method conforming to chk_session_id_method (FACE, RFID, SUPERVISOR_MANUAL)
      const methodStr = String(t.identificationMethod || '');
      const mappedIdMethod =
        methodStr === 'FACE_YUNET_SFACE' || methodStr === 'FACE' || methodStr === 'FACE_RECOGNITION'
          ? 'FACE'
          : (methodStr === 'RFID_TAG' || methodStr === 'RFID' || methodStr === 'RFID_CARD'
            ? 'RFID'
            : 'SUPERVISOR_MANUAL');

      const intakeSessionId = crypto.randomUUID();
      await this.queryTenant(
        client,
        orgId,
        `INSERT INTO collection_sessions (
          id, center_id, customer_id, business_date, shift_id, shift_type,
          selected_milk_category, identification_method, session_state,
          intake_sequence_uuid, started_at, completed_at, operator_id, device_id
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, 'COMPLETED',
          gen_random_uuid(), NOW(), NOW(),
          $9,
          $10
        );`,
        [
          intakeSessionId,
          t.centerId,
          t.customerId,
          t.date,
          shiftId,
          t.shift,
          t.milkCategory,
          mappedIdMethod,
          opId,
          t.deviceId,
        ]
      );

      // 3. Resolve tenant-scoped rate chart version
      let rcvId: string;
      const rcvRes = await this.queryTenant<{ id: string }>(
        client,
        orgId,
        `SELECT rcv.id
         FROM rate_chart_versions rcv
         JOIN rate_charts rc ON rc.id = rcv.rate_chart_id
         WHERE rc.organization_id = $1
         ORDER BY rcv.created_at DESC
         LIMIT 1;`,
        [orgId]
      );
      if (rcvRes.rows.length > 0) {
        rcvId = rcvRes.rows[0]!.id;
      } else {
        const chartRes = await this.queryTenant<{ id: string }>(
          client,
          orgId,
          `INSERT INTO rate_charts (organization_id, center_id, name, milk_category, pricing_type, is_active)
           VALUES ($1, $2, 'Standard Cow Rate Chart', 'COW', 'GRID', TRUE)
           RETURNING id;`,
          [orgId, t.centerId]
        );
        const chartId = chartRes.rows[0]!.id;
        const verRes = await this.queryTenant<{ id: string }>(
          client,
          orgId,
          `INSERT INTO rate_chart_versions (rate_chart_id, version_number, effective_from, base_fat, base_snf, base_rate, is_approved)
           VALUES ($1, 1, NOW(), 3.5, 8.5, 38.0, TRUE)
           RETURNING id;`,
          [chartId]
        );
        rcvId = verRes.rows[0]!.id;
      }

      const insertSql = `
        INSERT INTO milk_collections (
          id, session_id, organization_id, center_id, customer_id, business_date, shift_type,
          milk_category, net_weight, measurement_unit, fat_percentage, snf_percentage,
          rate_chart_version_id, applied_rate_per_unit, total_amount, transaction_status,
          client_intake_uuid, idempotency_key, created_at, synced_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, 'LITERS', $10, $11,
          $12, $13, $14, 'COMPLETED',
          gen_random_uuid(), $15, NOW(), NOW()
        )
        ON CONFLICT (organization_id, idempotency_key) DO NOTHING;
      `;

      await this.queryTenant(client, orgId, insertSql, [
        t.id,
        intakeSessionId,
        orgId,
        t.centerId,
        t.customerId,
        t.date,
        t.shift,
        t.milkCategory,
        t.weightLiters,
        t.fatPercentage,
        t.snfPercentage,
        rcvId,
        t.appliedRatePerLiter,
        t.totalAmount,
        t.idempotencyKey || `TXN-${t.id}`,
      ]);

      // 4. Update kiosk_shift_sessions totals atomically within organization scope
      await this.queryTenant(
        client,
        orgId,
        `UPDATE kiosk_shift_sessions SET
          total_liters = total_liters + $2::numeric,
          cow_liters = cow_liters + (CASE WHEN $3 = 'COW' THEN $2::numeric ELSE 0.0 END),
          buffalo_liters = buffalo_liters + (CASE WHEN $3 = 'BUFFALO' THEN $2::numeric ELSE 0.0 END),
          transaction_count = transaction_count + 1,
          total_amount = total_amount + $4::numeric,
          updated_at = NOW()
        WHERE id = $1 AND organization_id = $5`,
        [t.sessionId, t.weightLiters, t.milkCategory, t.totalAmount, orgId]
      );
    });
  }

  public async findById(id: string, organizationId: string): Promise<MilkCollectionTransaction | null> {
    const { orgId, tenantDb } = await this.getAuthorizedTenantDb(organizationId);
    if (!id || !UUID_REGEX.test(id.trim())) {
      return null;
    }

    const sql = `
      SELECT 
        mc.*,
        c.farmer_code,
        c.full_name,
        c.organization_id,
        cs.device_id,
        cs.identification_method,
        u.full_name AS operator_name
      FROM milk_collections mc
      JOIN customers c ON c.id = mc.customer_id
      LEFT JOIN collection_sessions cs ON cs.id = mc.session_id
      LEFT JOIN users u ON u.id = cs.operator_id
      WHERE mc.id = $1
        AND mc.organization_id = $2
        AND c.organization_id = $2
      LIMIT 1;
    `;
    const result = await this.queryTenant(tenantDb, orgId, sql, [id.trim(), orgId]);
    if (result.rows.length === 0) return null;
    return this.mapRowToTransaction(result.rows[0]);
  }

  public async findByIdempotencyKey(key: string, organizationId: string): Promise<MilkCollectionTransaction | null> {
    const { orgId, tenantDb } = await this.getAuthorizedTenantDb(organizationId);
    if (!key || !key.trim()) {
      return null;
    }

    const sqlWithOrg = `
      SELECT 
        mc.*,
        c.farmer_code,
        c.full_name,
        c.organization_id,
        cs.device_id,
        cs.identification_method,
        u.full_name AS operator_name
      FROM milk_collections mc
      JOIN customers c ON c.id = mc.customer_id
      LEFT JOIN collection_sessions cs ON cs.id = mc.session_id
      LEFT JOIN users u ON u.id = cs.operator_id
      WHERE mc.idempotency_key = $1
        AND mc.organization_id = $2
        AND c.organization_id = $2
      LIMIT 1;
    `;
    const result = await this.queryTenant(tenantDb, orgId, sqlWithOrg, [key, orgId]);
    if (result.rows.length === 0) return null;
    return this.mapRowToTransaction(result.rows[0]);
  }

  private async resolveExistingReplay(
    client: any,
    idempotencyKey: string,
    orgId: string,
    incomingTxn?: any
  ): Promise<AtomicMilkIntakeResult> {
    const existingRes = await this.queryTenant(
      client,
      orgId,
      `SELECT 
        mc.*,
        c.farmer_code,
        c.full_name,
        c.organization_id,
        cs.device_id,
        cs.identification_method,
        u.full_name AS operator_name
      FROM milk_collections mc
      JOIN customers c ON c.id = mc.customer_id
      LEFT JOIN collection_sessions cs ON cs.id = mc.session_id
      LEFT JOIN users u ON u.id = cs.operator_id
      WHERE mc.idempotency_key = $1
        AND mc.organization_id = $2
        AND c.organization_id = $2
      LIMIT 1;`,
      [idempotencyKey, orgId]
    );

    if (existingRes.rows.length === 0) {
      throw new Error(`Conflict detected for idempotency key ${idempotencyKey}, but existing canonical record could not be resolved.`);
    }

    const row = existingRes.rows[0];
    const existingTxn = this.mapRowToTransaction(row);

    if (incomingTxn) {
      const mismatches: string[] = [];

      if (incomingTxn.customerId && incomingTxn.customerId !== existingTxn.customerId) {
        mismatches.push(`customerId (${incomingTxn.customerId} vs canonical ${existingTxn.customerId})`);
      }
      if (incomingTxn.milkCategory && incomingTxn.milkCategory !== existingTxn.milkCategory) {
        mismatches.push(`milkCategory (${incomingTxn.milkCategory} vs canonical ${existingTxn.milkCategory})`);
      }
      if (incomingTxn.weightLiters !== undefined && Math.abs(Number(incomingTxn.weightLiters) - Number(existingTxn.weightLiters)) > 0.005) {
        mismatches.push(`weightLiters (${incomingTxn.weightLiters} vs canonical ${existingTxn.weightLiters})`);
      }
      if (incomingTxn.fatPercentage !== undefined && Math.abs(Number(incomingTxn.fatPercentage) - Number(existingTxn.fatPercentage)) > 0.05) {
        mismatches.push(`fatPercentage (${incomingTxn.fatPercentage} vs canonical ${existingTxn.fatPercentage})`);
      }
      if (incomingTxn.snfPercentage !== undefined && Math.abs(Number(incomingTxn.snfPercentage) - Number(existingTxn.snfPercentage)) > 0.05) {
        mismatches.push(`snfPercentage (${incomingTxn.snfPercentage} vs canonical ${existingTxn.snfPercentage})`);
      }
      if (incomingTxn.totalAmount !== undefined && Math.abs(Number(incomingTxn.totalAmount) - Number(existingTxn.totalAmount)) > 0.05) {
        mismatches.push(`totalAmount (${incomingTxn.totalAmount} vs canonical ${existingTxn.totalAmount})`);
      }
      if (incomingTxn.date && existingTxn.date && incomingTxn.date !== existingTxn.date) {
        mismatches.push(`businessDate (${incomingTxn.date} vs canonical ${existingTxn.date})`);
      }

      if (mismatches.length > 0) {
        const err: any = new Error(
          `IDEMPOTENCY_PAYLOAD_MISMATCH: Idempotency key '${idempotencyKey}' was already used with a different transaction payload: ${mismatches.join(', ')}.`
        );
        err.statusCode = 409;
        err.code = 'IDEMPOTENCY_PAYLOAD_MISMATCH';
        throw err;
      }
    }

    const ledgerRes = await this.queryTenant(
      client,
      orgId,
      `SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1 AND organization_id = $2 LIMIT 1;`,
      [existingTxn.customerId, orgId]
    );

    return {
      transaction: existingTxn,
      receiptNumber: `RCP-${existingTxn.id.substring(0, 8).toUpperCase()}`,
      customerBalanceAfter: Number(ledgerRes.rows[0]?.current_balance || 0),
      isIdempotentReplay: true,
    };
  }

  public async saveAtomicIntake(params: AtomicMilkIntakeParams): Promise<AtomicMilkIntakeResult> {
    const t = params.transaction.toJSON();
    const orgId = this.assertValidOrganizationId(params.organizationId || t.dairyId);
    if (params.organizationId && t.dairyId && params.organizationId.trim().toLowerCase() !== t.dairyId.trim().toLowerCase()) {
      throw new ForbiddenTenantError('Transaction organization mismatch in atomic milk intake.');
    }
    const { tenantDb } = await this.getAuthorizedTenantDb(orgId);

    return await tenantDb.withTransaction(async (client) => {
      // 0. Pre-check: If this idempotency key was already recorded in this organization, return existing canonical record
      const idempotencyKey = t.idempotencyKey || `TXN-${t.id}`;
      const preCheck = await this.queryTenant(
        client,
        orgId,
        `SELECT id FROM milk_collections WHERE idempotency_key = $1 AND organization_id = $2 LIMIT 1;`,
        [idempotencyKey, orgId]
      );
      if (preCheck.rows.length > 0) {
        return await this.resolveExistingReplay(client, idempotencyKey, orgId, t);
      }

      // 0.1 Validate organization, center, customer, session, and operator strictly in tenant DB (zero fabricated entities)
      const opId = await this.validateOperationalContext(client, {
        organizationId: orgId,
        centerId: t.centerId,
        customerId: t.customerId,
        operatorId: params.operatorId,
        sessionId: t.sessionId,
      });

      // 1. Ensure shift exists in collection_shifts for verified center & shift
      const shiftRes = await this.queryTenant<{ id: string }>(
        client,
        orgId,
        `INSERT INTO collection_shifts (center_id, shift_type, start_time, end_time, grace_period_minutes, is_active)
         VALUES ($1, $2, '05:00:00'::time, '21:00:00'::time, 30, TRUE)
         ON CONFLICT (center_id, shift_type) DO UPDATE SET is_active = EXCLUDED.is_active
         RETURNING id`,
        [t.centerId, t.shift]
      );
      const shiftId = shiftRes.rows[0]!.id;

      // 3. Map identification method conforming to chk_session_id_method
      const methodStr = String(t.identificationMethod || '');
      const mappedIdMethod =
        methodStr === 'FACE_YUNET_SFACE' || methodStr === 'FACE' || methodStr === 'FACE_RECOGNITION'
          ? 'FACE'
          : (methodStr === 'RFID_TAG' || methodStr === 'RFID' || methodStr === 'RFID_CARD'
            ? 'RFID'
            : 'SUPERVISOR_MANUAL');

      // 4. Ensure collection_sessions row exists
      const intakeSessionId = crypto.randomUUID();
      await this.queryTenant(
        client,
        orgId,
        `INSERT INTO collection_sessions (
          id, center_id, customer_id, business_date, shift_id, shift_type,
          selected_milk_category, identification_method, session_state,
          intake_sequence_uuid, started_at, completed_at, operator_id, device_id
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, 'COMPLETED',
          gen_random_uuid(), NOW(), NOW(),
          $9, $10
        )
        ON CONFLICT (id) DO NOTHING;`,
        [
          intakeSessionId,
          t.centerId,
          t.customerId,
          t.date,
          shiftId,
          t.shift,
          t.milkCategory,
          mappedIdMethod,
          opId,
          t.deviceId,
        ]
      );

      // 5. Resolve tenant-scoped rate chart version
      let rcvId: string;
      const rcvRes = await this.queryTenant<{ id: string }>(
        client,
        orgId,
        `SELECT rcv.id
         FROM rate_chart_versions rcv
         JOIN rate_charts rc ON rc.id = rcv.rate_chart_id
         WHERE rc.organization_id = $1
         ORDER BY rcv.created_at DESC
         LIMIT 1;`,
        [orgId]
      );
      if (rcvRes.rows.length > 0) {
        rcvId = rcvRes.rows[0]!.id;
      } else {
        const chartRes = await this.queryTenant<{ id: string }>(
          client,
          orgId,
          `INSERT INTO rate_charts (organization_id, center_id, name, milk_category, pricing_type, is_active)
           VALUES ($1, $2, 'Standard Cow Rate Chart', 'COW', 'GRID', TRUE)
           RETURNING id;`,
          [orgId, t.centerId]
        );
        const chartId = chartRes.rows[0]!.id;
        const verRes = await this.queryTenant<{ id: string }>(
          client,
          orgId,
          `INSERT INTO rate_chart_versions (rate_chart_id, version_number, effective_from, base_fat, base_snf, base_rate, is_approved)
           VALUES ($1, 1, NOW(), 3.5, 8.5, 38.0, TRUE)
           RETURNING id;`,
          [chartId]
        );
        rcvId = verRes.rows[0]!.id;
      }

      // 6. Insert into milk_collections with composite organization_id + idempotency_key uniqueness
      const insertSql = `
        INSERT INTO milk_collections (
          id, session_id, organization_id, center_id, customer_id, business_date, shift_type,
          milk_category, net_weight, measurement_unit, fat_percentage, snf_percentage,
          rate_chart_version_id, applied_rate_per_unit, total_amount, transaction_status,
          client_intake_uuid, idempotency_key, created_at, synced_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, 'LITERS', $10, $11,
          $12, $13, $14, 'COMPLETED',
          gen_random_uuid(), $15, NOW(), NOW()
        )
        ON CONFLICT (organization_id, idempotency_key) DO NOTHING
        RETURNING id;
      `;

      const insertRes = await this.queryTenant<{ id: string }>(client, orgId, insertSql, [
        t.id,
        intakeSessionId,
        orgId,
        t.centerId,
        t.customerId,
        t.date,
        t.shift,
        t.milkCategory,
        t.weightLiters,
        t.fatPercentage,
        t.snfPercentage,
        rcvId,
        t.appliedRatePerLiter,
        t.totalAmount,
        idempotencyKey,
      ]);

      const wasInserted = Boolean(insertRes && insertRes.rows.length > 0 && insertRes.rows[0]?.id === t.id);
      const ledgerKey = `LEDGER-COLL-${orgId}-${idempotencyKey}`;
      const existingLedger = await this.queryTenant(
        client,
        orgId,
        `SELECT id FROM ledger_transactions WHERE idempotency_key = $1 AND organization_id = $2 LIMIT 1;`,
        [ledgerKey, orgId]
      );

      if (!wasInserted || existingLedger.rows.length > 0) {
        return await this.resolveExistingReplay(client, idempotencyKey, orgId, t);
      }

      // 7. Resolve customer_ledger_accounts row lock (FOR UPDATE)
      let currentBalance = 0;
      const accountRes = await this.queryTenant<{ id: string; current_balance: string | number }>(
        client,
        orgId,
        `SELECT id, current_balance FROM customer_ledger_accounts
         WHERE customer_id = $1 AND organization_id = $2
         FOR UPDATE;`,
        [t.customerId, orgId]
      );

      let ledgerAccountId: string;
      if (accountRes.rows.length > 0) {
        ledgerAccountId = accountRes.rows[0]!.id;
        currentBalance = Number(accountRes.rows[0]!.current_balance || 0);
      } else {
        const createAccRes = await this.queryTenant<{ id: string; current_balance: string | number }>(
          client,
          orgId,
          `INSERT INTO customer_ledger_accounts (customer_id, organization_id, currency, current_balance)
           VALUES ($1, $2, 'INR', 0.00)
           ON CONFLICT (customer_id) DO UPDATE SET updated_at = NOW()
           WHERE customer_ledger_accounts.organization_id = EXCLUDED.organization_id
           RETURNING id, current_balance;`,
          [t.customerId, orgId]
        );
        if (createAccRes.rows.length === 0) {
          throw new ForbiddenTenantError(`Cross-tenant ledger account conflict for customer '${t.customerId}'.`);
        }
        ledgerAccountId = createAccRes.rows[0]!.id;
        currentBalance = Number(createAccRes.rows[0]!.current_balance || 0);
      }

      const newBalance = Math.round((currentBalance + t.totalAmount + Number.EPSILON) * 100) / 100;

      // 8. WINNER DETERMINATION: Insert deterministic ledger_transactions row
      const ledgerEntryId = crypto.randomUUID();
      const ledgerIdempotencyKey = `LEDGER-COLL-${orgId}-${idempotencyKey}`;
      const ledgerTxnRes = await this.queryTenant<{ id: string }>(
        client,
        orgId,
        `INSERT INTO ledger_transactions (
          id, organization_id, center_id, customer_id, transaction_type,
          direction, amount, balance_after, reference_entity, reference_id,
          description, idempotency_key, created_by, created_at
        ) VALUES (
          $1, $2, $3, $4, 'MILK_COLLECTION_CREDIT',
          'CREDIT', $5, $6, 'MILK_COLLECTION', $7,
          $8, $9, $10, NOW()
        )
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id;`,
        [
          ledgerEntryId,
          orgId,
          t.centerId,
          t.customerId,
          t.totalAmount,
          newBalance,
          t.id,
          `Milk Intake Credit (${t.milkCategory} ${t.weightLiters}L @ ₹${t.appliedRatePerLiter}/L)`,
          ledgerIdempotencyKey,
          opId,
        ]
      );

      if (!ledgerTxnRes || ledgerTxnRes.rows.length === 0 || ledgerTxnRes.rows[0]?.id !== ledgerEntryId) {
        return await this.resolveExistingReplay(client, idempotencyKey, orgId);
      }

      // 9. WINNER: Update customer_ledger_accounts running balance
      await this.queryTenant(
        client,
        orgId,
        `UPDATE customer_ledger_accounts
         SET current_balance = $1, last_transaction_at = NOW(), updated_at = NOW()
         WHERE id = $2 AND organization_id = $3;`,
        [newBalance, ledgerAccountId, orgId]
      );

      // 10. WINNER: Update session cumulative totals in the EXACT SAME transaction
      await this.queryTenant(
        client,
        orgId,
        `UPDATE kiosk_shift_sessions SET
          total_liters = total_liters + $2::numeric,
          cow_liters = cow_liters + (CASE WHEN $3 = 'COW' THEN $2::numeric ELSE 0.0 END),
          buffalo_liters = buffalo_liters + (CASE WHEN $3 = 'BUFFALO' THEN $2::numeric ELSE 0.0 END),
          transaction_count = transaction_count + 1,
          total_amount = total_amount + $4::numeric,
          updated_at = NOW()
        WHERE id = $1 AND organization_id = $5`,
        [t.sessionId, t.weightLiters, t.milkCategory, t.totalAmount, orgId]
      );

      // 11. WINNER: Insert balanced double-entry ledger line
      await this.queryTenant(
        client,
        orgId,
        `INSERT INTO ledger_entries (
          transaction_id, account_id, account_type, entry_type, amount
        ) VALUES ($1, $2, 'CUSTOMER_PAYABLE', 'CREDIT', $3);`,
        [ledgerEntryId, ledgerAccountId, t.totalAmount]
      );

      // 12. WINNER: Insert transactional dashboard outbox event in the EXACT SAME transaction
      const outboxEventId = `EVT-COLL-${t.id}`;
      const outboxPayload = {
        collectionId: t.id,
        transactionCode: `TXN-${t.id.substring(0, 8).toUpperCase()}`,
        receiptNumber: `RCP-${t.id.substring(0, 8).toUpperCase()}`,
        clientIntakeUuid: t.id,
        idempotencyKey,
        centerId: t.centerId,
        sessionId: t.sessionId,
        shift: t.shift,
        milkCategory: t.milkCategory,
        quantityLiters: t.weightLiters,
        fatPercentage: t.fatPercentage,
        snfPercentage: t.snfPercentage,
        appliedRate: t.appliedRatePerLiter,
        totalAmount: t.totalAmount,
        farmerCode: t.customerCode,
        farmerMaskedName: t.customerName ? `${t.customerName.charAt(0)}***` : 'Farmer',
        status: 'ACCEPTED',
      };

      try {
        await client.query(
          `INSERT INTO dashboard_events_outbox (
            event_id, event_type, schema_version, organization_id, center_id,
            entity_id, aggregate_version, occurred_at, status, payload
          ) VALUES ($1, 'COLLECTION_ACCEPTED', 1, $2, $3, $4, 1, NOW(), 'PENDING', $5)
          ON CONFLICT (event_id) DO NOTHING;`,
          [
            outboxEventId,
            orgId,
            t.centerId || null,
            t.id,
            JSON.stringify(outboxPayload),
          ]
        );
      } catch {
        // Outbox schema alignment tracked separately under DF-021 (RESTART-09)
      }

      return {
        transaction: params.transaction,
        receiptNumber: `RCP-${t.id.substring(0, 8).toUpperCase()}`,
        customerBalanceAfter: newBalance,
        isIdempotentReplay: false,
      };
    });
  }

  public async listRecentBySession(sessionId: string, limit = 20, organizationId?: string): Promise<MilkCollectionTransaction[]> {
    const { orgId, tenantDb } = await this.getAuthorizedTenantDb(organizationId);
    if (!sessionId || !sessionId.trim()) {
      return [];
    }
    const cleanSessionId = sessionId.trim();
    const isUuid = UUID_REGEX.test(cleanSessionId);
    const sessionWhere = isUuid
      ? `(mc.session_id = $1 OR (
          mc.center_id = (SELECT center_id FROM kiosk_shift_sessions WHERE id = $1 AND organization_id = $3 LIMIT 1)
          AND mc.business_date = (SELECT business_date FROM kiosk_shift_sessions WHERE id = $1 AND organization_id = $3 LIMIT 1)
          AND mc.shift_type = (SELECT shift FROM kiosk_shift_sessions WHERE id = $1 AND organization_id = $3 LIMIT 1)
        ))`
      : `(mc.session_id IN (SELECT id FROM kiosk_shift_sessions WHERE session_code = $1 AND organization_id = $3) OR (
          mc.center_id = (SELECT center_id FROM kiosk_shift_sessions WHERE session_code = $1 AND organization_id = $3 LIMIT 1)
          AND mc.business_date = (SELECT business_date FROM kiosk_shift_sessions WHERE session_code = $1 AND organization_id = $3 LIMIT 1)
          AND mc.shift_type = (SELECT shift FROM kiosk_shift_sessions WHERE session_code = $1 AND organization_id = $3 LIMIT 1)
        ))`;

    const sql = `
      SELECT 
        mc.*,
        c.farmer_code,
        c.full_name,
        c.organization_id,
        cs.device_id,
        cs.identification_method,
        u.full_name AS operator_name
      FROM milk_collections mc
      JOIN customers c ON c.id = mc.customer_id
      LEFT JOIN collection_sessions cs ON cs.id = mc.session_id
      LEFT JOIN users u ON u.id = cs.operator_id
      WHERE ${sessionWhere}
        AND mc.organization_id = $3
        AND c.organization_id = $3
      ORDER BY mc.created_at DESC
      LIMIT $2;
    `;

    const result = await this.queryTenant(tenantDb, orgId, sql, [cleanSessionId, limit, orgId]);
    return result.rows.map((row: any) => this.mapRowToTransaction(row));
  }

  public async listByCustomer(customerId: string, limit = 50, offset = 0, organizationId?: string): Promise<MilkCollectionTransaction[]> {
    const { orgId, tenantDb } = await this.getAuthorizedTenantDb(organizationId);
    if (!customerId || !UUID_REGEX.test(customerId.trim())) {
      return [];
    }

    const sql = `
      SELECT 
        mc.*,
        c.farmer_code,
        c.full_name,
        c.organization_id,
        cs.device_id,
        cs.identification_method,
        u.full_name AS operator_name
      FROM milk_collections mc
      JOIN customers c ON c.id = mc.customer_id
      LEFT JOIN collection_sessions cs ON cs.id = mc.session_id
      LEFT JOIN users u ON u.id = cs.operator_id
      WHERE (mc.customer_id = $1 OR c.global_customer_id = $1)
        AND mc.organization_id = $4
        AND c.organization_id = $4
      ORDER BY mc.business_date DESC, mc.created_at DESC
      LIMIT $2 OFFSET $3;
    `;

    const result = await this.queryTenant(tenantDb, orgId, sql, [customerId.trim(), limit, offset, orgId]);
    return result.rows.map((row: any) => this.mapRowToTransaction(row));
  }

  public async listConsolidatedForMemberships(params: {
    memberships: AuthorizedMembershipRef[];
    limit?: number;
    offset?: number;
  }): Promise<ConsolidatedHistoryResult> {
    const limit = Math.max(1, Math.min(200, Number(params.limit || 50)));
    const offset = Math.max(0, Number(params.offset || 0));
    const perTenantLimit = limit + offset;

    if (!Array.isArray(params.memberships) || params.memberships.length === 0) {
      return { transactions: [], partial: false, unavailableDairies: [] };
    }

    const allTransactions: MilkCollectionTransaction[] = [];
    const unavailableDairies: ConsolidatedHistoryUnavailableDairy[] = [];
    const seenOrgs = new Set<string>();

    for (const membership of params.memberships) {
      const cleanOrgId = membership.organizationId?.trim();
      const cleanCustId = membership.tenantCustomerId?.trim();
      if (!cleanOrgId || !UUID_REGEX.test(cleanOrgId) || !cleanCustId || !UUID_REGEX.test(cleanCustId)) {
        continue;
      }
      if (seenOrgs.has(cleanOrgId.toLowerCase())) {
        continue;
      }
      seenOrgs.add(cleanOrgId.toLowerCase());

      try {
        const tenantDb = await tenantDbManager.getStrictTenantDb(cleanOrgId);
        const sql = `
          SELECT 
            mc.*,
            c.farmer_code,
            c.full_name,
            c.organization_id,
            cs.device_id,
            cs.identification_method,
            u.full_name AS operator_name
          FROM milk_collections mc
          JOIN customers c ON c.id = mc.customer_id
          LEFT JOIN collection_sessions cs ON cs.id = mc.session_id
          LEFT JOIN users u ON u.id = cs.operator_id
          WHERE mc.customer_id = $1
            AND mc.organization_id = $2
            AND c.organization_id = $2
          ORDER BY mc.business_date DESC, mc.created_at DESC
          LIMIT $3;
        `;
        const res = await this.queryTenant(tenantDb, cleanOrgId, sql, [cleanCustId, cleanOrgId, perTenantLimit]);
        for (const row of res.rows) {
          allTransactions.push(this.mapRowToTransaction(row));
        }
      } catch (err: any) {
        unavailableDairies.push({
          organizationId: cleanOrgId,
          dairyName: membership.dairyName,
          code: err?.code || 'TENANT_DATABASE_UNAVAILABLE',
          message: err?.message || 'Authorized dairy tenant database unavailable',
        });
      }
    }

    if (allTransactions.length === 0 && unavailableDairies.length === seenOrgs.size && seenOrgs.size > 0) {
      throw new TenantDatabaseUnavailableError(
        unavailableDairies[0]!.organizationId,
        unavailableDairies[0]!.code,
        'All authorized dairy tenant databases are currently unavailable'
      );
    }

    allTransactions.sort((a, b) => {
      const aJson = a.toJSON();
      const bJson = b.toJSON();
      const dateCmp = String(bJson.date || '').localeCompare(String(aJson.date || ''));
      if (dateCmp !== 0) return dateCmp;
      return String(bJson.timestamp || '').localeCompare(String(aJson.timestamp || ''));
    });

    return {
      transactions: allTransactions.slice(offset, offset + limit),
      partial: unavailableDairies.length > 0,
      unavailableDairies,
    };
  }

  public async getMonthlySummary(customerId: string, monthYear: string, organizationId?: string): Promise<{
    monthYear: string;
    totalLiters: number;
    cowLiters: number;
    buffaloLiters: number;
    avgFat: number;
    avgSnf: number;
    totalAmount: number;
    transactionCount: number;
  }> {
    const { orgId, tenantDb } = await this.getAuthorizedTenantDb(organizationId);
    if (!customerId || !UUID_REGEX.test(customerId.trim())) {
      return {
        monthYear,
        totalLiters: 0,
        cowLiters: 0,
        buffaloLiters: 0,
        avgFat: 0,
        avgSnf: 0,
        totalAmount: 0,
        transactionCount: 0,
      };
    }

    const parts = (monthYear || '').split('-');
    const year = parseInt(parts[0] || '2026', 10);
    const month = parseInt(parts[1] || '1', 10);
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const sql = `
      SELECT 
        COALESCE(SUM(mc.net_weight), 0.00) AS total_liters,
        COALESCE(SUM(CASE WHEN mc.milk_category = 'COW' THEN mc.net_weight ELSE 0 END), 0.00) AS cow_liters,
        COALESCE(SUM(CASE WHEN mc.milk_category = 'BUFFALO' THEN mc.net_weight ELSE 0 END), 0.00) AS buffalo_liters,
        COALESCE(AVG(mc.fat_percentage), 0.00) AS avg_fat,
        COALESCE(AVG(mc.snf_percentage), 0.00) AS avg_snf,
        COALESCE(SUM(mc.total_amount), 0.00) AS total_amount,
        COUNT(mc.id) AS transaction_count
      FROM milk_collections mc
      JOIN customers c ON c.id = mc.customer_id
      WHERE (mc.customer_id = $1 OR c.global_customer_id = $1)
        AND mc.organization_id = $4
        AND c.organization_id = $4
        AND mc.business_date >= $2
        AND mc.business_date <= $3
        AND mc.transaction_status = 'COMPLETED';
    `;

    const result = await this.queryTenant(tenantDb, orgId, sql, [customerId.trim(), startDate, endDate, orgId]);
    const row = result.rows[0];
    return {
      monthYear,
      totalLiters: Math.round((Number(row?.total_liters || 0) + Number.EPSILON) * 100) / 100,
      cowLiters: Math.round((Number(row?.cow_liters || 0) + Number.EPSILON) * 100) / 100,
      buffaloLiters: Math.round((Number(row?.buffalo_liters || 0) + Number.EPSILON) * 100) / 100,
      avgFat: Math.round((Number(row?.avg_fat || 0) + Number.EPSILON) * 100) / 100,
      avgSnf: Math.round((Number(row?.avg_snf || 0) + Number.EPSILON) * 100) / 100,
      totalAmount: Math.round((Number(row?.total_amount || 0) + Number.EPSILON) * 100) / 100,
      transactionCount: Number(row?.transaction_count || 0),
    };
  }
}
