# 02 — Duplicate Camera Initialization Audit

**Date:** 2026-11-19

---

## Audit: Multiple getUserMedia Calls

### Search Result
Grep for `getUserMedia` across all source files:

```
src/hooks/useCamera.ts:115  — navigator.mediaDevices.getUserMedia(constraints)
```

**Result: SINGLE call site — no duplicate getUserMedia in any other file.**

---

## Audit: Multiple Camera Start Paths

| Trigger | Handler | Creates Stream? |
|---------|---------|----------------|
| "Start Cam" button click | `startCamera()` via `useCamera` | Yes — single |
| "Retry Camera" button click | Pre-fix: `startCamera()` directly; Post-fix: `retryCamera()` | Cleaned up first |
| Component mount (auto-start) | None — camera is manually started | N/A |
| React StrictMode remount | Teardown → cleanup | Properly guarded post-fix |

**No duplicate camera initialization paths found.**

---

## Audit: Double-Click Protection

### Pre-Fix
```typescript
const startCamera = useCallback(async () => {
  // No guard — clicking Start twice while getUserMedia is pending
  // created two simultaneous getUserMedia requests
  const stream = await navigator.mediaDevices.getUserMedia(constraints)
  ...
})
```

### Post-Fix
```typescript
if (isStartingRef.current) {
  console.warn('[Camera] startCamera called while already starting — ignored.')
  return false
}
isStartingRef.current = true
```

The `isStartingRef` boolean ref ensures that if Start is clicked while an initialization is already in progress, the second call returns `false` immediately without creating a second stream.

---

## Audit: StrictMode Double-Mount

React StrictMode in development intentionally triggers:
1. Mount → effect runs `startCamera` (if wired to `useEffect`)
2. Unmount → cleanup runs `stopCamera`
3. Remount → effect runs again

**Finding:** Camera is NOT auto-started on mount via `useEffect`. It is started manually by user button click only. This reduces the StrictMode double-invoke risk for `getUserMedia`.

However, the **teardown effect** `stopCamera()` on unmount was still clearing `srcObject` on the live video element if the StrictMode cleanup happened while a user-initiated `play()` was pending.

**Post-fix:** Generation guard prevents the stale cleanup from touching the new session's video element.

---

## Audit: Multiple Components Sharing videoRef

| Component | videoRef access |
|-----------|----------------|
| `useCamera.ts` | Owner — created here |
| `CustomerIdentityPanel.tsx` | Received from `useCamera`, passed to `<video ref={videoRef}>` |
| `HardwareContext.tsx` | No video element access |
| `CollectionWorkspace.tsx` | No video element access |

**Single video element, single ref owner — VERIFIED.**

---

## Conclusion

No duplicate camera initialization paths exist. The `play()` interruption was caused not by duplicate streams but by the React StrictMode cleanup path calling `stopCamera()` while a user-initiated `play()` was still pending — combined with no generation guard to distinguish stale from current cleanups.
