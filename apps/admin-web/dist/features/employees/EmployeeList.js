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
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-xl font-bold text-gray-800", children: "\uD83D\uDC65 Employee Directory" }), _jsx("p", { className: "text-sm text-gray-500", children: "Manage registered staff, department assignments, and security roles" })] }), _jsxs("button", { onClick: () => setIsRegisterModalOpen(true), className: "px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition font-semibold text-sm shadow flex items-center gap-2", children: [_jsx("span", { children: "\u2795" }), " Register Employee"] })] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-4 gap-3 bg-gray-50 p-3 rounded-lg border border-gray-200", children: [_jsxs("form", { onSubmit: handleSearchSubmit, className: "md:col-span-2 flex gap-2", children: [_jsx("input", { type: "text", placeholder: "Search by code, name, mobile...", value: searchTerm, onChange: (e) => setSearchTerm(e.target.value), className: "w-full px-3 py-2 border rounded-md text-sm focus:ring-1 focus:ring-emerald-500 bg-white" }), _jsx("button", { type: "submit", className: "px-3 py-2 bg-gray-700 text-white text-sm rounded-md hover:bg-gray-800 font-semibold", children: "Search" })] }), _jsxs("select", { value: departmentFilter, onChange: (e) => setDepartmentFilter(e.target.value), className: "px-3 py-2 border rounded-md text-sm bg-white", children: [_jsx("option", { value: "", children: "All Departments" }), _jsx("option", { value: "OPERATIONS", children: "Operations" }), _jsx("option", { value: "FINANCE", children: "Finance" }), _jsx("option", { value: "PROCUREMENT", children: "Procurement" }), _jsx("option", { value: "ADMIN", children: "Administration" }), _jsx("option", { value: "MANAGEMENT", children: "Management" }), _jsx("option", { value: "LOGISTICS", children: "Logistics" })] }), _jsxs("select", { value: statusFilter, onChange: (e) => setStatusFilter(e.target.value), className: "px-3 py-2 border rounded-md text-sm bg-white", children: [_jsx("option", { value: "", children: "All Statuses" }), _jsx("option", { value: EmploymentStatus.ACTIVE, children: "Active" }), _jsx("option", { value: EmploymentStatus.INACTIVE, children: "Inactive" }), _jsx("option", { value: EmploymentStatus.SUSPENDED, children: "Suspended" }), _jsx("option", { value: EmploymentStatus.RESIGNED, children: "Resigned" }), _jsx("option", { value: EmploymentStatus.TERMINATED, children: "Terminated" })] })] }), error && (_jsx("div", { className: "p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg", children: error })), _jsx("div", { className: "bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden", children: loading ? (_jsx("div", { className: "p-8 text-center text-gray-500", children: "Loading employee records..." })) : employees.length === 0 ? (_jsx("div", { className: "p-8 text-center text-gray-500", children: "No employees found." })) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-left border-collapse text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase text-xs", children: [_jsx("th", { className: "p-3", children: "Code" }), _jsx("th", { className: "p-3", children: "Full Name" }), _jsx("th", { className: "p-3", children: "Department & Role" }), _jsx("th", { className: "p-3", children: "Contact" }), _jsx("th", { className: "p-3", children: "Status" }), _jsx("th", { className: "p-3 text-right", children: "Actions" })] }) }), _jsx("tbody", { className: "divide-y divide-gray-100", children: employees.map((emp) => (_jsxs("tr", { className: "hover:bg-gray-50 transition", children: [_jsx("td", { className: "p-3 font-mono font-semibold text-emerald-700", children: emp.employeeCode }), _jsxs("td", { className: "p-3", children: [_jsx("div", { className: "font-semibold text-gray-900", children: emp.fullName }), _jsx("div", { className: "text-xs text-gray-500", children: emp.designation })] }), _jsxs("td", { className: "p-3", children: [_jsx("div", { className: "text-xs font-medium text-gray-700", children: emp.department }), emp.role ? (_jsx("span", { className: "inline-block px-2 py-0.5 mt-0.5 text-xs font-semibold bg-purple-100 text-purple-700 rounded-full", children: emp.role })) : (_jsx("span", { className: "text-xs text-gray-400", children: "Staff Account Only" }))] }), _jsxs("td", { className: "p-3", children: [_jsx("div", { className: "text-xs text-gray-800", children: emp.mobileNumber }), _jsx("div", { className: "text-xs text-gray-400", children: emp.email || '—' })] }), _jsx("td", { className: "p-3", children: _jsx("span", { className: `px-2 py-0.5 text-xs font-semibold rounded-full ${emp.employmentStatus === EmploymentStatus.ACTIVE
                                                    ? 'bg-green-100 text-green-800'
                                                    : emp.employmentStatus === EmploymentStatus.SUSPENDED
                                                        ? 'bg-red-100 text-red-800'
                                                        : 'bg-gray-100 text-gray-700'}`, children: emp.employmentStatus }) }), _jsxs("td", { className: "p-3 text-right space-x-2", children: [_jsx("button", { onClick: () => setSelectedProfileId(emp.id), className: "px-2.5 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded font-medium shadow-sm", children: "Profile" }), onSelectEmployeeForSalary && (_jsx("button", { onClick: () => onSelectEmployeeForSalary(emp.id), className: "px-2.5 py-1 text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded font-medium border border-emerald-200", children: "Salary Structure" }))] })] }, emp.id))) })] }) })) }), _jsx(EmployeeRegistrationModal, { isOpen: isRegisterModalOpen, onClose: () => setIsRegisterModalOpen(false), onSuccess: () => fetchEmployees() }), selectedProfileId && (_jsx(EmployeeProfile, { employeeId: selectedProfileId, isOpen: Boolean(selectedProfileId), onClose: () => setSelectedProfileId(null), onRoleAssigned: () => fetchEmployees() }))] }));
};
//# sourceMappingURL=EmployeeList.js.map