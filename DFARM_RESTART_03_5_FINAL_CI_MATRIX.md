# DFARM RESTART-03.9 — Final CI & Regression Matrix

- **Repository:** `Swiftify0099/DFarm`
- **Branch:** `fix/cloudflare-pages-production-deploy`
- **Current Public Branch HEAD (`origin/fix/cloudflare-pages-production-deploy`):** `65e7addd121ee3baed1eedc8f32f0a4934dab0c2` (`fix: resolve PostgreSQL 17 CI failure in customer-ledger-accounting test suite via robust pool lifecycle management`; committed `2026-11-28 00:22:28 +0530`)
- **Previous Public HEADs:** `38216761bdac32cf929efc6641f25f73bb9abf23` (`RESTART-03.8`), `3938421d2651c59628aadac0f539d0b583f687f0` (`RESTART-03.7`), `32c37a137c54d153a07f07cb8a40735e94da7d8b` (`RESTART-03.6`), `db8b73296247a8dd800e7276f12eda4a68c2ff4b` (`RESTART-04`)
- **Local Worktree HEAD:** `65e7addd121ee3baed1eedc8f32f0a4934dab0c2` with uncommitted follow-up teardown hardening in `restart03-real-postgres.test.js`, `restart032-real-postgres.test.js`, `restart033-real-postgres-repositories.test.js` and updated reports (`DFARM_RESTART_03_9_CI_FAILURE_ROOT_CAUSE_AND_FIX_REPORT.md`, `DFARM_RESTART_03_5_FINAL_CI_MATRIX.md`, `DFARM_RESTART_01_MASTER_ISSUE_REGISTER.md`, `DFARM_RESTART_04_DEVICE_SYNC_SECURITY_REPORT.md`).

> [!IMPORTANT]
> On `65e7addd121ee3baed1eedc8f32f0a4934dab0c2` (which committed the `customer-ledger-accounting.test.js` teardown fix), `RESTART-04` passed (`46053066866`), `Secret Scanning (Gitleaks)` failed (`46053066876`), and `RESTART-03` (`46053067000` / Job `140688893141`) **STILL FAILED** at Step 10 (`Execute all five PostgreSQL 17 test suites and publish gate summary`, exit code `1`; raw logs `403` unauthenticated).
> Local follow-up fixes on top of `65e7add` harden the remaining three PG17 suites (`restart03-real-postgres.test.js`, `restart032-real-postgres.test.js`, `restart033-real-postgres-repositories.test.js`) off `DROP DATABASE ... WITH (FORCE)` and onto `closePoolCleanly()` + `attachPoolErrorGuard()` + `waitForDbIdle()`. Do **not** mark the `RESTART-03` CI gate as verified until these changes are committed, pushed, and pass on GitHub Actions Linux runners against live PostgreSQL `17.12`.

---

## 0. Latest GitHub Actions Runs (`65e7add` vs `3821676` vs `3938421`)

### 0.0 GitHub Actions Runs on Current Public HEAD `65e7addd121ee3baed1eedc8f32f0a4934dab0c2`

| Workflow | Run / Job | Scanned Commit | PostgreSQL / Scanner | Conclusion | Observed Evidence |
|---|---|---|---|---|---|
| `RESTART-03 PostgreSQL 17 Repository Verification` | [`46053067000`](https://github.com/Swiftify0099/DFarm/actions/runs/46053067000) / [`140688893141`](https://github.com/Swiftify0099/DFarm/actions/runs/46053067000/job/140688893141) | `65e7addd121ee3baed1eedc8f32f0a4934dab0c2` | PostgreSQL `17.12` (`postgres:17-alpine`) | **`failure`** | Steps 1–9 (`build:backend`, `db:validate`, offline pool lifecycle suite, `ci-pg17-bootstrap.js`) succeeded; Step 10 (`Execute all five PostgreSQL 17 test suites and publish gate summary`) failed with exit code `1` (raw logs `403` unauthenticated). Remaining sibling suites (`restart03`, `restart032`, `restart033`) hardened locally on top of `65e7add`. |
| `RESTART-04 PostgreSQL 17 Device Sync & Security Gate` | [`46053066866`](https://github.com/Swiftify0099/DFarm/actions/runs/46053066866) / [`140688892706`](https://github.com/Swiftify0099/DFarm/actions/runs/46053066866/job/140688892706) | `65e7addd121ee3baed1eedc8f32f0a4934dab0c2` | PostgreSQL `17.12` (`postgres:17-alpine`) | **`success`** | `RESTART-04` gate passed on `65e7add`. |
| `Secret Scanning (Gitleaks)` | [`46053066876`](https://github.com/Swiftify0099/DFarm/actions/runs/46053066876) / [`140688893029`](https://github.com/Swiftify0099/DFarm/actions/runs/46053066876/job/140688893029) | `65e7addd121ee3baed1eedc8f32f0a4934dab0c2` | Gitleaks full history | **`failure`** | Failed (`DF-003` OPEN under `RESTART-12`; `54` findings reported on `3821676`). |

### 0.1 GitHub Actions Runs on Previous Public HEAD `38216761bdac32cf929efc6641f25f73bb9abf23` *(`RESTART-03.8`)*

| Workflow | Run / Job | Scanned Commit | PostgreSQL / Scanner | Conclusion | Observed Evidence |
|---|---|---|---|---|---|
| `RESTART-03 PostgreSQL 17 Repository Verification` | [`46047724725`](https://github.com/Swiftify0099/DFarm/actions/runs/46047724725) / [`140671067739`](https://github.com/Swiftify0099/DFarm/actions/runs/46047724725/job/140671067739) | `38216761bdac32cf929efc6641f25f73bb9abf23` | PostgreSQL `17.12` (`postgres:17-alpine`) | **`failure`** | Subtest 20 assertions passed, but teardown raced `pool.end()` / `DROP DATABASE ... WITH (FORCE)` and unstopped background intervals, causing `Test "20..." generated asynchronous activity after the test ended` (`terminating connection due to administrator command`). Remediated locally in `RESTART-03.9`. |
| `RESTART-04 PostgreSQL 17 Device Sync & Security Gate` | [`46047724695`](https://github.com/Swiftify0099/DFarm/actions/runs/46047724695) | `38216761bdac32cf929efc6641f25f73bb9abf23` | PostgreSQL `17.12` (`postgres:17-alpine`) | **`success`** | `RESTART-04` gate passed on `3821676`. |
| `Secret Scanning (Gitleaks)` | [`46047724612`](https://github.com/Swiftify0099/DFarm/actions/runs/46047724612) | `38216761bdac32cf929efc6641f25f73bb9abf23` | Gitleaks full history | **`failure`** | **`54` findings** (`DF-003` OPEN under `RESTART-12`; separate security workstream). |

### 0.2 Previous Public HEAD `3938421d2651c59628aadac0f539d0b583f687f0` *(`RESTART-03.7`)*

| Workflow | Run / Job | Scanned Commit | PostgreSQL / Scanner | Conclusion | Observed API Evidence |
|---|---|---|---|---|---|
| `RESTART-03 PostgreSQL 17 Repository Verification` | [`46043084882`](https://github.com/Swiftify0099/DFarm/actions/runs/46043084882) / [`140655461398`](https://github.com/Swiftify0099/DFarm/actions/runs/46043084882/job/140655461398) | `3938421d2651c59628aadac0f539d0b583f687f0` | PostgreSQL `17.12` (`postgres:17-alpine`) | **`failure`** | Failed Step 9 (`concurrent-idempotency-financial.test.js` Test 8b `err.code` vs `err.status`); fixed in `3821676`. |
| `RESTART-04 PostgreSQL 17 Device Sync & Security Gate` | [`46043084873`](https://github.com/Swiftify0099/DFarm/actions/runs/46043084873) / [`140655461165`](https://github.com/Swiftify0099/DFarm/actions/runs/46043084873/job/140655461165) | `3938421d2651c59628aadac0f539d0b583f687f0` | PostgreSQL `17.12` (`postgres:17-alpine`) | **`success`** | All workflow steps completed with `success`. |
| `Secret Scanning (Gitleaks)` | [`46043084887`](https://github.com/Swiftify0099/DFarm/actions/runs/46043084887) / [`140655461756`](https://github.com/Swiftify0099/DFarm/actions/runs/46043084887/job/140655461756) | `3938421d2651c59628aadac0f539d0b583f687f0` | Gitleaks full history | **`failure`** | Step 3 failed (`DF-003` OPEN under `RESTART-12`). |

### 0.3 Previous Public HEAD `32c37a137c54d153a07f07cb8a40735e94da7d8b` *(`RESTART-03.6`)*

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

## 2. Local Post-Edit Verification Matrix (`RESTART-03.9` on `3821676` Worktree)

### 2.1 Build, Database Package & Offline Lifecycle

| Command | Mode | Result | Exit Code | Status |
|---|---|---|---|---|
| `npm run build:backend` | TypeScript (`shared-types`, `shared-validation`, `database`, `services/backend`) | Clean build — `0` TypeScript errors | `0` | **PASS** |
| `npm run db:validate` | Static SQL validator | `13/13` checks passed, `0` failed, `0` skipped | `0` | **PASS** |
| `npm run db:test` | `pg-mem` + PG gated | `22/22` tests passed across `3` suites (`9` runtime + `13` static; internal suite 2 Real PG skipped) | `0` | **PASS (`pg-mem`; internal PG suite 2 skipped)** |
| `node scripts/ci-run-offline-lifecycle-suite.js` | Node built-in + `FakePool` / Barriers | `20/20` tests passed (`restart037-pool-lifecycle.test.js`), `0` failed, `0` skipped | `0` | **PASS** |

### 2.2 Backend Core Offline Suites Executed in This Session (`NODE_ENV=test TENANT_POOL_CONNECTION_TIMEOUT_MS=500`)

| Suite (`services/backend/tests/...`) | Engine | Tests | Pass | Fail | Skip | Exit | Status |
|---|---|---:|---:|---:|---:|---:|---|
| `clean-architecture.test.js` | Static AST | 9 | 9 | 0 | 0 | 0 | **PASS** |
| `restart02-auth-security-remediation.test.js` | `pg-mem` | 9 | 9 | 0 | 0 | 0 | **PASS** |
| `restart021-auth-session-integrity.test.js` | `pg-mem` | 7 | 7 | 0 | 0 | 0 | **PASS** |
| `restart03-tenant-isolation-and-ownership.test.js` | `pg-mem` | 18 | 18 | 0 | 0 | 0 | **PASS** |
| `restart032-operational-repository-isolation.test.js` | `pg-mem` | 17 | 17 | 0 | 0 | 0 | **PASS** |
| `offline-sync-22-scenarios.test.js` | `pg-mem` | 23 | 23 | 0 | 0 | 0 | **PASS** |
| `restart04-device-auth-and-route-security.test.js` | `pg-mem` | 5 | 5 | 0 | 0 | 0 | **PASS** |
| `restart037-pool-lifecycle.test.js` | `FakePool` / Barriers | 20 | 20 | 0 | 0 | 0 | **PASS** |
| *(Prior baseline unchanged in `RESTART-03.9`: 8 remaining offline backend suites + 4 frontend apps)* | `pg-mem` / Jest / Vitest | 170 + 255 | 170 + 255 | 0 | 0 | 0 | **BASELINE PASS** |

### 2.3 Real PostgreSQL 17 Gates Status

| Suite | Default (No Local PG17) | `REQUIRE_REAL_POSTGRES=1` (No Local PG17) | Local PG `17.12` Verification (`RESTART-03.9` Report) & CI Status |
|---|---|---|---|
| `restart03-real-postgres.test.js` | `tests=1 pass=0 fail=0 skipped=1 exit=0` | `exit=1` (fail closed) | Prior local PG `17.12` run: `5/5` PASS; `3821676` CI `46047724725` failed on `customer-ledger-accounting.test.js`; **updated `RESTART-03.9` CI re-verify pending commit/push** |
| `restart032-real-postgres.test.js` | `tests=1 pass=0 fail=0 skipped=1 exit=0` | `exit=1` (fail closed) | Prior local PG `17.12` run: `4/4` PASS; **updated `RESTART-03.9` CI re-verify pending commit/push** |
| `restart033-real-postgres-repositories.test.js` | `tests=1 pass=0 fail=0 skipped=1 exit=0` | `exit=1` (fail closed) | Prior local PG `17.12` run: `6/6` PASS; **updated `RESTART-03.9` CI re-verify pending commit/push** |
| `customer-ledger-accounting.test.js` | `tests=1 pass=0 fail=0 skipped=1 exit=0` | `exit=1` (fail closed) | `3821676` CI `46047724725` failed teardown (`terminating connection due to administrator command`); **repaired locally in `RESTART-03.9`** (prior local PG `17.12` report: `6x` `25/25` PASS, `0` `pg_stat_activity` leftovers); **CI re-verify pending commit/push** |
| `concurrent-idempotency-financial.test.js` | `tests=1 pass=0 fail=0 skipped=1 exit=0` | `exit=1` (fail closed) | Prior local PG `17.12` run: `11/11` PASS; **updated `RESTART-03.9` CI re-verify pending commit/push** |
| `restart04-real-postgres-device-sync.test.js` | `tests=1 pass=0 fail=0 skipped=1 exit=0` | `exit=1` (fail closed) | `3821676` CI `46047724695` **`success`**; `3938421` `46043084873` `success`; `db8b732` `45968244756` `8/8` PASS; **re-verify on pushed `RESTART-03.9` commit** |

---

## 3. Local Follow-Up Changed Files (Uncommitted on Top of `65e7add`)

| File | Change Summary |
|---|---|
| `services/backend/tests/restart03-real-postgres.test.js`, `services/backend/tests/restart032-real-postgres.test.js`, `services/backend/tests/restart033-real-postgres-repositories.test.js` | Integrated `createPoolShutdownManager` (`closePoolCleanly`) and `attachPoolErrorGuard` across all pools (`adminPool`, `poolCtrl`, `poolA`, `poolB`, and in `restart033` `db.pool` + tenant pools), added `waitForDbIdle()` before `DROP DATABASE IF EXISTS ...;` (removed `WITH (FORCE)`), removed duplicate `suite.after()` in `restart033`, and preserved primary + cleanup errors via `AggregateError`. |
| `DFARM_RESTART_03_9_CI_FAILURE_ROOT_CAUSE_AND_FIX_REPORT.md`, `DFARM_RESTART_01_MASTER_ISSUE_REGISTER.md`, `DFARM_RESTART_03_5_FINAL_CI_MATRIX.md`, `DFARM_RESTART_04_DEVICE_SYNC_SECURITY_REPORT.md` | Reconciled public HEAD `65e7add` CI results (`46053067000`, `46053066866`, `46053066876`), `3821676` CI results, local sibling PG17 teardown hardening, and pending CI verification gate. |

---

## 4. Gitleaks Status

| Run | Scanned Commit | Findings | Status |
|---|---|---|---|
| [`46053066876`](https://github.com/Swiftify0099/DFarm/actions/runs/46053066876) / [`140688893029`](https://github.com/Swiftify0099/DFarm/actions/runs/46053066876/job/140688893029) | `65e7addd121ee3baed1eedc8f32f0a4934dab0c2` | Step failed | **FAIL — `DF-003` OPEN under `RESTART-12`** |
| [`46047724612`](https://github.com/Swiftify0099/DFarm/actions/runs/46047724612) | `38216761bdac32cf929efc6641f25f73bb9abf23` | `54` findings | **FAIL — `DF-003` OPEN under `RESTART-12`** |
| [`46043084887`](https://github.com/Swiftify0099/DFarm/actions/runs/46043084887) / [`140655461756`](https://github.com/Swiftify0099/DFarm/actions/runs/46043084887/job/140655461756) | `3938421d2651c59628aadac0f539d0b583f687f0` | Step 3 failed | **FAIL — `DF-003` OPEN under `RESTART-12`** |
| [`45968244743`](https://github.com/Swiftify0099/DFarm/actions/runs/45968244743) | `db8b73296247a8dd800e7276f12eda4a68c2ff4b` | `54` across `43` commits | **FAIL — `DF-003` OPEN under `RESTART-12`** |

---

## 5. Remaining Blockers

- **`RESTART-03` CI Gate Pending Commit/Push:** `65e7add` (`RESTART-03` `46053067000` / Job `140688893141`) still failed at Step 10 (`exit code 1`). Local follow-up teardown fixes for `restart03-real-postgres.test.js`, `restart032-real-postgres.test.js`, and `restart033-real-postgres-repositories.test.js` sit uncommitted on top of `65e7add` (Docker Desktop / live PG17 is not running on this host). **Do not mark `RESTART-03` CI gate verified until these changes are committed, pushed, and GitHub Actions `RESTART-03` + `RESTART-04` both conclude `success`** (`DF-030` remains **OPEN / PARTIAL**).
- **`DF-003` Gitleaks:** Full-history Gitleaks failed on `65e7add` (`46053066876`) and `3821676` (`46047724612`, `54` findings). Kept **OPEN** under `RESTART-12`.
- **Downstream Tracks Kept OPEN:** `DF-016` (OPEN/PARTIAL), `DF-018` modular biometric routers (`RESTART-07`), `DF-020` (`RESTART-05`), `DF-021` (`RESTART-09`), `DF-022` / Union Bank (`RESTART-10`). Proceed to `RESTART-05` only after both PG17 CI gates confirm green on the pushed fix commit.
