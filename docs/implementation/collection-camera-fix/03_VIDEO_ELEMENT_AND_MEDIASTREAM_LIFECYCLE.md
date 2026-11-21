# 03 — Video Element and MediaStream Lifecycle

**Date:** 2026-11-19

---

## Video Element Stability

The `<video>` element is rendered in `CustomerIdentityPanel.tsx`:

```tsx
<video
  ref={videoRef}
  autoPlay
  playsInline
  muted
  className={`absolute inset-0 w-full h-full object-cover ${
    isCameraActive ? 'block' : 'hidden'
  }`}
/>
```

### Key Findings

| Property | Value | Correct? |
|----------|-------|----------|
| `autoPlay` | ✅ Set via JSX | Yes |
| `playsInline` | ✅ Set via JSX | Yes |
| `muted` | ✅ Set via JSX | Yes |
| `key` prop | None — element is stable | ✅ Correct — element is not recreated |
| Conditional rendering | `hidden` / `block` class only | ✅ Correct — DOM element stays mounted |
| srcObject reassignment | Only when `video.srcObject !== stream` | ✅ Fixed |

The video element is **never unmounted** during active camera use. The `isCameraActive` flag only toggles CSS visibility.

---

## MediaStream Lifecycle

```
getUserMedia()
    │
    ▼
streamRef.current = stream          ← stored immediately
    │
    ▼
video.srcObject = stream             ← assigned only once per session
    │
    ▼
waitFor(loadedmetadata | canplay)    ← NEW: event-driven readiness
    │
    ▼
video.play()                         ← called once after readiness confirmed
    │
    ▼
isCameraActive = true                ← state set after play() resolves
    │
    ▼
Frame inference loop runs            ← animationFrame loop
    │
    ▼
stopCamera()
    │
    ├── cancelAnimationFrame()
    ├── streamRef.current.getTracks().forEach(t => t.stop())
    ├── streamRef.current = null
    ├── video.pause()                ← NEW: pause before clearing srcObject
    └── video.srcObject = null
```

---

## srcObject Assignment Safety

### Pre-Fix Risk
```typescript
// Called on every startCamera invocation without checking current value
video.srcObject = stream
await video.play()
// If cleanup set srcObject = null between assignment and play(),
// an implicit load() fires → AbortError
```

### Post-Fix Safety
```typescript
// Only assign if different — avoids spurious load() events
if (video.srcObject !== stream) {
  video.srcObject = stream
}
// Then WAIT for loadedmetadata/canplay before play()
await waitForVideoReady(video)
await video.play()
```

---

## video.load() Usage

**`video.load()` is NEVER called** in the codebase.

The only implicit `load()` trigger was setting `video.srcObject = null` during teardown while `play()` was pending. This is now prevented by:
1. The generation guard preventing stale cleanups from reaching `srcObject = null`.
2. `video.pause()` being called before `video.srcObject = null` in all stop paths.

---

## Track Cleanup Verification

On every stop/retry:
```typescript
streamRef.current.getTracks().forEach((track) => {
  try { track.stop() } catch { /* ignore */ }
})
streamRef.current = null
```

All `MediaStreamTrack` objects are explicitly stopped. No orphaned tracks remain active after camera stop.

---

## Metadata Timeout Protection

A new 8-second timeout guards the event-wait:
```typescript
setTimeout(() => {
  // cleanup listeners
  reject(new Error('Video metadata timeout — no loadedmetadata/canplay event within 8 seconds'))
}, 8000)
```

If the browser never fires `loadedmetadata` or `canplay` (e.g., broken camera driver), the error is classified as `INITIALIZATION_FAILED` with a user-visible message, not a silent hang.
