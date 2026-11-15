import React, { useState, useEffect } from 'react';
import { employeeApi } from '../../api/employeeApi.js';
import {
  type Employee,
  type EmployeeAdvance,
  type EmployeeSalaryStructure,
  SalaryCalculationBasis,
  EmployeeAdvanceStatus,
} from '@dfarm/shared-types';

interface SalaryManagementProps {
  initialEmployeeId?: string | null;
}

export const SalaryManagement: React.FC<SalaryManagementProps> = ({ initialEmployeeId }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(initialEmployeeId || '');
  const [currentStructure, setCurrentStructure] = useState<EmployeeSalaryStructure | null>(null);
  const [advances, setAdvances] = useState<EmployeeAdvance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Salary structure form state
  const [salaryForm, setSalaryForm] = useState({
    calculationBasis: SalaryCalculationBasis.MONTHLY,
    baseSalary: 15000,
    hra: 3000,
    travelAllowance: 1500,
    specialAllowance: 1000,
    medicalAllowance: 500,
    providentFundEmployee: 1800,
    professionalTax: 200,
    tdsTax: 0,
    otherDeductions: 0,
    overtimeHourlyRate: 100,
    effectiveFrom: new Date().toISOString().split('T')[0]!,
  });

  // Advance modal state
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({
    amount: 5000,
    monthlyInstallment: 1000,
    reason: '',
  });

  useEffect(() => {
    loadEmployees();
  }, []);

  useEffect(() => {
    if (selectedEmployeeId) {
      loadSalaryAndAdvances(selectedEmployeeId);
    }
  }, [selectedEmployeeId]);

  const loadEmployees = async () => {
    try {
      const data = await employeeApi.getEmployees({ limit: 100 });
      setEmployees(data.employees);
      if (data.employees.length > 0 && !selectedEmployeeId) {
        setSelectedEmployeeId(data.employees[0]!.id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load employees');
    }
  };

  const loadSalaryAndAdvances = async (empId: string) => {
    setLoading(true);
    setError(null);
    try {
      const [struct, advs] = await Promise.all([
        employeeApi.getSalaryStructure(empId),
        employeeApi.getAdvances({ employeeId: empId }),
      ]);
      setCurrentStructure(struct);
      setAdvances(advs);

      if (struct) {
        setSalaryForm({
          calculationBasis: struct.calculationBasis,
          baseSalary: struct.baseSalary,
          hra: struct.hra,
          travelAllowance: struct.travelAllowance,
          specialAllowance: struct.specialAllowance,
          medicalAllowance: struct.medicalAllowance,
          providentFundEmployee: struct.providentFundEmployee,
          professionalTax: struct.professionalTax,
          tdsTax: struct.tdsTax,
          otherDeductions: struct.otherDeductions,
          overtimeHourlyRate: struct.overtimeHourlyRate,
          effectiveFrom: struct.effectiveFrom,
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load compensation data');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSalaryStructure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeId) return;

    try {
      const struct = await employeeApi.createSalaryStructure(selectedEmployeeId, {
        ...salaryForm,
        employeeId: selectedEmployeeId,
      });
      setCurrentStructure(struct);
      alert('Salary structure updated successfully!');
    } catch (err: any) {
      alert(err.message || 'Failed to save salary structure');
    }
  };

  const handleRequestAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeId) return;

    try {
      await employeeApi.requestAdvance(selectedEmployeeId, advanceForm);
      setIsAdvanceModalOpen(false);
      setAdvanceForm({ amount: 5000, monthlyInstallment: 1000, reason: '' });
      loadSalaryAndAdvances(selectedEmployeeId);
    } catch (err: any) {
      alert(err.message || 'Failed to submit advance request');
    }
  };

  const handleApproveAdvance = async (advanceId: string) => {
    try {
      await employeeApi.approveAdvance(advanceId, { status: EmployeeAdvanceStatus.APPROVED });
      loadSalaryAndAdvances(selectedEmployeeId);
    } catch (err: any) {
      alert(err.message || 'Approval failed (Self-approval is rejected by security policy)');
    }
  };

  const computedGross =
    salaryForm.baseSalary +
    salaryForm.hra +
    salaryForm.travelAllowance +
    salaryForm.specialAllowance +
    salaryForm.medicalAllowance;

  const computedDeductions =
    salaryForm.providentFundEmployee +
    salaryForm.professionalTax +
    salaryForm.tdsTax +
    salaryForm.otherDeductions;

  const computedNet = Math.max(0, computedGross - computedDeductions);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="clay-card rounded-3xl p-6 bg-white shadow-clay-card border border-white/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">💰 Salary & Advances Management</h2>
          <p className="text-sm text-slate-500 font-medium">Configure compensation packages, allowances, statutory deductions, and employee loans</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs font-extrabold uppercase tracking-wider text-slate-600">Select Employee:</label>
          <select
            value={selectedEmployeeId}
            onChange={(e) => setSelectedEmployeeId(e.target.value)}
            className="clay-inset bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
          >
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.fullName} ({emp.employeeCode})
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold shadow-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Salary Structure Form */}
        <div className="lg:col-span-2 clay-card rounded-3xl p-6 sm:p-8 bg-white shadow-clay-card border border-white/80 space-y-6">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-black text-slate-800 text-lg">Compensation Structure</h3>
              {currentStructure && (
                <span className="text-xs text-slate-500 font-medium">
                  Active since {currentStructure.effectiveFrom} (Gross: ₹{currentStructure.grossSalary.toFixed(2)})
                </span>
              )}
            </div>
            <span className="text-xs bg-emerald-50 text-emerald-800 font-bold px-3 py-1 rounded-full border border-emerald-200 shadow-sm">
              {loading ? 'Refreshing...' : 'PostgreSQL NUMERIC Precision'}
            </span>
          </div>

          <form onSubmit={handleSaveSalaryStructure} className="space-y-5 text-sm">
            {/* Calculation Basis */}
            <div className="clay-inset p-4 rounded-2xl bg-[#EEF2F6] border border-[#CBD5E1]/50 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Calculation Basis *</label>
                <select
                  value={salaryForm.calculationBasis}
                  onChange={(e) => setSalaryForm({ ...salaryForm, calculationBasis: e.target.value as SalaryCalculationBasis })}
                  className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                >
                  <option value={SalaryCalculationBasis.MONTHLY}>Monthly Fixed</option>
                  <option value={SalaryCalculationBasis.DAILY_WAGE}>Daily Wage</option>
                  <option value={SalaryCalculationBasis.HOURLY}>Hourly</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Effective From *</label>
                <input
                  type="date"
                  required
                  value={salaryForm.effectiveFrom}
                  onChange={(e) => setSalaryForm({ ...salaryForm, effectiveFrom: e.target.value })}
                  className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                />
              </div>
            </div>

            {/* Earnings Breakdown */}
            <div className="clay-card rounded-2xl p-5 bg-[#F8FAFC] border border-slate-200/80 space-y-3 shadow-sm">
              <h4 className="font-extrabold text-xs uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <span>📈</span> Gross Earnings Components
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Base Salary (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={salaryForm.baseSalary}
                    onChange={(e) => setSalaryForm({ ...salaryForm, baseSalary: parseFloat(e.target.value) || 0 })}
                    className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">HRA (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={salaryForm.hra}
                    onChange={(e) => setSalaryForm({ ...salaryForm, hra: parseFloat(e.target.value) || 0 })}
                    className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Travel Allowance (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={salaryForm.travelAllowance}
                    onChange={(e) => setSalaryForm({ ...salaryForm, travelAllowance: parseFloat(e.target.value) || 0 })}
                    className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Special Allowance (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={salaryForm.specialAllowance}
                    onChange={(e) => setSalaryForm({ ...salaryForm, specialAllowance: parseFloat(e.target.value) || 0 })}
                    className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Medical Allowance (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={salaryForm.medicalAllowance}
                    onChange={(e) => setSalaryForm({ ...salaryForm, medicalAllowance: parseFloat(e.target.value) || 0 })}
                    className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">OT Hourly Rate (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={salaryForm.overtimeHourlyRate}
                    onChange={(e) => setSalaryForm({ ...salaryForm, overtimeHourlyRate: parseFloat(e.target.value) || 0 })}
                    className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                  />
                </div>
              </div>
            </div>

            {/* Deductions Breakdown */}
            <div className="clay-card rounded-2xl p-5 bg-[#F8FAFC] border border-slate-200/80 space-y-3 shadow-sm">
              <h4 className="font-extrabold text-xs uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <span>📉</span> Deductions
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Provident Fund (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={salaryForm.providentFundEmployee}
                    onChange={(e) => setSalaryForm({ ...salaryForm, providentFundEmployee: parseFloat(e.target.value) || 0 })}
                    className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Professional Tax (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={salaryForm.professionalTax}
                    onChange={(e) => setSalaryForm({ ...salaryForm, professionalTax: parseFloat(e.target.value) || 0 })}
                    className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">TDS Tax (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={salaryForm.tdsTax}
                    onChange={(e) => setSalaryForm({ ...salaryForm, tdsTax: parseFloat(e.target.value) || 0 })}
                    className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Other Deductions (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={salaryForm.otherDeductions}
                    onChange={(e) => setSalaryForm({ ...salaryForm, otherDeductions: parseFloat(e.target.value) || 0 })}
                    className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                  />
                </div>
              </div>
            </div>

            {/* Live Calculation Preview Banner */}
            <div className="clay-card rounded-2xl p-5 bg-gradient-to-r from-emerald-50/80 via-teal-50/60 to-emerald-50/80 border border-emerald-200/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-sm">
              <div>
                <span className="text-xs text-slate-500 font-bold uppercase block">Gross Earnings:</span>
                <span className="text-lg font-black text-slate-900">₹{computedGross.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 font-bold uppercase block">Total Deductions:</span>
                <span className="text-lg font-black text-rose-600">-₹{computedDeductions.toFixed(2)}</span>
              </div>
              <div className="sm:text-right">
                <span className="text-xs text-slate-500 font-bold uppercase block">Estimated Net Salary:</span>
                <span className="text-2xl font-black text-emerald-700">₹{computedNet.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="clay-btn-brand px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white rounded-xl font-extrabold text-sm shadow-clay-button active:scale-95 transition-all"
              >
                💾 Save Compensation Structure
              </button>
            </div>
          </form>
        </div>

        {/* Right Col: Advances & Loans */}
        <div className="clay-card rounded-3xl p-6 bg-white shadow-clay-card border border-white/80 space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <h3 className="font-black text-slate-800 text-lg">Employee Advances</h3>
            <button
              onClick={() => setIsAdvanceModalOpen(true)}
              className="clay-btn-brand px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-xl text-xs font-bold shadow-clay-button active:scale-95 transition-all"
            >
              ➕ Request
            </button>
          </div>

          <p className="text-xs text-slate-500 font-medium">
            Dedicated employee loan tracking with monthly automatic payroll deduction.
          </p>

          {advances.length === 0 ? (
            <div className="p-8 text-center clay-inset rounded-2xl bg-slate-50 text-slate-400 text-xs font-medium">No active or pending advances.</div>
          ) : (
            <div className="space-y-3">
              {advances.map((adv) => (
                <div key={adv.id} className="clay-card p-3.5 rounded-2xl bg-[#F8FAFC] border border-slate-200/80 text-xs space-y-1.5 shadow-sm">
                  <div className="flex justify-between items-center">
                    <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md">{adv.advanceNumber}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                      adv.status === EmployeeAdvanceStatus.ACTIVE
                        ? 'bg-sky-100 text-sky-800'
                        : adv.status === EmployeeAdvanceStatus.PENDING_APPROVAL
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-200 text-slate-700'
                    }`}>
                      {adv.status}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600 font-medium">
                    <span>Principal: ₹{adv.amount.toFixed(2)}</span>
                    <span className="font-black text-slate-900">Balance: ₹{adv.remainingBalance.toFixed(2)}</span>
                  </div>
                  <div className="text-slate-500 font-medium">Installment: ₹{adv.monthlyInstallment.toFixed(2)}/mo</div>
                  <div className="text-slate-500 italic truncate font-medium">{adv.reason}</div>

                  {adv.status === EmployeeAdvanceStatus.PENDING_APPROVAL && (
                    <div className="pt-2 flex justify-end">
                      <button
                        onClick={() => handleApproveAdvance(adv.id)}
                        className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 active:scale-95 transition-all shadow-sm"
                      >
                        Approve Advance
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Advance Request Modal */}
      {isAdvanceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="clay-card bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4 border border-white">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-black text-slate-800 text-lg">💸 Request Employee Advance</h3>
              <button
                onClick={() => setIsAdvanceModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleRequestAdvance} className="space-y-3.5 text-sm">
              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Advance Amount (₹) *</label>
                <input
                  type="number"
                  min="100"
                  step="100"
                  required
                  value={advanceForm.amount}
                  onChange={(e) => setAdvanceForm({ ...advanceForm, amount: parseFloat(e.target.value) || 0 })}
                  className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                />
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Monthly Installment (₹) *</label>
                <input
                  type="number"
                  min="100"
                  step="100"
                  required
                  value={advanceForm.monthlyInstallment}
                  onChange={(e) => setAdvanceForm({ ...advanceForm, monthlyInstallment: parseFloat(e.target.value) || 0 })}
                  className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                />
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Documented Reason *</label>
                <textarea
                  required
                  rows={2}
                  placeholder="Reason for advance..."
                  value={advanceForm.reason}
                  onChange={(e) => setAdvanceForm({ ...advanceForm, reason: e.target.value })}
                  className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAdvanceModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700 active:scale-95 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="clay-btn-brand px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white rounded-xl font-extrabold text-xs shadow-clay-button active:scale-95 transition-all"
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
