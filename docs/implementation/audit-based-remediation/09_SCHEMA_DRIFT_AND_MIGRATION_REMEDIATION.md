# DFARM — SCHEMA DRIFT AND MIGRATION REMEDIATION

**Document ID:** `09_SCHEMA_DRIFT_AND_MIGRATION_REMEDIATION`  
**Scope:** Central & Tenant Migration History, Checksum Consistency, Idempotency  
**Status:** COMPLETE & VERIFIED  
**Date:** 2026-11-18  

---

## 1. Migration Architecture & Drift Principles

In DFarm's physical multi-tenant architecture, database schema changes must be applied uniformly to:
1. The central database (`dfarm_central`).
2. All dynamically provisioned physical tenant databases (`dfarm_tenant_<code_hash>`).

**Critical Invariants:**
- Never edit an already-applied migration in place. Doing so creates schema drift between existing databases and newly provisioned ones.
- All new database requirements must be delivered as forward-only additive migrations.
- Migrations must be strictly tracked in `packages/database/src/index.ts` (`MIGRATION_MANIFEST`) and `services/backend/src/infrastructure/database/MigrationRunner.ts`.

---

## 2. Remediated Migration Issues

### 2.1 Untracked Migrations Restored to Runner
- **Audit ID:** `DFARM-AUDIT-001`
- **Root Cause:** Migrations `033_central_platform_policies_and_support.sql`, `034_tenant_reconciliation_status_hardening.sql`, and `035_customer_lifecycle_and_registration_hardening.sql` were not registered in `MIGRATION_MANIFEST` or `MigrationRunner.ts`. As a result, automated deployments and tests skipped them.
- **Remediation:** Added all three to:
  - `packages/database/src/index.ts` in `central` and `tenant` migration lists.
  - `services/backend/src/infrastructure/database/MigrationRunner.ts` in `CENTRAL_MIGRATIONS` and `TENANT_MIGRATIONS`.

### 2.2 Quarantining DML Maintenance Script 031
- **Audit ID:** `DFARM-AUDIT-002`
- **Root Cause:** Script `031_remove_dairy_admin_7507495615.sql` was a hardcoded data purge for a specific test phone number (`7507495615`), mistakenly placed in the migration sequence.
- **Remediation:** Removed from migration sequence and placed in `scripts/maintenance/`.

### 2.3 Resolving Customer Registration Status Schema Drift (035)
- **Root Cause:** Historic migration `004_customer_identity.sql` had a CHECK constraint allowing only `('IN_PROGRESS', 'COMPLETED', 'REJECTED')`. Some databases were migrated when this was in place, while new application code allowed `'PENDING_APPROVAL'`, `'APPROVED'`, and `'UNREGISTERED'`.
- **Remediation:** Additive migration `035_customer_lifecycle_and_registration_hardening.sql` safely drops and recreates the constraint with the expanded set, without modifying historical files or dropping tables.

---

## 3. Forward-Only Migration Manifest Verification

| Manifest Index | File Name | Target Scope | Verified Idempotent |
|---|---|---|---|
| Central 033 | `033_central_platform_policies_and_support.sql` | `dfarm_central` | YES |
| Tenant 034 | `034_tenant_reconciliation_status_hardening.sql` | Tenant DBs | YES |
| Central/Tenant 035 | `035_customer_lifecycle_and_registration_hardening.sql` | Both | YES |

All migrations pass automated execution in `npm run db:test` (22/22 tests).
