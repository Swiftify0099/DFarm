# Tenant Provisioning DB: FAILED Root Cause & Lifecycle State Machine

**Document Reference:** `docs/implementation/customer-tenant-approval-fix/02_TENANT_PROVISIONING_DB_FAILED_ROOT_CAUSE.md`  
**Execution Reference:** `DFARM-CUSTOMER-TENANT-REGISTRATION-APPROVAL-FIX`  
**Status:** COMPLETE & ROOT CAUSE RESOLVED  

---

## 1. Problem Statement

In the Super Admin Dairy Directory screenshot, "Warna Milk's" (`DF-SAN-2395`) displayed:
- **Tenant Status:** `Active`
- **Database Status:** `FAILED`

The audit investigated how a dairy can be in active business status while database provisioning has failed, why it occurred, and how the system prevents unprovisioned databases from silently accepting customer registrations.

---

## 2. Root Cause Analysis

### 2.1 Physical Infrastructure Reality
The backend database provisioning engine uses PostgreSQL connection string derived from environment configuration:
- Base cluster URI: `postgresql://postgres:postgres@127.0.0.1:54322/postgres` (managed by local Docker container).
- On the Windows host machine, the Windows Docker Desktop service (`com.docker.service`) was stopped.
- As a result, TCP connection to `127.0.0.1:54322` failed immediately with `ECONNREFUSED`.

### 2.2 Provisioning State Machine Transition
When `POST /api/v1/dairies` was called to onboard Warna Milk's:
1. `TenantDatabaseManager.provisionTenantDatabase()` entered `PROVISIONING` state.
2. Attempted `new pg.Pool({ connectionString: adminUri })` to execute `CREATE DATABASE "dfarm_tenant_df_san_2395_389186304fee"`.
3. Caught error: `connect ECONNREFUSED 127.0.0.1:54322`.
4. Transitioned `provisioningStatus = 'FAILED'` and recorded `provisioningError = 'CRITICAL: Tenant database provisioning failed for DF-SAN-2395: connect ECONNREFUSED 127.0.0.1:54322'`.
5. In `dairies.routes.ts`, the provisioning error was caught and logged with `logger.error`, but the HTTP response still returned HTTP 201 Created with business status `active`.
6. Therefore, Super Admin displayed:
   - Business status: `Active` (organization profile complete)
   - Database status: `FAILED` (provisioning failed at step 3)

```mermaid
stateDiagram-v2
    [*] --> PROVISIONING: POST /dairies
    PROVISIONING --> DATABASE_CREATED: CREATE DATABASE succeeds
    PROVISIONING --> FAILED: ECONNREFUSED 127.0.0.1:54322
    DATABASE_CREATED --> MIGRATING: Run operational migrations
    MIGRATING --> VERIFYING: Check tenant_metadata table
    VERIFYING --> ACTIVE: Handshake verified
    FAILED --> PROVISIONING: POST /:id/retry-provisioning
```

---

## 3. The Dangerous Silent Fallback Defect (Repaired)

In the original code (`TenantDatabaseManager.ts` lines 428-434):
```typescript
if (!mapping || mapping.provisioningStatus !== 'ACTIVE') {
  if (config.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production') {
    logger.info({ dairyId }, 'No isolated tenant database found; using control plane database fallback in development.');
    return this.getControlPlaneDb(); // <-- VIOLATION
  }
  throw new Error(`No active persistent database mapping found for dairy: ${dairyId}`);
}
```

### Why this was dangerous:
When a dairy's tenant database provisioning was `FAILED`, customer registrations were silently routed into the central control plane database (`dfarm_central`). If multiple dairies had failed databases, their customers, collections, and ledgers would have collided in the control plane table, destroying physical tenant isolation.

---

## 4. Architectural Fix & Invariant Hardening

1. **Strict Tenant Database Availability Check:**
   In `TenantDatabaseManager.ts`:
   ```typescript
   if (mapping && mapping.provisioningStatus === 'FAILED') {
     throw new TenantDatabaseUnavailableError(
       dairyId,
       'FAILED',
       mapping.provisioningError || 'Tenant database provisioning failed'
     );
   }
   ```
2. **Safe Rejection on Registration:**
   In `customers.routes.ts` (`POST /customers/register`):
   ```typescript
   const tenantMapping = tenantDbManager.getTenantMapping(targetOrgId);
   if (tenantMapping && tenantMapping.provisioningStatus === 'FAILED') {
     res.status(503).json({
       success: false,
       code: 'TENANT_DATABASE_UNAVAILABLE',
       error: `Selected dairy tenant database (${tenantMapping.dairyCode}) is unavailable (provisioning status: FAILED). Customer registration cannot proceed until database provisioning is resolved.`,
     });
     return;
   }
   ```
3. **Idempotent Retry-Provisioning Workflow:**
   Super Admin can trigger `POST /api/v1/dairies/:id/retry-provisioning`. Once Docker is started (`Start-Service com.docker.service`), retry creates the physical database, runs migrations 001-037, verifies tenant metadata, and transitions status to `ACTIVE`.
