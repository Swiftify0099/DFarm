# DFARM — DATABASE TABLE AND COLUMN INVENTORY
## EXHAUSTIVE FIELD-LEVEL PHYSICAL SCHEMA DICTIONARY

**Audit Reference:** `DFARM-AUDIT-DB-FIELDS-001`  
**Target:** Central (21 Tables) & Tenant (93 Tables)  
**Date:** 2026-11-18  

---

### 1. Central Control Plane Key Column Inventory

#### 1.1 `organizations`
- `id` (UUID, PK) — Unique dairy organization identifier.
- `name` (VARCHAR(150), NOT NULL) — Registered cooperative union business name.
- `code` (VARCHAR(30), NOT NULL, UNIQUE) — Standardized alphanumeric code (e.g. SANGAMNER).
- `registration_number` (VARCHAR(50)) — State cooperative registrar reference.
- `status` (VARCHAR(30), DEFAULT 'ACTIVE') — Operational state ('ACTIVE', 'SUSPENDED', 'ONBOARDING').
- `contact_phone` (VARCHAR(20)) — Primary official contact.
- `created_at` (TIMESTAMPTZ, DEFAULT NOW()).

#### 1.2 `dairy_centers`
- `id` (UUID, PK) — Unique center identifier.
- `organization_id` (UUID, FK -> organizations.id) — Owning dairy union.
- `code` (VARCHAR(30), NOT NULL) — Unique center code within dairy.
- `name` (VARCHAR(150), NOT NULL) — Village chilling center name.
- `village_town` (VARCHAR(100)) — Physical village location.
- `latitude` (DECIMAL(10,8)), `longitude` (DECIMAL(11,8)) — Precise GPS coordinates.
- `status` (VARCHAR(30), DEFAULT 'ACTIVE').

---

### 2. Dairy Tenant Core Operational Column Inventory

#### 2.1 `customers` (Farmer Master Profile)
- `id` (UUID, PK) — Authoritative farmer UUID.
- `customer_code` (VARCHAR(30), NOT NULL, UNIQUE) — Visible patron number (e.g. 'C-101').
- `full_name` (VARCHAR(150), NOT NULL) — Farmer's legal full name.
- `mobile_number` (VARCHAR(20), NOT NULL, UNIQUE) — Direct registered mobile number.
- `status` (VARCHAR(30), DEFAULT 'PENDING') — Lifecycle state ('PENDING', 'ACTIVE', 'SUSPENDED').
- `bank_account_number_encrypted` (TEXT) — AES-256-GCM encrypted bank account.
- `ifsc_code` (VARCHAR(20)) — RBI standard bank branch IFSC code.
- `primary_center_id` (UUID, FK -> dairy_centers.id) — Home milk delivery center.
- `created_at` (TIMESTAMPTZ, DEFAULT NOW()).

#### 2.2 `milk_collections` (Milk Intake Transactions)
- `id` (UUID, PK) — Intake transaction identifier.
- `session_id` (UUID, FK -> collection_sessions.id) — Active kiosk collection session.
- `customer_id` (UUID, FK -> customers.id) — Supplying farmer.
- `customer_code` (VARCHAR(30), NOT NULL) — Denormalized farmer code for kiosk speed.
- `milk_category` (VARCHAR(20), NOT NULL) — 'COW' or 'BUFFALO'.
- `quantity_liters` (NUMERIC(10,3), NOT NULL) — Accurate scale volume reading.
- `fat_percentage` (NUMERIC(4,2), NOT NULL) — Milk analyzer FAT reading.
- `snf_percentage` (NUMERIC(4,2), NOT NULL) — Milk analyzer SNF reading.
- `clr_density` (NUMERIC(4,1)) — Corrected lactometer reading.
- `temperature_celsius` (NUMERIC(4,1)) — Sensor temperature reading.
- `rate_per_liter` (NUMERIC(10,2), NOT NULL) — Resolved matrix price.
- `total_gross_amount` (NUMERIC(12,2), NOT NULL) — quantity_liters * rate_per_liter.
- `identification_method` (VARCHAR(30)) — 'FACE', 'RFID', 'MANUAL_CODE', 'SUPERVISOR'.
- `created_at` (TIMESTAMPTZ, DEFAULT NOW()).

#### 2.3 `customer_ledger_accounts` (Double-Entry Header)
- `id` (UUID, PK) — Account identifier.
- `customer_id` (UUID, NOT NULL, UNIQUE) — Associated farmer.
- `current_balance` (NUMERIC(12,2), DEFAULT 0.00) — Net payable amount (Credit - Debit).
- `total_milk_earnings` (NUMERIC(12,2), DEFAULT 0.00) — Lifetime milk gross.
- `total_feed_deductions` (NUMERIC(12,2), DEFAULT 0.00) — Lifetime feed deductions.
- `total_payouts_settled` (NUMERIC(12,2), DEFAULT 0.00) — Lifetime bank payouts.
- `last_transaction_at` (TIMESTAMPTZ).

#### 2.4 `monthly_bills` (Periodic Farmer Settlement)
- `id` (UUID, PK) — Bill record identifier.
- `cycle_id` (UUID, FK -> billing_periods.id) — Associated billing cycle.
- `customer_id` (UUID, FK -> customers.id) — Billed farmer.
- `gross_milk_amount` (NUMERIC(12,2), NOT NULL) — Sum of intake transactions.
- `feed_deduction_amount` (NUMERIC(12,2), NOT NULL) — Store credit deductions.
- `advance_recovery_amount` (NUMERIC(12,2), NOT NULL) — Cash advance deductions.
- `net_payable_amount` (NUMERIC(12,2), NOT NULL) — gross - feed - advances.
- `status` (VARCHAR(30), DEFAULT 'DRAFT') — 'DRAFT', 'FINALIZED', 'PAID'.
- `finalized_at` (TIMESTAMPTZ) — Immutable lock timestamp.
