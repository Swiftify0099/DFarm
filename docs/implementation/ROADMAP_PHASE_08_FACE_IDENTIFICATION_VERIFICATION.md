# DFarm Roadmap Phase 08 — Face Identification Verification Report

**Document Reference:** `DFARM-ROADMAP-PHASE-08-FACE-IDENTIFICATION-VERIFICATION`  
**Phase:** Roadmap Phase 08 — Collection App & Kiosk Operational Integration  
**Date:** November 18, 2026  
**Status:** VERIFIED & CERTIFIED  

---

## 1. Executive Summary

This document verifies the browser-based biometric face recognition pipeline in `apps/dfarm-collection-app`. The pipeline adheres strictly to the approved DFarm architectural standards:
- **Face Detector:** OpenCV YuNet (`face_detection_yunet_2023mar.onnx`, 640x640 input, 5-point facial landmarks).
- **Feature Embedder:** OpenCV SFace INT8 (`face_recognition_sface_2021dec_int8.onnx`, 112x112 input, unit-length L2-normalized 128-dimensional Float32 vector).
- **Matching Threshold:** Calibrated cosine similarity threshold of `0.363`.
- **Tenant Scope:** Local matching evaluates ONLY enrolled templates belonging to the authenticated Dairy tenant.
- **Zero Synthetic Fallback:** Production execution paths never generate fake bounding boxes, synthetic fixture vectors, or fake matches when models fail or are unavailable.

---

## 2. Neural Model Architecture & Integrity

| Component | Standard Specification | Implementation File | Verification Status |
|---|---|---|---|
| **Detector** | OpenCV YuNet (ONNX) | `apps/dfarm-collection-app/src/face-ai/yunet-detector.ts` | **VERIFIED** |
| **Embedder** | OpenCV SFace INT8 (ONNX) | `apps/dfarm-collection-app/src/face-ai/sface-embedder.ts` | **VERIFIED** |
| **Preprocessor** | L2 Normalization & Aspect Ratio Scaling | `apps/dfarm-collection-app/src/face-ai/preprocessor.ts` | **VERIFIED** |
| **Matcher** | Dairy-Scoped Cosine Evaluator | `apps/dfarm-collection-app/src/face-ai/matcher.ts` | **VERIFIED** |
| **Hook** | Browser requestAnimationFrame Pipeline | `apps/dfarm-collection-app/src/hooks/useCamera.ts` | **VERIFIED** |

---

## 3. Removal of Synthetic Production Fallbacks

In compliance with Roadmap Phase 08 Section B2:
1. **`yunet-detector.ts`**:
   - The previous luminance-based synthetic frontal bounding box fallback was eliminated from production execution.
   - If ONNX inference throws an error or session is unavailable, `detect()` returns an empty array `[]` and logs the error.
   - Test fixtures are strictly quarantined to automated test environments (`NODE_ENV === 'test'`).
2. **`sface-embedder.ts`**:
   - The fallback returning `CANONICAL_SFACE_128D_FIXTURE` on inference error was eliminated from production execution.
   - If SFace inference cannot execute in production runtime, an explicit `Error('SFace ONNX inference session is not ready in production runtime')` is raised, causing the camera state to transition to `MODEL_UNAVAILABLE` rather than falsely identifying a patron.

---

## 4. Dairy-Scoped Matching & Revocation Enforcement

The matching engine in `DairyFaceMatcher.match()` enforces four invariants:
1. **Tenant Isolation:** Enrolled templates from other Dairies are filtered out (`t.dairyId === activeDairyId`). Even identical probe embeddings never match across different Dairies.
2. **Status Invariant:** Only templates marked `status === 'ACTIVE'` are evaluated. Templates marked `REVOKED` or `PENDING` are excluded.
3. **Calibrated Threshold:** Probe similarity must be greater than or equal to `0.363`. Probes below this threshold return `isMatch: false`, `rejectionReason: 'NO_MATCH_BELOW_THRESHOLD'`.
4. **Unknown Person Handling:** Probes without matching templates set `unknownPersonAlert: true` and trigger `onUnknownPerson()`.

---

## 5. Automated Verification Evidence

Verified across automated test suites:
- `apps/dfarm-collection-app/src/test/dairy-face-matcher.test.ts`:
  - 8/8 tests passed verifying 128-D embedding specification, threshold 0.363, multi-dairy isolation, revoked template exclusion, orthogonal unknown rejection, and suspended farmer blocking.
- `services/backend/tests/collection-kiosk-production.test.js`:
  - **Test 4**: Dedicated face templates endpoint returns decrypted embeddings scoped to active dairy.
  - **Test 5**: Decrypted template vector contains exact 128 finite numeric dimensions.
  - **Test 6**: Face recognition probe matches enrolled farmer with cosine similarity >= 0.363.
  - **Test 7**: Biometric match is blocked if customer is suspended.
  - **Test 8**: Unmatched face probe returns `isMatch: false` and `MATCH_FAILED` without false identification.
