import { pool } from '../../db.js';
import { PayrollRunStatus, SalaryPaymentMethod, EmployeeAdvanceStatus, UserRole, } from '@dfarm/shared-types';
import { NotFoundError, ForbiddenError, ConflictError, BadRequestError, } from '../../shared/errors/app-error.js';
import { toPaise, fromPaise, calculateEmployeeSalary, } from './payroll-calculation.util.js';
export class PayrollService {
    /**
     * 1. Initiate a new Payroll Run (State: DRAFT)
     */
    static async initiatePayrollRun(data, auth) {
        if (auth.role !== UserRole.SUPER_ADMIN &&
            auth.role !== UserRole.DAIRY_OWNER &&
            auth.role !== UserRole.DAIRY_ADMIN &&
            auth.role !== UserRole.ACCOUNTANT) {
            throw new ForbiddenError('Insufficient privileges to initiate a payroll run', 'INSUFFICIENT_PRIVILEGES');
        }
        const { year, month } = data;
        if (month < 1 || month > 12) {
            throw new BadRequestError('Month must be between 1 and 12', 'INVALID_MONTH');
        }
        // Determine period dates
        const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${month.toString().padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`;
        // DUPLICATE PAYROLL RUN PREVENTION
        const dupCheck = await pool.query(`SELECT id, status FROM payroll_runs
       WHERE organization_id = $1
         AND COALESCE(center_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE($2, '00000000-0000-0000-0000-000000000000'::uuid)
         AND year = $3 AND month = $4
         AND status != 'CANCELLED'`, [auth.organizationId, data.centerId || null, year, month]);
        if (dupCheck.rows.length > 0) {
            throw new ConflictError(`A payroll run already exists for period ${month}/${year} with status '${dupCheck.rows[0].status}'`, 'DUPLICATE_PAYROLL_RUN');
        }
        const res = await pool.query(`INSERT INTO payroll_runs (
        organization_id, center_id, period_start, period_end, year, month,
        status, initiated_by, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT', $7, $8)
      RETURNING *`, [
            auth.organizationId,
            data.centerId || null,
            startDate,
            endDate,
            year,
            month,
            auth.userId,
            data.notes || null,
        ]);
        const row = res.rows[0];
        // Audit log
        await pool.query(`INSERT INTO payroll_audit_logs (
        organization_id, entity_type, entity_id, action, actor_id, new_state
      ) VALUES ($1, 'PAYROLL_RUN', $2, 'INITIATE', $3, 'DRAFT')`, [auth.organizationId, row.id, auth.userId]);
        return this.formatPayrollRun(row);
    }
    /**
     * 2. Calculate Payroll Run (State: CALCULATING -> UNDER_REVIEW)
     * Exact Fixed-Point Math & Attendance Aggregation
     */
    static async calculatePayrollRun(payrollRunId, auth) {
        const curRes = await pool.query('SELECT * FROM payroll_runs WHERE id = $1 AND organization_id = $2', [payrollRunId, auth.organizationId]);
        if (curRes.rows.length === 0) {
            throw new NotFoundError(`Payroll run '${payrollRunId}' not found`, 'PAYROLL_RUN_NOT_FOUND');
        }
        const run = curRes.rows[0];
        if (run.status !== PayrollRunStatus.DRAFT && run.status !== PayrollRunStatus.UNDER_REVIEW) {
            throw new ConflictError(`Cannot recalculate payroll run in status '${run.status}'. Must be DRAFT or UNDER_REVIEW.`, 'INVALID_PAYROLL_STATE');
        }
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query("UPDATE payroll_runs SET status = 'CALCULATING' WHERE id = $1", [payrollRunId]);
            // 1. Fetch eligible employees
            const empParams = [auth.organizationId];
            let empQuery = `SELECT * FROM employees WHERE organization_id = $1 AND employment_status = 'ACTIVE'`;
            if (run.center_id) {
                empParams.push(run.center_id);
                empQuery += ` AND primary_center_id = $${empParams.length}`;
            }
            const employees = (await client.query(empQuery, empParams)).rows;
            // Clean existing payslips for recalculation
            await client.query('DELETE FROM employee_payslips WHERE payroll_run_id = $1', [payrollRunId]);
            const lastDayOfMonth = new Date(run.year, run.month, 0).getDate();
            const totalWorkingDays = lastDayOfMonth;
            let totalGrossP = 0n;
            let totalAllowancesP = 0n;
            let totalDeductionsP = 0n;
            let totalAdvancesRecoveredP = 0n;
            let totalNetSalaryP = 0n;
            let processedCount = 0;
            for (const emp of employees) {
                // Active salary structure
                const salRes = await client.query(`SELECT * FROM employee_salary_structures
           WHERE employee_id = $1 AND is_active = TRUE
           ORDER BY effective_from DESC LIMIT 1`, [emp.id]);
                const sal = salRes.rows[0] || {
                    base_salary: '0.00',
                    hra: '0.00',
                    travel_allowance: '0.00',
                    special_allowance: '0.00',
                    medical_allowance: '0.00',
                    provident_fund_employee: '0.00',
                    professional_tax: '0.00',
                    tds_tax: '0.00',
                    other_deductions: '0.00',
                    overtime_hourly_rate: '0.00',
                };
                // Attendance stats for period
                const attRes = await client.query(`SELECT
             COUNT(CASE WHEN status = 'PRESENT' THEN 1 END)::int as full_present,
             COUNT(CASE WHEN status = 'HALF_DAY' THEN 1 END)::int as half_present,
             COUNT(CASE WHEN status = 'ABSENT' THEN 1 END)::int as absent,
             COALESCE(SUM(overtime_hours), 0.00)::numeric as ot_hours
           FROM employee_attendance
           WHERE employee_id = $1 AND attendance_date >= $2 AND attendance_date <= $3`, [emp.id, run.period_start, run.period_end]);
                const att = attRes.rows[0];
                const presentDays = (att?.full_present || 0) + (att?.half_present || 0) * 0.5;
                const overtimeHours = parseFloat(att?.ot_hours || '0');
                // Leaves in period
                const leaveRes = await client.query(`SELECT COALESCE(SUM(days_count), 0.0)::numeric as paid_leaves
           FROM employee_leaves
           WHERE employee_id = $1 AND status = 'APPROVED'
             AND leave_type IN ('CASUAL', 'SICK', 'EARNED', 'MATERNITY')
             AND (start_date <= $3 AND end_date >= $2)`, [emp.id, run.period_start, run.period_end]);
                const paidLeaveDays = parseFloat(leaveRes.rows[0]?.paid_leaves || '0');
                // Active advance
                const advRes = await client.query(`SELECT id, remaining_balance, monthly_installment FROM employee_advances
           WHERE employee_id = $1 AND status = 'ACTIVE' AND remaining_balance > 0
           ORDER BY created_at ASC LIMIT 1`, [emp.id]);
                const adv = advRes.rows[0];
                const advanceBalance = adv ? parseFloat(adv.remaining_balance) : 0;
                const advanceInstallment = adv ? parseFloat(adv.monthly_installment) : 0;
                // Perform calculation
                const breakdown = calculateEmployeeSalary({
                    baseSalary: parseFloat(sal.base_salary),
                    hra: parseFloat(sal.hra),
                    travelAllowance: parseFloat(sal.travel_allowance),
                    specialAllowance: parseFloat(sal.special_allowance),
                    medicalAllowance: parseFloat(sal.medical_allowance),
                    overtimeHourlyRate: parseFloat(sal.overtime_hourly_rate),
                    overtimeHours,
                    providentFund: parseFloat(sal.provident_fund_employee),
                    tax: parseFloat(sal.professional_tax) + parseFloat(sal.tds_tax),
                    otherDeductions: parseFloat(sal.other_deductions),
                    totalWorkingDays,
                    presentDays,
                    paidLeaveDays,
                    activeAdvanceBalance: advanceBalance,
                    advanceMonthlyInstallment: advanceInstallment,
                });
                const totalAllowances = breakdown.earnedHra + breakdown.earnedTravel + breakdown.earnedSpecial + breakdown.earnedMedical;
                const payslipNumber = `PAY-${run.year}${run.month.toString().padStart(2, '0')}-${emp.employee_code}`;
                await client.query(`INSERT INTO employee_payslips (
            payroll_run_id, employee_id, payslip_number, total_working_days, present_days,
            absent_days, paid_leave_days, unpaid_leave_days, overtime_hours,
            base_salary, earned_basic, hra, travel_allowance, special_allowance, medical_allowance,
            overtime_amount, gross_earnings, pf_deduction, tax_deduction, advance_recovery,
            other_deductions, total_deductions, net_salary, payment_status
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, 0.0, $8,
            $9, $10, $11, $12, $13, $14,
            $15, $16, $17, $18, $19,
            $20, $21, $22, 'PENDING'
          )`, [
                    payrollRunId,
                    emp.id,
                    payslipNumber,
                    totalWorkingDays,
                    presentDays,
                    totalWorkingDays - (presentDays + paidLeaveDays),
                    paidLeaveDays,
                    overtimeHours,
                    sal.base_salary,
                    breakdown.earnedBasic,
                    breakdown.earnedHra,
                    breakdown.earnedTravel,
                    breakdown.earnedSpecial,
                    breakdown.earnedMedical,
                    breakdown.overtimeAmount,
                    breakdown.grossEarnings,
                    breakdown.pfDeduction,
                    breakdown.taxDeduction,
                    breakdown.advanceRecovery,
                    breakdown.otherDeductions,
                    breakdown.totalDeductions,
                    breakdown.netSalary,
                ]);
                totalGrossP += toPaise(breakdown.grossEarnings);
                totalAllowancesP += toPaise(totalAllowances);
                totalDeductionsP += toPaise(breakdown.totalDeductions);
                totalAdvancesRecoveredP += toPaise(breakdown.advanceRecovery);
                totalNetSalaryP += toPaise(breakdown.netSalary);
                processedCount++;
            }
            // Update payroll run totals
            const updRes = await client.query(`UPDATE payroll_runs SET
          status = 'UNDER_REVIEW',
          total_employees = $1,
          total_gross_salary = $2,
          total_allowances = $3,
          total_deductions = $4,
          total_advances_recovered = $5,
          total_net_salary = $6,
          calculated_at = NOW(),
          updated_at = NOW()
        WHERE id = $7
        RETURNING *`, [
                processedCount,
                fromPaise(totalGrossP),
                fromPaise(totalAllowancesP),
                fromPaise(totalDeductionsP),
                fromPaise(totalAdvancesRecoveredP),
                fromPaise(totalNetSalaryP),
                payrollRunId,
            ]);
            // Audit log
            await client.query(`INSERT INTO payroll_audit_logs (
          organization_id, entity_type, entity_id, action, actor_id, previous_state, new_state, metadata
        ) VALUES ($1, 'PAYROLL_RUN', $2, 'CALCULATE', $3, 'CALCULATING', 'UNDER_REVIEW', $4)`, [
                auth.organizationId,
                payrollRunId,
                auth.userId,
                JSON.stringify({
                    totalEmployees: processedCount,
                    netSalary: fromPaise(totalNetSalaryP),
                }),
            ]);
            await client.query('COMMIT');
            return this.formatPayrollRun(updRes.rows[0]);
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    /**
     * 3. Approve Payroll Run (State: UNDER_REVIEW -> APPROVED)
     * CRITICAL MAKER-CHECKER SECURITY RULE:
     * Initiator CANNOT approve their own payroll run!
     */
    static async approvePayrollRun(payrollRunId, action, auth) {
        if (auth.role !== UserRole.SUPER_ADMIN &&
            auth.role !== UserRole.DAIRY_OWNER &&
            auth.role !== UserRole.DAIRY_ADMIN) {
            throw new ForbiddenError('Only Dairy Owner or Dairy Admin are authorized to approve payroll runs', 'INSUFFICIENT_PRIVILEGES');
        }
        const curRes = await pool.query('SELECT * FROM payroll_runs WHERE id = $1 AND organization_id = $2', [payrollRunId, auth.organizationId]);
        if (curRes.rows.length === 0) {
            throw new NotFoundError(`Payroll run '${payrollRunId}' not found`, 'PAYROLL_RUN_NOT_FOUND');
        }
        const run = curRes.rows[0];
        // MAKER-CHECKER ENFORCEMENT CHECK
        if (run.initiated_by === auth.userId) {
            throw new ForbiddenError('Maker-Checker violation: Payroll initiator cannot self-approve their own payroll run', 'SELF_APPROVAL_PROHIBITED');
        }
        if (run.status !== PayrollRunStatus.UNDER_REVIEW) {
            throw new ConflictError(`Payroll run cannot be approved in state '${run.status}'. Must be UNDER_REVIEW.`, 'INVALID_STATE');
        }
        const newStatus = action.action === 'APPROVE' ? PayrollRunStatus.APPROVED : PayrollRunStatus.DRAFT;
        const res = await pool.query(`UPDATE payroll_runs SET
        status = $1,
        approved_by = $2,
        approved_at = NOW(),
        notes = COALESCE($3, notes),
        updated_at = NOW()
      WHERE id = $4
      RETURNING *`, [newStatus, auth.userId, action.notes || null, payrollRunId]);
        // Audit log
        await pool.query(`INSERT INTO payroll_audit_logs (
        organization_id, entity_type, entity_id, action, actor_id, previous_state, new_state, metadata
      ) VALUES ($1, 'PAYROLL_RUN', $2, $3, $4, 'UNDER_REVIEW', $5, $6)`, [
            auth.organizationId,
            payrollRunId,
            action.action,
            auth.userId,
            newStatus,
            JSON.stringify({ notes: action.notes }),
        ]);
        return this.formatPayrollRun(res.rows[0]);
    }
    /**
     * 4. Finalize Payroll Run (State: APPROVED -> FINALIZED)
     * Historical Snapshot Protection: Finalized payslips become immutable.
     * Also deducts advance recoveries from employee_advances.
     */
    static async finalizePayrollRun(payrollRunId, notes, auth) {
        if (auth.role !== UserRole.SUPER_ADMIN &&
            auth.role !== UserRole.DAIRY_OWNER &&
            auth.role !== UserRole.DAIRY_ADMIN) {
            throw new ForbiddenError('Only Dairy Owner or Dairy Admin are authorized to finalize payroll runs', 'INSUFFICIENT_PRIVILEGES');
        }
        const curRes = await pool.query('SELECT * FROM payroll_runs WHERE id = $1 AND organization_id = $2', [payrollRunId, auth.organizationId]);
        if (curRes.rows.length === 0) {
            throw new NotFoundError(`Payroll run '${payrollRunId}' not found`, 'PAYROLL_RUN_NOT_FOUND');
        }
        const run = curRes.rows[0];
        if (run.status !== PayrollRunStatus.APPROVED) {
            throw new ConflictError(`Cannot finalize payroll run in status '${run.status}'. Must be APPROVED.`, 'INVALID_STATE');
        }
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // Recover advances from employee_advances
            const payslipsWithAdvance = await client.query(`SELECT id, employee_id, advance_recovery FROM employee_payslips
         WHERE payroll_run_id = $1 AND advance_recovery > 0`, [payrollRunId]);
            for (const ps of payslipsWithAdvance.rows) {
                const recoveryAmount = parseFloat(ps.advance_recovery);
                const advRes = await client.query(`SELECT id, remaining_balance, recovered_amount FROM employee_advances
           WHERE employee_id = $1 AND status = 'ACTIVE' AND remaining_balance > 0
           ORDER BY created_at ASC LIMIT 1`, [ps.employee_id]);
                if (advRes.rows.length > 0) {
                    const adv = advRes.rows[0];
                    const newBal = Math.max(0, parseFloat(adv.remaining_balance) - recoveryAmount);
                    const newRec = parseFloat(adv.recovered_amount) + recoveryAmount;
                    const newStatus = newBal === 0 ? EmployeeAdvanceStatus.FULLY_RECOVERED : EmployeeAdvanceStatus.ACTIVE;
                    await client.query(`UPDATE employee_advances SET
              remaining_balance = $1,
              recovered_amount = $2,
              status = $3,
              updated_at = NOW()
            WHERE id = $4`, [newBal, newRec, newStatus, adv.id]);
                    await client.query(`INSERT INTO employee_advance_repayments (
              advance_id, payroll_run_id, payslip_id, amount, repayment_date, notes
            ) VALUES ($1, $2, $3, $4, CURRENT_DATE, 'Automated payroll deduction')`, [adv.id, payrollRunId, ps.id, recoveryAmount]);
                }
            }
            const updRes = await client.query(`UPDATE payroll_runs SET
          status = 'FINALIZED',
          finalized_by = $1,
          finalized_at = NOW(),
          notes = COALESCE($2, notes),
          updated_at = NOW()
        WHERE id = $3
        RETURNING *`, [auth.userId, notes || null, payrollRunId]);
            // Audit log
            await client.query(`INSERT INTO payroll_audit_logs (
          organization_id, entity_type, entity_id, action, actor_id, previous_state, new_state
        ) VALUES ($1, 'PAYROLL_RUN', $2, 'FINALIZE', $3, 'APPROVED', 'FINALIZED')`, [auth.organizationId, payrollRunId, auth.userId]);
            await client.query('COMMIT');
            return this.formatPayrollRun(updRes.rows[0]);
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    /**
     * 5. Record Employee Salary Payment (Disbursement)
     * Dedicated Employee Financial Records:
     * Writes to employee_salary_payments.
     * Completely separated from customer milk ledger.
     */
    static async recordSalaryPayment(data, auth) {
        if (auth.role !== UserRole.SUPER_ADMIN &&
            auth.role !== UserRole.DAIRY_OWNER &&
            auth.role !== UserRole.DAIRY_ADMIN &&
            auth.role !== UserRole.ACCOUNTANT) {
            throw new ForbiddenError('Insufficient privileges to disburse salary payments', 'INSUFFICIENT_PRIVILEGES');
        }
        const psRes = await pool.query(`SELECT ps.*, pr.status as run_status
       FROM employee_payslips ps
       JOIN payroll_runs pr ON ps.payroll_run_id = pr.id
       WHERE ps.id = $1 AND ps.payroll_run_id = $2 AND ps.employee_id = $3`, [data.payslipId, data.payrollRunId, data.employeeId]);
        if (psRes.rows.length === 0) {
            throw new NotFoundError('Payslip record not found', 'PAYSLIP_NOT_FOUND');
        }
        const payslip = psRes.rows[0];
        if (payslip.run_status !== PayrollRunStatus.FINALIZED && payslip.run_status !== PayrollRunStatus.PAID) {
            throw new ConflictError(`Cannot disburse salary for payroll run in status '${payslip.run_status}'. Must be FINALIZED.`, 'PAYROLL_NOT_FINALIZED');
        }
        const paymentRef = `EPAY-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 900 + 100)}`;
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const payRes = await client.query(`INSERT INTO employee_salary_payments (
          organization_id, payroll_run_id, payslip_id, employee_id, payment_reference,
          amount, payment_method, transaction_id, bank_name, bank_account_mask,
          bank_ifsc, status, disbursed_by, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'COMPLETED', $12, $13)
        RETURNING *`, [
                auth.organizationId,
                data.payrollRunId,
                data.payslipId,
                data.employeeId,
                paymentRef,
                data.amount,
                data.paymentMethod || SalaryPaymentMethod.BANK_TRANSFER,
                data.transactionId || null,
                data.bankName || null,
                data.bankAccountMask || null,
                data.bankIfsc || null,
                auth.userId,
                data.notes || null,
            ]);
            // Update payslip status to PAID
            await client.query("UPDATE employee_payslips SET payment_status = 'PAID', updated_at = NOW() WHERE id = $1", [
                data.payslipId,
            ]);
            // Check if all payslips in run are PAID
            const pendingCount = await client.query("SELECT COUNT(*)::int as count FROM employee_payslips WHERE payroll_run_id = $1 AND payment_status != 'PAID'", [data.payrollRunId]);
            if (pendingCount.rows[0].count === 0) {
                await client.query("UPDATE payroll_runs SET status = 'PAID', paid_at = NOW(), updated_at = NOW() WHERE id = $1", [data.payrollRunId]);
            }
            await client.query('COMMIT');
            const row = payRes.rows[0];
            return {
                id: row.id,
                organizationId: row.organization_id,
                payrollRunId: row.payroll_run_id,
                payslipId: row.payslip_id,
                employeeId: row.employee_id,
                paymentReference: row.payment_reference,
                amount: parseFloat(row.amount),
                paymentMethod: row.payment_method,
                transactionId: row.transaction_id,
                bankName: row.bank_name,
                bankAccountMask: row.bank_account_mask,
                bankIfsc: row.bank_ifsc,
                status: row.status,
                disbursedAt: row.disbursed_at.toISOString(),
                disbursedBy: row.disbursed_by,
                notes: row.notes,
                createdAt: row.created_at.toISOString(),
            };
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    /**
     * 6. List Payroll Runs
     */
    static async listPayrollRuns(filters, auth) {
        const params = [auth.organizationId];
        let query = 'SELECT * FROM payroll_runs WHERE organization_id = $1';
        if (filters.centerId) {
            params.push(filters.centerId);
            query += ` AND center_id = $${params.length}`;
        }
        if (filters.year) {
            params.push(filters.year);
            query += ` AND year = $${params.length}`;
        }
        query += ' ORDER BY year DESC, month DESC, created_at DESC';
        const res = await pool.query(query, params);
        return res.rows.map((r) => this.formatPayrollRun(r));
    }
    /**
     * 7. Get Payroll Run by ID (with payslips)
     */
    static async getPayrollRunById(payrollRunId, auth) {
        const runRes = await pool.query('SELECT * FROM payroll_runs WHERE id = $1 AND organization_id = $2', [payrollRunId, auth.organizationId]);
        if (runRes.rows.length === 0) {
            throw new NotFoundError(`Payroll run '${payrollRunId}' not found`, 'PAYROLL_RUN_NOT_FOUND');
        }
        const payslipsRes = await pool.query(`SELECT ps.*, e.full_name as employee_name, e.employee_code,
              e.designation, e.department, e.bank_name, e.bank_account_number_mask, e.bank_ifsc
       FROM employee_payslips ps
       JOIN employees e ON ps.employee_id = e.id
       WHERE ps.payroll_run_id = $1
       ORDER BY e.full_name ASC`, [payrollRunId]);
        return {
            run: this.formatPayrollRun(runRes.rows[0]),
            payslips: payslipsRes.rows.map((r) => this.formatPayslip(r)),
        };
    }
    /**
     * 8. Get Payslip by ID
     */
    static async getPayslipById(payslipId, auth) {
        const res = await pool.query(`SELECT ps.*, e.full_name as employee_name, e.employee_code,
              e.designation, e.department, e.bank_name, e.bank_account_number_mask, e.bank_ifsc,
              e.user_id as employee_user_id
       FROM employee_payslips ps
       JOIN employees e ON ps.employee_id = e.id
       JOIN payroll_runs pr ON ps.payroll_run_id = pr.id
       WHERE ps.id = $1 AND pr.organization_id = $2`, [payslipId, auth.organizationId]);
        if (res.rows.length === 0) {
            throw new NotFoundError(`Payslip '${payslipId}' not found`, 'PAYSLIP_NOT_FOUND');
        }
        const row = res.rows[0];
        // Visibility restriction: Admin, Accountant, or employee themselves
        if (auth.role !== UserRole.SUPER_ADMIN &&
            auth.role !== UserRole.DAIRY_OWNER &&
            auth.role !== UserRole.DAIRY_ADMIN &&
            auth.role !== UserRole.ACCOUNTANT) {
            if (row.employee_user_id !== auth.userId) {
                throw new ForbiddenError('Restricted payslip visibility. Access denied.', 'RESTRICTED_PAYSLIP_VIEW');
            }
        }
        return this.formatPayslip(row);
    }
    static formatPayrollRun(row) {
        return {
            id: row.id,
            organizationId: row.organization_id,
            centerId: row.center_id,
            periodStart: row.period_start instanceof Date ? row.period_start.toISOString().split('T')[0] : row.period_start,
            periodEnd: row.period_end instanceof Date ? row.period_end.toISOString().split('T')[0] : row.period_end,
            year: row.year,
            month: row.month,
            status: row.status,
            totalEmployees: row.total_employees,
            totalGrossSalary: parseFloat(row.total_gross_salary),
            totalAllowances: parseFloat(row.total_allowances),
            totalDeductions: parseFloat(row.total_deductions),
            totalAdvancesRecovered: parseFloat(row.total_advances_recovered),
            totalNetSalary: parseFloat(row.total_net_salary),
            initiatedBy: row.initiated_by,
            calculatedAt: row.calculated_at ? row.calculated_at.toISOString() : null,
            approvedBy: row.approved_by,
            approvedAt: row.approved_at ? row.approved_at.toISOString() : null,
            finalizedBy: row.finalized_by,
            finalizedAt: row.finalized_at ? row.finalized_at.toISOString() : null,
            paidAt: row.paid_at ? row.paid_at.toISOString() : null,
            notes: row.notes,
            createdAt: row.created_at.toISOString(),
            updatedAt: row.updated_at.toISOString(),
        };
    }
    static formatPayslip(row) {
        return {
            id: row.id,
            payrollRunId: row.payroll_run_id,
            employeeId: row.employee_id,
            payslipNumber: row.payslip_number,
            totalWorkingDays: parseFloat(row.total_working_days),
            presentDays: parseFloat(row.present_days),
            absentDays: parseFloat(row.absent_days),
            paidLeaveDays: parseFloat(row.paid_leave_days),
            unpaidLeaveDays: parseFloat(row.unpaid_leave_days),
            overtimeHours: parseFloat(row.overtime_hours),
            baseSalary: parseFloat(row.base_salary),
            earnedBasic: parseFloat(row.earned_basic),
            hra: parseFloat(row.hra),
            travelAllowance: parseFloat(row.travel_allowance),
            specialAllowance: parseFloat(row.special_allowance),
            medicalAllowance: parseFloat(row.medical_allowance),
            overtimeAmount: parseFloat(row.overtime_amount),
            grossEarnings: parseFloat(row.gross_earnings),
            pfDeduction: parseFloat(row.pf_deduction),
            taxDeduction: parseFloat(row.tax_deduction),
            advanceRecovery: parseFloat(row.advance_recovery),
            otherDeductions: parseFloat(row.other_deductions),
            totalDeductions: parseFloat(row.total_deductions),
            netSalary: parseFloat(row.net_salary),
            paymentStatus: row.payment_status,
            paymentMethod: row.payment_method,
            createdAt: row.created_at.toISOString(),
            updatedAt: row.updated_at.toISOString(),
            employeeName: row.employee_name,
            employeeCode: row.employee_code,
            designation: row.designation,
            department: row.department,
            bankName: row.bank_name,
            bankAccountNumberMask: row.bank_account_number_mask,
            bankIfsc: row.bank_ifsc,
        };
    }
}
//# sourceMappingURL=payroll.service.js.map