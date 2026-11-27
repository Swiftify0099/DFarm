# DFARM RESTART-03.9 — PostgreSQL 17 CI Failure Root-Cause & Fix Report

- **Repository:** `Swiftify0099/DFarm`
- **Branch:** `fix/cloudflare-pages-production-deploy`
- **Current Local & Public Remote HEAD (`origin/fix/cloudflare-pages-production-deploy`):** `65e7addd121ee3baed1eedc8f32f0a4934dab0c2` (`fix: resolve PostgreSQL 17 CI failure in customer-ledger-accounting test suite via robust pool lifecycle management`; parent `38216761bdac32cf929efc6641f25f73bb9abf23`)
- **Local Working Tree Status:** Uncommitted follow-up hardening on top of `65e7add`:
  - Phase 3 background-drain & post-destroy guards in [RealtimeEventPublisher.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/realtime/RealtimeEventPublisher.ts), [SseTicketService.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/security/SseTicketService.ts), and compiled `services/backend/dist/infrastructure/{realtime,security}/*`
  - Awaited background service drain in [customer-ledger-accounting.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/customer-ledger-accounting.test.js)
  - Deterministic background-drain unit tests (`20` and `21`) in [restart037-pool-lifecycle.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart037-pool-lifecycle.test.js)
  - Sibling PG17 suite teardown hardening in [restart03-real-postgres.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart03-real-postgres.test.js), [restart032-real-postgres.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart032-real-postgres.test.js), and [restart033-real-postgres-repositories.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart033-real-postgres-repositories.test.js)
  - Updated report & independent audit documentation ([DFARM_RESTART_03_9_CI_FAILURE_ROOT_CAUSE_AND_FIX_REPORT.md](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_03_9_CI_FAILURE_ROOT_CAUSE_AND_FIX_REPORT.md), [DFARM_RESTART_03_9_INDEPENDENT_FINAL_AUDIT.md](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_03_9_INDEPENDENT_FINAL_AUDIT.md), plus reconciled matrix/register/device-sync docs)

---

## 1. GitHub CI History vs Local Fix & Verification Status

| Stage | Commit / State | `RESTART-03` PG17 Gate | `RESTART-04` PG17 Gate | `Secret Scanning (Gitleaks)` | Notes |
|---|---|---|---|---|---|
| **Pre-Fix Public HEAD** | `38216761bdac32cf929efc6641f25f73bb9abf23` (`RESTART-03.8`) | **FAILED** (`46047724725` / job `140671067739`) | **PASS** (`46047724695`) | **FAIL** (`46047724612`, `54` findings — `DF-003`) | `customer-ledger-accounting.test.js` Test 20 failed after subtest ended: `terminating connection due to administrator command`. |
| **Initial RESTART-03.9 Public HEAD** | `65e7addd121ee3baed1eedc8f32f0a4934dab0c2` | **FAILED** (`46053067000` / job `140688893141`, Step 10 exit `1`) | **PASS** (`46053066866` / job `140688892706`) | **FAIL** (`46053066876` / job `140688893029` — `DF-003`) | Fixed `customer-ledger-accounting.test.js` pool shutdown, but sibling suites (`restart03`, `restart032`, `restart033`) still used `WITH (FORCE)` / unguarded teardown, and `destroy()` did not yet drain active background queries. |
| **Local RESTART-03.9 + Audit Hardening** | Uncommitted on top of `65e7add` | **LOCAL PG 17.12 VERIFIED** (`51/51` across 5/5 suites + `6x` `25/25` ledger) | **Not re-run locally; prior CI PASS on `65e7add`** | **Untouched (`DF-003` remains open)** | Added sibling teardown hardening (`restart03`, `restart032`, `restart033`) and Phase 3 async background-work drain (`RealtimeEventPublisher`, `SseTicketService`, `customer-ledger-accounting.test.js`, `restart037-pool-lifecycle.test.js`). |
| **New GitHub Linux CI Verification** | **PENDING COMMIT & PUSH** | **PENDING** (must **NOT** mark PASS until exact new SHA passes on GitHub Linux runners) | **PENDING** on new SHA | **OPEN (`DF-003` separate workstream)** | RESTART-03 cannot be marked complete until a new exact-SHA GitHub workflow run succeeds. |

---

## 2. Exact Original Failure & Root Cause

### 2.1 Observed Failure on `3821676`
In CI job `140671067739` (run `46047724725`), all assertions inside Test 20 (`"20. Database rollback: transactional failure leaves zero partial entries in ledger or accounts"`) passed, yet `node --test` failed the suite after the test ended with:

```text
Test "20. Database rollback: transactional failure leaves zero partial entries in ledger or accounts" ... generated asynchronous activity after the test ended.
The underlying error is: terminating connection due to administrator command
```

### 2.2 Root-Cause Chain (Verified in `pg-pool`, `pg`, `RealtimeEventPublisher`, `SseTicketService`, and PG17 Test Suites)

1. **Premature `pool.end()` resolution in `pg-pool` + unguarded pools + `DROP DATABASE ... WITH (FORCE)`:**
   - In `node_modules/pg-pool/index.js` (`_pulseQueue` and `_remove`, lines 133–145 & 172–188), `pool.end()` synchronously removes idle clients from `this._clients` and invokes `client.end(() => context.emit('remove', client))` asynchronously without awaiting socket closure. Because `this._clients.length` drops to `0` immediately, `pool.end()` resolves **before** `client.end()` finishes flushing the PostgreSQL `Terminate` (`'X'`) packet and receiving `this.connection.once('end', cb)` (`node_modules/pg/lib/client.js` lines 799–836).
   - `pg-pool`'s `_remove(client)` does not detach `idleListener` from `client`, and `node_modules/pg/lib/client.js` (`_handleErrorMessage`, lines 426–435) emits an `'error'` event on `client` for backend `ErrorResponse` messages even when `this._ending === true` if `!this._getActiveQuery()`.
   - Before `65e7add` (and in `restart03`, `restart032`, `restart033` on `65e7add`), tests awaited `pool.end()` and immediately ran `DROP DATABASE IF EXISTS ... WITH (FORCE);` without awaiting `'remove'` events or checking `pg_stat_activity`, and without attaching `'error'` listeners on `adminPool`, `poolCtrl`, `poolOrg1`, `poolOrg2` (or `poolA`, `poolB`).
   - When `DROP DATABASE ... WITH (FORCE)` reached PostgreSQL 17 before closing TCP sockets finished disconnecting, PostgreSQL terminated the backend (`FATAL: terminating connection due to administrator command`, SQLSTATE `57P01`). `idleListener` emitted `'error'` on an unguarded pool, raising an uncaught exception.

2. **Why `node:test` attributed the uncaught exception to Test 20:**
   - In Test 20 (`customer-ledger-accounting.test.js` lines 1045–1050), `assert.rejects(() => poolOrg1.query('SELECT public.post_customer_deduction(... -100.00 ...)'))` triggers a PostgreSQL `22003` exception.
   - `pg-pool` treats a failed `pool.query()` via `client.release(err)` → `_remove(client)`, destroying the client used by Tests 0–19.
   - The immediately following query in Test 20 (`balanceAfter`) creates a **fresh `pg.Client` and `net.Socket`** inside Test 20's `AsyncLocalStorage` / async context. Tests 21–23 reuse that single idle client sequentially.
   - When `DROP DATABASE ... WITH (FORCE)` terminated that client during teardown, `node:test` traced the socket's `AsyncResource` back to Test 20 and reported asynchronous activity after Test 20 ended (`terminating connection due to administrator command`).

3. **Contributing lifecycle defects (including Phase 3 background drain gap found during independent audit):**
   - **Background timers and unawaited async queries (`RealtimeEventPublisher` & `SseTicketService`):**
     - Importing `createApp()` instantiates `realtimePublisher` ([RealtimeEventPublisher.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/realtime/RealtimeEventPublisher.ts)) with `heartbeatInterval` (`20000ms`), `outboxWorkerInterval` (`1000ms` querying `dashboard_events_outbox` on `db`), `retentionCleanupInterval` (`3600000ms`), plus async `persistOutboxEvent()` and `replayMissedEvents()`.
     - Importing `app` also instantiates `sseTicketService` ([SseTicketService.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/security/SseTicketService.ts)), which immediately fires `ensureRedemptionTable()` against `db` in its constructor and runs `cleanupInterval` (`60000ms` calling `purgeExpiredTickets()`).
     - On `65e7add`, both `RealtimeEventPublisher.destroy()` and `SseTicketService.destroy()` only called `clearInterval(...)` synchronously (`void`) without blocking post-destroy work or awaiting already-running async database queries (`processOutboxBatch`, `purgeOldOutboxEvents`, `persistOutboxEvent`, `replayMissedEvents`, `ensureRedemptionTable`, `purgeExpiredTickets`), and `customer-ledger-accounting.test.js` did not `await` them.
   - **Duplicate `t.after()` / `suite.after()` + `finally` teardown & blanket `.catch(() => {})`:** Present in `customer-ledger-accounting.test.js` pre-`65e7add` and in `restart033-real-postgres-repositories.test.js` on `65e7add`.

---

## 3. Files Changed & Why

| File | Scope / Origin | Change | Reason |
|---|---|---|---|
| [customer-ledger-accounting.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/customer-ledger-accounting.test.js) | Committed in `65e7add` + uncommitted Phase 3 `await` update | Integrated `createPoolShutdownManager` (`closePoolCleanly`), `attachPoolErrorGuard` across all pools, fail-closed `canConnectRealPostgres`, removed duplicate `t.after()` and blanket `.catch(() => {})`, awaits `realtimePublisherRef.destroy()` and `sseTicketServiceRef.destroy()`, added `waitForDbIdle()` (`pg_stat_activity`), `DROP DATABASE IF EXISTS ...;` (no `FORCE`), DB existence assertion, and `AggregateError` preservation. | Eliminates socket termination races, unawaited background timers/queries, and silent error masking without altering financial logic. |
| [RealtimeEventPublisher.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/realtime/RealtimeEventPublisher.ts) (+ compiled `dist/`) | Uncommitted Phase 3 audit fix | Converted `destroy()` to idempotent `Promise<void>` with `isDestroyed` guards, interval clearing, SSE client disconnection (`disconnectAllClients()`), and `inFlightBackgroundWork` tracking/draining for `processOutboxBatch`, `purgeOldOutboxEvents`, `persistOutboxEvent`, and `replayMissedEvents`. | Ensures `destroy()` blocks future callbacks and genuinely waits for active async queries before pools close. |
| [SseTicketService.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/security/SseTicketService.ts) (+ compiled `dist/`) | Uncommitted Phase 3 audit fix | Converted `destroy()` to idempotent `Promise<void>` with `isDestroyed` / `isPurgingTickets` guards, interval clearing, and `inFlightBackgroundWork` tracking/draining for `ensureRedemptionTable()` and `purgeExpiredTickets()`. | Ensures constructor table init and cleanup queries cannot outlive `destroy()` during pool teardown. |
| [restart037-pool-lifecycle.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart037-pool-lifecycle.test.js) | Uncommitted Phase 3 audit fix | Added deterministic Tests `20` and `21` verifying `RealtimeEventPublisher.destroy()` and `SseTicketService.destroy()` clear intervals, block future work, wait on deferred active DB queries, drain to `0`, and are idempotent. | Locks background-drain behavior into the CI offline lifecycle gate (`22/22` tests). |
| [restart03-real-postgres.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart03-real-postgres.test.js), [restart032-real-postgres.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart032-real-postgres.test.js), [restart033-real-postgres-repositories.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart033-real-postgres-repositories.test.js) | Uncommitted follow-up on top of `65e7add` | Applied `closePoolCleanly()`, `attachPoolErrorGuard()`, `waitForDbIdle()`, `AggregateError` preservation, and `DROP DATABASE IF EXISTS ...;` (no `FORCE`); removed duplicate `suite.after()` in `restart033`. | Resolves remaining `57P01` / `FORCE` teardown races across the 3 sibling suites after `65e7add` CI run `46053067000` failed Step 10. |
| [DFARM_RESTART_03_9_CI_FAILURE_ROOT_CAUSE_AND_FIX_REPORT.md](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_03_9_CI_FAILURE_ROOT_CAUSE_AND_FIX_REPORT.md), [DFARM_RESTART_03_9_INDEPENDENT_FINAL_AUDIT.md](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_03_9_INDEPENDENT_FINAL_AUDIT.md) | Uncommitted documentation | Updated root-cause/verification report and added independent final audit report distinguishing `3821676`, `65e7add`, local PG `17.12` verification, pending CI, and `DF-003`. | Accurate auditability and CI release readiness. |

---

## 4. Post-Edit Local Real PostgreSQL 17.12 Verification Results

> **Environment Note:** Local Docker engine (`npipe:////./pipe/dockerDesktopLinuxEngine`) was unavailable, so verification ran against a disposable local PostgreSQL `17.12` (`server_version_num=170012`, `PostgreSQL 17.12 on x86_64-windows`) cluster initialized in scratch storage on `127.0.0.1:55432` with `dfarm_central` and `postgres` bootstrapped via `node scripts/ci-pg17-bootstrap.js`, then shut down cleanly via `pg_ctl stop -m fast`. No production Supabase or Render database was touched.

### 4.1 Build, Migration Validation, Clean Architecture & Offline Lifecycle Suite (After Final Code Edits)

| Gate | Command | Result | Exit Code | Status |
|---|---|---|---:|---|
| Backend & Packages Build | `npm run build:backend` | `0` TypeScript errors (`shared-types`, `shared-validation`, `database`, `services/backend`) | 0 | **PASS** |
| DB Migration Validation | `npm run db:validate` | `13/13` checks passed, `0` failed, `0` skipped | 0 | **PASS** |
| Offline Pool & Background Drain Lifecycle Suite | `node scripts/ci-run-offline-lifecycle-suite.js` | `22/22` tests passed (`restart037-pool-lifecycle.test.js`, incl. Tests `20`–`21`), `0` failed, `0` skipped | 0 | **PASS** |
| Backend Clean Architecture Suite | `npm run --workspace=services/backend test` | `9/9` tests passed (`clean-architecture.test.js`), `0` failed, `0` skipped | 0 | **PASS** |

### 4.2 Isolated `customer-ledger-accounting.test.js` Repeated Runs (6x Consecutive After Final Edits)

Executed with `NODE_ENV=test DFARM_ALLOW_DISPOSABLE_PG17_MUTATIONS=1 REQUIRE_REAL_POSTGRES=1 TEST_REAL_POSTGRES=1 DATABASE_TLS_MODE=disable TENANT_POOL_CONNECTION_TIMEOUT_MS=5000`:

| Run | Command | Tests | Pass | Fail | Skip | Exit Code |
|---|---|---:|---:|---:|---:|---:|
| 1/6 | `node --test --test-reporter=tap services/backend/tests/customer-ledger-accounting.test.js` | 25 | 25 | 0 | 0 | 0 |
| 2/6 | `node --test --test-reporter=tap services/backend/tests/customer-ledger-accounting.test.js` | 25 | 25 | 0 | 0 | 0 |
| 3/6 | `node --test --test-reporter=tap services/backend/tests/customer-ledger-accounting.test.js` | 25 | 25 | 0 | 0 | 0 |
| 4/6 | `node --test --test-reporter=tap services/backend/tests/customer-ledger-accounting.test.js` | 25 | 25 | 0 | 0 | 0 |
| 5/6 | `node --test --test-reporter=tap services/backend/tests/customer-ledger-accounting.test.js` | 25 | 25 | 0 | 0 | 0 |
| 6/6 | `node --test --test-reporter=tap services/backend/tests/customer-ledger-accounting.test.js` | 25 | 25 | 0 | 0 | 0 |

### 4.3 All Five RESTART-03 PostgreSQL 17.12 Suites (`node scripts/ci-run-pg17-suites.js`, After Final Edits)

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

### 4.4 Pool Shutdown, Database Hygiene & Workspace Integrity Evidence

- `SELECT datname, state, count(*) FROM pg_stat_activity WHERE datname LIKE 'dfarm_%' AND datname <> 'dfarm_central' GROUP BY datname, state;` → **`(0 rows)`**.
- `SELECT datname FROM pg_database WHERE datname LIKE 'dfarm_%' AND datname <> 'dfarm_central';` → **`(0 rows)`**.
- Disposable PG `17.12` server log `FATAL|terminating connection` occurrences across bootstrap + 6x ledger runs + 5-suite gate → **`0`**.
- `.temp/` integrity check: `0` tracked files (`git ls-files .temp`), `1,829` files preserved on disk.

---

## 5. Remaining Blockers & Open Items

1. **GitHub Actions Linux CI Re-verification Pending Commit/Push:** The complete uncommitted changes on top of `65e7add` (sibling PG17 suite teardown hardening + Phase 3 background-drain fixes + compiled `dist/` + tests + docs) have passed local PostgreSQL `17.12` verification, **not yet GitHub Linux CI**. Do **not** mark `RESTART-03` complete or GitHub CI as `PASS` until these changes are committed, pushed, and verified by a passing `RESTART-03 PostgreSQL 17 Repository Verification` workflow run on the exact new commit SHA.
2. **Gitleaks Security Remediation (Separate Workstream — `DF-003` / `RESTART-12`):** `Secret Scanning (Gitleaks)` run `46047724612` (`3821676`) reported **54 findings**, and run `46053066876` (`65e7add`) also failed. Remains open as a separate security remediation workstream; no secret values were printed and `.temp/` / Git history were untouched.
3. **Minor Non-Blocking Observation on Sibling Test Probe Helpers:** `restart03-real-postgres.test.js`, `restart032-real-postgres.test.js`, and `restart033-real-postgres-repositories.test.js` retain `.catch(() => {})` in `canConnectRealPostgres` `probe.end()` (and `restart033` line 158 retains `ROLLBACK.catch(() => {})`), and do not run an explicit `SELECT 1 FROM pg_database` post-drop assertion inside the test itself (though all three wait for `pg_stat_activity` `0`, drop without `FORCE`, assert `poolErrors === []`, and left `0` leftover databases in post-gate `pg_database` verification).
