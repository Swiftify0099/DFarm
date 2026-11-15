import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { reportsApi } from '../../api/reportsApi.js';
import { ClayButton } from '../../components/ClayButton.js';

type ReportType =
  | 'daily'
  | 'monthly'
  | 'farmer'
  | 'cow_buffalo'
  | 'fat_snf'
  | 'ledger'
  | 'balances'
  | 'payouts';

export const ReportsAnalyticsModule: React.FC = () => {
  const { currentCenterId, businessDate } = useAuth();
  const { showToast } = useToast();

  const [activeReport, setActiveReport] = useState<ReportType>('daily');
  const [loading, setLoading] = useState<boolean>(true);
  const [reportData, setReportData] = useState<any[]>([]);

  // Filter criteria
  const [filterDate, setFilterDate] = useState<string>(businessDate);
  const [startDate, setStartDate] = useState<string>(
    new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0]!
  );
  const [endDate, setEndDate] = useState<string>(businessDate);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      let res: any[] = [];
      const centerId = currentCenterId || undefined;

      switch (activeReport) {
        case 'daily':
          res = await reportsApi.getDailyCollection({ date: filterDate, centerId });
          break;
        case 'monthly':
          res = await reportsApi.getMonthlyCollection({
            month: new Date(filterDate).getMonth() + 1,
            year: new Date(filterDate).getFullYear(),
            centerId,
          });
          break;
        case 'farmer':
          res = await reportsApi.getFarmerWise({ startDate, endDate, centerId });
          break;
        case 'cow_buffalo':
          res = await reportsApi.getCowBuffalo({ startDate, endDate, centerId });
          break;
        case 'fat_snf':
          res = await reportsApi.getFatSnf({ startDate, endDate, centerId });
          break;
        case 'ledger':
          res = await reportsApi.getLedgerRegister({ startDate, endDate, centerId });
          break;
        case 'balances':
          res = await reportsApi.getBalancesReport({ centerId });
          break;
        case 'payouts':
          res = await reportsApi.getPayoutsSummary({ startDate, endDate, centerId });
          break;
      }
      setReportData(Array.isArray(res) ? res : []);
    } catch (err: any) {
      showToast('Error loading report: ' + err.message, 'error');
      setReportData([]);
    } finally {
      setLoading(false);
    }
  }, [activeReport, currentCenterId, filterDate, startDate, endDate, showToast]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  // Export to CSV helper
  const handleExportCsv = () => {
    if (reportData.length === 0) {
      showToast('No report data available to export', 'warning');
      return;
    }
    const headers = Object.keys(reportData[0]);
    const csvRows = [
      headers.join(','),
      ...reportData.map(row =>
        headers.map(field => JSON.stringify(row[field] ?? '')).join(',')
      ),
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `DFarm_${activeReport}_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Report CSV downloaded successfully', 'success');
  };

  return (
    <div className="space-y-6 select-none">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-200/80">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>📊</span>
            <span>Authoritative Business Reports & Analytics</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
            Authoritative backend aggregations, farmer summaries, Fat/SNF distributions, and double-entry ledger audits.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ClayButton
            variant="brand"
            size="sm"
            onClick={handleExportCsv}
            disabled={loading || reportData.length === 0}
            icon={<span>📥</span>}
          >
            Export CSV
          </ClayButton>
        </div>
      </div>

      {/* Report Selection Tabs */}
      <div className="flex border-b border-slate-200/80 overflow-x-auto space-x-2 pb-1 text-sm font-semibold">
        <button
          onClick={() => setActiveReport('daily')}
          className={`px-3.5 py-2.5 rounded-t-xl transition-all duration-150 whitespace-nowrap flex items-center gap-1.5 font-bold ${
            activeReport === 'daily'
              ? 'bg-white text-[#00506E] border-b-2 border-[#00506E] shadow-[0_-4px_12px_rgba(0,80,110,0.06),inset_0_2px_2px_rgba(255,255,255,0.95)]'
              : 'text-slate-600 hover:text-[#00506E] hover:bg-white/60'
          }`}
        >
          <span>📅</span>
          <span>Daily Collections</span>
        </button>
        <button
          onClick={() => setActiveReport('monthly')}
          className={`px-3.5 py-2.5 rounded-t-xl transition-all duration-150 whitespace-nowrap flex items-center gap-1.5 font-bold ${
            activeReport === 'monthly'
              ? 'bg-white text-[#00506E] border-b-2 border-[#00506E] shadow-[0_-4px_12px_rgba(0,80,110,0.06),inset_0_2px_2px_rgba(255,255,255,0.95)]'
              : 'text-slate-600 hover:text-[#00506E] hover:bg-white/60'
          }`}
        >
          <span>🗓️</span>
          <span>Monthly Collections</span>
        </button>
        <button
          onClick={() => setActiveReport('farmer')}
          className={`px-3.5 py-2.5 rounded-t-xl transition-all duration-150 whitespace-nowrap flex items-center gap-1.5 font-bold ${
            activeReport === 'farmer'
              ? 'bg-white text-[#00506E] border-b-2 border-[#00506E] shadow-[0_-4px_12px_rgba(0,80,110,0.06),inset_0_2px_2px_rgba(255,255,255,0.95)]'
              : 'text-slate-600 hover:text-[#00506E] hover:bg-white/60'
          }`}
        >
          <span>🧑‍🌾</span>
          <span>Farmer-wise Summary</span>
        </button>
        <button
          onClick={() => setActiveReport('cow_buffalo')}
          className={`px-3.5 py-2.5 rounded-t-xl transition-all duration-150 whitespace-nowrap flex items-center gap-1.5 font-bold ${
            activeReport === 'cow_buffalo'
              ? 'bg-white text-[#00506E] border-b-2 border-[#00506E] shadow-[0_-4px_12px_rgba(0,80,110,0.06),inset_0_2px_2px_rgba(255,255,255,0.95)]'
              : 'text-slate-600 hover:text-[#00506E] hover:bg-white/60'
          }`}
        >
          <span>🐄</span>
          <span>Cow vs Buffalo</span>
        </button>
        <button
          onClick={() => setActiveReport('fat_snf')}
          className={`px-3.5 py-2.5 rounded-t-xl transition-all duration-150 whitespace-nowrap flex items-center gap-1.5 font-bold ${
            activeReport === 'fat_snf'
              ? 'bg-white text-[#00506E] border-b-2 border-[#00506E] shadow-[0_-4px_12px_rgba(0,80,110,0.06),inset_0_2px_2px_rgba(255,255,255,0.95)]'
              : 'text-slate-600 hover:text-[#00506E] hover:bg-white/60'
          }`}
        >
          <span>🧪</span>
          <span>Fat / SNF Distribution</span>
        </button>
        <button
          onClick={() => setActiveReport('ledger')}
          className={`px-3.5 py-2.5 rounded-t-xl transition-all duration-150 whitespace-nowrap flex items-center gap-1.5 font-bold ${
            activeReport === 'ledger'
              ? 'bg-white text-[#00506E] border-b-2 border-[#00506E] shadow-[0_-4px_12px_rgba(0,80,110,0.06),inset_0_2px_2px_rgba(255,255,255,0.95)]'
              : 'text-slate-600 hover:text-[#00506E] hover:bg-white/60'
          }`}
        >
          <span>📚</span>
          <span>Double-Entry Ledger</span>
        </button>
        <button
          onClick={() => setActiveReport('balances')}
          className={`px-3.5 py-2.5 rounded-t-xl transition-all duration-150 whitespace-nowrap flex items-center gap-1.5 font-bold ${
            activeReport === 'balances'
              ? 'bg-white text-[#00506E] border-b-2 border-[#00506E] shadow-[0_-4px_12px_rgba(0,80,110,0.06),inset_0_2px_2px_rgba(255,255,255,0.95)]'
              : 'text-slate-600 hover:text-[#00506E] hover:bg-white/60'
          }`}
        >
          <span>⚖️</span>
          <span>Customer Balances</span>
        </button>
        <button
          onClick={() => setActiveReport('payouts')}
          className={`px-3.5 py-2.5 rounded-t-xl transition-all duration-150 whitespace-nowrap flex items-center gap-1.5 font-bold ${
            activeReport === 'payouts'
              ? 'bg-white text-[#00506E] border-b-2 border-[#00506E] shadow-[0_-4px_12px_rgba(0,80,110,0.06),inset_0_2px_2px_rgba(255,255,255,0.95)]'
              : 'text-slate-600 hover:text-[#00506E] hover:bg-white/60'
          }`}
        >
          <span>💸</span>
          <span>Payout Disbursements</span>
        </button>
      </div>

      {/* Date Filters Bar */}
      <div className="clay-surface p-4 sm:p-5 flex flex-wrap items-center gap-4">
        {activeReport === 'daily' || activeReport === 'monthly' ? (
          <div className="flex items-center gap-2 bg-[#EDF2F7] px-3 py-1.5 rounded-xl border border-slate-200/80 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)]">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Target Date:</label>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="bg-white border border-white/80 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#00506E] cursor-pointer"
            />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-[#EDF2F7] px-3 py-1.5 rounded-xl border border-slate-200/80 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)]">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">From:</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-white border border-white/80 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#00506E] cursor-pointer"
              />
            </div>
            <div className="flex items-center gap-2 bg-[#EDF2F7] px-3 py-1.5 rounded-xl border border-slate-200/80 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)]">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">To:</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-white border border-white/80 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#00506E] cursor-pointer"
              />
            </div>
          </div>
        )}

        <ClayButton
          variant="secondary"
          size="sm"
          onClick={loadReport}
          icon={<span>🔄</span>}
        >
          Apply Filters
        </ClayButton>
      </div>

      {/* Dynamic Report Table */}
      <div className="clay-surface overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 bg-gradient-to-r from-slate-50/70 to-white">
          <div className="flex items-center gap-2">
            <span className="text-base">📑</span>
            <h2 className="font-black text-slate-800 text-sm tracking-tight capitalize">
              {activeReport.replace('_', ' ')} Data ({reportData.length} records)
            </h2>
          </div>
          <span className="text-[11px] font-bold text-slate-400">
            Source: Authoritative DB Ledger & Collections Aggregations
          </span>
        </div>

        <div className="overflow-x-auto max-h-[600px]">
          {loading ? (
            <div className="p-12 text-center text-slate-500">
              <div className="flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-wider">
                <span className="animate-spin inline-block mr-1">⏳</span> Aggregating authoritative report metrics...
              </div>
            </div>
          ) : reportData.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <div className="flex flex-col items-center justify-center space-y-2">
                <span className="text-3xl">📊</span>
                <p className="font-bold">No report records found for the chosen date range and center.</p>
                <p className="text-[11px] text-slate-400">Try choosing a different date range or verifying intake operations.</p>
              </div>
            </div>
          ) : (
            <table className="w-full text-left text-xs sm:text-sm text-slate-600">
              <thead className="bg-[#F8FAFC] text-[11px] font-black text-slate-500 uppercase tracking-wider sticky top-0">
                <tr>
                  {Object.keys(reportData[0]).map((col) => (
                    <th key={col} className="px-4 py-3.5 whitespace-nowrap">
                      {col.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                {reportData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition-colors font-mono text-xs">
                    {Object.keys(reportData[0]).map((col) => {
                      const val = row[col];
                      const isNum = typeof val === 'number';
                      return (
                        <td
                          key={col}
                          className={`px-4 py-3 whitespace-nowrap ${isNum ? 'text-right font-black text-slate-900' : ''}`}
                        >
                          {isNum ? (val % 1 !== 0 ? val.toFixed(2) : val) : String(val ?? '—')}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
