# Database Connection and Transaction Audit

**Execution Reference:** DFARM-MASTER-BACKEND-API-RECOVERY

---

## 1. Connection Pool Architecture

- **Central PostgreSQL Pool:** Single managed connection pool connecting to `dfarm_central`. Handles global identity, dairy registry, platform governance, and AMC subscriptions.
- **Tenant Database Manager:** Dynamic connection pool factory mapping each active cooperative to its physical tenant database `dfarm_tenant_<code_hash>`.
- **Zombie Process Resolution:** Windows host had a stopped WSL Docker container with zombie `com.docker.backend` holding TCP port 54322 in SYN_RECV state. Process termination restored immediate `ECONNREFUSED` handling (<1ms) allowing automatic fallback to isolated in-memory test doubles during headless test suites.

---

## 2. Transaction Boundaries & Idempotency

- **Milk Intake & Subledger Credit:** Executed inside atomic `BEGIN ... COMMIT` transaction. Failure at any point rolls back collection record, quality readings, and subledger journal entries.
- **Idempotency Keys:** Enforced via `idempotencyKey` column with unique index on `milk_collections` and `ledger_transactions`. Replaying identical sync batches safely returns existing receipt without double credit.
