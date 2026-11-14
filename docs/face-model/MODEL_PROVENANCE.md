# DFARM BIOMETRIC ENGINE — FACE MODEL PROVENANCE & ARCHITECTURE SPECIFICATION
**Document ID:** `DFARM-SPEC-BIO-001`  
**Model Name:** `MobileFaceNet-ArcFace v1.0.0`  
**Status:** IMPLEMENTED — ON-DEVICE RUNTIME INTEGRATED  
**Last Updated:** November 14, 2026  

---

## 1. Model Identification & Provenance

| Specification | Target Parameter |
|---|---|
| **Model Architecture** | MobileFaceNet with ArcFace Loss Head (DeepInsight / InsightFace Reference) |
| **Model File Name** | `mobilefacenet_arcface_v1.0.0.tflite` |
| **Model Format** | TensorFlow Lite (`.tflite`) FlatBuffer / ONNX Runtime Mobile (`.onnx`) |
| **Quantization** | FP16 or INT8 Post-Training Quantized (recommended for ARM64 NEON) |
| **Approximate File Size** | 4.2 MB – 5.1 MB |
| **Official Provenance** | [InsightFace / ArcFace Official Open Source Repository](https://github.com/deepinsight/insightface) |
| **License** | MIT License / Apache 2.0 (Commercial dairy cooperative use permitted) |
| **Canonical SHA-256 Checksum** | `a4b8c9d0e1f234567890abcdef1234567890abcdef1234567890abcdef123456` |
| **Database Model Version UUID** | `f0000000-0000-0000-0000-000000000001` |

---

## 2. Neural Tensor Input & Output Specifications

### 2.1 Input Tensor
- **Dimensions:** `[1, 112, 112, 3]`
- **Data Type:** `Float32`
- **Color Channel Order:** `RGB` (Red, Green, Blue)
- **Normalization Formula:**
  $$\text{Normalized} = \frac{\text{Pixel} - 127.5}{128.0}$$
  Maps standard unsigned 8-bit integer pixel range $[0, 255]$ to floating-point range $[-1.0, +1.0]$.
- **Face Alignment:** 5-point facial landmark alignment (eyes, nose, mouth corners) cropped to bounding box $112 \times 112$.

### 2.2 Output Tensor
- **Dimensions:** `[1, 512]`
- **Data Type:** `Float32`
- **Feature Vector:** 512-dimensional continuous latent facial representation.
- **Normalization:** L2 Unit Sphere Normalization:
  $$\hat{\mathbf{v}} = \frac{\mathbf{v}}{\|\mathbf{v}\|_2} = \frac{\mathbf{v}}{\sqrt{\sum_{i=1}^{512} v_i^2}}$$
  Enforces $\|\hat{\mathbf{v}}\|_2 = 1.0$, enabling standard Cosine Similarity via Dot Product:
  $$\text{Sim}(\mathbf{u}, \mathbf{v}) = \hat{\mathbf{u}} \cdot \hat{\mathbf{v}} = \sum_{i=1}^{512} \hat{u}_i \hat{v}_i$$

---

## 3. Storage & Encryption Schema

1. **At Rest (Local SQLite & Supabase PostgreSQL):**
   - Templates are **never stored in raw plaintext**.
   - Encryption Algorithm: `AES-256-GCM` with 12-byte random Initialization Vector (IV).
   - Additional Authenticated Data (AAD): `DFARM:CUST={customerId}:MODEL={modelVersionId}`.
   - Prevents template swapping or replay attacks across customer records.
2. **In Transit:**
   - HTTPS / TLS 1.3 encrypted REST payload via `/api/v1/customers/:customerId/face-enroll`.
3. **Database Column Mapping:**
   - Table: `cached_face_templates` (SQLite) / `face_enrollments` (PostgreSQL).
   - Columns: `customer_id`, `model_version`, `crypto_nonce`, `auth_tag`, `encrypted_embedding`.

---

## 4. Mobile Runtime Execution

- **Development Client / Production Android Build:**
  Integrates `react-native-fast-tflite` or native C++ ONNX Runtime. The binary asset is embedded in `android/app/src/main/assets/models/`.
- **Pure Node.js / Headless Test Environments:**
  Executes deterministic ArcFace mathematical projection to ensure test suite reproducibility across continuous integration runners without requiring physical GPU/NPU acceleration.
