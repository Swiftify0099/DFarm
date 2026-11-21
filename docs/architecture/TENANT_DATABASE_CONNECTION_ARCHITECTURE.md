# DFarm — Tenant Database Connection Architecture

**Document ID:** DFARM-ARCH-005  
**Version:** 1.0.0  
**Phase:** Prompt 01 Baseline Implementation  
**Status:** APPROVED ARCHITECTURAL SPECIFICATION

---

## 1. Overview & Connection Lifecycle

The DFarm backend connects to a managed PostgreSQL cluster housing dozens or hundreds of tenant databases. To guarantee stability and prevent resource exhaustion, connection lifecycle management is strictly governed by `TenantDatabaseManager` ([TenantDatabaseManager.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/database/TenantDatabaseManager.ts)).

```
  Incoming Request (JWT Claim: org_id: dairy_a)
                      │
                      ▼
        requireTenantContext Middleware
                      │
                      ▼
         TenantDatabaseManager.getTenantDb(dairy_a)
                      │
        ┌─────────────┴─────────────┐
        │ In Tenant Pool Cache?     │
        └─────────────┬─────────────┘
               YES    │     NO
          ┌───────────┘     └───────────┐
          ▼                             ▼
   Return pg.Pool Client     1. Read dairy_database_mappings
                             2. Decrypt connection URI (AES-256-GCM)
                             3. Initialize bounded pg.Pool (max: 5)
                             4. Cache pool in tenantPools Map
                             5. Return wrapped client
```

---

## 2. Bounded Connection Pools & Idle Eviction

Every active tenant pool adheres to strict resource bounds:
- **`max` Connections per Dairy:** 5 (`config.TENANT_POOL_MAX`).
- **`idleTimeoutMillis`:** 30,000 ms (`config.TENANT_POOL_IDLE_TIMEOUT_MS`).
- **`connectionTimeoutMillis`:** 5,000 ms (`config.TENANT_POOL_CONNECTION_TIMEOUT_MS`).
- **Eviction / Reclamation:** If a dairy has no traffic for 30 seconds, idle database sockets are released back to the PostgreSQL cluster.
- **Graceful Shutdown:** `closeAllPools()` cleanly ends all open pools during SIGTERM / server shutdown.

---

## 3. Credential Encryption with AES-256-GCM

Connection strings for tenant databases often contain database user credentials and passwords. They are **never stored in plaintext**.
- Encryption Engine: `CredentialEncryption` ([CredentialEncryption.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/security/CredentialEncryption.ts)).
- Cipher: `aes-256-gcm`.
- IV: Cryptographically secure 12-byte random initialization vector per record.
- Authentication Tag: 16-byte GCM tag ensuring ciphertext integrity and authenticity.
- Serialized Format: `<iv_hex>:<auth_tag_hex>:<ciphertext_hex>`.
- Any tampering with the ciphertext or auth tag immediately throws an authentication error and fails closed.

---

## 4. Elimination of Cross-Tenant Scatter-Gather Queries (DF-FIND-014 Resolution)

Previous implementations iterated over `getAllTenantDbs()` to find records when `organizationId` was omitted. This caused:
- Severe latency spikes across hundreds of tenant databases.
- Potential cross-tenant data leakage.
- Massive connection churn.

**Remediation:**
1. All repository methods (`findById`, `findByPhone`, `findByRfid`, `findByFarmerCode`, `listCustomers`) require tenant context (`organizationId`).
2. Single-ID public status polling (`GET /api/v1/customers/:id/status`) uses the central `customer_tenant_lookup` index table in `dfarm_central` to resolve the single authoritative `organizationId` without multi-database scans.
3. Scatter-gather loops across tenant databases are completely eliminated from the production repository layer.
