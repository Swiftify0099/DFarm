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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h2 className="text-xl font-bold text-gray-800">💰 Salary & Advances Management</h2>
          <p className="text-sm text-gray-500">Configure compensation packages, allowances, statutory deductions, and employee loans</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm font-semibold text-gray-700">Select Employee:</label>
          <select
            value={selectedEmployeeId}
            onChange={(e) => setSelectedEmployeeId(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm bg-white font-medium"
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
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Salary Structure Form */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-6">
          <div className="flex justify-between items-center border-b pb-3">
            <div>
              <h3 className="font-bold text-gray-800 text-base">Compensation Structure</h3>
              {currentStructure && (
                <span className="text-xs text-gray-500">
                  Active since {currentStructure.effectiveFrom} (Gross: ₹{currentStructure.grossSalary.toFixed(2)})
                </span>
              )}
            </div>
            <span className="text-xs bg-emerald-50 text-emerald-700 font-semibold px-2 py-0.5 rounded-full border border-emerald-200">
              {loading ? 'Refreshing...' : 'PostgreSQL NUMERIC Precision'}
            </span>
          </div>

          <form onSubmit={handleSaveSalaryStructure} className="space-y-4 text-sm">
            {/* Calculation Basis */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase">Calculation Basis *</label>
                <select
                  value={salaryForm.calculationBasis}
                  onChange={(e) => setSalaryForm({ ...salaryForm, calculationBasis: e.target.value as SalaryCalculationBasis })}
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                >
                  <option value={SalaryCalculationBasis.MONTHLY}>Monthly Fixed</option>
                  <option value={SalaryCalculationBasis.DAILY_WAGE}>Daily Wage</option>
                  <option value={SalaryCalculationBasis.HOURLY}>Hourly</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase">Effective From *</label>
                <input
                  type="date"
                  required
                  value={salaryForm.effectiveFrom}
                  onChange={(e) => setSalaryForm({ ...salaryForm, effectiveFrom: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                />
              </div>
            </div>

            {/* Earnings Breakdown */}
            <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
              <h4 className="font-bold text-xs uppercase text-gray-700">Gross Earnings Components</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-600">Base Salary (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={salaryForm.baseSalary}
                    onChange={(e) => setSalaryForm({ ...salaryForm, baseSalary: parseFloat(e.target.value) || 0 })}
                    className="w-full mt-1 px-3 py-1.5 border rounded bg-white font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600">HRA (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={salaryForm.hra}
                    onChange={(e) => setSalaryForm({ ...salaryForm, hra: parseFloat(e.target.value) || 0 })}
                    className="w-full mt-1 px-3 py-1.5 border rounded bg-white font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600">Travel Allowance (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={salaryForm.travelAllowance}
                    onChange={(e) => setSalaryForm({ ...salaryForm, travelAllowance: parseFloat(e.target.value) || 0 })}
                    className="w-full mt-1 px-3 py-1.5 border rounded bg-white font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600">Special Allowance (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={salaryForm.specialAllowance}
                    onChange={(e) => setSalaryForm({ ...salaryForm, specialAllowance: parseFloat(e.target.value) || 0 })}
                    className="w-full mt-1 px-3 py-1.5 border rounded bg-white font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600">Medical Allowance (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={salaryForm.medicalAllowance}
                    onChange={(e) => setSalaryForm({ ...salaryForm, medicalAllowance: parseFloat(e.target.value) || 0 })}
                    className="w-full mt-1 px-3 py-1.5 border rounded bg-white font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600">OT Hourly Rate (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={salaryForm.overtimeHourlyRate}
                    onChange={(e) => setSalaryForm({ ...salaryForm, overtimeHourlyRate: parseFloat(e.target.value) || 0 })}
                    className="w-full mt-1 px-3 py-1.5 border rounded bg-white font-medium"
                  />
                </div>
              </div>
            </div>

            {/* Deductions Breakdown */}
            <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
              <h4 className="font-bold text-xs uppercase text-gray-700">Deductions</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-gray-600">Provident Fund (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={salaryForm.providentFundEmployee}
                    onChange={(e) => setSalaryForm({ ...salaryForm, providentFundEmployee: parseFloat(e.target.value) || 0 })}
                    className="w-full mt-1 px-3 py-1.5 border rounded bg-white font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600">Professional Tax (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={salaryForm.professionalTax}
                    onChange={(e) => setSalaryForm({ ...salaryForm, professionalTax: parseFloat(e.target.value) || 0 })}
                    className="w-full mt-1 px-3 py-1.5 border rounded bg-white font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600">TDS Tax (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={salaryForm.tdsTax}
                    onChange={(e) => setSalaryForm({ ...salaryForm, tdsTax: parseFloat(e.target.value) || 0 })}
                    className="w-full mt-1 px-3 py-1.5 border rounded bg-white font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600">Other Deductions (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={salaryForm.otherDeductions}
                    onChange={(e) => setSalaryForm({ ...salaryForm, otherDeductions: parseFloat(e.target.value) || 0 })}
                    className="w-full mt-1 px-3 py-1.5 border rounded bg-white font-medium"
                  />
                </div>
              </div>
            </div>

            {/* Live Calculation Preview Banner */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex justify-between items-center">
              <div>
                <span className="text-xs text-gray-600 block">Gross Earnings:</span>
                <span className="text-base font-bold text-gray-900">₹{computedGross.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-xs text-gray-600 block">Total Deductions:</span>
                <span className="text-base font-bold text-red-600">-₹{computedDeductions.toFixed(2)}</span>
              </div>
              <div className="text-right">
                <span className="text-xs text-gray-600 block">Estimated Net Salary:</span>
                <span className="text-xl font-extrabold text-emerald-700">₹{computedNet.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-bold text-sm shadow"
              >
                💾 Save Compensation Structure
              </button>
            </div>
          </form>
        </div>

        {/* Right Col: Advances & Loans */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-4">
          <div className="flex justify-between items-center border-b pb-3">
            <h3 className="font-bold text-gray-800 text-base">Employee Advances</h3>
            <button
              onClick={() => setIsAdvanceModalOpen(true)}
              className="px-2.5 py-1 bg-emerald-600 text-white rounded text-xs font-semibold hover:bg-emerald-700 shadow"
            >
              ➕ Request
            </button>
          </div>

          <p className="text-xs text-gray-500">
            Dedicated employee loan tracking with monthly automatic payroll deduction.
          </p>

          {advances.length === 0 ? (
            <div className="p-4 text-center text-gray-400 text-sm">No active or pending advances.</div>
          ) : (
            <div className="space-y-3">
              {advances.map((adv) => (
                <div key={adv.id} className="p-3 border rounded-lg bg-gray-50 text-xs space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="font-mono font-bold text-emerald-800">{adv.advanceNumber}</span>
                    <span className={`px-1.5 py-0.5 rounded-full font-bold ${
                      adv.status === EmployeeAdvanceStatus.ACTIVE
                        ? 'bg-blue-100 text-blue-800'
                        : adv.status === EmployeeAdvanceStatus.PENDING_APPROVAL
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-200 text-gray-700'
                    }`}>
                      {adv.status}
                    </span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Principal: ₹{adv.amount.toFixed(2)}</span>
                    <span className="font-bold text-gray-900">Balance: ₹{adv.remainingBalance.toFixed(2)}</span>
                  </div>
                  <div className="text-gray-500">Installment: ₹{adv.monthlyInstallment.toFixed(2)}/mo</div>
                  <div className="text-gray-500 italic truncate">{adv.reason}</div>

                  {adv.status === EmployeeAdvanceStatus.PENDING_APPROVAL && (
                    <div className="pt-2 flex justify-end">
                      <button
                        onClick={() => handleApproveAdvance(adv.id)}
                        className="px-2 py-1 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-bold text-gray-800 text-lg">💸 Request Employee Advance</h3>
            <form onSubmit={handleRequestAdvance} className="space-y-3 text-sm">
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase">Advance Amount (₹) *</label>
                <input
                  type="number"
                  min="100"
                  step="100"
                  required
                  value={advanceForm.amount}
                  onChange={(e) => setAdvanceForm({ ...advanceForm, amount: parseFloat(e.target.value) || 0 })}
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase">Monthly Installment (₹) *</label>
                <input
                  type="number"
                  min="100"
                  step="100"
                  required
                  value={advanceForm.monthlyInstallment}
                  onChange={(e) => setAdvanceForm({ ...advanceForm, monthlyInstallment: parseFloat(e.target.value) || 0 })}
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase">Documented Reason *</label>
                <textarea
                  required
                  rows={2}
                  placeholder="Reason for advance..."
                  value={advanceForm.reason}
                  onChange={(e) => setAdvanceForm({ ...advanceForm, reason: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setIsAdvanceModalOpen(false)}
                  className="px-3 py-1.5 border rounded text-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700"
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
