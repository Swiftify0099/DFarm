# 00. EXISTING FACE ARCHITECTURE AUDIT

**Execution Reference:** `DFARM-FACE-ENROLLMENT-RECOGNITION-END-TO-END-FIX`  
**Priority:** CRITICAL  
**Date:** 2026-11-19  
**Target Systems:** Customer Mobile/Web App, Milk Collection Terminal, Backend API, Tenant PostgreSQL Databases  

---

## 1. Executive Summary

A comprehensive architectural audit was performed across all DFarm platform tiers to determine the exact mechanics of facial biometric enrollment, customer face verification, and kiosk recognition. 

While Customer Registration and Dairy Admin Approval flows have been landed successfully in the core system, the Face Biometric subsystem suffered from critical lifecycle disconnections, runtime model loading gaps, inconsistent AAD encryption attributes, and missing multi-sample averaging.

---

## 2. Customer App Audit (`apps/dfarm-customer-app`)

### 2.1 File Map & Responsibilities
- **`src/app/(onboarding)/register.tsx`**: Initial producer registration capturing name, village, bank details, and animal categories.
- **`src/app/(onboarding)/face-enroll.tsx`**: Onboarding face capture screen.
- **`src/app/(main)/index.tsx`**: Main producer home dashboard displaying daily milk intake, khata ledger balance, and quick actions.
- **`src/app/(main)/profile/index.tsx`**: Account and biometrics settings screen.
- **`src/app/(main)/profile/update-face.tsx`**: Face template re-enrollment and update screen.
- **`src/app/(main)/profile/diagnostics.tsx`**: Face sensor and model verification diagnostics view ("Test Face").
- **`src/face-ai/yunet-detector.ts`**: OpenCV YuNet face detector wrapper (640x640 BGR input).
- **`src/face-ai/sface-embedder.ts`**: OpenCV SFace INT8 embedding generator (112x112 BGR input -> 128-D vector).
- **`src/face-ai/preprocessor.ts`**: Vector math (`normalizeL2`, `computeCosineSimilarity`, `checkAlignmentQuality`).
- **`src/features/profile/useProfile.ts`**: TanStack Query hook managing `/customers/me` profile and `/customers/:id/biometrics/update` mutations.

### 2.2 Findings & Defects
1. **Timing of Biometric Enrollment**: 
   The business rule requires biometric enrollment to happen *after* Dairy Admin approval. Currently, registration immediately routes to `face-enroll.tsx` prior to approval, and once approved and logged in, the customer home dashboard lacks a clear call-to-action banner indicating `NOT_ENROLLED` or prompting them to enroll.
2. **Single-Frame Capture Defect**:
   Both `face-enroll.tsx` and `update-face.tsx` capture only **a single frame** instead of the required **5 quality-checked samples averaged into a normalized template**. Single-frame captures are susceptible to lighting glare, minor head tilts, and temporary sensor noise.
3. **Test Face Disconnection**:
   In `diagnostics.tsx`, the camera preview is rendered via `CameraView`, but `handleRunDiagnostics` invokes `runFaceDiagnostics()` without passing the live camera frame tensor or image stream. The test ran against static defaults without executing full end-to-end identity verification against the tenant database.
4. **State Machine Non-conformance**:
   The enrollment status in the UI does not systematically surface the discrete required states (`NOT_ENROLLED`, `ENROLLMENT_IN_PROGRESS`, `ENROLLED`, `FAILED`, `RE_ENROLLMENT_REQUIRED`, `REVOKED`).

---

## 3. Collection App Audit (`apps/dfarm-collection-app`)

### 3.1 File Map & Responsibilities
- **`src/pages/collection/CollectionWorkspace.tsx`**: Main milk intake kiosk workspace.
- **`src/components/workspace/CustomerIdentityPanel.tsx`**: Live camera reticle, facial recognition status pill, RFID tap listener, and manual search bar.
- **`src/context/HardwareContext.tsx`**: Monolithic hardware driver and state provider (Scale, Analyzer, RFID, Camera, and active shift session).
- **`src/hooks/useCamera.ts`**: Live HTML5 `getUserMedia` video loop and requestAnimationFrame inference cycle.
- **`src/face-ai/matcher.ts`**: `DairyFaceMatcher.match` executing cosine similarity against dairy-scoped enrolled templates.
- **`src/face-ai/yunet-detector.ts` & `sface-embedder.ts`**: Collection kiosk ONNX model wrappers.

### 3.2 Findings & Defects
1. **Model Initialization Failure in Browser Runtime**:
   In `apps/dfarm-collection-app/src/face-ai/sface-embedder.ts`, if the browser WASM session failed or was still initializing, `generateEmbedding` threw:
   `Error('SFace ONNX inference session is not ready in production runtime')`.
   This was caught silently in `useCamera.ts` (`catch (err) { console.warn(...) }`), halting the recognition loop.
2. **Template Cache Starvation (`UNKNOWN PERSON` Root Cause)**:
   In `HardwareContext.tsx`, `refreshCustomersAndTemplates` was only executed once during mount. If the operator logged in *after* the initial page load, `enrolledTemplates` remained bound to the default unauthenticated state (`dairyId = null`), yielding 0 templates. When 0 templates are present, `DairyFaceMatcher.match` returns `rejectionReason: 'NO_TEMPLATES'`, which `useCamera.ts` directly mapped to `UNKNOWN_PERSON`.
3. **Disconnected State between `useCamera` and `HardwareContext`**:
   `useCamera` tracked its own internal `matchedCustomer` state and only communicated outwards through `onCustomerMatched`. It did not propagate live camera telemetry or `status` directly to `HardwareContext.faceState`.
4. **Micro-variation Formula Inconsistency**:
   In fallback/calibrated mode, Customer App used a landmark tilt coefficient of `0.02`, while Collection App used `0.01`. This arithmetic mismatch caused probe embeddings to drift below the $0.363$ cosine threshold.

---

## 4. Backend Audit (`services/backend`)

### 4.1 File Map & Responsibilities
- **`src/presentation/routes/customers.routes.ts`**:
  - `POST/PUT /customers/:id/biometrics/update`: Submits 128-D embedding vector.
  - `GET /customers/:id`: Retrieves customer profile with masked bank details and biometric status.
- **`src/presentation/routes/identity.routes.ts`**:
  - `GET /identity/face/templates`: Retrieves decrypted 128-D templates for the authorized dairy.
  - `POST /identity/face/match`: Server-side online face matching endpoint.
  - `GET /identity/face/enrollments`: Dairy Admin audit view for biometric records.
- **`src/application/use-cases/customers/BiometricUseCases.ts`**:
  - `UpdateCustomerBiometricsUseCase`: Validates dimensions, encrypts via AES-256-GCM, and persists to tenant DB.
  - `GetFaceTemplatesUseCase`: Queries active enrolled templates in tenant database.
- **`src/infrastructure/repositories/PostgresCustomerRepository.ts`**: Tenant DB CRUD for customers, RFID, and face enrollments.
- **`src/infrastructure/security/Aes256GcmBiometricEncryptor.ts`**: Cryptographic implementation utilizing AAD binding `DFARM:CUST=<customerId>:MODEL=<modelVersionId>`.

### 4.2 Findings & Defects
1. **AAD Mismatch during Decryption**:
   In `UpdateCustomerBiometricsUseCase.ts`, if `params.customerId` was passed as `'me'` or as a membership UUID instead of `customer.id` (tenant UUID), `encrypt128DimEmbedding` bound the AAD to that string. When `GetFaceTemplatesUseCase` later read `fe.customer_id` from the database and attempted decryption, the AAD string mismatched, causing GCM auth tag verification failure. Decryption threw an error, was caught silently in `identity.routes.ts`, and returned `embedding: null`, starving the kiosk cache.
2. **Missing Granular Status in `/identity/face/match`**:
   The online matching endpoint did not distinguish between `ENROLLMENT_NOT_FOUND` (customer has no biometric record), `FACE_NOT_MATCHED` (below threshold), and `UNKNOWN_PERSON` (matches a different customer).

---

## 5. Database Schema & Migration Audit

### 5.1 Tables Inspected
- **`face_model_versions`** (Migration `005` & `027`):
  - Stores `model_name` (`OpenCV-SFace-INT8`), `model_version` (`sface_int8_2021dec`), `embedding_dimension` (`128`), `similarity_metric` (`COSINE`), and `recommended_threshold` (`0.363`).
- **`face_enrollments`** (Migration `005`):
  - Stores `customer_id`, `model_version_id`, `embedding_encrypted`, `embedding_iv`, `embedding_auth_tag`, `encryption_key_reference`, `quality_score`, and `status`.
  - Unique partial index: `uq_active_customer_face_template ON face_enrollments (customer_id, model_version_id) WHERE status = 'ACTIVE'`.
- **`customers`** (Migration `004`):
  - Stores `organization_id`, `farmer_code`, `full_name`, `registration_status`, and `status`.

No duplicate tables or non-standard schemas exist. The database schema is sound; the issues stem from data flow, caching, and model pipeline integration.
