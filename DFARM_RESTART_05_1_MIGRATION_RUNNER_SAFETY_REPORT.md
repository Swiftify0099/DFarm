# DFARM — RESTART-05.1 / 05.1.1 Migration Runner Fail-Closed Safety, Auth Integrity & PostgreSQL 17 Verification Report (`DF-020`)

**Repository:** `Swiftify0099/DFarm`  
**Branch:** `fix/cloudflare-pages-production-deploy`  
**Parent Task:** `RESTART-05` / `DF-020` (`P0`)  
**Task:** `RESTART-05.1` -> `RESTART-05.1.1`  
**Date:** `2026-11-28`  
**Final Classification:** **`PASS — ALL LOCAL FIXES VERIFIED, READY FOR PG17 CI`** *(CI gate not yet re-executed after local `RESTART-05.1.1` fixes; `RESTART-05.1` is NOT marked CI-PASS until disposable PG17 CI succeeds)*

---

## 1. Current Baseline Local and Remote SHA

- **Previous Public HEAD (`RESTART-05`):** `b2f063a399eebf7493dc3ff123203539154d8e71` (`feat: add RESTART-05 PostgreSQL 17 migration reconciliation and CI verification pipeline`)
- **Current Public HEAD (`origin/fix/cloudflare-pages-production-deploy` / `RESTART-05.1`):** `4ca6082f3b3330fede921a3b18d19b4ad93a18c5` (`feat: add RESTART-05.1 PostgreSQL 17 migration safety, auth uid integrity, and CI pipeline`)
- **Local `HEAD`:** `4ca6082f3b3330fede921a3b18d19b4ad93a18c5`
- **Alignment Check:** Local `HEAD` matched remote `origin/fix/cloudflare-pages-production-deploy` (`4ca6082f3b3330fede921a3b18d19b4ad93a18c5`) 1:1 prior to starting `RESTART-05.1.1` edits; zero reset, clean, stash, rebase, commit, or push operations were performed.

## 2. Exact Branch and Worktree State

- **Checked-out Branch:** `fix/cloudflare-pages-production-deploy`
- **Pre-edit Worktree:** Clean (`nothing to commit, working tree clean`) at `4ca6082f3b3330fede921a3b18d19b4ad93a18c5`
- **Post-edit Worktree (`RESTART-05.1.1`):** Uncommitted local fixes in [`services/backend/tests/restart05-migration-reconciliation.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart05-migration-reconciliation.test.js), [`services/backend/tests/restart051-migration-safety.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart051-migration-safety.test.js), [`services/backend/tests/restart05-real-postgres-migrations.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart05-real-postgres-migrations.test.js), [`scripts/ci-run-restart05-pg17.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/scripts/ci-run-restart05-pg17.js), and `RESTART-01` / `RESTART-05` / `RESTART-05.1` documentation. `services/backend/src/config/env.ts`, `packages/database/src/runner.ts`, `supabase/migrations/*.sql`, and `.github/workflows/` remain unmodified, and `.env` / production credentials were never accessed.

## 3. Latest RESTART-05 GitHub Actions Findings

| Workflow | Run ID | Job ID | Checkout SHA (`head_sha`) | PostgreSQL Version | Status / Conclusion | Notes |
| :--- | :---: | :---: | :--- | :---: | :--- | :--- |
| [RESTART-05 PostgreSQL 17 Migration Reconciliation Gate](https://github.com/Swiftify0099/DFarm/actions/runs/46092960805) (`.github/workflows/dfarm-restart05-postgres17.yml`) | `46092960805` | `140817845187` | `4ca6082f3b3330fede921a3b18d19b4ad93a18c5` | `17.12` (confirmed) | `completed` / **`failure`** | Steps 1–8 passed. **Step 9** failed with **`7 passed, 5 failed, 0 skipped`**: offline suites failed env validation (`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`), Subtest 6 failed rollback `AggregateError` assertion (`Error: Primary tracking insert failure`), and Subtest 7 failed pool removal assertion (`Expected: 1, Actual: 0`). Subtests 1–5, 8, and 9 passed on PG `17.12`. |
| [RESTART-05 PostgreSQL 17 Migration Reconciliation Gate](https://github.com/Swiftify0099/DFarm/actions/runs/46063207947) (`.github/workflows/dfarm-restart05-postgres17.yml`) | `46063207947` | `140722192765` | `b2f063a399eebf7493dc3ff123203539154d8e71` | `17-alpine` | `completed` / **`failure`** | Steps 1–8 passed; Step 9 failed due to static import ordering in `restart05-real-postgres-migrations.test.js` (fixed in `4ca6082`). |

### Root Causes and Fixes for Run `46092960805` (`RESTART-05.1.1`)

1. **Failure A — Offline Suites Environment Validation (`restart05-migration-reconciliation.test.js`, `restart051-migration-safety.test.js`):**
   - **Root Cause:** Both offline test suites set `process.env.SUPABASE_URL = 'http://127.0.0.1:59998'` before importing backend modules, which bypassed the `if (!process.env['SUPABASE_URL'] && ...)` fallback in [`services/backend/src/config/env.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/config/env.ts#L332-L336). Without a `.env` file on CI runners, `loadEnv()` failed Zod validation (`[SUPABASE_ANON_KEY]: Invalid input, expected string, received undefined`, `[SUPABASE_SERVICE_ROLE_KEY]: Invalid input, expected string, received undefined`), producing `0/1` failures in both offline suites.
   - **Fix:** Provided explicitly synthetic, non-secret, test-only `SUPABASE_ANON_KEY` (`placeholder_supabase_anon_key_for_test`) and `SUPABASE_SERVICE_ROLE_KEY` (`placeholder_supabase_service_role_key_for_test`) before dynamic imports in both offline suites (and aligned [`restart05-real-postgres-migrations.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart05-real-postgres-migrations.test.js) so `.env` is never read), deleted `TEST_POSTGRES_URL`, set `REQUIRE_REAL_POSTGRES = '1'` in `restart05-migration-reconciliation.test.js` to avoid `pg-mem` fallback, and isolated `spawnSync` child environments (`cleanChildEnv`) in both offline suites. Production validation in `env.ts` was not weakened.

2. **Failure B — Real PG17 Subtest 6 Rollback `AggregateError` Failure (`restart05-real-postgres-migrations.test.js`):**
   - **Root Cause:** `failRbWrapper` (and `failTrackWrapper`) in Subtest 6 intercepted `String(sql).trim().startsWith('INSERT INTO schema_migrations (version, name, checksum')`. That prefix matched `ensureMigrationTrackingTables()`'s historical sync query (`INSERT INTO schema_migrations ... SELECT ... FROM supabase_migrations.schema_migrations`) before `BEGIN;` or migration `031` started, causing `ensureMigrationTrackingTables()` to throw `Error: Primary tracking insert failure` outside any transaction (because the error lacked a PG code in `EXPECTED_SUPABASE_AUX_PG_CODES`). Consequently `executeSingleMigrationAtomically()` and `ROLLBACK;` were never reached.
   - **Fix:** Replaced the Subtest 6 wrappers with `createFaultInjectingSessionClient()` carrying explicit PostgreSQL capability metadata (`__migrationCapabilities: { mode: 'postgres', ... }`) and matching only per-migration tracking inserts (`INSERT INTO schema_migrations (version, name, checksum ... VALUES (...)`). Subtests 6E and 6F now verify `BEGIN;`, uncommitted `dairy_database_mappings` DDL visibility inside the transaction on the exact same `pg_backend_pid()`, tracking insert failure triggering real `ROLLBACK;`, preservation of both errors via `AggregateError` (`errors.length === 2`), and zero committed `031` table or tracking rows.

3. **Failure C — Real PG17 Subtest 7 Pool Removal Assertion (`restart05-real-postgres-migrations.test.js`):**
   - **Root Cause:** In `node-postgres` (`pg-pool`), calling `acquiredPoolClient.release(unlockError)` synchronously removes the client from `pool._clients` (`totalCount` drops to `0`, `idleCount === 0`) and invokes `client.end(() => pool.emit('remove', client))`, which emits `'remove'` **asynchronously** once the PostgreSQL socket closes. Subtest 7e asserted `assert.equal(removedCount, 1)` synchronously immediately after `assert.rejects(...)` resolved, observing `0` before `client.end()` finished.
   - **Fix:** Added explicit `__migrationCapabilities` on `unlockFailPoolWrapper` and its checked-out client, verified synchronous `totalCount === 0` / `idleCount === 0` / `waitingCount === 0` and the `'release'` event carrying `unlockError`, awaited the asynchronous `'remove'` event (`removedClients.length === 1` matching `checkedOutRealClient`), waited for backend process termination in `pg_stat_activity`, and verified a subsequent `unlockPool.connect()` receives a fresh healthy session (`healthyPid !== failedBackendPid`) able to acquire `pg_try_advisory_lock(cpLockKey)` cleanly with zero leaked connections.

4. **CI Gate Runner Hardening (`scripts/ci-run-restart05-pg17.js`):**
   - Verified all 3 required suites remain mandatory, `pg-mem` fallback detection and mandatory PG 17.x `assertDisposablePg17Cluster()` validation remain intact, missing TAP summaries fail closed (`hasTapSummary`), cancelled/suite/nested `not ok` lines fail closed (`hasSuiteOrNestedNotOk`, `pass === tests`), and suite-level `# SKIP` directives fail closed even if Node 20 reports `# skipped 0`.

### Code-Verified Root Cause of Run `46063207947` Step 9 Failure

In `b2f063a`, [`services/backend/tests/restart05-real-postgres-migrations.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart05-real-postgres-migrations.test.js) statically imported `MigrationRunner.js` at top-level before Test 5 configured `process.env['CENTRAL_DATABASE_URL'] = ctrlUrl`. Importing `MigrationRunner.js` eagerly imported `logger` → `config/env.ts` → `loadEnv()`, caching `DATABASE_URL = postgresql://postgres:postgres@127.0.0.1:54322/postgres` (non-existent in CI) instead of `ctrlUrl` on `55432`, causing `DeviceChallengeService` in Test 5 to fall back to in-memory storage instead of persisting in `device_auth_challenges`. `RESTART-05.1` fixed this by setting `CENTRAL_DATABASE_URL`, `DATABASE_URL`, and `DATABASE_PROVISIONER_URL` to `ctrlUrl` before dynamically importing backend modules (`MigrationRunner.js`, `migrate.js`, `PostgresPool.js`, `DeviceChallengeService.js`).

## 4. Transaction Fail-Open Root Cause and Fix

- **Root Cause (`b2f063a`):** [`MigrationRunner.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/database/MigrationRunner.ts) caught errors from `BEGIN;` (`txStarted = false`) and continued running migration SQL non-transactionally, and suppressed `ROLLBACK;` errors via `.catch(() => {})`.
- **Fix ([`packages/database/src/runner.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/packages/database/src/runner.ts)):**
  - `resolveMigrationClientCapabilities()` enforces full PostgreSQL guarantees (`mode: 'postgres'`, `supportsTransactions: true`, `supportsAdvisoryLocks: true`, `supportsSavepoints: true`, `supportsSupabaseMigrationsSync: true`) unconditionally when `NODE_ENV !== 'test'`, and relaxes capabilities only when explicit test double metadata (`__isPgMem`, `__isMockClient`, or `options.clientCapabilities`) is supplied in `NODE_ENV === 'test'`.
  - `executeSingleMigrationAtomically()` executes `await execClient.query('BEGIN;');` fail-closed outside the inner try/catch — a failed `BEGIN;` aborts immediately before any migration SQL or tracking write runs.
  - Migration SQL, `schema_migrations` insert (`ON CONFLICT (version) DO NOTHING`), and `SAVEPOINT dfarm_supabase_hist_sync` auxiliary sync execute atomically before `COMMIT;`.
  - On primary error, `await execClient.query('ROLLBACK;');` runs inside its own `try/catch`; if rollback fails, both errors are preserved via `new AggregateError([primary, rollback], ...)`.
  - Auxiliary `supabase_migrations` savepoint errors are only tolerated for expected PG missing-schema/table/privilege codes (`42P01`, `3F000`, `42501`); unexpected errors roll back to the savepoint and rethrow.

## 5. Advisory Lock Fail-Open Root Cause and Fix

- **Root Cause (`b2f063a`):** Advisory lock acquisition failures were caught and ignored (`lockAcquired = false`), allowing real PostgreSQL runners to execute concurrently without locking; unlock errors could return a potentially locked `PoolClient` to a pool; and [`TenantDatabaseManager.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/database/TenantDatabaseManager.ts) wrapped `tenantPool` with `wrapPgPool()` before calling `MigrationRunner.runTenantMigrations()`.
- **Fix ([`packages/database/src/runner.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/packages/database/src/runner.ts), [`TenantDatabaseManager.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/database/TenantDatabaseManager.ts)):**
  - `executeMigrationTrackCore()` requires a physical `pg.Pool`, `pg.PoolClient`, or `pg.Client` when `mode === 'postgres'`, refusing non-session-affine wrappers (`typeof clientOrPool.withTransaction === 'function'`) before running DDL.
  - Checks out one dedicated `acquiredPoolClient = await clientOrPool.connect()` for pools so lock acquisition, tracking checks, per-migration transactions, and unlock execute on the exact same PostgreSQL backend session.
  - Deterministic independent 64-bit advisory lock keys via `computeMigrationLockKey('dfarm_migration_lock:' + trackName)` (SHA-256 `readBigInt64BE(0)`): distinct across `control_plane` and `tenant_<dairyId>`.
  - Supports optional `lockTimeoutMs` (`SET lock_timeout = '<ms>ms';` + `RESET lock_timeout;` after unlock), executes `SELECT pg_advisory_lock($1::bigint);` fail-closed (no broad catch; rejects both thrown errors and `false` return rows) before `schema_migrations` DDL or SQL runs.
  - In `finally`, runs `SELECT pg_advisory_unlock($1::bigint);`; if unlock throws or returns `false`, logs an error, calls `acquiredPoolClient.release(unlockError)` to destroy/discard the pooled connection rather than returning it idle, and preserves both `primaryError`, `unlockError`, and `releaseError` via `combineErrors()` (`AggregateError`).
  - `TenantDatabaseManager.ts` now passes `tenantPoolRef` (physical `pg.Pool`) directly to `MigrationRunner.runTenantMigrations(tenantPoolRef, dairyId)`.

## 6. `auth.uid()` Security Issue and Correction

- **Security Issue (`b2f063a`):** Both `MigrationRunner.ensureSchemaMigrationsTable()` and `scripts/migrate.js` executed `CREATE SCHEMA IF NOT EXISTS auth; CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$ BEGIN RETURN NULL; END; $$ ...`, risking replacement of Supabase GoTrue's native `auth.uid()` on live databases inside a broad catch block.
- **Correction:**
  - Removed all `auth` schema creation and `CREATE OR REPLACE FUNCTION auth.uid()` statements from both [`packages/database/src/runner.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/packages/database/src/runner.ts) (`ensureMigrationTrackingTables`) and [`scripts/migrate.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/scripts/migrate.js).
  - Extracted test-only helper creation to [`scripts/pg17-test-auth-bootstrap.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/scripts/pg17-test-auth-bootstrap.js) (`ensureDisposableTestAuthUid` and `bootstrapDisposableTestAuthOnUrl`), strictly guarded by `NODE_ENV === 'test'`, `DFARM_ALLOW_DISPOSABLE_PG17_MUTATIONS === '1'`, permitted local/CI hosts (`PERMITTED_DISPOSABLE_PG17_HOSTS`), no cloud/TLS endpoints, and PG `17.x` server version verification.
  - `ensureDisposableTestAuthUid()` inspects `pg_proc` / `pg_namespace` first and uses `CREATE FUNCTION auth.uid()` (never `CREATE OR REPLACE`) strictly when `auth.uid()` is absent, decoding `request.jwt.claims ->> 'sub'` when present.
  - Updated [`scripts/ci-pg17-bootstrap.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/scripts/ci-pg17-bootstrap.js) to invoke `bootstrapDisposableTestAuthOnUrl()` for disposable `template1` and `dfarm_central`, and replaced `DROP DATABASE ... WITH (FORCE)` with `waitForDbIdle()` + `DROP DATABASE IF EXISTS ...;`.
  - Verified [`supabase/migrations/001_extensions_and_common.sql`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/supabase/migrations/001_extensions_and_common.sql) remains untouched.

## 7. CLI vs `MigrationRunner` Parity & Strict Track Isolation

- **CLI Parity ([`scripts/migrate.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/scripts/migrate.js)):**
  - `executeCliMigrationPlan()` now delegates directly to shared `executeMigrationTrackCore()` from `@dfarm/database`, providing identical session advisory locking, atomic `BEGIN/COMMIT/ROLLBACK`, `AggregateError` error preservation, checksum mismatch reporting without history overwrite, savepoint `supabase_migrations` sync, and historical quarantine checks.
  - `run()` validates the CLI plan via `resolveCliMigrationPlan()` **before** invoking `loadEnv(plan.track)` or connecting to PostgreSQL.
  - `loadEnv(track)` skips `.env` injection if the explicit track primary variable (`TENANT_DATABASE_URL` or `CENTRAL_DATABASE_URL`) is already set, and never overwrites explicit `process.env` values.
  - `getConnectionCandidates(track, env)`:
    - Removed hardcoded `127.0.0.1:54322` fallback.
    - `--track=tenant`: requires explicit non-placeholder `TENANT_DATABASE_URL`, refuses fallback to `CENTRAL_DATABASE_URL` / `DIRECT_URL` / `DATABASE_URL`, and fails closed if `TENANT_DATABASE_URL` targets the same database identity as any configured central variable.
    - `--track=control-plane`: requires explicit `CENTRAL_DATABASE_URL` or unambiguous `DIRECT_URL` / `DATABASE_URL` (compatible Supabase direct/pooler ref pairs for the same database are permitted, while disagreeing hosts/databases or `dfarm_tenant_*` database names fail closed).
- **Track Isolation ([`packages/database/src/runner.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/packages/database/src/runner.ts), [`MigrationRunner.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/database/MigrationRunner.ts)):**
  - `MigrationRunner.runControlPlaneMigrations()` and `MigrationRunner.runTenantMigrations()` reject `allowCustomTrackForTesting` and execute exact `CONTROL_PLANE_MIGRATIONS` (`control_plane`) and `TENANT_OPERATIONAL_MIGRATIONS` (`tenant_${normalizedDairyId}`).
  - `validateMigrationTrackInputs()` rejects duplicate active versions, duplicate filenames, unknown/modified manifest entries, arbitrary track names, wrong-track entries, and exact track length/order mismatches unless `allowCustomTrackForTesting: true` is explicitly supplied under `NODE_ENV === 'test'` (which still enforces ownership and quarantine exclusion).

## 8. Historical Quarantine Protection

- `checkHistoricalMigrationConflicts()` inspects both `supabase_migrations.schema_migrations` and `schema_migrations` under the acquired advisory lock before applying pending migrations.
- If quarantined [`031_remove_dairy_admin_7507495615.sql`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/supabase/migrations/031_remove_dairy_admin_7507495615.sql) (or any filename mismatch for an active version) is recorded under active version `'031'`, both `MigrationRunner` and `scripts/migrate.js` fail closed with an explicit operator diagnostic (`Migration history conflict:` / `Migration version conflict for v...`) and leave all historical rows untouched.
- Quarantined entries are never included in `MIGRATION_FILES`, `CONTROL_PLANE_MIGRATIONS`, or `TENANT_OPERATIONAL_MIGRATIONS`, and are skipped/rejected before SQL execution even if injected into a test track.

## 9. Changed Source and Generated Files

| File | Kind | Purpose |
| :--- | :---: | :--- |
| [`packages/database/src/catalog.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/packages/database/src/catalog.ts) | Added | Canonical 48-entry manifest (`CONTROL_PLANE=16`, `TENANT_OPERATIONAL=36`, `QUARANTINED=1`), track exports, and filesystem/catalog validators (extracted from `index.ts` to prevent circular imports with `runner.ts`). |
| [`packages/database/src/runner.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/packages/database/src/runner.ts) | Added | Shared fail-closed migration execution engine (`computeMigrationLockKey`, `resolveMigrationClientCapabilities`, `validateMigrationTrackInputs`, `ensureMigrationTrackingTables`, `executeMigrationTrackCore`). |
| [`packages/database/src/index.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/packages/database/src/index.ts) | Modified | Unified re-exports of catalog and shared runner APIs. |
| [`packages/database/dist/*`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/packages/database/dist/runner.js) | Generated | Compiled JS/declaration/map outputs for `catalog`, `runner`, and `index`. |
| [`services/backend/src/infrastructure/database/MigrationRunner.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/database/MigrationRunner.ts) | Modified | Delegates cleanly to `@dfarm/database/runner.ts`; exposes `computeAdvisoryLockKey`; blocks `allowCustomTrackForTesting` on `runControlPlaneMigrations` / `runTenantMigrations`. |
| [`services/backend/src/infrastructure/database/TenantDatabaseManager.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/database/TenantDatabaseManager.ts) | Modified | Passes physical `tenantPoolRef` (`pg.Pool`) rather than `wrapPgPool` to `MigrationRunner.runTenantMigrations()`. |
| [`services/backend/dist/infrastructure/database/*`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/dist/infrastructure/database/MigrationRunner.js) | Generated | Compiled backend outputs for `MigrationRunner` and `TenantDatabaseManager`. |
| [`scripts/migrate.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/scripts/migrate.js) | Modified | Delegates to shared `executeMigrationTrackCore`, removes `auth.uid()` mutation and `127.0.0.1:54322` default, validates CLI plan before `.env`, and enforces fail-closed `getConnectionCandidates()`. |
| [`scripts/pg17-test-auth-bootstrap.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/scripts/pg17-test-auth-bootstrap.js) | Added | Isolated, test-only, non-overwriting `auth.uid()` bootstrap helper for disposable PG17 clusters. |
| [`scripts/ci-pg17-bootstrap.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/scripts/ci-pg17-bootstrap.js) | Modified | Invokes `bootstrapDisposableTestAuthOnUrl()` on `template1` and `dfarm_central`; replaces `WITH (FORCE)` teardown with `waitForDbIdle()`. |
| [`scripts/ci-run-restart05-pg17.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/scripts/ci-run-restart05-pg17.js) | Modified | Registers `restart051-migration-safety.test.js` in `REQUIRED_SUITES`. |
| [`packages/database/tests/migration-catalog.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/packages/database/tests/migration-catalog.test.js) | Modified | Added tests 11–12 covering lock key independence and `validateMigrationTrackInputs()` negative track/injection rejections. |
| [`services/backend/tests/restart05-migration-reconciliation.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart05-migration-reconciliation.test.js) | Modified | Enforces explicit `auth.uid()` non-mutation checks on mock client, isolated env-before-import setup (`127.0.0.1:59999`), and explicit test double options. |
| [`services/backend/tests/restart051-migration-safety.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart051-migration-safety.test.js) | Added | 9 mock/offline tests verifying failed `BEGIN`, SQL/tracking rollback, rollback `AggregateError`, lock failure, unlock failure client destruction (`release(err)`), zero `auth.uid()` replacement, track isolation, CLI parity & URL resolution matrix, and `TenantDatabaseManager` pool handoff. |
| [`services/backend/tests/restart05-real-postgres-migrations.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart05-real-postgres-migrations.test.js) | Modified | Fixed env-before-import ordering bug (Run `46063207947` Step 9 fix) and expanded to 9 real PostgreSQL 17 subtests covering locks, contention, unlock-failure pool eviction, failed `BEGIN`/SQL/tracking/rollback `AggregateError`, `template0`/native `auth.uid()` preservation, RLS check, CLI `--track` subprocess execution, and historical quarantined `031` collision. |
| [`DFARM_RESTART_05_1_MIGRATION_RUNNER_SAFETY_REPORT.md`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_05_1_MIGRATION_RUNNER_SAFETY_REPORT.md), [`DFARM_RESTART_05_MIGRATION_RECONCILIATION_REPORT.md`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_05_MIGRATION_RECONCILIATION_REPORT.md), [`DFARM_RESTART_01_MASTER_ISSUE_REGISTER.md`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_01_MASTER_ISSUE_REGISTER.md) | Added / Modified | Complete `RESTART-05.1` remediation report and synchronized register/report documentation. |

## 10. New and Expanded Regression Tests

- [`packages/database/tests/migration-catalog.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/packages/database/tests/migration-catalog.test.js) (Tests 11–12): Deterministic lock-key independence (`control_plane` vs `tenant_*`) and negative `validateMigrationTrackInputs()` rejections (wrong track, substituted filename, duplicate version, arbitrary track).
- [`services/backend/tests/restart051-migration-safety.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart051-migration-safety.test.js) (9 subtests, mock/offline):
  1. Failed `BEGIN;` aborts with zero migration SQL even in default `postgres` capability mode.
  2. Migration SQL failure and `schema_migrations` insert failure both trigger `ROLLBACK;`.
  3. Simultaneous migration failure and `ROLLBACK;` failure preserve both via `AggregateError`.
  4. Failed `pg_advisory_lock` aborts prior to `schema_migrations` creation or SQL execution.
  5. Unlock failure logs visibly, discards the pooled client via `release(unlockError)`, and preserves primary migration failure.
  6. Static source and runtime mock query assertions confirm neither `MigrationRunner` nor `scripts/migrate.js` creates `auth` schema or `auth.uid()`.
  7. Rejects cross-track, injected, substituted, arbitrary, and `allowCustomTrackForTesting` bypass attempts on production methods.
  8. Verifies `scripts/migrate.js` CLI parity (quarantined `031` collision in `supabase_migrations`, atomic SQL rollback + `AggregateError`, fail-closed `getConnectionCandidates()` matrix for missing/ambiguous/tenant-same-as-central/cross-track targets).
  9. Source guard confirms `TenantDatabaseManager.ts` passes physical `tenantPoolRef` rather than `wrapPgPool` to `MigrationRunner.runTenantMigrations()`.
- [`services/backend/tests/restart05-real-postgres-migrations.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart05-real-postgres-migrations.test.js) (9 real PostgreSQL 17 subtests): Full live PG17 verification of Phases B–H (awaiting CI push).

## 11. Local Test Results (Post-Final-Edit `RESTART-05.1.1` Execution)

All backend test commands below ran under explicit process-local offline variables (`NODE_ENV=test`, `127.0.0.1:59999`, synthetic test keys) with zero connection to external/production databases:

| Command | Exit Code | Total | Passed | Failed | Skipped | Database Mode / Notes |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| `npm run build:backend` | `0` | — | — | — | — | TypeScript build (`@dfarm/shared-types`, `@dfarm/shared-validation`, `@dfarm/database`, `@dfarm/backend`); no DB |
| `npm run db:validate` | `0` | `25` | `25` | `0` | `0` | Static/catalog filesystem validation (`migration-catalog` 12 + `schema-validation` 13); no DB |
| `npm run db:test` (`TEST_REAL_POSTGRES` unset) | `0` | `34` | `34` | `0` | `0` *(+1 suite `# SKIP`)* | `database-runtime` (`9`, `pg-mem`), `migration-catalog` (`12`), `schema-validation` (`13`); `real-postgres-verification.test.js` marked suite `# SKIP` |
| `node --test --test-reporter=tap services/backend/tests/restart05-migration-reconciliation.test.js` | `0` | `10` | `10` | `0` | `0` | Explicit mock clients + isolated `127.0.0.1:59999` + synthetic Supabase test keys + `REQUIRE_REAL_POSTGRES=1` (zero `pg-mem`) + isolated `spawnSync` child envs |
| `node --test --test-reporter=tap services/backend/tests/restart051-migration-safety.test.js` | `0` | `9` | `9` | `0` | `0` | Explicit mock clients + synthetic Supabase test keys + isolated `spawnSync` child envs |
| `node --test --test-reporter=tap services/backend/tests/restart05-real-postgres-migrations.test.js` (`TEST_POSTGRES_URL` & `REQUIRE_REAL_POSTGRES` unset) | `0` | `1` | `0` | `0` | `1` | Clean `# SKIP` (`Real PostgreSQL 17 server unavailable`); zero `pg-mem` fallback |
| `REQUIRE_REAL_POSTGRES=1 node --test --test-reporter=tap services/backend/tests/restart05-real-postgres-migrations.test.js` (`TEST_POSTGRES_URL` unset) | `1` | `1` | `0` | `1` | `0` | Fail-closed assertion when `REQUIRE_REAL_POSTGRES=1` and no PG17 target is reachable |
| `node scripts/ci-run-restart05-pg17.js` (`NODE_ENV`/`DFARM_ALLOW_DISPOSABLE_PG17_MUTATIONS` unset) | `1` | — | — | — | — | Fail-closed disposable cluster safety guard triggered |
| Scratch offline `env.ts` + real `pg-pool` async `'remove'` + `AggregateError` + `parseTapStats()` edge-case check | `0` | `3` | `3` | `0` | `0` | Confirmed `loadEnv()` passes with synthetic offline keys and rejects weak `production` env; confirmed `pg-pool` `'remove'` fires async after `release(err)` while `totalCount === 0`; confirmed `parseTapStats()` fails closed on nested/suite `not ok`, `# SKIP`, and missing TAP summary |

## 12. PostgreSQL 17 CI Evidence

- **Run `46092960805` (Job `140817845187`, HEAD `4ca6082f3b3330fede921a3b18d19b4ad93a18c5`):** Confirmed PostgreSQL `17.12`. Steps 1–8 passed; Step 9 failed (`7 passed, 5 failed, 0 skipped`) on offline suite Supabase env validation, Subtest 6 rollback `AggregateError`, and Subtest 7 pool removal timing.
- **Local PG17 Execution:** Not executed locally (prohibited by policy — real DB mutation tests run only against disposable GitHub Actions PostgreSQL `17.12` service).
- **`RESTART-05.1.1` PG17 CI Status:** **PENDING** — Fixes are verified locally and awaiting operator commit/push to trigger `.github/workflows/dfarm-restart05-postgres17.yml` against disposable `postgres:17-alpine`.

## 13. Security Review Findings & Non-Regression Scope

- **Native `auth.uid()` Preservation:** Confirmed neither [`packages/database/src/runner.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/packages/database/src/runner.ts), [`MigrationRunner.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/database/MigrationRunner.ts), nor [`scripts/migrate.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/scripts/migrate.js) creates or replaces `auth` schema or `auth.uid()`. [`scripts/pg17-test-auth-bootstrap.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/scripts/pg17-test-auth-bootstrap.js) uses `CREATE FUNCTION` (never `CREATE OR REPLACE`) strictly after `pg_proc` absence check under disposable PG17 safety guards.
- **No Production DB Access & No Secret Exposure:** Production `.env` files were never read or loaded into test/build processes; `env.ts` production validation was preserved unmodified; offline suites use explicitly synthetic non-secret `placeholder_*` Supabase keys and isolated child envs.
- **Quarantined SQL & History Safety:** `031_remove_dairy_admin_7507495615.sql` cannot execute automatically; historical collisions fail closed without modifying historical rows or existing checksums.
- **Unmodified Files & Out-of-Scope Tasks:** Historical `supabase/migrations/*.sql`, `.github/workflows/`, `services/backend/src/config/env.ts`, and `RESTART-06` remain untouched.

## 14. Remaining Operator Actions

1. Review uncommitted `RESTART-05.1.1` diff (`git diff`) and commit/push on `fix/cloudflare-pages-production-deploy`.
2. Monitor `.github/workflows/dfarm-restart05-postgres17.yml` on the new commit SHA to confirm live PostgreSQL `17.12` PASS across all 3 required suites (`fail === 0`, `skipped === 0`, zero `pg-mem` fallback).
3. Before running migrations against any pre-existing live central or tenant environment, inspect `schema_migrations` / `supabase_migrations.schema_migrations` for legacy version `031` or misplaced `040` records per [`DFARM_RESTART_05_MIGRATION_RECONCILIATION_REPORT.md`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_05_MIGRATION_RECONCILIATION_REPORT.md).

## 15. Final Closure Classification

**`PASS — ALL LOCAL FIXES VERIFIED, READY FOR PG17 CI`** *(Pending disposable PostgreSQL 17 CI re-execution after operator commit/push)*
