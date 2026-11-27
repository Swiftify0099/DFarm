# DFARM RESTART-04 / RESTART-04.1 — Device Authentication, Offline Sync Tenant Isolation & Route Security Report

**Repository:** `Swiftify0099/DFarm`  
**Branch:** `fix/cloudflare-pages-production-deploy`  
**Current Public HEAD:** `65e7addd121ee3baed1eedc8f32f0a4934dab0c2` (`fix: resolve PostgreSQL 17 CI failure in customer-ledger-accounting test suite via robust pool lifecycle management`; committed `2026-11-28 00:22:28 +0530`)  
**Previous Public HEADs:** `38216761bdac32cf929efc6641f25f73bb9abf23` (`RESTART-03.8`), `3938421d2651c59628aadac0f539d0b583f687f0` (`RESTART-03.7`), `32c37a137c54d153a07f07cb8a40735e94da7d8b` (`RESTART-03.6`), `db8b73296247a8dd800e7276f12eda4a68c2ff4b` (parent `8eba95427ee2170ee46c02f3a08ffde86a2bde24`)  
**Target Issues:** `DF-007` (P0) & Device-Management Scope of `DF-018` (P1)  
**Final Classification:** **Verified on PG17 (`db8b732` `45968244756` `8/8` PASS; `32c37a` `45974095598` `success`; `3938421` `46043084873` `success`; `3821676` `46047724695` `success`; `65e7add` `46053066866` `success`) / Local Follow-Up Teardown Hardening Uncommitted on Top of `65e7add` (RESTART-03 CI Gate Still Failed on `65e7add` `46053067000`; Pending Commit/Push)**

> [!IMPORTANT]
> On public commit `65e7add`, GitHub Actions completed `RESTART-04` ([`46053066866`](https://github.com/Swiftify0099/DFarm/actions/runs/46053066866) -> `success`), `RESTART-03` ([`46053067000`](https://github.com/Swiftify0099/DFarm/actions/runs/46053067000) / Job [`140688893141`](https://github.com/Swiftify0099/DFarm/actions/runs/46053067000/job/140688893141) -> `failure` at Step 10), and `Secret Scanning (Gitleaks)` ([`46053066876`](https://github.com/Swiftify0099/DFarm/actions/runs/46053066876) -> `failure`; `DF-003` remains OPEN under `RESTART-12`).
> Local follow-up teardown hardening across `restart03-real-postgres.test.js`, `restart032-real-postgres.test.js`, and `restart033-real-postgres-repositories.test.js` (plus updated reports) sits uncommitted on top of `65e7add` awaiting commit/push and a fresh live PG17 CI run.

---

## 1. Baseline Verification, CI Evidence & RESTART-03.7 / RESTART-03.8 Reconciliation

Repository state and GitHub Actions CI evidence comparing public HEAD `38216761bdac32cf929efc6641f25f73bb9abf23`, previous public HEADs (`3938421`, `32c37a`, `db8b732`), and local `RESTART-03.9` edits:

- **Git Baseline:** Checked out branch `fix/cloudflare-pages-production-deploy`.
  - **Current public HEAD:** `38216761bdac32cf929efc6641f25f73bb9abf23` (`feat: add PostgreSQL 17 verification workflow and tenant pool lifecycle tests`; committed `2026-11-27 23:42:18 +0530`; includes `RESTART-03.8` publicly).
  - **Previous public HEADs:** `3938421d2651c59628aadac0f539d0b583f687f0` (`RESTART-03.7`), `32c37a137c54d153a07f07cb8a40735e94da7d8b` (`RESTART-03.6`), `db8b73296247a8dd800e7276f12eda4a68c2ff4b` (`RESTART-04`).
  - **Local worktree state:** Based on `3821676`, with uncommitted `RESTART-03.9` edits in `services/backend/tests/customer-ledger-accounting.test.js`, `DFARM_RESTART_03_9_CI_FAILURE_ROOT_CAUSE_AND_FIX_REPORT.md`, and reconciled reports (no commit/push per task rules).
- **RESTART-04 Real PG17 Gate (`DF-007`):**
  - **On current public HEAD `3821676` (`RESTART-03.8`):** CI Run [`46047724695`](https://github.com/Swiftify0099/DFarm/actions/runs/46047724695) completed with **`success`**.
  - **On previous public HEAD `3938421` (`RESTART-03.7`):** CI Run [`46043084873`](https://github.com/Swiftify0099/DFarm/actions/runs/46043084873) / Job [`140655461165`](https://github.com/Swiftify0099/DFarm/actions/runs/46043084873/job/140655461165) completed with **`success`**.
  - **On previous public HEAD `32c37a`:** CI Run [`45974095598`](https://github.com/Swiftify0099/DFarm/actions/runs/45974095598) / Job [`140421403779`](https://github.com/Swiftify0099/DFarm/actions/runs/45974095598/job/140421403779) completed with **`success`**.
  - **On previous baseline `db8b732`:** CI Run [`45968244756`](https://github.com/Swiftify0099/DFarm/actions/runs/45968244756) **PASSED** on PostgreSQL `17.12` — **`8` passed, `0` failed, `0` skipped** (zero `pg-mem` fallback). A fresh CI run is still required after pushing `RESTART-03.9`.
- **RESTART-03 Real PG17 Gate:**
  - **On current public HEAD `3821676` (`RESTART-03.8`):** CI Run [`46047724725`](https://github.com/Swiftify0099/DFarm/actions/runs/46047724725) / Job [`140671067739`](https://github.com/Swiftify0099/DFarm/actions/runs/46047724725/job/140671067739) **FAILED** on `customer-ledger-accounting.test.js` (`Test "20..." generated asynchronous activity after the test ended`, `terminating connection due to administrator command`).
  - **Local `RESTART-03.9` edits on top of `3821676`:** Fixed `customer-ledger-accounting.test.js` teardown (`closePoolCleanly()`, `attachPoolErrorGuard()`, `realtimePublisher.destroy()`, `sseTicketService.destroy()`, `waitForDbIdle()` before `DROP DATABASE` without `WITH (FORCE)`). Live PG17 CI verification of `RESTART-03.9` is pending commit/push.
- **Gitleaks Scan:**
  - **On current public HEAD `3821676`:** CI Run [`46047724612`](https://github.com/Swiftify0099/DFarm/actions/runs/46047724612) **FAILED** with **`54` findings**. `DF-003` remains **OPEN** under `RESTART-12`.
- **Independent Tenant Integrity & Outbox Scope Preserved:** `DF-021` (`RealtimeEventPublisher.processOutboxBatch()` querying central `db` while `041_dairy_admin_realtime_and_station_monitoring.sql` creates `dashboard_events_outbox` on `TENANT_OPERATIONAL`) remains preserved for `RESTART-09`, `DF-020` migration reconciliation (`031`/`040`) remains preserved for `RESTART-05`, `DF-022`/`DF-024` remain preserved for `RESTART-10`, and modular biometric routes (`DF-018`) remain preserved for `RESTART-07`.
- **Safety Preservation Verified:**
  - `.temp/` and untracked/local files preserved untouched; no `git reset --hard`, `git clean`, `git stash`, commit, push, or history rewrite executed.

---

## 2. Implemented Changes Summary

### 2.1 `/sync/push` Route Shadowing Removal (`DF-007`)
- **`services/backend/src/presentation/routes/sync.routes.ts`**
  - Removed the shadowing `router.post('/push', authenticate, authorizePermission(...), handleSyncBatch)` route that previously intercepted `/api/v1/sync/push` before `syncRouter`.
  - Preserved operator-authenticated routes (`/api/v1/sync/transactions` and `/api/v1/sync/bulk`) with their `authenticate` + `authorizeRoles` / `authorizePermission` + tenant-scoped `handleSyncBatch` handlers.
- **`services/backend/src/modules/sync/sync.routes.ts`**
  - `/api/v1/sync/push`, `/api/v1/sync/pull`, `/api/v1/sync/acknowledge`, and `/api/v1/sync/status` now mount behind `authenticateDevice` exclusively, consuming `req.device` (`DeviceAuthContext`).
  - Refactored `/conflicts`, `/conflicts/:id/resolve`, and `/events` off central `config/db.js` onto strict `tenantDbManager.getStrictTenantDb(organizationId)` queries/updates scoped by `organization_id`.
- **Client & Legacy Test Alignment**
  - Updated `apps/dfarm-collection-app/src/api/client.ts` (`pushBatch`) and `services/backend/tests/collection-kiosk-production.test.js` (GROUP D operator batch tests 12–13) from `/sync/push` to `/sync/transactions` with `{ transactions: [...] }`, matching operator JWT auth without relaxing device-auth isolation.

### 2.2 Elimination of Device Authentication Bypasses (`DF-007`)
- **`services/backend/src/security.ts`**
  - Defined strict `DeviceTokenInput` and `VerifiedDeviceTokenClaims` contracts requiring valid UUID `sub`, `organizationId`, `centerId`, non-empty `deviceIdentifier`, `type: 'device'`, unique `jti`, and `exp`.
  - Replaced legacy `verifyDeviceToken()` behavior:
    - Rejects non-JWT / 3-part-malformed tokens (removes the previous raw-UUID `NODE_ENV === 'test'` fallback).
    - Rejects expired tokens (`DEVICE_TOKEN_EXPIRED`), non-device user/refresh JWTs (`INVALID_DEVICE_TOKEN_TYPE`), and legacy device tokens lacking required tenant/center/device claims (`DEVICE_RE_REGISTRATION_REQUIRED` so legacy tokens fail closed and cannot bypass tenant isolation).
- **`services/backend/src/middleware/authenticate.ts`**
  - Removed all `config/db.js` central `pool` imports and removed unauthenticated lookup via `X-Device-ID`, `req.body.deviceId`, `req.query.deviceId`, app-JWT fallback, and raw UUID tokens.
  - Enforces token extraction solely from `Authorization: Bearer <token>` or `X-Device-Token`.
  - Cross-checks any optional hint headers/payload fields (`X-Device-ID`, `req.body.deviceId`, `req.query.deviceId`, `req.body.organizationId`/`dairyId`, `req.body.centerId`) against the verified JWT claims and rejects mismatches with `403`.
  - Resolves tenant DB strictly via `tenantDbManager.getStrictTenantDb(claims.organizationId)` (returns `503` on unmapped/unavailable tenant DB rather than scanning all tenants or falling back to central DB).
  - Verifies stored `device_token_hash` via timing-safe SHA-256 comparison (`401 DEVICE_TOKEN_MISMATCH`), checks active/non-blocked/non-revoked status (`status`, `is_blocked`, `revoked_at`), organization & active center ownership, matching `device_identifier`, and offline lease expiry (`403 OFFLINE_EXPIRED`).
  - Attaches trusted `req.device: DeviceAuthContext` (`deviceId`, `organizationId`, `centerId`, `deviceIdentifier`, `tokenJti`) and `req.deviceId`.

### 2.3 Hardened Device Registration & Revocation (`DF-018` Device Scope)
- **`services/backend/src/modules/sync/device-registry.service.ts`**
  - Created `DeviceRegistryService.registerDevice()` and `DeviceRegistryService.revokeDevice()` operating strictly against `tenantDbManager.getStrictTenantDb(actor.organizationId)`.
  - `registerDevice`: enforces authoritative caller `organizationId` (rejects client cross-tenant override), validates active org and center ownership in the tenant DB, prevents hijacking an existing `device_identifier` owned by a different center/revoked record (`403 DEVICE_REVOKED` / conflict guard), issues signed tenant-bound device JWT, stores only `device_token_hash` (never plaintext token in DB), atomically initializes `device_sync_state`, and writes `audit_logs`.
  - `revokeDevice`: locates the device inside the caller's strict tenant DB, clears `device_token_hash`, sets `status = 'BLOCKED'`, `is_blocked = TRUE`, `revoked_at = NOW()`, revokes offline authorization expiry, and records `audit_logs`.
- **`services/backend/src/presentation/routes/devices.routes.ts`**
  - Mounted `POST /api/v1/devices/register` and `POST /api/v1/devices/revoke` under `authenticate` + `authorizeRoles('SUPER_ADMIN', 'PRIMARY_DAIRY_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'CENTER_MANAGER')` backed by `DeviceRegistryService`.
  - Preserved existing device telemetry/calibration endpoints (`DF-019`) untouched for `RESTART-08`.
  - Also hardened `deviceRouter` in `services/backend/src/modules/sync/sync.routes.ts` to delegate to `DeviceRegistryService` rather than central `pool`.

### 2.4 Strict Tenant `SyncService`, Actor/Data Integrity & Savepoint Handling (`DF-007`)
- **`services/backend/src/modules/sync/sync.service.ts`**
  - Removed `config/db.js` `pool` / `query` imports; all `pushEvents`, `pullChanges`, `acknowledge`, and `getStatus` operations accept verified `DeviceAuthContext`, resolve `tenantDbManager.getStrictTenantDb(deviceCtx.organizationId)`, verify device/center ownership in the tenant DB (`503` when tenant DB fails), and never fall back to central `db` or `getAllTenantDbs()`.
  - Removed the `SELECT id FROM users WHERE organization_id = $1 ORDER BY created_at ASC LIMIT 1` fallback identity.
  - Enforces authoritative actor validation on operational events (user must exist in the same tenant DB, be `ACTIVE`, hold a permitted operational role, and hold valid `user_center_assignments` for the center when not org-wide admin).
  - Removed fabricated defaults (`'0000000000'` phone numbers, synthetic farmer codes/names/addresses, auto-created users/customers).
  - Enforces `organization_id`-scoped `milk_collections` insertion with `ON CONFLICT (organization_id, idempotency_key) DO NOTHING RETURNING id`, rate chart & milk category authorization, `FOR UPDATE` customer ledger account locking, `LEDGER-COLL-...` idempotent ledger postings, balanced 2-line double-entry `ledger_entries`, and explicit `ledgerEffectApplied: false` when payouts are `PENDING_APPROVAL` or receipts are `DRAFT`.
  - Fixed savepoint suppression in `safeSavepoint`, `safeReleaseSavepoint`, and `safeRollbackSavepoint`: removed `NODE_ENV === 'test'` suppression so only explicit `pg-mem` adapters (`client.__isPgMem === true` or `!err?.code && err.message.includes('pg-mem')`) suppress unsupported savepoint AST errors, while real PostgreSQL savepoint/rollback failures propagate loudly and fail the transaction/batch safely.
- **`services/backend/src/infrastructure/database/PostgresPool.ts` & `TenantDatabaseManager.ts`**
  - Tagged `pg-mem` clients with `__isPgMem = true` and synchronized offline `pg-mem` tenant schemas with `012_sync_engine_enhancements.sql` plus missing `devices`, `center_settings`, and `rate_chart_versions` columns needed by the sync engine.

### 2.5 Test Recovery, Security Suite & Real PG17 Gate
- **`services/backend/tests/offline-sync-22-scenarios.test.js`:** Recovered from `10/23` to **`23/23` PASS** (`ISOLATED_TEST_INSTANCE` tenant DB seeded; double `pool.end()` hook fixed; tests clearly distinguish `[BACKEND INTEGRATION]` vs `[SIMULATED LOCAL EDGE UNIT]`).
- **`services/backend/tests/restart04-device-auth-and-route-security.test.js`:** Added offline suite covering admin-only device registration & hash-only storage, `/sync/push` de-shadowing vs `/sync/transactions` operator RBAC, 16+ negative device-auth fail-closed cases (no token, `body.deviceId` only, `query.deviceId` only, `X-Device-ID` only, raw UUID Bearer token, invalid signature, expired JWT, app JWT used as device token, legacy device JWT missing claims, token hash mismatch, wrong org claim, wrong center claim, revoked device, blocked device, offline expiry elapsed, unmapped tenant DB -> `503`), and non-`pg-mem` savepoint failure propagation under `NODE_ENV=test`.
- **`services/backend/tests/restart04-real-postgres-device-sync.test.js`**, **`scripts/ci-run-restart04-pg17.js`**, **`.github/workflows/dfarm-restart04-postgres17.yml`:** Added isolated PostgreSQL `17.12` disposable-cluster integration suite covering real PG17 device registration/revocation, token verification, cross-tenant rejection, `503` unmapped tenant DB, concurrent duplicate batch idempotency, real PostgreSQL savepoint rollback failure propagation under `NODE_ENV=test`, pull/acknowledge/status cursor updates, and `ledgerEffectApplied` semantics.

---

## 3. Exact Verification Matrix (Reconciled on Public HEAD `3821676` + Local `RESTART-03.9` Teardown Fix)

| Check / Suite | Command / Runner | Environment | Executed | Pass | Fail | Skip | Exit Code | Status |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| Backend TypeScript Build | `npm run build:backend` | Local Windows (Post-edit) | - | - | 0 | 0 | `0` | **PASS** |
| DB Migration Static Validation | `npm run db:validate` | Local Windows (Post-edit) | 13 | 13 | 0 | 0 | `0` | **PASS** |
| DB Package Runtime Suite | `npm run db:test` (`packages/database`) | `pg-mem` + PG gated (Post-edit) | 22 (+1 suite skip) | 22 | 0 | 1 | `0` | **PASS (`pg-mem`; internal PG suite skipped)** |
| **RESTART-04 Recovered Sync Suite** | `node --test services/backend/tests/offline-sync-22-scenarios.test.js` | `pg-mem` (Post-edit) | **23** | **23** | **0** | **0** | **`0`** | **PASS** |
| **RESTART-04 Device Auth & Route Security** | `node --test services/backend/tests/restart04-device-auth-and-route-security.test.js` | `pg-mem` (Post-edit) | **5** | **5** | **0** | **0** | **`0`** | **PASS** |
| `restart032-operational-repository-isolation.test.js` | `node --test ...` | `pg-mem` (Post-edit) | 17 | 17 | 0 | 0 | `0` | **PASS** |
| `restart03-tenant-isolation-and-ownership.test.js` | `node --test ...` | `pg-mem` (Post-edit) | 18 | 18 | 0 | 0 | `0` | **PASS** |
| `restart02-auth-security-remediation.test.js` | `node --test ...` | `pg-mem` (Post-edit) | 9 | 9 | 0 | 0 | `0` | **PASS** |
| `restart021-auth-session-integrity.test.js` | `node --test ...` | `pg-mem` (Post-edit) | 7 | 7 | 0 | 0 | `0` | **PASS** |
| `clean-architecture.test.js` | `node --test ...` | Node built-in (Post-edit) | 9 | 9 | 0 | 0 | `0` | **PASS** |
| **Offline Pool Lifecycle Suite** | `node scripts/ci-run-offline-lifecycle-suite.js` (`restart037-pool-lifecycle.test.js`) | Node built-in / Barriers (Post-edit) | **20** | **20** | **0** | **0** | **`0`** | **PASS** |
| **RESTART-04 Real PG17 Suite (Default Local)** | `node --test services/backend/tests/restart04-real-postgres-device-sync.test.js` | No PG17 on host | 1 | 0 | 0 | **1** | `0` | **SKIP (no `pg-mem` fallback)** |
| **RESTART-04 PG17 CI Runner (Strict Guard Local)** | `REQUIRE_REAL_POSTGRES=1 NODE_ENV=test DFARM_ALLOW_DISPOSABLE_PG17_MUTATIONS=1 TEST_REAL_POSTGRES=1 node scripts/ci-run-restart04-pg17.js` | No `TEST_POSTGRES_URL` / PG17 | 0 | 0 | 0 | 0 | **`1`** | **FAIL CLOSED (`exit 1`)** |
| **RESTART-04 Real PG17 CI Gate (HEAD `3821676` — Public)** | GitHub Actions Run `46047724695` | GitHub Actions PG `17.12` | - | - | 0 | 0 | **`0`** | **`success`** |
| **RESTART-03 Real PG17 CI Gate (HEAD `3821676` — Public)** | GitHub Actions Run `46047724725` / Job `140671067739` | GitHub Actions PG `17.12` | - | - | 1 | 0 | **`1`** | **`failure` (`customer-ledger-accounting.test.js` teardown; repaired locally in `RESTART-03.9`)** |
| **Secret Scanning (Gitleaks, HEAD `3821676`)** | GitHub Actions Run `46047724612` | Gitleaks full history | - | - | 54 | 0 | `1` | **FAIL (`54` findings; `DF-003` OPEN under `RESTART-12`)** |

---

## 4. Scope Boundaries & Remaining Blockers

- **Out-of-Scope Tracks Preserved Unchanged:** Did not start `RESTART-05..12` (migration `031`/`040` reconciliation under `RESTART-05`, biometric module mounting / `customerBiometricRouter` under `RESTART-07`, static device telemetry stubs / `DF-019` under `RESTART-08`, outbox `dashboard_events_outbox` / `RealtimeEventPublisher` under `RESTART-09`, Union Bank under `RESTART-10`, Gitleaks full-history rewrite `DF-003` under `RESTART-12`).
- **Local `RESTART-03.9` Live PostgreSQL `17.12` CI Verification Pending:** Public `3821676` (`RESTART-03.8`) completed `RESTART-04` (`46047724695`) with `success` and `RESTART-03` (`46047724725`) with `failure` on `customer-ledger-accounting.test.js` teardown. Local `RESTART-03.9` fixes (`services/backend/tests/customer-ledger-accounting.test.js` and updated reports) are uncommitted per task rules; once committed/pushed by the operator, execute/verify both gates:
  ```bash
  REQUIRE_REAL_POSTGRES=1 NODE_ENV=test DFARM_ALLOW_DISPOSABLE_PG17_MUTATIONS=1 TEST_REAL_POSTGRES=1 node scripts/ci-run-pg17-suites.js
  REQUIRE_REAL_POSTGRES=1 NODE_ENV=test DFARM_ALLOW_DISPOSABLE_PG17_MUTATIONS=1 TEST_REAL_POSTGRES=1 node scripts/ci-run-restart04-pg17.js
  ```
