# 02 — Selected Dairy & Tenant Database Mapping Audit

**Execution Reference:** DFARM-TENANT-PROVISIONING-REGISTRATION-APPROVAL-RECOVERY  
**Scope:** Central Database Mappings (`dfarm_central`) & Tenant Database Resolution  
**Status:** AUDITED & VERIFIED  
**Date:** 2026-11-19  

---

## 1. Central Registry Architecture

DFarm operates a multi-tenant architecture with a central control-plane database (`dfarm_central`) and separate isolated PostgreSQL physical/logical databases for each individual dairy cooperative:

- **Central Database:** `dfarm_central`
  - Stores global organizations (`organizations`), user accounts (`users`), tenant mappings (`dairy_database_mappings`), and customer global memberships (`customer_dairy_memberships`).
- **Tenant Databases:** `dfarm_tenant_<code_hash>_<uuid_prefix>`
  - Stores tenant-scoped operational data: `customers`, `pending_registrations`, `farmer_profiles`, `milk_collections`, `milk_rates`, `farmer_ledgers`.

---

## 2. Tenant Database Naming Formula

The authoritative database naming standard implemented in `TenantDatabaseManager.ts` is:

```typescript
const cleanCode = dairyCode.toLowerCase().replace(/[^a-z0-9]/g, '_');
const cleanId = dairyId.replace(/-/g, '').slice(0, 12);
const dbName = `dfarm_tenant_${cleanCode}_${cleanId}`;
```

### Deterministic Examples:
1. **Warna Milk's** (`DF-SAN-2395` / `38918630-4fee-4cec-96ea-a3a899aae7bc`):
   - Database Name: `dfarm_tenant_df_san_2395_389186304fee`
2. **Shivshakti Milk's** (`DF-SAN-4859` / `d9e4629c-b086-4c99-a0ec-4057ac6092ab`):
   - Database Name: `dfarm_tenant_df_san_4859_d9e4629cb086`
3. **Shivshakti Milk's Test** (`DF-SAN-9500` / `ebe4b636-b652-403e-9de3-bb2922bd0773`):
   - Database Name: `dfarm_tenant_df_san_9500_ebe4b636b652`

---

## 3. Central Mapping Table Audit

The table `dairy_database_mappings` in `dfarm_central` acts as the single source of truth for routing:

```sql
SELECT dairy_id, tenant_code, database_name, provisioning_status, migration_version, is_active 
FROM dairy_database_mappings;
```

### Verified Mapping Records:

| dairy_id | tenant_code | database_name | provisioning_status | migration_version | is_active |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `38918630-4fee-4cec-96ea-a3a899aae7bc` | `DF-SAN-2395` | `dfarm_tenant_df_san_2395_389186304fee` | `ACTIVE` | 37 | true |
| `d9e4629c-b086-4c99-a0ec-4057ac6092ab` | `DF-SAN-4859` | `dfarm_tenant_df_san_4859_d9e4629cb086` | `ACTIVE` | 37 | true |
| `ebe4b636-b652-403e-9de3-bb2922bd0773` | `DF-SAN-9500` | `dfarm_tenant_df_san_9500_ebe4b636b652` | `ACTIVE` | 37 | true |

---

## 4. Tenant Database Resolution Pipeline

When an API request arrives, the backend resolves the tenant database through the following strict sequence:

1. **Context Extraction:**  
   The request provides tenant context via header `x-tenant-id` (tenant code or UUID) or via request body `dairyId`.
2. **Registry Lookup:**  
   The backend queries `dairy_database_mappings` using `dairyId` or `tenant_code`.
3. **Provisioning Status Check:**  
   If `provisioning_status !== 'ACTIVE'`, request is halted with HTTP 503 (`TENANT_DATABASE_UNAVAILABLE`).
4. **Pool Pool Allocation:**  
   If active, `TenantDatabaseManager.getTenantDb(dairyId)` retrieves or initializes a connection pool targeting `dbName`.
5. **Schema Validation:**  
   Verifies table existence (`customers`, `pending_registrations`) before dispatching repository operations.

This guarantees that customer registrations cannot be written to the central database or to the wrong tenant.
