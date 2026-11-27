# DFARM RESTART-03.8 — Final CI & Regression Matrix

- **Repository:** `Swiftify0099/DFarm`
- **Branch:** `fix/cloudflare-pages-production-deploy`
- **Current Public Branch HEAD (`origin/fix/cloudflare-pages-production-deploy`):** `3938421d2651c59628aadac0f539d0b583f687f0` (`refactor: update restart master issue register, docs, and connection pool infrastructure tests`; committed `2026-11-27 23:05:32 +0530`; contains `RESTART-03.7`)
- **Previous Public HEAD:** `32c37a137c54d153a07f07cb8a40735e94da7d8b` (`feat: add postgres connection pool and tenant database manager infrastructure`; committed `2026-11-27 14:58:51 +0530`)
- **Previously PG17-Verified Baseline:** `db8b73296247a8dd800e7276f12eda4a68c2ff4b` (parent `8eba95427ee2170ee46c02f3a08ffde86a2bde24`)
- **Local Worktree HEAD:** `3938421d2651c59628aadac0f539d0b583f687f0` with uncommitted `RESTART-03.8` edits (not committed/pushed per task rules).

> [!IMPORTANT]
> `RESTART-03.7` changes are committed and present in the **public branch** at HEAD `3938421d2651c59628aadac0f539d0b583f687f0` (do **not** describe `RESTART-03.7` as uncommitted or local-only).
> Do **not** claim `32c37a` CI runs verified `3938421` or local `RESTART-03.8` edits.
> The **new `RESTART-03.8` edits** on top of `3938421` reside in the local worktree only (uncommitted per task rules) and require a new commit/push by the operator before GitHub Actions can verify that exact code against live PostgreSQL `17.12`.

---

## 0. Latest GitHub Actions Runs (`3938421` vs `32c37a` vs `db8b732`)

### 0.1 GitHub Actions Runs on Current Public HEAD `3938421d2651c59628aadac0f539d0b583f687f0` *(`RESTART-03.7`; precedes local `RESTART-03.8` edits)*

| Workflow | Run / Job | Scanned Commit | PostgreSQL / Scanner | Conclusion | Observed API Evidence |
|---|---|---|---|---|---|
| `RESTART-03 PostgreSQL 17 Repository Verification` | [`46043084882`](https://github.com/Swiftify0099/DFarm/actions/runs/46043084882) / [`140655461398`](https://github.com/Swiftify0099/DFarm/actions/runs/46043084882/job/140655461398) | `3938421d2651c59628aadac0f539d0b583f687f0` | PostgreSQL `17.12` (`postgres:17-alpine`) | **`failure`** | Steps 1–8 (`build:backend`, `db:validate`, `ci-pg17-bootstrap.js`) succeeded; Step 9 (`Execute all five PostgreSQL 17 test suites and publish gate summary`) failed. Raw logs returned `403 Forbidden` unauthenticated. Local reproduction confirmed `concurrent-idempotency-financial.test.js` Test 8b checked `err.code === 'CONNECTION_FAILED'` instead of `err.code === 'TENANT_DATABASE_UNAVAILABLE'` / `err.status === 'CONNECTION_FAILED'`; fixed locally in `RESTART-03.8`. |
| `RESTART-04 PostgreSQL 17 Device Sync & Security Gate` | [`46043084873`](https://github.com/Swiftify0099/DFarm/actions/runs/46043084873) / [`140655461165`](https://github.com/Swiftify0099/DFarm/actions/runs/46043084873/job/140655461165) | `3938421d2651c59628aadac0f539d0b583f687f0` | PostgreSQL `17.12` (`postgres:17-alpine`) | **`success`** | All workflow steps completed with `success`, including Step 9 (`Execute RESTART-04 PostgreSQL 17 Device Auth & Sync Gate`). Raw logs returned `403 Forbidden` unauthenticated; local `RESTART-03.8` edits on top of `3938421` remain unverified in CI until pushed. |
| `Secret Scanning (Gitleaks)` | [`46043084887`](https://github.com/Swiftify0099/DFarm/actions/runs/46043084887) / [`140655461756`](https://github.com/Swiftify0099/DFarm/actions/runs/46043084887/job/140655461756) | `3938421d2651c59628aadac0f539d0b583f687f0` | Gitleaks full history | **`failure`** | Step 3 (`Install and run Gitleaks`) failed (`DF-003` OPEN under `RESTART-12`); exact finding count on `3938421` unavailable without log auth. |

### 0.2 Previous Public HEAD `32c37a137c54d153a07f07cb8a40735e94da7d8b` *(`RESTART-03.6`; did NOT verify `3938421` or `RESTART-03.8`)*

| Workflow | Run / Job | Scanned Commit | PostgreSQL / Scanner | Conclusion | Scope Summary |
|---|---|---|---|---|---|
| `RESTART-03 PostgreSQL 17 Repository Verification` | [`45974095468`](https://github.com/Swiftify0099/DFarm/actions/runs/45974095468) / [`140421403685`](https://github.com/Swiftify0099/DFarm/actions/runs/45974095468/job/140421403685) | `32c37a137c54d153a07f07cb8a40735e94da7d8b` | PostgreSQL `17.12` (`postgres:17-alpine`) | **`success`** | `RESTART-03.6` baseline run; raw logs `403` unauthenticated. |
| `RESTART-04 PostgreSQL 17 Device Sync & Security Gate` | [`45974095598`](https://github.com/Swiftify0099/DFarm/actions/runs/45974095598) / [`140421403779`](https://github.com/Swiftify0099/DFarm/actions/runs/45974095598/job/140421403779) | `32c37a137c54d153a07f07cb8a40735e94da7d8b` | PostgreSQL `17.12` (`postgres:17-alpine`) | **`success`** | `RESTART-03.6` baseline run; raw logs `403` unauthenticated. |
| `Secret Scanning (Gitleaks)` | [`45974095503`](https://github.com/Swiftify0099/DFarm/actions/runs/45974095503) / [`140421403662`](https://github.com/Swiftify0099/DFarm/actions/runs/45974095503/job/140421403662) | `32c37a137c54d153a07f07cb8a40735e94da7d8b` | Gitleaks full history | **`failure`** | Step 3 failed; exact finding count unavailable without log auth (`DF-003` OPEN under `RESTART-12`). |

### 0.3 Previously PG17-Verified Baseline (`db8b73296247a8dd800e7276f12eda4a68c2ff4b`)

| Workflow | Run / Job | Scanned Commit | PostgreSQL / Scanner | Conclusion | Scope Summary |
|---|---|---|---|---|---|
| `RESTART-04 PostgreSQL 17 Device Sync & Security Gate` | [`45968244756`](https://github.com/Swiftify0099/DFarm/actions/runs/45968244756) | `db8b73296247a8dd800e7276f12eda4a68c2ff4b` | PostgreSQL `17.12` | **`success`** | Latest RESTART-04 run with inspected logs: **`8` passed, `0` failed, `0` skipped** (zero `pg-mem` fallback). |
| `RESTART-03 PostgreSQL 17 Repository Verification` | [`45968244699`](https://github.com/Swiftify0099/DFarm/actions/runs/45968244699) / [`140402037268`](https://github.com/Swiftify0099/DFarm/actions/runs/45968244699/job/140402037268) | `db8b73296247a8dd800e7276f12eda4a68c2ff4b` | PostgreSQL `17.12` | **`failure`** | Teardown `uncaughtException: terminating connection due to administrator command`. |
| `Secret Scanning (Gitleaks)` | [`45968244743`](https://github.com/Swiftify0099/DFarm/actions/runs/45968244743) | `db8b73296247a8dd800e7276f12eda4a68c2ff4b` | Gitleaks full history | **`failure`** | **`54` findings across `43` commits** on `db8b732` (`DF-003` OPEN under `RESTART-12`). Note: this `54`-finding result belongs to `db8b732`, **not** `32c37a` or `3938421`. |

---

## 1. Historical GitHub Actions Verified Runs (`8eba954` & `9d0568b`)

| Workflow | Run / Job | Scanned Commit | PostgreSQL / Scanner | Conclusion | Scope Summary |
|---|---|---|---|---|---|
| *(Prior `8eba954`)* `RESTART-03 PostgreSQL 17 Repository Verification` | [`45947088863`](https://github.com/Swiftify0099/DFarm/actions/runs/45947088863) | `8eba954` | PostgreSQL `17.12` | **`success`** | 5-suite gate PASS on `8eba954`. |
| *(Prior `8eba954`)* `RESTART-04 PostgreSQL 17 Device Sync & Security Gate` | [`45947088946`](https://github.com/Swiftify0099/DFarm/actions/runs/45947088946) / [`140334160273`](https://github.com/Swiftify0099/DFarm/actions/runs/45947088946/job/140334160273) | `8eba954` | PostgreSQL `17.12` | **`failure`** | Pre-`db8b732` failure (`users.user_role` SQLSTATE `42703`); fixed in `db8b732`. |
| *(Prior `9d0568b`)* `RESTART-03 PostgreSQL 17 Repository Verification` | [`45943003261`](https://github.com/Swiftify0099/DFarm/actions/runs/45943003261) / [`140321315106`](https://github.com/Swiftify0099/DFarm/actions/runs/45943003261/job/140321315106) | `9d0568b` | PostgreSQL `17.12` | **`success`** | `44` passed, `0` failed, `0` skipped. |

---

## 2. Local Post-Edit Verification Matrix (`RESTART-03.8` on `3938421` Worktree)

### 2.1 Build & Database Package

| Command | Mode | Result | Exit Code | Status |
|---|---|---|---|---|
| `npm run build:backend` | TypeScript (`shared-types`, `shared-validation`, `database`, `services/backend`) | Clean build — `0` TypeScript errors | `0` | **PASS** |
| `npm run db:validate` | Static SQL validator | `13/13` checks passed, `0` failed, `0` skipped | `0` | **PASS** |
| `npm run db:test` | `pg-mem` + PG gated | `22/22` tests passed across `3` suites (`9` runtime + `13` static; internal suite 2 Real PG skipped) | `0` | **PASS (`pg-mem`; internal PG suite 2 skipped)** |

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
| **Offline Lifecycle Suite (`restart037-pool-lifecycle.test.js` & `ci-run-offline-lifecycle-suite.js`)** | Node built-in + `FakePool` / Barriers | **20** *(1 suite + 19 subtests)* | **20** | **0** | **0** | **0** | **PASS (root & `services/backend` cwd)** |

### 2.3 Frontend Workspaces *(Prior Baseline; Unchanged in `RESTART-03.8`)*

| Workspace | Runner | Files / Suites | Tests | Pass | Fail | Exit | Status |
|---|---|---:|---:|---:|---:|---:|---|
| `apps/dfarm-customer-app` | Jest | 8/8 | 31 | 31 | 0 | 0 | **BASELINE PASS** |
| `apps/dfarm-collection-app` | Vitest | 17/17 | 162 | 162 | 0 | 0 | **BASELINE PASS** |
| `apps/dfarm-dairy-admin` | Vitest | 5/5 | 14 | 14 | 0 | 0 | **BASELINE PASS** |
| `apps/dfarm-super-admin` | Vitest | 10/10 | 48 | 48 | 0 | 0 | **BASELINE PASS** |
| **Total (4 Apps)** | — | **40/40** | **255** | **255** | **0** | **0** | **BASELINE PASS** |

### 2.4 Real PostgreSQL 17 Gates Status

| Suite | Default (No Local PG17) | `REQUIRE_REAL_POSTGRES=1` (No Local PG17) | CI Status (`3938421` Public vs `RESTART-03.8` Local Edits) |
|---|---|---|---|
| `restart03-real-postgres.test.js` | `tests=1 pass=0 fail=0 skipped=1 exit=0` | `exit=1` (runner fails closed) | `3938421` Run `46043084882` **`failure`** (Step 9); `32c37a` Run `45974095468` `success`; **local `RESTART-03.8` edits pending new CI run** |
| `restart032-real-postgres.test.js` | `tests=1 pass=0 fail=0 skipped=1 exit=0` | `exit=1` (runner fails closed) | `3938421` Run `46043084882` **`failure`** (Step 9); `32c37a` Run `45974095468` `success`; **local `RESTART-03.8` edits pending new CI run** |
| `restart033-real-postgres-repositories.test.js` | `tests=1 pass=0 fail=0 skipped=1 exit=0` | `exit=1` (runner fails closed) | `3938421` Run `46043084882` **`failure`** (Step 9); `32c37a` Run `45974095468` `success`; **local `RESTART-03.8` edits pending new CI run** |
| `customer-ledger-accounting.test.js` | `tests=1 pass=0 fail=0 skipped=1 exit=0` | `exit=1` (runner fails closed) | `3938421` Run `46043084882` **`failure`** (Step 9); `32c37a` Run `45974095468` `success`; **local `RESTART-03.8` edits pending new CI run** |
| `concurrent-idempotency-financial.test.js` | `tests=1 pass=0 fail=0 skipped=1 exit=0` | `exit=1` (runner fails closed) | `3938421` Run `46043084882` **`failure`** (Test 8b `err.code` vs `err.status` mismatch); **repaired + Test 10 real PG17 provisioning failure cleanup added locally in `RESTART-03.8`, pending new CI run** |
| `restart04-real-postgres-device-sync.test.js` | `tests=1 pass=0 fail=0 skipped=1 exit=0` | `exit=1` (runner fails closed) | `3938421` Run `46043084873` **`success`**; `32c37a` Run `45974095598` `success`; `db8b732` Run `45968244756` `8/8` PASS; **local `RESTART-03.8` edits pending new CI run** |

---

## 3. `RESTART-03.8` Changed Files

| File | Change Summary |
|---|---|
| `services/backend/src/infrastructure/database/TenantDatabaseManager.ts` | Added per-dairy acquisition/shutdown/deprovisioning lifecycle coordination (`inFlightAcquisitionsByDairy`, `deprovisioningTenants`, `closingAllPoolsPromise`, `awaitPendingTenantClose`, `ensureExistingPoolUsableOrEvict`, `DEPROVISIONING` / `DEPROVISION_FAILED` states), iterative drain loop in `closeAllPools()`, safe failure recovery in `deprovisionTenantDatabase()` (removed `pg_terminate_backend` and `WITH (FORCE)` and stopped converting failures into `success: true`), `wrapPgPool().close()` mapping lookup, `createAdminPool()` helper, and `AggregateError` preservation of both migration and cleanup errors in `provisionTenantDatabase()`. |
| `services/backend/tests/helpers/pool-lifecycle-helpers.js` | Extracted shared `createPoolShutdownManager` / `closePoolCleanly()` test utility used by both `concurrent-idempotency-financial.test.js` and `restart037-pool-lifecycle.test.js`. |
| `services/backend/tests/restart037-pool-lifecycle.test.js` | Fixed `process.cwd()` path resolution to `import.meta.url`, switched Test 7 to test the real physical provisioning path + error preservation, switched Test 9 to invoke the shared `closePoolCleanly()` helper across all 7 contracts, and added 10 deterministic barrier-based race/lifecycle tests (tests 10–19; `20/20` TAP pass). |
| `services/backend/tests/concurrent-idempotency-financial.test.js` | Switched to shared `closePoolCleanly()` helper, fixed Test 8b `TenantDatabaseUnavailableError` (`err.status === 'CONNECTION_FAILED'` / `err.code === 'TENANT_DATABASE_UNAVAILABLE'`) assertion, and added Test 10 genuine real PG17 physical provisioning migration failure cleanup regression test. |
| `scripts/ci-run-offline-lifecycle-suite.js` & `.github/workflows/dfarm-restart03-postgres17.yml` | Wired `restart037-pool-lifecycle.test.js` as a separate mandatory offline step in the RESTART-03 CI job with non-zero TAP count, zero failures/skips, and separate `$GITHUB_STEP_SUMMARY` reporting while keeping the 5 PG17 suites unchanged. |
| `services/backend/dist/...` | Rebuilt compiled TypeScript outputs (`TenantDatabaseManager.{d.ts,d.ts.map,js,js.map}`). |
| `DFARM_RESTART_01_MASTER_ISSUE_REGISTER.md`, `DFARM_RESTART_03_5_FINAL_CI_MATRIX.md`, `DFARM_RESTART_04_DEVICE_SYNC_SECURITY_REPORT.md` | Reconciled `3938421` (`RESTART-03.7`), `32c37a`, `db8b732`, and local `RESTART-03.8` evidence and issue classifications. |

---

## 4. Gitleaks Status

| Run | Scanned Commit | Findings | Status |
|---|---|---|---|
| [`45968244743`](https://github.com/Swiftify0099/DFarm/actions/runs/45968244743) | `db8b73296247a8dd800e7276f12eda4a68c2ff4b` | `54` across `43` commits | **FAIL — `DF-003` OPEN under `RESTART-12`** *(scanned `db8b732`, NOT `32c37a` or `3938421`)* |
| [`45974095503`](https://github.com/Swiftify0099/DFarm/actions/runs/45974095503) / [`140421403662`](https://github.com/Swiftify0099/DFarm/actions/runs/45974095503/job/140421403662) | `32c37a137c54d153a07f07cb8a40735e94da7d8b` | Exact count unavailable (`403` on raw logs unauthenticated) | **FAIL — Step 3 failed; `DF-003` OPEN under `RESTART-12`** |
| [`46043084887`](https://github.com/Swiftify0099/DFarm/actions/runs/46043084887) / [`140655461756`](https://github.com/Swiftify0099/DFarm/actions/runs/46043084887/job/140655461756) | `3938421d2651c59628aadac0f539d0b583f687f0` | Exact count unavailable (`403` on raw logs unauthenticated) | **FAIL — Step 3 (`Install and run Gitleaks`) failed; `DF-003` remains OPEN under `RESTART-12`** |

---

## 5. Remaining Blockers

- **Local & Updated `RESTART-03.8` Real PG17 Gate:** No native PostgreSQL 17 server or running Docker daemon is available on this Windows host, and `git commit`/`push` is prohibited by task rules. Therefore, the local uncommitted `RESTART-03.8` changes on top of `3938421` have **not** yet been executed against live PostgreSQL `17.12` in CI (`DF-030` remains **OPEN / PARTIAL** until the new exact HEAD passes both `RESTART-03` and `RESTART-04` PG17 gates after operator commit/push).
- **DF-003 Gitleaks:** Full-history Gitleaks remains failing (`45968244743` on `db8b732`: `54` findings across `43` commits; `45974095503` on `32c37a`: `failure`; `46043084887` on `3938421`: `failure`). Kept **OPEN** under `RESTART-12`.
- **Downstream Tracks Kept OPEN:** `DF-016` (OPEN/PARTIAL), `DF-018` modular biometric routers (`RESTART-07`), `DF-020` (`RESTART-05`), `DF-021` (`RESTART-09`), `DF-022` / Union Bank (`RESTART-10`). Do not proceed to `RESTART-05` until both updated PG17 gates pass on the exact `RESTART-03.8` commit.
