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
      <div className="clay-card rounded-3xl p-6 bg-white shadow-clay-card border border-white/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">🌴 Leave Applications & Approvals</h2>
          <p className="text-sm text-slate-500 font-medium">Manage employee leave requests, allowances, and approval tracking</p>
        </div>
        <button
          onClick={() => setIsApplyModalOpen(true)}
          className="clay-btn-brand bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-bold px-5 py-2.5 rounded-xl shadow-clay-button text-xs tracking-wide active:scale-95 transition-all flex items-center gap-2"
        >
          <span>➕</span> Request Leave
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold shadow-sm">
          {error}
        </div>
      )}

      {/* Leaves List Table */}
      <div className="clay-card rounded-2xl bg-white shadow-clay-card border border-white/80 overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-slate-400 text-sm font-semibold space-y-2">
            <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <div>Loading leave requests...</div>
          </div>
        ) : leaves.length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-sm font-semibold">No leave requests found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-slate-200 text-slate-600 font-extrabold uppercase text-xs tracking-wider">
                  <th className="px-4 py-3.5">Employee</th>
                  <th className="px-4 py-3.5">Leave Type</th>
                  <th className="px-4 py-3.5">Period</th>
                  <th className="px-4 py-3.5">Days</th>
                  <th className="px-4 py-3.5">Reason</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leaves.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3.5 font-bold text-slate-900">
                      <div>{l.employeeName || 'Employee'}</div>
                      <div className="text-xs text-slate-400 font-mono font-bold">{l.employeeCode}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="px-2.5 py-0.5 text-xs bg-purple-50 text-purple-700 rounded-md font-bold border border-purple-200">
                        {l.leaveType}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-700 font-medium">
                      {l.startDate} to {l.endDate}
                    </td>
                    <td className="px-4 py-3.5 font-black text-slate-900">
                      {l.daysCount}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-600 font-medium max-w-xs truncate">
                      {l.reason}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-block px-2.5 py-0.5 text-xs font-extrabold rounded-full ${
                        l.status === LeaveStatus.APPROVED
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : l.status === LeaveStatus.PENDING
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-rose-100 text-rose-800 border border-rose-200'
                      }`}>
                        {l.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right space-x-1.5">
                      {l.status === LeaveStatus.PENDING && (
                        <>
                          <button
                            onClick={() => handleApprove(l.id, LeaveStatus.APPROVED)}
                            className="px-3 py-1 text-xs bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 shadow-sm active:scale-95 transition-all"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleApprove(l.id, LeaveStatus.REJECTED)}
                            className="px-3 py-1 text-xs bg-rose-50 text-rose-700 rounded-xl font-bold hover:bg-rose-100 border border-rose-200 active:scale-95 transition-all"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="clay-card bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4 border border-white">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-black text-slate-800 text-lg">📝 Request Employee Leave</h3>
              <button
                onClick={() => setIsApplyModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleApplySubmit} className="space-y-3.5 text-sm">
              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Employee *</label>
                <select
                  required
                  value={applyForm.employeeId}
                  onChange={(e) => setApplyForm({ ...applyForm, employeeId: e.target.value })}
                  className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName} ({emp.employeeCode})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Leave Type *</label>
                <select
                  value={applyForm.leaveType}
                  onChange={(e) => setApplyForm({ ...applyForm, leaveType: e.target.value as LeaveType })}
                  className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
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
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Start Date *</label>
                  <input
                    type="date"
                    required
                    value={applyForm.startDate}
                    onChange={(e) => setApplyForm({ ...applyForm, startDate: e.target.value })}
                    className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">End Date *</label>
                  <input
                    type="date"
                    required
                    value={applyForm.endDate}
                    onChange={(e) => setApplyForm({ ...applyForm, endDate: e.target.value })}
                    className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Number of Days *</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  required
                  value={applyForm.daysCount}
                  onChange={(e) => setApplyForm({ ...applyForm, daysCount: parseFloat(e.target.value) || 1 })}
                  className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                />
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Reason *</label>
                <textarea
                  required
                  rows={2}
                  value={applyForm.reason}
                  onChange={(e) => setApplyForm({ ...applyForm, reason: e.target.value })}
                  className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsApplyModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700 active:scale-95 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="clay-btn-brand px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white rounded-xl font-extrabold text-xs shadow-clay-button active:scale-95 transition-all"
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
