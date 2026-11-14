import React, { useState, useEffect } from 'react';
import { employeeApi } from '../../api/employeeApi.js';
import {
  type PayrollRun,
  type EmployeePayslip,
  PayrollRunStatus,
} from '@dfarm/shared-types';
import { PayslipModal } from './PayslipModal.js';

export const PayrollDashboard: React.FC = () => {
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected run for viewing payslips
  const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null);
  const [payslips, setPayslips] = useState<EmployeePayslip[]>([]);
  const [payslipsLoading, setPayslipsLoading] = useState(false);

  // Active payslip modal
  const [activePayslip, setActivePayslip] = useState<EmployeePayslip | null>(null);

  // Initiate modal state
  const [isInitiateModalOpen, setIsInitiateModalOpen] = useState(false);
  const [initiateForm, setInitiateForm] = useState({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    notes: '',
  });

  const fetchRuns = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await employeeApi.getPayrollRuns();
      setRuns(data);
      if (data.length > 0 && !selectedRun) {
        loadRunDetails(data[0]!.id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch payroll runs');
    } finally {
      setLoading(false);
    }
  };

  const loadRunDetails = async (runId: string) => {
    setPayslipsLoading(true);
    try {
      const res = await employeeApi.getPayrollRunById(runId);
      setSelectedRun(res.run);
      setPayslips(res.payslips);
    } catch (err: any) {
      alert(err.message || 'Failed to load payroll run details');
    } finally {
      setPayslipsLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, []);

  const handleInitiateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const run = await employeeApi.initiatePayrollRun(initiateForm);
      setIsInitiateModalOpen(false);
      fetchRuns();
      loadRunDetails(run.id);
    } catch (err: any) {
      alert(err.message || 'Failed to initiate payroll run');
    }
  };

  const handleCalculate = async (runId: string) => {
    try {
      await employeeApi.calculatePayrollRun(runId);
      fetchRuns();
      loadRunDetails(runId);
    } catch (err: any) {
      alert(err.message || 'Calculation failed');
    }
  };

  const handleApprove = async (runId: string) => {
    try {
      await employeeApi.approvePayrollRun(runId, { action: 'APPROVE' });
      fetchRuns();
      loadRunDetails(runId);
    } catch (err: any) {
      alert(err.message || 'Approval failed (Maker-Checker self-approval rejected)');
    }
  };

  const handleFinalize = async (runId: string) => {
    try {
      await employeeApi.finalizePayrollRun(runId);
      fetchRuns();
      loadRunDetails(runId);
    } catch (err: any) {
      alert(err.message || 'Finalization failed');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h2 className="text-xl font-bold text-gray-800">💼 Payroll Engine & Settlement</h2>
          <p className="text-sm text-gray-500">
            Lifecycle: DRAFT → CALCULATING → UNDER_REVIEW → APPROVED → FINALIZED → PAID
          </p>
        </div>
        <button
          onClick={() => setIsInitiateModalOpen(true)}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-semibold text-sm shadow flex items-center gap-2"
        >
          <span>➕</span> Initiate Monthly Run
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      {/* Main Grid: Runs list on left, details on right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Runs List */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 space-y-3">
          <h3 className="font-bold text-gray-800 text-sm uppercase">Monthly Payroll Runs</h3>
          {loading ? (
            <div className="p-4 text-center text-gray-400 text-sm">Loading runs...</div>
          ) : runs.length === 0 ? (
            <div className="p-4 text-center text-gray-400 text-sm">No payroll runs found.</div>
          ) : (
            <div className="space-y-2">
              {runs.map((r) => (
                <div
                  key={r.id}
                  onClick={() => loadRunDetails(r.id)}
                  className={`p-3 border rounded-lg cursor-pointer transition text-xs space-y-1 ${
                    selectedRun?.id === r.id
                      ? 'border-emerald-600 bg-emerald-50'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-gray-900 text-sm">
                      {new Date(r.year, r.month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full font-bold ${
                      r.status === PayrollRunStatus.FINALIZED || r.status === PayrollRunStatus.PAID
                        ? 'bg-green-100 text-green-800'
                        : r.status === PayrollRunStatus.APPROVED
                        ? 'bg-blue-100 text-blue-800'
                        : r.status === PayrollRunStatus.UNDER_REVIEW
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {r.status}
                    </span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>{r.totalEmployees} Employees</span>
                    <span className="font-bold text-emerald-700">₹{r.totalNetSalary.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Active Run Controls & Payslips */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-6">
          {selectedRun ? (
            <>
              {/* Active Run Header & Lifecycle Actions */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b pb-4">
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">
                    Payroll Run: {new Date(selectedRun.year, selectedRun.month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
                  </h3>
                  <p className="text-xs text-gray-500">
                    Period: {selectedRun.periodStart} to {selectedRun.periodEnd}
                  </p>
                </div>

                {/* State Machine Actions */}
                <div className="flex flex-wrap gap-2">
                  {(selectedRun.status === PayrollRunStatus.DRAFT || selectedRun.status === PayrollRunStatus.UNDER_REVIEW) && (
                    <button
                      onClick={() => handleCalculate(selectedRun.id)}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold text-xs shadow"
                    >
                      ⚙️ Calculate / Recalculate
                    </button>
                  )}

                  {selectedRun.status === PayrollRunStatus.UNDER_REVIEW && (
                    <button
                      onClick={() => handleApprove(selectedRun.id)}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded font-bold text-xs shadow"
                    >
                      ✓ Approve Run (Checker)
                    </button>
                  )}

                  {selectedRun.status === PayrollRunStatus.APPROVED && (
                    <button
                      onClick={() => handleFinalize(selectedRun.id)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-xs shadow"
                    >
                      🔒 Finalize Payroll (Lock)
                    </button>
                  )}
                </div>
              </div>

              {/* Financial KPI Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 border rounded-lg bg-gray-50">
                  <span className="text-gray-500 block">Gross Salary</span>
                  <span className="font-bold text-gray-900 text-sm">₹{selectedRun.totalGrossSalary.toFixed(2)}</span>
                </div>
                <div className="p-3 border rounded-lg bg-gray-50">
                  <span className="text-gray-500 block">Allowances</span>
                  <span className="font-bold text-gray-900 text-sm">₹{selectedRun.totalAllowances.toFixed(2)}</span>
                </div>
                <div className="p-3 border rounded-lg bg-gray-50">
                  <span className="text-gray-500 block">Deductions</span>
                  <span className="font-bold text-red-600 text-sm">-₹{selectedRun.totalDeductions.toFixed(2)}</span>
                </div>
                <div className="p-3 border rounded-lg bg-emerald-50 border-emerald-200">
                  <span className="text-emerald-800 block font-semibold">Total Net Pay</span>
                  <span className="font-extrabold text-emerald-700 text-base">₹{selectedRun.totalNetSalary.toFixed(2)}</span>
                </div>
              </div>

              {/* Payslips Table */}
              <div className="space-y-3">
                <h4 className="font-bold text-gray-800 text-sm uppercase">Itemized Payslips</h4>
                {payslipsLoading ? (
                  <div className="p-6 text-center text-gray-400 text-sm">Loading payslips...</div>
                ) : payslips.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 text-sm">
                    No payslips generated yet. Click "Calculate" to compute salaries.
                  </div>
                ) : (
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-gray-50 border-b text-gray-600 font-semibold uppercase">
                        <tr>
                          <th className="p-2.5">Employee</th>
                          <th className="p-2.5">Days (P/A/L)</th>
                          <th className="p-2.5">Gross Pay</th>
                          <th className="p-2.5">Deductions</th>
                          <th className="p-2.5">Net Salary</th>
                          <th className="p-2.5">Status</th>
                          <th className="p-2.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {payslips.map((ps) => (
                          <tr key={ps.id} className="hover:bg-gray-50">
                            <td className="p-2.5 font-semibold text-gray-900">
                              <div>{ps.employeeName}</div>
                              <div className="text-[10px] text-gray-400 font-mono">{ps.employeeCode}</div>
                            </td>
                            <td className="p-2.5">
                              {ps.presentDays}P / {ps.absentDays}A / {ps.paidLeaveDays}L
                            </td>
                            <td className="p-2.5 font-medium">₹{ps.grossEarnings.toFixed(2)}</td>
                            <td className="p-2.5 text-red-600 font-medium">-₹{ps.totalDeductions.toFixed(2)}</td>
                            <td className="p-2.5 font-bold text-emerald-700">₹{ps.netSalary.toFixed(2)}</td>
                            <td className="p-2.5">
                              <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                ps.paymentStatus === 'PAID'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}>
                                {ps.paymentStatus}
                              </span>
                            </td>
                            <td className="p-2.5 text-right">
                              <button
                                onClick={() => setActivePayslip(ps)}
                                className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded font-medium shadow-sm"
                              >
                                View Payslip
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="p-12 text-center text-gray-400 text-sm">Select a payroll run to view details</div>
          )}
        </div>
      </div>

      {/* Initiate Modal */}
      {isInitiateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-bold text-gray-800 text-lg">📅 Initiate Monthly Payroll Run</h3>
            <form onSubmit={handleInitiateSubmit} className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase">Year *</label>
                  <input
                    type="number"
                    min="2020"
                    max="2100"
                    required
                    value={initiateForm.year}
                    onChange={(e) => setInitiateForm({ ...initiateForm, year: parseInt(e.target.value, 10) || 2026 })}
                    className="w-full mt-1 px-3 py-2 border rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase">Month (1-12) *</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    required
                    value={initiateForm.month}
                    onChange={(e) => setInitiateForm({ ...initiateForm, month: parseInt(e.target.value, 10) || 1 })}
                    className="w-full mt-1 px-3 py-2 border rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase">Notes</label>
                <textarea
                  rows={2}
                  placeholder="Optional run notes..."
                  value={initiateForm.notes}
                  onChange={(e) => setInitiateForm({ ...initiateForm, notes: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setIsInitiateModalOpen(false)}
                  className="px-3 py-1.5 border rounded text-gray-600 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 text-white rounded font-bold text-xs hover:bg-emerald-700"
                >
                  Initiate Run (DRAFT)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payslip Modal */}
      {activePayslip && (
        <PayslipModal
          payslip={activePayslip}
          isOpen={Boolean(activePayslip)}
          onClose={() => setActivePayslip(null)}
          onPaymentSuccess={() => {
            if (selectedRun) loadRunDetails(selectedRun.id);
          }}
        />
      )}
    </div>
  );
};
