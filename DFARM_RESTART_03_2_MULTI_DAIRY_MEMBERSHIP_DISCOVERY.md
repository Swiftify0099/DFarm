# DFarm RESTART-03.2 — Multi-Dairy Membership Discovery & Customer Anti-IDOR

**Phase:** `RESTART-03.2`  
**Date:** `2026-11-27`  
**Remote & Local Base HEAD:** `47f97db6ce1e29952547b6946f303f59666ee694`  
**Primary Components:** [`GetCustomerMembershipsUseCase.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/application/use-cases/customers/GetCustomerMembershipsUseCase.ts), [`PostgresCustomerMembershipRepository.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/repositories/PostgresCustomerMembershipRepository.ts), [`customers.routes.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/presentation/routes/customers.routes.ts)

---

## 1. Canonical Ownership Architecture

| Entity / Concept | Authoritative Store | Migrations |
| :--- | :--- | :--- |
| Global customer phone identity | Control-Plane `global_customer_identities` | `037_global_customer_identities.sql` |
| Multi-dairy membership & status | Control-Plane `customer_dairy_memberships` | `037`, `038`, `039` |
| Phone/org lookup index | Control-Plane `customer_tenant_lookup` | `037_global_customer_identities.sql` |
| Tenant customer profile, centers, collections, ledger | Isolated Tenant DB (`customers`, `dairy_centers`, `milk_collections`, `customer_ledger_accounts`, `ledger_transactions`) | `008`, `009`, `019`, `031_dairy_database_mappings.sql` |

---

## 2. Changes Implemented

### A. Request-Path Discovery (`GetCustomerMembershipsUseCase.ts`)
- **Removed:** `getAllTenantDbs()` request-path tenant database scan when central memberships were empty, phone-based silent tenant matching, automatic `createMembership(...)` creation, and silent tenant `customers` row updates during reads.
- **Enforced:** `GetCustomerMembershipsUseCase.execute()` queries strictly via `PostgresCustomerMembershipRepository` (control-plane `global_customer_identities` and `customer_dairy_memberships`) using authenticated `globalCustomerId` (or verified `phoneNumber` where authorized). Preserved all existing approved/pending/rejected membership return payloads so `apps/dfarm-customer-app` (`useAuth.ts`) dairy selection and switching continue working unchanged.

### B. Control-Plane Error Propagation (`PostgresCustomerMembershipRepository.ts`)
- Replaced silent `catch { return null / [] / 0 }` blocks in `findGlobalIdentityByPhone`, `listMembershipsByGlobalId`, `findMembership`, and `getMembershipCount` with explicit `TenantDatabaseUnavailableError('CONTROL_PLANE', 'CONTROL_PLANE_UNAVAILABLE', ...)` (`503`).
- Removed silent error suppression in `updateMembershipStatus` so persistence errors propagate cleanly rather than returning false success.

### C. Bounded Admin Reconciliation (`ReconcileCustomerMembershipsUseCase`)
- Added an explicit, bounded, organization-scoped administrative command [`ReconcileCustomerMembershipsUseCase`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/application/use-cases/customers/GetCustomerMembershipsUseCase.ts) (exported via [`use-cases/index.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/application/use-cases/index.ts)):
  - Requires valid UUID `organizationId` (`getStrictTenantDb(organizationId)`) — never calls `getAllTenantDbs()`.
  - Supports bounded batch (`limit`, capped) inside one specified tenant DB, ensures `global_customer_identities` + `customer_dairy_memberships` exist idempotently (`ON CONFLICT` / safe duplicate checks), and returns structured per-customer audit outcomes (`reconciled`, `skipped`, `errors`).

### D. Customer Anti-IDOR & Route DB Tightening (`customers.routes.ts`)
- **`GET /api/v1/customers/memberships`:** Non-staff tokens (`FARMER_CUSTOMER`, `GUEST_FARMER`) cannot query another customer's `globalCustomerId` or `phone` — returns `403` even if JWT omits `phoneNumber`. Staff callers other than `SUPER_ADMIN` require `customers:read` permission (checked upfront) and match only within authorized scope.
- **`POST /api/v1/customers/switch-dairy`:** Customers cannot spoof body `globalCustomerId`, `tenantCustomerId`, or `phone` to switch into or forge tokens for another farmer (`403`).
- **`DELETE /:id` (soft-delete) & `POST /:id/restore`:** Replaced permissive tenant/central lookup fallbacks with `getStrictTenantDb(organizationId)`.

---

## 3. Verification Evidence (`pg-mem` + Supertest)

Verified in [`restart032-operational-repository-isolation.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart032-operational-repository-isolation.test.js) Section `3` (`3.1`–`3.4`) and [`multi-dairy-membership.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/multi-dairy-membership.test.js) (`9/9` PASS):
- `3.1`: Monkeypatching `tenantDbManager.getAllTenantDbs` to throw confirms `GetCustomerMembershipsUseCase` never calls it and returns authoritative Dairy A & Dairy B memberships.
- `3.2`: Customer holding `multiTokenA` receives `403` when attempting to spoof `phone` or `globalCustomerId` on `GET /customers/memberships` or `POST /customers/switch-dairy`.
- `3.4`: `ReconcileCustomerMembershipsUseCase` rejects missing `organizationId`, reconciles unindexed tenant customers idempotently within a single specified org only, and preserves Dairy B isolation.
