import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { reportsApi } from '../../api/reportsApi.js';

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">📊 Authoritative Business Reports & Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">
            Authoritative backend aggregations, farmer summaries, Fat/SNF distributions, and double-entry ledger audits.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            disabled={loading || reportData.length === 0}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium shadow-sm transition disabled:opacity-50"
          >
            📥 Export CSV
          </button>
        </div>
      </div>

      {/* Report Selection Tabs */}
      <div className="flex border-b border-gray-200 overflow-x-auto space-x-2 pb-1 text-sm font-semibold">
        <button
          onClick={() => setActiveReport('daily')}
          className={`px-3.5 py-2 rounded-t-lg transition whitespace-nowrap ${
            activeReport === 'daily'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'
          }`}
        >
          📅 Daily Collections
        </button>
        <button
          onClick={() => setActiveReport('monthly')}
          className={`px-3.5 py-2 rounded-t-lg transition whitespace-nowrap ${
            activeReport === 'monthly'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'
          }`}
        >
          🗓️ Monthly Collections
        </button>
        <button
          onClick={() => setActiveReport('farmer')}
          className={`px-3.5 py-2 rounded-t-lg transition whitespace-nowrap ${
            activeReport === 'farmer'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'
          }`}
        >
          🧑‍🌾 Farmer-wise Summary
        </button>
        <button
          onClick={() => setActiveReport('cow_buffalo')}
          className={`px-3.5 py-2 rounded-t-lg transition whitespace-nowrap ${
            activeReport === 'cow_buffalo'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'
          }`}
        >
          🐄 Cow vs Buffalo
        </button>
        <button
          onClick={() => setActiveReport('fat_snf')}
          className={`px-3.5 py-2 rounded-t-lg transition whitespace-nowrap ${
            activeReport === 'fat_snf'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'
          }`}
        >
          🧪 Fat / SNF Distribution
        </button>
        <button
          onClick={() => setActiveReport('ledger')}
          className={`px-3.5 py-2 rounded-t-lg transition whitespace-nowrap ${
            activeReport === 'ledger'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'
          }`}
        >
          📚 Double-Entry Ledger
        </button>
        <button
          onClick={() => setActiveReport('balances')}
          className={`px-3.5 py-2 rounded-t-lg transition whitespace-nowrap ${
            activeReport === 'balances'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'
          }`}
        >
          ⚖️ Customer Balances
        </button>
        <button
          onClick={() => setActiveReport('payouts')}
          className={`px-3.5 py-2 rounded-t-lg transition whitespace-nowrap ${
            activeReport === 'payouts'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'
          }`}
        >
          💸 Payout Disbursements
        </button>
      </div>

      {/* Date Filters Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-wrap items-center gap-4">
        {activeReport === 'daily' || activeReport === 'monthly' ? (
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase">Target Date:</label>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white font-medium"
            />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-500 uppercase">From:</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white font-medium"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-500 uppercase">To:</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white font-medium"
              />
            </div>
          </div>
        )}

        <button
          onClick={loadReport}
          className="px-3.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-sm font-medium transition"
        >
          🔄 Apply Filters
        </button>
      </div>

      {/* Dynamic Report Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
          <h2 className="font-semibold text-gray-800 text-sm capitalize">
            {activeReport.replace('_', ' ')} Data ({reportData.length} records)
          </h2>
          <span className="text-xs text-gray-500">
            Source: Authoritative DB Ledger & Collections Aggregations
          </span>
        </div>

        <div className="overflow-x-auto max-h-[600px]">
          {loading ? (
            <div className="p-12 text-center text-gray-500">
              <span className="animate-spin inline-block mr-2">⏳</span> Aggregating authoritative report metrics...
            </div>
          ) : reportData.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              No report records found for the chosen date range and center.
            </div>
          ) : (
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-100 text-xs font-semibold text-gray-700 uppercase tracking-wider sticky top-0">
                <tr>
                  {Object.keys(reportData[0]).map((col) => (
                    <th key={col} className="px-4 py-3 whitespace-nowrap">
                      {col.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {reportData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 transition font-mono text-xs">
                    {Object.keys(reportData[0]).map((col) => {
                      const val = row[col];
                      const isNum = typeof val === 'number';
                      return (
                        <td
                          key={col}
                          className={`px-4 py-2.5 whitespace-nowrap ${isNum ? 'text-right' : ''}`}
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
