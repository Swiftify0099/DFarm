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
      <div className="clay-card rounded-3xl p-6 bg-white shadow-clay-card border border-white/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">💼 Payroll Engine & Settlement</h2>
          <p className="text-sm text-slate-500 font-medium">
            Lifecycle: DRAFT → CALCULATING → UNDER_REVIEW → APPROVED → FINALIZED → PAID
          </p>
        </div>
        <button
          onClick={() => setIsInitiateModalOpen(true)}
          className="clay-btn-brand bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-bold px-5 py-2.5 rounded-xl shadow-clay-button flex items-center gap-2 text-xs tracking-wide active:scale-95 transition-all"
        >
          <span>➕</span> Initiate Monthly Run
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold shadow-sm">
          {error}
        </div>
      )}

      {/* Main Grid: Runs list on left, details on right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Runs List */}
        <div className="clay-card rounded-3xl p-5 bg-white shadow-clay-card border border-white/80 space-y-3">
          <h3 className="font-extrabold text-slate-700 text-xs uppercase tracking-wider">Monthly Payroll Runs</h3>
          {loading ? (
            <div className="p-8 text-center text-slate-400 text-sm font-semibold space-y-2">
              <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <div>Loading runs...</div>
            </div>
          ) : runs.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm font-semibold">No payroll runs found.</div>
          ) : (
            <div className="space-y-2.5">
              {runs.map((r) => {
                const isSelected = selectedRun?.id === r.id;
                return (
                  <div
                    key={r.id}
                    onClick={() => loadRunDetails(r.id)}
                    className={`p-4 rounded-2xl cursor-pointer transition-all duration-200 text-xs space-y-1.5 ${
                      isSelected
                        ? 'bg-gradient-to-r from-emerald-50 to-teal-50/60 border border-emerald-300 shadow-sm scale-[1.01]'
                        : 'clay-card bg-[#F8FAFC] hover:bg-white border border-slate-200/80'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-extrabold text-slate-900 text-sm">
                        {new Date(r.year, r.month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                        r.status === PayrollRunStatus.FINALIZED || r.status === PayrollRunStatus.PAID
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : r.status === PayrollRunStatus.APPROVED
                          ? 'bg-sky-100 text-sky-800 border border-sky-200'
                          : r.status === PayrollRunStatus.UNDER_REVIEW
                          ? 'bg-purple-100 text-purple-800 border border-purple-200'
                          : 'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}>
                        {r.status}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600 font-medium">
                      <span>{r.totalEmployees} Employees</span>
                      <span className="font-black text-emerald-700 text-sm">₹{r.totalNetSalary.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Active Run Controls & Payslips */}
        <div className="lg:col-span-2 clay-card rounded-3xl p-6 sm:p-8 bg-white shadow-clay-card border border-white/80 space-y-6">
          {selectedRun ? (
            <>
              {/* Active Run Header & Lifecycle Actions */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="font-black text-slate-900 text-xl tracking-tight">
                    Payroll Run: {new Date(selectedRun.year, selectedRun.month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Period: {selectedRun.periodStart} to {selectedRun.periodEnd}
                  </p>
                </div>

                {/* State Machine Actions */}
                <div className="flex flex-wrap gap-2">
                  {(selectedRun.status === PayrollRunStatus.DRAFT || selectedRun.status === PayrollRunStatus.UNDER_REVIEW) && (
                    <button
                      onClick={() => handleCalculate(selectedRun.id)}
                      className="clay-btn-brand px-4 py-2 bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-500 hover:to-blue-600 text-white rounded-xl font-bold text-xs shadow-clay-button active:scale-95 transition-all"
                    >
                      ⚙️ Calculate / Recalculate
                    </button>
                  )}

                  {selectedRun.status === PayrollRunStatus.UNDER_REVIEW && (
                    <button
                      onClick={() => handleApprove(selectedRun.id)}
                      className="clay-btn-brand px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-700 hover:from-purple-500 hover:to-indigo-600 text-white rounded-xl font-bold text-xs shadow-clay-button active:scale-95 transition-all"
                    >
                      ✓ Approve Run (Checker)
                    </button>
                  )}

                  {selectedRun.status === PayrollRunStatus.APPROVED && (
                    <button
                      onClick={() => handleFinalize(selectedRun.id)}
                      className="clay-btn-brand px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white rounded-xl font-bold text-xs shadow-clay-button active:scale-95 transition-all"
                    >
                      🔒 Finalize Payroll (Lock)
                    </button>
                  )}
                </div>
              </div>

              {/* Financial KPI Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="clay-card p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200/80 shadow-sm">
                  <span className="text-slate-500 block uppercase font-bold text-[10px]">Gross Salary</span>
                  <span className="font-black text-slate-900 text-base mt-1 block">₹{selectedRun.totalGrossSalary.toFixed(2)}</span>
                </div>
                <div className="clay-card p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200/80 shadow-sm">
                  <span className="text-slate-500 block uppercase font-bold text-[10px]">Allowances</span>
                  <span className="font-black text-slate-900 text-base mt-1 block">₹{selectedRun.totalAllowances.toFixed(2)}</span>
                </div>
                <div className="clay-card p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200/80 shadow-sm">
                  <span className="text-slate-500 block uppercase font-bold text-[10px]">Deductions</span>
                  <span className="font-black text-rose-600 text-base mt-1 block">-₹{selectedRun.totalDeductions.toFixed(2)}</span>
                </div>
                <div className="clay-card p-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 shadow-sm">
                  <span className="text-emerald-800 block font-extrabold text-[10px] uppercase">Total Net Pay</span>
                  <span className="font-black text-emerald-700 text-lg mt-1 block">₹{selectedRun.totalNetSalary.toFixed(2)}</span>
                </div>
              </div>

              {/* Payslips Table */}
              <div className="space-y-3">
                <h4 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">Itemized Payslips</h4>
                {payslipsLoading ? (
                  <div className="p-8 text-center text-slate-400 text-sm font-semibold space-y-2">
                    <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <div>Loading payslips...</div>
                  </div>
                ) : payslips.length === 0 ? (
                  <div className="p-8 text-center clay-inset rounded-2xl bg-slate-50 text-slate-500 text-xs font-semibold">
                    No payslips generated yet. Click "Calculate" to compute salaries.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-slate-200/80 shadow-sm">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#F8FAFC] border-b border-slate-200 text-slate-600 font-extrabold uppercase tracking-wider">
                        <tr>
                          <th className="px-3.5 py-3">Employee</th>
                          <th className="px-3.5 py-3">Days (P/A/L)</th>
                          <th className="px-3.5 py-3">Gross Pay</th>
                          <th className="px-3.5 py-3">Deductions</th>
                          <th className="px-3.5 py-3">Net Salary</th>
                          <th className="px-3.5 py-3">Status</th>
                          <th className="px-3.5 py-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {payslips.map((ps) => (
                          <tr key={ps.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-3.5 py-3 font-bold text-slate-900">
                              <div>{ps.employeeName}</div>
                              <div className="text-[10px] text-slate-400 font-mono font-bold">{ps.employeeCode}</div>
                            </td>
                            <td className="px-3.5 py-3 text-slate-700 font-medium">
                              {ps.presentDays}P / {ps.absentDays}A / {ps.paidLeaveDays}L
                            </td>
                            <td className="px-3.5 py-3 font-bold text-slate-900">₹{ps.grossEarnings.toFixed(2)}</td>
                            <td className="px-3.5 py-3 text-rose-600 font-bold">-₹{ps.totalDeductions.toFixed(2)}</td>
                            <td className="px-3.5 py-3 font-black text-emerald-700">₹{ps.netSalary.toFixed(2)}</td>
                            <td className="px-3.5 py-3">
                              <span className={`px-2.5 py-0.5 rounded-full font-extrabold text-[10px] ${
                                ps.paymentStatus === 'PAID'
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : 'bg-amber-100 text-amber-800 border border-amber-200'
                              }`}>
                                {ps.paymentStatus}
                              </span>
                            </td>
                            <td className="px-3.5 py-3 text-right">
                              <button
                                onClick={() => setActivePayslip(ps)}
                                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold shadow-sm active:scale-95 transition-all text-xs"
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
            <div className="p-16 text-center text-slate-400 text-sm font-semibold">Select a payroll run to view details</div>
          )}
        </div>
      </div>

      {/* Initiate Modal */}
      {isInitiateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="clay-card bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4 border border-white">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-black text-slate-800 text-lg">📅 Initiate Monthly Payroll Run</h3>
              <button
                onClick={() => setIsInitiateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleInitiateSubmit} className="space-y-3.5 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Year *</label>
                  <input
                    type="number"
                    min="2020"
                    max="2100"
                    required
                    value={initiateForm.year}
                    onChange={(e) => setInitiateForm({ ...initiateForm, year: parseInt(e.target.value, 10) || 2026 })}
                    className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Month (1-12) *</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    required
                    value={initiateForm.month}
                    onChange={(e) => setInitiateForm({ ...initiateForm, month: parseInt(e.target.value, 10) || 1 })}
                    className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Notes</label>
                <textarea
                  rows={2}
                  placeholder="Optional run notes..."
                  value={initiateForm.notes}
                  onChange={(e) => setInitiateForm({ ...initiateForm, notes: e.target.value })}
                  className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsInitiateModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700 active:scale-95 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="clay-btn-brand px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white rounded-xl font-extrabold text-xs shadow-clay-button active:scale-95 transition-all"
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
