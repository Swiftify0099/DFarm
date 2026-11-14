# DFarm Collection Database Schema & Transaction Processing

## 1. Overview
DFarm manages milk collection intake data through a set of PostgreSQL relational tables designed with strict constraints, foreign keys, and indexes. All state transitions, intake insertions, and ledger postings are managed via PostgreSQL stored procedures in `supabase/migrations/012_milk_collection_workflow_and_atomic_ledger.sql`.

---

## 2. Table Schemas & Relationships

### 2.1 `collection_sessions`
Tracks the lifecycle of an individual milk intake interaction from customer identification to completion.
- `id` (UUID PK): Unique session identifier.
- `center_id` (UUID FK -> `dairy_centers.id`): Collection center.
- `customer_id` (UUID FK -> `customers.id`): Registered farmer.
- `business_date` (DATE): Operating collection date.
- `shift_id` (UUID FK -> `collection_shifts.id`): Active shift.
- `shift_type` (VARCHAR): `MORNING` | `EVENING`.
- `selected_milk_category` (VARCHAR): `COW` | `BUFFALO`.
- `identification_method` (VARCHAR): `FACE` | `RFID` | `SUPERVISOR_MANUAL`.
- `identification_log_id` (UUID FK -> `identification_audit_logs.id`): Biometric / manual verification audit trail.
- `session_state` (VARCHAR): Checked against 11 granular states (`OPEN`, `IN_PROGRESS`, `WAITING_FOR_MEASUREMENTS`, `MEASUREMENTS_RECEIVED`, `VALIDATING`, `READY_FOR_REVIEW`, `COMMITTING`, `COMPLETED`, `INCOMPLETE`, `FAILED`, `CANCELLED`).
- `intake_sequence_uuid` (UUID NOT NULL): Unique intake delivery sequence.
- `started_at` (TIMESTAMPTZ): Start timestamp.
- `completed_at` (TIMESTAMPTZ): Completion timestamp.
- `operator_id` (UUID FK -> `users.id`): Authenticated counter operator.
- `device_id` (VARCHAR(100)): Identifier of the collection tablet or terminal.

---

### 2.2 `collection_quality_readings`
Stores fat and SNF measurements associated with a session.
- `id` (UUID PK): Reading identifier.
- `session_id` (UUID FK -> `collection_sessions.id`).
- `fat_percentage` (NUMERIC(3,1)): 1.5% to 15.0%.
- `snf_percentage` (NUMERIC(3,1)): 5.0% to 13.0%.
- `density_clr` (NUMERIC(4,1) NULL): Corrected Lactometer Reading.
- `validation_status` (VARCHAR): `VALID` | `OUT_OF_BOUNDS_OVERRIDDEN` | `SUSPICIOUS`.
- `reading_source` (VARCHAR): `MANUAL_ENTRY` | `SOFTWARE_SIMULATOR` | `HARDWARE_INTERFACE`.
- `recorded_at` (TIMESTAMPTZ).

---

### 2.3 `collection_weight_readings`
Stores gross, tare, and net weights.
- `id` (UUID PK): Reading identifier.
- `session_id` (UUID FK -> `collection_sessions.id`).
- `gross_weight` (NUMERIC(8,2) NULL): Total weight in KG.
- `tare_weight` (NUMERIC(8,2) NULL): Container tare weight in KG.
- `net_weight` (NUMERIC(8,2)): Validated net milk weight in KG ($> 0$).
- `measurement_unit` (VARCHAR): Defaults to `KG`. Liter conversion is not performed silently.
- `reading_source` (VARCHAR): `MANUAL_ENTRY` | `SOFTWARE_SIMULATOR` | `HARDWARE_INTERFACE`.
- `recorded_at` (TIMESTAMPTZ).

---

### 2.4 `milk_collections`
The permanent intake record committed upon transaction completion.
- `id` (UUID PK): Collection identifier.
- `session_id` (UUID FK -> `collection_sessions.id`).
- `center_id` (UUID FK -> `dairy_centers.id`).
- `customer_id` (UUID FK -> `customers.id`).
- `business_date` (DATE).
- `shift_type` (VARCHAR): `MORNING` | `EVENING`.
- `milk_category` (VARCHAR): `COW` | `BUFFALO`.
- `net_weight` (NUMERIC(8,2)): Quantity delivered.
- `fat_percentage` (NUMERIC(3,1)): Delivered fat percentage.
- `snf_percentage` (NUMERIC(3,1)): Delivered SNF percentage.
- `rate_chart_version_id` (UUID FK -> `rate_chart_versions.id`): Specific rate chart version applied.
- `applied_rate_per_unit` (NUMERIC(8,2)): Price per KG from rate chart matrix.
- `total_amount` (NUMERIC(10,2)): Net amount credited to farmer.
- `transaction_status` (VARCHAR): `COMPLETED` | `ADJUSTED` | `CANCELLED`.
- `client_intake_uuid` (UUID NOT NULL): Tablet-generated intake reference.
- `idempotency_key` (VARCHAR(100) UNIQUE): Prevents duplicate transaction commits.
- `created_at` (TIMESTAMPTZ).
- `synced_at` (TIMESTAMPTZ).

---

### 2.5 `collection_receipts`
Thermal slip generation and cryptographic verification.
- `id` (UUID PK): Receipt record.
- `collection_id` (UUID FK -> `milk_collections.id`).
- `receipt_number` (VARCHAR(50) UNIQUE): Human-readable receipt sequence.
- `raw_receipt_text` (TEXT): 40-column monospace ASCII slip.
- `sha256_hash` (VARCHAR(64)): Cryptographic digest over receipt payload.
- `created_at` (TIMESTAMPTZ).

---

## 3. Stored Procedure Architecture

### `public.create_milk_collection_session(...)`
1. Verifies dairy center exists and status is `ACTIVE`.
2. Verifies customer exists, is not soft-deleted, and status is `ACTIVE`.
3. Verifies customer organization matches center organization.
4. Verifies customer primary center matches collection center (`CENTER_MISMATCH` check).
5. Verifies milk category authorization in `customer_milk_categories`.
6. Checks for concurrent active unfinished sessions for the customer.
7. Inserts row into `collection_sessions` with state `'OPEN'`.

### `public.complete_milk_collection_session(...)`
1. Validates session state is in `('MEASUREMENTS_RECEIVED', 'VALIDATING', 'READY_FOR_REVIEW', 'OPEN')`.
2. Checks idempotency key: if previously committed, returns existing record with status `'IDEMPOTENT_REPLAY'`.
3. Validates positive weight and biological fat/SNF boundaries.
4. Resolves applicable active rate chart version for organization, center, and category.
5. Queries `rate_chart_cells` for exact matching fat and SNF rate per unit. If not found, raises controlled exception `'P0002'` (`RATE_CELL_NOT_FOUND`).
6. Computes server-authoritative line amount: $\text{Quantity} \times \text{Rate}$.
7. Inserts `milk_collections` intake row.
8. Credits customer subledger `customer_ledger_accounts` by updating `current_balance`.
9. Logs `ledger_transactions` with `direction = 'CREDIT'` and `transaction_type = 'MILK_COLLECTION_CREDIT'`.
10. Writes balanced double-entry lines into `ledger_entries` (`CUSTOMER_PAYABLE` CREDIT, `MILK_PURCHASE_EXPENSE` DEBIT).
11. Generates 40-column thermal slip and SHA-256 hash in `collection_receipts`.
12. Updates `collection_sessions` state to `'COMPLETED'` with `completed_at = NOW()`.
13. Returns composite JSONB payload with collection, subledger, and receipt data.

### `public.adjust_milk_collection(...)`
1. Verifies supervisor authorization.
2. Marks target collection as `'ADJUSTED'`.
3. Calculates adjustment difference.
4. Posts debit entry to customer subledger to offset balance.
5. Writes audit trail with reason and supervisor UUID.
