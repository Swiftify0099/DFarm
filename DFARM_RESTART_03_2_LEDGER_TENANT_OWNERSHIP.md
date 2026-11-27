# DFarm RESTART-03.2 — Financial Ledger Repository Tenant Ownership

**Phase:** `RESTART-03.2`  
**Date:** `2026-11-27`  
**Remote & Local Base HEAD:** `47f97db6ce1e29952547b6946f303f59666ee694`  
**Primary Component:** [`PostgresLedgerRepository.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/repositories/PostgresLedgerRepository.ts)

---

## 1. Vulnerabilities Remediated

Before `RESTART-03.2`, `PostgresLedgerRepository`, `CustomerLedgerUseCases`, and `ledger.routes.ts` contained severe tenant-isolation and relational integrity defects:
1. Optional `organizationId` allowed `findByCustomer`, `save`, and `listEntries` to scan `getAllTenantDbs()`, fall back to central `db.query`, and swallow DB failures as empty lists `[]` or `null`.
2. Missing center/operator references fell back to hardcoded `'00000000-0000-0000-0000-000000000002'`, unscoped `SELECT id FROM users LIMIT 1`, or auto-inserted fake operators inside the repository.
3. Tenant ledger mutations attempted unapproved duplicate writes to control-plane `db.query('UPDATE customer_ledger_accounts ...')` outside tenant ACID boundaries.
4. `ledger.routes.ts` defined a local `getTenantDb()` helper that caught tenant DB lookup errors and fell back to central `db`, and `/adjustment` passed `undefined` operator identity.

---

## 2. Authoritative Tenant Ownership & Write Guarantees

### A. Canonical Balance Ownership
Per migrations `019_ledger_core.sql` and `031_dairy_database_mappings.sql` and DFarm's tenant-isolated architecture, **`customer_ledger_accounts` and `ledger_transactions` live authoritatively inside each dairy's isolated tenant database**. Central control-plane DB is **not** a ledger balance authority; unapproved central balance dual-writes were removed completely.

### B. Repository Hardening ([`PostgresLedgerRepository.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/repositories/PostgresLedgerRepository.ts))
- Removed central `db` import, `getAllTenantDbs()`, central balance dual-writes, `'00000000-...002'` default center, unscoped `users` queries, and fake operator creation.
- **Read Methods (`findById`, `findByCustomer`, `listEntries`):** Validate UUID `organizationId`, resolve strictly via `getStrictTenantDb(organizationId)`, filter every query by both `organization_id` and `customer_id`, distinguish not-found from `503` DB errors, and propagate failures cleanly.
- **Pre-Write Validation (`validateCustomerCenterAndOperator`):** Inside `tenantDb.withTransaction`:
  1. Verifies `customer` exists and `customers.organization_id === organizationId` (`CustomerNotFoundError` / `ForbiddenTenantError`).
  2. Verifies `centerId` exists in `dairy_centers` and `dairy_centers.organization_id === organizationId` (`DomainValidationError` if missing/cross-tenant).
  3. Requires explicit UUID `operatorId` and verifies it exists in tenant `users` with `users.organization_id === organizationId` (`DomainValidationError`: `'Valid authenticated operator ID is required for ledger transactions.'` / `'Authorized operator not found in target dairy organization.'`).
- **Atomic `FOR UPDATE` Balance Integrity:** Both `appendEntry()` and `save()` lock `customer_ledger_accounts` with `SELECT ... FROM customer_ledger_accounts WHERE customer_id = $1 FOR UPDATE`, verify `organization_id` ownership, perform idempotency pre-checks + `ON CONFLICT (idempotency_key) DO NOTHING`, insert `ledger_transactions`, and update `customer_ledger_accounts` atomically inside one tenant transaction. Existing balance math (`Math.round(... * 100) / 100`) and double-entry direction rules were preserved unchanged (`RESTART-06` scope untouched).

### C. Use Cases & Routes ([`CustomerLedgerUseCases.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/application/use-cases/ledger/CustomerLedgerUseCases.ts), [`ledger.routes.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/presentation/routes/ledger.routes.ts))
- `GetCustomerKhataSummaryUseCase`, `GetCustomerLedgerEntriesUseCase`, and `GetCustomerBillsUseCase` require valid `organizationId`, call `getStrictTenantDb(organizationId)`, and constrain `milk_bills` queries with `mb.organization_id = $3`.
- Removed the local `getTenantDb()` central fallback helper from `ledger.routes.ts`; `GET /entries` and `POST /adjustment` resolve strictly via `getStrictTenantDb(organizationId)` and forward authenticated `organizationId`, verified customer ID, and `operatorId: req.user.userId` into `ledgerRepo.appendEntry`.

---

## 3. Verification Evidence (`pg-mem` + Supertest)

Verified in [`restart032-operational-repository-isolation.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart032-operational-repository-isolation.test.js) Section `2` (`2.1`, `2.2`, `2.3` all PASS):
- Missing/invalid `organizationId` fails closed (`400`).
- Cross-tenant customer/center/operator writes are rejected and **zero** synthetic `users` or central `customer_ledger_accounts` rows are created.
- Simulated `INSERT INTO ledger_entries` failure triggers atomic rollback of both `customer_ledger_accounts.current_balance` and `ledger_entries`.
- Concurrent `Promise.all` `appendEntry` calls serialize cleanly via `pg-mem` transaction mutex without lost balance updates (and real PG17 `FOR UPDATE` concurrency is tested in `restart032-real-postgres.test.js`, currently `SKIP` until Docker/PG17 is available).
- HTTP `GET /api/v1/ledger/entries` blocks cross-dairy queries (`403`) and propagates unmapped tenant DB outages (`503`).
- Legacy test `customer-data-lifecycle-e2e.test.js:343` fails at `ledgerRepo.save(ledgerA, ledgerEntry)` explicitly with `'Valid authenticated operator ID is required for ledger transactions.'`, confirming the insecure fallback removal took effect.
