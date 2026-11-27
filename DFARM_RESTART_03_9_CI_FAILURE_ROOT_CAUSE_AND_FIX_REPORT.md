# DFARM RESTART-03.9 — PostgreSQL 17 CI Failure Root-Cause & Fix Report

- **Repository:** `Swiftify0099/DFarm`
- **Branch:** `fix/cloudflare-pages-production-deploy`
- **Verified Public & Local HEAD:** `38216761bdac32cf929efc6641f25f73bb9abf23` (`feat: add PostgreSQL 17 verification workflow and tenant pool lifecycle tests`)
- **Local Working Tree Status:** Modified [customer-ledger-accounting.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/customer-ledger-accounting.test.js) and added this report (uncommitted and unpushed per task rules; no new commit SHA created).
- **Related CI Evidence (Pre-Fix on `3821676`):**
  - `RESTART-03 PostgreSQL 17 Repository Verification` run `46047724725` / job `140671067739`: **FAILED** on `services/backend/tests/customer-ledger-accounting.test.js` (`Test "20. Database rollback: transactional failure leaves zero partial entries in ledger or accounts" ... generated asynchronous activity after the test ended`, underlying error: `terminating connection due to administrator command`).
  - `RESTART-04 PostgreSQL 17 Device Sync & Security Gate` run `46047724695`: **PASS**.
  - `Secret Scanning (Gitleaks)` run `46047724612`: **54 findings** (separate open security remediation workstream; untouched).

---

## 1. Exact Original Failure & Root Cause

### 1.1 Observed Failure
In CI job `140671067739` (run `46047724725`), all assertions inside Test 20 (`"20. Database rollback: transactional failure leaves zero partial entries in ledger or accounts"`) passed, yet `node --test` failed the suite after the test ended with:

```text
Test "20. Database rollback: transactional failure leaves zero partial entries in ledger or accounts" ... generated asynchronous activity after the test ended.
The underlying error is: terminating connection due to administrator command
```

### 1.2 Root-Cause Chain (Verified in `pg-pool`, `pg`, `RealtimeEventPublisher`, and `customer-ledger-accounting.test.js`)

1. **Premature `pool.end()` resolution in `pg-pool` + unguarded pools + `DROP DATABASE ... WITH (FORCE)`:**
   - In `node_modules/pg-pool/index.js` (`_pulseQueue` and `_remove`, lines 133–145 & 172–188), `pool.end()` synchronously removes idle clients from `this._clients` and invokes `client.end(() => context.emit('remove', client))` asynchronously without awaiting socket closure. Because `this._clients.length` drops to `0` immediately, `pool.end()` resolves **before** `client.end()` finishes flushing the PostgreSQL `Terminate` (`'X'`) packet and closing the TCP socket.
   - `pg-pool`'s `_remove(client)` does not detach `idleListener` from `client`, and `node_modules/pg/lib/client.js` (`_handleErrorMessage`, lines 426–435) emits an `'error'` event on `client` for backend `ErrorResponse` messages even when `this._ending === true` if `!this._getActiveQuery()`.
   - Prior to this fix, [customer-ledger-accounting.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/customer-ledger-accounting.test.js) awaited `poolCtrl?.end()`, `poolOrg1?.end()`, and `poolOrg2?.end()` and immediately ran `DROP DATABASE IF EXISTS ... WITH (FORCE);` without waiting for `'remove'` events or checking `pg_stat_activity`, and without attaching `'error'` listeners to `adminPool`, `poolCtrl`, `poolOrg1`, or `poolOrg2`.
   - When `DROP DATABASE ${dbNameOrg1} WITH (FORCE)` reached PostgreSQL 17 before `poolOrg1`'s closing TCP socket finished disconnecting, PostgreSQL terminated the backend (`FATAL: terminating connection due to administrator command`, SQLSTATE `57P01`). `idleListener` emitted `'error'` on `poolOrg1` (which had no `'error'` listener), raising an uncaught exception.

2. **Why `node:test` attributed the uncaught exception to Test 20:**
   - In Test 20 (`customer-ledger-accounting.test.js` lines 815–825), `assert.rejects(() => poolOrg1.query('SELECT public.post_customer_deduction(... -100.00 ...)'))` triggers a PostgreSQL `22003` exception.
   - `pg-pool` treats a failed `pool.query()` via `client.release(err)` → `_remove(client)`, destroying the client used by Tests 0–19.
   - The immediately following query in Test 20 (`balanceAfter`) creates a **fresh `pg.Client` and `net.Socket`** inside Test 20's `AsyncLocalStorage` / async context. Tests 21–23 reuse that single idle client sequentially.
   - When `DROP DATABASE ... WITH (FORCE)` terminated that client during teardown, `node:test` traced the socket's `AsyncResource` back to Test 20 and reported asynchronous activity after Test 20 ended (`terminating connection due to administrator command`). Local reproduction on PostgreSQL `17.12` (`repro2.test.mjs`) reproduced the exact `node:test` error wording when `DROP DATABASE ... WITH (FORCE)` raced with an idle client allocated in subtest `20`.

3. **Contributing lifecycle & observability defects in `customer-ledger-accounting.test.js`:**
   - **Unstopped background intervals:** Importing `createApp()` instantiates `realtimePublisher` ([RealtimeEventPublisher.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/realtime/RealtimeEventPublisher.ts)), whose `outboxWorkerInterval` (`setInterval` every `1000ms`) repeatedly executes `db.query('SELECT ... FROM dashboard_events_outbox ...')` against `dbNameCtrl` (confirmed in local PG `17.12` server logs: `ERROR: relation "dashboard_events_outbox" does not exist`), alongside `heartbeatInterval` / `retentionCleanupInterval`, and `sseTicketService` ([SseTicketService.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/security/SseTicketService.ts)) starts `cleanupInterval` (`60000ms`). Neither `.destroy()` was called during teardown.
   - **Duplicate `t.after()` + `finally` teardown & blanket `.catch(() => {})`:** `t.after()` ran after `finally` had already torn down pools and dropped databases, and blanket `.catch(() => {})` masked any shutdown or drop failures.
   - **Duplicate teardown alone was NOT the primary cause on `3821676`:** On `3821676`, `TenantDatabaseManager.closeAllPools()` and `PostgresDatabase.close()` are already idempotent (`PostgresPool.ts` lines 734–755; `TenantDatabaseManager.ts` lines 1090–1160). The unguarded `poolOrg1` / `poolCtrl` / `poolOrg2` socket-close race with `DROP DATABASE ... WITH (FORCE)`, missing `'error'` capture, and unstopped background timers were the active defects.

---

## 2. Files Changed & Why

| File | Change | Reason |
|---|---|---|
| [customer-ledger-accounting.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/customer-ledger-accounting.test.js) | Integrated `createPoolShutdownManager` (`closePoolCleanly`) from [pool-lifecycle-helpers.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/helpers/pool-lifecycle-helpers.js); added `attachPoolErrorGuard` to record async `pool.on('error', ...)` events on `adminPool`, `poolCtrl`, `poolOrg1`, `poolOrg2`, `db.pool`, and tenant pools and fail during teardown if non-empty; made `canConnectRealPostgres` fail closed on non-connection/probe/shutdown errors; removed duplicate `t.after()` and blanket `.catch(() => {})`; stopped `realtimePublisher.destroy()` and `sseTicketService.destroy()` before pool shutdown; added `waitForDbIdle()` (`pg_stat_activity` check) before `DROP DATABASE IF EXISTS ...;` (removed `WITH (FORCE)`); verified `.ended === true` and database deletion; preserved original test failure alongside cleanup failures using `AggregateError` (and in `controlPlaneAdapter.withTransaction` on `ROLLBACK` failure). | Eliminates asynchronous socket termination races, lingering background timers, and silent error masking without altering any production financial logic. |
| [DFARM_RESTART_03_9_CI_FAILURE_ROOT_CAUSE_AND_FIX_REPORT.md](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_03_9_CI_FAILURE_ROOT_CAUSE_AND_FIX_REPORT.md) | Created evidence-based root-cause and verification report. | Documentation required by RESTART-03.9. |

*(No production application or financial SQL files were modified.)*

---

## 3. Before / After Behavior

| Aspect | Before (`3821676`) | After (Local Fix) |
|---|---|---|
| Pool `error` listeners | `adminPool`, `poolCtrl`, `poolOrg1`, `poolOrg2` had no `'error'` listeners; idle socket error caused `uncaughtException` (`Test "20..." generated asynchronous activity`). | All test, central (`db.pool`), and tenant pools attach `attachPoolErrorGuard`; any unexpected error is recorded and fails teardown via `assert.deepEqual(poolErrors, [])`. |
| Background timers | `realtimePublisher` (`1000ms` outbox query on `db`) and `sseTicketService` timers kept running through and after teardown. | `realtimePublisher.destroy()` and `sseTicketService.destroy()` are called at the start of `cleanup()`. |
| Pool shutdown | `t.after()` + `finally` duplicated `closeAllPools()`/`db.close()`; `pool.end()` resolved before `client.end()` TCP close; `.catch(() => {})` hid errors. | Single idempotent `cleanup()` in `finally` uses `closePoolCleanly()` (waits for `totalCount === idleCount && waitingCount === 0`, awaits shutdown, awaits all `'remove'` events, verifies `pool.ended === true`). |
| Database drop | `DROP DATABASE IF EXISTS ... WITH (FORCE)` killed still-closing backend sockets. | `waitForDbIdle(dbName)` polls `pg_stat_activity` until `0` connections remain (excluding `pg_backend_pid()`), then runs `DROP DATABASE IF EXISTS ...;` without `FORCE` and verifies removal in `pg_database`. |
| Error preservation | `finally` could overwrite an earlier test failure; `.catch(() => {})` swallowed cleanup failures. | Primary test error and cleanup error are both preserved via `AggregateError`. |

---

## 4. Local Real PostgreSQL 17.12 Verification Results

> **Environment Note:** Local `com.docker.service` / WSL2 Docker engine was unresponsive (`npipe:////./pipe/dockerDesktopLinuxEngine` unavailable), so real PostgreSQL `17.12` (`server_version_num=170012`, `PostgreSQL 17.12 on x86_64-windows`) was initialized and run as a disposable local instance on `127.0.0.1:55432` with `dfarm_central` and `postgres` bootstrapped via `node scripts/ci-pg17-bootstrap.js`.

### 4.1 Isolated `customer-ledger-accounting.test.js` Repeated Runs (6x Consecutive)

Executed with `NODE_ENV=test DFARM_ALLOW_DISPOSABLE_PG17_MUTATIONS=1 REQUIRE_REAL_POSTGRES=1 TEST_REAL_POSTGRES=1 DATABASE_TLS_MODE=disable TENANT_POOL_CONNECTION_TIMEOUT_MS=5000`:

| Run | Command | Tests | Pass | Fail | Skip | Exit Code |
|---|---|---:|---:|---:|---:|---:|
| 1/6 | `node --test --test-reporter=tap services/backend/tests/customer-ledger-accounting.test.js` | 25 | 25 | 0 | 0 | 0 |
| 2/6 | `node --test --test-reporter=tap services/backend/tests/customer-ledger-accounting.test.js` | 25 | 25 | 0 | 0 | 0 |
| 3/6 | `node --test --test-reporter=tap services/backend/tests/customer-ledger-accounting.test.js` | 25 | 25 | 0 | 0 | 0 |
| 4/6 | `node --test --test-reporter=tap services/backend/tests/customer-ledger-accounting.test.js` | 25 | 25 | 0 | 0 | 0 |
| 5/6 | `node --test --test-reporter=tap services/backend/tests/customer-ledger-accounting.test.js` | 25 | 25 | 0 | 0 | 0 |
| 6/6 | `node --test --test-reporter=tap services/backend/tests/customer-ledger-accounting.test.js` | 25 | 25 | 0 | 0 | 0 |

- **Post-6x `pg_stat_activity` (`datname LIKE 'dfarm_l12_%'`):** `0 rows`.
- **Post-6x `pg_database` (`datname LIKE 'dfarm_l12_%'`):** `0 rows`.
- **Post-6x PG 17.12 server log (`FATAL|terminating connection`):** `0` occurrences.

### 4.2 All Five RESTART-03 PostgreSQL 17.12 Suites (`node scripts/ci-run-pg17-suites.js`)

| PostgreSQL Version | Suite Name | Tests Executed | Pass | Fail | Skip | Exit Code | Status |
|---|---|---:|---:|---:|---:|---:|---|
| `17.12 (170012)` | `services/backend/tests/restart03-real-postgres.test.js` | 5 | 5 | 0 | 0 | 0 | **PASS** |
| `17.12 (170012)` | `services/backend/tests/restart032-real-postgres.test.js` | 4 | 4 | 0 | 0 | 0 | **PASS** |
| `17.12 (170012)` | `services/backend/tests/restart033-real-postgres-repositories.test.js` | 6 | 6 | 0 | 0 | 0 | **PASS** |
| `17.12 (170012)` | `services/backend/tests/customer-ledger-accounting.test.js` | 25 | 25 | 0 | 0 | 0 | **PASS** |
| `17.12 (170012)` | `services/backend/tests/concurrent-idempotency-financial.test.js` | 11 | 11 | 0 | 0 | 0 | **PASS** |
| **Total** | **5/5 Suites** | **51** | **51** | **0** | **0** | **0** | **PASS** |

- **No-PG17 Fail-Closed Checks (`customer-ledger-accounting.test.js` with `TEST_POSTGRES_URL=""`):**
  - Default (`REQUIRE_REAL_POSTGRES` unset): `tests=1 pass=0 fail=0 skipped=1` (exit `0`).
  - Strict (`REQUIRE_REAL_POSTGRES=1`): `tests=1 pass=0 fail=1 skipped=0` (exit `1`, fail-closed).

### 4.3 Offline Lifecycle, Build & Migration Validation Results

| Gate | Command | Result | Exit Code | Status |
|---|---|---|---:|---|
| Backend & Packages Build | `npm run build:backend` | `0` TypeScript errors (`shared-types`, `shared-validation`, `database`, `services/backend`) | 0 | **PASS** |
| DB Migration Validation | `npm run db:validate` | `13/13` checks passed, `0` failed, `0` skipped | 0 | **PASS** |
| Offline Pool Lifecycle Suite | `node scripts/ci-run-offline-lifecycle-suite.js` | `20/20` tests passed (`restart037-pool-lifecycle.test.js`), `0` failed, `0` skipped | 0 | **PASS** |

### 4.4 Pool Shutdown & `pg_stat_activity` Evidence (Post-5-Suite Gate)

- `SELECT datname, state, count(*) FROM pg_stat_activity WHERE datname LIKE 'dfarm_%' AND datname <> 'dfarm_central' GROUP BY datname, state;` → **`(0 rows)`**.
- `SELECT datname FROM pg_database WHERE datname LIKE 'dfarm_%' AND datname <> 'dfarm_central';` → **`(0 rows)`**.
- PG 17.12 server log during and after the 5-suite gate → **`0`** `FATAL` or `terminating connection` entries.
- `.temp/` integrity check: `0` tracked files (`git ls-files .temp`), `1,829` files preserved on disk.

---

## 5. Remaining Blockers & Open Items

1. **CI Re-verification Pending Commit/Push:** Per task stop conditions, changes are left uncommitted and unpushed in the local worktree on top of `38216761bdac32cf929efc6641f25f73bb9abf23`. RESTART-03 cannot be marked complete until these changes are committed, pushed, and verified on GitHub Actions Linux runners (`dfarm-restart03-postgres17.yml`).
2. **Gitleaks Security Remediation (Separate Workstream — `DF-003` / `RESTART-12`):** `Secret Scanning (Gitleaks)` run `46047724612` reported **54 findings**. Per scope rules, this remains open as a separately scoped security remediation and secret-validity review; no secret values were printed and `.temp/` / Git history were not altered.
3. **Sibling PG17 Suites Still Using `WITH (FORCE)` / `t.after()` (Out of Scope for Targeted Fix):** `restart03-real-postgres.test.js` and `restart033-real-postgres-repositories.test.js` passed in the 5-suite gate, though they still use `DROP DATABASE ... WITH (FORCE)` and `.catch(() => {})` in their cleanup blocks (left untouched to remain strictly within the targeted `customer-ledger-accounting.test.js` fix scope).
