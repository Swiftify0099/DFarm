# DFARM — Production Rollout Checklist

**Report Index:** `12_PRODUCTION_ROLLOUT_CHECKLIST.md`  
**Execution Reference:** `DFARM-FACE-ENROLLMENT-RECOGNITION-END-TO-END-FIX`  

---

## Pre-Deployment Verification Checklist

- [x] **Model Checksums Verified:**
  - YuNet ONNX: `8F2383E4...` (392,028 bytes) in both Customer and Collection apps.
  - SFace INT8 ONNX: `2B0E941E...` (3,158,582 bytes) in both Customer and Collection apps.
- [x] **Mathematical Preprocessing Aligned:**
  - BGR color ordering, 112x112 affine alignment, and unit L2 normalization ($\|v\|_2 = 1.0$) identical across mobile and browser.
- [x] **5-Sample Multi-Frame Averaging:**
  - Progressive enrollment capturing 5 quality-checked samples with vector averaging deployed to Customer App.
- [x] **Customer App Test Face Diagnostics:**
  - Discrete status pills (`FACE_MATCHED`, `FACE_NOT_MATCHED`, `ENROLLMENT_NOT_FOUND`, etc.) with similarity score display active.
- [x] **Collection Kiosk Hardware Integration:**
  - `HardwareContext` synchronized with `useCamera` and automatic template refresh on dairy context change.
- [x] **Multi-Tenant Cryptographic Isolation:**
  - AAD bound to canonical tenant UUIDs with zero cross-tenant leakage.
- [x] **Unit & Integration Test Suites Passing:**
  - Collection App Vitest: 48 / 48 tests passing.
  - Customer App Jest: 22 / 22 tests passing.
  - Customer App TypeScript: 0 errors (`tsc --noEmit`).
  - Collection App Build: 0 errors (`tsc -b && vite build`).
  - Backend Build: 0 errors (`tsc`).
  - End-to-End Test Suite: 8 / 8 subtests passing (`face-biometric-and-tenant-isolation-e2e.test.js`).
