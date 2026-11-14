import { pool } from '../../db.js';
import {
  type EmployeeAttendance,
  type EmployeeShift,
  type EmployeeLeave,
  AttendanceStatus,
  EmployeeShiftType,
  LeaveStatus,
  LeaveType,
  UserRole,
} from '@dfarm/shared-types';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  BadRequestError,
} from '../../shared/errors/app-error.js';
import type { AuthContext } from '../../middleware/authenticate.js';

export class AttendanceService {
  /**
   * 1. Create or get standard shifts for organization
   */
  public static async createShift(
    data: {
      code: string;
      name: string;
      startTime: string;
      endTime: string;
      gracePeriodMinutes?: number;
      halfDayThresholdHours?: number;
      fullDayThresholdHours?: number;
    },
    auth: AuthContext
  ): Promise<EmployeeShift> {
    const existing = await pool.query(
      'SELECT id FROM employee_shifts WHERE organization_id = $1 AND code = $2',
      [auth.organizationId, data.code.trim().toUpperCase()]
    );
    if (existing.rows.length > 0) {
      throw new ConflictError(`Shift code '${data.code}' already exists`, 'DUPLICATE_SHIFT_CODE');
    }

    const res = await pool.query(
      `INSERT INTO employee_shifts (
        organization_id, code, name, start_time, end_time,
        grace_period_minutes, half_day_threshold_hours, full_day_threshold_hours
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        auth.organizationId,
        data.code.trim().toUpperCase(),
        data.name.trim(),
        data.startTime,
        data.endTime,
        data.gracePeriodMinutes ?? 15,
        data.halfDayThresholdHours ?? 4.0,
        data.fullDayThresholdHours ?? 8.0,
      ]
    );

    const row = res.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      code: row.code,
      name: row.name,
      startTime: row.start_time,
      endTime: row.end_time,
      gracePeriodMinutes: row.grace_period_minutes,
      halfDayThresholdHours: parseFloat(row.half_day_threshold_hours),
      fullDayThresholdHours: parseFloat(row.full_day_threshold_hours),
      isActive: row.is_active,
      createdAt: row.created_at.toISOString(),
    };
  }

  public static async listShifts(auth: AuthContext): Promise<EmployeeShift[]> {
    const res = await pool.query(
      'SELECT * FROM employee_shifts WHERE organization_id = $1 AND is_active = TRUE ORDER BY code ASC',
      [auth.organizationId]
    );
    return res.rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      code: row.code,
      name: row.name,
      startTime: row.start_time,
      endTime: row.end_time,
      gracePeriodMinutes: row.grace_period_minutes,
      halfDayThresholdHours: parseFloat(row.half_day_threshold_hours),
      fullDayThresholdHours: parseFloat(row.full_day_threshold_hours),
      isActive: row.is_active,
      createdAt: row.created_at.toISOString(),
    }));
  }

  /**
   * 2. Record daily attendance / check-in / check-out
   */
  public static async recordAttendance(
    data: {
      employeeId: string;
      centerId: string;
      attendanceDate: string;
      shiftType?: EmployeeShiftType;
      shiftId?: string | null;
      checkInTime?: string | null;
      checkOutTime?: string | null;
      status?: AttendanceStatus;
      overtimeHours?: number;
      notes?: string | null;
    },
    auth: AuthContext
  ): Promise<EmployeeAttendance> {
    const shiftType = data.shiftType || EmployeeShiftType.GENERAL;

    // Verify employee exists in organization
    const empRes = await pool.query(
      'SELECT id, primary_center_id FROM employees WHERE id = $1 AND organization_id = $2',
      [data.employeeId, auth.organizationId]
    );
    if (empRes.rows.length === 0) {
      throw new NotFoundError(`Employee '${data.employeeId}' not found`, 'EMPLOYEE_NOT_FOUND');
    }

    // Center access check
    if (auth.role !== UserRole.SUPER_ADMIN && auth.role !== UserRole.DAIRY_OWNER && auth.role !== UserRole.DAIRY_ADMIN) {
      if (!auth.centerIds.includes(data.centerId)) {
        throw new ForbiddenError('Actor does not have access to record attendance at this center', 'CENTER_ACCESS_DENIED');
      }
    }

    let totalHours = 0;
    let isLateArrival = false;
    let isEarlyDeparture = false;

    if (data.checkInTime && data.checkOutTime) {
      const inTime = new Date(data.checkInTime).getTime();
      const outTime = new Date(data.checkOutTime).getTime();
      if (outTime > inTime) {
        totalHours = Math.round(((outTime - inTime) / (1000 * 60 * 60)) * 100) / 100;
      }
    }

    // Status auto-computation if check-in present
    let status = data.status || AttendanceStatus.PRESENT;
    if (totalHours > 0 && totalHours < 4.0 && status === AttendanceStatus.PRESENT) {
      status = AttendanceStatus.HALF_DAY;
    }

    const res = await pool.query(
      `INSERT INTO employee_attendance (
        organization_id, center_id, employee_id, attendance_date, shift_id, shift_type,
        check_in_time, check_out_time, total_hours, status, is_late_arrival, is_early_departure,
        overtime_hours, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (employee_id, attendance_date, shift_type)
      DO UPDATE SET
        center_id = EXCLUDED.center_id,
        shift_id = COALESCE(EXCLUDED.shift_id, employee_attendance.shift_id),
        check_in_time = COALESCE(EXCLUDED.check_in_time, employee_attendance.check_in_time),
        check_out_time = COALESCE(EXCLUDED.check_out_time, employee_attendance.check_out_time),
        total_hours = EXCLUDED.total_hours,
        status = EXCLUDED.status,
        overtime_hours = EXCLUDED.overtime_hours,
        notes = COALESCE(EXCLUDED.notes, employee_attendance.notes),
        updated_at = NOW()
      RETURNING *`,
      [
        auth.organizationId,
        data.centerId,
        data.employeeId,
        data.attendanceDate,
        data.shiftId || null,
        shiftType,
        data.checkInTime || null,
        data.checkOutTime || null,
        totalHours,
        status,
        isLateArrival,
        isEarlyDeparture,
        data.overtimeHours || 0.0,
        data.notes || null,
      ]
    );

    const row = res.rows[0];
    return this.formatAttendance(row);
  }

  /**
   * 3. Manual Attendance Correction with Mandatory Audit Reason
   */
  public static async correctAttendance(
    attendanceId: string,
    data: {
      checkInTime?: string | null;
      checkOutTime?: string | null;
      status?: AttendanceStatus;
      overtimeHours?: number;
      reason: string;
      notes?: string | null;
    },
    auth: AuthContext
  ): Promise<EmployeeAttendance> {
    if (!data.reason || data.reason.trim().length < 5) {
      throw new BadRequestError(
        'Manual attendance correction strictly requires a documented reason of at least 5 characters',
        'CORRECTION_REASON_REQUIRED'
      );
    }

    const curRes = await pool.query(
      'SELECT * FROM employee_attendance WHERE id = $1 AND organization_id = $2',
      [attendanceId, auth.organizationId]
    );
    if (curRes.rows.length === 0) {
      throw new NotFoundError(`Attendance record '${attendanceId}' not found`, 'ATTENDANCE_NOT_FOUND');
    }

    const oldRow = curRes.rows[0];

    // Center access check
    if (auth.role !== UserRole.SUPER_ADMIN && auth.role !== UserRole.DAIRY_OWNER && auth.role !== UserRole.DAIRY_ADMIN) {
      if (!auth.centerIds.includes(oldRow.center_id)) {
        throw new ForbiddenError('Actor does not have access to correct attendance at this center', 'CENTER_ACCESS_DENIED');
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const checkIn = data.checkInTime !== undefined ? data.checkInTime : oldRow.check_in_time;
      const checkOut = data.checkOutTime !== undefined ? data.checkOutTime : oldRow.check_out_time;
      let totalHours = parseFloat(oldRow.total_hours);

      if (checkIn && checkOut) {
        const inTime = new Date(checkIn).getTime();
        const outTime = new Date(checkOut).getTime();
        if (outTime > inTime) {
          totalHours = Math.round(((outTime - inTime) / (1000 * 60 * 60)) * 100) / 100;
        }
      }

      const newStatus = data.status !== undefined ? data.status : oldRow.status;
      const newOt = data.overtimeHours !== undefined ? data.overtimeHours : parseFloat(oldRow.overtime_hours);

      const updRes = await client.query(
        `UPDATE employee_attendance SET
          check_in_time = $1,
          check_out_time = $2,
          total_hours = $3,
          status = $4,
          overtime_hours = $5,
          is_manual_correction = TRUE,
          correction_reason = $6,
          corrected_by = $7,
          corrected_at = NOW(),
          notes = COALESCE($8, notes),
          updated_at = NOW()
        WHERE id = $9
        RETURNING *`,
        [
          checkIn,
          checkOut,
          totalHours,
          newStatus,
          newOt,
          data.reason.trim(),
          auth.userId,
          data.notes || null,
          attendanceId,
        ]
      );

      const newRow = updRes.rows[0];

      // Audit Trail
      await client.query(
        `INSERT INTO employee_attendance_audits (
          attendance_id, action, actor_id, old_values, new_values, reason
        ) VALUES ($1, 'MANUAL_CORRECTION', $2, $3, $4, $5)`,
        [
          attendanceId,
          auth.userId,
          JSON.stringify({
            checkIn: oldRow.check_in_time,
            checkOut: oldRow.check_out_time,
            totalHours: oldRow.total_hours,
            status: oldRow.status,
            overtimeHours: oldRow.overtime_hours,
          }),
          JSON.stringify({
            checkIn,
            checkOut,
            totalHours,
            status: newStatus,
            overtimeHours: newOt,
          }),
          data.reason.trim(),
        ]
      );

      await client.query('COMMIT');
      return this.formatAttendance(newRow);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * 4. List Attendance with Filtering
   */
  public static async listAttendance(
    filters: {
      centerId?: string;
      employeeId?: string;
      startDate?: string;
      endDate?: string;
      status?: AttendanceStatus;
      limit?: number;
      offset?: number;
    },
    auth: AuthContext
  ): Promise<{ records: EmployeeAttendance[]; total: number }> {
    const params: unknown[] = [auth.organizationId];
    let query = `
      SELECT ea.*, e.full_name as employee_name, e.employee_code
      FROM employee_attendance ea
      JOIN employees e ON ea.employee_id = e.id
      WHERE ea.organization_id = $1
    `;

    if (auth.role !== UserRole.SUPER_ADMIN && auth.role !== UserRole.DAIRY_OWNER && auth.role !== UserRole.DAIRY_ADMIN) {
      params.push(auth.centerIds);
      query += ` AND ea.center_id = ANY($${params.length})`;
    } else if (filters.centerId) {
      params.push(filters.centerId);
      query += ` AND ea.center_id = $${params.length}`;
    }

    if (filters.employeeId) {
      params.push(filters.employeeId);
      query += ` AND ea.employee_id = $${params.length}`;
    }

    if (filters.startDate) {
      params.push(filters.startDate);
      query += ` AND ea.attendance_date >= $${params.length}`;
    }

    if (filters.endDate) {
      params.push(filters.endDate);
      query += ` AND ea.attendance_date <= $${params.length}`;
    }

    if (filters.status) {
      params.push(filters.status);
      query += ` AND ea.status = $${params.length}`;
    }

    const countRes = await pool.query(`SELECT COUNT(*)::int as total FROM (${query}) sub`, params);
    const total = countRes.rows[0]?.total || 0;

    const limit = Math.min(filters.limit || 50, 100);
    const offset = filters.offset || 0;
    params.push(limit, offset);
    query += ` ORDER BY ea.attendance_date DESC, e.full_name ASC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const res = await pool.query(query, params);
    return {
      records: res.rows.map((r) => this.formatAttendance(r)),
      total,
    };
  }

  /**
   * 5. Leave Management: Request, Approve, List
   */
  public static async createLeaveRequest(
    data: {
      employeeId: string;
      leaveType: LeaveType;
      startDate: string;
      endDate: string;
      daysCount: number;
      reason: string;
    },
    auth: AuthContext
  ): Promise<EmployeeLeave> {
    const empRes = await pool.query(
      'SELECT id, primary_center_id FROM employees WHERE id = $1 AND organization_id = $2',
      [data.employeeId, auth.organizationId]
    );
    if (empRes.rows.length === 0) {
      throw new NotFoundError(`Employee '${data.employeeId}' not found`, 'EMPLOYEE_NOT_FOUND');
    }

    // Check overlap with existing approved or pending leaves
    const overlapRes = await pool.query(
      `SELECT id FROM employee_leaves
       WHERE employee_id = $1 AND status IN ('PENDING', 'APPROVED')
         AND (start_date <= $3 AND end_date >= $2)`,
      [data.employeeId, data.startDate, data.endDate]
    );
    if (overlapRes.rows.length > 0) {
      throw new ConflictError(
        'Leave dates overlap with an existing pending or approved leave request',
        'LEAVE_DATES_OVERLAP'
      );
    }

    const res = await pool.query(
      `INSERT INTO employee_leaves (
        organization_id, employee_id, leave_type, start_date, end_date, days_count, reason, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING')
      RETURNING *`,
      [
        auth.organizationId,
        data.employeeId,
        data.leaveType,
        data.startDate,
        data.endDate,
        data.daysCount,
        data.reason.trim(),
      ]
    );

    return this.formatLeave(res.rows[0]);
  }

  public static async approveLeave(
    leaveId: string,
    action: { status: LeaveStatus.APPROVED | LeaveStatus.REJECTED; rejectionReason?: string | null },
    auth: AuthContext
  ): Promise<EmployeeLeave> {
    // Only administrators or managers can approve leaves
    if (
      auth.role !== UserRole.SUPER_ADMIN &&
      auth.role !== UserRole.DAIRY_OWNER &&
      auth.role !== UserRole.DAIRY_ADMIN &&
      auth.role !== UserRole.CENTER_MANAGER
    ) {
      throw new ForbiddenError('Insufficient privileges to approve or reject leave', 'INSUFFICIENT_PRIVILEGES');
    }

    const curRes = await pool.query(
      'SELECT * FROM employee_leaves WHERE id = $1 AND organization_id = $2',
      [leaveId, auth.organizationId]
    );
    if (curRes.rows.length === 0) {
      throw new NotFoundError(`Leave request '${leaveId}' not found`, 'LEAVE_NOT_FOUND');
    }

    const leave = curRes.rows[0];
    if (leave.status !== LeaveStatus.PENDING) {
      throw new ConflictError(`Leave request is already ${leave.status}`, 'LEAVE_ALREADY_PROCESSED');
    }

    const res = await pool.query(
      `UPDATE employee_leaves SET
        status = $1,
        approved_by = $2,
        approved_at = NOW(),
        rejection_reason = $3,
        updated_at = NOW()
      WHERE id = $4
      RETURNING *`,
      [action.status, auth.userId, action.rejectionReason || null, leaveId]
    );

    return this.formatLeave(res.rows[0]);
  }

  public static async listLeaves(
    filters: { employeeId?: string; status?: LeaveStatus },
    auth: AuthContext
  ): Promise<EmployeeLeave[]> {
    const params: unknown[] = [auth.organizationId];
    let query = `
      SELECT el.*, e.full_name as employee_name, e.employee_code
      FROM employee_leaves el
      JOIN employees e ON el.employee_id = e.id
      WHERE el.organization_id = $1
    `;

    if (filters.employeeId) {
      params.push(filters.employeeId);
      query += ` AND el.employee_id = $${params.length}`;
    }

    if (filters.status) {
      params.push(filters.status);
      query += ` AND el.status = $${params.length}`;
    }

    query += ' ORDER BY el.created_at DESC';
    const res = await pool.query(query, params);
    return res.rows.map((r) => this.formatLeave(r));
  }

  /**
   * 6. Attendance Summary Report
   */
  public static async getAttendanceReport(
    params: { centerId?: string; startDate: string; endDate: string },
    auth: AuthContext
  ): Promise<any[]> {
    const queryParams: unknown[] = [auth.organizationId, params.startDate, params.endDate];
    let query = `
      SELECT
        e.id as employee_id,
        e.employee_code,
        e.full_name,
        e.department,
        e.designation,
        COUNT(ea.id)::int as total_recorded_days,
        COUNT(CASE WHEN ea.status = 'PRESENT' THEN 1 END)::int as present_days,
        COUNT(CASE WHEN ea.status = 'HALF_DAY' THEN 1 END)::int as half_days,
        COUNT(CASE WHEN ea.status = 'ABSENT' THEN 1 END)::int as absent_days,
        COUNT(CASE WHEN ea.status = 'ON_LEAVE' THEN 1 END)::int as leave_days,
        COALESCE(SUM(ea.total_hours), 0.00)::numeric(8,2) as total_working_hours,
        COALESCE(SUM(ea.overtime_hours), 0.00)::numeric(8,2) as total_overtime_hours
      FROM employees e
      LEFT JOIN employee_attendance ea ON e.id = ea.employee_id
        AND ea.attendance_date >= $2 AND ea.attendance_date <= $3
      WHERE e.organization_id = $1 AND e.employment_status = 'ACTIVE'
    `;

    if (params.centerId) {
      queryParams.push(params.centerId);
      query += ` AND e.primary_center_id = $${queryParams.length}`;
    }

    query += ` GROUP BY e.id ORDER BY e.full_name ASC`;
    const res = await pool.query(query, queryParams);
    return res.rows;
  }

  private static formatAttendance(row: any): EmployeeAttendance {
    return {
      id: row.id,
      organizationId: row.organization_id,
      centerId: row.center_id,
      employeeId: row.employee_id,
      attendanceDate: row.attendance_date instanceof Date ? row.attendance_date.toISOString().split('T')[0] : row.attendance_date,
      shiftId: row.shift_id,
      shiftType: row.shift_type,
      checkInTime: row.check_in_time ? (row.check_in_time instanceof Date ? row.check_in_time.toISOString() : row.check_in_time) : null,
      checkOutTime: row.check_out_time ? (row.check_out_time instanceof Date ? row.check_out_time.toISOString() : row.check_out_time) : null,
      totalHours: parseFloat(row.total_hours || '0'),
      status: row.status,
      isLateArrival: row.is_late_arrival,
      isEarlyDeparture: row.is_early_departure,
      overtimeHours: parseFloat(row.overtime_hours || '0'),
      isManualCorrection: row.is_manual_correction,
      correctionReason: row.correction_reason,
      correctedBy: row.corrected_by,
      correctedAt: row.corrected_at ? row.corrected_at.toISOString() : null,
      notes: row.notes,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      employeeName: row.employee_name,
      employeeCode: row.employee_code,
    };
  }

  private static formatLeave(row: any): EmployeeLeave {
    return {
      id: row.id,
      organizationId: row.organization_id,
      employeeId: row.employee_id,
      leaveType: row.leave_type,
      startDate: row.start_date instanceof Date ? row.start_date.toISOString().split('T')[0] : row.start_date,
      endDate: row.end_date instanceof Date ? row.end_date.toISOString().split('T')[0] : row.end_date,
      daysCount: parseFloat(row.days_count),
      reason: row.reason,
      status: row.status,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at ? row.approved_at.toISOString() : null,
      rejectionReason: row.rejection_reason,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      employeeName: row.employee_name,
      employeeCode: row.employee_code,
    };
  }
}
