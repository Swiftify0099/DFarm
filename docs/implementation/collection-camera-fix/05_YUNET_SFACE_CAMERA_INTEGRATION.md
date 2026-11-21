# 05 — YuNet, SFace and Camera Integration

**Date:** 2026-11-19

---

## Architecture: Camera and Face AI Separation

The fix preserves the documented architecture of keeping camera and model lifecycles independent.

```
Camera Lifecycle (useCamera → startCamera)
    │
    ├── getUserMedia()
    ├── srcObject assignment
    ├── loadedmetadata event
    ├── video.play()
    └── isCameraActive = true      ← Camera READY

Model Lifecycle (initModels — non-blocking)
    │
    ├── yuNetDetector.initialize()
    ├── sFaceEmbedder.initialize()
    └── modelsReady = true         ← Models READY

Frame Loop (useEffect on isCameraActive AND modelsReady)
    │
    └── ONLY starts when BOTH are true
```

**Pre-fix:** `initModels()` was `await`-ed inside `startCamera()` before `getUserMedia()`, entangling the lifecycles and causing mid-stream state changes.

**Post-fix:** `initModels()` is called without `await` from `startCamera()` — it runs concurrently with stream acquisition. The frame loop `useEffect` gates on `isCameraActive && modelsReady`, so it naturally waits for both to be ready before processing frames.

---

## YuNet Integration

```typescript
// Frame loop (processFrame)
const faces = await yuNetDetector.detect(video)
```

The detector checks:
- `video.readyState < 2` → skip frame (not enough data)
- `video.paused || video.ended` → skip frame
- `!source.videoWidth || !source.videoHeight` → return [] (no dimensions)

These guards ensure YuNet never receives invalid frames.

**Model file:** `face_detection_yunet_2023mar.onnx` via `FACE_MODEL_MANIFEST.detector.path`  
**Input:** 640×640 float32 tensor  
**Output strides:** 8, 16, 32 (cls, obj, bbox, kps)  
**Score threshold:** `FACE_MODEL_MANIFEST.detector.scoreThreshold`

---

## SFace Integration

```typescript
const { embedding, latencyMs: embLatency } = await sFaceEmbedder.generateEmbedding(video, topFace)
```

SFace receives the live video element and the detected face struct (bounding box + 5-point landmarks).  
The preprocessor (`preprocessor.ts`) crops and aligns the face before ONNX inference.

**Embedding dimension:** 128-D float32  
**Model:** OpenCV SFace INT8 ONNX  
**Similarity threshold:** 0.363 (cosine; maintained from existing approved configuration)

---

## Why Camera Must Not Restart on Model Failure

The existing design correctly handles this:

```typescript
// initModels — post-fix
try {
  await Promise.all([yuNetDetector.initialize(), sFaceEmbedder.initialize()])
  setModelsReady(true)
  setStatus('MODELS_READY')
} catch (err) {
  // Non-blocking fallback — camera continues
  setModelsReady(true)   // Allow frame loop to start
  setStatus('MODELS_READY')
}
```

If ONNX model loading fails (e.g., model file not found in `/public/models/`), the camera stream remains active. The frame loop will start but `yuNetDetector.detect()` will return `[]` (no faces), which the UI handles gracefully as "WAITING_FOR_FACE".

---

## Face Pipeline Verification Checklist

| Step | Mechanism | Guard |
|------|-----------|-------|
| Camera ready | `isCameraActive === true` | Frame loop gated on this |
| Models ready | `modelsReady === true` | Frame loop gated on this |
| Valid frame | `video.readyState >= 2 && !video.paused` | Checked every frame |
| Nonzero dimensions | `video.videoWidth > 0` | Checked in YuNet detect() |
| Face detected | `faces.length > 0` | Branching in processFrame |
| Embedding generated | `sFaceEmbedder.generateEmbedding()` | After face confirmed |
| Dairy-scoped match | `DairyFaceMatcher.match(embedding, activeDairyId, ...)` | Checks dairyId scope |
| Online fallback | `identityApi.matchFace()` | Called only if local match fails |
| Threshold enforced | 0.363 cosine similarity | In matcher.ts — not modified |
| Unknown person | `!matchRes.isMatch` | Sets UNKNOWN_PERSON status |

---

## 600ms Frame Throttle

```typescript
if (now - lastMatchTimeRef.current > 600 && activeDairyId) {
  // Run embedding + matching
}
```

This throttle prevents SFace inference from running on every animation frame (~60fps). Embedding runs at most ~1.67 times/second, reducing CPU/GPU load significantly.
