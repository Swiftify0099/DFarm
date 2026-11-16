import React, { useState } from 'react'
import { ClayModal, ClayButton, ClayBadge } from '@/components/ui'
import { Camera, Check, Settings, Sliders } from 'lucide-react'

interface CameraConfigModalProps {
  isOpen: boolean
  onClose: () => void
}

export const CameraConfigModal: React.FC<CameraConfigModalProps> = ({ isOpen, onClose }) => {
  const [resolution, setResolution] = useState('1080p')
  const [fps, setFps] = useState('60')
  const [exposure, setExposure] = useState('Auto')
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      onClose()
    }, 800)
  }

  return (
    <ClayModal
      isOpen={isOpen}
      onClose={onClose}
      title="Camera & Biometric Sensor Calibration"
      description="Configure hardware frame rate and OpenCV YuNet landmark parameters"
      size="md"
    >
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-text-primary uppercase tracking-wide mb-1.5">
            Stream Resolution
          </label>
          <div className="grid grid-cols-3 gap-2">
            {['720p', '1080p', '4K'].map((res) => (
              <button
                key={res}
                type="button"
                onClick={() => setResolution(res)}
                className={`p-2.5 rounded-xl border text-xs font-semibold ${
                  resolution === res
                    ? 'bg-peach border-primary-orange text-primary-orange font-bold'
                    : 'bg-cream border-border-subtle text-text-secondary'
                }`}
              >
                {res}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-text-primary uppercase tracking-wide mb-1.5">
            Capture Frame Rate
          </label>
          <div className="grid grid-cols-3 gap-2">
            {['30 fps', '60 fps', '120 fps'].map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFps(f)}
                className={`p-2.5 rounded-xl border text-xs font-semibold ${
                  fps === f
                    ? 'bg-peach border-primary-orange text-primary-orange font-bold'
                    : 'bg-cream border-border-subtle text-text-secondary'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="p-3 bg-cream-dark rounded-xl border border-border-subtle space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-text-muted">Target Landmark Model:</span>
            <span className="font-mono font-bold text-text-primary">OpenCV YuNet ONNX</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Embedding Engine:</span>
            <span className="font-mono font-bold text-text-primary">SFace INT8 ONNX</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Inference Target:</span>
            <span className="font-mono text-emerald-700 font-semibold">WASM SIMD Multi-Thread</span>
          </div>
        </div>

        <div className="flex justify-end space-x-2 pt-2">
          <ClayButton variant="outline" size="sm" onClick={onClose}>
            Cancel
          </ClayButton>
          <ClayButton variant="primary" size="sm" onClick={handleSave}>
            {saved ? 'Saved!' : 'Apply Sensor Calibration'}
          </ClayButton>
        </div>
      </div>
    </ClayModal>
  )
}
