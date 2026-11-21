# DFarm — Database Migration Verification Report

**Document ID:** DFARM-REPORT-004  
**Version:** 1.0.0  
**Phase:** Prompt 01 Baseline Implementation  
**Status:** COMPLETED & VERIFIED  
**Date:** 2026-11-17  
**Author:** DFarm Database Architecture Team

---

## 1. Verification Scope

To verify that:
1. Manifest-based migration engine (`MigrationRunner.ts`) correctly segregates control plane and tenant operational tracks.
2. Quarantined duplicate migration `031_remove_dairy_admin_7507495615.sql` is never executed automatically.
3. PostgreSQL advisory locking (`pg_advisory_lock`) prevents concurrent execution races.
4. SHA-256 checksums are recorded in `schema_migrations` for audit traceability.

---

## 2. Test Execution & Evidence

### 2.1 Manifest Segregation Test (Test A in `tenant-database-isolation.test.js`)
- **Quarantined Track Count:** Exactly 1 (`031_remove_dairy_admin_7507495615.sql` tagged `MANUAL_REVIEW_REQUIRED`).
- **Control Plane Track:** Contains `031_dairy_database_mappings.sql` along with `001-003`, `028-030`.
- **Tenant Operational Track:** Contains `001` through `027`.
- **Assertion:**
  - `assert.strictEqual(controlPlaneMigrations.some(m => m.filename === '031_remove_dairy_admin_7507495615.sql'), false)` -> **PASS**
  - `assert.strictEqual(tenantMigrations.some(m => m.filename === '031_remove_dairy_admin_7507495615.sql'), false)` -> **PASS**

### 2.2 Schema Migrations Table Definition
In both the central database and all tenant databases, migration history is maintained as follows:

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(50) PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    execution_time_ms INTEGER NOT NULL
);
```

### 2.3 Advisory Locking Implementation
Before running migrations on any database target, `MigrationRunner` executes:

```sql
SELECT pg_advisory_lock(hashtext('dfarm_migration_lock_<target>'));
-- Execute pending migration transaction
SELECT pg_advisory_unlock(hashtext('dfarm_migration_lock_<target>'));
```

This prevents multiple instances of the backend service from attempting simultaneous DDL schema migrations during deployment.
