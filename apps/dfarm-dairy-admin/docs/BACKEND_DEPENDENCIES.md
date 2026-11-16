# DFarm Dairy Admin Web — Backend & Database Dependency Report

## 1. Database Schema Requirements (Relational SQL Model)

To deploy the production backend corresponding to these typed contracts, the following relational database tables and foreign key constraints are required:

### A. Tenant & Admin Entities
1. `dairy_tenants`:
   - `id` (UUID PK), `dairy_code` (VARCHAR UNIQUE), `name`, `registration_number`, `subscription_tier`, `operational_settings` (JSONB), `created_at`, `updated_at`.
2. `staff_users`:
   - `id` (UUID PK), `dairy_id` (FK -> dairy_tenants.id), `mobile_number` (VARCHAR UNIQUE), `full_name`, `role` (ENUM: PRIMARY_DAIRY_ADMIN, SHIFT_SUPERVISOR, COLLECTION_OPERATOR, ACCOUNTANT), `is_active` (BOOLEAN), `created_at`.
3. `staff_permissions`:
   - `id` (UUID PK), `staff_id` (FK -> staff_users.id), `permission_code` (VARCHAR), `granted_at`.
4. `auth_otp_sessions`:
   - `mobile_number` (PK), `otp_hash` (VARCHAR), `expires_at` (TIMESTAMP), `attempts_remaining` (INT), `created_at`.

### B. Customer & Biometric Template Entities
5. `customers`:
   - `id` (UUID PK), `dairy_id` (FK -> dairy_tenants.id), `customer_code` (VARCHAR UNIQUE within dairy_id), `full_name`, `mobile_number` (VARCHAR UNIQUE within dairy_id), `status` (ENUM: PENDING_APPROVAL, ACTIVE, SUSPENDED, DELETED), `preferred_category` (ENUM: COW, BUFFALO), `village`, `bank_details` (JSONB), `is_soft_deleted` (BOOLEAN), `deleted_at`, `deleted_reason`, `created_at`.
6. `customer_registration_requests`:
   - `id` (UUID PK), `dairy_id` (FK -> dairy_tenants.id), `candidate_name`, `mobile_number`, `preferred_category`, `village`, `address`, `bank_details` (JSONB), `face_capture_metadata` (JSONB), `status` (ENUM: PENDING, APPROVED, REJECTED), `rejection_reason`, `reviewed_by` (FK -> staff_users.id), `submitted_at`.
7. `face_enrollment_records`:
   - `id` (UUID PK), `customer_id` (FK -> customers.id), `dairy_id` (FK -> dairy_tenants.id), `model_version` (VARCHAR), `template_version` (INT), `consent_given` (BOOLEAN), `consent_timestamp` (TIMESTAMP), `consent_evidence_hash` (VARCHAR), `quality_score` (DECIMAL), `status` (ENUM: APPROVED, RE_ENROLL_REQUESTED, REVOKED), `re_enrollment_note`, `revocation_reason`, `created_at`.
8. `rfid_cards`:
   - `card_uid` (VARCHAR PK), `dairy_id` (FK -> dairy_tenants.id), `customer_id` (FK -> customers.id, NULLABLE), `status` (ENUM: ACTIVE, LOST, DISABLED, REVOKED, UNASSIGNED), `issued_by` (FK -> staff_users.id), `issued_at`.

### C. Milk Intake, Pricing & Quality
9. `collection_sessions`:
   - `id` (UUID PK), `session_code` (VARCHAR), `dairy_id` (FK), `date` (DATE), `shift` (ENUM: MORNING, EVENING), `status` (ENUM: OPEN, CLOSED), `opening_operator_id` (FK), `closing_operator_id` (FK), `device_id` (FK), `total_liters` (DECIMAL), `cow_liters` (DECIMAL), `buffalo_liters` (DECIMAL), `total_amount` (DECIMAL), `opened_at`, `closed_at`.
10. `milk_collection_transactions`:
    - `id` (UUID PK), `transaction_id` (VARCHAR UNIQUE), `dairy_id` (FK), `session_id` (FK), `customer_id` (FK), `shift` (ENUM), `milk_category` (ENUM), `weight_liters` (DECIMAL), `fat_percentage` (DECIMAL), `snf_percentage` (DECIMAL), `applied_rate_per_liter` (DECIMAL), `rate_chart_version` (INT), `total_amount` (DECIMAL), `device_id` (FK), `operator_id` (FK), `status` (ENUM: CONFIRMED, ADJUSTED), `sync_state` (ENUM: SYNCED, OFFLINE_SYNCED), `created_at`.
11. `collection_transaction_adjustments`:
    - `id` (UUID PK), `transaction_id` (FK), `original_weight` (DECIMAL), `new_weight` (DECIMAL), `original_amount` (DECIMAL), `new_amount` (DECIMAL), `reason` (TEXT NOT NULL), `adjusted_by` (FK -> staff_users.id), `adjusted_at` (TIMESTAMP).
12. `milk_rate_charts`:
    - `id` (UUID PK), `dairy_id` (FK), `title`, `milk_category` (ENUM), `version` (INT), `status` (ENUM: DRAFT, PENDING_APPROVAL, ACTIVE, ARCHIVED), `base_rate_per_liter` (DECIMAL), `min_fat`, `max_fat`, `fat_step`, `min_snf`, `max_snf`, `snf_step`, `effective_date` (DATE), `created_by` (FK), `activated_by` (FK), `change_notes` (TEXT), `created_at`.
13. `milk_quality_readings`:
    - `id` (UUID PK), `dairy_id` (FK), `customer_id` (FK), `fat` (DECIMAL), `snf` (DECIMAL), `clr_density` (DECIMAL), `temperature` (DECIMAL), `adulteration_status` (ENUM: CLEAN, SUSPECTED_WATER, SUSPECTED_CHEMICAL), `sensor_telemetry` (JSONB), `timestamp`.

### D. Accounts, Ledger & Inventory
14. `customer_ledger_entries`:
    - `id` (UUID PK), `dairy_id` (FK), `customer_id` (FK), `entry_type` (ENUM: MILK_CREDIT, FEED_DEBIT, PAYMENT_RECEIVED, AUTHORIZED_ADJUSTMENT), `reference_type` (VARCHAR), `reference_id` (VARCHAR), `description` (TEXT), `debit` (DECIMAL), `credit` (DECIMAL), `running_balance` (DECIMAL), `authorized_by` (VARCHAR), `reason` (TEXT), `timestamp`.
15. `dairy_bills`:
    - `id` (UUID PK), `bill_number` (VARCHAR UNIQUE), `dairy_id` (FK), `customer_id` (FK), `period_start` (DATE), `period_end` (DATE), `cycle_name` (VARCHAR), `total_milk_volume` (DECIMAL), `total_milk_amount` (DECIMAL), `total_feed_deduction` (DECIMAL), `net_payable` (DECIMAL), `amount_paid` (DECIMAL), `outstanding_balance` (DECIMAL), `status` (ENUM: GENERATED, PARTIALLY_PAID, SETTLED, CANCELLED), `generated_by` (FK), `generated_at`.
    - **Constraint:** `UNIQUE (dairy_id, customer_id, period_start, period_end)` prevents duplicate billing!
16. `feed_products`:
    - `id` (UUID PK), `dairy_id` (FK), `sku` (VARCHAR), `name`, `category` (ENUM), `unit` (ENUM), `purchase_rate` (DECIMAL), `selling_rate` (DECIMAL), `available_stock` (INT), `min_stock_alert_level` (INT), `status` (ENUM: ACTIVE, INACTIVE), `updated_at`.
17. `feed_stock_movements`:
    - `id` (UUID PK), `dairy_id` (FK), `product_id` (FK), `movement_type` (ENUM: PURCHASE_RESTOCK, CUSTOMER_SALE, DAMAGED_WRITE_OFF, MANUAL_AUDIT_ADJUSTMENT), `quantity` (INT), `previous_stock` (INT), `resulting_stock` (INT), `reference_id` (VARCHAR), `reason` (TEXT), `performed_by` (FK), `timestamp`.
18. `customer_feed_sales`:
    - `id` (UUID PK), `sale_id` (VARCHAR UNIQUE), `dairy_id` (FK), `customer_id` (FK), `product_id` (FK), `quantity` (INT), `unit_price` (DECIMAL), `total_amount` (DECIMAL), `payment_mode` (ENUM: LEDGER_DEBIT, CASH, ONLINE), `ledger_reference_id` (FK -> customer_ledger_entries.id), `recorded_by` (FK), `purchase_date` (DATE).
19. `payment_records`:
    - `id` (UUID PK), `receipt_number` (VARCHAR UNIQUE), `dairy_id` (FK), `customer_id` (FK), `amount` (DECIMAL), `payment_method` (ENUM: CASH, BANK_TRANSFER, UPI, CHEQUE), `transaction_reference` (VARCHAR), `linked_bill_id` (FK -> dairy_bills.id, NULLABLE), `linked_ledger_entry_id` (FK -> customer_ledger_entries.id), `status` (ENUM: RECONCILED, VOID), `verified_by` (FK), `payment_date` (DATE).

### E. Telemetry & Governance
20. `collection_devices`:
    - `id` (UUID PK), `device_id` (VARCHAR UNIQUE), `dairy_id` (FK), `device_name`, `device_type` (ENUM), `ip_address`, `mac_address`, `firmware_version`, `face_model_cache_version` (VARCHAR), `status` (ENUM: ONLINE, OFFLINE, SYNCING, ERROR), `pending_offline_sync_events` (INT), `failed_sync_events` (INT), `hardware_health` (ENUM: HEALTHY, WARNING, CRITICAL), `last_sync_at` (TIMESTAMP).
21. `audit_log_entries`:
    - `id` (UUID PK), `dairy_id` (FK), `timestamp` (TIMESTAMP), `actor_id` (FK), `actor_name` (VARCHAR), `actor_role` (VARCHAR), `action` (VARCHAR), `target_entity` (VARCHAR), `entity_id` (VARCHAR), `details` (TEXT), `reason` (TEXT), `previous_state` (JSONB), `new_state` (JSONB).
