# DFARM — Module 5: Database Diagnostics & Connection Health Manager

**Execution Reference:** `DFARM-SUPER-ADMIN-TENANT-DATABASE-CONTROL`  
**Backend Infrastructure:** `services/backend/src/infrastructure/database/TenantDatabaseManager.ts` & `TenantDatabaseControlService.ts`  
**API Endpoint:** `POST /api/v1/super-admin/tenants/:dairyId/database/actions/verify-connection`  
**Status:** FULLY IMPLEMENTED AND VERIFIED  

---

## 1. Connection Pool Management & Isolation

DFarm manages connections to tenant databases using `TenantDatabaseManager`. Each tenant database maintains its own dedicated PostgreSQL pool instance:
- Dedicated connection string encrypted with AES-256-GCM.
- Per-tenant connection limits (`max: 10`, `idleTimeoutMillis: 30000`).
- Strict eviction lifecycle: idle tenant connection pools are evicted after 5 minutes of inactivity to preserve PostgreSQL server resources.
- Active reconnection: When a request arrives for a tenant whose pool was evicted, `TenantDatabaseManager` transparently re-initializes the pool using the decrypted credentials from `dairy_database_mappings`.

---

## 2. Dynamic Connection Verification

Super Admin can trigger an on-demand connection verification check against any tenant database.

### Verification Flow:
1. Super Admin clicks "Verify Connection" in the Tenant Database Control Console.
2. Backend acquires a client from the tenant's isolated connection pool.
3. Executes a live roundtrip probe:
   ```sql
   SELECT 1 as alive, NOW() as server_time;
   ```
4. Measures precise latency in milliseconds (`latencyMs = Date.now() - start`).
5. Updates `last_verified_at` timestamp in `dairy_database_mappings` in the central database.
6. Returns diagnostic telemetry to the UI:
   ```json
   {
     "success": true,
     "databaseName": "dfarm_tenant_baramati_coop_d00000000000",
     "latencyMs": 4,
     "health": "HEALTHY",
     "details": "Connection verified in 4ms. Server time: 2026-11-20T01:18:11.839Z"
   }
   ```

---

## 3. Disconnection & Error Handling

If the tenant database is unreachable (e.g. network partition, cluster restart, credentials invalid):
- The probe catches the error without crashing the server.
- Health status is marked `CONNECTION_FAILED` or `UNAVAILABLE`.
- Error details are returned to Super Admin with recommended remediation steps (Retry Provisioning, Check Network, Reconcile Mapping).
- Customer App discovery automatically marks that dairy as `isRegistrationEligible = false`, preventing new farmers from selecting a broken dairy.
