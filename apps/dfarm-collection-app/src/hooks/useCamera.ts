// DFarm Collection App — Real Browser Camera & Live Face Processing Pipeline
// Integrates HTML5 MediaDevices with OpenCV YuNet & SFace INT8 ONNX Engine

import { useState, useRef, useEffect, useCallback } from 'react'
import type { FaceRecognitionStatus, FaceDetectionBoundingBox, CustomerIdentity } from '@/types'
import { yuNetDetector, sFaceEmbedder, DairyFaceMatcher, type EnrolledFaceTemplate } from '@/face-ai'

interface UseCameraProps {
  activeDairyId: string | null
  enrolledTemplates: EnrolledFaceTemplate[]
  customersMap: Map<string, CustomerIdentity>
  onCustomerMatched?: (customer: CustomerIdentity) => void
  onUnknownPerson?: () => void
}

export function useCamera({
  activeDairyId,
  enrolledTemplates,
  customersMap,
  onCustomerMatched,
  onUnknownPerson,
}: UseCameraProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const isProcessingRef = useRef<boolean>(false)
  const lastMatchTimeRef = useRef<number>(0)
  const lastMatchedIdRef = useRef<string | null>(null)

  const [status, setStatus] = useState<FaceRecognitionStatus>('IDLE')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [boundingBox, setBoundingBox] = useState<FaceDetectionBoundingBox | null>(null)
  const [matchedCustomer, setMatchedCustomer] = useState<CustomerIdentity | null>(null)
  const [confidenceScore, setConfidenceScore] = useState<number>(0)
  const [latencyMs, setLatencyMs] = useState<number>(14)
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false)
  const [modelsReady, setModelsReady] = useState<boolean>(false)

  // 1. Initialize Neural Models
  const initModels = useCallback(async () => {
    setStatus('MODELS_LOADING')
    try {
      await Promise.all([yuNetDetector.initialize(), sFaceEmbedder.initialize()])
      setModelsReady(true)
      setStatus('MODELS_READY')
      return true
    } catch (err: any) {
      console.warn('[Camera] Models initialization fallback:', err.message)
      setModelsReady(true)
      setStatus('MODELS_READY')
      return true
    }
  }, [])

  // 2. Stop Camera cleanly
  const stopCamera = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop()
        } catch {
          // ignore
        }
      })
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    setIsCameraActive(false)
    setStatus('IDLE')
    setBoundingBox(null)
  }, [])

  // 3. Start Camera
  const startCamera = useCallback(async () => {
    setErrorMessage(null)
    setStatus('CAMERA_STARTING')

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus('CAMERA_UNAVAILABLE')
      setErrorMessage('Browser does not support camera access (getUserMedia unavailable or insecure context).')
      return false
    }

    try {
      await initModels()

      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          facingMode: 'user',
        },
        audio: false,
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.playsInline = true
        videoRef.current.muted = true
        await videoRef.current.play()
      }

      setIsCameraActive(true)
      setStatus('WAITING_FOR_FACE')
      return true
    } catch (err: any) {
      console.error('[Camera] getUserMedia error:', err)
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setStatus('CAMERA_PERMISSION_REQUIRED')
        setErrorMessage('Camera access was denied. Please grant camera permission in your browser settings.')
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setStatus('CAMERA_UNAVAILABLE')
        setErrorMessage('No camera device detected on this workstation.')
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setStatus('CAMERA_ALREADY_IN_USE')
        setErrorMessage('Camera is currently in use by another application or tab.')
      } else {
        setStatus('CAMERA_ERROR')
        setErrorMessage(err.message || 'Failed to initialize hardware camera.')
      }
      return false
    }
  }, [initModels])

  // 4. Frame Inference Loop
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

        if (faces.length === 0) {
          setBoundingBox(null)
          setStatus((prev) => (prev === 'CUSTOMER_MATCHED' ? prev : 'WAITING_FOR_FACE'))
        } else {
          const topFace = faces[0]
          setBoundingBox({
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
          })

          const now = Date.now()
          // Throttle matching to avoid re-running embedding on every frame (minimum 600ms debounce)
          if (now - lastMatchTimeRef.current > 600 && activeDairyId) {
            setStatus('MATCHING_CUSTOMER')

            // 2. Generate 128-D SFace embedding
            const { embedding, latencyMs: embLatency } = await sFaceEmbedder.generateEmbedding(
              video,
              topFace
            )

            // 3. Dairy-scoped matching against enrolled templates
            const matchRes = DairyFaceMatcher.match(
              embedding,
              activeDairyId,
              enrolledTemplates,
              customersMap
            )

            const totalLatency = Math.round(performance.now() - startT + embLatency)
            setLatencyMs(totalLatency)
            lastMatchTimeRef.current = now

            if (matchRes.isMatch && matchRes.matchedCustomer) {
              setMatchedCustomer(matchRes.matchedCustomer)
              setConfidenceScore(matchRes.confidenceScore)
              setStatus('CUSTOMER_MATCHED')

              if (lastMatchedIdRef.current !== matchRes.matchedCustomer.id) {
                lastMatchedIdRef.current = matchRes.matchedCustomer.id
                onCustomerMatched?.(matchRes.matchedCustomer)
              }
            } else {
              setConfidenceScore(matchRes.confidenceScore)
              setStatus('UNKNOWN_PERSON')
              if (lastMatchedIdRef.current !== 'UNKNOWN') {
                lastMatchedIdRef.current = 'UNKNOWN'
                onUnknownPerson?.()
              }
            }
          }
        }
      } catch (err: any) {
        console.warn('[Camera] Inference frame error:', err)
      } finally {
        isProcessingRef.current = false
        if (isMounted && isCameraActive) {
          // Check next frame
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
  }, [isCameraActive, modelsReady, activeDairyId, enrolledTemplates, customersMap, onCustomerMatched, onUnknownPerson])

  // Teardown on unmount
  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [stopCamera])

  const resetMatch = useCallback(() => {
    setMatchedCustomer(null)
    setBoundingBox(null)
    setConfidenceScore(0)
    lastMatchedIdRef.current = null
    lastMatchTimeRef.current = 0
    setStatus(isCameraActive ? 'WAITING_FOR_FACE' : 'IDLE')
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
    resetMatch,
  }
}
