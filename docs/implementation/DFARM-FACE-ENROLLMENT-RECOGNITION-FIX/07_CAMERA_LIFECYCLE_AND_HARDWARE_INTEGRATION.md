# DFARM — Camera Lifecycle & Hardware Integration Report

**Report Index:** `07_CAMERA_LIFECYCLE_AND_HARDWARE_INTEGRATION.md`  
**Execution Reference:** `DFARM-FACE-ENROLLMENT-RECOGNITION-END-TO-END-FIX`  
**Target:** Camera lifecycle, MediaDevices, HardwareContext, RFID, Scale, and Milk Analyzer

---

## 1. Executive Summary

This report documents the camera lifecycle management, video stream teardown, and synchronization between visual AI and physical collection hardware (weighing scale, ultrasonic milk analyzer, and USB/keyboard RFID reader).

---

## 2. Browser Camera Lifecycle (`useCamera.ts`)

### Safe Stream Teardown
```typescript
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
        // Safe release
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
  onFaceStateChange?.({
    status: 'IDLE',
    boundingBox: null,
    confidenceScore: 0,
    matchedCustomer: null,
    unknownPersonAlert: false,
  })
}, [onFaceStateChange])
```

---

## 3. Hardware Conflict Resolution

The collection app allows multiple identity acquisition channels:
1. **Facial Recognition (Primary):** OpenCV YuNet + SFace INT8.
2. **RFID Card Scan (Secondary):** 13.56 MHz NFC / RFID Serial Scanner.
3. **Farmer Code Direct Entry (Tertiary):** Keyboard input / barcode.

### Conflict Detection Matrix:
- If Face Recognition identifies Farmer A (`C-101`), and RFID card scanned belongs to Farmer B (`C-102`), the system triggers `hasIdentityConflict: true`.
- An amber warning modal appears requesting operator confirmation before proceeding with milk weight measurement.
- If Face Recognition identifies Farmer A, and RFID card is also assigned to Farmer A, the system promotes confidence to $99.9\%$ (`MATCHED`).
