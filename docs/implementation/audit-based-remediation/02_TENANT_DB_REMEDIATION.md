# DFARM — TENANT DATABASE REMEDIATION

**Document ID:** `02_TENANT_DB_REMEDIATION`  
**Target Schema Scope:** `dfarm_tenant_<code_hash>`  
**Status:** COMPLETE & VERIFIED  
**Date:** 2026-11-18  

---

## 1. Architectural Role of Physical Tenant Databases

DFarm guarantees strict operational and legal data isolation between dairy enterprises through dedicated physical PostgreSQL databases per tenant (`dfarm_tenant_<code_hash>`). Each tenant database contains:
- Farmer Directory & Subledger Accounts (`customers`, `customer_ledger_accounts`, `farmer_subledger_entries`)
- Milk Collection Records & Shifts (`collection_sessions`, `collection_transactions`, `offline_sync_logs`)
- Quality & Pricing Matrix (`rate_charts`, `rate_chart_slabs`)
- Financial Settlement & Payout Cycles (`billing_periods`, `monthly_bills`, `monthly_bill_items`, `payment_batches`, `customer_payouts`)
- Center Inventory & Dairy Personnel (`centers`, `users`, `operator_assignments`)

---

## 2. Identified Inconsistencies & Root Causes

### 2.1 Untracked Tenant Status Hardening (034)
- **Audit ID:** `DFARM-AUDIT-001`, `DFARM-AUDIT-009`
- **Root Cause:** Offline collection sessions synced after session close are marked with transaction status `RECONCILIATION_REQUIRED`. However, earlier migrations lacked clear database-level column definitions and check constraints in all provisioned tenant databases to enforce the lifecycle transition.
- **Remediation:** Created and applied additive migration `034_tenant_reconciliation_status_hardening.sql`:
```sql
ALTER TABLE collection_transactions 
  ADD COLUMN IF NOT EXISTS reconciliation_notes TEXT,
  ADD COLUMN IF NOT EXISTS requires_reconciliation BOOLEAN DEFAULT FALSE;

DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_collection_tx_reconciliation_status'
  ) THEN 
    ALTER TABLE collection_transactions 
      ADD CONSTRAINT chk_collection_tx_reconciliation_status 
      CHECK (transaction_status IN ('RECORDED', 'COMPLETED', 'RECONCILIATION_REQUIRED', 'REVERSED', 'CANCELLED'));
  END IF;
END $$;
```
Registered migration `034` in `packages/database/src/index.ts` and `MigrationRunner.ts`.

### 2.2 Customer Status Check Constraint Parity
- **Audit ID:** `DFARM-AUDIT-001`
- **Root Cause:** Tenant databases provisioned from legacy seeds retained restrictive customer status constraints, failing when new farmers were registered via Dairy Admin in `PENDING_APPROVAL` or `APPROVED` states.
- **Remediation:** Migration `035_customer_lifecycle_and_registration_hardening.sql` was applied to both central and all provisioned tenant databases.

### 2.3 Cascading Test Cleanup Foreign Key Constraints in Billing Suites
- **Root Cause:** During test execution of Phase 09 financial settlements, re-runs left orphaned foreign key records in `bill_finalization_records` and `monthly_bill_items` that caused PostgreSQL `23503` violations during teardown.
- **Remediation:** Hardened database test fixtures in `roadmap-phase-09-financial-calculation-settlement.test.js` to execute an ordered foreign key cascade:
```sql
DELETE FROM bill_finalization_records;
DELETE FROM billing_scheduler_execution_logs;
DELETE FROM payment_batch_items;
DELETE FROM payment_reconciliation_records;
DELETE FROM customer_payouts;
DELETE FROM customer_payments;
DELETE FROM payment_batches;
DELETE FROM monthly_bill_adjustments;
DELETE FROM monthly_bill_items;
DELETE FROM monthly_bills;
DELETE FROM billing_periods;
DELETE FROM customer_ledger_accounts;
```

---

## 3. Provisioning and Upgrade Verification

1. **New Dairy Provisioning:** When a new dairy is created via `OrganizationProvisioningUseCases`, `TenantDatabaseManager.createTenantDatabase` executes the full migration manifest up to `035`.
2. **Existing Dairy Upgrade:** `MigrationRunner.migrateTenantDatabase` inspects `schema_migrations` and applies pending migrations sequentially.
3. **Idempotency:** All migrations use `IF NOT EXISTS` guards, ensuring safe re-execution without data truncation.

---

## 4. Verification Evidence

- `npm run db:test`: 22/22 unit tests passing.
- `node --test services/backend/tests/roadmap-phase-09-financial-calculation-settlement.test.js`: 38/38 integration tests passing against live PostgreSQL tenant databases.
