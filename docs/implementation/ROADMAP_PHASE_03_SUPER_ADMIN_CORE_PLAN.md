# ROADMAP PHASE 03: SUPER ADMIN CORE OPERATIONS PLAN

**Document ID:** `DFARM-PLAN-ROADMAP-03-001`  
**Roadmap Phase:** Phase 03 — Super Admin Core Operations  
**Execution Order:** Gate 2 (Executes upon Gate 1 Phase 02 completion)  
**Date:** November 17, 2026  
**Status:** FULLY EXECUTED & VERIFIED  

---

## 1. Objectives & Dependency Ordering

Phase 03 establishes central administrative control over Dairies, platform accounts, and reporting. In accordance with the Master Roadmap rules, Phase 03 operations depend upon the authenticated identities and RBAC boundaries finalized in Phase 02.

---

## 2. Implementation Work Packages

### WP 3.1: Central Dairy Registry & Provisioning
- Maintain `organizations` as authoritative central store.
- Bind Dairy creation to physical PostgreSQL provisioning via `TenantDatabaseManager`.
- Enforce unique constraint on Dairy codes and business emails (`409 Conflict`).

### WP 3.2: Primary Dairy Admin Account Lifecycle
- Create Primary Dairy Admin account linked to new organization.
- Issue cryptographic invitation token via `dairy_admin_invitations`.
- Enforce database constraint: max 1 active Primary Admin per Dairy.

### WP 3.3: Platform Account Management
- Implement `POST /api/v1/super-admin/users` for creating Platform Operators and Super Admins.
- Enforce input validation, phone normalization, role boundary, and audit logging.

### WP 3.4: Central Dashboard Metrics & Real Data Aggregation
- Ensure all dashboard metrics derive from central control-plane SQL counts.
- Disallow cross-tenant scans on dashboard requests.

### WP 3.5: Authoritative Reports Engine
- Support report types: `dairy_growth`, `hardware_inventory`, `amc_status`.
- Apply server-side pagination, date filtering, and immutable audit logs.

### WP 3.6: Dairy Lifecycle Operations
- Verify suspension (`POST /dairies/:id/suspend`) updates organization status without dropping operational database.
- Verify reactivation (`POST /dairies/:id/reactivate`) validates health and restores active operational state.
