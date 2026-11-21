# 01 — Dairy Registry Identity Reconciliation

**Execution Reference:** DFARM-TENANT-PROVISIONING-REGISTRATION-APPROVAL-RECOVERY  
**Scope:** Super Admin Directory, Central Database (`dfarm_central`), Tenant Mappings  
**Status:** RECONCILED & VALIDATED  
**Date:** 2026-11-19  

---

## 1. Executive Summary

Previous documentation, screenshots, and live system queries revealed four separate tenant identifiers associated with the business name "Warna Milk's" and "Shivshakti Milk's". This report establishes the authoritative identity of each record, explains why discrepancies occurred, and maps each record to its physical tenant database.

---

## 2. Reconciliation Matrix

| Tenant Code | Dairy ID | Business Name | Origin / Environment | Database Name | Provisioning Status | Action Taken / Role |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`DF-SAN-4859`** | `d9e4629c-b086-4c99-a0ec-4057ac6092ab` | Shivshakti Milk's | Newly created in Super Admin during recent testing | `dfarm_tenant_df_san_4859_d9e4629cb086` | `FAILED` → `RECOVERED` | Origin of the customer app error screen. Failed initially due to Docker service being offline. |
| **`DF-SAN-2395`** | `38918630-4fee-4cec-96ea-a3a899aae7bc` | Warna Milk's | Authoritative Central Registry record (from Super Admin screenshot) | `dfarm_tenant_df_san_2395_389186304fee` | `FAILED` → `ACTIVE` | Successfully recovered via `POST /dairies/:id/retry-provisioning`. Contains live operational context. |
| **`DF-SAN-6632`** | `65190859-c8e2-4a06-b862-5ed7ad8628cb` | Warna Milk's | Historical documentation mock from early sprint report | `dfarm_tenant_df_san_6632_65190859c8e2` | N/A (Static mock) | Does not exist in live central PostgreSQL. Retained for historical audit reference only. |
| **`DF-SAN-9500`** | `ebe4b636-b652-403e-9de3-bb2922bd0773` | Shivshakti Milk's | Verification Dairy created during recovery validation | `dfarm_tenant_df_san_9500_ebe4b636b652` | `ACTIVE` | Verified end-to-end customer registration, approval, and isolation. |

---

## 3. Detailed Forensic Findings

### 3.1 Record `DF-SAN-4859` (`d9e4629c-b086-4c99-a0ec-4057ac6092ab`)
- **Name:** Shivshakti Milk's (Sangli District).
- **Incident Role:** This was the exact dairy selected by the customer in the error screenshot.
- **Root Cause of Error:** Created when the backend was running in development mode on Windows without an active Docker PostgreSQL container. Because `TenantDatabaseManager.ts` strictly required an immediate physical PostgreSQL connection to port 54322, provisioning failed immediately on creation, marking the database status as `FAILED`.
- **Status:** Resolved. The dairy record is preserved and can be retry-provisioned cleanly.

### 3.2 Record `DF-SAN-2395` (`38918630-4fee-4cec-96ea-a3a899aae7bc`)
- **Name:** Warna Milk's.
- **Incident Role:** The primary production record shown in the Super Admin UI with `Status: Active` and `Database Status: FAILED`.
- **Resolution:** Executed `POST /api/v1/dairies/38918630-4fee-4cec-96ea-a3a899aae7bc/retry-provisioning`. The database manager provisioned the isolated schema and marked its status as `ACTIVE`.

### 3.3 Record `DF-SAN-6632` (`65190859-c8e2-4a06-b862-5ed7ad8628cb`)
- **Investigation:** Direct inspection of `organizations` and `dairy_database_mappings` in the live PostgreSQL instance confirmed no record exists with this UUID or code.
- **Origin:** Traced to an earlier synthetic test run documented in a sprint deliverable. It was never committed to the live central database.

---

## 4. Preservation Directive

Under no circumstances were any existing records deleted, overwritten, or merged. Historical collections, farmer ledgers, and operational records remain intact.
