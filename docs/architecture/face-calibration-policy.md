# Face Recognition Model Verification & Calibration Policy

## 1. Discrepancy Reconciliation

Prior implementation phases exhibited duplicated, diverging cosine matching thresholds:
- **Phase 07 (Face Biometrics)**: `0.720` (Staging Calibration).
- **Phase 08 (Identification)**: `0.80` (Strict Staging).
- **Phase 10 (Collection Application)**: `0.85` (Conservative Staging).

In Phase 11, all modules across backend and mobile clients have been synchronized to the canonical threshold of **`0.720`**, controlled via the centralized `system_configurations` registry.

---

## 2. Model Binary Verification & Checksum Analysis

The official MobileFaceNet model artifact specification defines:
- **Architecture**: MobileFaceNet (ONNX Runtime).
- **Input Dimensions**: $1 \times 3 \times 112 \times 112$ RGB normalized float tensor.
- **Output Dimensions**: $128$-dimensional float vector.
- **Normalization**: $L_2$ Euclidean normalization prior to Cosine matching.

### 2.1 Actual Artifact Digest Inspection
During the Phase 11 codebase inspection, the SHA-256 checksum recorded in P07 was inspected:
$$\text{SHA-256} = \texttt{e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855}$$

This digest is mathematically identical to the SHA-256 hash of an empty byte string (`sha256("")`). No physical `.onnx` model binary exists in the repository.

### 2.2 Formal Verification Status
- **Status**: **`UNVERIFIED_EMPTY_DIGEST`** / **`STAGING_UNVERIFIED`**.
- **Production Approved**: **`isApprovedForProduction: false`**.
- **Rule**: Model wrapper classes and ONNX scaffolding exist in code, but real on-device inference has **not** been validated against genuine biometric weights.

---

## 3. Centralized Calibration Architecture

Calibration metadata is persisted centrally in PostgreSQL (`system_configurations`) and shared with mobile clients:

```json
{
  "key": "face_recognition_calibration",
  "modelVersion": "MobileFaceNet-v1-ONNX",
  "canonicalThreshold": 0.720,
  "embeddingDimensions": 128,
  "normalization": "L2",
  "similarityMetric": "COSINE",
  "artifactSha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "calibrationStatus": "STAGING_UNVERIFIED",
  "isApprovedForProduction": false,
  "failSafeBehavior": "REJECT_OR_FALLBACK_TO_RFID"
}
```

---

## 4. Fail-Safe Execution Behavior

Because the face recognition model artifact is not approved for production:
1. **No Autonomous Production Biometric Authentication**: The collection application will not rely on face recognition as the sole factor of identity.
2. **Mandatory Fallback**: The system automatically requires **RFID card tap** (`FALLBACK_TO_RFID`) or **manual supervisor verification** (`SUPERVISOR_OVERRIDE`).
3. **No Fabricated Thresholds**: The threshold `0.720` is maintained strictly as an unapproved baseline until physical on-device benchmark testing is conducted with authentic dairy field datasets.

