# DFARM RESTART-03.9 — Independent Final Audit & CI Release Readiness

- **Repository:** `Swiftify0099/DFarm`
- **Branch:** `fix/cloudflare-pages-production-deploy`
- **Audit Date:** `2026-11-28`
- **Expected Baseline HEAD (per audit prompt):** `38216761bdac32cf929efc6641f25f73bb9abf23`
- **Actual Local & Origin HEAD Observed:** `65e7addd121ee3baed1eedc8f32f0a4934dab0c2` (`fix: resolve PostgreSQL 17 CI failure in customer-ledger-accounting test suite via robust pool lifecycle management`; parent `38216761bdac32cf929efc6641f25f73bb9abf23`)
- **Final Release Decision:** **`A. READY FOR COMMIT/PUSH`** *(ready to commit and push uncommitted RESTART-03.9 + Phase 3 background-drain hardening on top of `65e7add` so GitHub Actions Linux CI can verify the exact new SHA; **RESTART-03 CI gate remains PENDING until that GitHub workflow run passes**)*

---

## 1. Git Safety Audit & Repository State Discrepancy

1. **Expected vs Actual HEAD:**
   - The audit prompt expected uncommitted RESTART-03.9 changes on top of `38216761bdac32cf929efc6641f25f73bb9abf23`.
   - In fact, both local `HEAD` and `origin/fix/cloudflare-pages-production-deploy` were already at **`65e7addd121ee3baed1eedc8f32f0a4934dab0c2`** (committed `2026-11-28 00:22:28 +0530`), which committed the initial `customer-ledger-accounting.test.js` fix and initial `DFARM_RESTART_03_9_CI_FAILURE_ROOT_CAUSE_AND_FIX_REPORT.md`.
   - Per `DFARM_RESTART_03_9_CI_FAILURE_ROOT_CAUSE_AND_FIX_REPORT.md` / `DFARM_RESTART_03_5_FINAL_CI_MATRIX.md`, GitHub Actions on `65e7add` passed `RESTART-04` (`46053066866`) and failed `Gitleaks` (`46053066876`), while `RESTART-03` (`46053067000` / job `140688893141`) **still failed Step 10** because sibling suites (`restart03`, `restart032`, `restart033`) still used `DROP DATABASE ... WITH (FORCE)` and unguarded/non-drained teardown.
2. **Working Tree Preservation:**
   - All pre-existing local work (including sibling PG17 test teardown hardening and reconciled docs) was preserved.
   - Zero destructive git commands (`reset --hard`, `clean`, `stash`, `push --force`, history rewrite) were executed.
   - `.temp/` preserved intact: **`1,829`** files on disk, **`0`** tracked by Git (`git ls-files .temp`).
   - Zero commits, pushes, or deployments were performed.

---

## 2. Files Reviewed

- [services/backend/tests/customer-ledger-accounting.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/customer-ledger-accounting.test.js)
- [services/backend/tests/helpers/pool-lifecycle-helpers.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/helpers/pool-lifecycle-helpers.js)
- [services/backend/tests/restart037-pool-lifecycle.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart037-pool-lifecycle.test.js)
- [services/backend/tests/restart03-real-postgres.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart03-real-postgres.test.js)
- [services/backend/tests/restart032-real-postgres.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart032-real-postgres.test.js)
- [services/backend/tests/restart033-real-postgres-repositories.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart033-real-postgres-repositories.test.js)
- [services/backend/tests/concurrent-idempotency-financial.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/concurrent-idempotency-financial.test.js)
- [services/backend/src/infrastructure/database/TenantDatabaseManager.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/database/TenantDatabaseManager.ts)
- [services/backend/src/infrastructure/database/PostgresPool.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/database/PostgresPool.ts)
- [services/backend/src/infrastructure/realtime/RealtimeEventPublisher.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/realtime/RealtimeEventPublisher.ts)
- [services/backend/src/infrastructure/security/SseTicketService.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/security/SseTicketService.ts)
- [services/backend/src/infrastructure/security/TokenRevocationService.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/security/TokenRevocationService.ts)
- [services/backend/src/app.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/app.ts) & [services/backend/src/server.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/server.ts)
- [node_modules/pg-pool/index.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/node_modules/pg-pool/index.js) & [node_modules/pg/lib/client.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/node_modules/pg/lib/client.js)
- [scripts/ci-run-pg17-suites.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/scripts/ci-run-pg17-suites.js), [scripts/ci-run-offline-lifecycle-suite.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/scripts/ci-run-offline-lifecycle-suite.js), [scripts/ci-pg17-bootstrap.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/scripts/ci-pg17-bootstrap.js), [scripts/pg17-safety-guard.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/.github/workflows/dfarm-restart03-postgres17.yml)
- [DFARM_RESTART_03_9_CI_FAILURE_ROOT_CAUSE_AND_FIX_REPORT.md](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_03_9_CI_FAILURE_ROOT_CAUSE_AND_FIX_REPORT.md) and reconciled sibling docs

---

## 3. Root-Cause Confirmation

Independently confirmed by reading `pg-pool`, `pg`, `customer-ledger-accounting.test.js`, and prior PG17 logs:

1. **`pg-pool` premature `pool.end()` resolution:** In `node_modules/pg-pool/index.js` (`_pulseQueue`, lines 133–145; `_remove`, lines 172–188), `pool.end()` synchronously removes idle clients from `this._clients` and triggers `client.end(() => context.emit('remove', client))`. Because `_clients.length` becomes `0` immediately, `pool.end()` resolves before `client.end()` finishes `this.connection.end()` and receives `this.connection.once('end', cb)` (`node_modules/pg/lib/client.js` lines 799–836).
2. **`pg` idle error emission while ending:** `pg-pool` does not detach `idleListener` in `_remove(client)`, and `pg/lib/client.js` (`_handleErrorMessage`, lines 426–435) routes backend `ErrorResponse` messages (such as SQLSTATE `57P01` from `DROP DATABASE ... WITH (FORCE)`) through `_handleErrorEvent` → `'error'` when `!this._getActiveQuery()`.
3. **Subtest 20 attribution:** Test 20's intentional `-100.00` deduction rejection destroys the prior client (`client.release(err)`), causing `balanceAfter` to create a fresh `pg.Client` and TCP socket within Test 20's `AsyncLocalStorage` context. Terminating that client during teardown triggered `node:test`'s `"Test '20...' generated asynchronous activity after the test ended: terminating connection due to administrator command"`.
4. **Background timer activity confirmed in prior logs:** Prior PG17 logs contained `ERROR: relation "dashboard_events_outbox" does not exist` during `customer-ledger-accounting.test.js` runs from `RealtimeEventPublisher`'s `1000ms` outbox worker hitting `db`.

---

## 4. Phase 2 Pool Shutdown & Error-Capture Assessment

Verified across `customer-ledger-accounting.test.js` and `pool-lifecycle-helpers.js`:

| Requirement | Status | Verified Mechanism |
|---|---|---|
| 1. All pool error events captured without suppression | **PASS** | `attachPoolErrorGuard` records `{ label, code, message }` into `poolErrors`; `canConnectRealPostgres` records `probeErrors` and fails closed. |
| 2. Error guards attached before idle-client errors possible | **PASS** | Attached on creation for `adminPool`, `poolCtrl`, `poolOrg1`, `poolOrg2`, immediately after `PostgresPool` import (`db.pool`), and immediately after `getStrictTenantDb()` for tenant pools (plus `PostgresPool.ts` / `TenantDatabaseManager.ts` internal `'error'` handlers). |
| 3. All pool errors asserted before process exit | **PASS** | `assert.deepEqual(poolErrors, [], ...)` executes in `cleanup()` after all pools including `adminPool` are closed. |
| 4. `closePoolCleanly()` waits for client removal/socket shutdown | **PASS** | Waits for `totalCount === idleCount && waitingCount === 0`, subscribes to `pool.on('remove', ...)` for `expectedRemovals`, awaits shutdown, and awaits all `'remove'` events before marking `closedPools`. |
| 5. `pool.ended` not the sole proof | **PASS** | Verified via checked-out/waiting check + `'remove'` event drain + `pool.ended === true` + `pg_stat_activity` polling. |
| 6. `pg_stat_activity` excludes observer connection | **PASS** | `WHERE datname = $1 AND pid <> pg_backend_pid()` on `adminPool` (connected to `dfarm_central`). |
| 7. DB deletion only after sessions disappear | **PASS** | `waitForDbIdle(dbName)` polls until `cnt === 0` (throws if `remaining > 0`) before `DROP DATABASE`. |
| 8. Normal `DROP DATABASE` without `WITH (FORCE)` | **PASS** | `DROP DATABASE IF EXISTS ${dbName};` across all 5 RESTART-03 PG17 suites. |
| 9. Primary & cleanup errors preserved via `AggregateError` | **PASS** | `catch/finally` in `customer-ledger-accounting.test.js` (and `controlPlaneAdapter.withTransaction`, `restart03`, `restart032`, `restart033`) wraps `[orig, clean]` in `AggregateError`. |
| 10. No blanket `.catch(() => {})` hiding shutdown failures | **PASS** | Zero `.catch(() => {})` in `customer-ledger-accounting.test.js` (`git grep` verified). |

---

## 5. Phase 3 Background Timer & Async Work Drain Verification

### 5.1 Defect Found in Initial Audit
On `65e7add`, both `RealtimeEventPublisher.destroy()` and `SseTicketService.destroy()` only cleared intervals synchronously (`void`), did **not** guard against post-destroy callbacks/calls, and did **not** wait for already-running async queries (`processOutboxBatch`, `purgeOldOutboxEvents`, `persistOutboxEvent`, `replayMissedEvents`, `ensureRedemptionTable`, `purgeExpiredTickets`). Additionally, `customer-ledger-accounting.test.js` called `.destroy()` without `await`.

### 5.2 Minimal Safe Drain Fix Implemented & Verified
1. **`RealtimeEventPublisher.ts`:**
   - Added `isDestroyed`, `destroyPromise`, and `inFlightBackgroundWork` (`trackBackgroundWork`).
   - Guarded all 3 timer callbacks (`heartbeatInterval`, `outboxWorkerInterval`, `retentionCleanupInterval`) and async entry points (`processOutboxBatch`, `purgeOldOutboxEvents`, `persistOutboxEvent`, `replayMissedEvents`) with `isDestroyed`.
   - Made `destroy(): Promise<void>` idempotent (`destroyPromise`), synchronously clear all 3 intervals + disconnect SSE clients, and await `Promise.allSettled(Array.from(this.inFlightBackgroundWork))` until zero background queries remain active.
2. **`SseTicketService.ts`:**
   - Added `isDestroyed`, `isPurgingTickets`, `destroyPromise`, and `inFlightBackgroundWork` (`trackBackgroundWork`).
   - Tracked both constructor-initiated `ensureRedemptionTable()` and `cleanupInterval`-driven `purgeExpiredTickets()`.
   - Made `destroy(): Promise<void>` idempotent (`destroyPromise`), synchronously clear `cleanupInterval`, and await all in-flight background queries to completion.
3. **`customer-ledger-accounting.test.js`:**
   - Awaits `realtimePublisherRef.destroy()` and `sseTicketServiceRef.destroy()` at Step 1 of `cleanup()`.
4. **`restart037-pool-lifecycle.test.js` (Deterministic Tests `20` & `21`):**
   - Verified with deferred `db.query` barriers that `destroy()` clears intervals synchronously, blocks post-destroy queries, refuses to resolve while an async `processOutboxBatch()` / `ensureRedemptionTable()` / `purgeExpiredTickets()` query is suspended, drains to `getInFlightBackgroundWorkCount() === 0` once the query finishes, and is safe across concurrent and repeated calls.

| Criterion | `realtimePublisher.destroy()` | `sseTicketService.destroy()` |
|---|---|---|
| Clears the interval(s) | **YES** (`heartbeat`, `outboxWorker`, `retentionCleanup`) | **YES** (`cleanupInterval`) |
| Prevents future timer callback / work | **YES** (`clearInterval` + `isDestroyed` guards) | **YES** (`clearInterval` + `isDestroyed` guards) |
| Waits for already-running async callback/query | **YES** (drains `inFlightBackgroundWork`) | **YES** (drains `inFlightBackgroundWork`, incl. constructor `ensureRedemptionTable()`) |
| Leaves no in-flight background work | **YES** (`while (inFlightBackgroundWork.size > 0)`) | **YES** (`while (inFlightBackgroundWork.size > 0)`) |
| Safe to call more than once | **YES** (returns shared `destroyPromise`) | **YES** (returns shared `destroyPromise`) |

*(Note: `TokenRevocationService.ts` only starts `retentionTimer` when `NODE_ENV !== 'test'`.)*

---

## 6. Phase 4 Teardown Sequence Verification (`customer-ledger-accounting.test.js`)

Confirmed exact execution order inside single idempotent `cleanup()` (`finally`):
1. **Stop background producers & await all in-flight background work:** `await runStep(() => realtimePublisherRef.destroy())` and `await runStep(() => sseTicketServiceRef.destroy())` (also disconnects any SSE clients inside `realtimePublisher.destroy()`).
2. **Close application/test services:** `supertest(app)` closes ephemeral request servers per request; no persistent HTTP listener remains open.
3. **Close all tenant pools:** Iterates `knownDairyIds`, closes each via `closePoolCleanly(tenantPool, label, () => tenantDbManagerRef.closeTenantPool(dairyId))`, asserts `ended === true` and manager eviction, then calls `tenantDbManagerRef.closeAllPools()`.
4. **Close central singleton & direct test pools:** Closes `dbRef.pool` via `closePoolCleanly(dbRef.pool, 'globalDbPool', () => dbRef.close())`, then `poolCtrl`, `poolOrg1`, `poolOrg2` via `closePoolCleanly(...)`, asserting `pool.ended === true`.
5. **Wait for sessions to disappear & confirm zero remaining connections:** `waitForDbIdle(dbName)` polls `pg_stat_activity` (`pid <> pg_backend_pid()`) until `0`, throwing if `remaining > 0`.
6. **Drop disposable databases without `FORCE` & verify removal:** Executes `DROP DATABASE IF EXISTS ${dbName};`, then verifies `SELECT 1 FROM pg_database WHERE datname = $1;` returns `0` rows.
7. **Close admin pool & assert zero pool errors:** Closes `adminPool` via `closePoolCleanly`, asserts `adminPool.ended === true`, then asserts `poolErrors` is empty (`[]`).

---

## 7. Independent Test Evidence (Executed After Final Code Edits)

- **Build (`npm run build:backend`):** PASS (`0` TypeScript errors, exit `0`).
- **Migration validation (`npm run db:validate`):** PASS (`13/13` passed, `0` failed, `0` skipped, exit `0`).
- **Offline lifecycle + Phase 3 drain suite (`node scripts/ci-run-offline-lifecycle-suite.js`):** PASS (`22/22` passed, `0` failed, `0` skipped, exit `0`).
- **Clean architecture suite (`npm run --workspace=services/backend test`):** PASS (`9/9` passed, `0` failed, `0` skipped, exit `0`).
- **6x consecutive isolated `customer-ledger-accounting.test.js` runs (local disposable PG `17.12`):** `6/6` runs **PASS** (`25/25` tests, `0` fail, `0` skip, exit `0` per run).
- **All 5 RESTART-03 PG17 suites (`node scripts/ci-run-pg17-suites.js`, local disposable PG `17.12`):** **PASS** (`5/5` suites, `51/51` tests, `0` fail, `0` skip, exit `0`):
  - `restart03-real-postgres.test.js`: `5/5`
  - `restart032-real-postgres.test.js`: `4/4`
  - `restart033-real-postgres-repositories.test.js`: `6/6`
  - `customer-ledger-accounting.test.js`: `25/25`
  - `concurrent-idempotency-financial.test.js`: `11/11`
- **Post-gate PG `17.12` checks:**
  - `pg_stat_activity` (`datname LIKE 'dfarm_%' AND datname <> 'dfarm_central'`): `0 rows`
  - `pg_database` (`datname LIKE 'dfarm_%' AND datname <> 'dfarm_central'`): `0 rows`
  - PG `17.12` server log (`FATAL|terminating connection`): `0` occurrences
- **No-PG17 fail-closed checks (`customer-ledger-accounting.test.js` with `TEST_POSTGRES_URL=""`):**
  - Default (`REQUIRE_REAL_POSTGRES` unset): `tests=1 pass=0 fail=0 skipped=1` (exit `0`)
  - Strict (`REQUIRE_REAL_POSTGRES=1`): `tests=1 pass=0 fail=1 skipped=0` (exit `1`)

---

## 8. Additional Changes Made During Audit

- [services/backend/src/infrastructure/realtime/RealtimeEventPublisher.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/realtime/RealtimeEventPublisher.ts) (+ compiled `services/backend/dist/infrastructure/realtime/RealtimeEventPublisher.{js,js.map,d.ts,d.ts.map}`)
- [services/backend/src/infrastructure/security/SseTicketService.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/security/SseTicketService.ts) (+ compiled `services/backend/dist/infrastructure/security/SseTicketService.{js,js.map,d.ts,d.ts.map}`)
- [services/backend/tests/customer-ledger-accounting.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/customer-ledger-accounting.test.js)
- [services/backend/tests/restart037-pool-lifecycle.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart037-pool-lifecycle.test.js)
- [DFARM_RESTART_03_9_CI_FAILURE_ROOT_CAUSE_AND_FIX_REPORT.md](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_03_9_CI_FAILURE_ROOT_CAUSE_AND_FIX_REPORT.md)
- [DFARM_RESTART_03_9_INDEPENDENT_FINAL_AUDIT.md](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_03_9_INDEPENDENT_FINAL_AUDIT.md)

---

## 9. Remaining Defects / Open Workstreams

1. **Pending GitHub Actions Linux CI Run (Blocker for RESTART-03 Sign-off, Not for Commit/Push):** A fresh GitHub Actions `RESTART-03 PostgreSQL 17 Repository Verification` run on the new exact commit SHA is required after pushing before RESTART-03 can be marked complete.
2. **Gitleaks `DF-003` (Separate Workstream — `RESTART-12`):** `54` findings remain open across Git history (`46047724612` / `46053066876`). Untouched per scope rules.
3. **Minor Non-Blocking Test Hygiene:**
   - `restart03-real-postgres.test.js`, `restart032-real-postgres.test.js`, and `restart033-real-postgres-repositories.test.js` still use `.catch(() => {})` on `probe.end()` in `canConnectRealPostgres` (and `restart033` line 158 uses `ROLLBACK.catch(() => {})`), and do not run an inline `SELECT 1 FROM pg_database` post-drop check (verified externally via `psql`).
   - Earlier reconciled docs (`DFARM_RESTART_01_MASTER_ISSUE_REGISTER.md`, `DFARM_RESTART_03_5_FINAL_CI_MATRIX.md`, `DFARM_RESTART_04_DEVICE_SYNC_SECURITY_REPORT.md`) predate the Phase 3 drain additions and contain 7 trailing-space markdown lines in `git diff --check` (zero trailing-space errors in any code or `DFARM_RESTART_03_9_*` file).

---

## 10. Manual Git Commands for User Review & Execution

Current HEAD and `origin/fix/cloudflare-pages-production-deploy` are both `65e7addd121ee3baed1eedc8f32f0a4934dab0c2`. Review the diff and run manually if approved:

```bash
git status --short --branch
git diff --stat
git add \
  services/backend/src/infrastructure/realtime/RealtimeEventPublisher.ts \
  services/backend/src/infrastructure/security/SseTicketService.ts \
  services/backend/dist/infrastructure/realtime/ \
  services/backend/dist/infrastructure/security/ \
  services/backend/tests/customer-ledger-accounting.test.js \
  services/backend/tests/restart03-real-postgres.test.js \
  services/backend/tests/restart032-real-postgres.test.js \
  services/backend/tests/restart033-real-postgres-repositories.test.js \
  services/backend/tests/restart037-pool-lifecycle.test.js \
  DFARM_RESTART_03_9_CI_FAILURE_ROOT_CAUSE_AND_FIX_REPORT.md \
  DFARM_RESTART_03_9_INDEPENDENT_FINAL_AUDIT.md \
  DFARM_RESTART_01_MASTER_ISSUE_REGISTER.md \
  DFARM_RESTART_03_5_FINAL_CI_MATRIX.md \
  DFARM_RESTART_04_DEVICE_SYNC_SECURITY_REPORT.md
git status --short --branch
git commit -m "fix: harden PG17 sibling teardown and drain background SSE/outbox services on destroy"
git push origin fix/cloudflare-pages-production-deploy
```
