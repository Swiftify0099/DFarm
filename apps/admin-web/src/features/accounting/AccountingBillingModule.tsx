import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import {
  billingApi,
  type BillingPeriod,
  type MonthlyBill,
} from '../../api/billingApi.js';
import { StatusBadge } from '../../components/Badge.js';
import { Modal } from '../../components/Modal.js';
import { Pagination } from '../../components/Pagination.js';
import { ClayButton } from '../../components/ClayButton.js';

type AccountingTab = 'billing' | 'payouts' | 'advances' | 'batches';

export const AccountingBillingModule: React.FC = () => {
  const { currentCenterId, hasRole } = useAuth();
  const { showToast } = useToast();

  const isOwnerOrAdmin = hasRole(['SUPER_ADMIN', 'DAIRY_OWNER']);
  const isAccountantOrManager = hasRole(['SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'ACCOUNTANT']);

  // Tabs
  const [activeTab, setActiveTab] = useState<AccountingTab>('billing');

  // Billing Periods & Bills State
  const [loading, setLoading] = useState<boolean>(true);
  const [periods, setPeriods] = useState<BillingPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<BillingPeriod | null>(null);
  const [bills, setBills] = useState<MonthlyBill[]>([]);
  const [generatingBills, setGeneratingBills] = useState<boolean>(false);

  // New Billing Period Modal
  const [createPeriodModalOpen, setCreatePeriodModalOpen] = useState<boolean>(false);
  const [periodForm, setPeriodForm] = useState<{
    periodName: string;
    periodType: string;
    startDate: string;
    endDate: string;
  }>({
    periodName: 'Cycle 1 (Nov 2026)',
    periodType: 'TEN_DAY',
    startDate: new Date().toISOString().split('T')[0] || '',
    endDate: new Date().toISOString().split('T')[0] || '',
  });

  // Bill Adjust Modal
  const [adjustModalOpen, setAdjustModalOpen] = useState<boolean>(false);
  const [selectedBill, setSelectedBill] = useState<MonthlyBill | null>(null);
  const [billAdjustForm, setBillAdjustForm] = useState({
    adjustmentType: 'CREDIT_BONUS',
    amount: 0,
    reason: '',
  });

  // Pagination for bills
  const [billPage, setBillPage] = useState<number>(1);
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
    } catch (err: any) {
      showToast('Failed to load billing periods: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [currentCenterId, selectedPeriod, showToast]);

  // Load Bills for selected period
  const loadPeriodBills = useCallback(async (periodId: string) => {
    try {
      const res = await billingApi.getPeriod(periodId);
      const billsList = res?.bills || res?.data?.bills || [];
      setBills(Array.isArray(billsList) ? billsList : []);
    } catch (err: any) {
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
    if (!selectedPeriod) return;
    setGeneratingBills(true);
    try {
      await billingApi.generateBills(selectedPeriod.id, { forceRecalculate: true });
      showToast('Bill generation triggered successfully! Refreshing...', 'success');
      loadPeriodBills(selectedPeriod.id);
      loadBillingData();
    } catch (err: any) {
      showToast('Bill generation failed: ' + err.message, 'error');
    } finally {
      setGeneratingBills(false);
    }
  };

  // Create Billing Period
  const handleCreatePeriod = async (e: React.FormEvent) => {
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
    } catch (err: any) {
      showToast('Create period error: ' + err.message, 'error');
    }
  };

  // Actions on individual bills
  const handleSubmitBill = async (billId: string) => {
    try {
      await billingApi.submitReview(billId);
      showToast('Bill submitted for review', 'success');
      if (selectedPeriod) loadPeriodBills(selectedPeriod.id);
    } catch (err: any) {
      showToast('Submit failed: ' + err.message, 'error');
    }
  };

  const handleApproveBill = async (billId: string) => {
    try {
      await billingApi.approveBill(billId);
      showToast('Bill approved', 'success');
      if (selectedPeriod) loadPeriodBills(selectedPeriod.id);
    } catch (err: any) {
      showToast('Approve failed: ' + err.message, 'error');
    }
  };

  const handleFinalizeBill = async (billId: string) => {
    if (!window.confirm('Finalizing a bill freezes all calculations and locks financial ledgers. Continue?')) return;
    try {
      await billingApi.finalizeBill(billId);
      showToast('Bill FINALIZED! Cryptographic checksum posted.', 'success');
      if (selectedPeriod) loadPeriodBills(selectedPeriod.id);
    } catch (err: any) {
      showToast('Finalize failed: ' + err.message, 'error');
    }
  };

  const handleDownloadPdf = async (bill: MonthlyBill) => {
    try {
      await billingApi.downloadPdf(bill.id, bill.billNumber);
      showToast(`Statement PDF downloaded for ${bill.billNumber}`, 'success');
    } catch (err: any) {
      showToast('Failed to download PDF: ' + err.message, 'error');
    }
  };

  const handleOpenAdjust = (bill: MonthlyBill) => {
    setSelectedBill(bill);
    setBillAdjustForm({ adjustmentType: 'CREDIT_BONUS', amount: 0, reason: '' });
    setAdjustModalOpen(true);
  };

  const handleSaveBillAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBill) return;
    if (!billAdjustForm.reason.trim()) {
      showToast('Mandatory audit reason required', 'warning');
      return;
    }
    try {
      await billingApi.adjustBill(selectedBill.id, billAdjustForm);
      showToast('Bill adjusted and ledger entries updated', 'success');
      setAdjustModalOpen(false);
      if (selectedPeriod) loadPeriodBills(selectedPeriod.id);
    } catch (err: any) {
      showToast('Adjustment failed: ' + err.message, 'error');
    }
  };

  // Paginated Bills
  const paginatedBills = bills.slice((billPage - 1) * pageSize, billPage * pageSize);

  return (
    <div className="space-y-6 select-none">
      {/* Module Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-200/80">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>💼</span>
            <span>Accounting, Billing & Payouts</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
            Authoritative billing cycles, four-eye disbursement workflows, automatic feed & advance deductions, and PDF statements.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'billing' && isAccountantOrManager && (
            <ClayButton
              variant="brand"
              size="sm"
              onClick={() => setCreatePeriodModalOpen(true)}
              icon={<span className="text-base font-bold">+</span>}
            >
              New Billing Period
            </ClayButton>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200/80 overflow-x-auto space-x-2 pb-1 text-sm font-semibold">
        <button
          onClick={() => setActiveTab('billing')}
          className={`px-4 py-2.5 rounded-t-xl transition-all duration-150 whitespace-nowrap flex items-center gap-2 font-bold ${
            activeTab === 'billing'
              ? 'bg-white text-[#00506E] border-b-2 border-[#00506E] shadow-[0_-4px_12px_rgba(0,80,110,0.06),inset_0_2px_2px_rgba(255,255,255,0.95)]'
              : 'text-slate-600 hover:text-[#00506E] hover:bg-white/60'
          }`}
        >
          <span>🧾</span>
          <span>Billing Periods & Invoices</span>
        </button>
        <button
          onClick={() => setActiveTab('payouts')}
          className={`px-4 py-2.5 rounded-t-xl transition-all duration-150 whitespace-nowrap flex items-center gap-2 font-bold ${
            activeTab === 'payouts'
              ? 'bg-white text-[#00506E] border-b-2 border-[#00506E] shadow-[0_-4px_12px_rgba(0,80,110,0.06),inset_0_2px_2px_rgba(255,255,255,0.95)]'
              : 'text-slate-600 hover:text-[#00506E] hover:bg-white/60'
          }`}
        >
          <span>💸</span>
          <span>Payout Vouchers</span>
        </button>
        <button
          onClick={() => setActiveTab('advances')}
          className={`px-4 py-2.5 rounded-t-xl transition-all duration-150 whitespace-nowrap flex items-center gap-2 font-bold ${
            activeTab === 'advances'
              ? 'bg-white text-[#00506E] border-b-2 border-[#00506E] shadow-[0_-4px_12px_rgba(0,80,110,0.06),inset_0_2px_2px_rgba(255,255,255,0.95)]'
              : 'text-slate-600 hover:text-[#00506E] hover:bg-white/60'
          }`}
        >
          <span>🤝</span>
          <span>Customer Advances</span>
        </button>
        <button
          onClick={() => setActiveTab('batches')}
          className={`px-4 py-2.5 rounded-t-xl transition-all duration-150 whitespace-nowrap flex items-center gap-2 font-bold ${
            activeTab === 'batches'
              ? 'bg-white text-[#00506E] border-b-2 border-[#00506E] shadow-[0_-4px_12px_rgba(0,80,110,0.06),inset_0_2px_2px_rgba(255,255,255,0.95)]'
              : 'text-slate-600 hover:text-[#00506E] hover:bg-white/60'
          }`}
        >
          <span>📦</span>
          <span>Bulk Payment Batches</span>
        </button>
      </div>

      {/* Tab: Billing Periods & Statements */}
      {activeTab === 'billing' && (
        <div className="space-y-6">
          {/* Periods Selector & Summary Banner */}
          <div className="clay-surface p-5 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Selected Period:</label>
              <select
                value={selectedPeriod?.id || ''}
                onChange={(e) => {
                  const p = periods.find(item => item.id === e.target.value);
                  setSelectedPeriod(p || null);
                }}
                className="px-3.5 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E] cursor-pointer"
              >
                {periods.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.periodName} ({new Date(p.startDate).toLocaleDateString()} – {new Date(p.endDate).toLocaleDateString()}) [{p.status}]
                  </option>
                ))}
              </select>
              {selectedPeriod && <StatusBadge status={selectedPeriod.status} />}
            </div>

            {selectedPeriod && isAccountantOrManager && selectedPeriod.status !== 'FINALIZED' && (
              <ClayButton
                variant="brand"
                size="sm"
                onClick={handleGenerateBills}
                disabled={generatingBills}
                isLoading={generatingBills}
                icon={<span>⚡</span>}
              >
                Generate / Recalculate Bills
              </ClayButton>
            )}
          </div>

          {/* Period Financial Overview Card */}
          {selectedPeriod && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="clay-surface p-5 border border-sky-100/90 shadow-[8px_12px_24px_-4px_rgba(2,132,199,0.08),inset_1px_1px_2px_rgba(255,255,255,0.95)]">
                <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider">Total Milk Quantity</span>
                <div className="text-2xl font-black text-slate-900 mt-1">
                  {Number(selectedPeriod.totalQuantityLiters || 0).toFixed(2)} L
                </div>
                <span className="text-xs text-slate-400 font-mono font-bold mt-1 block">
                  {selectedPeriod.totalBills || bills.length} Bills Processed
                </span>
              </div>
              <div className="clay-surface p-5 border border-emerald-100/90 shadow-[8px_12px_24px_-4px_rgba(5,150,105,0.08),inset_1px_1px_2px_rgba(255,255,255,0.95)]">
                <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider">Gross Milk Value</span>
                <div className="text-2xl font-black text-slate-900 mt-1">
                  ₹{Number(selectedPeriod.totalGrossAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <span className="text-xs text-[#137333] font-bold mt-1 block">
                  Before Feed & Advance Deductions
                </span>
              </div>
              <div className="clay-surface p-5 border border-rose-100/90 shadow-[8px_12px_24px_-4px_rgba(225,29,72,0.08),inset_1px_1px_2px_rgba(255,255,255,0.95)]">
                <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider">Total Deductions</span>
                <div className="text-2xl font-black text-[#C5221F] mt-1">
                  ₹{Number(selectedPeriod.totalDeductions || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <span className="text-xs text-slate-500 font-semibold mt-1 block">
                  Feed POS + Advance Recovery
                </span>
              </div>
              <div className="clay-surface p-5 border border-emerald-100/90 shadow-[8px_12px_24px_-4px_rgba(5,150,105,0.08),inset_1px_1px_2px_rgba(255,255,255,0.95)]">
                <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider">Net Payable to Farmers</span>
                <div className="text-2xl font-black text-[#137333] mt-1">
                  ₹{Number(selectedPeriod.totalNetAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <span className="text-xs text-slate-500 font-semibold mt-1 block">
                  Ready for disbursement batch
                </span>
              </div>
            </div>
          )}

          {/* Bills Table */}
          <div className="clay-surface overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 bg-gradient-to-r from-slate-50/70 to-white">
              <div className="flex items-center gap-2">
                <span className="text-base">📑</span>
                <h3 className="font-black text-slate-800 text-sm tracking-tight">
                  Farmer Bill Statements ({bills.length} farmers)
                </h3>
              </div>
              <span className="text-[11px] font-bold text-slate-400">
                Authoritative double-entry settlement statements
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm text-slate-600">
                <thead className="bg-[#F8FAFC] text-[11px] font-black text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3.5">Bill #</th>
                    <th className="px-4 py-3.5">Farmer</th>
                    <th className="px-4 py-3.5 text-right">Milk Qty (L)</th>
                    <th className="px-4 py-3.5 text-right">Gross (₹)</th>
                    <th className="px-4 py-3.5 text-right">Feed Ded (₹)</th>
                    <th className="px-4 py-3.5 text-right">Adv Ded (₹)</th>
                    <th className="px-4 py-3.5 text-right">Net Payable (₹)</th>
                    <th className="px-4 py-3.5 text-center">Status</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-slate-500 font-bold">
                        Loading farmer statements...
                      </td>
                    </tr>
                  ) : paginatedBills.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <span className="text-3xl">🧾</span>
                          <p className="font-bold">No bills generated for this billing period yet.</p>
                          <p className="text-[11px] text-slate-400">Click "Generate Bills" above to calculate settlements.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedBills.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3 font-mono font-black text-xs text-slate-800 whitespace-nowrap">
                          {b.billNumber}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-black text-slate-900">{b.customerName || 'Farmer'}</div>
                          <div className="text-[11px] font-mono text-slate-400 font-bold">{b.farmerCode}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-black text-slate-900">
                          {Number(b.totalQuantityLiters).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-700">
                          ₹{Number(b.grossAmount).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-black text-[#C5221F]">
                          -₹{Number(b.feedDeductions || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-black text-[#B06000]">
                          -₹{Number(b.advanceDeductions || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right font-black font-mono text-[#137333]">
                          ₹{Number(b.netPayableAmount).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge status={b.status} />
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleDownloadPdf(b)}
                              title="Download PDF Statement"
                              className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold shadow-sm transition active:translate-y-0.5"
                            >
                              📄 PDF
                            </button>
                            {b.status === 'DRAFT' && isAccountantOrManager && (
                              <>
                                <button
                                  onClick={() => handleOpenAdjust(b)}
                                  className="px-2.5 py-1 bg-white hover:bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold shadow-sm transition active:translate-y-0.5"
                                >
                                  ✏️ Adjust
                                </button>
                                <button
                                  onClick={() => handleSubmitBill(b.id)}
                                  className="px-2.5 py-1 bg-[#00506E] hover:bg-[#003B52] text-white rounded-lg text-xs font-bold shadow-sm transition active:translate-y-0.5"
                                >
                                  Submit
                                </button>
                              </>
                            )}
                            {b.status === 'SUBMITTED' && isAccountantOrManager && (
                              <button
                                onClick={() => handleApproveBill(b.id)}
                                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-sm transition active:translate-y-0.5"
                              >
                                Approve
                              </button>
                            )}
                            {b.status === 'APPROVED' && isOwnerOrAdmin && (
                              <button
                                onClick={() => handleFinalizeBill(b.id)}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition active:translate-y-0.5"
                              >
                                🔒 Finalize
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

            <Pagination
              currentPage={billPage}
              totalItems={bills.length}
              pageSize={pageSize}
              onPageChange={setBillPage}
            />
          </div>
        </div>
      )}

      {/* Tab: Payout Vouchers */}
      {activeTab === 'payouts' && (
        <div className="clay-surface p-6 sm:p-8 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-black text-slate-900 tracking-tight">Direct Farmer Payouts</h2>
              <p className="text-xs text-slate-500 font-medium">Record individual cash, UPI, or bank transfer payments to farmers.</p>
            </div>
            {isAccountantOrManager && (
              <ClayButton
                variant="brand"
                size="sm"
                onClick={() => showToast('Select a farmer under Customer Directory to disburse individual payouts, or process via Bulk Batches.', 'info')}
                icon={<span className="text-base font-bold">+</span>}
              >
                Record Direct Payout
              </ClayButton>
            )}
          </div>
          <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200/80 shadow-[inset_1px_1px_2px_rgba(15,23,42,0.03)] text-xs text-slate-600 font-medium leading-relaxed">
            Direct farmer disbursements are automatically recorded in the double-entry subledger against Account 2100 (Customer Payables). Select a farmer under Customer Directory or initiate via Bulk Batches.
          </div>
        </div>
      )}

      {/* Tab: Customer Advances */}
      {activeTab === 'advances' && (
        <div className="clay-surface p-6 sm:p-8 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-black text-slate-900 tracking-tight">Farmer Advances & Loan Recoveries</h2>
              <p className="text-xs text-slate-500 font-medium">
                Track disbursed capital advances with automatic percentage recovery across subsequent milk billing cycles.
              </p>
            </div>
            {isAccountantOrManager && (
              <ClayButton
                variant="brand"
                size="sm"
                onClick={() => showToast('Select a farmer under Customer Directory to disburse capital advances against their subledger.', 'info')}
                icon={<span className="text-base font-bold">+</span>}
              >
                Disburse Advance
              </ClayButton>
            )}
          </div>
          <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200/80 shadow-[inset_1px_1px_2px_rgba(15,23,42,0.03)] text-xs text-slate-600 font-medium leading-relaxed">
            Approved advances deduct automatically up to the configured recovery percentage (e.g. 20%) during bill generation until the balance returns to zero.
          </div>
        </div>
      )}

      {/* Tab: Bulk Payment Batches */}
      {activeTab === 'batches' && (
        <div className="clay-surface p-6 sm:p-8 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-black text-slate-900 tracking-tight">Bulk Bank Payment Batches</h2>
              <p className="text-xs text-slate-500 font-medium">Export NACH / NEFT batch files and reconcile settlement statuses.</p>
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200/80 shadow-[inset_1px_1px_2px_rgba(15,23,42,0.03)] text-xs text-slate-600 font-medium leading-relaxed">
            Batches group all approved farmer bills for a period into a single settlement file for bank transmission.
          </div>
        </div>
      )}

      {/* Create Period Modal */}
      <Modal
        isOpen={createPeriodModalOpen}
        onClose={() => setCreatePeriodModalOpen(false)}
        title="Initialize New Billing Cycle"
        maxWidth="md"
      >
        <form onSubmit={handleCreatePeriod} className="space-y-4 text-xs">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1">Cycle Name</label>
            <input
              type="text"
              value={periodForm.periodName}
              onChange={(e) => setPeriodForm({ ...periodForm, periodName: e.target.value })}
              className="w-full px-3 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]"
              required
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1">Period Type</label>
            <select
              value={periodForm.periodType}
              onChange={(e) => setPeriodForm({ ...periodForm, periodType: e.target.value })}
              className="w-full px-3 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E] cursor-pointer"
            >
              <option value="TEN_DAY">10-Day Cycle (e.g. 1st–10th, 11th–20th, 21st–End)</option>
              <option value="MONTHLY">Full Calendar Month</option>
              <option value="CUSTOM">Custom Date Window</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1">Start Date</label>
              <input
                type="date"
                value={periodForm.startDate}
                onChange={(e) => setPeriodForm({ ...periodForm, startDate: e.target.value })}
                className="w-full px-3 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1">End Date</label>
              <input
                type="date"
                value={periodForm.endDate}
                onChange={(e) => setPeriodForm({ ...periodForm, endDate: e.target.value })}
                className="w-full px-3 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]"
                required
              />
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
            <ClayButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setCreatePeriodModalOpen(false)}
            >
              Cancel
            </ClayButton>
            <ClayButton
              type="submit"
              variant="brand"
              size="sm"
            >
              Initialize Period
            </ClayButton>
          </div>
        </form>
      </Modal>

      {/* Bill Adjustment Modal */}
      <Modal
        isOpen={adjustModalOpen}
        onClose={() => setAdjustModalOpen(false)}
        title={`Adjust Bill — ${selectedBill?.billNumber}`}
        maxWidth="md"
      >
        <form onSubmit={handleSaveBillAdjustment} className="space-y-4 text-xs">
          <div className="bg-[#FFFDF5] border border-amber-200/90 rounded-2xl p-4 text-xs text-amber-900 shadow-sm leading-normal">
            <strong className="font-black">Audited Ledger Mutation:</strong> Adjusting an invoice creates an auditable debit/credit voucher before finalization.
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1">Adjustment Type</label>
            <select
              value={billAdjustForm.adjustmentType}
              onChange={(e) => setBillAdjustForm({ ...billAdjustForm, adjustmentType: e.target.value })}
              className="w-full px-3 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E] cursor-pointer"
            >
              <option value="CREDIT_BONUS">Quality Bonus / Incentive (+)</option>
              <option value="DEBIT_FEE">Special Administrative Charge (-)</option>
              <option value="ROUNDING_CORRECTION">Rounding Correction</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1">Amount (₹)</label>
            <input
              type="number"
              step="0.01"
              value={billAdjustForm.amount}
              onChange={(e) => setBillAdjustForm({ ...billAdjustForm, amount: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]"
              required
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1">Audit Reason</label>
            <textarea
              rows={3}
              value={billAdjustForm.reason}
              onChange={(e) => setBillAdjustForm({ ...billAdjustForm, reason: e.target.value })}
              placeholder="e.g. Quality premium bonus authorized by dairy management."
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
            >
              Apply Adjustment
            </ClayButton>
          </div>
        </form>
      </Modal>
    </div>
  );
};
