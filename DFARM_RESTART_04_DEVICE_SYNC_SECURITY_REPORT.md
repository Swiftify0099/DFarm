# DFARM RESTART-04 / RESTART-04.1 — Device Authentication, Offline Sync Tenant Isolation & Route Security Report

**Repository:** `Swiftify0099/DFarm`  
**Branch:** `fix/cloudflare-pages-production-deploy`  
**Verified Public HEAD:** `8eba95427ee2170ee46c02f3a08ffde86a2bde24` (Parent: `9d0568b32e117dc93d8c62389c482b5a77d68f40`)  
**Target Issues:** `DF-007` (P0) & Device-Management Scope of `DF-018` (P1)  
**Final Classification:** **BLOCKED ON LIVE PG17 / PARTIAL (RESTART-04.1 Fixture Alignment Applied Locally; Pending Subsequent Live PG17 CI Run)** *(RESTART-04.1 fixed the three `users.user_role` fixture `INSERT` statements in `services/backend/tests/restart04-real-postgres-device-sync.test.js` that caused GitHub Actions Run `45947088946` / Job `140334160273` to fail with SQLSTATE `42703`. Post-edit `npm run build:backend`, `npm run db:validate` (`13/13`), `npm run db:test` (`22/22` offline, internal PG skipped), and all `15` backend offline suites (`258/258`) PASS locally. Live PostgreSQL `17.12` execution on this Windows host remains blocked because Docker Desktop (`com.docker.service` stopped; WSL/VM backend engine returns `HTTP 503` / `Docker Desktop is unable to start`) and native PostgreSQL 17 are unavailable, and `git commit`/`push` is prohibited by safety rules. RESTART-04 is NOT marked PG17 verified until a subsequent real PG17 run passes.)*

---

## 1. Baseline Verification, CI Failure & RESTART-04.1 Reconciliation

Before modifying code, local repository state and GitHub Actions CI evidence on HEAD `8eba95427ee2170ee46c02f3a08ffde86a2bde24` were reconciled:

- **Git Baseline:** Checked out branch `fix/cloudflare-pages-production-deploy` at public HEAD `8eba95427ee2170ee46c02f3a08ffde86a2bde24` (parent `9d0568b32e117dc93d8c62389c482b5a77d68f40`) with a clean working tree.
- **RESTART-03 Real PG17 Gate (HEAD `8eba954`):** CI Run `45947088863` **PASSED** on PostgreSQL `17.12` (5-suite repository verification gate).
- **RESTART-04 Real PG17 Gate (HEAD `8eba954`):** CI Run `45947088946` / Job `140334160273` (`RESTART-04 PostgreSQL 17 Device Sync & Security Gate`) **FAILED** with PostgreSQL SQLSTATE `42703` (`column "user_role" of relation "users" does not exist`) at `services/backend/tests/restart04-real-postgres-device-sync.test.js:182`.
  - **Root Cause:** Authoritative migration `supabase/migrations/003_user_identity_foundation.sql` (`SHARED`) defines `users.role`, not `users.user_role`. (`user_role` is added only by control-plane migrations `029` and `030`, not tenant-operational migrations.) The PG17 test fixture inserted both `role` and `user_role` in three `INSERT INTO users` blocks (control-plane seed near line 149, Tenant A seed near line 183, Tenant B seed near line 216).
  - **RESTART-04.1 Fix:** Removed `user_role` and the duplicated role literal from all three `INSERT INTO users` blocks in `services/backend/tests/restart04-real-postgres-device-sync.test.js`, preserving `role`, organization IDs, active/inactive states, usernames, and all security/authorization cases. Production schema and migrations were not altered.
- **Gitleaks Scan (HEAD `8eba954`):** CI Run `45947088844` **FAILED** with `54` findings across `42` commits (kept under `DF-003` / `RESTART-12`; external credential rotations and approved history rewrite remain pending operator action).
- **Prior `9d0568b` Baseline Reference:** CI Run `45943003261` / Job `140321315106` passed the 5-suite PG `17.12` gate (`44/44`), and Gitleaks Run `45943003232` failed on `54` findings across `41` commits.
- **Independent Outbox Finding Preserved for `RESTART-09` (`DF-021`):** RESTART-04 CI logs recorded background `relation "dashboard_events_outbox" does not exist` errors because `RealtimeEventPublisher.processOutboxBatch()` (`services/backend/src/infrastructure/realtime/RealtimeEventPublisher.ts`) queries `dashboard_events_outbox` via central `db`, while `supabase/migrations/041_dairy_admin_realtime_and_station_monitoring.sql` creates `dashboard_events_outbox` on the `TENANT_OPERATIONAL` track. Deliberately left untouched in RESTART-04.1 for `RESTART-09`.
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

## 3. Exact Verification Matrix (Post-RESTART-04.1 Edit on HEAD `8eba954`)

| Check / Suite | Command / Runner | Environment | Executed | Pass | Fail | Skip | Exit Code | Status |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| Backend TypeScript Build | `npm run build:backend` | Local Windows (Post-edit) | - | - | 0 | 0 | `0` | **PASS** |
| DB Migration Static Validation | `npm run db:validate` | Local Windows (Post-edit) | 13 | 13 | 0 | 0 | `0` | **PASS** |
| DB Package Runtime Suite | `npm run db:test` (`packages/database`) | `pg-mem` + PG gated (Post-edit) | 22 (+1 suite skip) | 22 | 0 | 1 | `0` | **PASS (`pg-mem`; internal PG suite skipped)** |
| **RESTART-04 Recovered Sync Suite** | `node --test services/backend/tests/offline-sync-22-scenarios.test.js` | `pg-mem` (Post-edit) | **23** | **23** | **0** | **0** | **`0`** | **PASS** |
| **RESTART-04 Device Auth & Route Security** | `node --test services/backend/tests/restart04-device-auth-and-route-security.test.js` | `pg-mem` (Post-edit) | **5** | **5** | **0** | **0** | **`0`** | **PASS** |
| `restart032-operational-repository-isolation.test.js` | `node --test ...` | `pg-mem` (Post-edit) | 17 | 17 | 0 | 0 | `0` | **PASS** |
| `restart03-tenant-isolation-and-ownership.test.js` | `node --test ...` | `pg-mem` (Post-edit) | 18 | 18 | 0 | 0 | `0` | **PASS** |
| `customer-data-lifecycle-e2e.test.js` | `node --test ...` | `pg-mem` (Post-edit) | 9 | 9 | 0 | 0 | `0` | **PASS** |
| `restart02-auth-security-remediation.test.js` | `node --test ...` | `pg-mem` (Post-edit) | 9 | 9 | 0 | 0 | `0` | **PASS** |
| `restart021-auth-session-integrity.test.js` | `node --test ...` | `pg-mem` (Post-edit) | 7 | 7 | 0 | 0 | `0` | **PASS** |
| `collection-kiosk-production.test.js` | `node --test ...` | `pg-mem` (Post-edit) | 24 | 24 | 0 | 0 | `0` | **PASS** |
| `customer-tenant-approval-e2e.test.js` | `node --test ...` | `pg-mem` (Post-edit) | 11 | 11 | 0 | 0 | `0` | **PASS** |
| `multi-dairy-membership.test.js` | `node --test ...` | `pg-mem` (Post-edit) | 9 | 9 | 0 | 0 | `0` | **PASS** |
| `tenant-database-isolation.test.js` | `node --test ...` | `pg-mem` (Post-edit) | 7 | 7 | 0 | 0 | `0` | **PASS** |
| `dairy-admin-production.test.js` | `node --test ...` | `pg-mem` (Post-edit) | 36 | 36 | 0 | 0 | `0` | **PASS** |
| `roadmap-phase-06-dairy-admin.test.js` | `node --test ...` | `pg-mem` (Post-edit) | 41 | 41 | 0 | 0 | `0` | **PASS** |
| `super-admin-production.test.js` | `node --test ...` | `pg-mem` (Post-edit) | 33 | 33 | 0 | 0 | `0` | **PASS** |
| `clean-architecture.test.js` | `node --test ...` | Node built-in (Post-edit) | 9 | 9 | 0 | 0 | `0` | **PASS** |
| **Customer App (`dfarm-customer-app`)** *(prior baseline; unchanged in 04.1)* | `npm run --workspace=apps/dfarm-customer-app test` | Jest (`8/8` files, baseline) | 31 | 31 | 0 | 0 | `0` | **BASELINE PASS (not re-run; no client/contract edits)** |
| **Collection App (`dfarm-collection-app`)** *(prior baseline; unchanged in 04.1)* | `npm run --workspace=apps/dfarm-collection-app test` | Vitest (`17/17` files, baseline) | 162 | 162 | 0 | 0 | `0` | **BASELINE PASS (not re-run; no client/contract edits)** |
| **Dairy Admin (`dfarm-dairy-admin`)** *(prior baseline; unchanged in 04.1)* | `npm run --workspace=apps/dfarm-dairy-admin test` | Vitest (`5/5` files, baseline) | 14 | 14 | 0 | 0 | `0` | **BASELINE PASS (not re-run; no client/contract edits)** |
| **Super Admin (`dfarm-super-admin`)** *(prior baseline; unchanged in 04.1)* | `npm run --workspace=apps/dfarm-super-admin test` | Vitest (`10/10` files, baseline) | 48 | 48 | 0 | 0 | `0` | **BASELINE PASS (not re-run; no client/contract edits)** |
| **RESTART-04 Real PG17 Suite (Default Local)** | `node --test services/backend/tests/restart04-real-postgres-device-sync.test.js` | No PG17 on host (Post-edit) | 1 | 0 | 0 | **1** | `0` | **SKIP (no `pg-mem` fallback)** |
| **RESTART-04 PG17 CI Runner (Strict Guard Local)** | `REQUIRE_REAL_POSTGRES=1 NODE_ENV=test DFARM_ALLOW_DISPOSABLE_PG17_MUTATIONS=1 TEST_REAL_POSTGRES=1 node scripts/ci-run-restart04-pg17.js` | No `TEST_POSTGRES_URL` / PG17 (Post-edit) | 0 | 0 | 0 | 0 | **`1`** | **FAIL CLOSED (`exit 1`)** |
| **RESTART-04 Real PG17 CI Gate (HEAD `8eba954` pre-fix)** | GitHub Actions Run `45947088946` / Job `140334160273` | GitHub Actions PG `17.12` | - | 0 | 1 | 0 | **`1`** | **FAIL (`42703` `users.user_role` at line 182; fixed locally in 04.1)** |
| **RESTART-03 Real PG17 CI Gate (HEAD `8eba954`)** | GitHub Actions Run `45947088863` | GitHub Actions PG `17.12` | - | - | 0 | 0 | `0` | **PASS** |
| **Secret Scanning (Gitleaks, HEAD `8eba954`)** | GitHub Actions Run `45947088844` | Gitleaks full history | - | - | 54 | 0 | `1` | **FAIL (`54` findings across `42` commits; `DF-003` / `RESTART-12`)** |

**Aggregated Offline Totals (Post-RESTART-04.1 Edit):**  
- Backend offline suites executed: **`15/15` files PASS — `258/258` tests PASS, `0` failed, `0` skipped**.  
- Frontend baseline preserved (not re-run in RESTART-04.1 because no shared contracts or client files changed): **`4/4` apps (`40/40` test files) — `255/255` tests PASS**.

---

## 4. Scope Boundaries & Remaining Blockers

- **Out-of-Scope Tracks Preserved Unchanged:** Did not start `RESTART-05..12` (biometric module mounting / `customerBiometricRouter` under `RESTART-07`, static device telemetry stubs / `DF-019` under `RESTART-08`, outbox `dashboard_events_outbox` / `RealtimeEventPublisher` under `RESTART-09`, Union Bank under `RESTART-10`, migration `031`/`040` or financial formulas, Gitleaks full-history rewrite `DF-003` under `RESTART-12`).
- **Live PostgreSQL `17.12` Verification Blocker:** After the RESTART-04.1 fixture fix, `restart04-real-postgres-device-sync.test.js` could not execute locally against a live PostgreSQL `17.12` server because Docker Desktop's Linux VM backend failed to start (`com.docker.service` stopped; `docker desktop start` remained in `starting` with `HTTP 503` / `Docker Desktop is unable to start`), no native `psql`/PG17 server is installed on this Windows host, and `git commit`/`push` to trigger `.github/workflows/dfarm-restart04-postgres17.yml` is prohibited. Once committed/pushed or run against `docker-compose.pg17-verify.yml` (`TEST_POSTGRES_URL=...`), run:
  ```bash
  REQUIRE_REAL_POSTGRES=1 NODE_ENV=test DFARM_ALLOW_DISPOSABLE_PG17_MUTATIONS=1 TEST_REAL_POSTGRES=1 node scripts/ci-run-restart04-pg17.js
  ```
