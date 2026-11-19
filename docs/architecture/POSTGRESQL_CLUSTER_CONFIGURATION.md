# DFarm — PostgreSQL Managed Cluster Configuration & Topology

**Document ID:** DFARM-ARCH-001  
**Version:** 1.0.0  
**Phase:** Prompt 01 Baseline Implementation  
**Status:** APPROVED ARCHITECTURAL SPECIFICATION

---

## 1. Executive Summary & Cluster Topology

DFarm enforces an owner-approved, non-negotiable multi-tenant topology:
**ONE MANAGED POSTGRESQL CLUSTER + ONE CENTRAL CONTROL-PLANE DATABASE (`dfarm_central`) + ONE SEPARATE OPERATIONAL POSTGRESQL DATABASE FOR EVERY DAIRY (`dfarm_tenant_<dairy_code>_<uuid_prefix>`).**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       MANAGED POSTGRESQL CLUSTER                            │
│                  (PostgreSQL 15+ / Supabase / AWS RDS)                      │
│                                                                             │
│  ┌─────────────────────────┐         ┌─────────────────────────┐            │
│  │      dfarm_central      │         │   dfarm_tenant_gokul    │            │
│  │ (Central Control Plane) │         │ (Dairy A Operational DB)│            │
│  │                         │         │                         │            │
│  │ - organizations         │         │ - customers             │            │
│  │ - dairy_database_       │         │ - face_enrollments      │            │
│  │   mappings              │         │ - rfid_cards            │            │
│  │ - user_identity_base    │         │ - milk_collections      │            │
│  │ - customer_tenant_lookup│         │ - rate_charts           │            │
│  │ - activation_tokens     │         │ - double_entry_ledger   │            │
│  │ - super_admin_audit     │         │ - feed_inventory        │            │
│  └─────────────────────────┘         └─────────────────────────┘            │
│                                                                             │
│  ┌─────────────────────────┐         ┌─────────────────────────┐            │
│  │   dfarm_tenant_warana   │         │   dfarm_tenant_rajhans  │            │
│  │ (Dairy B Operational DB)│         │ (Dairy C Operational DB)│            │
│  │                         │         │                         │            │
│  │ - Isolated tables       │         │ - Isolated tables       │            │
│  │ - Independent sequences │         │ - Independent sequences │            │
│  │ - Dedicated ledger      │         │ - Dedicated ledger      │            │
│  └─────────────────────────┘         └─────────────────────────┘            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Architectural Distinctions:
- **Database-per-Dairy:** Physical database boundary within the managed cluster. No data mixing.
- **NEVER Schema-per-Dairy:** Schema-per-dairy is strictly prohibited as a silent downgrade.
- **NEVER Shared Database with `dairy_id` columns:** Cross-tenant leakage is physically impossible at the storage level because Dairy A and Dairy B live in separate PostgreSQL catalog databases (`datname`).

---

## 2. Cluster Resource Sizing & Connection Pools

### 2.1 Cluster Sizing (Production Baseline)
- **Minimum Engine:** PostgreSQL 15.4 or higher with UTF-8 encoding.
- **Extensions Installed:** `uuid-ossp`, `pgcrypto`.
- **Max Connections (`max_connections`):** Minimum 200–500 across the cluster.
- **Shared Buffers (`shared_buffers`):** 25% of available RAM.
- **Work Memory (`work_mem`):** 16MB per connection for analytical sorting and ledger summaries.

### 2.2 Application Connection Pooling (Bounded `pg.Pool`)
To prevent connection starvation across many dairy tenants on a single PostgreSQL cluster:
- **Control Plane Pool (`PostgresPool.ts`):**
  - Pool Size: Max 10 connections.
  - Idle Timeout: 30,000 ms.
  - Connection Timeout: 5,000 ms.
- **Tenant Database Pools (`TenantDatabaseManager.ts`):**
  - Pool Size Per Dairy: Max 5 connections (`config.TENANT_POOL_MAX`).
  - Idle Timeout: 30,000 ms (`config.TENANT_POOL_IDLE_TIMEOUT_MS`).
  - Connection Timeout: 5,000 ms (`config.TENANT_POOL_CONNECTION_TIMEOUT_MS`).
  - Automatic Eviction: Inactive dairy pools are pruned on idle timeout; reconnected lazily on incoming traffic.

---

## 3. Environment Configuration & Connection Strings

All cluster connectivity is configured through environment variables validated in `services/backend/src/config/env.ts`:

| Environment Variable | Description | Production Example |
|---|---|---|
| `CENTRAL_DATABASE_URL` | Control plane connection URI | `postgresql://dfarm_app:Secret@db.cluster.internal:5432/dfarm_central?sslmode=require` |
| `DATABASE_PROVISIONER_URL` | Cluster admin role URI with `CREATEDB` | `postgresql://dfarm_provisioner:AdminSecret@db.cluster.internal:5432/postgres?sslmode=require` |
| `TENANT_DB_ENCRYPTION_KEY` | 32-byte secret for AES-256-GCM credentials | `0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef` |
| `DATABASE_TLS_MODE` | Enforce TLS 1.3 across all cluster traffic | `require` / `verify-full` |
| `TENANT_POOL_MAX` | Max pool size per active dairy | `5` |
| `TENANT_POOL_IDLE_TIMEOUT_MS` | Idle connection eviction timeout | `30000` |
| `TENANT_POOL_CONNECTION_TIMEOUT_MS` | Connection attempt deadline | `5000` |

---

## 4. Truthful Connection & Runtime Invariants

1. **No Silent Fallback to Volatile Memory in Operational Runtimes:**
   - In `production` and `development` modes, connection failure (`ECONNREFUSED`, `ENOTFOUND`, authentication failure) immediately halts backend startup or throws 503 Service Unavailable.
   - Volatile in-memory mock databases (`pg-mem`) are strictly isolated to `NODE_ENV === 'test'` or `node --test` test harnesses.
2. **Encrypted Credentials at Rest:**
   - Individual tenant connection URIs are encrypted using AES-256-GCM with authenticated data (AAD) before storage in `dairy_database_mappings.connection_uri_encrypted`.
   - Passwords and credentials never appear in plaintext in database records, application logs, or error responses.
