# DFARM ARCHITECTURE: BULK PAYOUT BATCH & MAKER–CHECKER GOVERNANCE

**Document ID:** `DFARM-ARCH-BPMC-001`  
**Roadmap Phase:** Roadmap Phase 09 — Financial Calculation, Farmer Settlement, Bulk Bank Payout & Reconciliation  
**Target:** `services/backend`, `apps/dfarm-dairy-admin`  
**Standard:** Strict Segregation of Duties (SoD), Dual Authorization, Zero Self-Approval  

---

## 1. Principles of Financial Segregation of Duties

To safeguard farmer funds against unauthorized disbursement, collusion, and clerical errors, DFarm enforces mandatory dual-control (**Maker–Checker**) authorization on all bulk payout operations:

1. **Maker (Preparation):** An authorized finance staff member (`ACCOUNTANT`, `DAIRY_ADMIN`, or `CENTER_MANAGER`) prepares the settlement batch from a finalized billing cycle, reviews beneficiary eligibility, and submits the batch for review.
2. **Checker (Approval):** An independent authorized officer (`PRIMARY_DAIRY_ADMIN` or `DAIRY_OWNER`) reviews batch totals, exception records, and beneficiary details.
3. **Absolute Prohibition of Self-Approval:**
   Under **no circumstances** may the identity who created or modified the batch approve it:
   $$\text{approver\_id} \neq \text{created\_by}$$
   Violations result in an immediate HTTP 403 Forbidden with error code `MAKER_CHECKER_SELF_APPROVAL_PROHIBITED`.

---

## 2. Payout Batch State Machine & Workflow

```mermaid
sequenceDiagram
    autonumber
    actor Maker as Finance Maker (Accountant / Dairy Admin)
    actor Checker as Finance Checker (Primary Admin / Owner)
    participant BatchService as Backend BatchService
    participant TenantDB as Tenant PostgreSQL DB

    Maker->>BatchService: POST /api/v1/payments/batches (billingCycleId, centerId)
    BatchService->>TenantDB: Check: Does active batch exist for billingCycleId?
    alt Duplicate Batch Detected
        BatchService-->>Maker: HTTP 409 Conflict (Duplicate Cycle Batch Prohibited)
    end
    BatchService->>TenantDB: SELECT eligible customers WHERE current_balance > 0
    BatchService->>TenantDB: INSERT payment_batches (status = 'DRAFT', created_by = Maker.id)
    BatchService->>TenantDB: INSERT payment_batch_items & customer_payouts (DRAFT)
    BatchService-->>Maker: HTTP 201 Created (Batch Snapshot Frozen)

    Maker->>Checker: Request Independent Verification & Approval
    Checker->>BatchService: POST /api/v1/payments/batches/:batchId/approve
    BatchService->>TenantDB: SELECT * FROM payment_batches WHERE id = :batchId
    alt Self-Approval Attempt
        Note over BatchService: Checker.id == Batch.created_by
        BatchService-->>Checker: HTTP 403 Forbidden (MAKER_CHECKER_SELF_APPROVAL_PROHIBITED)
    end
    BatchService->>TenantDB: UPDATE payment_batches SET status = 'APPROVED', approved_by = Checker.id
    BatchService->>TenantDB: UPDATE customer_payouts SET status = 'APPROVED'
    BatchService->>TenantDB: INSERT payment_approvals (Audit Log Entry)
    BatchService-->>Checker: HTTP 200 OK (Batch Immutable & Ready for Bank Export)
```

---

## 3. Duplicate Payout Prevention & Obligation Reservation

1. **Billing Cycle Uniqueness Constraint:**
   A billing cycle cannot be associated with more than one active payout batch in states `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `SUBMITTED`, or `SETTLED`.
2. **Payout Item Uniqueness:**
   A unique constraint `uq_batch_payout UNIQUE (batch_id, payout_id)` guarantees no double-listing of payouts.
3. **Obligation Reservation:**
   When a payout item is created in `DRAFT` or `APPROVED` status, the pending amount is reserved against the customer's ledger balance:
   $$\text{Eligible Balance} = \text{Current Ledger Balance} - \sum \text{Pending Reserved Payouts}$$
   This prevents race conditions where an individual manual payout and a bulk batch attempt to disburse the same ledger balance concurrently.
