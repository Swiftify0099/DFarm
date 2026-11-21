# DFarm Customer Data Ownership & Multi-Tenant Isolation Matrix

**Document ID:** `CDL-MATRIX-02`  
**Date:** 2026-11-21  
**Status:** SPECIFICATION APPROVED  

---

## 1. Architectural Principle: Central Control-Plane vs. Isolated Tenant Database

DFarm enforces strict multi-tenant isolation where one global customer identity may belong to multiple independent dairies without cross-tenant operational data sharing.

```
                    ┌───────────────────────────────────────────────┐
                    │          Central Control-Plane Database       │
                    │                  (dfarm_central)              │
                    ├───────────────────────────────────────────────┤
                    │ • global_customer_identities (E.164 phone)    │
                    │ • organizations (Dairy Registry)              │
                    │ • customer_dairy_memberships (Mapping)        │
                    │ • dairy_database_mappings (Physical DB Route) │
                    └───────┬───────────────────────────────┬───────┘
                            │                               │
             Routing via Organization UUID   Routing via Organization UUID
                            │                               │
                            ▼                               ▼
       ┌───────────────────────────────┐ ┌───────────────────────────────┐
       │   Dairy A Tenant Database     │ │   Dairy B Tenant Database     │
       │ (dfarm_tenant_sahyadri_<uid>) │ │ (dfarm_tenant_krishna_<uid>)  │
       ├───────────────────────────────┤ ├───────────────────────────────┤
       │ • customers (Master profile)  │ │ • customers (Master profile)  │
       │ • farmer_code: "F-101"        │ │ • farmer_code: "K-405"        │
       │ • face_enrollments (Biometric)│ │ • face_enrollments (Biometric)│
       │ • milk_collections            │ │ • milk_collections            │
       │ • ledger_accounts & entries   │ │ • ledger_accounts & entries   │
       │ • monthly_bills & payouts     │ │ • monthly_bills & payouts     │
       └───────────────────────────────┘ └───────────────────────────────┘
```

---

## 2. Table-by-Table Data Ownership Matrix

| Entity / Data Field | Persistence Database | Scope & Ownership | Access & Encryption Rules |
|---|---|---|---|
| **Global Mobile Phone (E.164)** | `dfarm_central` | Global Platform | Unique across entire platform in `global_customer_identities`. |
| **Global Customer Identity** | `dfarm_central` | Global Platform | `global_customer_identities.id` (UUID). |
| **Organization Registry** | `dfarm_central` | Global Platform | `organizations` (UUID, Dairy Code, Name, District, Status). |
| **Customer-to-Dairy Membership** | `dfarm_central` | Cross-Tenant Mapping | `customer_dairy_memberships`: Links `global_customer_id` + `organization_id` -> `tenant_customer_id`. |
| **Tenant Database Routing** | `dfarm_central` | Platform Infrastructure | `dairy_database_mappings`: Maps `dairy_id` -> physical PostgreSQL database name. |
| **Local Customer Master Record** | Dairy Tenant DB | Tenant-Exclusive | `customers`: Authoritative customer name, address, father/spouse name, village. |
| **Farmer Code** | Dairy Tenant DB | Tenant-Exclusive | Local serial/identifier (e.g., `F-101` in Dairy A; `K-405` in Dairy B). Cached in central membership for fast display. |
| **Biometric Face Embeddings** | Dairy Tenant DB | Tenant-Exclusive | `face_enrollments`: YuNet bounding box + 128-dim SFace embedding. AES-256-GCM encrypted. **NEVER stored centrally or shared between dairies.** |
| **Bank Beneficiary Details** | Dairy Tenant DB | Tenant-Exclusive | `customers.bank_details_encrypted`: AES-256-GCM encrypted. Masked on API responses (`XXXX-XXXX-1234`). |
| **Milk Intake Transactions** | Dairy Tenant DB | Tenant-Exclusive | `milk_collections`: Weight, FAT %, SNF %, CLR, Rate/Liter, Total Amount, Shift, Center. |
| **Double-Entry Financial Ledger** | Dairy Tenant DB | Tenant-Exclusive | `ledger_accounts` & `ledger_entries`: Dual-entry accounting. Immutable audit trail. |
| **Khata Running Balance** | Dairy Tenant DB | Tenant-Exclusive | Projected from `ledger_entries` for the customer in that specific dairy. |
| **Monthly Bills & Statements** | Dairy Tenant DB | Tenant-Exclusive | `monthly_bills`: Milk supply credits minus cattle feed dues and deductions. |
| **Dairy Payouts & Disbursements** | Dairy Tenant DB | Tenant-Exclusive | `dairy_payouts` & `payment_transactions`: Bank batch, payment status (PENDING, PAID, RECONCILED). |
| **Cattle Feed Sales & Dues** | Dairy Tenant DB | Tenant-Exclusive | `cattle_feed_sales`: Store/feed purchases deducted from monthly milk bills. |
| **Local Audit Trail** | Dairy Tenant DB | Tenant-Exclusive | `audit_logs`: Tenant operational history. |

---

## 3. Strict Multi-Dairy Customer Isolation Rules

1. **Independent Memberships:**
   - Customer Pankaj (`+919876543210`, `global_customer_id: G-1001`) registers with Dairy A (Sahyadri) and Dairy B (Krishna Valley).
   - In Central DB: Two records exist in `customer_dairy_memberships` under the same `global_customer_id`:
     - Membership 1: `organization_id: Sahyadri-ID`, `tenant_customer_id: TC-A1`, `farmer_code: F-101`.
     - Membership 2: `organization_id: Krishna-ID`, `tenant_customer_id: TC-B2`, `farmer_code: K-405`.
2. **Zero Operational Leakage:**
   - Sahyadri's tenant database contains only collections, ledger entries, and bills generated at Sahyadri.
   - Krishna Valley's tenant database contains only collections, ledger entries, and bills generated at Krishna Valley.
   - When Pankaj selects Sahyadri in the Customer App, only Sahyadri's tenant DB is queried (`x-dairy-tenant-id: Sahyadri-ID`).
   - When Pankaj switches to Krishna Valley, TanStack query cache is wiped and Krishna Valley's tenant DB is queried.
3. **Biometric Isolation:**
   - Face enrollment at Sahyadri is stored ONLY in Sahyadri's `face_enrollments` table.
   - Krishna Valley's collection app CANNOT match Pankaj using Sahyadri's face template. Pankaj must enroll independently at Krishna Valley.
4. **Permanent Deprovisioning Boundary:**
   - If Super Admin permanently deletes Dairy A (Sahyadri):
     - The physical database `dfarm_tenant_sahyadri_<uid>` is dropped.
     - Membership 1 in `customer_dairy_memberships` for Sahyadri is deleted.
     - Membership 2 for Krishna Valley remains **COMPLETELY UNTOUCHED AND ACTIVE**.
     - Pankaj's `global_customer_identities` record remains intact.
