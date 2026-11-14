import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { rateApi, } from '../../api/rateApi.js';
import { StatusBadge } from '../../components/Badge.js';
import { Modal } from '../../components/Modal.js';
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
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-gray-200", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold text-gray-900 tracking-tight", children: "\uD83D\uDCC8 Milk Rate Chart & Matrix Management" }), _jsx("p", { className: "text-sm text-gray-500 mt-1", children: "Authoritative Fat \u00D7 SNF pricing matrices, four-eye draft approvals, published version locking, and live rate simulator." })] }), _jsx("div", { className: "flex items-center gap-2", children: canEditRates && selectedChart && (_jsx("button", { onClick: () => setNewVersionModalOpen(true), className: "px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium shadow-sm transition", children: "\u2795 New Version" })) })] }), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-6", children: [_jsxs("div", { className: "lg:col-span-2 space-y-4", children: [_jsxs("div", { className: "bg-white p-4 rounded-xl shadow-sm border border-gray-200", children: [_jsx("h2", { className: "text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3", children: "Configured Rate Charts" }), _jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3", children: loading ? (_jsx("div", { className: "p-4 text-center text-gray-500", children: "Loading rate charts..." })) : charts.length === 0 ? (_jsx("div", { className: "p-4 text-center text-gray-500", children: "No rate charts configured." })) : (charts.map((c) => (_jsxs("div", { onClick: () => setSelectedChart(c), className: `p-4 rounded-xl border-2 cursor-pointer transition ${selectedChart?.id === c.id
                                                ? 'border-emerald-600 bg-emerald-50/40 shadow-sm'
                                                : 'border-gray-200 hover:border-gray-300 bg-white'}`, children: [_jsxs("div", { className: "flex justify-between items-start mb-2", children: [_jsx("span", { className: "font-bold text-gray-900", children: c.name }), _jsx(StatusBadge, { status: c.milkCategory })] }), _jsxs("div", { className: "text-xs text-gray-500 font-mono space-y-1", children: [_jsxs("div", { children: ["Code: ", c.code] }), _jsxs("div", { children: ["Formula: ", c.pricingFormula] }), _jsxs("div", { children: ["FAT: ", c.minFat, "%\u2013", c.maxFat, "% (Step ", c.fatStep, ") | SNF: ", c.minSnf, "%\u2013", c.maxSnf, "%"] })] })] }, c.id)))) })] }), selectedChart && (_jsxs("div", { className: "bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden", children: [_jsxs("div", { className: "p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50", children: [_jsxs("h3", { className: "font-semibold text-gray-800 text-sm", children: ["Version History \u2014 ", selectedChart.name] }), _jsx("span", { className: "text-xs text-gray-500", children: "Published versions are immutable snapshots" })] }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-left text-sm text-gray-600", children: [_jsx("thead", { className: "bg-gray-100 text-xs font-semibold text-gray-700 uppercase tracking-wider", children: _jsxs("tr", { children: [_jsx("th", { className: "px-4 py-3", children: "Version" }), _jsx("th", { className: "px-4 py-3", children: "Effective Date" }), _jsx("th", { className: "px-4 py-3", children: "Base Rate" }), _jsx("th", { className: "px-4 py-3", children: "Status" }), _jsx("th", { className: "px-4 py-3 text-center", children: "Matrix" }), _jsx("th", { className: "px-4 py-3 text-right", children: "Actions" })] }) }), _jsx("tbody", { className: "divide-y divide-gray-200", children: versions.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 6, className: "px-4 py-6 text-center text-gray-500", children: "No versions recorded for this chart." }) })) : (versions.map((v) => (_jsxs("tr", { className: "hover:bg-gray-50 transition", children: [_jsxs("td", { className: "px-4 py-3 font-semibold text-gray-900", children: ["v", v.versionNumber] }), _jsx("td", { className: "px-4 py-3 font-mono text-xs", children: new Date(v.effectiveFrom).toLocaleDateString() }), _jsxs("td", { className: "px-4 py-3 font-mono font-medium text-gray-800", children: ["\u20B9", Number(v.baseRatePerUnit).toFixed(2), "/L"] }), _jsx("td", { className: "px-4 py-3", children: _jsx(StatusBadge, { status: v.status }) }), _jsx("td", { className: "px-4 py-3 text-center", children: _jsxs("button", { onClick: () => handleOpenMatrix(v), className: "px-2.5 py-1 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded font-medium transition", children: ["\uD83D\uDCCA ", v.status === 'DRAFT' ? 'Edit Matrix' : 'View Matrix'] }) }), _jsx("td", { className: "px-4 py-3 text-right whitespace-nowrap", children: _jsxs("div", { className: "flex items-center justify-end gap-1.5", children: [v.status === 'DRAFT' && canEditRates && (_jsx("button", { onClick: () => handleSubmitVersion(v), className: "px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded text-xs font-medium transition", children: "Submit" })), v.status === 'SUBMITTED' && isOwnerOrAdmin && (_jsx("button", { onClick: () => handleApproveVersion(v), className: "px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition", children: "Approve" })), v.status === 'APPROVED' && isOwnerOrAdmin && (_jsx("button", { onClick: () => handlePublishVersion(v), className: "px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium shadow-sm transition", children: "\uD83D\uDE80 Publish" }))] }) })] }, v.id)))) })] }) })] }))] }), _jsx("div", { className: "space-y-4", children: _jsxs("div", { className: "bg-white p-5 rounded-xl shadow-sm border border-gray-200", children: [_jsx("h2", { className: "text-sm font-semibold text-gray-800 uppercase tracking-wider mb-2 flex items-center gap-1.5", children: "\uD83D\uDD2C Rate Preview Calculator" }), _jsx("p", { className: "text-xs text-gray-500 mb-4", children: "Simulate collection calculation using the backend's active pricing engine." }), _jsxs("div", { className: "space-y-3", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-700 mb-1", children: "Target Milk Category" }), _jsx("div", { className: "text-xs font-bold text-gray-800 bg-gray-50 p-2 rounded border border-gray-200", children: selectedChart ? `${selectedChart.name} (${selectedChart.milkCategory})` : 'Select a chart first' })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-700 mb-1", children: "FAT Percentage (%)" }), _jsx("input", { type: "number", step: "0.1", value: simFat, onChange: (e) => setSimFat(parseFloat(e.target.value) || 0), className: "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-700 mb-1", children: "SNF Percentage (%)" }), _jsx("input", { type: "number", step: "0.1", value: simSnf, onChange: (e) => setSimSnf(parseFloat(e.target.value) || 0), className: "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-700 mb-1", children: "Milk Quantity (Kg/L)" }), _jsx("input", { type: "number", step: "0.1", value: simWeight, onChange: (e) => setSimWeight(parseFloat(e.target.value) || 0), className: "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" })] }), _jsx("button", { onClick: handleRunSimulation, disabled: !selectedChart || calculatingSim, className: "w-full mt-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium shadow-sm transition disabled:opacity-50", children: calculatingSim ? 'Calculating...' : 'Run Simulation' }), simResult && (_jsxs("div", { className: "mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2 animate-fadeIn", children: [_jsxs("div", { className: "flex justify-between items-center text-xs text-gray-600", children: [_jsx("span", { children: "Applicable Unit Rate:" }), _jsxs("span", { className: "font-bold text-base text-gray-900 font-mono", children: ["\u20B9", simResult.rate.toFixed(2), "/L"] })] }), _jsxs("div", { className: "flex justify-between items-center text-xs text-gray-600 pt-1 border-t border-emerald-200", children: [_jsx("span", { children: "Total Milk Value:" }), _jsxs("span", { className: "font-bold text-lg text-emerald-800 font-mono", children: ["\u20B9", simResult.totalAmount.toFixed(2)] })] })] }))] })] }) })] }), _jsx(Modal, { isOpen: matrixModalOpen, onClose: () => setMatrixModalOpen(false), title: `Rate Matrix Editor — ${selectedChart?.name} (v${selectedVersion?.versionNumber} - ${selectedVersion?.status})`, maxWidth: "5xl", children: _jsxs("div", { className: "space-y-4", children: [selectedVersion?.status !== 'DRAFT' && (_jsxs("div", { className: "bg-amber-50 border border-amber-200 text-amber-800 text-xs p-3 rounded-lg", children: [_jsx("strong", { children: "Read-Only Mode:" }), " This version is ", selectedVersion?.status, ". Historical finalized rates cannot be altered. Create a new draft version to modify pricing."] })), selectedVersion?.status === 'DRAFT' && (_jsxs("div", { className: "p-3 bg-gray-50 border border-gray-200 rounded-lg flex flex-wrap items-center gap-3 text-xs", children: [_jsx("span", { className: "font-semibold text-gray-700", children: "Quick Generator:" }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsx("span", { children: "Base \u20B9:" }), _jsx("input", { type: "number", step: "0.5", value: bulkBaseRate, onChange: (e) => setBulkBaseRate(parseFloat(e.target.value) || 0), className: "w-20 px-2 py-1 border rounded text-xs" })] }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsx("span", { children: "+\u20B9/0.1 Fat:" }), _jsx("input", { type: "number", step: "0.1", value: fatDelta, onChange: (e) => setFatDelta(parseFloat(e.target.value) || 0), className: "w-16 px-2 py-1 border rounded text-xs" })] }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsx("span", { children: "+\u20B9/0.1 SNF:" }), _jsx("input", { type: "number", step: "0.1", value: snfDelta, onChange: (e) => setSnfDelta(parseFloat(e.target.value) || 0), className: "w-16 px-2 py-1 border rounded text-xs" })] }), _jsx("button", { onClick: handleGenerateMatrix, className: "px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-medium transition", children: "Populate Grid" })] })), _jsx("div", { className: "overflow-x-auto max-h-[500px] border border-gray-200 rounded-lg shadow-inner", children: _jsxs("table", { className: "w-full text-center text-xs font-mono", children: [_jsx("thead", { className: "bg-gray-100 sticky top-0 border-b border-gray-200", children: _jsxs("tr", { children: [_jsx("th", { className: "p-2 border-r bg-gray-200 font-bold text-gray-800", children: "FAT \\ SNF" }), matrixGrid.snfCols.map(s => (_jsxs("th", { className: "p-2 border-r text-gray-700 font-semibold min-w-[50px]", children: [s.toFixed(1), "%"] }, s)))] }) }), _jsx("tbody", { className: "divide-y divide-gray-200", children: matrixGrid.fatRows.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: matrixGrid.snfCols.length + 1, className: "p-8 text-center text-gray-500 font-sans", children: "Matrix is empty. Use the generator above or configure cells to initialize." }) })) : (matrixGrid.fatRows.map(f => (_jsxs("tr", { className: "hover:bg-gray-50", children: [_jsxs("td", { className: "p-2 border-r bg-gray-100 font-bold text-gray-800", children: [f.toFixed(1), "%"] }), matrixGrid.snfCols.map(s => {
                                                    const key = `${f.toFixed(1)}_${s.toFixed(1)}`;
                                                    const val = matrixGrid.cellMap.get(key) ?? 0;
                                                    return (_jsx("td", { className: "p-1 border-r", children: selectedVersion?.status === 'DRAFT' ? (_jsx("input", { type: "number", step: "0.1", value: val, onChange: (e) => {
                                                                const newVal = parseFloat(e.target.value) || 0;
                                                                const updated = matrixCells.filter(c => !(c.fat === f && c.snf === s));
                                                                updated.push({ fat: f, snf: s, ratePerUnit: newVal });
                                                                setMatrixCells(updated);
                                                            }, className: "w-14 text-center px-1 py-0.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-emerald-500" })) : (_jsxs("span", { className: "text-gray-900 font-medium", children: ["\u20B9", val.toFixed(2)] })) }, s));
                                                })] }, f)))) })] }) }), _jsxs("div", { className: "flex justify-end gap-2 pt-3 border-t border-gray-200", children: [_jsx("button", { onClick: () => setMatrixModalOpen(false), className: "px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition", children: "Close" }), selectedVersion?.status === 'DRAFT' && (_jsx("button", { onClick: handleSaveMatrix, disabled: savingMatrix, className: "px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium shadow-sm transition disabled:opacity-50", children: savingMatrix ? 'Saving...' : 'Save Matrix Cells' }))] })] }) }), _jsx(Modal, { isOpen: newVersionModalOpen, onClose: () => setNewVersionModalOpen(false), title: `Create New Rate Version — ${selectedChart?.name}`, maxWidth: "md", children: _jsxs("form", { onSubmit: handleCreateVersion, className: "space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-700 mb-1", children: "Effective From Date" }), _jsx("input", { type: "date", value: newVersionForm.effectiveFrom, onChange: (e) => setNewVersionForm({ ...newVersionForm, effectiveFrom: e.target.value }), className: "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm", required: true })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-700 mb-1", children: "Base Rate (\u20B9/Liter)" }), _jsx("input", { type: "number", step: "0.5", value: newVersionForm.baseRatePerUnit, onChange: (e) => setNewVersionForm({ ...newVersionForm, baseRatePerUnit: parseFloat(e.target.value) || 0 }), className: "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm", required: true })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-700 mb-1", children: "Pricing Model" }), _jsxs("select", { value: newVersionForm.pricingModel, onChange: (e) => setNewVersionForm({ ...newVersionForm, pricingModel: e.target.value }), className: "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white", children: [_jsx("option", { value: "FAT_SNF_MATRIX", children: "FAT \u00D7 SNF Matrix" }), _jsx("option", { value: "TS_FORMULA", children: "Total Solids (TS) Formula" }), _jsx("option", { value: "FLAT_RATE", children: "Flat Rate" })] })] }), _jsxs("div", { className: "flex justify-end gap-2 pt-3 border-t border-gray-200", children: [_jsx("button", { type: "button", onClick: () => setNewVersionModalOpen(false), className: "px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition", children: "Cancel" }), _jsx("button", { type: "submit", className: "px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium shadow-sm transition", children: "Create Draft Version" })] })] }) })] }));
};
//# sourceMappingURL=RateManagementModule.js.map