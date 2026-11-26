# DFARM RESTART-03 — Customer Registration Database Ownership Report

**Scope:** `DF-017` (Phase 3) & `DF-015` Dev Seeding Removal (Phase 5)  
**Endpoint:** `POST /api/v1/customers/register` (+ supporting onboarding & biometric routes)  
**Status:** **FIXED Locally (Offline Verified; Real PostgreSQL Gate Blocked by Host Environment)**

---

## 1. Canonical Ownership Conclusion for `dairy_centers`

Inspection of schemas `002`, `004`, `008`, `010`, `027` and route handlers confirms:
- All tenant-operational tables (`customers.primary_center_id`, `kiosk_shift_sessions.center_id`, `collection_sessions.center_id`, `milk_collections.center_id`, `devices.center_id`) enforce foreign keys against `dairy_centers(id)` inside the **isolated tenant operational database**.
- Central control-plane `dairy_centers` supports discovery and operator assignment metadata during onboarding (`dairies.routes.ts`, `staff.routes.ts`).
- Therefore, **the selected dairy's active tenant operational DB is authoritative for customer registration center resolution**. Relying on central `db` as the primary lookup or fallback caused cross-database divergence (`400` after provisioning) and risked assigning non-tenant or wrong-dairy centers.

---

## 2. Changes Implemented

1. **`services/backend/src/presentation/routes/dairies.routes.ts`:**
   - Updated `POST /api/v1/dairies` provisioning flow so once `tenantDbManager.provisionTenantDatabase(...)` reaches `ACTIVE`, it mirrors the authoritative primary `dairy_centers` row, primary dairy admin `users` row, and `user_center_assignments` row directly into `tenantDb`.
   - Updated `PATCH /api/v1/dairies/:id/location` so verified GPS/address changes propagate to `tenantDb.dairy_centers` when tenant DB is active.
2. **`services/backend/src/presentation/routes/staff.routes.ts`:**
   - When onboarding staff (`POST /api/v1/staff`) against a verified central center of `targetOrgId`, mirrors that verified `dairy_centers` record into active `tenantClient` if absent before creating `user_center_assignments`, preventing FK failures without fabricating centers.
3. **`services/backend/src/presentation/routes/customers.routes.ts`:**
   - `POST /api/v1/customers/register` preserves RESTART-02.1 OTP/session identity proof and biometric consent checks, then:
     - Verifies the selected organization exists (`400 INVALID_ORGANIZATION`) and is `ACTIVE` (`403 ORGANIZATION_INACTIVE`) in `controlDb` (`503 ORGANIZATION_DB_UNAVAILABLE` on DB error).
     - Resolves `tenantMapping` (`503 TENANT_MAPPING_MISSING` if absent, `503 TENANT_DATABASE_UNAVAILABLE` if non-`ACTIVE`) and obtains `tenantDbManager.getStrictTenantDb(targetOrgId)`.
     - Resolves/validates `centerId` **exclusively** against `tenantDb.dairy_centers`:
       - Explicitly provided `centerId`: validates ownership (`403 CROSS_TENANT_CENTER`), existence (`400 INVALID_CENTER`, with read-only diagnostic check on `controlDb` solely to emit accurate `403 CROSS_TENANT_CENTER` when submitted cross-tenant, never accepting a central-only center), and `ACTIVE` status (`400 INACTIVE_CENTER`).
       - Omitted `centerId`: selects active center from `tenantDb.dairy_centers`, rejecting with `400 NO_ACTIVE_CENTER` if none exists (even if central `db` has a row).
     - If post-registration `updateBiometricsUseCase` fails transiently, returns explicit `201` with `partialSuccess: true, customerCreated: true, biometricEnrolled: false, code: 'BIOMETRIC_ENROLLMENT_PARTIAL_FAILURE'`; idempotent retry finishes biometric enrollment without creating duplicate customer or membership rows.
   - `handleBiometricsUpdate` (`DF-015`): removed all `NODE_ENV !== 'production'` dummy customer/center/membership auto-provisioning and unscoped fallback mutations; unregistered callers fail closed (`404 CUSTOMER_NOT_FOUND`).
   - `PUT /:id/bank-details`: switched from `tenantDb` + `db.query` fallback to `tenantDbManager.getStrictTenantDb(orgId)`.
4. **`services/backend/src/application/use-cases/customers/CustomerDirectoryUseCases.ts` & `PostgresCustomerRepository.ts`:**
   - Removed central `db` write of `customer_milk_categories` in `RegisterCustomerUseCase`; queries `centerName` from `tenantDb.dairy_centers`; handles concurrent `23505` races idempotently.
   - Removed `getAllTenantDbs()`, fake `'Tenant Dairy'` / `kiosk_biometric_service` user/org/center fabrication, and hardcoded fallback UUIDs in `PostgresCustomerRepository.ts`.
