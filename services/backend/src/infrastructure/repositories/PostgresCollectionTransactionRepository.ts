import crypto from 'node:crypto';
import {
  ICollectionTransactionRepository,
  AtomicMilkIntakeParams,
  AtomicMilkIntakeResult,
} from '../../application/ports/index.js';
import { MilkCollectionTransaction, MilkCollectionTransactionProps } from '../../domain/entities/MilkCollectionTransaction.js';
import { db } from '../database/PostgresPool.js';
import { tenantDbManager } from '../database/TenantDatabaseManager.js';

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

  private async getDb(organizationId?: string) {
    if (organizationId) {
      return tenantDbManager.getTenantDb(organizationId);
    }
    return db;
  }

  public async save(transaction: MilkCollectionTransaction): Promise<void> {
    const t = transaction.toJSON();
    const tenantDb = await this.getDb(t.dairyId);

    await tenantDb.withTransaction(async (client) => {
      // 0. Guarantee organization, center, and operator exist in tenant operational database
      await client.query(
        `INSERT INTO organizations (id, name, code, status)
         VALUES ($1, 'Registered Cooperative Dairy', $2, 'ACTIVE')
         ON CONFLICT (id) DO NOTHING;`,
        [t.dairyId, `D-${t.dairyId.slice(0, 6).toUpperCase()}`]
      );

      if (t.centerId) {
        await client.query(
          `INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
           VALUES ($1, $2, 'C-01', 'Main Collection Center', 'Center Road', 'Local', 'District', 'State', '400001', '+919876543210', 'ACTIVE')
           ON CONFLICT (id) DO NOTHING;`,
          [t.centerId, t.dairyId]
        );
      }

      // 1. Ensure shift exists in collection_shifts for center & shift
      const shiftRes = await client.query(
        `INSERT INTO collection_shifts (center_id, shift_type, start_time, end_time, grace_period_minutes, is_active)
         VALUES ($1, $2, '05:00:00'::time, '21:00:00'::time, 30, TRUE)
         ON CONFLICT (center_id, shift_type) DO UPDATE SET is_active = EXCLUDED.is_active
         RETURNING id`,
        [t.centerId, t.shift]
      );
      const shiftId = shiftRes.rows[0].id;

      // 2. Generate unique individual intake session ID for this transaction
      const intakeSessionId = crypto.randomUUID();
      const opRes = await client.query(`SELECT opening_operator_id FROM kiosk_shift_sessions WHERE id = $1 LIMIT 1`, [t.sessionId]);
      const opId = opRes.rows[0]?.opening_operator_id || '00000000-0000-0000-0000-000000000011';

      // Ensure operator exists in tenant users table
      const opUsername = `op_${String(opId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)}`;
      try {
        await client.query(
          `INSERT INTO users (id, organization_id, username, full_name, phone_number, role, status)
           VALUES ($1, $2, $3, $4, '+919822114477', 'COLLECTION_OPERATOR', 'ACTIVE')
           ON CONFLICT (id) DO NOTHING;`,
          [opId, t.dairyId, opUsername, t.operatorName || 'Counter Operator']
        );
      } catch {}

      // Cleanly map identification method conforming to chk_session_id_method (FACE, RFID, SUPERVISOR_MANUAL)
      const methodStr = String(t.identificationMethod || '');
      const mappedIdMethod =
        methodStr === 'FACE_YUNET_SFACE' || methodStr === 'FACE' || methodStr === 'FACE_RECOGNITION'
          ? 'FACE'
          : (methodStr === 'RFID_TAG' || methodStr === 'RFID' || methodStr === 'RFID_CARD'
            ? 'RFID'
            : 'SUPERVISOR_MANUAL');

      // Ensure collection_sessions row exists
      await client.query(
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

      // 3. Insert or ignore milk_collections (enforcing idempotency_key)
      let rcvId: string;
      const rcvRes = await client.query(`SELECT id FROM rate_chart_versions ORDER BY created_at DESC LIMIT 1`);
      if (rcvRes.rows.length > 0) {
        rcvId = rcvRes.rows[0].id;
      } else {
        const chartRes = await client.query(`
          INSERT INTO rate_charts (organization_id, center_id, name, milk_category, pricing_type, is_active)
          VALUES ($1, $2, 'Standard Cow Rate Chart', 'COW', 'GRID', TRUE)
          RETURNING id;
        `, [t.dairyId, t.centerId]);
        const chartId = chartRes.rows[0].id;
        const verRes = await client.query(`
          INSERT INTO rate_chart_versions (rate_chart_id, version_number, effective_from, base_fat, base_snf, base_rate, is_approved)
          VALUES ($1, 1, NOW(), 3.5, 8.5, 38.0, TRUE)
          RETURNING id;
        `, [chartId]);
        rcvId = verRes.rows[0].id;
      }

      const insertSql = `
        INSERT INTO milk_collections (
          id, session_id, organization_id, center_id, customer_id, business_date, shift_type,
          milk_category, net_weight, measurement_unit, fat_percentage, snf_percentage,
          rate_chart_version_id, applied_rate_per_unit, total_amount, transaction_status,
          client_intake_uuid, idempotency_key, created_at, synced_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, 'LITERS', $9, $10,
          $11,
          $12, $13, 'COMPLETED',
          gen_random_uuid(), $14, NOW(), NOW()
        )
        ON CONFLICT (organization_id, idempotency_key) DO NOTHING;
      `;

      await client.query(insertSql, [
        t.id,
        intakeSessionId,
        t.dairyId,
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

      // 4. Update kiosk_shift_sessions totals atomically
      await client.query(
        `UPDATE kiosk_shift_sessions SET
          total_liters = total_liters + $2::numeric,
          cow_liters = cow_liters + (CASE WHEN $3 = 'COW' THEN $2::numeric ELSE 0.0 END),
          buffalo_liters = buffalo_liters + (CASE WHEN $3 = 'BUFFALO' THEN $2::numeric ELSE 0.0 END),
          transaction_count = transaction_count + 1,
          total_amount = total_amount + $4::numeric,
          updated_at = NOW()
        WHERE id = $1`,
        [t.sessionId, t.weightLiters, t.milkCategory, t.totalAmount]
      );
    });

    // Try synchronizing to control plane DB as well if reachable
    try {
      await db.withTransaction(async (client) => {
        const insertSql = `
          INSERT INTO milk_collections (
            id, session_id, organization_id, center_id, customer_id, business_date, shift_type,
            milk_category, net_weight, measurement_unit, fat_percentage, snf_percentage,
            applied_rate_per_unit, total_amount, transaction_status,
            client_intake_uuid, idempotency_key, created_at, synced_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, 'LITERS', $9, $10,
            $11, $12, 'COMPLETED',
            gen_random_uuid(), $13, NOW(), NOW()
          )
          ON CONFLICT (organization_id, idempotency_key) DO NOTHING;
        `;
        await client.query(insertSql, [
          t.id,
          t.sessionId,
          t.dairyId,
          t.centerId,
          t.customerId,
          t.date,
          t.shift,
          t.milkCategory,
          t.weightLiters,
          t.fatPercentage,
          t.snfPercentage,
          t.appliedRatePerLiter,
          t.totalAmount,
          t.idempotencyKey || `TXN-${t.id}`,
        ]);
      });
    } catch {}
  }

  public async findByIdempotencyKey(key: string, organizationId: string): Promise<MilkCollectionTransaction | null> {
    if (!organizationId || !organizationId.trim()) {
      throw new Error('organizationId is strictly required for scoped idempotency key lookup');
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
        AND (mc.organization_id = $2 OR c.organization_id = $2)
      LIMIT 1;
    `;
    try {
      const client = await this.getDb(organizationId);
      const result = await client.query(sqlWithOrg, [key, organizationId]);
      if (result.rows.length > 0) return this.mapRowToTransaction(result.rows[0]);
    } catch {}
    return null;
  }

  private async resolveExistingReplay(
    client: any,
    idempotencyKey: string,
    orgId: string,
    incomingTxn?: any
  ): Promise<AtomicMilkIntakeResult> {
    const existingRes = await client.query(`
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
        AND (mc.organization_id = $2 OR c.organization_id = $2)
      LIMIT 1;
    `, [idempotencyKey, orgId]);

    if (existingRes.rows.length === 0) {
      throw new Error(`Conflict detected for idempotency key ${idempotencyKey}, but existing canonical record could not be resolved.`);
    }

    const row = existingRes.rows[0];
    const existingTxn = this.mapRowToTransaction(row);

    // Idempotency Key Payload Integrity Check:
    // If incoming transaction is provided, verify whether it represents the EXACT same intake transaction.
    // Reusing the same idempotency key with conflicting parameters must throw IDEMPOTENCY_PAYLOAD_MISMATCH (409)
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

    const ledgerRes = await client.query(`
      SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1 AND organization_id = $2 LIMIT 1;
    `, [existingTxn.customerId, orgId]);

    return {
      transaction: existingTxn,
      receiptNumber: `RCP-${existingTxn.id.substring(0, 8).toUpperCase()}`,
      customerBalanceAfter: Number(ledgerRes.rows[0]?.current_balance || 0),
      isIdempotentReplay: true,
    };
  }

  public async saveAtomicIntake(params: AtomicMilkIntakeParams): Promise<AtomicMilkIntakeResult> {
    const t = params.transaction.toJSON();
    const orgId = params.organizationId || t.dairyId;
    const tenantDb = await this.getDb(orgId);

    return await tenantDb.withTransaction(async (client) => {
      // 0. Pre-check: If this idempotency key was already recorded in this organization, return existing canonical record
      const idempotencyKey = t.idempotencyKey || `TXN-${t.id}`;
      const preCheck = await client.query(
        `SELECT id FROM milk_collections WHERE idempotency_key = $1 AND organization_id = $2 LIMIT 1;`,
        [idempotencyKey, orgId]
      );
      if (preCheck.rows.length > 0) {
        return await this.resolveExistingReplay(client, idempotencyKey, orgId, t);
      }

      // 0.1 Guarantee organization, center, and operator exist in tenant operational database
      await client.query(
        `INSERT INTO organizations (id, name, code, status)
         VALUES ($1, 'Registered Cooperative Dairy', $2, 'ACTIVE')
         ON CONFLICT (id) DO NOTHING;`,
        [orgId, `D-${orgId.slice(0, 6).toUpperCase()}`]
      );

      if (t.centerId) {
        await client.query(
          `INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
           VALUES ($1, $2, 'C-01', 'Main Collection Center', 'Center Road', 'Local', 'District', 'State', '400001', '+919876543210', 'ACTIVE')
           ON CONFLICT (id) DO NOTHING;`,
          [t.centerId, orgId]
        );
      }

      // 1. Ensure shift exists in collection_shifts for center & shift
      const shiftRes = await client.query(
        `INSERT INTO collection_shifts (center_id, shift_type, start_time, end_time, grace_period_minutes, is_active)
         VALUES ($1, $2, '05:00:00'::time, '21:00:00'::time, 30, TRUE)
         ON CONFLICT (center_id, shift_type) DO UPDATE SET is_active = EXCLUDED.is_active
         RETURNING id`,
        [t.centerId, t.shift]
      );
      const shiftId = shiftRes.rows[0].id;

      // 2. Resolve operator
      const opId = params.operatorId || '00000000-0000-0000-0000-000000000011';
      const opUsername = `op_${String(opId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)}`;
      try {
        await client.query(
          `INSERT INTO users (id, organization_id, username, full_name, phone_number, role, status)
           VALUES ($1, $2, $3, $4, '+919822114477', 'COLLECTION_OPERATOR', 'ACTIVE')
           ON CONFLICT (id) DO NOTHING;`,
          [opId, orgId, opUsername, params.operatorName || 'Counter Operator']
        );
      } catch {}

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
      await client.query(
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

      // 5. Ensure rate chart version exists
      let rcvId: string;
      const rcvRes = await client.query(`SELECT id FROM rate_chart_versions ORDER BY created_at DESC LIMIT 1`);
      if (rcvRes.rows.length > 0) {
        rcvId = rcvRes.rows[0].id;
      } else {
        const chartRes = await client.query(`
          INSERT INTO rate_charts (organization_id, center_id, name, milk_category, pricing_type, is_active)
          VALUES ($1, $2, 'Standard Cow Rate Chart', 'COW', 'GRID', TRUE)
          RETURNING id;
        `, [orgId, t.centerId]);
        const chartId = chartRes.rows[0].id;
        const verRes = await client.query(`
          INSERT INTO rate_chart_versions (rate_chart_id, version_number, effective_from, base_fat, base_snf, base_rate, is_approved)
          VALUES ($1, 1, NOW(), 3.5, 8.5, 38.0, TRUE)
          RETURNING id;
        `, [chartId]);
        rcvId = verRes.rows[0].id;
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

      let insertRes;
      try {
        insertRes = await client.query(insertSql, [
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
      } catch (err: any) {
        // Fallback only if organization_id column does not exist on legacy database schemas
        if (err?.message && err.message.includes('column "organization_id" does not exist')) {
          const fallbackInsertSql = `
            INSERT INTO milk_collections (
              id, session_id, center_id, customer_id, business_date, shift_type,
              milk_category, net_weight, measurement_unit, fat_percentage, snf_percentage,
              rate_chart_version_id, applied_rate_per_unit, total_amount, transaction_status,
              client_intake_uuid, idempotency_key, created_at, synced_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6,
              $7, $8, 'LITERS', $9, $10,
              $11, $12, $13, 'COMPLETED',
              gen_random_uuid(), $14, NOW(), NOW()
            )
            ON CONFLICT (idempotency_key) DO NOTHING
            RETURNING id;
          `;
          insertRes = await client.query(fallbackInsertSql, [
            t.id,
            intakeSessionId,
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
        } else {
          throw err;
        }
      }

      // Check whether an actual row was inserted
      // In PostgreSQL: insertRes.rows.length === 0 when ON CONFLICT DO NOTHING activates
      // In pg-mem: insertRes.rows[0]?.id !== t.id on conflict
      const wasInserted = Boolean(insertRes && insertRes.rows.length > 0 && insertRes.rows[0]?.id === t.id);
      const ledgerKey = `LEDGER-COLL-${orgId}-${idempotencyKey}`;
      const existingLedger = await client.query(
        `SELECT id FROM ledger_transactions WHERE idempotency_key = $1 LIMIT 1;`,
        [ledgerKey]
      );

      if (!wasInserted || existingLedger.rows.length > 0) {
        // CONFLICT / DUPLICATE DETECTED:
        // Another concurrent request created the canonical collection or it was already committed.
        // DO NOT update session totals. DO NOT post farmer ledger credit.
        return await this.resolveExistingReplay(client, idempotencyKey, orgId, t);
      }

      // 7. Resolve customer_ledger_accounts row lock (FOR UPDATE)
      let currentBalance = 0;
      const accountRes = await client.query(
        `SELECT id, current_balance FROM customer_ledger_accounts
         WHERE customer_id = $1 AND organization_id = $2
         FOR UPDATE;`,
        [t.customerId, orgId]
      );

      let ledgerAccountId: string;
      if (accountRes.rows.length > 0) {
        ledgerAccountId = accountRes.rows[0].id;
        currentBalance = Number(accountRes.rows[0].current_balance || 0);
      } else {
        const createAccRes = await client.query(
          `INSERT INTO customer_ledger_accounts (customer_id, organization_id, currency, current_balance)
           VALUES ($1, $2, 'INR', 0.00)
           ON CONFLICT (customer_id) DO UPDATE SET updated_at = NOW()
           RETURNING id, current_balance;`,
          [t.customerId, orgId]
        );
        ledgerAccountId = createAccRes.rows[0].id;
        currentBalance = Number(createAccRes.rows[0].current_balance || 0);
      }

      const newBalance = Math.round((currentBalance + t.totalAmount + Number.EPSILON) * 100) / 100;

      // 8. WINNER DETERMINATION: Insert deterministic ledger_transactions row
      const ledgerEntryId = crypto.randomUUID();
      const ledgerIdempotencyKey = `LEDGER-COLL-${orgId}-${idempotencyKey}`;
      const ledgerTxnRes = await client.query(
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
        // Concurrently inserted by parallel intake!
        return await this.resolveExistingReplay(client, idempotencyKey, orgId);
      }

      // 9. WINNER: Update customer_ledger_accounts running balance
      await client.query(
        `UPDATE customer_ledger_accounts
         SET current_balance = $1, last_transaction_at = NOW(), updated_at = NOW()
         WHERE id = $2;`,
        [newBalance, ledgerAccountId]
      );

      // 10. WINNER: Update session cumulative totals in the EXACT SAME transaction
      await client.query(
        `UPDATE kiosk_shift_sessions SET
          total_liters = total_liters + $2::numeric,
          cow_liters = cow_liters + (CASE WHEN $3 = 'COW' THEN $2::numeric ELSE 0.0 END),
          buffalo_liters = buffalo_liters + (CASE WHEN $3 = 'BUFFALO' THEN $2::numeric ELSE 0.0 END),
          transaction_count = transaction_count + 1,
          total_amount = total_amount + $4::numeric,
          updated_at = NOW()
        WHERE id = $1`,
        [t.sessionId, t.weightLiters, t.milkCategory, t.totalAmount]
      );

      // 11. WINNER: Insert balanced double-entry ledger line
      await client.query(
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
      } catch (outboxErr: any) {
        // Log silently if table is not yet created in legacy mock environments
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
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId);
    const sessionWhere = isUuid
      ? `(mc.session_id = $1 OR (
          mc.center_id = (SELECT center_id FROM kiosk_shift_sessions WHERE id = $1 LIMIT 1)
          AND mc.business_date = (SELECT business_date FROM kiosk_shift_sessions WHERE id = $1 LIMIT 1)
          AND mc.shift_type = (SELECT shift FROM kiosk_shift_sessions WHERE id = $1 LIMIT 1)
        ))`
      : `(mc.session_id IN (SELECT id FROM kiosk_shift_sessions WHERE session_code = $1) OR (
          mc.center_id = (SELECT center_id FROM kiosk_shift_sessions WHERE session_code = $1 LIMIT 1)
          AND mc.business_date = (SELECT business_date FROM kiosk_shift_sessions WHERE session_code = $1 LIMIT 1)
          AND mc.shift_type = (SELECT shift FROM kiosk_shift_sessions WHERE session_code = $1 LIMIT 1)
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
      ORDER BY mc.created_at DESC
      LIMIT $2;
    `;

    if (organizationId) {
      try {
        const client = await this.getDb(organizationId);
        const result = await client.query(sql, [sessionId, limit]);
        return result.rows.map((row: any) => this.mapRowToTransaction(row));
      } catch {}
    }

    for (const tenantDb of tenantDbManager.getAllTenantDbs()) {
      try {
        const result = await tenantDb.query(sql, [sessionId, limit]);
        if (result.rows.length > 0) {
          return result.rows.map((row: any) => this.mapRowToTransaction(row));
        }
      } catch {}
    }

    try {
      const result = await db.query(sql, [sessionId, limit]);
      return result.rows.map((row: any) => this.mapRowToTransaction(row));
    } catch {
      return [];
    }
  }

  public async listByCustomer(customerId: string, limit = 50, offset = 0, organizationId?: string): Promise<MilkCollectionTransaction[]> {
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
      ORDER BY mc.business_date DESC, mc.created_at DESC
      LIMIT $2 OFFSET $3;
    `;

    if (organizationId) {
      try {
        const client = await this.getDb(organizationId);
        const result = await client.query(sql, [customerId, limit, offset]);
        return result.rows.map((row: any) => this.mapRowToTransaction(row));
      } catch {}
    }

    for (const tenantDb of tenantDbManager.getAllTenantDbs()) {
      try {
        const result = await tenantDb.query(sql, [customerId, limit, offset]);
        if (result.rows.length > 0) {
          return result.rows.map((row: any) => this.mapRowToTransaction(row));
        }
      } catch {}
    }

    try {
      const result = await db.query(sql, [customerId, limit, offset]);
      return result.rows.map((row: any) => this.mapRowToTransaction(row));
    } catch {
      return [];
    }
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
        AND mc.business_date >= $2
        AND mc.business_date <= $3
        AND mc.transaction_status = 'COMPLETED';
    `;

    if (organizationId) {
      try {
        const client = await this.getDb(organizationId);
        const result = await client.query(sql, [customerId, startDate, endDate]);
        if (result.rows.length > 0) {
          const row = result.rows[0];
          return {
            monthYear,
            totalLiters: Math.round((Number(row.total_liters) + Number.EPSILON) * 100) / 100,
            cowLiters: Math.round((Number(row.cow_liters) + Number.EPSILON) * 100) / 100,
            buffaloLiters: Math.round((Number(row.buffalo_liters) + Number.EPSILON) * 100) / 100,
            avgFat: Math.round((Number(row.avg_fat) + Number.EPSILON) * 100) / 100,
            avgSnf: Math.round((Number(row.avg_snf) + Number.EPSILON) * 100) / 100,
            totalAmount: Math.round((Number(row.total_amount) + Number.EPSILON) * 100) / 100,
            transactionCount: Number(row.transaction_count),
          };
        }
      } catch {}
    }

    for (const tenantDb of tenantDbManager.getAllTenantDbs()) {
      try {
        const result = await tenantDb.query(sql, [customerId, startDate, endDate]);
        if (result.rows.length > 0 && Number(result.rows[0].transaction_count) > 0) {
          const row = result.rows[0];
          return {
            monthYear,
            totalLiters: Math.round((Number(row.total_liters) + Number.EPSILON) * 100) / 100,
            cowLiters: Math.round((Number(row.cow_liters) + Number.EPSILON) * 100) / 100,
            buffaloLiters: Math.round((Number(row.buffalo_liters) + Number.EPSILON) * 100) / 100,
            avgFat: Math.round((Number(row.avg_fat) + Number.EPSILON) * 100) / 100,
            avgSnf: Math.round((Number(row.avg_snf) + Number.EPSILON) * 100) / 100,
            totalAmount: Math.round((Number(row.total_amount) + Number.EPSILON) * 100) / 100,
            transactionCount: Number(row.transaction_count),
          };
        }
      } catch {}
    }

    try {
      const result = await db.query(sql, [customerId, startDate, endDate]);
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
    } catch {
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
  }
}
