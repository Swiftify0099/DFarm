# DFarm RESTART-03.3 — Ledger Concurrency & Idempotency Remediation Report

**Phase:** `RESTART-03.3`  
**Date:** `2026-11-27`  
**Repository / Branch:** `Swiftify0099/DFarm` (`fix/cloudflare-pages-production-deploy`)  
**Local & Public Remote Base HEAD:** `ea8bf416136afab9cc692edde7394827d1d96081` (`RESTART-03.3` changes uncommitted locally; remote untouched)  
**Classification:** `PARTIAL — SOURCE FIXES VERIFIED IN PG-MEM OFFLINE; REAL POSTGRESQL 17 EXECUTION BLOCKED`

---

## 1. Root Cause

In [`PostgresLedgerRepository.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/repositories/PostgresLedgerRepository.ts) (at `ea8bf41`), `PostgresLedgerRepository.save(account, newEntry, options)` and `appendEntry()` exhibited transaction-ordering and concurrency defects:
1. **Pre-Lock Idempotency Check + Premature Account Mutation (`save()`):** `save()` checked `ledger_transactions` for `idempotency_key` *before* acquiring `SELECT ... FOR UPDATE` on `customer_ledger_accounts`. It then immediately executed `UPDATE customer_ledger_accounts SET current_balance = account.currentBalance` (or `INSERT`) *before* inserting `ledger_transactions` with `ON CONFLICT (idempotency_key) DO NOTHING`. Two concurrent identical requests could both pass the initial idempotency lookup; the second would block on `FOR UPDATE`, overwrite `current_balance` with its stale in-memory `account.currentBalance`, then see 0 rows from `ON CONFLICT DO NOTHING` and `return`, committing the stale balance update.
2. **Stale In-Memory Balance Calculation (`save()`):** Concurrent distinct `save()` calls computed `current_balance` and `balance_after` from in-memory `account.currentBalance` / `newEntry.runningBalance` instead of locked database state, causing lost updates.
3. **Unprotected Initial Account Creation (`save()`):** When `customer_ledger_accounts` had no row yet, `save()` performed a bare `INSERT` without `ON CONFLICT (customer_id)` handling, risking `23505` races on concurrent first-entry writes.
4. **Pre-Lock Idempotency Check (`appendEntry()`):** `appendEntry()` checked `idempotency_key` prior to locking `customer_ledger_accounts`, requiring a secondary post-conflict recheck instead of authoritative post-lock idempotency resolution.

---

## 2. Exact Files Changed

| File | Change Summary |
| :--- | :--- |
| [`PostgresLedgerRepository.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/repositories/PostgresLedgerRepository.ts) | Extracted `lockOrCreateLedgerAccount()` and `executeJournalMutation()`; unified `appendEntry()` and `save()` (when `newEntry` is supplied) onto strict post-lock transaction ordering; removed stale in-memory `account.currentBalance` overwrite; enforced atomic `ON CONFLICT (customer_id)` account initialization. |
| [`ports/index.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/application/ports/index.ts) | Defined `LedgerSaveActorOptions` (`{ operatorId: string; idempotencyKey?: string }`) and overloaded `ILedgerRepository.save()` so `newEntry` requires `options`. |
| [`restart032-operational-repository-isolation.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart032-operational-repository-isolation.test.js) | Added subtest `2.2b` testing `PostgresLedgerRepository.save()` mandatory actor, concurrent duplicate entry ID, concurrent credit/debit race from stale snapshots, and idempotent replay. |
| [`restart033-real-postgres-repositories.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart033-real-postgres-repositories.test.js) | Created real PostgreSQL 17 suite exercising `PostgresLedgerRepository`, `PostgresCollectionTransactionRepository`, and `PostgresShiftSessionRepository` across 3 isolated PG17 databases (`SKIP` when PG17 unavailable). |

---

## 3. Old Versus New Behavior

| Aspect | Old Behavior (`ea8bf41`) | New Behavior (`RESTART-03.3`) |
| :--- | :--- | :--- |
| **Transaction Ordering (`save()` & `appendEntry()`)** | Idempotency check -> `FOR UPDATE` -> `UPDATE customer_ledger_accounts` (`save()`) -> `INSERT ledger_transactions ON CONFLICT DO NOTHING` -> `INSERT ledger_entries` | `validateCustomerCenterAndOperator()` -> `lockOrCreateLedgerAccount()` (`FOR UPDATE` / `ON CONFLICT (customer_id) DO UPDATE`) -> re-check idempotency `(idempotency_key = $1 OR id = $2)` -> return replay before any mutation -> compute `newBal` from locked DB `current_balance` -> `INSERT ledger_transactions` -> `INSERT` 2 balanced `ledger_entries` lines -> `UPDATE customer_ledger_accounts`. |
| **Balance Authority** | `save()` wrote `account.currentBalance` and `newEntry.runningBalance` | Computes `newBal = Math.round((currentBalance ± roundedAmount + Number.EPSILON) * 100) / 100` exclusively from locked DB row. |
| **Account Row Initialization** | Bare `INSERT` in `save()` | `ON CONFLICT (customer_id) DO UPDATE SET updated_at = NOW() WHERE customer_ledger_accounts.organization_id = EXCLUDED.organization_id RETURNING id, current_balance`. |
| **Account-Only `save(account)`** | Overwrote `current_balance` on existing rows | Initializes row if absent (`ON CONFLICT DO UPDATE` no-op on balance); never overwrites existing concurrent journal balances. |

---

## 4. Database Ownership, Actor & Organization Context, Idempotency & Concurrency

- **Database Ownership:** All ledger reads and writes resolve strictly via `getStrictTenantDb(organizationId)` (`PostgresLedgerRepository.getAuthorizedTenantDb`). Zero `getAllTenantDbs()` scans and zero control-plane `db` dual-writes exist.
- **Actor & Organization Context:** `organizationId` is UUID-validated; `validateCustomerCenterAndOperator()` verifies customer, primary center, and active non-customer operator in the target tenant DB before acquiring locks.
- **Idempotency Behavior:** Unique constraints `ledger_transactions.idempotency_key` (`009_customer_ledger.sql`) and `ledger_transactions.id` are re-checked *after* acquiring the `customer_ledger_accounts` row lock and cross-checked with `ON CONFLICT (idempotency_key) DO NOTHING`. Cross-customer key collisions raise `DomainValidationError('...', 'IDEMPOTENCY_CONFLICT')`. Replays return prior to any `UPDATE` or `INSERT`.
- **Concurrency Proof:**
  - **Offline `pg-mem` (`txMutex` + `db.backup()` rollback):** Verified in `restart032-operational-repository-isolation.test.js` (`16/16` PASS, `EXIT=0`), covering concurrent `appendEntry()` credits, concurrent `save()` duplicate entry IDs, concurrent `save()` credit/debit races with stale snapshots, subsequent idempotent replay, and mid-transaction `ledger_entries` failure rollback.
  - **Real PostgreSQL 17 (`FOR UPDATE` row locks across independent `pg.Pool` connections):** Implemented in `restart033-real-postgres-repositories.test.js` (covers all 10 Phase 1.C cases including same entry ID, same idempotency key, two credits, two debits, credit/debit race, committed replay, mid-tx failures, and same customer UUID across Dairy A and Dairy B), currently `SKIP / NOT RUN` on host (`DF-030`).

---

## 5. SQL, Migration Execution & Test Evidence

- **Schema Constraints Verified:** `009_customer_ledger.sql` (`customer_ledger_accounts(customer_id) UNIQUE`, `ledger_transactions(idempotency_key) UNIQUE`, `created_by REFERENCES users(id) ON DELETE RESTRICT`) and `019_customer_accounting_and_double_entry_ledger.sql` (`chk_ledger_txn_type`, `chk_ledger_ref_entity`, `chk_entry_account_type`). No production migrations were modified.
- **Exact Commands & Observed Outputs:**
  - `npm run build:backend` -> `EXIT=0`
  - `$env:NODE_ENV='test'; $env:TENANT_POOL_CONNECTION_TIMEOUT_MS='500'; node --test services/backend/tests/restart032-operational-repository-isolation.test.js` -> `# tests 16, # pass 16, # fail 0, # skipped 0, EXIT=0` (`pg-mem` offline double)
  - `$env:NODE_ENV='test'; node --test services/backend/tests/restart033-real-postgres-repositories.test.js` -> `# tests 1, # pass 0, # fail 0, # skipped 1, EXIT=0` (`SKIP / NOT RUN` — PG17 unavailable)
  - `$env:REQUIRE_REAL_POSTGRES='1'; $env:TEST_POSTGRES_URL=''; node --test services/backend/tests/restart033-real-postgres-repositories.test.js` -> `# tests 1, # pass 0, # fail 1, EXIT=1`

---

## 6. Status, Local vs Remote & Remaining Blockers

- **Real PostgreSQL Status:** `BLOCKED / NOT RUN` locally (`dockerDesktopLinuxEngine` pipe absent, `psql`/`pg_ctl` not installed).
- **CI Workflow Status:** `CI PREPARED — NOT EXECUTED` (`.github/workflows/dfarm-restart03-postgres17.yml`).
- **Local vs Remote State:** Remote `origin/fix/cloudflare-pages-production-deploy` is at `ea8bf41`; `RESTART-03.3` edits are local uncommitted changes (no commit/push performed).
- **Remaining Blockers & Next Phase Dependency:** Execute real PostgreSQL 17 gate (`DF-030` via `docker-compose.pg17-verify.yml` or GitHub Actions) before closing `DF-016` and proceeding to `RESTART-04`.
