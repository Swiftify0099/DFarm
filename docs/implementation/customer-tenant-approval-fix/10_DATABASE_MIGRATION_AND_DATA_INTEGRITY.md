# 10 — Database Migration & Data Integrity

**Reference:** `DFARM-CUSTOMER-TENANT-REGISTRATION-APPROVAL-FIX`  
**Artifact ID:** `10_DATABASE_MIGRATION_AND_DATA_INTEGRITY`  
**Target Environments:** PostgreSQL / Supabase, Central DB (`dfarm_central`), Tenant Databases (`dfarm_tenant_*`)  
**Status:** IMPLEMENTED & VERIFIED  

---

## 1. Migration Audit Overview

All central control plane and tenant schema migrations in `supabase/migrations/` (migrations `001_initial_schema.sql` through `037_biometric_face_and_payment_gateways.sql`) were audited to ensure complete cross-table schema consistency and data preservation.

### 1.1 Key Schema Compatibility Issue Discovered
In earlier stages, user authentication queries in `PostgresPool.ts` and `AdminAuthUseCases.ts` attempted to query `users.normalized_mobile_number`.
However, in standard baseline schemas:
- `users.mobile` was the original field name in early migrations.
- `normalized_mobile_number` was introduced in activation use cases but was missing in migration 029's table definition.
- This discrepancy led to runtime SQL errors (`column "normalized_mobile_number" does not exist`) in environments where only base migrations were applied.

---

## 2. Applied Schema Updates

### 2.1 Supabase Migration 029 Patch
File: [029_dairy_admin_activation_tokens.sql](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/supabase/migrations/029_dairy_admin_activation_tokens.sql)

Appended non-destructive idempotency alter statements:
```sql
-- Ensure normalized_mobile_number column exists on users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS normalized_mobile_number VARCHAR(20);
CREATE INDEX IF NOT EXISTS idx_users_normalized_mobile ON users(normalized_mobile_number);
```

### 2.2 Central PostgreSQL Pool Compatibility Layer
File: [PostgresPool.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/database/PostgresPool.ts)

Added dynamic DDL guards to ensure connection pools in hybrid environments immediately support user resolution columns without dropping existing data:
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS normalized_mobile_number VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile_number VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_role VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;
```

### 2.3 Isolated In-Memory Engine Consistency
File: [TenantDatabaseManager.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/database/TenantDatabaseManager.ts)

Mirrored the exact same DDL additions in `createIsolatedMemoryDatabase()`:
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS normalized_mobile_number VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile_number VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_role VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;
```

---

## 3. Data Integrity & Preservation Rules Enforced

1. **Zero Data Loss Guarantee**:
   - No `DROP TABLE`, `DROP COLUMN`, or `TRUNCATE` commands were executed.
   - All alterations used `ADD COLUMN IF NOT EXISTS`.
2. **Preservation of Existing Warna Milk's Records**:
   - Central organization record `38918630-4fee-4cec-96ea-a3a899aae7bc` (DF-SAN-2395) was preserved.
   - Admin user Popat Yewale (`9834388787`) was maintained with role `DAIRY_ADMIN`.
   - Secondary historical record (`65190859-c8e2-4a06-b862-5ed7ad8628cb`) was NOT modified or deleted, ensuring no accidental cascade deletion of legacy historical data.
3. **Foreign Key Integrity**:
   - Verified that `customer_dairy_memberships` maintains valid foreign keys to `customer_identities(id)` and `organizations(id)`.
   - Tenant database `customers` maintains internal referential integrity for `customer_status_history` and `collection_entries`.

---

## 4. Migration Execution & Verification Matrix

| Target | Migration Action | Impact on Existing Records | Verification Result |
| :--- | :--- | :--- | :--- |
| `users` table | `ADD COLUMN normalized_mobile_number` | None (Nullable column, backward compatible) | PASS |
| `users` table | `ADD COLUMN user_role` | None (Nullable column, backward compatible) | PASS |
| `customer_dairy_memberships` | Uniqueness on `(customer_identity_id, organization_id)` | Prevents duplicates; retains single canonical membership | PASS |
| `customers` table | Scoped uniqueness on `(organization_id, mobile_number)` | Prevents duplicate pending applications per tenant | PASS |
