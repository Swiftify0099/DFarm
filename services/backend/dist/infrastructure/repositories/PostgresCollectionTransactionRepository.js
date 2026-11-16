import crypto from 'node:crypto';
import { MilkCollectionTransaction } from '../../domain/entities/MilkCollectionTransaction.js';
import { db } from '../database/PostgresPool.js';
export class PostgresCollectionTransactionRepository {
    mapRowToTransaction(row) {
        const props = {
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
                ? row.business_date.toISOString().split('T')[0]
                : String(row.business_date),
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
    async save(transaction) {
        const t = transaction.toJSON();
        await db.withTransaction(async (client) => {
            // 1. Ensure shift exists in collection_shifts for center & shift
            const shiftRes = await client.query(`INSERT INTO collection_shifts (center_id, shift_type, start_time, end_time, grace_period_minutes, is_active)
         VALUES ($1, $2, '05:00:00'::time, '21:00:00'::time, 30, TRUE)
         ON CONFLICT (center_id, shift_type) DO UPDATE SET updated_at = NOW()
         RETURNING id`, [t.centerId, t.shift]);
            const shiftId = shiftRes.rows[0].id;
            // 2. Generate unique individual intake session ID for this transaction
            const intakeSessionId = crypto.randomUUID();
            // Ensure collection_sessions row exists
            await client.query(`INSERT INTO collection_sessions (
          id, center_id, customer_id, business_date, shift_id, shift_type,
          selected_milk_category, identification_method, session_state,
          intake_sequence_uuid, started_at, completed_at, operator_id, device_id
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, 'COMPLETED',
          gen_random_uuid(), NOW(), NOW(),
          COALESCE((SELECT opening_operator_id FROM kiosk_shift_sessions WHERE id = $9 LIMIT 1), '00000000-0000-0000-0000-000000000003'),
          $10
        );`, [
                intakeSessionId,
                t.centerId,
                t.customerId,
                t.date,
                shiftId,
                t.shift,
                t.milkCategory,
                t.identificationMethod === 'FACE_YUNET_SFACE' ? 'FACE' : (t.identificationMethod === 'RFID_TAG' ? 'RFID' : 'SUPERVISOR_MANUAL'),
                t.sessionId,
                t.deviceId,
            ]);
            // 3. Insert or ignore milk_collections (enforcing idempotency_key)
            const insertSql = `
        INSERT INTO milk_collections (
          id, session_id, center_id, customer_id, business_date, shift_type,
          milk_category, net_weight, measurement_unit, fat_percentage, snf_percentage,
          rate_chart_version_id, applied_rate_per_unit, total_amount, transaction_status,
          client_intake_uuid, idempotency_key, created_at, synced_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, 'LITERS', $9, $10,
          (SELECT id FROM rate_chart_versions ORDER BY created_at DESC LIMIT 1),
          $11, $12, 'COMPLETED',
          gen_random_uuid(), $13, NOW(), NOW()
        )
        ON CONFLICT (idempotency_key) DO NOTHING;
      `;
            await client.query(insertSql, [
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
                t.appliedRatePerLiter,
                t.totalAmount,
                t.idempotencyKey || `TXN-${t.id}`,
            ]);
            // 4. Update kiosk_shift_sessions totals atomically
            await client.query(`UPDATE kiosk_shift_sessions SET
          total_liters = total_liters + $2,
          cow_liters = cow_liters + (CASE WHEN $3 = 'COW' THEN $2 ELSE 0 END),
          buffalo_liters = buffalo_liters + (CASE WHEN $3 = 'BUFFALO' THEN $2 ELSE 0 END),
          transaction_count = transaction_count + 1,
          total_amount = total_amount + $4,
          updated_at = NOW()
        WHERE id = $1`, [t.sessionId, t.weightLiters, t.milkCategory, t.totalAmount]);
        });
    }
    async findByIdempotencyKey(key) {
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
      WHERE mc.idempotency_key = $1
      LIMIT 1;
    `;
        const result = await db.query(sql, [key]);
        if (result.rows.length === 0)
            return null;
        return this.mapRowToTransaction(result.rows[0]);
    }
    async listRecentBySession(sessionId, limit = 20) {
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
      WHERE (mc.session_id = $1 OR (
        mc.center_id = (SELECT center_id FROM kiosk_shift_sessions WHERE id = $1)
        AND mc.business_date = (SELECT business_date FROM kiosk_shift_sessions WHERE id = $1)
        AND mc.shift_type = (SELECT shift FROM kiosk_shift_sessions WHERE id = $1)
      ))
      ORDER BY mc.created_at DESC
      LIMIT $2;
    `;
        const result = await db.query(sql, [sessionId, limit]);
        return result.rows.map((row) => this.mapRowToTransaction(row));
    }
    async listByCustomer(customerId, limit = 50, offset = 0) {
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
      ORDER BY mc.business_date DESC, mc.created_at DESC
      LIMIT $2 OFFSET $3;
    `;
        const result = await db.query(sql, [customerId, limit, offset]);
        return result.rows.map((row) => this.mapRowToTransaction(row));
    }
    async getMonthlySummary(customerId, monthYear) {
        // monthYear is expected as YYYY-MM
        const sql = `
      SELECT 
        COALESCE(SUM(net_weight), 0.00) AS total_liters,
        COALESCE(SUM(CASE WHEN milk_category = 'COW' THEN net_weight ELSE 0 END), 0.00) AS cow_liters,
        COALESCE(SUM(CASE WHEN milk_category = 'BUFFALO' THEN net_weight ELSE 0 END), 0.00) AS buffalo_liters,
        COALESCE(AVG(fat_percentage), 0.00) AS avg_fat,
        COALESCE(AVG(snf_percentage), 0.00) AS avg_snf,
        COALESCE(SUM(total_amount), 0.00) AS total_amount,
        COUNT(id) AS transaction_count
      FROM milk_collections
      WHERE customer_id = $1 
        AND TO_CHAR(business_date, 'YYYY-MM') = $2
        AND transaction_status = 'COMPLETED';
    `;
        const result = await db.query(sql, [customerId, monthYear]);
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
}
//# sourceMappingURL=PostgresCollectionTransactionRepository.js.map