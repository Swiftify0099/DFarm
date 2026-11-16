import React, { useState } from 'react'
import type { ActiveCollectionSession } from '@/types'
import { ConfirmationModal } from '@/components/ui'
import { useHardware } from '@/context/HardwareContext'

interface CloseSessionModalProps {
  session: ActiveCollectionSession | null
  isOpen: boolean
  onClose: () => void
  onSessionClosed: () => void
}

export const CloseSessionModal: React.FC<CloseSessionModalProps> = ({
  session,
  isOpen,
  onClose,
  onSessionClosed,
}) => {
  const { closeSession, refreshSession } = useHardware()
  const [isClosing, setIsClosing] = useState(false)

  if (!session) return null

  const handleConfirmClose = async () => {
    setIsClosing(true)
    try {
      await closeSession(session.sessionCode)
      await refreshSession()
      onSessionClosed()
      onClose()
    } catch (err: any) {
      alert(`Failed to close session: ${err.message || 'Unknown error'}`)
    } finally {
      setIsClosing(false)
    }
  }

  return (
    <ConfirmationModal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleConfirmClose}
      title={`Close Shift Session (${session.sessionCode})`}
      message={`Are you sure you want to conclude the ${session.shift} shift session? Total collected volume: ${session.totals.totalLiters.toFixed(
        2
      )} Liters across ${session.totals.transactionCount} patron transactions.`}
      confirmText={isClosing ? 'Closing Session...' : 'Confirm Shift Close'}
      cancelText="Keep Session Open"
      variant="danger"
    />
  )
}
