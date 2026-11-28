# DFARM — RESTART-09 Realtime Outbox Tenant Isolation Report (`DF-021`)

**Task:** `RESTART-09`  
**Issue:** `DF-021` (`P0` — Tenant-Scoped Realtime Transactional Outbox & SSE Reliability)  
**Branch:** `fix/cloudflare-pages-production-deploy`  
**Verified Remote HEAD (`origin/fix/cloudflare-pages-production-deploy`):** `36a4a5092be3a4458d74ce2255d7f1bbca9181f5`  
**Prior Failed GitHub Actions Run (`f461928`):** `46112338739` (failed at `Run database catalog & static migration gates` before PG17 execution)  
**Verified Passing GitHub Actions Run (`36a4a50`):** `46115119745` (**`SUCCESS`**, PostgreSQL `17.12`, zero failures & zero skips)  
**PostgreSQL Version Verified:** PostgreSQL `17.12` (`server_version_num=170012`)  
**Classification:** **`PASS (Verified in GitHub Actions PG 17 Run 46115119745; Zero Failures & Zero Skips)`**  

> [!IMPORTANT]
> Failed GitHub Actions run `46112338739` on prior HEAD `f461928e0e72b215eaa6d78c6ff99bbf90a507e1` failed at the prerequisite step `Run database catalog & static migration gates` (`Could not find packages/database/tests/**/*.test.js`) while also running on Node.js 20 instead of declared `>=22.0.0`, and did **not** verify the outbox implementation. After fixing `@dfarm/database` test discovery, updating `.github/workflows/dfarm-restart09-postgres17.yml` to Node.js 22 with `DFARM_ALLOW_DISPOSABLE_PG17_MUTATIONS=1`, hardening `scripts/ci-run-restart09-pg17.js`, and fixing schema/SSE-helper/teardown defects in `services/backend/tests/restart09-tenant-realtime-outbox.test.js`, the full gate passed locally (`5/5` TAP, `0` skips) and subsequently passed cleanly on GitHub Actions Run **`46115119745`** (`SUCCESS`, PostgreSQL `17.12`, zero failures and zero skips) on `36a4a5092be3a4458d74ce2255d7f1bbca9181f5`. `DF-021` is **`FIXED / VERIFIED`**.

---

## 1. Root Cause Summary (`DF-021` Split-Brain)

Migration [`041_dairy_admin_realtime_and_station_monitoring.sql`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/supabase/migrations/041_dairy_admin_realtime_and_station_monitoring.sql) defines `dashboard_events_outbox` and enables RLS (`rls_dashboard_events_outbox_isolation` checking `app.current_organization_id`) exclusively on the `TENANT_OPERATIONAL` track. While operational collection intake (`PostgresCollectionTransactionRepository.saveAtomicIntake`) and `RealtimeEventPublisher.publishWithTransaction` wrote outbox rows inside the resolved tenant PostgreSQL transaction, several split-brain and isolation defects existed:

1. **Central Control-Plane DB Reads/Writes:** `RealtimeEventPublisher` imported `db` from `PostgresPool.ts` and ran `processOutboxBatch()` pending fetch/update, cross-instance sync, `persistOutboxEvent()`, and `purgeOldOutboxEvents()` against the central control-plane pool.
2. **Non-Transactional `FOR UPDATE SKIP LOCKED`:** `processOutboxBatch()` executed `SELECT ... FOR UPDATE SKIP LOCKED` via top-level `db.query(...)` (autocommit), releasing row locks immediately before dispatch and performing status `UPDATE` outside an atomic transaction.
3. **Global Synchronization Cursor & Ring Buffer:** One global `lastCrossInstanceSyncTime` and one shared `eventRingBuffer` mixed organizations, risking watermark skew across tenants, ring-buffer eviction across tenants, and dropped events sharing equal timestamps (`created_at > $2`).
4. **Non-Strict Replay Resolution:** `replayMissedEvents()` called non-strict `tenantDbManager.getTenantDb(client.organizationId)`.
5. **Silent Failure Masking:** `PostgresCollectionTransactionRepository.saveAtomicIntake()` wrapped the outbox `INSERT` in `try { ... } catch {}`, and `RealtimeEventPublisher` ignored errors inside `persistOutboxEvent()` and caught worker/purge errors without exposing tenant failures.
6. **Missing Transaction-Local RLS Context:** Tenant transactions opened by `TenantDatabaseManager.wrapPgPool()` and outbox transactions never executed `set_config('app.current_organization_id', ..., true)`.

---

## 2. Query Ownership Matrix (All `dashboard_events_outbox` Call Sites)

Repository-wide search (`git grep -n "dashboard_events_outbox"`) across `services/backend/src/` confirms zero operational queries target central `db`, non-strict `getTenantDb()`, or `getAllTenantDbs()`:

| Operation | Previous DB | Updated DB & Context | Location |
| :--- | :--- | :--- | :--- |
| Transactional collection outbox insert (`saveAtomicIntake`) | Tenant tx client (with silent `catch {}`) | Strict tenant `withTransaction` (`this.queryTenant`, `setTenantTransactionContext`, no `catch {}`) | [`PostgresCollectionTransactionRepository.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/repositories/PostgresCollectionTransactionRepository.ts#L867-L883) |
| Helper transactional insert (`publishWithTransaction`) | Caller `pg.PoolClient` | Caller tenant tx `pg.PoolClient` + `setTenantTransactionContext(client, organizationId)` | [`RealtimeEventPublisher.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/realtime/RealtimeEventPublisher.ts#L602-L654) |
| Pending outbox claim & `PUBLISHED` update (`processTenantOutboxBatch`) | Central `db.query` (autocommit) | Strict tenant `withTransaction` + `setTenantTransactionContext` + `FOR UPDATE SKIP LOCKED` + same-tx `UPDATE` | [`RealtimeEventPublisher.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/realtime/RealtimeEventPublisher.ts#L723-L810) |
| Cross-instance `PUBLISHED` sync (`syncCrossInstancePublishedEvents`) | Central `db.query` (global `lastCrossInstanceSyncTime`) | Strict tenant `withTransaction` + `setTenantTransactionContext` + per-tenant keyset `(COALESCE(published_at, created_at), id)` | [`RealtimeEventPublisher.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/realtime/RealtimeEventPublisher.ts#L834-L895) |
| Durable `Last-Event-ID` SSE replay (`replayMissedEvents`) | Global `eventRingBuffer` then non-strict `getTenantDb` | Per-tenant ring buffer then strict tenant `withTransaction` + `(created_at, id)` tie-break | [`RealtimeEventPublisher.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/realtime/RealtimeEventPublisher.ts#L1055-L1150) |
| Direct broadcast persistence (`persistOutboxEvent`) | Central `db.query` (empty `catch {}`) | Strict tenant `withTransaction` + conflict-preserving `ON CONFLICT` + observable errors | [`RealtimeEventPublisher.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/realtime/RealtimeEventPublisher.ts#L1180-L1230) |
| Scheduled retention cleanup (`purgeTenantOldOutboxEvents` / `purgeOldOutboxEvents`) | Central `db.query` | Strict tenant `withTransaction` + `FOR UPDATE SKIP LOCKED` + `PUBLISHED`-only delete before cutoff | [`RealtimeEventPublisher.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/realtime/RealtimeEventPublisher.ts#L1265-L1395) |
| Worker active-tenant discovery (`listActiveTenantOrganizationIds`) | N/A | Central `controlDb` keyset-paginated query on `dairy_database_mappings JOIN organizations` returning org UUIDs only (zero outbox SQL) | [`TenantDatabaseManager.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/database/TenantDatabaseManager.ts#L632-L690) |

*(Note: [`043_distributed_sse_tickets_and_retention.sql`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/supabase/migrations/043_distributed_sse_tickets_and_retention.sql#L22-L55) still contains the legacy `cleanup_dashboard_events_outbox` stored function definition on the control-plane migration track, but it is unused by any runtime or worker query.)*

---

## 3. Architecture & Changes Implemented

### 3.1 Strict Tenant Resolution & Bounded Discovery ([`TenantDatabaseManager.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/database/TenantDatabaseManager.ts))
- Exported `setTenantTransactionContext(client, organizationId)` invoking `SELECT set_config('app.current_organization_id', $1, true);` (skipped only when `__isPgMem === true`). Automatically invoked on every non-platform transaction opened via `wrapPgPool()`. Because `is_local = true`, PostgreSQL clears the GUC cleanly upon `COMMIT` or `ROLLBACK` before releasing pooled connections.
- Added `options?: { bypassCache?: boolean; strictOperational?: boolean }` to `resolveTenantMapping()` and `getStrictTenantDb()`:
  - Joins `dairy_database_mappings m LEFT JOIN organizations o ON o.id = m.dairy_id` when bypassing cache so external `DEPROVISIONING`, `FAILED`, or `INACTIVE` state transitions take effect immediately (`ORGANIZATION_INACTIVE`, `UNMAPPED`, etc.).
  - Rejects `PLATFORM_FEDERATION_DAIRY_ID`, `postgres`, and `dfarm_control_plane` database names when `strictOperational: true` (`CONTROL_PLANE_TARGET_FORBIDDEN`) and removed the non-platform `databaseName === 'postgres' || 'dfarm_control_plane'` control-plane fallback from `getStrictTenantDb()`.
- Added bounded keyset discovery `listActiveTenantOrganizationIds({ afterDairyId, limit })` querying central `dairy_database_mappings JOIN organizations` for `m.provisioning_status = 'ACTIVE' AND o.status = 'ACTIVE'` excluding `PLATFORM_FEDERATION_DAIRY_ID`, `'postgres'`, and `'dfarm_control_plane'`.
- Hardened `createIsolatedMemoryDatabase()` (`NODE_ENV=test` `pg-mem` emulator, forbidden under `REQUIRE_REAL_POSTGRES=1`) to serialize top-level `query()` alongside `withTransaction()` and translate `FOR UPDATE SKIP LOCKED` / CTE outbox purge only inside the test double so concurrent background ticks never corrupt `pg-mem` state via `backup.restore()`.

### 3.2 Transactional Outbox Worker, Delivery Semantics & Failure Windows ([`RealtimeEventPublisher.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/realtime/RealtimeEventPublisher.ts))
- **Delivery Guarantee:** Implements **safe at-least-once delivery** per tenant database with deterministic `eventId` values and client-side consumer deduplication (`useDairyAdminRealtimeEvents.ts` `processedEventIdsRef`).
- **Transaction Ordering in `processTenantOutboxBatch()`:** Inside `tenantDb.withTransaction` bound via `setTenantTransactionContext`:
  1. `SELECT ... WHERE organization_id = $1 AND status = 'PENDING' ORDER BY created_at ASC, id ASC LIMIT 50 FOR UPDATE SKIP LOCKED`
  2. Dispatch matching sanitized SSE frames via `dispatchToClients(event)` (disconnecting broken client sockets individually without failing healthy clients)
  3. `UPDATE dashboard_events_outbox SET status = 'PUBLISHED', published_at = COALESCE(published_at, NOW()) WHERE organization_id = $1 AND id = ANY($2::uuid[])`
  4. Append to local per-tenant ring buffer and dedup set **only after `COMMIT` succeeds**.
- **Failure Windows Covered:**
  - *Worker crashes before dispatch* or *during dispatch before `UPDATE`* -> Transaction rolls back; rows stay `PENDING` and are retried cleanly by the next worker run.
  - *Database transaction fails during `UPDATE`/`COMMIT`* -> Rollback keeps rows `PENDING`; local ring buffer is not updated with uncommitted events.
  - *Individual SSE client disconnects mid-dispatch* -> Socket write error drops only that dead client connection.
  - *Multiple backend instances poll concurrently* -> `FOR UPDATE SKIP LOCKED` inside active transactions ensures no two instances claim or process the same `PENDING` row concurrently.
  - *Single tenant unavailable / unmapped / deprovisioning* -> Recorded in `OutboxBatchRunSummary.failures` (`TRANSIENT_UNAVAILABLE` vs `INVALID_MAPPING` vs `EXECUTION_ERROR`) with structured `{ organizationId, operation, category, code, status, err }` logs (zero secret/PII leakage) while healthy tenants continue processing via bounded concurrency (`4`).
- **Per-Tenant Cross-Instance Sync & `Last-Event-ID` Replay:** Replaced shared cursor/buffer with LRU-bounded per-tenant `tenantRingBuffers` (max 500 events/tenant, max 250 tracked orgs) and per-tenant `tenantSyncCursors` using keyset pagination on `(COALESCE(published_at, created_at), id)` with 2s commit-overlap lookback and bounded local dedup IDs. Durable `Last-Event-ID` DB fallback runs via strict tenant resolution (`created_at > $2 OR (created_at = $2 AND id > $3::uuid)`), enforces center filtering, redacts PII, and returns `RESYNC_REQUIRED` (`CURSOR_EXPIRED`) on missing, purged, or cross-tenant cursors.
- **Direct Persistence & Retention Cleanup:** `persistOutboxEvent()` resolves strict tenant DB, preserves original `event_type`, `entity_id`, and `payload` on `ON CONFLICT (event_id) DO UPDATE`, rethrows/records errors cleanly in telemetry (`getObservabilitySnapshot()`), and `purgeOldOutboxEvents()` / `purgeOldOutboxEventsDetailed()` executes bounded per-tenant CTE cleanup of expired `PUBLISHED` events inside transactions (`FOR UPDATE SKIP LOCKED`), preserving `PENDING` and `FAILED` rows.

### 3.3 Collection Intake Atomicity ([`PostgresCollectionTransactionRepository.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/repositories/PostgresCollectionTransactionRepository.ts))
- Established transaction-local `setTenantTransactionContext(client, orgId)` at the start of `saveAtomicIntake()`.
- Removed the empty `catch {}` block around step 12 (`INSERT INTO dashboard_events_outbox ...`) and executed it through `this.queryTenant(client, orgId, ...)`, guaranteeing outbox persistence errors abort and roll back the intake, session tally, and farmer ledger transaction atomically.

---

## 4. Verification & Test Coverage

### 4.1 Executed Locally on Clean Post-Edit Tree
1. **Build & Migration Catalog Validation:**
   - `npm run build:backend` — **PASS** (`tsc` exit `0` across `@dfarm/shared-types`, `@dfarm/shared-validation`, `@dfarm/database`, `@dfarm/backend`).
   - `npm run db:validate` — **PASS** (`25/25` across `2` suites, `0` fail, `0` skipped).
   - `npm run db:test` — **PASS** (`34` tests across `3` active suites pass; `1` real-PG suite `DFarm Real PostgreSQL Database & RLS Security Verification Suite` `# SKIP`; `0` fail).
2. **Offline Lifecycle & Regression Suites (`DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:59999/offline_test`):**
   - `node scripts/ci-run-offline-lifecycle-suite.js` (`restart037-pool-lifecycle.test.js`, including Test 20 `RealtimeEventPublisher.destroy()` drain) — **`22/22` PASS** (`0` fail, `0` skip).
   - `node --test services/backend/tests/restart09-outbox-isolation-unit.test.js services/backend/tests/restart03-tenant-isolation-and-ownership.test.js services/backend/tests/restart032-operational-repository-isolation.test.js services/backend/tests/restart04-device-auth-and-route-security.test.js services/backend/tests/offline-sync-22-scenarios.test.js services/backend/tests/collection-kiosk-production.test.js services/backend/tests/dairy-admin-production.test.js` — **`131/131` PASS** across 7 suites (`0` fail, `0` skip), including all `7/7` subtests in [`restart09-outbox-isolation-unit.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart09-outbox-isolation-unit.test.js).
3. **Fail-Closed & Skip Behavior Without Local PG17:**
   - `REQUIRE_REAL_POSTGRES=1` on [`restart09-tenant-realtime-outbox.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart09-tenant-realtime-outbox.test.js) — **Fails closed (`exit 1`)** when PG17 is unavailable.
   - `node scripts/ci-run-restart09-pg17.js` without `TEST_POSTGRES_URL` — **Fails closed (`exit 1`)**.
   - `prompt6-dairy-admin-realtime.test.js`, `prompt6-1-realtime-security-gate.test.js`, `prompt6-2-distributed-sse-and-device-gate.test.js`, and default `restart09-tenant-realtime-outbox.test.js` without PG — cleanly `# SKIP` (`exit 0`).

### 4.2 Real PostgreSQL 17 Gate & CI Unblock Execution (`PostgreSQL 17.12` / `170012`, Node `v22.20.0`, npm `10.9.3`)
- **Failed Remote Workflow (`46112338739` on `f461928e0e72b215eaa6d78c6ff99bbf90a507e1`):**
  - Failed at `Run database catalog & static migration gates` with `Could not find packages/database/tests/**/*.test.js` because all 4 test files sit directly under `packages/database/tests/` (zero subdirectories) so `tests/**/*.test.js` failed under Linux/Node 20 glob handling.
  - Workflow also ran Node.js 20 (`node-version: "20"`) despite root `package.json` requiring `"node": ">=22.0.0"`, omitted `DFARM_ALLOW_DISPOSABLE_PG17_MUTATIONS: "1"`, and set `TENANT_CREDENTIAL_ENCRYPTION_KEY` instead of `TENANT_DB_ENCRYPTION_KEY`.
  - When executed against real PostgreSQL `17.12`, [`restart09-tenant-realtime-outbox.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart09-tenant-realtime-outbox.test.js) initially failed on `column "opening_operator_name" of relation "kiosk_shift_sessions" does not exist` (`42703`) and had a `createFakeSseRes()` `chunks` vs `frames` mismatch plus `DROP DATABASE ... WITH (FORCE)` teardown.
- **Post-Fix Verified Local Sequence (After `npm ci`):**
  1. `npm ci` — **PASS** (`1,385` added, `1,404` audited, exit `0`).
  2. `npm run build:backend` — **PASS** (`tsc` exit `0`).
  3. `npm run db:validate` — **PASS** (`25/25` across `2` suites, `0` fail, `0` skip).
  4. `npm run db:test` (default CI env, `TEST_REAL_POSTGRES` unset) — **PASS** (`34` subtests pass across `3` active suites + `1` `# SKIP` suite `real-postgres-verification.test.js`, `0` fail).
  5. `npm run db:test` (`TEST_REAL_POSTGRES=1` against disposable PG `17.12` DB migrated with `001`–`010`) — **PASS** (`54/54` across all `4` files including `20/20` in `real-postgres-verification.test.js`, `0` fail, `0` skip).
  6. `node scripts/ci-pg17-bootstrap.js` — **PASS** (PostgreSQL `17.12`, `server_version_num=170012`; roles & `auth.uid()` bootstrapped; probe create/drop passed).
  7. `node --test services/backend/tests/restart09-outbox-isolation-unit.test.js` — **PASS** (`8/8` TAP tests = `1` suite + `7` subtests, `0` fail, `0` skip).
  8. `node scripts/ci-run-restart09-pg17.js` — **PASS** against real PostgreSQL `17.12` (`5/5` TAP tests = `1` suite + `4` multi-scenario subtests, `0` fail, `0` skip, `0` `pg-mem` fallback, exit `0`).
  9. `node scripts/ci-run-offline-lifecycle-suite.js` — **PASS** (`22/22`, `0` fail, `0` skip).
  10. Fail-closed checks (`TEST_POSTGRES_URL=""` + `REQUIRE_REAL_POSTGRES=1`) — **PASS** (both `ci-run-restart09-pg17.js` and `restart09-tenant-realtime-outbox.test.js` exit `1`).
- **Verified Remote CI Outcome:** Committed & pushed onto `36a4a5092be3a4458d74ce2255d7f1bbca9181f5`, where [`.github/workflows/dfarm-restart09-postgres17.yml`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/.github/workflows/dfarm-restart09-postgres17.yml) passed in GitHub Actions Run **`46115119745`** (**`SUCCESS`**, PostgreSQL `17.12`, zero failures and zero skips). See [`DFARM_RESTART_09_CI_UNBLOCK_AND_PG17_VERIFICATION_REPORT.md`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_09_CI_UNBLOCK_AND_PG17_VERIFICATION_REPORT.md).
