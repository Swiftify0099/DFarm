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

type AccountingTab = 'billing' | 'payouts' | 'advances' | 'batches' | 'reconciliation';

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
    <div className="space-y-6">
      {/* Module Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">💼 Accounting, Billing & Payouts</h1>
          <p className="text-sm text-gray-500 mt-1">
            Authoritative billing cycles, four-eye disbursement workflows, automatic feed & advance deductions, and PDF statements.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'billing' && isAccountantOrManager && (
            <button
              onClick={() => setCreatePeriodModalOpen(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium shadow-sm transition"
            >
              ➕ New Billing Period
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-gray-200 overflow-x-auto space-x-2 pb-1 text-sm font-semibold">
        <button
          onClick={() => setActiveTab('billing')}
          className={`px-4 py-2 rounded-t-lg transition whitespace-nowrap ${
            activeTab === 'billing'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'
          }`}
        >
          🧾 Billing Periods & Invoices
        </button>
        <button
          onClick={() => setActiveTab('payouts')}
          className={`px-4 py-2 rounded-t-lg transition whitespace-nowrap ${
            activeTab === 'payouts'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'
          }`}
        >
          💸 Payout Vouchers
        </button>
        <button
          onClick={() => setActiveTab('advances')}
          className={`px-4 py-2 rounded-t-lg transition whitespace-nowrap ${
            activeTab === 'advances'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'
          }`}
        >
          🤝 Customer Advances
        </button>
        <button
          onClick={() => setActiveTab('batches')}
          className={`px-4 py-2 rounded-t-lg transition whitespace-nowrap ${
            activeTab === 'batches'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'
          }`}
        >
          📦 Bulk Payment Batches
        </button>
      </div>

      {/* Tab: Billing Periods & Statements */}
      {activeTab === 'billing' && (
        <div className="space-y-6">
          {/* Periods Selector & Summary Banner */}
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <label className="text-xs font-semibold text-gray-500 uppercase">Selected Period:</label>
              <select
                value={selectedPeriod?.id || ''}
                onChange={(e) => {
                  const p = periods.find(item => item.id === e.target.value);
                  setSelectedPeriod(p || null);
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white font-medium text-gray-800"
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
              <button
                onClick={handleGenerateBills}
                disabled={generatingBills}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium shadow-sm transition disabled:opacity-50"
              >
                {generatingBills ? '⚙️ Recalculating...' : '⚡ Generate / Recalculate Bills'}
              </button>
            )}
          </div>

          {/* Period Financial Overview Card */}
          {selectedPeriod && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <span className="text-xs text-gray-500 font-medium">Total Milk Quantity</span>
                <div className="text-2xl font-bold text-gray-900 mt-1">
                  {Number(selectedPeriod.totalQuantityLiters || 0).toFixed(2)} L
                </div>
                <span className="text-xs text-gray-500 font-mono mt-1 block">
                  {selectedPeriod.totalBills || bills.length} Bills Processed
                </span>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <span className="text-xs text-gray-500 font-medium">Gross Milk Value</span>
                <div className="text-2xl font-bold text-gray-900 mt-1">
                  ₹{Number(selectedPeriod.totalGrossAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <span className="text-xs text-emerald-600 font-medium mt-1 block">
                  Before Feed & Advance Deductions
                </span>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <span className="text-xs text-gray-500 font-medium">Total Deductions</span>
                <div className="text-2xl font-bold text-rose-600 mt-1">
                  ₹{Number(selectedPeriod.totalDeductions || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <span className="text-xs text-gray-500 font-medium mt-1 block">
                  Feed POS + Advance Recovery
                </span>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <span className="text-xs text-gray-500 font-medium">Net Payable to Farmers</span>
                <div className="text-2xl font-bold text-emerald-700 mt-1">
                  ₹{Number(selectedPeriod.totalNetAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <span className="text-xs text-gray-500 font-medium mt-1 block">
                  Ready for disbursement batch
                </span>
              </div>
            </div>
          )}

          {/* Bills Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
              <h3 className="font-semibold text-gray-800 text-sm">
                Farmer Bill Statements ({bills.length} farmers)
              </h3>
              <span className="text-xs text-gray-500">
                Authoritative double-entry settlement statements
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-600">
                <thead className="bg-gray-100 text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Bill #</th>
                    <th className="px-4 py-3">Farmer</th>
                    <th className="px-4 py-3 text-right">Milk Qty (L)</th>
                    <th className="px-4 py-3 text-right">Gross (₹)</th>
                    <th className="px-4 py-3 text-right">Feed Ded (₹)</th>
                    <th className="px-4 py-3 text-right">Adv Ded (₹)</th>
                    <th className="px-4 py-3 text-right">Net Payable (₹)</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                        Loading farmer statements...
                      </td>
                    </tr>
                  ) : paginatedBills.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                        No bills generated for this billing period yet. Click "Generate Bills" to calculate.
                      </td>
                    </tr>
                  ) : (
                    paginatedBills.map((b) => (
                      <tr key={b.id} className="hover:bg-gray-50 transition">
                        <td className="px-4 py-3 font-mono font-medium text-xs text-gray-800 whitespace-nowrap">
                          {b.billNumber}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-medium text-gray-900">{b.customerName || 'Farmer'}</div>
                          <div className="text-xs font-mono text-gray-500">{b.farmerCode}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                          {Number(b.totalQuantityLiters).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-700">
                          ₹{Number(b.grossAmount).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-rose-600">
                          -₹{Number(b.feedDeductions || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-amber-600">
                          -₹{Number(b.advanceDeductions || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold font-mono text-emerald-700">
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
                              className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs font-medium transition"
                            >
                              📄 PDF
                            </button>
                            {b.status === 'DRAFT' && isAccountantOrManager && (
                              <>
                                <button
                                  onClick={() => handleOpenAdjust(b)}
                                  className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded text-xs font-medium transition"
                                >
                                  ✏️ Adjust
                                </button>
                                <button
                                  onClick={() => handleSubmitBill(b.id)}
                                  className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition"
                                >
                                  Submit
                                </button>
                              </>
                            )}
                            {b.status === 'SUBMITTED' && isAccountantOrManager && (
                              <button
                                onClick={() => handleApproveBill(b.id)}
                                className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-medium transition"
                              >
                                Approve
                              </button>
                            )}
                            {b.status === 'APPROVED' && isOwnerOrAdmin && (
                              <button
                                onClick={() => handleFinalizeBill(b.id)}
                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium shadow-sm transition"
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

            <div className="p-3 border-t border-gray-200 bg-gray-50/50">
              <Pagination
                currentPage={billPage}
                totalItems={bills.length}
                pageSize={pageSize}
                onPageChange={setBillPage}
              />
            </div>
          </div>
        </div>
      )}

      {/* Tab: Payout Vouchers */}
      {activeTab === 'payouts' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
          <div className="flex justify-between items-center pb-3 border-b border-gray-200">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Direct Farmer Payouts</h2>
              <p className="text-xs text-gray-500">Record individual cash, UPI, or bank transfer payments to farmers.</p>
            </div>
            {isAccountantOrManager && (
              <button
                onClick={() => showToast('Select a farmer under Customer Directory to disburse individual payouts, or process via Bulk Batches.', 'info')}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition"
              >
                ➕ Record Direct Payout
              </button>
            )}
          </div>
          <p className="text-sm text-gray-500 italic">
            Direct farmer disbursements are automatically recorded in the double-entry subledger against Account 2100 (Customer Payables). Select a farmer under Customer Directory or initiate via Bulk Batches.
          </p>
        </div>
      )}

      {/* Tab: Customer Advances */}
      {activeTab === 'advances' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
          <div className="flex justify-between items-center pb-3 border-b border-gray-200">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Farmer Advances & Loan Recoveries</h2>
              <p className="text-xs text-gray-500">
                Track disbursed capital advances with automatic percentage recovery across subsequent milk billing cycles.
              </p>
            </div>
            {isAccountantOrManager && (
              <button
                onClick={() => showToast('Select a farmer under Customer Directory to disburse capital advances against their subledger.', 'info')}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition"
              >
                ➕ Disburse Advance
              </button>
            )}
          </div>
          <p className="text-sm text-gray-500 italic">
            Approved advances deduct automatically up to the configured recovery percentage (e.g. 20%) during bill generation until the balance returns to zero.
          </p>
        </div>
      )}

      {/* Tab: Bulk Payment Batches */}
      {activeTab === 'batches' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
          <div className="flex justify-between items-center pb-3 border-b border-gray-200">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Bulk Bank Payment Batches</h2>
              <p className="text-xs text-gray-500">Export NACH / NEFT batch files and reconcile settlement statuses.</p>
            </div>
          </div>
          <p className="text-sm text-gray-500 italic">
            Batches group all approved farmer bills for a period into a single settlement file for bank transmission.
          </p>
        </div>
      )}

      {/* Create Period Modal */}
      <Modal
        isOpen={createPeriodModalOpen}
        onClose={() => setCreatePeriodModalOpen(false)}
        title="Initialize New Billing Cycle"
        maxWidth="md"
      >
        <form onSubmit={handleCreatePeriod} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Cycle Name</label>
            <input
              type="text"
              value={periodForm.periodName}
              onChange={(e) => setPeriodForm({ ...periodForm, periodName: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Period Type</label>
            <select
              value={periodForm.periodType}
              onChange={(e) => setPeriodForm({ ...periodForm, periodType: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="TEN_DAY">10-Day Cycle (e.g. 1st–10th, 11th–20th, 21st–End)</option>
              <option value="MONTHLY">Full Calendar Month</option>
              <option value="CUSTOM">Custom Date Window</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={periodForm.startDate}
                onChange={(e) => setPeriodForm({ ...periodForm, startDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={periodForm.endDate}
                onChange={(e) => setPeriodForm({ ...periodForm, endDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
            <button
              type="button"
              onClick={() => setCreatePeriodModalOpen(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium shadow-sm transition"
            >
              Initialize Period
            </button>
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
        <form onSubmit={handleSaveBillAdjustment} className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            <strong>Audited Ledger Mutation:</strong> Adjusting an invoice creates an auditable debit/credit voucher before finalization.
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Adjustment Type</label>
            <select
              value={billAdjustForm.adjustmentType}
              onChange={(e) => setBillAdjustForm({ ...billAdjustForm, adjustmentType: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="CREDIT_BONUS">Quality Bonus / Incentive (+)</option>
              <option value="DEBIT_FEE">Special Administrative Charge (-)</option>
              <option value="ROUNDING_CORRECTION">Rounding Correction</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Amount (₹)</label>
            <input
              type="number"
              step="0.01"
              value={billAdjustForm.amount}
              onChange={(e) => setBillAdjustForm({ ...billAdjustForm, amount: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Audit Reason</label>
            <textarea
              rows={3}
              value={billAdjustForm.reason}
              onChange={(e) => setBillAdjustForm({ ...billAdjustForm, reason: e.target.value })}
              placeholder="e.g. Quality premium bonus authorized by dairy management."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
            <button
              type="button"
              onClick={() => setAdjustModalOpen(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium shadow-sm transition"
            >
              Apply Adjustment
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
