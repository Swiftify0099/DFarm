# DFarm Milk Collection & Pricing API Documentation

## 1. Overview
The Milk Collection and Rates API provides RESTful endpoints mounted under `/api/v1/collections` and `/api/v1/rates`. All routes require authentication (`COLLECTION_OPERATOR`, `CENTER_SUPERVISOR`, or `ADMIN`) and enforce organization and center boundaries.

---

## 2. Collection Endpoints (`/api/v1/collections`)

### 2.1 Initialize Collection Session
**`POST /api/v1/collections/sessions`**
Creates a new milk collection session in state `OPEN`.

- **Headers:** `Authorization: Bearer <token>`
- **Request Body:**
```json
{
  "centerId": "uuid",
  "customerId": "uuid",
  "shiftType": "MORNING" | "EVENING",
  "selectedMilkCategory": "COW" | "BUFFALO",
  "identificationMethod": "FACE" | "RFID" | "SUPERVISOR_MANUAL",
  "deviceId": "string",
  "intakeSequenceUuid": "uuid (optional)",
  "businessDate": "YYYY-MM-DD (optional)",
  "identificationLogId": "uuid (optional)"
}
```
- **Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "sessionId": "uuid",
    "customer": {
      "id": "uuid",
      "farmerCode": "FC-1001",
      "fullName": "Dattatraya Shinde"
    },
    "centerId": "uuid",
    "shiftType": "MORNING",
    "selectedMilkCategory": "COW",
    "sessionState": "OPEN",
    "intakeSequenceUuid": "uuid",
    "startedAt": "2026-11-14T03:14:21.000Z"
  }
}
```
- **Error Responses:**
  - `400 Bad Request`: `ACTIVE_SESSION_EXISTS` (Customer has an unclosed session).
  - `403 Forbidden`: `CUSTOMER_INACTIVE` | `CATEGORY_UNAUTHORIZED` | `CENTER_MISMATCH`.

---

### 2.2 Record Quality & Weight Measurements
**`POST /api/v1/collections/sessions/:sessionId/measurements`**
Records gross, tare, net weight, fat percentage, and SNF percentage. Transitions session state to `MEASUREMENTS_RECEIVED`.

- **Request Body:**
```json
{
  "fatPercentage": 4.0,
  "snfPercentage": 8.5,
  "clr": 28.0,
  "netWeight": 15.5,
  "grossWeight": 16.5,
  "tareWeight": 1.0,
  "unit": "KG",
  "readingSource": "MANUAL_ENTRY" | "HARDWARE_INTERFACE" | "SOFTWARE_SIMULATOR"
}
```
- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "sessionId": "uuid",
    "fatPercentage": 4.0,
    "snfPercentage": 8.5,
    "netWeight": 15.5,
    "sessionState": "MEASUREMENTS_RECEIVED",
    "updatedAt": "2026-11-14T03:14:22.000Z"
  }
}
```

---

### 2.3 Validate Measurements Against Biological Limits
**`POST /api/v1/collections/sessions/:sessionId/validate`**
Validates recorded measurements against center biological limits. Transitions state to `READY_FOR_REVIEW`.

- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "sessionId": "uuid",
    "validationStatus": "VALID",
    "sessionState": "READY_FOR_REVIEW",
    "limits": {
      "minFat": 2.5,
      "maxFat": 6.5,
      "minSnf": 7.5,
      "maxSnf": 10.0,
      "minWeight": 0.5,
      "maxWeight": 100.0
    }
  }
}
```
- **Error Response (400 Bad Request):**
```json
{
  "success": false,
  "error": {
    "code": "MEASUREMENT_OUT_OF_BOUNDS",
    "message": "Fat 1.0 is below minimum threshold 2.5"
  }
}
```

---

### 2.4 Complete Collection & Commit Subledger
**`POST /api/v1/collections/sessions/:sessionId/complete`**
Atomically evaluates rate version, calculates total payable, inserts intake record, credits customer subledger, records double-entry lines, and formats receipt.

- **Request Body:**
```json
{
  "clientIntakeUuid": "uuid",
  "idempotencyKey": "string",
  "netWeight": 15.5,
  "fatPercentage": 4.0,
  "snfPercentage": 8.5,
  "rateChartVersionId": "uuid (optional)"
}
```
- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "collectionId": "uuid",
    "sessionId": "uuid",
    "status": "COMPLETED",
    "clientIntakeUuid": "uuid",
    "rateVersion": {
      "rateChartVersionId": "uuid",
      "versionNumber": 1
    },
    "pricing": {
      "appliedRatePerUnit": 36.50,
      "netWeight": 15.5,
      "totalAmount": 565.75,
      "calculationRule": "FAT_SNF_MATRIX"
    },
    "subledger": {
      "transactionId": "uuid",
      "creditAmount": 565.75,
      "newBalance": 1250.00
    },
    "receipt": {
      "receiptNumber": "RCP-20261114-1001",
      "rawSlipText": "...40-column thermal slip...",
      "sha256VerificationHash": "6b38c208..."
    }
  }
}
```

---

### 2.5 Safely Cancel Collection Session
**`POST /api/v1/collections/sessions/:sessionId/cancel`**
Safely cancels an uncommitted session, recording an audit event.

- **Request Body:**
```json
{
  "cancellationReason": "Farmer brought wrong milk can (Buffalo instead of Cow)"
}
```
- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "sessionId": "uuid",
    "status": "CANCELLED",
    "reason": "Farmer brought wrong milk can (Buffalo instead of Cow)"
  }
}
```

---

### 2.6 Shift Summary
**`GET /api/v1/collections/shift-summary?centerId=uuid&shift=MORNING&businessDate=YYYY-MM-DD`**
Returns aggregated statistics for the specified collection shift:
- Total farmers served
- Total intake weight in KG
- Cow vs. Buffalo volume split
- Weighted average Fat % and SNF %
- Total payout liabilities

---

### 2.7 Collection Reversal / Adjustment
**`POST /api/v1/collections/adjust`**
Allows authorized supervisors to reverse or adjust an incorrect collection.
- Enforces strict audit trail (`adjusted_by`, `adjustment_reason`).
- Posts balancing debit transaction to customer subledger.
- Preserves the original `milk_collections` record intact.

---

## 3. Rates Calculation Endpoint (`/api/v1/rates/calculate`)
**`POST /api/v1/rates/calculate`**
Queries approved rate charts and calculates payable amount without committing.

- **Request Body:**
```json
{
  "centerId": "uuid",
  "category": "COW",
  "fatPercentage": 4.0,
  "snfPercentage": 8.5,
  "quantity": 10.0
}
```
- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "ratePerUnit": 36.50,
    "totalAmount": 365.00,
    "rateChartVersionId": "uuid",
    "rule": "FAT_SNF_MATRIX"
  }
}
```
