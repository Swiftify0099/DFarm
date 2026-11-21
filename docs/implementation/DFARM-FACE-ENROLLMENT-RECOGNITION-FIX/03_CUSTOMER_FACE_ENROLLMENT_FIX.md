# DFARM — Customer App Face Biometric Enrollment Fix

**Report Index:** `03_CUSTOMER_FACE_ENROLLMENT_FIX.md`  
**Execution Reference:** `DFARM-FACE-ENROLLMENT-RECOGNITION-END-TO-END-FIX`  
**Target:** `apps/dfarm-customer-app/src/app/(main)/profile/update-face.tsx` & `src/app/(onboarding)/face-enroll.tsx`

---

## 1. Executive Summary

Face Biometric Enrollment in the Customer App was previously taking single snapshots, failing to average multiple quality samples, and encountering AAD cryptographic mismatch when submitting templates with parameter `'me'`. 

This fix implements:
1. **5-Sample Quality-Checked Progressive Capture:** A five-frame sequential collection loop that validates YuNet landmark alignment, pose stability, and SFace feature extraction for every sample.
2. **Multi-Vector Averaging & L2 Normalization:** Integrates `averageAndNormalizeEmbeddings` in `preprocessor.ts` to compute the canonical arithmetic centroid across the 5 frames and project the vector to unit L2 norm ($\|v\|_2 = 1.0$).
3. **Backend Read-Back Confirmation:** Validates database persistence before transitioning to the `ENROLLED` status.
4. **Interactive Dashboard Banner:** Surfaced in `apps/dfarm-customer-app/src/app/(main)/index.tsx` for approved customers whose biometric enrollment is pending.

---

## 2. 5-Sample Quality Capture Algorithm

```typescript
const sampleEmbeddings: number[][] = [];
const TOTAL_SAMPLES = 5;

for (let sampleIdx = 1; sampleIdx <= TOTAL_SAMPLES; sampleIdx++) {
  setStatusMessage(`Capturing quality sample ${sampleIdx} of ${TOTAL_SAMPLES}...`);
  if (sampleIdx > 1) await new Promise((r) => setTimeout(r, 180));

  const detection = await yuNetDetector.detectFaces({ width: 640, height: 640 });
  if (!detection.faces || detection.faces.length === 0) {
    throw new Error(`Sample ${sampleIdx}: No face detected in reticle.`);
  }
  if (detection.faces.length > 1) {
    throw new Error(`Sample ${sampleIdx}: Multiple faces detected.`);
  }

  const primaryFace = detection.faces[0];
  const alignment = checkAlignmentQuality(primaryFace.landmarks);
  if (!alignment.isAligned) {
    throw new Error(`Sample ${sampleIdx}: ${alignment.reason}`);
  }

  const embeddingResult = await sFaceEmbedder.generateEmbedding(primaryFace.landmarks);
  sampleEmbeddings.push(embeddingResult.embedding);
  setProgress(Math.round((sampleIdx / TOTAL_SAMPLES) * 85));
}

const finalTemplate = averageAndNormalizeEmbeddings(sampleEmbeddings);
```

---

## 3. Visual Feedback & Progress Meter

- Tactile 3D clay progress indicator displaying real-time feedback ($20\% \rightarrow 40\% \rightarrow 60\% \rightarrow 80\% \rightarrow 100\%$).
- Clear instructions guiding the farmer to hold head steady inside the oval guide.
- Distinct status pills for validation failures (tilted head, poor illumination, multiple persons in frame).

---

## 4. Verification & Status Persistence

- Endpoint: `POST /api/v1/customers/:id/biometrics/update`
- Authenticated JWT token context resolves canonical `customerId` UUID.
- Backend encrypts embedding via AES-256-GCM with AAD bound to `DFARM:CUST=<UUID>:MODEL=<MODEL_VERSION_ID>`.
- Read-back query to `GET /api/v1/customers/:id` confirms `biometricStatus.isEnrolled === true` and `status === 'ENROLLED'`.
