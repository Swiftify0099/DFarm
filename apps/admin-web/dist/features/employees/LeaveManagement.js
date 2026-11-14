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
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-xl font-bold text-gray-800", children: "\uD83C\uDF34 Leave Applications & Approvals" }), _jsx("p", { className: "text-sm text-gray-500", children: "Manage employee leave requests, allowances, and approval tracking" })] }), _jsx("button", { onClick: () => setIsApplyModalOpen(true), className: "px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-semibold text-sm shadow", children: "\u2795 Request Leave" })] }), error && (_jsx("div", { className: "p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg", children: error })), _jsx("div", { className: "bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden", children: loading ? (_jsx("div", { className: "p-8 text-center text-gray-500", children: "Loading leave requests..." })) : leaves.length === 0 ? (_jsx("div", { className: "p-8 text-center text-gray-500", children: "No leave requests found." })) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-left border-collapse text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase text-xs", children: [_jsx("th", { className: "p-3", children: "Employee" }), _jsx("th", { className: "p-3", children: "Leave Type" }), _jsx("th", { className: "p-3", children: "Period" }), _jsx("th", { className: "p-3", children: "Days" }), _jsx("th", { className: "p-3", children: "Reason" }), _jsx("th", { className: "p-3", children: "Status" }), _jsx("th", { className: "p-3 text-right", children: "Actions" })] }) }), _jsx("tbody", { className: "divide-y divide-gray-100", children: leaves.map((l) => (_jsxs("tr", { className: "hover:bg-gray-50 transition", children: [_jsxs("td", { className: "p-3 font-semibold text-gray-900", children: [_jsx("div", { children: l.employeeName || 'Employee' }), _jsx("div", { className: "text-xs text-gray-400 font-mono", children: l.employeeCode })] }), _jsx("td", { className: "p-3", children: _jsx("span", { className: "px-2 py-0.5 text-xs bg-purple-50 text-purple-700 rounded-md font-medium", children: l.leaveType }) }), _jsxs("td", { className: "p-3 text-xs text-gray-700", children: [l.startDate, " to ", l.endDate] }), _jsx("td", { className: "p-3 font-semibold text-gray-800", children: l.daysCount }), _jsx("td", { className: "p-3 text-xs text-gray-600 max-w-xs truncate", children: l.reason }), _jsx("td", { className: "p-3", children: _jsx("span", { className: `px-2 py-0.5 text-xs font-semibold rounded-full ${l.status === LeaveStatus.APPROVED
                                                    ? 'bg-green-100 text-green-800'
                                                    : l.status === LeaveStatus.PENDING
                                                        ? 'bg-yellow-100 text-yellow-800'
                                                        : 'bg-red-100 text-red-800'}`, children: l.status }) }), _jsx("td", { className: "p-3 text-right space-x-1", children: l.status === LeaveStatus.PENDING && (_jsxs(_Fragment, { children: [_jsx("button", { onClick: () => handleApprove(l.id, LeaveStatus.APPROVED), className: "px-2 py-1 text-xs bg-emerald-600 text-white rounded font-medium hover:bg-emerald-700", children: "Approve" }), _jsx("button", { onClick: () => handleApprove(l.id, LeaveStatus.REJECTED), className: "px-2 py-1 text-xs bg-red-100 text-red-700 rounded font-medium hover:bg-red-200", children: "Reject" })] })) })] }, l.id))) })] }) })) }), isApplyModalOpen && (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4", children: _jsxs("div", { className: "bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4", children: [_jsx("h3", { className: "font-bold text-gray-800 text-lg", children: "\uD83D\uDCDD Request Employee Leave" }), _jsxs("form", { onSubmit: handleApplySubmit, className: "space-y-3 text-sm", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-600 uppercase", children: "Employee *" }), _jsx("select", { required: true, value: applyForm.employeeId, onChange: (e) => setApplyForm({ ...applyForm, employeeId: e.target.value }), className: "w-full mt-1 px-3 py-2 border rounded-md bg-white", children: employees.map((emp) => (_jsxs("option", { value: emp.id, children: [emp.fullName, " (", emp.employeeCode, ")"] }, emp.id))) })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-600 uppercase", children: "Leave Type *" }), _jsxs("select", { value: applyForm.leaveType, onChange: (e) => setApplyForm({ ...applyForm, leaveType: e.target.value }), className: "w-full mt-1 px-3 py-2 border rounded-md bg-white", children: [_jsx("option", { value: LeaveType.CASUAL, children: "Casual Leave" }), _jsx("option", { value: LeaveType.SICK, children: "Sick Leave" }), _jsx("option", { value: LeaveType.EARNED, children: "Earned Leave" }), _jsx("option", { value: LeaveType.UNPAID, children: "Unpaid Leave" }), _jsx("option", { value: LeaveType.MATERNITY, children: "Maternity Leave" }), _jsx("option", { value: LeaveType.EMERGENCY, children: "Emergency Leave" })] })] }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-600 uppercase", children: "Start Date *" }), _jsx("input", { type: "date", required: true, value: applyForm.startDate, onChange: (e) => setApplyForm({ ...applyForm, startDate: e.target.value }), className: "w-full mt-1 px-3 py-2 border rounded-md" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-600 uppercase", children: "End Date *" }), _jsx("input", { type: "date", required: true, value: applyForm.endDate, onChange: (e) => setApplyForm({ ...applyForm, endDate: e.target.value }), className: "w-full mt-1 px-3 py-2 border rounded-md" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-600 uppercase", children: "Number of Days *" }), _jsx("input", { type: "number", step: "0.5", min: "0.5", required: true, value: applyForm.daysCount, onChange: (e) => setApplyForm({ ...applyForm, daysCount: parseFloat(e.target.value) || 1 }), className: "w-full mt-1 px-3 py-2 border rounded-md" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-600 uppercase", children: "Reason *" }), _jsx("textarea", { required: true, rows: 2, value: applyForm.reason, onChange: (e) => setApplyForm({ ...applyForm, reason: e.target.value }), className: "w-full mt-1 px-3 py-2 border rounded-md" })] }), _jsxs("div", { className: "flex justify-end space-x-2 pt-3 border-t", children: [_jsx("button", { type: "button", onClick: () => setIsApplyModalOpen(false), className: "px-3 py-1.5 border rounded text-gray-600 text-sm", children: "Cancel" }), _jsx("button", { type: "submit", className: "px-4 py-1.5 bg-emerald-600 text-white rounded font-semibold text-sm hover:bg-emerald-700", children: "Submit Application" })] })] })] }) }))] }));
};
//# sourceMappingURL=LeaveManagement.js.map