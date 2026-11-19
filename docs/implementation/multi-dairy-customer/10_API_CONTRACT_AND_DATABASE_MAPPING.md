# 10 — API CONTRACT AND DATABASE MAPPING

**Execution Reference:** `DFARM-MULTI-DAIRY-CUSTOMER-MEMBERSHIP`  
**Target Systems:** REST Endpoints, Database Columns, Request/Response Schemas

---

## 1. REST API Specification

### Endpoint 1: Verify OTP & Discover Memberships
- **Method:** `POST /api/v1/auth/verify-otp`
- **Request Body:**
  ```json
  {
    "mobileNumber": "9876543210",
    "otp": "123456"
  }
  ```
- **Response Body (`200 OK`):**
  ```json
  {
    "success": true,
    "globalCustomerId": "a0000000-0000-0000-0000-000000000001",
    "memberships": [
      {
        "id": "m0000000-0000-0000-0000-000000000001",
        "globalCustomerId": "a0000000-0000-0000-0000-000000000001",
        "organizationId": "00000000-0000-0000-0000-000000000010",
        "tenantCustomerId": "c0000000-0000-0000-0000-000000000001",
        "farmerCode": "C-WARNA-101",
        "membershipStatus": "APPROVED",
        "dairyName": "Warna Sahakari Dudh Utpadak Sanstha",
        "dairyCode": "WARNA-01",
        "dairyAddress": "Warnanagar, Kolhapur",
        "centerId": "00000000-0000-0000-0000-000000000101",
        "centerName": "Warna Main Center"
      }
    ],
    "requiresDairySelection": true,
    "availableDairiesCount": 1
  }
  ```

---

### Endpoint 2: Select Active Dairy Session
- **Method:** `POST /api/v1/auth/customer/select-dairy`
- **Request Body:**
  ```json
  {
    "dairyId": "00000000-0000-0000-0000-000000000010",
    "globalCustomerId": "a0000000-0000-0000-0000-000000000001"
  }
  ```
- **Response Body (`200 OK`):**
  ```json
  {
    "success": true,
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "eyJhbGciOi...",
    "expiresIn": 86400,
    "selectedDairy": {
      "dairyId": "00000000-0000-0000-0000-000000000010",
      "dairyName": "Warna Sahakari Dudh Utpadak Sanstha",
      "farmerCode": "C-WARNA-101",
      "membershipStatus": "APPROVED"
    }
  }
  ```

---

### Endpoint 3: Switch Dairy (In-App)
- **Method:** `POST /api/v1/customers/switch-dairy`
- **Headers:** `Authorization: Bearer <existing_token>`
- **Request Body:**
  ```json
  {
    "dairyId": "00000000-0000-0000-0000-000000000020",
    "globalCustomerId": "a0000000-0000-0000-0000-000000000001"
  }
  ```
- **Response Body (`200 OK`):**
  ```json
  {
    "success": true,
    "accessToken": "eyJhbGciOi...",
    "selectedDairy": {
      "dairyId": "00000000-0000-0000-0000-000000000020",
      "dairyName": "Krishna Valley Cooperative Dairy",
      "farmerCode": "C-KRISHNA-204",
      "membershipStatus": "APPROVED"
    }
  }
  ```

---

### Endpoint 4: List Customer Memberships
- **Method:** `GET /api/v1/customers/memberships`
- **Query Params:** `?phone=%2B919876543210` or Bearer Token
- **Response Body (`200 OK`):**
  ```json
  {
    "success": true,
    "data": [ ...CustomerMembership[] ]
  }
  ```

---

## 2. SQL Column Mappings

| TypeScript Domain Field | Central DB Column | Tenant DB Column | Type | Nullable |
|---|---|---|---|---|
| `globalCustomerId` | `global_customer_identities.id` | `customers.global_customer_id` | `UUID` | No / Yes |
| `phone` | `global_customer_identities.normalized_mobile_number` | `customers.normalized_mobile_number` | `VARCHAR(20)` | No |
| `organizationId` | `customer_dairy_memberships.organization_id` | `customers.organization_id` | `UUID` | No |
| `tenantCustomerId` | `customer_dairy_memberships.tenant_customer_id` | `customers.id` | `UUID` | No |
| `farmerCode` | `customer_dairy_memberships.farmer_code` | `customers.farmer_code` | `VARCHAR(30)` | Yes |
| `membershipStatus` | `customer_dairy_memberships.membership_status` | `customers.registration_status` | `VARCHAR(50)` | No |
| `dairyName` | `customer_dairy_memberships.dairy_name` | `organizations.name` | `VARCHAR(150)` | Yes |
