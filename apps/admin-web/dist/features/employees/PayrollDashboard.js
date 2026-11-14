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
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-xl font-bold text-gray-800", children: "\uD83D\uDCBC Payroll Engine & Settlement" }), _jsx("p", { className: "text-sm text-gray-500", children: "Lifecycle: DRAFT \u2192 CALCULATING \u2192 UNDER_REVIEW \u2192 APPROVED \u2192 FINALIZED \u2192 PAID" })] }), _jsxs("button", { onClick: () => setIsInitiateModalOpen(true), className: "px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-semibold text-sm shadow flex items-center gap-2", children: [_jsx("span", { children: "\u2795" }), " Initiate Monthly Run"] })] }), error && (_jsx("div", { className: "p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg", children: error })), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-6", children: [_jsxs("div", { className: "bg-white p-4 rounded-xl shadow-sm border border-gray-200 space-y-3", children: [_jsx("h3", { className: "font-bold text-gray-800 text-sm uppercase", children: "Monthly Payroll Runs" }), loading ? (_jsx("div", { className: "p-4 text-center text-gray-400 text-sm", children: "Loading runs..." })) : runs.length === 0 ? (_jsx("div", { className: "p-4 text-center text-gray-400 text-sm", children: "No payroll runs found." })) : (_jsx("div", { className: "space-y-2", children: runs.map((r) => (_jsxs("div", { onClick: () => loadRunDetails(r.id), className: `p-3 border rounded-lg cursor-pointer transition text-xs space-y-1 ${selectedRun?.id === r.id
                                        ? 'border-emerald-600 bg-emerald-50'
                                        : 'hover:bg-gray-50'}`, children: [_jsxs("div", { className: "flex justify-between items-center", children: [_jsx("span", { className: "font-bold text-gray-900 text-sm", children: new Date(r.year, r.month - 1).toLocaleString('default', { month: 'long', year: 'numeric' }) }), _jsx("span", { className: `px-2 py-0.5 rounded-full font-bold ${r.status === PayrollRunStatus.FINALIZED || r.status === PayrollRunStatus.PAID
                                                        ? 'bg-green-100 text-green-800'
                                                        : r.status === PayrollRunStatus.APPROVED
                                                            ? 'bg-blue-100 text-blue-800'
                                                            : r.status === PayrollRunStatus.UNDER_REVIEW
                                                                ? 'bg-purple-100 text-purple-800'
                                                                : 'bg-yellow-100 text-yellow-800'}`, children: r.status })] }), _jsxs("div", { className: "flex justify-between text-gray-600", children: [_jsxs("span", { children: [r.totalEmployees, " Employees"] }), _jsxs("span", { className: "font-bold text-emerald-700", children: ["\u20B9", r.totalNetSalary.toFixed(2)] })] })] }, r.id))) }))] }), _jsx("div", { className: "lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-6", children: selectedRun ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b pb-4", children: [_jsxs("div", { children: [_jsxs("h3", { className: "font-bold text-gray-900 text-lg", children: ["Payroll Run: ", new Date(selectedRun.year, selectedRun.month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })] }), _jsxs("p", { className: "text-xs text-gray-500", children: ["Period: ", selectedRun.periodStart, " to ", selectedRun.periodEnd] })] }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [(selectedRun.status === PayrollRunStatus.DRAFT || selectedRun.status === PayrollRunStatus.UNDER_REVIEW) && (_jsx("button", { onClick: () => handleCalculate(selectedRun.id), className: "px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold text-xs shadow", children: "\u2699\uFE0F Calculate / Recalculate" })), selectedRun.status === PayrollRunStatus.UNDER_REVIEW && (_jsx("button", { onClick: () => handleApprove(selectedRun.id), className: "px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded font-bold text-xs shadow", children: "\u2713 Approve Run (Checker)" })), selectedRun.status === PayrollRunStatus.APPROVED && (_jsx("button", { onClick: () => handleFinalize(selectedRun.id), className: "px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-xs shadow", children: "\uD83D\uDD12 Finalize Payroll (Lock)" }))] })] }), _jsxs("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs", children: [_jsxs("div", { className: "p-3 border rounded-lg bg-gray-50", children: [_jsx("span", { className: "text-gray-500 block", children: "Gross Salary" }), _jsxs("span", { className: "font-bold text-gray-900 text-sm", children: ["\u20B9", selectedRun.totalGrossSalary.toFixed(2)] })] }), _jsxs("div", { className: "p-3 border rounded-lg bg-gray-50", children: [_jsx("span", { className: "text-gray-500 block", children: "Allowances" }), _jsxs("span", { className: "font-bold text-gray-900 text-sm", children: ["\u20B9", selectedRun.totalAllowances.toFixed(2)] })] }), _jsxs("div", { className: "p-3 border rounded-lg bg-gray-50", children: [_jsx("span", { className: "text-gray-500 block", children: "Deductions" }), _jsxs("span", { className: "font-bold text-red-600 text-sm", children: ["-\u20B9", selectedRun.totalDeductions.toFixed(2)] })] }), _jsxs("div", { className: "p-3 border rounded-lg bg-emerald-50 border-emerald-200", children: [_jsx("span", { className: "text-emerald-800 block font-semibold", children: "Total Net Pay" }), _jsxs("span", { className: "font-extrabold text-emerald-700 text-base", children: ["\u20B9", selectedRun.totalNetSalary.toFixed(2)] })] })] }), _jsxs("div", { className: "space-y-3", children: [_jsx("h4", { className: "font-bold text-gray-800 text-sm uppercase", children: "Itemized Payslips" }), payslipsLoading ? (_jsx("div", { className: "p-6 text-center text-gray-400 text-sm", children: "Loading payslips..." })) : payslips.length === 0 ? (_jsx("div", { className: "p-6 text-center text-gray-400 text-sm", children: "No payslips generated yet. Click \"Calculate\" to compute salaries." })) : (_jsx("div", { className: "overflow-x-auto border rounded-lg", children: _jsxs("table", { className: "w-full text-left text-xs", children: [_jsx("thead", { className: "bg-gray-50 border-b text-gray-600 font-semibold uppercase", children: _jsxs("tr", { children: [_jsx("th", { className: "p-2.5", children: "Employee" }), _jsx("th", { className: "p-2.5", children: "Days (P/A/L)" }), _jsx("th", { className: "p-2.5", children: "Gross Pay" }), _jsx("th", { className: "p-2.5", children: "Deductions" }), _jsx("th", { className: "p-2.5", children: "Net Salary" }), _jsx("th", { className: "p-2.5", children: "Status" }), _jsx("th", { className: "p-2.5 text-right", children: "Action" })] }) }), _jsx("tbody", { className: "divide-y divide-gray-100", children: payslips.map((ps) => (_jsxs("tr", { className: "hover:bg-gray-50", children: [_jsxs("td", { className: "p-2.5 font-semibold text-gray-900", children: [_jsx("div", { children: ps.employeeName }), _jsx("div", { className: "text-[10px] text-gray-400 font-mono", children: ps.employeeCode })] }), _jsxs("td", { className: "p-2.5", children: [ps.presentDays, "P / ", ps.absentDays, "A / ", ps.paidLeaveDays, "L"] }), _jsxs("td", { className: "p-2.5 font-medium", children: ["\u20B9", ps.grossEarnings.toFixed(2)] }), _jsxs("td", { className: "p-2.5 text-red-600 font-medium", children: ["-\u20B9", ps.totalDeductions.toFixed(2)] }), _jsxs("td", { className: "p-2.5 font-bold text-emerald-700", children: ["\u20B9", ps.netSalary.toFixed(2)] }), _jsx("td", { className: "p-2.5", children: _jsx("span", { className: `px-2 py-0.5 rounded-full font-bold text-[10px] ${ps.paymentStatus === 'PAID'
                                                                            ? 'bg-green-100 text-green-800'
                                                                            : 'bg-yellow-100 text-yellow-800'}`, children: ps.paymentStatus }) }), _jsx("td", { className: "p-2.5 text-right", children: _jsx("button", { onClick: () => setActivePayslip(ps), className: "px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded font-medium shadow-sm", children: "View Payslip" }) })] }, ps.id))) })] }) }))] })] })) : (_jsx("div", { className: "p-12 text-center text-gray-400 text-sm", children: "Select a payroll run to view details" })) })] }), isInitiateModalOpen && (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4", children: _jsxs("div", { className: "bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4", children: [_jsx("h3", { className: "font-bold text-gray-800 text-lg", children: "\uD83D\uDCC5 Initiate Monthly Payroll Run" }), _jsxs("form", { onSubmit: handleInitiateSubmit, className: "space-y-3 text-sm", children: [_jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-600 uppercase", children: "Year *" }), _jsx("input", { type: "number", min: "2020", max: "2100", required: true, value: initiateForm.year, onChange: (e) => setInitiateForm({ ...initiateForm, year: parseInt(e.target.value, 10) || 2026 }), className: "w-full mt-1 px-3 py-2 border rounded-md" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-600 uppercase", children: "Month (1-12) *" }), _jsx("input", { type: "number", min: "1", max: "12", required: true, value: initiateForm.month, onChange: (e) => setInitiateForm({ ...initiateForm, month: parseInt(e.target.value, 10) || 1 }), className: "w-full mt-1 px-3 py-2 border rounded-md" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-600 uppercase", children: "Notes" }), _jsx("textarea", { rows: 2, placeholder: "Optional run notes...", value: initiateForm.notes, onChange: (e) => setInitiateForm({ ...initiateForm, notes: e.target.value }), className: "w-full mt-1 px-3 py-2 border rounded-md" })] }), _jsxs("div", { className: "flex justify-end space-x-2 pt-2 border-t", children: [_jsx("button", { type: "button", onClick: () => setIsInitiateModalOpen(false), className: "px-3 py-1.5 border rounded text-gray-600 text-xs", children: "Cancel" }), _jsx("button", { type: "submit", className: "px-4 py-1.5 bg-emerald-600 text-white rounded font-bold text-xs hover:bg-emerald-700", children: "Initiate Run (DRAFT)" })] })] })] }) })), activePayslip && (_jsx(PayslipModal, { payslip: activePayslip, isOpen: Boolean(activePayslip), onClose: () => setActivePayslip(null), onPaymentSuccess: () => {
                    if (selectedRun)
                        loadRunDetails(selectedRun.id);
                } }))] }));
};
//# sourceMappingURL=PayrollDashboard.js.map