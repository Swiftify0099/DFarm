import { type PayrollRun, type EmployeePayslip, type EmployeeSalaryPayment, SalaryPaymentMethod } from '@dfarm/shared-types';
import type { AuthContext } from '../../middleware/authenticate.js';
export declare class PayrollService {
    /**
     * 1. Initiate a new Payroll Run (State: DRAFT)
     */
    static initiatePayrollRun(data: {
        centerId?: string | null;
        year: number;
        month: number;
        notes?: string | null;
    }, auth: AuthContext): Promise<PayrollRun>;
    /**
     * 2. Calculate Payroll Run (State: CALCULATING -> UNDER_REVIEW)
     * Exact Fixed-Point Math & Attendance Aggregation
     */
    static calculatePayrollRun(payrollRunId: string, auth: AuthContext): Promise<PayrollRun>;
    /**
     * 3. Approve Payroll Run (State: UNDER_REVIEW -> APPROVED)
     * CRITICAL MAKER-CHECKER SECURITY RULE:
     * Initiator CANNOT approve their own payroll run!
     */
    static approvePayrollRun(payrollRunId: string, action: {
        action: 'APPROVE' | 'REJECT';
        notes?: string | null;
    }, auth: AuthContext): Promise<PayrollRun>;
    /**
     * 4. Finalize Payroll Run (State: APPROVED -> FINALIZED)
     * Historical Snapshot Protection: Finalized payslips become immutable.
     * Also deducts advance recoveries from employee_advances.
     */
    static finalizePayrollRun(payrollRunId: string, notes: string | null | undefined, auth: AuthContext): Promise<PayrollRun>;
    /**
     * 5. Record Employee Salary Payment (Disbursement)
     * Dedicated Employee Financial Records:
     * Writes to employee_salary_payments.
     * Completely separated from customer milk ledger.
     */
    static recordSalaryPayment(data: {
        payrollRunId: string;
        payslipId: string;
        employeeId: string;
        amount: number;
        paymentMethod?: SalaryPaymentMethod;
        transactionId?: string | null;
        bankName?: string | null;
        bankAccountMask?: string | null;
        bankIfsc?: string | null;
        notes?: string | null;
    }, auth: AuthContext): Promise<EmployeeSalaryPayment>;
    /**
     * 6. List Payroll Runs
     */
    static listPayrollRuns(filters: {
        centerId?: string;
        year?: number;
    }, auth: AuthContext): Promise<PayrollRun[]>;
    /**
     * 7. Get Payroll Run by ID (with payslips)
     */
    static getPayrollRunById(payrollRunId: string, auth: AuthContext): Promise<{
        run: PayrollRun;
        payslips: EmployeePayslip[];
    }>;
    /**
     * 8. Get Payslip by ID
     */
    static getPayslipById(payslipId: string, auth: AuthContext): Promise<EmployeePayslip>;
    private static formatPayrollRun;
    private static formatPayslip;
}
//# sourceMappingURL=payroll.service.d.ts.map