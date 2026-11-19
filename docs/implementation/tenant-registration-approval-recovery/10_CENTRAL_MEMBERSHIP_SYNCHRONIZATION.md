# 10 — Central Membership Synchronization & Multi-Dairy Architecture

**Execution Reference:** DFARM-TENANT-PROVISIONING-REGISTRATION-APPROVAL-RECOVERY  
**Scope:** Multi-Dairy Identity & `customer_dairy_memberships`  
**Status:** ARCHITECTED & TESTED  
**Date:** 2026-11-19  

---

## 1. Dual-Tier Data Model

DFarm resolves the challenge of physical multi-tenancy vs global customer identity through a dual-tier model:

1. **Global Control Plane (`dfarm_central`):**
   - Stores global identity (`users` / `global_customers`) keyed by phone number (`+91 7755995615`).
   - Stores `customer_dairy_memberships` mapping one global identity to multiple independent dairies.
   - Central membership tracks high-level state: `PENDING_APPROVAL`, `APPROVED`, `SUSPENDED`, `REJECTED`.

2. **Isolated Tenant Plane (`dfarm_tenant_*`):**
   - Stores full operational details: legal farmer name, bank account, milk collections, rate charts, and daily ledger.
   - Each tenant database has complete autonomy over its internal customer IDs and sequential `farmer_code` assignment.

---

## 2. Multi-Dairy Membership Lifecycle

A farmer can supply cow milk to Dairy A in the morning and buffalo milk to Dairy B in the evening.

### Supported Operations:
- **Single Phone, Multiple Dairies:** An Indian mobile number can have membership across distinct dairies simultaneously.
- **Strict Intra-Dairy Uniqueness:** Within a single dairy, a phone number can only have ONE active or pending membership. Duplicate attempts return HTTP 400 `DUPLICATE_MEMBERSHIP_REQUEST`.
- **Independent Approval Lifecycle:** Approval or rejection in Dairy A has zero impact on membership status in Dairy B.

---

## 3. Live Test Verification

During end-to-end verification, the system executed the following real-world scenario for user `+917755995615`:

1. **Membership 1 (Dairy: Shivshakti Milk's / `DF-SAN-9500`):**
   - Registered → `PENDING_APPROVAL`
   - Dairy Admin approved → Status: `APPROVED`, Farmer Code: `C-101`
2. **Membership 2 (Dairy: Warna Milk's / `DF-SAN-2395`):**
   - Registered independently → `PENDING_APPROVAL`
3. **Duplicate Prevention Verification:**
   - Attempted second registration under `Warna Milk's` for `+917755995615`.
   - Result: HTTP 400 Bad Request (`Registration already pending or active for this dairy`).
4. **Central Memberships Query:**
   `GET /api/v1/customers/memberships` returned:
   ```json
   {
     "success": true,
     "data": [
       {
         "dairyId": "ebe4b636-b652-403e-9de3-bb2922bd0773",
         "dairyName": "Shivshakti Milk's",
         "status": "APPROVED",
         "farmerCode": "C-101"
       },
       {
         "dairyId": "38918630-4fee-4cec-96ea-a3a899aae7bc",
         "dairyName": "Warna Milk's",
         "status": "PENDING_APPROVAL",
         "farmerCode": null
       }
     ]
   }
   ```

This proves that multi-dairy membership is functional and cleanly decoupled.
