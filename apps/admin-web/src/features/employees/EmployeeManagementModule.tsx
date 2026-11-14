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

  return (
    <div className="employee-management-module max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Module Navigation Tabs */}
      <div className="flex border-b border-gray-200 overflow-x-auto space-x-2 pb-1 text-sm font-semibold">
        <button
          onClick={() => setActiveTab('employees')}
          className={`px-4 py-2 rounded-t-lg transition whitespace-nowrap ${
            activeTab === 'employees'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'
          }`}
        >
          👥 Employees
        </button>
        <button
          onClick={() => setActiveTab('attendance')}
          className={`px-4 py-2 rounded-t-lg transition whitespace-nowrap ${
            activeTab === 'attendance'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'
          }`}
        >
          ⏱️ Attendance & Shifts
        </button>
        <button
          onClick={() => setActiveTab('leaves')}
          className={`px-4 py-2 rounded-t-lg transition whitespace-nowrap ${
            activeTab === 'leaves'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'
          }`}
        >
          🌴 Leave Requests
        </button>
        <button
          onClick={() => setActiveTab('salary')}
          className={`px-4 py-2 rounded-t-lg transition whitespace-nowrap ${
            activeTab === 'salary'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'
          }`}
        >
          💰 Salary & Advances
        </button>
        <button
          onClick={() => setActiveTab('payroll')}
          className={`px-4 py-2 rounded-t-lg transition whitespace-nowrap ${
            activeTab === 'payroll'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'
          }`}
        >
          💼 Payroll Engine
        </button>
        <button
          onClick={() => setActiveTab('reports')}
          className={`px-4 py-2 rounded-t-lg transition whitespace-nowrap ${
            activeTab === 'reports'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'
          }`}
        >
          📊 Reports & Analytics
        </button>
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
