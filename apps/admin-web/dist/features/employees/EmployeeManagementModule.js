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
    const tabs = [
        { id: 'employees', label: 'Employees', icon: '👥' },
        { id: 'attendance', label: 'Attendance & Shifts', icon: '⏱️' },
        { id: 'leaves', label: 'Leave Requests', icon: '🌴' },
        { id: 'salary', label: 'Salary & Advances', icon: '💰' },
        { id: 'payroll', label: 'Payroll Engine', icon: '💼' },
        { id: 'reports', label: 'Reports & Analytics', icon: '📊' },
    ];
    return (_jsxs("div", { className: "employee-management-module max-w-7xl mx-auto space-y-6", children: [_jsxs("div", { className: "clay-card rounded-3xl p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-[#0A1824] text-white shadow-clay-card relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-6", children: [_jsxs("div", { className: "relative z-10 max-w-2xl space-y-2", children: [_jsxs("div", { className: "inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold tracking-wider uppercase backdrop-blur-sm border border-indigo-400/30", children: [_jsx("span", { children: "\uD83D\uDC65" }), " Staff, HR & Payroll Administration"] }), _jsx("h1", { className: "text-2xl sm:text-3xl font-extrabold tracking-tight text-white drop-shadow-sm", children: "Workforce & Payroll Operations" }), _jsx("p", { className: "text-sm text-indigo-100/90 leading-relaxed", children: "Staff master directory, daily shift attendance, maker-checker leave approvals, salary structure templates, statutory deductions, and automated monthly payroll disbursement." })] }), _jsx("div", { className: "relative z-10 flex flex-wrap gap-2.5", children: _jsxs("div", { className: "inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 text-xs font-bold text-white shadow-sm", children: [_jsx("span", { children: "\uD83D\uDEE1\uFE0F" }), " Zero Plaintext Biometrics / Masked PII"] }) }), _jsx("div", { className: "absolute right-0 top-0 bottom-0 w-80 opacity-20 pointer-events-none bg-gradient-to-l from-indigo-500/30 to-transparent" })] }), _jsx("div", { className: "clay-inset p-1.5 rounded-2xl bg-[#EEF2F6] flex overflow-x-auto space-x-1.5 text-xs sm:text-sm font-bold scrollbar-thin", children: tabs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (_jsxs("button", { onClick: () => setActiveTab(tab.id), className: `flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all duration-200 whitespace-nowrap ${isActive
                            ? 'bg-white text-indigo-900 shadow-clay-card border border-white font-extrabold scale-[1.02]'
                            : 'text-slate-600 hover:text-indigo-900 hover:bg-white/60'}`, children: [_jsx("span", { children: tab.icon }), _jsx("span", { children: tab.label })] }, tab.id));
                }) }), _jsxs("div", { className: "tab-content", children: [activeTab === 'employees' && (_jsx(EmployeeList, { onSelectEmployeeForSalary: handleSelectEmployeeForSalary })), activeTab === 'attendance' && _jsx(AttendanceManagement, {}), activeTab === 'leaves' && _jsx(LeaveManagement, {}), activeTab === 'salary' && (_jsx(SalaryManagement, { initialEmployeeId: selectedEmployeeForSalary })), activeTab === 'payroll' && _jsx(PayrollDashboard, {}), activeTab === 'reports' && _jsx(PayrollReports, {})] })] }));
};
//# sourceMappingURL=EmployeeManagementModule.js.map