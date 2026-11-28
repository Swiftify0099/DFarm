import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import { useAuth } from '@/context/AuthContext'
import type {
  PaymentRecord,
  PaymentOverviewMetrics,
  SettlementCalculationPreview,
  PaymentBatchRecord,
} from '@/types'
import {
  ClayCard,
  ClayButton,
  ClayBadge,
  ClayModal,
  ClayAlert,
  ClayInput,
  ClaySelect,
  ClayTable,
  ClayTabs,
  ClayStatCard,
  Column,
} from '@/components/ui'
import {
  Receipt,
  PlusCircle,
  Shield,
  Printer,
  Calculator,
  Building2,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  Upload,
  RefreshCw,
  Clock,
  ArrowRight,
  Download,
} from 'lucide-react'

export const PaymentRegister: React.FC = () => {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  // Active Tab
  const [activeTab, setActiveTab] = useState<'overview' | 'create-batch' | 'review-approve' | 'bank-submission' | 'reconciliation'>('overview')

  // Modals & Selections
  const [showRecordModal, setShowRecordModal] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<PaymentRecord | null>(null)
  const [showReceiptModal, setShowReceiptModal] = useState(false)
  const [selectedBatch, setSelectedBatch] = useState<PaymentBatchRecord | null>(null)
  const [showBatchDetailModal, setShowBatchDetailModal] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'danger' | 'warning' | 'info'; message: string } | null>(null)

  // Single Payment Form State
  const [payCustId, setPayCustId] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CHEQUE'>('BANK_TRANSFER')
  const [payRef, setPayRef] = useState('')
  const [payNotes, setPayNotes] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // Create Batch State
  const now = new Date()
  const defaultPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const defaultPeriodEnd = new Date(now.getFullYear(), now.getMonth(), 15).toISOString().slice(0, 10)
  const [batchCenterId, setBatchCenterId] = useState<string>('')
  const [periodStart, setPeriodStart] = useState<string>(defaultPeriodStart)
  const [periodEnd, setPeriodEnd] = useState<string>(defaultPeriodEnd)
  const [excludeUnverified, setExcludeUnverified] = useState(false)
  const [calculationPreview, setCalculationPreview] = useState<SettlementCalculationPreview | null>(null)
  const [isCalculating, setIsCalculating] = useState(false)

  // Reconciliation Form State
  const [reconBatchId, setReconBatchId] = useState('')
  const [reconText, setReconText] = useState('')

  // 1. Data Queries
  const { data: overviewMetrics, isLoading: isOverviewLoading } = useQuery<PaymentOverviewMetrics>({
    queryKey: ['paymentOverview', batchCenterId],
    queryFn: () => api.payments.getOverview(batchCenterId || undefined),
  })

  const { data: payments = [], isLoading: isPaymentsLoading } = useQuery({
    queryKey: ['paymentRecords'],
    queryFn: () => api.payments.getAll(),
  })

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.customers.getAll(),
  })

  const { data: centers = [] } = useQuery({
    queryKey: ['dairyCenters'],
    queryFn: () => api.centers.getAll(),
  })

  // 2. Mutations
  const recordPaymentMutation = useMutation({
    mutationFn: (params: any) => api.payments.recordPayment(params, user?.fullName || 'Dairy Admin'),
    onSuccess: (newPay) => {
      queryClient.invalidateQueries({ queryKey: ['paymentRecords'] })
      queryClient.invalidateQueries({ queryKey: ['paymentOverview'] })
      setShowRecordModal(false)
      setPayAmount('')
      setPayRef('')
      setPayNotes('')
      setNotice({
        type: 'success',
        message: `Disbursement receipt ${newPay.receiptNumber} recorded for ${newPay.customerName}.`,
      })
    },
    onError: (err: any) => setErrorMsg(err.message || 'Failed to record payment'),
  })

  const createBatchMutation = useMutation({
    mutationFn: (params: any) => api.payments.createBatch(params),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['paymentOverview'] })
      setNotice({
        type: 'success',
        message: `Settlement Batch ${res.batchNumber} created with ${res.totalBeneficiaries} farmers (Total: ₹${res.totalAmount.toFixed(2)}). Ready for review!`,
      })
      setActiveTab('review-approve')
      setCalculationPreview(null)
    },
    onError: (err: any) => {
      setNotice({ type: 'danger', message: err.message || 'Failed to create payment batch' })
    },
  })

  const approveBatchMutation = useMutation({
    mutationFn: (batchId: string) => api.payments.approveBatch(batchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paymentOverview'] })
      setNotice({ type: 'success', message: 'Payment batch successfully approved by Checker. Ready for Union Bank transmission.' })
      if (selectedBatch) {
        setSelectedBatch({ ...selectedBatch, status: 'APPROVED' })
      }
    },
    onError: (err: any) => {
      setNotice({ type: 'danger', message: err.message || 'Batch approval failed' })
    },
  })

  const submitUnionBankMutation = useMutation({
    mutationFn: ({ batchId, format }: { batchId: string; format: string }) =>
      api.payments.submitToUnionBank(batchId, 'BULK_FILE_EXPORT', format),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['paymentOverview'] })
      setNotice({
        type: 'success',
        message: `Batch submitted to Union Bank of India. Submission Reference: ${res.submissionReference}. File ${res.fileName} generated.`,
      })
      if (selectedBatch) {
        setSelectedBatch({ ...selectedBatch, status: 'SUBMITTED_TO_BANK' })
      }
    },
    onError: (err: any) => {
      setNotice({ type: 'danger', message: err.message || 'Union Bank submission failed' })
    },
  })

  const reconcileMutation = useMutation({
    mutationFn: ({ batchId, payload }: { batchId: string; payload: any }) =>
      api.payments.reconcileWithUnionBank(batchId, payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['paymentOverview'] })
      queryClient.invalidateQueries({ queryKey: ['paymentRecords'] })
      setNotice({
        type: 'success',
        message: `Reconciliation completed: ${res.successfulCount} settled, ${res.failedCount} failed. Batch status: ${res.batchStatus}.`,
      })
      setReconText('')
    },
    onError: (err: any) => {
      setNotice({ type: 'danger', message: err.message || 'Reconciliation failed' })
    },
  })

  // Calculation Preview Handler
  const handleRunCalculation = async () => {
    setIsCalculating(true)
    setNotice(null)
    try {
      const data = await api.payments.getSettlementPreview(
        periodStart,
        periodEnd,
        batchCenterId || undefined,
        excludeUnverified
      )
      setCalculationPreview(data)
      setNotice({
        type: 'info',
        message: `Calculation completed: ${data.totalEligibleFarmers} eligible farmers identified with total net payable ₹${data.totalNetPayable.toFixed(2)}. ${data.warningsCount} warnings flagged.`,
      })
    } catch (err: any) {
      setNotice({ type: 'danger', message: err.message || 'Failed to calculate payables preview' })
    } finally {
      setIsCalculating(false)
    }
  }

  // Columns for Payment Register
  const paymentColumns: Column<PaymentRecord>[] = [
    {
      key: 'receiptNumber',
      header: 'Receipt # / Date',
      render: (r) => (
        <div>
          <span className="font-mono font-bold text-xs text-[#211B18]">{r.receiptNumber}</span>
          <p className="text-[10px] text-[#817A75] mt-0.5">{r.paymentDate}</p>
        </div>
      ),
    },
    {
      key: 'customerName',
      header: 'Farmer Account',
      render: (r) => (
        <div>
          <span className="font-extrabold text-[#FF6A00] text-xs bg-[#FFE9DC] px-2 py-0.5 rounded">
            {r.customerCode}
          </span>
          <span className="font-bold text-[#211B18] text-sm ml-2">{r.customerName}</span>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount Paid',
      render: (r) => (
        <span className="font-black text-sm text-emerald-700">
          ₹{r.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      key: 'paymentMethod',
      header: 'Method / Bank UTR',
      render: (r) => (
        <div className="text-xs">
          <p className="font-semibold text-[#211B18]">{r.paymentMethod}</p>
          <p className="text-[10px] text-[#817A75] font-mono">{r.transactionReference}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <ClayBadge variant={r.status === 'RECONCILED' || r.status === 'SUCCESS' ? 'approved' : 'neutral'}>
          {r.status}
        </ClayBadge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <ClayButton
          variant="ghost"
          size="sm"
          onClick={() => {
            setSelectedPayment(r)
            setShowReceiptModal(true)
          }}
          leftIcon={<Receipt size={12} />}
        >
          Receipt
        </ClayButton>
      ),
    },
  ]

  // Tabs Definition
  const tabs = [
    { id: 'overview', label: '1. Payment Overview', icon: <Receipt size={14} /> },
    { id: 'create-batch', label: '2. Create Settlement Batch', icon: <Calculator size={14} /> },
    { id: 'review-approve', label: '3. Batch Review & Approval', icon: <CheckCircle size={14} /> },
    { id: 'bank-submission', label: '4. Union Bank Payout', icon: <Building2 size={14} /> },
    { id: 'reconciliation', label: '5. Reconciliation & UTR', icon: <RefreshCw size={14} /> },
  ]

  return (
    <div className="space-y-6 text-left">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Building2 size={28} className="text-[#FF6A00]" />
            <h1 className="text-2xl font-black text-[#211B18] tracking-tight">
              Farmer Milk Payment, Settlement & Union Bank Payout
            </h1>
          </div>
          <p className="text-xs text-[#817A75] mt-1 font-medium">
            PostgreSQL-backed milk payment settlements, Union Bank of India corporate bulk payouts, and Maker-Checker reconciliation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ClayButton
            variant="secondary"
            size="sm"
            onClick={() => setActiveTab('create-batch')}
            leftIcon={<Calculator size={15} />}
          >
            New Settlement Batch
          </ClayButton>
          <ClayButton
            variant="primary"
            size="sm"
            onClick={() => {
              setPayCustId(customers[0]?.id || '')
              setShowRecordModal(true)
            }}
            leftIcon={<PlusCircle size={15} />}
          >
            Record Single Payout
          </ClayButton>
        </div>
      </div>

      {/* Tabs Navigation */}
      <ClayTabs tabs={tabs} activeTab={activeTab} onChange={(id) => setActiveTab(id as any)} />

      {/* Notice Banner */}
      {notice && (
        <ClayAlert
          type={notice.type}
          message={notice.message}
          action={
            <button onClick={() => setNotice(null)} className="text-xs underline font-bold cursor-pointer">
              Dismiss
            </button>
          }
        />
      )}

      {/* ========================================================================= */}
      {/* TAB 1: FARMER PAYMENT OVERVIEW (Section 10.A) */}
      {/* ========================================================================= */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Statutory 5 Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <ClayStatCard
              title="Total Payable Amount"
              value={`₹${(overviewMetrics?.totalPayableAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
              icon={<Calculator size={20} className="text-[#FF6A00]" />}
              subtitle="Authoritative Ledger Dues"
            />
            <ClayStatCard
              title="Total Paid Amount"
              value={`₹${(overviewMetrics?.totalPaidAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
              icon={<CheckCircle size={20} className="text-emerald-600" />}
              subtitle={`${overviewMetrics?.paidCount || 0} Cleared Payments`}
            />
            <ClayStatCard
              title="Pending Disbursements"
              value={`₹${(overviewMetrics?.pendingAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
              icon={<Clock size={20} className="text-amber-500" />}
              subtitle={`${overviewMetrics?.pendingCount || 0} In-Flight / Batches`}
            />
            <ClayStatCard
              title="Failed Payments"
              value={`₹${(overviewMetrics?.failedAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
              icon={<AlertTriangle size={20} className="text-red-500" />}
              subtitle={`${overviewMetrics?.failedCount || 0} Rejected / Invalid Bank`}
            />
            <ClayStatCard
              title="Unreconciled Payments"
              value={`₹${(overviewMetrics?.unreconciledAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
              icon={<RefreshCw size={20} className="text-blue-500" />}
              subtitle={`${overviewMetrics?.unreconciledCount || 0} Pending Bank Statement`}
            />
          </div>

          {/* Bank Partner Badge */}
          <ClayCard className="p-4 bg-gradient-to-r from-blue-50/70 via-white to-amber-50/60 border border-blue-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-700 text-white flex items-center justify-center font-black text-sm shadow-xs">
                  UBI
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-[#211B18]">
                    Bank Partner: Union Bank of India (Corporate Cash Management)
                  </h3>
                  <p className="text-xs text-[#817A75]">
                    Farmer milk payments exclusively. Supported channels: Corporate Bulk NEFT/RTGS CSV & CAPS Services.
                  </p>
                </div>
              </div>
              <ClayBadge variant="approved">UBI CAPS Ready</ClayBadge>
            </div>
          </ClayCard>

          {/* Recent Disbursements Table */}
          <ClayCard className="!p-0 overflow-hidden">
            <div className="p-4 border-b border-[#F1E7E0] flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#211B18]">Posted Farmer Disbursement Vouchers</h2>
              <span className="text-xs text-[#817A75]">{payments.length} Records</span>
            </div>
            <ClayTable
              columns={paymentColumns}
              data={payments}
              keyExtractor={(p) => p.id}
              isLoading={isPaymentsLoading}
              emptyMessage="No payment records registered"
              emptySubtext="Disbursement vouchers will appear here once processed."
            />
          </ClayCard>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: CREATE SETTLEMENT BATCH (Section 10.B) */}
      {/* ========================================================================= */}
      {activeTab === 'create-batch' && (
        <div className="space-y-6">
          <ClayCard className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#F1E7E0]">
              <div className="flex items-center gap-2">
                <Calculator size={18} className="text-[#FF6A00]" />
                <h2 className="font-bold text-sm text-[#211B18]">Settlement Period & Filter Configuration</h2>
              </div>
              <span className="text-xs text-[#817A75]">Financial Engine: PostgreSQL ACID Calculations</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <ClayInput
                label="Settlement Period Start"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                required
              />
              <ClayInput
                label="Settlement Period End"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                required
              />
              <ClaySelect
                label="Chilling Center Filter"
                options={[
                  { label: 'All Dairy Centers (Union Wide)', value: '' },
                  ...centers.map((c: any) => ({ label: `${c.code} — ${c.name}`, value: c.id })),
                ]}
                value={batchCenterId}
                onChange={(e) => setBatchCenterId(e.target.value as string)}
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center gap-2 text-xs font-medium text-[#211B18] cursor-pointer">
                <input
                  type="checkbox"
                  checked={excludeUnverified}
                  onChange={(e) => setExcludeUnverified(e.target.checked)}
                  className="rounded border-[#D0C5BD] text-[#FF6A00] focus:ring-[#FF6A00]"
                />
                Exclude farmers with incomplete or unverified bank account details
              </label>

              <div className="flex items-center gap-2">
                <ClayButton
                  variant="primary"
                  size="md"
                  onClick={handleRunCalculation}
                  isLoading={isCalculating}
                  leftIcon={<Calculator size={16} />}
                >
                  Calculate Payables Preview
                </ClayButton>
              </div>
            </div>
          </ClayCard>

          {/* Calculation Preview Summary */}
          {calculationPreview && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-white rounded-xl border border-[#F1E7E0] shadow-xs">
                  <span className="text-xs text-[#817A75]">Eligible Farmers</span>
                  <p className="text-xl font-black text-[#211B18] mt-1">{calculationPreview.totalEligibleFarmers}</p>
                  <p className="text-[10px] text-[#817A75]">Out of {calculationPreview.totalFarmers} active</p>
                </div>
                <div className="p-3 bg-white rounded-xl border border-[#F1E7E0] shadow-xs">
                  <span className="text-xs text-[#817A75]">Gross Milk Deliveries</span>
                  <p className="text-xl font-black text-[#211B18] mt-1">
                    ₹{calculationPreview.totalGrossPayable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-[10px] text-[#817A75]">{calculationPreview.totalMilkQuantityLiters.toFixed(1)} Liters</p>
                </div>
                <div className="p-3 bg-white rounded-xl border border-[#F1E7E0] shadow-xs">
                  <span className="text-xs text-[#817A75]">Total Deductions</span>
                  <p className="text-xl font-black text-red-600 mt-1">
                    -₹{calculationPreview.totalDeductions.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-[10px] text-[#817A75]">Feed, Advances & Fees</p>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 shadow-xs">
                  <span className="text-xs text-emerald-900 font-bold">Total Net Payable</span>
                  <p className="text-2xl font-black text-emerald-800 mt-1">
                    ₹{calculationPreview.totalNetPayable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-[10px] text-emerald-700">Snapshot: {calculationPreview.calculationSnapshotHash.slice(0, 12)}...</p>
                </div>
              </div>

              {/* Validation Warnings Table */}
              {calculationPreview.farmersWithInvalidBankCount > 0 && (
                <ClayCard className="border-amber-300 bg-amber-50/50 p-4">
                  <div className="flex items-center gap-2 mb-2 text-amber-900 font-bold text-xs">
                    <AlertTriangle size={16} className="text-amber-600" />
                    <span>Bank Account Validation Warnings ({calculationPreview.farmersWithInvalidBankCount} Farmers Flagged)</span>
                  </div>
                  <p className="text-xs text-amber-800 mb-3">
                    Farmers with invalid IFSC codes or missing account numbers cannot receive direct bank disbursements.
                  </p>
                  <div className="max-h-40 overflow-y-auto space-y-2 text-xs">
                    {calculationPreview.farmers
                      .filter((f) => !f.isBankValid)
                      .map((f) => (
                        <div key={f.customerId} className="flex items-center justify-between p-2 bg-white rounded border border-amber-200">
                          <div>
                            <span className="font-bold text-[#211B18]">{f.farmerCode} — {f.fullName}</span>
                            <span className="text-[10px] text-red-600 ml-2">({f.bankValidationErrors.join(', ')})</span>
                          </div>
                          <span className="font-mono text-[10px] text-[#817A75]">{f.bankIfsc || 'NO IFSC'}</span>
                        </div>
                      ))}
                  </div>
                </ClayCard>
              )}

              {/* Farmer Items Preview Table */}
              <ClayCard className="!p-0 overflow-hidden">
                <div className="p-4 border-b border-[#F1E7E0] flex items-center justify-between">
                  <h3 className="font-bold text-xs text-[#211B18]">Farmer-Wise Payable Calculations</h3>
                  <ClayButton
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      const idemp = `BATCH-UBI-${Date.now()}`
                      createBatchMutation.mutate({
                        billingPeriodStart: periodStart,
                        billingPeriodEnd: periodEnd,
                        centerId: batchCenterId || undefined,
                        paymentMethod: 'BANK_TRANSFER',
                        idempotencyKey: idemp,
                        excludeUnverifiedBankDetails: excludeUnverified,
                      })
                    }}
                    isLoading={createBatchMutation.isPending}
                    leftIcon={<PlusCircle size={15} />}
                  >
                    Commit & Create Settlement Batch
                  </ClayButton>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[#FFF5EE] text-[#817A75] font-bold border-b border-[#F1E7E0] sticky top-0">
                      <tr>
                        <th className="p-3">Farmer</th>
                        <th className="p-3">Bank Account Mask</th>
                        <th className="p-3">IFSC</th>
                        <th className="p-3 text-right">Gross Milk (₹)</th>
                        <th className="p-3 text-right">Deductions (₹)</th>
                        <th className="p-3 text-right">Net Payable (₹)</th>
                        <th className="p-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1E7E0]">
                      {calculationPreview.farmers.map((f) => (
                        <tr key={f.customerId} className="hover:bg-amber-50/20">
                          <td className="p-3">
                            <span className="font-bold text-[#FF6A00]">{f.farmerCode}</span>
                            <span className="ml-2 font-medium text-[#211B18]">{f.fullName}</span>
                          </td>
                          <td className="p-3 font-mono">{f.bankAccountNumberMask || '—'}</td>
                          <td className="p-3 font-mono">{f.bankIfsc || '—'}</td>
                          <td className="p-3 text-right font-medium">₹{f.grossMilkAmount.toFixed(2)}</td>
                          <td className="p-3 text-right text-red-600 font-medium">-₹{f.deductionsAmount.toFixed(2)}</td>
                          <td className="p-3 text-right font-bold text-emerald-800">₹{f.netPayableAmount.toFixed(2)}</td>
                          <td className="p-3 text-center">
                            <ClayBadge variant={f.isBankValid ? 'approved' : 'rejected'}>
                              {f.isBankValid ? 'Valid Bank' : 'Invalid Details'}
                            </ClayBadge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ClayCard>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: BATCH REVIEW & APPROVAL (Section 10.C — Maker-Checker) */}
      {/* ========================================================================= */}
      {activeTab === 'review-approve' && (
        <div className="space-y-6">
          <ClayCard className="p-4 bg-white border border-[#F1E7E0] space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#F1E7E0]">
              <div className="flex items-center gap-2">
                <Shield size={18} className="text-[#FF6A00]" />
                <h2 className="font-bold text-sm text-[#211B18]">Maker-Checker Segregation of Duties Gate</h2>
              </div>
              <span className="text-xs text-[#817A75]">Rule: Batch Creator Cannot Self-Approve</span>
            </div>

            <p className="text-xs text-[#817A75] leading-relaxed">
              Every settlement batch undergoes an independent review by an authorized Checker (Dairy Owner, Primary Admin, or Supervisor).
              Approval freezes an immutable cryptographic calculation snapshot. Any post-approval change invalidates the approval automatically.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <ClayInput
                label="Filter Batch by ID / Number"
                placeholder="e.g. BATCH-M... or UUID"
                value={reconBatchId}
                onChange={(e) => setReconBatchId(e.target.value)}
              />
              <div className="flex items-end">
                <ClayButton
                  variant="primary"
                  size="md"
                  onClick={async () => {
                    if (!reconBatchId) {
                      setNotice({ type: 'warning', message: 'Enter a valid Batch ID' })
                      return
                    }
                    try {
                      const b = await api.payments.getBatchById(reconBatchId)
                      setSelectedBatch(b)
                      setShowBatchDetailModal(true)
                    } catch (err: any) {
                      setNotice({ type: 'danger', message: err.message || 'Batch not found' })
                    }
                  }}
                  leftIcon={<CheckCircle size={15} />}
                >
                  Load Batch for Independent Review
                </ClayButton>
              </div>
            </div>
          </ClayCard>

          {/* Active Batch Card if loaded */}
          {selectedBatch && (
            <ClayCard className="p-5 border-emerald-200 bg-white space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#F1E7E0]">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-base text-[#211B18]">{selectedBatch.batchNumber}</span>
                    <ClayBadge variant={selectedBatch.status === 'APPROVED' ? 'approved' : 'pending'}>
                      {selectedBatch.status}
                    </ClayBadge>
                  </div>
                  <p className="text-xs text-[#817A75] mt-0.5">
                    Period: {selectedBatch.billingPeriodStart || 'N/A'} to {selectedBatch.billingPeriodEnd || 'N/A'} • Beneficiaries: {selectedBatch.totalBeneficiaries}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {selectedBatch.status !== 'APPROVED' && (
                    <ClayButton
                      variant="primary"
                      size="sm"
                      onClick={() => approveBatchMutation.mutate(selectedBatch.id)}
                      isLoading={approveBatchMutation.isPending}
                      leftIcon={<CheckCircle size={15} />}
                    >
                      Approve Batch (Checker)
                    </ClayButton>
                  )}
                  <ClayButton
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const reason = prompt('Please enter rejection reason:')
                      if (reason) {
                        api.payments.rejectBatch(selectedBatch.id, reason).then(() => {
                          setNotice({ type: 'info', message: 'Batch rejected and cancelled.' })
                          setSelectedBatch(null)
                        })
                      }
                    }}
                  >
                    Reject Batch
                  </ClayButton>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-[#817A75]">Total Net Payable:</span>
                  <p className="font-black text-lg text-emerald-800">₹{selectedBatch.totalAmount.toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-[#817A75]">Bank Channel:</span>
                  <p className="font-bold text-[#211B18]">{selectedBatch.bankName || 'Union Bank of India'}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-[#817A75]">Immutable Snapshot Hash:</span>
                  <p className="font-mono text-[10px] text-[#211B18] truncate">
                    {selectedBatch.calculationSnapshotHash || 'Generated on approval'}
                  </p>
                </div>
              </div>
            </ClayCard>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: BANK SUBMISSION (Section 10.D — Union Bank Payout) */}
      {/* ========================================================================= */}
      {activeTab === 'bank-submission' && (
        <div className="space-y-6">
          <ClayCard className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#F1E7E0]">
              <div className="flex items-center gap-2">
                <Building2 size={18} className="text-[#FF6A00]" />
                <h2 className="font-bold text-sm text-[#211B18]">Union Bank of India Transmission Console</h2>
              </div>
              <ClayBadge variant="approved">Corporate Bulk NEFT & CAPS Gateway</ClayBadge>
            </div>

            <p className="text-xs text-[#817A75] leading-relaxed">
              Approved batches can be submitted via direct Host-to-Host API or formatted as bank-approved bulk disbursement files.
              Files include double-entry SHA-256 integrity checksums and strict CSV formula injection sanitization.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <ClayInput
                label="Target Approved Batch ID"
                placeholder="Enter approved batch UUID"
                value={reconBatchId}
                onChange={(e) => setReconBatchId(e.target.value)}
              />

              <div className="col-span-2 flex items-end gap-2">
                <ClayButton
                  variant="primary"
                  size="md"
                  onClick={() => {
                    if (!reconBatchId) {
                      setNotice({ type: 'warning', message: 'Please enter Batch ID to export' })
                      return
                    }
                    submitUnionBankMutation.mutate({
                      batchId: reconBatchId,
                      format: 'UNION_BANK_BULK_NEFT_CSV',
                    })
                  }}
                  isLoading={submitUnionBankMutation.isPending}
                  leftIcon={<Upload size={15} />}
                >
                  Submit & Export Union Bank Bulk NEFT CSV
                </ClayButton>

                <ClayButton
                  variant="secondary"
                  size="md"
                  onClick={() => {
                    if (!reconBatchId) {
                      setNotice({ type: 'warning', message: 'Please enter Batch ID to export' })
                      return
                    }
                    submitUnionBankMutation.mutate({
                      batchId: reconBatchId,
                      format: 'UNION_BANK_CAPS_TXT',
                    })
                  }}
                  isLoading={submitUnionBankMutation.isPending}
                  leftIcon={<FileSpreadsheet size={15} />}
                >
                  Export Union Bank CAPS File
                </ClayButton>
              </div>
            </div>
          </ClayCard>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: RECONCILIATION (Section 10.E — UTR Matching & Discrepancies) */}
      {/* ========================================================================= */}
      {activeTab === 'reconciliation' && (
        <div className="space-y-6">
          <ClayCard className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#F1E7E0]">
              <div className="flex items-center gap-2">
                <RefreshCw size={18} className="text-[#FF6A00]" />
                <h2 className="font-bold text-sm text-[#211B18]">Union Bank Settlement & Reverse MIS Reconciliation</h2>
              </div>
              <span className="text-xs text-[#817A75]">Authority: Cleared Bank UTR Evidence Only</span>
            </div>

            <p className="text-xs text-[#817A75] leading-relaxed">
              Paste or upload the official settlement status report returned by Union Bank. Each beneficiary reference is reconciled
              atomically: SUCCESS triggers double-entry ledger debit; FAILED retains farmer dues; REVERSED issues an auditable compensating credit.
            </p>

            <div className="space-y-3">
              <ClayInput
                label="Target Batch ID"
                placeholder="Enter batch UUID"
                value={reconBatchId}
                onChange={(e) => setReconBatchId(e.target.value)}
              />

              <div className="text-xs text-left">
                <label className="font-bold text-[#211B18] block mb-1">
                  Bank Settlement Data (CSV / Pipe-Delimited / JSON)
                </label>
                <textarea
                  rows={5}
                  value={reconText}
                  onChange={(e) => setReconText(e.target.value)}
                  placeholder="Customer Reference,Bank UTR,Amount,Status,Reason&#10;REF-BATCH-FARM-01,UBIN2026112501,4500.00,SUCCESS,Cleared&#10;REF-BATCH-FARM-02,UBIN2026112502,3200.00,FAILED,Account Dormant"
                  className="w-full p-3 font-mono text-xs rounded-xl border border-[#F1E7E0] bg-[#FFFBF7] focus:ring-[#FF6A00] focus:border-[#FF6A00]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <ClayButton
                  variant="primary"
                  size="md"
                  onClick={() => {
                    if (!reconBatchId || !reconText.trim()) {
                      setNotice({ type: 'warning', message: 'Both Batch ID and Settlement report text are required' })
                      return
                    }
                    reconcileMutation.mutate({
                      batchId: reconBatchId,
                      payload: reconText,
                    })
                  }}
                  isLoading={reconcileMutation.isPending}
                  leftIcon={<RefreshCw size={15} />}
                >
                  Process Bank Settlement Reconciliation
                </ClayButton>
              </div>
            </div>
          </ClayCard>
        </div>
      )}

      {/* Single Payout Receipt Modal */}
      {selectedPayment && (
        <ClayModal
          isOpen={showReceiptModal}
          onClose={() => setShowReceiptModal(false)}
          title={`Disbursement Receipt: ${selectedPayment.receiptNumber}`}
          subtitle={`Cleared on ${selectedPayment.paymentDate} • Verified by ${selectedPayment.verifiedBy}`}
        >
          <div className="space-y-4 text-left">
            <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-200 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-emerald-200 text-xs">
                <span className="text-emerald-900 font-medium">Beneficiary Farmer:</span>
                <span className="font-bold text-[#211B18]">
                  {selectedPayment.customerName} ({selectedPayment.customerCode})
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <span className="text-emerald-900 font-medium">Settlement Amount:</span>
                  <p className="font-black text-lg text-emerald-800 mt-0.5">₹{selectedPayment.amount.toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-emerald-900 font-medium">Payment Mode:</span>
                  <p className="font-bold text-[#211B18] mt-0.5">{selectedPayment.paymentMethod}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-emerald-900 font-medium">Bank Transaction UTR / Ref:</span>
                  <p className="font-mono font-bold text-[#211B18] mt-0.5">{selectedPayment.transactionReference}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[#F1E7E0]">
              <ClayBadge variant="approved">{selectedPayment.status}</ClayBadge>
              <div className="flex items-center gap-2">
                <ClayButton
                  variant="secondary"
                  size="sm"
                  onClick={() => alert('Printing payment disbursement voucher...')}
                  leftIcon={<Printer size={14} />}
                >
                  Print Voucher
                </ClayButton>
                <ClayButton variant="ghost" size="sm" onClick={() => setShowReceiptModal(false)}>
                  Close
                </ClayButton>
              </div>
            </div>
          </div>
        </ClayModal>
      )}

      {/* Record Single Payment Modal */}
      <ClayModal
        isOpen={showRecordModal}
        onClose={() => setShowRecordModal(false)}
        title="Record Single Payout Disbursement"
        subtitle="Credits disbursement against farmer account ledger with bank UTR"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const amtNum = parseFloat(payAmount)
            if (isNaN(amtNum) || amtNum <= 0) {
              setErrorMsg('Please enter a valid positive payment amount')
              return
            }
            if (!payRef || payRef.trim().length < 4) {
              setErrorMsg('A valid transaction reference / UTR is required')
              return
            }
            setErrorMsg('')
            recordPaymentMutation.mutate({
              customerId: payCustId,
              amount: amtNum,
              paymentMethod: payMethod,
              transactionReference: payRef,
              notes: payNotes,
            })
          }}
          className="space-y-4 text-left"
        >
          {errorMsg && <ClayAlert type="danger" message={errorMsg} />}

          <ClaySelect
            label="Select Farmer"
            options={customers.map((c) => ({ label: `${c.customerCode} — ${c.fullName}`, value: c.id }))}
            value={payCustId}
            onChange={(e) => setPayCustId(e.target.value as string)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <ClayInput
              label="Disbursed Amount (₹)"
              type="number"
              step="0.01"
              placeholder="e.g. 5000.00"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              required
            />

            <ClaySelect
              label="Disbursement Mode"
              options={[
                { label: 'Bank Transfer (NEFT/RTGS)', value: 'BANK_TRANSFER' },
                { label: 'UPI Direct Credit', value: 'UPI' },
                { label: 'Cash Payment', value: 'CASH' },
                { label: 'Bank Cheque', value: 'CHEQUE' },
              ]}
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value as any)}
            />
          </div>

          <ClayInput
            label="Transaction Reference / Bank UTR"
            placeholder="e.g. UBI-UTR-98218291"
            value={payRef}
            onChange={(e) => setPayRef(e.target.value)}
            required
          />

          <ClayInput
            label="Notes / Voucher Remark (Optional)"
            placeholder="e.g. Fortnightly milk payout cleared by Union Bank"
            value={payNotes}
            onChange={(e) => setPayNotes(e.target.value)}
          />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#F1E7E0]">
            <ClayButton variant="ghost" size="md" type="button" onClick={() => setShowRecordModal(false)}>
              Cancel
            </ClayButton>
            <ClayButton variant="primary" size="md" type="submit" isLoading={recordPaymentMutation.isPending}>
              Confirm Disbursement Receipt
            </ClayButton>
          </div>
        </form>
      </ClayModal>
    </div>
  )
}
