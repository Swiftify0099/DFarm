# 10 — Remaining Blockers & Resolution Log

**Date:** 2026-11-19
**Status:** ALL CODE ISSUES RESOLVED ✅

---

## Resolved Issues

| Blocker | App / Module | Resolution | Status |
|---------|-------------|------------|--------|
| `play()` interrupted by new load request | `dfarm-collection-app` / `useCamera.ts` | Generation counter (`initGenRef`), event-gated playback waiting for `loadedmetadata` / `canplay`, generation guards on every async step | ✅ RESOLVED |
| Duplicate camera init on retry | `dfarm-collection-app` / `useCamera.ts` | `retryCamera()` clears previous stream & teardown before re-initializing | ✅ RESOLVED |
| Frame loop restarts on re-render | `dfarm-collection-app` / `CustomerIdentityPanel.tsx` | Stable callback refs (`onCustomerMatchedRef`, `onFaceStateChangeRef`, `onUnknownPersonRef`) | ✅ RESOLVED |
| Stale async results mutating camera state | `dfarm-collection-app` / `useCamera.ts` | Generation guards (`ownerGen !== initGenRef.current`) on every await | ✅ RESOLVED |
| StrictMode double-mount killing active stream | `dfarm-collection-app` / `useCamera.ts` | `stopCameraInternal(ownerGen?)` only terminates if owning generation is unmounted | ✅ RESOLVED |
| Face biometrics button unclickable / disabled | `dfarm-customer-app` / `update-face.tsx` | Pre-load models on mount (`modelReady`), handle permission request directly from button tap if not granted, remove `!permission?.granted` blocking disabled state | ✅ RESOLVED |
| Face enrollment button blocked | `dfarm-customer-app` / `face-enroll.tsx` | Pre-load models on mount, trigger permission prompt on button tap, dynamic button labels | ✅ RESOLVED |
| ONNX `graph.cc` warning flood in console | Both apps / `sface-embedder.ts`, `yunet-detector.ts` | Configured `logSeverityLevel: 3` and `ort.env.logLevel = 'error'` across all session creators | ✅ RESOLVED |

---

## Test Verification Summary

### 1. DFarm Collection App (`apps/dfarm-collection-app`)
- **TypeScript Check:** `npx tsc --project tsconfig.json --noEmit` → **0 errors**
- **Test Suite:** `npx vitest run` → **9 passed (9), 48 passed (48)**

### 2. DFarm Customer App (`apps/dfarm-customer-app`)
- **TypeScript Check:** `npx tsc --noEmit` → **0 errors**
- **Test Suite:** `npx jest` → **6 test suites passed (6), 22 tests passed (22)**

---

## Remaining Hardware / Runtime Verification (Physical Environment)

| Item | Action Required | Expected Outcome |
|------|----------------|------------------|
| Physical webcam + live browser test | Open `http://localhost:5175`, click "Start Cam" | No warning; live video renders smoothly |
| YuNet face detection with physical face | Stand in front of camera | Green bounding box renders on canvas overlay |
| SFace embedding with enrolled farmer | Enrolled farmer presents face | `CUSTOMER_MATCHED` state triggered, voice announcer speaks |
| Unknown person rejection | Unenrolled individual presents face | `UNKNOWN_PERSON` state triggered |
| RFID physical card scan | Tap RFID card on reader | Paton resolved instantly via Web Serial / HID |
| Physical thermal printer | Complete a transaction | Receipt printed via ESC/POS driver |
| Weighing scale + ultrasonic analyzer | Place milk sample on hardware | Weight, Fat, SNF parsed via serial port |

---

## Non-Blockers

| Item | Notes |
|------|-------|
| Backend `POST /api/v1/collections/transactions` 409 Conflict | Separate backend session deduplication / idempotency issue. Scoped to `services/backend/` and not related to the camera or biometrics frontend lifecycle. |
