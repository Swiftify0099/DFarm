import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { employeeApi } from '../../api/employeeApi.js';
import { LeaveStatus, LeaveType, } from '@dfarm/shared-types';
export const LeaveManagement = () => {
    const [leaves, setLeaves] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
    const [applyForm, setApplyForm] = useState({
        employeeId: '',
        leaveType: LeaveType.CASUAL,
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        daysCount: 1,
        reason: '',
    });
    const fetchLeaves = async () => {
        setLoading(true);
        setError(null);
        try {
            const [lData, eData] = await Promise.all([
                employeeApi.getLeaves(),
                employeeApi.getEmployees({ limit: 100 }),
            ]);
            setLeaves(lData);
            setEmployees(eData.employees);
            if (eData.employees.length > 0 && !applyForm.employeeId) {
                setApplyForm((prev) => ({ ...prev, employeeId: eData.employees[0].id }));
            }
        }
        catch (err) {
            setError(err.message || 'Failed to load leaves');
        }
        finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        fetchLeaves();
    }, []);
    const handleApplySubmit = async (e) => {
        e.preventDefault();
        try {
            await employeeApi.createLeave(applyForm);
            setIsApplyModalOpen(false);
            fetchLeaves();
        }
        catch (err) {
            alert(err.message || 'Failed to submit leave request');
        }
    };
    const handleApprove = async (id, status) => {
        try {
            await employeeApi.approveLeave(id, { status });
            fetchLeaves();
        }
        catch (err) {
            alert(err.message || 'Action failed');
        }
    };
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "clay-card rounded-3xl p-6 bg-white shadow-clay-card border border-white/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-black text-slate-800 tracking-tight", children: "\uD83C\uDF34 Leave Applications & Approvals" }), _jsx("p", { className: "text-sm text-slate-500 font-medium", children: "Manage employee leave requests, allowances, and approval tracking" })] }), _jsxs("button", { onClick: () => setIsApplyModalOpen(true), className: "clay-btn-brand bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-bold px-5 py-2.5 rounded-xl shadow-clay-button text-xs tracking-wide active:scale-95 transition-all flex items-center gap-2", children: [_jsx("span", { children: "\u2795" }), " Request Leave"] })] }), error && (_jsx("div", { className: "p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold shadow-sm", children: error })), _jsx("div", { className: "clay-card rounded-2xl bg-white shadow-clay-card border border-white/80 overflow-hidden", children: loading ? (_jsxs("div", { className: "text-center py-16 text-slate-400 text-sm font-semibold space-y-2", children: [_jsx("div", { className: "w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" }), _jsx("div", { children: "Loading leave requests..." })] })) : leaves.length === 0 ? (_jsx("div", { className: "text-center py-16 text-slate-500 text-sm font-semibold", children: "No leave requests found." })) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-left border-collapse text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-[#F8FAFC] border-b border-slate-200 text-slate-600 font-extrabold uppercase text-xs tracking-wider", children: [_jsx("th", { className: "px-4 py-3.5", children: "Employee" }), _jsx("th", { className: "px-4 py-3.5", children: "Leave Type" }), _jsx("th", { className: "px-4 py-3.5", children: "Period" }), _jsx("th", { className: "px-4 py-3.5", children: "Days" }), _jsx("th", { className: "px-4 py-3.5", children: "Reason" }), _jsx("th", { className: "px-4 py-3.5", children: "Status" }), _jsx("th", { className: "px-4 py-3.5 text-right", children: "Actions" })] }) }), _jsx("tbody", { className: "divide-y divide-slate-100", children: leaves.map((l) => (_jsxs("tr", { className: "hover:bg-slate-50/80 transition-colors", children: [_jsxs("td", { className: "px-4 py-3.5 font-bold text-slate-900", children: [_jsx("div", { children: l.employeeName || 'Employee' }), _jsx("div", { className: "text-xs text-slate-400 font-mono font-bold", children: l.employeeCode })] }), _jsx("td", { className: "px-4 py-3.5", children: _jsx("span", { className: "px-2.5 py-0.5 text-xs bg-purple-50 text-purple-700 rounded-md font-bold border border-purple-200", children: l.leaveType }) }), _jsxs("td", { className: "px-4 py-3.5 text-xs text-slate-700 font-medium", children: [l.startDate, " to ", l.endDate] }), _jsx("td", { className: "px-4 py-3.5 font-black text-slate-900", children: l.daysCount }), _jsx("td", { className: "px-4 py-3.5 text-xs text-slate-600 font-medium max-w-xs truncate", children: l.reason }), _jsx("td", { className: "px-4 py-3.5", children: _jsx("span", { className: `inline-block px-2.5 py-0.5 text-xs font-extrabold rounded-full ${l.status === LeaveStatus.APPROVED
                                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                                    : l.status === LeaveStatus.PENDING
                                                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                                        : 'bg-rose-100 text-rose-800 border border-rose-200'}`, children: l.status }) }), _jsx("td", { className: "px-4 py-3.5 text-right space-x-1.5", children: l.status === LeaveStatus.PENDING && (_jsxs(_Fragment, { children: [_jsx("button", { onClick: () => handleApprove(l.id, LeaveStatus.APPROVED), className: "px-3 py-1 text-xs bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 shadow-sm active:scale-95 transition-all", children: "Approve" }), _jsx("button", { onClick: () => handleApprove(l.id, LeaveStatus.REJECTED), className: "px-3 py-1 text-xs bg-rose-50 text-rose-700 rounded-xl font-bold hover:bg-rose-100 border border-rose-200 active:scale-95 transition-all", children: "Reject" })] })) })] }, l.id))) })] }) })) }), isApplyModalOpen && (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200", children: _jsxs("div", { className: "clay-card bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4 border border-white", children: [_jsxs("div", { className: "flex justify-between items-center border-b pb-2", children: [_jsx("h3", { className: "font-black text-slate-800 text-lg", children: "\uD83D\uDCDD Request Employee Leave" }), _jsx("button", { onClick: () => setIsApplyModalOpen(false), className: "text-slate-400 hover:text-slate-600 font-bold text-xl", children: "\u00D7" })] }), _jsxs("form", { onSubmit: handleApplySubmit, className: "space-y-3.5 text-sm", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1", children: "Employee *" }), _jsx("select", { required: true, value: applyForm.employeeId, onChange: (e) => setApplyForm({ ...applyForm, employeeId: e.target.value }), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm", children: employees.map((emp) => (_jsxs("option", { value: emp.id, children: [emp.fullName, " (", emp.employeeCode, ")"] }, emp.id))) })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1", children: "Leave Type *" }), _jsxs("select", { value: applyForm.leaveType, onChange: (e) => setApplyForm({ ...applyForm, leaveType: e.target.value }), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm", children: [_jsx("option", { value: LeaveType.CASUAL, children: "Casual Leave" }), _jsx("option", { value: LeaveType.SICK, children: "Sick Leave" }), _jsx("option", { value: LeaveType.EARNED, children: "Earned Leave" }), _jsx("option", { value: LeaveType.UNPAID, children: "Unpaid Leave" }), _jsx("option", { value: LeaveType.MATERNITY, children: "Maternity Leave" }), _jsx("option", { value: LeaveType.EMERGENCY, children: "Emergency Leave" })] })] }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1", children: "Start Date *" }), _jsx("input", { type: "date", required: true, value: applyForm.startDate, onChange: (e) => setApplyForm({ ...applyForm, startDate: e.target.value }), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1", children: "End Date *" }), _jsx("input", { type: "date", required: true, value: applyForm.endDate, onChange: (e) => setApplyForm({ ...applyForm, endDate: e.target.value }), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1", children: "Number of Days *" }), _jsx("input", { type: "number", step: "0.5", min: "0.5", required: true, value: applyForm.daysCount, onChange: (e) => setApplyForm({ ...applyForm, daysCount: parseFloat(e.target.value) || 1 }), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1", children: "Reason *" }), _jsx("textarea", { required: true, rows: 2, value: applyForm.reason, onChange: (e) => setApplyForm({ ...applyForm, reason: e.target.value }), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" })] }), _jsxs("div", { className: "flex justify-end space-x-2 pt-3 border-t border-slate-100", children: [_jsx("button", { type: "button", onClick: () => setIsApplyModalOpen(false), className: "px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700 active:scale-95 transition-all", children: "Cancel" }), _jsx("button", { type: "submit", className: "clay-btn-brand px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white rounded-xl font-extrabold text-xs shadow-clay-button active:scale-95 transition-all", children: "Submit Application" })] })] })] }) }))] }));
};
//# sourceMappingURL=LeaveManagement.js.map