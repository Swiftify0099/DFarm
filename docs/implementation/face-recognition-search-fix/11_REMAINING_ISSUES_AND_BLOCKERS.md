# 11. REMAINING ISSUES AND BLOCKERS

**Execution Reference:** DFARM-FACE-RECOGNITION-AND-CUSTOMER-SEARCH-FIX  
**Target Applications:** `apps/dfarm-customer-app`, `apps/dfarm-collection-app`, `services/backend`  
**Date:** 2026-11-19  
**Status:** ZERO BLOCKING ISSUES REMAINING

---

## 1. Issue Status Overview

All four primary defects identified in the target prompt have been systematically diagnosed, resolved at root cause, and verified with end-to-end tests:

| Issue | Target Feature | Initial Problem | Resolution Status |
| :---: | :--- | :--- | :---: |
| **A** | Customer App Biometric Update | `POST /customers/:id/biometrics/update` threw HTTP 500 (tenant resolution error & foreign key failure). | **RESOLVED & VERIFIED** |
| **B** | Customer App Test Face | Button executed synthetic mock without live camera frames or backend match verification. | **RESOLVED & VERIFIED** |
| **C** | Collection App Face Unrecognized | Camera started, but zero enrolled templates loaded in cache, causing `UNKNOWN_PERSON`. | **RESOLVED & VERIFIED** |
| **D** | Collection App Customer Search Enter | Pressing Enter triggered HTTP 400 (missing `organizationId`) or failed to submit due to button state. | **RESOLVED & VERIFIED** |

---

## 2. Environmental & Operational Considerations

While no blocking bugs remain in the codebase, the following operational and hardware considerations should be noted for production deployment:

### 2.1 Physical PostgreSQL vs In-Memory Fallback
- **Current Behavior:** When the physical PostgreSQL instance on port `54322` is offline, the backend automatically falls back to isolated in-memory doubles (`pg-mem`).
- **Production Guidance:** When deploying to production environments, verify that the physical PostgreSQL database cluster is running, connection pool limits (`TENANT_POOL_MAX`) are configured, and the master database migrations (`001` through `037`) have been applied. The `enrolled_by` foreign key auto-provisioning ensures that even empty tenant databases will not fail during initial patron onboarding.

### 2.2 Browser Camera Context Requirements
- **Requirement:** Modern web browsers require a Secure Context (`https://` or `http://localhost`) to access `navigator.mediaDevices.getUserMedia`.
- **Handling:** If accessed via an insecure plain HTTP network IP (e.g. `http://192.168.1.50:5175`), browser security policies will block camera access. Both apps now include explicit permission warning banners with actionable instructions (`CAMERA_PERMISSION_REQUIRED`, `CAMERA_UNAVAILABLE`).

### 2.3 ONNX WASM Asset Priming in Rural Kiosks
- **Asset Size:** The OpenCV ONNX runtime WASM bundle (`ort-wasm-simd-threaded.jsep-Dt5UNR3U.wasm`) is 29.5 MB.
- **Guidance:** In rural milk collection centers with limited cellular bandwidth, the browser cache or PWA service worker should prime model assets during initial kiosk commissioning so that daily operations do not depend on external internet bandwidth.

### 2.4 Biometric Recognition Threshold Governance
- **Current Active Threshold:** $0.363$ (OpenCV SFace INT8 calibrated cosine similarity).
- **Recommendation:** Do not alter the threshold without an authoritative multi-patron evaluation dataset. Raising the threshold above $0.45$ may lead to false rejections in varying ambient lighting, while lowering it below $0.30$ increases false acceptance risk.

---

## 3. Sign-off Summary

The biometric enrollment, re-enrollment, diagnostics, kiosk recognition, and customer search subsystems are fully operational, tested, and ready for deployment.
