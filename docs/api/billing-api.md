# DFarm Billing & Statement REST API Reference

All billing endpoints are mounted at `/api/v1/billing` and require a valid JSON Web Token (`Bearer <JWT>`) in the `Authorization` header.

Rate limiting applies to all routes (100 requests per minute per IP/Actor). Standard error structures conform to the DFarm error envelope: `{"success": false, "error": {"code": "...", "message": "...", "details": ...}}`.

---

## 1. Billing Period Management Endpoints

### 1.1 List Billing Periods
- **Endpoint**: `GET /api/v1/billing/periods`
- **Authorized Roles**: `SUPER_ADMIN`, `DAIRY_OWNER`, `CENTER_MANAGER`, `ACCOUNTANT`
- **Query Parameters**:
  - `centerId` (UUID, optional): Filter by center.
  - `status` (String, optional): Filter by `BillingPeriodStatus`.
  - `cycleType` (String, optional): Filter by `BillingCycleType`.
  - `page` (Integer, default 1): Page number.
  - `limit` (Integer, default 20, max 100): Page limit.

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "a3938b70-bfd5-4c6a-8c4b-a45e789343ca",
        "centerId": "bbbff1a7-eace-4c04-b97e-95a808fa487a",
        "periodName": "November 2026 Test",
        "startDate": "2026-11-01",
        "endDate": "2026-11-30",
        "cycleType": "CALENDAR_MONTH",
        "status": "GENERATED",
        "billsCount": "42",
        "totalGrossAmount": "84120.50",
        "totalNetAmount": "72400.00"
      }
    ],
    "pagination": {
      "total": 1,
      "page": 1,
      "limit": 20,
      "totalPages": 1
    }
  }
}
```

---

### 1.2 Create Billing Period
- **Endpoint**: `POST /api/v1/billing/periods`
- **Authorized Roles**: `SUPER_ADMIN`, `DAIRY_OWNER`, `CENTER_MANAGER`, `ACCOUNTANT`
- **Request Body**:
```json
{
  "centerId": "bbbff1a7-eace-4c04-b97e-95a808fa487a",
  "periodName": "November 2026 Settlement",
  "startDate": "2026-11-01",
  "endDate": "2026-11-30",
  "cycleType": "CALENDAR_MONTH"
}
```
- **Responses**:
  - `201 Created`: Period created successfully.
  - `400 Bad Request`: `startDate` is greater than `endDate`.
  - `409 Conflict`: Period dates overlap with an existing period for this center (`OVERLAPPING_BILLING_PERIOD`).

---

### 1.3 Get Billing Period Details
- **Endpoint**: `GET /api/v1/billing/periods/:periodId`
- **Authorized Roles**: `SUPER_ADMIN`, `DAIRY_OWNER`, `CENTER_MANAGER`, `ACCOUNTANT`
- **Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "period": {
      "id": "a3938b70-bfd5-4c6a-8c4b-a45e789343ca",
      "centerId": "bbbff1a7-eace-4c04-b97e-95a808fa487a",
      "periodName": "November 2026 Settlement",
      "startDate": "2026-11-01",
      "endDate": "2026-11-30",
      "cycleType": "CALENDAR_MONTH",
      "status": "APPROVED",
      "totalBills": 42,
      "totalGrossMilk": 84120.50,
      "totalNetPayable": 72400.00
    },
    "bills": [ ... ]
  }
}
```

---

### 1.4 Generate Bills (Batch or Single Customer)
- **Endpoint**: `POST /api/v1/billing/periods/:periodId/generate`
- **Authorized Roles**: `SUPER_ADMIN`, `DAIRY_OWNER`, `CENTER_MANAGER`, `ACCOUNTANT`
- **Request Body (Optional)**:
```json
{
  "customerId": "3e65da6d-4528-46e1-ab19-9ee78cf6e1c5"
}
```
*(Omit body or pass empty object `{}` to generate statements for all customers in the center).*
- **Responses**:
  - `200 OK`: `{"success": true, "data": {"periodId": "...", "billsGenerated": 42, "status": "GENERATED"}}`.
  - `403 Forbidden`: Caller lacks access to the period's center (`CENTER_ACCESS_DENIED`).
  - `409 Conflict`: Period is already finalized (`PERIOD_ALREADY_FINALIZED`).

---

### 1.5 Get Billing Period Progress
- **Endpoint**: `GET /api/v1/billing/periods/:periodId/progress`
- **Authorized Roles**: `SUPER_ADMIN`, `DAIRY_OWNER`, `CENTER_MANAGER`, `ACCOUNTANT`
- **Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "periodId": "a3938b70-bfd5-4c6a-8c4b-a45e789343ca",
    "status": "GENERATED",
    "totalBills": 42,
    "statusCounts": {
      "GENERATED": 40,
      "APPROVED": 2,
      "FINALIZED": 0
    },
    "generatedAt": "2026-11-14T04:36:20.296Z"
  }
}
```

---

## 2. Customer Statement & PDF Endpoints

### 2.1 Get Customer Settlement Statement Preview
- **Endpoint**: `GET /api/v1/billing/customers/:customerId/statement?periodId=:periodId`
- **Authorized Roles**:
  - Staff: `SUPER_ADMIN`, `DAIRY_OWNER`, `CENTER_MANAGER`, `ACCOUNTANT` (scoped to customer's center).
  - Customers: `FARMER_CUSTOMER` (strictly isolated to `:customerId === token.customerProfile.customerId`).
- **Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "customer": {
      "id": "3e65da6d-4528-46e1-ab19-9ee78cf6e1c5",
      "farmerCode": "FARMER-101",
      "fullName": "Ananda Jadhav",
      "mobileNumber": "+91 98*****4210"
    },
    "bill": {
      "id": "708f0dbd-a3e7-4d91-8d2c-d3bfbce4353c",
      "billNumber": "BILL-202611-FARMER101",
      "billStatus": "APPROVED",
      "openingBalance": 1250.50,
      "grossMilkAmount": 2050.00,
      "otherCreditsAmount": 0.00,
      "totalCredits": 2050.00,
      "feedDebitsAmount": 350.00,
      "advanceDebitsAmount": 400.00,
      "deductionDebitsAmount": 150.00,
      "otherDebitsAmount": 0.00,
      "totalDebits": 900.00,
      "settledPayoutsAmount": 500.00,
      "closingBalance": 1900.50,
      "netPayableAmount": 1900.50,
      "isNegativeBalance": false,
      "version": 1
    },
    "milkBreakdown": {
      "cow": {
        "collectionsCount": 2,
        "totalQuantityKg": 35.00,
        "totalAmount": 1400.00
      },
      "buffalo": {
        "collectionsCount": 1,
        "totalQuantityKg": 10.00,
        "totalAmount": 650.00
      },
      "totalCollectionsCount": 3,
      "totalQuantityKg": 45.00,
      "totalAmount": 2050.00
    },
    "items": [
      {
        "itemType": "MILK_COLLECTION",
        "businessDate": "2026-11-05",
        "shiftType": "MORNING",
        "milkCategory": "COW",
        "quantity": 15.00,
        "measurementUnit": "KG",
        "fatPercentage": 4.0,
        "snfPercentage": 8.5,
        "ratePerUnit": 40.00,
        "totalAmount": 600.00
      }
    ],
    "adjustments": []
  }
}
```

---

### 2.2 Download Customer Statement PDF
- **Endpoint**: `GET /api/v1/billing/:billId/pdf`
- **Authorized Roles**: Staff (scoped to center) or matching Customer (`FARMER_CUSTOMER`).
- **Response**: Binary stream with MIME `application/pdf`.
  - Header: `Content-Disposition: attachment; filename="BILL-202611-FARMER101.pdf"`
  - Header: `X-Statement-Checksum: 7b86cbb47bfe5aa096e868b178c3e79dbc1e768db672134365d68eefc80095c2`

---

## 3. Bill Lifecycle & Governance Endpoints

### 3.1 Submit Bill for Review
- **Endpoint**: `POST /api/v1/billing/:billId/submit-review`
- **Authorized Roles**: `SUPER_ADMIN`, `DAIRY_OWNER`, `CENTER_MANAGER`, `ACCOUNTANT`
- **Request Body**:
```json
{
  "notes": "Verified against physical morning intake receipts"
}
```
- **Response (200 OK)**: Bill status updated to `UNDER_REVIEW`.

---

### 3.2 Approve Bill
- **Endpoint**: `POST /api/v1/billing/:billId/approve`
- **Authorized Roles**: `SUPER_ADMIN`, `DAIRY_OWNER`, `CENTER_MANAGER`
- **Request Body**:
```json
{
  "notes": "Intake quantities verified and approved"
}
```
- **Response (200 OK)**: Bill status updated to `APPROVED`.

---

### 3.3 Finalize Bill
- **Endpoint**: `POST /api/v1/billing/:billId/finalize`
- **Authorized Roles**: `SUPER_ADMIN`, `DAIRY_OWNER` exclusively. Center Managers and Accountants receive `403 Forbidden`.
- **Request Body**:
```json
{
  "notes": "Official settlement finalized for bank disbursement"
}
```
- **Response (200 OK)**: Bill status updated to `FINALIZED`. PDF generated and sealed. Cryptographic hash recorded in `bill_finalization_records`.

---

### 3.4 Versioned Adjustment
- **Endpoint**: `POST /api/v1/billing/:billId/adjust`
- **Authorized Roles**: `SUPER_ADMIN`, `DAIRY_OWNER`, `CENTER_MANAGER`, `ACCOUNTANT`
- **Request Body**:
```json
{
  "adjustmentType": "CREDIT",
  "amount": 100.00,
  "reason": "Quality incentive bonus"
}
```
- **Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "billId": "708f0dbd-a3e7-4d91-8d2c-d3bfbce4353c",
    "version": 2,
    "billStatus": "CORRECTION_REQUIRED",
    "closingBalance": 2000.50,
    "netPayableAmount": 2000.50
  }
}
```
