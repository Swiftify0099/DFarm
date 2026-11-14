/**
 * Authoritative financial calculation utility for employee payroll.
 * Uses exact BigInt paise arithmetic to prevent JavaScript IEEE 754 floating-point drift.
 */
export function toPaise(amount) {
    if (amount === null || amount === undefined || amount === '') {
        return 0n;
    }
    const val = typeof amount === 'number' ? amount.toFixed(2) : String(amount).trim();
    const isNeg = val.startsWith('-');
    const clean = isNeg ? val.slice(1) : val;
    const parts = clean.split('.');
    const whole = parts[0] || '0';
    const frac = (parts[1] || '').padEnd(2, '0').slice(0, 2);
    const total = BigInt(whole) * 100n + BigInt(frac);
    return isNeg ? -total : total;
}
export function fromPaise(paise) {
    const isNeg = paise < 0n;
    const abs = isNeg ? -paise : paise;
    const whole = abs / 100n;
    const frac = abs % 100n;
    const str = `${isNeg ? '-' : ''}${whole}.${frac.toString().padStart(2, '0')}`;
    return parseFloat(str);
}
export function formatPaiseToNumericString(paise) {
    const isNeg = paise < 0n;
    const abs = isNeg ? -paise : paise;
    const whole = abs / 100n;
    const frac = abs % 100n;
    return `${isNeg ? '-' : ''}${whole}.${frac.toString().padStart(2, '0')}`;
}
export function calculateEmployeeSalary(params) {
    const totalWorkingDays = params.totalWorkingDays > 0 ? params.totalWorkingDays : 30;
    const payableDays = Math.min(totalWorkingDays, params.presentDays + params.paidLeaveDays);
    const baseSalaryP = toPaise(params.baseSalary);
    const hraP = toPaise(params.hra);
    const travelP = toPaise(params.travelAllowance);
    const specialP = toPaise(params.specialAllowance);
    const medicalP = toPaise(params.medicalAllowance);
    const otRateP = toPaise(params.overtimeHourlyRate);
    // Pro-rata factor in 10000 basis points: (payableDays * 10000) / totalWorkingDays
    const factorBps = BigInt(Math.round((payableDays * 10000) / totalWorkingDays));
    const earnedBasicP = (baseSalaryP * factorBps) / 10000n;
    const earnedHraP = (hraP * factorBps) / 10000n;
    const earnedTravelP = (travelP * factorBps) / 10000n;
    const earnedSpecialP = (specialP * factorBps) / 10000n;
    const earnedMedicalP = (medicalP * factorBps) / 10000n;
    // Overtime amount = overtimeHours * overtimeHourlyRate
    const otHoursBps = BigInt(Math.round(params.overtimeHours * 100));
    const otAmountP = (otRateP * otHoursBps) / 100n;
    const grossEarningsP = earnedBasicP + earnedHraP + earnedTravelP + earnedSpecialP + earnedMedicalP + otAmountP;
    // Deductions
    const pfP = toPaise(params.providentFund);
    const taxP = toPaise(params.tax);
    const otherDedP = toPaise(params.otherDeductions);
    const statutoryDeductionsP = pfP + taxP + otherDedP;
    // Advance recovery: capped by remaining advance balance and earnings after statutory deductions
    let advanceRecoveryP = 0n;
    if (params.activeAdvanceBalance > 0 && params.advanceMonthlyInstallment > 0) {
        const remainingAdvanceP = toPaise(params.activeAdvanceBalance);
        const installmentP = toPaise(params.advanceMonthlyInstallment);
        const candidateP = installmentP < remainingAdvanceP ? installmentP : remainingAdvanceP;
        const netBeforeAdvanceP = grossEarningsP > statutoryDeductionsP ? grossEarningsP - statutoryDeductionsP : 0n;
        advanceRecoveryP = candidateP < netBeforeAdvanceP ? candidateP : netBeforeAdvanceP;
    }
    const totalDeductionsP = statutoryDeductionsP + advanceRecoveryP;
    const netSalaryP = grossEarningsP > totalDeductionsP ? grossEarningsP - totalDeductionsP : 0n;
    return {
        workingDays: totalWorkingDays,
        payableDays,
        earnedBasic: fromPaise(earnedBasicP),
        earnedHra: fromPaise(earnedHraP),
        earnedTravel: fromPaise(earnedTravelP),
        earnedSpecial: fromPaise(earnedSpecialP),
        earnedMedical: fromPaise(earnedMedicalP),
        overtimeAmount: fromPaise(otAmountP),
        grossEarnings: fromPaise(grossEarningsP),
        pfDeduction: fromPaise(pfP),
        taxDeduction: fromPaise(taxP),
        otherDeductions: fromPaise(otherDedP),
        advanceRecovery: fromPaise(advanceRecoveryP),
        totalDeductions: fromPaise(totalDeductionsP),
        netSalary: fromPaise(netSalaryP),
    };
}
//# sourceMappingURL=payroll-calculation.util.js.map