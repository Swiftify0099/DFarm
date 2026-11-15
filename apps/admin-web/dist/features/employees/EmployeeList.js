import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { employeeApi } from '../../api/employeeApi.js';
import { EmploymentStatus } from '@dfarm/shared-types';
import { EmployeeRegistrationModal } from './EmployeeRegistrationModal.js';
import { EmployeeProfile } from './EmployeeProfile.js';
export const EmployeeList = ({ onSelectEmployeeForSalary }) => {
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
    const [selectedProfileId, setSelectedProfileId] = useState(null);
    const fetchEmployees = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await employeeApi.getEmployees({
                department: departmentFilter || undefined,
                status: statusFilter || undefined,
                search: searchTerm || undefined,
            });
            setEmployees(data.employees);
        }
        catch (err) {
            setError(err.message || 'Failed to load employees');
        }
        finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        fetchEmployees();
    }, [departmentFilter, statusFilter]);
    const handleSearchSubmit = (e) => {
        e.preventDefault();
        fetchEmployees();
    };
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "clay-card rounded-3xl p-6 bg-white shadow-clay-card border border-white/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-black text-slate-800 tracking-tight", children: "\uD83D\uDC65 Employee Directory" }), _jsx("p", { className: "text-sm text-slate-500 font-medium", children: "Manage registered staff, department assignments, and security roles" })] }), _jsxs("button", { onClick: () => setIsRegisterModalOpen(true), className: "clay-btn-brand bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-bold px-5 py-2.5 rounded-xl shadow-clay-button flex items-center gap-2 text-xs tracking-wide active:scale-95 transition-all", children: [_jsx("span", { children: "\u2795" }), " Register Employee"] })] }), _jsxs("div", { className: "clay-inset p-4 rounded-2xl bg-[#EEF2F6] border border-[#CBD5E1]/50 grid grid-cols-1 md:grid-cols-4 gap-3", children: [_jsxs("form", { onSubmit: handleSearchSubmit, className: "md:col-span-2 flex gap-2", children: [_jsx("input", { type: "text", placeholder: "Search by code, name, mobile...", value: searchTerm, onChange: (e) => setSearchTerm(e.target.value), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" }), _jsx("button", { type: "submit", className: "px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl shadow-sm active:scale-95 transition-all", children: "Search" })] }), _jsxs("select", { value: departmentFilter, onChange: (e) => setDepartmentFilter(e.target.value), className: "clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm", children: [_jsx("option", { value: "", children: "All Departments" }), _jsx("option", { value: "OPERATIONS", children: "Operations" }), _jsx("option", { value: "FINANCE", children: "Finance" }), _jsx("option", { value: "PROCUREMENT", children: "Procurement" }), _jsx("option", { value: "ADMIN", children: "Administration" }), _jsx("option", { value: "MANAGEMENT", children: "Management" }), _jsx("option", { value: "LOGISTICS", children: "Logistics" })] }), _jsxs("select", { value: statusFilter, onChange: (e) => setStatusFilter(e.target.value), className: "clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm", children: [_jsx("option", { value: "", children: "All Statuses" }), _jsx("option", { value: EmploymentStatus.ACTIVE, children: "Active" }), _jsx("option", { value: EmploymentStatus.INACTIVE, children: "Inactive" }), _jsx("option", { value: EmploymentStatus.SUSPENDED, children: "Suspended" }), _jsx("option", { value: EmploymentStatus.RESIGNED, children: "Resigned" }), _jsx("option", { value: EmploymentStatus.TERMINATED, children: "Terminated" })] })] }), error && (_jsx("div", { className: "p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold shadow-sm", children: error })), _jsx("div", { className: "clay-card rounded-2xl bg-white shadow-clay-card border border-white/80 overflow-hidden", children: loading ? (_jsxs("div", { className: "text-center py-16 text-slate-400 text-sm font-semibold space-y-2", children: [_jsx("div", { className: "w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" }), _jsx("div", { children: "Loading employee records..." })] })) : employees.length === 0 ? (_jsx("div", { className: "text-center py-16 text-slate-500 text-sm font-semibold", children: "No employees found." })) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-left border-collapse text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-[#F8FAFC] border-b border-slate-200 text-slate-600 font-extrabold uppercase text-xs tracking-wider", children: [_jsx("th", { className: "px-4 py-3.5", children: "Code" }), _jsx("th", { className: "px-4 py-3.5", children: "Full Name" }), _jsx("th", { className: "px-4 py-3.5", children: "Department & Role" }), _jsx("th", { className: "px-4 py-3.5", children: "Contact" }), _jsx("th", { className: "px-4 py-3.5", children: "Status" }), _jsx("th", { className: "px-4 py-3.5 text-right", children: "Actions" })] }) }), _jsx("tbody", { className: "divide-y divide-slate-100", children: employees.map((emp) => (_jsxs("tr", { className: "hover:bg-slate-50/80 transition-colors", children: [_jsx("td", { className: "px-4 py-3.5 font-mono font-bold text-emerald-700 bg-slate-50/50", children: emp.employeeCode }), _jsxs("td", { className: "px-4 py-3.5", children: [_jsx("div", { className: "font-extrabold text-slate-900", children: emp.fullName }), _jsx("div", { className: "text-xs text-slate-500 font-medium", children: emp.designation })] }), _jsxs("td", { className: "px-4 py-3.5", children: [_jsx("div", { className: "text-xs font-bold text-slate-700", children: emp.department }), emp.role ? (_jsx("span", { className: "inline-block px-2.5 py-0.5 mt-0.5 text-xs font-bold bg-purple-100 text-purple-700 rounded-full border border-purple-200", children: emp.role })) : (_jsx("span", { className: "text-xs text-slate-400 font-medium", children: "Staff Account Only" }))] }), _jsxs("td", { className: "px-4 py-3.5", children: [_jsx("div", { className: "text-xs font-bold text-slate-800", children: emp.mobileNumber }), _jsx("div", { className: "text-xs text-slate-400 font-mono", children: emp.email || '—' })] }), _jsx("td", { className: "px-4 py-3.5", children: _jsx("span", { className: `inline-block px-2.5 py-0.5 text-xs font-extrabold rounded-full ${emp.employmentStatus === EmploymentStatus.ACTIVE
                                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                                    : emp.employmentStatus === EmploymentStatus.SUSPENDED
                                                        ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                                        : 'bg-slate-100 text-slate-700 border border-slate-200'}`, children: emp.employmentStatus }) }), _jsxs("td", { className: "px-4 py-3.5 text-right space-x-2", children: [_jsx("button", { onClick: () => setSelectedProfileId(emp.id), className: "px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold shadow-sm active:scale-95 transition-all", children: "Profile" }), onSelectEmployeeForSalary && (_jsx("button", { onClick: () => onSelectEmployeeForSalary(emp.id), className: "px-3 py-1.5 text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl font-bold border border-emerald-200 active:scale-95 transition-all", children: "Salary Structure" }))] })] }, emp.id))) })] }) })) }), _jsx(EmployeeRegistrationModal, { isOpen: isRegisterModalOpen, onClose: () => setIsRegisterModalOpen(false), onSuccess: () => fetchEmployees() }), selectedProfileId && (_jsx(EmployeeProfile, { employeeId: selectedProfileId, isOpen: Boolean(selectedProfileId), onClose: () => setSelectedProfileId(null), onRoleAssigned: () => fetchEmployees() }))] }));
};
//# sourceMappingURL=EmployeeList.js.map