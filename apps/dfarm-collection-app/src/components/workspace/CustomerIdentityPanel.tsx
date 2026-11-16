import React, { useState, useRef, useEffect } from 'react'
import { useHardware } from '@/context/HardwareContext'
import { ClayCard, ClayButton, ClayBadge } from '@/components/ui'
import { FaceScannerReticle, RfidWaveVisual } from '@/assets/illustrations'
import { Camera, Radio, Search, CheckCircle, AlertTriangle, RefreshCw, Video, VideoOff } from 'lucide-react'
import type { CustomerIdentity } from '@/types'
import { useCamera } from '@/hooks/useCamera'
import { getStoredOperatorAuth } from '@/api/client'

interface CustomerIdentityPanelProps {
  onCustomerSelected: (customer: CustomerIdentity) => void
  onOpenManualSearch: () => void
}

export const CustomerIdentityPanel: React.FC<CustomerIdentityPanelProps> = ({
  onCustomerSelected,
  onOpenManualSearch,
}) => {
  const {
    faceState,
    rfidState,
    enrolledTemplates,
    customersMap,
    simulateFaceDetection,
    resetFaceState,
    simulateRfidScan,
    resetRfidState,
  } = useHardware()

  const [isSimulating, setIsSimulating] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const { dairyId } = getStoredOperatorAuth()

  // Real Hardware Camera Hook
  const {
    videoRef,
    isCameraActive,
    status: cameraStatus,
    errorMessage: cameraError,
    boundingBox,
    matchedCustomer: cameraCustomer,
    confidenceScore: cameraConfidence,
    latencyMs: cameraLatency,
    startCamera,
    stopCamera,
    resetMatch: resetCameraMatch,
  } = useCamera({
    activeDairyId: dairyId || '00000000-0000-0000-0000-000000000001',
    enrolledTemplates,
    customersMap,
    onCustomerMatched: (customer) => {
      onCustomerSelected(customer)
    },
  })

  // Canvas Overlay Rendering for Real-time YuNet Bounding Box & 5-point Landmarks
  useEffect(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (isCameraActive && boundingBox && video && video.videoWidth > 0) {
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
      }

      const isMatched = cameraStatus === 'CUSTOMER_MATCHED'
      const isUnknown = cameraStatus === 'UNKNOWN_PERSON'
      const strokeColor = isMatched ? '#10B981' : isUnknown ? '#F43F5E' : '#00E5FF'

      // Bounding Box
      ctx.strokeStyle = strokeColor
      ctx.lineWidth = 4
      ctx.strokeRect(boundingBox.x, boundingBox.y, boundingBox.width, boundingBox.height)

      // Label Pill
      ctx.fillStyle = strokeColor
      ctx.font = 'bold 14px monospace'
      const labelText = isMatched
        ? `MATCHED (${cameraConfidence}%)`
        : isUnknown
        ? 'UNKNOWN PERSON'
        : `FACE DETECTED (${(boundingBox.confidence * 100).toFixed(0)}%)`
      ctx.fillText(labelText, boundingBox.x, Math.max(22, boundingBox.y - 8))

      // 5-point Landmarks (Eyes, Nose, Mouth Corners)
      if (boundingBox.landmarks && boundingBox.landmarks.length > 0) {
        ctx.fillStyle = isMatched ? '#34D399' : '#38BDF8'
        for (const [lx, ly] of boundingBox.landmarks) {
          ctx.beginPath()
          ctx.arc(lx, ly, 5, 0, 2 * Math.PI)
          ctx.fill()
        }
      }
    }
  }, [isCameraActive, boundingBox, cameraStatus, cameraConfidence, videoRef])

  const handleSimulateFace = async (code?: string) => {
    setIsSimulating(true)
    const matched = await simulateFaceDetection(code)
    setIsSimulating(false)
    if (matched) {
      onCustomerSelected(matched)
    }
  }

  const handleSimulateRfid = async (uid: string) => {
    setIsSimulating(true)
    const matched = await simulateRfidScan(uid)
    setIsSimulating(false)
    if (matched) {
      onCustomerSelected(matched)
    }
  }

  const handleResetAll = () => {
    resetCameraMatch()
    resetFaceState()
    resetRfidState()
  }

  const activeCustomer = cameraCustomer || faceState.matchedCustomer || rfidState.matchedCustomer
  const effectiveStatus = isCameraActive ? cameraStatus : faceState.status

  return (
    <ClayCard className="flex flex-col h-full overflow-hidden p-4">
      {/* Header with hardware mode tabs */}
      <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
        <div className="flex items-center space-x-2">
          <FaceScannerReticle size={24} />
          <div>
            <h2 className="text-sm font-bold text-text-primary">Biometric & RFID Identification</h2>
            <p className="text-[11px] text-text-muted">OpenCV YuNet + SFace INT8 ONNX Engine</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Camera Start / Stop Toggle */}
          <ClayButton
            variant={isCameraActive ? 'danger' : 'secondary'}
            size="sm"
            onClick={isCameraActive ? stopCamera : startCamera}
            className="flex items-center space-x-1 text-xs py-1 px-2.5"
          >
            {isCameraActive ? (
              <>
                <VideoOff className="w-3.5 h-3.5" />
                <span>Stop Cam</span>
              </>
            ) : (
              <>
                <Video className="w-3.5 h-3.5 text-primary-orange" />
                <span>Start Cam</span>
              </>
            )}
          </ClayButton>

          <ClayBadge
            variant={
              effectiveStatus === 'CUSTOMER_MATCHED'
                ? 'success'
                : effectiveStatus === 'UNKNOWN_PERSON'
                ? 'danger'
                : effectiveStatus === 'WAITING_FOR_FACE'
                ? 'primary'
                : 'secondary'
            }
            size="sm"
          >
            {effectiveStatus.replace(/_/g, ' ')}
          </ClayBadge>
        </div>
      </div>

      {/* Main Scanner Viewport Area */}
      <div className="mt-3 relative flex-1 min-h-[240px] bg-stone-900 rounded-2xl overflow-hidden flex flex-col items-center justify-center border-2 border-stone-800 shadow-inner">
        {/* Real Live Camera Video Feed */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`absolute inset-0 w-full h-full object-cover ${
            isCameraActive ? 'block' : 'hidden'
          }`}
        />

        {/* Real-time Landmark & Bounding Box Canvas Overlay */}
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 w-full h-full object-cover pointer-events-none z-10 ${
            isCameraActive ? 'block' : 'hidden'
          }`}
        />

        {/* Simulated / Inactive Camera Overlay */}
        {!isCameraActive && (
          <>
            <div className="absolute inset-0 bg-gradient-to-b from-stone-900/60 via-stone-900/30 to-stone-950/90 pointer-events-none" />
            <div
              className="absolute inset-0 opacity-15"
              style={{
                backgroundImage:
                  'linear-gradient(to right, #00E5FF 1px, transparent 1px), linear-gradient(to bottom, #00E5FF 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
            />
          </>
        )}

        {/* Camera Permission / Error Alert */}
        {cameraError && (
          <div className="relative z-20 flex flex-col items-center p-4 text-center space-y-2 max-w-sm">
            <div className="w-12 h-12 rounded-full bg-rose-500/20 border-2 border-rose-400 flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <p className="text-xs font-bold text-rose-300">Camera Warning</p>
            <p className="text-[11px] text-stone-300">{cameraError}</p>
            <ClayButton
              variant="secondary"
              size="sm"
              onClick={startCamera}
              className="text-xs mt-2"
            >
              Retry Camera
            </ClayButton>
          </div>
        )}

        {/* Waiting For Face State */}
        {!cameraError && (effectiveStatus === 'WAITING_FOR_FACE' || (!isCameraActive && faceState.status === 'WAITING_FOR_FACE')) && (
          <div className="relative z-10 flex flex-col items-center space-y-3 p-4 text-center">
            <div className="w-20 h-20 rounded-full border-2 border-dashed border-primary-orange/60 flex items-center justify-center animate-pulse">
              <Camera className="w-8 h-8 text-primary-orange/80" />
            </div>
            <p className="text-xs text-stone-200 font-medium tracking-wide">
              {isCameraActive ? 'Align face in camera frame or tap RFID card' : 'Start camera or tap RFID / test face'}
            </p>
            <span className="text-[10px] text-stone-400 font-mono">
              YuNet 60fps • 5-point facial landmark tracking • SFace INT8 (128-D)
            </span>
          </div>
        )}

        {/* Matching In Progress State */}
        {(effectiveStatus === 'MATCHING_CUSTOMER' || faceState.status === 'EMBEDDING_GENERATED') && (
          <div className="relative z-20 flex flex-col items-center space-y-2 bg-stone-900/80 p-3 rounded-xl border border-cyan-500/40">
            <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-cyan-300 font-mono">
              Generating 128-D SFace Vector & Matching Dairy Scope...
            </p>
          </div>
        )}

        {/* Customer Matched Result Banner */}
        {effectiveStatus === 'CUSTOMER_MATCHED' && activeCustomer && (
          <div className="relative z-20 flex flex-col items-center p-3 text-center space-y-2 bg-stone-900/85 rounded-xl border border-emerald-500/50 backdrop-blur-sm max-w-xs shadow-lg">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-emerald-300">{activeCustomer.fullName}</p>
              <p className="text-xs text-stone-300 font-mono">
                Code: {activeCustomer.customerCode} • Confidence: {isCameraActive ? cameraConfidence : faceState.confidenceScore}%
              </p>
              <p className="text-[11px] text-stone-400">
                Dairy: {activeCustomer.dairyId?.substring(0, 8)}... • Milk: {activeCustomer.preferredCategory}
              </p>
            </div>
          </div>
        )}

        {/* Unknown Person Alert */}
        {effectiveStatus === 'UNKNOWN_PERSON' && (
          <div className="relative z-20 flex flex-col items-center p-3 text-center space-y-2 bg-stone-900/85 rounded-xl border border-rose-500/50 backdrop-blur-sm max-w-xs shadow-lg">
            <div className="w-12 h-12 rounded-full bg-rose-500/20 border-2 border-rose-400 flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-rose-300">Unrecognized Face</p>
              <p className="text-xs text-stone-300">
                Face is not registered or approved for this dairy. Use manual lookup or RFID.
              </p>
            </div>
          </div>
        )}

        {/* RFID Matched Display */}
        {rfidState.status === 'MATCHED' && rfidState.matchedCustomer && (
          <div className="relative z-20 flex flex-col items-center p-3 text-center space-y-2 bg-stone-900/85 rounded-xl border border-orange-500/50 backdrop-blur-sm max-w-xs">
            <div className="w-12 h-12 rounded-full bg-orange-500/20 border-2 border-primary-orange flex items-center justify-center text-primary-orange">
              <Radio className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-orange-200">
                {rfidState.matchedCustomer.fullName}
              </p>
              <p className="text-xs text-stone-300 font-mono">
                RFID Card: {rfidState.cardUid} • Code: {rfidState.matchedCustomer.customerCode}
              </p>
            </div>
          </div>
        )}

        {/* Stream latency telemetry pill */}
        <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 text-[10px] text-stone-300 font-mono border border-stone-700 z-20">
          Status: {isCameraActive ? 'LIVE CAM' : 'STANDBY'} • Latency: {isCameraActive ? cameraLatency : faceState.latencyMs}ms • SFace: INT8 (128-D)
        </div>
      </div>

      {/* Hardware Simulation & Manual Controls */}
      <div className="mt-3 space-y-2">
        <p className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">
          Identification Controls:
        </p>
        <div className="grid grid-cols-2 gap-2">
          <ClayButton
            variant="secondary"
            size="sm"
            onClick={() => handleSimulateFace('C-101')}
            disabled={isSimulating}
            className="flex items-center justify-center space-x-1.5"
          >
            <Camera className="w-3.5 h-3.5 text-primary-orange" />
            <span>Scan Face (C-101)</span>
          </ClayButton>

          <ClayButton
            variant="secondary"
            size="sm"
            onClick={() => handleSimulateFace('C-102')}
            disabled={isSimulating}
            className="flex items-center justify-center space-x-1.5"
          >
            <Camera className="w-3.5 h-3.5 text-primary-orange" />
            <span>Scan Face (C-102)</span>
          </ClayButton>

          <ClayButton
            variant="outline"
            size="sm"
            onClick={() => handleSimulateRfid('RFID-94A2B81C')}
            disabled={isSimulating}
            className="flex items-center justify-center space-x-1.5"
          >
            <RfidWaveVisual size={16} />
            <span>Tap RFID (Patil)</span>
          </ClayButton>

          <ClayButton
            variant="outline"
            size="sm"
            onClick={onOpenManualSearch}
            className="flex items-center justify-center space-x-1.5"
          >
            <Search className="w-3.5 h-3.5 text-primary-orange" />
            <span>Manual Search (F2)</span>
          </ClayButton>
        </div>

        {/* Reset / Clear Button */}
        {(effectiveStatus !== 'WAITING_FOR_FACE' || rfidState.status !== 'IDLE' || activeCustomer) && (
          <div className="pt-1 flex justify-end">
            <ClayButton
              variant="ghost"
              size="sm"
              onClick={handleResetAll}
              className="text-text-muted hover:text-text-primary text-xs"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Reset Identifier
            </ClayButton>
          </div>
        )}
      </div>
    </ClayCard>
  )
}
