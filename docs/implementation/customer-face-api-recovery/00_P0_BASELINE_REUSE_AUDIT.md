# DFARM — POST P0 FACE BIOMETRIC API CONTRACT & MOBILE RUNTIME RECOVERY
## 00. P0 BASELINE REUSE & PRESERVATION AUDIT

**Execution Reference:** `DFARM-FACE-P0-API-RUNTIME-RECOVERY`  
**Execution Timestamp:** 2026-11-20  
**Baseline Reference:** `DFARM P0 — Face Recognition Failure Investigation & Repair` (2026-11-20)  
**Status:** AUDITED & PRESERVED  

---

### 1. Architectural Baseline Inventory

In accordance with strict preservation guidelines, the engineering team audited all existing source code across `apps/dfarm-customer-app`, `services/backend`, and `apps/dfarm-collection-app` to verify that prior P0 biometric investments remain 100% intact, active, and unmodified by regression:

| Component / Subsystem | Location | Baseline Verification State | Preservation Strategy |
|---|---|---|---|
| **OpenCV YuNet 2023mar** Face Detector | `apps/dfarm-customer-app/src/face-ai/yunet-detector.ts`<br>`apps/dfarm-collection-app/src/face-ai/yunet-detector.ts` | **Active & Verified.** Real anchor grid generation (`generatePriorBoxes`), IoU NMS (threshold 0.4), landmark alignment quality scoring. | Reused directly. No modification to detector logic or anchor math. |
| **OpenCV SFace INT8 2021dec** Embedder | `apps/dfarm-customer-app/src/face-ai/sface-embedder.ts`<br>`apps/dfarm-collection-app/src/face-ai/sface-embedder.ts` | **Active & Verified.** Generates true 128-dimensional L2-normalized floating-point vectors. Quantized INT8 weights. | Reused without changes. Calibrated threshold `0.363` preserved. |
| **Backend Biometric Inference Service** | `services/backend/src/infrastructure/services/BiometricInferenceService.ts` | **Active & Verified.** Processes raw camera JPEG/PNG buffer, executes YuNet face detection, validates 5-point facial landmarks, generates 128-D embedding via SFace INT8. | Fully preserved. Routes `/api/v1/identity/face/detect-and-embed` and `/api/v1/identity/face/match` call this service directly. |
| **Real Camera Frame Capture** | `apps/dfarm-customer-app/src/app/(main)/profile/update-face.tsx`<br>`apps/dfarm-customer-app/src/app/(main)/profile/diagnostics.tsx` | **Active & Verified.** Expo Camera `CameraView` with `takePictureAsync({ base64: true, quality: 0.85 })`. | Captures genuine live frames; no dummy or mock buffers injected. |
| **5-Sample Biometric Enrollment** | `apps/dfarm-customer-app/src/app/(main)/profile/update-face.tsx` | **Active & Verified.** Captures 5 distinct frames sequentially, verifies single face per frame, extracts 128-D vectors. | Loops `TOTAL_SAMPLES = 5`, calls `averageAndNormalizeEmbeddings` to compute unit L2 centroid. |
| **128-D Normalization Math** | `apps/dfarm-customer-app/src/face-ai/preprocessor.ts`<br>`apps/dfarm-collection-app/src/face-ai/preprocessor.ts` | **Active & Verified.** Enforces `sum(v_i^2) = 1.0 ± 1e-4`, finite numbers, no NaN/Infinity. | Unchanged. |
| **ONNX WASM Distribution** | `apps/dfarm-collection-app/public/ort-wasm-simd-threaded.wasm` (and `.mjs`, `.jsep.*`, `.jspi.*`) | **Active & Verified.** All 8 ONNX Runtime Web assembly binaries deployed for browser client-side inference. | Unchanged and verified against Collection App vitest suite. |
| **1:N Recognition with Candidate Separation** | `apps/dfarm-collection-app/src/face-ai/matcher.ts` | **Active & Verified.** Cosine similarity threshold `0.363`, ambiguity margin `0.05` between top 1 and top 2 candidates. | Preserved. Vitest suite passes 9 of 9 subtests. |
| **Removal of Fake Biometric Fixtures** | Monorepo-wide | **Active & Verified.** Zero static `mockEmbeddings` or random mock tensors. All vectors originate from camera inference. | Maintained. Real neural embeddings verified in test suites. |

---

### 2. Confirmed Non-Overwriting Policy

1. **No Algorithmic Re-writes:** Neither the YuNet detector nor SFace embedder was rewritten.
2. **No Model File Overwriting:** ONNX model files and WASM runtime assets were left untouched.
3. **No Threshold Drift:** The calibrated SFace threshold of `0.363` remains standard across both Collection App and Backend.
4. **Targeted Repair Focus:** The recovery effort was strictly confined to:
   - Resolving route dispatch and parameter resolution that led to HTTP 404 in Update Face.
   - Resolving host reachability, environment variable precedence, and transport error reporting that led to Network Error on Android devices and emulators.
   - Verifying clean tenant persistence into `dfarm_tenant_<code_hash>` with AES-256-GCM + AAD encryption.
