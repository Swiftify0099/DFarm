# DFarm Customer Financial Ledger REST API Reference
**Phase 12 of 20: Complete Financial Accounting & Subledger Endpoints**

---

## 1. Authentication & Security Policies

- **Bearer Token:** All ledger endpoints require a signed JWT token in `Authorization: Bearer <token>`.
- **Customer Ownership Isolation:**
  - Role `FARMER_CUSTOMER` is strictly restricted to accessing records matching their own `sub` / `userId`.
  - Attempting to inspect another customer's ledger returns `403 CUSTOMER_ISOLATION_VIOLATION`.
- **Cross-Organization Isolation:** Staff members attempting to read or modify ledgers of another organization receive `403 CROSS_ORGANIZATION_ACCESS_DENIED`.
- **Standardized Response Envelope:** Every response conforms to `{ success: boolean, data?: any, error?: { code, message, details } }`.

---

## 2. Customer Subledger Endpoints

### 2.1 Get Customer Ledger Summary
```http
GET /api/v1/customers/:customerId/ledger/summary
```
- **Access:** Admin, Supervisor, Operator, Customer (Self only).
- **Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "customerId": "81795a02-1e54-4633-b27a-5d0e5aecb58b",
    "customerName": "Ramesh Jadhav",
    "farmerCode": "FC-P12-101",
    "openingBalance": 0.00,
    "totalMilkCredits": 365.00,
    "otherCredits": 150.00,
    "totalCredits": 515.00,
    "totalDebits": 250.00,
    "advances": 200.00,
    "deductions": 50.00,
    "settledPayouts": 0.00,
    "currentBalance": 265.00,
    "status": "ACTIVE",
    "currency": "INR",
    "lastTransactionAt": "2026-11-14T04:31:51.306Z"
  }
}
```

---

### 2.2 Get Paginated Ledger Transactions
```http
GET /api/v1/customers/:customerId/ledger/transactions?page=1&limit=20&direction=CREDIT&startDate=2026-11-01&endDate=2026-11-30
```
- **Query Parameters:**
  - `page` (default: 1): Page number.
  - `limit` (default: 20, max: 100): Page size.
  - `startDate`, `endDate`: ISO date format `YYYY-MM-DD`.
  - `direction`: Filter by `CREDIT` or `DEBIT`.
  - `transactionType`: Filter by exact transaction type code.
- **Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "c1387d7b-990e-4361-9c86-9a25b128522a",
        "transactionType": "MILK_COLLECTION_CREDIT",
        "direction": "CREDIT",
        "amount": 365.00,
        "balanceAfter": 365.00,
        "referenceEntity": "MILK_COLLECTION",
        "referenceId": "9175bb9a-4c28-4e89-a541-efc18b761a29",
        "description": "Milk Collection COW: 10.00 KG @ Rs 36.5",
        "createdAt": "2026-11-14T04:31:51.100Z",
        "receiptNumber": "RCP-9175BB9A"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalRecords": 1,
      "totalPages": 1
    }
  }
}
```

---

### 2.3 Get Printable Periodic Ledger Statement
```http
GET /api/v1/customers/:customerId/ledger/statement?startDate=2026-11-01&endDate=2026-11-15
```
- **Access:** Admin, Supervisor, Operator, Customer (Self).
- **Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "customerId": "81795a02-1e54-4633-b27a-5d0e5aecb58b",
    "customerName": "Ramesh Jadhav",
    "farmerCode": "FC-P12-101",
    "startDate": "2026-11-01",
    "endDate": "2026-11-15",
    "openingBalance": 0.00,
    "totalCredits": 515.00,
    "totalDebits": 250.00,
    "closingBalance": 265.00,
    "transactions": [...]
  }
}
```

---

## 3. Financial Posting & Workflow Endpoints

### 3.1 Disburse Customer Advance
```http
POST /api/v1/ledger/:customerId/advances
```
- **Access:** `SUPER_ADMIN`, `DAIRY_OWNER`, `CENTER_MANAGER`, `SUPERVISOR`.
- **Request Body:**
```json
{
  "amount": 200.00,
  "reason": "Emergency purchase of veterinary medicines",
  "recoveryType": "MONTHLY_BILL_DEDUCTION",
  "idempotencyKey": "IDEM-ADV-2026-001"
}
```
- **Response `201 Created`:**
```json
{
  "success": true,
  "data": {
    "advanceId": "df245e3d-4a34-456a-88a6-57351e3f4067",
    "customerId": "81795a02-1e54-4633-b27a-5d0e5aecb58b",
    "principalAmount": 200.00,
    "recoveredAmount": 0.00,
    "outstandingAmount": 200.00,
    "status": "ACTIVE",
    "newBalance": 165.00,
    "receiptNumber": "RCP-ADV-DF245E3D"
  }
}
```

---

### 3.2 Recover Customer Advance
```http
POST /api/v1/ledger/advances/:advanceId/recover
```
- **Access:** `SUPER_ADMIN`, `DAIRY_OWNER`, `CENTER_MANAGER`, `SUPERVISOR`, `COLLECTION_OPERATOR`.
- **Request Body:**
```json
{
  "amount": 80.00,
  "notes": "Cash counter repayment",
  "idempotencyKey": "IDEM-REC-2026-001"
}
```
- **Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "advanceId": "df245e3d-4a34-456a-88a6-57351e3f4067",
    "recoveredAmount": 80.00,
    "totalRecoveredAmount": 80.00,
    "remainingPrincipal": 120.00,
    "status": "ACTIVE",
    "newBalance": 245.00,
    "receiptNumber": "RCP-REC-DF245E3D"
  }
}
```

---

### 3.3 Post Authorized Deduction
```http
POST /api/v1/ledger/:customerId/deductions
```
- **Access:** `SUPER_ADMIN`, `DAIRY_OWNER`, `CENTER_MANAGER`, `SUPERVISOR`.
- **Request Body:**
```json
{
  "category": "VETERINARY_MEDICINE",
  "amount": 50.00,
  "description": "Deworming & Mineral mixture kit",
  "supportingReference": "VET-INV-891",
  "idempotencyKey": "IDEM-DED-2026-001"
}
```
- **Response `201 Created`:**
```json
{
  "success": true,
  "data": {
    "deductionId": "787bb4a5-92dc-4731-89e4-bcde5a701923",
    "customerId": "81795a02-1e54-4633-b27a-5d0e5aecb58b",
    "category": "VETERINARY_MEDICINE",
    "amount": 50.00,
    "newBalance": 195.00,
    "receiptNumber": "RCP-DED-787BB4A5"
  }
}
```

---

### 3.4 Initialize Customer Opening Balance
```http
POST /api/v1/ledger/:customerId/opening-balance
```
- **Access:** `SUPER_ADMIN`, `DAIRY_OWNER`.
- **Request Body:**
```json
{
  "amount": 500.00,
  "direction": "CREDIT",
  "openingDate": "2026-04-01",
  "supportingReference": "COOP-AUDIT-2026-Q1",
  "idempotencyKey": "IDEM-OB-2026-001"
}
```
- **Response `201 Created`:**
```json
{
  "success": true,
  "data": {
    "customerId": "9edb0e4f-ae6c-48ca-81c4-50148b94652f",
    "direction": "CREDIT",
    "amount": 500.00,
    "newBalance": 500.00,
    "receiptNumber": "RCP-OB-998DBF02"
  }
}
```

---

### 3.5 Post Controlled Ledger Adjustment
```http
POST /api/v1/ledger/:customerId/adjustments
```
- **Access:** `SUPER_ADMIN`, `DAIRY_OWNER`, `CENTER_MANAGER`, `SUPERVISOR`.
- **Request Body:**
```json
{
  "direction": "CREDIT",
  "amount": 150.00,
  "reason": "Authorized festive seasonal incentive approved by Board",
  "supportingReference": "BOARD-RES-45",
  "idempotencyKey": "IDEM-ADJ-2026-001"
}
```
- **Response `201 Created`:**
```json
{
  "success": true,
  "data": {
    "adjustmentId": "fa74b102-11a3-49dc-8a21-987cf65b3d01",
    "direction": "CREDIT",
    "amount": 150.00,
    "newBalance": 650.00,
    "receiptNumber": "RCP-ADJ-FA74B102"
  }
}
```

---

### 3.6 Reconcile Customer Account
```http
POST /api/v1/ledger/reconcile
```
- **Access:** `SUPER_ADMIN`, `DAIRY_OWNER`, `CENTER_MANAGER`.
- **Request Body:**
```json
{
  "customerId": "81795a02-1e54-4633-b27a-5d0e5aecb58b"
}
```
- **Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "customerId": "81795a02-1e54-4633-b27a-5d0e5aecb58b",
    "customerName": "Ramesh Jadhav",
    "farmerCode": "FC-P12-101",
    "accountBalance": 265.00,
    "computedBalance": 265.00,
    "isReconciled": true,
    "totalCredits": 515.00,
    "totalDebits": 250.00,
    "discrepancyCount": 0,
    "discrepancies": []
  }
}
```

---

## 4. Financial Management Reports Endpoints

| Endpoint | Method | Query Parameters | Description |
| :--- | :---: | :--- | :--- |
| `/api/v1/ledger/reports/balances` | `GET` | `centerId`, `status`, `minBalance`, `maxBalance` | Customer-wise balances and total dairy payable/receivable liability. |
| `/api/v1/ledger/reports/daily-summary`| `GET` | `date`, `centerId` | Daily aggregate credits, debits, transactions, and net liability shift. |
| `/api/v1/ledger/reports/center-liabilities`| `GET`| `date` | Procurement center-wise total liability breakdown. |
| `/api/v1/ledger/reports/advances` | `GET` | `centerId`, `status` | Outstanding customer loans, recovery rates, and remaining principal. |
| `/api/v1/ledger/reports/register` | `GET` | `startDate`, `endDate`, `centerId`, `direction`, `type` | Full detailed transaction register with running balances. |
