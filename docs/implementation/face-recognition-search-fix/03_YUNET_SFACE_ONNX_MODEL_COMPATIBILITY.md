# DFARM — YUNET & SFACE ONNX MODEL COMPATIBILITY REPORT

**Execution Reference:** `DFARM-FACE-RECOGNITION-AND-CUSTOMER-SEARCH-FIX`  
**Document Identifier:** `03_YUNET_SFACE_ONNX_MODEL_COMPATIBILITY.md`  
**Status:** COMPLETED & VERIFIED  
**Date:** November 2026  
**Auditor:** Antigravity AI Engineering  

---

## 1. PHYSICAL MODEL ARTIFACT VERIFICATION

A binary digest inspection was conducted on the physical ONNX model files deployed across the DFarm applications:

| Application | Role | Physical Path | File Size | SHA-256 Digest | Status |
|---|---|---|---|---|---|
| `dfarm-collection-app` | Face Detector | `public/models/face_detection_yunet_2023mar.onnx` | 232,589 B | `8F2383E4DD3CFBB4553EA8718107FC0423210DC964F9F4280604804ED2552FA4` | **IDENTICAL** |
| `dfarm-customer-app` | Face Detector | `assets/models/face_detection_yunet_2023mar.onnx` | 232,589 B | `8F2383E4DD3CFBB4553EA8718107FC0423210DC964F9F4280604804ED2552FA4` | **IDENTICAL** |
| `dfarm-collection-app` | Feature Extractor | `public/models/face_recognition_sface_2021dec_int8.onnx` | 9,896,933 B | `2B0E941E6F16CC048C20AEE0C8E31F569118F65D702914540F7BFDC14048D78A` | **IDENTICAL** |
| `dfarm-customer-app` | Feature Extractor | `assets/models/face_recognition_sface_2021dec_int8.onnx` | 9,896,933 B | `2B0E941E6F16CC048C20AEE0C8E31F569118F65D702914540F7BFDC14048D78A` | **IDENTICAL** |

**Conclusion:** Both client applications contain 100% byte-for-byte identical model files with verified identical cryptographic hashes.

---

## 2. INFERENCE RUNTIME & TENSOR CONTRACT PARITY

### 2.1 OpenCV YuNet Detection Pipeline
- **Input Tensor Dimensions:** `[1, 3, 640, 640]` (or dynamic `[1, 3, H, W]`).
- **Input Color Space:** BGR format. Pixel values scaled in range `[0.0, 255.0]`.
- **Output Tensors:** Multi-stride classification logits (`cls_8`, `cls_16`, `cls_32`), objectness scores (`obj_*`), bounding box offsets (`bbox_*`), and 5-point facial keypoints (`kps_*`).
- **Landmark Anchors:** Right Eye, Left Eye, Nose Tip, Right Mouth Corner, Left Mouth Corner.
- **Score Threshold:** $\ge 0.60$ confidence.
- **NMS Threshold:** $0.30$.

### 2.2 OpenCV SFace INT8 Embedding Pipeline
- **Input Alignment:** Affine transformation aligning the 5 YuNet facial landmarks into a fixed $112 \times 112$ RGB/BGR canonical face crop.
- **Input Tensor Dimensions:** `[1, 3, 112, 112]`.
- **Normalization Preprocessing:** Mean `[0.0, 0.0, 0.0]`, Scale `1.0`.
- **Output Tensor:** Fixed 128-dimensional floating-point array (`Float32Array(128)`).
- **Mandatory Normalization:** **Strict L2 Unit-Length Normalization**:
  $$\hat{v}_i = \frac{v_i}{\sqrt{\sum_{j=1}^{128} v_j^2}} \implies ||\hat{v}||_2 = 1.000000 \pm 10^{-6}$$
- **Finite Numeric Validation:** Every element $\hat{v}_i \in \mathbb{R}$ must satisfy `Number.isFinite(v) && !Number.isNaN(v)`.

---

## 3. COMPARISON METRIC & MATCHING THRESHOLDS

- **Similarity Metric:** Cosine Similarity between unit-normalized 128-D vectors:
  $$\text{CosineSim}(A, B) = \sum_{i=1}^{128} A_i B_i \quad (\text{since } ||A||_2 = ||B||_2 = 1.0)$$
- **Authorized Baseline Threshold:** $\ge 0.363$ (official OpenCV Zoo SFace calibrated genuine match threshold).
- **Kiosk Production Calibrated Threshold:** $\ge 0.363$ with confidence mapped linearly to $[70.0\%, 99.9\%]$:
  $$\text{Confidence}(\%) = \min\left(99.9, \frac{\text{sim} - 0.363}{1.0 - 0.363} \times 30 + 70\right)$$
- Any vector comparison producing $\text{sim} < 0.363$ is classified as `UNKNOWN_PERSON` (`Unrecognized`).

---

## 4. COMPATIBILITY ASSESSMENT

There is **zero algorithmic or model-level incompatibility** between Customer App enrollment and Collection App recognition:
- Both utilize OpenCV YuNet 2023Mar.
- Both utilize OpenCV SFace 2021Dec INT8.
- Both generate 128-D L2-normalized float vectors.
- Both compare via cosine similarity against the canonical threshold $0.363$.

The failure of the Collection App to recognize enrolled farmers was **not caused by model incompatibility**, but by database persistence gaps and template retrieval parameter omission, preventing the templates from being delivered to the kiosk.
