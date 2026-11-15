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
      <div className="clay-card rounded-3xl p-6 bg-white shadow-clay-card border border-white/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">📊 Annual Payroll & Compliance Analytics</h2>
          <p className="text-sm text-slate-500 font-medium">Summary reports, statutory tax deductions, and wage expenditures</p>
        </div>
        <div className="flex items-center gap-2.5">
          <label className="text-xs font-extrabold uppercase tracking-wider text-slate-600">Year:</label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
            className="clay-inset bg-white border border-slate-300 rounded-xl px-3.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
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
        <div className="clay-card p-5 rounded-2xl bg-[#F8FAFC] border border-slate-200/80 shadow-sm">
          <span className="text-slate-500 block uppercase font-bold text-[10px]">Annual Gross Wages</span>
          <span className="text-lg font-black text-slate-900 mt-1 block">₹{totalAnnualGross.toFixed(2)}</span>
        </div>
        <div className="clay-card p-5 rounded-2xl bg-[#F8FAFC] border border-slate-200/80 shadow-sm">
          <span className="text-slate-500 block uppercase font-bold text-[10px]">Total Allowances</span>
          <span className="text-lg font-black text-slate-900 mt-1 block">₹{totalAnnualAllowances.toFixed(2)}</span>
        </div>
        <div className="clay-card p-5 rounded-2xl bg-[#F8FAFC] border border-slate-200/80 shadow-sm">
          <span className="text-slate-500 block uppercase font-bold text-[10px]">Statutory Deductions</span>
          <span className="text-lg font-black text-rose-600 mt-1 block">-₹{totalAnnualDeductions.toFixed(2)}</span>
        </div>
        <div className="clay-card p-5 rounded-2xl bg-[#F8FAFC] border border-slate-200/80 shadow-sm">
          <span className="text-slate-500 block uppercase font-bold text-[10px]">Advances Recovered</span>
          <span className="text-lg font-black text-sky-700 mt-1 block">₹{totalAnnualAdvances.toFixed(2)}</span>
        </div>
        <div className="clay-card p-5 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-clay-button border border-emerald-500/50">
          <span className="text-emerald-100 block uppercase font-bold text-[10px] tracking-wider">Total Net Disbursed</span>
          <span className="text-xl font-black mt-1 block">₹{totalAnnualNet.toFixed(2)}</span>
        </div>
      </div>

      {/* Monthly Breakdown Table */}
      <div className="clay-card rounded-2xl bg-white shadow-clay-card border border-white/80 overflow-hidden">
        <div className="p-5 border-b border-slate-100 font-extrabold text-slate-800 text-sm">
          Monthly Settlement Summary ({selectedYear})
        </div>
        {loading ? (
          <div className="p-16 text-center text-slate-400 text-sm font-semibold space-y-2">
            <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <div>Loading report...</div>
          </div>
        ) : runs.length === 0 ? (
          <div className="p-16 text-center text-slate-400 text-sm font-semibold">No payroll runs recorded for {selectedYear}.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#F8FAFC] border-b border-slate-200 text-slate-600 font-extrabold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3.5">Month</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Employees</th>
                  <th className="px-4 py-3.5">Gross Salary</th>
                  <th className="px-4 py-3.5">Allowances</th>
                  <th className="px-4 py-3.5">Deductions</th>
                  <th className="px-4 py-3.5">Advances Recovered</th>
                  <th className="px-4 py-3.5 font-black text-right">Net Salary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {runs.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3.5 font-bold text-slate-900">
                      {new Date(r.year, r.month - 1).toLocaleString('default', { month: 'long' })}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="px-2.5 py-0.5 rounded-full font-extrabold text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200">
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-700 font-bold">{r.totalEmployees}</td>
                    <td className="px-4 py-3.5 font-medium text-slate-900">₹{r.totalGrossSalary.toFixed(2)}</td>
                    <td className="px-4 py-3.5 font-medium text-slate-900">₹{r.totalAllowances.toFixed(2)}</td>
                    <td className="px-4 py-3.5 text-rose-600 font-bold">-₹{r.totalDeductions.toFixed(2)}</td>
                    <td className="px-4 py-3.5 text-sky-700 font-bold">₹{r.totalAdvancesRecovered.toFixed(2)}</td>
                    <td className="px-4 py-3.5 text-right font-black text-emerald-700 text-sm">₹{r.totalNetSalary.toFixed(2)}</td>
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
