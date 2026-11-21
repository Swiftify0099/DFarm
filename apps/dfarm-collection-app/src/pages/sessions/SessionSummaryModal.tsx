import React from 'react'
import type { ActiveCollectionSession } from '@/types'
import { ClayModal, ClayButton, ClayBadge } from '@/components/ui'
import { Printer, CheckCircle, FileText } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

interface SessionSummaryModalProps {
  session: ActiveCollectionSession | null
  isOpen: boolean
  onClose: () => void
}

export const SessionSummaryModal: React.FC<SessionSummaryModalProps> = ({
  session,
  isOpen,
  onClose,
}) => {
  const { operator } = useAuth()
  if (!session) return null

  const handlePrint = () => {
    window.print()
  }

  const dairyName = operator?.dairyName || 'Dairy Cooperative'

  return (
    <ClayModal
      isOpen={isOpen}
      onClose={onClose}
      title="Shift Reconciliation Summary Sheet"
      description={`Session #${session.sessionCode} • ${dairyName}`}
      size="md"
    >
      <div className="space-y-4">
        {/* Printed Format Container */}
        <div className="p-4 rounded-xl bg-cream border-2 border-dashed border-border-subtle space-y-4 font-mono text-xs">
          <div className="text-center pb-2 border-b border-border-subtle">
            <h4 className="font-bold text-sm text-text-primary uppercase tracking-wider">
              DFarm Shift Collection Summary
            </h4>
            <p className="text-[10px] text-text-muted">
              {dairyName} • Terminal: {session.deviceId}
            </p>
          </div>

          <div className="flex justify-between text-[11px]">
            <span>Date: {session.date}</span>
            <span>Shift: {session.shift}</span>
          </div>

          <div className="space-y-1.5 py-2 border-t border-b border-border-subtle">
            <div className="flex justify-between">
              <span>Cow Milk Volume:</span>
              <span className="font-bold">{session.totals.cowLiters.toFixed(2)} L</span>
            </div>
            <div className="flex justify-between">
              <span>Buffalo Milk Volume:</span>
              <span className="font-bold">{session.totals.buffaloLiters.toFixed(2)} L</span>
            </div>
            <div className="flex justify-between font-bold text-text-primary pt-1 border-t border-dashed border-border-subtle">
              <span>Total Intake Volume:</span>
              <span>{session.totals.totalLiters.toFixed(2)} L</span>
            </div>
          </div>

          <div className="space-y-1.5 py-1">
            <div className="flex justify-between">
              <span>Average Fat %:</span>
              <span>{session.totals.averageFat.toFixed(2)}%</span>
            </div>
            <div className="flex justify-between">
              <span>Average SNF %:</span>
              <span>{session.totals.averageSnf.toFixed(2)}%</span>
            </div>
            <div className="flex justify-between">
              <span>Transaction Count:</span>
              <span>{session.totals.transactionCount} Patrons</span>
            </div>
            <div className="flex justify-between font-bold text-primary-orange text-sm pt-2 border-t border-border-subtle">
              <span>Total Payout Due:</span>
              <span>₹{session.totals.totalAmount.toFixed(2)}</span>
            </div>
          </div>

          <div className="pt-3 border-t border-border-subtle flex justify-between text-[10px] text-text-muted">
            <span>Operator: {session.openingOperatorName}</span>
            <span>Status: {session.status}</span>
          </div>
        </div>

        {/* Modal Controls */}
        <div className="flex justify-end space-x-2 pt-2">
          <ClayButton variant="outline" size="sm" onClick={onClose}>
            Close
          </ClayButton>
          <ClayButton
            variant="primary"
            size="sm"
            onClick={handlePrint}
            className="flex items-center space-x-1.5"
          >
            <Printer className="w-4 h-4" />
            <span>Print Shift Report</span>
          </ClayButton>
        </div>
      </div>
    </ClayModal>
  )
}
