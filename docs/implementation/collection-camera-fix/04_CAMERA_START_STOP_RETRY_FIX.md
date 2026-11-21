# 04 — Camera Start, Stop and Retry Fix

**Date:** 2026-11-19

---

## Start Camera — Before and After

### Pre-Fix `startCamera()` Issues

```typescript
// PRE-FIX (simplified)
const startCamera = useCallback(async () => {
  setStatus('CAMERA_STARTING')               // No idempotency guard
  await initModels()                          // State changes mid-flow → rerenders → possible cleanup race
  const stream = await getUserMedia()         // No generation check after await
  video.srcObject = stream                   // Unconditional assignment
  video.playsInline = true
  video.muted = true
  await video.play()                          // Called immediately without waiting for metadata events
  setIsCameraActive(true)
  setStatus('WAITING_FOR_FACE')
}, [initModels])
```

**Problems:**
- No guard against concurrent calls → double-click creates two streams.
- `initModels()` triggers state changes (MODELS_LOADING → MODELS_READY) mid-initialization.
- No check whether generation is still current after any `await`.
- `video.play()` called immediately without waiting for `loadedmetadata`/`canplay`.
- No detection of `video.paused` after `play()` resolves.

### Post-Fix `startCamera()` Flow

```
1. Check isStartingRef — block concurrent calls
2. Increment initGenRef (myGen)
3. Security context verification
4. getUserMedia API availability check
5. videoRef.current existence check
6. Kick off initModels() (non-blocking — does not await here)
7. setStatus('REQUESTING_PERMISSION')
8. await getUserMedia() 
9. Check myGen === initGenRef.current                ← generation guard #1
10. streamRef.current = stream
11. video.muted = true; video.playsInline = true; video.autoplay = true
12. if (video.srcObject !== stream) video.srcObject = stream   ← conditional assignment
13. setStatus('WAITING_FOR_VIDEO_METADATA')
14. await waitForVideoReady() (loadedmetadata/canplay/timeout)
15. Check myGen === initGenRef.current                ← generation guard #2
16. setStatus('STARTING_PLAYBACK')
17. await video.play()
18. Handle AbortError with one retry after 150ms
19. Check myGen === initGenRef.current                ← generation guard #3
20. Verify !video.paused && !video.ended
21. Wait for nonzero video dimensions (up to 2s)
22. Check myGen === initGenRef.current                ← generation guard #4
23. isStartingRef.current = false
24. setIsCameraActive(true)
25. setStatus('WAITING_FOR_FACE')
```

---

## Stop Camera — Before and After

### Pre-Fix `stopCamera()` Issues
```typescript
const stopCamera = useCallback(() => {
  cancelAnimationFrame(...)
  stream.getTracks().forEach(t => t.stop())
  streamRef.current = null
  video.srcObject = null    // ← NO pause() first → triggers implicit load() → AbortError
  setIsCameraActive(false)
  setStatus('IDLE')
}, [onFaceStateChange])     // ← unstable dep → new function reference on every render
```

### Post-Fix `stopCamera()`

```typescript
const stopCamera = useCallback(() => {
  initGenRef.current += 1   // Invalidate any inflight start
  stopCameraInternal()      // No ownerGen — always clears
}, [stopCameraInternal])

// stopCameraInternal:
video.pause()               // Pause BEFORE clearing srcObject — avoids AbortError
video.srcObject = null      // Safe to clear after pause
```

---

## Retry Camera — Before and After

### Pre-Fix "Retry"
The Retry Camera button called `startCamera` directly:
```tsx
<ClayButton onClick={startCamera}>Retry Camera</ClayButton>
```
If the previous attempt had a stream reference still open, calling `startCamera` again would create a **second getUserMedia** without stopping the first stream.

### Post-Fix `retryCamera()`

```typescript
const retryCamera = useCallback(async () => {
  // 1. Cancel any animation frame
  cancelAnimationFrame(animFrameRef.current)
  // 2. Stop previous stream tracks
  streamRef.current?.getTracks().forEach(t => t.stop())
  streamRef.current = null
  // 3. Pause video before clearing srcObject
  video?.pause()
  video.srcObject = null
  // 4. Reset idempotency guard
  isStartingRef.current = false
  // 5. Reset UI state
  setIsCameraActive(false)
  setStatus('IDLE')
  setErrorMessage(null)
  // 6. Brief pause for DOM/browser cleanup
  await new Promise(r => setTimeout(r, 200))
  // 7. Start fresh — now safe
  return startCamera()
}, [startCamera])
```

Retry is wired to the button in `CustomerIdentityPanel.tsx`:
```tsx
<ClayButton onClick={retryCamera}>Retry Camera</ClayButton>
```

---

## State Diagram (Post-Fix)

```
           ┌──────────────────────┐
           │         IDLE         │
           └─────────┬────────────┘
                     │ Click Start Cam
                     ▼
           ┌──────────────────────┐
           │   CAMERA_STARTING    │
           └─────────┬────────────┘
                     │
                     ▼
           ┌──────────────────────┐
           │ REQUESTING_PERMISSION│
           └─────────┬────────────┘
                     │ getUserMedia resolves
                     ▼
           ┌──────────────────────┐
           │      CONNECTING      │
           └─────────┬────────────┘
                     │ srcObject assigned
                     ▼
         ┌────────────────────────────┐
         │ WAITING_FOR_VIDEO_METADATA │
         └─────────┬──────────────────┘
                   │ loadedmetadata / canplay
                   ▼
         ┌────────────────────────────┐
         │     STARTING_PLAYBACK      │
         └─────────┬──────────────────┘
                   │ play() resolves
                   ▼
         ┌────────────────────────────┐
         │      WAITING_FOR_FACE      │◄── CAMERA READY
         └─────────┬──────────────────┘
                   │ YuNet detects face
                   ▼
         ┌────────────────────────────┐
         │      MATCHING_CUSTOMER     │
         └──┬────────────────────┬───┘
            │                    │
            ▼                    ▼
   CUSTOMER_MATCHED         UNKNOWN_PERSON
```
