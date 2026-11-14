import React, { useState, useEffect } from 'react';
import { employeeApi } from '../../api/employeeApi.js';
import {
  type EmployeeLeave,
  type Employee,
  LeaveStatus,
  LeaveType,
} from '@dfarm/shared-types';

export const LeaveManagement: React.FC = () => {
  const [leaves, setLeaves] = useState<EmployeeLeave[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [applyForm, setApplyForm] = useState({
    employeeId: '',
    leaveType: LeaveType.CASUAL,
    startDate: new Date().toISOString().split('T')[0]!,
    endDate: new Date().toISOString().split('T')[0]!,
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
        setApplyForm((prev) => ({ ...prev, employeeId: eData.employees[0]!.id }));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load leaves');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaves();
  }, []);

  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await employeeApi.createLeave(applyForm);
      setIsApplyModalOpen(false);
      fetchLeaves();
    } catch (err: any) {
      alert(err.message || 'Failed to submit leave request');
    }
  };

  const handleApprove = async (id: string, status: LeaveStatus.APPROVED | LeaveStatus.REJECTED) => {
    try {
      await employeeApi.approveLeave(id, { status });
      fetchLeaves();
    } catch (err: any) {
      alert(err.message || 'Action failed');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h2 className="text-xl font-bold text-gray-800">🌴 Leave Applications & Approvals</h2>
          <p className="text-sm text-gray-500">Manage employee leave requests, allowances, and approval tracking</p>
        </div>
        <button
          onClick={() => setIsApplyModalOpen(true)}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-semibold text-sm shadow"
        >
          ➕ Request Leave
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      {/* Leaves List Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading leave requests...</div>
        ) : leaves.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No leave requests found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase text-xs">
                  <th className="p-3">Employee</th>
                  <th className="p-3">Leave Type</th>
                  <th className="p-3">Period</th>
                  <th className="p-3">Days</th>
                  <th className="p-3">Reason</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leaves.map((l) => (
                  <tr key={l.id} className="hover:bg-gray-50 transition">
                    <td className="p-3 font-semibold text-gray-900">
                      <div>{l.employeeName || 'Employee'}</div>
                      <div className="text-xs text-gray-400 font-mono">{l.employeeCode}</div>
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 text-xs bg-purple-50 text-purple-700 rounded-md font-medium">
                        {l.leaveType}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-gray-700">
                      {l.startDate} to {l.endDate}
                    </td>
                    <td className="p-3 font-semibold text-gray-800">
                      {l.daysCount}
                    </td>
                    <td className="p-3 text-xs text-gray-600 max-w-xs truncate">
                      {l.reason}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                        l.status === LeaveStatus.APPROVED
                          ? 'bg-green-100 text-green-800'
                          : l.status === LeaveStatus.PENDING
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {l.status}
                      </span>
                    </td>
                    <td className="p-3 text-right space-x-1">
                      {l.status === LeaveStatus.PENDING && (
                        <>
                          <button
                            onClick={() => handleApprove(l.id, LeaveStatus.APPROVED)}
                            className="px-2 py-1 text-xs bg-emerald-600 text-white rounded font-medium hover:bg-emerald-700"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleApprove(l.id, LeaveStatus.REJECTED)}
                            className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded font-medium hover:bg-red-200"
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Apply Leave Modal */}
      {isApplyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-bold text-gray-800 text-lg">📝 Request Employee Leave</h3>
            <form onSubmit={handleApplySubmit} className="space-y-3 text-sm">
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase">Employee *</label>
                <select
                  required
                  value={applyForm.employeeId}
                  onChange={(e) => setApplyForm({ ...applyForm, employeeId: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border rounded-md bg-white"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName} ({emp.employeeCode})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase">Leave Type *</label>
                <select
                  value={applyForm.leaveType}
                  onChange={(e) => setApplyForm({ ...applyForm, leaveType: e.target.value as LeaveType })}
                  className="w-full mt-1 px-3 py-2 border rounded-md bg-white"
                >
                  <option value={LeaveType.CASUAL}>Casual Leave</option>
                  <option value={LeaveType.SICK}>Sick Leave</option>
                  <option value={LeaveType.EARNED}>Earned Leave</option>
                  <option value={LeaveType.UNPAID}>Unpaid Leave</option>
                  <option value={LeaveType.MATERNITY}>Maternity Leave</option>
                  <option value={LeaveType.EMERGENCY}>Emergency Leave</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase">Start Date *</label>
                  <input
                    type="date"
                    required
                    value={applyForm.startDate}
                    onChange={(e) => setApplyForm({ ...applyForm, startDate: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase">End Date *</label>
                  <input
                    type="date"
                    required
                    value={applyForm.endDate}
                    onChange={(e) => setApplyForm({ ...applyForm, endDate: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase">Number of Days *</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  required
                  value={applyForm.daysCount}
                  onChange={(e) => setApplyForm({ ...applyForm, daysCount: parseFloat(e.target.value) || 1 })}
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase">Reason *</label>
                <textarea
                  required
                  rows={2}
                  value={applyForm.reason}
                  onChange={(e) => setApplyForm({ ...applyForm, reason: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsApplyModalOpen(false)}
                  className="px-3 py-1.5 border rounded text-gray-600 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 text-white rounded font-semibold text-sm hover:bg-emerald-700"
                >
                  Submit Application
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
