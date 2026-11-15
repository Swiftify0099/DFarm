import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import {
  collectionApi,
  type ShiftSummary,
  type MilkCollectionRecord,
  type SupervisorAdjustmentPayload,
} from '../../api/collectionApi.js';
import { StatCard } from '../../components/StatCard.js';
import { StatusBadge } from '../../components/Badge.js';
import { Modal } from '../../components/Modal.js';
import { SearchBar } from '../../components/SearchBar.js';
import { Pagination } from '../../components/Pagination.js';
import { ClayButton } from '../../components/ClayButton.js';

export const MilkCollectionModule: React.FC = () => {
  const { currentCenterId, selectedShift, businessDate, hasRole } = useAuth();
  const { showToast } = useToast();

  // State
  const [loading, setLoading] = useState<boolean>(true);
  const [shiftSummary, setShiftSummary] = useState<ShiftSummary | null>(null);
  const [records, setRecords] = useState<MilkCollectionRecord[]>([]);
  const [filterShift, setFilterShift] = useState<string>(selectedShift || 'ALL');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<string>(businessDate);

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 15;

  // Modals
  const [receiptModalOpen, setReceiptModalOpen] = useState<boolean>(false);
  const [receiptContent, setReceiptContent] = useState<string>('');
  const [adjustModalOpen, setAdjustModalOpen] = useState<boolean>(false);
  const [selectedRecord, setSelectedRecord] = useState<MilkCollectionRecord | null>(null);
  const [submittingAdjust, setSubmittingAdjust] = useState<boolean>(false);
  const [adjustForm, setAdjustForm] = useState<SupervisorAdjustmentPayload>({
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
    } catch (err: any) {
      showToast(err.message || 'Failed to load milk collection records', 'error');
    } finally {
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
  const handleViewReceipt = async (record: MilkCollectionRecord) => {
    try {
      const res = await collectionApi.getReceiptSlip(record.id);
      setReceiptContent(res.receiptText || 'Receipt data unavailable');
      setReceiptModalOpen(true);
    } catch (err: any) {
      showToast('Could not retrieve thermal receipt slip: ' + err.message, 'error');
    }
  };

  const handleOpenAdjust = (record: MilkCollectionRecord) => {
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

  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecord) return;
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
    } catch (err: any) {
      showToast(err.message || 'Failed to submit supervisor adjustment', 'error');
    } finally {
      setSubmittingAdjust(false);
    }
  };

  return (
    <div className="space-y-6 select-none">
      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-200/80">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>🥛</span>
            <span>Milk Collection Management</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
            Live shift registers, intake history, quality metrics (FAT/SNF), and audited supervisor corrections.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-[#EDF2F7] p-1 rounded-xl border border-slate-200/80 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)]">
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-3 py-1.5 border border-white/80 rounded-lg text-xs font-bold bg-white text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#00506E]"
            />
          </div>
          <ClayButton
            variant="emerald"
            size="sm"
            onClick={loadData}
            icon={<span>🔄</span>}
          >
            Refresh
          </ClayButton>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Milk Received"
          value={`${(shiftSummary?.totalWeightKg ?? (cowTotalWeight + buffaloTotalWeight)).toFixed(2)} kg`}
          subtext={`${records.length} Intakes Recorded`}
          variant="sky"
          icon="⚖️"
        />
        <StatCard
          title="Cow Milk"
          value={`${cowTotalWeight.toFixed(2)} kg`}
          subtext={`${cowRecords.length} Cow Intakes`}
          variant="emerald"
          icon="🐄"
        />
        <StatCard
          title="Buffalo Milk"
          value={`${buffaloTotalWeight.toFixed(2)} kg`}
          subtext={`${buffaloRecords.length} Buffalo Intakes`}
          variant="indigo"
          icon="🐃"
        />
        <StatCard
          title="Total Shift Value"
          value={`₹${(shiftSummary?.totalAmount ?? totalMilkValue).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
          subtext={`Avg FAT: ${(shiftSummary?.averageFat ?? 0).toFixed(2)}% | SNF: ${(shiftSummary?.averageSnf ?? 0).toFixed(2)}%`}
          variant="amber"
          icon="💰"
        />
      </div>

      {/* Operational Filter Controls */}
      <div className="clay-surface p-4 sm:p-5 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="w-full md:w-80">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search farmer code or name..."
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 bg-[#EDF2F7] px-3 py-1.5 rounded-xl border border-slate-200/80 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)]">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Shift:</label>
            <select
              value={filterShift}
              onChange={(e) => setFilterShift(e.target.value)}
              className="bg-white border border-white/80 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#00506E] cursor-pointer"
            >
              <option value="ALL">All Shifts</option>
              <option value="MORNING">Morning Shift</option>
              <option value="EVENING">Evening Shift</option>
            </select>
          </div>

          <div className="flex items-center gap-2 bg-[#EDF2F7] px-3 py-1.5 rounded-xl border border-slate-200/80 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)]">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Category:</label>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="bg-white border border-white/80 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#00506E] cursor-pointer"
            >
              <option value="ALL">All Categories</option>
              <option value="COW">Cow Milk</option>
              <option value="BUFFALO">Buffalo Milk</option>
            </select>
          </div>
        </div>
      </div>

      {/* Milk Collections Table */}
      <div className="clay-surface overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 bg-gradient-to-r from-slate-50/70 to-white">
          <div className="flex items-center gap-2">
            <span className="text-base">📋</span>
            <h2 className="font-black text-slate-800 text-sm tracking-tight">
              Collection Register ({filteredRecords.length} records)
            </h2>
          </div>
          <span className="text-[11px] font-bold text-slate-400">
            Hardware scale & analyzer values certified with authoritative pricing
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm text-slate-600">
            <thead className="bg-[#F8FAFC] text-[11px] font-black text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3.5">Time / Shift</th>
                <th className="px-4 py-3.5">Farmer</th>
                <th className="px-4 py-3.5">Type</th>
                <th className="px-4 py-3.5 text-right">Qty (Kg/L)</th>
                <th className="px-4 py-3.5 text-right">FAT %</th>
                <th className="px-4 py-3.5 text-right">SNF %</th>
                <th className="px-4 py-3.5 text-right">Rate (₹)</th>
                <th className="px-4 py-3.5 text-right">Amount (₹)</th>
                <th className="px-4 py-3.5 text-center">Source</th>
                <th className="px-4 py-3.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-wider">
                      <span className="animate-spin inline-block mr-1">⏳</span> Loading collection registers...
                    </div>
                  </td>
                </tr>
              ) : paginatedRecords.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <span className="text-3xl">🥛</span>
                      <p className="font-bold">No milk collection records found for the selected date and filters.</p>
                      <p className="text-[11px] text-slate-400">Switch shifts or pick another date to inspect collections.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedRecords.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-black text-slate-900">
                        {rec.started_at ? new Date(rec.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </div>
                      <span className={`inline-block text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                        rec.shift_type === 'MORNING' ? 'bg-[#FEF7E0] text-[#B06000]' : 'bg-[#E8F0FE] text-[#1A73E8]'
                      }`}>
                        {rec.shift_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-black text-slate-900">{rec.customer_name || 'Farmer'}</div>
                      <div className="text-[11px] font-mono text-slate-400 font-bold">{rec.farmer_code}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={rec.selected_milk_category} />
                    </td>
                    <td className="px-4 py-3 text-right font-black text-slate-900">
                      {Number(rec.net_weight).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">
                      {Number(rec.fat_percentage).toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">
                      {Number(rec.snf_percentage).toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-700">
                      ₹{Number(rec.applied_rate_per_unit).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-black text-[#137333]">
                      ₹{Number(rec.total_amount).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span className="text-[10px] font-mono font-extrabold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">
                        {rec.measurement_source || 'AUTO_BRIDGE'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleViewReceipt(rec)}
                          title="View Thermal Receipt Slip"
                          className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold shadow-sm transition active:translate-y-0.5"
                        >
                          🧾 Slip
                        </button>
                        {canAdjust && (
                          <button
                            onClick={() => handleOpenAdjust(rec)}
                            title="Supervisor Correction or Reversal"
                            className="px-2.5 py-1 bg-white hover:bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold shadow-sm transition active:translate-y-0.5"
                          >
                            ✏️ Adjust
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

        {/* Pagination Footer */}
        <Pagination
          currentPage={currentPage}
          totalItems={filteredRecords.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* Thermal Receipt Slip Modal */}
      <Modal
        isOpen={receiptModalOpen}
        onClose={() => setReceiptModalOpen(false)}
        title="Thermal Receipt Slip Preview (40-Col)"
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="bg-[#FFFDF6] p-5 rounded-2xl border border-amber-200/90 font-mono text-xs whitespace-pre-wrap leading-relaxed shadow-[inset_1.5px_1.5px_3px_rgba(0,0,0,0.04)] text-slate-800 overflow-x-auto">
            {receiptContent}
          </div>
          <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
            <ClayButton
              variant="secondary"
              size="sm"
              onClick={() => setReceiptModalOpen(false)}
            >
              Close
            </ClayButton>
            <ClayButton
              variant="emerald"
              size="sm"
              onClick={() => window.print()}
              icon={<span>🖨️</span>}
            >
              Print Receipt
            </ClayButton>
          </div>
        </div>
      </Modal>

      {/* Supervisor Adjustment Modal */}
      <Modal
        isOpen={adjustModalOpen}
        onClose={() => setAdjustModalOpen(false)}
        title={`Supervisor Adjustment — Intake #${selectedRecord?.farmer_code}`}
        maxWidth="lg"
      >
        <form onSubmit={handleSaveAdjustment} className="space-y-4 text-xs">
          <div className="bg-[#FFFDF5] border border-amber-200/90 rounded-2xl p-4 text-xs text-amber-900 leading-normal shadow-[inset_1px_1px_2px_rgba(255,255,255,0.9)]">
            <strong className="font-black">Audited Operation:</strong> Adjustments to finalized collections will reverse the original ledger entry and post a differential adjusting journal. All changes require an audit justification.
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1">Adjustment Type</label>
            <select
              value={adjustForm.adjustmentType}
              onChange={(e) => setAdjustForm({ ...adjustForm, adjustmentType: e.target.value as any })}
              className="w-full px-3 py-2.5 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E] cursor-pointer"
            >
              <option value="FAT_SNF_OVERRIDE">FAT / SNF Override (Recalculate Rate)</option>
              <option value="WEIGHT_CORRECTION">Weight Correction</option>
              <option value="RATE_RECALCULATION">Force Rate Recalculation</option>
              <option value="COMPLETE_REVERSAL">Complete Reversal (Cancel Intake)</option>
            </select>
          </div>

          {adjustForm.adjustmentType !== 'COMPLETE_REVERSAL' && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1">Weight (Kg)</label>
                <input
                  type="number"
                  step="0.01"
                  value={adjustForm.adjustedNetWeight ?? ''}
                  onChange={(e) => setAdjustForm({ ...adjustForm, adjustedNetWeight: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1">FAT %</label>
                <input
                  type="number"
                  step="0.1"
                  value={adjustForm.adjustedFatPercentage ?? ''}
                  onChange={(e) => setAdjustForm({ ...adjustForm, adjustedFatPercentage: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1">SNF %</label>
                <input
                  type="number"
                  step="0.1"
                  value={adjustForm.adjustedSnfPercentage ?? ''}
                  onChange={(e) => setAdjustForm({ ...adjustForm, adjustedSnfPercentage: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]"
                  required
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1">
              Audit Reason / Justification <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={3}
              value={adjustForm.reason}
              onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
              placeholder="e.g. Analyzer tube was recalibrated following reading divergence; approved by Center Manager."
              className="w-full px-3 py-2.5 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-medium text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              required
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
            <ClayButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setAdjustModalOpen(false)}
            >
              Cancel
            </ClayButton>
            <ClayButton
              type="submit"
              variant="brand"
              size="sm"
              disabled={submittingAdjust}
              isLoading={submittingAdjust}
            >
              Confirm Adjustment
            </ClayButton>
          </div>
        </form>
      </Modal>
    </div>
  );
};
