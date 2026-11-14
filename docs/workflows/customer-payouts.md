# Individual Farmer Payout Workflow

## 1. Overview & Objective

The Individual Farmer Payout workflow handles single farmer settlements (e.g. ad-hoc payments, milk bill settlements, or monthly balance disbursements). It prevents unauthorized overpayments, enforces Maker-Checker separation of duties, and ensures that financial ledger postings only occur upon verified settlement confirmation.

---

## 2. End-to-End Payout Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor Farmer as Farmer Customer
    actor Cashier as Cashier / Accountant (Maker)
    actor Supervisor as Center Supervisor (Checker)
    participant API as Payment API
    participant PG as PostgreSQL Database
    participant Subledger as Customer Subledger

    Farmer->>Cashier: Requests milk settlement payment
    Cashier->>API: GET /api/v1/payments/customers/:id/summary
    API->>PG: Calculate verified liability & pending holds
    API-->>Cashier: Returns eligible payable balance (e.g. ₹5,000)

    Cashier->>API: POST /api/v1/payments/payouts (Amount: ₹5,000, Method: BANK_TRANSFER)
    API->>PG: Validate non-overpayment & insert customer_payouts (status=PENDING_APPROVAL)
    API-->>Cashier: Payout Created (HTTP 201)

    Cashier->>Supervisor: Informs payout queued for approval
    Supervisor->>API: POST /api/v1/payments/payouts/:id/approve
    Note over API,PG: Asserts creator_id != approver_id (Maker-Checker invariant)
    API->>PG: Update status to APPROVED
    API-->>Supervisor: Payout Approved (HTTP 200)

    Cashier->>API: POST /api/v1/payments/payouts/:id/submit (ref: NEFT-OUT-991)
    API->>PG: Update status to SUBMITTED
    Note over Subledger: No ledger posting occurs during SUBMITTED state

    Cashier->>API: POST /api/v1/payments/payouts/:id/confirm (utr: UTR982312)
    API->>PG: Call settle_customer_payout() stored procedure
    PG->>Subledger: Insert DEBIT ledger_entries (CUSTOMER_PAYABLE)
    PG->>Subledger: Insert CREDIT ledger_entries (CASH_BANK)
    PG->>PG: Update customer_payouts (status=SETTLED, settled_at=NOW())
    API-->>Cashier: Settlement Confirmed & Receipt Generated (HTTP 200)
    Cashier->>Farmer: Issues 40-Column Settlement Slip
```

---

## 3. Business Rules & Guardrails

### 3.1 Overpayment Prevention
A payout cannot exceed the farmer's current eligible payable balance unless `allowOverpaymentAdvance: true` is explicitly passed and authorized:
$$\text{Eligible Payable} = \text{Current Ledger Liability} - \sum \text{Pending Active Payouts}$$
If requested amount exceeds eligible payable balance, the API rejects the request with HTTP 400: `OVERPAYMENT_NOT_PERMITTED`.

### 3.2 Maker-Checker Separation of Duties
- Payouts can be drafted by `ACCOUNTS_EMPLOYEE` or `COLLECTION_OPERATOR`.
- Approval requires `DAIRY_ADMIN`, `DAIRY_OWNER`, or authorized `SUPERVISOR`.
- **Self-Approval Prohibition:** A user cannot approve a payout they initiated. Attempting self-approval returns HTTP 403: `SELF_APPROVAL_NOT_PERMITTED`.

### 3.3 Partial Payouts
Farmers may request partial disbursements (e.g. ₹4,000 out of a ₹10,000 balance). The system settles the ₹4,000 debit and maintains the remaining ₹6,000 balance as an active liability for subsequent payouts.

### 3.4 Payout Reversals
If an erroneous payout is settled, it must be reversed using:
`POST /api/v1/payments/payouts/:id/reverse`
- Requires a mandatory audit reason.
- Re-credits the customer liability account via a compensatory journal transaction.
- Marks payout status as `REVERSED`.
- Never deletes or overwrites existing ledger records.
