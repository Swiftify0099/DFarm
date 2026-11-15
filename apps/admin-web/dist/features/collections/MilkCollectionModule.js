import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { collectionApi, } from '../../api/collectionApi.js';
import { StatCard } from '../../components/StatCard.js';
import { StatusBadge } from '../../components/Badge.js';
import { Modal } from '../../components/Modal.js';
import { SearchBar } from '../../components/SearchBar.js';
import { Pagination } from '../../components/Pagination.js';
import { ClayButton } from '../../components/ClayButton.js';
export const MilkCollectionModule = () => {
    const { currentCenterId, selectedShift, businessDate, hasRole } = useAuth();
    const { showToast } = useToast();
    // State
    const [loading, setLoading] = useState(true);
    const [shiftSummary, setShiftSummary] = useState(null);
    const [records, setRecords] = useState([]);
    const [filterShift, setFilterShift] = useState(selectedShift || 'ALL');
    const [filterCategory, setFilterCategory] = useState('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    const [dateFilter, setDateFilter] = useState(businessDate);
    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 15;
    // Modals
    const [receiptModalOpen, setReceiptModalOpen] = useState(false);
    const [receiptContent, setReceiptContent] = useState('');
    const [adjustModalOpen, setAdjustModalOpen] = useState(false);
    const [selectedRecord, setSelectedRecord] = useState(null);
    const [submittingAdjust, setSubmittingAdjust] = useState(false);
    const [adjustForm, setAdjustForm] = useState({
        adjustmentType: 'FAT_SNF_OVERRIDE',
        reason: '',
        adjustedNetWeight: undefined,
        adjustedFatPercentage: undefined,
        adjustedSnfPercentage: undefined,
    });
    const canAdjust = hasRole(['SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR']);
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const summaryShift = filterShift === 'ALL' ? undefined : filterShift;
            const [summaryRes, historyRes] = await Promise.all([
                collectionApi.getShiftSummary({
                    centerId: currentCenterId || undefined,
                    shift: summaryShift,
                    date: dateFilter,
                }).catch(() => null),
                collectionApi.getHistory({
                    centerId: currentCenterId || undefined,
                    date: dateFilter,
                    shift: summaryShift,
                }).catch(() => []),
            ]);
            if (summaryRes) {
                setShiftSummary(summaryRes);
            }
            setRecords(Array.isArray(historyRes) ? historyRes : []);
        }
        catch (err) {
            showToast(err.message || 'Failed to load milk collection records', 'error');
        }
        finally {
            setLoading(false);
        }
    }, [currentCenterId, filterShift, dateFilter, showToast]);
    useEffect(() => {
        loadData();
    }, [loadData]);
    // Filtered records
    const filteredRecords = records.filter(rec => {
        const matchesCategory = filterCategory === 'ALL' || rec.selected_milk_category === filterCategory;
        const matchesQuery = !searchQuery ||
            rec.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            rec.farmer_code?.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesQuery;
    });
    // Paginated records
    const paginatedRecords = filteredRecords.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    // Totals calculation from filtered
    const cowRecords = records.filter(r => r.selected_milk_category === 'COW');
    const buffaloRecords = records.filter(r => r.selected_milk_category === 'BUFFALO');
    const cowTotalWeight = cowRecords.reduce((sum, r) => sum + Number(r.net_weight || 0), 0);
    const buffaloTotalWeight = buffaloRecords.reduce((sum, r) => sum + Number(r.net_weight || 0), 0);
    const totalMilkValue = records.reduce((sum, r) => sum + Number(r.total_amount || 0), 0);
    // Actions
    const handleViewReceipt = async (record) => {
        try {
            const res = await collectionApi.getReceiptSlip(record.id);
            setReceiptContent(res.receiptText || 'Receipt data unavailable');
            setReceiptModalOpen(true);
        }
        catch (err) {
            showToast('Could not retrieve thermal receipt slip: ' + err.message, 'error');
        }
    };
    const handleOpenAdjust = (record) => {
        setSelectedRecord(record);
        setAdjustForm({
            adjustmentType: 'FAT_SNF_OVERRIDE',
            reason: '',
            adjustedNetWeight: Number(record.net_weight),
            adjustedFatPercentage: Number(record.fat_percentage),
            adjustedSnfPercentage: Number(record.snf_percentage),
        });
        setAdjustModalOpen(true);
    };
    const handleSaveAdjustment = async (e) => {
        e.preventDefault();
        if (!selectedRecord)
            return;
        if (!adjustForm.reason.trim()) {
            showToast('Audit Justification / Reason is mandatory for adjustments', 'warning');
            return;
        }
        setSubmittingAdjust(true);
        try {
            await collectionApi.adjustCollection(selectedRecord.id, adjustForm);
            showToast('Collection adjustment recorded and ledger updated successfully', 'success');
            setAdjustModalOpen(false);
            loadData();
        }
        catch (err) {
            showToast(err.message || 'Failed to submit supervisor adjustment', 'error');
        }
        finally {
            setSubmittingAdjust(false);
        }
    };
    return (_jsxs("div", { className: "space-y-6 select-none", children: [_jsxs("div", { className: "flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-200/80", children: [_jsxs("div", { children: [_jsxs("h1", { className: "text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2", children: [_jsx("span", { children: "\uD83E\uDD5B" }), _jsx("span", { children: "Milk Collection Management" })] }), _jsx("p", { className: "text-xs sm:text-sm text-slate-500 font-medium mt-1", children: "Live shift registers, intake history, quality metrics (FAT/SNF), and audited supervisor corrections." })] }), _jsxs("div", { className: "flex flex-wrap items-center gap-3", children: [_jsx("div", { className: "bg-[#EDF2F7] p-1 rounded-xl border border-slate-200/80 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)]", children: _jsx("input", { type: "date", value: dateFilter, onChange: (e) => setDateFilter(e.target.value), className: "px-3 py-1.5 border border-white/80 rounded-lg text-xs font-bold bg-white text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#00506E]" }) }), _jsx(ClayButton, { variant: "emerald", size: "sm", onClick: loadData, icon: _jsx("span", { children: "\uD83D\uDD04" }), children: "Refresh" })] })] }), _jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4", children: [_jsx(StatCard, { title: "Total Milk Received", value: `${(shiftSummary?.totalWeightKg ?? (cowTotalWeight + buffaloTotalWeight)).toFixed(2)} kg`, subtext: `${records.length} Intakes Recorded`, variant: "sky", icon: "\u2696\uFE0F" }), _jsx(StatCard, { title: "Cow Milk", value: `${cowTotalWeight.toFixed(2)} kg`, subtext: `${cowRecords.length} Cow Intakes`, variant: "emerald", icon: "\uD83D\uDC04" }), _jsx(StatCard, { title: "Buffalo Milk", value: `${buffaloTotalWeight.toFixed(2)} kg`, subtext: `${buffaloRecords.length} Buffalo Intakes`, variant: "indigo", icon: "\uD83D\uDC03" }), _jsx(StatCard, { title: "Total Shift Value", value: `₹${(shiftSummary?.totalAmount ?? totalMilkValue).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, subtext: `Avg FAT: ${(shiftSummary?.averageFat ?? 0).toFixed(2)}% | SNF: ${(shiftSummary?.averageSnf ?? 0).toFixed(2)}%`, variant: "amber", icon: "\uD83D\uDCB0" })] }), _jsxs("div", { className: "clay-surface p-4 sm:p-5 flex flex-col md:flex-row gap-4 items-center justify-between", children: [_jsx("div", { className: "w-full md:w-80", children: _jsx(SearchBar, { value: searchQuery, onChange: setSearchQuery, placeholder: "Search farmer code or name..." }) }), _jsxs("div", { className: "flex flex-wrap items-center gap-3 w-full md:w-auto", children: [_jsxs("div", { className: "flex items-center gap-2 bg-[#EDF2F7] px-3 py-1.5 rounded-xl border border-slate-200/80 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)]", children: [_jsx("label", { className: "text-[10px] font-black text-slate-500 uppercase tracking-wider", children: "Shift:" }), _jsxs("select", { value: filterShift, onChange: (e) => setFilterShift(e.target.value), className: "bg-white border border-white/80 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#00506E] cursor-pointer", children: [_jsx("option", { value: "ALL", children: "All Shifts" }), _jsx("option", { value: "MORNING", children: "Morning Shift" }), _jsx("option", { value: "EVENING", children: "Evening Shift" })] })] }), _jsxs("div", { className: "flex items-center gap-2 bg-[#EDF2F7] px-3 py-1.5 rounded-xl border border-slate-200/80 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)]", children: [_jsx("label", { className: "text-[10px] font-black text-slate-500 uppercase tracking-wider", children: "Category:" }), _jsxs("select", { value: filterCategory, onChange: (e) => setFilterCategory(e.target.value), className: "bg-white border border-white/80 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#00506E] cursor-pointer", children: [_jsx("option", { value: "ALL", children: "All Categories" }), _jsx("option", { value: "COW", children: "Cow Milk" }), _jsx("option", { value: "BUFFALO", children: "Buffalo Milk" })] })] })] })] }), _jsxs("div", { className: "clay-surface overflow-hidden", children: [_jsxs("div", { className: "p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 bg-gradient-to-r from-slate-50/70 to-white", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-base", children: "\uD83D\uDCCB" }), _jsxs("h2", { className: "font-black text-slate-800 text-sm tracking-tight", children: ["Collection Register (", filteredRecords.length, " records)"] })] }), _jsx("span", { className: "text-[11px] font-bold text-slate-400", children: "Hardware scale & analyzer values certified with authoritative pricing" })] }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-left text-xs sm:text-sm text-slate-600", children: [_jsx("thead", { className: "bg-[#F8FAFC] text-[11px] font-black text-slate-500 uppercase tracking-wider", children: _jsxs("tr", { children: [_jsx("th", { className: "px-4 py-3.5", children: "Time / Shift" }), _jsx("th", { className: "px-4 py-3.5", children: "Farmer" }), _jsx("th", { className: "px-4 py-3.5", children: "Type" }), _jsx("th", { className: "px-4 py-3.5 text-right", children: "Qty (Kg/L)" }), _jsx("th", { className: "px-4 py-3.5 text-right", children: "FAT %" }), _jsx("th", { className: "px-4 py-3.5 text-right", children: "SNF %" }), _jsx("th", { className: "px-4 py-3.5 text-right", children: "Rate (\u20B9)" }), _jsx("th", { className: "px-4 py-3.5 text-right", children: "Amount (\u20B9)" }), _jsx("th", { className: "px-4 py-3.5 text-center", children: "Source" }), _jsx("th", { className: "px-4 py-3.5 text-center", children: "Actions" })] }) }), _jsx("tbody", { className: "divide-y divide-slate-100 font-semibold text-slate-700", children: loading ? (_jsx("tr", { children: _jsx("td", { colSpan: 10, className: "px-4 py-12 text-center text-slate-500", children: _jsxs("div", { className: "flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-wider", children: [_jsx("span", { className: "animate-spin inline-block mr-1", children: "\u23F3" }), " Loading collection registers..."] }) }) })) : paginatedRecords.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 10, className: "px-4 py-12 text-center text-slate-500", children: _jsxs("div", { className: "flex flex-col items-center justify-center space-y-2", children: [_jsx("span", { className: "text-3xl", children: "\uD83E\uDD5B" }), _jsx("p", { className: "font-bold", children: "No milk collection records found for the selected date and filters." }), _jsx("p", { className: "text-[11px] text-slate-400", children: "Switch shifts or pick another date to inspect collections." })] }) }) })) : (paginatedRecords.map((rec) => (_jsxs("tr", { className: "hover:bg-slate-50/80 transition-colors", children: [_jsxs("td", { className: "px-4 py-3 whitespace-nowrap", children: [_jsx("div", { className: "font-black text-slate-900", children: rec.started_at ? new Date(rec.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—' }), _jsx("span", { className: `inline-block text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${rec.shift_type === 'MORNING' ? 'bg-[#FEF7E0] text-[#B06000]' : 'bg-[#E8F0FE] text-[#1A73E8]'}`, children: rec.shift_type })] }), _jsxs("td", { className: "px-4 py-3 whitespace-nowrap", children: [_jsx("div", { className: "font-black text-slate-900", children: rec.customer_name || 'Farmer' }), _jsx("div", { className: "text-[11px] font-mono text-slate-400 font-bold", children: rec.farmer_code })] }), _jsx("td", { className: "px-4 py-3 whitespace-nowrap", children: _jsx(StatusBadge, { status: rec.selected_milk_category }) }), _jsx("td", { className: "px-4 py-3 text-right font-black text-slate-900", children: Number(rec.net_weight).toFixed(2) }), _jsxs("td", { className: "px-4 py-3 text-right font-mono font-bold text-slate-800", children: [Number(rec.fat_percentage).toFixed(2), "%"] }), _jsxs("td", { className: "px-4 py-3 text-right font-mono font-bold text-slate-800", children: [Number(rec.snf_percentage).toFixed(2), "%"] }), _jsxs("td", { className: "px-4 py-3 text-right font-mono font-bold text-slate-700", children: ["\u20B9", Number(rec.applied_rate_per_unit).toFixed(2)] }), _jsxs("td", { className: "px-4 py-3 text-right font-black text-[#137333]", children: ["\u20B9", Number(rec.total_amount).toFixed(2)] }), _jsx("td", { className: "px-4 py-3 text-center whitespace-nowrap", children: _jsx("span", { className: "text-[10px] font-mono font-extrabold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200", children: rec.measurement_source || 'AUTO_BRIDGE' }) }), _jsx("td", { className: "px-4 py-3 text-center whitespace-nowrap", children: _jsxs("div", { className: "flex items-center justify-center gap-1.5", children: [_jsx("button", { onClick: () => handleViewReceipt(rec), title: "View Thermal Receipt Slip", className: "px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold shadow-sm transition active:translate-y-0.5", children: "\uD83E\uDDFE Slip" }), canAdjust && (_jsx("button", { onClick: () => handleOpenAdjust(rec), title: "Supervisor Correction or Reversal", className: "px-2.5 py-1 bg-white hover:bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold shadow-sm transition active:translate-y-0.5", children: "\u270F\uFE0F Adjust" }))] }) })] }, rec.id)))) })] }) }), _jsx(Pagination, { currentPage: currentPage, totalItems: filteredRecords.length, pageSize: pageSize, onPageChange: setCurrentPage })] }), _jsx(Modal, { isOpen: receiptModalOpen, onClose: () => setReceiptModalOpen(false), title: "Thermal Receipt Slip Preview (40-Col)", maxWidth: "md", children: _jsxs("div", { className: "space-y-4", children: [_jsx("div", { className: "bg-[#FFFDF6] p-5 rounded-2xl border border-amber-200/90 font-mono text-xs whitespace-pre-wrap leading-relaxed shadow-[inset_1.5px_1.5px_3px_rgba(0,0,0,0.04)] text-slate-800 overflow-x-auto", children: receiptContent }), _jsxs("div", { className: "flex justify-end gap-2.5 pt-2 border-t border-slate-100", children: [_jsx(ClayButton, { variant: "secondary", size: "sm", onClick: () => setReceiptModalOpen(false), children: "Close" }), _jsx(ClayButton, { variant: "emerald", size: "sm", onClick: () => window.print(), icon: _jsx("span", { children: "\uD83D\uDDA8\uFE0F" }), children: "Print Receipt" })] })] }) }), _jsx(Modal, { isOpen: adjustModalOpen, onClose: () => setAdjustModalOpen(false), title: `Supervisor Adjustment — Intake #${selectedRecord?.farmer_code}`, maxWidth: "lg", children: _jsxs("form", { onSubmit: handleSaveAdjustment, className: "space-y-4 text-xs", children: [_jsxs("div", { className: "bg-[#FFFDF5] border border-amber-200/90 rounded-2xl p-4 text-xs text-amber-900 leading-normal shadow-[inset_1px_1px_2px_rgba(255,255,255,0.9)]", children: [_jsx("strong", { className: "font-black", children: "Audited Operation:" }), " Adjustments to finalized collections will reverse the original ledger entry and post a differential adjusting journal. All changes require an audit justification."] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1", children: "Adjustment Type" }), _jsxs("select", { value: adjustForm.adjustmentType, onChange: (e) => setAdjustForm({ ...adjustForm, adjustmentType: e.target.value }), className: "w-full px-3 py-2.5 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E] cursor-pointer", children: [_jsx("option", { value: "FAT_SNF_OVERRIDE", children: "FAT / SNF Override (Recalculate Rate)" }), _jsx("option", { value: "WEIGHT_CORRECTION", children: "Weight Correction" }), _jsx("option", { value: "RATE_RECALCULATION", children: "Force Rate Recalculation" }), _jsx("option", { value: "COMPLETE_REVERSAL", children: "Complete Reversal (Cancel Intake)" })] })] }), adjustForm.adjustmentType !== 'COMPLETE_REVERSAL' && (_jsxs("div", { className: "grid grid-cols-3 gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1", children: "Weight (Kg)" }), _jsx("input", { type: "number", step: "0.01", value: adjustForm.adjustedNetWeight ?? '', onChange: (e) => setAdjustForm({ ...adjustForm, adjustedNetWeight: parseFloat(e.target.value) || 0 }), className: "w-full px-3 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]", required: true })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1", children: "FAT %" }), _jsx("input", { type: "number", step: "0.1", value: adjustForm.adjustedFatPercentage ?? '', onChange: (e) => setAdjustForm({ ...adjustForm, adjustedFatPercentage: parseFloat(e.target.value) || 0 }), className: "w-full px-3 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]", required: true })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1", children: "SNF %" }), _jsx("input", { type: "number", step: "0.1", value: adjustForm.adjustedSnfPercentage ?? '', onChange: (e) => setAdjustForm({ ...adjustForm, adjustedSnfPercentage: parseFloat(e.target.value) || 0 }), className: "w-full px-3 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]", required: true })] })] })), _jsxs("div", { children: [_jsxs("label", { className: "block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1", children: ["Audit Reason / Justification ", _jsx("span", { className: "text-rose-500", children: "*" })] }), _jsx("textarea", { rows: 3, value: adjustForm.reason, onChange: (e) => setAdjustForm({ ...adjustForm, reason: e.target.value }), placeholder: "e.g. Analyzer tube was recalibrated following reading divergence; approved by Center Manager.", className: "w-full px-3 py-2.5 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-medium text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500", required: true })] }), _jsxs("div", { className: "flex justify-end gap-2.5 pt-3 border-t border-slate-100", children: [_jsx(ClayButton, { type: "button", variant: "secondary", size: "sm", onClick: () => setAdjustModalOpen(false), children: "Cancel" }), _jsx(ClayButton, { type: "submit", variant: "brand", size: "sm", disabled: submittingAdjust, isLoading: submittingAdjust, children: "Confirm Adjustment" })] })] }) })] }));
};
//# sourceMappingURL=MilkCollectionModule.js.map