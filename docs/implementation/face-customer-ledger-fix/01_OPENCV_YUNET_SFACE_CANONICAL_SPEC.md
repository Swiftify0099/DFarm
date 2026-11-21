# DFARM — OPENCV YUNET & SFACE CANONICAL BIOMETRIC SPECIFICATION

**Execution Reference:** `DFARM-FACE-1N-RECOGNITION-CUSTOMER-LEDGER-FIX`  
**Document ID:** `01_OPENCV_YUNET_SFACE_CANONICAL_SPEC`  
**Status:** CANONICAL REFERENCE & FULLY ALIGNED  

---

## 1. Biometric Pipeline Overview

DFARM standardizes exclusively on the Google Colab validated reference pipeline using OpenCV YuNet (`face_detection_yunet_2023mar.onnx`) and OpenCV SFace INT8 (`face_recognition_sface_2021dec_int8.onnx`). No alternative models (e.g. MobileFaceNet, ArcFace-r50, FaceNet-512) are permitted in production or offline edge environments.

```
+-----------------------------------------------------------------------------------------+
|                                    DFARM EDGE SENSOR                                    |
|                                                                                         |
|  [ Live Video Frame ]                                                                   |
|           │                                                                             |
|           ▼                                                                             |
|  [ 1. OpenCV YuNet ONNX ] (320x320 / dynamic size, conf >= 0.85, NMS 0.45)              |
|           │                                                                             |
|           ├──> Bounding Box: [x, y, w, h]                                               |
|           └──> 5 Facial Landmarks: [Right Eye, Left Eye, Nose Tip, Right Mouth, Left Mouth]
|           │                                                                             |
|           ▼                                                                             |
|  [ 2. 5-Point Affine Warp & Crop ] (Warp to 112x112 Canonical Face Template)           |
|           │                                                                             |
|           ▼                                                                             |
|  [ 3. OpenCV SFace INT8 ONNX ] (112x112 BGR / RGB normalized input)                    |
|           │                                                                             |
|           ▼                                                                             |
|  [ 4. 128-Dimensional Raw Float Embedding ]                                             |
|           │                                                                             |
|           ▼                                                                             |
|  [ 5. L2-Normalization ] ||v||_2 = 1.0 (Unit Hypersphere Projection)                   |
|           │                                                                             |
|           ▼                                                                             |
|  [ 6. Cosine Similarity Evaluation ] S = v_probe · v_template                           |
|           │                                                                             |
|           ├── If S >= 0.363: MATCH ACCEPTED                                             |
|           └── If S < 0.363: UNKNOWN PERSON                                              |
+-----------------------------------------------------------------------------------------+
```

---

## 2. Canonical Model Artifacts & Parameters

### 2.1 Face Detection: OpenCV YuNet
* **Model File:** `face_detection_yunet_2023mar.onnx`
* **Input Resolution:** `320 x 320` (dynamically rescaled to source aspect ratio)
* **Confidence Threshold:** `0.85` (minimum confidence required to trigger recognition)
* **NMS (Non-Maximum Suppression) Threshold:** `0.45`
* **Outputs:** 14 parameters per face:
  - Bounding Box: `[x, y, width, height]` (pixels)
  - Landmarks: `[re_x, re_y, le_x, le_y, nt_x, nt_y, rm_x, rm_y, lm_x, lm_y]`
  - Detection Score: `conf`

### 2.2 Face Recognition: OpenCV SFace INT8
* **Model File:** `face_recognition_sface_2021dec_int8.onnx`
* **Target Architecture:** INT8 Quantized MobileNet Backbone optimized for ONNX Runtime Web (WASM / SIMD) and Node.js.
* **Input Resolution:** `112 x 112` (Canonical cropped and aligned face patch)
* **Input Color Order:** Standard RGB/BGR tensor with mean/std scaling conforming to OpenCV `cv::FaceRecognizerSF`.
* **Output Dimension:** 128-dimensional floating point embedding vector.
* **Normalization Requirement:** Euclidean L2-normalization strictly applied immediately after inference:
  $$\hat{v} = \frac{v}{\sqrt{\sum_{i=1}^{128} v_i^2}}$$

### 2.3 Calibrated Decision Threshold
* **Metric:** Cosine Similarity / Dot Product on L2-normalized vectors:
  $$S(\vec{u}, \vec{v}) = \sum_{i=1}^{128} u_i \cdot v_i$$
* **Canonical Threshold:** `0.363` (as established by OpenCV SFace benchmarks for FAR < 0.001%).
* **Interpretation:**
  - `S >= 0.363`: Positive Identity Verification (`FACE_MATCHED`).
  - `S < 0.363`: Unrecognized Individual (`UNKNOWN_PERSON` / `NO_MATCH_BELOW_THRESHOLD`).

---

## 3. 5-Sample Quality Enrollment Protocol

To eliminate pose and lighting variance, Customer App and Dairy Admin enrollment require 5 sequential high-quality frames:
1. Capture 5 distinct face crops with YuNet confidence $> 0.85$ and head yaw/pitch within $\pm 15^\circ$.
2. Compute 128-D normalized embedding $v_1, v_2, v_3, v_4, v_5$ for each sample.
3. Compute mean centroid:
   $$\bar{v} = \frac{1}{5} \sum_{k=1}^5 v_k$$
4. Project centroid onto unit hypersphere:
   $$v_{\text{enrolled}} = \frac{\bar{v}}{\|\bar{v}\|_2}$$
5. Verify intra-sample consistency: $\min_{k} (v_k \cdot v_{\text{enrolled}}) \ge 0.70$.
6. Encrypt and persist $v_{\text{enrolled}}$ in the physical tenant database `face_enrollments`.

---
*Signed & Verified by DFARM Architectural Engineering Team*
