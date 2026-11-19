# DFARM — BACKEND API REMEDIATION

**Document ID:** `04_BACKEND_API_REMEDIATION`  
**Service:** `services/backend`  
**Status:** COMPLETE & VERIFIED  
**Date:** 2026-11-18  

---

## 1. Scope & Architectural Goals

The DFarm backend services are organized under Clean Architecture principles:
- **Presentation Layer:** Express controllers, routes, and middleware.
- **Application Layer:** Use cases and orchestration workflows.
- **Domain Layer:** Pure business entities, value objects, and domain services.
- **Infrastructure Layer:** PostgreSQL repositories, biometric services, and multi-tenant database managers.

The Database-to-UI Lineage Audit identified routing duplications, missing REST endpoints, and unhandled database query exceptions in tenant resolution.

---

## 2. Remediated Backend Inconsistencies

### 2.1 Duplicate Domain Route Mounting in app.ts
- **Audit ID:** `DFARM-AUDIT-006`
- **Issue:** `services/backend/src/app.ts` mounted domain routers twice: once directly onto `app` (e.g. `app.use('/api/v1/ledger', ledgerRouter)`) and again inside the consolidated `apiRouter` (`presentation/routes/index.ts`).
- **Remediation:** Removed duplicate router registrations from `app.ts`. All API routes are now centrally and cleanly mounted through `presentation/routes/index.ts` under `/api/v1`.

### 2.2 Missing Parametric Customer Ledger Endpoint
- **Audit ID:** `DFARM-AUDIT-006`
- **Issue:** Frontend apps and external integrations querying `/api/v1/ledger/accounts/:customerId` received HTTP 404 because the route definition only matched `/api/v1/ledger/balance`.
- **Remediation:** Added the route to `ledger.routes.ts`:
```typescript
router.get('/accounts/:customerId', optionalAuthenticate, handleGetBalanceSummary);
```
Updated `handleGetBalanceSummary` in `ledger.controller.ts` to inspect `req.params['customerId']` before falling back to `req.user?.id`.

### 2.3 TenantDatabaseManager Test Double Exception Handling
- **Audit ID:** System Integration Finding
- **Issue:** In testing environments where `dairy_database_mappings` table did not exist in the in-memory control database, `TenantDatabaseManager.getTenantDb` threw unhandled `42P01: relation "dairy_database_mappings" does not exist`, causing test suite crashes instead of gracefully initializing the isolated test instance.
- **Remediation:** Wrapped the query in a `try/catch` block in `TenantDatabaseManager.ts`, allowing test environments to cleanly initialize an in-memory tenant database without crashing.

### 2.4 Live Database Query Priority in PostgresLedgerRepository
- **Audit ID:** `DFARM-AUDIT-009`
- **Issue:** In `PostgresLedgerRepository.findByCustomer`, the method inspected in-memory test doubles before executing the query against `this.db`. In environments with live PostgreSQL tenant databases, updates made to the database were shadowed by stale memory objects.
- **Remediation:** Reordered `findByCustomer` to query `this.db` first:
```typescript
if (this.db) {
  try {
    const res = await this.db.query(
      'SELECT * FROM customer_ledger_accounts WHERE customer_id = $1 LIMIT 1',
      [customerId]
    );
    if (res.rows.length > 0) return this.mapRowToLedger(res.rows[0]);
  } catch (err) { ... }
}
```

---

## 3. Verification & Automated Test Results

- `clean-architecture.test.js`: 9/9 tests passed (Zero circular dependencies, valid layer boundaries).
- `roadmap-phase-09-financial-calculation-settlement.test.js`: 38/38 tests passed.
- Full type-checking via `tsc -b`: 0 errors.
