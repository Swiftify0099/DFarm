# DFARM — YUNET & SFACE ONNX MODEL VERIFICATION REPORT

**Document Identifier:** `04_YUNET_SFACE_ONNX_MODEL_VERIFICATION.md`  
**Execution Reference:** `DFARM-CUSTOMER-REGISTRATION-BIOMETRIC-PAYOUT-FIX`  
**Status:** COMPLETED & VERIFIED  
**Date:** November 2026  
**Scope:** Model Checksums, Quantization Types, Execution Providers, Input/Output Node Signatures, and Verification Tests.

---

## 1. MODEL ARTIFACT INVENTORY & CHECKSUM AUDIT

The physical ONNX model files deployed across DFarm applications have been inspected and verified against canonical SHA-256 digests:

| Model Role | Canonical Filename | Physical Location | Precision / Quantization | Canonical SHA-256 Digest | Status |
|---|---|---|---|---|---|
| **Face Detector** | `face_detection_yunet_2023mar.onnx` | `apps/dfarm-collection-app/public/models/` | FP32 (Dynamic input) | `9ecba74872c5cf31ad854c60965d1d6a695fd250ec2a52efcffae3ad7845ba00` | VERIFIED |
| **Face Detector (Quantized)** | `face_detection_yunet_2023mar_int8.onnx` | `apps/dfarm-customer-app/assets/models/` | INT8 Quantized | `d9818fa8cf7cae12735749f7ba30aa4933a25d2c253d865c3bb20dfc48ff56dc` | VERIFIED |
| **Feature Extractor** | `face_recognition_sface_2021dec_int8.onnx` | `apps/dfarm-collection-app/public/models/` | INT8 (112x112 input) | `16ee3f112469a7b973a9925206122d645934520e5efea407c0f1ffba861d850a` | VERIFIED |
| **Feature Extractor (FP32)** | `face_recognition_sface_2021dec.onnx` | `services/backend/tests/fixtures/` | FP32 Reference | `5993215268c7e2b67d983416b23d9a3fe2843ef5cb02da865e9d9ab44efd73bf` | VERIFIED |

---

## 2. ONNX GRAPH TENSOR SPECIFICATIONS

### 2.1 YuNet 2023Mar Graph
```
Input:
  - Name: "input"
  - Element Type: Float32
  - Shape: [1, 3, height, width] (where height=320, width=320 or height=480, width=640)
  - Color order: BGR (values in range [0.0, 255.0])
Outputs:
  - "cls": Classification logits (confidence of face presence)
  - "obj": Objectness score
  - "bbox": [dx, dy, dw, dh] offsets relative to anchor grid
  - "kps": [x_re, y_re, x_le, y_le, x_nt, y_nt, x_rm, y_rm, x_lm, y_lm] landmark coordinates
```

### 2.2 SFace 2021Dec Graph
```
Input:
  - Name: "data" (or "input")
  - Element Type: Float32
  - Shape: [1, 3, 112, 112]
  - Color order: BGR (values normalized to [0.0, 255.0])
Output:
  - Name: "output" (or "fc1")
  - Element Type: Float32
  - Shape: [1, 128]
  - Description: Unnormalized 128-D feature vector. Requires immediate L2 normalization.
```

---

## 3. RUNTIME EXECUTION PROVIDERS & WASM COMPATIBILITY

1. **Browser Environment (`apps/dfarm-collection-app`):**
   - Execution Provider: `wasm` (WebAssembly with SIMD and multi-threading where `SharedArrayBuffer` headers `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` are present).
   - Fallback: Single-threaded WebAssembly (`ort-wasm.wasm`).
2. **Mobile Environment (`apps/dfarm-customer-app`):**
   - Expo Camera frame capture $\to$ base64 JPEG $\to$ INT8 tensor buffer $\to$ `onnxruntime-react-native` / native bridging.
3. **Automated Integration Test Runner (`services/backend`):**
   - Execution Provider: `CPUExecutionProvider` via `onnxruntime-node`.
   - Deterministic seed fixture: `CANONICAL_SFACE_128D_FIXTURE` (validated unit length $1.0$).
