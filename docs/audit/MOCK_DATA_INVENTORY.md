# MOCK DATA INVENTORY

**Audit Document Reference:** `DFARM-AUDIT-007`  
**Version:** `1.0.0-PROMPT0-AUDIT`  
**Status:** `READ-ONLY TECHNICAL BASELINE`  
**Classification:** `Comprehensive Mock Data, Demo Artifacts & Synthetic Record Inventory`  
**Evaluator:** DFarm Principal Solution Architect & Codebase Auditor  

---

## 1. Classification Methodology

Every synthetic dataset discovered across the DFarm monorepo is classified under one of four strict categories:
1. **Category A — Production Runtime Fake Data:** Mock data embedded in client production code or server runtime fallbacks that leaks into live user sessions.
2. **Category B — Development Fallbacks:** Hardcoded constants used when external services (e.g. SMTP or SMS) are unconfigured.
3. **Category C — Isolated Automated Test Fixtures:** Mock data confined strictly to test suites (`tests/`, `vitest`, `jest`).
4. **Category D — Seed / Baseline Control Records:** Master configuration data (e.g. SFace 128-D model version descriptors) required for cold platform bootstrap.

---

## 2. Exhaustive Mock Data & Synthetic Artifacts Register

| Inventory ID | File Path | Line Range | Classification | Item Description & Values |
| :--- | :--- | :--- | :---: | :--- |
| **MOCK-001** | `apps/dfarm-super-admin/src/services/seedData.ts` | Lines 37-711 | **Category A** | 22 hardcoded Dairy Tenants (`dairy_blr_0042`, `dairy_kop_0118`, etc.), 22 Primary Admins, 15 synthetic audit logs, 8 mock alerts, synthetic telemetry summaries. |
| **MOCK-002** | `apps/dfarm-super-admin/src/services/mockBackend.ts` | Lines 1-1928 | **Category A** | Full 70 KB mock server implementation managing local storage state for Super Admin KPI metrics, reports, support sessions, and alerts. |
| **MOCK-003** | `apps/dfarm-dairy-admin/src/api/mock-server.ts` | Lines 1-2683 | **Category A** | Complete 2,683-line in-memory dairy server. Holds `CURRENT_DAIRY_ID = 'dairy-ten-9801'`, Gokul Dairy profile, 12 demo customers, fake collection sessions, dummy milk register, fake bills. |
| **MOCK-004** | `apps/dfarm-collection-app/src/api/mock-backend.ts` | Lines 15-80 | **Category A** | Kiosk mock database holding `CURRENT_DAIRY_ID = 'dairy-ten-9801'`, `CURRENT_DEVICE_ID = 'DF-KIOSK-001'`, fake customers ("Pandurang Patil", "Sunita Shinde", "Aniket Jadhav"), dummy RFID cards. |
| **MOCK-005** | `services/backend/src/infrastructure/database/PostgresPool.ts` | Lines 224-337 | **Category A** | In-memory `pg-mem` seed data. Seeds 7 hardcoded dairies (Gokul, Warna, Sahyadri, Kalpna, ShivShakti, Shree Krishna, DFarm Primary Cooperative) and hardcodes Pankaj Popat Yewale to Gokul. |
| **MOCK-006** | `apps/dfarm-customer-app/src/face-ai/yunet-detector.ts` | Lines 156-179 | **Category A** | Calibrated frontal camera detection bounding box (`confidence: 0.96`, static eye and mouth coordinates) returned when ONNX runtime is absent. |
| **MOCK-007** | `apps/dfarm-customer-app/src/face-ai/sface-embedder.ts` | Lines 7-24 | **Category A** | `CANONICAL_SFACE_128D_FIXTURE` (128-D vector starting with `-0.082143, 0.041285...`). Returned with micro-jitter when SFace ONNX model is uninitialized. |
| **MOCK-008** | `services/backend/src/infrastructure/email/EmailService.ts` | Lines 400-420 | **Category B** | `STANDBY_LOCAL_PREVIEW` mode. Returns simulated `messageId: preview-[timestamp]` and logs activation link to console when SMTP credentials are unset. |
| **MOCK-009** | `services/backend/src/infrastructure/otp/DoveOtpService.ts` | Lines 175-184 | **Category B** | `previewOtp: rawOtp` returned in HTTP response when `ALLOW_TEST_PREVIEW_OTP=true` or `NODE_ENV === 'test'`. |
| **MOCK-010** | `apps/dfarm-collection-app/src/pages/devices/HardwareTelemetryPage.tsx` | Lines 45-70 | **Category A** | Virtual device heartbeat generator. Uses `Math.random()` to generate fluctuating baud rates, latencies (12-48ms), and fake green online status pills. |
| **MOCK-011** | `services/backend/tests/clean-architecture.test.js` | Lines 1-150 | **Category C** | Isolated test fixtures verifying Clean Architecture use cases and controllers using mock repositories. |
| **MOCK-012** | `packages/database/tests/schema-validation.test.js` | Lines 1-144 | **Category C** | Static DDL assertion test suite verifying table counts and column constraints in `supabase/migrations`. |
| **MOCK-013** | `services/backend/src/infrastructure/database/TenantDatabaseManager.ts` | Lines 464-473 | **Category D** | Seed entry for `face_model_versions` (`f0000000-0000-0000-0000-000000000001` - OpenCV-SFace-INT8, 128-D, threshold 0.363). Valid domain master seed. |

---

## 3. Production Runtime Fake Data Impact Analysis

### 1. Gokul Cooperative Identity Hijacking
- `MOCK-003` and `MOCK-005` establish an artificial tie between the user and Gokul. Any real Dairy created through Super Admin is eclipsed because the system defaults to Gokul seeds.
- **Remediation:** Remove static seed inserts in `PostgresPool.ts` (lines 224-337). Database records must be created exclusively via `POST /api/v1/dairies`.

### 2. Disconnected Super Admin Simulation
- `MOCK-001` and `MOCK-002` isolate the Super Admin web app from the backend. The Super Admin cannot view real database health or real registered dairies because the frontend consumes `seedData.ts`.
- **Remediation:** In Prompt 3, purge `mockBackend.ts` and connect all Super Admin views to genuine backend routes.

### 3. Biometric Canonical Collision
- `MOCK-006` and `MOCK-007` cause different farmers to share mathematically equivalent face vectors. Consequently, face matching in Collection App cannot reliably identify farmers.
- **Remediation:** In Prompt 5, ensure live ONNX inference or backend extraction generates authentic, unique 128-D face embeddings from captured images.

---

## 4. Phased Decommissioning Plan

- **Prompt 1:** Remove static tenant seeds from `PostgresPool.ts`. Ensure clean PostgreSQL database initialization without hardcoded organizations.
- **Prompt 3:** Remove `apps/dfarm-super-admin/src/services/mockBackend.ts` and `seedData.ts`.
- **Prompt 6:** Remove `apps/dfarm-dairy-admin/src/api/mock-server.ts`.
- **Prompt 8:** Remove `apps/dfarm-collection-app/src/api/mock-backend.ts`.
- **Prompt 11:** Production hardening sweep: Verify that no mock objects or test bypasses exist in compiled web or mobile release bundles.
