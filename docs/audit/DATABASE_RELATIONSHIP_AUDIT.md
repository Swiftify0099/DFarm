# DFarm Database Relationship & Integrity Audit

## 1. Executive Summary

This audit evaluates the database architecture of DFarm, covering all 32 SQL migrations in `supabase/migrations/`, relational constraints, foreign keys, cascading deletion behaviors, double-entry financial ledger invariants, index coverage, and migration sequencing integrity.

### Critical Findings:
1. **Migration Naming & Execution Collision**: Two separate migrations share prefix `031`:
   - `supabase/migrations/031_dairy_database_mappings.sql`
   - `supabase/migrations/031_remove_dairy_admin_7507495615.sql`
   In automated migration runners (e.g. Flyway, Goose, Supabase CLI), this collision causes non-deterministic execution order or runner halts.
2. **Schema Terminology Duality (`organizations` vs `dairies`)**: Migrations 001 through 027 model tenants as `organizations` and branches as `dairy_centers`. Backend TypeScript services refer interchangeably to `dairies`, `tenants`, `centers`, and `organizations`.
3. **Double-Entry Ledger Immutability Rigor**: Migration `019_customer_accounting_and_double_entry_ledger.sql` successfully implements strict immutability via `trigger_enforce_ledger_immutability()` (`BEFORE UPDATE OR DELETE ON ledger_transactions`). However, the in-memory `pg-mem` mock database used in development fails to enforce PL/pgSQL triggers.
4. **Missing Compound Indexes for High-Frequency Operational Queries**: Collection shift journals and farmer passbooks lack compound indexes, forcing sequential table scans as transaction history scales.

---

## 2. Migration Registry & Sequence Analysis

The platform maintains 32 migration files under `supabase/migrations/`:

| Migration File | Primary Responsibility | Key Tables Created / Modified | Integrity Assessment |
| :--- | :--- | :--- | :--- |
| `001_extensions_and_common.sql` | Core PostgreSQL extensions (`uuid-ossp`, `pgcrypto`), common triggers | `extensions`, `trigger_set_updated_at()` | Clean. Enables UUIDv4 and updated_at triggers. |
| `002_organizations_and_centers.sql` | Tenant organization and branch center hierarchy | `organizations`, `dairy_centers` | Clean FK constraints; unique code per org. |
| `003_user_identity_foundation.sql` | Staff, operator, and dairy admin user credentials | `users`, `user_roles`, `user_sessions` | Password hashes and role enums. |
| `004_customer_identity.sql` | Farmer profiles, address, village, bank details | `customers`, `customer_bank_details` | Bank IFSC and account validation triggers. |
| `005_face_and_rfid.sql` | Biometric embedding storage and RFID card registry | `customer_face_embeddings`, `rfid_cards` | Stores 128D vectors. Missing vector index (HNSW/pgvector). |
| `006_customer_identification_audit.sql` | Biometric/RFID match logs at collection kiosk | `customer_identification_logs` | Audit trail for kiosk check-ins. |
| `007_rate_management.sql` | Milk rate charts (Buffalo/Cow FAT/SNF matrices) | `rate_charts`, `rate_chart_cells` | Rate matrices linked to centers and validity windows. |
| `008_collection_sessions_and_transactions.sql` | Milk intake sessions and intake journal entries | `collection_sessions`, `milk_collections` | Granular session state machine. |
| `009_customer_ledger.sql` | Initial single-entry customer ledger (v1) | `customer_ledger_entries` | Replaced by double-entry in migration 019. |
| `010_devices_sync_and_audit.sql` | Analyzer, scale, and kiosk device registry | `devices`, `device_telemetry`, `sync_queue` | Hardware serial IDs and sync tracking. |
| `011_customer_lifecycle_and_auth_mapping.sql` | Customer approval status, OTP mappings | `customers` (lifecycle columns), `customer_auth` | Adds `PENDING_APPROVAL`, `REJECTED`, `ACTIVE`. |
| `012_sync_engine_enhancements.sql` | Offline-first sync journal and conflict resolution | `sync_journal`, `sync_conflicts` | Client-to-server sync log with Lamport timestamps. |
| `013_face_model_version_metadata.sql` | Model tracking (YuNet v1.0.0, SFace INT8) | `face_model_metadata` | Tracks model checksums and embedding dimensions. |
| `014_feed_inventory_procurement_and_sales.sql` | Cattle feed warehouse, inventory batches, sales | `feed_products`, `feed_inventory`, `feed_sales` | Tracks stock balance and customer credit purchases. |
| `015_p05_p10_master_remediation.sql` | Schema synchronization and constraint hardening | Multiple tables | Remediation patch for missing constraints. |
| `016_employee_management_attendance_and_payroll.sql`| Dairy staff payroll, advances, and daily attendance| `employees`, `attendance_logs`, `payroll_runs` | Internal dairy staff operational management. |
| `017_milk_collection_workflow_and_atomic_ledger.sql`| Stored procedures for atomic collection & ledger | `create_milk_collection_session()` | Atomic procedure for intake + ledger posting. |
| `018_milk_rate_management_system.sql` | Dynamic slab adjustments and quality incentives | `rate_incentive_slabs`, `rate_deductions` | Fine-grained FAT/SNF rate recalculation logic. |
| `019_customer_accounting_and_double_entry_ledger.sql`| Formal double-entry ledger engine & immutability | `ledger_transactions`, `ledger_entries`, `advances`| Strict immutability triggers, double-entry balancing. |
| `020_automated_monthly_billing_and_settlements.sql` | Billing cycle generation, summary statements | `billing_cycles`, `customer_bills` | 10-day / 15-day / 30-day settlement cycles. |
| `021_customer_payouts_batches_and_reconciliation.sql`| Payout batches, SBI NEFT export, UTR match | `customer_payouts`, `payment_batches`, `reconciliations` | Bank payout batching, maker-checker states. |
| `022_customer_notifications.sql` | Notification templates and outbox | `notification_templates`, `notification_logs` | SMS, WhatsApp, and Push dispatch tracking. |
| `023_notification_engine_push_and_whatsapp_automation.sql`| Automated triggers for collection and billing alerts | Notification trigger functions | Pl/pgSQL triggers for SMS upon milk collection. |
| `024_p11_p15_master_remediation.sql` | Cumulative constraint fixes | Multiple tables | Reconciliation of constraints across modules. |
| `025_payout_api_contract_and_privilege_hardening.sql`| Payout status constraints, maker-checker checks | `customer_payouts` constraints | Enforces approval requirements for payout dispatch. |
| `026_harmonize_eligible_payout_balance.sql` | Stored procedure to compute eligible payout balances | `compute_eligible_payout_balance()` | Deducts active advances and feed debt from balance. |
| `027_kiosk_shift_sessions_and_sface128_seed.sql` | Shift session presets and test vector embeddings | Seed data | Populates canonical 128D test fixtures. |
| `028_dairy_location_coordinates_and_address.sql` | Geo coordinates (lat/lng), address verification | `dairy_centers` (latitude, longitude, pin) | Added geofencing support for customer discovery. |
| `029_dairy_admin_activation_tokens.sql` | Dairy Admin invite tokens, email/OTP verification | `dairy_admin_activation_tokens` | Secure token hashes for onboarding activation. |
| `030_super_admin_pankaj_popat_yewale.sql` | Super Admin root account provisioning | Seed SQL for root Super Admin | Master account creation. |
| `031_dairy_database_mappings.sql` | Central control plane tenant database registry | `dairy_database_mappings` | Maps `dairy_id` to isolated database credentials. |
| `031_remove_dairy_admin_7507495615.sql` | Hardcoded cleanup script for specific phone number | Data mutation script | **Collision on 031**: Deletes user and org for test phone. |

---

## 3. Relational Constraints & Cascade Rule Audit

### 3.1 Financial Referential Integrity (`ON DELETE RESTRICT`)

The database demonstrates good practices in protecting financial and collection tables against accidental or cascading deletion:

```sql
-- Migration 021: customer_payouts
organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
approved_by UUID REFERENCES users(id) ON DELETE RESTRICT

-- Migration 019: customer_advances
approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
rejected_by UUID REFERENCES users(id) ON DELETE RESTRICT
```

**Evaluation**:
- **Positive**: Deleting a user or customer with active payout or ledger history is strictly blocked by the database engine.
- **Risk**: Deleting or archiving inactive staff accounts will fail unless soft-deletion (`is_deleted`, `status = 'INACTIVE'`) is strictly used across all tables.

### 3.2 Cascading Deletion Hazards (`ON DELETE CASCADE`)

In `supabase/migrations/031_dairy_database_mappings.sql`:
```sql
CREATE TABLE IF NOT EXISTS dairy_database_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dairy_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    ...
);
```
- **Hazard**: If a Super Admin deletes an `organization` record in the central control plane, the mapping to its physical database is immediately deleted without verifying whether the external PostgreSQL database still contains active farmer balances or collection records.
- **Remediation**: Change `ON DELETE CASCADE` to `ON DELETE RESTRICT`. A tenant organization record must never be deleted while an active operational database mapping exists.

---

## 4. Double-Entry Ledger Invariants & Audit Trail

### 4.1 Invariant Architecture

Migration `019_customer_accounting_and_double_entry_ledger.sql` establishes a double-entry ledger:
1. **Master Transaction (`ledger_transactions`)**: Records the business event (Milk Intake, Feed Sale, Advance, Settlement Payout), customer ID, amount, and running balance.
2. **Double-Entry Breakdown (`ledger_entries`)**: Every master transaction must have at least two balancing entries:
   - Debit Account (`account_type`, `amount`)
   - Credit Account (`account_type`, `amount`)
3. **Double-Entry Invariant**: $\sum \text{Debits} = \sum \text{Credits}$ across each `transaction_id`.

### 4.2 Immutability Enforcement

```sql
CREATE OR REPLACE FUNCTION public.trigger_enforce_ledger_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'CANNOT_MUTATE_LEDGER: Finalized ledger transactions are strictly immutable and cannot be updated.'
            USING ERRCODE = '22000';
    ELSIF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'CANNOT_DELETE_LEDGER: Finalized ledger transactions are strictly immutable and cannot be deleted.'
            USING ERRCODE = '22000';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
```

#### Evaluation:
- **Strengths**: Fully immutable at the database engine level. Erroneous transactions can only be corrected through compensating reversal transactions (`COLLECTION_REVERSAL_DEBIT`, `PAYOUT_REVERSAL_CREDIT`).
- **Defects in Application Layer**:
  - The in-memory development database (`pg-mem`) does not execute PL/pgSQL triggers by default unless explicitly compiled, meaning unit tests running in `pg-mem` do not verify this protection.
  - The legacy backend router (`services/backend/src/modules/ledger/ledger.service.ts`) does not insert into `ledger_entries` (the double-entry breakdown table), inserting only into `ledger_transactions`. This creates an unbalanced chart of accounts.

---

## 5. Indexing & Query Performance Analysis

### 5.1 Existing Index Coverage
- `idx_dairy_db_mappings_dairy_id` on `dairy_database_mappings(dairy_id)`: **Present**
- `idx_customers_org_code` on `customers(organization_id, customer_code)`: **Present**
- `uq_ledger_idempotency_key` on `ledger_transactions(idempotency_key)`: **Present**

### 5.2 Critical Missing Indexes

| Table | Missing Index Specification | Affected Query / Screen | Performance Risk |
| :--- | :--- | :--- | :--- |
| `milk_collections` | `CREATE INDEX idx_milk_col_center_date ON milk_collections(center_id, collection_date DESC, shift_type);` | Collection Shift Journal, Dairy Dashboard daily volume calculations. | Sequential scan across millions of collection records during morning/evening shifts. |
| `ledger_transactions` | `CREATE INDEX idx_ledger_cust_date ON ledger_transactions(customer_id, transaction_date DESC);` | Farmer App Passbook, Dairy Admin Customer Ledger view. | Latency spikes on farmer ledger loads. |
| `collection_sessions` | `CREATE INDEX idx_coll_sessions_active ON collection_sessions(center_id) WHERE session_state IN ('OPEN', 'IN_PROGRESS');` | Kiosk Shift Open / Status verification (`F3`). | Multiple kiosk terminals polling open session status concurrently. |
| `customer_face_embeddings` | `CREATE INDEX idx_face_cust ON customer_face_embeddings(customer_id, is_active);` | Kiosk face recognition matching lookup. | Full table scan of biometric vectors during customer check-in. |

---

## 6. Actionable Database Remediation Plan

1. **Resolve Migration Sequence Collision**:
   - Rename `supabase/migrations/031_remove_dairy_admin_7507495615.sql` to `supabase/migrations/032_remove_dairy_admin_7507495615.sql`.
   - Update any internal migration ledger scripts.
2. **Switch Cascade to Restrict on Database Mappings**:
   - Alter `dairy_database_mappings.dairy_id` to `ON DELETE RESTRICT`.
3. **Synchronize Backend Ledger Service with Migration 019**:
   - Refactor `LedgerService.ts` to ensure that every `ledger_transaction` insertion is wrapped in a database transaction that simultaneously writes the matching debit and credit rows to `ledger_entries`.
4. **Deploy Missing Indexes Migration**:
   - Author a new migration `033_performance_indexes.sql` creating compound and partial indexes for collections, sessions, and ledgers.
