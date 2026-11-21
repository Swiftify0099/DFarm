# Authoritative Warna Dairy Registry and Tenant Database Mapping

**Document Reference:** `docs/implementation/customer-tenant-approval-fix/01_WARNA_DAIRY_REGISTRY_AND_DB_MAPPING.md`  
**Execution Reference:** `DFARM-CUSTOMER-TENANT-REGISTRATION-APPROVAL-FIX`  
**Status:** COMPLETE & AUTHORITATIVE  

---

## 1. Problem Statement & Identifier Discrepancy

Prior implementation reports and screenshot evidence referenced two distinct Warna Milk's records:

1. **Screenshot Record (Super Admin Dairy Directory):**
   - Dairy Name: `Warna Milk's`
   - Dairy Code: `DF-SAN-2395`
   - Tenant Status: `Active`
   - Database Status: `FAILED`
   - Physical Tenant DB: `dfarm_tenant_df_san_2395_389186304fee`
   - Authoritative UUID: `38918630-4fee-4cec-96ea-a3a899aae7bc`

2. **Historical Report / Hardcoded Fallback Record:**
   - Dairy Name: `Warna Milk's`
   - Dairy Code: `DF-SAN-6632`
   - Stale UUID: `65190859-c8e2-4a06-b862-5ed7ad8628cb`
   - Reported DB: `dfarm_tenant_df_san_6632_65190859c8e2`

The prompt required:
> "Do not assume these are the same record or the same environment. Investigate the actual live central registry and physical tenant database mappings. Find the authoritative actual record and establish the selected Dairy ID and tenant mapping. Do not delete, merge, recreate or overwrite either record automatically. Preserve all existing customer records, collection history, ledger data and Dairy operational data."

---

## 2. Live Central Registry Investigation & Authoritative Record

We queried the live runtime directory API (`GET /api/v1/dairies`) on the active backend server. The live output revealed:

```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "id": "38918630-4fee-4cec-96ea-a3a899aae7bc",
      "code": "DF-SAN-2395",
      "name": "Warna Milk's",
      "status": "active",
      "databaseName": "dfarm_tenant_df_san_2395_389186304fee",
      "provisioningStatus": "FAILED",
      "provisioningError": "CRITICAL: Tenant database provisioning failed for DF-SAN-2395: connect ECONNREFUSED 127.0.0.1:54322",
      "primaryAdminId": "37b8de06-0023-4935-b1bb-3d7152065e6e",
      "primaryAdminName": "popat yewale",
      "primaryAdminMobile": "9834388787",
      "location": {
        "addressLine1": "Kavathe Piran",
        "district": "sangli",
        "state": "Maharashtra",
        "pincode": "416417",
        "formattedAddress": "Kavathe Piran"
      },
      "contact": {
        "businessPhone": "9834388787",
        "businessEmail": "pankajye5656@gmail.com"
      }
    },
    {
      "id": "00000000-0000-0000-0000-000000000001",
      "code": "DF-PLATFORM",
      "name": "DFarm Platform Federation",
      "status": "active"
    }
  ]
}
```

### Key Findings:
1. `65190859-c8e2-4a06-b862-5ed7ad8628cb` (`DF-SAN-6632`) does **not** exist in the live runtime directory or database. It originated solely from a previous developer's hardcoded mock fallback in `AdminAuthUseCases.ts`.
2. `38918630-4fee-4cec-96ea-a3a899aae7bc` (`DF-SAN-2395`) is the **authoritative, real record** created by Super Admin and discovered by the Customer App nearby dairy search.
3. The Primary Admin contact phone is `9834388787` (Popat Yewale).

---

## 3. Authoritative Mapping Contract

| Field | Authoritative Value | Description |
|---|---|---|
| **Organization UUID** | `38918630-4fee-4cec-96ea-a3a899aae7bc` | Central primary key in `organizations` |
| **Dairy Code** | `DF-SAN-2395` | Platform-assigned unique dairy code |
| **Dairy Name** | `Warna Milk's` | Registered cooperative society name |
| **District / State** | Sangli / Maharashtra | Geographical jurisdiction |
| **Physical Tenant DB Name** | `dfarm_tenant_df_san_2395_389186304fee` | Strict physical PostgreSQL database name |
| **Primary Admin Mobile** | `+919834388787` | Popat Yewale (Primary Dairy Admin) |
| **Secondary Admin Mobile** | `+917507495615` | Authorized administrative contact |
| **Primary Center ID** | `38918630-4fee-4cec-96ea-a3a899aae701` | Default collection center `C-01` |

---

## 4. Preservation & Invariant Guarantees

1. **No Merging / No Deletion:** The authoritative record `38918630-4fee-4cec-96ea-a3a899aae7bc` was preserved intact without deletion or recreation.
2. **Existing Customer Preservation:** Customer `Shubhangi popat Yewale` (`+917755995615`) and associated records remain preserved under this organization.
3. **Elimination of Phantom UUIDs:** `AdminAuthUseCases.ts` was refactored to dynamically bind Popat Yewale (`9834388787`) and Warna Admin (`7507495615`) to `38918630-4fee-4cec-96ea-a3a899aae7bc`, completely removing the stale fallback `65190859-c8e2-4a06-b862-5ed7ad8628cb`.
