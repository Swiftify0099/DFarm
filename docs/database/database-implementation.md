# DFarm: Database Implementation & Migration Reference
**Phase 04 of 20: Real Executable PostgreSQL Migrations & Monorepo Engine**

---

## 1. Executive Implementation Summary

In Phase 04, the DFarm project transitioned from pure architectural design into **executable implementation**. The core foundational database schema was authored as 10 sequential, production-grade SQL migrations under `supabase/migrations/`.

### Implemented Architecture Highlights
- **10 Sequential Executable Migrations:** Numbered `001` through `010`, creating **43 foundational relational tables** (audited and verified).
- **Strict Data Types:** Zero floating-point types (`FLOAT`, `REAL`, `DOUBLE PRECISION`) used in monetary, volume, or chemical measurement columns. Strict `NUMERIC` types applied throughout.
- **Canonical Customer UUID:** Single RFC4122 v4 UUID anchor linking customer KYC, biometric templates, RFID cards, intake sessions, and ledger entries.
- **Mobile Uniqueness:** Organization-scoped unique constraint: `UNIQUE (organization_id, normalized_mobile_number)`.
- **Single-Active Credential Invariants:** Partial unique indexes enforced on `rfid_card_assignments` (active card per customer, active customer per card) and `face_enrollments` (active template per customer per model version).
- **Multi-Delivery Shift Support:** Collection schema permits multiple legitimate deliveries per customer per shift (e.g. multiple cans or Cow + Buffalo batches) using distinct session intake UUIDs and idempotency keys without artificial daily unique locks.
- **Idempotency Protection:** Unique `idempotency_key VARCHAR(128) NOT NULL UNIQUE` on `milk_collections` and `ledger_transactions` preventing duplicate financial postings.
- **Security Hardened Auth Helpers:** All Supabase JWT helper functions (`auth.uid()`, `auth.current_org_id()`, `auth.current_center_id()`, `auth.current_user_role()`, `auth.current_customer_id()`) are declared with `SECURITY DEFINER`, fixed immutable `search_path = pg_catalog, public, auth, pg_temp;`, and exception-safe JSON parsing.
- **Row Level Security (RLS):** Enabled on all core tables with tenant isolation, operator center restrictions, farmer self-service access, and biometric protection policies.

---

## 2. Implemented Migration Manifest & Table Inventory

| Migration File | Primary Responsibility | Implemented Tables (43 Total) | Table Count |
| :--- | :--- | :--- | :---: |
| `001_extensions_and_common.sql` | PostgreSQL extensions, updated_at trigger, hardened Supabase JWT auth helper functions | None (Common extensions, schemas, & functions) | 0 |
| `002_organizations_and_centers.sql` | Tenant hierarchy, center configuration, operational shifts | `organizations`, `dairy_centers`, `center_settings`, `collection_shifts` | 4 |
| `003_user_identity_foundation.sql` | User profiles, center access mappings, role constraints | `users`, `user_center_assignments` | 2 |
| `004_customer_identity.sql` | Farmer master, milk categories, addresses, registration audit, consent | `customers`, `customer_milk_categories`, `customer_addresses`, `customer_registration_records`, `customer_status_history`, `customer_consent_records` | 6 |
| `005_face_and_rfid.sql` | Biometric templates, model versioning, RFID inventory, assignments | `face_model_versions`, `face_enrollments`, `biometric_retention_records`, `rfid_cards`, `rfid_card_assignments` | 5 |
| `006_customer_identification_audit.sql` | Identification telemetry, supervisor override audit logs | `identification_audit_logs`, `supervisor_verification_records` | 2 |
| `007_rate_management.sql` | Cow/Buffalo rate charts, versioning, Fat/SNF grid cells, applicability | `rate_charts`, `rate_chart_versions`, `rate_chart_cells`, `rate_applicability_rules` | 4 |
| `008_collection_sessions_and_transactions.sql`| Counter intake sessions, quality, weight, collections, receipts, adjustments, reversals | `collection_sessions`, `collection_quality_readings`, `collection_weight_readings`, `milk_collections`, `collection_receipts`, `collection_adjustments`, `collection_reversals` | 7 |
| `009_customer_ledger.sql` | Customer subledger, transaction journal, balanced entries, advances, deductions, adjustments | `customer_ledger_accounts`, `ledger_transactions`, `ledger_entries`, `customer_advances`, `customer_deductions`, `customer_adjustments` | 6 |
| `010_devices_sync_and_audit.sql` | Registered devices, monotonic sync cursors, tombstones, conflict logs, system audit, approvals, RLS | `devices`, `device_sync_state`, `sync_events`, `sync_tombstones`, `sync_conflict_records`, `audit_logs`, `approval_records` | 7 |
| **TOTALS** | **10 Migration Files** | **43 Implemented Relational Tables** | **43** |

---

## 3. Implemented Tables vs. Deferred Tables Reconciliation

An exhaustive audit of the 75 proposed enterprise entities from `docs/database/final-entity-list.md` reconciles as follows:

- **Foundational Tables Implemented in Phase 04:** **43 Relational Tables**
  - All entities required for multi-center management, staff IAM, customer registration, face enrollment, RFID issuance, identification audit, milk pricing, counter collection intake, customer financial subledger, edge device registration, and offline replication.
- **Domain Tables Deferred to Planned Future Phases:** **32 Relational Tables**
  - **Domain 10: Periodic Billing & Statements (Phase 15):** 5 tables (`billing_cycles`, `customer_bills`, `bill_line_items`, `bill_deductions_applied`, `bill_payment_summaries`).
  - **Domain 11: Customer Payments & Settlements (Phase 15):** 5 tables (`payment_batches`, `customer_disbursements`, `payout_bank_files`, `bank_reconciliation_records`, `cash_disbursement_vouchers`).
  - **Domain 12: Cattle Feed Inventory & POS (Phase 14):** 8 tables (`feed_products`, `feed_suppliers`, `feed_purchase_orders`, `feed_stock_ledger`, `feed_center_inventory`, `feed_sales`, `feed_sale_items`, `feed_sale_returns`).
  - **Domain 13: Employee Master & Isolated Payroll (Phase 16):** 10 tables (`employees`, `employee_departments`, `employee_designations`, `employee_attendance_records`, `employee_leave_requests`, `payroll_periods`, `employee_salary_structures`, `salary_slips`, `salary_components`, `salary_disbursements`).
  - **Domain 15: Communications & Notifications (Phase 19):** 4 tables (`notification_templates`, `notification_logs`, `whatsapp_message_logs`, `sms_gateway_logs`).
- **Total Entities in Enterprise Architecture:** Exactly **75 distinct relational tables** across the 20-phase roadmap ($43 + 32 = 75$).

---

## 4. Ledger Architecture Clarification: Customer Subledger vs General Ledger ERP

The financial ledger implemented in Migration 009 is specifically designed as a **Customer Subledger / Farmer Payable Ledger** rather than a full multi-entity corporate General Ledger ERP:
1. **Target Responsibility:** Accurately tracks the dairy's financial liabilities (Accounts Payable) to individual farmers for milk deliveries, offset by advances, veterinary deductions, and cash disbursements.
2. **Dual-Entry Balanced Journal:** Migration 009 provides `ledger_entries` linked to each `ledger_transactions` header, maintaining double-entry credit/debit splits (`CUSTOMER_PAYABLE`, `MILK_PURCHASE_EXPENSE`, `FEED_INVENTORY`, `CASH_BANK`, `ADVANCE_RECEIVABLE`) with verified $\sum \text{Debits} = \sum \text{Credits}$.
3. **ERP Integration Ready:** By separating the customer subledger from broad general ledger chart of accounts (assets, equity, overhead expenses), DFarm ensures lightning-fast edge counter balance calculations while retaining complete auditability for upstream standard accounting export (e.g. Tally, SAP, or QuickBooks).
