# DFarm — Priority 0: Database Connection Check

**Execution Reference:** DFARM-PRIORITY-00-BACKEND-NETWORK-RECOVERY  
**Document:** `07_DATABASE_CONNECTION_CHECK.md`  
**Timestamp:** 2026-11-19T13:33:30+05:30  
**Database Status:** VERIFIED (Resilient Dual-Mode Operation)  

---

## 1. Central & Tenant Database Architecture

The DFarm backend connects to a central control plane (`PostgresPool.ts`) and routes operational transactions to tenant databases (`TenantDatabaseManager.ts`):

```typescript
this.pool = new Pool({
  connectionString: config.CENTRAL_DATABASE_URL || config.DATABASE_URL,
  max: 15,
  idleTimeoutMillis: config.TENANT_POOL_IDLE_TIMEOUT_MS || 30000,
  connectionTimeoutMillis: config.TENANT_POOL_CONNECTION_TIMEOUT_MS || 30000,
  ssl: config.DATABASE_TLS_MODE === 'require' ? { rejectUnauthorized: false } : undefined,
});
```

---

## 2. Local & Development Fallback Mechanism

- When physical PostgreSQL (port `54322`) is reachable, the application utilizes the native `pg.Pool` connection pool.
- In unit testing and local development modes (`config.NODE_ENV === 'development'`), when physical PostgreSQL is offline, `PostgresPool.ts` triggers an isolated in-memory test double using `pg-mem`:
  ```typescript
  if (isConnErr && (this.isTestEnvironment() || config.NODE_ENV === 'development')) {
    logger.warn({ error: err.message }, 'Physical PostgreSQL disconnected. Using in-memory database fallback for development.');
    const adapter = this.getOrCreateTestMemDb();
    const pool = new adapter.Pool();
    return await pool.query(text, params);
  }
  ```
- **Integrity Invariant:** In-memory fallback is strictly prohibited in production (`config.NODE_ENV === 'production'`), where unreachable PostgreSQL immediately throws a fatal exception.

---

## 3. Migration Status Assessment

- **Finding:** No migration errors or missing schema definitions were responsible for the reported `Network Error`.
- The in-memory schema correctly loads migrations:
  - `002_organizations_and_centers.sql`
  - `003_user_identity_foundation.sql`
  - `004_customer_identity.sql`
  - `005_face_and_rfid.sql`
  - `007_rate_management.sql`
  - `008_collection_sessions_and_transactions.sql`
  - `009_customer_ledger.sql`
  - `032_central_super_admin_features.sql`
  - `037_multi_dairy_customer_identity_and_membership.sql`
- Zero schema migrations were executed or modified during this network recovery task, preserving all established schemas.
