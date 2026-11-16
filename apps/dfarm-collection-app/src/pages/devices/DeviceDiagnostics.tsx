import React, { useState } from 'react'
import type { HardwareDevice } from '@/types'
import { useHardware } from '@/context/HardwareContext'
import { ClayCard, ClayButton, ClayBadge } from '@/components/ui'
import { CameraConfigModal } from './CameraConfigModal'
import { ReconnectWizard } from './ReconnectWizard'
import {
  Cpu,
  Camera,
  Radio,
  Activity,
  Scale,
  Cloud,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Sliders,
  SlidersHorizontal,
} from 'lucide-react'

export const DeviceDiagnostics: React.FC = () => {
  const { devices, refreshDevices } = useHardware()
  const [selectedDevice, setSelectedDevice] = useState<HardwareDevice | null>(null)
  const [isWizardOpen, setIsWizardOpen] = useState(false)
  const [isCameraConfigOpen, setIsCameraConfigOpen] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefreshAll = async () => {
    setIsRefreshing(true)
    await refreshDevices()
    setTimeout(() => setIsRefreshing(false), 500)
  }

  const getDeviceIcon = (category: string) => {
    switch (category) {
      case 'CAMERA':
        return Camera
      case 'FACE_MODEL':
        return Cpu
      case 'RFID_READER':
        return Radio
      case 'MILK_ANALYZER':
        return Activity
      case 'DIGITAL_SCALE':
        return Scale
      case 'CLOUD_NETWORK':
        return Cloud
      default:
        return Cpu
    }
  }

  const handleOpenDevice = (dev: HardwareDevice) => {
    setSelectedDevice(dev)
    if (dev.category === 'CAMERA') {
      setIsCameraConfigOpen(true)
    } else {
      setIsWizardOpen(true)
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Cpu className="w-5 h-5 text-primary-orange" />
            <h2 className="text-xl font-bold text-text-primary">Hardware Telemetry & Diagnostics (F4)</h2>
          </div>
          <p className="text-xs text-text-muted mt-1">
            Real-time port polling, camera frame rates, ONNX inference latency, and serial communication.
          </p>
        </div>

        <ClayButton
          variant="secondary"
          size="sm"
          onClick={handleRefreshAll}
          disabled={isRefreshing}
          className="flex items-center space-x-1.5 text-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>Poll All Peripherals</span>
        </ClayButton>
      </div>

      {/* Hardware Devices Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {devices.map((device) => {
          const Icon = getDeviceIcon(device.category)
          const isConnected = device.status === 'CONNECTED'

          return (
            <ClayCard
              key={device.id}
              className="p-5 bg-cream flex flex-col justify-between border-t-4 border-t-primary-orange transition-all hover:shadow-md"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-peach flex items-center justify-center text-primary-orange shadow-inner">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-text-primary">{device.name}</h3>
                      <p className="text-[10px] text-text-muted font-mono">{device.connectionType}</p>
                    </div>
                  </div>

                  <ClayBadge variant={isConnected ? 'success' : 'danger'} size="sm">
                    {device.status}
                  </ClayBadge>
                </div>

                <div className="mt-4 space-y-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-peach/30 border border-border-subtle flex justify-between">
                    <span className="text-text-muted">Port / Target:</span>
                    <span className="font-mono font-semibold text-text-primary truncate max-w-[160px]">
                      {device.portOrEndpoint}
                    </span>
                  </div>

                  {device.baudRate && (
                    <div className="flex justify-between px-1">
                      <span className="text-text-muted">Baud Rate:</span>
                      <span className="font-mono font-semibold text-text-primary">
                        {device.baudRate} bps
                      </span>
                    </div>
                  )}

                  <div className="px-1 pt-1">
                    <span className="text-text-muted block text-[10px] uppercase font-bold">
                      Telemetry Feed:
                    </span>
                    <p className="font-mono text-xs text-text-primary truncate mt-0.5">
                      {device.lastReading || 'No data reported'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-border-subtle flex items-center justify-between">
                <span className="text-[10px] text-text-muted font-mono">
                  Ping: {new Date(device.lastPing).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>

                <ClayButton
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenDevice(device)}
                  className="flex items-center space-x-1 text-xs"
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  <span>Test / Calibrate</span>
                </ClayButton>
              </div>
            </ClayCard>
          )
        })}
      </div>

      {/* Modals */}
      <ReconnectWizard
        device={selectedDevice}
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onDeviceRefreshed={refreshDevices}
      />

      <CameraConfigModal
        isOpen={isCameraConfigOpen}
        onClose={() => setIsCameraConfigOpen(false)}
      />
    </div>
  )
}
