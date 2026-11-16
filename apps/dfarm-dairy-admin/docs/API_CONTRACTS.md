# DFarm Dairy Admin Web — Typed API Contracts

All endpoints enforce tenant isolation via the `X-Dairy-Tenant-ID` header and session validation via `Authorization: Bearer <token>`.

## 1. Authentication Endpoints

### `POST /api/v1/auth/otp/send`
- **Description:** Dispatches a genuine 6-digit OTP to the registered mobile number.
- **Request Body:**
  ```json
  {
    "mobileNumber": "9876543210"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "OTP dispatched to +91 9876543210. Valid for 5 minutes.",
    "expiresInSeconds": 300
  }
  ```

### `POST /api/v1/auth/otp/verify`
- **Description:** Validates 6-digit OTP, resolves authorized dairy tenant, and returns admin user session.
- **Request Body:**
  ```json
  {
    "mobileNumber": "9876543210",
    "otp": "849201"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "id": "staff-01",
    "fullName": "Rajesh Shankarrao Patel",
    "mobileNumber": "9876543210",
    "dairyId": "dairy-ten-9801",
    "dairyName": "Gokul Dairy Farmers Cooperative",
    "dairyCode": "DF-GOKUL-01",
    "isPrimaryAdmin": true,
    "role": "PRIMARY_DAIRY_ADMIN",
    "permissions": ["VIEW_DASHBOARD", "MANAGE_CUSTOMERS", "..."],
    "sessionToken": "dfarm_jwt_eyJhbGciOi...",
    "lastLoginAt": "2026-11-15T15:00:00Z"
  }
  ```

---

## 2. Customer Approvals & Directory Endpoints

### `GET /api/v1/customers/registrations/pending`
- **Description:** Retrieves pending registration requests awaiting administrative review.
- **Headers:** `X-Dairy-Tenant-ID: dairy-ten-9801`
- **Response (200 OK):**
  ```json
  [
    {
      "id": "reg-req-301",
      "dairyId": "dairy-ten-9801",
      "candidateName": "Dnyaneshwar Vitthal More",
      "mobileNumber": "9823112244",
      "submittedAt": "2026-11-14T16:45:00Z",
      "address": "Plot 45, Near Hanuman Temple",
      "village": "Gokul Shirgaon",
      "preferredCategory": "COW",
      "faceCapture": {
        "templateVersion": "v1.2",
        "modelVersion": "YuNet-v1.0 + SFace-INT8-v1.0",
        "consentTimestamp": "2026-11-14T16:44:12Z",
        "consentAgreed": true,
        "enrollmentStatus": "PENDING_APPROVAL",
        "qualityScore": 96.4,
        "captureDevice": "Customer App Android / SM-M315F"
      },
      "status": "PENDING"
    }
  ]
  ```

### `POST /api/v1/customers/registrations/:id/approve`
- **Description:** Approves pending registration, generates unique `customerCode`, and activates biometric template.
- **Headers:** `X-Dairy-Tenant-ID: dairy-ten-9801`
- **Response (200 OK):** Returns newly activated `Customer` object.

### `POST /api/v1/customers/registrations/:id/reject`
- **Description:** Rejects pending registration with a mandatory explanation.
- **Request Body:**
  ```json
  {
    "reason": "Applicant residence is outside the operational milk collection route."
  }
  ```

---

## 3. Milk Collection & Adjustment Endpoints

### `GET /api/v1/collections/transactions`
- **Query Parameters:** `?customerId=cust-101&date=2026-11-15`
- **Response (200 OK):** List of `MilkCollectionTransaction` entries.

### `POST /api/v1/collections/transactions/:id/adjust`
- **Description:** Non-destructively adjusts a historical milk intake record, logs audit diff, and posts compensating ledger entry.
- **Request Body:**
  ```json
  {
    "newWeightLiters": 16.8,
    "reason": "Scale tare recalibration confirmed by Shift Supervisor"
  }
  ```

---

## 4. Rate Chart Versioning Endpoints

### `POST /api/v1/rate-charts/versions`
- **Description:** Creates a new draft rate chart version.
- **Request Body:**
  ```json
  {
    "title": "Winter 2026 Revision",
    "milkCategory": "COW",
    "baseRatePerLiter": 39.5,
    "minFat": 3.0,
    "maxFat": 5.0,
    "fatStep": 0.1,
    "minSnf": 8.0,
    "maxSnf": 9.2,
    "snfStep": 0.1,
    "effectiveDate": "2026-12-01",
    "changeNotes": "Quarterly seasonal incentive adjustment"
  }
  ```

### `POST /api/v1/rate-charts/versions/:id/activate`
- **Description:** Activates the specified version, setting previously active version for that milk type to `ARCHIVED`.

---

## 5. Billing & Feed Inventory Endpoints

### `POST /api/v1/billing/fortnightly/generate`
- **Description:** Generates settlement bill for specified customer and period. Rejects duplicates.
- **Request Body:**
  ```json
  {
    "customerId": "cust-101",
    "periodStart": "2026-11-01",
    "periodEnd": "2026-11-15",
    "cycleName": "Early November 2026"
  }
  ```

### `POST /api/v1/feed/sales`
- **Description:** Records customer feed sale, deducts physical stock, and debits customer milk ledger.
- **Request Body:**
  ```json
  {
    "customerId": "cust-101",
    "productId": "feed-p1",
    "quantity": 2,
    "paymentMode": "LEDGER_DEBIT",
    "notes": "Approved fortnightly quota"
  }
  ```
