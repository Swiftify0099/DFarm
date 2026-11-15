import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import {
  rateApi,
  type RateChart,
  type RateChartVersion,
  type RateMatrixCell,
} from '../../api/rateApi.js';
import { StatusBadge } from '../../components/Badge.js';
import { Modal } from '../../components/Modal.js';
import { ClayButton } from '../../components/ClayButton.js';

export const RateManagementModule: React.FC = () => {
  const { currentCenterId, hasRole } = useAuth();
  const { showToast } = useToast();

  const isOwnerOrAdmin = hasRole(['SUPER_ADMIN', 'DAIRY_OWNER']);
  const canEditRates = hasRole(['SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER']);

  // Data State
  const [loading, setLoading] = useState<boolean>(true);
  const [charts, setCharts] = useState<RateChart[]>([]);
  const [selectedChart, setSelectedChart] = useState<RateChart | null>(null);
  const [versions, setVersions] = useState<RateChartVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<RateChartVersion | null>(null);

  // Matrix Editor State
  const [matrixModalOpen, setMatrixModalOpen] = useState<boolean>(false);
  const [matrixCells, setMatrixCells] = useState<RateMatrixCell[]>([]);
  const [savingMatrix, setSavingMatrix] = useState<boolean>(false);

  // New Version Modal
  const [newVersionModalOpen, setNewVersionModalOpen] = useState<boolean>(false);
  const [newVersionForm, setNewVersionForm] = useState({
    effectiveFrom: new Date().toISOString().split('T')[0],
    baseRatePerUnit: 40.0,
    pricingModel: 'FAT_SNF_MATRIX',
    notes: '',
  });

  // Simulator / Preview State
  const [simFat, setSimFat] = useState<number>(4.0);
  const [simSnf, setSimSnf] = useState<number>(8.5);
  const [simWeight, setSimWeight] = useState<number>(10.0);
  const [simResult, setSimResult] = useState<{ rate: number; totalAmount: number } | null>(null);
  const [calculatingSim, setCalculatingSim] = useState<boolean>(false);

  // Matrix Generator Helper Inputs
  const [bulkBaseRate, setBulkBaseRate] = useState<number>(38.0);
  const [fatDelta, setFatDelta] = useState<number>(4.0);
  const [snfDelta, setSnfDelta] = useState<number>(2.5);

  const loadCharts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await rateApi.listCharts({ centerId: currentCenterId || undefined });
      const chartList = Array.isArray(res) ? res : [];
      setCharts(chartList);
      if (chartList.length > 0 && !selectedChart) {
        setSelectedChart(chartList[0] || null);
      }
    } catch (err: any) {
      showToast('Failed to load rate charts: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [currentCenterId, selectedChart, showToast]);

  const loadVersions = useCallback(async (chartId: string) => {
    try {
      const res = await rateApi.listVersions(chartId);
      const vList = Array.isArray(res) ? res : [];
      setVersions(vList);
      if (vList.length > 0) {
        setSelectedVersion(vList[0] || null);
      } else {
        setSelectedVersion(null);
      }
    } catch (err: any) {
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
  const handleOpenMatrix = async (v: RateChartVersion) => {
    setSelectedVersion(v);
    try {
      if (selectedChart) {
        const fullVersion = await rateApi.getVersion(selectedChart.id, v.id);
        const cells = fullVersion.cells || [];
        setMatrixCells(cells);
      }
      setMatrixModalOpen(true);
    } catch (err: any) {
      showToast('Failed to load matrix cells: ' + err.message, 'error');
    }
  };

  // Bulk Generator for Matrix
  const handleGenerateMatrix = () => {
    if (!selectedChart) return;
    const minF = Number(selectedChart.minFat || 3.0);
    const maxF = Number(selectedChart.maxFat || 6.0);
    const minS = Number(selectedChart.minSnf || 7.5);
    const maxS = Number(selectedChart.maxSnf || 9.5);
    const fStep = Number(selectedChart.fatStep || 0.1);
    const sStep = Number(selectedChart.snfStep || 0.1);

    const generated: RateMatrixCell[] = [];
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
    if (!selectedChart || !selectedVersion) return;
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
    } catch (err: any) {
      showToast('Failed to save matrix: ' + err.message, 'error');
    } finally {
      setSavingMatrix(false);
    }
  };

  // State Transition Actions
  const handleSubmitVersion = async (v: RateChartVersion) => {
    if (!selectedChart) return;
    try {
      await rateApi.submitVersion(selectedChart.id, v.id);
      showToast('Version submitted for Owner approval', 'success');
      loadVersions(selectedChart.id);
    } catch (err: any) {
      showToast('Submit failed: ' + err.message, 'error');
    }
  };

  const handleApproveVersion = async (v: RateChartVersion) => {
    if (!selectedChart) return;
    try {
      await rateApi.approveVersion(selectedChart.id, v.id);
      showToast('Version approved successfully', 'success');
      loadVersions(selectedChart.id);
    } catch (err: any) {
      showToast('Approve failed: ' + err.message, 'error');
    }
  };

  const handlePublishVersion = async (v: RateChartVersion) => {
    if (!selectedChart) return;
    if (!window.confirm('Are you sure you want to PUBLISH this version? It will become the authoritative pricing version for milk collections!')) return;
    try {
      await rateApi.publishVersion(selectedChart.id, v.id);
      showToast('Rate chart version PUBLISHED! Historical rates locked.', 'success');
      loadVersions(selectedChart.id);
      loadCharts();
    } catch (err: any) {
      showToast('Publish failed: ' + err.message, 'error');
    }
  };

  // Create New Version
  const handleCreateVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChart) return;
    try {
      await rateApi.createVersion(selectedChart.id, newVersionForm);
      showToast('New draft version created!', 'success');
      setNewVersionModalOpen(false);
      loadVersions(selectedChart.id);
    } catch (err: any) {
      showToast('Failed to create version: ' + err.message, 'error');
    }
  };

  // Rate Simulator
  const handleRunSimulation = async () => {
    if (!selectedChart) return;
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
    } catch (err: any) {
      showToast('Preview calculation error: ' + err.message, 'error');
    } finally {
      setCalculatingSim(false);
    }
  };

  // Group matrix cells for table display: Fat values as rows, SNF values as columns
  const matrixGrid = useMemo(() => {
    if (!matrixCells || matrixCells.length === 0) return { fatRows: [], snfCols: [], cellMap: new Map() };
    const fats = Array.from(new Set(matrixCells.map(c => Number(c.fat)))).sort((a, b) => a - b);
    const snfs = Array.from(new Set(matrixCells.map(c => Number(c.snf)))).sort((a, b) => a - b);
    const map = new Map<string, number>();
    matrixCells.forEach(c => {
      map.set(`${Number(c.fat).toFixed(1)}_${Number(c.snf).toFixed(1)}`, Number(c.ratePerUnit));
    });
    return { fatRows: fats, snfCols: snfs, cellMap: map };
  }, [matrixCells]);

  return (
    <div className="space-y-6 select-none">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-200/80">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>📈</span>
            <span>Milk Rate Chart & Matrix Management</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
            Authoritative Fat × SNF pricing matrices, four-eye draft approvals, published version locking, and live rate simulator.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEditRates && selectedChart && (
            <ClayButton
              variant="brand"
              size="sm"
              onClick={() => setNewVersionModalOpen(true)}
              icon={<span className="text-base font-bold">+</span>}
            >
              New Version
            </ClayButton>
          )}
        </div>
      </div>

      {/* Main Grid: Rate Charts on Left, Simulator on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Charts Selection */}
        <div className="lg:col-span-2 space-y-5">
          <div className="clay-surface p-5 sm:p-6">
            <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3.5 flex items-center gap-2">
              <span>🏷️</span>
              <span>Configured Rate Charts</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {loading ? (
                <div className="p-8 text-center text-slate-400 font-bold text-xs">Loading rate charts...</div>
              ) : charts.length === 0 ? (
                <div className="p-8 text-center text-slate-400 font-bold text-xs">No rate charts configured.</div>
              ) : (
                charts.map((c) => {
                  const isSelected = selectedChart?.id === c.id;
                  return (
                    <div
                      key={c.id}
                      onClick={() => setSelectedChart(c)}
                      className={`p-4 rounded-2xl border transition-all duration-200 cursor-pointer select-none ${
                        isSelected
                          ? 'bg-[#E6F4FA] border-[#23759B]/60 shadow-[0_6px_16px_rgba(0,80,110,0.12),inset_0_1.5px_2px_rgba(255,255,255,0.95)] transform -translate-y-0.5'
                          : 'bg-[#F8FAFC] border-slate-200/80 hover:bg-white hover:border-slate-300 shadow-[0_2px_5px_rgba(0,0,0,0.03)]'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-black text-slate-900 text-sm">{c.name}</span>
                        <StatusBadge status={c.milkCategory} />
                      </div>
                      <div className="text-xs text-slate-500 font-mono space-y-1">
                        <div>Code: <span className="font-bold text-slate-700">{c.code}</span></div>
                        <div>Formula: <span className="font-semibold text-slate-700">{c.pricingFormula}</span></div>
                        <div className="text-[11px] text-slate-600">
                          FAT: {c.minFat}%–{c.maxFat}% (Step {c.fatStep}) &bull; SNF: {c.minSnf}%–{c.maxSnf}%
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Version History Table for Selected Chart */}
          {selectedChart && (
            <div className="clay-surface overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 bg-gradient-to-r from-slate-50/70 to-white">
                <div className="flex items-center gap-2">
                  <span className="text-base">📜</span>
                  <h3 className="font-black text-slate-800 text-sm tracking-tight">
                    Version History — {selectedChart.name}
                  </h3>
                </div>
                <span className="text-[11px] font-bold text-slate-400">
                  Published versions are immutable snapshots
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm text-slate-600">
                  <thead className="bg-[#F8FAFC] text-[11px] font-black text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3.5">Version</th>
                      <th className="px-4 py-3.5">Effective Date</th>
                      <th className="px-4 py-3.5">Base Rate</th>
                      <th className="px-4 py-3.5">Status</th>
                      <th className="px-4 py-3.5 text-center">Matrix</th>
                      <th className="px-4 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                    {versions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400 font-bold">
                          No versions recorded for this chart.
                        </td>
                      </tr>
                    ) : (
                      versions.map((v) => (
                        <tr key={v.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3 font-black text-slate-900">
                            v{v.versionNumber}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs font-bold text-slate-600">
                            {new Date(v.effectiveFrom).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 font-mono font-black text-slate-900">
                            ₹{Number(v.baseRatePerUnit).toFixed(2)}/L
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={v.status} />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => handleOpenMatrix(v)}
                              className="px-3 py-1 text-xs bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200/90 rounded-xl font-bold shadow-sm transition active:translate-y-0.5"
                            >
                              📊 {v.status === 'DRAFT' ? 'Edit Matrix' : 'View Matrix'}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {v.status === 'DRAFT' && canEditRates && (
                                <button
                                  onClick={() => handleSubmitVersion(v)}
                                  className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold shadow-sm transition active:translate-y-0.5"
                                >
                                  Submit
                                </button>
                              )}
                              {v.status === 'SUBMITTED' && isOwnerOrAdmin && (
                                <button
                                  onClick={() => handleApproveVersion(v)}
                                  className="px-2.5 py-1 bg-[#00506E] hover:bg-[#003B52] text-white rounded-lg text-xs font-bold shadow-sm transition active:translate-y-0.5"
                                >
                                  Approve
                                </button>
                              )}
                              {v.status === 'APPROVED' && isOwnerOrAdmin && (
                                <button
                                  onClick={() => handlePublishVersion(v)}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition active:translate-y-0.5"
                                >
                                  🚀 Publish
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Rate Preview & Simulation Sandbox */}
        <div className="space-y-4">
          <div className="clay-surface p-5 sm:p-6">
            <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-1.5 flex items-center gap-2">
              <span>🔬</span>
              <span>Rate Preview Calculator</span>
            </h2>
            <p className="text-xs text-slate-500 font-medium mb-4">
              Simulate collection calculation using the backend's active pricing engine.
            </p>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-600 mb-1">Target Milk Category</label>
                <div className="text-xs font-bold text-slate-800 bg-[#EDF2F7] p-2.5 rounded-xl border border-slate-200/90 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)]">
                  {selectedChart ? `${selectedChart.name} (${selectedChart.milkCategory})` : 'Select a chart first'}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-600 mb-1">FAT Percentage (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={simFat}
                  onChange={(e) => setSimFat(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-600 mb-1">SNF Percentage (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={simSnf}
                  onChange={(e) => setSimSnf(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-600 mb-1">Milk Quantity (Kg/L)</label>
                <input
                  type="number"
                  step="0.1"
                  value={simWeight}
                  onChange={(e) => setSimWeight(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]"
                />
              </div>

              <ClayButton
                variant="brand"
                size="md"
                className="w-full mt-2"
                onClick={handleRunSimulation}
                disabled={!selectedChart || calculatingSim}
                isLoading={calculatingSim}
              >
                Run Simulation
              </ClayButton>

              {simResult && (
                <div className="mt-4 p-4 rounded-2xl bg-gradient-to-br from-[#F2FBF6] to-white border border-emerald-200/90 space-y-2 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.9)] animate-fadeIn">
                  <div className="flex justify-between items-center text-xs text-slate-600">
                    <span className="font-bold">Applicable Unit Rate:</span>
                    <span className="font-black text-base text-slate-900 font-mono">
                      ₹{simResult.rate.toFixed(2)}/L
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-600 pt-1.5 border-t border-emerald-200/60">
                    <span className="font-bold">Total Milk Value:</span>
                    <span className="font-black text-lg text-[#137333] font-mono">
                      ₹{simResult.totalAmount.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Matrix Editor Modal */}
      <Modal
        isOpen={matrixModalOpen}
        onClose={() => setMatrixModalOpen(false)}
        title={`Rate Matrix Editor — ${selectedChart?.name} (v${selectedVersion?.versionNumber} - ${selectedVersion?.status})`}
        maxWidth="5xl"
      >
        <div className="space-y-4 text-xs">
          {selectedVersion?.status !== 'DRAFT' && (
            <div className="bg-[#FFFDF5] border border-amber-200/90 text-amber-900 text-xs p-4 rounded-2xl shadow-sm">
              <strong className="font-black">Read-Only Mode:</strong> This version is {selectedVersion?.status}. Historical finalized rates cannot be altered. Create a new draft version to modify pricing.
            </div>
          )}

          {selectedVersion?.status === 'DRAFT' && (
            <div className="p-4 bg-[#F8FAFC] border border-slate-200/80 rounded-2xl flex flex-wrap items-center gap-3 text-xs">
              <span className="font-black text-slate-700">Quick Generator:</span>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-600">Base ₹:</span>
                <input
                  type="number"
                  step="0.5"
                  value={bulkBaseRate}
                  onChange={(e) => setBulkBaseRate(parseFloat(e.target.value) || 0)}
                  className="w-20 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-600">+₹/0.1 Fat:</span>
                <input
                  type="number"
                  step="0.1"
                  value={fatDelta}
                  onChange={(e) => setFatDelta(parseFloat(e.target.value) || 0)}
                  className="w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-600">+₹/0.1 SNF:</span>
                <input
                  type="number"
                  step="0.1"
                  value={snfDelta}
                  onChange={(e) => setSnfDelta(parseFloat(e.target.value) || 0)}
                  className="w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                />
              </div>
              <ClayButton
                variant="brand"
                size="sm"
                onClick={handleGenerateMatrix}
              >
                Populate Grid
              </ClayButton>
            </div>
          )}

          {/* Matrix Grid Table */}
          <div className="overflow-x-auto max-h-[500px] border border-slate-200/80 rounded-2xl shadow-inner">
            <table className="w-full text-center text-xs font-mono">
              <thead className="bg-[#F8FAFC] sticky top-0 border-b border-slate-200/90 font-black">
                <tr>
                  <th className="p-2.5 border-r bg-slate-200/70 font-black text-slate-800">FAT \ SNF</th>
                  {matrixGrid.snfCols.map(s => (
                    <th key={s} className="p-2.5 border-r text-slate-700 font-bold min-w-[55px]">
                      {s.toFixed(1)}%
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold">
                {matrixGrid.fatRows.length === 0 ? (
                  <tr>
                    <td colSpan={matrixGrid.snfCols.length + 1} className="p-8 text-center text-slate-400 font-sans">
                      Matrix is empty. Use the generator above or configure cells to initialize.
                    </td>
                  </tr>
                ) : (
                  matrixGrid.fatRows.map(f => (
                    <tr key={f} className="hover:bg-slate-50">
                      <td className="p-2.5 border-r bg-slate-100/80 font-black text-slate-900">
                        {f.toFixed(1)}%
                      </td>
                      {matrixGrid.snfCols.map(s => {
                        const key = `${f.toFixed(1)}_${s.toFixed(1)}`;
                        const val = matrixGrid.cellMap.get(key) ?? 0;
                        return (
                          <td key={s} className="p-1 border-r">
                            {selectedVersion?.status === 'DRAFT' ? (
                              <input
                                type="number"
                                step="0.1"
                                value={val}
                                onChange={(e) => {
                                  const newVal = parseFloat(e.target.value) || 0;
                                  const updated = matrixCells.filter(c => !(c.fat === f && c.snf === s));
                                  updated.push({ fat: f, snf: s, ratePerUnit: newVal });
                                  setMatrixCells(updated);
                                }}
                                className="w-14 text-center px-1 py-1 bg-[#EDF2F7] border border-slate-200 rounded-lg text-xs font-bold focus:bg-white focus:ring-1 focus:ring-[#00506E]"
                              />
                            ) : (
                              <span className="text-slate-900 font-bold">₹{val.toFixed(2)}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
            <ClayButton
              variant="secondary"
              size="sm"
              onClick={() => setMatrixModalOpen(false)}
            >
              Close
            </ClayButton>
            {selectedVersion?.status === 'DRAFT' && (
              <ClayButton
                variant="brand"
                size="sm"
                onClick={handleSaveMatrix}
                disabled={savingMatrix}
                isLoading={savingMatrix}
              >
                Save Matrix Cells
              </ClayButton>
            )}
          </div>
        </div>
      </Modal>

      {/* New Version Modal */}
      <Modal
        isOpen={newVersionModalOpen}
        onClose={() => setNewVersionModalOpen(false)}
        title={`Create New Rate Version — ${selectedChart?.name}`}
        maxWidth="md"
      >
        <form onSubmit={handleCreateVersion} className="space-y-4 text-xs">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1">Effective From Date</label>
            <input
              type="date"
              value={newVersionForm.effectiveFrom}
              onChange={(e) => setNewVersionForm({ ...newVersionForm, effectiveFrom: e.target.value })}
              className="w-full px-3 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]"
              required
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1">Base Rate (₹/Liter)</label>
            <input
              type="number"
              step="0.5"
              value={newVersionForm.baseRatePerUnit}
              onChange={(e) => setNewVersionForm({ ...newVersionForm, baseRatePerUnit: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]"
              required
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1">Pricing Model</label>
            <select
              value={newVersionForm.pricingModel}
              onChange={(e) => setNewVersionForm({ ...newVersionForm, pricingModel: e.target.value })}
              className="w-full px-3 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E] cursor-pointer"
            >
              <option value="FAT_SNF_MATRIX">FAT × SNF Matrix</option>
              <option value="TS_FORMULA">Total Solids (TS) Formula</option>
              <option value="FLAT_RATE">Flat Rate</option>
            </select>
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
            <ClayButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setNewVersionModalOpen(false)}
            >
              Cancel
            </ClayButton>
            <ClayButton
              type="submit"
              variant="brand"
              size="sm"
            >
              Create Draft Version
            </ClayButton>
          </div>
        </form>
      </Modal>
    </div>
  );
};
