import { type EmployeeSalaryStructure, type EmployeeAdvance, SalaryCalculationBasis, EmployeeAdvanceStatus } from '@dfarm/shared-types';
import type { AuthContext } from '../../middleware/authenticate.js';
export declare class SalaryService {
    /**
     * 1. Create or Update Employee Salary Structure
     */
    static createSalaryStructure(data: {
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
    }, auth: AuthContext): Promise<EmployeeSalaryStructure>;
    /**
     * 2. Get active salary structure for employee
     */
    static getSalaryStructure(employeeId: string, auth: AuthContext): Promise<EmployeeSalaryStructure | null>;
    /**
     * 3. Create Employee Advance Request
     */
    static requestAdvance(data: {
        employeeId: string;
        amount: number;
        monthlyInstallment: number;
        reason: string;
    }, auth: AuthContext): Promise<EmployeeAdvance>;
    /**
     * 4. Approve or Reject Employee Advance
     * Maker-Checker Rule:
     * Initiator cannot approve their own advance request.
     */
    static approveAdvance(advanceId: string, action: {
        status: EmployeeAdvanceStatus.APPROVED | EmployeeAdvanceStatus.REJECTED;
        disbursedAmount?: number;
    }, auth: AuthContext): Promise<EmployeeAdvance>;
    /**
     * 5. List Employee Advances
     */
    static listAdvances(filters: {
        employeeId?: string;
        status?: EmployeeAdvanceStatus;
    }, auth: AuthContext): Promise<EmployeeAdvance[]>;
    private static formatSalaryStructure;
    private static formatAdvance;
}
//# sourceMappingURL=salary.service.d.ts.map