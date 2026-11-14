# DFarm Face Enrollment & Recognition Developer Guide

## 1. Overview & Android Registration App Integration

In Phase 07, the Android Registration App (`apps/registration-android`) is extended with a biometric enrollment engine. The workflow seamlessly continues from customer registration (Phase 06):
1. **Officer Login**: Registration Officer authenticates via JWT.
2. **Customer Selection**: Officer selects an existing customer record (`customers.id` UUID).
3. **Biometric Consent Attestation**: Officer reads vernacular disclosure and records consent.
4. **Camera Capture & Quality Feedback**: Real-time HUD analyzes facial sharpness, lighting, pose angles, and distance.
5. **Multi-Sample Challenge**: Collects 3 valid micro-pose samples to ensure temporal consistency and active liveness.
6. **Hardware Keystore Envelope & Submission**: Android encrypts or formats the template and submits it over HTTPS to the backend.
7. **Canonical Status Transition**: Customer advances to `PENDING_RFID_ASSIGNMENT` (ready for Phase 08).

---

## 2. Android Component Architecture

### 2.1 Package Layout (`com.dfarm.registration.biometric`)
- `FaceQualityAnalyzer.kt`: Computes Laplacian sharpness, mean luminance, standard deviation variance, head pose angles, and inter-pupillary distance.
- `FaceAlignment.kt`: Estimates 2D affine similarity transform matrix (Umeyama algorithm) and normalizes pixels to $[-1.0, 1.0]$.
- `FaceEmbeddingModel.kt` & `MobileFaceNetModel.kt`: Generates 512-dimensional unit-normalized float32 vectors and computes cosine similarity.
- `LivenessChallengeCoordinator.kt`: Manages multi-sample capture state machine and interactive challenge prompts.

### 2.2 UI Architecture (`com.dfarm.registration.ui.enrollment`)
- `FaceEnrollmentScreen.kt`: Jetpack Compose screen with CameraX preview, oval alignment guide, real-time quality indicator chips (Sharpness, Lighting, Pose, IPD), challenge banner, and capture progress bar.
- `FaceEnrollmentViewModel.kt`: Coordinates camera frames, evaluates quality gates, executes client-side template encryption, and communicates with `FaceApiService`.

---

## 3. Backend REST APIs

All endpoints require `Authorization: Bearer <JWT_TOKEN>` with `REGISTRATION_OFFICER`, `SUPERVISOR`, or `ADMIN` roles.

### 3.1 Enroll Face Biometric Template

```http
POST /api/v1/customers/:customerId/face-enroll
Content-Type: application/json
```

#### Request Payload
```json
{
  "modelVersionId": "f0000000-0000-4000-a000-000000000001",
  "encryptedTemplate": {
    "ciphertext": "f2a8...e3",
    "iv": "3a91...bc",
    "authTag": "81c0...92",
    "keyReference": "key-v1-2026",
    "algorithm": "AES-256-GCM"
  },
  "qualityScore": 0.88,
  "livenessScore": 0.84,
  "livenessClassification": "RESTRICTED_PASS",
  "capturedSampleCount": 3,
  "deviceId": "TAB-SANGLI-04",
  "officerConsentConfirmation": true
}
```

#### Response (201 Created)
```json
{
  "success": true,
  "data": {
    "enrollmentId": "c6a25e98-18e0-4966-bf57-080c98f8211b",
    "customerId": "c1111111-1111-4111-a111-111111111111",
    "modelVersionId": "f0000000-0000-4000-a000-000000000001",
    "qualityScore": 0.88,
    "livenessScore": 0.84,
    "livenessClassification": "RESTRICTED_PASS",
    "status": "ACTIVE",
    "enrolledAt": "2026-11-13T16:50:00.000Z"
  }
}
```

### 3.2 Get Customer Face Enrollment Status

```http
GET /api/v1/customers/:customerId/face-status
```

#### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "customerId": "c1111111-1111-4111-a111-111111111111",
    "hasEnrolledFace": true,
    "enrollmentId": "c6a25e98-18e0-4966-bf57-080c98f8211b",
    "modelName": "MobileFaceNet-ArcFace",
    "modelVersion": "v1.0.0",
    "qualityScore": 0.88,
    "livenessScore": 0.84,
    "status": "ACTIVE",
    "enrolledAt": "2026-11-13T16:50:00.000Z",
    "retentionPolicy": "POLICY_SUBJECT_TO_CONSENT",
    "consentActive": true
  }
}
```

> [!NOTE]
> This endpoint **never** outputs ciphertexts, IVs, authentication tags, or floating-point embeddings under any circumstance.

### 3.3 Revoke Customer Face Enrollment

```http
POST /api/v1/customers/:customerId/face-revoke
Content-Type: application/json
```

#### Request Payload
```json
{
  "reason": "Customer exercised DPDP Act right to biometric revocation",
  "permanentErasure": false,
  "officerNotes": "Physical consent withdrawal form verified"
}
```

#### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "revokedCount": 1,
    "customerId": "c1111111-1111-4111-a111-111111111111",
    "status": "REVOKED"
  }
}
```

### 3.4 List Registered Face Models

```http
GET /api/v1/identity/face-models
```

#### Response (200 OK)
```json
{
  "success": true,
  "data": [
    {
      "id": "f0000000-0000-4000-a000-000000000001",
      "modelName": "MobileFaceNet-ArcFace",
      "modelVersion": "v1.0.0",
      "embeddingDimension": 512,
      "similarityMetric": "COSINE",
      "recommendedThreshold": 0.720,
      "preprocessingVersion": "insightface-112x112-v1",
      "modelLicense": "Apache-2.0",
      "isActive": true,
      "calibrationStatus": "CALIBRATED_STAGING_v1"
    }
  ]
}
```

---

## 4. Running the Test Suites

### 4.1 Backend 20-Scenario Biometric Test Suite
```powershell
node --test services/backend/tests/biometric-engine.test.js
```

### 4.2 Android Biometric Unit Test Suite
```powershell
gradle.bat -p apps/registration-android testDebugUnitTest
```
