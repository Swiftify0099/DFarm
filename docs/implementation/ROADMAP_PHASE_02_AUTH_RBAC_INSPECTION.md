# ROADMAP PHASE 02: AUTHENTICATION & RBAC INSPECTION REPORT

**Document ID:** `DFARM-INSPECT-ROADMAP-02-001`  
**Roadmap Phase:** Phase 02 — Authentication & RBAC  
**Target:** Role Definitions, Authorization Enforcement, OTP & Email Services, Bypass Elimination  
**Inspection Date:** November 17, 2026  
**Status:** COMPLETE & VERIFIED  

---

## 1. Scope & Objectives

Roadmap Phase 02 establishes the foundational security barrier for the entire DFarm multi-tenant platform. All user roles, authentication lifecycles, permission enforcement mechanisms, and bypass vulnerabilities were inspected and repaired. Per project rules, **Gate 1 (Phase 02) must be fully verified before unrestricted platform administrative operations in Phases 03 and 04 are authorized.**

---

## 2. Detailed Findings by Sub-System

### 2.1 Role Definitions & Identifier Normalization
- **Pre-Inspection State:** Roles across different modules had naming divergence (`DAIRY_OWNER` vs `PRIMARY_DAIRY_ADMIN`, `CENTER_MANAGER` vs `COLLECTION_OPERATOR`). `PLATFORM_OPERATOR` was treated identically to `SUPER_ADMIN`.
- **Remediation:** Standardized 8 authoritative roles:
  1. `SUPER_ADMIN`
  2. `PRIMARY_DAIRY_ADMIN`
  3. `DAIRY_ADMIN`
  4. `COLLECTION_OPERATOR`
  5. `SUPERVISOR`
  6. `FARMER_CUSTOMER`
  7. `GUEST_FARMER`
  8. `PLATFORM_OPERATOR`
- **Source Verification:** `services/backend/src/presentation/middleware/authorize.ts` and `services/backend/src/presentation/routes/auth.routes.ts`.

### 2.2 Server-Side Permission Authorization
- **Pre-Inspection State:** Only coarse role-checking was implemented via `authorizeRoles()`.
- **Remediation:** Implemented `ROLE_PERMISSIONS` dictionary and `authorizePermission(...permissions: string[])` middleware enforcing a strict default-deny authorization policy. Wildcard matching (`*` and `category:*`) is supported.

### 2.3 Distributed Atomic OTP Cooldown
- **Pre-Inspection State:** `DoveOtpService` checked cooldown against process-local `this.memoryStorage`, which did not prevent rapid re-requests across multiple backend instances.
- **Remediation:** Integrated PostgreSQL-backed distributed rate limiting via `otp_rate_limits` table in `dfarm_central`. Cooldown checks and reservations run as atomic database queries. In-memory storage is retained only as an offline test fallback.

### 2.4 Removal of Operational Dev Bypasses
- **Pre-Inspection State:** `requireSuperAdminRole` in `super-admin.routes.ts` contained a fallback that automatically injected a default Super Admin identity whenever `NODE_ENV !== 'production'`.
- **Remediation:** Eliminated the dev fallback completely. All requests to Super Admin endpoints require authentic HMAC JWT tokens (`401 Unauthorized` if missing).
- **Purge Endpoint Protection:** `DELETE /api/v1/dairies/purge/phone/:phone` was hardened to permanently return `403 Forbidden` in production.

### 2.5 Platform Operator Least Privilege
- **Pre-Inspection State:** `requireSuperAdminRole` granted `PLATFORM_OPERATOR` full access to all Super Admin endpoints.
- **Remediation:** Split into `requirePlatformStaffRole` (allows `SUPER_ADMIN` and `PLATFORM_OPERATOR` for metrics, alerts, health, hardware view, reports) and `requireSuperAdminRole` (strictly requires `SUPER_ADMIN` for hardware registration/assignment, AMC plans, subscriptions, bank details, and support sessions).

### 2.6 Single Active Primary Dairy Admin Constraint
- **Pre-Inspection State:** Application-level validation existed, but concurrent registrations could violate cardinality.
- **Remediation:** Added partial unique index `uidx_primary_dairy_admin_active` on `users(organization_id)` where `role IN ('PRIMARY_DAIRY_ADMIN', 'DAIRY_OWNER') AND status = 'ACTIVE'`.
