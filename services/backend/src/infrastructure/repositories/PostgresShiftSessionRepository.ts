import { IShiftSessionRepository } from '../../application/ports/index.js';
import { KioskShiftSession, KioskShiftSessionProps } from '../../domain/entities/KioskShiftSession.js';
import { db } from '../database/PostgresPool.js';

export class PostgresShiftSessionRepository implements IShiftSessionRepository {
  private mapRowToSession(row: any): KioskShiftSession {
    const props: KioskShiftSessionProps = {
      id: row.id,
      sessionCode: row.session_code,
      organizationId: row.organization_id,
      centerId: row.center_id,
      businessDate: row.business_date instanceof Date
        ? row.business_date.toISOString().split('T')[0]
        : String(row.business_date),
      shift: row.shift,
      status: row.status,
      openedAt: row.opened_at?.toISOString?.() || String(row.opened_at),
      closedAt: row.closed_at ? (row.closed_at?.toISOString?.() || String(row.closed_at)) : null,
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
    };

    return new KioskShiftSession(props);
  }

  public async findActiveSession(
    centerId: string,
    deviceIdentifier: string
  ): Promise<KioskShiftSession | null> {
    try {
      const sql = `
        SELECT 
          s.*,
          u_open.full_name AS opening_operator_name,
          u_close.full_name AS closing_operator_name
        FROM kiosk_shift_sessions s
        LEFT JOIN users u_open ON u_open.id = s.opening_operator_id
        LEFT JOIN users u_close ON u_close.id = s.closing_operator_id
        WHERE s.center_id = $1 AND s.device_identifier = $2 AND s.status = 'OPEN'
        ORDER BY s.opened_at DESC
        LIMIT 1;
      `;
      const result = await db.query(sql, [centerId, deviceIdentifier]);
      if (result.rows.length === 0) return null;
      return this.mapRowToSession(result.rows[0]);
    } catch {
      return null;
    }
  }

  public async findByCode(sessionCode: string): Promise<KioskShiftSession | null> {
    try {
      const sql = `
        SELECT 
          s.*,
          u_open.full_name AS opening_operator_name,
          u_close.full_name AS closing_operator_name
        FROM kiosk_shift_sessions s
        LEFT JOIN users u_open ON u_open.id = s.opening_operator_id
        LEFT JOIN users u_close ON u_close.id = s.closing_operator_id
        WHERE s.session_code = $1
        LIMIT 1;
      `;
      const result = await db.query(sql, [sessionCode]);
      if (result.rows.length === 0) return null;
      return this.mapRowToSession(result.rows[0]);
    } catch {
      return null;
    }
  }

  public async save(session: KioskShiftSession): Promise<void> {
    try {
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
          updated_at = NOW();
      `;

      await db.query(upsertSql, [
        session.id,
        session.sessionCode,
        session.organizationId,
        session.centerId,
        session.businessDate,
        session.shift,
        session.status,
        session.openedAt,
        session.closedAt || null,
        (session as any).props.openingOperatorId,
        (session as any).props.closingOperatorId || null,
        session.deviceIdentifier,
        session.deviceName,
        totals.totalLiters,
        totals.cowLiters,
        totals.buffaloLiters,
        totals.transactionCount,
        totals.totalAmount,
        totals.averageFat,
        totals.averageSnf,
      ]);
    } catch (err) {
      if (process.env['NODE_ENV'] === 'production') throw err;
      // In dev mode allow memory session continuation
    }
  }
}
