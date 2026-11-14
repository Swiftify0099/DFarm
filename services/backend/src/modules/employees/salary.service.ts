import crypto from 'node:crypto';
import { pool } from '../../db.js';
import {
  type EmployeeSalaryStructure,
  type EmployeeAdvance,
  SalaryCalculationBasis,
  EmployeeAdvanceStatus,
  UserRole,
} from '@dfarm/shared-types';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '../../shared/errors/app-error.js';
import type { AuthContext } from '../../middleware/authenticate.js';
import { toPaise, fromPaise } from './payroll-calculation.util.js';

export class SalaryService {
  /**
   * 1. Create or Update Employee Salary Structure
   */
  public static async createSalaryStructure(
    data: {
      employeeId: string;
      calculationBasis?: SalaryCalculationBasis;
      baseSalary: number;
      hra?: number;
      travelAllowance?: number;
      specialAllowance?: number;
      medicalAllowance?: number;
      providentFundEmployee?: number;
      professionalTax?: number;
      tdsTax?: number;
      otherDeductions?: number;
      overtimeHourlyRate?: number;
      effectiveFrom: string;
      effectiveTo?: string | null;
    },
    auth: AuthContext
  ): Promise<EmployeeSalaryStructure> {
    // Only Admin or Accountant can configure salary structures
    if (
      auth.role !== UserRole.SUPER_ADMIN &&
      auth.role !== UserRole.DAIRY_OWNER &&
      auth.role !== UserRole.DAIRY_ADMIN &&
      auth.role !== UserRole.ACCOUNTANT
    ) {
      throw new ForbiddenError('Insufficient privileges to manage salary structures', 'INSUFFICIENT_PRIVILEGES');
    }

    const empRes = await pool.query(
      'SELECT id FROM employees WHERE id = $1 AND organization_id = $2',
      [data.employeeId, auth.organizationId]
    );
    if (empRes.rows.length === 0) {
      throw new NotFoundError(`Employee '${data.employeeId}' not found`, 'EMPLOYEE_NOT_FOUND');
    }

    // Exact gross salary calculation in paise
    const baseP = toPaise(data.baseSalary);
    const hraP = toPaise(data.hra || 0);
    const travelP = toPaise(data.travelAllowance || 0);
    const specialP = toPaise(data.specialAllowance || 0);
    const medicalP = toPaise(data.medicalAllowance || 0);
    const grossP = baseP + hraP + travelP + specialP + medicalP;
    const grossSalary = fromPaise(grossP);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Deactivate current active salary structure
      await client.query(
        'UPDATE employee_salary_structures SET is_active = FALSE, effective_to = $1 WHERE employee_id = $2 AND is_active = TRUE',
        [data.effectiveFrom, data.employeeId]
      );

      const res = await client.query(
        `INSERT INTO employee_salary_structures (
          organization_id, employee_id, calculation_basis, base_salary,
          hra, travel_allowance, special_allowance, medical_allowance, gross_salary,
          provident_fund_employee, professional_tax, tds_tax, other_deductions,
          overtime_hourly_rate, effective_from, effective_to, is_active, created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, TRUE, $17
        ) RETURNING *`,
        [
          auth.organizationId,
          data.employeeId,
          data.calculationBasis || SalaryCalculationBasis.MONTHLY,
          data.baseSalary,
          data.hra || 0.0,
          data.travelAllowance || 0.0,
          data.specialAllowance || 0.0,
          data.medicalAllowance || 0.0,
          grossSalary,
          data.providentFundEmployee || 0.0,
          data.professionalTax || 0.0,
          data.tdsTax || 0.0,
          data.otherDeductions || 0.0,
          data.overtimeHourlyRate || 0.0,
          data.effectiveFrom,
          data.effectiveTo || null,
          auth.userId,
        ]
      );

      await client.query('COMMIT');
      return this.formatSalaryStructure(res.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * 2. Get active salary structure for employee
   */
  public static async getSalaryStructure(employeeId: string, auth: AuthContext): Promise<EmployeeSalaryStructure | null> {
    const res = await pool.query(
      `SELECT ess.* FROM employee_salary_structures ess
       JOIN employees e ON ess.employee_id = e.id
       WHERE ess.employee_id = $1 AND ess.organization_id = $2 AND ess.is_active = TRUE
       LIMIT 1`,
      [employeeId, auth.organizationId]
    );

    if (res.rows.length === 0) {
      return null;
    }

    // Role visibility check: only Admin, Accountant, or the Employee themselves
    const row = res.rows[0];
    if (
      auth.role !== UserRole.SUPER_ADMIN &&
      auth.role !== UserRole.DAIRY_OWNER &&
      auth.role !== UserRole.DAIRY_ADMIN &&
      auth.role !== UserRole.ACCOUNTANT
    ) {
      const empRes = await pool.query('SELECT user_id FROM employees WHERE id = $1', [employeeId]);
      if (empRes.rows[0]?.user_id !== auth.userId) {
        throw new ForbiddenError('Restricted salary visibility. Access denied.', 'RESTRICTED_SALARY_VIEW');
      }
    }

    return this.formatSalaryStructure(row);
  }

  /**
   * 3. Create Employee Advance Request
   */
  public static async requestAdvance(
    data: {
      employeeId: string;
      amount: number;
      monthlyInstallment: number;
      reason: string;
    },
    auth: AuthContext
  ): Promise<EmployeeAdvance> {
    const empRes = await pool.query(
      'SELECT id, employee_code FROM employees WHERE id = $1 AND organization_id = $2',
      [data.employeeId, auth.organizationId]
    );
    if (empRes.rows.length === 0) {
      throw new NotFoundError(`Employee '${data.employeeId}' not found`, 'EMPLOYEE_NOT_FOUND');
    }

    const countRes = await pool.query(
      'SELECT COUNT(*)::int as count FROM employee_advances WHERE organization_id = $1',
      [auth.organizationId]
    );
    const uniqueSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    const advanceNumber = `EADV-${new Date().getFullYear()}-${(countRes.rows[0].count + 1).toString().padStart(4, '0')}-${uniqueSuffix}`;

    const res = await pool.query(
      `INSERT INTO employee_advances (
        organization_id, employee_id, advance_number, amount, disbursed_amount,
        recovered_amount, remaining_balance, monthly_installment, status, reason, created_by
      ) VALUES ($1, $2, $3, $4, 0.00, 0.00, $4, $5, 'PENDING_APPROVAL', $6, $7)
      RETURNING *`,
      [
        auth.organizationId,
        data.employeeId,
        advanceNumber,
        data.amount,
        data.monthlyInstallment,
        data.reason.trim(),
        auth.userId,
      ]
    );

    return this.formatAdvance(res.rows[0]);
  }

  /**
   * 4. Approve or Reject Employee Advance
   * Maker-Checker Rule:
   * Initiator cannot approve their own advance request.
   */
  public static async approveAdvance(
    advanceId: string,
    action: { status: EmployeeAdvanceStatus.APPROVED | EmployeeAdvanceStatus.REJECTED; disbursedAmount?: number },
    auth: AuthContext
  ): Promise<EmployeeAdvance> {
    if (
      auth.role !== UserRole.SUPER_ADMIN &&
      auth.role !== UserRole.DAIRY_OWNER &&
      auth.role !== UserRole.DAIRY_ADMIN
    ) {
      throw new ForbiddenError('Only Dairy Owner or Admin can approve advances', 'INSUFFICIENT_PRIVILEGES');
    }

    const curRes = await pool.query(
      'SELECT * FROM employee_advances WHERE id = $1 AND organization_id = $2',
      [advanceId, auth.organizationId]
    );
    if (curRes.rows.length === 0) {
      throw new NotFoundError(`Advance '${advanceId}' not found`, 'ADVANCE_NOT_FOUND');
    }

    const adv = curRes.rows[0];

    // MAKER-CHECKER ENFORCEMENT: Initiator cannot approve
    if (adv.created_by === auth.userId) {
      throw new ForbiddenError(
        'Maker-Checker violation: Initiator cannot self-approve their own employee advance request',
        'SELF_APPROVAL_PROHIBITED'
      );
    }

    if (adv.status !== EmployeeAdvanceStatus.PENDING_APPROVAL) {
      throw new ConflictError(`Advance is already ${adv.status}`, 'ADVANCE_ALREADY_PROCESSED');
    }

    const disbursed = action.status === EmployeeAdvanceStatus.APPROVED
      ? (action.disbursedAmount || parseFloat(adv.amount))
      : 0.0;

    const newStatus = action.status === EmployeeAdvanceStatus.APPROVED ? EmployeeAdvanceStatus.ACTIVE : EmployeeAdvanceStatus.REJECTED;

    const res = await pool.query(
      `UPDATE employee_advances SET
        status = $1,
        disbursed_amount = $2,
        remaining_balance = $2,
        approved_by = $3,
        approved_at = NOW(),
        updated_at = NOW()
      WHERE id = $4
      RETURNING *`,
      [newStatus, disbursed, auth.userId, advanceId]
    );

    return this.formatAdvance(res.rows[0]);
  }

  /**
   * 5. List Employee Advances
   */
  public static async listAdvances(
    filters: { employeeId?: string; status?: EmployeeAdvanceStatus },
    auth: AuthContext
  ): Promise<EmployeeAdvance[]> {
    const params: unknown[] = [auth.organizationId];
    let query = `
      SELECT ea.*, e.full_name as employee_name, e.employee_code
      FROM employee_advances ea
      JOIN employees e ON ea.employee_id = e.id
      WHERE ea.organization_id = $1
    `;

    if (filters.employeeId) {
      params.push(filters.employeeId);
      query += ` AND ea.employee_id = $${params.length}`;
    }

    if (filters.status) {
      params.push(filters.status);
      query += ` AND ea.status = $${params.length}`;
    }

    query += ' ORDER BY ea.created_at DESC';
    const res = await pool.query(query, params);
    return res.rows.map((r) => this.formatAdvance(r));
  }

  private static formatSalaryStructure(row: any): EmployeeSalaryStructure {
    return {
      id: row.id,
      organizationId: row.organization_id,
      employeeId: row.employee_id,
      calculationBasis: row.calculation_basis,
      baseSalary: parseFloat(row.base_salary),
      hra: parseFloat(row.hra),
      travelAllowance: parseFloat(row.travel_allowance),
      specialAllowance: parseFloat(row.special_allowance),
      medicalAllowance: parseFloat(row.medical_allowance),
      grossSalary: parseFloat(row.gross_salary),
      providentFundEmployee: parseFloat(row.provident_fund_employee),
      professionalTax: parseFloat(row.professional_tax),
      tdsTax: parseFloat(row.tds_tax),
      otherDeductions: parseFloat(row.other_deductions),
      overtimeHourlyRate: parseFloat(row.overtime_hourly_rate),
      effectiveFrom: row.effective_from instanceof Date ? row.effective_from.toISOString().split('T')[0] : row.effective_from,
      effectiveTo: row.effective_to ? (row.effective_to instanceof Date ? row.effective_to.toISOString().split('T')[0] : row.effective_to) : null,
      isActive: row.is_active,
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private static formatAdvance(row: any): EmployeeAdvance {
    return {
      id: row.id,
      organizationId: row.organization_id,
      employeeId: row.employee_id,
      advanceNumber: row.advance_number,
      amount: parseFloat(row.amount),
      disbursedAmount: parseFloat(row.disbursed_amount),
      recoveredAmount: parseFloat(row.recovered_amount),
      remainingBalance: parseFloat(row.remaining_balance),
      monthlyInstallment: parseFloat(row.monthly_installment),
      status: row.status,
      reason: row.reason,
      createdBy: row.created_by,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at ? row.approved_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      employeeName: row.employee_name,
      employeeCode: row.employee_code,
    };
  }
}
