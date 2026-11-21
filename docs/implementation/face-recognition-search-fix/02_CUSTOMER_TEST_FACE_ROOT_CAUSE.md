# DFARM — CUSTOMER TEST FACE BUTTON ROOT CAUSE ANALYSIS

**Execution Reference:** `DFARM-FACE-RECOGNITION-AND-CUSTOMER-SEARCH-FIX`  
**Document Identifier:** `02_CUSTOMER_TEST_FACE_ROOT_CAUSE.md`  
**Status:** COMPLETED & VERIFIED  
**Date:** November 2026  
**Auditor:** Antigravity AI Engineering  

---

## 1. INCIDENT DESCRIPTION & USER ACTION

In the Customer Mobile & Web App (`apps/dfarm-customer-app`):
1. On the home dashboard (`src/app/(main)/index.tsx:63`), the user sees a header badge button labeled **Test Face**.
2. Alternatively, on the Profile screen (`src/app/(main)/profile/index.tsx:148`), the user sees a button labeled **Test Face Sensor**.
3. Both buttons route to `/(main)/profile/diagnostics` (`src/app/(main)/profile/diagnostics.tsx`).
4. On the diagnostics screen, the card header states:
   > *"This test verifies live front-camera sensor telemetry, OpenCV YuNet face detection, and OpenCV SFace INT8 128-D embedding extraction. It performs a read-only match against your enrolled profile template."*
5. However, upon clicking **Run Diagnostics Test**, the test output:
   - Always produced a synthetic `status: 'OPTIMAL'` regardless of who was in front of the camera.
   - Never performed any comparison against the customer's enrolled biometric template.
   - Did not provide clear distinction between camera unavailability, missing face, multiple faces, un-enrolled patron state, and match verification failure.

---

## 2. CODE EXECUTION AUDIT & DEFECT IDENTIFICATION

### Defect 2.1: Disconnected Camera Sensor Frame Execution
In `apps/dfarm-customer-app/src/face-ai/diagnostics.ts:6-15`:
```typescript
export async function runFaceDiagnostics(): Promise<FaceDiagnosticsReport> {
  await yuNetDetector.initialize();
  await sFaceEmbedder.initialize();
  const detectionResult = await yuNetDetector.detectFaces(); // No frame passed!
```
Because no camera frame or video reference was provided to `yuNetDetector.detectFaces()`, `yuNetDetector.ts:160-178` defaulted to a synthetic calibration bounding box:
```typescript
const detected: YuNetFaceDetection[] = [
  {
    boundingBox: { x: 140, y: 115, width: 358, height: 397 },
    landmarks: { ... },
    confidence: 0.96,
  },
];
```
The test never evaluated the live optical sensor or live camera frames.

### Defect 2.2: Omission of Biometric Match Verification Against Enrolled Profile
The diagnostics view promised a *"read-only match against your enrolled profile template"*.
However:
1. `runFaceDiagnostics()` never retrieved the farmer's enrolled template.
2. It never called the backend comparison endpoint `POST /api/v1/identity/face/match`.
3. It never computed cosine similarity between the current face and the enrolled template.
4. If an unregistered stranger stood in front of the camera, the app still reported `OPTIMAL (PASSED)`.

### Defect 2.3: Inadequate State Differentiation for Operators and Farmers
The UI only rendered generic telemetry badges:
- If camera permission was missing, the button was silently disabled without guided diagnostics.
- If the customer was approved but had not yet enrolled their face, the system reported `OPTIMAL` instead of informing the user: `NOT ENROLLED — Please complete face enrollment first`.
- Match failure (similarity below 0.363) was completely unrepresented in the report structure.

---

## 3. TARGETED REMEDIATION SPECIFICATION

1. **Integrated Live Verification:**
   Enhance `runFaceDiagnostics(options?: { customerId?: string; organizationId?: string })` to:
   - Check camera sensor availability and permission state.
   - Run YuNet detection and SFace INT8 feature extraction.
   - Validate 128-D vector finiteness and L2 normalization ($||\hat{v}||_2 = 1.0$).
   - If the customer has an active enrollment (`profile?.biometricStatus?.isEnrolled`), submit the generated vector to `POST /api/v1/identity/face/match` to verify against their registered template using the authorized threshold ($\ge 0.363$).
2. **Explicit Verification States:**
   The diagnostics report must distinctly represent:
   - `CAMERA_PERMISSION_REQUIRED`: Permission not granted.
   - `NO_FACE`: Zero faces in frame.
   - `MULTIPLE_FACES`: More than one person detected.
   - `MISALIGNED`: Face tilted > 15 degrees or poor landmark geometry.
   - `NOT_ENROLLED`: Face detected and embedding valid, but farmer has not yet enrolled a biometric profile.
   - `MATCH_VERIFIED`: Biometric match confirmed against enrolled template ($\text{sim} \ge 0.363$, confidence percentage displayed).
   - `MATCH_FAILED`: Face detected, but does not match the enrolled template ($\text{sim} < 0.363$).
3. **Real UI Feedback:**
   Update `diagnostics.tsx` to render the matching outcome prominently with tactile badges and human-readable advice in Marathi and English.
