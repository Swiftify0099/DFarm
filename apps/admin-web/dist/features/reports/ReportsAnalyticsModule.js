import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { reportsApi } from '../../api/reportsApi.js';
export const ReportsAnalyticsModule = () => {
    const { currentCenterId, businessDate } = useAuth();
    const { showToast } = useToast();
    const [activeReport, setActiveReport] = useState('daily');
    const [loading, setLoading] = useState(true);
    const [reportData, setReportData] = useState([]);
    // Filter criteria
    const [filterDate, setFilterDate] = useState(businessDate);
    const [startDate, setStartDate] = useState(new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(businessDate);
    const loadReport = useCallback(async () => {
        setLoading(true);
        try {
            let res = [];
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
        }
        catch (err) {
            showToast('Error loading report: ' + err.message, 'error');
            setReportData([]);
        }
        finally {
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
            ...reportData.map(row => headers.map(field => JSON.stringify(row[field] ?? '')).join(',')),
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
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-gray-200", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold text-gray-900 tracking-tight", children: "\uD83D\uDCCA Authoritative Business Reports & Analytics" }), _jsx("p", { className: "text-sm text-gray-500 mt-1", children: "Authoritative backend aggregations, farmer summaries, Fat/SNF distributions, and double-entry ledger audits." })] }), _jsx("div", { className: "flex items-center gap-2", children: _jsx("button", { onClick: handleExportCsv, disabled: loading || reportData.length === 0, className: "px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium shadow-sm transition disabled:opacity-50", children: "\uD83D\uDCE5 Export CSV" }) })] }), _jsxs("div", { className: "flex border-b border-gray-200 overflow-x-auto space-x-2 pb-1 text-sm font-semibold", children: [_jsx("button", { onClick: () => setActiveReport('daily'), className: `px-3.5 py-2 rounded-t-lg transition whitespace-nowrap ${activeReport === 'daily'
                            ? 'bg-emerald-600 text-white shadow'
                            : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'}`, children: "\uD83D\uDCC5 Daily Collections" }), _jsx("button", { onClick: () => setActiveReport('monthly'), className: `px-3.5 py-2 rounded-t-lg transition whitespace-nowrap ${activeReport === 'monthly'
                            ? 'bg-emerald-600 text-white shadow'
                            : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'}`, children: "\uD83D\uDDD3\uFE0F Monthly Collections" }), _jsx("button", { onClick: () => setActiveReport('farmer'), className: `px-3.5 py-2 rounded-t-lg transition whitespace-nowrap ${activeReport === 'farmer'
                            ? 'bg-emerald-600 text-white shadow'
                            : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'}`, children: "\uD83E\uDDD1\u200D\uD83C\uDF3E Farmer-wise Summary" }), _jsx("button", { onClick: () => setActiveReport('cow_buffalo'), className: `px-3.5 py-2 rounded-t-lg transition whitespace-nowrap ${activeReport === 'cow_buffalo'
                            ? 'bg-emerald-600 text-white shadow'
                            : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'}`, children: "\uD83D\uDC04 Cow vs Buffalo" }), _jsx("button", { onClick: () => setActiveReport('fat_snf'), className: `px-3.5 py-2 rounded-t-lg transition whitespace-nowrap ${activeReport === 'fat_snf'
                            ? 'bg-emerald-600 text-white shadow'
                            : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'}`, children: "\uD83E\uDDEA Fat / SNF Distribution" }), _jsx("button", { onClick: () => setActiveReport('ledger'), className: `px-3.5 py-2 rounded-t-lg transition whitespace-nowrap ${activeReport === 'ledger'
                            ? 'bg-emerald-600 text-white shadow'
                            : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'}`, children: "\uD83D\uDCDA Double-Entry Ledger" }), _jsx("button", { onClick: () => setActiveReport('balances'), className: `px-3.5 py-2 rounded-t-lg transition whitespace-nowrap ${activeReport === 'balances'
                            ? 'bg-emerald-600 text-white shadow'
                            : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'}`, children: "\u2696\uFE0F Customer Balances" }), _jsx("button", { onClick: () => setActiveReport('payouts'), className: `px-3.5 py-2 rounded-t-lg transition whitespace-nowrap ${activeReport === 'payouts'
                            ? 'bg-emerald-600 text-white shadow'
                            : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'}`, children: "\uD83D\uDCB8 Payout Disbursements" })] }), _jsxs("div", { className: "bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-wrap items-center gap-4", children: [activeReport === 'daily' || activeReport === 'monthly' ? (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("label", { className: "text-xs font-semibold text-gray-500 uppercase", children: "Target Date:" }), _jsx("input", { type: "date", value: filterDate, onChange: (e) => setFilterDate(e.target.value), className: "px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white font-medium" })] })) : (_jsxs("div", { className: "flex flex-wrap items-center gap-4", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("label", { className: "text-xs font-semibold text-gray-500 uppercase", children: "From:" }), _jsx("input", { type: "date", value: startDate, onChange: (e) => setStartDate(e.target.value), className: "px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white font-medium" })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("label", { className: "text-xs font-semibold text-gray-500 uppercase", children: "To:" }), _jsx("input", { type: "date", value: endDate, onChange: (e) => setEndDate(e.target.value), className: "px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white font-medium" })] })] })), _jsx("button", { onClick: loadReport, className: "px-3.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-sm font-medium transition", children: "\uD83D\uDD04 Apply Filters" })] }), _jsxs("div", { className: "bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden", children: [_jsxs("div", { className: "p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50", children: [_jsxs("h2", { className: "font-semibold text-gray-800 text-sm capitalize", children: [activeReport.replace('_', ' '), " Data (", reportData.length, " records)"] }), _jsx("span", { className: "text-xs text-gray-500", children: "Source: Authoritative DB Ledger & Collections Aggregations" })] }), _jsx("div", { className: "overflow-x-auto max-h-[600px]", children: loading ? (_jsxs("div", { className: "p-12 text-center text-gray-500", children: [_jsx("span", { className: "animate-spin inline-block mr-2", children: "\u23F3" }), " Aggregating authoritative report metrics..."] })) : reportData.length === 0 ? (_jsx("div", { className: "p-12 text-center text-gray-500", children: "No report records found for the chosen date range and center." })) : (_jsxs("table", { className: "w-full text-left text-sm text-gray-600", children: [_jsx("thead", { className: "bg-gray-100 text-xs font-semibold text-gray-700 uppercase tracking-wider sticky top-0", children: _jsx("tr", { children: Object.keys(reportData[0]).map((col) => (_jsx("th", { className: "px-4 py-3 whitespace-nowrap", children: col.replace(/_/g, ' ') }, col))) }) }), _jsx("tbody", { className: "divide-y divide-gray-200", children: reportData.map((row, idx) => (_jsx("tr", { className: "hover:bg-gray-50 transition font-mono text-xs", children: Object.keys(reportData[0]).map((col) => {
                                            const val = row[col];
                                            const isNum = typeof val === 'number';
                                            return (_jsx("td", { className: `px-4 py-2.5 whitespace-nowrap ${isNum ? 'text-right' : ''}`, children: isNum ? (val % 1 !== 0 ? val.toFixed(2) : val) : String(val ?? '—') }, col));
                                        }) }, idx))) })] })) })] })] }));
};
//# sourceMappingURL=ReportsAnalyticsModule.js.map