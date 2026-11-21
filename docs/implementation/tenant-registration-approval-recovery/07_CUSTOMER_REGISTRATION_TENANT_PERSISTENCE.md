# 07 — Customer Registration Tenant Persistence

**Execution Reference:** DFARM-TENANT-PROVISIONING-REGISTRATION-APPROVAL-RECOVERY  
**Scope:** Persistence into Dairy-Specific Tenant Database  
**Status:** VALIDATED & COMMITTED  
**Date:** 2026-11-19  

---

## 1. Flow Overview

When a customer submits registration:
1. Backend validates the authenticated customer session token.
2. Resolves target tenant database using `dairyId` from the request.
3. Obtains dedicated connection pool for `dfarm_tenant_<code_hash>_<uuid_prefix>`.
4. Writes an entry into the tenant database's `pending_registrations` table.
5. Concurrently synchronizes a tracking record into central `customer_dairy_memberships` (`status: PENDING_APPROVAL`).

---

## 2. Tenant Table Data Lineage

### Target Table: `pending_registrations` (Inside Selected Dairy Tenant Database)

| Column Name | Data Type | Value in Test Run | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | `34e5ce6f-00ec-4f2d-88b9-5c1cfab08fec` | Primary Key for registration record |
| `dairy_id` | UUID | `ebe4b636-b652-403e-9de3-bb2922bd0773` | Selected Dairy ID (`DF-SAN-9500`) |
| `full_name` | VARCHAR(255) | `Shubhangi Popat Yewale` | Farmer legal name |
| `phone` | VARCHAR(20) | `+917755995615` | E.164 normalized mobile number |
| `preferred_milk_type` | VARCHAR(20) | `COW` | Cow or Buffalo preference |
| `address` | TEXT | `At Post Sangli, Miraj Road` | Residential / Farm address |
| `bank_account_number` | VARCHAR(50) | `[ENCRYPTED/MASKED]` | Encrypted bank account number |
| `bank_ifsc_code` | VARCHAR(20) | `SBIN0001234` | Bank branch IFSC code |
| `status` | VARCHAR(30) | `PENDING_APPROVAL` | Initial registration status |
| `created_at` | TIMESTAMPTZ | `2026-11-19T11:58:22Z` | Record creation timestamp |

---

## 3. Direct Tenant Database Proof

Executing a direct query against the tenant database `dfarm_tenant_df_san_9500_ebe4b636b652`:

```sql
SELECT id, full_name, phone, preferred_milk_type, status, created_at 
FROM pending_registrations 
WHERE phone = '+917755995615';
```

**Result:**
```
id: 34e5ce6f-00ec-4f2d-88b9-5c1cfab08fec
full_name: Shubhangi Popat Yewale
phone: +917755995615
preferred_milk_type: COW
status: PENDING_APPROVAL
created_at: 2026-11-19 11:58:22.412+00
```

---

## 4. Architectural Verification

- **No Data in Wrong Tenant:** Querying the tenant database for Warna Milk's (`dfarm_tenant_df_san_2395_389186304fee`) for phone `+917755995615` returns **0 records**.
- **No Data Leak to Central:** Central database `dfarm_central` contains only identity routing metadata; raw operational registration data is solely stored in the tenant database.
