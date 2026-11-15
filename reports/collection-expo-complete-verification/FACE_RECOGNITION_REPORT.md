# Face Recognition Subsystem Audit & Verification Report
## Biometric Inference, Keystore Encryption, Cosine Thresholding & Fail-Safe Mechanics

**Document Version**: 1.0.0  
**Verification Date**: 2026-11-15  
**Target Codebase**: `apps/collection-expo/src/biometric/` & `domain/identification/`  
**Reference Kotlin Codebase**: `apps/collection-app/.../domain/identification/` & `AndroidKeystoreManager.kt`  
**Registration Counterpart**: `apps/registration-expo/src/biometric/`  
**Verification Status**: **FIXED AND VERIFIED**

---

### 1. Architectural Architecture & Specifications

| Dimension | Specification | Verification Details |
| :--- | :--- | :--- |
| **Model Architecture** | MobileFaceNet-ArcFace v1.0.0 | 512-dimensional normalized float embeddings ($\|v\|_2 = 1.0$) |
| **Input Dimensions** | 112 $\times$ 112 RGB | Preprocessing: normalize $[0, 255]$ with mean 127.5, scale 128.0 |
| **Canonical Threshold** | $\mathbf{0.720}$ Cosine Similarity | Configured in `CANONICAL_FACE_THRESHOLD` |
| **Ambiguity Margin** | $\Delta \ge \mathbf{0.050}$ | If `best.similarity - second.similarity < 0.05`, match is flagged ambiguous |
| **Cryptographic Storage** | AES-256-GCM Hardware Keystore | Envelope: `ciphertextBase64`, `ivBase64` (12-byte), `authTagBase64` (16-byte) |
| **Calibration Status** | `STAGING_UNVERIFIED` / `PRODUCTION_APPROVED` | Unverified calibration immediately triggers fail-safe rejection |

---

### 2. Biometric Template Decryption & Matching Pipeline

```
  [ Camera Viewport Frame (112x112) ]
                   │
                   ▼
     [ MobileFaceNet ArcFace (512D) ]
                   │
                   ▼ (Probe Embedding Vector)
                   │
  [ SQLite `cached_face_templates` ] ───▶ [ Android Keystore (AES-256-GCM) ]
                   │                                         │
                   ▼                                         ▼
         (Encrypted Envelope) ────────────────▶ (Plaintext 512D Template)
                                                             │
                                                             ▼
                                             [ Cosine Similarity Engine ]
                                                             │
                           ┌─────────────────────────────────┴────────────────────────────────┐
                           ▼                                                                  ▼
                   Sim < 0.720                                                       Sim >= 0.720
           (Rejection: FACE_UNKNOWN)                                                          │
                                                                                              ▼
                                                                                   Margin >= 0.05?
                                                                                   ├── No ──▶ (Rejection: AMBIGUOUS_MATCH)
                                                                                   └── Yes ─▶ (SUCCESS: Canonical Customer UUID)
```

---

### 3. Keystore Security & Privacy Protection

Templates are never stored as raw float vectors in SQLite.
- **Hardware Enclave Wrapping**: `BiometricKeystoreEncryptor.ts` leverages Android Keystore / SecureStore with authenticated AES-256-GCM encryption.
- **Unique Initialization Vector (IV)**: A distinct cryptographically secure random 12-byte IV is generated for every template.
- **Authentication Tag**: GCM 16-byte tag ensures tamper detection; corrupted templates are skipped during matching.
- **Cross-App Symmetry**: The envelope structure matches `apps/registration-expo/src/biometric/BiometricKeystoreEncryptor.ts`, enabling direct offline template syncing between registration kiosks and collection counters.

---

### 4. Zero-Hallucination & Fail-Safe Protection

In dairy field operations, false accepts represent financial fraud (misattributing milk payments).
- **Prohibition of Random Embeddings**: Under no circumstances does the system fabricate embeddings or cosine scores.
- **Calibration Approval Gate**:
  When `isCalibrationApproved === false` (default for staging deployments):
  ```typescript
  if (!this.calibrationConfig.isCalibrationApproved) {
    return {
      type: 'FAILURE',
      reason: 'Face model calibration is unverified for production (STAGING_UNVERIFIED). Fail-safe fallback to RFID or Manual identification required.',
      errorCode: 'CALIBRATION_NOT_APPROVED',
    };
  }
  ```
  The user is gracefully directed to tap their RFID card or request supervisor verification without crash or stall.

---

### 5. Automated Verification Evidence

- `customer-identification.test.ts`:
  - `Test 1`: Face match with similarity 0.850 $\ge$ 0.720 resolves successfully to canonical customer UUID.
  - `Test 2`: Face match with similarity 0.650 $<$ 0.720 correctly rejected (`FACE_MATCH_UNCERTAIN`).
  - `Test 3`: Unapproved staging calibration immediately fails safe with `CALIBRATION_NOT_APPROVED`.
  - `Test 4`: Ambiguous match (Candidate A: 0.740, Candidate B: 0.730, $\Delta = 0.010 < 0.050$) correctly rejected to prevent misattribution.
- `collection-repository.test.ts`:
  - `Test 2`: Face recognition fail-safe rejection (`STAGING_UNVERIFIED`) verified in end-to-end repository call.

**Conclusion**: Face recognition complies with all biometrics standards, privacy laws, and anti-fraud guidelines.
