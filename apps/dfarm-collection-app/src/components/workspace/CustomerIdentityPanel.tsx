import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useHardware } from '@/context/HardwareContext'
import { useAuth } from '@/context/AuthContext'
import { ClayCard, ClayButton, ClayBadge } from '@/components/ui'
import { FaceScannerReticle, RfidWaveVisual } from '@/assets/illustrations'
import {
  Camera,
  Radio,
  Search,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Video,
  VideoOff,
  UserCheck,
  CornerDownLeft,
} from 'lucide-react'
import type { CustomerIdentity } from '@/types'
import { useCamera } from '@/hooks/useCamera'
import { getStoredOperatorAuth, customersApi } from '@/api/client'
import { voiceAnnouncer } from '@/drivers'

interface CustomerIdentityPanelProps {
  onCustomerSelected: (customer: CustomerIdentity, method?: string) => void
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
    resetFaceState,
    simulateRfidScan,
    resetRfidState,
    updateFaceState,
    refreshCustomersAndTemplates,
    isRecognitionLocked,
    handleFacePresence,
    startCollectionAttempt,
    collectionWorkflowState,
    cancelCollectionAttempt,
  } = useHardware()

  const [searchInput, setSearchInput] = useState('')
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchResults, setSearchResults] = useState<CustomerIdentity[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isSimulating, setIsSimulating] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const { dairyId: authDairyId } = useAuth()
  const { dairyId: storedDairyId } = getStoredOperatorAuth()
  const activeDairyId = authDairyId || storedDairyId || '00000000-0000-0000-0000-000000000001'

  // Dynamic refresh of customers & face templates when dairy context is established
  useEffect(() => {
    if (activeDairyId) {
      refreshCustomersAndTemplates(activeDairyId)
    }
  }, [activeDairyId, refreshCustomersAndTemplates])

  // FIX: Stable callbacks to prevent useCamera frame-loop restarts on each render.
  const handleCustomerMatchedCamera = useCallback(
    (customer: CustomerIdentity) => {
      const res = startCollectionAttempt(customer, 'FACE_YUNET_SFACE')
      if (res.success) {
        onCustomerSelected(customer, 'FACE_RECOGNITION')
      }
    },
    [startCollectionAttempt, onCustomerSelected]
  )

  const handleFaceStateChange = useCallback(
    (state: Partial<import('@/types').FaceRecognitionState>) => {
      updateFaceState(state)
    },
    [updateFaceState]
  )

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
    retryCamera,
    resetMatch: resetCameraMatch,
  } = useCamera({
    activeDairyId,
    enrolledTemplates,
    customersMap,
    onCustomerMatched: handleCustomerMatchedCamera,
    onFaceStateChange: handleFaceStateChange,
    isRecognitionLocked,
    onFacePresence: handleFacePresence,
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

  // Direct Farmer Keyboard Lookup (Farmer Code, Mobile Number, or Barcode)
  const handleFarmerLookup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const query = searchInput.trim()
    if (!query) return

    setIsSearching(true)
    setSearchError(null)
    setSearchResults([])

    try {
      // 1. Direct in-memory map lookup (Instant O(1))
      const directMatch =
        customersMap.get(query) ||
        customersMap.get(query.toUpperCase()) ||
        customersMap.get(query.toLowerCase())

      if (directMatch) {
        const res = startCollectionAttempt(directMatch, 'MANUAL_SEARCH')
        if (res.success) {
          onCustomerSelected(directMatch, 'DIRECT_CODE_ENTRY')
          setSearchInput('')
          setSearchResults([])
          setSearchError(null)
        } else {
          setSearchError(res.error || 'Cannot start collection')
        }
        return
      }

      // 2. Query customer directory with search string
      const list = await customersApi.list({ search: query, organizationId: activeDairyId || undefined })
      if (!list || list.length === 0) {
        setSearchError(`No patron found matching "${query}". Press F2 for directory.`)
        return
      }

      if (list.length === 1) {
        const res = startCollectionAttempt(list[0], 'MANUAL_SEARCH')
        if (res.success) {
          onCustomerSelected(list[0], 'DIRECT_CODE_ENTRY')
          setSearchInput('')
          setSearchResults([])
          setSearchError(null)
        } else {
          setSearchError(res.error || 'Cannot start collection')
        }
      } else {
        // Multiple matches: show interactive selection pills
        setSearchResults(list)
      }
    } catch (err: any) {
      setSearchError(err.message || 'Lookup failed. Please verify connection.')
    } finally {
      setIsSearching(false)
    }
  }

  const handleSelectSearchResult = (cust: CustomerIdentity) => {
    const res = startCollectionAttempt(cust, 'MANUAL_SEARCH')
    if (res.success) {
      onCustomerSelected(cust, 'MANUAL_SEARCH')
      setSearchInput('')
      setSearchResults([])
      setSearchError(null)
    } else {
      setSearchError(res.error || 'Cannot start collection')
    }
  }

  const handleSimulateRfid = async (uid: string) => {
    setIsSimulating(true)
    const matched = await simulateRfidScan(uid)
    setIsSimulating(false)
    if (matched) {
      onCustomerSelected(matched, 'RFID_CARD')
    }
  }

  const handleResetAll = () => {
    cancelCollectionAttempt('Manual reset')
    resetCameraMatch()
    resetFaceState()
    resetRfidState()
    setSearchInput('')
    setSearchError(null)
    setSearchResults([])
  }

  const activeCustomer = cameraCustomer || faceState.matchedCustomer || rfidState.matchedCustomer
  const effectiveStatus =
    collectionWorkflowState !== 'IDLE' && collectionWorkflowState !== 'SCANNING'
      ? collectionWorkflowState
      : isCameraActive
      ? cameraStatus
      : faceState.status

  return (
    <ClayCard className="flex flex-col h-full overflow-hidden p-3 md:p-4 bg-cream">
      {/* Header with reticle, title, and Camera Start/Stop Toggle */}
      <div className="flex items-center justify-between pb-2.5 border-b border-border-subtle">
        <div className="flex items-center space-x-2">
          <FaceScannerReticle size={22} />
          <div>
            <h2 className="text-sm font-bold text-text-primary leading-tight">
              Farmer Identification
            </h2>
            <p className="text-[10px] text-text-muted">YuNet + SFace INT8 • RFID Wedge • Code Input</p>
          </div>
        </div>

        <div className="flex items-center space-x-1.5">
          {/* Camera Start / Stop Toggle */}
          <ClayButton
            variant={isCameraActive ? 'danger' : 'secondary'}
            size="sm"
            onClick={isCameraActive ? stopCamera : startCamera}
            className="flex items-center space-x-1 text-xs py-1 px-2"
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

      {/* Prominent Fast Farmer Code / Mobile Input Bar */}
      <div className="mt-2.5">
        <form onSubmit={handleFarmerLookup} className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <input
              id="farmer-code-input"
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleFarmerLookup()
                }
              }}
              placeholder="Enter Farmer Code (e.g. C-101), Mobile, or RFID & [Enter]..."
              className="w-full bg-cream-dark border-2 border-border-subtle focus:border-primary-orange rounded-xl px-3 py-2 text-xs font-semibold text-text-primary placeholder:text-text-muted focus:outline-none transition-colors shadow-inner"
              autoFocus
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary text-xs"
              >
                ✕
              </button>
            )}
          </div>

          <ClayButton
            type="submit"
            variant="primary"
            size="sm"
            disabled={isSearching || !searchInput.trim()}
            className="shrink-0 px-3 py-2 text-xs flex items-center space-x-1"
          >
            {isSearching ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CornerDownLeft className="w-3.5 h-3.5" />
            )}
            <span>Lookup</span>
          </ClayButton>
        </form>

        {/* Inline Search Error Banner */}
        {searchError && (
          <div className="mt-1.5 p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
            <span className="flex items-center space-x-1">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mr-1" />
              <span>{searchError}</span>
            </span>
            <button
              onClick={() => setSearchError(null)}
              className="text-xs text-rose-600 font-bold hover:underline shrink-0 ml-2"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Multiple Matches Resolution List */}
        {searchResults.length > 0 && (
          <div className="mt-2 p-2 bg-peach/40 border border-primary-orange/30 rounded-xl space-y-1.5">
            <p className="text-[11px] font-bold text-text-secondary">
              Multiple matches found ({searchResults.length}) — click to select:
            </p>
            <div className="max-h-28 overflow-y-auto space-y-1">
              {searchResults.map((cust) => (
                <div
                  key={cust.id}
                  onClick={() => handleSelectSearchResult(cust)}
                  className="px-2 py-1 bg-cream rounded-lg border border-border-subtle hover:border-primary-orange flex items-center justify-between text-xs cursor-pointer hover:bg-peach/30 transition-colors"
                >
                  <span className="font-semibold text-text-primary">
                    {cust.fullName}{' '}
                    <span className="text-[11px] font-mono text-primary-orange">
                      ({cust.customerCode})
                    </span>
                  </span>
                  <span className="text-[10px] text-text-muted">{cust.village}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Scanner Viewport Area (Compact 190px height for optimal screen fit) */}
      <div className="mt-2.5 relative h-[190px] bg-stone-900 rounded-2xl overflow-hidden flex flex-col items-center justify-center border-2 border-stone-800 shadow-inner shrink-0">
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
                backgroundSize: '20px 20px',
              }}
            />
          </>
        )}

        {/* Camera Permission / Error Alert */}
        {cameraError && (
          <div className="relative z-20 flex flex-col items-center p-3 text-center space-y-1.5 max-w-sm">
            <div className="w-10 h-10 rounded-full bg-rose-500/20 border-2 border-rose-400 flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-rose-300">Camera Warning</p>
            <p className="text-[11px] text-stone-300 leading-tight">{cameraError}</p>
            <ClayButton variant="secondary" size="sm" onClick={retryCamera} className="text-xs mt-1">
              Retry Camera
            </ClayButton>
          </div>
        )}

        {/* Waiting For Face State */}
        {!cameraError &&
          (effectiveStatus === 'WAITING_FOR_FACE' ||
            (!isCameraActive && faceState.status === 'WAITING_FOR_FACE')) && (
            <div className="relative z-10 flex flex-col items-center space-y-2 p-3 text-center">
              <div className="w-14 h-14 rounded-full border-2 border-dashed border-primary-orange/60 flex items-center justify-center animate-pulse">
                <Camera className="w-6 h-6 text-primary-orange/80" />
              </div>
              <p className="text-xs text-stone-200 font-medium tracking-wide">
                {isCameraActive ? 'Align face in camera or tap RFID card' : 'Camera ready or tap RFID card'}
              </p>
              <span className="text-[10px] text-stone-400 font-mono">
                YuNet 60fps • SFace INT8 (128-D)
              </span>
            </div>
          )}

        {/* Matching In Progress State */}
        {(effectiveStatus === 'MATCHING_CUSTOMER' || faceState.status === 'EMBEDDING_GENERATED') && (
          <div className="relative z-20 flex flex-col items-center space-y-2 bg-stone-900/80 p-2.5 rounded-xl border border-cyan-500/40">
            <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-cyan-300 font-mono">Matching Dairy Biometric Vector...</p>
          </div>
        )}

        {/* Customer Matched Result Banner */}
        {effectiveStatus === 'CUSTOMER_MATCHED' && activeCustomer && (
          <div className="relative z-20 flex flex-col items-center p-2.5 text-center space-y-1.5 bg-stone-900/85 rounded-xl border border-emerald-500/50 backdrop-blur-sm max-w-xs shadow-lg">
            <div className="w-9 h-9 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-emerald-300">{activeCustomer.fullName}</p>
              <p className="text-[11px] text-stone-300 font-mono">
                Code: {activeCustomer.customerCode} • {isCameraActive ? cameraConfidence : faceState.confidenceScore}% Match
              </p>
            </div>
          </div>
        )}

        {/* Unknown Person Alert */}
        {effectiveStatus === 'UNKNOWN_PERSON' && (
          <div className="relative z-20 flex flex-col items-center p-2.5 text-center space-y-1.5 bg-stone-900/85 rounded-xl border border-rose-500/50 backdrop-blur-sm max-w-xs shadow-lg">
            <div className="w-9 h-9 rounded-full bg-rose-500/20 border-2 border-rose-400 flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-rose-300">Unrecognized Face</p>
              <p className="text-[10px] text-stone-300">Face not enrolled for this dairy. Use code or RFID.</p>
            </div>
          </div>
        )}

        {/* RFID Matched Display */}
        {rfidState.status === 'MATCHED' && rfidState.matchedCustomer && (
          <div className="relative z-20 flex flex-col items-center p-2.5 text-center space-y-1.5 bg-stone-900/85 rounded-xl border border-orange-500/50 backdrop-blur-sm max-w-xs">
            <div className="w-9 h-9 rounded-full bg-orange-500/20 border-2 border-primary-orange flex items-center justify-center text-primary-orange">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-orange-200">{rfidState.matchedCustomer.fullName}</p>
              <p className="text-[10px] text-stone-300 font-mono">
                Card: {rfidState.cardUid} • Code: {rfidState.matchedCustomer.customerCode}
              </p>
            </div>
          </div>
        )}

        {/* Stream latency telemetry pill */}
        <div className="absolute bottom-1.5 left-2 px-2 py-0.5 rounded bg-black/70 text-[10px] text-stone-300 font-mono border border-stone-700 z-20">
          {isCameraActive ? 'LIVE CAM' : 'STANDBY'} • Latency: {isCameraActive ? cameraLatency : faceState.latencyMs}ms
        </div>
      </div>

      {/* Quick Test Identification Controls */}
      <div className="mt-2.5 space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-bold text-text-secondary uppercase tracking-wider">
          <span>Quick Identification:</span>
          {(effectiveStatus !== 'WAITING_FOR_FACE' || rfidState.status !== 'IDLE' || activeCustomer) && (
            <button
              onClick={handleResetAll}
              className="text-text-muted hover:text-text-primary text-[10px] flex items-center"
            >
              <RefreshCw className="w-2.5 h-2.5 mr-1" />
              Reset
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <ClayButton
            variant="outline"
            size="sm"
            onClick={() => handleSimulateRfid('RFID-94A2B81C')}
            disabled={isSimulating}
            className="flex items-center justify-center space-x-1 text-xs py-1"
          >
            <RfidWaveVisual size={14} />
            <span>RFID (Patil)</span>
          </ClayButton>

          <ClayButton
            variant="outline"
            size="sm"
            onClick={onOpenManualSearch}
            className="flex items-center justify-center space-x-1 text-xs py-1"
          >
            <Search className="w-3 h-3 text-primary-orange" />
            <span>Directory (F2)</span>
          </ClayButton>
        </div>
      </div>
    </ClayCard>
  )
}
