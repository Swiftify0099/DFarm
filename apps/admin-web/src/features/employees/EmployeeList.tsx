import React, { useState, useEffect } from 'react';
import { employeeApi } from '../../api/employeeApi.js';
import { type Employee, EmploymentStatus } from '@dfarm/shared-types';
import { EmployeeRegistrationModal } from './EmployeeRegistrationModal.js';
import { EmployeeProfile } from './EmployeeProfile.js';

interface EmployeeListProps {
  onSelectEmployeeForSalary?: (employeeId: string) => void;
}

export const EmployeeList: React.FC<EmployeeListProps> = ({ onSelectEmployeeForSalary }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<EmploymentStatus | ''>('');

  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

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
    } catch (err: any) {
      setError(err.message || 'Failed to load employees');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, [departmentFilter, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchEmployees();
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="clay-card rounded-3xl p-6 bg-white shadow-clay-card border border-white/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">👥 Employee Directory</h2>
          <p className="text-sm text-slate-500 font-medium">Manage registered staff, department assignments, and security roles</p>
        </div>
        <button
          onClick={() => setIsRegisterModalOpen(true)}
          className="clay-btn-brand bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-bold px-5 py-2.5 rounded-xl shadow-clay-button flex items-center gap-2 text-xs tracking-wide active:scale-95 transition-all"
        >
          <span>➕</span> Register Employee
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="clay-inset p-4 rounded-2xl bg-[#EEF2F6] border border-[#CBD5E1]/50 grid grid-cols-1 md:grid-cols-4 gap-3">
        <form onSubmit={handleSearchSubmit} className="md:col-span-2 flex gap-2">
          <input
            type="text"
            placeholder="Search by code, name, mobile..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
          />
          <button
            type="submit"
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl shadow-sm active:scale-95 transition-all"
          >
            Search
          </button>
        </form>

        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className="clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
        >
          <option value="">All Departments</option>
          <option value="OPERATIONS">Operations</option>
          <option value="FINANCE">Finance</option>
          <option value="PROCUREMENT">Procurement</option>
          <option value="ADMIN">Administration</option>
          <option value="MANAGEMENT">Management</option>
          <option value="LOGISTICS">Logistics</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as EmploymentStatus)}
          className="clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
        >
          <option value="">All Statuses</option>
          <option value={EmploymentStatus.ACTIVE}>Active</option>
          <option value={EmploymentStatus.INACTIVE}>Inactive</option>
          <option value={EmploymentStatus.SUSPENDED}>Suspended</option>
          <option value={EmploymentStatus.RESIGNED}>Resigned</option>
          <option value={EmploymentStatus.TERMINATED}>Terminated</option>
        </select>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold shadow-sm">
          {error}
        </div>
      )}

      {/* Employees Table */}
      <div className="clay-card rounded-2xl bg-white shadow-clay-card border border-white/80 overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-slate-400 text-sm font-semibold space-y-2">
            <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <div>Loading employee records...</div>
          </div>
        ) : employees.length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-sm font-semibold">No employees found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-slate-200 text-slate-600 font-extrabold uppercase text-xs tracking-wider">
                  <th className="px-4 py-3.5">Code</th>
                  <th className="px-4 py-3.5">Full Name</th>
                  <th className="px-4 py-3.5">Department & Role</th>
                  <th className="px-4 py-3.5">Contact</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3.5 font-mono font-bold text-emerald-700 bg-slate-50/50">
                      {emp.employeeCode}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-extrabold text-slate-900">{emp.fullName}</div>
                      <div className="text-xs text-slate-500 font-medium">{emp.designation}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-xs font-bold text-slate-700">{emp.department}</div>
                      {emp.role ? (
                        <span className="inline-block px-2.5 py-0.5 mt-0.5 text-xs font-bold bg-purple-100 text-purple-700 rounded-full border border-purple-200">
                          {emp.role}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 font-medium">Staff Account Only</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-xs font-bold text-slate-800">{emp.mobileNumber}</div>
                      <div className="text-xs text-slate-400 font-mono">{emp.email || '—'}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-block px-2.5 py-0.5 text-xs font-extrabold rounded-full ${
                        emp.employmentStatus === EmploymentStatus.ACTIVE
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : emp.employmentStatus === EmploymentStatus.SUSPENDED
                          ? 'bg-rose-100 text-rose-800 border border-rose-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}>
                        {emp.employmentStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right space-x-2">
                      <button
                        onClick={() => setSelectedProfileId(emp.id)}
                        className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold shadow-sm active:scale-95 transition-all"
                      >
                        Profile
                      </button>
                      {onSelectEmployeeForSalary && (
                        <button
                          onClick={() => onSelectEmployeeForSalary(emp.id)}
                          className="px-3 py-1.5 text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl font-bold border border-emerald-200 active:scale-95 transition-all"
                        >
                          Salary Structure
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Registration Modal */}
      <EmployeeRegistrationModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        onSuccess={() => fetchEmployees()}
      />

      {/* Profile Modal */}
      {selectedProfileId && (
        <EmployeeProfile
          employeeId={selectedProfileId}
          isOpen={Boolean(selectedProfileId)}
          onClose={() => setSelectedProfileId(null)}
          onRoleAssigned={() => fetchEmployees()}
        />
      )}
    </div>
  );
};
