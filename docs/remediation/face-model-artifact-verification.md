# Face Model Artifact Verification & Calibration Report
**DFarm — Smart Dairy Management System**  
**Remediation Deliverable 04**  

---

## 1. Biometric Model Artifact Audit

### 1.1 Artifact Checksum Truth
During the Phase 07 audit, the recorded model artifact checksum was:
```
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```
**Cryptographic Finding**:
`e3b0c442...` is the well-known SHA-256 hash of an **empty string** (`SHA256("")`).
Inspecting the filesystem across the entire repository confirmed that **zero** `.tflite`, `.onnx`, or `.pb` neural network weight files exist in `services/backend/` or `apps/registration-android/`.

### 1.2 Mathematical Behavior of Current Model
The implementation in `apps/registration-android/app/src/main/kotlin/com/dfarm/registration/biometric/FaceEmbeddingModel.kt` (`MobileFaceNetModel.kt`) currently performs a synthetic deterministic projection:
- Ingests mock or preprocessed face bitmaps.
- Applies a synthetic mathematical hashing function producing 512 float values.
- L2-normalizes the vector such that $\|v\|_2 = 1.0$.

While structurally compliant with the 512-dimensional vector format required by PostgreSQL `face_enrollments.embedding` and the distance comparison engine, this does **NOT** represent real neural facial recognition inference.

---

## 2. Corrective Metadata & Status Remediation

In Migration 015 and `services/backend/src/biometric/model-service.ts`, the system was updated to declare truthful metadata:

| Attribute | Prior Claim | Remediated Value | Rationale |
|---|---|---|---|
| Model Name | MobileFaceNet-ArcFace | MobileFaceNet-ArcFace v1.0.0 | Canonical baseline version |
| Embedding Dimension | 512 | 512 | Matches Float32[512] vector |
| Artifact Digest | `e3b0c44298fc1c149afbf...` | `INVALID_EMPTY_HASH` | Acknowledges missing weights |
| Calibration Status | `CALIBRATED` | `NOT_CALIBRATED` | No physical threshold calibration conducted |
| Artifact Status | `VERIFIED` | `UNVERIFIED_EMPTY_DIGEST` | Prevents false claims of production readiness |
| Operational State | Production Ready | `BLOCKED_BY_ARTIFACT` | Blocked until physical weights are trained/integrated |
| Recommended Threshold | 0.720 (Cosine Distance) | 0.720 (Theoretical) | Theoretical baseline; requires empirical calibration |

---

## 3. Re-Enrollment Mechanism (`face_re_enrollment_jobs`)

To support seamless transition once real model weights are trained and supplied, Migration 015 created the `face_re_enrollment_jobs` table:
```sql
CREATE TABLE IF NOT EXISTS public.face_re_enrollment_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_model_version_id UUID NOT NULL REFERENCES public.face_model_versions(id),
    target_model_version_id UUID NOT NULL REFERENCES public.face_model_versions(id),
    total_customers INT NOT NULL DEFAULT 0,
    re_enrolled_count INT NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CLOCK_TIMESTAMP()
);
```

### Transition Protocol:
1. Supply real quantized TFLite model weights (e.g., `mobilefacenet_arcface_v1_quant.tflite`).
2. Calculate true SHA-256 digest of binary weight file.
3. Insert new row in `face_model_versions` with verified checksum.
4. Run empirical calibration against farmer face dataset to determine true FAR / FRR threshold.
5. Create re-enrollment job to flag existing customers for updated facial capture during center visits.
