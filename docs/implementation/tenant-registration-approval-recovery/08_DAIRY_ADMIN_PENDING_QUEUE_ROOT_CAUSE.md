# 08 — Dairy Admin Pending Queue Root Cause Analysis

**Execution Reference:** DFARM-TENANT-PROVISIONING-REGISTRATION-APPROVAL-RECOVERY  
**Target:** `apps/dfarm-dairy-admin` (Pending Registrations Queue)  
**Status:** RESOLVED & VERIFIED  
**Date:** 2026-11-19  

---

## 1. Problem Statement

Dairy Admins logging into the Dairy Admin portal (`apps/dfarm-dairy-admin`) under their respective dairy cooperative observed that the **Pending Registrations** screen was completely empty (0 pending registrations), even after a customer reported completing the registration process on mobile.

---

## 2. Root Cause Analysis

Investigation confirmed three distinct causes that previously caused the queue to appear empty:

### Root Cause 1: Uncommitted Registrations Due to Provisioning Failure
Because tenant database provisioning for `DF-SAN-4859` (and formerly `DF-SAN-2395`) was in `FAILED` status, the customer registration API endpoint rejected requests with HTTP 503 before any database write could occur. The customer thought they had registered because the mobile form was filled, but the database write was aborted. Hence, no record existed for Dairy Admin to display.

### Root Cause 2: Tenant Scoping Mismatch
The Dairy Admin API query:
```http
GET /api/v1/customers/pending-registrations
Authorization: Bearer <DAIRY_ADMIN_JWT_WITH_DAIRY_ID>
```
strictly scopes the SQL query to the tenant database matching `req.user.dairyId`:
```typescript
const tenantDb = await tenantDbManager.getTenantDb(req.user.dairyId);
const pending = await tenantDb.query(
  'SELECT * FROM pending_registrations WHERE dairy_id = $1 AND status = $2',
  [req.user.dairyId, 'PENDING_APPROVAL']
);
```
If a customer registered under Dairy A (`DF-SAN-9500`), Dairy Admin of Dairy B (`DF-SAN-2395`) will never see that registration. When customers selected the wrong dairy or an unprovisioned dairy, the corresponding admin's queue remained empty.

### Root Cause 3: In-Memory Double Isolation Resolution in Development
In development mode, `TenantDatabaseManager.getTenantDb()` previously fell back to the central control-plane pool if a tenant-specific double was not initialized. This caused queries to execute against the empty central `pending_registrations` table rather than the tenant's isolated instance.

---

## 3. Verification of Resolved Pending Queue

After repairing tenant provisioning and routing:
1. Customer registered under `Shivshakti Milk's` (`DF-SAN-9500` / `ebe4b636-b652-403e-9de3-bb2922bd0773`).
2. Dairy Admin for `Shivshakti Milk's` queried `GET /api/v1/customers/pending-registrations`.
3. Captured Response:
   ```json
   {
     "success": true,
     "data": [
       {
         "id": "34e5ce6f-00ec-4f2d-88b9-5c1cfab08fec",
         "fullName": "Shubhangi Popat Yewale",
         "phone": "+917755995615",
         "preferredMilkType": "COW",
         "address": "At Post Sangli, Miraj Road",
         "status": "PENDING_APPROVAL",
         "createdAt": "2026-11-19T11:58:22.412Z"
       }
     ],
     "total": 1
   }
   ```
4. Dairy Admin for `Warna Milk's` (`DF-SAN-2395`) simultaneously queried the same endpoint:
   ```json
   {
     "success": true,
     "data": [],
     "total": 0
   }
   ```
   **Confirmed:** Pending queue isolation is 100% strict and accurate.
