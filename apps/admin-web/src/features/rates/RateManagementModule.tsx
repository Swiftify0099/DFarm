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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">📈 Milk Rate Chart & Matrix Management</h1>
          <p className="text-sm text-gray-500 mt-1">
            Authoritative Fat × SNF pricing matrices, four-eye draft approvals, published version locking, and live rate simulator.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEditRates && selectedChart && (
            <button
              onClick={() => setNewVersionModalOpen(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium shadow-sm transition"
            >
              ➕ New Version
            </button>
          )}
        </div>
      </div>

      {/* Main Grid: Rate Charts on Left, Simulator on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Charts Selection */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
              Configured Rate Charts
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {loading ? (
                <div className="p-4 text-center text-gray-500">Loading rate charts...</div>
              ) : charts.length === 0 ? (
                <div className="p-4 text-center text-gray-500">No rate charts configured.</div>
              ) : (
                charts.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => setSelectedChart(c)}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition ${
                      selectedChart?.id === c.id
                        ? 'border-emerald-600 bg-emerald-50/40 shadow-sm'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-bold text-gray-900">{c.name}</span>
                      <StatusBadge status={c.milkCategory} />
                    </div>
                    <div className="text-xs text-gray-500 font-mono space-y-1">
                      <div>Code: {c.code}</div>
                      <div>Formula: {c.pricingFormula}</div>
                      <div>
                        FAT: {c.minFat}%–{c.maxFat}% (Step {c.fatStep}) | SNF: {c.minSnf}%–{c.maxSnf}%
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Version History Table for Selected Chart */}
          {selectedChart && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
                <h3 className="font-semibold text-gray-800 text-sm">
                  Version History — {selectedChart.name}
                </h3>
                <span className="text-xs text-gray-500">
                  Published versions are immutable snapshots
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-600">
                  <thead className="bg-gray-100 text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Version</th>
                      <th className="px-4 py-3">Effective Date</th>
                      <th className="px-4 py-3">Base Rate</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-center">Matrix</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {versions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                          No versions recorded for this chart.
                        </td>
                      </tr>
                    ) : (
                      versions.map((v) => (
                        <tr key={v.id} className="hover:bg-gray-50 transition">
                          <td className="px-4 py-3 font-semibold text-gray-900">
                            v{v.versionNumber}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">
                            {new Date(v.effectiveFrom).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 font-mono font-medium text-gray-800">
                            ₹{Number(v.baseRatePerUnit).toFixed(2)}/L
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={v.status} />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => handleOpenMatrix(v)}
                              className="px-2.5 py-1 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded font-medium transition"
                            >
                              📊 {v.status === 'DRAFT' ? 'Edit Matrix' : 'View Matrix'}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {v.status === 'DRAFT' && canEditRates && (
                                <button
                                  onClick={() => handleSubmitVersion(v)}
                                  className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded text-xs font-medium transition"
                                >
                                  Submit
                                </button>
                              )}
                              {v.status === 'SUBMITTED' && isOwnerOrAdmin && (
                                <button
                                  onClick={() => handleApproveVersion(v)}
                                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition"
                                >
                                  Approve
                                </button>
                              )}
                              {v.status === 'APPROVED' && isOwnerOrAdmin && (
                                <button
                                  onClick={() => handlePublishVersion(v)}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium shadow-sm transition"
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
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
            <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              🔬 Rate Preview Calculator
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              Simulate collection calculation using the backend's active pricing engine.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Target Milk Category</label>
                <div className="text-xs font-bold text-gray-800 bg-gray-50 p-2 rounded border border-gray-200">
                  {selectedChart ? `${selectedChart.name} (${selectedChart.milkCategory})` : 'Select a chart first'}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">FAT Percentage (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={simFat}
                  onChange={(e) => setSimFat(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">SNF Percentage (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={simSnf}
                  onChange={(e) => setSimSnf(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Milk Quantity (Kg/L)</label>
                <input
                  type="number"
                  step="0.1"
                  value={simWeight}
                  onChange={(e) => setSimWeight(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              <button
                onClick={handleRunSimulation}
                disabled={!selectedChart || calculatingSim}
                className="w-full mt-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium shadow-sm transition disabled:opacity-50"
              >
                {calculatingSim ? 'Calculating...' : 'Run Simulation'}
              </button>

              {simResult && (
                <div className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2 animate-fadeIn">
                  <div className="flex justify-between items-center text-xs text-gray-600">
                    <span>Applicable Unit Rate:</span>
                    <span className="font-bold text-base text-gray-900 font-mono">
                      ₹{simResult.rate.toFixed(2)}/L
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-gray-600 pt-1 border-t border-emerald-200">
                    <span>Total Milk Value:</span>
                    <span className="font-bold text-lg text-emerald-800 font-mono">
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
        <div className="space-y-4">
          {selectedVersion?.status !== 'DRAFT' && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-3 rounded-lg">
              <strong>Read-Only Mode:</strong> This version is {selectedVersion?.status}. Historical finalized rates cannot be altered. Create a new draft version to modify pricing.
            </div>
          )}

          {selectedVersion?.status === 'DRAFT' && (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg flex flex-wrap items-center gap-3 text-xs">
              <span className="font-semibold text-gray-700">Quick Generator:</span>
              <div className="flex items-center gap-1">
                <span>Base ₹:</span>
                <input
                  type="number"
                  step="0.5"
                  value={bulkBaseRate}
                  onChange={(e) => setBulkBaseRate(parseFloat(e.target.value) || 0)}
                  className="w-20 px-2 py-1 border rounded text-xs"
                />
              </div>
              <div className="flex items-center gap-1">
                <span>+₹/0.1 Fat:</span>
                <input
                  type="number"
                  step="0.1"
                  value={fatDelta}
                  onChange={(e) => setFatDelta(parseFloat(e.target.value) || 0)}
                  className="w-16 px-2 py-1 border rounded text-xs"
                />
              </div>
              <div className="flex items-center gap-1">
                <span>+₹/0.1 SNF:</span>
                <input
                  type="number"
                  step="0.1"
                  value={snfDelta}
                  onChange={(e) => setSnfDelta(parseFloat(e.target.value) || 0)}
                  className="w-16 px-2 py-1 border rounded text-xs"
                />
              </div>
              <button
                onClick={handleGenerateMatrix}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-medium transition"
              >
                Populate Grid
              </button>
            </div>
          )}

          {/* Matrix Grid Table */}
          <div className="overflow-x-auto max-h-[500px] border border-gray-200 rounded-lg shadow-inner">
            <table className="w-full text-center text-xs font-mono">
              <thead className="bg-gray-100 sticky top-0 border-b border-gray-200">
                <tr>
                  <th className="p-2 border-r bg-gray-200 font-bold text-gray-800">FAT \ SNF</th>
                  {matrixGrid.snfCols.map(s => (
                    <th key={s} className="p-2 border-r text-gray-700 font-semibold min-w-[50px]">
                      {s.toFixed(1)}%
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {matrixGrid.fatRows.length === 0 ? (
                  <tr>
                    <td colSpan={matrixGrid.snfCols.length + 1} className="p-8 text-center text-gray-500 font-sans">
                      Matrix is empty. Use the generator above or configure cells to initialize.
                    </td>
                  </tr>
                ) : (
                  matrixGrid.fatRows.map(f => (
                    <tr key={f} className="hover:bg-gray-50">
                      <td className="p-2 border-r bg-gray-100 font-bold text-gray-800">
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
                                className="w-14 text-center px-1 py-0.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-emerald-500"
                              />
                            ) : (
                              <span className="text-gray-900 font-medium">₹{val.toFixed(2)}</span>
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

          <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
            <button
              onClick={() => setMatrixModalOpen(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition"
            >
              Close
            </button>
            {selectedVersion?.status === 'DRAFT' && (
              <button
                onClick={handleSaveMatrix}
                disabled={savingMatrix}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium shadow-sm transition disabled:opacity-50"
              >
                {savingMatrix ? 'Saving...' : 'Save Matrix Cells'}
              </button>
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
        <form onSubmit={handleCreateVersion} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Effective From Date</label>
            <input
              type="date"
              value={newVersionForm.effectiveFrom}
              onChange={(e) => setNewVersionForm({ ...newVersionForm, effectiveFrom: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Base Rate (₹/Liter)</label>
            <input
              type="number"
              step="0.5"
              value={newVersionForm.baseRatePerUnit}
              onChange={(e) => setNewVersionForm({ ...newVersionForm, baseRatePerUnit: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Pricing Model</label>
            <select
              value={newVersionForm.pricingModel}
              onChange={(e) => setNewVersionForm({ ...newVersionForm, pricingModel: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="FAT_SNF_MATRIX">FAT × SNF Matrix</option>
              <option value="TS_FORMULA">Total Solids (TS) Formula</option>
              <option value="FLAT_RATE">Flat Rate</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
            <button
              type="button"
              onClick={() => setNewVersionModalOpen(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium shadow-sm transition"
            >
              Create Draft Version
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
