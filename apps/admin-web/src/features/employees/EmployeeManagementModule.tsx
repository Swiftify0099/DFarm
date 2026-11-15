import React, { useState } from 'react';
import { type EmployeeTab } from './types.js';
import { EmployeeList } from './EmployeeList.js';
import { AttendanceManagement } from './AttendanceManagement.js';
import { LeaveManagement } from './LeaveManagement.js';
import { SalaryManagement } from './SalaryManagement.js';
import { PayrollDashboard } from './PayrollDashboard.js';
import { PayrollReports } from './PayrollReports.js';

export const EmployeeManagementModule: React.FC = () => {
  const [activeTab, setActiveTab] = useState<EmployeeTab>('employees');
  const [selectedEmployeeForSalary, setSelectedEmployeeForSalary] = useState<string | null>(null);

  const handleSelectEmployeeForSalary = (empId: string) => {
    setSelectedEmployeeForSalary(empId);
    setActiveTab('salary');
  };

  const tabs: Array<{ id: EmployeeTab; label: string; icon: string }> = [
    { id: 'employees', label: 'Employees', icon: '👥' },
    { id: 'attendance', label: 'Attendance & Shifts', icon: '⏱️' },
    { id: 'leaves', label: 'Leave Requests', icon: '🌴' },
    { id: 'salary', label: 'Salary & Advances', icon: '💰' },
    { id: 'payroll', label: 'Payroll Engine', icon: '💼' },
    { id: 'reports', label: 'Reports & Analytics', icon: '📊' },
  ];

  return (
    <div className="employee-management-module max-w-7xl mx-auto space-y-6">
      {/* 3D Clay Feature Hero Banner */}
      <div className="clay-card rounded-3xl p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-[#0A1824] text-white shadow-clay-card relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="relative z-10 max-w-2xl space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold tracking-wider uppercase backdrop-blur-sm border border-indigo-400/30">
            <span>👥</span> Staff, HR & Payroll Administration
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white drop-shadow-sm">
            Workforce & Payroll Operations
          </h1>
          <p className="text-sm text-indigo-100/90 leading-relaxed">
            Staff master directory, daily shift attendance, maker-checker leave approvals, salary structure templates, statutory deductions, and automated monthly payroll disbursement.
          </p>
        </div>
        <div className="relative z-10 flex flex-wrap gap-2.5">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 text-xs font-bold text-white shadow-sm">
            <span>🛡️</span> Zero Plaintext Biometrics / Masked PII
          </div>
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-80 opacity-20 pointer-events-none bg-gradient-to-l from-indigo-500/30 to-transparent"></div>
      </div>

      {/* Module Navigation Tabs */}
      <div className="clay-inset p-1.5 rounded-2xl bg-[#EEF2F6] flex overflow-x-auto space-x-1.5 text-xs sm:text-sm font-bold scrollbar-thin">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all duration-200 whitespace-nowrap ${
                isActive
                  ? 'bg-white text-indigo-900 shadow-clay-card border border-white font-extrabold scale-[1.02]'
                  : 'text-slate-600 hover:text-indigo-900 hover:bg-white/60'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div className="tab-content">
        {activeTab === 'employees' && (
          <EmployeeList onSelectEmployeeForSalary={handleSelectEmployeeForSalary} />
        )}
        {activeTab === 'attendance' && <AttendanceManagement />}
        {activeTab === 'leaves' && <LeaveManagement />}
        {activeTab === 'salary' && (
          <SalaryManagement initialEmployeeId={selectedEmployeeForSalary} />
        )}
        {activeTab === 'payroll' && <PayrollDashboard />}
        {activeTab === 'reports' && <PayrollReports />}
      </div>
    </div>
  );
};
