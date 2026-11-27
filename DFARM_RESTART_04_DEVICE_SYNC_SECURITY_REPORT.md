# DFARM RESTART-04 — Device Authentication, Offline Sync Tenant Isolation & Route Security Report

**Repository:** `Swiftify0099/DFarm`  
**Branch:** `fix/cloudflare-pages-production-deploy`  
**Starting Public HEAD:** `9d0568b32e117dc93d8c62389c482b5a77d68f40`  
**Target Issues:** `DF-007` (P0) & Device-Management Scope of `DF-018` (P1)  
**Final Classification:** **BLOCKED ON LIVE PG17 / PARTIAL** *(All RESTART-04 code changes, build, `db:validate`, offline unit/route/auth/sync suites (`28/28`), core backend offline suites (`230/230`), and all `4` frontend test suites (`255/255`) PASS locally with `0` regressions; real PostgreSQL `17.12` execution of `restart04-real-postgres-device-sync.test.js` cannot run on this Windows host because `com.docker.service` is stopped, no native `psql`/PG17 instance is installed, and `git commit`/`push` to trigger GitHub Actions CI is prohibited by safety rules.)*

---

## 1. Baseline Verification & RESTART-03.5A Reconciliation

Before modifying code, local repository state and RESTART-03.5A CI logs were reconciled:

- **Git Baseline:** Checked out branch `fix/cloudflare-pages-production-deploy` at public HEAD `9d0568b32e117dc93d8c62389c482b5a77d68f40`.
- **RESTART-03.5A Real PG17 Gate:** CI Run `45943003261` / Job `140321315106` on `9d0568b` passed build (`npm run build:backend`), migration validation (`npm run db:validate`), compatibility role bootstrap, and all 5 real PostgreSQL `17.12` suites (`44` passed, `0` failed, `0` skipped).
- **Gitleaks Scan:** CI Run `45943003232` / Job `140321315158` failed on `54` historical findings across `41` commits (`DF-003`, kept under `RESTART-12`) with zero findings reported for commit `9d0568b`.
- **Reconciled Baseline Docs:**
  - `DFARM_RESTART_03_5_REAL_POSTGRES17_FAILURE_REMEDIATION_REPORT.md`
  - `DFARM_RESTART_03_5_FINAL_CI_MATRIX.md`
  - `DFARM_RESTART_01_MASTER_ISSUE_REGISTER.md` (updated for `DF-007`, `DF-018`, `DF-029`, and the `RESTART-04` Section 3 entry)
- **Safety Preservation Verified:**
  - `.temp/`: `0` files tracked by git (`git ls-files .temp`), `1829` files preserved untouched on disk.
  - `services/backend/dist/`: rebuilt cleanly via `npm run build:backend` and kept tracked/updated.
  - `.github/workflows/dfarm-restart03-postgres17.yml`: verified unmodified (`0` diff lines).

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

## 3. Exact Verification Matrix (Post-Final Edit)

| Check / Suite | Command / Runner | Environment | Executed | Pass | Fail | Skip | Exit Code | Status |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| Backend TypeScript Build | `npm run build:backend` | Local Windows | - | - | 0 | 0 | `0` | **PASS** |
| DB Migration Static Validation | `npm run db:validate` | Local Windows | 13 | 13 | 0 | 0 | `0` | **PASS** |
| DB Package Runtime Suite | `npm run db:test` (`packages/database`) | `pg-mem` + PG gated | 22 (+1 file skip) | 22 | 0 | 1 | `0` | **PASS (`pg-mem`; internal PG file skipped)** |
| **RESTART-04 Recovered Sync Suite** | `node --test services/backend/tests/offline-sync-22-scenarios.test.js` | `pg-mem` | **23** | **23** | **0** | **0** | **`0`** | **PASS** |
| **RESTART-04 Device Auth & Route Security** | `node --test services/backend/tests/restart04-device-auth-and-route-security.test.js` | `pg-mem` | **5** | **5** | **0** | **0** | **`0`** | **PASS** |
| `restart032-operational-repository-isolation.test.js` | `node --test ...` | `pg-mem` | 17 | 17 | 0 | 0 | `0` | **PASS** |
| `restart03-tenant-isolation-and-ownership.test.js` | `node --test ...` | `pg-mem` | 18 | 18 | 0 | 0 | `0` | **PASS** |
| `customer-data-lifecycle-e2e.test.js` | `node --test ...` | `pg-mem` | 9 | 9 | 0 | 0 | `0` | **PASS** |
| `restart02-auth-security-remediation.test.js` | `node --test ...` | `pg-mem` | 9 | 9 | 0 | 0 | `0` | **PASS** |
| `restart021-auth-session-integrity.test.js` | `node --test ...` | `pg-mem` | 7 | 7 | 0 | 0 | `0` | **PASS** |
| `collection-kiosk-production.test.js` | `node --test ...` | `pg-mem` | 24 | 24 | 0 | 0 | `0` | **PASS** |
| `customer-tenant-approval-e2e.test.js` | `node --test ...` | `pg-mem` | 11 | 11 | 0 | 0 | `0` | **PASS** |
| `multi-dairy-membership.test.js` | `node --test ...` | `pg-mem` | 9 | 9 | 0 | 0 | `0` | **PASS** |
| `tenant-database-isolation.test.js` | `node --test ...` | `pg-mem` | 7 | 7 | 0 | 0 | `0` | **PASS** |
| `dairy-admin-production.test.js` | `node --test ...` | `pg-mem` | 36 | 36 | 0 | 0 | `0` | **PASS** |
| `roadmap-phase-06-dairy-admin.test.js` | `node --test ...` | `pg-mem` | 41 | 41 | 0 | 0 | `0` | **PASS** |
| `super-admin-production.test.js` | `node --test ...` | `pg-mem` | 33 | 33 | 0 | 0 | `0` | **PASS** |
| `clean-architecture.test.js` | `node --test ...` | Node built-in | 9 | 9 | 0 | 0 | `0` | **PASS** |
| **Customer App (`dfarm-customer-app`)** | `npm run --workspace=apps/dfarm-customer-app test` | Jest (`8/8` files) | 31 | 31 | 0 | 0 | `0` | **PASS** |
| **Collection App (`dfarm-collection-app`)** | `npm run --workspace=apps/dfarm-collection-app test` | Vitest (`17/17` files) | 162 | 162 | 0 | 0 | `0` | **PASS** |
| **Dairy Admin (`dfarm-dairy-admin`)** | `npm run --workspace=apps/dfarm-dairy-admin test` | Vitest (`5/5` files) | 14 | 14 | 0 | 0 | `0` | **PASS** |
| **Super Admin (`dfarm-super-admin`)** | `npm run --workspace=apps/dfarm-super-admin test` | Vitest (`10/10` files) | 48 | 48 | 0 | 0 | `0` | **PASS** |
| **RESTART-04 Real PG17 Suite (Default)** | `node --test services/backend/tests/restart04-real-postgres-device-sync.test.js` | No PG17 on host | 1 | 0 | 0 | **1** | `0` | **SKIP (no `pg-mem` fallback)** |
| **RESTART-04 PG17 CI Runner (Strict Guard)** | `REQUIRE_REAL_POSTGRES=1 NODE_ENV=test DFARM_ALLOW_DISPOSABLE_PG17_MUTATIONS=1 node scripts/ci-run-restart04-pg17.js` | No `TEST_POSTGRES_URL` / PG17 | 0 | 0 | 0 | 0 | **`1`** | **FAIL CLOSED (`exit 1`)** |

**Aggregated Offline Totals:**  
- Backend offline suites executed: **`15/15` files PASS — `258/258` tests PASS, `0` failed, `0` skipped**.  
- Frontend workspaces executed: **`4/4` apps (`40/40` test files) PASS — `255/255` tests PASS, `0` failed, `0` skipped**.

---

## 4. Scope Boundaries & Remaining Blockers

- **Out-of-Scope Tracks Preserved Unchanged:** Did not start `RESTART-05..12` (biometric module mounting / `customerBiometricRouter` under `RESTART-07`, static device telemetry stubs / `DF-019` under `RESTART-08`, outbox / SSE under `RESTART-09`, Union Bank under `RESTART-10`, migration `031`/`040` or financial formulas, Gitleaks full-history rewrite `DF-003` under `RESTART-12`).
- **Live PostgreSQL `17.12` Verification Blocker:** `restart04-real-postgres-device-sync.test.js` has not yet been executed against a live PostgreSQL `17.12` server (`com.docker.service` is stopped, Docker named pipe is absent, `psql`/`pg_ctl` are not installed on this Windows host, and `git commit`/`push` to trigger `.github/workflows/dfarm-restart04-postgres17.yml` is prohibited). Once committed/pushed or run against `docker-compose.pg17-verify.yml` (`TEST_POSTGRES_URL=...`), run:
  ```bash
  REQUIRE_REAL_POSTGRES=1 NODE_ENV=test DFARM_ALLOW_DISPOSABLE_PG17_MUTATIONS=1 node scripts/ci-run-restart04-pg17.js
  ```
