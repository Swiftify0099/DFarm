# DFarm RESTART-03.2 — Collection Transaction Repository Security & Multi-Dairy History

**Phase:** `RESTART-03.2`  
**Date:** `2026-11-27`  
**Remote & Local Base HEAD:** `47f97db6ce1e29952547b6946f303f59666ee694`  
**Primary Component:** [`PostgresCollectionTransactionRepository.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/repositories/PostgresCollectionTransactionRepository.ts)

---

## 1. Vulnerabilities Remediated

Before `RESTART-03.2`, `PostgresCollectionTransactionRepository` and its callers exhibited multiple critical tenant-isolation and persistence bugs:
1. Optional `organizationId` allowed read methods (`listRecentBySession`, `listByCustomer`, `getMonthlySummary`) to omit tenant resolution and scan **every** tenant DB via `getAllTenantDbs()` or fall back to central `db.query`.
2. Swallowed `catch {}` blocks around tenant queries converted database outages and mapping errors into empty arrays `[]` or zeroed summaries (`{ totalLiters: 0, totalAmount: 0, deliveryCount: 0 }`).
3. `save()` and `saveAtomicIntake()` fabricated missing `organizations`, `'C-01'` centers, and synthetic `users` (`00000000-0000-0000-0000-000000000011`, `+919822114477`) or queried `users` unscoped, and duplicated collection/ledger writes to central `db.withTransaction`.
4. `save()` had a pre-existing SQL `VALUES` parameter shift around `'LITERS'`.

---

## 2. Architecture & Security Enforcement Implemented

### A. Strict Repository Contract & Isolation (`PostgresCollectionTransactionRepository.ts`, `ports/index.ts`)
- **Interface Enforcement ([`ports/index.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/application/ports/index.ts)):** Added `findById(id: string, organizationId: string)` and required non-empty `organizationId: string` on `listRecentBySession`, `listByCustomer`, and `getMonthlySummary`.
- **Fail-Closed Organization & DB Resolution:** `assertValidOrganizationId()` validates UUID format upfront (`400 MISSING_ORGANIZATION_ID` / `INVALID_ORGANIZATION_ID`), and `getStrictTenantDb(organizationId)` resolves the single authoritative tenant pool (`503 TENANT_MAPPING_MISSING` / `TENANT_DATABASE_UNAVAILABLE` on missing mapping or outage).
- **Zero Scans / Zero Central Fallback:** Removed central `db` import, `getAllTenantDbs()`, central fallback reads, and central dual-writes. Every SQL read/write filters by `organization_id` (and `customer_id` / `session_id` as applicable) inside the selected tenant DB.
- **Controlled Error Propagation:** `queryTenant()` preserves `DomainError` subclasses and maps unexpected SQL/driver failures to `TenantDatabaseUnavailableError` (`503`), distinguishing legitimate not-found (`null` / `[]`) from DB unavailability (`503`).
- **Pre-Write Foreign Key Ownership Validation (`validateOperationalContext`):** Before inserting into `milk_collections`, verifies the `customer` exists and belongs to `organizationId`, `center` belongs to `organizationId`, `operator` belongs to `organizationId` (explicit reject when missing/cross-tenant — zero synthetic records created), `rate_charts` lookup is scoped by `organization_id`, and `kiosk_shift_sessions` update is scoped by `organization_id`.
- **Parameter Alignment Fix:** Corrected `save()` `VALUES` placeholder alignment around `'LITERS'` and validated transactional persistence inside `tenantDb.withTransaction`.

### B. Use-Case & HTTP Route Enforcement (`MilkIntakeUseCases.ts`, `collections.routes.ts`)
- [`GetCustomerCollectionHistoryUseCase`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/application/use-cases/collections/MilkIntakeUseCases.ts) and [`GetMonthlyMilkSummaryUseCase`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/application/use-cases/collections/MilkIntakeUseCases.ts) enforce mandatory `organizationId`.
- [`collections.routes.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/presentation/routes/collections.routes.ts):
  - `POST /transactions/:id/adjust`: Requires `req.user.organizationId` and `req.user.userId`, passing both into `ledgerRepo.appendEntry(...)`.
  - `GET /history` & `GET /summary/monthly`: Enforce cross-dairy `403` and missing-org `400` guards.
  - **Multi-Dairy Consolidated View (`?scope=consolidated`):** When explicitly requested on `GET /history` by an authenticated customer with `globalCustomerId`, queries **authoritative `APPROVED` memberships only** from `PostgresCustomerMembershipRepository` (`customer_dairy_memberships`), resolves only each authorized `organizationId`'s tenant DB via `listConsolidatedForMemberships`, preserves per-transaction `organizationId`, and returns an explicit partial/error contract:
    - All authorized DBs reachable -> `{ success: true, scope: 'consolidated', partial: false, unavailableDairies: [], data: [...] }`
    - One or more (not all) authorized DBs unavailable -> `200` with `{ success: true, scope: 'consolidated', partial: true, unavailableDairies: [{ organizationId, reason }], data: [...] }`
    - **All** authorized DBs unavailable -> `503 Service Unavailable` (`TENANT_DATABASE_UNAVAILABLE`) instead of silently returning `[]`.
  - Default single-dairy `/history` and `/summary/monthly` preserve exact existing frontend response shapes for `apps/dfarm-customer-app/src/features/collection/useCollection.ts`.

---

## 3. Verification Evidence (`pg-mem` + Supertest)

Executed in [`restart032-operational-repository-isolation.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart032-operational-repository-isolation.test.js) Section `1` & Subtest `3.3` (`15/15` PASS, `fail 0`, `EXIT=0` after final edit):
- Missing/invalid `organizationId` fails closed (`400`) and never triggers `getAllTenantDbs()` or central `db.query`.
- Cross-tenant `findById`, `listRecentBySession`, `listByCustomer`, and `getMonthlySummary` return `null`/`[]`/`0` across Dairy A vs Dairy B without leaking rows.
- `save()` and `saveAtomicIntake()` persist with aligned `'LITERS'` columns only in target tenant DB and reject fake/cross-tenant customer, center, or operator without inserting synthetic rows.
- Outage / unmapped tenant DB propagates `503` instead of returning empty arrays.
- Consolidated `?scope=consolidated` returns transactions from both authorized dairies while surfacing `partial: true` + `unavailableDairies` when one authorized dairy DB goes offline (never hiding incomplete data).
