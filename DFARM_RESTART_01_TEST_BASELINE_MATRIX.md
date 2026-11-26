# DFarm — RESTART-01 Test Baseline Matrix

**Audit Sequence:** `RESTART-01`  
**Execution Date:** `2026-11-26`  
**Workspace Build Gate:** `npm run build:backend` -> **PASS (`EXIT=0`)** across `@dfarm/shared-types`, `@dfarm/shared-validation`, `@dfarm/database`, and `@dfarm/backend`.  
**Offline Environment Constraints Observed:**
- Local PostgreSQL ports `5432` and `54322` are closed (`False`).
- Isolated test env variables used for backend runs: `NODE_ENV=test`, `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:59999/dfarm_offline`, `CENTRAL_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:59999/dfarm_offline`, `DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:59999/dfarm_offline`, `SUPABASE_URL=http://127.0.0.1:59998`, `TENANT_POOL_CONNECTION_TIMEOUT_MS=500`.

---

## 1. Aggregate Inventory & Baseline Totals

| Workspace / Scope | Total Files | Passed Files | Failed Files | Skipped / Timeout / Utility | Observed Test Case Counts |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `apps/dfarm-collection-app` | `17` | `17` | `0` | `0` | `162/162` PASS |
| `apps/dfarm-dairy-admin` | `5` | `5` | `0` | `0` | `14/14` PASS |
| `apps/dfarm-super-admin` | `10` | `10` | `0` | `0` | `48/48` PASS (mockBackend-backed) |
| `apps/dfarm-customer-app` | `8` | `8` | `0` | `0` | `31/31` PASS |
| `packages/database` | `3` | `2` | `0` | `1` SKIP | `22/22` PASS (`real-postgres-verification.test.js` skipped) |
| `services/backend/tests` (`*.test.*` + `2` scripts) | `66` | `15` | `27` | `13` SKIP + `5` Timeout/Hung + `4` Chrome/PG Not Run + `2` Utility | See per-file matrix below |
| **Total Repository Test/Check Files** | **`109`** | **`57`** | **`27`** | **`14` SKIP / `5` Timeout/Hung / `4` Not Run / `2` Utility** | Exact per-suite results below |

---

## 2. Frontend & Database Package Test Results

| Workspace | Command / Runner | Suites / Files | Assertions / Tests | Status | Notes |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `apps/dfarm-collection-app` | Vitest (`npm test`) | `17 / 17` | `162 / 162` | **PASS** | Frontend unit & component suite |
| `apps/dfarm-dairy-admin` | Vitest (`npm test`) | `5 / 5` | `14 / 14` | **PASS** | Frontend unit suite |
| `apps/dfarm-super-admin` | Vitest (`npm test`) | `10 / 10` | `48 / 48` | **PASS** | Relies on `src/services/mockBackend.ts` |
| `apps/dfarm-customer-app` | Jest / Expo (`npm test`) | `8 / 8` | `31 / 31` | **PASS** | Mobile hooks/utils/unit suite |
| `packages/database` (`schema-validation.test.js`) | `npm run db:validate` | `1` | `13 / 13` | **PASS** | Validates migrations `001`–`010` only |
| `packages/database` (`database-runtime.test.js`) | `npm run db:test` | `1` | `9 / 9` | **PASS** | Runtime contract tests |
| `packages/database` (`real-postgres-verification.test.js`) | `npm run db:test` | `1` | `1` skipped | **SKIP** | Requires physical PostgreSQL (`BLOCKED BY ENVIRONMENT`) |

---

## 3. Backend Test & Audit Matrix (`services/backend/tests/` — All 66 Files)

### 3.1 Passing Offline Suites (`15` files)
| Test File | Tests | Pass | Fail | Skip | Notes |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `clean-architecture.test.js` | `9` | `9` | `0` | `0` | Clean architecture invariants |
| `collection-operator-authorization-fix.test.js` | `9` | `9` | `0` | `0` | Tests `/auth/operator/login` only |
| `customer-face-biometrics-update-resolution.test.js` | `7` | `7` | `0` | `0` | Passes offline |
| `dairy-activation-workflow.test.js` | `13` | `13` | `0` | `0` | Passes offline |
| `dairy-admin-production.test.js` | `36` | `36` | `0` | `0` | Uses hardened `dairy-admin.routes.ts` |
| `dairy-location.test.js` | `8` | `8` | `0` | `0` | Coordinate validation tests |
| `face-biometric-and-tenant-isolation-e2e.test.js` | `8` | `8` | `0` | `0` | Passes offline |
| `fix01-production-auth-otp-security.test.js` | `11` | `11` | `0` | `0` | Verifies FIX-01 hardened admin OTP routes |
| `multi-dairy-membership.test.js` | `9` | `9` | `0` | `0` | Customer multi-dairy switching |
| `roadmap-phase-02-auth-rbac.test.js` | `27` | `27` | `0` | `0` | Auth/RBAC offline suite |
| `roadmap-phase-06-dairy-admin.test.js` | `41` | `41` | `0` | `0` | Dairy admin offline suite |
| `sample-p08.test.js` | `1` | `1` | `0` | `0` | Smoke test |
| `super-admin-production.test.js` | `33` | `33` | `0` | `0` | Uses hardened `super-admin.routes.ts` |
| `super-admin-tenant-database-control.test.js` | `8` | `8` | `0` | `0` | Tenant DB mapping control tests |
| `tenant-database-isolation.test.js` | `7` | `7` | `0` | `0` | Cross-tenant DB isolation offline suite |

### 3.2 Failing Offline Suites — Real Application / Contract / Setup Failures (`11` partial/E2E suites)
| Test File | Tests | Pass | Fail | Observed Failure Reason |
| :--- | :---: | :---: | :---: | :--- |
| `biometric-engine.test.js` | `21` | `13` | `8` | Real backend biometric/embedding test failures offline |
| `collection-kiosk-production.test.js` | `24` | `14` | `10` | Kiosk collection/session endpoint & fixture failures |
| `customer-app-production.test.js` | `42` | `37` | `5` | Customer endpoint/auth assertions fail offline |
| `customer-data-lifecycle-e2e.test.js` | `9` | `4` | `5` | `pg-mem` AST fail on `dairy_database_mappings` + Step 2 `400 !== 200` + Step 3 `401 !== 200` |
| `customer-face-api-404-network-fix.test.js` | `38` | `34` | `4` | Subtests 34/36 passbook & double-entry ledger balance fail after intake |
| `customer-tenant-approval-e2e.test.js` | `11` | `6` | `5` | Subtest 3 fails (`400 !== 201`) cascading into subtests 6, 8, 9 & suite wrapper |
| `end-to-end-customer-to-collection.test.mjs` | `1` | `0` | `1` | `TypeError: tenantDbManager.getMapping is not a function` at line 71 |
| `face-1n-recognition-customer-ledger-e2e.test.js` | `9` | `6` | `3` | Biometric 1:N / ledger integration assertions fail offline |
| `face-biometric-and-search-e2e.test.js` | `7` | `1` | `6` | Subtest 1 fails `400 !== 201` onboarding, cascading 404s |
| `offline-sync-22-scenarios.test.js` | `23` | `10` | `13` | Sync route shadowing / `organizationId` omission & scenario failures |
| `roadmap-phase-07-dairy-admin.test.js` | `41` | `37` | `4` | Group E fails (`404 !== 201` on device calibration/registration; `deviceRouter` unmounted) |

### 3.3 Failing Offline Suites — Blocked by Closed PostgreSQL (`16` suites with top-level `ECONNREFUSED 127.0.0.1:59999`)
| Test File | Tests | Pass | Fail | Observed Failure |
| :--- | :---: | :---: | :---: | :--- |
| `billing-engine.test.js` | `1` | `0` | `1` | `ECONNREFUSED 127.0.0.1:59999` + `DeviceChallengeService` `pg-mem` AST error |
| `collection-workflow.test.js` | `1` | `0` | `1` | `ECONNREFUSED 127.0.0.1:59999` |
| `customer-endpoints.test.js` | `1` | `0` | `1` | `ECONNREFUSED 127.0.0.1:59999` |
| `customer-ledger-accounting.test.js` | `1` | `0` | `1` | `ECONNREFUSED 127.0.0.1:59999` |
| `customer-lifecycle-security.test.js` | `1` | `0` | `1` | `ECONNREFUSED 127.0.0.1:59999` |
| `customer-mobile-p18.test.js` | `1` | `0` | `1` | `ECONNREFUSED 127.0.0.1:59999` |
| `customer-payments-p15.test.js` | `1` | `0` | `1` | `ECONNREFUSED 127.0.0.1:59999` |
| `dashboard-history-verification.test.js` | `1` | `0` | `1` | `ECONNREFUSED 127.0.0.1:59999` |
| `employee-payroll-phase16.test.js` | `1` | `0` | `1` | `ECONNREFUSED 127.0.0.1:59999` |
| `feed-inventory-phase14.test.js` | `1` | `0` | `1` | `ECONNREFUSED 127.0.0.1:59999` |
| `health-and-auth.test.js` | `1` | `0` | `1` | `ECONNREFUSED 127.0.0.1:59999` |
| `identification-phase08.test.js` | `1` | `0` | `1` | `ECONNREFUSED 127.0.0.1:59999` |
| `notification-engine-p19.test.js` | `1` | `0` | `1` | `ECONNREFUSED 127.0.0.1:59999` |
| `phase11-rate-and-integration.test.js` | `1` | `0` | `1` | `ECONNREFUSED 127.0.0.1:59999` |
| `registration-app-connectivity.test.js` | `1` | `0` | `1` | `ECONNREFUSED 127.0.0.1:59999` |
| `sync-engine.test.js` | `1` | `0` | `1` | `ECONNREFUSED 127.0.0.1:59999` |

*(Verification sum across `services/backend/tests/`: `15` passing + `11` partial/E2E failing + `16` `ECONNREFUSED` failing + `13` skipped + `5` hung/timed-out + `4` unrun Chrome/PG E2E + `2` utility scripts = `66` files exact.)*

### 3.4 Skipped / Timed-Out Offline & PG/Chrome-Gated Suites (`23` files)
| Test File | Result | Environment Requirement |
| :--- | :--- | :--- |
| `concurrent-idempotency-financial.test.js` | **SKIP (`1` skipped)** | Requires real PostgreSQL |
| `prompt223-migration-timezone-audit.test.js` | **SKIP (`1` skipped)** | Requires real PostgreSQL |
| `prompt4-bulk-sync-rate-matrix.test.js` | **SKIP (`1` skipped)** | Requires real PostgreSQL |
| `prompt41-security-financial-audit.test.js` | **SKIP (`1` skipped)** | Requires real PostgreSQL |
| `prompt42-offline-auth-financial-audit.test.js` | **SKIP (`1` skipped)** | Requires real PostgreSQL |
| `prompt421-financial-parity-lease-hardening.test.js` | **SKIP (`1` skipped)** | Requires real PostgreSQL |
| `prompt422-source-level-verification.test.js` | **SKIP (`1` skipped)** | Requires real PostgreSQL (skipped offline) |
| `prompt423-device-proof-and-signing-key-audit.test.js` | **SKIP (`1` skipped)** | Requires real PostgreSQL |
| `prompt424-distributed-replay-revocation-audit.test.js` | **SKIP (`1` skipped)** | Requires real PostgreSQL |
| `prompt6-1-realtime-security-gate.test.js` | **SKIP (`1` skipped)** | Requires real PostgreSQL |
| `prompt6-2-distributed-sse-and-device-gate.test.js` | **SKIP (`1` skipped)** | Requires real PostgreSQL |
| `prompt6-dairy-admin-realtime.test.js` | **SKIP (`1` skipped)** | Requires real PostgreSQL |
| `prompt7-farmer-milk-payment-union-bank.test.js` | **SKIP (`1` skipped)** | Requires real PostgreSQL |
| `prompt5-2-1-rate-sync-gate.test.js` | **HUNG / KILLED (`>96s`)** | Imports `db` without guard / hangs waiting offline |
| `roadmap-phase-03-super-admin-core.test.js` | **TIMEOUT (`>10s`)** | Exceeded 10s offline harness timeout |
| `roadmap-phase-04-platform-services.test.js` | **TIMEOUT (`>10s`)** | Exceeded 10s offline harness timeout |
| `roadmap-phase-09-financial-calculation-settlement.test.js` | **TIMEOUT (`>10s`)** | Exceeded 10s offline harness timeout |
| `roadmap-phase-10-cross-app-integration.test.js` | **TIMEOUT (`>10s`)** | Exceeded 10s offline harness timeout |
| `prompt425-browser-webcrypto-challenge-audit.test.js` | **NOT RUN (Chrome/PG)** | Requires real PG + headless Chrome (`playwright`/CDP) |
| `prompt5-2-real-pg-and-browser-gate.test.js` | **NOT RUN (Chrome/PG)** | Explicitly skips when `db.checkConnection()` false; requires Chrome |
| `prompt5-real-browser-crash-recovery.test.js` | **NOT RUN (Chrome/PG)** | Explicitly skips when `db.checkConnection()` false; requires Chrome |
| `prompt6-1-chrome-e2e.test.js` | **NOT RUN (Chrome/PG)** | Explicitly skips when `db.checkConnection()` false; requires Chrome |

### 3.5 Standalone Utility / Benchmark Scripts inside `services/backend/tests/` (`2` files)
| File | Role | Status |
| :--- | :--- | :--- |
| `reconciliation-audit.js` | Standalone SQL double-entry ledger reconciliation script (`127.0.0.1:54322`) | **NOT RUN** (Requires real PostgreSQL) |
| `sync-performance.bench.js` | Performance benchmark script (`127.0.0.1`) | **BROKEN CONTRACT / NOT RUN** — calls unmounted `POST /api/v1/devices/register` (L29) and queries Sangli seed org |
