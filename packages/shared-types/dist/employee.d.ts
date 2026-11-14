import { EmploymentStatus, EmploymentType, EmployeeShiftType, AttendanceStatus, LeaveType, LeaveStatus, SalaryCalculationBasis, EmployeeAdvanceStatus, PayrollRunStatus, PayslipPaymentStatus, SalaryPaymentMethod, SalaryPaymentStatus, UserRole } from './enums.js';
export interface Employee {
    id: string;
    organizationId: string;
    primaryCenterId?: string | null;
    userId?: string | null;
    employeeCode: string;
    firstName: string;
    lastName: string;
    fullName: string;
    mobileNumber: string;
    email?: string | null;
    nationalIdMask?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    joiningDate: string;
    terminationDate?: string | null;
    employmentStatus: EmploymentStatus;
    employmentType: EmploymentType;
    designation: string;
    department: string;
    emergencyContactName?: string | null;
    emergencyContactPhone?: string | null;
    emergencyContactRelation?: string | null;
    emergencyContactApproved: boolean;
    bankName?: string | null;
    bankAccountNumberMask?: string | null;
    bankIfsc?: string | null;
    createdBy: string;
    updatedBy?: string | null;
    createdAt: string;
    updatedAt: string;
    assignedCenterIds?: string[];
    role?: UserRole;
    salaryStructure?: EmployeeSalaryStructure;
}
export interface EmployeeCenterAssignment {
    id: string;
    employeeId: string;
    centerId: string;
    isPrimary: boolean;
    assignedAt: string;
}
export interface EmployeeShift {
    id: string;
    organizationId: string;
    code: string;
    name: string;
    startTime: string;
    endTime: string;
    gracePeriodMinutes: number;
    halfDayThresholdHours: number;
    fullDayThresholdHours: number;
    isActive: boolean;
    createdAt: string;
}
export interface EmployeeAttendance {
    id: string;
    organizationId: string;
    centerId: string;
    employeeId: string;
    attendanceDate: string;
    shiftId?: string | null;
    shiftType: EmployeeShiftType;
    checkInTime?: string | null;
    checkOutTime?: string | null;
    totalHours: number;
    status: AttendanceStatus;
    isLateArrival: boolean;
    isEarlyDeparture: boolean;
    overtimeHours: number;
    isManualCorrection: boolean;
    correctionReason?: string | null;
    correctedBy?: string | null;
    correctedAt?: string | null;
    notes?: string | null;
    createdAt: string;
    updatedAt: string;
    employeeName?: string;
    employeeCode?: string;
}
export interface AttendanceAuditLog {
    id: string;
    attendanceId: string;
    action: string;
    actorId: string;
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
    reason: string;
    ipAddress?: string | null;
    timestamp: string;
}
export interface EmployeeLeave {
    id: string;
    organizationId: string;
    employeeId: string;
    leaveType: LeaveType;
    startDate: string;
    endDate: string;
    daysCount: number;
    reason: string;
    status: LeaveStatus;
    approvedBy?: string | null;
    approvedAt?: string | null;
    rejectionReason?: string | null;
    createdAt: string;
    updatedAt: string;
    employeeName?: string;
    employeeCode?: string;
}
export interface EmployeeSalaryStructure {
    id: string;
    organizationId: string;
    employeeId: string;
    calculationBasis: SalaryCalculationBasis;
    baseSalary: number;
    hra: number;
    travelAllowance: number;
    specialAllowance: number;
    medicalAllowance: number;
    grossSalary: number;
    providentFundEmployee: number;
    professionalTax: number;
    tdsTax: number;
    otherDeductions: number;
    overtimeHourlyRate: number;
    effectiveFrom: string;
    effectiveTo?: string | null;
    isActive: boolean;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
}
export interface EmployeeAdvance {
    id: string;
    organizationId: string;
    employeeId: string;
    advanceNumber: string;
    amount: number;
    disbursedAmount: number;
    recoveredAmount: number;
    remainingBalance: number;
    monthlyInstallment: number;
    status: EmployeeAdvanceStatus;
    reason: string;
    createdBy: string;
    approvedBy?: string | null;
    approvedAt?: string | null;
    createdAt: string;
    updatedAt: string;
    employeeName?: string;
    employeeCode?: string;
}
export interface PayrollRun {
    id: string;
    organizationId: string;
    centerId?: string | null;
    periodStart: string;
    periodEnd: string;
    year: number;
    month: number;
    status: PayrollRunStatus;
    totalEmployees: number;
    totalGrossSalary: number;
    totalAllowances: number;
    totalDeductions: number;
    totalAdvancesRecovered: number;
    totalNetSalary: number;
    initiatedBy: string;
    calculatedAt?: string | null;
    approvedBy?: string | null;
    approvedAt?: string | null;
    finalizedBy?: string | null;
    finalizedAt?: string | null;
    paidAt?: string | null;
    notes?: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface EmployeePayslip {
    id: string;
    payrollRunId: string;
    employeeId: string;
    payslipNumber: string;
    totalWorkingDays: number;
    presentDays: number;
    absentDays: number;
    paidLeaveDays: number;
    unpaidLeaveDays: number;
    overtimeHours: number;
    baseSalary: number;
    earnedBasic: number;
    hra: number;
    travelAllowance: number;
    specialAllowance: number;
    medicalAllowance: number;
    overtimeAmount: number;
    grossEarnings: number;
    pfDeduction: number;
    taxDeduction: number;
    advanceRecovery: number;
    otherDeductions: number;
    totalDeductions: number;
    netSalary: number;
    paymentStatus: PayslipPaymentStatus;
    paymentMethod: SalaryPaymentMethod;
    createdAt: string;
    updatedAt: string;
    employeeName?: string;
    employeeCode?: string;
    designation?: string;
    department?: string;
    bankName?: string;
    bankAccountNumberMask?: string;
    bankIfsc?: string;
}
export interface EmployeeSalaryPayment {
    id: string;
    organizationId: string;
    payrollRunId: string;
    payslipId: string;
    employeeId: string;
    paymentReference: string;
    amount: number;
    paymentMethod: SalaryPaymentMethod;
    transactionId?: string | null;
    bankName?: string | null;
    bankAccountMask?: string | null;
    bankIfsc?: string | null;
    status: SalaryPaymentStatus;
    disbursedAt: string;
    disbursedBy: string;
    notes?: string | null;
    createdAt: string;
}
export interface PayrollAuditLog {
    id: string;
    organizationId: string;
    entityType: string;
    entityId: string;
    action: string;
    actorId: string;
    previousState?: string | null;
    newState?: string | null;
    metadata?: Record<string, unknown> | null;
    timestamp: string;
}
//# sourceMappingURL=employee.d.ts.map