# DFARM — ROADMAP PHASE 06: CUSTOMER DIRECTORY VERIFICATION
**Document Reference:** `docs/implementation/ROADMAP_PHASE_06_CUSTOMER_DIRECTORY_VERIFICATION.md`  
**Execution Phase:** Roadmap Phase 06 — Dairy Admin Core Operations  
**Target Application:** `apps/dfarm-dairy-admin`  
**Backend Service:** `services/backend`  
**Database Architecture:** Tenant PostgreSQL Database (`dfarm_tenant_<code_hash>`)  
**Status:** VERIFIED & PRODUCTION READY  

---

## 1. Executive Summary

This report documents the verification of the DFarm Customer Directory for Dairy Administrators. The customer directory allows authorized Dairy Admins to search, filter, paginate, inspect complete farmer profiles, and modify operational customer details within their strictly isolated tenant database.

All operations execute strictly against the authenticated Dairy's dedicated PostgreSQL database. Zero cross-dairy queries can occur, and all customer data remains isolated according to DFarm Clean Architecture invariants.

---

## 2. Directory Endpoints & Architecture

### 2.1 HTTP Endpoints

| Method | Endpoint | Description | Permissions Required |
|---|---|---|---|
| `GET` | `/api/v1/customers` | Query paginated list of customers with search, status filter, and sorting | `customers:read` |
| `GET` | `/api/v1/customers/:id` | Retrieve comprehensive customer profile including RFID and biometric status | `customers:read` |
| `PATCH` | `/api/v1/customers/:id` | Update profile information (phone, address, bank details, milk type) | `customers:update` |

### 2.2 Domain & Use Case Flow

The directory queries flow through clean architectural layers:
1. **Controller / Route Handler (`customers.routes.ts`)**:
   - Validates authentication token.
   - Extracts tenant `organizationId` from authenticated JWT (`req.user.organizationId`).
   - Validates that query parameters (e.g., `req.query.organizationId`) match the JWT tenant context (enforces 403 Forbidden on cross-tenant attempts).
   - Validates RBAC permission (`customers:read` or `customers:update`).
2. **Application Use Cases**:
   - `GetCustomersUseCase`: Handles search, pagination (`limit`, `offset`), and status filters (`APPROVED`, `SUSPENDED`, `REJECTED`, `INACTIVE`).
   - `GetCustomerByIdUseCase`: Retrieves customer entity and integrates active RFID assignment and biometric enrollment status.
   - `UpdateCustomerProfileUseCase`: Validates profile updates, enforces phone format invariants, and commits updates via the tenant repository.
3. **Repository (`PostgresCustomerRepository.ts`)**:
   - Resolves tenant connection pool from `MultiTenantPostgresPool` using `organizationId`.
   - Executes parameterized SQL queries against `customers` table and joins `rfid_card_assignments` and `face_enrollments`.

---

## 3. Database Schema Verification

### 3.1 Customer Record Retrieval
```sql
SELECT 
    c.id,
    c.organization_id,
    c.farmer_code,
    c.full_name,
    c.mobile_number,
    c.email,
    c.address,
    c.status,
    c.preferred_language,
    c.default_milk_type,
    c.bank_account_number,
    c.bank_ifsc_code,
    c.bank_name,
    c.created_at,
    c.updated_at,
    rc.card_uid AS rfid_card_uid,
    CASE WHEN fe.id IS NOT NULL AND fe.status = 'ACTIVE' THEN TRUE ELSE FALSE END AS has_active_face_enrollment,
    fe.quality_score AS face_quality_score,
    fe.enrolled_at AS face_enrolled_at
FROM customers c
LEFT JOIN rfid_card_assignments rca 
    ON rca.customer_id = c.id AND rca.is_active = TRUE
LEFT JOIN rfid_cards rc 
    ON rc.id = rca.rfid_card_id
LEFT JOIN face_enrollments fe 
    ON fe.customer_id = c.id AND fe.status = 'ACTIVE'
WHERE c.organization_id = $1
  AND c.is_deleted = FALSE
  AND ($2::text IS NULL OR c.status = $2)
  AND ($3::text IS NULL OR (
        c.full_name ILIKE '%' || $3 || '%' OR 
        c.farmer_code ILIKE '%' || $3 || '%' OR 
        c.mobile_number ILIKE '%' || $3 || '%'
  ))
ORDER BY c.created_at DESC
LIMIT $4 OFFSET $5;
```

---

## 4. Verification Test Evidence

All directory behaviors were verified using the automated test suite in `services/backend/tests/roadmap-phase-06-dairy-admin.test.js`:

| Test Assertion | Input / Conditions | Expected Result | Actual Result | Status |
|---|---|---|---|---|
| Customer List Retrieval | Valid Dairy Admin JWT for Dairy A | Status 200, array of approved & active customers belonging exclusively to Dairy A | Status 200, length > 0, all records `organization_id === Dairy A` | PASS |
| Search by Farmer Code | Query `?search=FARM-` | Status 200, matching customers returned | Status 200, matching farmer code returned | PASS |
| Search by Phone Number | Query `?search=98223344` | Status 200, matching customer record | Status 200, matched target phone number | PASS |
| Single Customer Details | GET `/customers/:id` | Complete profile returned with active RFID UID and biometric metadata | Status 200, fields populated without exposing raw vectors | PASS |
| Profile Modification | PATCH `/customers/:id` with new address & phone | Updated profile saved and returned | Status 200, updated address and phone verified | PASS |
| Unauthorized Directory Access | Request without JWT token | Status 401 Unauthorized | Status 401 Unauthorized | PASS |
| Insufficient Permission | Token with missing `customers:read` | Status 403 Forbidden | Status 403 Forbidden | PASS |

---

## 5. Frontend Integration Alignment

The frontend client in `apps/dfarm-dairy-admin/src/api/index.ts` exposes:
```typescript
customers: {
  list: (params) => get('/customers', { params }),
  get: (id: string) => get(`/customers/${id}`),
  updateProfile: (id: string, data: Partial<Customer>) => patch(`/customers/${id}`, data),
  suspend: (id: string, reason?: string) => post(`/customers/${id}/suspend`, { reason }),
  reactivate: (id: string, reason?: string) => post(`/customers/${id}/reactivate`, { reason }),
}
```
The existing UI components consume this API bridge seamlessly without requiring any visual redesign or markup alteration.
