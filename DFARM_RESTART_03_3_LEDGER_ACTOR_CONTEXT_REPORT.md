# DFarm RESTART-03.3 — Ledger Actor Context & Identity Enforcement Report

**Phase:** `RESTART-03.3`  
**Date:** `2026-11-27`  
**Repository / Branch:** `Swiftify0099/DFarm` (`fix/cloudflare-pages-production-deploy`)  
**Local & Public Remote Base HEAD:** `ea8bf416136afab9cc692edde7394827d1d96081` (`RESTART-03.3` changes uncommitted locally; remote untouched)  
**Classification:** `PARTIAL — SOURCE & COMPILE-TIME CONTRACT VERIFIED; REAL POSTGRESQL 17 EXECUTION BLOCKED`

---

## 1. Root Cause

Domain entity `LedgerEntry` (`services/backend/src/domain/entities/CustomerLedgerAccount.ts`) does not carry `createdBy` or `operatorId` properties. Prior to `RESTART-03.3`:
1. `ILedgerRepository.save(account, newEntry?, options?: { operatorId?: string })` allowed TypeScript callers to invoke `save(account, newEntry)` *without* supplying `options.operatorId`, deferring missing-actor rejection solely to runtime.
2. `PostgresLedgerRepository.save()` read `(newEntry as any).createdBy || (newEntry as any).operatorId` as an untyped fallback before checking `options?.operatorId`.

---

## 2. Exact Files Changed

| File | Change Summary |
| :--- | :--- |
| [`ports/index.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/application/ports/index.ts) | Added `LedgerSaveActorOptions` (`{ operatorId: string; idempotencyKey?: string }`) and replaced optional-options `save()` signature with strict TypeScript overloads: `save(account)` and `save(account, newEntry, options)`. |
| [`PostgresLedgerRepository.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/repositories/PostgresLedgerRepository.ts) | Enforced strict `LedgerSaveActorOptions` overloads on `save()`, removed untyped `(newEntry as any).createdBy/operatorId` fallback, and required valid UUID `options.operatorId` whenever `newEntry` is supplied (`INVALID_OPERATOR` if missing/invalid). |
| [`customer-data-lifecycle-e2e.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/customer-data-lifecycle-e2e.test.js) | Added assertion confirming `ledgerRepo.save(ledgerA, ledgerEntry)` without actor rejects (`INVALID_OPERATOR`) and updated line 359 to pass real seeded `{ operatorId: operatorAId }`. |

---

## 3. Old Versus New Behavior & Production Call Site Audit

- **Old Behavior:** `ledgerRepo.save(account, entry)` compiled without `options`; runtime fallback inspected untyped properties on `newEntry`.
- **New Behavior:** Calling `ledgerRepo.save(account, entry)` without `{ operatorId }` fails TypeScript compilation (`tsc`) and throws `DomainValidationError(..., 'INVALID_OPERATOR')` at runtime.
- **Call Site Audit Across `services/backend/src`:**
  - [`ledger.routes.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/presentation/routes/ledger.routes.ts#L182-L191): `POST /adjustment` uses `authenticate` + `authorizePermission('billing:manage')`, passes `organizationId` from verified `req.user` (or `SUPER_ADMIN` selection), and passes `operatorId: req.user.userId` (ignoring any `req.body.operatorId`).
  - [`collections.routes.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/presentation/routes/collections.routes.ts#L811-L821): `POST /transactions/:id/adjust` passes `operatorId: req.user!.userId` into `ledgerRepo.appendEntry(...)`.
  - [`collections.routes.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/presentation/routes/collections.routes.ts#L469-L524) & [`sync.routes.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/presentation/routes/sync.routes.ts#L42-L128): Milk intake and sync handlers pass `operatorId: req.user.userId` into `ProcessMilkIntakeUseCase` -> `PostgresCollectionTransactionRepository.saveAtomicIntake()`.
  - Zero `ledgerRepo.save()` call sites existed in `services/backend/src`; zero default/fake operator UUIDs or null `created_by` paths remain.

---

## 4. Database Ownership, Actor/Org Context, Idempotency & Concurrency

- **Database Ownership:** Strictly per-dairy isolated tenant DB via `getStrictTenantDb(organizationId)`.
- **Actor & Organization Context:** `validateCustomerCenterAndOperator()` verifies inside the tenant transaction that:
  1. Customer exists, belongs to `organizationId`, and `is_deleted = FALSE`.
  2. Primary center exists in `dairy_centers` and belongs to `organizationId`.
  3. Operator exists in tenant `users`, `status === 'ACTIVE'`, role is non-empty and NOT `FARMER_CUSTOMER` / `GUEST_FARMER` / `CUSTOMER`, and `users.organization_id === organizationId` (unless `SUPER_ADMIN` / `PLATFORM_OPERATOR`).
- **Idempotency & Concurrency:** Both `save()` and `appendEntry()` validate actor context before acquiring the `FOR UPDATE` account lock and re-checking idempotency.

---

## 5. SQL, Migration Execution & Test Evidence

- **Migrations:** Relies on `009_customer_ledger.sql` (`created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT`) and `003_user_identity_foundation.sql`.
- **Exact Commands & Observed Outputs:**
  - `npm run build:backend` -> `EXIT=0` (`tsc` across `shared-types`, `shared-validation`, `database`, `backend`).
  - `node --test services/backend/tests/restart032-operational-repository-isolation.test.js` -> `16/16` PASS (`EXIT=0`, `pg-mem`).
  - `node --test services/backend/tests/customer-data-lifecycle-e2e.test.js` -> `9/9` PASS (`EXIT=0`, `pg-mem`, asserts `INVALID_OPERATOR` without actor and passes with `operatorAId`).
  - `node --test services/backend/tests/restart033-real-postgres-repositories.test.js` -> `1` skipped (`EXIT=0`, PG17 unreachable).

---

## 6. Status, Local vs Remote & Remaining Blockers

- **Real PostgreSQL Status:** `BLOCKED / NOT RUN` locally.
- **CI Workflow Status:** `CI PREPARED — NOT EXECUTED` (`.github/workflows/dfarm-restart03-postgres17.yml`).
- **Local vs Remote State:** Remote at `ea8bf41`; local uncommitted `RESTART-03.3` updates preserved.
- **Remaining Blockers & Next Phase Dependency:** Execute real PG17 verification (`DF-030`) so PG `23503` FK + `validateCustomerCenterAndOperator()` enforcement is proven on physical PostgreSQL 17 before `RESTART-04`.
