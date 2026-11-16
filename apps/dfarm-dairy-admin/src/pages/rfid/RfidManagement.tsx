import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import { useAuth } from '@/context/AuthContext'
import type { RfidCardRecord } from '@/types'
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
import { RfidCardVisual } from '@/assets/illustrations'
import { CreditCard, AlertTriangle, CheckCircle2, Shield, PlusCircle, Smartphone } from 'lucide-react'

export const RfidManagement: React.FC = () => {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const [showAssignModal, setShowAssignModal] = useState(false)
  const [showLostModal, setShowLostModal] = useState(false)
  const [selectedCard, setSelectedCard] = useState<RfidCardRecord | null>(null)

  const [cardUidInput, setCardUidInput] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [notice, setNotice] = useState<{ type: 'success' | 'danger'; message: string } | null>(null)

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ['rfidCards'],
    queryFn: () => api.rfid.getAll(),
  })

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.customers.getAll(),
  })

  // Assign mutation
  const assignMutation = useMutation({
    mutationFn: ({ cardUid, customerId }: { cardUid: string; customerId: string }) =>
      api.rfid.assign(cardUid, customerId, user?.fullName || 'Dairy Admin'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rfidCards'] })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      setShowAssignModal(false)
      setCardUidInput('')
      setSelectedCustomerId('')
      setNotice({ type: 'success', message: 'RFID Smart Card successfully assigned to farmer profile.' })
    },
    onError: (err: any) => {
      setNotice({ type: 'danger', message: err.message || 'Failed to assign RFID card' })
    },
  })

  // Mark lost mutation
  const markLostMutation = useMutation({
    mutationFn: ({ cardUid, reason }: { cardUid: string; reason: string }) =>
      api.rfid.markLost(cardUid, reason, user?.fullName || 'Dairy Admin'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rfidCards'] })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      setShowLostModal(false)
      setNotice({ type: 'success', message: 'RFID card marked as LOST. Prevented future kiosk scans.' })
    },
    onError: (err: any) => {
      setNotice({ type: 'danger', message: err.message || 'Failed to mark card lost' })
    },
  })

  const customerOptions = customers.map((c) => ({
    label: `${c.customerCode} — ${c.fullName} (+91 ${c.mobileNumber})`,
    value: c.id,
  }))

  const columns: Column<RfidCardRecord>[] = [
    {
      key: 'cardUid',
      header: 'Card UID',
      render: (r) => (
        <div className="flex items-center gap-2">
          <RfidCardVisual size={20} />
          <span className="font-mono font-bold text-xs text-[#211B18]">{r.cardUid}</span>
        </div>
      ),
    },
    {
      key: 'customerName',
      header: 'Assigned Farmer',
      render: (r) =>
        r.customerId ? (
          <div>
            <span className="font-extrabold text-[#FF6A00] text-xs bg-[#FFE9DC] px-2 py-0.5 rounded">
              {r.customerCode}
            </span>
            <span className="font-bold text-[#211B18] text-sm ml-2">{r.customerName}</span>
          </div>
        ) : (
          <span className="text-xs text-[#817A75] italic">Unassigned Card</span>
        ),
    },
    {
      key: 'lastScannedAt',
      header: 'Last Device Scan',
      render: (r) =>
        r.lastScannedAt ? (
          <div className="text-xs">
            <p className="font-semibold text-[#211B18]">{new Date(r.lastScannedAt).toLocaleString()}</p>
            <p className="text-[10px] text-[#817A75]">{r.lastScannedDevice}</p>
          </div>
        ) : (
          <span className="text-xs text-[#817A75]">Never scanned</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <ClayBadge
          variant={
            r.status === 'ACTIVE'
              ? 'approved'
              : r.status === 'LOST'
              ? 'rejected'
              : 'neutral'
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
        <div className="flex items-center justify-end gap-2">
          {r.status === 'ACTIVE' && (
            <ClayButton
              variant="ghost"
              size="sm"
              className="text-red-600 hover:bg-red-50"
              onClick={() => {
                setSelectedCard(r)
                setShowLostModal(true)
              }}
            >
              Mark Lost
            </ClayButton>
          )}
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
            <RfidCardVisual size={28} />
            <h1 className="text-2xl font-black text-[#211B18] tracking-tight">RFID Card Registry</h1>
          </div>
          <p className="text-xs text-[#817A75] mt-1 font-medium">
            Contactless smart card assignments for high-throughput automated collection kiosks.
          </p>
        </div>

        <ClayButton
          variant="primary"
          size="sm"
          onClick={() => setShowAssignModal(true)}
          leftIcon={<PlusCircle size={16} />}
        >
          Assign New Card
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

      {/* Rules Banner */}
      <div className="p-4 bg-white rounded-xl border border-[#F1E7E0] flex items-start gap-3 shadow-xs text-xs text-[#817A75] leading-relaxed">
        <Shield size={18} className="text-[#FF6A00] shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-[#211B18]">Unique Card Assignment Policy: </span>
          Each physical RFID tag UID can belong to only one active farmer at a time. If a card is reported missing or
          damaged, it must be marked as LOST before a replacement tag can be authorized.
        </div>
      </div>

      {/* Table */}
      <ClayCard className="!p-0 overflow-hidden">
        <ClayTable
          columns={columns}
          data={cards}
          keyExtractor={(c) => c.id}
          isLoading={isLoading}
          emptyMessage="No RFID cards registered"
          emptySubtext="Use 'Assign New Card' to register a card."
        />
      </ClayCard>

      {/* Assign Card Modal */}
      <ClayModal
        isOpen={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        title="Assign RFID Smart Card to Farmer"
        subtitle="Registers physical card UID with customer profile"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (cardUidInput && selectedCustomerId) {
              assignMutation.mutate({ cardUid: cardUidInput, customerId: selectedCustomerId })
            }
          }}
          className="space-y-4 text-left"
        >
          <ClayInput
            label="RFID Card UID / Serial"
            placeholder="e.g. RFID-94A2B81C"
            value={cardUidInput}
            onChange={(e) => setCardUidInput(e.target.value.toUpperCase())}
            required
          />

          <ClaySelect
            label="Select Farmer"
            options={[{ label: '-- Select Registered Farmer --', value: '' }, ...customerOptions]}
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value as string)}
            required
          />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#F1E7E0]">
            <ClayButton variant="ghost" size="md" type="button" onClick={() => setShowAssignModal(false)}>
              Cancel
            </ClayButton>
            <ClayButton
              variant="primary"
              size="md"
              type="submit"
              isLoading={assignMutation.isPending}
              disabled={!cardUidInput || !selectedCustomerId}
            >
              Assign Card
            </ClayButton>
          </div>
        </form>
      </ClayModal>

      {/* Mark Lost Modal */}
      <ConfirmationModal
        isOpen={showLostModal}
        onClose={() => setShowLostModal(false)}
        onConfirm={async (reason) => {
          if (selectedCard && reason) {
            await markLostMutation.mutateAsync({ cardUid: selectedCard.cardUid, reason })
          }
        }}
        title="Mark RFID Card as Lost"
        message={`Mark card ${selectedCard?.cardUid} assigned to ${selectedCard?.customerName} as LOST? This card will immediately be rejected by all collection kiosks.`}
        confirmText="Confirm Mark Lost"
        variant="danger"
        requireReason={true}
        reasonLabel="Loss Report Reason"
        reasonPlaceholder="e.g. Card misplaced in transit; physical damage reported"
        isLoading={markLostMutation.isPending}
      />
    </div>
  )
}
