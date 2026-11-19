# DFARM — CROSS-APP DATA FLOW DIAGRAMS
## WORKFLOW A THROUGH H COMPLETE END-TO-END EVENT FLOWS

**Audit Reference:** `DFARM-AUDIT-CROSS-APP-FLOWS-001`  
**Date:** 2026-11-18  

---

### Workflow A: Farmer Self-Registration & Approval
```mermaid
sequenceDiagram
    autonumber
    actor Farmer as Farmer (Customer App)
    participant Backend as Backend API (Express)
    participant TenantDB as Dairy Tenant DB
    actor Admin as Dairy Admin (Web Portal)

    Farmer->>Backend: POST /api/v1/customers/register (allowPublicRegistration)
    Backend->>TenantDB: INSERT INTO customer_registration_records (status: PENDING)
    Backend->>TenantDB: INSERT INTO customers (status: PENDING)
    Backend-->>Farmer: 201 Created (registrationReference)
    Admin->>Backend: GET /api/v1/customers/pending-registrations
    Backend->>TenantDB: SELECT * FROM customer_registration_records WHERE status='PENDING'
    Backend-->>Admin: 200 OK (pending list)
    Admin->>Backend: POST /api/v1/customers/:id/approve
    Backend->>TenantDB: UPDATE customers SET status='ACTIVE', customer_code='C-101'
    Backend->>TenantDB: UPDATE customer_registration_records SET status='APPROVED'
    Backend-->>Admin: 200 OK (approved)
    Farmer->>Backend: GET /api/v1/customers/registration-status
    Backend-->>Farmer: 200 OK (status: APPROVED, customerCode: C-101)
```

---

### Workflow D: Milk Collection Intake & Real-time Ledger Posting
```mermaid
sequenceDiagram
    autonumber
    actor Operator as Kiosk Operator (Collection App)
    participant Terminal as Kiosk Local Engine
    participant Backend as Backend API (collections.routes.ts)
    participant TenantDB as Dairy Tenant DB
    actor Farmer as Farmer (Customer App)

    Operator->>Terminal: Identify Farmer (RFID Card Scan)
    Terminal->>Backend: GET /api/v1/rfid/lookup/:uid
    Backend->>TenantDB: SELECT * FROM rfid_cards JOIN customers ...
    Backend-->>Terminal: 200 OK (Farmer C-101 details)
    Operator->>Terminal: Milk Poured (Scale Weight: 12.5L, Analyzer: 4.2% FAT, 8.7% SNF)
    Terminal->>Terminal: Resolve Price Preview (₹38.50/L -> Gross: ₹481.25)
    Operator->>Terminal: Click "Save Transaction"
    Terminal->>Backend: POST /api/v1/collections/intake
    activate Backend
    Backend->>TenantDB: INSERT INTO milk_collections
    Backend->>TenantDB: INSERT INTO ledger_transactions (CREDIT: ₹481.25)
    Backend->>TenantDB: UPDATE customer_ledger_accounts SET current_balance = current_balance + 481.25
    Backend-->>Terminal: 201 Created (intakeId, receiptPayload)
    deactivate Backend
    Terminal->>Terminal: ESC/POS Thermal Receipt Printed
    Farmer->>Backend: GET /api/v1/ledger/statement
    Backend->>TenantDB: SELECT * FROM ledger_entries WHERE customer_id=...
    Backend-->>Farmer: 200 OK (New balance reflected)
```

---

### Workflow G: Finalized Billing, Bulk Payout & Double-Entry Settlement
```mermaid
sequenceDiagram
    autonumber
    actor Accountant as Accountant (Maker)
    actor Owner as Dairy Owner (Checker)
    participant Backend as Backend API
    participant TenantDB as Dairy Tenant DB
    participant Bank as Commercial Bank (RBI NEFT)

    Accountant->>Backend: POST /api/v1/billing/generate (Period: Nov 01 - Nov 10)
    Backend->>TenantDB: Compute net payable = Gross Milk - Feed Sales - Advances
    Backend->>TenantDB: INSERT INTO monthly_bills (status: DRAFT)
    Accountant->>Backend: POST /api/v1/billing/:id/finalize
    Backend->>TenantDB: UPDATE monthly_bills SET status='FINALIZED' (Locked)
    Accountant->>Backend: POST /api/v1/payments/batches (Maker Step)
    Backend->>TenantDB: INSERT INTO payment_batches (status: PENDING_APPROVAL)
    Owner->>Backend: POST /api/v1/payments/batches/:id/approve (Checker Step)
    Backend->>TenantDB: Assert Maker != Checker; UPDATE status='APPROVED'
    Accountant->>Backend: GET /api/v1/payments/batches/:id/export (RBI NEFT)
    Backend-->>Accountant: RBI Format File + SHA-256 Checksum (Zero Ledger Debit)
    Accountant->>Bank: Upload NEFT Batch File to Bank Portal
    Bank-->>Accountant: Bank Statement / UTR Reference (UTR-20261118-99)
    Accountant->>Backend: POST /api/v1/payments/reconciliation (Confirm Settlement)
    Backend->>TenantDB: ATOMIC DEBIT: customer_ledger_accounts (CUSTOMER_PAYABLE -> CASH_BANK)
    Backend->>TenantDB: UPDATE payment_batches SET status='RECONCILED'
```
