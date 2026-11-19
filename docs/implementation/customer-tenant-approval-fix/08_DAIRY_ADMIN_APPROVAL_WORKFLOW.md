# 08 — Dairy Admin Approval Workflow

**Reference:** `DFARM-CUSTOMER-TENANT-REGISTRATION-APPROVAL-FIX`  
**Artifact ID:** `08_DAIRY_ADMIN_APPROVAL_WORKFLOW`  
**Target Applications:** `apps/dfarm-dairy-admin`, `services/backend`  
**Status:** IMPLEMENTED & VERIFIED  

---

## 1. Overview & Workflow Lifecycle

The customer registration approval workflow transitions an applicant from a provisional unverified state (`PENDING_APPROVAL`) to an active dairy member (`APPROVED` / `ACTIVE`).

```mermaid
flowchart TD
    A[Customer App: Registration Submitted] -->|PENDING_APPROVAL| B[Tenant Database: customers]
    B --> C[Central Control Plane: customer_dairy_memberships PENDING]
    C --> D[Dairy Admin Reviews Application]
    D --> E{Decision}
    E -->|Approve| F[POST /api/v1/customers/:id/approve]
    E -->|Reject| G[POST /api/v1/customers/:id/reject]
    
    subgraph Approval Pipeline
        F --> H[Validate Current State: PENDING_APPROVAL]
        H --> I[Generate Tenant Farmer Code: F-SAN-001]
        I --> J[Activate Biometric Face Capture Flag]
        J --> K[Update Tenant DB: status=ACTIVE, approved_at=NOW()]
        K --> L[Synchronize Central customer_dairy_memberships: APPROVED]
        L --> M[Insert Audit Trail: customer_status_history]
    end

    subgraph Rejection Pipeline
        G --> N[Validate Current State: PENDING_APPROVAL]
        N --> O[Update Tenant DB: status=REJECTED, rejection_reason]
        O --> P[Synchronize Central customer_dairy_memberships: REJECTED]
        P --> Q[Insert Audit Trail: customer_status_history]
    end
```

---

## 2. Step-by-Step Approval Pipeline

### 2.1 State Validation
The `ApproveCustomerRegistrationUseCase` first retrieves the customer record from the selected Dairy's physical tenant database.
- If the customer is not found, throws `NotFoundError`.
- If the customer's status is already `ACTIVE` or `APPROVED`, the operation is idempotent and returns the existing approved farmer details.
- If the customer is in `SUSPENDED` or `TERMINATED` state, approval is rejected.

### 2.2 Scoped Farmer Code Generation
Farmer codes are generated following tenant-scoped conventions:
- Format: `F-<DISTRICT_CODE>-<SEQUENCE_NUMBER>` (e.g., `F-SAN-001` for Sangli district).
- The sequence is isolated per tenant database. Dairy A's farmer sequence never collides with or increments Dairy B's farmer numbers.

### 2.3 Biometric Activation
If the customer enrolled facial vectors during mobile registration (`faceCapture` payload):
- The approval pipeline sets `face_enrolled = true` and `biometric_status = 'ACTIVE'`.
- The facial vector is linked to the assigned farmer code for future milk collection kiosk identification.

### 2.4 Atomic Tenant Database Update
Within the tenant database, the customer row is updated:
```sql
UPDATE customers
SET 
  status = 'ACTIVE',
  approval_status = 'APPROVED',
  farmer_code = $1,
  approved_at = NOW(),
  approved_by = $2,
  rejection_reason = NULL,
  updated_at = NOW()
WHERE id = $3 AND status = 'PENDING_APPROVAL';
```

### 2.5 Central Directory Synchronization
The global membership directory (`dfarm_central.customer_dairy_memberships`) is updated to maintain single-pane discovery:
```sql
UPDATE customer_dairy_memberships
SET
  membership_status = 'APPROVED',
  farmer_code = $1,
  approved_at = NOW(),
  updated_at = NOW()
WHERE customer_identity_id = $2 AND organization_id = $3;
```

### 2.6 Immutable Audit Logging
An entry is appended to the tenant database's `customer_status_history` table:
```sql
INSERT INTO customer_status_history (
  id,
  customer_id,
  previous_status,
  new_status,
  changed_by,
  change_reason,
  created_at
) VALUES (
  gen_random_uuid(),
  $1,
  'PENDING_APPROVAL',
  'APPROVED',
  $2,
  'Dairy admin manual approval',
  NOW()
);
```

---

## 3. Rejection Workflow

If the Dairy Admin finds incomplete or fraudulent registration details:
1. Admin enters an optional rejection note (e.g., "Incomplete land ownership document" or "Out of delivery route").
2. Calls `POST /api/v1/customers/:id/reject` with payload `{ "reason": "Out of delivery route" }`.
3. Tenant DB status is set to `REJECTED`.
4. Central membership status is synchronized to `REJECTED`.
5. Customer App reflects rejection reason upon polling, allowing the customer to edit and reapply according to dairy policy.

---

## 4. Verification Evidence

### 4.1 End-to-End Test Execution (`Stage 8`)
In `services/backend/tests/customer-tenant-approval-e2e.test.js`:
- Applicant: `Shubhangi popat Yewale` (`+917755995615`).
- Approver: Admin Popat Yewale (`9834388787`).
- Action: `POST /customers/:id/approve`.
- Assertions verified:
  - Response status: HTTP 200 OK.
  - Assigned farmer code: `F-SAN-001`.
  - Customer status: `ACTIVE`.
  - ApprovedAt timestamp: Verified non-null ISO string.

### 4.2 Security & IDOR Enforcement
- A Dairy Admin belonging to Dairy B cannot approve an applicant from Dairy A.
- The use case verifies `req.user.organizationId === customer.organizationId`. Any mismatch results in HTTP 403 Forbidden.
