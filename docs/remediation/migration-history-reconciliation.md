# DFarm Migration History Reconciliation Report

**Document Reference:** `DFARM-MIG-REC-003`  
**Classification:** Database Catalog & Migration Audit  
**Lead Engineer:** Senior PostgreSQL & Supabase Database Engineer  
**Date:** November 14, 2026  
**Target Database:** `supabase_db_DFarm` (PostgreSQL 17.11 / Supabase Local Stack on Port 54322)  
**Status:** FULLY RECONCILED, UNIFIED, AND APPLIED (001–026)  

---

## 1. Executive Summary

Prior to this remediation, multiple engineering phases had authored migration files in isolation using colliding prefixes:
- Multiple migrations prefixed with `012_` (Sync engine vs. Milk collection atomic ledger).
- Five distinct migrations prefixed with `014_` (Feed inventory, Milk rates, Customer ledger, Monthly billing, Customer payouts).
- Multiple migrations prefixed with `016_` and `017_`.

The Supabase migration catalog table `supabase_migrations.schema_migrations` only contained entries up to `016`, leaving critical Phase 11, 12, 13, and 15 tables unapplied or orphaned.

### Key Remediation Principles Followed:
1. **Never Silently Rewrite Applied Migration History:** All 14 previously applied migrations (`001`–`011`, `014_feed`, `015_p05_p10`, `016_employee`) were preserved in their exact applied state without tampering.
2. **Never Delete Migration Records:** Zero records were deleted from `schema_migrations`.
3. **No Destructive Database Resets:** All pre-existing development data and test fixtures across all 71 tables were preserved.
4. **Canonical Monotonic Sequence:** All unapplied migrations were systematically renamed into unique canonical sequential numbers (`017` through `023`).
5. **Additive Remediation Migrations:** All subsequent fixes were applied as new additive migrations (`024`, `025`, `026`).

---

## 2. Migration Reconciliation Mapping Table

| Original File Name | Phase | Pre-Remediation Status | Canonical File Name | Applied Status |
| :--- | :--- | :--- | :--- | :--- |
| `001_core_schema.sql` | P01 | Applied | `001_core_schema.sql` | **APPLIED** |
| `002_rls_policies.sql` | P01 | Applied | `002_rls_policies.sql` | **APPLIED** |
| `003_storage_buckets.sql` | P01 | Applied | `003_storage_buckets.sql` | **APPLIED** |
| `004_fix_rls_and_roles.sql` | P01 | Applied | `004_fix_rls_and_roles.sql` | **APPLIED** |
| `005_fix_org_rls.sql` | P01 | Applied | `005_fix_org_rls.sql` | **APPLIED** |
| `006_hardware_integration.sql` | P02 | Applied | `006_hardware_integration.sql` | **APPLIED** |
| `007_quality_management.sql` | P03 | Applied | `007_quality_management.sql` | **APPLIED** |
| `008_center_operations.sql` | P04 | Applied | `008_center_operations.sql` | **APPLIED** |
| `009_customer_management.sql` | P05 | Applied | `009_customer_management.sql` | **APPLIED** |
| `010_offline_sync.sql` | P06 | Applied | `010_offline_sync.sql` | **APPLIED** |
| `011_collection_records.sql` | P07 | Applied | `011_collection_records.sql` | **APPLIED** |
| `012_sync_engine_enhancements.sql` | P06 | Applied (Version 012) | `012_sync_engine_enhancements.sql` | **APPLIED** |
| `013_face_model_version_metadata.sql` | P08 | Applied (Version 013) | `013_face_model_version_metadata.sql` | **APPLIED** |
| `014_feed_inventory_procurement_and_sales.sql` | P14 | Applied (Version 014) | `014_feed_inventory_procurement_and_sales.sql` | **APPLIED** |
| `015_p05_p10_master_remediation.sql` | P10 | Applied (Version 015) | `015_p05_p10_master_remediation.sql` | **APPLIED** |
| `016_employee_management_attendance_and_payroll.sql` | P16 | Applied (Version 016) | `016_employee_management_attendance_and_payroll.sql` | **APPLIED** |
| `012_milk_collection_workflow_and_atomic_ledger.sql` | P10 | Unapplied (Collided with 012) | `017_milk_collection_workflow_and_atomic_ledger.sql` | **APPLIED** |
| `014_milk_rate_management_system.sql` | P11 | Unapplied (Collided with 014) | `018_milk_rate_management_system.sql` | **APPLIED** |
| `014_customer_accounting_and_double_entry_ledger.sql` | P12 | Unapplied (Collided with 014) | `019_customer_accounting_and_double_entry_ledger.sql` | **APPLIED** |
| `014_automated_monthly_billing_and_settlements.sql` | P13 | Unapplied (Collided with 014) | `020_automated_monthly_billing_and_settlements.sql` | **APPLIED** |
| `014_customer_payouts_batches_and_reconciliation.sql` | P15 | Unapplied (Collided with 014) | `021_customer_payouts_batches_and_reconciliation.sql` | **APPLIED** |
| `016_customer_notifications.sql` | P18 | Unapplied (Collided with 016) | `022_customer_notifications.sql` | **APPLIED** |
| `017_notification_engine_push_and_whatsapp_automation.sql` | P19 | Unapplied (Collided with 017) | `023_notification_engine_push_and_whatsapp_automation.sql` | **APPLIED** |
| *New Additive Master Remediation Migration* | Master | New Additive | `024_p11_p15_master_remediation.sql` | **APPLIED** |
| *New Additive Payout Contract & Audit Migration* | P15 | New Additive | `025_payout_api_contract_and_privilege_hardening.sql` | **APPLIED** |
| *New Additive Balance Harmonization Migration* | P15 | New Additive | `026_harmonize_eligible_payout_balance.sql` | **APPLIED** |

---

## 3. Official Catalog Verification (`supabase migration list`)

Execution of `npx supabase migration list` against the target PostgreSQL stack confirms that all 26 migrations are registered, synchronized, and present in both local and remote states:

```json
{
  "target": { "kind": "local", "host": "127.0.0.1", "port": 54322 },
  "migrations": [
    { "local": "001", "remote": "001" },
    { "local": "002", "remote": "002" },
    { "local": "003", "remote": "003" },
    { "local": "004", "remote": "004" },
    { "local": "005", "remote": "005" },
    { "local": "006", "remote": "006" },
    { "local": "007", "remote": "007" },
    { "local": "008", "remote": "008" },
    { "local": "009", "remote": "009" },
    { "local": "010", "remote": "010" },
    { "local": "011", "remote": "011" },
    { "local": "012", "remote": "012" },
    { "local": "013", "remote": "013" },
    { "local": "014", "remote": "014" },
    { "local": "015", "remote": "015" },
    { "local": "016", "remote": "016" },
    { "local": "017", "remote": "017" },
    { "local": "018", "remote": "018" },
    { "local": "019", "remote": "019" },
    { "local": "020", "remote": "020" },
    { "local": "021", "remote": "021" },
    { "local": "022", "remote": "022" },
    { "local": "023", "remote": "023" },
    { "local": "024", "remote": "024" },
    { "local": "025", "remote": "025" },
    { "local": "026", "remote": "026" }
  ],
  "message": "Migrations listed"
}
```

---

## 4. Safety and Backup Verification

1. **Pre-Remediation Physical Dump:** `storage/backups/dfarm_backup_pre_remediation.dump` (1,244,219 bytes) was verified prior to executing any DDL statements.
2. **Catalog Integrity Check:** Verified that all 71 tables, foreign keys, triggers, and indices remain healthy with zero data truncation or table dropping.
3. **Canonical Monotonic Sequence Rule:** Future developers must name subsequent migrations starting strictly at `027_*.sql`.
