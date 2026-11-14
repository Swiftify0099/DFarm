import { type Employee, type EmployeeAttendance, type EmployeeShift, type EmployeeLeave, type EmployeeSalaryStructure, type EmployeeAdvance, type PayrollRun, type EmployeePayslip, type EmployeeSalaryPayment, type LeaveStatus } from '@dfarm/shared-types';
export declare const employeeApi: {
    getEmployees: (params?: {
        centerId?: string;
        department?: string;
        status?: string;
        search?: string;
        limit?: number;
        offset?: number;
    }) => Promise<{
        employees: Employee[];
        total: number;
    }>;
    getEmployeeById: (employeeId: string) => Promise<Employee>;
    createEmployee: (data: any) => Promise<Employee>;
    updateEmployee: (employeeId: string, data: any) => Promise<Employee>;
    assignRole: (employeeId: string, data: {
        role: string;
        centerIds?: string[];
        primaryCenterId?: string;
    }) => Promise<Employee>;
    assignCenter: (employeeId: string, data: {
        centerId: string;
        isPrimary: boolean;
    }) => Promise<{
        success: boolean;
        message: string;
    }>;
    getShifts: () => Promise<EmployeeShift[]>;
    createShift: (data: any) => Promise<EmployeeShift>;
    getAttendance: (params?: {
        centerId?: string;
        employeeId?: string;
        startDate?: string;
        endDate?: string;
        status?: string;
        limit?: number;
        offset?: number;
    }) => Promise<{
        records: EmployeeAttendance[];
        total: number;
    }>;
    recordAttendance: (data: any) => Promise<EmployeeAttendance>;
    correctAttendance: (attendanceId: string, data: {
        checkInTime?: string | null;
        checkOutTime?: string | null;
        status?: string;
        overtimeHours?: number;
        reason: string;
        notes?: string;
    }) => Promise<EmployeeAttendance>;
    getAttendanceSummary: (params: {
        centerId?: string;
        startDate: string;
        endDate: string;
    }) => Promise<any[]>;
    getLeaves: (params?: {
        employeeId?: string;
        status?: string;
    }) => Promise<EmployeeLeave[]>;
    createLeave: (data: any) => Promise<EmployeeLeave>;
    approveLeave: (leaveId: string, data: {
        status: LeaveStatus.APPROVED | LeaveStatus.REJECTED;
        rejectionReason?: string | null;
    }) => Promise<EmployeeLeave>;
    getSalaryStructure: (employeeId: string) => Promise<EmployeeSalaryStructure | null>;
    createSalaryStructure: (employeeId: string, data: any) => Promise<EmployeeSalaryStructure>;
    getAdvances: (params?: {
        employeeId?: string;
        status?: string;
    }) => Promise<EmployeeAdvance[]>;
    requestAdvance: (employeeId: string, data: any) => Promise<EmployeeAdvance>;
    approveAdvance: (advanceId: string, data: {
        status: string;
        disbursedAmount?: number;
    }) => Promise<EmployeeAdvance>;
    getPayrollRuns: (params?: {
        centerId?: string;
        year?: number;
    }) => Promise<PayrollRun[]>;
    getPayrollRunById: (runId: string) => Promise<{
        run: PayrollRun;
        payslips: EmployeePayslip[];
    }>;
    initiatePayrollRun: (data: {
        centerId?: string | null;
        year: number;
        month: number;
        notes?: string | null;
    }) => Promise<PayrollRun>;
    calculatePayrollRun: (runId: string) => Promise<PayrollRun>;
    approvePayrollRun: (runId: string, data: {
        action: "APPROVE" | "REJECT";
        notes?: string | null;
    }) => Promise<PayrollRun>;
    finalizePayrollRun: (runId: string, data?: {
        notes?: string | null;
    }) => Promise<PayrollRun>;
    getPayslip: (payslipId: string) => Promise<EmployeePayslip>;
    recordSalaryPayment: (data: {
        payrollRunId: string;
        payslipId: string;
        employeeId: string;
        amount: number;
        paymentMethod?: string;
        transactionId?: string | null;
        bankName?: string | null;
        bankAccountMask?: string | null;
        bankIfsc?: string | null;
        notes?: string | null;
    }) => Promise<EmployeeSalaryPayment>;
};
//# sourceMappingURL=employeeApi.d.ts.map