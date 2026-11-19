# DFarm — Priority 0: Regression Test Report

**Execution Reference:** DFARM-PRIORITY-00-BACKEND-NETWORK-RECOVERY  
**Document:** `10_REGRESSION_TEST_REPORT.md`  
**Timestamp:** 2026-11-19T13:35:00+05:30  
**Overall Quality Gate:** 100% PASS  

---

## 1. Test Suite Results

### Backend Clean Architecture Test Suite
- **Command:** `node --test tests/clean-architecture.test.js`
- **Total Subtests:** 8 subtests in suite
- **Pass Count:** 8 / 8
- **Fail Count:** 0
- **Duration:** ~6.77s
- **Subtests Verified:**
  1. `1. Domain Value Objects Validation` ➔ **PASSED**
  2. `2. Biometric Encryption Engine (128-dim OpenCV SFace INT8)` ➔ **PASSED**
  3. `3. HMAC-SHA256 JWT Service (Zero Backdoors)` ➔ **PASSED**
  4. `4. Rate Engine Calculation (Grid + Formula Fallback)` ➔ **PASSED**
  5. `5. Customer Ledger Account Double-Entry Ledger` ➔ **PASSED**
  6. `6. Customer Entity Domain Invariants` ➔ **PASSED**
  7. `7. OTP Service Workflow (Live Dove / ExpertSkill)` ➔ **PASSED**
  8. `8. HTTP Endpoints Contract Verification` ➔ **PASSED**

### Collection App Test Suite (Vitest)
- **Command:** `vitest run` (`apps/dfarm-collection-app`)
- **Total Test Files:** 9 passed (9)
- **Total Unit Tests:** 48 passed (48)
- **Fail Count:** 0
- **Duration:** 15.79s
- **Suites Verified:**
  - `offline-queue.test.ts` ➔ **PASSED**
  - `auth.test.ts` ➔ **PASSED**
  - `hardware-drivers.test.ts` ➔ **PASSED**
  - `collection-transaction.test.ts` ➔ **PASSED**
  - `single-screen-kiosk.test.ts` ➔ **PASSED**
  - `dairy-face-matcher.test.ts` ➔ **PASSED**
  - `multi-dairy-isolation.test.ts` ➔ **PASSED**
  - `voice-announcer.test.ts` ➔ **PASSED**
  - `rate-calculation.test.ts` ➔ **PASSED**

### Frontend Builds & TypeScript Compilation
- **Backend:** `npm run build:backend` ➔ **Exit Code 0**
- **Dairy Admin:** `npm run build --workspace=apps/dfarm-dairy-admin` ➔ **Exit Code 0**
- **Super Admin:** `npm run build --workspace=apps/dfarm-super-admin` ➔ **Exit Code 0**
- **Collection App:** `npm run build --workspace=apps/dfarm-collection-app` ➔ **Exit Code 0**
- **Customer App:** `npm run typecheck --workspace=apps/dfarm-customer-app` ➔ **Exit Code 0**
