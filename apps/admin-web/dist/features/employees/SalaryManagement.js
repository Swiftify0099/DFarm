import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { employeeApi } from '../../api/employeeApi.js';
import { SalaryCalculationBasis, EmployeeAdvanceStatus, } from '@dfarm/shared-types';
export const SalaryManagement = ({ initialEmployeeId }) => {
    const [employees, setEmployees] = useState([]);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState(initialEmployeeId || '');
    const [currentStructure, setCurrentStructure] = useState(null);
    const [advances, setAdvances] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    // Salary structure form state
    const [salaryForm, setSalaryForm] = useState({
        calculationBasis: SalaryCalculationBasis.MONTHLY,
        baseSalary: 15000,
        hra: 3000,
        travelAllowance: 1500,
        specialAllowance: 1000,
        medicalAllowance: 500,
        providentFundEmployee: 1800,
        professionalTax: 200,
        tdsTax: 0,
        otherDeductions: 0,
        overtimeHourlyRate: 100,
        effectiveFrom: new Date().toISOString().split('T')[0],
    });
    // Advance modal state
    const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
    const [advanceForm, setAdvanceForm] = useState({
        amount: 5000,
        monthlyInstallment: 1000,
        reason: '',
    });
    useEffect(() => {
        loadEmployees();
    }, []);
    useEffect(() => {
        if (selectedEmployeeId) {
            loadSalaryAndAdvances(selectedEmployeeId);
        }
    }, [selectedEmployeeId]);
    const loadEmployees = async () => {
        try {
            const data = await employeeApi.getEmployees({ limit: 100 });
            setEmployees(data.employees);
            if (data.employees.length > 0 && !selectedEmployeeId) {
                setSelectedEmployeeId(data.employees[0].id);
            }
        }
        catch (err) {
            setError(err.message || 'Failed to load employees');
        }
    };
    const loadSalaryAndAdvances = async (empId) => {
        setLoading(true);
        setError(null);
        try {
            const [struct, advs] = await Promise.all([
                employeeApi.getSalaryStructure(empId),
                employeeApi.getAdvances({ employeeId: empId }),
            ]);
            setCurrentStructure(struct);
            setAdvances(advs);
            if (struct) {
                setSalaryForm({
                    calculationBasis: struct.calculationBasis,
                    baseSalary: struct.baseSalary,
                    hra: struct.hra,
                    travelAllowance: struct.travelAllowance,
                    specialAllowance: struct.specialAllowance,
                    medicalAllowance: struct.medicalAllowance,
                    providentFundEmployee: struct.providentFundEmployee,
                    professionalTax: struct.professionalTax,
                    tdsTax: struct.tdsTax,
                    otherDeductions: struct.otherDeductions,
                    overtimeHourlyRate: struct.overtimeHourlyRate,
                    effectiveFrom: struct.effectiveFrom,
                });
            }
        }
        catch (err) {
            setError(err.message || 'Failed to load compensation data');
        }
        finally {
            setLoading(false);
        }
    };
    const handleSaveSalaryStructure = async (e) => {
        e.preventDefault();
        if (!selectedEmployeeId)
            return;
        try {
            const struct = await employeeApi.createSalaryStructure(selectedEmployeeId, {
                ...salaryForm,
                employeeId: selectedEmployeeId,
            });
            setCurrentStructure(struct);
            alert('Salary structure updated successfully!');
        }
        catch (err) {
            alert(err.message || 'Failed to save salary structure');
        }
    };
    const handleRequestAdvance = async (e) => {
        e.preventDefault();
        if (!selectedEmployeeId)
            return;
        try {
            await employeeApi.requestAdvance(selectedEmployeeId, advanceForm);
            setIsAdvanceModalOpen(false);
            setAdvanceForm({ amount: 5000, monthlyInstallment: 1000, reason: '' });
            loadSalaryAndAdvances(selectedEmployeeId);
        }
        catch (err) {
            alert(err.message || 'Failed to submit advance request');
        }
    };
    const handleApproveAdvance = async (advanceId) => {
        try {
            await employeeApi.approveAdvance(advanceId, { status: EmployeeAdvanceStatus.APPROVED });
            loadSalaryAndAdvances(selectedEmployeeId);
        }
        catch (err) {
            alert(err.message || 'Approval failed (Self-approval is rejected by security policy)');
        }
    };
    const computedGross = salaryForm.baseSalary +
        salaryForm.hra +
        salaryForm.travelAllowance +
        salaryForm.specialAllowance +
        salaryForm.medicalAllowance;
    const computedDeductions = salaryForm.providentFundEmployee +
        salaryForm.professionalTax +
        salaryForm.tdsTax +
        salaryForm.otherDeductions;
    const computedNet = Math.max(0, computedGross - computedDeductions);
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "clay-card rounded-3xl p-6 bg-white shadow-clay-card border border-white/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-black text-slate-800 tracking-tight", children: "\uD83D\uDCB0 Salary & Advances Management" }), _jsx("p", { className: "text-sm text-slate-500 font-medium", children: "Configure compensation packages, allowances, statutory deductions, and employee loans" })] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("label", { className: "text-xs font-extrabold uppercase tracking-wider text-slate-600", children: "Select Employee:" }), _jsx("select", { value: selectedEmployeeId, onChange: (e) => setSelectedEmployeeId(e.target.value), className: "clay-inset bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm", children: employees.map((emp) => (_jsxs("option", { value: emp.id, children: [emp.fullName, " (", emp.employeeCode, ")"] }, emp.id))) })] })] }), error && (_jsx("div", { className: "p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold shadow-sm", children: error })), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-6", children: [_jsxs("div", { className: "lg:col-span-2 clay-card rounded-3xl p-6 sm:p-8 bg-white shadow-clay-card border border-white/80 space-y-6", children: [_jsxs("div", { className: "flex justify-between items-center border-b border-slate-100 pb-3", children: [_jsxs("div", { children: [_jsx("h3", { className: "font-black text-slate-800 text-lg", children: "Compensation Structure" }), currentStructure && (_jsxs("span", { className: "text-xs text-slate-500 font-medium", children: ["Active since ", currentStructure.effectiveFrom, " (Gross: \u20B9", currentStructure.grossSalary.toFixed(2), ")"] }))] }), _jsx("span", { className: "text-xs bg-emerald-50 text-emerald-800 font-bold px-3 py-1 rounded-full border border-emerald-200 shadow-sm", children: loading ? 'Refreshing...' : 'PostgreSQL NUMERIC Precision' })] }), _jsxs("form", { onSubmit: handleSaveSalaryStructure, className: "space-y-5 text-sm", children: [_jsxs("div", { className: "clay-inset p-4 rounded-2xl bg-[#EEF2F6] border border-[#CBD5E1]/50 grid grid-cols-2 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1", children: "Calculation Basis *" }), _jsxs("select", { value: salaryForm.calculationBasis, onChange: (e) => setSalaryForm({ ...salaryForm, calculationBasis: e.target.value }), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm", children: [_jsx("option", { value: SalaryCalculationBasis.MONTHLY, children: "Monthly Fixed" }), _jsx("option", { value: SalaryCalculationBasis.DAILY_WAGE, children: "Daily Wage" }), _jsx("option", { value: SalaryCalculationBasis.HOURLY, children: "Hourly" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1", children: "Effective From *" }), _jsx("input", { type: "date", required: true, value: salaryForm.effectiveFrom, onChange: (e) => setSalaryForm({ ...salaryForm, effectiveFrom: e.target.value }), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" })] })] }), _jsxs("div", { className: "clay-card rounded-2xl p-5 bg-[#F8FAFC] border border-slate-200/80 space-y-3 shadow-sm", children: [_jsxs("h4", { className: "font-extrabold text-xs uppercase tracking-wider text-slate-700 flex items-center gap-1.5", children: [_jsx("span", { children: "\uD83D\uDCC8" }), " Gross Earnings Components"] }), _jsxs("div", { className: "grid grid-cols-2 sm:grid-cols-3 gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-bold text-slate-600 mb-1", children: "Base Salary (\u20B9) *" }), _jsx("input", { type: "number", min: "0", step: "0.01", required: true, value: salaryForm.baseSalary, onChange: (e) => setSalaryForm({ ...salaryForm, baseSalary: parseFloat(e.target.value) || 0 }), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-bold text-slate-600 mb-1", children: "HRA (\u20B9)" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: salaryForm.hra, onChange: (e) => setSalaryForm({ ...salaryForm, hra: parseFloat(e.target.value) || 0 }), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-bold text-slate-600 mb-1", children: "Travel Allowance (\u20B9)" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: salaryForm.travelAllowance, onChange: (e) => setSalaryForm({ ...salaryForm, travelAllowance: parseFloat(e.target.value) || 0 }), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-bold text-slate-600 mb-1", children: "Special Allowance (\u20B9)" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: salaryForm.specialAllowance, onChange: (e) => setSalaryForm({ ...salaryForm, specialAllowance: parseFloat(e.target.value) || 0 }), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-bold text-slate-600 mb-1", children: "Medical Allowance (\u20B9)" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: salaryForm.medicalAllowance, onChange: (e) => setSalaryForm({ ...salaryForm, medicalAllowance: parseFloat(e.target.value) || 0 }), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-bold text-slate-600 mb-1", children: "OT Hourly Rate (\u20B9)" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: salaryForm.overtimeHourlyRate, onChange: (e) => setSalaryForm({ ...salaryForm, overtimeHourlyRate: parseFloat(e.target.value) || 0 }), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" })] })] })] }), _jsxs("div", { className: "clay-card rounded-2xl p-5 bg-[#F8FAFC] border border-slate-200/80 space-y-3 shadow-sm", children: [_jsxs("h4", { className: "font-extrabold text-xs uppercase tracking-wider text-slate-700 flex items-center gap-1.5", children: [_jsx("span", { children: "\uD83D\uDCC9" }), " Deductions"] }), _jsxs("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-bold text-slate-600 mb-1", children: "Provident Fund (\u20B9)" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: salaryForm.providentFundEmployee, onChange: (e) => setSalaryForm({ ...salaryForm, providentFundEmployee: parseFloat(e.target.value) || 0 }), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-bold text-slate-600 mb-1", children: "Professional Tax (\u20B9)" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: salaryForm.professionalTax, onChange: (e) => setSalaryForm({ ...salaryForm, professionalTax: parseFloat(e.target.value) || 0 }), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-bold text-slate-600 mb-1", children: "TDS Tax (\u20B9)" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: salaryForm.tdsTax, onChange: (e) => setSalaryForm({ ...salaryForm, tdsTax: parseFloat(e.target.value) || 0 }), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-bold text-slate-600 mb-1", children: "Other Deductions (\u20B9)" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: salaryForm.otherDeductions, onChange: (e) => setSalaryForm({ ...salaryForm, otherDeductions: parseFloat(e.target.value) || 0 }), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" })] })] })] }), _jsxs("div", { className: "clay-card rounded-2xl p-5 bg-gradient-to-r from-emerald-50/80 via-teal-50/60 to-emerald-50/80 border border-emerald-200/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-sm", children: [_jsxs("div", { children: [_jsx("span", { className: "text-xs text-slate-500 font-bold uppercase block", children: "Gross Earnings:" }), _jsxs("span", { className: "text-lg font-black text-slate-900", children: ["\u20B9", computedGross.toFixed(2)] })] }), _jsxs("div", { children: [_jsx("span", { className: "text-xs text-slate-500 font-bold uppercase block", children: "Total Deductions:" }), _jsxs("span", { className: "text-lg font-black text-rose-600", children: ["-\u20B9", computedDeductions.toFixed(2)] })] }), _jsxs("div", { className: "sm:text-right", children: [_jsx("span", { className: "text-xs text-slate-500 font-bold uppercase block", children: "Estimated Net Salary:" }), _jsxs("span", { className: "text-2xl font-black text-emerald-700", children: ["\u20B9", computedNet.toFixed(2)] })] })] }), _jsx("div", { className: "flex justify-end pt-2", children: _jsx("button", { type: "submit", className: "clay-btn-brand px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white rounded-xl font-extrabold text-sm shadow-clay-button active:scale-95 transition-all", children: "\uD83D\uDCBE Save Compensation Structure" }) })] })] }), _jsxs("div", { className: "clay-card rounded-3xl p-6 bg-white shadow-clay-card border border-white/80 space-y-4", children: [_jsxs("div", { className: "flex justify-between items-center border-b border-slate-100 pb-3", children: [_jsx("h3", { className: "font-black text-slate-800 text-lg", children: "Employee Advances" }), _jsx("button", { onClick: () => setIsAdvanceModalOpen(true), className: "clay-btn-brand px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-xl text-xs font-bold shadow-clay-button active:scale-95 transition-all", children: "\u2795 Request" })] }), _jsx("p", { className: "text-xs text-slate-500 font-medium", children: "Dedicated employee loan tracking with monthly automatic payroll deduction." }), advances.length === 0 ? (_jsx("div", { className: "p-8 text-center clay-inset rounded-2xl bg-slate-50 text-slate-400 text-xs font-medium", children: "No active or pending advances." })) : (_jsx("div", { className: "space-y-3", children: advances.map((adv) => (_jsxs("div", { className: "clay-card p-3.5 rounded-2xl bg-[#F8FAFC] border border-slate-200/80 text-xs space-y-1.5 shadow-sm", children: [_jsxs("div", { className: "flex justify-between items-center", children: [_jsx("span", { className: "font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md", children: adv.advanceNumber }), _jsx("span", { className: `px-2 py-0.5 rounded-full text-[10px] font-extrabold ${adv.status === EmployeeAdvanceStatus.ACTIVE
                                                        ? 'bg-sky-100 text-sky-800'
                                                        : adv.status === EmployeeAdvanceStatus.PENDING_APPROVAL
                                                            ? 'bg-amber-100 text-amber-800'
                                                            : 'bg-slate-200 text-slate-700'}`, children: adv.status })] }), _jsxs("div", { className: "flex justify-between text-slate-600 font-medium", children: [_jsxs("span", { children: ["Principal: \u20B9", adv.amount.toFixed(2)] }), _jsxs("span", { className: "font-black text-slate-900", children: ["Balance: \u20B9", adv.remainingBalance.toFixed(2)] })] }), _jsxs("div", { className: "text-slate-500 font-medium", children: ["Installment: \u20B9", adv.monthlyInstallment.toFixed(2), "/mo"] }), _jsx("div", { className: "text-slate-500 italic truncate font-medium", children: adv.reason }), adv.status === EmployeeAdvanceStatus.PENDING_APPROVAL && (_jsx("div", { className: "pt-2 flex justify-end", children: _jsx("button", { onClick: () => handleApproveAdvance(adv.id), className: "px-3 py-1.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 active:scale-95 transition-all shadow-sm", children: "Approve Advance" }) }))] }, adv.id))) }))] })] }), isAdvanceModalOpen && (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200", children: _jsxs("div", { className: "clay-card bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4 border border-white", children: [_jsxs("div", { className: "flex justify-between items-center border-b pb-2", children: [_jsx("h3", { className: "font-black text-slate-800 text-lg", children: "\uD83D\uDCB8 Request Employee Advance" }), _jsx("button", { onClick: () => setIsAdvanceModalOpen(false), className: "text-slate-400 hover:text-slate-600 font-bold text-xl", children: "\u00D7" })] }), _jsxs("form", { onSubmit: handleRequestAdvance, className: "space-y-3.5 text-sm", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1", children: "Advance Amount (\u20B9) *" }), _jsx("input", { type: "number", min: "100", step: "100", required: true, value: advanceForm.amount, onChange: (e) => setAdvanceForm({ ...advanceForm, amount: parseFloat(e.target.value) || 0 }), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1", children: "Monthly Installment (\u20B9) *" }), _jsx("input", { type: "number", min: "100", step: "100", required: true, value: advanceForm.monthlyInstallment, onChange: (e) => setAdvanceForm({ ...advanceForm, monthlyInstallment: parseFloat(e.target.value) || 0 }), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1", children: "Documented Reason *" }), _jsx("textarea", { required: true, rows: 2, placeholder: "Reason for advance...", value: advanceForm.reason, onChange: (e) => setAdvanceForm({ ...advanceForm, reason: e.target.value }), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" })] }), _jsxs("div", { className: "flex justify-end space-x-2 pt-3 border-t border-slate-100", children: [_jsx("button", { type: "button", onClick: () => setIsAdvanceModalOpen(false), className: "px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700 active:scale-95 transition-all", children: "Cancel" }), _jsx("button", { type: "submit", className: "clay-btn-brand px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white rounded-xl font-extrabold text-xs shadow-clay-button active:scale-95 transition-all", children: "Submit Request" })] })] })] }) }))] }));
};
//# sourceMappingURL=SalaryManagement.js.map