# DFARM — RESTART-09 CI Unblock & PostgreSQL 17 Verification Report

**Classification:** **`PASS`** *(verified locally on PostgreSQL `17.12` and confirmed in GitHub Actions Run **`46115119745`** (`SUCCESS`, PostgreSQL `17.12`, zero failures & zero skips) on `36a4a5092be3a4458d74ce2255d7f1bbca9181f5`; `DF-021` is marked **`FIXED / VERIFIED`** in the Master Issue Register)*

---

## 1. Root Cause

### 1.1 Confirmed GitHub Actions Prerequisite Failure (Run `46112338739`)
- **Failed Step:** `Run database catalog & static migration gates` (`npm run db:validate && npm run db:test`)
- **Root Error:** `Could not find packages/database/tests/**/*.test.js`
- **Cause:** [`packages/database/package.json`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/packages/database/package.json) defined `"test": "node --test tests/**/*.test.js"`, whereas all four test files sit directly inside `packages/database/tests/` (zero subdirectories). On the Linux runner (`ubuntu-latest`) under Node.js 20, `tests/**/*.test.js` did not resolve files at depth zero, causing `node --test` to fail before any PostgreSQL 17 bootstrap or RESTART-09 tests ran. Run `46112338739` therefore did **not** verify the outbox implementation.

### 1.2 Workflow Engine & Fail-Closed Env Mismatches
- **Node 20 vs. Node 22:** Root [`package.json`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/package.json#L70-L73) requires `"node": ">=22.0.0"` and `"npm": ">=10.0.0"`, while [`.github/workflows/dfarm-restart09-postgres17.yml`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/.github/workflows/dfarm-restart09-postgres17.yml) configured `node-version: "20"`.
- **Missing Disposable Cluster Opt-In & Env Alignment:** The workflow omitted `DFARM_ALLOW_DISPOSABLE_PG17_MUTATIONS: "1"` (required by [`scripts/pg17-safety-guard.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/scripts/pg17-safety-guard.js#L33-L37) for both `ci-pg17-bootstrap.js` and `ci-run-restart09-pg17.js`), omitted `DATABASE_TLS_MODE: disable` and `TENANT_POOL_CONNECTION_TIMEOUT_MS: "5000"`, and set `TENANT_CREDENTIAL_ENCRYPTION_KEY` instead of `TENANT_DB_ENCRYPTION_KEY` (used by [`CredentialEncryption.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/security/CredentialEncryption.ts#L17)).

### 1.3 Further Defects Exposed by Real PostgreSQL `17.12` Execution
Executing the dedicated suite against real disposable PostgreSQL `17.12` exposed defects inside [`services/backend/tests/restart09-tenant-realtime-outbox.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart09-tenant-realtime-outbox.test.js) and [`scripts/ci-run-restart09-pg17.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/scripts/ci-run-restart09-pg17.js):
1. **PostgreSQL SQLSTATE `42703` (`kiosk_shift_sessions.opening_operator_name`):** Test fixture `INSERT INTO kiosk_shift_sessions` referenced nonexistent column `opening_operator_name` (absent from [`027_kiosk_shift_sessions_and_sface128_seed.sql`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/supabase/migrations/027_kiosk_shift_sessions_and_sface128_seed.sql)).
2. **SSE Fake Response Property Mismatch:** `createFakeSseRes()` returned `{ res, chunks }`, while Tests A/B/E, C, and D read `.frames`, which was `undefined`.
3. **Teardown & Async Replay Determinism:** The test lacked `createPoolShutdownManager().closePoolCleanly()` and `attachPoolErrorGuard()` across `db.pool` and tenant pools, used `DROP DATABASE ... WITH (FORCE)` and silent `.catch(() => {})` on `closeAllPools()`, slept a fixed `150ms` for async DB replay instead of awaiting `publisher.getInFlightBackgroundWorkCount() === 0`, and did not explicitly advance `orgA`'s `+30m` cursor before checking `orgB`'s `-5s` event in Test D or assert `PUBLISHED` status after Test H recovery.
4. **Gate Runner Script (`ci-run-restart09-pg17.js`):** Did not pass `TEST_REAL_POSTGRES: '1'` or `DFARM_ALLOW_DISPOSABLE_PG17_MUTATIONS`, used a `usedPgMemFallback` guard negated by `!output.includes('PostgreSQL 17 Real-Database')` (which matched the suite title itself), and did not require `pass === tests` and `cancelled === 0`.

*(The RESTART-09 implementation in [`RealtimeEventPublisher.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/realtime/RealtimeEventPublisher.ts), [`TenantDatabaseManager.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/database/TenantDatabaseManager.ts), and [`PostgresCollectionTransactionRepository.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/repositories/PostgresCollectionTransactionRepository.ts) passed all real PG `17.12` scenarios with zero changes required.)*

---

## 2. Exact Files Changed

| File | Change Summary |
| :--- | :--- |
| [`packages/database/package.json`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/packages/database/package.json#L11) | Replaced `"node --test tests/**/*.test.js"` with explicit portable 4-file invocation: `tests/database-runtime.test.js tests/migration-catalog.test.js tests/real-postgres-verification.test.js tests/schema-validation.test.js`. |
| [`.github/workflows/dfarm-restart09-postgres17.yml`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/.github/workflows/dfarm-restart09-postgres17.yml) | Updated to Node.js 22 (`node-version: "22"`), added explicit Node `>=22` & npm `>=10` version checks, added `permissions: contents: read`, added `DFARM_ALLOW_DISPOSABLE_PG17_MUTATIONS: "1"`, `DATABASE_TLS_MODE: disable`, `TENANT_POOL_CONNECTION_TIMEOUT_MS: "5000"`, and corrected `TENANT_DB_ENCRYPTION_KEY`. |
| [`scripts/ci-run-restart09-pg17.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/scripts/ci-run-restart09-pg17.js) | Passed `TEST_REAL_POSTGRES: '1'` and `DFARM_ALLOW_DISPOSABLE_PG17_MUTATIONS`, captured and displayed PG server version (`serverVersion`, `serverVersionNum`), tightened TAP checks (`pass === tests`, `cancelled === 0`, full TAP summary, strict TAP `# SKIP` matching), and fixed `usedPgMemFallback` detection. |
| [`services/backend/tests/restart09-tenant-realtime-outbox.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart09-tenant-realtime-outbox.test.js) | Fixed `createFakeSseRes()` (`frames`), removed nonexistent `opening_operator_name` from `kiosk_shift_sessions` seed, set isolated control-plane env vars before dynamic imports, added `waitForPublisherIdle()`, tightened Test D cursor-skew ordering and Test H recovery assertion, and applied `createPoolShutdownManager()` + `attachPoolErrorGuard()` + `waitForDbIdle()` + `DROP DATABASE IF EXISTS ...;` (no `WITH (FORCE)`). |
| [`DFARM_RESTART_09_REALTIME_OUTBOX_TENANT_ISOLATION_REPORT.md`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_09_REALTIME_OUTBOX_TENANT_ISOLATION_REPORT.md) | Recorded remote HEAD `f461928`, failed run `46112338739`, root causes, PG `17.12` verification counts, and pending remote CI status. |
| [`DFARM_RESTART_01_MASTER_ISSUE_REGISTER.md`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_01_MASTER_ISSUE_REGISTER.md) | Updated `DF-021` and `RESTART-09` entries with `f461928`, Run `46112338739`, test discovery/Node 22 root causes, local PG `17.12` pass metrics, and kept `DF-021` as `OPEN / PARTIAL` pending remote CI run. |
| [`DFARM_RESTART_09_CI_UNBLOCK_AND_PG17_VERIFICATION_REPORT.md`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_09_CI_UNBLOCK_AND_PG17_VERIFICATION_REPORT.md) | Created this verification report. |

---

## 3. Node.js & npm Versions Used

- **Local Verification Runtime:** Node.js `v22.20.0`, npm `10.9.3` (satisfies root `package.json` `"engines": { "node": ">=22.0.0", "npm": ">=10.0.0" }`).
- **Workflow Configuration:** `actions/setup-node@v4` with `node-version: "22"` and an explicit verification step failing if Node major `< 22` or npm major `< 10`.

---

## 4. Test Discovery Verification

`npm run db:test` (`npm run --workspace=packages/database test`) invokes:

```text
node --test tests/database-runtime.test.js tests/migration-catalog.test.js tests/real-postgres-verification.test.js tests/schema-validation.test.js
```

All four test files in `packages/database/tests/` are discovered and executed deterministically without shell glob expansion.

---

## 5. Database & Prerequisite Test Results (Post-`npm ci`, Final Edits)

| Step / Command | Scope | Tests | Pass | Fail | Skip | Exit | Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `npm ci` | Clean monorepo dependency install (`1,385` added, `1,404` audited) | — | — | — | — | `0` | **PASS** |
| `npm run build:backend` | `@dfarm/shared-types`, `@dfarm/shared-validation`, `@dfarm/database`, `@dfarm/backend` | — | — | — | — | `0` | **PASS** |
| `npm run db:validate` | `schema-validation.test.js` (`13/13`) + `migration-catalog.test.js` (`12/12`) | `25` (`2` suites) | `25` | `0` | `0` | `0` | **PASS** |
| `npm run db:test` *(default CI env)* | `database-runtime` (`9/9`), `migration-catalog` (`12/12`), `real-postgres-verification` (`# SKIP`), `schema-validation` (`13/13`) | `34` (`4` suites) | `34` | `0` | `0` (`1` suite `# SKIP`) | `0` | **PASS** |
| `npm run db:test` *(`TEST_REAL_POSTGRES=1`, migrated PG `17.12` DB `dfarm_pkgdb_verify`)* | All 4 files including all `20/20` real PG RLS/constraint/ledger tests in `real-postgres-verification.test.js` | `54` (`4` suites) | `54` | `0` | `0` | `0` | **PASS** |
| `node scripts/ci-pg17-bootstrap.js` | Disposable PG `17.12` role & `auth.uid()` bootstrap (`anon`, `authenticated`, `postgres`, `service_role`) + DB create/drop probe | — | — | — | — | `0` | **PASS** |
| `node --test services/backend/tests/restart09-outbox-isolation-unit.test.js` | Offline RESTART-09 unit/pg-mem suite (`1` suite + `7` subtests) | `8` | `8` | `0` | `0` | `0` | **PASS** |
| `node scripts/ci-run-offline-lifecycle-suite.js` | `restart037-pool-lifecycle.test.js` (`21` subtests incl. `RealtimeEventPublisher.destroy()` drain) | `22` | `22` | `0` | `0` | `0` | **PASS** |

---

## 6. Real PostgreSQL Version

- **PostgreSQL Server Version:** `PostgreSQL 17.12 on x86_64-windows, compiled by msvc-19.44.35229, 64-bit`
- **`server_version`:** `17.12`
- **`server_version_num`:** `170012`
- **Cluster Target:** Isolated disposable local cluster on `127.0.0.1:5432` (`dfarm_central`, user `postgres`), cleanly shut down via `pg_ctl stop -m fast` and removed from scratch storage after verification.

---

## 7. Dedicated RESTART-09 Real PostgreSQL 17 Test Results

Executed via `node scripts/ci-run-restart09-pg17.js` against PostgreSQL `17.12` (`server_version_num=170012`):

- **TAP Summary:** `# tests 5`, `# pass 5`, `# fail 0`, `# cancelled 0`, `# skipped 0`, `Exit Code: 0`
- **Subtests Verified on Real PostgreSQL `17.12`:**
  1. **Test A & B & E:** Atomic milk collection intake (`PostgresCollectionTransactionRepository.saveAtomicIntake`) writes `PENDING` outbox row inside Tenant A DB; `processOutboxBatchDetailed()` processes Tenant A and Tenant B cleanly to `PUBLISHED` and delivers SSE frames while isolating unreachable `orgDown` (`3D000`) in summary failures with `0` control-plane `dashboard_events_outbox` queries.
  2. **Test C:** Durable `Last-Event-ID` DB replay tie-breaks identical `created_at` timestamps via `(created_at, id)`, filters by `centerId`, redacts PII (`mobileNumber`), and returns `RESYNC_REQUIRED` on cross-tenant cursor probes (`EVT-B-PG-1`).
  3. **Test D:** Concurrent multi-instance workers use `SELECT ... FOR UPDATE SKIP LOCKED` inside active transactions (skipping row locked by independent PG `17.12` session, then racing 2 workers for the unlocked row with `race1 + race2 === 1`), and per-tenant cross-instance sync cursors prevent `orgA`'s `+30m` `published_at` from skipping `orgB`'s `-5s` event.
  4. **Test F, G, H & RLS:** Conflict-safe `persistOutboxEvent()` preserves original `event_type` and payload while rejecting `PLATFORM_FEDERATION_DAIRY_ID`; simulated `dispatchToClients` crash rolls back transaction leaving `EVT-A-CRASH-PG` as `PENDING` until next successful retry (`PUBLISHED`); `purgeOldOutboxEventsDetailed(7, 500)` deletes expired `PUBLISHED` rows while preserving `FAILED` and `PENDING` rows and surfacing `orgDown` failure; non-superuser `NOBYPASSRLS` role (`restart09_rls_user`) enforces `rls_dashboard_events_outbox_isolation` (`42501` on wrong org insert, `0` rows on wrong org select) and verifies transaction-local `app.current_organization_id` resets to `null` upon `COMMIT` across pooled connections.
- **Fail-Closed Verification (No PG17 Available):**
  - `node scripts/ci-run-restart09-pg17.js` with `TEST_POSTGRES_URL=""` -> **`exit 1`** (`FATAL: TEST_POSTGRES_URL is not set`).
  - `node --test services/backend/tests/restart09-tenant-realtime-outbox.test.js` with `REQUIRE_REAL_POSTGRES=1` and `TEST_POSTGRES_URL=""` -> **`exit 1`** (`# tests 1`, `# pass 0`, `# fail 1`, `# skipped 0`).

---

## 8. Zero-Skip Confirmation

- Dedicated PG17 gate (`node scripts/ci-run-restart09-pg17.js`): **`5/5` passed, `0` failed, `0` skipped, `0` cancelled, `0` `pg-mem` fallback**.
- Real PostgreSQL database verification (`TEST_REAL_POSTGRES=1 npm run db:test` on migrated PG `17.12` DB): **`54/54` passed across all `4` suites, `0` failed, `0` skipped**.
- RESTART-09 unit suite (`restart09-outbox-isolation-unit.test.js`): **`8/8` passed, `0` failed, `0` skipped**.
- Offline lifecycle suite (`restart037-pool-lifecycle.test.js`): **`22/22` passed, `0` failed, `0` skipped**.

---

## 9. Git Branch and HEAD

- **Repository:** `Swiftify0099/DFarm`
- **Branch:** `fix/cloudflare-pages-production-deploy`
- **Verified Remote HEAD:** `36a4a5092be3a4458d74ce2255d7f1bbca9181f5`
- **Prior Failed CI Run (`f461928`):** `46112338739`
- **Verified Passing CI Run (`36a4a50`):** `46115119745` (**`SUCCESS`**, PostgreSQL `17.12`, zero failures and zero skips)

---

## 10. Closure Status

1. **GitHub Actions Linux PG 17 Gate Verified (`46115119745`):** After committing and pushing the RESTART-09 CI unblock onto `36a4a5092be3a4458d74ce2255d7f1bbca9181f5`, [`.github/workflows/dfarm-restart09-postgres17.yml`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/.github/workflows/dfarm-restart09-postgres17.yml) passed cleanly on GitHub Actions (`SUCCESS`, PostgreSQL `17.12`, zero failures and zero skips). `DF-021` is reconciled to **`FIXED / VERIFIED`** in [`DFARM_RESTART_01_MASTER_ISSUE_REGISTER.md`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_01_MASTER_ISSUE_REGISTER.md).
2. **`DF-003` Preserved Separately:** `DF-003` (Gitleaks historical findings) and `RESTART-06` remained outside `RESTART-09` scope (`RESTART-10` is tracked in its own dedicated verification report).
