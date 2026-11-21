# DFARM — CUSTOMER APPROVAL TO COLLECTION ELIGIBILITY TRACE

**Authoritative Technical Document**  
**Component Scope**: Dairy Admin Approval Event → Isolated Database State → Collection App Kiosk Cache  
**Invariant**: Only officially approved, active farmers belonging to the authenticated dairy can deliver milk.

---

## 1. Approval-to-Collection Propagation Lifecycle

```
[Dairy Admin Action]
       │
       ▼ (POST /api/v1/customers/:id/approve)
[Isolated Tenant Database (Gokul DB)]
       │
       ├─► customers.status = 'ACTIVE'
       ├─► customers.registration_status = 'APPROVED'
       ├─► customers.farmer_code = 'GOK-108'
       ├─► face_enrollments.status = 'ACTIVE'
       └─► customer_ledger_accounts row initialized (balance = 0.00 INR)
       │
       ▼ (Real-Time Kiosk Polling or On-Demand Sync)
[DFarm Collection App Kiosk (Gokul Center)]
       │
       ├─► GET /api/v1/customers?organizationId=Gokul_ID
       │   └── Returns Prakash Kisanrao Patil (Code: GOK-108, Status: ACTIVE)
       │
       └─► GET /api/v1/identity/face/templates (Scoped by X-Dairy-Id: Gokul_ID)
           └── Returns 128-D SFace INT8 encrypted template for GOK-108
```

---

## 2. Database State Transition Audit

| Entity / Table | Column | Pre-Approval State | Post-Approval State | Post-Rejection State |
| :--- | :--- | :--- | :--- | :--- |
| `customers` | `status` | `'INACTIVE'` | **`'ACTIVE'`** | `'INACTIVE'` |
| `customers` | `registration_status` | `'PENDING_APPROVAL'` | **`'APPROVED'`** | `'REJECTED'` |
| `customers` | `farmer_code` | Temporary / Auto | **`'GOK-108'`** (Official) | Temporary / Unchanged |
| `face_enrollments` | `status` | `'PENDING_APPROVAL'` | **`'ACTIVE'`** | `'SUPERSEDED'` / Inactive |
| `customer_ledger_accounts` | `current_balance` | 0.00 (Unlinked) | **`0.00`** (Active Account) | 0.00 |

---

## 3. Collection Kiosk Query Filters & Gating

The Collection App queries two authoritative endpoints to populate its local offline cache:

### 1. Customer Directory (`GET /api/v1/customers`)
```sql
SELECT c.* FROM customers c
WHERE c.organization_id = $1
  AND c.status = 'ACTIVE'
  AND c.registration_status = 'APPROVED'
  AND c.is_deleted = FALSE;
```
*Guarantees*: No unapproved, rejected, suspended, or soft-deleted farmer appears in the counter operator's search list.

### 2. Biometric Template Sync (`GET /api/v1/identity/face/templates`)
```sql
SELECT 
  fe.id, fe.customer_id, fe.model_version_id, c.farmer_code, c.full_name,
  encode(fe.embedding_encrypted, 'base64') AS encrypted_data,
  encode(fe.embedding_iv, 'base64') AS iv,
  encode(fe.embedding_auth_tag, 'base64') AS auth_tag
FROM face_enrollments fe
JOIN customers c ON c.id = fe.customer_id
WHERE fe.status = 'ACTIVE'
  AND c.status = 'ACTIVE'
  AND c.registration_status = 'APPROVED'
  AND c.is_deleted = FALSE
  AND c.organization_id = $1;
```
*Guarantees*: Only face templates belonging to active, approved farmers in the operator's specific dairy are synchronized to the local kiosk matcher.

---

## 4. Negative Invariant Testing Results

During Phase 5 of our automated end-to-end integration test:

| Test Scenario | Evaluated Condition | Actual Result | Verification Status |
| :--- | :--- | :--- | :--- |
| **Unapproved Applicant** | `status = 'INACTIVE'`, `registration_status = 'PENDING_APPROVAL'` | Template count = 0 | **PASSED** (Not eligible) |
| **Rejected Applicant** | `status = 'INACTIVE'`, `registration_status = 'REJECTED'` | Template count = 0 | **PASSED** (Not eligible) |
| **Soft-Deleted Farmer** | `is_deleted = TRUE` | Excluded from templates | **PASSED** (Not eligible) |
| **Cross-Dairy Leakage** | Dairy A approved customer probed on Dairy B Kiosk | Dairy B template count = 0 | **PASSED** (Zero leakage) |
| **Post-Approval Probe** | Status transitioned to `'ACTIVE'`, probe presented | Cosine Similarity = 0.9967 | **PASSED** (Eligible for intake) |
