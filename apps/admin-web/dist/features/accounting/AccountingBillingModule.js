import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { billingApi, } from '../../api/billingApi.js';
import { StatusBadge } from '../../components/Badge.js';
import { Modal } from '../../components/Modal.js';
import { Pagination } from '../../components/Pagination.js';
import { ClayButton } from '../../components/ClayButton.js';
export const AccountingBillingModule = () => {
    const { currentCenterId, hasRole } = useAuth();
    const { showToast } = useToast();
    const isOwnerOrAdmin = hasRole(['SUPER_ADMIN', 'DAIRY_OWNER']);
    const isAccountantOrManager = hasRole(['SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'ACCOUNTANT']);
    // Tabs
    const [activeTab, setActiveTab] = useState('billing');
    // Billing Periods & Bills State
    const [loading, setLoading] = useState(true);
    const [periods, setPeriods] = useState([]);
    const [selectedPeriod, setSelectedPeriod] = useState(null);
    const [bills, setBills] = useState([]);
    const [generatingBills, setGeneratingBills] = useState(false);
    // New Billing Period Modal
    const [createPeriodModalOpen, setCreatePeriodModalOpen] = useState(false);
    const [periodForm, setPeriodForm] = useState({
        periodName: 'Cycle 1 (Nov 2026)',
        periodType: 'TEN_DAY',
        startDate: new Date().toISOString().split('T')[0] || '',
        endDate: new Date().toISOString().split('T')[0] || '',
    });
    // Bill Adjust Modal
    const [adjustModalOpen, setAdjustModalOpen] = useState(false);
    const [selectedBill, setSelectedBill] = useState(null);
    const [billAdjustForm, setBillAdjustForm] = useState({
        adjustmentType: 'CREDIT_BONUS',
        amount: 0,
        reason: '',
    });
    // Pagination for bills
    const [billPage, setBillPage] = useState(1);
    const pageSize = 15;
    // Load Billing Periods
    const loadBillingData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await billingApi.listPeriods({ centerId: currentCenterId || undefined });
            const pList = Array.isArray(res) ? res : (res?.periods || []);
            setPeriods(pList);
            if (pList.length > 0 && !selectedPeriod) {
                setSelectedPeriod(pList[0] || null);
            }
        }
        catch (err) {
            showToast('Failed to load billing periods: ' + err.message, 'error');
        }
        finally {
            setLoading(false);
        }
    }, [currentCenterId, selectedPeriod, showToast]);
    // Load Bills for selected period
    const loadPeriodBills = useCallback(async (periodId) => {
        try {
            const res = await billingApi.getPeriod(periodId);
            const billsList = res?.bills || res?.data?.bills || [];
            setBills(Array.isArray(billsList) ? billsList : []);
        }
        catch (err) {
            showToast('Failed to load period bills: ' + err.message, 'error');
        }
    }, [showToast]);
    useEffect(() => {
        loadBillingData();
    }, [loadBillingData]);
    useEffect(() => {
        if (selectedPeriod) {
            loadPeriodBills(selectedPeriod.id);
        }
    }, [selectedPeriod, loadPeriodBills]);
    // Handle Bill Generation
    const handleGenerateBills = async () => {
        if (!selectedPeriod)
            return;
        setGeneratingBills(true);
        try {
            await billingApi.generateBills(selectedPeriod.id, { forceRecalculate: true });
            showToast('Bill generation triggered successfully! Refreshing...', 'success');
            loadPeriodBills(selectedPeriod.id);
            loadBillingData();
        }
        catch (err) {
            showToast('Bill generation failed: ' + err.message, 'error');
        }
        finally {
            setGeneratingBills(false);
        }
    };
    // Create Billing Period
    const handleCreatePeriod = async (e) => {
        e.preventDefault();
        if (!currentCenterId) {
            showToast('Please select a Center from the top bar before creating billing periods', 'warning');
            return;
        }
        try {
            await billingApi.createPeriod({
                centerId: currentCenterId,
                periodName: periodForm.periodName,
                periodType: periodForm.periodType,
                startDate: periodForm.startDate,
                endDate: periodForm.endDate,
            });
            showToast('Billing period initialized successfully', 'success');
            setCreatePeriodModalOpen(false);
            loadBillingData();
        }
        catch (err) {
            showToast('Create period error: ' + err.message, 'error');
        }
    };
    // Actions on individual bills
    const handleSubmitBill = async (billId) => {
        try {
            await billingApi.submitReview(billId);
            showToast('Bill submitted for review', 'success');
            if (selectedPeriod)
                loadPeriodBills(selectedPeriod.id);
        }
        catch (err) {
            showToast('Submit failed: ' + err.message, 'error');
        }
    };
    const handleApproveBill = async (billId) => {
        try {
            await billingApi.approveBill(billId);
            showToast('Bill approved', 'success');
            if (selectedPeriod)
                loadPeriodBills(selectedPeriod.id);
        }
        catch (err) {
            showToast('Approve failed: ' + err.message, 'error');
        }
    };
    const handleFinalizeBill = async (billId) => {
        if (!window.confirm('Finalizing a bill freezes all calculations and locks financial ledgers. Continue?'))
            return;
        try {
            await billingApi.finalizeBill(billId);
            showToast('Bill FINALIZED! Cryptographic checksum posted.', 'success');
            if (selectedPeriod)
                loadPeriodBills(selectedPeriod.id);
        }
        catch (err) {
            showToast('Finalize failed: ' + err.message, 'error');
        }
    };
    const handleDownloadPdf = async (bill) => {
        try {
            await billingApi.downloadPdf(bill.id, bill.billNumber);
            showToast(`Statement PDF downloaded for ${bill.billNumber}`, 'success');
        }
        catch (err) {
            showToast('Failed to download PDF: ' + err.message, 'error');
        }
    };
    const handleOpenAdjust = (bill) => {
        setSelectedBill(bill);
        setBillAdjustForm({ adjustmentType: 'CREDIT_BONUS', amount: 0, reason: '' });
        setAdjustModalOpen(true);
    };
    const handleSaveBillAdjustment = async (e) => {
        e.preventDefault();
        if (!selectedBill)
            return;
        if (!billAdjustForm.reason.trim()) {
            showToast('Mandatory audit reason required', 'warning');
            return;
        }
        try {
            await billingApi.adjustBill(selectedBill.id, billAdjustForm);
            showToast('Bill adjusted and ledger entries updated', 'success');
            setAdjustModalOpen(false);
            if (selectedPeriod)
                loadPeriodBills(selectedPeriod.id);
        }
        catch (err) {
            showToast('Adjustment failed: ' + err.message, 'error');
        }
    };
    // Paginated Bills
    const paginatedBills = bills.slice((billPage - 1) * pageSize, billPage * pageSize);
    return (_jsxs("div", { className: "space-y-6 select-none", children: [_jsxs("div", { className: "flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-200/80", children: [_jsxs("div", { children: [_jsxs("h1", { className: "text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2", children: [_jsx("span", { children: "\uD83D\uDCBC" }), _jsx("span", { children: "Accounting, Billing & Payouts" })] }), _jsx("p", { className: "text-xs sm:text-sm text-slate-500 font-medium mt-1", children: "Authoritative billing cycles, four-eye disbursement workflows, automatic feed & advance deductions, and PDF statements." })] }), _jsx("div", { className: "flex items-center gap-2", children: activeTab === 'billing' && isAccountantOrManager && (_jsx(ClayButton, { variant: "brand", size: "sm", onClick: () => setCreatePeriodModalOpen(true), icon: _jsx("span", { className: "text-base font-bold", children: "+" }), children: "New Billing Period" })) })] }), _jsxs("div", { className: "flex border-b border-slate-200/80 overflow-x-auto space-x-2 pb-1 text-sm font-semibold", children: [_jsxs("button", { onClick: () => setActiveTab('billing'), className: `px-4 py-2.5 rounded-t-xl transition-all duration-150 whitespace-nowrap flex items-center gap-2 font-bold ${activeTab === 'billing'
                            ? 'bg-white text-[#00506E] border-b-2 border-[#00506E] shadow-[0_-4px_12px_rgba(0,80,110,0.06),inset_0_2px_2px_rgba(255,255,255,0.95)]'
                            : 'text-slate-600 hover:text-[#00506E] hover:bg-white/60'}`, children: [_jsx("span", { children: "\uD83E\uDDFE" }), _jsx("span", { children: "Billing Periods & Invoices" })] }), _jsxs("button", { onClick: () => setActiveTab('payouts'), className: `px-4 py-2.5 rounded-t-xl transition-all duration-150 whitespace-nowrap flex items-center gap-2 font-bold ${activeTab === 'payouts'
                            ? 'bg-white text-[#00506E] border-b-2 border-[#00506E] shadow-[0_-4px_12px_rgba(0,80,110,0.06),inset_0_2px_2px_rgba(255,255,255,0.95)]'
                            : 'text-slate-600 hover:text-[#00506E] hover:bg-white/60'}`, children: [_jsx("span", { children: "\uD83D\uDCB8" }), _jsx("span", { children: "Payout Vouchers" })] }), _jsxs("button", { onClick: () => setActiveTab('advances'), className: `px-4 py-2.5 rounded-t-xl transition-all duration-150 whitespace-nowrap flex items-center gap-2 font-bold ${activeTab === 'advances'
                            ? 'bg-white text-[#00506E] border-b-2 border-[#00506E] shadow-[0_-4px_12px_rgba(0,80,110,0.06),inset_0_2px_2px_rgba(255,255,255,0.95)]'
                            : 'text-slate-600 hover:text-[#00506E] hover:bg-white/60'}`, children: [_jsx("span", { children: "\uD83E\uDD1D" }), _jsx("span", { children: "Customer Advances" })] }), _jsxs("button", { onClick: () => setActiveTab('batches'), className: `px-4 py-2.5 rounded-t-xl transition-all duration-150 whitespace-nowrap flex items-center gap-2 font-bold ${activeTab === 'batches'
                            ? 'bg-white text-[#00506E] border-b-2 border-[#00506E] shadow-[0_-4px_12px_rgba(0,80,110,0.06),inset_0_2px_2px_rgba(255,255,255,0.95)]'
                            : 'text-slate-600 hover:text-[#00506E] hover:bg-white/60'}`, children: [_jsx("span", { children: "\uD83D\uDCE6" }), _jsx("span", { children: "Bulk Payment Batches" })] })] }), activeTab === 'billing' && (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "clay-surface p-5 flex flex-col md:flex-row items-center justify-between gap-4", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-3 w-full md:w-auto", children: [_jsx("label", { className: "text-[10px] font-black text-slate-500 uppercase tracking-wider", children: "Selected Period:" }), _jsx("select", { value: selectedPeriod?.id || '', onChange: (e) => {
                                            const p = periods.find(item => item.id === e.target.value);
                                            setSelectedPeriod(p || null);
                                        }, className: "px-3.5 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E] cursor-pointer", children: periods.map(p => (_jsxs("option", { value: p.id, children: [p.periodName, " (", new Date(p.startDate).toLocaleDateString(), " \u2013 ", new Date(p.endDate).toLocaleDateString(), ") [", p.status, "]"] }, p.id))) }), selectedPeriod && _jsx(StatusBadge, { status: selectedPeriod.status })] }), selectedPeriod && isAccountantOrManager && selectedPeriod.status !== 'FINALIZED' && (_jsx(ClayButton, { variant: "brand", size: "sm", onClick: handleGenerateBills, disabled: generatingBills, isLoading: generatingBills, icon: _jsx("span", { children: "\u26A1" }), children: "Generate / Recalculate Bills" }))] }), selectedPeriod && (_jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4", children: [_jsxs("div", { className: "clay-surface p-5 border border-sky-100/90 shadow-[8px_12px_24px_-4px_rgba(2,132,199,0.08),inset_1px_1px_2px_rgba(255,255,255,0.95)]", children: [_jsx("span", { className: "text-[10px] text-slate-500 font-extrabold uppercase tracking-wider", children: "Total Milk Quantity" }), _jsxs("div", { className: "text-2xl font-black text-slate-900 mt-1", children: [Number(selectedPeriod.totalQuantityLiters || 0).toFixed(2), " L"] }), _jsxs("span", { className: "text-xs text-slate-400 font-mono font-bold mt-1 block", children: [selectedPeriod.totalBills || bills.length, " Bills Processed"] })] }), _jsxs("div", { className: "clay-surface p-5 border border-emerald-100/90 shadow-[8px_12px_24px_-4px_rgba(5,150,105,0.08),inset_1px_1px_2px_rgba(255,255,255,0.95)]", children: [_jsx("span", { className: "text-[10px] text-slate-500 font-extrabold uppercase tracking-wider", children: "Gross Milk Value" }), _jsxs("div", { className: "text-2xl font-black text-slate-900 mt-1", children: ["\u20B9", Number(selectedPeriod.totalGrossAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })] }), _jsx("span", { className: "text-xs text-[#137333] font-bold mt-1 block", children: "Before Feed & Advance Deductions" })] }), _jsxs("div", { className: "clay-surface p-5 border border-rose-100/90 shadow-[8px_12px_24px_-4px_rgba(225,29,72,0.08),inset_1px_1px_2px_rgba(255,255,255,0.95)]", children: [_jsx("span", { className: "text-[10px] text-slate-500 font-extrabold uppercase tracking-wider", children: "Total Deductions" }), _jsxs("div", { className: "text-2xl font-black text-[#C5221F] mt-1", children: ["\u20B9", Number(selectedPeriod.totalDeductions || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })] }), _jsx("span", { className: "text-xs text-slate-500 font-semibold mt-1 block", children: "Feed POS + Advance Recovery" })] }), _jsxs("div", { className: "clay-surface p-5 border border-emerald-100/90 shadow-[8px_12px_24px_-4px_rgba(5,150,105,0.08),inset_1px_1px_2px_rgba(255,255,255,0.95)]", children: [_jsx("span", { className: "text-[10px] text-slate-500 font-extrabold uppercase tracking-wider", children: "Net Payable to Farmers" }), _jsxs("div", { className: "text-2xl font-black text-[#137333] mt-1", children: ["\u20B9", Number(selectedPeriod.totalNetAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })] }), _jsx("span", { className: "text-xs text-slate-500 font-semibold mt-1 block", children: "Ready for disbursement batch" })] })] })), _jsxs("div", { className: "clay-surface overflow-hidden", children: [_jsxs("div", { className: "p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 bg-gradient-to-r from-slate-50/70 to-white", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-base", children: "\uD83D\uDCD1" }), _jsxs("h3", { className: "font-black text-slate-800 text-sm tracking-tight", children: ["Farmer Bill Statements (", bills.length, " farmers)"] })] }), _jsx("span", { className: "text-[11px] font-bold text-slate-400", children: "Authoritative double-entry settlement statements" })] }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-left text-xs sm:text-sm text-slate-600", children: [_jsx("thead", { className: "bg-[#F8FAFC] text-[11px] font-black text-slate-500 uppercase tracking-wider", children: _jsxs("tr", { children: [_jsx("th", { className: "px-4 py-3.5", children: "Bill #" }), _jsx("th", { className: "px-4 py-3.5", children: "Farmer" }), _jsx("th", { className: "px-4 py-3.5 text-right", children: "Milk Qty (L)" }), _jsx("th", { className: "px-4 py-3.5 text-right", children: "Gross (\u20B9)" }), _jsx("th", { className: "px-4 py-3.5 text-right", children: "Feed Ded (\u20B9)" }), _jsx("th", { className: "px-4 py-3.5 text-right", children: "Adv Ded (\u20B9)" }), _jsx("th", { className: "px-4 py-3.5 text-right", children: "Net Payable (\u20B9)" }), _jsx("th", { className: "px-4 py-3.5 text-center", children: "Status" }), _jsx("th", { className: "px-4 py-3.5 text-right", children: "Actions" })] }) }), _jsx("tbody", { className: "divide-y divide-slate-100 font-semibold text-slate-700", children: loading ? (_jsx("tr", { children: _jsx("td", { colSpan: 9, className: "px-4 py-12 text-center text-slate-500 font-bold", children: "Loading farmer statements..." }) })) : paginatedBills.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 9, className: "px-4 py-12 text-center text-slate-500", children: _jsxs("div", { className: "flex flex-col items-center justify-center space-y-2", children: [_jsx("span", { className: "text-3xl", children: "\uD83E\uDDFE" }), _jsx("p", { className: "font-bold", children: "No bills generated for this billing period yet." }), _jsx("p", { className: "text-[11px] text-slate-400", children: "Click \"Generate Bills\" above to calculate settlements." })] }) }) })) : (paginatedBills.map((b) => (_jsxs("tr", { className: "hover:bg-slate-50/80 transition-colors", children: [_jsx("td", { className: "px-4 py-3 font-mono font-black text-xs text-slate-800 whitespace-nowrap", children: b.billNumber }), _jsxs("td", { className: "px-4 py-3 whitespace-nowrap", children: [_jsx("div", { className: "font-black text-slate-900", children: b.customerName || 'Farmer' }), _jsx("div", { className: "text-[11px] font-mono text-slate-400 font-bold", children: b.farmerCode })] }), _jsx("td", { className: "px-4 py-3 text-right font-black text-slate-900", children: Number(b.totalQuantityLiters).toFixed(2) }), _jsxs("td", { className: "px-4 py-3 text-right font-mono font-bold text-slate-700", children: ["\u20B9", Number(b.grossAmount).toFixed(2)] }), _jsxs("td", { className: "px-4 py-3 text-right font-mono font-black text-[#C5221F]", children: ["-\u20B9", Number(b.feedDeductions || 0).toFixed(2)] }), _jsxs("td", { className: "px-4 py-3 text-right font-mono font-black text-[#B06000]", children: ["-\u20B9", Number(b.advanceDeductions || 0).toFixed(2)] }), _jsxs("td", { className: "px-4 py-3 text-right font-black font-mono text-[#137333]", children: ["\u20B9", Number(b.netPayableAmount).toFixed(2)] }), _jsx("td", { className: "px-4 py-3 text-center", children: _jsx(StatusBadge, { status: b.status }) }), _jsx("td", { className: "px-4 py-3 text-right whitespace-nowrap", children: _jsxs("div", { className: "flex items-center justify-end gap-1.5", children: [_jsx("button", { onClick: () => handleDownloadPdf(b), title: "Download PDF Statement", className: "px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold shadow-sm transition active:translate-y-0.5", children: "\uD83D\uDCC4 PDF" }), b.status === 'DRAFT' && isAccountantOrManager && (_jsxs(_Fragment, { children: [_jsx("button", { onClick: () => handleOpenAdjust(b), className: "px-2.5 py-1 bg-white hover:bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold shadow-sm transition active:translate-y-0.5", children: "\u270F\uFE0F Adjust" }), _jsx("button", { onClick: () => handleSubmitBill(b.id), className: "px-2.5 py-1 bg-[#00506E] hover:bg-[#003B52] text-white rounded-lg text-xs font-bold shadow-sm transition active:translate-y-0.5", children: "Submit" })] })), b.status === 'SUBMITTED' && isAccountantOrManager && (_jsx("button", { onClick: () => handleApproveBill(b.id), className: "px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-sm transition active:translate-y-0.5", children: "Approve" })), b.status === 'APPROVED' && isOwnerOrAdmin && (_jsx("button", { onClick: () => handleFinalizeBill(b.id), className: "px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition active:translate-y-0.5", children: "\uD83D\uDD12 Finalize" }))] }) })] }, b.id)))) })] }) }), _jsx(Pagination, { currentPage: billPage, totalItems: bills.length, pageSize: pageSize, onPageChange: setBillPage })] })] })), activeTab === 'payouts' && (_jsxs("div", { className: "clay-surface p-6 sm:p-8 space-y-4", children: [_jsxs("div", { className: "flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-slate-100", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-lg font-black text-slate-900 tracking-tight", children: "Direct Farmer Payouts" }), _jsx("p", { className: "text-xs text-slate-500 font-medium", children: "Record individual cash, UPI, or bank transfer payments to farmers." })] }), isAccountantOrManager && (_jsx(ClayButton, { variant: "brand", size: "sm", onClick: () => showToast('Select a farmer under Customer Directory to disburse individual payouts, or process via Bulk Batches.', 'info'), icon: _jsx("span", { className: "text-base font-bold", children: "+" }), children: "Record Direct Payout" }))] }), _jsx("div", { className: "p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200/80 shadow-[inset_1px_1px_2px_rgba(15,23,42,0.03)] text-xs text-slate-600 font-medium leading-relaxed", children: "Direct farmer disbursements are automatically recorded in the double-entry subledger against Account 2100 (Customer Payables). Select a farmer under Customer Directory or initiate via Bulk Batches." })] })), activeTab === 'advances' && (_jsxs("div", { className: "clay-surface p-6 sm:p-8 space-y-4", children: [_jsxs("div", { className: "flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-slate-100", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-lg font-black text-slate-900 tracking-tight", children: "Farmer Advances & Loan Recoveries" }), _jsx("p", { className: "text-xs text-slate-500 font-medium", children: "Track disbursed capital advances with automatic percentage recovery across subsequent milk billing cycles." })] }), isAccountantOrManager && (_jsx(ClayButton, { variant: "brand", size: "sm", onClick: () => showToast('Select a farmer under Customer Directory to disburse capital advances against their subledger.', 'info'), icon: _jsx("span", { className: "text-base font-bold", children: "+" }), children: "Disburse Advance" }))] }), _jsx("div", { className: "p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200/80 shadow-[inset_1px_1px_2px_rgba(15,23,42,0.03)] text-xs text-slate-600 font-medium leading-relaxed", children: "Approved advances deduct automatically up to the configured recovery percentage (e.g. 20%) during bill generation until the balance returns to zero." })] })), activeTab === 'batches' && (_jsxs("div", { className: "clay-surface p-6 sm:p-8 space-y-4", children: [_jsx("div", { className: "flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-slate-100", children: _jsxs("div", { children: [_jsx("h2", { className: "text-lg font-black text-slate-900 tracking-tight", children: "Bulk Bank Payment Batches" }), _jsx("p", { className: "text-xs text-slate-500 font-medium", children: "Export NACH / NEFT batch files and reconcile settlement statuses." })] }) }), _jsx("div", { className: "p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200/80 shadow-[inset_1px_1px_2px_rgba(15,23,42,0.03)] text-xs text-slate-600 font-medium leading-relaxed", children: "Batches group all approved farmer bills for a period into a single settlement file for bank transmission." })] })), _jsx(Modal, { isOpen: createPeriodModalOpen, onClose: () => setCreatePeriodModalOpen(false), title: "Initialize New Billing Cycle", maxWidth: "md", children: _jsxs("form", { onSubmit: handleCreatePeriod, className: "space-y-4 text-xs", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1", children: "Cycle Name" }), _jsx("input", { type: "text", value: periodForm.periodName, onChange: (e) => setPeriodForm({ ...periodForm, periodName: e.target.value }), className: "w-full px-3 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]", required: true })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1", children: "Period Type" }), _jsxs("select", { value: periodForm.periodType, onChange: (e) => setPeriodForm({ ...periodForm, periodType: e.target.value }), className: "w-full px-3 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E] cursor-pointer", children: [_jsx("option", { value: "TEN_DAY", children: "10-Day Cycle (e.g. 1st\u201310th, 11th\u201320th, 21st\u2013End)" }), _jsx("option", { value: "MONTHLY", children: "Full Calendar Month" }), _jsx("option", { value: "CUSTOM", children: "Custom Date Window" })] })] }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1", children: "Start Date" }), _jsx("input", { type: "date", value: periodForm.startDate, onChange: (e) => setPeriodForm({ ...periodForm, startDate: e.target.value }), className: "w-full px-3 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]", required: true })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1", children: "End Date" }), _jsx("input", { type: "date", value: periodForm.endDate, onChange: (e) => setPeriodForm({ ...periodForm, endDate: e.target.value }), className: "w-full px-3 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]", required: true })] })] }), _jsxs("div", { className: "flex justify-end gap-2.5 pt-3 border-t border-slate-100", children: [_jsx(ClayButton, { type: "button", variant: "secondary", size: "sm", onClick: () => setCreatePeriodModalOpen(false), children: "Cancel" }), _jsx(ClayButton, { type: "submit", variant: "brand", size: "sm", children: "Initialize Period" })] })] }) }), _jsx(Modal, { isOpen: adjustModalOpen, onClose: () => setAdjustModalOpen(false), title: `Adjust Bill — ${selectedBill?.billNumber}`, maxWidth: "md", children: _jsxs("form", { onSubmit: handleSaveBillAdjustment, className: "space-y-4 text-xs", children: [_jsxs("div", { className: "bg-[#FFFDF5] border border-amber-200/90 rounded-2xl p-4 text-xs text-amber-900 shadow-sm leading-normal", children: [_jsx("strong", { className: "font-black", children: "Audited Ledger Mutation:" }), " Adjusting an invoice creates an auditable debit/credit voucher before finalization."] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1", children: "Adjustment Type" }), _jsxs("select", { value: billAdjustForm.adjustmentType, onChange: (e) => setBillAdjustForm({ ...billAdjustForm, adjustmentType: e.target.value }), className: "w-full px-3 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E] cursor-pointer", children: [_jsx("option", { value: "CREDIT_BONUS", children: "Quality Bonus / Incentive (+)" }), _jsx("option", { value: "DEBIT_FEE", children: "Special Administrative Charge (-)" }), _jsx("option", { value: "ROUNDING_CORRECTION", children: "Rounding Correction" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1", children: "Amount (\u20B9)" }), _jsx("input", { type: "number", step: "0.01", value: billAdjustForm.amount, onChange: (e) => setBillAdjustForm({ ...billAdjustForm, amount: parseFloat(e.target.value) || 0 }), className: "w-full px-3 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]", required: true })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1", children: "Audit Reason" }), _jsx("textarea", { rows: 3, value: billAdjustForm.reason, onChange: (e) => setBillAdjustForm({ ...billAdjustForm, reason: e.target.value }), placeholder: "e.g. Quality premium bonus authorized by dairy management.", className: "w-full px-3 py-2.5 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-medium text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500", required: true })] }), _jsxs("div", { className: "flex justify-end gap-2.5 pt-3 border-t border-slate-100", children: [_jsx(ClayButton, { type: "button", variant: "secondary", size: "sm", onClick: () => setAdjustModalOpen(false), children: "Cancel" }), _jsx(ClayButton, { type: "submit", variant: "brand", size: "sm", children: "Apply Adjustment" })] })] }) })] }));
};
//# sourceMappingURL=AccountingBillingModule.js.map