import { pool } from '../../config/db.js';
import { AppError, ValidationError, NotFoundError, ForbiddenError } from '../../shared/errors/app-error.js';
import { MilkCategory, ReadingSource, Shift, NotificationEventType } from '@dfarm/shared-types';
import { AuthContext } from '../../middleware/authenticate.js';
import { NotificationService } from '../notifications/services/notification.service.js';
import { logger } from '../../shared/logger/index.js';

export interface CreateSessionDTO {
  customerId: string;
  centerId: string;
  deviceId?: string;
  identificationMethod: 'FACE' | 'RFID' | 'SUPERVISOR_MANUAL';
  milkCategory: MilkCategory;
  shift?: Shift;
  businessDate?: string;
  intakeSequenceUuid?: string;
}

export interface RecordMeasurementsDTO {
  fatPercentage?: number;
  snfPercentage?: number;
  clr?: number;
  netWeight?: number;
  source?: ReadingSource;
}

export interface CompleteSessionDTO {
  clientIntakeUuid: string;
  idempotencyKey?: string;
  netWeight: number;
  fatPercentage: number;
  snfPercentage?: number;
  clr?: number;
  source?: ReadingSource;
  deviceId?: string;
}

export interface SupervisorAdjustmentDTO {
  supervisorId?: string;
  adjustmentType: 'CORRECTION' | 'FULL_REVERSAL';
  reason: string;
  adjustedNetWeight?: number;
  adjustedFatPercentage?: number;
  adjustedSnfPercentage?: number;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUuid(val?: string | null): boolean {
  return typeof val === 'string' && UUID_REGEX.test(val.trim());
}

export class CollectionService {
  /**
   * Creates a new milk collection session via database stored procedure.
   */
  public static async createSession(dto: CreateSessionDTO, context: AuthContext) {
    const centerId = dto.centerId || context.primaryCenterId;
    if (!centerId) {
      throw new ValidationError('centerId is required');
    }

    const deviceId = dto.deviceId || 'BACKEND_API';
    let shiftType = dto.shift;
    if (!shiftType) {
      const currentHour = new Date().getHours();
      shiftType = currentHour < 15 ? Shift.MORNING : Shift.EVENING;
    }

    const businessDate = dto.businessDate || new Date().toISOString().split('T')[0];

    try {
      const rpcRes = await pool.query(
        `SELECT public.create_milk_collection_session(
           $1::uuid, $2::uuid, $3::uuid, $4::varchar, $5::varchar,
           $6::varchar, $7::varchar, $8::uuid, $9::date, NULL
         ) as result;`,
        [
          centerId,
          dto.customerId,
          context.userId,
          deviceId,
          shiftType,
          dto.milkCategory,
          dto.identificationMethod,
          dto.intakeSequenceUuid || null,
          businessDate,
        ]
      );

      return rpcRes.rows[0].result;
    } catch (err: any) {
      if (err.message && err.message.includes('Customer organization mismatch')) {
        throw new ForbiddenError(err.message, 'ORGANIZATION_MISMATCH');
      }
      if (err.message && err.message.includes('not authorized to deliver')) {
        throw new ValidationError(err.message);
      }
      if (err.message && err.message.includes('already has an active incomplete collection session')) {
        throw new AppError(err.message, 409, 'CONCURRENT_SESSION_EXISTS');
      }
      if (err.message && err.message.includes('soft-deleted')) {
        throw new ForbiddenError(err.message, 'CUSTOMER_DELETED');
      }
      if (err.message && err.message.includes('not ACTIVE')) {
        throw new ForbiddenError(err.message, 'CUSTOMER_NOT_ACTIVE');
      }
      if (err.message && err.message.toLowerCase().includes('center') && (err.message.toLowerCase().includes('mismatch') || err.message.toLowerCase().includes('match'))) {
        throw new ForbiddenError(err.message, 'CENTER_MISMATCH');
      }
      throw err;
    }
  }

  /**
   * Ingests Fat/SNF/Weight measurements into active session.
   */
  public static async recordMeasurements(sessionId: string, dto: RecordMeasurementsDTO, context: AuthContext) {
    const sessionRes = await pool.query(
      `SELECT cs.*, c.organization_id 
       FROM collection_sessions cs
       JOIN customers c ON c.id = cs.customer_id
       WHERE cs.id = $1 AND c.organization_id = $2;`,
      [sessionId, context.organizationId]
    );

    if (sessionRes.rows.length === 0) {
      throw new NotFoundError(`Session '${sessionId}' not found`, 'SESSION_NOT_FOUND');
    }

    const session = sessionRes.rows[0];
    if (['COMPLETED', 'CANCELLED', 'FAILED'].includes(session.session_state)) {
      throw new AppError(`Cannot record measurements on session in state '${session.session_state}'`, 400, 'SESSION_ALREADY_CLOSED');
    }

    // Read biological validation bounds for center
    const limitsRes = await pool.query(
      `SELECT * FROM center_settings WHERE center_id = $1;`,
      [session.center_id]
    );
    const limits = limitsRes.rows[0] || {
      cow_fat_min: 2.8, cow_fat_max: 6.0, cow_snf_min: 7.8, cow_snf_max: 10.2,
      buffalo_fat_min: 5.0, buffalo_fat_max: 12.0, buffalo_snf_min: 8.2, buffalo_snf_max: 11.5
    };

    if (dto.fatPercentage !== undefined) {
      const isCow = session.selected_milk_category === 'COW';
      const minFat = isCow ? limits.cow_fat_min : limits.buffalo_fat_min;
      const maxFat = isCow ? limits.cow_fat_max : limits.buffalo_fat_max;
      if (dto.fatPercentage < minFat || dto.fatPercentage > maxFat) {
        throw new ValidationError(`Fat ${dto.fatPercentage}% is outside approved biological limits [${minFat} - ${maxFat}%] for ${session.selected_milk_category}`);
      }
    }

    if (dto.snfPercentage !== undefined) {
      const isCow = session.selected_milk_category === 'COW';
      const minSnf = isCow ? limits.cow_snf_min : limits.buffalo_snf_min;
      const maxSnf = isCow ? limits.cow_snf_max : limits.buffalo_snf_max;
      if (dto.snfPercentage < minSnf || dto.snfPercentage > maxSnf) {
        throw new ValidationError(`SNF ${dto.snfPercentage}% is outside approved biological limits [${minSnf} - ${maxSnf}%] for ${session.selected_milk_category}`);
      }
    }

    if (dto.netWeight !== undefined) {
      if (dto.netWeight <= 0) {
        throw new ValidationError(`Net weight must be strictly positive (got ${dto.netWeight})`);
      }
    }

    // Insert reading records if provided
    if (dto.fatPercentage !== undefined && dto.snfPercentage !== undefined) {
      await pool.query(
        `INSERT INTO collection_quality_readings (session_id, fat_percentage, snf_percentage, density_clr, validation_status, reading_source)
         VALUES ($1, $2, $3, $4, 'VALID', $5);`,
        [sessionId, dto.fatPercentage, dto.snfPercentage, dto.clr || null, dto.source || 'MANUAL_ENTRY']
      );
    }

    if (dto.netWeight !== undefined) {
      await pool.query(
        `INSERT INTO collection_weight_readings (session_id, measured_weight, net_weight, validation_status, reading_source)
         VALUES ($1, $2, $2, 'VALID', $3);`,
        [sessionId, dto.netWeight, dto.source || 'MANUAL_ENTRY']
      );
    }

    const updateRes = await pool.query(
      `UPDATE collection_sessions 
       SET session_state = 'READY_FOR_REVIEW'
       WHERE id = $1
       RETURNING *;`,
      [sessionId]
    );

    return updateRes.rows[0];
  }

  /**
   * Completes a milk collection session atomically via PostgreSQL stored procedure.
   * Performs server-authoritative rate calculation and atomic double-entry ledger posting.
   */
  public static async completeSession(sessionId: string, dto: CompleteSessionDTO, context: AuthContext) {
    if (!dto.clientIntakeUuid) {
      throw new ValidationError('clientIntakeUuid is required for idempotency');
    }
    if (dto.netWeight <= 0) {
      throw new ValidationError('netWeight must be strictly positive');
    }
    if (dto.fatPercentage <= 0) {
      throw new ValidationError('fatPercentage must be strictly positive');
    }

    const idempotencyKey = dto.idempotencyKey || dto.clientIntakeUuid;
    const source = dto.source || 'MANUAL_ENTRY';
    const snf = dto.snfPercentage || 8.5;
    const deviceId = dto.deviceId || 'BACKEND_API';

    try {
      const rpcRes = await pool.query(
        `SELECT public.complete_milk_collection_session(
           $1::uuid, $2::uuid, $3::varchar, $4::numeric, $5::numeric,
           $6::numeric, 'KG'::varchar, $7::varchar, $8::uuid, $9::varchar
         ) as result;`,
        [
          sessionId,
          context.userId,
          deviceId,
          dto.netWeight,
          dto.fatPercentage,
          snf,
          source,
          dto.clientIntakeUuid,
          idempotencyKey,
        ]
      );

      const res = rpcRes.rows[0].result;

      // Asynchronously dispatch durable notification event after transaction commit
      if (res.collectionId && !res.isIdempotentReplay) {
        pool.query(
          `SELECT cs.customer_id, cs.selected_milk_category, cs.shift, dc.name as center_name
           FROM collection_sessions cs
           JOIN dairy_centers dc ON dc.id = cs.center_id
           WHERE cs.id = $1;`,
          [sessionId]
        ).then(sRes => {
          if (sRes.rows.length > 0) {
            const sess = sRes.rows[0];
            const weight = Number(dto.netWeight) || 0;
            const amount = Number(res.totalAmount) || 0;
            const rate = weight > 0 ? amount / weight : 0;
            NotificationService.enqueueNotification({
              organizationId: context.organizationId,
              centerId: context.centerId,
              customerId: sess.customer_id,
              eventType: NotificationEventType.MILK_COLLECTION_COMPLETED,
              eventId: `evt_coll_${res.collectionId}`,
              idempotencyKey: `notif_coll_${res.collectionId}`,
              metadata: {
                collectionId: res.collectionId,
                receiptNumber: res.receiptNumber,
                quantity: dto.netWeight,
                fat: dto.fatPercentage,
                snf,
                milkCategory: sess.selected_milk_category,
                shift: sess.shift,
                rate,
                totalAmount: res.totalAmount,
                balance: res.newBalance,
                centerName: sess.center_name,
              },
            }).catch(e => logger.error({ error: e.message }, 'Failed to enqueue collection notification'));
          }
        }).catch(e => logger.error({ error: e.message }, 'Failed to query session for collection notification'));
      }

      return {
        session: { id: res.sessionId, session_state: res.transactionStatus },
        collection: { id: res.collectionId, total_amount: res.totalAmount },
        ledger: { newBalance: res.newBalance, previousBalance: res.previousBalance },
        receipt: { receiptNumber: res.receiptNumber },
        status: res.isIdempotentReplay ? 'IDEMPOTENT_REPLAY' : 'COMPLETED',
      };
    } catch (err: any) {
      if (err.message && err.message.includes('RATE_CELL_NOT_FOUND')) {
        throw new AppError(err.message, 404, 'RATE_CELL_NOT_FOUND');
      }
      throw err;
    }
  }

  /**
   * Safely cancels an active session with an audit reason.
   */
  public static async cancelSession(sessionId: string, reason: string, context: AuthContext) {
    if (!reason || reason.trim().length < 3) {
      throw new ValidationError('Cancellation reason is required (min 3 characters)');
    }

    const rpcRes = await pool.query(
      `SELECT public.cancel_milk_collection_session($1::uuid, $2::uuid, $3::text) as result;`,
      [sessionId, context.userId, reason.trim()]
    );

    return rpcRes.rows[0].result;
  }

  /**
   * Supervisor adjustment / reversal with full audit trail.
   */
  public static async adjustCollection(sessionId: string, dto: SupervisorAdjustmentDTO, context: AuthContext) {
    if (!reasonValid(dto.reason)) {
      throw new ValidationError('Adjustment reason is required (min 5 characters)');
    }

    // Find collection by sessionId
    const colRes = await pool.query(
      `SELECT id FROM milk_collections WHERE session_id = $1 LIMIT 1;`,
      [sessionId]
    );

    const collectionId = colRes.rows.length > 0 ? colRes.rows[0].id : sessionId;

    const rpcRes = await pool.query(
      `SELECT public.adjust_milk_collection(
         $1::uuid, $2::uuid, $3::text, $4::varchar,
         $5::numeric, $6::numeric, $7::numeric
       ) as result;`,
      [
        collectionId,
        context.userId,
        dto.reason,
        dto.adjustmentType,
        dto.adjustedNetWeight || null,
        dto.adjustedFatPercentage || null,
        dto.adjustedSnfPercentage || null,
      ]
    );

    return rpcRes.rows[0].result;
  }

  /**
   * Generates a 40-column thermal receipt slip text.
   */
  public static async getReceiptText(sessionId: string, _context: AuthContext): Promise<string> {
    const res = await pool.query(
      `SELECT cs.*, c.farmer_code, c.full_name, dc.name as center_name, u.full_name as operator_name,
              mc.net_weight, mc.fat_percentage, mc.snf_percentage, mc.applied_rate_per_unit, mc.total_amount
       FROM collection_sessions cs
       JOIN customers c ON c.id = cs.customer_id
       JOIN dairy_centers dc ON dc.id = cs.center_id
       LEFT JOIN users u ON u.id = cs.operator_id
       LEFT JOIN milk_collections mc ON mc.session_id = cs.id
       WHERE cs.id = $1;`,
      [sessionId]
    );

    if (res.rows.length === 0) {
      throw new NotFoundError(`Session '${sessionId}' not found`, 'SESSION_NOT_FOUND');
    }

    const row = res.rows[0];

    // Customer isolation check
    if (_context?.actorType === 'CUSTOMER') {
      const allowedCustId = _context.customerProfile?.customerId || _context.userId;
      if (allowedCustId !== row.customer_id) {
        throw new ForbiddenError(
          'Customer accounts may only view their own collection receipts',
          'CUSTOMER_ISOLATION_VIOLATION'
        );
      }
    }
    const receiptNum = `RCP-${row.id.substring(0, 8).toUpperCase()}`;
    const W = 40;
    const sep = '='.repeat(W);
    const dash = '-'.repeat(W);

    const padRow = (l: string, r: string) => {
      const space = W - l.length - r.length;
      return space > 0 ? l + ' '.repeat(space) + r : `${l} ${r}`;
    };

    const lines: string[] = [
      'DFARM DAIRY MILK COLLECTION'.padStart(20 + 13).padEnd(W),
      (row.center_name || 'DAIRY CENTER').padStart(20 + Math.floor((row.center_name?.length || 12)/2)).padEnd(W),
      sep,
      padRow(`Date: ${row.business_date}`, `Shift: ${row.shift_type}`),
      padRow(`Receipt: ${receiptNum}`, `State: ${row.session_state}`),
      dash,
      padRow('Farmer Code:', row.farmer_code || ''),
      padRow('Customer:', maskName(row.full_name || '')),
      padRow('Category:', row.selected_milk_category || 'COW'),
      dash,
      padRow('Net Weight:', `${row.net_weight || 0} kg`),
      padRow('Fat %:', `${row.fat_percentage || 0} %`),
      padRow('SNF %:', `${row.snf_percentage || 0} %`),
      padRow('Rate / kg:', `INR ${row.applied_rate_per_unit || 0}`),
      dash,
      padRow('TOTAL AMOUNT:', `INR ${row.total_amount || 0}`),
      sep,
      `Session: ${row.id.substring(0, 18)}...`,
      `Operator: ${row.operator_name || ''}`,
      '*** THANK YOU ***'.padStart(20 + 8).padEnd(W),
    ];

    return lines.join('\n');
  }

  public static async getShiftSummary(centerId: string, shift: Shift, date: string, _context: AuthContext) {
    const params: any[] = [];
    let query: string;

    if (isValidUuid(centerId)) {
      params.push(centerId.trim(), shift, date);
      query = `SELECT COUNT(mc.id) as total_collections,
                      COALESCE(SUM(mc.net_weight), 0) as total_weight,
                      COALESCE(AVG(mc.fat_percentage), 0) as avg_fat,
                      COALESCE(AVG(mc.snf_percentage), 0) as avg_snf,
                      COALESCE(SUM(mc.total_amount), 0) as total_amount
               FROM milk_collections mc
               WHERE mc.center_id = $1 
                 AND mc.shift_type = $2
                 AND mc.business_date = $3;`;
    } else {
      const orgId = _context?.organizationId;
      params.push(orgId, shift, date);
      query = `SELECT COUNT(mc.id) as total_collections,
                      COALESCE(SUM(mc.net_weight), 0) as total_weight,
                      COALESCE(AVG(mc.fat_percentage), 0) as avg_fat,
                      COALESCE(AVG(mc.snf_percentage), 0) as avg_snf,
                      COALESCE(SUM(mc.total_amount), 0) as total_amount
               FROM milk_collections mc
               JOIN dairy_centers dc ON dc.id = mc.center_id
               WHERE dc.organization_id = $1 
                 AND mc.shift_type = $2
                 AND mc.business_date = $3;`;
    }

    const res = await pool.query(query, params);
    const r = res.rows[0] || {};
    return {
      centerId: isValidUuid(centerId) ? centerId.trim() : null,
      shift,
      businessDate: date,
      totalCollections: parseInt(r.total_collections || '0', 10),
      totalWeightKg: parseFloat(r.total_weight || '0'),
      averageFat: Math.round(parseFloat(r.avg_fat || '0') * 100) / 100,
      averageSnf: Math.round(parseFloat(r.avg_snf || '0') * 100) / 100,
      totalAmount: parseFloat(r.total_amount || '0'),
    };
  }

  public static async getHistory(
    centerId?: string,
    date?: string,
    shift?: Shift,
    _context?: AuthContext,
    limit?: number
  ) {
    const params: any[] = [];
    const whereClauses: string[] = [];

    if (isValidUuid(centerId)) {
      params.push(centerId!.trim());
      whereClauses.push(`cs.center_id = $${params.length}`);
    } else if (_context?.organizationId && isValidUuid(_context.organizationId)) {
      params.push(_context.organizationId);
      whereClauses.push(`c.organization_id = $${params.length}`);
    }

    if (date && date.trim()) {
      params.push(date.trim());
      whereClauses.push(`cs.business_date = $${params.length}`);
    }

    // Customer isolation: restrict to their own records
    if (_context?.actorType === 'CUSTOMER') {
      const custId = _context.customerProfile?.customerId || _context.userId;
      params.push(custId);
      whereClauses.push(`cs.customer_id = $${params.length}`);
    }

    if (shift) {
      params.push(shift);
      whereClauses.push(`cs.shift_type = $${params.length}`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const safeLimit = typeof limit === 'number' && limit > 0 ? Math.min(limit, 100) : 100;

    const query = `
      SELECT cs.id, cs.customer_id, c.farmer_code, c.full_name as customer_name,
             cs.selected_milk_category, cs.shift_type, cs.business_date, cs.session_state,
             mc.net_weight, mc.fat_percentage, mc.snf_percentage, mc.applied_rate_per_unit, mc.total_amount,
             cs.started_at, cs.completed_at
      FROM collection_sessions cs
      JOIN customers c ON c.id = cs.customer_id
      LEFT JOIN milk_collections mc ON mc.session_id = cs.id
      ${whereSql}
      ORDER BY cs.started_at DESC
      LIMIT ${safeLimit};
    `;

    const res = await pool.query(query, params);
    return res.rows;
  }

  public static async getCustomerCollections(
    customerId: string,
    filters: {
      startDate?: string;
      endDate?: string;
      category?: string;
      shift?: string;
      limit?: number;
      offset?: number;
    },
    auth: AuthContext
  ) {
    // Customer isolation check
    if (auth.actorType === 'CUSTOMER') {
      const allowedCustId = auth.customerProfile?.customerId || auth.userId;
      if (allowedCustId !== customerId) {
        throw new ForbiddenError(
          'Customer accounts may only view their own milk collections',
          'CUSTOMER_ISOLATION_VIOLATION'
        );
      }
    }

    const limit = Math.min(100, Math.max(1, filters.limit || 50));
    const offset = Math.max(0, filters.offset || 0);

    const params: any[] = [customerId, auth.organizationId];
    let query = `
      SELECT cs.id as session_id,
             mc.id as collection_id,
             cs.customer_id,
             c.farmer_code,
             c.full_name as customer_name,
             cs.selected_milk_category as milk_category,
             cs.shift_type,
             cs.business_date,
             cs.session_state,
             COALESCE(mc.net_weight, 0) as net_weight,
             COALESCE(mc.measurement_unit, 'KG') as measurement_unit,
             COALESCE(mc.fat_percentage, 0) as fat_percentage,
             COALESCE(mc.snf_percentage, 0) as snf_percentage,
             COALESCE(mc.applied_rate_per_unit, 0) as applied_rate_per_unit,
             COALESCE(mc.total_amount, 0) as total_amount,
             'RCP-' || UPPER(SUBSTRING(cs.id::text, 1, 8)) as receipt_number,
             cs.started_at,
             cs.completed_at
      FROM collection_sessions cs
      JOIN customers c ON c.id = cs.customer_id
      LEFT JOIN milk_collections mc ON mc.session_id = cs.id
      WHERE cs.customer_id = $1 AND c.organization_id = $2
    `;

    if (filters.startDate) {
      params.push(filters.startDate);
      query += ` AND cs.business_date >= $${params.length}`;
    }

    if (filters.endDate) {
      params.push(filters.endDate);
      query += ` AND cs.business_date <= $${params.length}`;
    }

    if (filters.category) {
      params.push(filters.category.toUpperCase());
      query += ` AND UPPER(cs.selected_milk_category) = $${params.length}`;
    }

    if (filters.shift) {
      params.push(filters.shift.toUpperCase());
      query += ` AND UPPER(cs.shift_type) = $${params.length}`;
    }

    // Count query
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM (${query}) q;`,
      params
    );

    query += ` ORDER BY cs.business_date DESC, cs.completed_at DESC NULLS LAST LIMIT $${params.length + 1} OFFSET $${params.length + 2};`;
    params.push(limit, offset);

    const res = await pool.query(query, params);

    return {
      customerId,
      total: parseInt(countRes.rows[0].count, 10),
      limit,
      offset,
      collections: res.rows.map(r => ({
        sessionId: r.session_id,
        collectionId: r.collection_id,
        customerId: r.customer_id,
        farmerCode: r.farmer_code,
        customerName: r.customer_name,
        milkCategory: r.milk_category,
        shiftType: r.shift_type,
        businessDate: r.business_date instanceof Date ? r.business_date.toISOString().slice(0, 10) : String(r.business_date),
        sessionState: r.session_state,
        netWeight: Number(r.net_weight),
        measurementUnit: r.measurement_unit || 'KG',
        fatPercentage: Number(r.fat_percentage),
        snfPercentage: Number(r.snf_percentage),
        appliedRatePerUnit: Number(r.applied_rate_per_unit),
        totalAmount: Number(r.total_amount),
        receiptNumber: r.receipt_number,
        startedAt: r.started_at,
        completedAt: r.completed_at,
      })),
    };
  }
}

function reasonValid(reason?: string): boolean {
  return typeof reason === 'string' && reason.trim().length >= 5;
}

function maskName(name: string): string {
  const parts = name.split(' ');
  return parts.map(p => (p.length > 2 ? p.slice(0, 2) + '*'.repeat(p.length - 2) : p)).join(' ');
}
