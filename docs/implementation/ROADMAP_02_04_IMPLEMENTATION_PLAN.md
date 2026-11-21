# DFARM ROADMAP PHASES 02–04: MASTER IMPLEMENTATION PLAN

**Plan Reference:** `DFARM-PLAN-ROADMAP-02-04-001`  
**Execution Sequence:** Gate 1 (Phase 02) $\rightarrow$ Gate 2 (Phase 03) $\rightarrow$ Gate 3 (Phase 04)  
**Author:** DFarm Senior Platform Architect, Authentication Engineer & Security Lead  
**Date:** November 17, 2026  
**Status:** APPROVED & READY FOR SEQUENTIAL EXECUTION  

---

## 1. Plan Overview & Architectural Directives

This implementation plan governs the systematic gap closure of DFarm Roadmap Phases 02, 03, and 04. In strict adherence to project owner instructions, implementation proceeds through three sequential verification gates. **Phase 02 must be fully completed and verified before Phase 03 and Phase 04 platform capabilities are finalized.**

### Non-Negotiable Invariants:
1. **Zero UI Redesign:** No modifications to visual tokens, colors, layouts, or component hierarchies in any of the four applications.
2. **Database-Per-Dairy Preservation:** The central control plane (`dfarm_central`) and physical tenant databases (`dfarm_tenant_<code_hash>`) maintain absolute separation.
3. **No In-Memory Mocks in Production:** All platform services (OTP cooldown, support sessions, policies) must use durable PostgreSQL storage.
4. **Default-Deny Server-Side RBAC:** Client-supplied headers or body fields cannot grant privileges or switch tenant contexts.

---

## 2. Gate 1: Roadmap Phase 02 — Authentication & Complete RBAC

### Objective
Establish one cohesive, cryptographically verified, and server-enforced authentication and authorization architecture across the entire DFarm ecosystem.

### Stage 2.1: Role Normalization & Granular Permission Matrix
1. **Role Normalization:**
   Standardize 8 authoritative roles across domain entities, JWT claims, middleware, and documentation:
   - `SUPER_ADMIN`: Central platform governance.
   - `PRIMARY_DAIRY_ADMIN`: Authoritative operational head of a single assigned Dairy. Exactly 1 active per Dairy.
   - `DAIRY_ADMIN`: Operational staff member of an assigned Dairy with scoped permissions.
   - `COLLECTION_OPERATOR`: Counter kiosk operator for milk intake, quality testing, and session management.
   - `SUPERVISOR`: Exception reviewer, manual identification verifier, and operational inspector.
   - `FARMER_CUSTOMER`: Dairy member farmer delivering milk; access restricted to own profile, passbook, and bills.
   - `GUEST_FARMER`: Restricted onboarding identity; access limited to GPS discovery and self-registration.
   - `PLATFORM_OPERATOR`: Restricted central operations staff; access limited to system health, hardware inventory, and alerts.
2. **Permission Matrix Architecture:**
   Author `docs/architecture/DFARM_ROLE_PERMISSION_MATRIX.md` defining fine-grained permission tokens (e.g., `dairies:create`, `dairies:suspend`, `policies:publish`, `collections:intake`, `ledger:view_own`).
3. **Server-Side Enforcement Middleware:**
   Implement `authorizePermission(permission: string)` in `services/backend/src/presentation/middleware/authorize.ts` alongside existing `authorizeRoles()`.

### Stage 2.2: Distributed Atomic OTP Cooldown
1. **Durable Schema:** Add `otp_rate_limits` table in `dfarm_central` (Migration 033).
   - Columns: `phone VARCHAR(20) PRIMARY KEY`, `purpose VARCHAR(30)`, `last_requested_at TIMESTAMPTZ NOT NULL`, `request_count INT DEFAULT 1`.
2. **Atomic Reservation Logic:**
   Update `services/backend/src/infrastructure/otp/DoveOtpService.ts` to execute an atomic conditional upsert:
   ```sql
   INSERT INTO otp_rate_limits (phone, purpose, last_requested_at, request_count)
   VALUES ($1, $2, NOW(), 1)
   ON CONFLICT (phone) DO UPDATE
   SET request_count = otp_rate_limits.request_count + 1,
       last_requested_at = NOW()
   WHERE otp_rate_limits.last_requested_at < NOW() - INTERVAL '60 seconds'
   RETURNING last_requested_at;
   ```
   If no row is returned, the atomic query indicates cooldown violation across all backend instances without requiring Redis.
3. **Purge Test Bypass in Production:**
   Ensure preview OTP is strictly gated to `NODE_ENV === 'test' && config.ALLOW_TEST_PREVIEW_OTP`.

### Stage 2.3: Security Bypass Elimination
1. **Remove Default Identity Fallback:**
   In `services/backend/src/presentation/routes/super-admin.routes.ts` (`requireSuperAdminRole`), remove lines 31–39 which injected default `SUPER_ADMIN` identity when `NODE_ENV !== 'production'`. Require authentic Bearer JWT for all requests.
2. **Secure Administrative Purge Routes:**
   In `services/backend/src/presentation/routes/dairies.routes.ts`, protect `DELETE /admin/by-phone/:phone` and `/purge/phone/:phone` with `authenticate` and `authorizeRoles('SUPER_ADMIN')`, or restrict to `NODE_ENV === 'test'`.
3. **Enforce Platform Operator Least Privilege:**
   Update `requireSuperAdminRole` to distinguish `SUPER_ADMIN` from `PLATFORM_OPERATOR`. Reject Platform Operators from policy publishing, tenant deletion, or direct financial modifications.

### Stage 2.4: Primary Dairy Admin Uniqueness Enforcement
1. Add partial unique index on `users` table:
   ```sql
   CREATE UNIQUE INDEX IF NOT EXISTS uidx_primary_dairy_admin 
   ON users (organization_id) 
   WHERE role = 'PRIMARY_DAIRY_ADMIN' AND status = 'ACTIVE';
   ```
2. Verify in application use cases that activating or creating a Primary Admin enforces that the dairy does not already have an active Primary Admin.

### Gate 1 Verification & Deliverables
- Pass all Phase 02 tests in `services/backend/tests/health-and-auth.test.js` and a dedicated `roadmap-phase-02-auth-rbac.test.js`.
- Create documents:
  - `docs/implementation/ROADMAP_PHASE_02_AUTH_RBAC_INSPECTION.md`
  - `docs/architecture/DFARM_ROLE_PERMISSION_MATRIX.md`
  - `docs/architecture/DFARM_AUTHENTICATION_ARCHITECTURE.md`
  - `docs/implementation/ROADMAP_PHASE_02_IMPLEMENTATION_REPORT.md`
  - `docs/implementation/ROADMAP_PHASE_02_SECURITY_VERIFICATION.md`
  - `docs/implementation/ROADMAP_PHASE_02_TEST_REPORT.md`

---

## 3. Gate 2: Roadmap Phase 03 — Super Admin Core Operations

### Objective
Ensure the Super Admin can reliably create and govern Dairies, manage platform accounts, verify onboarding, monitor central metrics, and generate real platform reports without mocks.

### Stage 3.1: Authoritative Dairy Registry & Provisioning Verification
1. Re-verify end-to-end flow: Super Admin registers Dairy $\rightarrow$ Central registry persists $\rightarrow$ Physical PostgreSQL tenant database created $\rightarrow$ Migrations executed $\rightarrow$ Database mapping marked `ACTIVE`.
2. Confirm zero `pg-mem` or schema-per-dairy fallbacks in production.

### Stage 3.2: Primary Dairy Admin Lifecycle & Account Management
1. **Account Creation & Assignment:** Implement `POST /api/v1/super-admin/users` to allow Super Admins to create Platform Operators or invite Primary Dairy Admins with explicit roles and permissions.
2. **Lifecycle Transitions:** Verify suspension, activation, and transfer workflows with full audit logging in `platform_audit_logs`.

### Stage 3.3: Dashboard Metrics & Platform Reports Engine
1. Verify `GET /api/v1/super-admin/dashboard/metrics` and `GET /api/v1/super-admin/dashboard/analytics` calculate authoritative counts strictly from central control-plane tables: `organizations`, `dairy_database_mappings`, `amc_subscriptions`, `central_hardware_inventory`, `platform_alerts`.
2. Verify `POST /api/v1/super-admin/reports/generate` produces real reports with pagination, server-side date filters, and audit events.

### Gate 2 Verification & Deliverables
- Pass Super Admin Core production suite `node --test services/backend/tests/super-admin-production.test.js`.
- Create documents:
  - `docs/implementation/ROADMAP_PHASE_03_SUPER_ADMIN_CORE_INSPECTION.md`
  - `docs/implementation/ROADMAP_PHASE_03_SUPER_ADMIN_CORE_PLAN.md`
  - `docs/implementation/ROADMAP_PHASE_03_SUPER_ADMIN_CORE_REPORT.md`
  - `docs/implementation/ROADMAP_PHASE_03_ADMIN_ACCOUNT_VERIFICATION.md`
  - `docs/implementation/ROADMAP_PHASE_03_DAIRY_PROVISIONING_VERIFICATION.md`
  - `docs/implementation/ROADMAP_PHASE_03_DASHBOARD_REPORT_VERIFICATION.md`
  - `docs/implementation/ROADMAP_PHASE_03_TEST_REPORT.md`

---

## 4. Gate 3: Roadmap Phase 04 — Super Admin Platform Services

### Objective
Implement the missing central platform policy engines (Global Rate Policy, Global FAT/SNF Adjustment Policy), migrate support sessions to durable PostgreSQL persistence, and enforce platform operator boundaries.

### Stage 4.1: Central Platform Policies Database Migration (`033`)
Create `supabase/migrations/033_central_platform_policies_and_support.sql`:
1. **`global_rate_policies` & `global_rate_policy_versions`**:
   - `id UUID PRIMARY KEY`, `policy_code VARCHAR(50) UNIQUE`, `name VARCHAR(150)`, `description TEXT`.
   - Versions: `id UUID PRIMARY KEY`, `policy_id UUID REFERENCES global_rate_policies(id)`, `version_number INT`, `status VARCHAR(30)` (`DRAFT`, `REVIEW`, `PUBLISHED`, `RETIRED`), `effective_from TIMESTAMPTZ`, `effective_to TIMESTAMPTZ`, `parameters JSONB`, `checksum VARCHAR(64)`, `created_by UUID`, `published_by UUID`.
2. **`global_fat_snf_adjustment_policies` & `global_fat_snf_adjustment_policy_versions`**:
   - `id UUID PRIMARY KEY`, `policy_code VARCHAR(50) UNIQUE`, `name VARCHAR(150)`, `description TEXT`.
   - Versions: `id UUID PRIMARY KEY`, `policy_id UUID`, `version_number INT`, `status VARCHAR(30)`, `effective_from TIMESTAMPTZ`, `effective_to TIMESTAMPTZ`, `milk_category VARCHAR(30)` (`COW`, `BUFFALO`, `BOTH`), `fat_adjustment_rules JSONB`, `snf_adjustment_rules JSONB`, `rounding_policy VARCHAR(30)`, `created_by UUID`, `published_by UUID`.
3. **`support_diagnostic_sessions`**:
   - `id UUID PRIMARY KEY`, `dairy_id UUID REFERENCES organizations(id)`, `session_token_hash VARCHAR(64) NOT NULL`, `justification_reason TEXT NOT NULL`, `support_ticket_ref VARCHAR(100)`, `authorized_scope VARCHAR(100) DEFAULT 'READ_ONLY'`, `duration_minutes INT NOT NULL`, `expires_at TIMESTAMPTZ NOT NULL`, `is_revoked BOOLEAN DEFAULT FALSE`, `revoked_at TIMESTAMPTZ`, `revoked_by UUID`, `created_by UUID`, `created_at TIMESTAMPTZ DEFAULT NOW()`.
4. **`otp_rate_limits`**:
   - For distributed atomic cooldown.

### Stage 4.2: Global Rate Policy Service & Endpoints
1. Implement `PostgresGlobalPolicyRepository` and use cases for creating, versioning, publishing, and listing global rate policies.
2. Expose REST endpoints under `/api/v1/super-admin/policies/rate`:
   - `GET /api/v1/super-admin/policies/rate`
   - `POST /api/v1/super-admin/policies/rate`
   - `POST /api/v1/super-admin/policies/rate/:id/versions`
   - `POST /api/v1/super-admin/policies/rate/:id/versions/:vId/publish`
3. Enforce:
   - Policies do not automatically overwrite Dairy rate charts.
   - Historical collection transactions remain bound to historical version checksums.
   - Draft policies cannot affect calculation engine.

### Stage 4.3: Global FAT/SNF Adjustment Policy Service & Endpoints
1. Implement repository methods and routes under `/api/v1/super-admin/policies/fat-snf`:
   - `GET /api/v1/super-admin/policies/fat-snf`
   - `POST /api/v1/super-admin/policies/fat-snf`
   - `POST /api/v1/super-admin/policies/fat-snf/:id/versions`
   - `POST /api/v1/super-admin/policies/fat-snf/:id/versions/:vId/publish`
2. Enforce Mandatory Structural Separation:
   - Raw Analyzer Value $\neq$ Calibration Offset $\neq$ Commercial Adjustment.
   - Zero guessing of commercial values: unapproved parameters cannot be automatically applied.

### Stage 4.4: Durable Support Diagnostic Sessions
1. Refactor `PostgresSuperAdminRepository.ts`: replace in-memory `activeSupportSessions = new Map()` with SQL queries against `support_diagnostic_sessions`.
2. Enforce:
   - Default read-only scope.
   - Time-bound auto-expiration (`expires_at < NOW()`).
   - Revocation with actor audit logging.
   - Zero exposure of raw database connection URIs.

### Stage 4.5: Hardware Inventory & AMC Verification
1. Re-verify `central_hardware_inventory`, `hardware_assignment_history`, and AMC subscriptions.
2. Confirm Razorpay verification strictly quarantined to AMC.

### Gate 3 Verification & Deliverables
- Pass Platform Services test suite in `services/backend/tests/roadmap-phase-04-platform-services.test.js`.
- Create documents:
  - `docs/implementation/ROADMAP_PHASE_04_PLATFORM_SERVICES_INSPECTION.md`
  - `docs/implementation/ROADMAP_PHASE_04_PLATFORM_SERVICES_PLAN.md`
  - `docs/architecture/DFARM_GLOBAL_RATE_POLICY_ARCHITECTURE.md`
  - `docs/architecture/DFARM_FAT_SNF_ADJUSTMENT_POLICY_ARCHITECTURE.md`
  - `docs/implementation/ROADMAP_PHASE_04_HARDWARE_VERIFICATION.md`
  - `docs/implementation/ROADMAP_PHASE_04_AMC_VERIFICATION.md`
  - `docs/implementation/ROADMAP_PHASE_04_ALERT_SUPPORT_OPERATOR_VERIFICATION.md`
  - `docs/implementation/ROADMAP_PHASE_04_IMPLEMENTATION_REPORT.md`
  - `docs/implementation/ROADMAP_PHASE_04_SECURITY_VERIFICATION.md`
  - `docs/implementation/ROADMAP_PHASE_04_TEST_REPORT.md`

---

## 5. Master Regression, Cross-App Verification & Handoff

Once Gates 1, 2, and 3 are passed:
1. Run full monorepo regression suites across all apps and backend.
2. Create:
   - `docs/implementation/ROADMAP_02_04_CROSS_APP_REGRESSION_REPORT.md`
   - `docs/implementation/ROADMAP_PHASE_05_HANDOFF.md`
