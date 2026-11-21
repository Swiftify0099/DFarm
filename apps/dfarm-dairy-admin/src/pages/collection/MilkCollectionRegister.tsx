import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import { useAuth } from '@/context/AuthContext'
import type { MilkCollectionTransaction } from '@/types'
import {
  ClayCard,
  ClayButton,
  ClayBadge,
  ClayInput,
  ClaySelect,
  ClayModal,
  ConfirmationModal,
  ClayAlert,
  ClayTable,
  Column,
} from '@/components/ui'
import { CowVisual, BuffaloVisual, MilkCanVisual } from '@/assets/illustrations'
import { Droplet, Search, Filter, Edit3, Shield, Receipt, Download, Clock } from 'lucide-react'

export const MilkCollectionRegister: React.FC = () => {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const [searchCustomer, setSearchCustomer] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [shiftFilter, setShiftFilter] = useState('ALL')

  const [selectedTxn, setSelectedTxn] = useState<MilkCollectionTransaction | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showAdjustModal, setShowAdjustModal] = useState(false)

  const [newWeightInput, setNewWeightInput] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [adjustError, setAdjustError] = useState('')
  const [notice, setNotice] = useState<{ type: 'success' | 'danger'; message: string } | null>(null)

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['collectionTransactions', user?.dairyId],
    queryFn: () => api.collections.getTransactions(),
  })

  // Adjustment mutation
  const adjustMutation = useMutation({
    mutationFn: ({ txnId, newWeight, reason }: { txnId: string; newWeight: number; reason: string }) =>
      api.collections.adjustTransaction(txnId, newWeight, reason, user?.fullName || 'Dairy Admin'),
    onSuccess: (updatedTxn) => {
      queryClient.invalidateQueries({ queryKey: ['collectionTransactions', user?.dairyId] })
      queryClient.invalidateQueries({ queryKey: ['customerLedger', user?.dairyId] })
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary', user?.dairyId] })
      setShowAdjustModal(false)
      setShowDetailModal(false)
      setNewWeightInput('')
      setAdjustReason('')
      setNotice({
        type: 'success',
        message: `Transaction ${updatedTxn.transactionId} adjusted non-destructively. Customer ledger was updated and auditable diff recorded.`,
      })
    },
    onError: (err: any) => {
      setAdjustError(err.message || 'Failed to adjust collection record')
    },
  })

  const filteredTransactions = transactions.filter((t) => {
    const matchesSearch =
      t.customerName.toLowerCase().includes(searchCustomer.toLowerCase()) ||
      t.customerCode.toLowerCase().includes(searchCustomer.toLowerCase()) ||
      t.transactionId.toLowerCase().includes(searchCustomer.toLowerCase())

    const matchesCat = categoryFilter === 'ALL' || t.milkCategory === categoryFilter
    const matchesShift = shiftFilter === 'ALL' || t.shift === shiftFilter

    return matchesSearch && matchesCat && matchesShift
  })

  const columns: Column<MilkCollectionTransaction>[] = [
    {
      key: 'transactionId',
      header: 'Txn ID / Shift',
      render: (r) => (
        <div>
          <span className="font-mono font-bold text-xs text-[#211B18]">{r.transactionId}</span>
          <p className="text-[11px] text-[#817A75] mt-0.5">
            {r.date} • <span className="font-semibold text-[#FF6A00]">{r.shift}</span>
          </p>
        </div>
      ),
    },
    {
      key: 'customerName',
      header: 'Farmer Details',
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
      key: 'milkCategory',
      header: 'Category',
      render: (r) => (
        <ClayBadge
          variant={r.milkCategory === 'COW' ? 'cow' : 'buffalo'}
          icon={r.milkCategory === 'COW' ? <CowVisual size={14} /> : <BuffaloVisual size={14} />}
        >
          {r.milkCategory}
        </ClayBadge>
      ),
    },
    {
      key: 'weightLiters',
      header: 'Weight / Quality',
      render: (r) => (
        <div>
          <span className="font-black text-xs text-[#211B18]">{r.weightLiters.toFixed(1)} L</span>
          <p className="text-[10px] text-[#817A75] mt-0.5">
            Fat: <span className="font-semibold text-[#211B18]">{r.fatPercentage.toFixed(1)}%</span> • SNF:{' '}
            <span className="font-semibold text-[#211B18]">{r.snfPercentage.toFixed(1)}%</span>
          </p>
        </div>
      ),
    },
    {
      key: 'totalAmount',
      header: 'Rate / Amount',
      render: (r) => (
        <div>
          <span className="font-black text-xs text-[#FF6A00]">₹{r.totalAmount.toFixed(2)}</span>
          <p className="text-[10px] text-[#817A75] mt-0.5">
            @ ₹{r.appliedRatePerLiter.toFixed(2)}/L (v{r.rateChartVersion})
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Audit Status',
      render: (r) => (
        <ClayBadge variant={r.status === 'CONFIRMED' ? 'approved' : 'warning'}>
          {r.status}
        </ClayBadge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1.5">
          <ClayButton
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedTxn(r)
              setShowDetailModal(true)
            }}
          >
            Receipt
          </ClayButton>
          <ClayButton
            variant="secondary"
            size="sm"
            onClick={() => {
              setSelectedTxn(r)
              setNewWeightInput(r.weightLiters.toString())
              setShowAdjustModal(true)
            }}
            leftIcon={<Edit3 size={12} />}
          >
            Adjust
          </ClayButton>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Droplet size={28} className="text-[#FF6A00]" />
            <h1 className="text-2xl font-black text-[#211B18] tracking-tight">Milk Collection Register</h1>
          </div>
          <p className="text-xs text-[#817A75] mt-1 font-medium">
            Granular milk intake records, automated rate calculations, and controlled non-destructive adjustments.
          </p>
        </div>
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

      {/* Financial Security Rule Banner */}
      <div className="p-4 bg-white rounded-xl border border-[#F1E7E0] flex items-start gap-3 shadow-xs text-xs text-[#817A75] leading-relaxed">
        <Shield size={18} className="text-[#FF6A00] shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-[#211B18]">Non-Destructive Adjustment Rule: </span>
          Milk collection entries are never overwritten or deleted. Any calibration correction or quantity adjustment
          is captured as an audited delta with an authorized reason, and an adjusting credit/debit is automatically
          posted to the customer's server-authoritative ledger.
        </div>
      </div>

      {/* Filter and Search */}
      <ClayCard className="!p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ClayInput
            placeholder="Search by farmer name, code, txn ID..."
            value={searchCustomer}
            onChange={(e) => setSearchCustomer(e.target.value)}
            leftIcon={<Search size={16} />}
          />

          <ClaySelect
            options={[
              { label: 'All Milk Categories', value: 'ALL' },
              { label: 'Cow Milk Only', value: 'COW' },
              { label: 'Buffalo Milk Only', value: 'BUFFALO' },
            ]}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          />

          <ClaySelect
            options={[
              { label: 'All Shifts', value: 'ALL' },
              { label: 'Morning Shift', value: 'MORNING' },
              { label: 'Evening Shift', value: 'EVENING' },
            ]}
            value={shiftFilter}
            onChange={(e) => setShiftFilter(e.target.value)}
          />
        </div>
      </ClayCard>

      {/* Register Table */}
      <ClayCard className="!p-0 overflow-hidden">
        <ClayTable
          columns={columns}
          data={filteredTransactions}
          keyExtractor={(t) => t.id}
          isLoading={isLoading}
          emptyMessage="No collection transactions found"
          emptySubtext="Intake transactions from smart kiosks will populate this register."
        />
      </ClayCard>

      {/* Transaction Receipt Modal */}
      {selectedTxn && (
        <ClayModal
          isOpen={showDetailModal}
          onClose={() => setShowDetailModal(false)}
          title={`Intake Receipt: ${selectedTxn.transactionId}`}
          subtitle={`Recorded on ${new Date(selectedTxn.timestamp).toLocaleString()}`}
        >
          <div className="space-y-4 text-left">
            <div className="p-4 bg-[#FFF5EE] rounded-xl border border-[#FFE9DC]">
              <div className="flex items-center justify-between pb-2 border-b border-[#F1E7E0]/60 text-xs">
                <span className="text-[#817A75]">Farmer:</span>
                <span className="font-bold text-[#211B18]">
                  {selectedTxn.customerName} ({selectedTxn.customerCode})
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
                <div>
                  <span className="text-[#817A75]">Milk Category:</span>
                  <p className="font-bold text-[#211B18] mt-0.5">{selectedTxn.milkCategory}</p>
                </div>
                <div>
                  <span className="text-[#817A75]">Quantity Taken:</span>
                  <p className="font-extrabold text-[#211B18] text-base mt-0.5">
                    {selectedTxn.weightLiters.toFixed(1)} L
                  </p>
                </div>
                <div>
                  <span className="text-[#817A75]">Fat / SNF %:</span>
                  <p className="font-bold text-[#211B18] mt-0.5">
                    {selectedTxn.fatPercentage.toFixed(1)}% / {selectedTxn.snfPercentage.toFixed(1)}%
                  </p>
                </div>
                <div>
                  <span className="text-[#817A75]">Applied Rate:</span>
                  <p className="font-bold text-[#211B18] mt-0.5">
                    ₹{selectedTxn.appliedRatePerLiter.toFixed(2)}/L
                  </p>
                </div>
                <div className="col-span-2 pt-2 border-t border-[#F1E7E0]/60 flex items-center justify-between">
                  <span className="font-bold text-sm text-[#211B18]">Total Value Credited:</span>
                  <span className="font-black text-lg text-[#FF6A00]">
                    ₹{selectedTxn.totalAmount.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {selectedTxn.adjustment && (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs">
                <div className="flex items-center gap-1 font-bold text-amber-900 mb-1">
                  <Shield size={14} />
                  <span>Audited Correction History</span>
                </div>
                <p className="text-[11px] text-amber-800">
                  Adjusted from {selectedTxn.adjustment.originalWeight}L (₹{selectedTxn.adjustment.originalAmount}) on{' '}
                  {new Date(selectedTxn.adjustment.adjustedAt).toLocaleString()} by {selectedTxn.adjustment.adjustedBy}.
                </p>
                <p className="text-[11px] font-semibold text-amber-900 mt-1">
                  Reason: {selectedTxn.adjustment.reason}
                </p>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#F1E7E0]">
              <ClayButton variant="ghost" size="md" onClick={() => setShowDetailModal(false)}>
                Close
              </ClayButton>
            </div>
          </div>
        </ClayModal>
      )}

      {/* Non-Destructive Adjustment Modal */}
      {selectedTxn && (
        <ClayModal
          isOpen={showAdjustModal}
          onClose={() => setShowAdjustModal(false)}
          title={`Adjust Transaction ${selectedTxn.transactionId}`}
          subtitle={`Current: ${selectedTxn.weightLiters}L • ₹${selectedTxn.totalAmount}`}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const weightNum = parseFloat(newWeightInput)
              if (isNaN(weightNum) || weightNum <= 0) {
                setAdjustError('Please enter a valid positive weight in liters')
                return
              }
              if (!adjustReason || adjustReason.trim().length < 5) {
                setAdjustError('Authorized reason is required (minimum 5 characters)')
                return
              }
              setAdjustError('')
              adjustMutation.mutate({
                txnId: selectedTxn.id,
                newWeight: weightNum,
                reason: adjustReason,
              })
            }}
            className="space-y-4 text-left"
          >
            {adjustError && <ClayAlert type="danger" message={adjustError} />}

            <ClayInput
              label="Corrected Weight (Liters)"
              type="number"
              step="0.1"
              value={newWeightInput}
              onChange={(e) => setNewWeightInput(e.target.value)}
              required
            />

            <ClayInput
              label="Mandatory Authorized Reason"
              placeholder="e.g. Weighing scale calibration offset confirmed by supervisor"
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              required
            />

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#F1E7E0]">
              <ClayButton variant="ghost" size="md" type="button" onClick={() => setShowAdjustModal(false)}>
                Cancel
              </ClayButton>
              <ClayButton variant="primary" size="md" type="submit" isLoading={adjustMutation.isPending}>
                Apply Audited Correction
              </ClayButton>
            </div>
          </form>
        </ClayModal>
      )}
    </div>
  )
}
