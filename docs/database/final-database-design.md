# DFarm: Final Database Design Specification
**Phase 03 of 20: Complete Database Design & Data Integrity Architecture**

---

## 1. Executive Summary & Design Scope

This document provides the final, implementation-ready relational database architecture for the **DFarm Smart Dairy Management System**. The database is architected for **PostgreSQL 15+ hosted on Supabase**, designed to scale from a single dairy collection center to a multi-center, multi-tenant enterprise cooperative network.

### Fundamental Principles Enforced
1. **Relational Data Integrity:** Strict primary key, foreign key, unique, and check constraints across all 15 operational business domains.
2. **Canonical Customer Identity:** A single, immutable RFC4122 v4 UUID (`customer_id`) serves as the permanent anchor linking personal KYC, biometric face templates, RFID card assignments, milk intake sessions, double-entry financial ledgers, and billing settlements.
3. **Exact Decimal Monetary Arithmetic:** Zero use of floating-point types (`FLOAT`, `REAL`, `DOUBLE PRECISION`) for financial values, milk composition percentages, weights, or rates. All financial and measurement fields strictly employ PostgreSQL `NUMERIC` with explicit precision and scale.
4. **Offline-First & Master-Authority Synchronization:** Edge collection counters and registration tablets run local SQLite databases with append-only sync journals. The central cloud PostgreSQL database acts as the single authoritative source of truth for customer identity, rates, and active permissions.
5. **Physical Hardware Decoupling:** Hardware integration (serial Fat/SNF analyzers, load-cell weighing scales, hardware RFID controllers) is strictly deferred. The database stores software-level intake contracts, validation flags, and interface telemetry.
6. **Double-Entry Ledger & Structural Payroll Isolation:** Farmer accounts are tracked via an append-only double-entry ledger. Internal dairy employee payroll is physically isolated into separate tables to prevent accounting commingling.
7. **Policy-Driven Privacy & Biometric Erasure:** Facial embedding vectors are encrypted at rest using AES-256 and can be permanently purged independently of historical milk collection and financial ledger records.

---

## 2. Global Database Standards & Conventions

| Standard Dimension | Specification | Rationale |
| :--- | :--- | :--- |
| **Primary Keys** | `UUID DEFAULT gen_random_uuid()` | Enables collision-free distributed generation across offline Android and desktop counter devices without server roundtrips. |
| **Monetary Columns** | `NUMERIC(10,2)` or `NUMERIC(12,2)` | Exact commercial decimal precision; prevents binary floating-point rounding errors. |
| **Composition Readings** | `NUMERIC(3,1)` (e.g. 4.2% Fat) | Standard Indian dairy cooperative precision (increments of 0.1%). |
| **Weight Readings** | `NUMERIC(6,2)` (e.g. 15.40 kg) | Precision up to 9,999.99 kg with 10-gram resolution. |
| **Timestamps** | `TIMESTAMPTZ DEFAULT NOW()` | UTC absolute time with timezone awareness across all distributed nodes. |
| **Timezone Strategy** | Stored in UTC (`TIMESTAMPTZ`); formatted per center's `business_timezone` (default `Asia/Kolkata`). | Eliminates daylight saving and shift calculation ambiguities. |
| **Naming Conventions** | `snake_case` for tables, columns, indexes, functions, and constraints. | Standard PostgreSQL best practice. |
| **Table Classification** | Plural nouns (e.g. `customers`, `milk_collections`, `rate_charts`). | Consistent ORM and relational mapping. |

---

## 3. Structural Domain Breakdown

The DFarm database schema encompasses 15 interrelated functional domains:
1. **Organization & Multi-Center Master:** `organizations`, `dairy_centers`, `center_settings`, `collection_shifts`.
2. **User & Identity Access Management (IAM):** `users`, `user_center_assignments`.
3. **Customer Identity Master:** `customers`, `customer_milk_categories`, `customer_addresses`, `customer_registration_records`, `customer_status_history`, `customer_consent_records`.
4. **Biometric Face Enrollment:** `face_model_versions`, `face_enrollments`, `biometric_retention_records`.
5. **RFID Card Management:** `rfid_cards`, `rfid_card_assignments`.
6. **Customer Identification Audit:** `identification_audit_logs`, `supervisor_verification_records`.
7. **Milk Intake & Collection Sessions:** `collection_sessions`, `collection_quality_readings`, `collection_weight_readings`, `milk_collections`, `collection_receipts`, `collection_adjustments`, `collection_reversals`.
8. **Milk Rate Management:** `rate_charts`, `rate_chart_versions`, `rate_chart_cells`, `rate_applicability_rules`.
9. **Farmer Financial Ledger:** `customer_ledger_accounts`, `ledger_transactions`, `ledger_entries`, `customer_advances`, `customer_deductions`, `customer_adjustments`.
10. **Periodic Billing & Statements:** `billing_periods`, `monthly_bills`, `monthly_bill_items`, `monthly_bill_adjustments`, `bill_finalization_records`.
11. **Customer Payments & Settlements:** `payment_batches`, `payment_batch_items`, `customer_payments`, `payment_reconciliation_records`, `payment_adjustments`.
12. **Cattle Feed & Store Inventory:** `feed_categories`, `feed_products`, `suppliers`, `feed_purchases`, `inventory_transactions`, `feed_sales`, `feed_sale_items`, `stock_adjustments`.
13. **Employee Master & Independent Payroll:** `employees`, `employee_roles`, `employee_center_assignments`, `employee_attendance`, `salary_structures`, `payroll_runs`, `payroll_items`, `employee_advances`, `employee_expenses`, `employee_payment_records`.
14. **Edge Device & Offline Synchronization:** `devices`, `device_sync_state`, `sync_events`, `sync_tombstones`, `sync_conflict_records`.
15. **System Audit & Notifications:** `audit_logs`, `approval_records`, `notification_records`, `notification_delivery_logs`, `whatsapp_customer_mappings`, `whatsapp_messages`.

---

## 4. Phase 04 Executable Implementation & Scope Reconciliation

> [!NOTE]
> In Phase 04, the database design transitioned into **executable PostgreSQL migrations**:
> - **37 Foundational Tables** are implemented in `supabase/migrations/001_...` through `010_...`.
> - **38 Extended Domain Tables** (Monthly Billing, Payments, Feed Store POS, Staff Payroll, WhatsApp integration) are designed and scheduled for implementation in their respective business phases (Phases 10, 14, 15, 16, 19).
> - Refer to [`database-implementation.md`](database-implementation.md) and [`migration-history.md`](migration-history.md) for the active migration manifest.

