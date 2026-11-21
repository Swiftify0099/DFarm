# DFARM — CUSTOMER FACE BIOMETRIC UPDATE 404 & TEST FACE NETWORK ERROR
## 01. CUSTOMER BIOMETRIC API INVENTORY

**Execution Reference:** `DFARM-CUSTOMER-FACE-API-404-NETWORK-FIX`  
**Execution Timestamp:** 2026-11-20  

---

### 1. Overview & Service Inventory

Biometric management and face recognition operations in the DFARM architecture span two core Express presentation routers in `services/backend`:

1. `services/backend/src/presentation/routes/customers.routes.ts`:
   - Customer profile, enrollment, biometrics lifecycle, and membership management.
2. `services/backend/src/presentation/routes/identity.routes.ts`:
   - YuNet + SFace face matching (1:1 and 1:N), encrypted template retrieval, and face model version control.

---

### 2. Comprehensive Endpoint Inventory

| HTTP Verb | Route Path | Authorized Roles | Tenant Context Source | Purpose | Request Body / Params | Expected Response |
|---|---|---|---|---|---|---|
| `POST` | `/api/v1/customers/biometrics/update` | `FARMER_CUSTOMER`, `DAIRY_ADMIN`, `SUPER_ADMIN` | Header (`X-Dairy-Tenant-Id`, `X-Organization-Id`) or JWT `organizationId` | Update caller's face biometrics (caller inferred from auth token) | `{ embedding: number[128], modelVersion?: string }` | `200 OK` `{ success: true, message: '...' }` |
| `PUT` | `/api/v1/customers/biometrics/update` | `FARMER_CUSTOMER`, `DAIRY_ADMIN`, `SUPER_ADMIN` | Header or JWT | Idempotent update of caller's face biometrics | Same as above | `200 OK` |
| `POST` | `/api/v1/customers/me/biometrics/update` | `FARMER_CUSTOMER` | Header or JWT | Explicit `/me` route for customer biometrics | Same as above | `200 OK` |
| `POST` | `/api/v1/customers/:id/biometrics/update` | `FARMER_CUSTOMER` (self), `DAIRY_ADMIN`, `SUPER_ADMIN` | Header or JWT | Parameterized biometric update | `:id` in URL, `{ embedding: number[128] }` | `200 OK` |
| `POST` | `/api/v1/identity/face/match` | Any authenticated user, or kiosk device | `X-Organization-Id`, `X-Dairy-Tenant-Id`, or JWT | Real-time face matching (1:1 customer test or 1:N kiosk identification) | `{ embedding: number[128], customerId?: string, organizationId?: string }` | `200 OK` `{ matched: true/false, similarityScore: number, threshold: 0.363, ... }` |
| `GET` | `/api/v1/identity/face/templates` | `DAIRY_ADMIN`, `COLLECTION_OPERATOR`, `SUPER_ADMIN` | Header or Query `organizationId` | Retrieve encrypted face templates for offline kiosk caching | Query `?organizationId=...` | `200 OK` `Template list` |
| `GET` | `/api/v1/customers/me` | `FARMER_CUSTOMER` | Header or JWT | Customer profile and biometric enrollment status check | None | `200 OK` Profile data with `biometricStatus` |
| `GET` | `/api/v1/customers/:id` | `FARMER_CUSTOMER` (self), Staff | Header or JWT | Canonical customer profile retrieval | `:id` in URL | `200 OK` Profile data |

---

### 3. Detailed Contract Specifications

#### 3.1 Update Biometrics Contract
- **Headers:**
  ```http
  Authorization: Bearer <JWT>
  X-Organization-Id: <dairy_id>
  Content-Type: application/json
  ```
- **Payload Schema:**
  ```json
  {
    "embedding": [0.0821, -0.0135, ...], // 128 elements, L2 normalized
    "modelVersion": "sface_int8_2021dec",
    "rfidCardUid": "E28011700000020"    // Optional RFID binding
  }
  ```
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Biometrics and RFID card UID updated successfully.",
    "data": {
      "customerId": "ace6ebaa-9908-4f81-b65d-5bf75de56a0c",
      "biometricStatus": {
        "isEnrolled": true,
        "status": "ENROLLED",
        "lastUpdated": "2026-11-20T09:15:48.120Z",
        "modelVersion": "sface_int8_2021dec"
      }
    }
  }
  ```

#### 3.2 Face Matching Contract (`/api/v1/identity/face/match`)
- **1:1 Verification (Customer App "Test Face"):**
  - **Inputs:** `embedding` (128-D vector), `customerId` (explicit UUID or `'me'`)
  - **Logic:** Compares probe embedding against stored enrollment vector for that specific customer using cosine distance.
  - **Threshold:** Calibrated SFace cosine threshold of `0.363`.
- **1:N Identification (Collection Kiosk Operator):**
  - **Inputs:** `embedding` (128-D vector), `customerId` omitted.
  - **Logic:** Scans all active enrolled templates in the specified dairy tenant database, selects candidate with maximum cosine similarity above `0.363`.
- **Match Response (`200 OK`):**
  ```json
  {
    "success": true,
    "matched": true,
    "similarity": 0.892,
    "similarityScore": 0.892,
    "threshold": 0.363,
    "farmerId": "ace6ebaa-9908-4f81-b65d-5bf75de56a0c",
    "farmerCode": "F-4401",
    "farmerName": "Pandurang Mahadev Patil"
  }
  ```

---

### 4. Encryption & Privacy Invariants
1. Raw floating-point vectors are **NEVER** returned in customer profiles, diagnostics responses, or audit logs.
2. Vectors in PostgreSQL are stored encrypted using **AES-256-GCM** with Authenticated Additional Data (AAD) bound to `tenantId + customerId`.
3. Only the mathematical similarity score, threshold, and customer identifiers are returned across the wire.
