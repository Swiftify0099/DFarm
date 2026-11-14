import React, { useState, useEffect } from 'react';
import { employeeApi } from '../../api/employeeApi.js';
import { type PayrollRun } from '@dfarm/shared-types';

export const PayrollReports: React.FC = () => {
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReports();
  }, [selectedYear]);

  const loadReports = async () => {
    setLoading(true);
    try {
      const data = await employeeApi.getPayrollRuns({ year: selectedYear });
      setRuns(data);
    } catch (err: any) {
      alert(err.message || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  const totalAnnualGross = runs.reduce((acc, r) => acc + r.totalGrossSalary, 0);
  const totalAnnualAllowances = runs.reduce((acc, r) => acc + r.totalAllowances, 0);
  const totalAnnualDeductions = runs.reduce((acc, r) => acc + r.totalDeductions, 0);
  const totalAnnualAdvances = runs.reduce((acc, r) => acc + r.totalAdvancesRecovered, 0);
  const totalAnnualNet = runs.reduce((acc, r) => acc + r.totalNetSalary, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h2 className="text-xl font-bold text-gray-800">📊 Annual Payroll & Compliance Analytics</h2>
          <p className="text-sm text-gray-500">Summary reports, statutory tax deductions, and wage expenditures</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-600 uppercase">Year:</label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
            className="px-3 py-1.5 border rounded-md text-sm font-semibold bg-white"
          >
            <option value={2024}>2024</option>
            <option value={2025}>2025</option>
            <option value={2026}>2026</option>
            <option value={2027}>2027</option>
          </select>
        </div>
      </div>

      {/* Annual KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-xs">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <span className="text-gray-500 block uppercase font-medium">Annual Gross Wages</span>
          <span className="text-lg font-bold text-gray-900">₹{totalAnnualGross.toFixed(2)}</span>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <span className="text-gray-500 block uppercase font-medium">Total Allowances</span>
          <span className="text-lg font-bold text-gray-900">₹{totalAnnualAllowances.toFixed(2)}</span>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <span className="text-gray-500 block uppercase font-medium">Statutory Deductions</span>
          <span className="text-lg font-bold text-red-600">-₹{totalAnnualDeductions.toFixed(2)}</span>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <span className="text-gray-500 block uppercase font-medium">Advances Recovered</span>
          <span className="text-lg font-bold text-blue-600">₹{totalAnnualAdvances.toFixed(2)}</span>
        </div>
        <div className="bg-emerald-600 p-4 rounded-xl shadow-sm text-white">
          <span className="text-emerald-100 block uppercase font-medium">Total Net Disbursed</span>
          <span className="text-xl font-extrabold">₹{totalAnnualNet.toFixed(2)}</span>
        </div>
      </div>

      {/* Monthly Breakdown Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b font-bold text-gray-800 text-sm">Monthly Settlement Summary ({selectedYear})</div>
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading report...</div>
        ) : runs.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No payroll runs recorded for {selectedYear}.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-gray-50 border-b text-gray-600 font-semibold uppercase">
                <tr>
                  <th className="p-3">Month</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Employees</th>
                  <th className="p-3">Gross Salary</th>
                  <th className="p-3">Allowances</th>
                  <th className="p-3">Deductions</th>
                  <th className="p-3">Advances Recovered</th>
                  <th className="p-3 font-bold text-right">Net Salary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {runs.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="p-3 font-semibold text-gray-900">
                      {new Date(r.year, r.month - 1).toLocaleString('default', { month: 'long' })}
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-full font-bold text-[10px] bg-green-100 text-green-800">
                        {r.status}
                      </span>
                    </td>
                    <td className="p-3">{r.totalEmployees}</td>
                    <td className="p-3">₹{r.totalGrossSalary.toFixed(2)}</td>
                    <td className="p-3">₹{r.totalAllowances.toFixed(2)}</td>
                    <td className="p-3 text-red-600">-₹{r.totalDeductions.toFixed(2)}</td>
                    <td className="p-3 text-blue-600">₹{r.totalAdvancesRecovered.toFixed(2)}</td>
                    <td className="p-3 text-right font-bold text-emerald-700">₹{r.totalNetSalary.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
