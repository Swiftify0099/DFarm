# DFarm: Constraints, Check Rules & Indexing Architecture
**Phase 03 of 20: Performance, Data Integrity & Optimization Strategy**

---

## 1. Relational Constraints & Check Rules

### 1.1 Unique Constraints & Business Invariants
To prevent duplicate records, identity collisions, and race conditions, the following unique constraints are defined:

| Target Table | Constraint Name | Key Fields | Business Invariant Enforced |
| :--- | :--- | :--- | :--- |
| `organizations` | `uq_org_code` | `(code)` | Unique organization code across the entire system. |
| `dairy_centers` | `uq_dairy_center_code_per_org` | `(organization_id, code)` | Unique center code within an organization. |
| `customers` | `uq_customer_mobile_per_org` | `(organization_id, normalized_mobile_number)` | A farmer's normalized phone number cannot be registered twice in the same organization. |
| `customers` | `uq_customer_code_per_center` | `(primary_center_id, farmer_code)` | Unique human-readable slip number per collection center. |
| `customer_milk_categories` | `uq_customer_milk_category` | `(customer_id, milk_category)` | Prevents duplicate authorization rows for the same species. |
| `rfid_cards` | `uq_rfid_card_uid_per_org` | `(organization_id, card_uid)` | A physical RFID card UID cannot be registered twice in an organization. |
| `rate_chart_versions` | `uq_rate_chart_version` | `(rate_chart_id, version_number)` | Monotonically versioned pricing revisions. |
| `rate_chart_cells` | `uq_rate_chart_cell` | `(rate_chart_version_id, fat_percentage, snf_percentage)` | Exactly one rate per Fat/SNF grid coordinate. |
| `milk_collections` | `uq_collection_idempotency_key` | `(idempotency_key)` | Complete duplicate prevention against network retry pushes. |
| `milk_collections` | `uq_collection_session` | `(session_id)` | Enforces strict 1-to-1 finalization between session and collection. |
| `collection_receipts` | `uq_collection_receipt_number` | `(receipt_number)` | Unique printed thermal slip voucher number. |
| `ledger_transactions` | `uq_ledger_idempotency_key` | `(idempotency_key)` | Guarantees atomic ledger posting cannot be double-credited. |
| `billing_periods` | `uq_center_billing_period` | `(center_id, start_date, end_date)` | Prevents overlapping settlement cycle headers. |
| `monthly_bills` | `uq_customer_bill_per_period` | `(customer_id, billing_period_id)` | Exactly one monthly bill per farmer per cycle. |
| `monthly_bills` | `uq_monthly_bill_number` | `(bill_number)` | Immutable invoice reference number. |
| `feed_products` | `uq_feed_sku_per_org` | `(organization_id, sku)` | Unique cattle feed warehouse SKU within an organization. |
| `employees` | `uq_employee_code` | `(organization_id, employee_code)` | Unique staff employee code. |
| `payroll_runs` | `uq_payroll_period` | `(center_id, payroll_period_month, payroll_period_year)` | Exactly one payroll run per center per calendar month. |
| `devices` | `uq_device_identifier` | `(device_identifier)` | Hardware terminal fingerprint uniqueness. |

---

### 1.2 Partial Unique Indexes (State-Specific Invariants)
PostgreSQL partial unique indexes enforce critical single-active-state invariants:

```sql
-- Enforce that a physical RFID card can only be ACTIVELY assigned to ONE customer at a time
CREATE UNIQUE INDEX uq_active_card_assignment 
ON rfid_card_assignments (rfid_card_id) 
WHERE (is_active = TRUE);

-- Enforce that a customer can only hold ONE ACTIVE RFID card at a time
CREATE UNIQUE INDEX uq_active_customer_card 
ON rfid_card_assignments (customer_id) 
WHERE (is_active = TRUE);

-- Enforce that a customer has at most ONE ACTIVE face enrollment per model version
CREATE UNIQUE INDEX uq_active_customer_face_template 
ON face_enrollments (customer_id, model_version_id) 
WHERE (status = 'ACTIVE');
```

---

### 1.3 Check Constraints (Data Integrity Gates)

```sql
-- 1. Status Enums
ALTER TABLE organizations ADD CONSTRAINT chk_org_status 
CHECK (status IN ('ACTIVE', 'SUSPENDED', 'INACTIVE'));

ALTER TABLE customers ADD CONSTRAINT chk_customer_status 
CHECK (status IN ('DRAFT', 'PENDING_FACE_ENROLLMENT', 'PENDING_RFID_ASSIGNMENT', 'PENDING_SYNC', 'ACTIVE', 'SUSPENDED', 'SOFT_DELETED'));

ALTER TABLE customer_milk_categories ADD CONSTRAINT chk_milk_category 
CHECK (milk_category IN ('COW', 'BUFFALO'));

ALTER TABLE rfid_cards ADD CONSTRAINT chk_rfid_card_status 
CHECK (status IN ('UNASSIGNED', 'ACTIVE', 'BLOCKED', 'REVOKED', 'LOST'));

ALTER TABLE collection_sessions ADD CONSTRAINT chk_collection_session_state 
CHECK (session_state IN ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'));

-- 2. Non-Negative Monetary & Physical Measures
ALTER TABLE collection_weight_readings ADD CONSTRAINT chk_positive_net_weight 
CHECK (net_weight > 0.00);

ALTER TABLE milk_collections ADD CONSTRAINT chk_positive_collection_weight 
CHECK (net_weight > 0.00);

ALTER TABLE milk_collections ADD CONSTRAINT chk_non_negative_collection_amount 
CHECK (total_amount >= 0.00);

ALTER TABLE ledger_transactions ADD CONSTRAINT chk_positive_ledger_amount 
CHECK (amount > 0.00);

ALTER TABLE ledger_transactions ADD CONSTRAINT chk_ledger_direction 
CHECK (direction IN ('CREDIT', 'DEBIT'));

ALTER TABLE customer_advances ADD CONSTRAINT chk_positive_advance_principal 
CHECK (principal_amount > 0.00);

ALTER TABLE customer_advances ADD CONSTRAINT chk_advance_recovery_bounds 
CHECK (total_recovered_amount >= 0.00 AND total_recovered_amount <= principal_amount);

ALTER TABLE feed_sale_items ADD CONSTRAINT chk_positive_feed_quantity 
CHECK (quantity > 0);

-- 3. Chemical Composition Plausible Bounds
ALTER TABLE collection_quality_readings ADD CONSTRAINT chk_plausible_fat 
CHECK (fat_percentage >= 1.5 AND fat_percentage <= 15.0);

ALTER TABLE collection_quality_readings ADD CONSTRAINT chk_plausible_snf 
CHECK (snf_percentage >= 5.0 AND snf_percentage <= 13.0);
```

---

## 2. High-Performance Indexing Strategy

High-throughput intake counter terminals record hundreds of collections per hour during morning and evening shift windows. The following indexing strategy guarantees sub-millisecond query response times.

### 2.1 Foreign Key Coverage Indexes
Every foreign key column in PostgreSQL requires an explicit B-tree index to prevent table-level locks during cascade checks and accelerate relational `JOIN` operations:

```sql
CREATE INDEX idx_dairy_centers_org_id ON dairy_centers(organization_id);
CREATE INDEX idx_customers_org_id ON customers(organization_id);
CREATE INDEX idx_customers_center_id ON customers(primary_center_id);
CREATE INDEX idx_face_enrollments_cust_id ON face_enrollments(customer_id);
CREATE INDEX idx_rfid_assignments_cust_id ON rfid_card_assignments(customer_id);
CREATE INDEX idx_milk_collections_cust_id ON milk_collections(customer_id);
CREATE INDEX idx_milk_collections_center_id ON milk_collections(center_id);
CREATE INDEX idx_ledger_transactions_cust_id ON ledger_transactions(customer_id);
CREATE INDEX idx_monthly_bills_cust_id ON monthly_bills(customer_id);
CREATE INDEX idx_feed_sales_cust_id ON feed_sales(customer_id);
```

### 2.2 Composite Query Indexes (Intake Counter & Reporting)

```sql
-- 1. Counter Intake Shift Lookup (Rapid shift summary calculations)
CREATE INDEX idx_milk_collections_shift_summary 
ON milk_collections (center_id, business_date, shift_type, milk_category);

-- 2. Customer Daily Delivery Lookup (Farmer passbook & mobile feed)
CREATE INDEX idx_milk_collections_cust_date 
ON milk_collections (customer_id, business_date DESC);

-- 3. Customer Financial Ledger Chronological Audit
CREATE INDEX idx_ledger_transactions_chronological 
ON ledger_transactions (customer_id, created_at DESC);

-- 4. Active Rate Matrix Lookup (Fastest path during counter intake)
CREATE INDEX idx_rate_chart_cells_lookup 
ON rate_chart_cells (rate_chart_version_id, fat_percentage, snf_percentage);

-- 5. Downstream Synchronization Event Stream
CREATE INDEX idx_sync_events_cursor 
ON sync_events (event_sequence ASC);

-- 6. Downstream Tombstone Stream
CREATE INDEX idx_sync_tombstones_cursor 
ON sync_tombstones (tombstone_sequence ASC);
```

### 2.3 Partial Indexes for Query Acceleration

```sql
-- Rapid lookup of active, consented customers eligible for collection intake
CREATE INDEX idx_active_customers_intake 
ON customers (primary_center_id, farmer_code) 
WHERE (is_deleted = FALSE AND status = 'ACTIVE');

-- Rapid lookup of pending un-synced ledger items
CREATE INDEX idx_unfinalized_billing_periods 
ON billing_periods (center_id, status) 
WHERE (status != 'CLOSED');
```

