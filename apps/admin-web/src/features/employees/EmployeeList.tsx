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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h2 className="text-xl font-bold text-gray-800">👥 Employee Directory</h2>
          <p className="text-sm text-gray-500">Manage registered staff, department assignments, and security roles</p>
        </div>
        <button
          onClick={() => setIsRegisterModalOpen(true)}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition font-semibold text-sm shadow flex items-center gap-2"
        >
          <span>➕</span> Register Employee
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
        <form onSubmit={handleSearchSubmit} className="md:col-span-2 flex gap-2">
          <input
            type="text"
            placeholder="Search by code, name, mobile..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border rounded-md text-sm focus:ring-1 focus:ring-emerald-500 bg-white"
          />
          <button
            type="submit"
            className="px-3 py-2 bg-gray-700 text-white text-sm rounded-md hover:bg-gray-800 font-semibold"
          >
            Search
          </button>
        </form>

        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className="px-3 py-2 border rounded-md text-sm bg-white"
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
          className="px-3 py-2 border rounded-md text-sm bg-white"
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
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      {/* Employees Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading employee records...</div>
        ) : employees.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No employees found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase text-xs">
                  <th className="p-3">Code</th>
                  <th className="p-3">Full Name</th>
                  <th className="p-3">Department & Role</th>
                  <th className="p-3">Contact</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-gray-50 transition">
                    <td className="p-3 font-mono font-semibold text-emerald-700">
                      {emp.employeeCode}
                    </td>
                    <td className="p-3">
                      <div className="font-semibold text-gray-900">{emp.fullName}</div>
                      <div className="text-xs text-gray-500">{emp.designation}</div>
                    </td>
                    <td className="p-3">
                      <div className="text-xs font-medium text-gray-700">{emp.department}</div>
                      {emp.role ? (
                        <span className="inline-block px-2 py-0.5 mt-0.5 text-xs font-semibold bg-purple-100 text-purple-700 rounded-full">
                          {emp.role}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Staff Account Only</span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="text-xs text-gray-800">{emp.mobileNumber}</div>
                      <div className="text-xs text-gray-400">{emp.email || '—'}</div>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                        emp.employmentStatus === EmploymentStatus.ACTIVE
                          ? 'bg-green-100 text-green-800'
                          : emp.employmentStatus === EmploymentStatus.SUSPENDED
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {emp.employmentStatus}
                      </span>
                    </td>
                    <td className="p-3 text-right space-x-2">
                      <button
                        onClick={() => setSelectedProfileId(emp.id)}
                        className="px-2.5 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded font-medium shadow-sm"
                      >
                        Profile
                      </button>
                      {onSelectEmployeeForSalary && (
                        <button
                          onClick={() => onSelectEmployeeForSalary(emp.id)}
                          className="px-2.5 py-1 text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded font-medium border border-emerald-200"
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
