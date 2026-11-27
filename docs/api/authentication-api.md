# DFarm Authentication & Identity API Specification
**Phase 05 Authoritative Specification — Authentication Endpoints & Token Exchange**

---

## 1. Overview

The DFarm authentication architecture integrates Supabase Auth and internal PostgreSQL identity management. The system validates Bearer JWT tokens server-side and maps the verified Auth subject (`auth.users.id` or verified internal UUID) to an internal entity:
1. **Staff User (`users` table):** Dairy Owners, Admins, Center Managers, Supervisors, Registration Officers, Collection Operators, Accountants.
2. **Customer Identity (`customers` table):** Registered milk suppliers/farmers.

---

## 2. Authentication Endpoints

### 2.1 Staff Login (Username / Email)
Used by administrators, center managers, registration officers, and operators to obtain an authenticated session.

- **Method & Path:** `POST /api/v1/auth/login`
- **Authentication:** Public
- **Request Body:**
  ```json
  {
    "username": "suresh_officer"
  }
  ```
- **Validation Rules:**
  - `username`: String, min 1, required.
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "token": "<JWT_ACCESS_TOKEN_PLACEHOLDER>",
      "user": {
        "id": "550e8400-e29b-41d4-a716-446655440001",
        "organizationId": "550e8400-e29b-41d4-a716-446655440000",
        "organizationName": "Sangli Sahakari Dudh Utpadak",
        "username": "suresh_officer",
        "fullName": "Suresh Patil",
        "email": "suresh.patil@sanglidairy.com",
        "phone": "+919988776655",
        "role": "REGISTRATION_OFFICER",
        "status": "ACTIVE",
        "primaryCenterId": "f7f9ae59-ffa8-49b7-aba8-123cbf6508db",
        "centerIds": ["f7f9ae59-ffa8-49b7-aba8-123cbf6508db"]
      }
    },
    "meta": {
      "requestId": "fad24daa-d12f-4579-82e3-7aa6c4e0304e",
      "timestamp": "2026-11-13T16:20:00.000Z"
    }
  }
  ```
- **Error Responses:**
  - `400 VALIDATION_ERROR`: Missing username.
  - `401 INVALID_CREDENTIALS`: User not found.
  - `403 ACCOUNT_SUSPENDED`: User account status is not `ACTIVE`.

---

### 2.2 Get Authenticated Profile (`/api/v1/auth/me`)
Returns the caller's server-verified identity, role, actor type, organization scope, and authorized intake center assignments.

- **Method & Path:** `GET /api/v1/auth/me`
- **Authentication:** `Authorization: Bearer <token>`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "authUserId": "550e8400-e29b-41d4-a716-446655440001",
      "internalId": "550e8400-e29b-41d4-a716-446655440001",
      "actorType": "STAFF",
      "role": "REGISTRATION_OFFICER",
      "organizationId": "550e8400-e29b-41d4-a716-446655440000",
      "authorizedCenterIds": [
        "f7f9ae59-ffa8-49b7-aba8-123cbf6508db"
      ],
      "primaryCenterId": "f7f9ae59-ffa8-49b7-aba8-123cbf6508db",
      "accountStatus": "ACTIVE"
    },
    "meta": {
      "requestId": "8a7d0976-196c-48d7-a562-a41f57ebe46f",
      "timestamp": "2026-11-13T16:20:01.000Z"
    }
  }
  ```
- **Error Responses:**
  - `401 UNAUTHORIZED`: Missing `Authorization` header.
  - `401 INVALID_TOKEN`: Token expired or signature invalid.
  - `403 UNMAPPED_IDENTITY`: Token subject is valid but does not map to any database entity.
  - `403 ACCOUNT_SUSPENDED`: Caller's account status is `SUSPENDED`.

---

### 2.3 Customer OTP Dispatch (Placeholder / Mobile Flow)
Initiates passwordless mobile OTP sign-in for farmers.

- **Method & Path:** `POST /api/v1/auth/otp/send`
- **Request Body:**
  ```json
  {
    "phone": "+919876543210"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "sent": true,
      "message": "OTP sent successfully"
    },
    "meta": { ... }
  }
  ```

---

### 2.4 Customer OTP Verification
Verifies the submitted OTP token and returns customer authentication token.

- **Method & Path:** `POST /api/v1/auth/otp/verify`
- **Request Body:**
  ```json
  {
    "phone": "+919876543210",
    "token": "123456"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "token": "<JWT_ACCESS_TOKEN_PLACEHOLDER>",
      "actorType": "CUSTOMER"
    },
    "meta": { ... }
  }
  ```
