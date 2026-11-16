import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import { useAuth } from '@/context/AuthContext'
import type { DairyBill } from '@/types'
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
import { FileText, PlusCircle, CheckCircle2, Download, Printer, Shield, Calendar, DollarSign } from 'lucide-react'

export const BillingManagement: React.FC = () => {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [selectedBill, setSelectedBill] = useState<DairyBill | null>(null)
  const [showStatementModal, setShowStatementModal] = useState(false)

  // Bill Generation State
  const [targetCustomerId, setTargetCustomerId] = useState('')
  const [periodStart, setPeriodStart] = useState('2026-11-01')
  const [periodEnd, setPeriodEnd] = useState('2026-11-15')
  const [cycleName, setCycleName] = useState('Early November 2026 (Fortnightly)')
  const [genError, setGenError] = useState('')
  const [notice, setNotice] = useState<{ type: 'success' | 'danger'; message: string } | null>(null)

  const { data: bills = [], isLoading } = useQuery({
    queryKey: ['dairyBills'],
    queryFn: () => api.billing.getBills(),
  })

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.customers.getAll(),
  })

  // Bill generation mutation
  const generateMutation = useMutation({
    mutationFn: (params: any) =>
      api.billing.generateBill(
        params.customerId,
        params.periodStart,
        params.periodEnd,
        params.cycleName,
        user?.fullName || 'Dairy Admin',
      ),
    onSuccess: (newBill) => {
      queryClient.invalidateQueries({ queryKey: ['dairyBills'] })
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] })
      setShowGenerateModal(false)
      setNotice({
        type: 'success',
        message: `Settlement bill ${newBill.billNumber} successfully generated for ${newBill.customerName}. Net payable: ₹${newBill.netPayableAmount.toLocaleString('en-IN')}.`,
      })
    },
    onError: (err: any) => {
      setGenError(err.message || 'Failed to generate bill')
    },
  })

  const columns: Column<DairyBill>[] = [
    {
      key: 'billNumber',
      header: 'Bill Number / Date',
      render: (r) => (
        <div>
          <span className="font-mono font-bold text-xs text-[#211B18]">{r.billNumber}</span>
          <p className="text-[10px] text-[#817A75] mt-0.5">
            Gen: {new Date(r.generatedAt).toLocaleDateString()}
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
      key: 'period',
      header: 'Billing Cycle',
      render: (r) => (
        <div className="text-xs">
          <p className="font-semibold text-[#211B18]">{r.cycleName}</p>
          <p className="text-[10px] text-[#817A75]">
            {r.periodStart} to {r.periodEnd}
          </p>
        </div>
      ),
    },
    {
      key: 'milkVolume',
      header: 'Milk Volume',
      render: (r) => (
        <div>
          <span className="font-black text-xs text-[#211B18]">{r.totalMilkVolumeLiters.toFixed(1)} L</span>
          <p className="text-[10px] text-[#817A75]">Gross: ₹{r.totalMilkAmount.toFixed(2)}</p>
        </div>
      ),
    },
    {
      key: 'feedDeduction',
      header: 'Feed Deductions',
      render: (r) => (
        <span className="text-xs font-bold text-red-700">
          {r.totalFeedDeduction > 0 ? `- ₹${r.totalFeedDeduction.toFixed(2)}` : '₹0.00'}
        </span>
      ),
    },
    {
      key: 'netPayable',
      header: 'Net Payable',
      render: (r) => (
        <span className="font-black text-sm text-[#FF6A00]">
          ₹{r.netPayableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <ClayBadge
          variant={
            r.status === 'SETTLED'
              ? 'approved'
              : r.status === 'GENERATED'
              ? 'pending'
              : 'rejected'
          }
        >
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
              setSelectedBill(r)
              setShowStatementModal(true)
            }}
            leftIcon={<FileText size={12} />}
          >
            Statement
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
            <FileText size={28} className="text-[#FF6A00]" />
            <h1 className="text-2xl font-black text-[#211B18] tracking-tight">Billing & Settlement</h1>
          </div>
          <p className="text-xs text-[#817A75] mt-1 font-medium">
            Fortnightly settlement cycle management, automated feed deduction reconciliation, and formal payout statements.
          </p>
        </div>

        <ClayButton
          variant="primary"
          size="sm"
          onClick={() => {
            setTargetCustomerId(customers[0]?.id || '')
            setShowGenerateModal(true)
          }}
          leftIcon={<PlusCircle size={16} />}
        >
          Generate Fortnightly Bill
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

      {/* Duplicate Protection Notice */}
      <div className="p-4 bg-white rounded-xl border border-[#F1E7E0] flex items-start gap-3 shadow-xs text-xs text-[#817A75] leading-relaxed">
        <Shield size={18} className="text-[#FF6A00] shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-[#211B18]">Duplicate Bill Prevention Policy: </span>
          The backend enforces transactional uniqueness. Attempting to issue a bill for a farmer who already has an
          active or settled bill for the overlapping period will be strictly rejected.
        </div>
      </div>

      {/* Bills Table */}
      <ClayCard className="!p-0 overflow-hidden">
        <ClayTable
          columns={columns}
          data={bills}
          keyExtractor={(b) => b.id}
          isLoading={isLoading}
          emptyMessage="No billing statements generated"
          emptySubtext="Generate a fortnightly bill to initiate payments."
        />
      </ClayCard>

      {/* Statement Modal */}
      {selectedBill && (
        <ClayModal
          isOpen={showStatementModal}
          onClose={() => setShowStatementModal(false)}
          title={`Settlement Statement: ${selectedBill.billNumber}`}
          subtitle={`${selectedBill.cycleName} • Generated ${new Date(selectedBill.generatedAt).toLocaleDateString()}`}
        >
          <div className="space-y-4 text-left">
            <div className="p-4 bg-[#FFF5EE] rounded-xl border border-[#FFE9DC] text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-[#F1E7E0]/60">
                <span className="text-[#817A75]">Farmer Name / Code:</span>
                <span className="font-bold text-[#211B18]">
                  {selectedBill.customerName} ({selectedBill.customerCode})
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-[#F1E7E0]/60">
                <span className="text-[#817A75]">Settlement Period:</span>
                <span className="font-semibold text-[#211B18]">
                  {selectedBill.periodStart} to {selectedBill.periodEnd}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-[#F1E7E0]/60">
                <span className="text-[#817A75]">Gross Milk Volume:</span>
                <span className="font-bold text-[#211B18]">{selectedBill.totalMilkVolumeLiters.toFixed(1)} Liters</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-[#F1E7E0]/60">
                <span className="text-[#817A75]">Gross Milk Value:</span>
                <span className="font-bold text-emerald-700">₹{selectedBill.totalMilkAmount.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-[#F1E7E0]/60">
                <span className="text-[#817A75]">Less: Feed Purchases Deducted:</span>
                <span className="font-bold text-red-700">- ₹{selectedBill.totalFeedDeduction.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className="text-sm font-bold text-[#211B18]">Net Payable to Farmer:</span>
                <span className="text-lg font-black text-[#FF6A00]">
                  ₹{selectedBill.netPayableAmount.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[#F1E7E0]">
              <ClayBadge variant={selectedBill.status === 'SETTLED' ? 'approved' : 'pending'}>
                {selectedBill.status}
              </ClayBadge>

              <div className="flex items-center gap-2">
                <ClayButton
                  variant="secondary"
                  size="sm"
                  onClick={() => alert('Printing thermal voucher receipt...')}
                  leftIcon={<Printer size={14} />}
                >
                  Print
                </ClayButton>
                <ClayButton variant="ghost" size="sm" onClick={() => setShowStatementModal(false)}>
                  Close
                </ClayButton>
              </div>
            </div>
          </div>
        </ClayModal>
      )}

      {/* Generate Bill Modal */}
      <ClayModal
        isOpen={showGenerateModal}
        onClose={() => setShowGenerateModal(false)}
        title="Generate Fortnightly Settlement Bill"
        subtitle="Calculates gross milk intake, deducts cattle feed sales, and prepares payout voucher"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setGenError('')
            generateMutation.mutate({
              customerId: targetCustomerId,
              periodStart,
              periodEnd,
              cycleName,
            })
          }}
          className="space-y-4 text-left"
        >
          {genError && <ClayAlert type="danger" message={genError} />}

          <ClaySelect
            label="Select Farmer"
            options={customers.map((c) => ({ label: `${c.customerCode} — ${c.fullName}`, value: c.id }))}
            value={targetCustomerId}
            onChange={(e) => setTargetCustomerId(e.target.value as string)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <ClayInput
              label="Cycle Start Date"
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              required
            />
            <ClayInput
              label="Cycle End Date"
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              required
            />
          </div>

          <ClayInput
            label="Billing Cycle Name"
            placeholder="e.g. Fortnightly Cycle #22"
            value={cycleName}
            onChange={(e) => setCycleName(e.target.value)}
            required
          />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#F1E7E0]">
            <ClayButton variant="ghost" size="md" type="button" onClick={() => setShowGenerateModal(false)}>
              Cancel
            </ClayButton>
            <ClayButton variant="primary" size="md" type="submit" isLoading={generateMutation.isPending}>
              Generate & Lock Cycle
            </ClayButton>
          </div>
        </form>
      </ClayModal>
    </div>
  )
}
