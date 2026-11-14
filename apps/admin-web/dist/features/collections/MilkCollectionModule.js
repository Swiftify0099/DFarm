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
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-gray-200", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold text-gray-900 tracking-tight", children: "\uD83E\uDD5B Milk Collection Management" }), _jsx("p", { className: "text-sm text-gray-500 mt-1", children: "Live shift registers, intake history, quality metrics (FAT/SNF), and audited supervisor corrections." })] }), _jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx("input", { type: "date", value: dateFilter, onChange: (e) => setDateFilter(e.target.value), className: "px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white font-medium text-gray-700 shadow-sm" }), _jsx("button", { onClick: loadData, className: "px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium shadow-sm transition", children: "\uD83D\uDD04 Refresh" })] })] }), _jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4", children: [_jsx(StatCard, { title: "Total Milk Received", value: `${(shiftSummary?.totalWeightKg ?? (cowTotalWeight + buffaloTotalWeight)).toFixed(2)} kg`, subtext: `${records.length} Intakes Recorded`, variant: "sky", icon: "\u2696\uFE0F" }), _jsx(StatCard, { title: "Cow Milk", value: `${cowTotalWeight.toFixed(2)} kg`, subtext: `${cowRecords.length} Cow Intakes`, variant: "emerald", icon: "\uD83D\uDC04" }), _jsx(StatCard, { title: "Buffalo Milk", value: `${buffaloTotalWeight.toFixed(2)} kg`, subtext: `${buffaloRecords.length} Buffalo Intakes`, variant: "indigo", icon: "\uD83D\uDC03" }), _jsx(StatCard, { title: "Total Shift Value", value: `₹${(shiftSummary?.totalAmount ?? totalMilkValue).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, subtext: `Avg FAT: ${(shiftSummary?.averageFat ?? 0).toFixed(2)}% | SNF: ${(shiftSummary?.averageSnf ?? 0).toFixed(2)}%`, variant: "amber", icon: "\uD83D\uDCB0" })] }), _jsxs("div", { className: "bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row gap-4 items-center justify-between", children: [_jsx("div", { className: "w-full md:w-72", children: _jsx(SearchBar, { value: searchQuery, onChange: setSearchQuery, placeholder: "Search farmer code or name..." }) }), _jsxs("div", { className: "flex flex-wrap items-center gap-3 w-full md:w-auto", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("label", { className: "text-xs font-semibold text-gray-500 uppercase", children: "Shift:" }), _jsxs("select", { value: filterShift, onChange: (e) => setFilterShift(e.target.value), className: "px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-gray-50 font-medium text-gray-700", children: [_jsx("option", { value: "ALL", children: "All Shifts" }), _jsx("option", { value: "MORNING", children: "Morning Shift" }), _jsx("option", { value: "EVENING", children: "Evening Shift" })] })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("label", { className: "text-xs font-semibold text-gray-500 uppercase", children: "Category:" }), _jsxs("select", { value: filterCategory, onChange: (e) => setFilterCategory(e.target.value), className: "px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-gray-50 font-medium text-gray-700", children: [_jsx("option", { value: "ALL", children: "All Categories" }), _jsx("option", { value: "COW", children: "Cow Milk" }), _jsx("option", { value: "BUFFALO", children: "Buffalo Milk" })] })] })] })] }), _jsxs("div", { className: "bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden", children: [_jsxs("div", { className: "p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50", children: [_jsxs("h2", { className: "font-semibold text-gray-800 text-sm", children: ["Collection Register (", filteredRecords.length, " records)"] }), _jsx("span", { className: "text-xs text-gray-500", children: "Hardware scale & analyzer values certified with authoritative pricing" })] }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-left text-sm text-gray-600", children: [_jsx("thead", { className: "bg-gray-100 text-xs font-semibold text-gray-700 uppercase tracking-wider", children: _jsxs("tr", { children: [_jsx("th", { className: "px-4 py-3", children: "Time / Shift" }), _jsx("th", { className: "px-4 py-3", children: "Farmer" }), _jsx("th", { className: "px-4 py-3", children: "Type" }), _jsx("th", { className: "px-4 py-3 text-right", children: "Qty (Kg/L)" }), _jsx("th", { className: "px-4 py-3 text-right", children: "FAT %" }), _jsx("th", { className: "px-4 py-3 text-right", children: "SNF %" }), _jsx("th", { className: "px-4 py-3 text-right", children: "Rate (\u20B9)" }), _jsx("th", { className: "px-4 py-3 text-right", children: "Amount (\u20B9)" }), _jsx("th", { className: "px-4 py-3 text-center", children: "Source" }), _jsx("th", { className: "px-4 py-3 text-center", children: "Actions" })] }) }), _jsx("tbody", { className: "divide-y divide-gray-200", children: loading ? (_jsx("tr", { children: _jsxs("td", { colSpan: 10, className: "px-4 py-12 text-center text-gray-500", children: [_jsx("span", { className: "animate-spin inline-block mr-2", children: "\u23F3" }), " Loading collection registers..."] }) })) : paginatedRecords.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 10, className: "px-4 py-12 text-center text-gray-500", children: "No milk collection records found for the selected date and filters." }) })) : (paginatedRecords.map((rec) => (_jsxs("tr", { className: "hover:bg-gray-50 transition", children: [_jsxs("td", { className: "px-4 py-3 whitespace-nowrap", children: [_jsx("div", { className: "font-medium text-gray-900", children: rec.started_at ? new Date(rec.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—' }), _jsx("span", { className: `inline-block text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${rec.shift_type === 'MORNING' ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'}`, children: rec.shift_type })] }), _jsxs("td", { className: "px-4 py-3 whitespace-nowrap", children: [_jsx("div", { className: "font-medium text-gray-900", children: rec.customer_name || 'Farmer' }), _jsx("div", { className: "text-xs font-mono text-gray-500", children: rec.farmer_code })] }), _jsx("td", { className: "px-4 py-3 whitespace-nowrap", children: _jsx(StatusBadge, { status: rec.selected_milk_category }) }), _jsx("td", { className: "px-4 py-3 text-right font-medium text-gray-900", children: Number(rec.net_weight).toFixed(2) }), _jsxs("td", { className: "px-4 py-3 text-right font-mono text-gray-800", children: [Number(rec.fat_percentage).toFixed(2), "%"] }), _jsxs("td", { className: "px-4 py-3 text-right font-mono text-gray-800", children: [Number(rec.snf_percentage).toFixed(2), "%"] }), _jsxs("td", { className: "px-4 py-3 text-right font-mono text-gray-700", children: ["\u20B9", Number(rec.applied_rate_per_unit).toFixed(2)] }), _jsxs("td", { className: "px-4 py-3 text-right font-semibold text-emerald-700", children: ["\u20B9", Number(rec.total_amount).toFixed(2)] }), _jsx("td", { className: "px-4 py-3 text-center whitespace-nowrap", children: _jsx("span", { className: "text-[11px] font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded border border-gray-200", children: rec.measurement_source || 'AUTO_BRIDGE' }) }), _jsx("td", { className: "px-4 py-3 text-center whitespace-nowrap", children: _jsxs("div", { className: "flex items-center justify-center gap-1.5", children: [_jsx("button", { onClick: () => handleViewReceipt(rec), title: "View Thermal Receipt Slip", className: "px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs font-medium transition", children: "\uD83E\uDDFE Slip" }), canAdjust && (_jsx("button", { onClick: () => handleOpenAdjust(rec), title: "Supervisor Correction or Reversal", className: "px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded text-xs font-medium border border-amber-200 transition", children: "\u270F\uFE0F Adjust" }))] }) })] }, rec.id)))) })] }) }), _jsx("div", { className: "p-3 border-t border-gray-200 bg-gray-50/50", children: _jsx(Pagination, { currentPage: currentPage, totalItems: filteredRecords.length, pageSize: pageSize, onPageChange: setCurrentPage }) })] }), _jsx(Modal, { isOpen: receiptModalOpen, onClose: () => setReceiptModalOpen(false), title: "Thermal Receipt Slip Preview (40-Col)", maxWidth: "md", children: _jsxs("div", { className: "space-y-4", children: [_jsx("div", { className: "bg-amber-50/40 p-4 rounded border border-gray-300 font-mono text-xs whitespace-pre-wrap leading-relaxed shadow-inner overflow-x-auto text-gray-800", children: receiptContent }), _jsxs("div", { className: "flex justify-end gap-2 pt-2 border-t border-gray-100", children: [_jsx("button", { onClick: () => window.print(), className: "px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg shadow-sm transition", children: "\uD83D\uDDA8\uFE0F Print Receipt" }), _jsx("button", { onClick: () => setReceiptModalOpen(false), className: "px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition", children: "Close" })] })] }) }), _jsx(Modal, { isOpen: adjustModalOpen, onClose: () => setAdjustModalOpen(false), title: `Supervisor Adjustment — Intake #${selectedRecord?.farmer_code}`, maxWidth: "lg", children: _jsxs("form", { onSubmit: handleSaveAdjustment, className: "space-y-4", children: [_jsxs("div", { className: "bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 leading-normal", children: [_jsx("strong", { children: "Audited Operation:" }), " Adjustments to finalized collections will reverse the original ledger entry and post a differential adjusting journal. All changes require an audit justification."] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-700 mb-1", children: "Adjustment Type" }), _jsxs("select", { value: adjustForm.adjustmentType, onChange: (e) => setAdjustForm({ ...adjustForm, adjustmentType: e.target.value }), className: "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white font-medium", children: [_jsx("option", { value: "FAT_SNF_OVERRIDE", children: "FAT / SNF Override (Recalculate Rate)" }), _jsx("option", { value: "WEIGHT_CORRECTION", children: "Weight Correction" }), _jsx("option", { value: "RATE_RECALCULATION", children: "Force Rate Recalculation" }), _jsx("option", { value: "COMPLETE_REVERSAL", children: "Complete Reversal (Cancel Intake)" })] })] }), adjustForm.adjustmentType !== 'COMPLETE_REVERSAL' && (_jsxs("div", { className: "grid grid-cols-3 gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-700 mb-1", children: "Weight (Kg)" }), _jsx("input", { type: "number", step: "0.01", value: adjustForm.adjustedNetWeight ?? '', onChange: (e) => setAdjustForm({ ...adjustForm, adjustedNetWeight: parseFloat(e.target.value) || 0 }), className: "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm", required: true })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-700 mb-1", children: "FAT %" }), _jsx("input", { type: "number", step: "0.1", value: adjustForm.adjustedFatPercentage ?? '', onChange: (e) => setAdjustForm({ ...adjustForm, adjustedFatPercentage: parseFloat(e.target.value) || 0 }), className: "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm", required: true })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-700 mb-1", children: "SNF %" }), _jsx("input", { type: "number", step: "0.1", value: adjustForm.adjustedSnfPercentage ?? '', onChange: (e) => setAdjustForm({ ...adjustForm, adjustedSnfPercentage: parseFloat(e.target.value) || 0 }), className: "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm", required: true })] })] })), _jsxs("div", { children: [_jsxs("label", { className: "block text-xs font-medium text-gray-700 mb-1", children: ["Audit Reason / Justification ", _jsx("span", { className: "text-red-500", children: "*" })] }), _jsx("textarea", { rows: 3, value: adjustForm.reason, onChange: (e) => setAdjustForm({ ...adjustForm, reason: e.target.value }), placeholder: "e.g. Analyzer tube was recalibrated following reading divergence; approved by Center Manager.", className: "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm", required: true })] }), _jsxs("div", { className: "flex justify-end gap-2 pt-3 border-t border-gray-200", children: [_jsx("button", { type: "button", onClick: () => setAdjustModalOpen(false), className: "px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition", children: "Cancel" }), _jsx("button", { type: "submit", disabled: submittingAdjust, className: "px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium shadow-sm transition disabled:opacity-50", children: submittingAdjust ? 'Applying...' : 'Confirm Adjustment' })] })] }) })] }));
};
//# sourceMappingURL=MilkCollectionModule.js.map