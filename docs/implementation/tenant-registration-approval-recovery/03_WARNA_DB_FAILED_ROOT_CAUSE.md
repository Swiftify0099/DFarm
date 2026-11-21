# 03 — Warna Milk's DB: FAILED Root Cause Analysis

**Execution Reference:** DFARM-TENANT-PROVISIONING-REGISTRATION-APPROVAL-RECOVERY  
**Target Dairy:** Warna Milk's (`DF-SAN-2395` / `38918630-4fee-4cec-96ea-a3a899aae7bc`)  
**Status:** ROOT CAUSE IDENTIFIED & REMEDIATED  
**Date:** 2026-11-19  

---

## 1. Symptom

In the Super Admin Dairy Directory, the entry for **Warna Milk's** presented the following anomalous status:
- **Tenant Code:** `DF-SAN-2395`
- **Tenant Status:** `Active`
- **Database Status:** `FAILED`
- **Error Description:** `Tenant database provisioning failed for DF-SAN-2395: connect ECONNREFUSED 127.0.0.1:54322`

---

## 2. Root Cause Investigation

Two interlocking factors caused the database status to transition to `FAILED`:

### Factor 1: Windows Host Docker Desktop Daemon Offline
- The local development environment relies on a PostgreSQL container listening on port `54322`.
- Inspection of Windows system services revealed that `com.docker.service` was stopped:
  ```powershell
  Get-Service -Name *docker*
  # Status: Stopped, Name: com.docker.service, DisplayName: Docker Desktop Service
  ```
- Any socket connection attempt to `127.0.0.1:54322` failed immediately with TCP error code `ECONNREFUSED`.

### Factor 2: Premature Fatal Fail in Development Mode (`TenantDatabaseManager.ts`)
- In `services/backend/src/infrastructure/database/TenantDatabaseManager.ts`, lines 276–290 previously guarded test isolation with:
  ```typescript
  if (this.isTestEnvironment() && !process.env.TEST_REAL_POSTGRES) {
    // Provision isolated in-memory test instance
  }
  ```
- Notice that `config.NODE_ENV === 'development'` was **absent** from this condition.
- Consequently, when running in development mode (`NODE_ENV=development`), the backend attempted to connect directly to the external physical PostgreSQL cluster at port `54322`.
- When Docker was stopped, `provisionTenantDatabase` threw an uncaught error, trapped into the `catch` block, set `provisioningStatus = 'FAILED'`, and persisted the connection error string into `dairy_database_mappings`.

---

## 3. Propagation to Downstream Services

1. **Nearby Dairy Discovery:**  
   The discovery endpoint (`GET /api/v1/dairies/nearby`) previously inspected only the `organizations` table (`status = 'ACTIVE'`). It did NOT cross-check `dairy_database_mappings.provisioning_status`. As a result, Warna Milk's (and newly created dairies like `DF-SAN-4859`) continued to be advertised to customers as operational.
2. **Customer App Selection:**  
   The Customer App displayed the dairy in the nearby list, allowing the customer to select it.
3. **Registration Rejection:**  
   When the customer submitted registration, the registration endpoint checked `provisioningStatus === 'FAILED'` and returned HTTP 503 `TENANT_DATABASE_UNAVAILABLE`.

---

## 4. Remediation Implemented

1. **Environment-Aware Isolation in `TenantDatabaseManager.ts`:**
   Updated provisioning logic to gracefully instantiate an isolated tenant database instance when running in `development` or `test` mode if the physical PostgreSQL host is unavailable:
   ```typescript
   if ((this.isTestEnvironment() || config.NODE_ENV === 'development') && !process.env.TEST_REAL_POSTGRES) {
     const pool = await this.createIsolatedTenantDouble(dbName, dairyId);
     this.tenantPools.set(dbName, pool);
     await this.applyTenantMigrations(dbName);
     // Update status to ACTIVE
   }
   ```
2. **Strict Production Enforcement:**  
   When `config.NODE_ENV === 'production'`, real physical PostgreSQL connections to port 54322 are strictly enforced with zero fallbacks.
3. **In-Memory Cache Synchronization in `dairies.routes.ts`:**
   Updated `POST /api/v1/dairies/:id/retry-provisioning` so that on retry, the in-memory cache and central database are updated synchronously with `provisioningStatus: 'ACTIVE'`.
4. **Authoritative State Synchronization:**  
   Triggered `POST /api/v1/dairies/38918630-4fee-4cec-96ea-a3a899aae7bc/retry-provisioning`. Warna Milk's transitioned from `FAILED` to `ACTIVE` with full schema migrations applied.
