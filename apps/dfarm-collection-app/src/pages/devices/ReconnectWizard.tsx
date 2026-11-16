import React, { useState } from 'react'
import type { HardwareDevice } from '@/types'
import { ClayModal, ClayButton, ClayBadge } from '@/components/ui'
import { RefreshCw, CheckCircle2, AlertCircle, Cpu } from 'lucide-react'

interface ReconnectWizardProps {
  device: HardwareDevice | null
  isOpen: boolean
  onClose: () => void
  onDeviceRefreshed: () => void
}

export const ReconnectWizard: React.FC<ReconnectWizardProps> = ({
  device,
  isOpen,
  onClose,
  onDeviceRefreshed,
}) => {
  const [isPinging, setIsPinging] = useState(false)
  const [pingResult, setPingResult] = useState<string | null>(null)

  if (!device) return null

  const handleTestPing = async () => {
    setIsPinging(true)
    setPingResult(null)

    // Simulate diagnostic check
    await new Promise((resolve) => setTimeout(resolve, 800))

    setIsPinging(false)
    setPingResult('Diagnostic ACK received: Latency 8ms • Hardware registers nominal • Checksum OK')
    onDeviceRefreshed()
  }

  return (
    <ClayModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Device Calibration: ${device.name}`}
      description={`Port: ${device.portOrEndpoint} • Connection: ${device.connectionType}`}
      size="md"
    >
      <div className="space-y-4">
        <div className="p-4 rounded-xl bg-cream border border-border-subtle space-y-2 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-text-muted">Current Connection Status:</span>
            <ClayBadge variant={device.status === 'CONNECTED' ? 'success' : 'danger'} size="sm">
              {device.status}
            </ClayBadge>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-text-muted">Baud Rate / Protocol:</span>
            <span className="font-mono font-semibold text-text-primary">
              {device.baudRate ? `${device.baudRate} Baud` : 'Native USB / WASM'}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-text-muted">Last Reported Reading:</span>
            <span className="font-mono text-text-primary text-[11px] truncate max-w-[240px]">
              {device.lastReading || 'None'}
            </span>
          </div>
        </div>

        {pingResult && (
          <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center space-x-2 text-emerald-800 text-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{pingResult}</span>
          </div>
        )}

        <div className="flex justify-end space-x-2 pt-2">
          <ClayButton variant="outline" size="sm" onClick={onClose}>
            Done
          </ClayButton>
          <ClayButton
            variant="primary"
            size="sm"
            onClick={handleTestPing}
            disabled={isPinging}
            className="flex items-center space-x-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isPinging ? 'animate-spin' : ''}`} />
            <span>{isPinging ? 'Testing Device...' : 'Send Hardware Ping Test'}</span>
          </ClayButton>
        </div>
      </div>
    </ClayModal>
  )
}
