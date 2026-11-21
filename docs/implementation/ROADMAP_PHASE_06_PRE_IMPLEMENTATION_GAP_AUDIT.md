# DFARM ROADMAP PHASE 06 — PRE-IMPLEMENTATION GAP AUDIT

**Phase Reference:** `DFARM-ROADMAP-PHASE-06`  
**Target:** Dairy Admin Core Operations (Customer Directory, Registration Review, Face Lifecycle, RFID Assignment)  
**Target Applications:** `apps/dfarm-dairy-admin`  
**Supporting Backend:** `services/backend`  
**Supporting Database:** Tenant PostgreSQL Databases (`dfarm_tenant_<code_hash>`)  
**Audit Timestamp:** 2026-11-18  

---

## 1. Executive Summary & Audit Context

Roadmap Phase 06 establishes Dairy Admin Core Operations for DFarm. While previous implementation phases (Prompt 01, 03, 05 and Roadmap 02-04) laid the foundational multi-tenant database provisioning, customer registration workflows, and basic identity/RFID scaffolding, a comprehensive pre-implementation audit was conducted to identify missing capabilities, security vulnerabilities, API gaps, and cross-application inconsistencies before any code modification.

The audit verified that the UI layout, Claymorphism styling, and page designs in `apps/dfarm-dairy-admin` are complete and must remain untouched. The backend and API layer, however, requires systematic hardening, strict tenant derivation, RBAC enforcement, lifecycle state transitions, and audit trail preservation.

---

## 2. Component-by-Component Gap Analysis

### 2.1 Customer Registration Review & Approval Workflow
- **Existing Assets:**
  - Route handlers in `services/backend/src/presentation/routes/customers.routes.ts`: `POST /pending`, `POST /:id/approve`, `POST /:id/reject`.
  - Frontend page in `apps/dfarm-dairy-admin/src/pages/customers/PendingApprovals.tsx`.
- **Gaps Identified:**
  1. **Tenant Resolution Weakness:** `approve` and `reject` fallback to `req.query['organizationId']` or header values when using `optionalAuthenticate`. Strictly authenticated requests must derive dairy context directly from verified JWT `req.user.organizationId`.
  2. **RBAC Authorization:** No explicit permission verification (`customers:approve` or roles `PRIMARY_DAIRY_ADMIN`, `DAIRY_ADMIN`).
  3. **Duplicate State Guard:** Re-approving an already approved customer does not return a clean 400/409 Conflict.
  4. **Rejection Reason Validation:** Rejection requires a mandatory reason, but lacks a strict character length rule (minimum 5 characters) to ensure actionable feedback to the farmer.
  5. **Farmer Code Generation:** Approval must guarantee a clean, collision-free unique farmer code (e.g. `FARM-<number>`).

### 2.2 Customer Directory & Profile Management
- **Existing Assets:**
  - Route handler `GET /api/v1/customers` with pagination, status filters, and search query.
  - Detail handler `GET /api/v1/customers/:id`.
  - Bank update `PUT /api/v1/customers/:id/bank-details`.
  - Frontend page `apps/dfarm-dairy-admin/src/pages/customers/CustomerDirectory.tsx` and `CustomerDetail.tsx`.
- **Gaps Identified:**
  1. **Profile Modification Endpoint (`PATCH /:id`):** Dairy Admin cannot update farmer personal details (full name, phone, village, permitted milk categories: `COW`, `BUFFALO`, `BOTH`) via a dedicated PATCH route.
  2. **Customer Suspension & Reactivation:** `CustomerDirectory.tsx` displays filter options for `SUSPENDED`, and `Customer.ts` domain entity blocks deliveries for suspended farmers (`validateCanDeliver`), but there are no backend endpoints for `POST /api/v1/customers/:id/suspend` and `POST /api/v1/customers/:id/reactivate`.
  3. **Sensitive Field Masking:** Detailed endpoint must properly display bank information and verification flags without exposing internal hashes or encryption salts.

### 2.3 Biometric Lifecycle & Zero Vector Exposure
- **Existing Assets:**
  - Routes in `services/backend/src/presentation/routes/identity.routes.ts`: `GET /face/enrollments`, `POST /face/enrollments/:id/re-enroll`, `POST /face/enrollments/:id/revoke`.
  - Frontend page `apps/dfarm-dairy-admin/src/pages/biometrics/FaceEnrollmentList.tsx`.
  - OpenCv YuNet + SFace INT8 128-dim encrypted embeddings stored in tenant databases.
- **Gaps Identified:**
  1. **Security Verification:** Confirmed that `GET /face/enrollments` returns metadata only (quality score, model version, timestamp) and zero raw 128-dim vectors. This protection must be strictly preserved and enforced with tests.
  2. **RBAC Guard:** Route handlers lack strict `biometrics:manage` permission checks.
  3. **Re-Enrollment & Revocation State Updates:** When a re-enrollment is requested, the customer's biometric status should transition to `PENDING_REENROLLMENT` and record the requesting admin ID and timestamp. Revocation must safely detach/deactivate the template.

### 2.4 RFID Card Inventory & Assignment
- **Existing Assets:**
  - Routes in `services/backend/src/presentation/routes/rfid.routes.ts`: `GET /`, `POST /assign`, `POST /mark-lost`.
  - Frontend page `apps/dfarm-dairy-admin/src/pages/rfid/RfidManagement.tsx`.
- **Gaps Identified:**
  1. **Unassign Endpoint:** Lacks a dedicated `POST /unassign` endpoint to unassign a card without marking it as lost (e.g. customer returned card).
  2. **Replacement Audit Preservation:** Replacing a customer's active card properly sets `is_active = FALSE` on the old card, but needs an explicit replacement audit trail recording previous card hex and assignment timestamp.
  3. **Duplicate Assignment Validation:** Attempting to assign a card currently active on another customer must fail with 409 Conflict.
  4. **RBAC Guard:** Route handlers need strict `rfid:manage` permission check.

### 2.5 Cross-Application Consistency
- **Customer App:** Status updates (`APPROVED`, `SUSPENDED`, `REJECTED`, `PENDING_REENROLLMENT`) must be reflected immediately in farmer profile and passbook access.
- **Collection App / Kiosk:** Intake lookups (`POST /api/v1/rfid/lookup/:card_number` or customer code lookup) must instantly deny intake for suspended or inactive farmers while allowing active farmers with assigned RFID cards.

---

## 3. Pre-Implementation Audit Certification

| Capability Domain | Current State | Gap Severity | Action Plan |
|---|---|---|---|
| Tenant Isolation & Derivation | Optional header fallback | High (P0) | Enforce JWT-derived `req.user.organizationId` |
| Customer Registration Approval/Rejection | Functional but lacks RBAC & strict validation | Medium (P1) | Add RBAC (`customers:approve`), status guards, reason length |
| Customer Profile & Status Transitions | Missing `PATCH /:id`, `suspend`, `reactivate` | High (P0) | Implement endpoints, domain methods, and audit logs |
| Biometric Lifecycle Security | Zero vector exposure maintained, missing RBAC | Medium (P1) | Add RBAC (`biometrics:manage`), audit metadata |
| RFID Lifecycle & Replacement | Missing unassign endpoint & RBAC | Medium (P1) | Add `POST /unassign`, enforce `rfid:manage` |
| Verification Test Suite | Partial legacy tests | High (P0) | Author `roadmap-phase-06-dairy-admin.test.js` covering Groups A-G |

**Conclusion:** The pre-implementation audit confirms that UI redesign is prohibited and unnecessary. Implementation will focus exclusively on backend API completeness, security, RBAC enforcement, tenant boundary verification, and comprehensive test coverage.
