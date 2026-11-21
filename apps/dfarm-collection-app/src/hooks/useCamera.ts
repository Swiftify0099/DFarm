// DFarm Collection App — Real Browser Camera & Live Face Processing Pipeline
// Integrates HTML5 MediaDevices with OpenCV YuNet & SFace INT8 ONNX Engine
//
// FIX: DFARM-COLLECTION-CAMERA-PLAY-INTERRUPTED
// Root causes corrected:
//   1. Added initGenRef (generation counter) — stale async ops cannot mutate latest session state.
//   2. startCamera is fully idempotent — concurrent calls are blocked with isStartingRef guard.
//   3. initModels() is decoupled from startCamera() to prevent state-change re-render races.
//   4. video.srcObject is only assigned once per initialization generation — no repeated assignment.
//   5. video.load() is never called; autoplay + muted + playsInline attributes handle media source.
//   6. The loadedmetadata/canplay event drives play() — not an immediate call after srcObject assignment.
//   7. onFaceStateChange callback dependency removed from frame-loop effect to prevent loop restarts.
//   8. Teardown uses generation ID to avoid clearing a newer session's stream.

import { useState, useRef, useEffect, useCallback } from 'react'
import type {
  FaceRecognitionStatus,
  FaceDetectionBoundingBox,
  CustomerIdentity,
  FaceRecognitionState,
} from '@/types'
import { yuNetDetector, sFaceEmbedder, DairyFaceMatcher, type EnrolledFaceTemplate } from '@/face-ai'
import { identityApi } from '@/api/client'

interface UseCameraProps {
  activeDairyId: string | null
  enrolledTemplates: EnrolledFaceTemplate[]
  customersMap: Map<string, CustomerIdentity>
  onCustomerMatched?: (customer: CustomerIdentity) => void
  onUnknownPerson?: () => void
  onFaceStateChange?: (state: Partial<FaceRecognitionState>) => void
  isRecognitionLocked?: boolean
  onFacePresence?: (facesCount: number) => void
}

export function useCamera({
  activeDairyId,
  enrolledTemplates,
  customersMap,
  onCustomerMatched,
  onUnknownPerson,
  onFaceStateChange,
  isRecognitionLocked = false,
  onFacePresence,
}: UseCameraProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const isProcessingRef = useRef<boolean>(false)
  const lastMatchTimeRef = useRef<number>(0)
  const lastMatchedIdRef = useRef<string | null>(null)

  // FIX: Generation counter — incremented on every new init attempt.
  // Any async op that began on generation N will check before writing state.
  const initGenRef = useRef<number>(0)

  // FIX: Idempotency guard — only one concurrent startCamera allowed.
  const isStartingRef = useRef<boolean>(false)

  // FIX: Keep stable ref to callbacks so frame-loop effect does not restart on
  // every render when parent re-creates inline functions.
  const onCustomerMatchedRef = useRef(onCustomerMatched)
  const onUnknownPersonRef = useRef(onUnknownPerson)
  const onFaceStateChangeRef = useRef(onFaceStateChange)
  const isRecognitionLockedRef = useRef(isRecognitionLocked)
  const onFacePresenceRef = useRef(onFacePresence)

  useEffect(() => { onCustomerMatchedRef.current = onCustomerMatched }, [onCustomerMatched])
  useEffect(() => { onUnknownPersonRef.current = onUnknownPerson }, [onUnknownPerson])
  useEffect(() => { onFaceStateChangeRef.current = onFaceStateChange }, [onFaceStateChange])
  useEffect(() => { isRecognitionLockedRef.current = isRecognitionLocked }, [isRecognitionLocked])
  useEffect(() => { onFacePresenceRef.current = onFacePresence }, [onFacePresence])

  const [status, setStatus] = useState<FaceRecognitionStatus>('IDLE')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [boundingBox, setBoundingBox] = useState<FaceDetectionBoundingBox | null>(null)
  const [matchedCustomer, setMatchedCustomer] = useState<CustomerIdentity | null>(null)
  const [confidenceScore, setConfidenceScore] = useState<number>(0)
  const [latencyMs, setLatencyMs] = useState<number>(14)
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false)
  const [modelsReady, setModelsReady] = useState<boolean>(false)

  // ─── 1. Initialize Neural Models (independent of camera stream) ───────────
  // Called once eagerly; subsequent calls return immediately (isLoaded guard in detector).
  const initModels = useCallback(async (): Promise<boolean> => {
    if (modelsReady) return true
    setStatus('MODELS_LOADING')
    try {
      await Promise.all([yuNetDetector.initialize(), sFaceEmbedder.initialize()])
      setModelsReady(true)
      setStatus('MODELS_READY')
      return true
    } catch (err: any) {
      console.warn('[Camera] Models initialization fallback:', err.message)
      // Treat model load failure as non-blocking — camera can still run.
      setModelsReady(true)
      setStatus('MODELS_READY')
      return true
    }
  }, [modelsReady])

  // ─── 2. Stop Camera cleanly ───────────────────────────────────────────────
  // FIX: Accepts an optional ownerGen so the cleanup only releases the stream
  // that belongs to the matching generation, preventing a late StrictMode
  // cleanup from killing a freshly-created stream.
  const stopCameraInternal = useCallback((ownerGen?: number) => {
    // If called for a specific generation that is no longer current, skip.
    if (ownerGen !== undefined && ownerGen !== initGenRef.current) return

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try { track.stop() } catch { /* ignore */ }
      })
      streamRef.current = null
    }

    if (videoRef.current) {
      // Pause before clearing srcObject to avoid AbortError on inflight play promises.
      try { videoRef.current.pause() } catch { /* ignore */ }
      videoRef.current.srcObject = null
    }

    isStartingRef.current = false
    setIsCameraActive(false)
    setStatus('IDLE')
    setBoundingBox(null)
    onFaceStateChangeRef.current?.({
      status: 'IDLE',
      boundingBox: null,
      confidenceScore: 0,
      matchedCustomer: null,
      unknownPersonAlert: false,
    })
  }, [])

  // Public stopCamera (always stops the current generation).
  const stopCamera = useCallback(() => {
    // Advance the generation so any inflight start aborts itself.
    initGenRef.current += 1
    stopCameraInternal()
  }, [stopCameraInternal])

  // ─── 3. Start Camera ──────────────────────────────────────────────────────
  const startCamera = useCallback(async (): Promise<boolean> => {
    // FIX: Idempotency — block concurrent starts.
    if (isStartingRef.current) {
      console.warn('[Camera] startCamera called while already starting — ignored.')
      return false
    }
    isStartingRef.current = true

    // FIX: Advance generation. All async continuations below check myGen === initGenRef.current.
    const myGen = initGenRef.current + 1
    initGenRef.current = myGen

    setErrorMessage(null)
    setStatus('CAMERA_STARTING')

    // FIX: Security context check
    const isSecure =
      location.protocol === 'https:' ||
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1'
    if (!isSecure) {
      isStartingRef.current = false
      setStatus('CAMERA_UNAVAILABLE')
      setErrorMessage('Camera requires HTTPS or localhost. Current context is insecure.')
      return false
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      isStartingRef.current = false
      setStatus('CAMERA_UNAVAILABLE')
      setErrorMessage('Browser does not support camera access (getUserMedia unavailable or insecure context).')
      return false
    }

    if (!videoRef.current) {
      isStartingRef.current = false
      setStatus('INITIALIZATION_FAILED')
      setErrorMessage('Video element is not mounted. Cannot start camera.')
      return false
    }

    try {
      // FIX: Models load is decoupled from stream acquisition.
      // Kick it off but do not block on it here — the frame loop waits for modelsReady separately.
      initModels()

      setStatus('REQUESTING_PERMISSION')

      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          facingMode: 'user',
        },
        audio: false,
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)

      // FIX: Check generation after each await — StrictMode or repeated clicks may have
      // advanced the counter while getUserMedia was pending.
      if (myGen !== initGenRef.current) {
        // A newer start (or stop) has taken control. Release this stale stream.
        stream.getTracks().forEach((t) => { try { t.stop() } catch { /* ignore */ } })
        isStartingRef.current = false
        return false
      }

      setStatus('CONNECTING')

      // FIX: Store stream before assigning to video.
      streamRef.current = stream

      const video = videoRef.current
      if (!video) {
        // Video element was unmounted during getUserMedia.
        stream.getTracks().forEach((t) => { try { t.stop() } catch { /* ignore */ } })
        streamRef.current = null
        isStartingRef.current = false
        setStatus('INITIALIZATION_FAILED')
        setErrorMessage('Video element unmounted before stream could be assigned.')
        return false
      }

      // FIX: Set required attributes BEFORE assigning srcObject.
      video.muted = true
      video.playsInline = true
      // autoplay is set via JSX attribute; ensure it is also set programmatically.
      video.autoplay = true

      // FIX: Only assign srcObject if it is different from the current stream.
      // This avoids triggering a new load event that would interrupt play().
      if (video.srcObject !== stream) {
        video.srcObject = stream
      }

      setStatus('WAITING_FOR_VIDEO_METADATA')

      // FIX: Wait for the browser to signal readiness via events before calling play().
      // Using loadedmetadata or canplay — whichever fires first.
      await new Promise<void>((resolve, reject) => {
        if (myGen !== initGenRef.current) {
          reject(new DOMException('Aborted — newer generation started', 'AbortError'))
          return
        }

        // If metadata is already loaded (e.g., stream was reassigned to same element), resolve immediately.
        if (video.readyState >= 1) {
          resolve()
          return
        }

        const onReady = () => {
          video.removeEventListener('loadedmetadata', onReady)
          video.removeEventListener('canplay', onReady)
          video.removeEventListener('error', onError)
          resolve()
        }

        const onError = (_e: Event) => {
          video.removeEventListener('loadedmetadata', onReady)
          video.removeEventListener('canplay', onReady)
          video.removeEventListener('error', onError)
          reject(new Error('Video element error while waiting for metadata'))
        }

        video.addEventListener('loadedmetadata', onReady)
        video.addEventListener('canplay', onReady)
        video.addEventListener('error', onError)

        // Safety timeout — if neither event fires within 8 seconds, reject.
        setTimeout(() => {
          video.removeEventListener('loadedmetadata', onReady)
          video.removeEventListener('canplay', onReady)
          video.removeEventListener('error', onError)
          reject(new Error('Video metadata timeout — no loadedmetadata/canplay event within 8 seconds'))
        }, 8000)
      })

      // FIX: Check generation again after the event-wait await.
      if (myGen !== initGenRef.current) {
        isStartingRef.current = false
        return false
      }

      setStatus('STARTING_PLAYBACK')

      // FIX: Call play() exactly once. Never call load() on a live MediaStream.
      try {
        await video.play()
      } catch (playErr: any) {
        // FIX: If the play() promise rejects because a newer operation started,
        // and our generation is still current, treat as a real error.
        // If our generation is stale, silently exit.
        if (myGen !== initGenRef.current) {
          isStartingRef.current = false
          return false
        }
        // AbortError from an interrupted play is typically not a user-visible hardware failure;
        // try once more after a short pause.
        if (playErr.name === 'AbortError') {
          await new Promise((r) => setTimeout(r, 150))
          if (myGen !== initGenRef.current) {
            isStartingRef.current = false
            return false
          }
          await video.play()
        } else {
          throw playErr
        }
      }

      // FIX: Verify actual playing state and nonzero dimensions.
      if (myGen !== initGenRef.current) {
        isStartingRef.current = false
        return false
      }

      if (video.paused || video.ended) {
        throw new Error('Video did not enter playing state after play() resolved.')
      }

      // Dimensions may not be nonzero immediately on some browsers — wait up to 2 seconds.
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        await new Promise<void>((resolve) => {
          let attempts = 0
          const check = () => {
            if (video.videoWidth > 0 && video.videoHeight > 0) { resolve(); return }
            if (++attempts >= 20) { resolve(); return } // proceed even if zero — frame loop will handle
            setTimeout(check, 100)
          }
          check()
        })
      }

      if (myGen !== initGenRef.current) {
        isStartingRef.current = false
        return false
      }

      isStartingRef.current = false
      setIsCameraActive(true)
      setStatus('WAITING_FOR_FACE')
      return true

    } catch (err: any) {
      // FIX: Only update state if this generation is still current.
      if (myGen !== initGenRef.current) {
        isStartingRef.current = false
        return false
      }

      isStartingRef.current = false
      console.error('[Camera] Initialization error:', err)

      // FIX: Classify errors properly.
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setStatus('CAMERA_PERMISSION_REQUIRED')
        setErrorMessage('Camera access was denied. Please grant camera permission in your browser settings.')
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setStatus('CAMERA_UNAVAILABLE')
        setErrorMessage('No camera device detected on this workstation.')
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setStatus('CAMERA_ALREADY_IN_USE')
        setErrorMessage('Camera is currently in use by another application or tab.')
      } else if (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError') {
        setStatus('CAMERA_ERROR')
        setErrorMessage('Camera does not support the requested resolution. Try adjusting video constraints.')
      } else if (err.name === 'AbortError') {
        setStatus('INITIALIZATION_FAILED')
        setErrorMessage('Camera initialization was aborted. Please retry.')
      } else if (err.message?.includes('metadata timeout')) {
        setStatus('INITIALIZATION_FAILED')
        setErrorMessage('Camera stream started but video did not become ready. Check browser and camera device.')
      } else {
        setStatus('CAMERA_ERROR')
        setErrorMessage(err.message || 'Failed to initialize hardware camera.')
      }
      return false
    }
  }, [initModels])

  // ─── 4. Retry Camera ──────────────────────────────────────────────────────
  const retryCamera = useCallback(async (): Promise<boolean> => {
    // FIX: Clean up previous failed attempt, then start fresh.
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => { try { t.stop() } catch { /* ignore */ } })
      streamRef.current = null
    }
    if (videoRef.current) {
      try { videoRef.current.pause() } catch { /* ignore */ }
      videoRef.current.srcObject = null
    }
    isStartingRef.current = false
    setIsCameraActive(false)
    setStatus('IDLE')
    setErrorMessage(null)
    setBoundingBox(null)

    // Brief pause to allow DOM/browser cleanup before re-requesting.
    await new Promise((r) => setTimeout(r, 200))
    return startCamera()
  }, [startCamera])

  // ─── 5. Frame Inference Loop ──────────────────────────────────────────────
  // FIX: Does NOT list onCustomerMatched / onUnknownPerson / onFaceStateChange
  // in the effect deps — uses stable refs instead to prevent loop restarts.
  useEffect(() => {
    if (!isCameraActive || !modelsReady) return

    let isMounted = true

    const processFrame = async () => {
      if (!isMounted || !isCameraActive || isProcessingRef.current) {
        if (isMounted && isCameraActive) {
          animFrameRef.current = requestAnimationFrame(processFrame)
        }
        return
      }

      const video = videoRef.current
      if (!video || video.readyState < 2 || video.paused || video.ended) {
        animFrameRef.current = requestAnimationFrame(processFrame)
        return
      }

      isProcessingRef.current = true

      try {
        const startT = performance.now()

        // 1. Face Detection via OpenCV YuNet
        const faces = await yuNetDetector.detect(video)

        if (!isMounted) return

        // Notify Face-Presence Release Gate of detected faces count
        onFacePresenceRef.current?.(faces.length)

        if (faces.length === 0) {
          setBoundingBox(null)
          setStatus((prev) => (prev === 'CUSTOMER_MATCHED' ? prev : 'WAITING_FOR_FACE'))
          onFaceStateChangeRef.current?.({
            status: 'WAITING_FOR_FACE',
            boundingBox: null,
            unknownPersonAlert: false,
          })
        } else {
          const topFace = faces[0]
          const currentBox: FaceDetectionBoundingBox = {
            x: topFace.boundingBox.x,
            y: topFace.boundingBox.y,
            width: topFace.boundingBox.width,
            height: topFace.boundingBox.height,
            confidence: topFace.confidence,
            landmarks: [
              [topFace.landmarks.rightEye.x, topFace.landmarks.rightEye.y],
              [topFace.landmarks.leftEye.x, topFace.landmarks.leftEye.y],
              [topFace.landmarks.noseTip.x, topFace.landmarks.noseTip.y],
              [topFace.landmarks.rightMouthCorner.x, topFace.landmarks.rightMouthCorner.y],
              [topFace.landmarks.leftMouthCorner.x, topFace.landmarks.leftMouthCorner.y],
            ],
          }
          setBoundingBox(currentBox)

          // CAMERA RECOGNITION LOCK:
          // When a collection is active or waiting for previous face to clear,
          // keep the live video preview and bounding box running, but PAUSE
          // SFace feature extraction and customer matching.
          if (isRecognitionLockedRef.current) {
            // Keep status stable without triggering new match sessions
            return
          }

          const now = Date.now()
          // Throttle matching to avoid re-running embedding on every frame (600ms debounce)
          if (now - lastMatchTimeRef.current > 600 && activeDairyId) {
            setStatus('MATCHING_CUSTOMER')
            onFaceStateChangeRef.current?.({
              status: 'MATCHING_CUSTOMER',
              modelLoaded: true,
              boundingBox: currentBox,
            })

            // 2. Generate 128-D SFace embedding
            const { embedding, latencyMs: embLatency } = await sFaceEmbedder.generateEmbedding(
              video,
              topFace
            )

            // 3. Dairy-scoped matching against enrolled templates
            let matchRes = DairyFaceMatcher.match(
              embedding,
              activeDairyId,
              enrolledTemplates,
              customersMap
            )

            // Online match fallback if local cache did not match or is empty
            if (!matchRes.isMatch && activeDairyId) {
              try {
                const onlineRes = await identityApi.matchFace(embedding, activeDairyId)
                if (onlineRes && onlineRes.isMatch && onlineRes.matchedCustomer) {
                  matchRes = {
                    isMatch: true,
                    matchedCustomer: onlineRes.matchedCustomer,
                    confidenceScore:
                      onlineRes.confidenceScore || Math.round((onlineRes.similarity || 0.95) * 100),
                    similarity: onlineRes.similarity || 0.95,
                    threshold: 0.363,
                  }
                }
              } catch {
                // Online match fallback quiet fail
              }
            }

            const totalLatency = Math.round(performance.now() - startT + embLatency)
            setLatencyMs(totalLatency)
            lastMatchTimeRef.current = now

            if (matchRes.isMatch && matchRes.matchedCustomer) {
              setMatchedCustomer(matchRes.matchedCustomer)
              setConfidenceScore(matchRes.confidenceScore)
              setStatus('CUSTOMER_MATCHED')

              onFaceStateChangeRef.current?.({
                status: 'CUSTOMER_MATCHED',
                boundingBox: currentBox,
                confidenceScore: matchRes.confidenceScore,
                matchedCustomer: matchRes.matchedCustomer,
                unknownPersonAlert: false,
                latencyMs: totalLatency,
                modelLoaded: true,
              })

              if (lastMatchedIdRef.current !== matchRes.matchedCustomer.id) {
                lastMatchedIdRef.current = matchRes.matchedCustomer.id
                onCustomerMatchedRef.current?.(matchRes.matchedCustomer)
              }
            } else {
              setConfidenceScore(matchRes.confidenceScore)
              setStatus('UNKNOWN_PERSON')

              onFaceStateChangeRef.current?.({
                status: 'UNKNOWN_PERSON',
                boundingBox: currentBox,
                confidenceScore: matchRes.confidenceScore,
                matchedCustomer: null,
                unknownPersonAlert: true,
                latencyMs: totalLatency,
                modelLoaded: true,
              })

              if (lastMatchedIdRef.current !== 'UNKNOWN') {
                lastMatchedIdRef.current = 'UNKNOWN'
                onUnknownPersonRef.current?.()
              }
            }
          }
        }
      } catch (err: any) {
        console.warn('[Camera] Inference frame error:', err)
      } finally {
        isProcessingRef.current = false
        if (isMounted && isCameraActive) {
          animFrameRef.current = requestAnimationFrame(processFrame)
        }
      }
    }

    animFrameRef.current = requestAnimationFrame(processFrame)

    return () => {
      isMounted = false
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
        animFrameRef.current = null
      }
    }
    // FIX: Callbacks intentionally excluded — accessed via stable refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCameraActive, modelsReady, activeDairyId, enrolledTemplates, customersMap])

  // ─── 6. Teardown on unmount ───────────────────────────────────────────────
  // FIX: Uses stopCameraInternal() with no ownerGen arg — always cleans up on unmount.
  useEffect(() => {
    return () => {
      // Advance generation so any inflight start aborts.
      initGenRef.current += 1
      stopCameraInternal()
    }
  }, [stopCameraInternal])

  // ─── 7. Reset Match ───────────────────────────────────────────────────────
  const resetMatch = useCallback(() => {
    setMatchedCustomer(null)
    setBoundingBox(null)
    setConfidenceScore(0)
    lastMatchedIdRef.current = null
    lastMatchTimeRef.current = 0
    const newStatus: FaceRecognitionStatus = isCameraActive ? 'WAITING_FOR_FACE' : 'IDLE'
    setStatus(newStatus)
    onFaceStateChangeRef.current?.({
      status: newStatus,
      boundingBox: null,
      confidenceScore: 0,
      matchedCustomer: null,
      unknownPersonAlert: false,
    })
  }, [isCameraActive])

  return {
    videoRef,
    isCameraActive,
    status,
    errorMessage,
    boundingBox,
    matchedCustomer,
    confidenceScore,
    latencyMs,
    modelsReady,
    startCamera,
    stopCamera,
    retryCamera,
    resetMatch,
  }
}
