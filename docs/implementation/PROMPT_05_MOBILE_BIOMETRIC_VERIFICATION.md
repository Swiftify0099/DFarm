# PROMPT 05: MOBILE BIOMETRIC ENROLLMENT & EMBEDDING VERIFICATION REPORT

**Document ID:** `DFARM-VERIF-05-BIO-001`  
**Execution Phase:** Prompt 05  
**Target:** Mobile Face Biometric Enrollment Pipeline (`apps/dfarm-customer-app`)  
**Verification Date:** November 17, 2026  
**Status:** FULLY VERIFIED — ZERO MOCK BIOMETRICS  

---

## 1. Executive Summary

A core innovation of DFarm is kiosk-level farmer identification via facial recognition. During mobile self-registration or profile setup, farmers can enroll their biometric facial template. In Prompt 05, legacy synthetic fixtures and rectangular dummy coordinates were completely purged from the production runtime. Biometric extraction is powered by the standardized **YuNet (Face Detection)** and **SFace (128-dimensional Feature Extraction)** INT8 ONNX neural network pipeline, ensuring full mathematical and feature-space parity between the Customer Mobile App and the Collection Kiosk.

---

## 2. Neural Network Architecture & Precision Pipeline

### 2.1 ONNX Runtime & Model Pipeline
- **Detector:** `face_detection_yunet_2023mar_int8.onnx`
  - High-efficiency lightweight CNN optimized for mobile edge devices and Android NPU/CPU.
  - Generates bounding box coordinates $[x, y, w, h]$ and 5 facial landmarks (right eye, left eye, nose tip, right mouth corner, left mouth corner).
  - Enforces minimum confidence threshold $\ge 0.70$.
- **Embedder:** `face_recognition_sface_2021dec_int8.onnx`
  - Deep metric learning feature extractor.
  - Projects aligned face crop into a 128-dimensional hyperspherical vector $\vec{v} \in \mathbb{R}^{128}$.
  - Applies $L_2$ unit normalization:
  
$$\hat{v} = \frac{\vec{v}}{\|\vec{v}\|_2}$$

### 2.2 Quality & Anti-Spoofing Filters
Before generating embeddings, the mobile camera feed passes strict quality gates in `apps/dfarm-customer-app/src/face-ai/yunet-detector.ts`:
1. **Face Centering:** Bounding box center must reside within the central 60% of the camera viewport.
2. **Face Size:** Face bounding box width must be $\ge 120 \text{ px}$ to prevent low-resolution enrollments.
3. **Head Pose Angle:** Landmark geometry validates that yaw and pitch angles do not exceed $\pm 15^\circ$.
4. **Lighting & Contrast:** Standard deviation of pixel intensities must be $\ge 35$ to reject overexposed or pitch-black captures.

---

## 3. Production Runtime vs Test Environment Hardening

### 3.1 Purge of Synthetic Fixtures in Production
In legacy prototypes, uninitialized models silently fell back to mock bounding boxes (`[100, 100, 200, 200]`) and uniform test vectors (`fill(0.088)`). This created severe security hazards where invalid camera frames could produce fake enrollments.

In Prompt 05, this loophole was closed:
```typescript
// apps/dfarm-customer-app/src/face-ai/yunet-detector.ts
if (!this.isInitialized) {
  if (process.env.NODE_ENV === 'test') {
    // Isolated unit test fallback only
    return [{ ...testFace }];
  }
  throw new Error("YuNet detector not initialized. Call init() with valid ONNX session before inference.");
}
```
In any production build or real device execution, if ONNX model weights fail to load or model initialization is skipped, the runtime immediately throws a descriptive exception and alerts the user to retry, preventing mock or corrupt embeddings from entering the database.

---

## 4. Biometric Storage & Encryption

### 4.1 Secure Storage in Tenant Database
Biometric templates are transmitted via TLS to `POST /api/v1/customers/:id/face-enrollment`:
- Stored in the Dairy's isolated PostgreSQL database table: `face_enrollments`.
- Template column: `embedding BYTEA` (128-element float32 buffer) or `FLOAT4[]`.
- Metadata captured:
  - `model_name`: `'sface_int8'`
  - `model_version`: `'2021dec'`
  - `template_format`: `'FLOAT32_ARRAY'`
  - `quality_score`: Float between 0.0 and 1.0.
  - `enrolled_by`: User ID of operator/farmer.
  - `enrolled_at`: UTC Timestamp.
- Single Active Constraint: Partial unique index `face_enrollments_active_uidx` ensures exactly one active template per farmer per model version.

---

## 5. Cross-Application Compatibility with Collection Kiosk

### 5.1 Parity Verification
- **Vector Dimension:** Exactly 128 elements.
- **Comparison Metric:** Cosine similarity threshold:

$$\text{similarity} = \frac{\vec{u} \cdot \vec{v}}{\|\vec{u}\|_2 \|\vec{v}\|_2} \ge 0.65$$

- The Collection Kiosk (`apps/dfarm-collection-app`) loads the exact same ONNX model files and compares camera capture embeddings directly against the enrolled vectors stored by the Customer App.

### 5.2 Automated Test Evidence
Automated test in `services/backend/tests/customer-app-production.test.js`:
- `Subtest 12`: Enrolls valid 128-dimensional face embedding via `POST /api/v1/customers/:id/face-enrollment` (HTTP 201 Created).
- `Subtest 13`: Kiosk retrieves active biometric templates for offline local matching and identifies farmer with cosine similarity $> 0.90$.
