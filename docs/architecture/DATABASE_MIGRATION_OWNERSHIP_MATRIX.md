# DFarm — Database Migration Ownership Matrix

**Document ID:** DFARM-ARCH-004  
**Version:** 1.0.0  
**Phase:** Prompt 01 Baseline Implementation  
**Status:** APPROVED ARCHITECTURAL SPECIFICATION

---

## 1. Migration Strategy & Track Ownership

All database schemas in DFarm are managed through an explicit manifest:
- **`CONTROL_PLANE`:** Applied exclusively to the central platform database (`dfarm_central`).
- **`TENANT_OPERATIONAL`:** Applied exclusively to individual dairy tenant databases (`dfarm_tenant_<code_hash>`).
- **`SHARED`:** Foundation extensions and shared definitions applied across both tracks.
- **`MANUAL_REVIEW_REQUIRED` (Quarantined):** Destructive scripts excluded from automatic execution.

---

## 2. Comprehensive Migration Manifest

| Version | Migration Filename | Target Track | Description & Schema Scope |
|---|---|---|---|
| `001` | `001_extensions_and_common.sql` | `SHARED` | `uuid-ossp`, `pgcrypto` extensions & updated_at trigger |
| `002` | `002_organizations_and_centers.sql` | `SHARED` | `organizations` and `dairy_centers` base schema |
| `003` | `003_user_identity_foundation.sql` | `SHARED` | Staff and operator users, roles, password hashes |
| `004` | `004_customer_identity.sql` | `TENANT_OPERATIONAL` | Farmer profiles, bank accounts, categories |
| `005` | `005_face_and_rfid.sql` | `TENANT_OPERATIONAL` | Biometric face templates and RFID card registry |
| `006` | `006_customer_identification_audit.sql` | `TENANT_OPERATIONAL` | Kiosk check-in identification audit log |
| `007` | `007_rate_management.sql` | `TENANT_OPERATIONAL` | Dynamic milk rate charts and formula parameters |
| `008` | `008_collection_sessions_and_transactions.sql` | `TENANT_OPERATIONAL` | Shift sessions and atomic milk collection intake |
| `009` | `009_customer_ledger.sql` | `TENANT_OPERATIONAL` | Double-entry customer accounting ledger |
| `010` | `010_devices_sync_and_audit.sql` | `TENANT_OPERATIONAL` | Hardware device registration and sync queue |
| `011` | `011_customer_lifecycle_and_auth_mapping.sql` | `TENANT_OPERATIONAL` | Producer approval workflow & registration status |
| `012` | `012_sync_engine_enhancements.sql` | `TENANT_OPERATIONAL` | Kiosk offline sync journals & conflict handling |
| `013` | `013_face_model_version_metadata.sql` | `TENANT_OPERATIONAL` | YuNet + SFace INT8 model version records |
| `014` | `014_feed_inventory_procurement_and_sales.sql` | `TENANT_OPERATIONAL` | Cattle feed warehouse inventory & farmer credit sales |
| `015` | `015_p05_p10_master_remediation.sql` | `TENANT_OPERATIONAL` | Remediation constraints across collections and ledger |
| `016` | `016_employee_management_attendance_and_payroll.sql` | `TENANT_OPERATIONAL` | Dairy staff attendance, monthly payroll, pay slips |
| `017` | `017_milk_collection_workflow_and_atomic_ledger.sql` | `TENANT_OPERATIONAL` | Stored procedures for atomic milk intake & ledger balance |
| `018` | `018_milk_rate_management_system.sql` | `TENANT_OPERATIONAL` | FAT/SNF rate matrix resolution and incentive slabs |
| `019` | `019_customer_accounting_and_double_entry_ledger.sql` | `TENANT_OPERATIONAL` | Immutability triggers and audit controls on ledger |
| `020` | `020_automated_monthly_billing_and_settlements.sql` | `TENANT_OPERATIONAL` | 10-day / 15-day / monthly billing cycle calculations |
| `021` | `021_customer_payouts_batches_and_reconciliation.sql` | `TENANT_OPERATIONAL` | Bulk farmer bank payouts and reconciliation batches |
| `022` | `022_customer_notifications.sql` | `TENANT_OPERATIONAL` | SMS, WhatsApp, and push notification dispatch logs |
| `023` | `023_notification_engine_push_and_whatsapp_automation.sql` | `TENANT_OPERATIONAL` | Automated dispatch triggers on collection & payout |
| `024` | `024_p11_p15_master_remediation.sql` | `TENANT_OPERATIONAL` | Cumulative constraint hardening across tenant schemas |
| `025` | `025_payout_api_contract_and_privilege_hardening.sql` | `TENANT_OPERATIONAL` | Payout maker-checker privilege validation |
| `026` | `026_harmonize_eligible_payout_balance.sql` | `TENANT_OPERATIONAL` | Stored procedure `compute_eligible_payout_balance` |
| `027` | `027_kiosk_shift_sessions_and_sface128_seed.sql` | `TENANT_OPERATIONAL` | Shift preset seeds and SFace INT8 reference models |
| `028` | `028_dairy_location_coordinates_and_address.sql` | `CONTROL_PLANE` | Authoritative Super Admin dairy coordinates & premises |
| `029` | `029_dairy_admin_activation_tokens.sql` | `CONTROL_PLANE` | Primary Dairy Admin email/OTP activation token vault |
| `030` | `030_super_admin_pankaj_popat_yewale.sql` | `CONTROL_PLANE` | Master root Super Admin seed identity |
| `031` | `031_dairy_database_mappings.sql` | `CONTROL_PLANE` | Central tenant database routing and status registry |
| `031_q`| `031_remove_dairy_admin_7507495615.sql` | `MANUAL_REVIEW_REQUIRED` | **QUARANTINED:** Targeted destructive script. Prohibited from auto-execution. |

---

## 3. Quarantined Migration Policy (DF-FIND-015 Resolution)

`031_remove_dairy_admin_7507495615.sql` was identified during the Prompt 0 audit as a duplicate prefix collision that performed a destructive `DELETE` of a specific phone number.
- In `MigrationRunner.ts`, this file is explicitly tagged with `MigrationTarget.MANUAL_REVIEW_REQUIRED`.
- Neither `runControlPlaneMigrations()` nor `runTenantMigrations()` executes this file.
- It is permanently preserved in the repository for audit history but quarantined from runtime pipelines.
