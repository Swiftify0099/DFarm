# Payment & Reconciliation REST API Reference

## 1. Overview

The Payment & Reconciliation API exposes RESTful endpoints for individual farmer payouts, customer repayments, bulk batches, statement reconciliation, and receipt retrieval under the `/api/v1` namespace.

All requests require JWT Bearer authentication. Tenant (`organizationId`) and center isolation are automatically enforced.

---

## 2. Payout Endpoints (`/api/v1/payments/payouts`)

### 2.1 Create Payout
- **Method:** `POST /api/v1/payments/payouts`
- **Authorized Roles:** `DAIRY_OWNER`, `DAIRY_ADMIN`, `ACCOUNTS_EMPLOYEE`, `COLLECTION_OPERATOR`
- **Request Body:**
  ```json
  {
    "centerId": "0b12fe90-48e0-4dc6-8ca3-e7ef9750034a",
    "customerId": "812b322a-2a21-4fae-9d22-d7b884d0012e",
    "amount": 5000.00,
    "currency": "INR",
    "paymentMethod": "BANK_TRANSFER",
    "referenceNumber": "REF-PAYOUT-001",
    "idempotencyKey": "IDEM-PAYOUT-001",
    "allowOverpaymentAdvance": false,
    "notes": "Milk settlement for Nov 2026"
  }
  ```
- **Response (HTTP 201 Created):**
  ```json
  {
    "success": true,
    "data": {
      "payoutId": "...",
      "status": "PENDING_APPROVAL",
      "amount": 5000.00,
      "currency": "INR",
      "eligiblePayableBalance": 5000.00,
      "isIdempotentReplay": false
    }
  }
  ```

### 2.2 Approve Payout
- **Method:** `POST /api/v1/payments/payouts/:payoutId/approve`
- **Authorized Roles:** `DAIRY_OWNER`, `DAIRY_ADMIN`, `SUPERVISOR`
- **Rule:** Initiator cannot approve their own payout (`SELF_APPROVAL_NOT_PERMITTED`).

### 2.3 Submit Payout
- **Method:** `POST /api/v1/payments/payouts/:payoutId/submit`
- **Authorized Roles:** `DAIRY_OWNER`, `DAIRY_ADMIN`, `ACCOUNTS_EMPLOYEE`
- **Request Body:** `{ "paymentReference": "UTR99112233" }`

### 2.4 Confirm Settlement
- **Method:** `POST /api/v1/payments/payouts/:payoutId/confirm`
- **Authorized Roles:** `DAIRY_OWNER`, `DAIRY_ADMIN`, `ACCOUNTS_EMPLOYEE`
- **Effect:** Atomically posts debit to Customer Subledger and updates payout status to `SETTLED`.

### 2.5 Fail Payout
- **Method:** `POST /api/v1/payments/payouts/:payoutId/fail`
- **Request Body:** `{ "failureReason": "Invalid account number or IFSC code" }`

### 2.6 Reverse Payout
- **Method:** `POST /api/v1/payments/payouts/:payoutId/reverse`
- **Authorized Roles:** `DAIRY_OWNER`, `DAIRY_ADMIN`
- **Request Body:** `{ "reason": "Erroneous duplicate transfer" }`

---

## 3. Customer Repayment Endpoints (`/api/v1/payments/receipts`)

### 3.1 Record Debt Repayment Receipt
- **Method:** `POST /api/v1/payments/receipts`
- **Authorized Roles:** `DAIRY_OWNER`, `DAIRY_ADMIN`, `ACCOUNTS_EMPLOYEE`, `COLLECTION_OPERATOR`
- **Request Body:**
  ```json
  {
    "centerId": "0b12fe90-48e0-4dc6-8ca3-e7ef9750034a",
    "customerId": "812b322a-2a21-4fae-9d22-d7b884d0012e",
    "amount": 1500.00,
    "paymentMethod": "CASH",
    "transactionReference": "VOUCH-CASH-001",
    "idempotencyKey": "IDEM-RECEIPT-001",
    "notes": "Cattle feed credit clearance"
  }
  ```

### 3.2 Confirm Receipt
- **Method:** `POST /api/v1/payments/receipts/:receiptId/confirm`

---

## 4. Bulk Batch Endpoints (`/api/v1/payments/batches`)

- `POST /api/v1/payments/batches`: Aggregate eligible payables and generate draft batch.
- `GET /api/v1/payments/batches/:batchId`: Retrieve batch summary and per-beneficiary items with masked accounts.
- `POST /api/v1/payments/batches/:batchId/approve`: Supervisor approval for entire batch.
- `POST /api/v1/payments/batches/:batchId/submit`: Mark batch dispatched to bank.
- `POST /api/v1/payments/batches/:batchId/reconcile`: Reconcile individual beneficiary statuses.

---

## 5. Bank Reconciliation Endpoints (`/api/v1/reconciliation`)

- `POST /api/v1/reconciliation/import`: Upload and process bank statement CSV.
- `GET /api/v1/reconciliation`: Query reconciliation records with status filters.
- `POST /api/v1/reconciliation/:recordId/resolve`: Manually resolve disputed or mismatched entries.
- `POST /api/v1/reconciliation/webhook/:provider`: Authenticated banking webhook endpoint with HMAC verification.

---

## 6. History & Receipts Endpoints

- `GET /api/v1/payments/customers/:customerId`: Customer payment and receipt ledger history.
- `GET /api/v1/payments/customers/:customerId/summary`: Live verified liability, pending holds, and eligible payable balance.
- `GET /api/v1/payments/:paymentId`: Payout/receipt details with masked account.
- `GET /api/v1/payments/:paymentId/receipt`: Formatted 40-column thermal receipt slip text.
