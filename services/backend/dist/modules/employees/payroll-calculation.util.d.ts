/**
 * Authoritative financial calculation utility for employee payroll.
 * Uses exact BigInt paise arithmetic to prevent JavaScript IEEE 754 floating-point drift.
 */
export declare function toPaise(amount: number | string | null | undefined): bigint;
export declare function fromPaise(paise: bigint): number;
export declare function formatPaiseToNumericString(paise: bigint): string;
export interface SalaryBreakdownResult {
    workingDays: number;
    payableDays: number;
    earnedBasic: number;
    earnedHra: number;
    earnedTravel: number;
    earnedSpecial: number;
    earnedMedical: number;
    overtimeAmount: number;
    grossEarnings: number;
    pfDeduction: number;
    taxDeduction: number;
    otherDeductions: number;
    advanceRecovery: number;
    totalDeductions: number;
    netSalary: number;
}
export declare function calculateEmployeeSalary(params: {
    baseSalary: number;
    hra: number;
    travelAllowance: number;
    specialAllowance: number;
    medicalAllowance: number;
    overtimeHourlyRate: number;
    overtimeHours: number;
    providentFund: number;
    tax: number;
    otherDeductions: number;
    totalWorkingDays: number;
    presentDays: number;
    paidLeaveDays: number;
    activeAdvanceBalance: number;
    advanceMonthlyInstallment: number;
}): SalaryBreakdownResult;
//# sourceMappingURL=payroll-calculation.util.d.ts.map