# DFarm Customer Management REST API Specification
**Phase 05 Authoritative Specification — Customer CRUD, Soft-Delete & Restore Lifecycle**

---

## 1. Overview & Security Rules

All customer management endpoints reside under `/api/v1/customers` and enforce strict server-side authorization:
- **Authentication:** Mandatory `Authorization: Bearer <token>`.
- **Role Permissions:**
  - `POST /api/v1/customers`: `SUPER_ADMIN`, `DAIRY_OWNER`, `CENTER_MANAGER`, `REGISTRATION_OFFICER`.
  - `GET /api/v1/customers`: All staff roles (`SUPER_ADMIN`, `DAIRY_OWNER`, `CENTER_MANAGER`, `SUPERVISOR`, `REGISTRATION_OFFICER`, `ACCOUNTANT`, `COLLECTION_OPERATOR`).
  - `GET /api/v1/customers/:customerId`: Authorized staff; Customers restricted strictly to their own ID.
  - `PATCH /api/v1/customers/:customerId`: `SUPER_ADMIN`, `DAIRY_OWNER`, `CENTER_MANAGER`, `REGISTRATION_OFFICER`.
  - `DELETE /api/v1/customers/:customerId`: `SUPER_ADMIN`, `DAIRY_OWNER` only.
  - `POST /api/v1/customers/:customerId/restore`: `SUPER_ADMIN`, `DAIRY_OWNER` only.
- **Center Isolation:** Staff users are restricted to customers belonging to their assigned center IDs unless they possess organization-wide authority (`DAIRY_OWNER` or `SUPER_ADMIN`).

---

## 2. Endpoints

### 2.1 Register New Customer
Registers a new milk supplier in an atomic PostgreSQL transaction.

- **Method & Path:** `POST /api/v1/customers`
- **Request Headers:**
  - `Authorization: Bearer <token>`
  - `X-Center-ID: <uuid>` (Optional; falls back to `centerId` in body or user's primary center)
- **Request Body:**
  ```json
  {
    "fullName": "Pandurang Tukaram Mane",
    "mobileNumber": "+919876543210",
    "permittedCategories": ["COW", "BUFFALO"],
    "centerId": "f7f9ae59-ffa8-49b7-aba8-123cbf6508db",
    "farmerCode": "FARM-10023",
    "address": {
      "village": "Nandre",
      "talukaSubdistrict": "Miraj",
      "district": "Sangli",
      "state": "Maharashtra",
      "postalCode": "416416"
    },
    "bankName": "State Bank of India",
    "bankAccountNumber": "30123456789",
    "bankIfscCode": "SBIN0001234",
    "bankAccountHolderName": "Pandurang T Mane"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "success": true,
    "data": {
      "id": "be5029d8-12bb-4d2a-837f-dd1d26747d4a",
      "organizationId": "550e8400-e29b-41d4-a716-446655440000",
      "primaryCenterId": "f7f9ae59-ffa8-49b7-aba8-123cbf6508db",
      "farmerCode": "FARM-10023",
      "fullName": "Pandurang Tukaram Mane",
      "normalizedMobileNumber": "+919876543210",
      "status": "DRAFT",
      "registrationStatus": "IN_PROGRESS",
      "permittedCategories": ["COW", "BUFFALO"],
      "address": {
        "village": "Nandre",
        "talukaSubdistrict": "Miraj",
        "district": "Sangli",
        "state": "Maharashtra",
        "postalCode": "416416"
      },
      "isDeleted": false,
      "createdAt": "2026-11-13T16:20:00.000Z",
      "updatedAt": "2026-11-13T16:20:00.000Z"
    },
    "meta": {
      "requestId": "ce22dfe7-4e7a-47dd-b116-5f4243db76eb",
      "timestamp": "2026-11-13T16:20:00.000Z"
    }
  }
  ```
- **Error Responses:**
  - `400 VALIDATION_ERROR`: Missing `fullName`, invalid mobile, or empty `permittedCategories`.
  - `403 FORBIDDEN`: Caller role is not authorized to register customers (e.g. `COLLECTION_OPERATOR`).
  - `409 DUPLICATE_MOBILE_NUMBER`: Mobile number already registered in this organization.

---

### 2.2 List Customers (Paginated & Filtered)
Returns paginated list of active, non-deleted customers.

- **Method & Path:** `GET /api/v1/customers`
- **Query Parameters:**
  - `page`: Integer (default: 1)
  - `limit`: Integer (default: 20, max: 100)
  - `centerId`: UUID (optional; filter by intake center)
  - `status`: String enum (`DRAFT`, `ACTIVE`, `SUSPENDED`)
  - `search`: String (matches `fullName`, `normalizedMobileNumber`, `farmerCode`)
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "items": [
        {
          "id": "be5029d8-12bb-4d2a-837f-dd1d26747d4a",
          "organizationId": "550e8400-e29b-41d4-a716-446655440000",
          "primaryCenterId": "f7f9ae59-ffa8-49b7-aba8-123cbf6508db",
          "farmerCode": "FARM-10023",
          "fullName": "Pandurang Tukaram Mane",
          "normalizedMobileNumber": "+919876543210",
          "status": "DRAFT",
          "registrationStatus": "IN_PROGRESS",
          "permittedCategories": ["COW", "BUFFALO"]
        }
      ],
      "total": 1,
      "page": 1,
      "limit": 20,
      "totalPages": 1
    },
    "meta": { ... }
  }
  ```

---

### 2.3 Get Customer by ID
Retrieves full customer profile including addresses and authorized milk categories.

- **Method & Path:** `GET /api/v1/customers/:customerId`
- **Path Parameter:**
  - `customerId`: UUID
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "id": "be5029d8-12bb-4d2a-837f-dd1d26747d4a",
      "fullName": "Pandurang Tukaram Mane",
      "status": "DRAFT",
      "address": { ... },
      "permittedCategories": ["COW", "BUFFALO"]
    },
    "meta": { ... }
  }
  ```
- **Error Responses:**
  - `403 FORBIDDEN`: Customer token attempting to view another customer's ID.
  - `404 NOT_FOUND`: Customer does not exist in caller's organization.

---

### 2.4 Update Customer Profile
Updates editable fields (full name, permitted milk categories, bank details, address).

- **Method & Path:** `PATCH /api/v1/customers/:customerId`
- **Request Body:**
  ```json
  {
    "fullName": "Pandurang Tukaram Mane",
    "address": {
      "village": "Nandre Gaon",
      "postalCode": "416416"
    }
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "id": "be5029d8-12bb-4d2a-837f-dd1d26747d4a",
      "fullName": "Pandurang Tukaram Mane",
      "updatedAt": "2026-11-13T16:25:00.000Z"
    },
    "meta": { ... }
  }
  ```

---

### 2.5 Soft Delete Customer
Executes atomic PostgreSQL RPC `public.soft_delete_customer` to mark customer as `is_deleted = TRUE`, `status = 'SOFT_DELETED'`, create audit log entry, and issue sync tombstone.

- **Method & Path:** `DELETE /api/v1/customers/:customerId`
- **Permissions:** `SUPER_ADMIN` or `DAIRY_OWNER` only.
- **Request Body:**
  ```json
  {
    "reason": "Farmer migrated to another cooperative society"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "id": "be5029d8-12bb-4d2a-837f-dd1d26747d4a",
      "isDeleted": true,
      "status": "SOFT_DELETED",
      "deletionReason": "Farmer migrated to another cooperative society",
      "deletedAt": "2026-11-13T16:26:00.000Z"
    },
    "meta": { ... }
  }
  ```
- **Error Responses:**
  - `400 VALIDATION_ERROR`: Missing required `reason`.
  - `403 FORBIDDEN`: Non-owner role attempting deletion.
  - `404 NOT_FOUND`: Customer not found or already deleted.

---

### 2.6 Restore Soft-Deleted Customer
Restores a previously soft-deleted customer via `public.restore_customer`. Re-activates profile (`is_deleted = FALSE`, `status = 'DRAFT' | 'PENDING_SYNC'`), records audit log entry, and clears deletion reason.

- **Method & Path:** `POST /api/v1/customers/:customerId/restore`
- **Permissions:** `SUPER_ADMIN` or `DAIRY_OWNER` only.
- **Request Body:**
  ```json
  {
    "reason": "Farmer returned and resumed milk deliveries"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "id": "be5029d8-12bb-4d2a-837f-dd1d26747d4a",
      "isDeleted": false,
      "status": "DRAFT",
      "deletionReason": null,
      "deletedAt": null
    },
    "meta": { ... }
  }
  ```
