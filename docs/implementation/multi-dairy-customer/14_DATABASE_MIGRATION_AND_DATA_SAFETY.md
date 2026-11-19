# 14 — DATABASE MIGRATION AND DATA SAFETY

**Execution Reference:** `DFARM-MULTI-DAIRY-CUSTOMER-MEMBERSHIP`  
**Migration File:** `supabase/migrations/037_multi_dairy_customer_identity_and_membership.sql`  
**Target Databases:** Control Plane (`dfarm_central`) & Tenant Databases (`dfarm_tenant_<code_hash>`)

---

## 1. Migration Execution Track

Migration 037 implements the complete multi-dairy data foundation without taking locks on active operational tables.

### Key DDL Statements Executed
1. `CREATE TABLE IF NOT EXISTS global_customer_identities`
2. `CREATE TABLE IF NOT EXISTS customer_dairy_memberships`
3. `ALTER TABLE customers ADD COLUMN IF NOT EXISTS global_customer_id UUID;`
4. `CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_global_identity_per_org ON customers(organization_id, global_customer_id) WHERE global_customer_id IS NOT NULL AND is_deleted = FALSE;`

---

## 2. Backward Compatibility & Backfill Strategy

To ensure zero downtime and 100% preservation of pre-existing customer records:
1. **Backfill from `customer_tenant_lookup` (Legacy Central):**
   Seeds `global_customer_identities` from distinct normalized phone numbers.
   Seeds `customer_dairy_memberships` with status `APPROVED`.
2. **Backfill from Existing `customers` Table:**
   Seeds `global_customer_identities` from pre-existing customers.
   Seeds `customer_dairy_memberships` preserving `farmer_code`, `primary_center_id`, and `created_at`.
   Updates pre-existing customer rows with their newly mapped `global_customer_id`.
3. **Idempotent Upserts:**
   `ON CONFLICT (normalized_mobile_number) DO NOTHING` prevents duplicate primary keys.
   `ON CONFLICT (organization_id, global_customer_id) DO UPDATE` refreshes metadata while preserving existing IDs.

---

## 3. Rollback Safety Plan

In the event of an emergency rollback:
```sql
-- 1. Remove foreign references from customers
ALTER TABLE customers DROP COLUMN IF EXISTS global_customer_id;

-- 2. Drop central directory tables
DROP TABLE IF EXISTS customer_dairy_memberships CASCADE;
DROP TABLE IF EXISTS global_customer_identities CASCADE;
```
Existing customer records, milk collections, and farmer passbooks are physically independent and remain completely intact even if migration 037 is rolled back.
