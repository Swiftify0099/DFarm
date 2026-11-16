import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import { useAuth } from '@/context/AuthContext'
import type { PaymentRecord } from '@/types'
import {
  ClayCard,
  ClayButton,
  ClayBadge,
  ClayModal,
  ConfirmationModal,
  ClayAlert,
  ClayInput,
  ClaySelect,
  ClayTable,
  Column,
} from '@/components/ui'
import { Receipt, PlusCircle, CheckCircle2, Shield, DollarSign, Printer } from 'lucide-react'

export const PaymentRegister: React.FC = () => {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const [showRecordModal, setShowRecordModal] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<PaymentRecord | null>(null)
  const [showReceiptModal, setShowReceiptModal] = useState(false)

  // Payment Form
  const [payCustId, setPayCustId] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CHEQUE'>('BANK_TRANSFER')
  const [payRef, setPayRef] = useState('')
  const [payNotes, setPayNotes] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [notice, setNotice] = useState<{ type: 'success' | 'danger'; message: string } | null>(null)

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['paymentRecords'],
    queryFn: () => api.payments.getAll(),
  })

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.customers.getAll(),
  })

  // Mutation
  const paymentMutation = useMutation({
    mutationFn: (params: any) => api.payments.recordPayment(params, user?.fullName || 'Dairy Admin'),
    onSuccess: (newPay) => {
      queryClient.invalidateQueries({ queryKey: ['paymentRecords'] })
      queryClient.invalidateQueries({ queryKey: ['customerLedger'] })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] })
      setShowRecordModal(false)
      setPayAmount('')
      setPayRef('')
      setPayNotes('')
      setNotice({
        type: 'success',
        message: `Payment receipt ${newPay.receiptNumber} recorded for ${newPay.customerName}. Credited ₹${newPay.amount.toFixed(2)}.`,
      })
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Failed to record payment')
    },
  })

  const columns: Column<PaymentRecord>[] = [
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
        <span className="font-black text-sm text-emerald-700">₹{r.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
      ),
    },
    {
      key: 'paymentMethod',
      header: 'Method / Reference',
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
        <ClayBadge variant={r.status === 'RECONCILED' ? 'approved' : 'neutral'}>
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

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Receipt size={28} className="text-[#FF6A00]" />
            <h1 className="text-2xl font-black text-[#211B18] tracking-tight">Payments & Receipts</h1>
          </div>
          <p className="text-xs text-[#817A75] mt-1 font-medium">
            Backend-verified payment records, duplicate payment protection, and banking reconciliation vouchers.
          </p>
        </div>

        <ClayButton
          variant="primary"
          size="sm"
          onClick={() => {
            setPayCustId(customers[0]?.id || '')
            setShowRecordModal(true)
          }}
          leftIcon={<PlusCircle size={16} />}
        >
          Record Payout Settlement
        </ClayButton>
      </div>

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

      {/* Rules Notice */}
      <div className="p-4 bg-white rounded-xl border border-[#F1E7E0] flex items-start gap-3 shadow-xs text-xs text-[#817A75] leading-relaxed">
        <Shield size={18} className="text-[#FF6A00] shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-[#211B18]">Backend-Confirmed Payment Rule: </span>
          Payments cannot be marked successful merely through browser redirection. Receipts are reconciled against
          cleared bank UTRs or authenticated cash receipts, updating both the customer ledger and fort-nightly settlement
          records simultaneously.
        </div>
      </div>

      {/* Table */}
      <ClayCard className="!p-0 overflow-hidden">
        <ClayTable
          columns={columns}
          data={payments}
          keyExtractor={(p) => p.id}
          isLoading={isLoading}
          emptyMessage="No payment records registered"
          emptySubtext="Payout vouchers will appear here once recorded."
        />
      </ClayCard>

      {/* Official Voucher Receipt Modal */}
      {selectedPayment && (
        <ClayModal
          isOpen={showReceiptModal}
          onClose={() => setShowReceiptModal(false)}
          title={`Payment Receipt: ${selectedPayment.receiptNumber}`}
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
                  <p className="font-black text-lg text-emerald-800 mt-0.5">
                    ₹{selectedPayment.amount.toFixed(2)}
                  </p>
                </div>
                <div>
                  <span className="text-emerald-900 font-medium">Payment Mode:</span>
                  <p className="font-bold text-[#211B18] mt-0.5">{selectedPayment.paymentMethod}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-emerald-900 font-medium">Bank Transaction UTR / Ref:</span>
                  <p className="font-mono font-bold text-[#211B18] mt-0.5">
                    {selectedPayment.transactionReference}
                  </p>
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

      {/* Record Payment Modal */}
      <ClayModal
        isOpen={showRecordModal}
        onClose={() => setShowRecordModal(false)}
        title="Record Payout / Settlement Receipt"
        subtitle="Credits disbursement against farmer account ledger"
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
            paymentMutation.mutate({
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
            placeholder="e.g. UTR-HDFC-98218291"
            value={payRef}
            onChange={(e) => setPayRef(e.target.value)}
            required
          />

          <ClayInput
            label="Notes / Voucher Remark (Optional)"
            placeholder="e.g. Fortnightly milk payout cleared by bank"
            value={payNotes}
            onChange={(e) => setPayNotes(e.target.value)}
          />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#F1E7E0]">
            <ClayButton variant="ghost" size="md" type="button" onClick={() => setShowRecordModal(false)}>
              Cancel
            </ClayButton>
            <ClayButton variant="primary" size="md" type="submit" isLoading={paymentMutation.isPending}>
              Confirm Disbursement Receipt
            </ClayButton>
          </div>
        </form>
      </ClayModal>
    </div>
  )
}
