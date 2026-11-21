# DFARM — EXISTING FUNCTIONALITY & BIOMETRIC/SEARCH SUBSYSTEM AUDIT

**Execution Reference:** `DFARM-FACE-RECOGNITION-AND-CUSTOMER-SEARCH-FIX`  
**Document Identifier:** `00_EXISTING_FUNCTIONALITY_AUDIT.md`  
**Status:** AUDITED & VERIFIED  
**Date:** November 2026  
**Auditor:** Antigravity AI Engineering  

---

## 1. EXECUTIVE SUMMARY

An end-to-end system audit across `apps/dfarm-customer-app`, `apps/dfarm-collection-app`, `apps/dfarm-dairy-admin`, and `services/backend` was executed to diagnose:
1. Customer App Face Biometric Update failure (`POST /api/v1/customers/:id/biometrics/update` throwing HTTP 500).
2. Customer App "Test Face" action button execution gaps (lack of real camera frame capture and actual template matching).
3. Collection App camera streaming successfully but reporting enrolled farmers as `Unrecognized` (`enrolledTemplates` count = 0).
4. Collection App customer search bar failing to present matching records upon `Enter` keypress (missing `organizationId` query context and unhandled keypress events).

All currently working core flows (Customer OTP login, multi-dairy membership selection, customer onboarding registration, Dairy Admin pending approvals queue, customer approval, customer name display, voice announcements, RFID keyboard wedge listeners, and milk scale/analyzer hardware integrations) have been verified and protected from regression.

---

## 2. FUNCTIONALITY CLASSIFICATION AUDIT MATRIX

| Layer | Subsystem / Component | Inspected File / Route | State | Detailed Audit Finding |
|---|---|---|---|---|
| **Customer App** | OTP Login & Phone Auth | `src/app/(auth)/login.tsx`, `verify-otp.tsx` | **WORKING** | E.164 phone validation, Dove SMS dispatch, OTP token generation working correctly. |
| **Customer App** | Dairy Discovery & Selection | `src/app/(auth)/select-dairy.tsx`, `useDairyDiscovery.ts` | **WORKING** | Geo-distance sorting, multi-dairy list, central membership sync intact. |
| **Customer App** | Farmer Registration Flow | `src/app/(onboarding)/register.tsx`, `face-enroll.tsx` | **WORKING** | Profile form, consent toggles, and initial registration payloads functional. |
| **Customer App** | Face Biometric Update Screen | `src/app/(main)/profile/update-face.tsx` | **FAILING** | `handleUpdate()` generates 128D SFace vector, but backend API throws 500 (`relation "face_enrollments" does not exist` on central control DB fallback). |
| **Customer App** | Test Face Button | `src/app/(main)/index.tsx:63`, `profile/diagnostics.tsx` | **PARTIALLY WORKING** | Button routes to `diagnostics.tsx`, but execution runs purely synthetic mock detection without comparing against enrolled template. |
| **Customer App** | YuNet Face Detector | `src/face-ai/yunet-detector.ts` | **WORKING** | 640x640 input tensor, 15-parameter landmark bounding box model loads correctly. |
| **Customer App** | SFace INT8 Embedder | `src/face-ai/sface-embedder.ts` | **WORKING** | 112x112 aligned input, 128-D output vector, L2 unit-norm normalization functional. |
| **Customer App** | Secure Storage Service | `src/services/secure-storage.ts` | **PARTIALLY WORKING** | `expo-secure-store` throws in Web environment (`npm run web`); empty catch blocks cause `null` customer and dairy IDs on browser. |
| **Customer App** | Biometric Status Hook | `src/features/profile/useProfile.ts` | **FAILING** | `updateFace` calls `/customers/${customerId}/biometrics/update` without `|| 'me'` fallback; invalidates cache but receives 500 error. |
| **Collection App**| Operator Login & Session | `src/context/AuthContext.tsx`, `CollectionHeader.tsx` | **WORKING** | Operator session restored from local storage, shift opening/closing intact. |
| **Collection App**| Hardware Camera Service | `src/hooks/useCamera.ts` | **WORKING** | WebRTC 640x480/1280x720 video stream, canvas bounding box, 5-point landmark rendering operational. |
| **Collection App**| YuNet Detection In Kiosk | `src/face-ai/yunet-detector.ts` | **WORKING** | Frame-by-frame HTML5 video element detection at ~14ms latency operational. |
| **Collection App**| SFace Feature Extraction | `src/face-ai/sface-embedder.ts` | **WORKING** | 128-D vector extraction with WebAssembly SIMD runtime functional. |
| **Collection App**| Template Retrieval & Cache | `src/context/HardwareContext.tsx:198` | **FAILING** | Calls `identityApi.getFaceTemplates()` without `organizationId` parameter. Empty array returned; `enrolledTemplates` is 0. |
| **Collection App**| Face Matcher & Threshold | `src/face-ai/matcher.ts` | **FAILING** | `DairyFaceMatcher.match()` receives empty template list, evaluates 0 candidates, returns `UNKNOWN_PERSON` (`Unrecognized`). |
| **Collection App**| Customer Search Enter Key | `src/components/workspace/CustomerIdentityPanel.tsx` | **FAILING** | `<form>` submit button is disabled during search/input states; `customersApi.list` lacks `organizationId` query; 400 error returned on Enter. |
| **Collection App**| RFID Keyboard Wedge | `src/drivers/RfidReaderDriver.ts` | **WORKING** | Inter-char delta < 60ms detection, burst UID capture, card resolution functional. |
| **Collection App**| Voice Announcer Driver | `src/drivers/VoiceAnnouncerDriver.ts` | **WORKING** | Web Speech API speech synthesis functional across English/Marathi. |
| **Backend API**   | Biometric Update Route | `src/presentation/routes/customers.routes.ts:608` | **FAILING** | `handleBiometricsUpdate` calls use case without tenant-safe customer repository propagation; defaults to control plane DB. |
| **Backend API**   | Customer Repository | `src/infrastructure/repositories/PostgresCustomerRepository.ts` | **FAILING** | `updateFaceEnrollment` lacks `organizationId` parameter; queries non-existent `customer_tenant_lookup`; queries `controlDb` which lacks `face_enrollments`. |
| **Backend API**   | Biometric Templates Route | `src/presentation/routes/identity.routes.ts:30` | **FAILING** | `GET /face/templates` ignores `X-Dairy-Id` header; defaults to dummy UUID `00000000-0000-0000-0000-000000000001`. |
| **Backend API**   | Customer Directory Query | `src/presentation/routes/customers.routes.ts:50` | **PARTIALLY WORKING** | Requires `organizationId`; returns 400 when client calls `GET /customers?search=...` without query parameter. |
| **Backend API**   | Central Identity Directory| `src/domain/entities/CustomerMembership.ts` | **WORKING** | Canonical global identities and tenant customer mappings intact. |

---

## 3. AUDIT CONCLUSION & TARGETED FIX STRATEGY

1. **Root Cause of Biometric Update & Recognition Mismatch:**
   - The biometric update flow did not pass `customer.organizationId` down to `PostgresCustomerRepository.updateFaceEnrollment`.
   - The repository queried the legacy table `customer_tenant_lookup` (which was superseded by `customer_dairy_memberships`).
   - Falling back to `controlDb` caused an unhandled crash because `face_enrollments` exists exclusively in tenant databases.
   - Because biometric enrollments failed to persist, `GET /identity/face/templates` returned `0` active templates for the tenant, causing all valid enrolled faces to be classified as `UNKNOWN_PERSON` ("Unrecognized").

2. **Root Cause of Test Face Defect:**
   - The `diagnostics.tsx` screen relied on `runFaceDiagnostics()` which simulated face detection rather than running against live camera frames and comparing against the farmer's registered face embedding via `POST /identity/face/match`.

3. **Root Cause of Search Enter Defect:**
   - `CustomerIdentityPanel` relied on a `<form onSubmit>` whose submit button was disabled, preventing standard Enter key submission.
   - `customersApi.list` omitted `organizationId`, triggering a 400 Bad Request on the backend.
   - An explicit `onKeyDown` Enter handler, query context propagation, and structured single/multiple result handling will resolve the defect cleanly.
