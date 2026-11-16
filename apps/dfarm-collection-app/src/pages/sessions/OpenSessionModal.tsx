import React, { useState } from 'react'
import type { ShiftType } from '@/types'
import { ClayModal, ClayButton } from '@/components/ui'
import { useHardware } from '@/context/HardwareContext'
import { useAuth } from '@/context/AuthContext'
import { Sun, Moon, Calendar, Monitor, Clock } from 'lucide-react'

interface OpenSessionModalProps {
  isOpen: boolean
  onClose: () => void
  onSessionOpened?: () => void
}

export const OpenSessionModal: React.FC<OpenSessionModalProps> = ({
  isOpen,
  onClose,
  onSessionOpened,
}) => {
  const { openSession, refreshSession } = useHardware()
  const { operator } = useAuth()

  // Default to MORNING if current hour is < 14, else EVENING
  const defaultShift: ShiftType = new Date().getHours() < 14 ? 'MORNING' : 'EVENING'
  const [shift, setShift] = useState<ShiftType>(defaultShift)
  const [businessDate, setBusinessDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  )
  const [deviceId] = useState<string>('KIOSK_MAIN')
  const [isOpening, setIsOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleOpen = async () => {
    setIsOpening(true)
    setError(null)
    try {
      await openSession({
        shift,
        businessDate,
      })
      await refreshSession()
      onSessionOpened?.()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to open shift session.')
    } finally {
      setIsOpening(false)
    }
  }

  return (
    <ClayModal
      isOpen={isOpen}
      onClose={onClose}
      title="Open New Shift Collection Session"
      description="Initialize dairy intake counter session for morning or evening operations."
      size="md"
    >
      <div className="space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-400 text-rose-700 text-xs">
            {error}
          </div>
        )}

        {/* Shift Selection */}
        <div>
          <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">
            Operational Shift
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setShift('MORNING')}
              className={`p-3 rounded-2xl border-2 flex items-center justify-center space-x-2 transition-all ${
                shift === 'MORNING'
                  ? 'border-primary-orange bg-peach/40 text-primary-orange font-bold shadow-sm'
                  : 'border-border-subtle bg-cream text-text-secondary hover:border-stone-300'
              }`}
            >
              <Sun className="w-5 h-5 text-amber-500" />
              <span>Morning Shift (सकाळ)</span>
            </button>

            <button
              type="button"
              onClick={() => setShift('EVENING')}
              className={`p-3 rounded-2xl border-2 flex items-center justify-center space-x-2 transition-all ${
                shift === 'EVENING'
                  ? 'border-primary-orange bg-peach/40 text-primary-orange font-bold shadow-sm'
                  : 'border-border-subtle bg-cream text-text-secondary hover:border-stone-300'
              }`}
            >
              <Moon className="w-5 h-5 text-indigo-500" />
              <span>Evening Shift (संध्याकाळ)</span>
            </button>
          </div>
        </div>

        {/* Business Date */}
        <div>
          <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">
            Collection Business Date
          </label>
          <div className="relative">
            <input
              type="date"
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
              className="w-full px-3 py-2 bg-cream rounded-xl border border-border-subtle text-sm text-text-primary focus:outline-none focus:border-primary-orange"
            />
            <Calendar className="w-4 h-4 text-text-muted absolute right-3 top-3 pointer-events-none" />
          </div>
        </div>

        {/* Operator & Terminal Meta */}
        <div className="p-3 bg-peach/20 rounded-xl border border-border-subtle space-y-1 text-xs text-text-secondary font-mono">
          <div className="flex justify-between">
            <span className="flex items-center space-x-1">
              <Monitor className="w-3.5 h-3.5 text-text-muted" />
              <span>Terminal:</span>
            </span>
            <span className="font-bold text-text-primary">{deviceId}</span>
          </div>
          <div className="flex justify-between">
            <span className="flex items-center space-x-1">
              <Clock className="w-3.5 h-3.5 text-text-muted" />
              <span>Opening Operator:</span>
            </span>
            <span className="font-bold text-text-primary">
              {operator?.fullName || 'Authorized Dairy Operator'}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end space-x-2 pt-2 border-t border-border-subtle">
          <ClayButton variant="ghost" size="sm" onClick={onClose} disabled={isOpening}>
            Cancel
          </ClayButton>
          <ClayButton
            variant="primary"
            size="sm"
            onClick={handleOpen}
            disabled={isOpening}
            className="flex items-center space-x-1"
          >
            <Clock className="w-4 h-4 mr-1" />
            <span>{isOpening ? 'Opening Session...' : 'Open Shift Session'}</span>
          </ClayButton>
        </div>
      </div>
    </ClayModal>
  )
}
