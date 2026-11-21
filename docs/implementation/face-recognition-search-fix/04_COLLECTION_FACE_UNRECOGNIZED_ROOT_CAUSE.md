# DFARM — COLLECTION APP FACE UNRECOGNIZED ROOT CAUSE ANALYSIS

**Execution Reference:** `DFARM-FACE-RECOGNITION-AND-CUSTOMER-SEARCH-FIX`  
**Document Identifier:** `04_COLLECTION_FACE_UNRECOGNIZED_ROOT_CAUSE.md`  
**Status:** COMPLETED & VERIFIED  
**Date:** November 2026  
**Auditor:** Antigravity AI Engineering  

---

## 1. INCIDENT DESCRIPTION & PROBLEM STATEMENT

At the village milk collection kiosk (`apps/dfarm-collection-app`):
1. The hardware camera starts successfully and renders a live video feed with bounding box and landmark overlays.
2. The customer's identity (e.g. `Shubhangi Popat Yewale`, farmer code `C-101`) is present and selectable via manual lookup / patron directory.
3. However, whenever the farmer stands in front of the camera, the face recognition scanner consistently displays:
   ```
   UNKNOWN PERSON (Unrecognized)
   ```
4. The user specifically observed that camera startup and customer name availability in directory lookup did not result in biometric recognition.

---

## 2. INVESTIGATION OF THE 10-STAGE RECOGNITION PIPELINE

The full recognition pipeline was audited from sensor to identity confirmation:

```
Camera Sensor (HTML5 Video)
  │ (Stage 1: PASS - Video element streams 640x480 frames)
  ▼
Frame Capture & Canvas Context
  │ (Stage 2: PASS - Canvas contexts render landmarks & bounding box)
  ▼
YuNet Face Detection
  │ (Stage 3: PASS - YuNet detects face with confidence > 0.85)
  ▼
Facial Landmark Alignment
  │ (Stage 4: PASS - 5 keypoints aligned to 112x112 canonical crop)
  ▼
SFace INT8 ONNX Inference
  │ (Stage 5: PASS - Generates 128-D float embedding vector)
  ▼
L2 Vector Normalization
  │ (Stage 6: PASS - ||v||₂ = 1.000000 achieved)
  ▼
Enrolled Template Retrieval (HardwareContext)
  │ (Stage 7: FAIL [CRITICAL] - enrolledTemplates.length is 0!)
  ▼
Similarity Calculation (DairyFaceMatcher)
  │ (Stage 8: FAIL - 0 candidate vectors evaluated)
  ▼
Threshold Comparison (>= 0.363)
  │ (Stage 9: FAIL - Best similarity is -1.0)
  ▼
Farmer Identity Resolution
  │ (Stage 10: RESULT - Defaults to UNKNOWN_PERSON "Unrecognized")
```

---

## 3. ROOT CAUSE FINDINGS

### Root Cause 4.1: Database Biometric Record Absence (`faceTemplateEnrolled = false`)
When inspecting the live database for Warna Milk's (`38918630-4fee-4cec-96ea-a3a899aae7bc`):
```json
{
  "id": "42ae6cb2-8185-4984-8183-70a4570ece40",
  "farmerCode": "C-101",
  "fullName": "Shubhangi Popat Yewale",
  "status": "ACTIVE",
  "registrationStatus": "APPROVED",
  "faceTemplateEnrolled": false
}
```
And querying `GET /api/v1/identity/face/templates?organizationId=38918630-4fee-4cec-96ea-a3a899aae7bc`:
```json
{
  "success": true,
  "count": 0,
  "data": []
}
```
Because the customer biometric update failed on the backend (due to the `updateFaceEnrollment` organization ID omission and control plane DB crash detailed in Document 01), **no active biometric vector was ever persisted in `face_enrollments` for the tenant**.

### Root Cause 4.2: Missing Header Resolution in `GET /identity/face/templates`
In `services/backend/src/presentation/routes/identity.routes.ts:32-41`:
```typescript
let organizationId = req.user?.organizationId;
if (!organizationId) {
  organizationId = (req.query['organizationId'] as string) || '00000000-0000-0000-0000-000000000001';
}
```
When `apps/dfarm-collection-app` called `identityApi.getFaceTemplates()`:
1. `apiRequest` attached `headers['X-Dairy-Id'] = dairyId`.
2. However, `identity.routes.ts` **only inspected `req.user?.organizationId` and `req.query['organizationId']`**. It never read `req.headers['x-dairy-id']` or `req.headers['x-dairy-tenant-id']`.
3. Consequently, if the kiosk was not yet logged in with an operator token containing `organizationId`, the endpoint defaulted to the dummy UUID `'00000000-0000-0000-0000-000000000001'`, querying the wrong tenant.

### Root Cause 4.3: HardwareContext Static Mounting Lifecycle Defect
In `apps/dfarm-collection-app/src/context/HardwareContext.tsx:220-225`:
```typescript
useEffect(() => {
  refreshDevices();
  refreshSession();
  refreshOfflineCount();
  refreshCustomersAndTemplates();
  ...
}, []); // Empty dependency array!
```
1. On initial application load, `useEffect` executes once before the operator session is fully loaded from local storage.
2. `refreshCustomersAndTemplates()` ran with an empty `dairyId`.
3. When the operator logged in or `operator?.dairyId` was restored in `AuthContext`, `HardwareContext` **never re-triggered `refreshCustomersAndTemplates()`**.
4. Both `customersList` and `enrolledTemplates` remained empty arrays in memory until a manual refresh occurred.

### Root Cause 4.4: DairyFaceMatcher Zero-Candidate Behavior
In `apps/dfarm-collection-app/src/face-ai/matcher.ts:25-50`:
When `enrolledTemplates` has length 0:
- The candidate loop does 0 iterations.
- `bestSimilarity` remains `-1`.
- `DairyFaceMatcher.match()` returns:
  ```typescript
  return {
    isMatch: false,
    matchedCustomer: null,
    confidenceScore: 0,
    similarity: -1,
  };
  ```
- The camera hook sets `status('UNKNOWN_PERSON')`, rendering `Unrecognized` in the UI.

---

## 4. TARGETED REMEDIATION SPECIFICATION

1. **Fix Biometric Persistence in Backend:**
   Ensure `updateFaceEnrollment` in `PostgresCustomerRepository` correctly persists encrypted vectors into the tenant's `face_enrollments` table and sets `face_template_enrolled = TRUE`.
2. **Support Header & Query Context in `identity.routes.ts`:**
   Inspect `req.headers['x-dairy-tenant-id']` and `req.headers['x-dairy-id']` alongside `req.query['organizationId']` and `req.user?.organizationId`.
3. **Pass `organizationId` Explicitly from Collection App:**
   Update `identityApi.getFaceTemplates(dairyId)` and `customersApi.list({ organizationId: dairyId })` to explicitly pass `organizationId` in query strings and headers.
4. **Reactive HardwareContext Lifecycle:**
   Add `dairyId` from `getStoredOperatorAuth()` and `operator?.dairyId` to the `useEffect` dependencies of `HardwareContext.tsx` so customer and template caches refresh immediately upon operator authentication.
