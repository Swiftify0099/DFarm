# DFarm RESTART-03.1 — Independent Source & Architecture Audit Report

**Audit Phase:** `RESTART-03.1`  
**Date:** `2026-11-26`  
**Target Branch:** `fix/cloudflare-pages-production-deploy`  
**Verified Public Remote HEAD (`origin`):** `2c15eabff12dfe1cae94c4c4bd09d364ceb106a1`  
**Verified Local Worktree HEAD:** `5b9f0d04680373df7bde4b9f93225557bba08340` (+ uncommitted `RESTART-03.1` fixes in `PostgresCustomerRepository.ts`, `dairies.routes.ts`, and `restart03-tenant-isolation-and-ownership.test.js`)  
**Overall Classification:** **PARTIAL** *(Local code audit & offline fixes verified `18/18` in `pg-mem`; Real PostgreSQL 17 gate `BLOCKED / NOT RUN`; public remote `origin` remains unchanged at `2c15eab`)*

---

## 1. Local vs Public Remote Reconciliation (Phase 0)

- **Git Reality:** Contrary to RESTART-03 narrative assumptions of an uncommitted diff, RESTART-02.1 + RESTART-03 source files, `supabase/migrations/045_kiosk_shift_session_concurrency_and_ownership.sql`, `docker-compose.pg17-verify.yml`, and the five `DFARM_RESTART_03_*.md` reports were committed locally at `5b9f0d04680373df7bde4b9f93225557bba08340` (`git diff 2c15eab..5b9f0d04`: `151` files changed including compiled `dist/`).
- **Public Remote Unchanged:** `origin/fix/cloudflare-pages-production-deploy` remains at `2c15eabff12dfe1cae94c4c4bd09d364ceb106a1` (no `RESTART-03` or `RESTART-03.1` code exists on GitHub yet).
- **Worktree Preservation:** `.temp/` has `0` tracked files and `1,829` local preserved files (including `.temp/chrome-cdp/`). No `reset`, `clean`, `stash`, `commit`, or `push` was executed.

---

## 2. Independent Audit of `DF-016` (Shift Session Isolation & Repository Integrity)

Directly verified in [PostgresShiftSessionRepository.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/repositories/PostgresShiftSessionRepository.ts), [IShiftSessionRepository](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/application/ports/index.ts#L39-L44), [ShiftSessionUseCases.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/application/use-cases/sessions/ShiftSessionUseCases.ts), [collections.routes.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/presentation/routes/collections.routes.ts), and [TenantDatabaseManager.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/database/TenantDatabaseManager.ts):

1. **Mandatory `organizationId`:** `findActiveSession(centerId, deviceIdentifier, organizationId)`, `findByCode(sessionCode, organizationId)`, `findById(sessionId, organizationId)`, and `save(session)` all enforce a valid UUID `organizationId` upfront and throw `DomainValidationError` if missing/invalid.
2. **Strict Tenant Routing:** Zero `getAllTenantDbs()` calls and zero control-plane `db.query` fallbacks remain in `PostgresShiftSessionRepository.ts`, `ShiftSessionUseCases.ts`, or `collections.routes.ts`. `tenantDbManager.getStrictTenantDb(organizationId)` validates active mapping & provisioning status and raises `TenantDatabaseUnavailableError` (`503`) on unmapped/failed/outage conditions rather than scanning or returning false empty results.
3. **Zero Fake Persistence:** Removed all synthetic organization creation, `'C-01'` center fabrication, placeholder user insertion (`00000000-...003`), and fake phone fallbacks. Before `INSERT` in `save()`, strict tenant-DB queries verify active `organizations`, `dairy_centers`, `users` (opening/closing operators), and non-blocked/non-revoked registered `devices` (if device-bound).
4. **Concurrency & Error Propagation:** Save failures propagate cleanly (zero empty `catch` blocks on writes); `save()` catches `23505` duplicate open constraint violations cleanly. `OpenShiftSessionUseCase` uses `findActiveSession` -> `save` with `23505` conflict re-read retry instead of duplicate creation.

---

## 3. Migration `045` & Concurrency Audit (Phase 2)

- Directly inspected [045_kiosk_shift_session_concurrency_and_ownership.sql](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/supabase/migrations/045_kiosk_shift_session_concurrency_and_ownership.sql): creates partial unique index `uq_kiosk_shift_sessions_active_open ON kiosk_shift_sessions (organization_id, center_id, device_identifier) WHERE (status = 'OPEN')` plus lookup indexes `idx_kiosk_shift_sessions_org_code` and `idx_kiosk_shift_sessions_org_center_date_shift`.
- **Registration Parity:** `045` is registered in all 4 locations: [packages/database/src/index.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/packages/database/src/index.ts#L63), [MigrationRunner.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/database/MigrationRunner.ts#L66), [PostgresPool.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/database/PostgresPool.ts#L321), and [TenantDatabaseManager.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/database/TenantDatabaseManager.ts#L1072).
- **Manifest Tier Discrepancy Noted (`DF-020`):** [packages/database/src/index.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/packages/database/src/index.ts#L57) classifies `040_device_auth_challenges.sql` as `CONTROL_PLANE`, whereas [MigrationRunner.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/database/MigrationRunner.ts#L61) marks `040` as `SHARED` (running it in tenant DBs as well). Also `MigrationRunner.ts:229-235` still swallows `supabase_migrations.schema_migrations` insert errors with `catch {}`. Kept unchanged here; tracked under `DF-020` (`RESTART-05`).
- **Limitation:** Real PostgreSQL execution of `045` across 2 isolated PG 17 tenant DBs could not be run on this host (`BLOCKED / NOT RUN`).

---

## 4. Audit & Narrow Fixes on `DF-017` / `DF-015` / `DF-007` (Phases 3–4)

### Audit Gaps Found & Remediated in `RESTART-03.1`
1. **`PostgresCustomerRepository.ts` Incomplete Strict DB Migration:** `findByFarmerCode`, `findByRfid`, `listCustomers`, `listPendingRegistrations`, and `assignRfidCard` still called non-strict `tenantDbManager.getTenantDb(...)`, and `assignRfidCard` fell back via optional `organizationId`. Switched all 5 methods to `getStrictTenantDb(...)` and enforced `TENANT_CONTEXT_REQUIRED` on `assignRfidCard`.
2. **`PostgresCustomerRepository.ts` Unscoped `users` Query in `updateFaceEnrollment`:** Previously lines `606-613` fell back to `SELECT id FROM users WHERE status = 'ACTIVE' ORDER BY created_at ASC LIMIT 1` **without** `WHERE organization_id = $1`. Removed the unscoped fallback; enrollment now requires an active operator within `organization_id = $1` (`NO_ACTIVE_OPERATOR`).
3. **`dairies.routes.ts` Recovery Provisioning Gap (`/:id/retry-provisioning`):** Retrying provisioning created the tenant schema without mirroring the control-plane primary `dairy_centers` and active `users`. Added authoritative control-plane -> tenant-DB mirroring on active recovery (`retry-provisioning`).

### Verified Behaviors & Known Remaining Gaps
- **Customer Registration (`customers.routes.ts`):** Requires active org in control-plane (`403` suspended), active tenant DB mapping + `getStrictTenantDb` (`503` on outage), OTP/registration identity proof matching submitted phone (`401`/`403`), resolves `dairy_centers` strictly from the selected dairy's `tenantDb`, supports `idempotencyKey` retries, requires explicit `biometricConsent` when submitting face embeddings, and returns HTTP `201` with `partialSuccess: true, customerCreated: true, biometricEnrolled: false, code: 'BIOMETRIC_ENROLLMENT_PARTIAL_FAILURE'` if biometric persistence fails.
  - **Mobile Frontend Observation:** In [useRegistration.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-customer-app/src/features/registration/useRegistration.ts#L26-L41), `apps/dfarm-customer-app` sends `selectedDairyId` and `mobileNumber` cleanly, but does not yet branch UI state specifically for `partialSuccess: true / biometricEnrolled: false` recovery prompts (documented for frontend registration follow-up).
- **Sync / Collection Propagation (`DF-007`):** `BulkCollectionSyncUseCase`, `MilkIntakeUseCases`, `TelemetryAndSyncUseCases`, and `sync.routes.ts` (`handleSyncBatch`) validate and forward authenticated `organizationId` and block cross-tenant items (`CROSS_TENANT_ITEM_BLOCKED`). Legacy `/push` route shadowing at [sync.routes.ts:137](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/presentation/routes/sync.routes.ts#L137) intentionally remains open for `RESTART-04`.

### Out-of-Scope Residual Findings Preserved for `RESTART-04`..`RESTART-10`
- `getAllTenantDbs()` still exists in [GetCustomerMembershipsUseCase.ts:71](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/application/use-cases/customers/GetCustomerMembershipsUseCase.ts#L71), [PostgresCollectionTransactionRepository.ts:736,780,851](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/repositories/PostgresCollectionTransactionRepository.ts#L736), and [PostgresLedgerRepository.ts:124,321](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/repositories/PostgresLedgerRepository.ts#L124).
- `dairy-admin.routes.ts:53-58` (`resolveAndAuthorizeTenant`) catches `getTenantDb` errors and falls back to `db`.
- `collections.routes.ts:809-817` (`POST /transactions/:id/adjust`) writes `balanceAfter: 0` (`DF-006`/`DF-023`, `RESTART-06`).
- `PostgresCollectionTransactionRepository.ts:164,215` contains a pre-existing SQL column/value shift inserting `'LITERS'` into `net_weight` (breaking direct `save()` calls in `customer-data-lifecycle-e2e.test.js` Step 6); lines `93,400` and `PostgresLedgerRepository.ts:203` still retain non-prod `INSERT INTO users` shims.
