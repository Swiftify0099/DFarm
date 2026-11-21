# 00 — Camera Lifecycle Audit

**Date:** 2026-11-19  
**App:** `apps/dfarm-collection-app`  
**Execution Reference:** DFARM-COLLECTION-CAMERA-PLAY-INTERRUPTED-FIX

---

## Source Files Inspected

| File | Role |
|------|------|
| `src/hooks/useCamera.ts` | **Primary camera lifecycle owner** — getUserMedia, play(), stream, frame loop |
| `src/components/workspace/CustomerIdentityPanel.tsx` | Renders `<video>` element, invokes `useCamera`, camera Start/Stop/Retry buttons |
| `src/context/HardwareContext.tsx` | Provides `enrolledTemplates`, `customersMap`, `updateFaceState` to panel |
| `src/pages/collection/CollectionWorkspace.tsx` | Mounts `CustomerIdentityPanel` |
| `src/face-ai/yunet-detector.ts` | ONNX YuNet face detection |
| `src/face-ai/sface-embedder.ts` | ONNX SFace INT8 128-D embedding |
| `src/face-ai/matcher.ts` | Dairy-scoped cosine similarity matching |
| `src/face-ai/preprocessor.ts` | Frame tensor capture, face crop/align |
| `src/main.tsx` | App entry — **React.StrictMode wrapping confirmed** |

---

## Camera Ownership Analysis

| Component | getUserMedia? | video ref? | play()? | srcObject? |
|-----------|--------------|-----------|---------|-----------|
| `useCamera.ts` | ✅ Single call | ✅ videoRef | ✅ once | ✅ single assignment |
| `CustomerIdentityPanel.tsx` | ❌ No | References `videoRef` from hook | ❌ No | ❌ No |
| `HardwareContext.tsx` | ❌ No | ❌ No | ❌ No | ❌ No |

**Single camera ownership** is correctly concentrated in `useCamera`.  
No other component or hook calls `getUserMedia`.

---

## State Machine (Pre-Fix)

```
IDLE → MODELS_LOADING → MODELS_READY → CAMERA_STARTING → WAITING_FOR_FACE
     ↓ (errors) → CAMERA_PERMISSION_REQUIRED / CAMERA_UNAVAILABLE / CAMERA_ALREADY_IN_USE / CAMERA_ERROR
```

## State Machine (Post-Fix)

```
IDLE
  → CAMERA_STARTING
  → REQUESTING_PERMISSION
  → CONNECTING
  → WAITING_FOR_VIDEO_METADATA
  → STARTING_PLAYBACK
  → WAITING_FOR_FACE
  → MATCHING_CUSTOMER
  → CUSTOMER_MATCHED | UNKNOWN_PERSON
  
  (error paths)
  → CAMERA_PERMISSION_REQUIRED
  → CAMERA_UNAVAILABLE
  → CAMERA_ALREADY_IN_USE
  → CAMERA_ERROR
  → INITIALIZATION_FAILED
```

---

## useEffect Dependencies Audit

| Effect | Deps | Issue Found? |
|--------|------|-------------|
| Frame inference loop (line 148 pre-fix) | `isCameraActive, modelsReady, activeDairyId, enrolledTemplates, customersMap, onCustomerMatched, onUnknownPerson, onFaceStateChange` | **YES** — `onCustomerMatched`, `onUnknownPerson`, `onFaceStateChange` are inline functions recreated on each render of `CustomerIdentityPanel`, causing frame loop restarts |
| Frame inference loop (post-fix) | `isCameraActive, modelsReady, activeDairyId, enrolledTemplates, customersMap` | **FIXED** — callbacks via stable refs |
| Teardown (line 311 pre-fix) | `[stopCamera]` | **YES** — `stopCamera` closes over `onFaceStateChange` making it unstable |
| Teardown (post-fix) | `[stopCameraInternal]` | **FIXED** — `stopCameraInternal` has no callback deps |

---

## React StrictMode Impact

`main.tsx` wraps the application in `<React.StrictMode>`.

In development, StrictMode intentionally **double-invokes** every component and effect:
- Mount → effect setup
- Unmount → effect cleanup (calls `stopCamera()`)
- Remount → effect setup again

**Pre-fix:** The StrictMode unmount cleanup called `stopCamera()` which set `video.srcObject = null`. Meanwhile the remount re-ran `startCamera()` from a user click, which had already called `video.play()` on an assigned srcObject. Setting `srcObject = null` triggered a new implicit `load()` on the video element, which interrupted the pending `play()` Promise → **"The play() request was interrupted by a new load request."**

**Post-fix:** Generation counter (`initGenRef`) ensures the stale cleanup path (`ownerGen !== initGenRef.current`) exits without touching the new session's stream or video element.
