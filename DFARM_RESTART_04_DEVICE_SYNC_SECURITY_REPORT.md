# DFARM RESTART-04 / RESTART-04.1 — Device Authentication, Offline Sync Tenant Isolation & Route Security Report

**Repository:** `Swiftify0099/DFarm`  
**Branch:** `fix/cloudflare-pages-production-deploy`  
**Current Public HEAD:** `32c37a137c54d153a07f07cb8a40735e94da7d8b` (`feat: add postgres connection pool and tenant database manager infrastructure`; committed `2026-11-27 14:58:51 +0530`)  
**Previously PG17-Verified Baseline:** `db8b73296247a8dd800e7276f12eda4a68c2ff4b` (parent `8eba95427ee2170ee46c02f3a08ffde86a2bde24`)  
**Target Issues:** `DF-007` (P0) & Device-Management Scope of `DF-018` (P1)  
**Final Classification:** **RESTART-04 PG17 GATE VERIFIED on `db8b732` (`45968244756`, PG `17.12`, `8/8` Passed, `0` Failed, `0` Skipped) and `success` on Public `32c37a` (`45974095598`)** / **Local `RESTART-03.7` Teardown Hardening Uncommitted on Top of `32c37a` (Awaiting Live PG17 CI Re-Verification After Commit/Push)**

> [!IMPORTANT]
> `RESTART-03.6` changes are committed and present in the **public branch** at HEAD `32c37a137c54d153a07f07cb8a40735e94da7d8b` (do **not** describe `RESTART-03.6` as uncommitted or local-only).
> On public commit `32c37a`, GitHub Actions completed `RESTART-03` ([`45974095468`](https://github.com/Swiftify0099/DFarm/actions/runs/45974095468) -> `success`), `RESTART-04` ([`45974095598`](https://github.com/Swiftify0099/DFarm/actions/runs/45974095598) -> `success`), and `Secret Scanning (Gitleaks)` ([`45974095503`](https://github.com/Swiftify0099/DFarm/actions/runs/45974095503) -> `failure`; raw Actions logs return `403` unauthenticated).
> **Last Gitleaks scan with inspected finding count:** Run [`45968244743`](https://github.com/Swiftify0099/DFarm/actions/runs/45968244743), `54` findings across `43` commits, on **`db8b732`** — **not** `32c37a`. `DF-003` remains OPEN under `RESTART-12`.
> New **`RESTART-03.7`** lifecycle hardening edits are uncommitted in the local worktree on top of `32c37a` (commit/push prohibited by task rules) and await a new live PG17 CI run.

---

## 1. Baseline Verification, CI Evidence & RESTART-03.6 / RESTART-03.7 Reconciliation

Repository state and GitHub Actions CI evidence comparing public HEAD `32c37a137c54d153a07f07cb8a40735e94da7d8b`, previously PG17-verified baseline `db8b73296247a8dd800e7276f12eda4a68c2ff4b`, and local `RESTART-03.7` edits:

- **Git Baseline:** Checked out branch `fix/cloudflare-pages-production-deploy`.
  - **Current public HEAD:** `32c37a137c54d153a07f07cb8a40735e94da7d8b` (`feat: add postgres connection pool and tenant database manager infrastructure`; committed `2026-11-27 14:58:51 +0530`; includes `RESTART-03.6` commits publicly).
  - **Previously PG17-verified baseline:** `db8b73296247a8dd800e7276f12eda4a68c2ff4b` (parent `8eba95427ee2170ee46c02f3a08ffde86a2bde24`).
  - **Local worktree state:** Based on `32c37a`, with uncommitted `RESTART-03.7` teardown-hardening edits in `PostgresPool.ts`, `TenantDatabaseManager.ts`, `concurrent-idempotency-financial.test.js`, `restart037-pool-lifecycle.test.js`, compiled `dist/`, and reconciled reports (no commit/push per task rules).
- **RESTART-04 Real PG17 Gate:**
  - **On public HEAD `32c37a`:** CI Run [`45974095598`](https://github.com/Swiftify0099/DFarm/actions/runs/45974095598) / Job [`140421403779`](https://github.com/Swiftify0099/DFarm/actions/runs/45974095598/job/140421403779) completed with **`success`** (`postgres:17-alpine`, raw logs unavailable `403` unauthenticated).
  - **On previous baseline `db8b732`:** CI Run [`45968244756`](https://github.com/Swiftify0099/DFarm/actions/runs/45968244756) **PASSED** on PostgreSQL `17.12` — **`8` passed, `0` failed, `0` skipped** (zero `pg-mem` fallback). `DF-007`'s RESTART-04 PG17 gate is **VERIFIED** on `db8b732` and `success` on `32c37a`; a fresh CI run is still required after pushing `RESTART-03.7`.
  - *(Prior `8eba954` failure `45947088946` / Job `140334160273` with SQLSTATE `42703` `users.user_role` was resolved in `db8b732`.)*
- **RESTART-03 Real PG17 Gate:**
  - **On public HEAD `32c37a` (`RESTART-03.6`):** CI Run [`45974095468`](https://github.com/Swiftify0099/DFarm/actions/runs/45974095468) / Job [`140421403685`](https://github.com/Swiftify0099/DFarm/actions/runs/45974095468/job/140421403685) completed with **`success`** (step 9 `Execute all five PostgreSQL 17 test suites and publish gate summary` succeeded; raw logs unavailable `403` unauthenticated).
  - **On previous baseline `db8b732`:** CI Run [`45968244699`](https://github.com/Swiftify0099/DFarm/actions/runs/45968244699) / Job [`140402037268`](https://github.com/Swiftify0099/DFarm/actions/runs/45968244699/job/140402037268) **FAILED** during final teardown of `concurrent-idempotency-financial.test.js` (`uncaughtException: terminating connection due to administrator command`).
  - **Local `RESTART-03.7` edits on top of `32c37a`:** Eliminated remaining silent error suppression (`canConnectRealPostgres`), premature `closedPools` marking, `pool.ending` early-return races (`TenantDatabaseManager.endPoolSafely`, `PostgresDatabase.close`), concurrent close races (`closingTenantPools`), and partial provisioning pool leaks; added offline + PG17 lifecycle regression tests. Live PG17 CI re-verification of `RESTART-03.7` is pending commit/push.
  - *(Prior `8eba954` baseline: Run `45947088863` PASSED; prior `9d0568b` baseline: Run `45943003261` / Job `140321315106` PASSED `44/44`.)*
- **Gitleaks Scan:**
  - **On previous baseline `db8b732`:** CI Run [`45968244743`](https://github.com/Swiftify0099/DFarm/actions/runs/45968244743) **FAILED** with **`54` findings across `43` commits** (scanned `db8b732`, **not** `32c37a`).
  - **On public HEAD `32c37a`:** CI Run [`45974095503`](https://github.com/Swiftify0099/DFarm/actions/runs/45974095503) / Job [`140421403662`](https://github.com/Swiftify0099/DFarm/actions/runs/45974095503/job/140421403662) **FAILED** at step 3 (`Install and run Gitleaks`; exact count unavailable without log auth). `DF-003` remains **OPEN** under `RESTART-12`.
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

## 3. Exact Verification Matrix (Reconciled on Public HEAD `32c37a` + Local `RESTART-03.7` Teardown Hardening)

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
| **RESTART-03.7 Pool Lifecycle Suite** | `node --test services/backend/tests/restart037-pool-lifecycle.test.js` | Node built-in / `pg-mem` (Post-edit) | **10** | **10** | **0** | **0** | **`0`** | **PASS** |
| **Customer App (`dfarm-customer-app`)** *(prior baseline; unchanged in 04.1/03.7)* | `npm run --workspace=apps/dfarm-customer-app test` | Jest (`8/8` files, baseline) | 31 | 31 | 0 | 0 | `0` | **BASELINE PASS (not re-run; no client/contract edits)** |
| **Collection App (`dfarm-collection-app`)** *(prior baseline; unchanged in 04.1/03.7)* | `npm run --workspace=apps/dfarm-collection-app test` | Vitest (`17/17` files, baseline) | 162 | 162 | 0 | 0 | `0` | **BASELINE PASS (not re-run; no client/contract edits)** |
| **Dairy Admin (`dfarm-dairy-admin`)** *(prior baseline; unchanged in 04.1/03.7)* | `npm run --workspace=apps/dfarm-dairy-admin test` | Vitest (`5/5` files, baseline) | 14 | 14 | 0 | 0 | `0` | **BASELINE PASS (not re-run; no client/contract edits)** |
| **Super Admin (`dfarm-super-admin`)** *(prior baseline; unchanged in 04.1/03.7)* | `npm run --workspace=apps/dfarm-super-admin test` | Vitest (`10/10` files, baseline) | 48 | 48 | 0 | 0 | `0` | **BASELINE PASS (not re-run; no client/contract edits)** |
| **RESTART-04 Real PG17 Suite (Default Local)** | `node --test services/backend/tests/restart04-real-postgres-device-sync.test.js` | No PG17 on host (Post-edit) | 1 | 0 | 0 | **1** | `0` | **SKIP (no `pg-mem` fallback)** |
| **RESTART-04 PG17 CI Runner (Strict Guard Local)** | `REQUIRE_REAL_POSTGRES=1 NODE_ENV=test DFARM_ALLOW_DISPOSABLE_PG17_MUTATIONS=1 TEST_REAL_POSTGRES=1 node scripts/ci-run-restart04-pg17.js` | No `TEST_POSTGRES_URL` / PG17 (Post-edit) | 0 | 0 | 0 | 0 | **`1`** | **FAIL CLOSED (`exit 1`)** |
| **RESTART-04 Real PG17 CI Gate (HEAD `db8b732`)** | GitHub Actions Run `45968244756` | GitHub Actions PG `17.12` | **8** | **8** | **0** | **0** | **`0`** | **PASS (`DF-007` RESTART-04 PG17 VERIFIED on `db8b732`)** |
| **RESTART-04 Real PG17 CI Gate (HEAD `32c37a` — Public)** | GitHub Actions Run `45974095598` / Job `140421403779` | GitHub Actions PG `17.12` | - | - | 0 | 0 | **`0`** | **`success` (precedes local `RESTART-03.7` edits)** |
| **RESTART-03 Real PG17 CI Gate (HEAD `db8b732`)** | GitHub Actions Run `45968244699` / Job `140402037268` | GitHub Actions PG `17.12` | - | - | 1 | 0 | **`1`** | **FAIL (`concurrent-idempotency-financial.test.js` teardown `uncaughtException`)** |
| **RESTART-03 Real PG17 CI Gate (HEAD `32c37a` — Public)** | GitHub Actions Run `45974095468` / Job `140421403685` | GitHub Actions PG `17.12` | - | - | 0 | 0 | **`0`** | **`success` (covers `RESTART-03.6`; local `RESTART-03.7` edits await new CI run)** |
| **Secret Scanning (Gitleaks, HEAD `db8b732`)** | GitHub Actions Run `45968244743` | Gitleaks full history | - | - | 54 | 0 | `1` | **FAIL (`54` findings across `43` commits on `db8b732`, NOT `32c37a`; `DF-003` OPEN under `RESTART-12`)** |
| **Secret Scanning (Gitleaks, HEAD `32c37a`)** | GitHub Actions Run `45974095503` / Job `140421403662` | Gitleaks full history | - | - | - | 0 | `1` | **FAIL (Step 3 failed on `32c37a`; `DF-003` OPEN under `RESTART-12`)** |

**Aggregated Offline Totals (Post-RESTART-03.7 Edit):**  
- Existing backend offline suites executed: **`15/15` files PASS — `258/258` tests PASS, `0` failed, `0` skipped**.  
- New `RESTART-03.7` pool lifecycle suite executed: **`1/1` file (`9` subtests, `10/10` TAP) PASS, `0` failed, `0` skipped**.  
- Frontend baseline preserved (not re-run because no shared contracts or client files changed): **`4/4` apps (`40/40` test files) — `255/255` tests PASS**.

---

## 4. Scope Boundaries & Remaining Blockers

- **Out-of-Scope Tracks Preserved Unchanged:** Did not start `RESTART-05..12` (migration `031`/`040` reconciliation under `RESTART-05`, biometric module mounting / `customerBiometricRouter` under `RESTART-07`, static device telemetry stubs / `DF-019` under `RESTART-08`, outbox `dashboard_events_outbox` / `RealtimeEventPublisher` under `RESTART-09`, Union Bank under `RESTART-10`, Gitleaks full-history rewrite `DF-003` under `RESTART-12`).
- **Local `RESTART-03.7` Live PostgreSQL `17.12` Re-Verification Pending:** Public `32c37a` (`RESTART-03.6`) completed with `success` on GitHub Actions in both `RESTART-03` (`45974095468`) and `RESTART-04` (`45974095598`), while `db8b732` remains the last baseline with directly inspected `8/8` `RESTART-04` logs (`45968244756`). The local `RESTART-03.7` teardown-hardening and lifecycle test edits (`PostgresPool.ts`, `TenantDatabaseManager.ts`, `concurrent-idempotency-financial.test.js`, `restart037-pool-lifecycle.test.js`) cannot run locally against PG17 (`com.docker.service` stopped and no native PG17 server installed) and cannot be committed/pushed per task rules. Once committed/pushed or run against `docker-compose.pg17-verify.yml`, execute both gates:
  ```bash
  REQUIRE_REAL_POSTGRES=1 NODE_ENV=test DFARM_ALLOW_DISPOSABLE_PG17_MUTATIONS=1 TEST_REAL_POSTGRES=1 node scripts/ci-run-pg17-suites.js
  REQUIRE_REAL_POSTGRES=1 NODE_ENV=test DFARM_ALLOW_DISPOSABLE_PG17_MUTATIONS=1 TEST_REAL_POSTGRES=1 node scripts/ci-run-restart04-pg17.js
  ```
