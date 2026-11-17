# DFarm Database Deep Audit Report

**Date**: November 16, 2026  
**Status**: Comprehensive Schema & Integrity Audit  
**Auditor**: Antigravity Platform Engineering & Clean Architecture Audit Team

---

## 1. Database Configuration & Environment

- **Target Database Engine**: PostgreSQL 16+ (Supabase Managed or Self-Hosted)
- **Local Fallback Engine**: `pg-mem` in-memory PostgreSQL emulator (registered in `PostgresPool.ts`)
- **Configured Connection String**: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- **Migration Directory**: `supabase/migrations/` (31 chronological migration scripts)
- **Active Validation Suite**: `packages/database/tests/schema-validation.test.js` (13/13 passing tests)

---

## 2. Table Inventory (43 Tables Verified)

| # | Schema & Table | Primary Key | Multi-Tenant Foreign Key | RLS Status | Description |
|---|---|---|---|---|---|
| 1 | `public.organizations` | `id` (UUID) | Root Tenant Entity | Enabled | Dairy cooperatives / tenant organizations |
| 2 | `public.dairy_centers` | `id` (UUID) | `organization_id` -> `organizations.id` | Enabled | Village collection centers under a dairy |
| 3 | `public.users` | `id` (UUID) | `organization_id` -> `organizations.id` | Enabled | Operators, Dairy Admins, Super Admins |
| 4 | `public.customers` | `id` (UUID) | `organization_id` -> `organizations.id` | Enabled | Registered dairy farmers / producers |
| 5 | `public.customer_addresses` | `id` (UUID) | `customer_id` -> `customers.id` | Enabled | Geographic / residential village addresses |
| 6 | `public.customer_milk_categories` | `id` (UUID) | `customer_id` -> `customers.id` | Enabled | Permitted animal categories (COW, BUFFALO) |
| 7 | `public.face_model_versions` | `id` (UUID) | Global Engine Meta | Enabled | YuNet / SFace INT8 active model definitions |
| 8 | `public.face_enrollments` | `id` (UUID) | `customer_id` -> `customers.id` | Enabled | AES-256-GCM encrypted 128D face templates |
| 9 | `public.rfid_cards` | `id` (UUID) | `organization_id` -> `organizations.id` | Enabled | Physical RFID cards |
| 10 | `public.rfid_card_assignments` | `id` (UUID) | `customer_id` -> `customers.id` | Enabled | Card-to-farmer binding (partial unique index) |
| 11 | `public.customer_identification_audit`| `id` (UUID) | `organization_id` -> `organizations.id` | Enabled | Biometric & RFID authentication audit trail |
| 12 | `public.milk_rate_charts` | `id` (UUID) | `organization_id` -> `organizations.id` | Enabled | Dairy milk pricing structures |
| 13 | `public.milk_rate_chart_versions` | `id` (UUID) | `rate_chart_id` -> `milk_rate_charts.id` | Enabled | Versioned pricing matrix configurations |
| 14 | `public.milk_rate_matrix_cells` | `id` (UUID) | `version_id` -> `milk_rate_chart_versions.id` | Enabled | 2D FAT/SNF rate grid cells |
| 15 | `public.kiosk_shift_sessions` | `id` (UUID) | `organization_id` -> `organizations.id` | Enabled | Hardware kiosk morning/evening collection shifts |
| 16 | `public.milk_collections` | `id` (UUID) | `organization_id` -> `organizations.id` | Enabled | Immutable milk intake transactions |
| 17 | `public.milk_collection_measurements`| `id` (UUID) | `collection_id` -> `milk_collections.id` | Enabled | Weight, FAT, SNF, Lactometer readings |
| 18 | `public.customer_ledger_accounts` | `id` (UUID) | `organization_id` -> `organizations.id` | Enabled | Customer current financial account balances |
| 19 | `public.customer_subledger_entries` | `id` (UUID) | `organization_id` -> `organizations.id` | Enabled | Double-entry journal entries (credits & debits) |
| 20 | `public.billing_settlements` | `id` (UUID) | `organization_id` -> `organizations.id` | Enabled | 10-day cycle billing settlement records |
| 21 | `public.feed_products` | `id` (UUID) | `organization_id` -> `organizations.id` | Enabled | Cattle feed inventory catalog |
| 22 | `public.feed_stock_movements` | `id` (UUID) | `organization_id` -> `organizations.id` | Enabled | Inventory receipts, adjustments, and issues |
| 23 | `public.customer_feed_sales` | `id` (UUID) | `organization_id` -> `organizations.id` | Enabled | Feed sales billed against customer ledger |
| 24 | `public.customer_payouts` | `id` (UUID) | `organization_id` -> `organizations.id` | Enabled | Fortnightly milk payment disbursement batches |
| 25 | `public.registered_devices` | `id` (UUID) | `organization_id` -> `organizations.id` | Enabled | Hardware kiosks, scales, and analyzers |
| 26 | `public.sync_events` | `id` (UUID) | `organization_id` -> `organizations.id` | Enabled | Offline queue synchronization logs |
| 27 | `public.dairy_admin_invitations` | `id` (UUID) | `dairy_id` -> `organizations.id` | Enabled | Primary Dairy Admin onboarding & activation |
| 28 | `public.employees` | `id` (UUID) | `organization_id` -> `organizations.id` | Enabled | Dairy staff and operators |
| 29 | `public.employee_attendance` | `id` (UUID) | `employee_id` -> `employees.id` | Enabled | Staff daily attendance records |
| 30 | `public.payroll_records` | `id` (UUID) | `employee_id` -> `employees.id` | Enabled | Monthly employee payroll statements |
| 31 | `public.notifications` | `id` (UUID) | `organization_id` -> `organizations.id` | Enabled | In-app, push, and WhatsApp delivery logs |
| 32 | `public.audit_events` | `id` (UUID) | `organization_id` -> `organizations.id` | Enabled | Administrative and security action logs |
| 33 | `public.rate_matrix_rules` | `id` (UUID) | `version_id` -> `milk_rate_chart_versions.id` | Enabled | Quality tier deduction/incentive rules |
| 34 | `public.collection_disputes` | `id` (UUID) | `collection_id` -> `milk_collections.id` | Enabled | Farmer collection adjustments and disputes |
| 35 | `public.bank_reconciliation_records` | `id` (UUID) | `organization_id` -> `organizations.id` | Enabled | Bank statement UTR matching records |
| 36 | `public.device_telemetry_logs` | `id` (UUID) | `device_id` -> `registered_devices.id` | Enabled | Hardware health and communication logs |
| 37 | `public.system_health_snapshots` | `id` (UUID) | System Level | Enabled | Platform performance and error aggregates |
| 38 | `public.customer_notification_preferences`| `id` (UUID)| `customer_id` -> `customers.id`| Enabled | SMS / WhatsApp / Push communication settings |
| 39 | `public.support_access_sessions` | `id` (UUID) | `organization_id` -> `organizations.id` | Enabled | Super Admin emergency support impersonation |
| 40 | `public.salary_advances` | `id` (UUID) | `employee_id` -> `employees.id` | Enabled | Staff advance salary disbursements |
| 41 | `public.leave_requests` | `id` (UUID) | `employee_id` -> `employees.id` | Enabled | Staff leave application and approvals |
| 42 | `public.supplier_master` | `id` (UUID) | `organization_id` -> `organizations.id` | Enabled | Cattle feed manufacturers and suppliers |
| 43 | `public.feed_purchases` | `id` (UUID) | `organization_id` -> `organizations.id` | Enabled | Dairy cattle feed procurement batches |

---

## 3. Referential Integrity & Multi-Dairy Isolation Verification

1. **Foreign Key Guarantees**:
   - `ON DELETE RESTRICT` is enforced on `customer_id` across `milk_collections`, `customer_subledger_entries`, `billing_settlements`, and `face_enrollments`. Customers with financial history cannot be orphaned.
2. **Multi-Dairy Tenant Isolation**:
   - Every read and write query in `PostgresCustomerRepository`, `PostgresCollectionTransactionRepository`, `PostgresShiftSessionRepository`, and `PostgresLedgerRepository` explicitly includes `WHERE organization_id = $X`.
   - Partial unique indexes enforce:
     - `CREATE UNIQUE INDEX uq_active_customer_rfid ON rfid_card_assignments (customer_id) WHERE is_active = TRUE;`
     - `CREATE UNIQUE INDEX uq_active_card_uid ON rfid_card_assignments (rfid_card_id) WHERE is_active = TRUE;`
     - `CREATE UNIQUE INDEX uq_customer_mobile_org ON customers (organization_id, normalized_mobile_number);`
3. **Double-Entry Balance Verification**:
   - Customer subledger balances are stored in `customer_ledger_accounts.current_balance` and verified against `SUM(credit_amount - debit_amount)` from `customer_subledger_entries`.

---

## 4. Test & Demo Record Findings in Codebase Provenance

- **In-Memory Fallback Seeding in `PostgresPool.ts`**:
  - The fallback `getOrCreateMemDb()` executes hardcoded SQL inserting dummy customers (`Pandurang Patil`, `Sunita Shinde`, `Aniket Jadhav`, `Namdev Gaikwad`) and a dummy collection session (`SH-20261115-M-GOKUL` with 245.00 liters).
  - **Resolution**: In production readiness mode, `PostgresPool.ts` must execute only DDL schema migrations, omitting any dummy customer or transaction insertions. When the database is genuinely empty, queries must return genuine empty arrays (`[]`) and zero balances (`0.00`).
