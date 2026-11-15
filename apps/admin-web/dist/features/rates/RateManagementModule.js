import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { rateApi, } from '../../api/rateApi.js';
import { StatusBadge } from '../../components/Badge.js';
import { Modal } from '../../components/Modal.js';
import { ClayButton } from '../../components/ClayButton.js';
export const RateManagementModule = () => {
    const { currentCenterId, hasRole } = useAuth();
    const { showToast } = useToast();
    const isOwnerOrAdmin = hasRole(['SUPER_ADMIN', 'DAIRY_OWNER']);
    const canEditRates = hasRole(['SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER']);
    // Data State
    const [loading, setLoading] = useState(true);
    const [charts, setCharts] = useState([]);
    const [selectedChart, setSelectedChart] = useState(null);
    const [versions, setVersions] = useState([]);
    const [selectedVersion, setSelectedVersion] = useState(null);
    // Matrix Editor State
    const [matrixModalOpen, setMatrixModalOpen] = useState(false);
    const [matrixCells, setMatrixCells] = useState([]);
    const [savingMatrix, setSavingMatrix] = useState(false);
    // New Version Modal
    const [newVersionModalOpen, setNewVersionModalOpen] = useState(false);
    const [newVersionForm, setNewVersionForm] = useState({
        effectiveFrom: new Date().toISOString().split('T')[0],
        baseRatePerUnit: 40.0,
        pricingModel: 'FAT_SNF_MATRIX',
        notes: '',
    });
    // Simulator / Preview State
    const [simFat, setSimFat] = useState(4.0);
    const [simSnf, setSimSnf] = useState(8.5);
    const [simWeight, setSimWeight] = useState(10.0);
    const [simResult, setSimResult] = useState(null);
    const [calculatingSim, setCalculatingSim] = useState(false);
    // Matrix Generator Helper Inputs
    const [bulkBaseRate, setBulkBaseRate] = useState(38.0);
    const [fatDelta, setFatDelta] = useState(4.0);
    const [snfDelta, setSnfDelta] = useState(2.5);
    const loadCharts = useCallback(async () => {
        setLoading(true);
        try {
            const res = await rateApi.listCharts({ centerId: currentCenterId || undefined });
            const chartList = Array.isArray(res) ? res : [];
            setCharts(chartList);
            if (chartList.length > 0 && !selectedChart) {
                setSelectedChart(chartList[0] || null);
            }
        }
        catch (err) {
            showToast('Failed to load rate charts: ' + err.message, 'error');
        }
        finally {
            setLoading(false);
        }
    }, [currentCenterId, selectedChart, showToast]);
    const loadVersions = useCallback(async (chartId) => {
        try {
            const res = await rateApi.listVersions(chartId);
            const vList = Array.isArray(res) ? res : [];
            setVersions(vList);
            if (vList.length > 0) {
                setSelectedVersion(vList[0] || null);
            }
            else {
                setSelectedVersion(null);
            }
        }
        catch (err) {
            showToast('Failed to load versions: ' + err.message, 'error');
        }
    }, [showToast]);
    useEffect(() => {
        loadCharts();
    }, [loadCharts]);
    useEffect(() => {
        if (selectedChart) {
            loadVersions(selectedChart.id);
        }
    }, [selectedChart, loadVersions]);
    // Open Matrix Editor
    const handleOpenMatrix = async (v) => {
        setSelectedVersion(v);
        try {
            if (selectedChart) {
                const fullVersion = await rateApi.getVersion(selectedChart.id, v.id);
                const cells = fullVersion.cells || [];
                setMatrixCells(cells);
            }
            setMatrixModalOpen(true);
        }
        catch (err) {
            showToast('Failed to load matrix cells: ' + err.message, 'error');
        }
    };
    // Bulk Generator for Matrix
    const handleGenerateMatrix = () => {
        if (!selectedChart)
            return;
        const minF = Number(selectedChart.minFat || 3.0);
        const maxF = Number(selectedChart.maxFat || 6.0);
        const minS = Number(selectedChart.minSnf || 7.5);
        const maxS = Number(selectedChart.maxSnf || 9.5);
        const fStep = Number(selectedChart.fatStep || 0.1);
        const sStep = Number(selectedChart.snfStep || 0.1);
        const generated = [];
        for (let f = minF; f <= maxF + 0.001; f = Math.round((f + fStep) * 10) / 10) {
            for (let s = minS; s <= maxS + 0.001; s = Math.round((s + sStep) * 10) / 10) {
                const calcRate = bulkBaseRate + (f - minF) * fatDelta + (s - minS) * snfDelta;
                generated.push({
                    fat: f,
                    snf: s,
                    ratePerUnit: Math.round(calcRate * 100) / 100,
                });
            }
        }
        setMatrixCells(generated);
        showToast(`Generated ${generated.length} matrix cells. Click Save to persist.`, 'info');
    };
    // Save Matrix
    const handleSaveMatrix = async () => {
        if (!selectedChart || !selectedVersion)
            return;
        if (selectedVersion.status !== 'DRAFT') {
            showToast('Cannot edit matrix: Rate version is already finalized or published!', 'error');
            return;
        }
        setSavingMatrix(true);
        try {
            await rateApi.updateMatrixCells(selectedChart.id, selectedVersion.id, matrixCells);
            showToast('Rate matrix successfully updated!', 'success');
            setMatrixModalOpen(false);
            loadVersions(selectedChart.id);
        }
        catch (err) {
            showToast('Failed to save matrix: ' + err.message, 'error');
        }
        finally {
            setSavingMatrix(false);
        }
    };
    // State Transition Actions
    const handleSubmitVersion = async (v) => {
        if (!selectedChart)
            return;
        try {
            await rateApi.submitVersion(selectedChart.id, v.id);
            showToast('Version submitted for Owner approval', 'success');
            loadVersions(selectedChart.id);
        }
        catch (err) {
            showToast('Submit failed: ' + err.message, 'error');
        }
    };
    const handleApproveVersion = async (v) => {
        if (!selectedChart)
            return;
        try {
            await rateApi.approveVersion(selectedChart.id, v.id);
            showToast('Version approved successfully', 'success');
            loadVersions(selectedChart.id);
        }
        catch (err) {
            showToast('Approve failed: ' + err.message, 'error');
        }
    };
    const handlePublishVersion = async (v) => {
        if (!selectedChart)
            return;
        if (!window.confirm('Are you sure you want to PUBLISH this version? It will become the authoritative pricing version for milk collections!'))
            return;
        try {
            await rateApi.publishVersion(selectedChart.id, v.id);
            showToast('Rate chart version PUBLISHED! Historical rates locked.', 'success');
            loadVersions(selectedChart.id);
            loadCharts();
        }
        catch (err) {
            showToast('Publish failed: ' + err.message, 'error');
        }
    };
    // Create New Version
    const handleCreateVersion = async (e) => {
        e.preventDefault();
        if (!selectedChart)
            return;
        try {
            await rateApi.createVersion(selectedChart.id, newVersionForm);
            showToast('New draft version created!', 'success');
            setNewVersionModalOpen(false);
            loadVersions(selectedChart.id);
        }
        catch (err) {
            showToast('Failed to create version: ' + err.message, 'error');
        }
    };
    // Rate Simulator
    const handleRunSimulation = async () => {
        if (!selectedChart)
            return;
        setCalculatingSim(true);
        try {
            const res = await rateApi.calculate({
                centerId: currentCenterId || undefined,
                milkCategory: selectedChart.milkCategory,
                fat: simFat,
                snf: simSnf,
                netWeight: simWeight,
            });
            setSimResult({
                rate: Number(res.appliedRatePerUnit ?? res.rate ?? 0),
                totalAmount: Number(res.totalAmount ?? 0),
            });
        }
        catch (err) {
            showToast('Preview calculation error: ' + err.message, 'error');
        }
        finally {
            setCalculatingSim(false);
        }
    };
    // Group matrix cells for table display: Fat values as rows, SNF values as columns
    const matrixGrid = useMemo(() => {
        if (!matrixCells || matrixCells.length === 0)
            return { fatRows: [], snfCols: [], cellMap: new Map() };
        const fats = Array.from(new Set(matrixCells.map(c => Number(c.fat)))).sort((a, b) => a - b);
        const snfs = Array.from(new Set(matrixCells.map(c => Number(c.snf)))).sort((a, b) => a - b);
        const map = new Map();
        matrixCells.forEach(c => {
            map.set(`${Number(c.fat).toFixed(1)}_${Number(c.snf).toFixed(1)}`, Number(c.ratePerUnit));
        });
        return { fatRows: fats, snfCols: snfs, cellMap: map };
    }, [matrixCells]);
    return (_jsxs("div", { className: "space-y-6 select-none", children: [_jsxs("div", { className: "flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-200/80", children: [_jsxs("div", { children: [_jsxs("h1", { className: "text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2", children: [_jsx("span", { children: "\uD83D\uDCC8" }), _jsx("span", { children: "Milk Rate Chart & Matrix Management" })] }), _jsx("p", { className: "text-xs sm:text-sm text-slate-500 font-medium mt-1", children: "Authoritative Fat \u00D7 SNF pricing matrices, four-eye draft approvals, published version locking, and live rate simulator." })] }), _jsx("div", { className: "flex items-center gap-2", children: canEditRates && selectedChart && (_jsx(ClayButton, { variant: "brand", size: "sm", onClick: () => setNewVersionModalOpen(true), icon: _jsx("span", { className: "text-base font-bold", children: "+" }), children: "New Version" })) })] }), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-6", children: [_jsxs("div", { className: "lg:col-span-2 space-y-5", children: [_jsxs("div", { className: "clay-surface p-5 sm:p-6", children: [_jsxs("h2", { className: "text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3.5 flex items-center gap-2", children: [_jsx("span", { children: "\uD83C\uDFF7\uFE0F" }), _jsx("span", { children: "Configured Rate Charts" })] }), _jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3.5", children: loading ? (_jsx("div", { className: "p-8 text-center text-slate-400 font-bold text-xs", children: "Loading rate charts..." })) : charts.length === 0 ? (_jsx("div", { className: "p-8 text-center text-slate-400 font-bold text-xs", children: "No rate charts configured." })) : (charts.map((c) => {
                                            const isSelected = selectedChart?.id === c.id;
                                            return (_jsxs("div", { onClick: () => setSelectedChart(c), className: `p-4 rounded-2xl border transition-all duration-200 cursor-pointer select-none ${isSelected
                                                    ? 'bg-[#E6F4FA] border-[#23759B]/60 shadow-[0_6px_16px_rgba(0,80,110,0.12),inset_0_1.5px_2px_rgba(255,255,255,0.95)] transform -translate-y-0.5'
                                                    : 'bg-[#F8FAFC] border-slate-200/80 hover:bg-white hover:border-slate-300 shadow-[0_2px_5px_rgba(0,0,0,0.03)]'}`, children: [_jsxs("div", { className: "flex justify-between items-start mb-2", children: [_jsx("span", { className: "font-black text-slate-900 text-sm", children: c.name }), _jsx(StatusBadge, { status: c.milkCategory })] }), _jsxs("div", { className: "text-xs text-slate-500 font-mono space-y-1", children: [_jsxs("div", { children: ["Code: ", _jsx("span", { className: "font-bold text-slate-700", children: c.code })] }), _jsxs("div", { children: ["Formula: ", _jsx("span", { className: "font-semibold text-slate-700", children: c.pricingFormula })] }), _jsxs("div", { className: "text-[11px] text-slate-600", children: ["FAT: ", c.minFat, "%\u2013", c.maxFat, "% (Step ", c.fatStep, ") \u2022 SNF: ", c.minSnf, "%\u2013", c.maxSnf, "%"] })] })] }, c.id));
                                        })) })] }), selectedChart && (_jsxs("div", { className: "clay-surface overflow-hidden", children: [_jsxs("div", { className: "p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 bg-gradient-to-r from-slate-50/70 to-white", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-base", children: "\uD83D\uDCDC" }), _jsxs("h3", { className: "font-black text-slate-800 text-sm tracking-tight", children: ["Version History \u2014 ", selectedChart.name] })] }), _jsx("span", { className: "text-[11px] font-bold text-slate-400", children: "Published versions are immutable snapshots" })] }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-left text-xs sm:text-sm text-slate-600", children: [_jsx("thead", { className: "bg-[#F8FAFC] text-[11px] font-black text-slate-500 uppercase tracking-wider", children: _jsxs("tr", { children: [_jsx("th", { className: "px-4 py-3.5", children: "Version" }), _jsx("th", { className: "px-4 py-3.5", children: "Effective Date" }), _jsx("th", { className: "px-4 py-3.5", children: "Base Rate" }), _jsx("th", { className: "px-4 py-3.5", children: "Status" }), _jsx("th", { className: "px-4 py-3.5 text-center", children: "Matrix" }), _jsx("th", { className: "px-4 py-3.5 text-right", children: "Actions" })] }) }), _jsx("tbody", { className: "divide-y divide-slate-100 font-semibold text-slate-700", children: versions.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 6, className: "px-4 py-8 text-center text-slate-400 font-bold", children: "No versions recorded for this chart." }) })) : (versions.map((v) => (_jsxs("tr", { className: "hover:bg-slate-50/80 transition-colors", children: [_jsxs("td", { className: "px-4 py-3 font-black text-slate-900", children: ["v", v.versionNumber] }), _jsx("td", { className: "px-4 py-3 font-mono text-xs font-bold text-slate-600", children: new Date(v.effectiveFrom).toLocaleDateString() }), _jsxs("td", { className: "px-4 py-3 font-mono font-black text-slate-900", children: ["\u20B9", Number(v.baseRatePerUnit).toFixed(2), "/L"] }), _jsx("td", { className: "px-4 py-3", children: _jsx(StatusBadge, { status: v.status }) }), _jsx("td", { className: "px-4 py-3 text-center", children: _jsxs("button", { onClick: () => handleOpenMatrix(v), className: "px-3 py-1 text-xs bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200/90 rounded-xl font-bold shadow-sm transition active:translate-y-0.5", children: ["\uD83D\uDCCA ", v.status === 'DRAFT' ? 'Edit Matrix' : 'View Matrix'] }) }), _jsx("td", { className: "px-4 py-3 text-right whitespace-nowrap", children: _jsxs("div", { className: "flex items-center justify-end gap-1.5", children: [v.status === 'DRAFT' && canEditRates && (_jsx("button", { onClick: () => handleSubmitVersion(v), className: "px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold shadow-sm transition active:translate-y-0.5", children: "Submit" })), v.status === 'SUBMITTED' && isOwnerOrAdmin && (_jsx("button", { onClick: () => handleApproveVersion(v), className: "px-2.5 py-1 bg-[#00506E] hover:bg-[#003B52] text-white rounded-lg text-xs font-bold shadow-sm transition active:translate-y-0.5", children: "Approve" })), v.status === 'APPROVED' && isOwnerOrAdmin && (_jsx("button", { onClick: () => handlePublishVersion(v), className: "px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition active:translate-y-0.5", children: "\uD83D\uDE80 Publish" }))] }) })] }, v.id)))) })] }) })] }))] }), _jsx("div", { className: "space-y-4", children: _jsxs("div", { className: "clay-surface p-5 sm:p-6", children: [_jsxs("h2", { className: "text-xs font-black text-slate-800 uppercase tracking-wider mb-1.5 flex items-center gap-2", children: [_jsx("span", { children: "\uD83D\uDD2C" }), _jsx("span", { children: "Rate Preview Calculator" })] }), _jsx("p", { className: "text-xs text-slate-500 font-medium mb-4", children: "Simulate collection calculation using the backend's active pricing engine." }), _jsxs("div", { className: "space-y-3.5 text-xs", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-[10px] font-black uppercase tracking-wider text-slate-600 mb-1", children: "Target Milk Category" }), _jsx("div", { className: "text-xs font-bold text-slate-800 bg-[#EDF2F7] p-2.5 rounded-xl border border-slate-200/90 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)]", children: selectedChart ? `${selectedChart.name} (${selectedChart.milkCategory})` : 'Select a chart first' })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[10px] font-black uppercase tracking-wider text-slate-600 mb-1", children: "FAT Percentage (%)" }), _jsx("input", { type: "number", step: "0.1", value: simFat, onChange: (e) => setSimFat(parseFloat(e.target.value) || 0), className: "w-full px-3 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[10px] font-black uppercase tracking-wider text-slate-600 mb-1", children: "SNF Percentage (%)" }), _jsx("input", { type: "number", step: "0.1", value: simSnf, onChange: (e) => setSimSnf(parseFloat(e.target.value) || 0), className: "w-full px-3 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[10px] font-black uppercase tracking-wider text-slate-600 mb-1", children: "Milk Quantity (Kg/L)" }), _jsx("input", { type: "number", step: "0.1", value: simWeight, onChange: (e) => setSimWeight(parseFloat(e.target.value) || 0), className: "w-full px-3 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]" })] }), _jsx(ClayButton, { variant: "brand", size: "md", className: "w-full mt-2", onClick: handleRunSimulation, disabled: !selectedChart || calculatingSim, isLoading: calculatingSim, children: "Run Simulation" }), simResult && (_jsxs("div", { className: "mt-4 p-4 rounded-2xl bg-gradient-to-br from-[#F2FBF6] to-white border border-emerald-200/90 space-y-2 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.9)] animate-fadeIn", children: [_jsxs("div", { className: "flex justify-between items-center text-xs text-slate-600", children: [_jsx("span", { className: "font-bold", children: "Applicable Unit Rate:" }), _jsxs("span", { className: "font-black text-base text-slate-900 font-mono", children: ["\u20B9", simResult.rate.toFixed(2), "/L"] })] }), _jsxs("div", { className: "flex justify-between items-center text-xs text-slate-600 pt-1.5 border-t border-emerald-200/60", children: [_jsx("span", { className: "font-bold", children: "Total Milk Value:" }), _jsxs("span", { className: "font-black text-lg text-[#137333] font-mono", children: ["\u20B9", simResult.totalAmount.toFixed(2)] })] })] }))] })] }) })] }), _jsx(Modal, { isOpen: matrixModalOpen, onClose: () => setMatrixModalOpen(false), title: `Rate Matrix Editor — ${selectedChart?.name} (v${selectedVersion?.versionNumber} - ${selectedVersion?.status})`, maxWidth: "5xl", children: _jsxs("div", { className: "space-y-4 text-xs", children: [selectedVersion?.status !== 'DRAFT' && (_jsxs("div", { className: "bg-[#FFFDF5] border border-amber-200/90 text-amber-900 text-xs p-4 rounded-2xl shadow-sm", children: [_jsx("strong", { className: "font-black", children: "Read-Only Mode:" }), " This version is ", selectedVersion?.status, ". Historical finalized rates cannot be altered. Create a new draft version to modify pricing."] })), selectedVersion?.status === 'DRAFT' && (_jsxs("div", { className: "p-4 bg-[#F8FAFC] border border-slate-200/80 rounded-2xl flex flex-wrap items-center gap-3 text-xs", children: [_jsx("span", { className: "font-black text-slate-700", children: "Quick Generator:" }), _jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("span", { className: "font-bold text-slate-600", children: "Base \u20B9:" }), _jsx("input", { type: "number", step: "0.5", value: bulkBaseRate, onChange: (e) => setBulkBaseRate(parseFloat(e.target.value) || 0), className: "w-20 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold" })] }), _jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("span", { className: "font-bold text-slate-600", children: "+\u20B9/0.1 Fat:" }), _jsx("input", { type: "number", step: "0.1", value: fatDelta, onChange: (e) => setFatDelta(parseFloat(e.target.value) || 0), className: "w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold" })] }), _jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("span", { className: "font-bold text-slate-600", children: "+\u20B9/0.1 SNF:" }), _jsx("input", { type: "number", step: "0.1", value: snfDelta, onChange: (e) => setSnfDelta(parseFloat(e.target.value) || 0), className: "w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold" })] }), _jsx(ClayButton, { variant: "brand", size: "sm", onClick: handleGenerateMatrix, children: "Populate Grid" })] })), _jsx("div", { className: "overflow-x-auto max-h-[500px] border border-slate-200/80 rounded-2xl shadow-inner", children: _jsxs("table", { className: "w-full text-center text-xs font-mono", children: [_jsx("thead", { className: "bg-[#F8FAFC] sticky top-0 border-b border-slate-200/90 font-black", children: _jsxs("tr", { children: [_jsx("th", { className: "p-2.5 border-r bg-slate-200/70 font-black text-slate-800", children: "FAT \\ SNF" }), matrixGrid.snfCols.map(s => (_jsxs("th", { className: "p-2.5 border-r text-slate-700 font-bold min-w-[55px]", children: [s.toFixed(1), "%"] }, s)))] }) }), _jsx("tbody", { className: "divide-y divide-slate-100 font-semibold", children: matrixGrid.fatRows.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: matrixGrid.snfCols.length + 1, className: "p-8 text-center text-slate-400 font-sans", children: "Matrix is empty. Use the generator above or configure cells to initialize." }) })) : (matrixGrid.fatRows.map(f => (_jsxs("tr", { className: "hover:bg-slate-50", children: [_jsxs("td", { className: "p-2.5 border-r bg-slate-100/80 font-black text-slate-900", children: [f.toFixed(1), "%"] }), matrixGrid.snfCols.map(s => {
                                                    const key = `${f.toFixed(1)}_${s.toFixed(1)}`;
                                                    const val = matrixGrid.cellMap.get(key) ?? 0;
                                                    return (_jsx("td", { className: "p-1 border-r", children: selectedVersion?.status === 'DRAFT' ? (_jsx("input", { type: "number", step: "0.1", value: val, onChange: (e) => {
                                                                const newVal = parseFloat(e.target.value) || 0;
                                                                const updated = matrixCells.filter(c => !(c.fat === f && c.snf === s));
                                                                updated.push({ fat: f, snf: s, ratePerUnit: newVal });
                                                                setMatrixCells(updated);
                                                            }, className: "w-14 text-center px-1 py-1 bg-[#EDF2F7] border border-slate-200 rounded-lg text-xs font-bold focus:bg-white focus:ring-1 focus:ring-[#00506E]" })) : (_jsxs("span", { className: "text-slate-900 font-bold", children: ["\u20B9", val.toFixed(2)] })) }, s));
                                                })] }, f)))) })] }) }), _jsxs("div", { className: "flex justify-end gap-2.5 pt-3 border-t border-slate-100", children: [_jsx(ClayButton, { variant: "secondary", size: "sm", onClick: () => setMatrixModalOpen(false), children: "Close" }), selectedVersion?.status === 'DRAFT' && (_jsx(ClayButton, { variant: "brand", size: "sm", onClick: handleSaveMatrix, disabled: savingMatrix, isLoading: savingMatrix, children: "Save Matrix Cells" }))] })] }) }), _jsx(Modal, { isOpen: newVersionModalOpen, onClose: () => setNewVersionModalOpen(false), title: `Create New Rate Version — ${selectedChart?.name}`, maxWidth: "md", children: _jsxs("form", { onSubmit: handleCreateVersion, className: "space-y-4 text-xs", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1", children: "Effective From Date" }), _jsx("input", { type: "date", value: newVersionForm.effectiveFrom, onChange: (e) => setNewVersionForm({ ...newVersionForm, effectiveFrom: e.target.value }), className: "w-full px-3 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]", required: true })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1", children: "Base Rate (\u20B9/Liter)" }), _jsx("input", { type: "number", step: "0.5", value: newVersionForm.baseRatePerUnit, onChange: (e) => setNewVersionForm({ ...newVersionForm, baseRatePerUnit: parseFloat(e.target.value) || 0 }), className: "w-full px-3 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]", required: true })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1", children: "Pricing Model" }), _jsxs("select", { value: newVersionForm.pricingModel, onChange: (e) => setNewVersionForm({ ...newVersionForm, pricingModel: e.target.value }), className: "w-full px-3 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E] cursor-pointer", children: [_jsx("option", { value: "FAT_SNF_MATRIX", children: "FAT \u00D7 SNF Matrix" }), _jsx("option", { value: "TS_FORMULA", children: "Total Solids (TS) Formula" }), _jsx("option", { value: "FLAT_RATE", children: "Flat Rate" })] })] }), _jsxs("div", { className: "flex justify-end gap-2.5 pt-3 border-t border-slate-100", children: [_jsx(ClayButton, { type: "button", variant: "secondary", size: "sm", onClick: () => setNewVersionModalOpen(false), children: "Cancel" }), _jsx(ClayButton, { type: "submit", variant: "brand", size: "sm", children: "Create Draft Version" })] })] }) })] }));
};
//# sourceMappingURL=RateManagementModule.js.map