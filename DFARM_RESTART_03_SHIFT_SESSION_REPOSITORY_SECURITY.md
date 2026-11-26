# DFARM RESTART-03 — Shift Session Repository Security & Concurrency Report

**Scope:** `DF-016` & Phase 2 Concurrency/Ownership Integrity  
**Status:** **FIXED Locally (Offline Verified; Real PostgreSQL Gate Blocked by Host Environment)**

---

## 1. Files Modified / Added

- [`services/backend/src/domain/errors/index.ts`](file:///C:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/domain/errors/index.ts): Added `SessionConflictError` (`statusCode = 409`, `code = 'ACTIVE_SESSION_ALREADY_EXISTS'`).
- [`services/backend/src/application/ports/index.ts`](file:///C:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/application/ports/index.ts): Required non-optional `organizationId: string` on `IShiftSessionRepository.{findActiveSession,findByCode,findById}`.
- [`services/backend/src/infrastructure/repositories/PostgresShiftSessionRepository.ts`](file:///C:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/repositories/PostgresShiftSessionRepository.ts): Full rewrite eliminating global scans, central fallbacks, and synthetic entity fabrication.
- [`services/backend/src/application/use-cases/sessions/ShiftSessionUseCases.ts`](file:///C:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/application/use-cases/sessions/ShiftSessionUseCases.ts): Enforced mandatory `organizationId`, `centerId`, and `operatorId`, plus concurrent conflict recovery via re-reading the winning active session.
- [`services/backend/src/presentation/routes/collections.routes.ts`](file:///C:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/presentation/routes/collections.routes.ts): Removed all `db.query` fallbacks; resolved centers from `getStrictTenantDb`; forwarded authenticated `organizationId` and rejected cross-tenant headers/body mismatches.
- [`supabase/migrations/045_kiosk_shift_session_concurrency_and_ownership.sql`](file:///C:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/supabase/migrations/045_kiosk_shift_session_concurrency_and_ownership.sql) (registered in `packages/database/src/index.ts`, `MigrationRunner.ts`, `PostgresPool.ts`, `TenantDatabaseManager.ts`).

---

## 2. Security Controls Implemented

### A. Mandatory Authenticated `organizationId`
Every repository method (`findActiveSession`, `findByCode`, `findById`, `save`) validates `organizationId` as a non-empty UUID (`assertValidOrganizationId`), throwing `DomainValidationError` (`MISSING_ORGANIZATION_ID` / `INVALID_ORGANIZATION_ID`) immediately when omitted or malformed. `findById` returns `null` for non-UUID session IDs without triggering `22P02` SQL errors.

### B. Zero Cross-Tenant Scan & Distinct Failure Semantics
- `tenantDbManager.getAllTenantDbs()` was completely removed from `PostgresShiftSessionRepository`.
- Lookups call `tenantDbManager.getStrictTenantDb(organizationId)`:
  - Valid missing session -> returns `null` cleanly (`findActiveSession`, `findByCode`, `findById`).
  - Unmapped organization -> throws `TenantDatabaseUnavailableError` (`503`, `TENANT_MAPPING_MISSING`).
  - Non-`ACTIVE` provisioning state (`FAILED`, `PROVISIONING`) or connection/query failure -> throws `TenantDatabaseUnavailableError` (`503`, `TENANT_DATABASE_UNAVAILABLE`).
  - Save/close DB write errors are **never swallowed** and propagate as `503`.

### C. Zero Central Fallback & Zero Synthetic Entity Fabrication
- All shift session reads and writes target the organization's tenant operational database only; central `db` fallback and silent dual-write were removed.
- Before persisting, `save()` explicitly verifies:
  1. Control-plane organization exists (`DomainValidationError` `INVALID_ORGANIZATION`) and is `ACTIVE` (`ForbiddenError` `ORGANIZATION_INACTIVE`), and tenant DB contains matching `ACTIVE` organization.
  2. Center exists in tenant DB (`INVALID_CENTER`), matches `session.organizationId` (`ForbiddenTenantError`), and is `ACTIVE` (`INACTIVE_CENTER`).
  3. Opening operator (and closing operator when present) exists in tenant DB (`INVALID_OPERATOR`), matches `session.organizationId` (`ForbiddenTenantError`), is `ACTIVE`, and is not a customer role (`FARMER_CUSTOMER`, `GUEST_FARMER`, `CUSTOMER`).
  4. When registered in `devices`, device belongs to `organizationId` (`ForbiddenTenantError`) and is not `BLOCKED`/`REVOKED`/`DECOMMISSIONED`/`INACTIVE` (`ForbiddenError` `DEVICE_BLOCKED`).
- Upsert uses `ON CONFLICT (id) DO UPDATE ... WHERE kiosk_shift_sessions.organization_id = EXCLUDED.organization_id` and rejects zero-row ownership mismatches with `ForbiddenTenantError`.

---

## 3. Phase 2 — Atomic PostgreSQL Concurrency Control

Additive migration `045_kiosk_shift_session_concurrency_and_ownership.sql` creates:
- `uq_kiosk_shift_sessions_active_open`: `CREATE UNIQUE INDEX IF NOT EXISTS uq_kiosk_shift_sessions_active_open ON kiosk_shift_sessions (organization_id, center_id, device_identifier) WHERE (status = 'OPEN');`
- `idx_kiosk_shift_sessions_org_code` and `idx_kiosk_shift_sessions_org_center_date_shift`.

PostgreSQL `23505` violations on `uq_kiosk_shift_sessions_active_open` map to `SessionConflictError` (`409 ACTIVE_SESSION_ALREADY_EXISTS`), allowing `OpenShiftSessionUseCase` / `GetActiveShiftSessionUseCase` to deterministically return the winning active session under concurrent requests without duplicate rows, while preserving historical `CLOSED` sessions and honoring `DF-020` by leaving applied migrations (and duplicate `031_*`) untouched.
