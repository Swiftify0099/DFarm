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
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-xl font-bold text-gray-800", children: "\uD83D\uDCB0 Salary & Advances Management" }), _jsx("p", { className: "text-sm text-gray-500", children: "Configure compensation packages, allowances, statutory deductions, and employee loans" })] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("label", { className: "text-sm font-semibold text-gray-700", children: "Select Employee:" }), _jsx("select", { value: selectedEmployeeId, onChange: (e) => setSelectedEmployeeId(e.target.value), className: "px-3 py-2 border rounded-md text-sm bg-white font-medium", children: employees.map((emp) => (_jsxs("option", { value: emp.id, children: [emp.fullName, " (", emp.employeeCode, ")"] }, emp.id))) })] })] }), error && (_jsx("div", { className: "p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg", children: error })), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-6", children: [_jsxs("div", { className: "lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-6", children: [_jsxs("div", { className: "flex justify-between items-center border-b pb-3", children: [_jsxs("div", { children: [_jsx("h3", { className: "font-bold text-gray-800 text-base", children: "Compensation Structure" }), currentStructure && (_jsxs("span", { className: "text-xs text-gray-500", children: ["Active since ", currentStructure.effectiveFrom, " (Gross: \u20B9", currentStructure.grossSalary.toFixed(2), ")"] }))] }), _jsx("span", { className: "text-xs bg-emerald-50 text-emerald-700 font-semibold px-2 py-0.5 rounded-full border border-emerald-200", children: loading ? 'Refreshing...' : 'PostgreSQL NUMERIC Precision' })] }), _jsxs("form", { onSubmit: handleSaveSalaryStructure, className: "space-y-4 text-sm", children: [_jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-600 uppercase", children: "Calculation Basis *" }), _jsxs("select", { value: salaryForm.calculationBasis, onChange: (e) => setSalaryForm({ ...salaryForm, calculationBasis: e.target.value }), className: "w-full mt-1 px-3 py-2 border rounded-md", children: [_jsx("option", { value: SalaryCalculationBasis.MONTHLY, children: "Monthly Fixed" }), _jsx("option", { value: SalaryCalculationBasis.DAILY_WAGE, children: "Daily Wage" }), _jsx("option", { value: SalaryCalculationBasis.HOURLY, children: "Hourly" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-600 uppercase", children: "Effective From *" }), _jsx("input", { type: "date", required: true, value: salaryForm.effectiveFrom, onChange: (e) => setSalaryForm({ ...salaryForm, effectiveFrom: e.target.value }), className: "w-full mt-1 px-3 py-2 border rounded-md" })] })] }), _jsxs("div", { className: "border rounded-lg p-4 bg-gray-50 space-y-3", children: [_jsx("h4", { className: "font-bold text-xs uppercase text-gray-700", children: "Gross Earnings Components" }), _jsxs("div", { className: "grid grid-cols-2 sm:grid-cols-3 gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs text-gray-600", children: "Base Salary (\u20B9) *" }), _jsx("input", { type: "number", min: "0", step: "0.01", required: true, value: salaryForm.baseSalary, onChange: (e) => setSalaryForm({ ...salaryForm, baseSalary: parseFloat(e.target.value) || 0 }), className: "w-full mt-1 px-3 py-1.5 border rounded bg-white font-medium" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs text-gray-600", children: "HRA (\u20B9)" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: salaryForm.hra, onChange: (e) => setSalaryForm({ ...salaryForm, hra: parseFloat(e.target.value) || 0 }), className: "w-full mt-1 px-3 py-1.5 border rounded bg-white font-medium" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs text-gray-600", children: "Travel Allowance (\u20B9)" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: salaryForm.travelAllowance, onChange: (e) => setSalaryForm({ ...salaryForm, travelAllowance: parseFloat(e.target.value) || 0 }), className: "w-full mt-1 px-3 py-1.5 border rounded bg-white font-medium" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs text-gray-600", children: "Special Allowance (\u20B9)" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: salaryForm.specialAllowance, onChange: (e) => setSalaryForm({ ...salaryForm, specialAllowance: parseFloat(e.target.value) || 0 }), className: "w-full mt-1 px-3 py-1.5 border rounded bg-white font-medium" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs text-gray-600", children: "Medical Allowance (\u20B9)" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: salaryForm.medicalAllowance, onChange: (e) => setSalaryForm({ ...salaryForm, medicalAllowance: parseFloat(e.target.value) || 0 }), className: "w-full mt-1 px-3 py-1.5 border rounded bg-white font-medium" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs text-gray-600", children: "OT Hourly Rate (\u20B9)" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: salaryForm.overtimeHourlyRate, onChange: (e) => setSalaryForm({ ...salaryForm, overtimeHourlyRate: parseFloat(e.target.value) || 0 }), className: "w-full mt-1 px-3 py-1.5 border rounded bg-white font-medium" })] })] })] }), _jsxs("div", { className: "border rounded-lg p-4 bg-gray-50 space-y-3", children: [_jsx("h4", { className: "font-bold text-xs uppercase text-gray-700", children: "Deductions" }), _jsxs("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs text-gray-600", children: "Provident Fund (\u20B9)" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: salaryForm.providentFundEmployee, onChange: (e) => setSalaryForm({ ...salaryForm, providentFundEmployee: parseFloat(e.target.value) || 0 }), className: "w-full mt-1 px-3 py-1.5 border rounded bg-white font-medium" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs text-gray-600", children: "Professional Tax (\u20B9)" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: salaryForm.professionalTax, onChange: (e) => setSalaryForm({ ...salaryForm, professionalTax: parseFloat(e.target.value) || 0 }), className: "w-full mt-1 px-3 py-1.5 border rounded bg-white font-medium" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs text-gray-600", children: "TDS Tax (\u20B9)" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: salaryForm.tdsTax, onChange: (e) => setSalaryForm({ ...salaryForm, tdsTax: parseFloat(e.target.value) || 0 }), className: "w-full mt-1 px-3 py-1.5 border rounded bg-white font-medium" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs text-gray-600", children: "Other Deductions (\u20B9)" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: salaryForm.otherDeductions, onChange: (e) => setSalaryForm({ ...salaryForm, otherDeductions: parseFloat(e.target.value) || 0 }), className: "w-full mt-1 px-3 py-1.5 border rounded bg-white font-medium" })] })] })] }), _jsxs("div", { className: "bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex justify-between items-center", children: [_jsxs("div", { children: [_jsx("span", { className: "text-xs text-gray-600 block", children: "Gross Earnings:" }), _jsxs("span", { className: "text-base font-bold text-gray-900", children: ["\u20B9", computedGross.toFixed(2)] })] }), _jsxs("div", { children: [_jsx("span", { className: "text-xs text-gray-600 block", children: "Total Deductions:" }), _jsxs("span", { className: "text-base font-bold text-red-600", children: ["-\u20B9", computedDeductions.toFixed(2)] })] }), _jsxs("div", { className: "text-right", children: [_jsx("span", { className: "text-xs text-gray-600 block", children: "Estimated Net Salary:" }), _jsxs("span", { className: "text-xl font-extrabold text-emerald-700", children: ["\u20B9", computedNet.toFixed(2)] })] })] }), _jsx("div", { className: "flex justify-end pt-2", children: _jsx("button", { type: "submit", className: "px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-bold text-sm shadow", children: "\uD83D\uDCBE Save Compensation Structure" }) })] })] }), _jsxs("div", { className: "bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-4", children: [_jsxs("div", { className: "flex justify-between items-center border-b pb-3", children: [_jsx("h3", { className: "font-bold text-gray-800 text-base", children: "Employee Advances" }), _jsx("button", { onClick: () => setIsAdvanceModalOpen(true), className: "px-2.5 py-1 bg-emerald-600 text-white rounded text-xs font-semibold hover:bg-emerald-700 shadow", children: "\u2795 Request" })] }), _jsx("p", { className: "text-xs text-gray-500", children: "Dedicated employee loan tracking with monthly automatic payroll deduction." }), advances.length === 0 ? (_jsx("div", { className: "p-4 text-center text-gray-400 text-sm", children: "No active or pending advances." })) : (_jsx("div", { className: "space-y-3", children: advances.map((adv) => (_jsxs("div", { className: "p-3 border rounded-lg bg-gray-50 text-xs space-y-1", children: [_jsxs("div", { className: "flex justify-between items-center", children: [_jsx("span", { className: "font-mono font-bold text-emerald-800", children: adv.advanceNumber }), _jsx("span", { className: `px-1.5 py-0.5 rounded-full font-bold ${adv.status === EmployeeAdvanceStatus.ACTIVE
                                                        ? 'bg-blue-100 text-blue-800'
                                                        : adv.status === EmployeeAdvanceStatus.PENDING_APPROVAL
                                                            ? 'bg-yellow-100 text-yellow-800'
                                                            : 'bg-gray-200 text-gray-700'}`, children: adv.status })] }), _jsxs("div", { className: "flex justify-between text-gray-600", children: [_jsxs("span", { children: ["Principal: \u20B9", adv.amount.toFixed(2)] }), _jsxs("span", { className: "font-bold text-gray-900", children: ["Balance: \u20B9", adv.remainingBalance.toFixed(2)] })] }), _jsxs("div", { className: "text-gray-500", children: ["Installment: \u20B9", adv.monthlyInstallment.toFixed(2), "/mo"] }), _jsx("div", { className: "text-gray-500 italic truncate", children: adv.reason }), adv.status === EmployeeAdvanceStatus.PENDING_APPROVAL && (_jsx("div", { className: "pt-2 flex justify-end", children: _jsx("button", { onClick: () => handleApproveAdvance(adv.id), className: "px-2 py-1 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700", children: "Approve Advance" }) }))] }, adv.id))) }))] })] }), isAdvanceModalOpen && (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4", children: _jsxs("div", { className: "bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4", children: [_jsx("h3", { className: "font-bold text-gray-800 text-lg", children: "\uD83D\uDCB8 Request Employee Advance" }), _jsxs("form", { onSubmit: handleRequestAdvance, className: "space-y-3 text-sm", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-600 uppercase", children: "Advance Amount (\u20B9) *" }), _jsx("input", { type: "number", min: "100", step: "100", required: true, value: advanceForm.amount, onChange: (e) => setAdvanceForm({ ...advanceForm, amount: parseFloat(e.target.value) || 0 }), className: "w-full mt-1 px-3 py-2 border rounded-md" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-600 uppercase", children: "Monthly Installment (\u20B9) *" }), _jsx("input", { type: "number", min: "100", step: "100", required: true, value: advanceForm.monthlyInstallment, onChange: (e) => setAdvanceForm({ ...advanceForm, monthlyInstallment: parseFloat(e.target.value) || 0 }), className: "w-full mt-1 px-3 py-2 border rounded-md" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-600 uppercase", children: "Documented Reason *" }), _jsx("textarea", { required: true, rows: 2, placeholder: "Reason for advance...", value: advanceForm.reason, onChange: (e) => setAdvanceForm({ ...advanceForm, reason: e.target.value }), className: "w-full mt-1 px-3 py-2 border rounded-md" })] }), _jsxs("div", { className: "flex justify-end space-x-2 pt-2 border-t", children: [_jsx("button", { type: "button", onClick: () => setIsAdvanceModalOpen(false), className: "px-3 py-1.5 border rounded text-gray-600", children: "Cancel" }), _jsx("button", { type: "submit", className: "px-4 py-1.5 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700", children: "Submit Request" })] })] })] }) }))] }));
};
//# sourceMappingURL=SalaryManagement.js.map