# DFARM RESTART-03.7 — Final CI & Regression Matrix

- **Repository:** `Swiftify0099/DFarm`
- **Branch:** `fix/cloudflare-pages-production-deploy`
- **Current Public Branch HEAD (`origin/fix/cloudflare-pages-production-deploy`):** `32c37a137c54d153a07f07cb8a40735e94da7d8b` (`feat: add postgres connection pool and tenant database manager infrastructure`; committed `2026-11-27 14:58:51 +0530`)
- **Previously PG17-Verified Baseline:** `db8b73296247a8dd800e7276f12eda4a68c2ff4b` (parent `8eba95427ee2170ee46c02f3a08ffde86a2bde24`)
- **Local Worktree HEAD:** `32c37a137c54d153a07f07cb8a40735e94da7d8b` with uncommitted `RESTART-03.7` teardown-hardening, test, build `dist/`, and documentation reconciliation edits (not committed/pushed per task rules).

> [!IMPORTANT]
> `RESTART-03.6` changes are committed and present in the **public branch** at HEAD `32c37a137c54d153a07f07cb8a40735e94da7d8b` (do **not** describe `RESTART-03.6` as uncommitted or local-only).
> The **new `RESTART-03.7` teardown-hardening edits** on top of `32c37a` reside in the local worktree only (uncommitted per task rules) and still require live PostgreSQL `17.12` CI verification after commit/push.

---

## 0. Latest GitHub Actions Runs (`32c37a` Public HEAD vs `db8b732` Baseline)

### 0.1 GitHub Actions Runs on Current Public HEAD `32c37a137c54d153a07f07cb8a40735e94da7d8b` *(Covers `RESTART-03.6`; precedes local `RESTART-03.7` edits)*

| Workflow | Run / Job | Scanned Commit | PostgreSQL / Scanner | Conclusion | Observed API Evidence |
|---|---|---|---|---|---|
| `RESTART-03 PostgreSQL 17 Repository Verification` | [`45974095468`](https://github.com/Swiftify0099/DFarm/actions/runs/45974095468) / [`140421403685`](https://github.com/Swiftify0099/DFarm/actions/runs/45974095468/job/140421403685) | `32c37a137c54d153a07f07cb8a40735e94da7d8b` | PostgreSQL `17.12` (`postgres:17-alpine`) | **`success`** | All workflow steps completed with `success`, including step 9 (`Execute all five PostgreSQL 17 test suites and publish gate summary`). Raw Actions logs returned `403 Forbidden` unauthenticated, so exact per-suite TAP counts for this run were not directly read; local `RESTART-03.7` edits on top of `32c37a` remain unverified in CI until pushed. |
| `RESTART-04 PostgreSQL 17 Device Sync & Security Gate` | [`45974095598`](https://github.com/Swiftify0099/DFarm/actions/runs/45974095598) / [`140421403779`](https://github.com/Swiftify0099/DFarm/actions/runs/45974095598/job/140421403779) | `32c37a137c54d153a07f07cb8a40735e94da7d8b` | PostgreSQL `17.12` (`postgres:17-alpine`) | **`success`** | All workflow steps completed with `success`, including step 9 (`Execute RESTART-04 PostgreSQL 17 Device Auth & Sync Gate`). Raw Actions logs returned `403 Forbidden` unauthenticated; local `RESTART-03.7` edits on top of `32c37a` remain unverified in CI until pushed. |
| `Secret Scanning (Gitleaks)` | [`45974095503`](https://github.com/Swiftify0099/DFarm/actions/runs/45974095503) / [`140421403662`](https://github.com/Swiftify0099/DFarm/actions/runs/45974095503/job/140421403662) | `32c37a137c54d153a07f07cb8a40735e94da7d8b` | Gitleaks full history | **`failure`** | Step 3 (`Install and run Gitleaks`) failed (`DF-003` OPEN under `RESTART-12`); exact finding count on `32c37a` is unavailable without authenticated log access. |

### 0.2 Previously PG17-Verified Baseline (`db8b73296247a8dd800e7276f12eda4a68c2ff4b`)

| Workflow | Run / Job | Scanned Commit | PostgreSQL / Scanner | Conclusion | Scope Summary |
|---|---|---|---|---|---|
| `RESTART-04 PostgreSQL 17 Device Sync & Security Gate` | [`45968244756`](https://github.com/Swiftify0099/DFarm/actions/runs/45968244756) | `db8b73296247a8dd800e7276f12eda4a68c2ff4b` | PostgreSQL `17.12` | **`success`** | Latest RESTART-04 run with inspected logs on the previous baseline: **`8` passed, `0` failed, `0` skipped** (zero `pg-mem` fallback). |
| `RESTART-03 PostgreSQL 17 Repository Verification` | [`45968244699`](https://github.com/Swiftify0099/DFarm/actions/runs/45968244699) / [`140402037268`](https://github.com/Swiftify0099/DFarm/actions/runs/45968244699/job/140402037268) | `db8b73296247a8dd800e7276f12eda4a68c2ff4b` | PostgreSQL `17.12` | **`failure`** | Latest failed RESTART-03 run on the previous baseline: tests 1–3 passed, outer suite failed in teardown (`uncaughtException: terminating connection due to administrator command`). |
| `Secret Scanning (Gitleaks)` | [`45968244743`](https://github.com/Swiftify0099/DFarm/actions/runs/45968244743) | `db8b73296247a8dd800e7276f12eda4a68c2ff4b` | Gitleaks full history | **`failure`** | **`54` findings across `43` commits** on `db8b732` (`DF-003` OPEN under `RESTART-12`). Note: this `54`-finding result scanned `db8b732`, **not** `32c37a`. |

---

## 1. Historical GitHub Actions Verified Runs (`8eba954` & `9d0568b`)

| Workflow | Run / Job | Scanned Commit | PostgreSQL / Scanner | Conclusion | Scope Summary |
|---|---|---|---|---|---|
| *(Prior `8eba954`)* `RESTART-03 PostgreSQL 17 Repository Verification` | [`45947088863`](https://github.com/Swiftify0099/DFarm/actions/runs/45947088863) | `8eba954` | PostgreSQL `17.12` | **`success`** | 5-suite gate PASS on `8eba954`. |
| *(Prior `8eba954`)* `RESTART-04 PostgreSQL 17 Device Sync & Security Gate` | [`45947088946`](https://github.com/Swiftify0099/DFarm/actions/runs/45947088946) / [`140334160273`](https://github.com/Swiftify0099/DFarm/actions/runs/45947088946/job/140334160273) | `8eba954` | PostgreSQL `17.12` | **`failure`** | Pre-`db8b732` failure (`users.user_role` SQLSTATE `42703`); fixed in `db8b732`. |
| *(Prior `9d0568b`)* `RESTART-03 PostgreSQL 17 Repository Verification` | [`45943003261`](https://github.com/Swiftify0099/DFarm/actions/runs/45943003261) / [`140321315106`](https://github.com/Swiftify0099/DFarm/actions/runs/45943003261/job/140321315106) | `9d0568b` | PostgreSQL `17.12` | **`success`** | `44` passed, `0` failed, `0` skipped. |

---

## 2. Local Post-Edit Verification Matrix (`RESTART-03.7` on `32c37a` Worktree)

### 2.1 Build & Database Package

| Command | Mode | Result | Exit Code | Status |
|---|---|---|---|---|
| `npm run build:backend` | TypeScript (`shared-types`, `shared-validation`, `database`, `services/backend`) | Clean build — `0` TypeScript errors | `0` | **PASS** |
| `npm run db:validate` | Static SQL validator | `13/13` checks passed, `0` failed, `0` skipped | `0` | **PASS** |
| `npm run db:test` | `pg-mem` + PG skip | `22/22` tests passed across `3` suites (`9` runtime + `13` static; suite 2 Real PG skipped) | `0` | **PASS (`pg-mem`; internal PG suite 2 skipped)** |

### 2.2 Backend Core Offline Suites (`NODE_ENV=test TENANT_POOL_CONNECTION_TIMEOUT_MS=500`)

| Suite (`services/backend/tests/...`) | Engine | Tests | Pass | Fail | Skip | Exit | Status |
|---|---|---:|---:|---:|---:|---:|---|
| `restart032-operational-repository-isolation.test.js` | `pg-mem` | 17 | 17 | 0 | 0 | 0 | **PASS** |
| `restart03-tenant-isolation-and-ownership.test.js` | `pg-mem` | 18 | 18 | 0 | 0 | 0 | **PASS** |
| `customer-data-lifecycle-e2e.test.js` | `pg-mem` | 9 | 9 | 0 | 0 | 0 | **PASS** |
| `restart02-auth-security-remediation.test.js` | `pg-mem` | 9 | 9 | 0 | 0 | 0 | **PASS** |
| `restart021-auth-session-integrity.test.js` | `pg-mem` | 7 | 7 | 0 | 0 | 0 | **PASS** |
| `collection-kiosk-production.test.js` | `pg-mem` | 24 | 24 | 0 | 0 | 0 | **PASS** |
| `customer-tenant-approval-e2e.test.js` | `pg-mem` | 11 | 11 | 0 | 0 | 0 | **PASS** |
| `multi-dairy-membership.test.js` | `pg-mem` | 9 | 9 | 0 | 0 | 0 | **PASS** |
| `tenant-database-isolation.test.js` | `pg-mem` | 7 | 7 | 0 | 0 | 0 | **PASS** |
| `dairy-admin-production.test.js` | `pg-mem` | 36 | 36 | 0 | 0 | 0 | **PASS** |
| `roadmap-phase-06-dairy-admin.test.js` | `pg-mem` | 41 | 41 | 0 | 0 | 0 | **PASS** |
| `super-admin-production.test.js` | `pg-mem` | 33 | 33 | 0 | 0 | 0 | **PASS** |
| `clean-architecture.test.js` | Static AST | 9 | 9 | 0 | 0 | 0 | **PASS** |
| `offline-sync-22-scenarios.test.js` | `pg-mem` | 23 | 23 | 0 | 0 | 0 | **PASS** |
| `restart04-device-auth-and-route-security.test.js` | `pg-mem` | 5 | 5 | 0 | 0 | 0 | **PASS** |
| **Total (15 Existing Backend Offline Suites)** | — | **258** | **258** | **0** | **0** | **0** | **PASS** |
| **New `RESTART-03.7` Lifecycle Suite** (`restart037-pool-lifecycle.test.js`) | Node built-in + `FakePool` / `pg-mem` | 10 *(1 suite + 9 subtests)* | 10 | 0 | 0 | 0 | **PASS** |

### 2.3 Frontend Workspaces *(Prior Baseline; Unchanged in `RESTART-03.7`)*

| Workspace | Runner | Files / Suites | Tests | Pass | Fail | Exit | Status |
|---|---|---:|---:|---:|---:|---:|---|
| `apps/dfarm-customer-app` | Jest | 8/8 | 31 | 31 | 0 | 0 | **BASELINE PASS** |
| `apps/dfarm-collection-app` | Vitest | 17/17 | 162 | 162 | 0 | 0 | **BASELINE PASS** |
| `apps/dfarm-dairy-admin` | Vitest | 5/5 | 14 | 14 | 0 | 0 | **BASELINE PASS** |
| `apps/dfarm-super-admin` | Vitest | 10/10 | 48 | 48 | 0 | 0 | **BASELINE PASS** |
| **Total (4 Apps)** | — | **40/40** | **255** | **255** | **0** | **0** | **BASELINE PASS** |

### 2.4 Real PostgreSQL 17 Gates Status

| Suite | Default (No Local PG17) | `REQUIRE_REAL_POSTGRES=1` (No Local PG17) | CI Status (`32c37a` Public vs `RESTART-03.7` Local Edits) |
|---|---|---|---|
| `restart03-real-postgres.test.js` | `tests=1 pass=0 fail=0 skipped=1 exit=0` | `exit=1` (runner fails closed) | `32c37a` Run `45974095468` **`success`**; `db8b732` Run `45968244699` `failure`; **local `RESTART-03.7` edits pending new CI run** |
| `restart032-real-postgres.test.js` | `tests=1 pass=0 fail=0 skipped=1 exit=0` | `exit=1` (runner fails closed) | `32c37a` Run `45974095468` **`success`**; `db8b732` Run `45968244699` `failure`; **local `RESTART-03.7` edits pending new CI run** |
| `restart033-real-postgres-repositories.test.js` | `tests=1 pass=0 fail=0 skipped=1 exit=0` | `exit=1` (runner fails closed) | `32c37a` Run `45974095468` **`success`**; `db8b732` Run `45968244699` `failure`; **local `RESTART-03.7` edits pending new CI run** |
| `customer-ledger-accounting.test.js` | `tests=1 pass=0 fail=0 skipped=1 exit=0` | `exit=1` (runner fails closed) | `32c37a` Run `45974095468` **`success`**; `db8b732` Run `45968244699` `failure`; **local `RESTART-03.7` edits pending new CI run** |
| `concurrent-idempotency-financial.test.js` | `tests=1 pass=0 fail=0 skipped=1 exit=0` | `tests=1 pass=0 fail=1 skipped=0 exit=1` | `32c37a` Run `45974095468` **`success`**; `db8b732` Run `45968244699` / Job `140402037268` `failure` (teardown `uncaughtException`); **local `RESTART-03.7` teardown hardening & 6 new PG17 lifecycle subtests (9 total subtests) pending new CI run** |
| `restart04-real-postgres-device-sync.test.js` | `tests=1 pass=0 fail=0 skipped=1 exit=0` | `tests=1 pass=0 fail=1 skipped=0 exit=1` | `32c37a` Run `45974095598` **`success`**; `db8b732` Run `45968244756` **`success` (`8/8` PASS, `0` skips)**; **local `RESTART-03.7` edits pending new CI run** |

---

## 3. `RESTART-03.7` Changed Files

| File | Change Summary |
|---|---|
| `services/backend/src/infrastructure/database/PostgresPool.ts` | **`PostgresDatabase.close()`:** Shares a single `closePromise` across all concurrent callers so rejections remain observable; added `waitForExternalPoolShutdown()` so calling `close()` when `pool.ending` is already `true` externally waits until `pool.ended` becomes `true` (and throws on timeout) rather than reporting completion prematurely or calling `pool.end()` twice. |
| `services/backend/src/infrastructure/database/TenantDatabaseManager.ts` | **`endPoolSafely()` / `closeTenantPool()` / `closeAllPools()` / `wrapPgPool()` / `provisionTenantDatabase()` / `getStrictTenantDb()` / `getTenantDb()`:** Replaced `pool.ending` early-return with `WeakMap<pg.Pool, Promise<void>>` (`poolShutdownPromises`) single-promise registration (no detached rejecting promise, clears on failure for retry, waits for external `pool.ending` until `pool.ended`). Added `closingTenantPools` `Map<string, Promise<void>>` so concurrent `closeTenantPool()`, `closeAllPools()`, and `wrapPgPool().close()` await the exact same shutdown and only evict `tenantPools` on success. Added `adminPool` `'error'` listener + `endPoolSafely(adminPool)` and partial provisioning pool cleanup (`closeTenantPool`) on migration/verification failure; re-checks `tenantPools` after `await` in `getStrictTenantDb`/`getTenantDb` to avoid duplicate pool leaks. |
| `services/backend/tests/concurrent-idempotency-financial.test.js` | **`canConnectRealPostgres()`:** Captures async `'error'` events in `probeErrors`, distinguishes connection-unavailable errors from genuine `probe.end()` shutdown failures, closes `probe` in `finally`, and fails closed when `REQUIRE_REAL_POSTGRES=1`. **`closePoolCleanly()`:** Uses `WeakMap` in-flight promise (clearing on settle so failed closes can retry after client release), adds `pool` to `closedPools` only after checked-out client check, `end()`, and verified `'remove'` events (throwing if clients were not removed; clearing timer). **Phase 2 PG17 tests (subtests 4–9):** Repeated/concurrent `closeTenantPool()`, concurrent `closeAllPools()`, `wrapPgPool().close()`, real `pg.Pool` error capture + unavailable probe check, `waitForDbIdle()` + `DROP DATABASE` without `FORCE` + partial setup failure cleanup, and `PostgresDatabase.close()` idempotency. |
| `services/backend/tests/restart037-pool-lifecycle.test.js` | New offline lifecycle regression suite (`9` subtests, `10/10` TAP pass) verifying `PostgresDatabase.close()` concurrency/rejection/external-ending, `TenantDatabaseManager` repeated/concurrent/mixed `closeTenantPool()`/`closeAllPools()`/`wrapPgPool().close()`, rejection propagation & pool retention, partial provisioning cleanup, source guard checks, and `closePoolCleanly` checked-out client retry contract. |
| `services/backend/dist/...` | Rebuilt compiled TypeScript outputs (`PostgresPool.{d.ts,d.ts.map,js,js.map}`, `TenantDatabaseManager.{d.ts,d.ts.map,js,js.map}`). |
| `DFARM_RESTART_01_MASTER_ISSUE_REGISTER.md`, `DFARM_RESTART_03_5_FINAL_CI_MATRIX.md`, `DFARM_RESTART_04_DEVICE_SYNC_SECURITY_REPORT.md` | Reconciled public `32c37a` vs `db8b732` vs local `RESTART-03.7` evidence and issue statuses. |

---

## 4. Gitleaks Status

| Run | Scanned Commit | Findings | Status |
|---|---|---|---|
| [`45968244743`](https://github.com/Swiftify0099/DFarm/actions/runs/45968244743) | `db8b73296247a8dd800e7276f12eda4a68c2ff4b` | `54` across `43` commits | **FAIL — `DF-003` OPEN under `RESTART-12`** *(scanned `db8b732`, NOT `32c37a`)* |
| [`45974095503`](https://github.com/Swiftify0099/DFarm/actions/runs/45974095503) / [`140421403662`](https://github.com/Swiftify0099/DFarm/actions/runs/45974095503/job/140421403662) | `32c37a137c54d153a07f07cb8a40735e94da7d8b` | Exact count unavailable (`403` on raw logs unauthenticated) | **FAIL — Step 3 (`Install and run Gitleaks`) failed; `DF-003` remains OPEN under `RESTART-12`** |

---

## 5. Remaining Blockers

- **Local & Updated `RESTART-03.7` Real PG17 Gate:** Local `com.docker.service` is stopped and no native PostgreSQL 17 server is installed on this Windows host, and `git commit`/`push` is prohibited by task rules. Therefore, the local uncommitted `RESTART-03.7` changes on top of `32c37a` have **not** yet been executed against live PostgreSQL `17.12` in CI (`RESTART-03` and `RESTART-04` workflows must be re-run after committing/pushing `RESTART-03.7` before marking the updated code's PG17 gates green).
- **DF-003 Gitleaks:** Full-history Gitleaks remains failing (`45968244743` on `db8b732`: `54` findings across `43` commits; `45974095503` on `32c37a`: `failure`). Kept **OPEN** under `RESTART-12`.
- **Downstream Tracks Kept OPEN:** `DF-016` (OPEN/PARTIAL), `DF-018` modular biometric routers (`RESTART-07`), `DF-020` (`RESTART-05`), `DF-021` (`RESTART-09`), `DF-022` / Union Bank (`RESTART-10`). Do not proceed to `RESTART-05` until both updated PG17 gates pass on the `RESTART-03.7` commit.
