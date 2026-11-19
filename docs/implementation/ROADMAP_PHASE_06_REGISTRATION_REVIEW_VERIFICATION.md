# DFARM — ROADMAP PHASE 06: REGISTRATION REVIEW VERIFICATION
**Document Reference:** `docs/implementation/ROADMAP_PHASE_06_REGISTRATION_REVIEW_VERIFICATION.md`  
**Execution Phase:** Roadmap Phase 06 — Dairy Admin Core Operations  
**Target Application:** `apps/dfarm-dairy-admin`  
**Backend Service:** `services/backend`  
**Database Architecture:** Tenant PostgreSQL Database (`dfarm_tenant_<code_hash>`)  
**Status:** VERIFIED & PRODUCTION READY  

---

## 1. Executive Summary

This report documents the verification of the DFarm Farmer Registration Review and Approval Queue for Dairy Administrators. The workflow handles pending farmer onboarding applications originating from the Customer App, validates candidate data, allocates a unique permanent farmer code upon approval, or registers rejection reasons.

All transitions maintain strict state consistency and execute in the context of the tenant's dedicated database.

---

## 2. Registration Review Endpoints

| Method | Endpoint | Description | Permissions Required |
|---|---|---|---|
| `GET` | `/api/v1/customers/pending` | Fetch list of registrations with status `PENDING_VERIFICATION` | `customers:read` |
| `POST` | `/api/v1/customers/:id/approve` | Approve registration, assign permanent farmer code, transition to `APPROVED` | `customers:approve` |
| `POST` | `/api/v1/customers/:id/reject` | Reject registration with mandatory reason, transition to `REJECTED` | `customers:reject` |

---

## 3. Approval Workflow & Invariants

### 3.1 Approval Execution
1. **Pre-condition Check**:
   - Customer record must exist in the caller's tenant database.
   - Current status must be `PENDING_VERIFICATION`.
   - If current status is already `APPROVED`, the endpoint aborts with HTTP 400 Bad Request (`Customer is already approved`).
2. **Farmer Code Generation**:
   - If the operator supplied a custom code (e.g. `FARM-0099`), it is validated for uniqueness.
   - If no code was provided, the system queries the highest sequential numeric code for the dairy and generates the next code (e.g. `FARM-0001`, `FARM-0002`).
3. **Database Transaction**:
   - Updates `customers.status` to `'APPROVED'`.
   - Updates `customers.farmer_code` to the allocated code.
   - Records approval audit log timestamp and operator identifier.

### 3.2 Rejection Execution
1. **Validation**:
   - Requires non-empty `rejectionReason` in payload.
   - Missing reason triggers HTTP 400 with descriptive validation error.
2. **Database Update**:
   - Updates `customers.status` to `'REJECTED'`.
   - Stores `customers.rejection_reason`.
   - Farmer retains ability to inspect rejection reason via the Customer Mobile App.

---

## 4. Verification Test Evidence

All registration review scenarios were tested in `services/backend/tests/roadmap-phase-06-dairy-admin.test.js`:

| Test Assertion | Scenario / Input | Expected Status | Actual Result | Status |
|---|---|---|---|---|
| List Pending Registrations | GET `/customers/pending` for Dairy A | 200 OK, returns pending candidates | 200 OK, returns pending candidate array | PASS |
| Successful Approval | POST `/customers/:id/approve` with operator name | 200 OK, assigned unique farmer code | 200 OK, status = `APPROVED`, code assigned | PASS |
| Duplicate Approval Prevention | POST `/customers/:id/approve` on already approved farmer | 400 Bad Request, message includes "already approved" | 400 Bad Request, "already approved" returned | PASS |
| Successful Rejection | POST `/customers/:id/reject` with reason | 200 OK, status = `REJECTED`, reason saved | 200 OK, status = `REJECTED`, reason saved | PASS |
| Missing Rejection Reason | POST `/customers/:id/reject` with empty reason | 400 Bad Request | 400 Bad Request | PASS |
| Cross-Tenant Approval Block | Dairy Admin A attempts to approve customer of Dairy B | 403 Forbidden | 403 Forbidden | PASS |

---

## 5. Security & Isolation Summary

- Cross-tenant approval attacks are blocked at route entry. Even if an attacker guesses a valid UUID belonging to another dairy, the query resolves to the attacker's database where the UUID does not exist, or the tenant verifier intercepts the request and issues 403 Forbidden.
- RBAC permissions `customers:approve` and `customers:reject` are required; general operators without administrative privileges cannot approve registrations.
