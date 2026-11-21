# 05 — DUPLICATE REGISTRATION PREVENTION

**Execution Reference:** `DFARM-MULTI-DAIRY-CUSTOMER-MEMBERSHIP`  
**Target Systems:** Database Constraints, `RegisterCustomerUseCase`, `customers.routes.ts`

---

## 1. Rule 3 Enforcement Mechanics

Rule 3 strictly dictates:
*One customer identity can have exactly one customer registration within a particular Dairy.*

Duplicate registration prevention is enforced at multiple architectural layers:

```
+-------------------------------------------------------------+
| Layer 1: Frontend Pre-Validation                            |
| Customer App checks active memberships. If target dairy is  |
| already registered, displays "Already Registered" badge and |
| provides a 1-tap "Switch to this Dairy" button instead.     |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| Layer 2: Domain Use Case Validation                         |
| RegisterCustomerUseCase checks:                             |
| 1. Central membership directory for (globalId, orgId).      |
| 2. Tenant customer repository for phone in orgId.           |
| 3. If exists & status APPROVED: throws DomainValidationError|
| 4. If exists & status PENDING: allows idempotent retry of   |
|    same applicant, blocks different applicant duplicate.   |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| Layer 3: Central Database Constraint                        |
| customer_dairy_memberships:                                 |
| CONSTRAINT uq_customer_dairy_membership                     |
| UNIQUE (organization_id, global_customer_id)                |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| Layer 4: Tenant Physical Database Constraint                |
| customers:                                                  |
| CREATE UNIQUE INDEX uq_customer_global_identity_per_org     |
| ON customers (organization_id, global_customer_id)          |
| WHERE global_customer_id IS NOT NULL AND is_deleted = FALSE |
+-------------------------------------------------------------+
```

---

## 2. API Error Contracts

When a duplicate registration is attempted in a dairy where the customer is already registered:
- **HTTP Status Code:** `400 Bad Request` (or `409 Conflict`)
- **Response Payload:**
  ```json
  {
    "success": false,
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "A customer with this mobile number already exists in this dairy."
    }
  }
  ```

---

## 3. Idempotent Retry vs. Duplicate Attempt

- **Idempotent Retry / Resubmission:**
  A farmer whose registration is `PENDING_APPROVAL` re-submitting their form (e.g. adding biometric consent, updating bank details, or providing a clearer face capture) is permitted. The backend updates the existing draft record (`id` preserved) and returns `201 Created` with the existing `customerUuid`.
- **Duplicate Person / Fraudulent Collision:**
  A different person attempting to register using another customer's mobile number in that dairy is strictly blocked with `400 VALIDATION_ERROR`.
