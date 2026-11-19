# DFARM — DATABASE SCHEMA DRIFT AND MIGRATION AUDIT
## MIGRATION MANIFEST, CHECKSUMS, DRIFT DETECTION & SEQUENCING RISKS

**Audit Reference:** `DFARM-AUDIT-MIGRATION-001`  
**Target:** `supabase/migrations/` vs `packages/database/src/index.ts`  
**Date:** 2026-11-18  

---

### 1. Migration File Inventory vs Manifest Cross-Check

| File Name on Disk | Manifest Version | Manifest Target | Status in Manifest | Schema Drift Finding |
|---|---|---|---|---|
| `001_extensions_and_common.sql` | 001 | SHARED | REGISTERED | Clean |
| `002_organizations_and_centers.sql` | 002 | SHARED | REGISTERED | Clean |
| `003_user_identity_foundation.sql` | 003 | SHARED | REGISTERED | Clean |
| `004_customer_identity.sql` | 004 | TENANT_OPERATIONAL | REGISTERED | Clean |
| `005_face_and_rfid.sql` | 005 | TENANT_OPERATIONAL | REGISTERED | Clean |
| `006_customer_identification_audit.sql` | 006 | TENANT_OPERATIONAL | REGISTERED | Clean |
| `007_rate_management.sql` | 007 | TENANT_OPERATIONAL | REGISTERED | Clean |
| `008_collection_sessions_and_transactions.sql` | 008 | TENANT_OPERATIONAL | REGISTERED | Clean |
| `009_customer_ledger.sql` | 009 | TENANT_OPERATIONAL | REGISTERED | Clean |
| `010_devices_sync_and_audit.sql` | 010 | TENANT_OPERATIONAL | REGISTERED | Clean |
| `011_customer_lifecycle_and_auth_mapping.sql` | 011 | TENANT_OPERATIONAL | REGISTERED | Clean |
| `012_sync_engine_enhancements.sql` | 012 | TENANT_OPERATIONAL | REGISTERED | Clean |
| `013_face_model_version_metadata.sql` | 013 | TENANT_OPERATIONAL | REGISTERED | Clean |
| `014_feed_inventory_procurement_and_sales.sql` | 014 | TENANT_OPERATIONAL | REGISTERED | Clean |
| `015_p05_p10_master_remediation.sql` | 015 | TENANT_OPERATIONAL | REGISTERED | Clean |
| `016_employee_management_attendance_and_payroll.sql` | 016 | TENANT_OPERATIONAL | REGISTERED | Clean |
| `017_milk_collection_workflow_and_atomic_ledger.sql` | 017 | TENANT_OPERATIONAL | REGISTERED | Clean |
| `018_milk_rate_management_system.sql` | 018 | TENANT_OPERATIONAL | REGISTERED | Clean |
| `019_customer_accounting_and_double_entry_ledger.sql` | 019 | TENANT_OPERATIONAL | REGISTERED | Clean |
| `020_automated_monthly_billing_and_settlements.sql` | 020 | TENANT_OPERATIONAL | REGISTERED | Clean |
| `021_customer_payouts_batches_and_reconciliation.sql` | 021 | TENANT_OPERATIONAL | REGISTERED | Clean |
| `022_customer_notifications.sql` | 022 | TENANT_OPERATIONAL | REGISTERED | Clean |
| `023_notification_engine_push_and_whatsapp_automation.sql` | 023 | TENANT_OPERATIONAL | REGISTERED | Clean |
| `024_p11_p15_master_remediation.sql` | 024 | TENANT_OPERATIONAL | REGISTERED | Clean |
| `025_payout_api_contract_and_privilege_hardening.sql` | 025 | TENANT_OPERATIONAL | REGISTERED | Clean |
| `026_harmonize_eligible_payout_balance.sql` | 026 | TENANT_OPERATIONAL | REGISTERED | Clean |
| `027_kiosk_shift_sessions_and_sface128_seed.sql` | 027 | TENANT_OPERATIONAL | REGISTERED | Clean |
| `028_dairy_location_coordinates_and_address.sql` | 028 | CONTROL_PLANE | REGISTERED | Clean |
| `029_dairy_admin_activation_tokens.sql` | 029 | CONTROL_PLANE | REGISTERED | Clean |
| `030_super_admin_pankaj_popat_yewale.sql` | 030 | CONTROL_PLANE | REGISTERED | Clean |
| `031_dairy_database_mappings.sql` | 031 | CONTROL_PLANE | REGISTERED | Clean |
| `031_remove_dairy_admin_7507495615.sql` | 031_quarantined | MANUAL_REVIEW_REQUIRED | QUARANTINED | Duplicate 031 prefix collision (**DFARM-AUDIT-002**) |
| `032_central_super_admin_features.sql` | 032 | CONTROL_PLANE | REGISTERED | Clean |
| `033_central_platform_policies_and_support.sql` | **MISSING** | **CONTROL_PLANE** | **UNREGISTERED** | **CRITICAL OMISSION (DFARM-AUDIT-001)** |

---

### 2. Critical Drift Analysis & Recommendations

1. **Defect DFARM-AUDIT-001 (Migration 033 Omission):**
   - `033_central_platform_policies_and_support.sql` was added during Roadmap Phase 10 to establish `otp_rate_limits`, `support_diagnostic_sessions`, `global_rate_policies`, and `global_fat_snf_adjustment_policies`.
   - Neither `packages/database/src/index.ts` nor `services/backend/src/infrastructure/database/MigrationRunner.ts` updated their `MIGRATION_MANIFEST` arrays.
   - **Remediation Action:** Append migration 033 to both manifest files prior to Phase 11 deployment.

2. **Defect DFARM-AUDIT-002 (Prefix 031 Collision):**
   - Two files on disk begin with `031_`. Migration runners scanning by filename sort unpredictably.
   - **Remediation Action:** Relocate `031_remove_dairy_admin_7507495615.sql` to `scripts/maintenance/`.
