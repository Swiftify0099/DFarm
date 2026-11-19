# DFarm — Tenant Database Provisioning State Machine

**Document ID:** DFARM-ARCH-007  
**Version:** 1.0.0  
**Phase:** Prompt 01 Baseline Implementation  
**Status:** APPROVED ARCHITECTURAL SPECIFICATION

---

## 1. Provisioning Lifecycle & State Machine

When a Super Admin registers a new Dairy on the DFarm platform, a dedicated PostgreSQL database must be physically provisioned, migrated, verified, and mapped before the dairy admin is invited or activated.

The provisioning state machine progresses through 6 deterministic states:

```
  [PENDING]
      │
      ▼ (Super Admin Onboarding Initiated)
  [PROVISIONING] ──► Record created in dairy_database_mappings
      │
      ▼ (PostgreSQL Cluster: CREATE DATABASE "dfarm_tenant_<code_hash>")
  [DATABASE_CREATED]
      │
      ▼ (Execute Operational Migrations 001 - 027)
  [MIGRATING]
      │
      ▼ (Insert & Verify tenant_metadata record)
  [VERIFYING]
      │
      ▼ (Health checks pass, pool bounded & cached)
  [ACTIVE]
      │
      └── (On Any Error at Any Step) ──► [FAILED] (Record failure cause, do NOT emit fake 201)
```

---

## 2. State Definitions and Invariants

| State | Invariants & Operational Actions | Error Transition |
|---|---|---|
| `PENDING` | Initial tenant registration record exists in `organizations`. Mapping row queued. | N/A |
| `PROVISIONING` | Master provisioner connects to PostgreSQL maintenance catalog (`postgres`). Safe DB identifier generated. | On connection failure -> `FAILED` |
| `DATABASE_CREATED` | Physical SQL statement `CREATE DATABASE "..." WITH ENCODING = 'UTF8'` completed successfully. | On SQL error / quota limit -> `FAILED` |
| `MIGRATING` | Applies the complete tenant operational migration track (`001` through `027`) using `MigrationRunner.runTenantMigrations()`. | On DDL error -> `FAILED` |
| `VERIFYING` | Inserts `tenant_metadata` containing the central `dairy_id` and verifies readback. | On mismatch / query error -> `FAILED` |
| `ACTIVE` | Encrypted connection URI stored in central mapping. Ready for production dairy traffic. | N/A |
| `FAILED` | Explicit failure state. `provisioning_error` contains the diagnostic stack trace. UI receives truthful 500 error; no fake success. | May be retried via Super Admin retry endpoint |

---

## 3. Database Naming Convention

Database names on the PostgreSQL cluster must conform to PostgreSQL identifier rules (max 63 characters) and provide human-readable traceability for database administrators:

```typescript
public generateTenantDatabaseName(dairyId: string, dairyCode: string): string {
  const cleanCode = dairyCode.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20);
  const idPrefix = dairyId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
  const dbName = `dfarm_tenant_${cleanCode}_${idPrefix}`;
  return dbName.slice(0, 63);
}
```

**Examples:**
- Gokul Dairy (`a0000000-0000-0000-0000-000000000001` / `GOKUL_KOLHAPUR`):
  -> `dfarm_tenant_gokul_kolhapur_a00000000000`
- Warana Dairy (`b0000000-0000-0000-0000-000000000002` / `WARANA_DAIRY`):
  -> `dfarm_tenant_warana_dairy_b00000000000`

---

## 4. Truthful Error Handling (No Fake HTTP 201)

If the cluster is offline, disk quota is full, or database creation fails:
- The backend records `provisioning_status = 'FAILED'` and the exact error message in `dairy_database_mappings.provisioning_error`.
- The API immediately throws a descriptive exception and returns HTTP 500 Internal Server Error (or 503 Service Unavailable).
- The system **never** returns a fake HTTP 201 Created while silently falling back to in-memory databases.
