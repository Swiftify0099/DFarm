import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { EmployeeList } from './EmployeeList.js';
import { AttendanceManagement } from './AttendanceManagement.js';
import { LeaveManagement } from './LeaveManagement.js';
import { SalaryManagement } from './SalaryManagement.js';
import { PayrollDashboard } from './PayrollDashboard.js';
import { PayrollReports } from './PayrollReports.js';
export const EmployeeManagementModule = () => {
    const [activeTab, setActiveTab] = useState('employees');
    const [selectedEmployeeForSalary, setSelectedEmployeeForSalary] = useState(null);
    const handleSelectEmployeeForSalary = (empId) => {
        setSelectedEmployeeForSalary(empId);
        setActiveTab('salary');
    };
    return (_jsxs("div", { className: "employee-management-module max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6", children: [_jsxs("div", { className: "flex border-b border-gray-200 overflow-x-auto space-x-2 pb-1 text-sm font-semibold", children: [_jsx("button", { onClick: () => setActiveTab('employees'), className: `px-4 py-2 rounded-t-lg transition whitespace-nowrap ${activeTab === 'employees'
                            ? 'bg-emerald-600 text-white shadow'
                            : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'}`, children: "\uD83D\uDC65 Employees" }), _jsx("button", { onClick: () => setActiveTab('attendance'), className: `px-4 py-2 rounded-t-lg transition whitespace-nowrap ${activeTab === 'attendance'
                            ? 'bg-emerald-600 text-white shadow'
                            : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'}`, children: "\u23F1\uFE0F Attendance & Shifts" }), _jsx("button", { onClick: () => setActiveTab('leaves'), className: `px-4 py-2 rounded-t-lg transition whitespace-nowrap ${activeTab === 'leaves'
                            ? 'bg-emerald-600 text-white shadow'
                            : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'}`, children: "\uD83C\uDF34 Leave Requests" }), _jsx("button", { onClick: () => setActiveTab('salary'), className: `px-4 py-2 rounded-t-lg transition whitespace-nowrap ${activeTab === 'salary'
                            ? 'bg-emerald-600 text-white shadow'
                            : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'}`, children: "\uD83D\uDCB0 Salary & Advances" }), _jsx("button", { onClick: () => setActiveTab('payroll'), className: `px-4 py-2 rounded-t-lg transition whitespace-nowrap ${activeTab === 'payroll'
                            ? 'bg-emerald-600 text-white shadow'
                            : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'}`, children: "\uD83D\uDCBC Payroll Engine" }), _jsx("button", { onClick: () => setActiveTab('reports'), className: `px-4 py-2 rounded-t-lg transition whitespace-nowrap ${activeTab === 'reports'
                            ? 'bg-emerald-600 text-white shadow'
                            : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'}`, children: "\uD83D\uDCCA Reports & Analytics" })] }), _jsxs("div", { className: "tab-content", children: [activeTab === 'employees' && (_jsx(EmployeeList, { onSelectEmployeeForSalary: handleSelectEmployeeForSalary })), activeTab === 'attendance' && _jsx(AttendanceManagement, {}), activeTab === 'leaves' && _jsx(LeaveManagement, {}), activeTab === 'salary' && (_jsx(SalaryManagement, { initialEmployeeId: selectedEmployeeForSalary })), activeTab === 'payroll' && _jsx(PayrollDashboard, {}), activeTab === 'reports' && _jsx(PayrollReports, {})] })] }));
};
//# sourceMappingURL=EmployeeManagementModule.js.map