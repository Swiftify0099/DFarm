# DFarm Customer App — Face Registration Flow Specification

## 1. Overview & Architecture

The DFarm Customer App face registration flow provides secure, on-device biometric enrollment during customer onboarding. The system operates entirely with the approved OpenCV YuNet and OpenCV SFace INT8 neural network models, guaranteeing that no mock vectors, dummy algorithms (`Math.sin`), or simulated successes are used.

```
+---------------------------------------------------------------------------------------------------+
|                                      CUSTOMER MOBILE DEVICE                                       |
|                                                                                                   |
|  +---------------------+        +--------------------+        +--------------------------------+  |
|  |  (onboarding)/      |        |  Expo Camera       |        |  FaceEngine                    |  |
|  |  face-enroll.tsx    | -----> |  CameraView        | -----> |  (YuNet 640x640 + SFace INT8)  |  |
|  |  Claymorphism UI    |        |  facing="front"    |        |  128-D L2 Normalized Vector    |  |
|  +---------------------+        +--------------------+        +--------------------------------+  |
+-------------------------------------------------------------------------------|-------------------+
                                                                                | HTTPS Encrypted
                                                                                v
+---------------------------------------------------------------------------------------------------+
|                                      DFARM BACKEND API SERVER                                     |
|                                                                                                   |
|  +-------------------------------------+        +----------------------------------------------+  |
|  |  POST /api/v1/customers/register    |        |  BiometricEngine / AES-256-GCM               |  |
|  |  or /:id/biometrics/update          | -----> |  - Encrypt template with KMS Master Key      |  |
|  |  Payload validation & tenant check  |        |  - Compute SHA-256 template checksum         |  |
|  +-------------------------------------+        +----------------------------------------------+  |
|                                                                                |                  |
|                                                                                v                  |
|  +---------------------------------------------------------------------------------------------+  |
|  |  POSTGRESQL DATABASE (Multi-tenant)                                                         |  |
|  |  - face_enrollments (encrypted_template, template_hash, model_version, is_active=true)        |  |
|  |  - customer_consent_records (consent_type='BIOMETRIC_FACE_AUTH', granted=true)               |  |
|  |  - biometric_retention_records (retention_days=1095, status='ACTIVE')                       |  |
|  +---------------------------------------------------------------------------------------------+  |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Step-by-Step Execution Lifecycle

### Step 1: User Onboarding & Explicit Consent
- Route: `apps/dfarm-customer-app/src/app/(onboarding)/face-enroll.tsx`
- The user is presented with the biometric registration banner explaining that their face template will be used for rapid dairy kiosk milk collection and identity verification.
- Biometric consent is explicitly captured and sent alongside the registration payload.

### Step 2: Camera Hardware Permission & Initialization
- The screen utilizes Expo Camera's `useCameraPermissions()` hook.
- If permission is `undetermined`, the app requests permission with `requestPermission()`.
- If permission is `denied`, an informative claymorphism error state instructs the customer to enable camera access in Android app settings, with an interactive "Grant Camera Access" button.
- When granted, `CameraView` initializes in front-facing mode (`facing="front"`).

### Step 3: Neural Network Model Verification & Initialization
- `FaceEngine.init()` verifies the availability and integrity of the model artifacts:
  - **Detection Model**: `face_detection_yunet_2023mar.onnx` (232,589 bytes, SHA256: `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4`)
  - **Recognition Model**: `face_recognition_sface_2021dec_int8.onnx` (9,896,933 bytes, SHA256: `2b0e941e6f16cc048c20aee0c8e31f569118f65d702914540f7bfdc14048d78a`)
- If models are ready, the status updates to `"align_face"` and the real-time detection loop begins.

### Step 4: Real-time Live Face Detection (OpenCV YuNet)
- Input frame dimensions: `640 x 640 x 3` (RGB normalized float tensor).
- YuNet detects candidate bounding boxes and 5 facial landmark pairs:
  - Right Eye: `(x1, y1)`
  - Left Eye: `(x2, y2)`
  - Nose Tip: `(x3, y3)`
  - Mouth Right: `(x4, y4)`
  - Mouth Left: `(x5, y5)`
- **Thresholds**:
  - Confidence Threshold: `>= 0.60`
  - Non-Maximum Suppression (NMS): `<= 0.30`
- **Rejection Criteria**:
  - `0 faces detected`: UI displays `"No face detected. Look directly at camera."`
  - `> 1 faces detected`: UI displays `"Multiple faces detected! Ensure only one person is in frame."` and blocks capture.
  - Low confidence (`< 0.60`): UI prompts user to improve ambient lighting.

### Step 5: Face Alignment & Embedding Extraction (OpenCV SFace INT8)
- Using the 5 facial landmarks, the face crop is normalized and affine-transformed to standard `112 x 112` orientation.
- The preprocessed tensor is fed into the SFace INT8 neural network session.
- Output: Exact `(1, 128)` floating point embedding vector.
- Vector is L2-normalized:
  $$\|v\|_2 = \sqrt{\sum_{i=0}^{127} v_i^2} = 1.0 \pm 10^{-5}$$
- Any vector with degenerate norm ($< 0.1$) is rejected.

### Step 6: Registration API Submission
- Payload assembled:
  ```json
  {
    "fullName": "Farmer Ramesh",
    "phone": "+919876543210",
    "dairyId": "dairy-uuid-1234",
    "faceTemplate": [0.0381, -0.0124, 0.0912, ... 128 floats],
    "consentGiven": true,
    "consentTimestamp": "2026-11-15T18:30:00.000Z"
  }
  ```
- Endpoint: `POST /api/v1/customers/register`
- The app enters an animated loading state (`"Encrypting and saving face profile..."`).

### Step 7: Backend Storage & Multi-Table Transaction
1. **Tenant Validation**: Ensures `dairyId` corresponds to an active organization in `organizations`.
2. **Biometric Encryption**:
   - The 128-float vector is serialized to a binary buffer.
   - Encrypted via AES-256-GCM using `BIOMETRIC_ENCRYPTION_KEY`.
   - Generates `iv` (12 bytes), `auth_tag` (16 bytes), and `ciphertext`.
   - Computes SHA-256 fingerprint for deduplication.
3. **Database Insertion**:
   - `face_enrollments`:
     - `customer_id`: Assigned customer UUID.
     - `organization_id`: Tenant organization UUID.
     - `encrypted_template`: Base64 ciphertext with IV and auth tag.
     - `template_hash`: SHA-256 hash string.
     - `model_version`: `'opencv-sface-int8-v1'`.
     - `is_active`: `true`.
     - `enrolled_by`: Admin or Customer self-service UUID.
   - `customer_consent_records`:
     - Records explicit consent with IP, user agent, and timestamp.
   - `biometric_retention_records`:
     - Configures default retention policy (1095 days / 3 years), status `'ACTIVE'`.
4. **Response**: HTTP 201 Created with customer UUID and onboarding token.

### Step 8: Genuine UI Completion
- The customer app only redirects to `(main)/dashboard` upon receiving a verifiable HTTP 201 response with valid payload.
- On network error, 4xx, or 5xx: An alert dialog is presented to the user with the exact server error message, the camera remains active, and the user can retry without loss of session context.

---

## 3. Security, Privacy & Compliance Controls

| Security Measure | Implementation Standard |
|---|---|
| **Raw Image Disposal** | Captured camera frames are processed in volatile memory and never written to disk or sent across the network. |
| **At-Rest Encryption** | AES-256-GCM encryption with randomized 96-bit initialization vectors. |
| **Biometric Revocation** | Customers can request template deletion via `DELETE /api/v1/customers/:id/biometrics`. |
| **Audit Logging** | Every enrollment and match event logs a cryptographic audit record without leaking the raw vector. |
| **Tenant Isolation** | Foreign key constraints and Row-Level Security (RLS) enforce strict boundaries between dairy organizations. |
