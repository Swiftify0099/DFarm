import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import { useAuth } from '@/context/AuthContext'
import type { CustomerLedgerEntry } from '@/types'
import {
  ClayCard,
  ClayButton,
  ClayBadge,
  ClaySelect,
  ClayModal,
  ConfirmationModal,
  ClayAlert,
  ClayInput,
  ClayTable,
  Column,
} from '@/components/ui'
import { LedgerShieldVisual } from '@/assets/illustrations'
import { BookOpen, PlusCircle, Shield, ArrowDownLeft, ArrowUpRight, DollarSign } from 'lucide-react'

export const CustomerLedgerView: React.FC = () => {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('ALL')
  const [showAdjustModal, setShowAdjustModal] = useState(false)

  // Adjustment Form State
  const [adjCustomer, setAdjCustomer] = useState('')
  const [adjType, setAdjType] = useState<'CREDIT' | 'DEBIT'>('CREDIT')
  const [adjAmount, setAdjAmount] = useState('')
  const [adjDescription, setAdjDescription] = useState('')
  const [adjReason, setAdjReason] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [notice, setNotice] = useState<{ type: 'success' | 'danger'; message: string } | null>(null)

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.customers.getAll(),
  })

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['ledgerEntries', selectedCustomerId],
    queryFn: () => api.ledger.getEntries(selectedCustomerId === 'ALL' ? undefined : selectedCustomerId),
  })

  // Adjustment Mutation
  const adjustmentMutation = useMutation({
    mutationFn: (params: any) => api.ledger.performAdjustment(params, user?.fullName || 'Dairy Admin'),
    onSuccess: (newEntry) => {
      queryClient.invalidateQueries({ queryKey: ['ledgerEntries'] })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] })
      setShowAdjustModal(false)
      setAdjAmount('')
      setAdjDescription('')
      setAdjReason('')
      setNotice({
        type: 'success',
        message: `Authorized ${newEntry.entryType} of ₹${(newEntry.debit || newEntry.credit).toFixed(2)} recorded for ${newEntry.customerName}. New balance: ₹${newEntry.runningBalance.toFixed(2)}.`,
      })
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Failed to post ledger adjustment')
    },
  })

  const customerOptions = [
    { label: 'All Customers (Combined Ledger)', value: 'ALL' },
    ...customers.map((c) => ({
      label: `${c.customerCode} — ${c.fullName}`,
      value: c.id,
    })),
  ]

  const columns: Column<CustomerLedgerEntry>[] = [
    {
      key: 'timestamp',
      header: 'Date & Ref',
      render: (r) => (
        <div>
          <span className="font-semibold text-xs text-[#211B18]">{r.date}</span>
          <p className="text-[10px] text-[#817A75] font-mono mt-0.5">{r.referenceId}</p>
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
      key: 'description',
      header: 'Transaction Description',
      render: (r) => (
        <div>
          <p className="text-xs font-semibold text-[#211B18]">{r.description}</p>
          {r.reason && (
            <p className="text-[10px] text-amber-800 font-medium mt-0.5">Reason: {r.reason}</p>
          )}
        </div>
      ),
    },
    {
      key: 'debit',
      header: 'Debit (Deduction)',
      render: (r) =>
        r.debit > 0 ? (
          <span className="font-bold text-xs text-red-700 flex items-center gap-1">
            <ArrowDownLeft size={13} /> ₹{r.debit.toFixed(2)}
          </span>
        ) : (
          <span className="text-[#817A75] text-xs">-</span>
        ),
    },
    {
      key: 'credit',
      header: 'Credit (Earnings)',
      render: (r) =>
        r.credit > 0 ? (
          <span className="font-bold text-xs text-emerald-700 flex items-center gap-1">
            <ArrowUpRight size={13} /> ₹{r.credit.toFixed(2)}
          </span>
        ) : (
          <span className="text-[#817A75] text-xs">-</span>
        ),
    },
    {
      key: 'runningBalance',
      header: 'Balance After',
      render: (r) => (
        <span
          className={`font-black text-xs ${
            r.runningBalance >= 0 ? 'text-[#FF6A00]' : 'text-red-700'
          }`}
        >
          ₹{r.runningBalance.toFixed(2)}
        </span>
      ),
    },
    {
      key: 'authorizedBy',
      header: 'Audit Actor',
      render: (r) => <span className="text-xs text-[#817A75]">{r.authorizedBy}</span>,
    },
  ]

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <LedgerShieldVisual size={28} />
            <h1 className="text-2xl font-black text-[#211B18] tracking-tight">Customer Account Ledger</h1>
          </div>
          <p className="text-xs text-[#817A75] mt-1 font-medium">
            Server-authoritative double-entry financial ledger for milk credits, feed debits, and authorized settlements.
          </p>
        </div>

        <ClayButton
          variant="primary"
          size="sm"
          onClick={() => {
            setAdjCustomer(customers[0]?.id || '')
            setShowAdjustModal(true)
          }}
          leftIcon={<PlusCircle size={16} />}
        >
          Authorized Adjustment
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
          <span className="font-bold text-[#211B18]">Single Server Authority: </span>
          Direct balance manipulation is impossible. Running balances are strictly derived from immutable double-entry
          transactions (collection credits, feed debits, settlement receipts). Manual adjustments require operator authorization
          and an audited explanation.
        </div>
      </div>

      {/* Filter by Customer */}
      <ClayCard className="!p-4">
        <div className="max-w-md">
          <ClaySelect
            label="Filter by Farmer Ledger"
            options={customerOptions}
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value as string)}
          />
        </div>
      </ClayCard>

      {/* Ledger Table */}
      <ClayCard className="!p-0 overflow-hidden">
        <ClayTable
          columns={columns}
          data={entries}
          keyExtractor={(e) => e.id}
          isLoading={isLoading}
          emptyMessage="No ledger entries found"
          emptySubtext="Transactions will post credits and debits here automatically."
        />
      </ClayCard>

      {/* Authorized Adjustment Modal */}
      <ClayModal
        isOpen={showAdjustModal}
        onClose={() => setShowAdjustModal(false)}
        title="Post Authorized Ledger Adjustment"
        subtitle="Auditable manual adjustment applied directly to farmer balance"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const amt = parseFloat(adjAmount)
            if (isNaN(amt) || amt <= 0) {
              setErrorMsg('Please enter a valid positive adjustment amount')
              return
            }
            if (!adjReason || adjReason.trim().length < 5) {
              setErrorMsg('Authorized reason is required (min 5 characters)')
              return
            }
            setErrorMsg('')
            adjustmentMutation.mutate({
              customerId: adjCustomer,
              type: adjType,
              amount: amt,
              description: adjDescription || `Manual ${adjType} adjustment`,
              reason: adjReason,
            })
          }}
          className="space-y-4 text-left"
        >
          {errorMsg && <ClayAlert type="danger" message={errorMsg} />}

          <ClaySelect
            label="Select Farmer"
            options={customers.map((c) => ({ label: `${c.customerCode} — ${c.fullName}`, value: c.id }))}
            value={adjCustomer}
            onChange={(e) => setAdjCustomer(e.target.value as string)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <ClaySelect
              label="Adjustment Nature"
              options={[
                { label: 'Credit (Increase Farmer Balance)', value: 'CREDIT' },
                { label: 'Debit (Deduct from Balance)', value: 'DEBIT' },
              ]}
              value={adjType}
              onChange={(e) => setAdjType(e.target.value as any)}
            />

            <ClayInput
              label="Amount (₹)"
              type="number"
              step="0.01"
              placeholder="e.g. 250.00"
              value={adjAmount}
              onChange={(e) => setAdjAmount(e.target.value)}
              required
            />
          </div>

          <ClayInput
            label="Description / Particulars"
            placeholder="e.g. Cattle welfare scheme bonus; Festival incentive"
            value={adjDescription}
            onChange={(e) => setAdjDescription(e.target.value)}
            required
          />

          <ClayInput
            label="Mandatory Authorized Reason"
            placeholder="e.g. Approved in board committee resolution #41"
            value={adjReason}
            onChange={(e) => setAdjReason(e.target.value)}
            required
          />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#F1E7E0]">
            <ClayButton variant="ghost" size="md" type="button" onClick={() => setShowAdjustModal(false)}>
              Cancel
            </ClayButton>
            <ClayButton variant="primary" size="md" type="submit" isLoading={adjustmentMutation.isPending}>
              Commit Audited Adjustment
            </ClayButton>
          </div>
        </form>
      </ClayModal>
    </div>
  )
}
