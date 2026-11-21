import React, { useState } from 'react'
import { useHardware } from '@/context/HardwareContext'
import { ClayCard, ClayButton, ClayBadge } from '@/components/ui'
import { CloseSessionModal } from './CloseSessionModal'
import { OpenSessionModal } from './OpenSessionModal'
import { SessionSummaryModal } from './SessionSummaryModal'
import { Clock, Milk, Wallet, Activity, Users, Printer, XCircle, PlusCircle, CheckCircle } from 'lucide-react'

export const SessionManagement: React.FC = () => {
  const { activeSession, refreshSession, reopenSession } = useHardware()
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false)
  const [isOpenModalOpen, setIsOpenModalOpen] = useState(false)
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false)
  const [isReopening, setIsReopening] = useState(false)

  const handleReopen = async () => {
    if (!activeSession?.sessionCode) return
    setIsReopening(true)
    try {
      await reopenSession(activeSession.sessionCode)
      await refreshSession()
    } catch (err: any) {
      alert(`Reopen failed: ${err.message}`)
    } finally {
      setIsReopening(false)
    }
  }

  if (!activeSession) {
    return (
      <div className="max-w-7xl mx-auto py-12 px-4 space-y-6">
        <ClayCard className="p-8 text-center space-y-4 max-w-lg mx-auto bg-cream">
          <div className="w-16 h-16 rounded-full bg-peach flex items-center justify-center text-primary-orange mx-auto">
            <Clock className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-text-primary">No Active Collection Session</h3>
            <p className="text-xs text-text-secondary mt-1">
              Start a new morning or evening shift session to begin recording milk intakes.
            </p>
          </div>
          <ClayButton
            variant="primary"
            onClick={() => setIsOpenModalOpen(true)}
            className="flex items-center space-x-2 mx-auto"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Open Shift Session</span>
          </ClayButton>
        </ClayCard>

        <OpenSessionModal
          isOpen={isOpenModalOpen}
          onClose={() => setIsOpenModalOpen(false)}
          onSessionOpened={() => refreshSession()}
        />
      </div>
    )
  }

  const isOpen = activeSession.status === 'OPEN'

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Session Title & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Clock className="w-5 h-5 text-primary-orange" />
            <h2 className="text-xl font-bold text-text-primary">Shift Session Management (F3)</h2>
          </div>
          <p className="text-xs text-text-muted mt-1">
            Reconcile active intake session, monitor live throughput, and manage collection shifts.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {!isOpen && (
            <>
              <ClayButton
                variant="primary"
                size="sm"
                onClick={handleReopen}
                disabled={isReopening}
                className="flex items-center space-x-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle className="w-4 h-4" />
                <span>{isReopening ? 'Reopening...' : 'Reopen Shift'}</span>
              </ClayButton>

              <ClayButton
                variant="outline"
                size="sm"
                onClick={() => setIsOpenModalOpen(true)}
                className="flex items-center space-x-1.5 text-xs"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Open New Shift</span>
              </ClayButton>
            </>
          )}

          <ClayButton
            variant="outline"
            size="sm"
            onClick={() => setIsSummaryModalOpen(true)}
            className="flex items-center space-x-1.5 text-xs"
          >
            <Printer className="w-4 h-4" />
            <span>Shift Summary</span>
          </ClayButton>

          {isOpen && (
            <ClayButton
              variant="danger"
              size="sm"
              onClick={() => setIsCloseModalOpen(true)}
              className="flex items-center space-x-1.5 text-xs"
            >
              <XCircle className="w-4 h-4" />
              <span>Conclude Shift</span>
            </ClayButton>
          )}
        </div>
      </div>

      {/* Active Session Status Card */}
      <ClayCard
        className={`p-5 bg-cream border-l-4 ${
          isOpen ? 'border-l-primary-orange' : 'border-l-stone-400'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="font-mono font-bold text-sm text-text-primary">
                {activeSession.sessionCode}
              </span>
              <ClayBadge variant={isOpen ? 'success' : 'secondary'} size="sm">
                {activeSession.status}
              </ClayBadge>
              <ClayBadge variant={activeSession.shift === 'MORNING' ? 'warning' : 'primary'} size="sm">
                {activeSession.shift} SHIFT
              </ClayBadge>
            </div>
            <p className="text-xs text-text-secondary">
              Opened by <strong>{activeSession.openingOperatorName}</strong> at{' '}
              {new Date(activeSession.openedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
              {activeSession.closedAt && (
                <span>
                  {' '}
                  • Closed at{' '}
                  {new Date(activeSession.closedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
            </p>
          </div>

          <div className="text-right text-xs text-text-muted font-mono flex items-center md:flex-col md:items-end justify-between">
            <p>Terminal: {activeSession.deviceName}</p>
            <p>Date: {activeSession.date}</p>
          </div>
        </div>
      </ClayCard>

      {/* Aggregates Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Liters */}
        <ClayCard className="p-4 bg-cream flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-text-secondary uppercase">Total Milk Intake</span>
            <div className="w-7 h-7 rounded-lg bg-peach flex items-center justify-center text-primary-orange">
              <Milk className="w-4 h-4" />
            </div>
          </div>
          <div className="my-3">
            <span className="text-2xl font-mono font-bold text-text-primary">
              {activeSession.totals.totalLiters.toFixed(2)}
            </span>
            <span className="text-xs text-text-muted ml-1">Liters</span>
          </div>
          <div className="text-[11px] text-text-muted flex justify-between pt-2 border-t border-border-subtle">
            <span>Cow: {activeSession.totals.cowLiters.toFixed(1)} L</span>
            <span>Buf: {activeSession.totals.buffaloLiters.toFixed(1)} L</span>
          </div>
        </ClayCard>

        {/* Total Financial Value */}
        <ClayCard className="p-4 bg-cream flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-text-secondary uppercase">Gross Payout</span>
            <div className="w-7 h-7 rounded-lg bg-peach flex items-center justify-center text-primary-orange">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="my-3">
            <span className="text-2xl font-mono font-bold text-primary-orange">
              ₹ {activeSession.totals.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="text-[11px] text-text-muted pt-2 border-t border-border-subtle">
            <span>Calculated via Rate Chart Matrix</span>
          </div>
        </ClayCard>

        {/* Weighted Quality (Fat / SNF) */}
        <ClayCard className="p-4 bg-cream flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-text-secondary uppercase">Weighted Quality</span>
            <div className="w-7 h-7 rounded-lg bg-peach flex items-center justify-center text-primary-orange">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="my-3">
            <span className="text-2xl font-mono font-bold text-text-primary">
              {activeSession.totals.averageFat.toFixed(2)}%
            </span>
            <span className="text-xs text-text-muted ml-1">Fat</span>
          </div>
          <div className="text-[11px] text-text-muted flex justify-between pt-2 border-t border-border-subtle">
            <span>Average SNF:</span>
            <span className="font-semibold text-text-primary">
              {activeSession.totals.averageSnf.toFixed(2)}%
            </span>
          </div>
        </ClayCard>

        {/* Total Transactions */}
        <ClayCard className="p-4 bg-cream flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-text-secondary uppercase">Patron Deliveries</span>
            <div className="w-7 h-7 rounded-lg bg-peach flex items-center justify-center text-primary-orange">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="my-3">
            <span className="text-2xl font-mono font-bold text-text-primary">
              {activeSession.totals.transactionCount}
            </span>
            <span className="text-xs text-text-muted ml-1">Intakes</span>
          </div>
          <div className="text-[11px] text-text-muted pt-2 border-t border-border-subtle">
            <span>100% verified identities</span>
          </div>
        </ClayCard>
      </div>

      {/* Modals */}
      <OpenSessionModal
        isOpen={isOpenModalOpen}
        onClose={() => setIsOpenModalOpen(false)}
        onSessionOpened={() => refreshSession()}
      />

      <CloseSessionModal
        session={activeSession}
        isOpen={isCloseModalOpen}
        onClose={() => setIsCloseModalOpen(false)}
        onSessionClosed={() => refreshSession()}
      />

      <SessionSummaryModal
        session={activeSession}
        isOpen={isSummaryModalOpen}
        onClose={() => setIsSummaryModalOpen(false)}
      />
    </div>
  )
}
