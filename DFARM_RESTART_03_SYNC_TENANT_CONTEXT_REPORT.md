# DFARM RESTART-03 — Offline Sync & Collection Tenant Context Propagation Report

**Scope:** Phase 4 (`DF-007` tenant context propagation portion + `collections.routes.ts` tenant isolation)  
**Status:** **Tenant Context & Batch Item Guards FIXED Locally (`syncRouter` `/push` Shadow Remains Scoped to `RESTART-04`)**

---

## 1. Fixes Applied

1. **`services/backend/src/presentation/routes/collections.routes.ts`:**
   - Removed unused `db` import and eliminated central control-plane `db.query` fallbacks from:
     - `GET /sessions`
     - `GET /sessions/active`
     - `POST /sessions/open` (`handleOpenSession`)
     - `GET /transactions` (`handleGetTransactions`)
     - `POST /transactions/:id/adjust`
     - `GET /quality/readings`
   - Enforced header/body organization mismatch checks (`403`) and always forwarded server-verified `req.user.organizationId` across `handleOpenSession`, `handleCloseSession`, `handleReopenSession`, `handleIntakeTransaction`, and `handleBulkSync`.
2. **`services/backend/src/presentation/routes/sync.routes.ts`:**
   - Added cross-tenant header (`x-organization-id`, `x-dairy-tenant-id`, `x-dairy-id`) and body (`organizationId`, `dairyId`) mismatch blocking (`403`) to both `handleBulkSync` and `handleSyncBatch`.
   - Updated `handleSyncBatch` (`POST /api/v1/sync/transactions`, `POST /api/v1/sync/push`) to pass `organizationId: orgId` into `syncUseCase.execute(...)`.
   - Preserved `authenticateDevice` middleware inside `syncRouter` cleanly; per Phase 4 scope, `router.post('/push', authenticate, ...)` shadowing `syncRouter.post('/push', authenticateDevice, ...)` remains documented under `DF-007` for `RESTART-04`.
3. **`services/backend/src/application/use-cases/telemetry/TelemetryAndSyncUseCases.ts` (`ProcessOfflineSyncBatchUseCase`):**
   - Validates `batch.organizationId` upfront (`DomainValidationError` `MISSING_ORGANIZATION_ID`).
   - Rejects any item carrying a mismatched `item.organizationId` or `item.dairyId` with `errorCode: 'CROSS_TENANT_ITEM_BLOCKED'`, ensuring batch items can never override `batch.organizationId`.
4. **`services/backend/src/application/use-cases/collections/BulkCollectionSyncUseCase.ts` & `MilkIntakeUseCases.ts`:**
   - Enforce item/customer/session `organizationId` equality against authenticated batch/request `organizationId`, rejecting cross-tenant payloads with zero financial writes in either tenant DB.

---

## 2. Verification Summary

Verified via `services/backend/tests/restart03-tenant-isolation-and-ownership.test.js` (Group 6C):
- Spoofed `x-dairy-id` / `organizationId` headers and bodies on `/api/v1/collections/intake`, `/api/v1/sync/bulk`, and `/api/v1/sync/transactions` return `403`.
- Direct `ProcessOfflineSyncBatchUseCase.execute()` without `organizationId` rejects with `MISSING_ORGANIZATION_ID`.
- Cross-tenant batch items (`CROSS_TENANT_ITEM_BLOCKED`) and cross-tenant farmer IDs fail cleanly without mutating Dairy A or Dairy B ledgers/transactions.
- Valid items sync into Dairy A only, and retries are idempotent without duplicate transactions.
