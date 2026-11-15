import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { employeeApi } from '../../api/employeeApi.js';
import { PayrollRunStatus, } from '@dfarm/shared-types';
import { PayslipModal } from './PayslipModal.js';
export const PayrollDashboard = () => {
    const [runs, setRuns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    // Selected run for viewing payslips
    const [selectedRun, setSelectedRun] = useState(null);
    const [payslips, setPayslips] = useState([]);
    const [payslipsLoading, setPayslipsLoading] = useState(false);
    // Active payslip modal
    const [activePayslip, setActivePayslip] = useState(null);
    // Initiate modal state
    const [isInitiateModalOpen, setIsInitiateModalOpen] = useState(false);
    const [initiateForm, setInitiateForm] = useState({
        year: new Date().getFullYear(),
        month: new Date().getMonth() + 1,
        notes: '',
    });
    const fetchRuns = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await employeeApi.getPayrollRuns();
            setRuns(data);
            if (data.length > 0 && !selectedRun) {
                loadRunDetails(data[0].id);
            }
        }
        catch (err) {
            setError(err.message || 'Failed to fetch payroll runs');
        }
        finally {
            setLoading(false);
        }
    };
    const loadRunDetails = async (runId) => {
        setPayslipsLoading(true);
        try {
            const res = await employeeApi.getPayrollRunById(runId);
            setSelectedRun(res.run);
            setPayslips(res.payslips);
        }
        catch (err) {
            alert(err.message || 'Failed to load payroll run details');
        }
        finally {
            setPayslipsLoading(false);
        }
    };
    useEffect(() => {
        fetchRuns();
    }, []);
    const handleInitiateSubmit = async (e) => {
        e.preventDefault();
        try {
            const run = await employeeApi.initiatePayrollRun(initiateForm);
            setIsInitiateModalOpen(false);
            fetchRuns();
            loadRunDetails(run.id);
        }
        catch (err) {
            alert(err.message || 'Failed to initiate payroll run');
        }
    };
    const handleCalculate = async (runId) => {
        try {
            await employeeApi.calculatePayrollRun(runId);
            fetchRuns();
            loadRunDetails(runId);
        }
        catch (err) {
            alert(err.message || 'Calculation failed');
        }
    };
    const handleApprove = async (runId) => {
        try {
            await employeeApi.approvePayrollRun(runId, { action: 'APPROVE' });
            fetchRuns();
            loadRunDetails(runId);
        }
        catch (err) {
            alert(err.message || 'Approval failed (Maker-Checker self-approval rejected)');
        }
    };
    const handleFinalize = async (runId) => {
        try {
            await employeeApi.finalizePayrollRun(runId);
            fetchRuns();
            loadRunDetails(runId);
        }
        catch (err) {
            alert(err.message || 'Finalization failed');
        }
    };
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "clay-card rounded-3xl p-6 bg-white shadow-clay-card border border-white/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-black text-slate-800 tracking-tight", children: "\uD83D\uDCBC Payroll Engine & Settlement" }), _jsx("p", { className: "text-sm text-slate-500 font-medium", children: "Lifecycle: DRAFT \u2192 CALCULATING \u2192 UNDER_REVIEW \u2192 APPROVED \u2192 FINALIZED \u2192 PAID" })] }), _jsxs("button", { onClick: () => setIsInitiateModalOpen(true), className: "clay-btn-brand bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-bold px-5 py-2.5 rounded-xl shadow-clay-button flex items-center gap-2 text-xs tracking-wide active:scale-95 transition-all", children: [_jsx("span", { children: "\u2795" }), " Initiate Monthly Run"] })] }), error && (_jsx("div", { className: "p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold shadow-sm", children: error })), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-6", children: [_jsxs("div", { className: "clay-card rounded-3xl p-5 bg-white shadow-clay-card border border-white/80 space-y-3", children: [_jsx("h3", { className: "font-extrabold text-slate-700 text-xs uppercase tracking-wider", children: "Monthly Payroll Runs" }), loading ? (_jsxs("div", { className: "p-8 text-center text-slate-400 text-sm font-semibold space-y-2", children: [_jsx("div", { className: "w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" }), _jsx("div", { children: "Loading runs..." })] })) : runs.length === 0 ? (_jsx("div", { className: "p-8 text-center text-slate-400 text-sm font-semibold", children: "No payroll runs found." })) : (_jsx("div", { className: "space-y-2.5", children: runs.map((r) => {
                                    const isSelected = selectedRun?.id === r.id;
                                    return (_jsxs("div", { onClick: () => loadRunDetails(r.id), className: `p-4 rounded-2xl cursor-pointer transition-all duration-200 text-xs space-y-1.5 ${isSelected
                                            ? 'bg-gradient-to-r from-emerald-50 to-teal-50/60 border border-emerald-300 shadow-sm scale-[1.01]'
                                            : 'clay-card bg-[#F8FAFC] hover:bg-white border border-slate-200/80'}`, children: [_jsxs("div", { className: "flex justify-between items-center", children: [_jsx("span", { className: "font-extrabold text-slate-900 text-sm", children: new Date(r.year, r.month - 1).toLocaleString('default', { month: 'long', year: 'numeric' }) }), _jsx("span", { className: `px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${r.status === PayrollRunStatus.FINALIZED || r.status === PayrollRunStatus.PAID
                                                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                                            : r.status === PayrollRunStatus.APPROVED
                                                                ? 'bg-sky-100 text-sky-800 border border-sky-200'
                                                                : r.status === PayrollRunStatus.UNDER_REVIEW
                                                                    ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                                                    : 'bg-amber-100 text-amber-800 border border-amber-200'}`, children: r.status })] }), _jsxs("div", { className: "flex justify-between text-slate-600 font-medium", children: [_jsxs("span", { children: [r.totalEmployees, " Employees"] }), _jsxs("span", { className: "font-black text-emerald-700 text-sm", children: ["\u20B9", r.totalNetSalary.toFixed(2)] })] })] }, r.id));
                                }) }))] }), _jsx("div", { className: "lg:col-span-2 clay-card rounded-3xl p-6 sm:p-8 bg-white shadow-clay-card border border-white/80 space-y-6", children: selectedRun ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4", children: [_jsxs("div", { children: [_jsxs("h3", { className: "font-black text-slate-900 text-xl tracking-tight", children: ["Payroll Run: ", new Date(selectedRun.year, selectedRun.month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })] }), _jsxs("p", { className: "text-xs text-slate-500 font-medium", children: ["Period: ", selectedRun.periodStart, " to ", selectedRun.periodEnd] })] }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [(selectedRun.status === PayrollRunStatus.DRAFT || selectedRun.status === PayrollRunStatus.UNDER_REVIEW) && (_jsx("button", { onClick: () => handleCalculate(selectedRun.id), className: "clay-btn-brand px-4 py-2 bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-500 hover:to-blue-600 text-white rounded-xl font-bold text-xs shadow-clay-button active:scale-95 transition-all", children: "\u2699\uFE0F Calculate / Recalculate" })), selectedRun.status === PayrollRunStatus.UNDER_REVIEW && (_jsx("button", { onClick: () => handleApprove(selectedRun.id), className: "clay-btn-brand px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-700 hover:from-purple-500 hover:to-indigo-600 text-white rounded-xl font-bold text-xs shadow-clay-button active:scale-95 transition-all", children: "\u2713 Approve Run (Checker)" })), selectedRun.status === PayrollRunStatus.APPROVED && (_jsx("button", { onClick: () => handleFinalize(selectedRun.id), className: "clay-btn-brand px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white rounded-xl font-bold text-xs shadow-clay-button active:scale-95 transition-all", children: "\uD83D\uDD12 Finalize Payroll (Lock)" }))] })] }), _jsxs("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs", children: [_jsxs("div", { className: "clay-card p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200/80 shadow-sm", children: [_jsx("span", { className: "text-slate-500 block uppercase font-bold text-[10px]", children: "Gross Salary" }), _jsxs("span", { className: "font-black text-slate-900 text-base mt-1 block", children: ["\u20B9", selectedRun.totalGrossSalary.toFixed(2)] })] }), _jsxs("div", { className: "clay-card p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200/80 shadow-sm", children: [_jsx("span", { className: "text-slate-500 block uppercase font-bold text-[10px]", children: "Allowances" }), _jsxs("span", { className: "font-black text-slate-900 text-base mt-1 block", children: ["\u20B9", selectedRun.totalAllowances.toFixed(2)] })] }), _jsxs("div", { className: "clay-card p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200/80 shadow-sm", children: [_jsx("span", { className: "text-slate-500 block uppercase font-bold text-[10px]", children: "Deductions" }), _jsxs("span", { className: "font-black text-rose-600 text-base mt-1 block", children: ["-\u20B9", selectedRun.totalDeductions.toFixed(2)] })] }), _jsxs("div", { className: "clay-card p-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 shadow-sm", children: [_jsx("span", { className: "text-emerald-800 block font-extrabold text-[10px] uppercase", children: "Total Net Pay" }), _jsxs("span", { className: "font-black text-emerald-700 text-lg mt-1 block", children: ["\u20B9", selectedRun.totalNetSalary.toFixed(2)] })] })] }), _jsxs("div", { className: "space-y-3", children: [_jsx("h4", { className: "font-extrabold text-slate-800 text-xs uppercase tracking-wider", children: "Itemized Payslips" }), payslipsLoading ? (_jsxs("div", { className: "p-8 text-center text-slate-400 text-sm font-semibold space-y-2", children: [_jsx("div", { className: "w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" }), _jsx("div", { children: "Loading payslips..." })] })) : payslips.length === 0 ? (_jsx("div", { className: "p-8 text-center clay-inset rounded-2xl bg-slate-50 text-slate-500 text-xs font-semibold", children: "No payslips generated yet. Click \"Calculate\" to compute salaries." })) : (_jsx("div", { className: "overflow-x-auto rounded-2xl border border-slate-200/80 shadow-sm", children: _jsxs("table", { className: "w-full text-left text-xs", children: [_jsx("thead", { className: "bg-[#F8FAFC] border-b border-slate-200 text-slate-600 font-extrabold uppercase tracking-wider", children: _jsxs("tr", { children: [_jsx("th", { className: "px-3.5 py-3", children: "Employee" }), _jsx("th", { className: "px-3.5 py-3", children: "Days (P/A/L)" }), _jsx("th", { className: "px-3.5 py-3", children: "Gross Pay" }), _jsx("th", { className: "px-3.5 py-3", children: "Deductions" }), _jsx("th", { className: "px-3.5 py-3", children: "Net Salary" }), _jsx("th", { className: "px-3.5 py-3", children: "Status" }), _jsx("th", { className: "px-3.5 py-3 text-right", children: "Action" })] }) }), _jsx("tbody", { className: "divide-y divide-slate-100 bg-white", children: payslips.map((ps) => (_jsxs("tr", { className: "hover:bg-slate-50/80 transition-colors", children: [_jsxs("td", { className: "px-3.5 py-3 font-bold text-slate-900", children: [_jsx("div", { children: ps.employeeName }), _jsx("div", { className: "text-[10px] text-slate-400 font-mono font-bold", children: ps.employeeCode })] }), _jsxs("td", { className: "px-3.5 py-3 text-slate-700 font-medium", children: [ps.presentDays, "P / ", ps.absentDays, "A / ", ps.paidLeaveDays, "L"] }), _jsxs("td", { className: "px-3.5 py-3 font-bold text-slate-900", children: ["\u20B9", ps.grossEarnings.toFixed(2)] }), _jsxs("td", { className: "px-3.5 py-3 text-rose-600 font-bold", children: ["-\u20B9", ps.totalDeductions.toFixed(2)] }), _jsxs("td", { className: "px-3.5 py-3 font-black text-emerald-700", children: ["\u20B9", ps.netSalary.toFixed(2)] }), _jsx("td", { className: "px-3.5 py-3", children: _jsx("span", { className: `px-2.5 py-0.5 rounded-full font-extrabold text-[10px] ${ps.paymentStatus === 'PAID'
                                                                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                                                            : 'bg-amber-100 text-amber-800 border border-amber-200'}`, children: ps.paymentStatus }) }), _jsx("td", { className: "px-3.5 py-3 text-right", children: _jsx("button", { onClick: () => setActivePayslip(ps), className: "px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold shadow-sm active:scale-95 transition-all text-xs", children: "View Payslip" }) })] }, ps.id))) })] }) }))] })] })) : (_jsx("div", { className: "p-16 text-center text-slate-400 text-sm font-semibold", children: "Select a payroll run to view details" })) })] }), isInitiateModalOpen && (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200", children: _jsxs("div", { className: "clay-card bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4 border border-white", children: [_jsxs("div", { className: "flex justify-between items-center border-b pb-2", children: [_jsx("h3", { className: "font-black text-slate-800 text-lg", children: "\uD83D\uDCC5 Initiate Monthly Payroll Run" }), _jsx("button", { onClick: () => setIsInitiateModalOpen(false), className: "text-slate-400 hover:text-slate-600 font-bold text-xl", children: "\u00D7" })] }), _jsxs("form", { onSubmit: handleInitiateSubmit, className: "space-y-3.5 text-sm", children: [_jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1", children: "Year *" }), _jsx("input", { type: "number", min: "2020", max: "2100", required: true, value: initiateForm.year, onChange: (e) => setInitiateForm({ ...initiateForm, year: parseInt(e.target.value, 10) || 2026 }), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1", children: "Month (1-12) *" }), _jsx("input", { type: "number", min: "1", max: "12", required: true, value: initiateForm.month, onChange: (e) => setInitiateForm({ ...initiateForm, month: parseInt(e.target.value, 10) || 1 }), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1", children: "Notes" }), _jsx("textarea", { rows: 2, placeholder: "Optional run notes...", value: initiateForm.notes, onChange: (e) => setInitiateForm({ ...initiateForm, notes: e.target.value }), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" })] }), _jsxs("div", { className: "flex justify-end space-x-2 pt-3 border-t border-slate-100", children: [_jsx("button", { type: "button", onClick: () => setIsInitiateModalOpen(false), className: "px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700 active:scale-95 transition-all", children: "Cancel" }), _jsx("button", { type: "submit", className: "clay-btn-brand px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white rounded-xl font-extrabold text-xs shadow-clay-button active:scale-95 transition-all", children: "Initiate Run (DRAFT)" })] })] })] }) })), activePayslip && (_jsx(PayslipModal, { payslip: activePayslip, isOpen: Boolean(activePayslip), onClose: () => setActivePayslip(null), onPaymentSuccess: () => {
                    if (selectedRun)
                        loadRunDetails(selectedRun.id);
                } }))] }));
};
//# sourceMappingURL=PayrollDashboard.js.map