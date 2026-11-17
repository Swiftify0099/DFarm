# DFARM — MULTI-DATABASE TENANT PROVISIONING ARCHITECTURE & SPECIFICATION

**Authoritative Technical Document**  
**Component Scope**: Super Admin Web → Control Plane Database → Tenant Database Manager → Tenant Operational Databases  
**Architectural Invariant**: Strict database-level isolation between dairies. Dairy A data must never co-mingle with Dairy B data.

---

## 1. Multi-Database Architecture Overview

DFarm enforces a strict separation between the **Platform Control Plane** and **Dairy Tenant Operational Databases**:

```
                       ┌───────────────────────────────────────────────┐
                       │          PLATFORM CONTROL PLANE DB            │
                       │───────────────────────────────────────────────│
                       │ • organizations (Registry & Profiles)         │
                       │ • dairy_database_mappings (Tenant Catalogs)   │
                       │ • users (Global Platform & Admin Identities)   │
                       │ • dairy_admin_invitations (Pending Invites)   │
                       └──────────────────────┬────────────────────────┘
                                              │ Tenant Database Manager
                      ┌───────────────────────┴───────────────────────┐
                      │                                               │
                      ▼                                               ▼
      ┌───────────────────────────────┐               ┌───────────────────────────────┐
      │     TENANT OPERATIONAL DB     │               │     TENANT OPERATIONAL DB     │
      │           (DAIRY A)           │               │           (DAIRY B)           │
      │───────────────────────────────│               │───────────────────────────────│
      │ • customers (Patil, Ramesh)   │               │ • customers (Chavan, Suresh)  │
      │ • face_enrollments (Vectors)  │               │ • face_enrollments (Vectors)  │
      │ • kiosk_shift_sessions        │               │ • kiosk_shift_sessions        │
      │ • milk_collections (Txns)     │               │ • milk_collections (Txns)     │
      │ • rate_charts & versions      │               │ • rate_charts & versions      │
      │ • customer_ledger_accounts    │               │ • customer_ledger_accounts    │
      │ • ledger_transactions         │               │ • ledger_transactions         │
      └───────────────────────────────┘               └───────────────────────────────┘
```

---

## 2. Tenant Database Mapping Catalog (`dairy_database_mappings`)

Established via migration `supabase/migrations/031_dairy_database_mappings.sql`:

```sql
CREATE TABLE IF NOT EXISTS dairy_database_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dairy_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    dairy_code VARCHAR(30) NOT NULL,
    database_name VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL DEFAULT 'ISOLATED_INSTANCE',
    connection_uri_encrypted TEXT,
    schema_version VARCHAR(50) NOT NULL DEFAULT 'v1.0.0',
    provisioning_status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    provisioning_error TEXT,
    provisioned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Supported Resource Types
1. **`PHYSICAL_DATABASE`**: Dedicated PostgreSQL database created via `CREATE DATABASE "dfarm_tenant_..."`. Used in production environments with superuser or RDS/Cloud SQL database-creation privileges.
2. **`DEDICATED_SCHEMA`**: Dedicated PostgreSQL schema created via `CREATE SCHEMA "tenant_<dairy_id>"` with isolated `search_path`. Used when cloud PostgreSQL provider restricts database provisioning.
3. **`ISOLATED_INSTANCE`**: Isolated in-memory database instance powered by `pg-mem` with dedicated virtual storage, tables, indexes, and constraints. Active during development, offline kiosk operation, or local failover when port 54322 is unavailable.

---

## 3. Provisioning Workflow Execution (`TenantDatabaseManager.ts`)

When Super Admin creates a new Dairy via `POST /api/v1/dairies`:

1. **Unique Dairy ID Generation**: A cryptographically random UUID is generated for the organization.
2. **Database Identifier Derivation**:
   ```typescript
   const cleanCode = dairyCode.toLowerCase().replace(/[^a-z0-9]/g, '_');
   const dbName = `dfarm_tenant_${cleanCode}_${dairyId.slice(0, 8)}`;
   ```
3. **Resource Provisioning**:
   - Tests physical PostgreSQL connection via `testPool.query('SELECT 1')`.
   - If connected, provisions physical database or dedicated schema.
   - If offline/restricted, spawns an isolated virtual instance.
4. **Operational Migration Application**:
   Executes migrations `002` through `028` on the isolated tenant database:
   - `002_organizations_and_centers.sql`: Core structure & collection shifts.
   - `003_user_identity_foundation.sql`: Users & role definitions.
   - `004_customer_identity.sql`: Customers & registration constraints.
   - `005_face_and_rfid.sql`: Biometrics, face models, RFID card registry.
   - `006_customer_identification_audit.sql`: Real-time identification logs.
   - `007_rate_management.sql`: Rate charts, versions, pricing grid cells.
   - `008_collection_sessions_and_transactions.sql`: Collection sessions & intake transactions.
   - `009_customer_ledger.sql`: Customer ledger accounts & journal entries.
   - `010_devices_sync_and_audit.sql`: Hardware devices & sync telemetry.
   - `027_kiosk_shift_sessions_and_sface128_seed.sql`: Shift sessions & SFace INT8 seed.
   - `028_dairy_location_coordinates_and_address.sql`: Location & spatial schema.
5. **Metadata & User Replication**:
   - Replicates the specific dairy's `organizations` profile.
   - Replicates that dairy's `dairy_centers`.
   - Replicates that dairy's authorized `users` (Admin, Operators, Super Admin).
6. **Catalog Registration**:
   Persists the active mapping record in `dairy_database_mappings` on the control plane.

---

## 4. Current Environment Tenant Database State

As verified during our end-to-end integration tests:

| Dairy Name | Dairy Code | Tenant Database Name | Resource Type | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Gokul Primary Cooperative** | `GOKUL-01` | `dfarm_tenant_gokul_01_00000000` | `ISOLATED_INSTANCE` | **ACTIVE** |
| **Warna Sahakari Dudh** | `WARNA-01` | `dfarm_tenant_warna_01_00000000` | `ISOLATED_INSTANCE` | **ACTIVE** |
| **Sahyadri Organic Milk Fed.** | `DF-KOP-0118` | `dfarm_tenant_df_kop_0118_00000000` | `ISOLATED_INSTANCE` | **ACTIVE** |
| **kalpna mlik's** | `DF-SAN-8897` | `dfarm_tenant_df_san_8897_e363070f` | `ISOLATED_INSTANCE` | **ACTIVE** |

---

## 5. Super Admin API Integration Endpoints

- **`POST /api/v1/dairies`**: Creates dairy, provisions isolated database, seeds initial center and admin.
- **`GET /api/v1/dairies/tenant-databases`**: Returns health and mapping status for all tenant databases:
  ```json
  {
    "success": true,
    "count": 4,
    "data": [
      {
        "dairyId": "00000000-0000-0000-0000-000000000001",
        "dairyCode": "GOKUL-01",
        "databaseName": "dfarm_tenant_gokul_01_00000000",
        "resourceType": "ISOLATED_INSTANCE",
        "schemaVersion": "v1.0.0",
        "provisioningStatus": "ACTIVE",
        "isHealthy": true
      }
    ]
  }
  ```
