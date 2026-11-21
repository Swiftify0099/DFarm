# 02. YUNET & SFACE MODEL COMPATIBILITY REPORT

**Execution Reference:** `DFARM-FACE-ENROLLMENT-RECOGNITION-END-TO-END-FIX`  
**Target:** ONNX Models, Checksums, Color Spaces, Preprocessing, Landmark Alignment, and Normalization  
**Date:** 2026-11-19  

---

## 1. Verified Model Files & Cryptographic Checksums

The OpenCV ONNX model binaries deployed across the DFarm ecosystem were verified using SHA-256 checksums to ensure 100% parity with the verified Google Colab pipeline:

| Model Component | Filename | Size (Bytes) | SHA-256 Checksum | Colab Parity |
|---|---|---|---|:---:|
| **Face Detector** | `face_detection_yunet_2023mar.onnx` | 232,589 | `8F2383E4DD3CFBB4553EA8718107FC0423210DC964F9F4280604804ED2552FA4` | **MATCH** |
| **Face Recognizer** | `face_recognition_sface_2021dec_int8.onnx` | 9,896,933 | `2B0E941E6F16CC048C20AEE0C8E31F569118F65D702914540F7BFDC14048D78A` | **MATCH** |

### File Locations in Workspace:
- Customer Mobile App: `apps/dfarm-customer-app/assets/models/`
- Collection Terminal (Public Assets): `apps/dfarm-collection-app/public/models/`
- Collection Terminal (Build Artifacts): `apps/dfarm-collection-app/dist/models/`

---

## 2. Model Input & Preprocessing Pipeline Parity

To ensure that embeddings generated in Customer App enrollment match probes in the Collection App kiosk, the preprocessing pipeline must adhere strictly to OpenCV's specifications:

```
[Camera Frame 1280x720 / 640x640]
       │
       ▼ (Resize & Canvas Draw)
[YuNet Input: 1 x 3 x 640 x 640]
       │   Color Format: Planar BGR [B, G, R]
       │   Normalization: Raw float32 in [0, 255]
       ▼
[OpenCV YuNet Detection Engine]
       │   Outputs 12 Strides: cls_{8,16,32}, obj_{8,16,32}, bbox_{8,16,32}, kps_{8,16,32}
       │   Confidence Threshold: score >= 0.60
       ▼
[Detected Face Bounding Box + 5 Landmarks]
       │   Right Eye, Left Eye, Nose Tip, Right Mouth, Left Mouth
       ▼ (Landmark Quality Check & SFace Crop)
[SFace Input: 1 x 3 x 112 x 112]
       │   Color Format: Planar BGR [B, G, R]
       │   Normalization: Raw float32 in [0, 255]
       ▼
[OpenCV SFace INT8 Embedding Engine]
       │   Quantization: INT8
       │   Raw Output: 1 x 128 float32 vector
       ▼
[Post-Processing: Unit L2 Normalization]
       │   v_norm = v / ||v||_2
       ▼
[Multi-Sample Averaging (5 Frames during Enrollment)]
       │   v_avg[i] = (1/5) * sum_{k=1..5} v_k[i]
       │   v_final = v_avg / ||v_avg||_2
       ▼
[Storage in Tenant PostgreSQL / Comparison via Cosine Similarity]
```

---

## 3. Mathematical Compatibility Audit

### 3.1 Landmark Alignment Quality Check
The alignment check assesses three facial geometry criteria:
1. **Inter-pupillary distance & roll tilt**:
   $$\text{Tilt Angle} = \left| \arctan\left(\frac{y_{le} - y_{re}}{x_{le} - x_{re}}\right) \right| \times \frac{180^\circ}{\pi} \le 18^\circ$$
2. **Nose Centering (Yaw symmetry)**:
   $$\text{Offset} = \left| x_{nose} - \frac{x_{re} + x_{le}}{2} \right| \le 0.45 \times \text{EyeDistance}$$
3. **Mouth Centering & Elevation**:
   $$\frac{y_{rm} + y_{lm}}{2} > y_{nose}$$

### 3.2 Cosine Similarity Metric
Because SFace embeddings are L2 unit-normalized ($\|A\|_2 = 1$, $\|B\|_2 = 1$), cosine similarity simplifies directly to the dot product:
$$\text{Cosine Similarity}(A, B) = \frac{A \cdot B}{\|A\|_2 \|B\|_2} = \sum_{i=1}^{128} A_i B_i$$

### 3.3 Calibrated Threshold Governance
- **OpenCV SFace INT8 Benchmark Threshold**: $0.363$.
- Any cosine similarity $\ge 0.363$ represents a positive genuine match.
- High-confidence match: $\ge 0.70$ (mapped to $90\%+$ UI confidence score).
- Orthogonal / Unrelated identity: $\le 0.20$ (mapped to `UNKNOWN_PERSON`).
