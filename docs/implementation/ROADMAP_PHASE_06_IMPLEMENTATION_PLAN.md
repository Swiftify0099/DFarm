# DFARM ROADMAP PHASE 06 — IMPLEMENTATION PLAN

**Implementation Reference:** `DFARM-ROADMAP-PHASE-06`  
**Target:** Dairy Admin Core Operations Implementation  
**Applications Affected:** `apps/dfarm-dairy-admin` (Frontend Alignment), `services/backend` (APIs & Domain)  
**Database:** PostgreSQL Tenant DBs (`dfarm_tenant_<code_hash>`)  
**Execution Order:** 6-Step Staged Execution Plan  

---

## 1. Objectives & Architectural Guardrails

The goal of Phase 06 is to deliver full production readiness for Dairy Admin Core Operations, specifically:
1. Registration Review & Approval: Secure review, approval with farmer code assignment, and rejection with validated audit reasons.
2. Customer Directory & Lifecycle Management: Search, filtering, profile updating (`PATCH /:id`), suspension (`POST /:id/suspend`), and reactivation (`POST /:id/reactivate`).
3. Biometric Lifecycle: Template auditing, quality scores, zero raw 128-dim vector exposure, re-enrollment requests, and revocation.
4. RFID Card Management: Inventory tracking, assignment with collision prevention, seamless replacement preserving history, unassignment, and lost card marking.
5. Strict Multi-Tenant Isolation & RBAC: Ensure every operation derives tenant ID from verified JWT session, with zero cross-tenant data leakage.

### Non-Negotiable Guardrails
- **UI Redesign Prohibited:** Keep all components, layout tokens, Claymorphism CSS classes, and visual workflows intact in `apps/dfarm-dairy-admin`.
- **Zero Raw Vectors:** Biometric vectors (SFace INT8 128-dim) must NEVER be returned in customer lists, detail endpoints, or logs.
- **Strict Tenant Context:** Reject cross-dairy queries with 403 Forbidden. Never rely on unauthenticated query or header parameters when authentication is present.

---

## 2. Staged Implementation Steps

### Stage 1: Domain & Repository Extensions (`services/backend`)
- In `domain/entities/Customer.ts`:
  - Verify and extend status transitions (`ACTIVE`, `INACTIVE`, `SUSPENDED`, `REJECTED`, `REGISTRATION_PENDING`).
  - Add `suspend(reason: string, adminId: string)` and `reactivate(adminId: string)` methods.
  - Add `updateProfile(details: { fullName?: string; village?: string; permittedCategories?: string[]; phone?: string })`.
- In `infrastructure/repositories/PostgresCustomerRepository.ts`:
  - Implement/verify `updateCustomerStatus(id: string, status: CustomerStatus, metadata?: any)`.
  - Implement `updateCustomerProfile(id: string, updates: Partial<Customer>)`.
  - Ensure `findRfidAssignments(dairyId: string)` and `unassignRfidCard(customerId: string, dairyId: string)`.

### Stage 2: Application Use Cases (`services/backend`)
- In `application/use-cases/customers/CustomerDirectoryUseCases.ts`:
  - Enhance `ApproveCustomerRegistrationUseCase` with duplicate check, validated code format, and audit trail.
  - Enhance `RejectCustomerRegistrationUseCase` with minimum 5 character reason validation.
  - Add `SuspendCustomerUseCase` and `ReactivateCustomerUseCase`.
  - Add `UpdateCustomerProfileUseCase`.
- In `application/use-cases/customers/BiometricUseCases.ts`:
  - Add `RequestFaceReEnrollmentUseCase` and `RevokeFaceEnrollmentUseCase` updating biometric status without raw vector exposure.
- In `application/use-cases/customers/RfidUseCases.ts` (or existing RFID handlers):
  - Ensure `UnassignRfidCardUseCase` and replacement history logging.

### Stage 3: Presentation API Routes & RBAC Enforcement (`services/backend`)
- In `presentation/routes/customers.routes.ts`:
  - Enforce `authenticateToken` and `authorizePermission` on:
    - `POST /pending` -> `customers:read`
    - `POST /:id/approve` -> `customers:approve`
    - `POST /:id/reject` -> `customers:approve`
    - `PATCH /:id` -> `customers:update`
    - `POST /:id/suspend` -> `customers:update`
    - `POST /:id/reactivate` -> `customers:update`
    - `DELETE /:id` -> `customers:delete`
    - `POST /:id/restore` -> `customers:update`
  - Derive `dairyId` strictly from `req.user.organizationId` (unless Super Admin with explicit validated target dairy).
- In `presentation/routes/identity.routes.ts`:
  - Enforce `biometrics:manage` on `/face/enrollments/:id/re-enroll` and `/face/enrollments/:id/revoke`.
- In `presentation/routes/rfid.routes.ts`:
  - Enforce `rfid:manage` on `/assign`, `/mark-lost`, and `/unassign`.

### Stage 4: Dairy Admin Frontend API Alignment (`apps/dfarm-dairy-admin`)
- Review `src/api/client.ts` and `src/api/index.ts`:
  - Ensure API client methods match the enhanced endpoints (`suspendCustomer`, `reactivateCustomer`, `updateCustomerProfile`, `unassignRfidCard`).
  - Verify that `CustomerDetail.tsx`, `CustomerDirectory.tsx`, `PendingApprovals.tsx`, `FaceEnrollmentList.tsx`, and `RfidManagement.tsx` call these methods without modifying visual UI or layouts.

### Stage 5: Comprehensive Automated Test Suite Authoring
- Author `services/backend/tests/roadmap-phase-06-dairy-admin.test.js`:
  - Group A: RBAC & Tenant Isolation (Tenant A vs Tenant B).
  - Group B: Pending Registration Review & Approval.
  - Group C: Customer Directory, Search, Filtering & Data Masking.
  - Group D: Customer Administrative Status & Suspension (blocks delivery intake).
  - Group E: Face Biometric Lifecycle & Zero Vector Exposure.
  - Group F: RFID Assignment, Replacement, and Lost Lifecycle.
  - Group G: Cross-Application Consistency (Customer App & Collection App lookups).

### Stage 6: Monorepo Verification & Documentation
- Build and run unit/integration tests across all packages (`services/backend`, `apps/dfarm-dairy-admin`, `apps/dfarm-customer-app`, `apps/dfarm-collection-app`, `apps/dfarm-super-admin`).
- Generate all 12 required documentation artifacts in `docs/implementation/`.
