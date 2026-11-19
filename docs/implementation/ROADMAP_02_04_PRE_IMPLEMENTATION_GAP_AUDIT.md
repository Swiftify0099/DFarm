# DFARM ROADMAP PHASES 02–04: PRE-IMPLEMENTATION GAP AUDIT

**Audit Document Reference:** `DFARM-AUDIT-ROADMAP-02-04-001`  
**Execution Phase:** Roadmap Phases 02, 03 & 04 Pre-Implementation  
**Target:** Authentication & RBAC, Super Admin Core Operations, Super Admin Platform Services  
**Author:** Senior Full-Stack Architect, Security Engineer & Platform Implementation Analyst  
**Audit Date:** November 17, 2026  
**Status:** COMPLETE & AUTHORITATIVE BASELINE  

---

## 1. Executive Summary & Purpose

This audit establishes the rigorous technical baseline for **Roadmap Phase 02 (Authentication and RBAC)**, **Phase 03 (Super Admin Core Operations)**, and **Phase 04 (Super Admin Platform Services)** across the DFarm platform. 

The DFarm project owner has mandated that:
1. Historical Prompt 01–05 numbers must not be confused with the authoritative Master Implementation Roadmap Phases 02–04.
2. Existing working functionality must be preserved and reused; zero duplication of tables, routes, or services.
3. Strict execution order must be enforced: **Phase 02 $\rightarrow$ Phase 03 $\rightarrow$ Phase 04**.
4. Every single feature must be systematically inspected in actual source code and classified according to verified evidence.

---

## 2. Methodology & Feature Classification Criteria

Every target feature across the three roadmap phases has been inspected and classified under one of the following authoritative states:
- `COMPLETE AND VERIFIED`: Implemented in source code, verified with passing automated test suites, adheres to security invariants.
- `IMPLEMENTED BUT NEEDS VERIFICATION`: Present in source code, requires automated test verification under the new roadmap constraints.
- `PARTIALLY IMPLEMENTED`: Code exists but is missing critical capabilities, schemas, or architectural boundaries.
- `MOCK OR HARDCODED`: Implemented using in-memory fallbacks, simulated fixtures, or mock responses.
- `MISSING`: No implementation exists in source code or database schemas.
- `SECURITY DEFECT`: Introduces an operational bypass, privilege escalation, or security vulnerability.
- `BLOCKED BY PROVIDER CONFIGURATION`: Dependent on external credentials/services (e.g. SMTP/Dove SMS) not provisioned in local test environments.
- `PENDING OWNER BUSINESS DECISION`: Awaiting business parameter approval (e.g. commercial milk price source or exact deduction formula).

---

## 3. Comprehensive Feature Gap Matrix

### 3.1 Phase 02: Authentication & Complete RBAC

| # | Feature / Capability | Classification | Actual Source File | Existing Endpoint | Existing Table | Existing Tests | Identified Defect or Gap | Required Action | Auth Scope? |
|---|---|---|---|---|---|---|---|---|---|
| **02.1** | **Standardized Business Roles (6 roles + 2 restricted)** | `PARTIALLY IMPLEMENTED` | `services/backend/src/presentation/routes/auth.routes.ts`<br>`services/backend/src/presentation/middleware/authorize.ts` | `/api/v1/auth/admin/me` | `users` (`dfarm_central`) | `health-and-auth.test.js`<br>`customer-app-production.test.js` | Inconsistent role enums across endpoints (`DAIRY_OWNER` vs `PRIMARY_DAIRY_ADMIN`, `CENTER_MANAGER` vs `COLLECTION_OPERATOR`). `PLATFORM_OPERATOR` not clearly isolated. | Normalize 8 roles: `SUPER_ADMIN`, `PRIMARY_DAIRY_ADMIN`, `DAIRY_ADMIN`, `COLLECTION_OPERATOR`, `SUPERVISOR`, `FARMER_CUSTOMER`, `GUEST_FARMER`, `PLATFORM_OPERATOR`. | YES |
| **02.2** | **Server-Side Default-Deny RBAC & Permission Middleware** | `PARTIALLY IMPLEMENTED` | `services/backend/src/presentation/middleware/authorize.ts` | All protected routes | N/A | `clean-architecture.test.js` | Only coarse `authorizeRoles()` exists. No granular permission checking middleware (`authorizePermission`) enforcing default-deny. | Create `DFARM_ROLE_PERMISSION_MATRIX.md` and implement granular `authorizePermission()` middleware. | YES |
| **02.3** | **Primary Admin & Dairy Membership Validation** | `IMPLEMENTED BUT NEEDS VERIFICATION` | `services/backend/src/presentation/middleware/tenant-resolver.ts`<br>`services/backend/src/presentation/routes/dairies.routes.ts` | `/api/v1/dairies/:id` | `users`, `organizations` | `dairy-admin-production.test.js` | Token claims derive `organizationId`, but constraint ensuring exactly 1 active Primary Admin per Dairy is not strictly enforced in DB/API. | Enforce single active Primary Dairy Admin constraint per eligible dairy. Validate membership server-side. | YES |
| **02.4** | **Cryptographic OTP Generation & Lifecycle** | `COMPLETE AND VERIFIED` | `services/backend/src/infrastructure/otp/DoveOtpService.ts` | `/api/v1/auth/request-otp`<br>`/api/v1/auth/verify-otp` | `admin_otp_challenges`<br>`customer_otp_challenges` | `customer-app-production.test.js` | Cryptographic generation (`crypto.randomInt`), HMAC-SHA256 hashing, 5-minute TTL, and max 5 attempts fully verified. | Preserve and reuse existing OTP engine. | YES |
| **02.5** | **Distributed Atomic OTP Cooldown** | `SECURITY DEFECT` | `services/backend/src/infrastructure/otp/DoveOtpService.ts` (lines 133–137) | `/api/v1/auth/request-otp`<br>`/api/v1/auth/admin/otp/request` | N/A (Checked in-memory) | `customer-app-production.test.js` | 60-second cooldown is checked against in-memory `Map` (`this.memoryStorage`). Across multiple backend instances, cooldown can be bypassed. | Implement durable atomic PostgreSQL-backed cooldown reservation in `dfarm_central`. | YES |
| **02.6** | **Real Email Verification & Invitations** | `IMPLEMENTED BUT NEEDS VERIFICATION` | `services/backend/src/infrastructure/email/EmailService.ts`<br>`services/backend/src/presentation/routes/dairies.routes.ts` | `/api/v1/dairies/invitations/*` | `dairy_admin_invitations` | `dairy-activation-workflow.test.js` | Nodemailer integration exists, but if SMTP is missing, status must be recorded as pending/not-configured without falsely claiming delivery. | Verify invitation tokens, single-use, expiry, and non-blocking failure when SMTP credentials absent. | YES |
| **02.7** | **HMAC JWT Issuance & Session Security** | `COMPLETE AND VERIFIED` | `services/backend/src/infrastructure/security/HmacJwtTokenService.ts`<br>`services/backend/src/presentation/middleware/authenticate.ts` | `/api/v1/auth/refresh-token` | N/A | `customer-app-production.test.js` | Verified signature checks, expiration, role and tenant claims binding, refresh token exchange. | Preserve and reuse. | YES |
| **02.8** | **Development & Operational Bypass Removal** | `SECURITY DEFECT` | `services/backend/src/presentation/routes/super-admin.routes.ts` (lines 31–39)<br>`services/backend/src/presentation/routes/dairies.routes.ts` (lines 1608–1609) | `/api/v1/super-admin/*`<br>`DELETE /api/v1/dairies/purge/phone/:phone` | `organizations`, `users` | `super-admin-production.test.js` | 1. `requireSuperAdminRole` injects default `SUPER_ADMIN` identity if `NODE_ENV !== 'production'`.<br>2. Unauthenticated `DELETE /purge/phone` allows permanent data deletion without auth. | 1. Eliminate dev identity bypass; require authentic bearer token.<br>2. Restrict or secure purge endpoint strictly to authenticated Super Admin in test mode. | YES |
| **02.9** | **Platform Operator Least Privilege Boundary** | `SECURITY DEFECT` | `services/backend/src/presentation/routes/super-admin.routes.ts` (lines 20–27)<br>`services/backend/src/infrastructure/repositories/PostgresSuperAdminRepository.ts` (lines 1058–1063) | All `/api/v1/super-admin/*` routes | `users` | N/A | `requireSuperAdminRole` allows `PLATFORM_OPERATOR` full access to all Super Admin routes, and hardcodes full permissions. | Enforce least-privilege permissions for `PLATFORM_OPERATOR`: restricted to operational metrics/alerts; deny policy publish and tenant data. | YES |

---

### 3.2 Phase 03: Super Admin Core Operations

| # | Feature / Capability | Classification | Actual Source File | Existing Endpoint | Existing Table | Existing Tests | Identified Defect or Gap | Required Action | Auth Scope? |
|---|---|---|---|---|---|---|---|---|---|
| **03.1** | **Authoritative Central Dairy Registry** | `COMPLETE AND VERIFIED` | `services/backend/src/presentation/routes/dairies.routes.ts`<br>`services/backend/src/infrastructure/repositories/PostgresSuperAdminRepository.ts` | `GET /api/v1/dairies`<br>`POST /api/v1/dairies` | `organizations` (`dfarm_central`) | `super-admin-production.test.js` | Central database is the sole authoritative registry. Verified unique code, registered details, and status. | Preserve and reuse. | YES |
| **03.2** | **Physical PostgreSQL Tenant Provisioning Integration** | `COMPLETE AND VERIFIED` | `services/backend/src/infrastructure/database/TenantDatabaseManager.ts` | `POST /api/v1/dairies` | `dairy_database_mappings` (`dfarm_central`) | `super-admin-production.test.js`<br>`tenant-database-isolation.test.js` | Provisions physically separate PostgreSQL database per dairy (`dfarm_tenant_<hash>`). State transitions verified. | Preserve and reuse. | YES |
| **03.3** | **Primary Dairy Admin Account Lifecycle** | `PARTIALLY IMPLEMENTED` | `services/backend/src/presentation/routes/dairies.routes.ts` (lines 892–1150) | `POST /api/v1/dairies`<br>`POST /api/v1/dairies/invitations/activate` | `users`, `dairy_admin_invitations` | `super-admin-production.test.js` | Admin creation, invitation, activation, and phone whitelisting exist. Missing explicit single-active Primary Admin DB constraint / verification. | Add DB constraint / enforcement logic ensuring exactly one active `PRIMARY_DAIRY_ADMIN` per dairy. | YES |
| **03.4** | **Platform Account Management** | `PARTIALLY IMPLEMENTED` | `services/backend/src/presentation/routes/super-admin.routes.ts` | `GET /api/v1/super-admin/admins`<br>`GET /api/v1/super-admin/users` | `users` (`dfarm_central`) | `super-admin-production.test.js` | Listing exists, but creation of platform accounts (Super Admin vs Platform Operator) with explicit permissions and audit is missing dedicated mutation endpoints. | Implement `POST /api/v1/super-admin/users` and role/permission assignment with audit logging. | YES |
| **03.5** | **Super Admin Dashboard & Central Metrics** | `COMPLETE AND VERIFIED` | `services/backend/src/presentation/routes/super-admin.routes.ts`<br>`services/backend/src/infrastructure/repositories/PostgresSuperAdminRepository.ts` | `GET /api/v1/super-admin/dashboard/metrics`<br>`GET /api/v1/super-admin/dashboard/analytics` | `organizations`, `dairy_database_mappings`, `central_hardware_inventory`, `amc_subscriptions`, `platform_alerts` | `super-admin-production.test.js` | Real SQL aggregations from central control plane. No hardcoded counters or cross-tenant scans. | Preserve and reuse. | YES |
| **03.6** | **Platform Reports Engine** | `COMPLETE AND VERIFIED` | `services/backend/src/presentation/routes/super-admin.routes.ts` | `POST /api/v1/super-admin/reports/generate` | `organizations`, `amc_subscriptions`, `central_hardware_inventory`, `platform_audit_logs` | `super-admin-production.test.js` | Generates authoritative reports for registry, lifecycle, hardware, AMC, and audit trails with date filtering. | Preserve and reuse. | YES |
| **03.7** | **Dairy Lifecycle Management (Onboarding, Suspend, Reactivate)** | `COMPLETE AND VERIFIED` | `services/backend/src/presentation/routes/dairies.routes.ts` | `POST /api/v1/dairies/:id/suspend`<br>`POST /api/v1/dairies/:id/reactivate` | `organizations`, `dairy_database_mappings` | `super-admin-production.test.js` | Suspension toggles status to `SUSPENDED` without dropping tenant DB; reactivation verifies prerequisite health and restores `ACTIVE`. | Preserve and reuse. | YES |

---

### 3.3 Phase 04: Super Admin Platform Services

| # | Feature / Capability | Classification | Actual Source File | Existing Endpoint | Existing Table | Existing Tests | Identified Defect or Gap | Required Action | Auth Scope? |
|---|---|---|---|---|---|---|---|---|---|
| **04.1** | **Central Hardware Master & Assignment History** | `COMPLETE AND VERIFIED` | `services/backend/src/presentation/routes/super-admin.routes.ts`<br>`services/backend/src/infrastructure/repositories/PostgresSuperAdminRepository.ts` | `GET /api/v1/super-admin/hardware`<br>`POST /api/v1/super-admin/hardware`<br>`POST /api/v1/super-admin/hardware/:id/assign` | `central_hardware_inventory`<br>`hardware_assignment_history` | `super-admin-production.test.js` | Serial uniqueness, category checks, assignment history, and unassignment fully implemented. | Preserve and reuse. | YES |
| **04.2** | **AMC Management & Razorpay Verification** | `COMPLETE AND VERIFIED` | `services/backend/src/presentation/routes/super-admin.routes.ts` | `GET/POST /api/v1/super-admin/amc/plans`<br>`GET/POST /api/v1/super-admin/amc/subscriptions`<br>`POST /api/v1/super-admin/amc/subscriptions/:id/verify-payment` | `amc_plans`<br>`amc_subscriptions` | `super-admin-production.test.js` | Plan creation, subscription lifecycle, server-side HMAC-SHA256 Razorpay signature check. Razorpay isolated strictly to AMC. | Preserve and reuse. | YES |
| **04.3** | **Global Rate Policy Management** | `MISSING` | None (New Requirement) | None | None (`dfarm_central`) | None | No central global rate policy tables, repositories, use cases, or endpoints exist. | 1. Create migration `033_global_rate_and_fat_snf_policies.sql` in `dfarm_central`.<br>2. Implement repository, domain models, and `/api/v1/super-admin/policies/rate` endpoints.<br>3. Enforce versioning, effective dates, draft/published states. | YES |
| **04.4** | **Global FAT/SNF Adjustment Policy Management** | `MISSING` | None (New Requirement) | None | None (`dfarm_central`) | None | No global commercial adjustment policy tables, repositories, or endpoints exist. | 1. Implement tables in migration 033.<br>2. Maintain strict separation: Raw readings vs calibration vs commercial policy.<br>3. Draft policies cannot affect financial calculations; zero guessed values. | YES |
| **04.5** | **Platform Monitoring & Alerts** | `COMPLETE AND VERIFIED` | `services/backend/src/presentation/routes/super-admin.routes.ts` | `GET /api/v1/super-admin/alerts`<br>`POST /api/v1/super-admin/alerts/:id/acknowledge`<br>`POST /api/v1/super-admin/alerts/:id/resolve` | `platform_alerts` (`dfarm_central`) | `super-admin-production.test.js` | Alert listing, acknowledgment, and resolution with actor tracking fully verified. | Preserve and reuse. | YES |
| **04.6** | **Controlled Diagnostic Support Sessions** | `SECURITY DEFECT` / `PARTIALLY IMPLEMENTED` | `services/backend/src/infrastructure/repositories/PostgresSuperAdminRepository.ts` (lines 1168–1256)<br>`services/backend/src/presentation/routes/super-admin.routes.ts` | `GET /api/v1/super-admin/support/sessions`<br>`POST /api/v1/super-admin/support/sessions`<br>`POST /api/v1/super-admin/support/sessions/:id/revoke` | N/A (Stored in memory `Map`) | `super-admin-production.test.js` | Sessions are stored in process-local `activeSupportSessions = new Map()`. Lost on restart; not shared across backend instances. | Create `support_diagnostic_sessions` table in `dfarm_central`; migrate repository to durable PostgreSQL persistence. | YES |
| **04.7** | **Platform Operator Permissions & Least Privilege** | `PARTIALLY IMPLEMENTED` | `services/backend/src/infrastructure/repositories/PostgresSuperAdminRepository.ts` | `GET /api/v1/super-admin/users` | `users` (`dfarm_central`) | N/A | Platform operators receive identical permissions to Super Admins. | Enforce distinct, restricted permission set for Platform Operators; block access to tenant DB credentials, biometrics, and policy publishing. | YES |

---

## 4. Prioritized Gap Closure Action Plan

Based on the verified audit, the engineering tasks are categorized and ordered strictly by phase:

### Phase 02 Execution Gate (Authentication & RBAC):
1. **Durable Distributed OTP Cooldown:** Create PostgreSQL table `otp_rate_limits` in `dfarm_central` with atomic upsert/check logic in `DoveOtpService.ts`.
2. **Standardize Role Enums & Granular Permissions:** Implement `DFARM_ROLE_PERMISSION_MATRIX.md` and `authorizePermission()` middleware in `services/backend/src/presentation/middleware/authorize.ts`.
3. **Purge Security Bypasses:** Remove default Super Admin identity fallback from `requireSuperAdminRole`; secure `DELETE /purge/phone` to authenticated test admins.
4. **Enforce Platform Operator Least Privilege:** Update `requireSuperAdminRole` to distinguish `SUPER_ADMIN` from `PLATFORM_OPERATOR`.
5. **Primary Dairy Admin Uniqueness:** Add DB partial unique index on `users(organization_id)` for role `PRIMARY_DAIRY_ADMIN` where `status = 'ACTIVE'`.

### Phase 03 Execution Gate (Super Admin Core Operations):
1. **Platform User Management Mutation Endpoints:** Add `POST /api/v1/super-admin/users` and role management in `super-admin.routes.ts` with immutable audit logging.
2. **Primary Admin Lifecycle Hardening:** Ensure admin reassignment / deactivation flows adhere to single-active constraint.
3. **Dashboard & Report Verification:** Verify all metrics and reports run exclusively against real central data without mocks.

### Phase 04 Execution Gate (Super Admin Platform Services):
1. **Migration 033 Creation:** Create `supabase/migrations/033_central_platform_policies_and_support.sql` defining:
   - `global_rate_policies` & `global_rate_policy_versions`
   - `global_fat_snf_adjustment_policies` & `global_fat_snf_adjustment_policy_versions`
   - `support_diagnostic_sessions` (replacing in-memory Map)
   - `otp_rate_limits` (for distributed cooldown)
2. **Global Rate Policy Service & Routes:** Implement draft, publish, versioning, and effective-date validation in `/api/v1/super-admin/policies/rate`.
3. **Global FAT/SNF Adjustment Policy Service & Routes:** Implement policy structure in `/api/v1/super-admin/policies/fat-snf`. Enforce separation of raw analyzer values, calibration data, and commercial policies. Zero unapproved deduction rules.
4. **Durable Support Sessions:** Wire `PostgresSuperAdminRepository` support session methods to `support_diagnostic_sessions` in PostgreSQL.

---

## 5. Security & Architectural Invariants

All gap-closure implementations must uphold:
1. **Default-Deny Access:** Every route must be protected by authentication and explicit permission checks.
2. **Server-Side Identity:** Token-derived identity is authoritative; request body or headers cannot override user or dairy identity.
3. **Zero UI Redesign:** No modifications to Claymorphism UI tokens, layouts, or components in frontend apps.
4. **Zero Mocks in Production:** No in-memory storage fallback for business data in production runtime.
5. **Database-Per-Dairy Topology:** Tenant isolation must remain 100% physically intact.
