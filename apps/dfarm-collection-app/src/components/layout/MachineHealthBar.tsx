import React from 'react'
import { useHardware } from '@/context/HardwareContext'
import { useKioskOverlay } from './CollectionAppShell'
import { Camera, Cpu, Radio, Activity, Scale, Cloud, AlertCircle, CheckCircle2 } from 'lucide-react'

export const MachineHealthBar: React.FC = () => {
  const { devices, measurements } = useHardware()
  const { openOverlay } = useKioskOverlay()

  const getDeviceStatus = (category: string) => {
    return devices.find((d) => d.category === category)
  }

  const camera = getDeviceStatus('CAMERA')
  const faceModel = getDeviceStatus('FACE_MODEL')
  const rfid = getDeviceStatus('RFID_READER')
  const analyzer = getDeviceStatus('MILK_ANALYZER')
  const scale = getDeviceStatus('DIGITAL_SCALE')
  const network = getDeviceStatus('CLOUD_NETWORK')

  const items = [
    {
      id: 'cam',
      name: 'Camera (YuNet)',
      icon: Camera,
      connected: camera?.status === 'CONNECTED',
      detail: '60 fps',
    },
    {
      id: 'sface',
      name: 'SFace INT8',
      icon: Cpu,
      connected: faceModel?.status === 'CONNECTED',
      detail: '14ms',
    },
    {
      id: 'rfid',
      name: 'RFID Reader',
      icon: Radio,
      connected: rfid?.status === 'CONNECTED',
      detail: 'COM3',
    },
    {
      id: 'analyzer',
      name: 'Lactometer',
      icon: Activity,
      connected: analyzer?.status === 'CONNECTED',
      detail: measurements.analyzerConnected ? 'Calibrated' : 'Check Cell',
    },
    {
      id: 'scale',
      name: 'Digital Scale',
      icon: Scale,
      connected: scale?.status === 'CONNECTED',
      detail: measurements.scaleStable ? 'STABLE' : 'UNSTABLE',
    },
    {
      id: 'cloud',
      name: 'Cloud Relay',
      icon: Cloud,
      connected: network?.status === 'CONNECTED',
      detail: '32ms',
    },
  ]

  return (
    <footer
      onClick={() => openOverlay('DEVICES')}
      className="h-9 bg-cream-dark border-t border-border-subtle px-4 lg:px-6 flex items-center justify-between text-xs cursor-pointer hover:bg-peach/30 transition-colors shrink-0"
      title="Click to view Hardware Telemetry & Diagnostics (F4)"
    >
      <div className="flex items-center space-x-4 lg:space-x-6 overflow-x-auto py-0.5">
        <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider hidden md:inline">
          Telemetry Strip:
        </span>
        {items.map((item) => {
          const Icon = item.icon
          return (
            <div key={item.id} className="flex items-center space-x-1.5 flex-shrink-0">
              <Icon className="w-3.5 h-3.5 text-text-secondary" />
              <span className="font-medium text-text-primary text-[11px]">{item.name}</span>
              {item.connected ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              ) : (
                <AlertCircle className="w-3 h-3 text-rose-600" />
              )}
              <span className="text-[10px] text-text-muted font-mono bg-cream px-1 rounded border border-border-subtle">
                {item.detail}
              </span>
            </div>
          )
        })}
      </div>

      <div className="text-[11px] font-semibold text-primary-orange flex items-center space-x-1 flex-shrink-0 ml-2">
        <span>F4 Diagnostics</span>
        <span>→</span>
      </div>
    </footer>
  )
}
