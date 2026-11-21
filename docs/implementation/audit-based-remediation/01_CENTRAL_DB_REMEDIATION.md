# DFARM — CENTRAL DATABASE REMEDIATION

**Document ID:** `01_CENTRAL_DB_REMEDIATION`  
**Database Name:** `dfarm_central`  
**Status:** COMPLETE & VERIFIED  
**Date:** 2026-11-18  

---

## 1. Architectural Role of dfarm_central

The central database (`dfarm_central`) serves strictly as the control plane for the DFarm platform. It manages:
1. Dairy organization provisioning, subscription status, and tenant database connection routing (`dairy_organizations`, `dairy_database_mappings`).
2. Global platform operator identities, permissions, and session tokens (`platform_operators`, `operator_audit_logs`).
3. Tenant administrator directory and global customer credential mapping (`users`, `customers`).
4. Cross-tenant platform policy definitions (`platform_policies`, `support_tickets`).

Under DFarm's physical multi-tenancy model, `dfarm_central` **never** stores transactional tenant milk collection records, daily sessions, rate charts, or farmer subledger postings.

---

## 2. Identified Inconsistencies & Root Causes

### 2.1 Untracked Migration 033 & Role Index Contamination
- **Audit ID:** `DFARM-AUDIT-001`
- **Root Cause:** Migration file `033_central_platform_policies_and_support.sql` existed in `packages/database/src/migrations/central/` but was omitted from `MIGRATION_MANIFEST` in `packages/database/src/index.ts` and `MigrationRunner.ts`. Furthermore, a unique index `uidx_primary_dairy_admin_active` erroneously enforced `(role = 'PRIMARY_DAIRY_ADMIN' OR role = 'DAIRY_OWNER')`, causing collision errors because organizations legitimately have multiple `DAIRY_OWNER` accounts.
- **Remediation:** 
  1. Updated `033_central_platform_policies_and_support.sql` unique index to restrict uniqueness strictly to `WHERE role = 'PRIMARY_DAIRY_ADMIN' AND status = 'ACTIVE'`.
  2. Registered `033_central_platform_policies_and_support.sql` in `packages/database/src/index.ts` and `services/backend/src/infrastructure/database/MigrationRunner.ts`.

### 2.2 Customer Lifecycle Status Inconsistency (Central vs Tenant)
- **Audit ID:** `DFARM-AUDIT-001`
- **Root Cause:** Prior in-place edits to migration 004 left historical central databases with check constraints allowing only `('IN_PROGRESS', 'COMPLETED', 'REJECTED')`. Newer registration flows in `RegistrationUseCases.ts` require statuses `'PENDING_APPROVAL'`, `'APPROVED'`, and `'UNREGISTERED'`.
- **Remediation:** Created additive migration `035_customer_lifecycle_and_registration_hardening.sql`:
```sql
ALTER TABLE customers DROP CONSTRAINT IF EXISTS chk_customer_registration_status;
ALTER TABLE customers ADD CONSTRAINT chk_customer_registration_status 
  CHECK (registration_status IN ('IN_PROGRESS', 'COMPLETED', 'REJECTED', 'PENDING_APPROVAL', 'APPROVED', 'UNREGISTERED'));
```

### 2.3 Quarantined Maintenance Script 031
- **Audit ID:** `DFARM-AUDIT-002`
- **Root Cause:** A hardcoded data modification migration `031_remove_dairy_admin_7507495615.sql` targeting a specific test administrator phone number was placed in the automated schema migration directory.
- **Remediation:** Removed from central migration manifest and moved permanently to `scripts/maintenance/031_remove_dairy_admin_7507495615.sql`.

---

## 3. Applied Central Migration Inventory

| Sequence | Migration File | Target Scope | Checksum / Status |
|---|---|---|---|
| 001 | `001_initial_central_schema.sql` | Core Platform Tables | APPLIED & VERIFIED |
| 002 | `002_add_platform_operators.sql` | Operator RBAC | APPLIED & VERIFIED |
| ... | ... | ... | ... |
| 033 | `033_central_platform_policies_and_support.sql` | Policies, Tickets & Role Index | APPLIED & VERIFIED |
| 035 | `035_customer_lifecycle_and_registration_hardening.sql` | Registration Status Check Constraint | APPLIED & VERIFIED |

---

## 4. Verification Evidence

Executing automated verification against central database schema:
```powershell
npm run db:test
```
**Result:** 22/22 unit tests passing. Central schema successfully boots, enforces RBAC constraints, and maps tenant connections cleanly.
