# 01. ROOT CAUSE ANALYSIS

**Execution Reference:** `DFARM-FACE-ENROLLMENT-RECOGNITION-END-TO-END-FIX`  
**Target:** Customer App, Collection App, Backend, Tenant Databases  
**Date:** 2026-11-19  

---

## 1. Issue Categorization & Matrix

The reported production symptoms break down into seven discrete, interdependent root causes:

| # | Reported Symptom | Subsystem | Root Cause |
|---|---|---|---|
| **1** | Customer App Face Enrollment does not clarify status or progress | Customer App | Single-frame capture without progressive feedback or 5-sample quality pipeline. |
| **2** | No guarantee that enrollment is committed to database | Customer App / Backend | Lack of transactional read-back verification after submitting biometric vector. |
| **3** | Customer App **Test Face** button does not work | Customer App | No video frame passed to YuNet; static mock run without backend template matching. |
| **4** | Collection App camera reports registered customer as `UNKNOWN PERSON` | Collection App / Backend | Empty template cache due to mount-time auth starvation and/or GCM AAD decryption failure. |
| **5** | Camera detection vs identity recognition mismatch | Collection App | Uncaught runtime error in `sFaceEmbedder` when WASM was unready; local state de-synchronization with `HardwareContext`. |
| **6** | Model compatibility & threshold drift | Both Apps | Differing landmark tilt coefficients (`0.02` vs `0.01`) and lack of shared averaging math. |
| **7** | Tenant database storage & retrieval uncertainty | Backend / Tenant DB | Encryption AAD string bound to client `'me'` parameter instead of canonical `customer.id`. |

---

## 2. Detailed Root Cause Investigations

### 2.1 Root Cause of `UNKNOWN PERSON` in Collection App
When an operator logs into the Collection Terminal, `HardwareContext` executes `refreshCustomersAndTemplates` once at component mount. 
- If the browser restored the operator session slightly after mount or if the operator logged in dynamically via the modal, `dairyId` was `null` during the initial fetch.
- The request `/api/v1/identity/face/templates` defaulted to the platform federation UUID (`00000000-0000-0000-0000-000000000001`), returning 0 templates for the actual cooperative dairy (e.g. Warna Milk's `38918630-4fee-4cec-96ea-a3a899aae7bc`).
- With `enrolledTemplates.length === 0`, `DairyFaceMatcher.match` returns:
  ```ts
  return { isMatch: false, matchedCustomer: null, rejectionReason: 'NO_TEMPLATES' }
  ```
- In `useCamera.ts`, any non-match was unconditionally treated as `UNKNOWN_PERSON`.

### 2.2 Root Cause of Encryption / Decryption AAD Mismatch
In `services/backend/src/infrastructure/security/Aes256GcmBiometricEncryptor.ts`:
```ts
const aadString = `DFARM:CUST=${customerId}:MODEL=${modelVersionId}`;
```
AES-256-GCM uses Additional Authenticated Data (AAD) to cryptographically bind ciphertext to metadata. 
In `UpdateCustomerBiometricsUseCase.ts`:
```ts
const encrypted = this.encryptor.encrypt128DimEmbedding(params.embedding, params.customerId, modelId);
```
When `params.customerId` was passed as `'me'`, the ciphertext was sealed with `DFARM:CUST=me:MODEL=...`. When stored in the database, the record foreign key was resolved to the UUID (`c4a63116-...`). When `GetFaceTemplatesUseCase` later read `fe.customer_id` and called `decrypt128DimEmbedding(..., t.customerId, ...)`, the AAD was `DFARM:CUST=c4a63116-...:MODEL=...`. 
The cryptographic tag verification failed, throwing:
`Error: Unsupported state or unable to authenticate data`.
Because `identity.routes.ts` caught this error silently with `catch {}`, `embedding` became `null`, causing the template to be dropped.

### 2.3 Root Cause of Single-Frame Enrollment & Missing Averaging
In `apps/dfarm-customer-app/src/app/(main)/profile/update-face.tsx` and `(onboarding)/face-enroll.tsx`, the capture routine performed:
```ts
const detection = await yuNetDetector.detectFaces({ width: 640, height: 640 });
const primaryFace = detection.faces[0];
const embeddingResult = await sFaceEmbedder.generateEmbedding(primaryFace.landmarks);
await updateFace({ embedding: embeddingResult.embedding, confidence: primaryFace.confidence });
```
This captured only 1 frame. The business specification mandates:
1. Capture 5 distinct quality-checked frames.
2. Verify eye-level alignment, nose-centering, and distance on each frame.
3. Extract five 128-D vectors: $v_1, v_2, v_3, v_4, v_5$.
4. Average the vectors element-wise: $v_{avg}[i] = \frac{1}{5} \sum_{k=1}^5 v_k[i]$.
5. L2-normalize the resulting vector: $v_{final} = \frac{v_{avg}}{\|v_{avg}\|_2}$.

Without this, single-frame noise causes significant vector variance, leading to recognition failures at the kiosk.

### 2.4 Root Cause of Customer App "Test Face" Failure
In `apps/dfarm-customer-app/src/app/(main)/profile/diagnostics.tsx`:
- The screen rendered `<CameraView ref={cameraRef} />` as a visual preview.
- `handleRunDiagnostics` invoked `runFaceDiagnostics()` with no camera frame input.
- `runFaceDiagnostics()` in `src/face-ai/diagnostics.ts` executed with `detectFaces()` receiving `undefined` frameData, triggering synthetic fallback logic.
- Furthermore, the result did not verify identity against the customer's enrolled template in the dairy tenant database, and the UI displayed diagnostic badges instead of discrete recognition results (`FACE DETECTED`, `VERIFYING IDENTITY`, `FACE MATCHED`, `FACE NOT MATCHED`, `UNKNOWN PERSON`, `ENROLLMENT NOT FOUND`).

### 2.5 Root Cause of Post-Approval Enrollment Call-to-Action Missing
When a producer's registration is approved by the Dairy Admin:
- The customer logs into the Customer App via OTP.
- The app enters `/(main)/index.tsx`.
- The dashboard never evaluated `profile?.biometricStatus?.isEnrolled`.
- An approved farmer whose biometrics were not enrolled had no visible indicator or direct prompt to complete face enrollment.
