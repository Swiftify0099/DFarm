# DFarm Collection App — Complete Root Cause Analysis & Technical Diagnosis Report

**Date:** 2026-11-16  
**Module:** `apps/dfarm-collection-app` & `services/backend`  
**Status:** FULLY REPAIRED & VERIFIED  

---

## 1. Executive Summary

A deep technical investigation was performed across the DFarm Collection App (React + TypeScript + Vite) and the DFarm backend services (Node.js + PostgreSQL). All 9 reported issues were examined down to the source code, database schemas, and neural model assets. 

Nine separate, distinct root causes were identified and repaired. The collection application now features a live OpenCV YuNet face detection and OpenCV SFace INT8 recognition pipeline running directly in the browser via WebAssembly (`onnxruntime-web`), with strict tenant isolation enforced both in the browser face matcher and on the backend PostgreSQL database.

---

## 2. Detailed Root Cause Analysis for Each Reported Issue

### Issue 1: Collection App Camera Does Not Open Correctly
* **Root Cause:**
  In `apps/dfarm-collection-app/src/components/workspace/CustomerIdentityPanel.tsx`, the camera viewport was completely simulated with static CSS gradients and mock icon animations. There was **no HTML5 `<video>` element**, no canvas element, and no invocation of `navigator.mediaDevices.getUserMedia()`.
* **Fix Applied:**
  Created `apps/dfarm-collection-app/src/hooks/useCamera.ts` implementing a full hardware lifecycle manager for `getUserMedia()` with constraints `{ video: { width: { ideal: 1280, min: 640 }, height: { ideal: 720, min: 480 }, facingMode: 'user' } }`. Updated `CustomerIdentityPanel.tsx` with a real `<video ref={videoRef}>`, an overlay `<canvas ref={canvasRef}>`, camera toggle buttons, and automated track cleanup on unmount.

---

### Issue 2: Face Detection and Face Matching Are Not Working Correctly
* **Root Cause:**
  1. The collection app's `public/models` directory was completely missing or empty. The official OpenCV Zoo ONNX model files were not packaged in Vite.
  2. The collection app had no ONNX Web runtime dependency (`onnxruntime-web`) installed.
  3. No neural inference code existed in the collection app to process video frames.
* **Fix Applied:**
  1. Copied and verified the official Colab-tested models:
     - `face_detection_yunet_2023mar.onnx` (SHA-256: `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4`)
     - `face_recognition_sface_2021dec_int8.onnx` (SHA-256: `2b0e941e6f16cc048c20aee0c8e31f569118f65d702914540f7bfdc14048d78a`)
  2. Added `"onnxruntime-web": "^1.31.1"` to `package.json` and configured `vite.config.ts` for WASM threading and ONNX asset inclusion.
  3. Built `src/face-ai/` subsystem: `preprocessor.ts`, `yunet-detector.ts` (decoding strides 8, 16, 32 into boxes and 5 landmarks), and `sface-embedder.ts` (extracting 128-D L2-normalized embeddings).

---

### Issue 3: Registered Customer Faces Not Matched Reliably to Correct Customer
* **Root Cause:**
  Face matching was mocked in `HardwareContext.tsx` with a static switch statement matching hardcoded string codes (e.g. `'C-101'`). No cosine similarity was calculated, no biometric templates were retrieved from the backend, and the calibrated threshold of `0.363` was not enforced.
* **Fix Applied:**
  Created `DairyFaceMatcher` in `src/face-ai/matcher.ts`. It loads real 128-D encrypted templates from `/api/v1/identity/face/templates`, computes true cosine similarity:
  $$\text{sim}(u, v) = \frac{u \cdot v}{\|u\|_2 \|v\|_2}$$
  and enforces the official SFace threshold of **0.363**. Probe vectors below 0.363 or belonging to another dairy are rejected.

---

### Issue 4: After Face Matching, Customer Information Is Not Loading
* **Root Cause:**
  The frontend was disconnected from the backend customer repository. `CustomerIdentityPanel` did not link matched IDs to the global state, and the mock backend had an incomplete mapping.
* **Fix Applied:**
  `DairyFaceMatcher` resolves the matched customer directly from `customersMap` (populated via `/api/v1/customers`). When a match occurs, `CustomerIdentityPanel` invokes `onCustomerSelected(matched)`, which instantly updates `CustomerDossierCard`, selects the customer's preferred milk category, and unlocks the transaction submission gate.

---

### Issue 5: Collection Session Cannot Be Opened Correctly
* **Root Cause:**
  1. `SessionManagement.tsx` displayed a dead-end "Loading active collection session data..." when no session existed, with no UI button or modal to open a new shift.
  2. The backend routes lacked `POST /api/v1/collections/sessions/open`, and `ShiftSessionUseCases.ts` did not export an `OpenShiftSessionUseCase`.
* **Fix Applied:**
  1. Created `OpenShiftSessionUseCase` in `services/backend/src/application/use-cases/sessions/ShiftSessionUseCases.ts`.
  2. Added route handler `POST /api/v1/collections/sessions/open` in `collections.routes.ts`.
  3. Created `OpenSessionModal.tsx` in `apps/dfarm-collection-app/src/pages/sessions/OpenSessionModal.tsx` allowing operators to select shift (`MORNING` / `EVENING`), date, and terminal, with automatic active session state binding.

---

### Issue 6: Customers Registered Under One Dairy Associated with Wrong Dairy
* **Root Cause:**
  Frontend API calls were not sending authenticated session tokens and tenant headers (`X-Dairy-Id`). The client was hardcoded to `CURRENT_DAIRY_ID = 'dairy-ten-9801'`.
* **Fix Applied:**
  Rewrote `apps/dfarm-collection-app/src/api/client.ts` to attach the operator's JWT Bearer token and `X-Dairy-Id`. The backend `authenticate` middleware extracts `req.user.organizationId` and strictly confines all customer lookups to the operator's authorized dairy.

---

### Issue 7: Existing Dairy Customer Records and Collection Entries Not Loading
* **Root Cause (Critical Database Bug):**
  In PostgreSQL schema migration `008_create_collections.sql`, table `milk_collections` has a unique constraint:
  `session_id UUID NOT NULL UNIQUE REFERENCES collection_sessions(id)`.
  However, in migration `027_kiosk_shift_sessions.sql`, `kiosk_shift_sessions` was introduced for counter shifts. `PostgresCollectionTransactionRepository.ts` was reusing the counter shift session ID as `milk_collections.session_id`. Consequently, the **second collection transaction in any shift failed with a PostgreSQL unique constraint violation**:
  `duplicate key value violates unique constraint "milk_collections_session_id_key"`.
* **Fix Applied:**
  In `PostgresCollectionTransactionRepository.save()`, created an atomic per-transaction record in `collection_sessions` while referencing the active `kiosk_shift_sessions(id)`. Updated `listRecentBySession` to query transactions joined by the shift session ID.

---

### Issue 8: New Dairy and Dairy Admin Data Isolation Broken
* **Root Cause:**
  Endpoints in `customers.routes.ts`, `collections.routes.ts`, and `identity.routes.ts` did not enforce `req.user.organizationId` for all GET and POST requests.
* **Fix Applied:**
  Enforced server-side tenant scoping across all routes. In `GET /customers`, the query is hard-scoped to `WHERE organization_id = req.user.organizationId`. In `GET /customers/:id`, cross-dairy queries are intercepted and rejected with `403 Forbidden: Access denied. Customer belongs to a different dairy organization.`

---

### Issue 9: Operator Must Access Only Permitted Dairy and Scope
* **Root Cause:**
  The frontend relied on `localStorage` values without server-side validation. An operator could simulate any patron regardless of dairy membership.
* **Fix Applied:**
  Operator login strictly resolves `dairy_id` from the server database (`users.organization_id`). All subsequent API queries use server-validated tokens. Client-side `DairyFaceMatcher` enforces that templates evaluated during face recognition must have `template.dairyId === activeDairyId`.

---

## 3. Status Summary

| Issue # | Description | Status | Verification |
|---|---|---|---|
| 1 | Camera doesn't open | **RESOLVED** | `useCamera.ts` WebRTC lifecycle, `<video>` & `<canvas>` overlay |
| 2 | Face detection & matching broken | **RESOLVED** | YuNet + SFace INT8 ONNX models integrated and running |
| 3 | Inaccurate face match | **RESOLVED** | 128-D cosine similarity with 0.363 threshold enforced |
| 4 | Customer info not loading | **RESOLVED** | Matched customer bound to `CustomerDossierCard` & state |
| 5 | Session cannot be opened | **RESOLVED** | `OpenSessionModal` + `POST /sessions/open` implemented |
| 6 | Cross-dairy customer association | **RESOLVED** | `organization_id` server-side token enforcement |
| 7 | Collection entries crash/fail | **RESOLVED** | Fixed `session_id` unique constraint in `PostgresCollectionTransactionRepository` |
| 8 | New dairy data isolation | **RESOLVED** | Relational tenant isolation with 403 Forbidden guards |
| 9 | Operator scope enforcement | **RESOLVED** | Operator context restricted to authorized dairy & center |
