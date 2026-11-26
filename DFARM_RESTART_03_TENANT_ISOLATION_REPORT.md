# DFARM RESTART-03 — Multi-Tenant Database Isolation Report

**Sequence:** `RESTART-03`  
**Target Branch:** `fix/cloudflare-pages-production-deploy`  
**Verified Remote Baseline HEAD:** `2c15eabff12dfe1cae94c4c4bd09d364ceb106a1`  
**Working Tree Policy:** Uncommitted local remediation (no `git commit`, no `git push`, `.temp/` preserved: `1,829` local files, `0` tracked)  
**Classification:** **PARTIAL — REAL POSTGRESQL VERIFICATION BLOCKED**

---

## 1. Executive Summary

`RESTART-03` remediated the critical multi-tenant database isolation, shift-session persistence, customer registration center ownership, and offline sync tenant-context propagation defects tracked under **`DF-016`**, **`DF-017`**, **`DF-006`** (route DB fallbacks), **`DF-007`** (tenant context propagation), and **`DF-015`** (non-production dummy data seeding).

Offline TypeScript compilation, database schema validation, isolated RESTART-03 test verification (`15/15`), previously failing onboarding/kiosk/biometric E2E regression suites, RESTART-02/02.1 security suites, and all four frontend test suites pass cleanly. Live PostgreSQL 17 execution remains **BLOCKED / NOT RUN** because local PostgreSQL ports (`5432`, `54322`) are closed and the local Docker Desktop Linux engine returned HTTP `500` on `/info`.

---

## 2. Database Ownership Model Verified

| Data Entity / Table | Canonical Authoritative Owner | Synchronization / Mirroring Contract |
| :--- | :--- | :--- |
| `organizations`, `tenant_database_mappings`, `global_customer_identities`, `customer_dairy_memberships`, `revoked_tokens` | **Control-Plane DB** | Platform directory and cross-dairy identity/mapping authority (`AccountAuthorityService`, `TenantDatabaseManager`). |
| `kiosk_shift_sessions`, `milk_collections`, `collection_sessions`, `customers`, `customer_addresses`, `customer_milk_categories`, `customer_ledger_accounts`, `ledger_entries`, `face_enrollments`, `rfid_cards`, `rfid_card_assignments`, `devices` | **Tenant Operational DB** | Operational foreign keys reference tenant-scoped `organizations`, `dairy_centers`, `users`, `customers`, `kiosk_shift_sessions`, and `devices`. Zero hidden fallback or dual-write to control-plane `db`. |
| `dairy_centers` | **Tenant Operational DB** for operational FKs (`customers`, `kiosk_shift_sessions`, `milk_collections`, `devices`); mirrored from/to control plane for super-admin/directory discovery | `POST /api/v1/dairies`, `PATCH /api/v1/dairies/:id/location`, and `POST /api/v1/staff` propagate verified central center/admin records to the active tenant DB; `POST /api/v1/customers/register` queries **only** the selected dairy's active `tenantDb.dairy_centers`. |

---

## 3. Remediated Cross-Tenant & Fallback Vectors

1. **`TenantDatabaseManager` strict resolver (`services/backend/src/infrastructure/database/TenantDatabaseManager.ts`):**
   - Added `resolveTenantMapping(dairyId)` and `getStrictTenantDb(dairyId)`.
   - Throws `TenantDatabaseUnavailableError` (`statusCode = 503`, `code = 'TENANT_MAPPING_MISSING'` when `'UNMAPPED'`, otherwise `'TENANT_DATABASE_UNAVAILABLE'`) without fabricating test mappings or falling back to control-plane `db`.
   - Fixed invalid non-UUID test double seed ID in `createIsolatedMemoryDatabase` (`00000000-0000-0000-0000-000000000111`).
2. **Shift Session Isolation (`DF-016`):**
   - Removed all `tenantDbManager.getAllTenantDbs()` scans, central `db` fallbacks, central dual-writes, and fake entity creation from `PostgresShiftSessionRepository.ts`.
   - Removed all direct `db.query` fallbacks in `services/backend/src/presentation/routes/collections.routes.ts`.
3. **Customer & Biometric Isolation (`DF-017`, `DF-015`):**
   - Removed `getAllTenantDbs()`, fake `organizations`/`dairy_centers`/`users` creation (`kiosk_biometric_service`), and hardcoded `'00000000-...011'`/`'...003'` fallbacks from `PostgresCustomerRepository.ts`.
   - Removed `NODE_ENV !== 'production'` dummy customer/center auto-provisioning from `handleBiometricsUpdate` and `db.query` fallbacks from `PUT /:id/bank-details` in `customers.routes.ts`.
   - Removed central `db.query('INSERT INTO customer_milk_categories ...')` from `RegisterCustomerUseCase`.
4. **Sync Tenant Context Propagation (`DF-007` partial):**
   - Forwarded authenticated `organizationId` in `handleSyncBatch` -> `syncUseCase.execute(...)` and blocked mismatched `organizationId`/`dairyId` headers, request bodies, and individual batch items across `sync.routes.ts`, `TelemetryAndSyncUseCases.ts`, `BulkCollectionSyncUseCase.ts`, and `MilkIntakeUseCases.ts`.

---

## 4. Remaining Out-of-Scope Cross-Tenant Debt Flagged

Inspected repository searches note three files outside RESTART-03's Phase 1–5 scope that still reference `getAllTenantDbs()` or central fallbacks and remain tracked for future phases (`RESTART-06`..`RESTART-10`):
- `GetCustomerMembershipsUseCase.ts`
- `PostgresCollectionTransactionRepository.ts`
- `PostgresLedgerRepository.ts`
- `sync.routes.ts` (`/push` duplicate route registration shadowing `syncRouter`'s `authenticateDevice`, deferred to `RESTART-04` per prompt).
