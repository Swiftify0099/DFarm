# DFarm — Tenant Database Schema (`dfarm_tenant_<code_hash>`)

**Document ID:** DFARM-ARCH-003  
**Version:** 1.0.0  
**Phase:** Prompt 01 Baseline Implementation  
**Status:** APPROVED ARCHITECTURAL SPECIFICATION

---

## 1. Role and Boundaries of Tenant Operational Databases

Every dairy organization receives its own independent PostgreSQL database.
All daily operational transactions, biometric templates, farmer directories, billing, payroll, and audit trails reside strictly inside that tenant's dedicated database.

---

## 2. Mandatory Verification Table: `tenant_metadata`

Every provisioned tenant database contains a `tenant_metadata` table asserting database ownership:

```sql
CREATE TABLE tenant_metadata (
    dairy_id UUID PRIMARY KEY,
    dairy_code VARCHAR(30) NOT NULL,
    dairy_name VARCHAR(150) NOT NULL,
    database_name VARCHAR(100) NOT NULL,
    schema_version VARCHAR(50) NOT NULL,
    provisioned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

During tenant health verification and startup, the backend queries `tenant_metadata` and asserts that `dairy_id` matches the routing token claims.

---

## 3. Operational Domain Tables

### 3.1 Farmer & Customer Directory
- **`customers`:** Primary producer identity (`id`, `organization_id`, `primary_center_id`, `farmer_code`, `full_name`, `normalized_mobile_number`, `status`, `registration_status`).
- **`customer_addresses`:** Geographical address and village mapping.
- **`customer_milk_categories`:** Authorized milk categories (`COW`, `BUFFALO`).
- **`face_enrollments`:** AES-256-GCM encrypted 128-dimensional facial embeddings (`sface_int8_2021dec` / `yunet_v1`).
- **`rfid_cards` / `rfid_card_assignments`:** Active RFID tags issued to farmers.

### 3.2 Collection & Milk Intake
- **`dairy_centers`:** Physical milk collection centers / booths.
- **`kiosk_shift_sessions`:** Morning / Evening collection sessions (`code`, `center_id`, `status`, `started_at`, `closed_at`).
- **`milk_collection_transactions`:** Real-time milk intake entries (`weight_kg`, `fat_percentage`, `snf_percentage`, `rate_per_kg`, `total_amount`, `idempotency_key`).
- **`milk_rate_charts` / `milk_rate_slabs`:** Matrix-based dynamic rate grids with formula fallbacks.

### 3.3 Financial Accounting & Double-Entry Ledger
- **`customer_ledger_accounts`:** Balance summary and credit limits (`current_balance`, `currency`).
- **`customer_ledger_entries`:** Append-only double-entry financial journal (`entry_type`, `amount`, `balance_after`, `reference_id`, `created_at`).
- **`monthly_billing_cycles` / `customer_bills`:** Automated settlement runs.
- **`customer_payout_batches` / `customer_payouts`:** Maker-checker payment disbursements.

### 3.4 Feed Inventory & Store Sales
- **`feed_inventory_items`:** Stock items, bag quantities, unit costs.
- **`feed_procurements`:** Vendor stock intake.
- **`feed_sales`:** Direct or credit deduction feed sales to farmers.

### 3.5 Hardware & Sync Telemetry
- **`devices`:** Registered milk analyzers, weighing scales, kiosk terminals.
- **`sync_journal` / `sync_conflicts`:** Offline kiosk synchronization journal with conflict resolution vectors.

### 3.6 Tenant Audit Trail
- **`dairy_audit_logs`:** Tamper-evident ledger of all admin and operator actions within the dairy.
