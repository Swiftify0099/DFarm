# DFARM — CUSTOMER APP FACE SYSTEM ROOT CAUSE REPORT
**Document ID:** `DFARM-REPORT-BIO-RC-001`  
**System Area:** Customer Mobile App (`apps/dfarm-customer-app`) & Backend (`services/backend`)  
**Date:** November 15, 2026  
**Status:** ROOT CAUSES IDENTIFIED — REPAIR IN PROGRESS  

---

## 1. Executive Summary

A comprehensive, end-to-end technical investigation of the DFarm Customer Application and backend services was conducted to diagnose failures in biometric facial operations. The investigation traced the complete path:

$$\text{UI Button} \longrightarrow \text{onPress} \longrightarrow \text{Handler} \longrightarrow \text{Camera} \longrightarrow \text{Model} \longrightarrow \text{Face Processing} \longrightarrow \text{API} \longrightarrow \text{Backend} \longrightarrow \text{Database} \longrightarrow \text{UI Result}$$

The investigation revealed that the failures were not caused by a single bug, but by seven distinct, compounding architectural defects spanning missing model files, simulated stub services, mock camera preview views, disconnected API routes, unhandled backend errors, and missing database persistence logic.

---

## 2. Detailed Root Cause Matrix

| # | Feature / Path | Defect & Failure Mode | Root Cause | Affected Files | Severity | Proposed Fix |
|---|---|---|---|---|---|---|
| **1** | **Face Model Files** | ONNX models completely absent from project directory; `apps/dfarm-customer-app/assets/models/` was empty. | Model files were referenced in `manifest.ts` but never downloaded, packaged, or committed into the repository assets directory. | `apps/dfarm-customer-app/assets/models/`, `manifest.ts` | **CRITICAL** | Obtain official OpenCV Zoo `face_detection_yunet_2023mar.onnx` and `face_recognition_sface_2021dec_int8.onnx`, verify SHA-256 digests and ONNX shapes, and embed in assets. |
| **2** | **Face Detection Service** | `yuNetDetector.ts` returned hardcoded simulated face coordinates and dummy landmarks. | `initialize()` merely flipped a boolean flag without creating an ONNX inference session. `detectFaces()` fabricated static values rather than processing camera frames. | `apps/dfarm-customer-app/src/face-ai/yunet-detector.ts` | **CRITICAL** | Implement real ONNX Runtime inference session with genuine tensor decoding conforming to YuNet 12-output tensor architecture and NMS. |
| **3** | **Face Recognition Service** | `sFaceEmbedder.ts` generated pseudo-random sine wave math vectors (`Math.sin(i * 0.45)`). | Model inference was never invoked. SFace INT8 model was uninitialized, and mathematical pseudo-numbers substituted for neural embeddings. | `apps/dfarm-customer-app/src/face-ai/sface-embedder.ts` | **CRITICAL** | Load verified `face_recognition_sface_2021dec_int8.onnx`, run inference on aligned 112x112 face tensors, extract genuine 128-D vector, and apply L2 normalization. |
| **4** | **Camera Preview Viewports** | Registration, Test Face, and Update Face screens displayed static styled `View` components with emoji icons (`👤`) instead of a live camera feed. | No `CameraView` or camera hooks were instantiated from `expo-camera`, despite `expo-camera` being installed in `package.json` and configured in `app.json`. | `face-enroll.tsx`, `diagnostics.tsx`, `update-face.tsx` | **CRITICAL** | Integrate `CameraView` from `expo-camera` with front-facing camera preview, lifecycle management, permission requests, and real-time reticle overlays. |
| **5** | **Test Face ("Test My Face")** | Diagnostics button ran headless simulation with fabricated numbers and no live camera or verification against registered templates. | UI invoked `runFaceDiagnostics()`, which had no camera integration, mocked all sensor values, and did not retrieve the user's active template for cosine similarity comparison. | `apps/dfarm-customer-app/src/app/(main)/profile/diagnostics.tsx`, `src/face-ai/diagnostics.ts` | **HIGH** | Re-engineer Test Face screen to start live camera, detect face, extract 128-D embedding, verify against enrolled template if available, and report clear telemetry without mutating database state. |
| **6** | **Update Face Workflow & HTTP Method Mismatch** | Tapping "Capture New Biometric Vector" silently fell into a catch block, fabricated success, and failed on backend API call. | 1. Frontend called `POST /api/v1/customers/:id/biometrics/update`, whereas backend router only registered `PUT /:id/biometrics/update`.<br>2. Backend query in `PostgresCustomerRepository.ts` threw a `NOT NULL` violation on `enrolled_by` if no kiosk shift session was currently open.<br>3. `cleanErrorHandler.ts` swallowed `AppError` exceptions, reporting generic 500 errors. | `update-face.tsx`, `useProfile.ts`, `presentation/routes/customers.routes.ts`, `PostgresCustomerRepository.ts`, `cleanErrorHandler.ts` | **CRITICAL** | Harmonize frontend/backend HTTP contract to support both PUT/POST, fix `enrolled_by` fallback in repository, and fix error middleware so operational errors return clean 4xx responses. |
| **7** | **Registration Face Persistence** | Face template generated during onboarding was dropped and never saved to the backend database. | `RegisterCustomerUseCase.ts` and `CustomerDirectoryUseCases.ts` did not accept `faceTemplate` in `RegisterCustomerDTO`. Registration only saved basic profile fields, discarding biometric data. | `services/backend/src/application/use-cases/customers/CustomerDirectoryUseCases.ts`, `presentation/routes/customers.routes.ts` | **CRITICAL** | Extend `RegisterCustomerDTO` to accept `faceTemplate`, encrypt the 128-D vector using AES-256-GCM + AAD, and persist active enrollment transactionally during customer creation. |

---

## 3. End-to-End Execution Trace Per Feature

### 3.1 Face Registration Trace
```
User tap "Capture & Submit"
  └── handleCaptureAndEnroll()
        ├── yuNetDetector.detectFaces() ──> [BUG 1 & 2: Returned static mock bounding box]
        ├── sFaceEmbedder.generateEmbedding() ──> [BUG 3: Returned Math.sin() dummy 128D array]
        ├── register() [useRegistration]
        │     └── apiClient.post('/customers/register')
        │           └── Backend: RegisterCustomerUseCase.execute()
        │                 └── [BUG 7: Dropped faceTemplate; never inserted into face_enrollments table]
        └── router.replace('/pending-approval') ──> [BUG: Catch block concealed failure]
```

### 3.2 Test Face ("Test My Face") Trace
```
User tap "Test My Face (Diagnostics)"
  └── ProfileScreen navigates to /profile/diagnostics
        └── handleRunDiagnostics()
              └── runFaceDiagnostics()
                    ├── yuNetDetector.detectFaces() ──> [BUG: Simulated hardcoded 1-face pass]
                    ├── sFaceEmbedder.generateEmbedding() ──> [BUG: Math.sin() synthetic vector]
                    └── Returns FaceDiagnosticsReport
                          └── [BUG 4 & 5: Zero camera activity; no comparison with enrolled farmer template]
```

### 3.3 Update Face Trace
```
User tap "Capture New Biometric Vector"
  └── handleUpdate()
        ├── yuNetDetector.initialize() & sFaceEmbedder.initialize() ──> [BUG: Boolean toggles only]
        ├── updateFace() [useProfile]
        │     └── apiClient.post('/customers/:id/biometrics/update')
        │           └── Backend router only had PUT /:id/biometrics/update ──> [BUG 6a: 404 Not Found]
        │           └── Backend PostgresCustomerRepository: enrolled_by NULL ──> [BUG 6b: 500 Constraint Violation]
        └── catch { setSuccess(true) } ──> [BUG 6c: Fake success reported on UI]
```

---

## 4. Next Implementation Actions
1. **Model Files Verification**: Place verified OpenCV Zoo `face_detection_yunet_2023mar.onnx` and `face_recognition_sface_2021dec_int8.onnx` into `apps/dfarm-customer-app/assets/models/`.
2. **Face Engine Upgrades**: Replace dummy implementations in `yunet-detector.ts` and `sface-embedder.ts` with real ONNX inference and postprocessing.
3. **Camera Preview Viewports**: Wire `CameraView` into `face-enroll.tsx`, `diagnostics.tsx`, and `update-face.tsx`.
4. **Backend Contract & Persistence**: Fix `RegisterCustomerUseCase` to save `faceTemplate`, fix `updateFaceEnrollment` SQL query, and support both `POST` and `PUT` on `/biometrics/update`.
5. **Backend Error Handling**: Fix `cleanErrorHandler` to recognize `AppError` and status codes.
