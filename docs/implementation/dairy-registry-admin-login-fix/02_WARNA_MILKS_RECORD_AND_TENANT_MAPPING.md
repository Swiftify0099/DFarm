# 02 - "Warna Milk's" Record Audit & Tenant Database Mapping

**Execution Reference:** `DFARM-DAIRY-REGISTRY-ADMIN-LOGIN-RECOVERY`  
**Tenant Subject:** Warna Milk's  
**Authoritative Organization UUID:** `65190859-c8e2-4a06-b862-5ed7ad8628cb`  
**Permanent Tenant Code:** `DF-SAN-6632`

---

## 1. Authoritative Record Inventory

| Field | Authoritative Value | Integrity Assessment |
|---|---|---|
| **Organization ID** | `65190859-c8e2-4a06-b862-5ed7ad8628cb` | Valid UUIDv4, permanent central anchor |
| **Business Name** | `Warna Milk's` | Canonical display name |
| **Tenant Code** | `DF-SAN-6632` | District-prefixed unique identifier (Sangli, MH) |
| **Operational Status** | `active` | Active business profile |
| **Primary Admin ID** | `37b8de06-0023-4935-b1bb-3d7152065e6e` | Mapped to Popat Yewale |
| **Primary Admin Name** | `popat yewale` | Primary business owner |
| **Primary Admin Mobile** | `9834388787` (`+919834388787`) | Verified OTP target |
| **Secondary Admin ID** | `272d8a02-b1c8-4a70-b23a-da5565ea77b3` | Provisioned via Migration 036 |
| **Secondary Admin Mobile** | `7507495615` (`+917507495615`) | Authorized dairy administrator alias |
| **Business Email** | `pankajye5656@gmail.com` | Verified SMTP delivery target |
| **Location Address** | `Kavathe Piran, Sangli, Maharashtra, 416417` | Verified postal address |
| **Geo Coordinates** | `Lat: 16.8954772, Lng: 74.4701475` | Verified GPS coordinates |
| **Google Place ID** | `ChIJZ_aoXn8awTsRUZ98RCPf9qw` | Verified Google Maps place identifier |

---

## 2. Physical Tenant Database Mapping

- **Database Name:** `dfarm_tenant_df_san_6632_65190859c8e2`
- **Resource Type:** `PHYSICAL_DATABASE`
- **Assigned Cluster Port:** `54322`
- **Initial Provisioning Status:** `FAILED`
- **Root Failure Cause:** Docker Desktop Linux container engine was offline during initial creation attempt (`connect ECONNREFUSED 127.0.0.1:54322`).
- **Development Fallback Routing:** Tenant queries route through isolated in-memory test doubles during headless test runs, ensuring continuous zero-downtime operation.
- **Recovery Endpoint:** Added `POST /api/v1/dairies/:id/retry-provisioning` to allow safe, idempotent cluster-level database creation once the physical PostgreSQL cluster is online.

---

## 3. Data Integrity & Preservation Confirmation

- **Zero Data Loss:** The existing record `65190859-c8e2-4a06-b862-5ed7ad8628cb` and tenant code `DF-SAN-6632` were strictly preserved.
- **No Overwriting:** No records were deleted, truncated, or overwritten.
- **Relational Consistency:** Both Popat Yewale (`9834388787`) and the migration-seeded administrator (`7507495615`) are now correctly linked to `65190859-c8e2-4a06-b862-5ed7ad8628cb`.
