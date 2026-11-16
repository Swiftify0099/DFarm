import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import { useAuth } from '@/context/AuthContext'
import type { CollectionSession } from '@/types'
import {
  ClayCard,
  ClayButton,
  ClayBadge,
  ClayModal,
  ConfirmationModal,
  ClayAlert,
  ClayTable,
  Column,
} from '@/components/ui'
import { MilkCanVisual, CowVisual, BuffaloVisual } from '@/assets/illustrations'
import { Clock, CheckCircle2, Lock, Cpu, Eye, Wifi, AlertTriangle } from 'lucide-react'

export const CollectionSessions: React.FC = () => {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const [selectedSession, setSelectedSession] = useState<CollectionSession | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [targetSessionId, setTargetSessionId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ type: 'success' | 'danger'; message: string } | null>(null)

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['collectionSessions'],
    queryFn: () => api.collections.getSessions(),
  })

  // Close session mutation
  const closeMutation = useMutation({
    mutationFn: (sessionId: string) =>
      api.collections.closeSession(sessionId, user?.fullName || 'Dairy Admin'),
    onSuccess: (closedSes) => {
      queryClient.invalidateQueries({ queryKey: ['collectionSessions'] })
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] })
      setShowCloseModal(false)
      setNotice({
        type: 'success',
        message: `Session ${closedSes.sessionId} successfully closed and reconciled. Total: ${closedSes.totals.totalLiters} L.`,
      })
    },
    onError: (err: any) => {
      setNotice({ type: 'danger', message: err.message || 'Failed to close session' })
    },
  })

  const columns: Column<CollectionSession>[] = [
    {
      key: 'sessionId',
      header: 'Session ID / Shift',
      render: (r) => (
        <div>
          <span className="font-mono font-bold text-xs text-[#211B18]">{r.sessionId}</span>
          <p className="text-xs text-[#817A75] mt-0.5">
            {r.date} • <span className="font-semibold text-[#FF6A00]">{r.shift} Shift</span>
          </p>
        </div>
      ),
    },
    {
      key: 'device',
      header: 'Device Station',
      render: (r) => (
        <div className="flex items-center gap-1.5 text-xs">
          <Cpu size={14} className="text-[#817A75]" />
          <div>
            <p className="font-bold text-[#211B18]">{r.deviceName}</p>
            <p className="text-[10px] text-[#817A75] font-mono">{r.deviceId}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'operator',
      header: 'Shift Operator',
      render: (r) => (
        <div className="text-xs">
          <p className="font-semibold text-[#211B18]">{r.openingOperatorName}</p>
          <p className="text-[10px] text-[#817A75]">
            Opened at {new Date(r.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      ),
    },
    {
      key: 'totals',
      header: 'Volume (Cow / Buffalo)',
      render: (r) => (
        <div>
          <p className="font-black text-xs text-[#211B18]">
            {r.totals.totalLiters.toFixed(1)} L{' '}
            <span className="text-[10px] text-[#817A75] font-normal">({r.totals.transactionCount} entries)</span>
          </p>
          <p className="text-[10px] text-[#817A75] mt-0.5">
            Cow: <span className="font-semibold text-[#FF6A00]">{r.totals.cowLiters.toFixed(1)}L</span> • Buffalo:{' '}
            <span className="font-semibold text-[#211B18]">{r.totals.buffaloLiters.toFixed(1)}L</span>
          </p>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Total Value',
      render: (r) => (
        <span className="font-extrabold text-xs text-[#FF6A00]">
          ₹{r.totals.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <ClayBadge variant={r.status === 'OPEN' ? 'pending' : 'approved'}>
          {r.status === 'OPEN' ? 'LIVE NOW' : 'CLOSED'}
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
              setSelectedSession(r)
              setShowDetailModal(true)
            }}
            leftIcon={<Eye size={14} />}
          >
            Reconcile
          </ClayButton>

          {r.status === 'OPEN' && (
            <ClayButton
              variant="secondary"
              size="sm"
              onClick={() => {
                setTargetSessionId(r.id)
                setShowCloseModal(true)
              }}
              leftIcon={<Lock size={14} />}
            >
              Close
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
            <Clock size={28} className="text-[#FF6A00]" />
            <h1 className="text-2xl font-black text-[#211B18] tracking-tight">Collection Sessions</h1>
          </div>
          <p className="text-xs text-[#817A75] mt-1 font-medium">
            Morning and evening collection shift reconciliation, hardware station attribution, and total volume balances.
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

      {/* Sessions Table */}
      <ClayCard className="!p-0 overflow-hidden">
        <ClayTable
          columns={columns}
          data={sessions}
          keyExtractor={(s) => s.id}
          isLoading={isLoading}
          emptyMessage="No collection sessions logged"
          emptySubtext="Sessions opened on collection kiosks will appear here."
        />
      </ClayCard>

      {/* Session Reconciliation Modal */}
      {selectedSession && (
        <ClayModal
          isOpen={showDetailModal}
          onClose={() => setShowDetailModal(false)}
          title={`Session Reconciliation: ${selectedSession.sessionId}`}
          subtitle={`${selectedSession.date} • ${selectedSession.shift} Shift`}
        >
          <div className="space-y-4 text-left">
            <div className="p-4 bg-[#FFF5EE] rounded-xl border border-[#FFE9DC] grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[#817A75]">Total Volume Recorded:</span>
                <p className="font-extrabold text-base text-[#211B18] mt-0.5">
                  {selectedSession.totals.totalLiters.toFixed(1)} L
                </p>
              </div>
              <div>
                <span className="text-[#817A75]">Total Collection Value:</span>
                <p className="font-extrabold text-base text-[#FF6A00] mt-0.5">
                  ₹{selectedSession.totals.totalAmount.toLocaleString('en-IN')}
                </p>
              </div>
              <div>
                <span className="text-[#817A75]">Average Fat:</span>
                <p className="font-bold text-[#211B18] mt-0.5">{selectedSession.totals.averageFat}%</p>
              </div>
              <div>
                <span className="text-[#817A75]">Average SNF:</span>
                <p className="font-bold text-[#211B18] mt-0.5">{selectedSession.totals.averageSnf}%</p>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-[#F1E7E0]/60">
                <span className="text-[#817A75]">Opening Operator:</span>
                <span className="font-bold text-[#211B18]">{selectedSession.openingOperatorName}</span>
              </div>
              {selectedSession.closingOperatorName && (
                <div className="flex justify-between py-1 border-b border-[#F1E7E0]/60">
                  <span className="text-[#817A75]">Closing Operator:</span>
                  <span className="font-bold text-[#211B18]">{selectedSession.closingOperatorName}</span>
                </div>
              )}
              <div className="flex justify-between py-1 border-b border-[#F1E7E0]/60">
                <span className="text-[#817A75]">Assigned Kiosk Hardware:</span>
                <span className="font-bold text-[#211B18]">{selectedSession.deviceName}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[#817A75]">Cloud Sync State:</span>
                <ClayBadge variant="online">{selectedSession.syncStatus}</ClayBadge>
              </div>
            </div>

            <div className="pt-3 border-t border-[#F1E7E0] flex justify-end">
              <ClayButton variant="ghost" size="md" onClick={() => setShowDetailModal(false)}>
                Close Dossier
              </ClayButton>
            </div>
          </div>
        </ClayModal>
      )}

      {/* Close Session Confirmation */}
      <ConfirmationModal
        isOpen={showCloseModal}
        onClose={() => setShowCloseModal(false)}
        onConfirm={async () => {
          if (targetSessionId) {
            await closeMutation.mutateAsync(targetSessionId)
          }
        }}
        title="Confirm Closing of Collection Session"
        message="Closing this session will finalize shift totals, trigger automated synchronization across kiosks, and lock the register for this shift."
        confirmText="Finalize & Close Shift"
        variant="primary"
        isLoading={closeMutation.isPending}
      />
    </div>
  )
}
