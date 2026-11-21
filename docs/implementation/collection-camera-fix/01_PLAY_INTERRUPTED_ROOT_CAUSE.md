# 01 — Root Cause: play() Interrupted by New Load Request

**Error shown:** `The play() request was interrupted by a new load request.`  
**Reference:** https://goo.gl/LdLk22 (Chrome AbortError DOMException)

---

## Confirmed Root Cause: React StrictMode + srcObject Reassignment

### Mechanism (Step-by-Step)

1. **User clicks "Start Cam"** → `startCamera()` runs.
2. `getUserMedia()` resolves with a `MediaStream`.
3. `video.srcObject = stream` is assigned.
4. `video.play()` is called → **Promise P1 is pending**.
5. **React StrictMode** (development mode) unmounts and remounts the component.
6. The unmount cleanup `useEffect` calls `stopCamera()`.
7. Inside `stopCamera()`, `video.srcObject = null` is executed.
8. **Setting `srcObject = null` on a video element implicitly calls `video.load()`** per the HTML5 media spec.
9. `video.load()` aborts the pending `P1` play() Promise.
10. The browser throws: `DOMException: The play() request was interrupted by a new load request.`
11. The catch block in `startCamera()` sets `cameraError` state.
12. The UI displays **"Camera Warning / The play() request was interrupted by a new load request."**

---

## Contributing Factors

### 1. No generation guard
Pre-fix, there was no way to know whether a cleanup call was for the _current_ stream or a stale one. The teardown ran `stopCamera()` unconditionally even if a newer session was active.

### 2. initModels() was entangled with stream acquisition
```typescript
// PRE-FIX (wrong)
const startCamera = useCallback(async () => {
  await initModels()           // triggers MODELS_LOADING state → rerender
  const stream = await getUserMedia()
  video.srcObject = stream
  await video.play()           // may already be interrupted by rerender from initModels state change
}, [initModels])
```

`initModels()` calls `setStatus('MODELS_LOADING')` and `setStatus('MODELS_READY')` which triggers React rerenders mid-initialization. If those rerenders caused the component's effect cleanup to run, they would interrupt the stream.

### 3. Inline callback functions caused frame loop restarts
```typescript
// PRE-FIX (wrong) in CustomerIdentityPanel.tsx
useCamera({
  onCustomerMatched: (customer) => {   // new function reference on every render
    onCustomerSelected(customer, 'FACE_RECOGNITION')
  },
  onFaceStateChange: (state) => {      // new function reference on every render
    updateFaceState(state)
  },
})
```
These inline functions in the `useCamera` deps array (`[..., onCustomerMatched, onUnknownPerson, onFaceStateChange]`) caused the frame loop effect to restart on every render of `CustomerIdentityPanel`, which tears down and re-creates the animation frame loop unnecessarily.

### 4. Retry Camera called startCamera directly
The "Retry Camera" button called `startCamera` without first cleaning up the previous failed attempt, potentially creating a second stream while the first was still open.

---

## Why This Appeared as a Camera "Warning" and Not a Silent Error

The browser's `play()` rejection is surfaced directly because the catch block had no generation guard:
```typescript
// PRE-FIX
} catch (err: any) {
  setErrorMessage(err.message || 'Failed to initialize hardware camera.')  // always showed the message
}
```

If `err.name === 'AbortError'` and it was caused by a stale cleanup, the error should be **silently discarded** (the new session took over). The fix checks `myGen !== initGenRef.current` before every state mutation.

---

## Fix Summary

| Issue | Fix |
|-------|-----|
| StrictMode double-invoke kills new stream | Generation counter `initGenRef` — stale cleanups are no-ops |
| `srcObject = null` interrupts play() | `stopCameraInternal(ownerGen)` — only clears owned generation |
| initModels() state changes mid-stream | Models initialized before getUserMedia; state mutations guarded |
| Immediate play() after srcObject assign | Wait for `loadedmetadata` / `canplay` event before play() |
| video.load() implicitly called | Never set srcObject to null during active start; pause() first |
| Inline callbacks restart frame loop | Stable refs: `onCustomerMatchedRef`, `onFaceStateChangeRef` |
| Retry re-enters start while still starting | `isStartingRef` idempotency guard |
| Stale async results mutate current state | Generation checked after every `await` |
