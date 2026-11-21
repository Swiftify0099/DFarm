# DFARM ARCHITECTURE HANDOFF: ROADMAP PHASE 05 READY
**Document ID:** `DFARM-HANDOFF-R05-001`  
**From:** Roadmap Phase 02–04 Implementation Team  
**To:** Roadmap Phase 05 Implementation Team  
**Date:** 2026-11-18  
**Status:** READY FOR PHASE 05  

---

## 1. Context & Handover Summary

With the successful completion and verification of **Roadmap Phases 02, 03, and 04**:
- The platform central control plane (`dfarm_central`) is hardened with strict role-based access control across all 8 standardized roles.
- Super Admin core operations (Dairy onboarding, physical PostgreSQL tenant database provisioning, Primary Dairy Admin lifecycle, platform account management mutation, central dashboard metrics, and reports engine) are fully operational and verified.
- Super Admin platform services (Hardware master, AMC subscriptions with isolated Razorpay verification, durable diagnostic support sessions, central global rate and FAT/SNF adjustment policy management, and platform operator least-privilege boundary enforcement) are complete with 100% test coverage.

The platform is now in an ideal, fully verified state to begin **Master Roadmap Phase 05: Dairy Core Operations & Operational Setup**.

---

## 2. Baseline State for Roadmap Phase 05 Engineers

### 2.1. Authentication & Roles Available
- All requests entering the backend pass through `optionalAuthenticate` and `authorizePermission(permission)`.
- The authoritative role list includes `SUPER_ADMIN`, `PRIMARY_DAIRY_ADMIN`, `DAIRY_ADMIN`, `COLLECTION_OPERATOR`, `SUPERVISOR`, `FARMER_CUSTOMER`, `GUEST_FARMER`, and `PLATFORM_OPERATOR`.
- Use `hasPermission(role, permission)` to enforce default-deny security on new routes.

### 2.2. Tenant Routing Architecture
- Every registered dairy cooperative has a physical operational database:
  - Central mapping stored in `dfarm_central.dairy_database_mappings`.
  - Tenant connection pool dynamically provisioned via `TenantDatabaseManager.getInstance().getTenantPool(dairyId)`.
  - All Phase 05 operational queries (shifts, centers, routes, cattle breeds, staff assignments) must target the tenant pool, NOT the central database.

### 2.3. Global Policies Integration
- When building Dairy rate charts or quality adjustment tables in Phase 05, developers can reference:
  - `global_rate_policies` & `global_rate_policy_versions`
  - `global_fat_snf_adjustment_policies` & `global_fat_snf_adjustment_policy_versions`
  - **Rule:** A dairy may benchmark or adopt a global policy version, but local tenant charts remain authoritative for that dairy's collections.

### 2.4. Test Harness
- To run the complete validation suite before starting Phase 05 work:
  ```bash
  node --test services/backend/tests/roadmap-phase-02-auth-rbac.test.js services/backend/tests/roadmap-phase-03-super-admin-core.test.js services/backend/tests/roadmap-phase-04-platform-services.test.js
  ```
  Expected result: 72 tests passed, 0 failures.

---

## 3. Strict Prohibitions & Constraints Retained

1. **Zero UI Redesign:** No alterations to Claymorphism design system, component layouts, visual tokens, or typography across any of the four applications.
2. **Zero Mock Business Data:** No in-memory hardcoded business collections or farmer records in production pathways.
3. **Database-per-Dairy Integrity:** Never write operational dairy transactions into `dfarm_central`.
