# DFarm: Complete Entity and Table Inventory
**Phase 03 of 20: Implementation-Ready Schema Catalog**

---

## 1. Domain 1: Organization & Multi-Center Master

### 1.1 `organizations`
Primary multi-tenant entity representing the dairy cooperative or enterprise organization.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `name` (VARCHAR(150), NOT NULL) — Legal entity name
- `code` (VARCHAR(20), UNIQUE, NOT NULL) — Human-readable organizational code (e.g. `DFARM_COOP`)
- `status` (VARCHAR(20), NOT NULL, DEFAULT `'ACTIVE'`) — CHECK (`status IN ('ACTIVE', 'SUSPENDED', 'INACTIVE')`)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)
- `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

### 1.2 `dairy_centers`
Collection centers (BMC - Bulk Milk Cooling units or village intake counters) owned by an organization.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `organization_id` (UUID, NOT NULL, FK -> `organizations.id` ON DELETE RESTRICT)
- `code` (VARCHAR(20), NOT NULL) — Center identifier within organization (e.g. `C001`)
- `name` (VARCHAR(150), NOT NULL) — Center display name (e.g. "Sangli Main Intake Center")
- `address_line1` (VARCHAR(200), NOT NULL)
- `address_line2` (VARCHAR(200))
- `village_town` (VARCHAR(100), NOT NULL)
- `district` (VARCHAR(100), NOT NULL)
- `state` (VARCHAR(100), NOT NULL)
- `postal_code` (VARCHAR(20), NOT NULL)
- `contact_phone` (VARCHAR(20), NOT NULL)
- `contact_email` (VARCHAR(150))
- `timezone` (VARCHAR(50), NOT NULL, DEFAULT `'Asia/Kolkata'`)
- `status` (VARCHAR(20), NOT NULL, DEFAULT `'ACTIVE'`) — CHECK (`status IN ('ACTIVE', 'SUSPENDED', 'INACTIVE')`)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)
- `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)
- *Constraints:* `CONSTRAINT uq_dairy_center_code_per_org UNIQUE (organization_id, code)`

### 1.3 `center_settings`
Granular, configurable operational rules and validation limits for each collection center.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `center_id` (UUID, NOT NULL, UNIQUE, FK -> `dairy_centers.id` ON DELETE CASCADE)
- `business_timezone` (VARCHAR(50), NOT NULL, DEFAULT `'Asia/Kolkata'`)
- `billing_cycle_type` (VARCHAR(30), NOT NULL, DEFAULT `'CALENDAR_MONTH'`) — CHECK (`billing_cycle_type IN ('CALENDAR_MONTH', 'TEN_DAY', 'FIFTEEN_DAY', 'WEEKLY')`)
- `weight_measurement_unit` (VARCHAR(10), NOT NULL, DEFAULT `'KG'`) — CHECK (`weight_measurement_unit IN ('KG', 'LITERS')`)
- `collection_lock_window_hours` (NUMERIC(4,1), NOT NULL, DEFAULT `4.0`)
- `allow_manual_identification` (BOOLEAN, NOT NULL, DEFAULT `TRUE`)
- `allow_cow_milk` (BOOLEAN, NOT NULL, DEFAULT `TRUE`)
- `allow_buffalo_milk` (BOOLEAN, NOT NULL, DEFAULT `TRUE`)
- `cow_fat_min` (NUMERIC(3,1), NOT NULL, DEFAULT `2.8`)
- `cow_fat_max` (NUMERIC(3,1), NOT NULL, DEFAULT `6.0`)
- `cow_snf_min` (NUMERIC(3,1), NOT NULL, DEFAULT `7.8`)
- `cow_snf_max` (NUMERIC(3,1), NOT NULL, DEFAULT `10.2`)
- `buffalo_fat_min` (NUMERIC(3,1), NOT NULL, DEFAULT `5.0`)
- `buffalo_fat_max` (NUMERIC(3,1), NOT NULL, DEFAULT `12.0`)
- `buffalo_snf_min` (NUMERIC(3,1), NOT NULL, DEFAULT `8.2`)
- `buffalo_snf_max` (NUMERIC(3,1), NOT NULL, DEFAULT `11.5`)
- `offline_sync_max_disconnection_hours` (INT, NOT NULL, DEFAULT `72`)
- `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

### 1.4 `collection_shifts`
Daily operational shifts (Morning and Evening) with intake cutoff boundaries.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `center_id` (UUID, NOT NULL, FK -> `dairy_centers.id` ON DELETE CASCADE)
- `shift_type` (VARCHAR(10), NOT NULL) — CHECK (`shift_type IN ('MORNING', 'EVENING')`)
- `start_time` (TIME, NOT NULL)
- `end_time` (TIME, NOT NULL)
- `grace_period_minutes` (INT, NOT NULL, DEFAULT `30`)
- `is_active` (BOOLEAN, NOT NULL, DEFAULT `TRUE`)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)
- *Constraints:* `CONSTRAINT uq_center_shift UNIQUE (center_id, shift_type)`

---

## 2. Domain 2: User Master & Access Control (IAM)

### 2.1 `users`
Authenticated staff, managers, operators, and customer accounts.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`) — Matches `auth.users.id` in Supabase
- `organization_id` (UUID, NOT NULL, FK -> `organizations.id` ON DELETE RESTRICT)
- `username` (VARCHAR(50), NOT NULL, UNIQUE)
- `full_name` (VARCHAR(150), NOT NULL)
- `email` (VARCHAR(150))
- `phone_number` (VARCHAR(20), NOT NULL)
- `role` (VARCHAR(30), NOT NULL) — CHECK (`role IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'COLLECTION_OPERATOR', 'ACCOUNTANT', 'INVENTORY_MANAGER', 'FARMER_CUSTOMER')`)
- `status` (VARCHAR(20), NOT NULL, DEFAULT `'ACTIVE'`) — CHECK (`status IN ('ACTIVE', 'SUSPENDED', 'INACTIVE')`)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)
- `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

### 2.2 `user_center_assignments`
Maps staff users to authorized dairy collection centers.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `user_id` (UUID, NOT NULL, FK -> `users.id` ON DELETE CASCADE)
- `center_id` (UUID, NOT NULL, FK -> `dairy_centers.id` ON DELETE CASCADE)
- `is_primary` (BOOLEAN, NOT NULL, DEFAULT `FALSE`)
- `assigned_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)
- *Constraints:* `CONSTRAINT uq_user_center_assignment UNIQUE (user_id, center_id)`

---

## 3. Domain 3: Customer Identity Master

### 3.1 `customers`
The core business entity representing the dairy farmer.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`) — Canonical Customer UUID
- `organization_id` (UUID, NOT NULL, FK -> `organizations.id` ON DELETE RESTRICT)
- `primary_center_id` (UUID, NOT NULL, FK -> `dairy_centers.id` ON DELETE RESTRICT)
- `farmer_code` (VARCHAR(30), NOT NULL) — Center slip number (e.g. `F00142`)
- `full_name` (VARCHAR(150), NOT NULL)
- `normalized_mobile_number` (VARCHAR(20), NOT NULL) — Normalized E.164 string (`+91XXXXXXXXXX`)
- `status` (VARCHAR(30), NOT NULL, DEFAULT `'DRAFT'`) — CHECK (`status IN ('DRAFT', 'PENDING_FACE_ENROLLMENT', 'PENDING_RFID_ASSIGNMENT', 'PENDING_SYNC', 'ACTIVE', 'SUSPENDED', 'SOFT_DELETED')`)
- `registration_status` (VARCHAR(30), NOT NULL, DEFAULT `'IN_PROGRESS'`) — CHECK (`registration_status IN ('IN_PROGRESS', 'COMPLETED', 'REJECTED')`)
- `bank_name` (VARCHAR(100))
- `bank_account_number` (VARCHAR(50))
- `bank_ifsc_code` (VARCHAR(20))
- `bank_account_holder_name` (VARCHAR(150))
- `is_deleted` (BOOLEAN, NOT NULL, DEFAULT `FALSE`)
- `deleted_at` (TIMESTAMPTZ)
- `deleted_by` (UUID, FK -> `users.id` ON DELETE SET NULL)
- `deletion_reason` (TEXT)
- `version` (BIGINT, NOT NULL, DEFAULT `1`) — Optimistic locking & replication version
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)
- `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)
- *Constraints:*
  - `CONSTRAINT uq_customer_mobile_per_org UNIQUE (organization_id, normalized_mobile_number)`
  - `CONSTRAINT uq_customer_code_per_center UNIQUE (primary_center_id, farmer_code)`

### 3.2 `customer_milk_categories`
Normalized relationship defining permitted milk species per customer.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `customer_id` (UUID, NOT NULL, FK -> `customers.id` ON DELETE RESTRICT)
- `milk_category` (VARCHAR(20), NOT NULL) — CHECK (`milk_category IN ('COW', 'BUFFALO')`)
- `is_authorized` (BOOLEAN, NOT NULL, DEFAULT `TRUE`)
- `authorized_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)
- `authorized_by` (UUID, NOT NULL, FK -> `users.id` ON DELETE RESTRICT)
- *Constraints:* `CONSTRAINT uq_customer_milk_category UNIQUE (customer_id, milk_category)`
- *Business Rule:* Farmers authorized for Both have two active rows (`COW` and `BUFFALO`).

### 3.3 `customer_addresses`
Physical location and postal details of the dairy customer.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `customer_id` (UUID, NOT NULL, UNIQUE, FK -> `customers.id` ON DELETE CASCADE)
- `village` (VARCHAR(100), NOT NULL)
- `hamlet_area` (VARCHAR(100))
- `taluka_subdistrict` (VARCHAR(100), NOT NULL)
- `district` (VARCHAR(100), NOT NULL)
- `state` (VARCHAR(100), NOT NULL)
- `postal_code` (VARCHAR(20), NOT NULL)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)
- `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

### 3.4 `customer_registration_records`
Audit trail of initial customer onboarding.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `customer_id` (UUID, NOT NULL, FK -> `customers.id` ON DELETE RESTRICT)
- `center_id` (UUID, NOT NULL, FK -> `dairy_centers.id` ON DELETE RESTRICT)
- `registered_by` (UUID, NOT NULL, FK -> `users.id` ON DELETE RESTRICT)
- `registration_channel` (VARCHAR(30), NOT NULL, DEFAULT `'ANDROID_REGISTRATION_APP'`)
- `device_id` (VARCHAR(100), NOT NULL)
- `completed_at` (TIMESTAMPTZ)

### 3.5 `customer_status_history`
Lifecycle audit table tracking every status transition (`DRAFT` $\rightarrow$ `ACTIVE` $\rightarrow$ `SUSPENDED` $\rightarrow$ `SOFT_DELETED`).
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `customer_id` (UUID, NOT NULL, FK -> `customers.id` ON DELETE CASCADE)
- `previous_status` (VARCHAR(30))
- `new_status` (VARCHAR(30), NOT NULL)
- `change_reason` (TEXT, NOT NULL)
- `changed_by` (UUID, NOT NULL, FK -> `users.id` ON DELETE RESTRICT)
- `changed_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

### 3.6 `customer_consent_records`
Explicit legal record of farmer biometric enrollment consent.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `customer_id` (UUID, NOT NULL, FK -> `customers.id` ON DELETE RESTRICT)
- `consent_type` (VARCHAR(50), NOT NULL, DEFAULT `'BIOMETRIC_FACE_ENROLLMENT'`)
- `consent_granted` (BOOLEAN, NOT NULL, DEFAULT `FALSE`)
- `consent_text_version` (VARCHAR(20), NOT NULL)
- `consent_language` (VARCHAR(10), NOT NULL, DEFAULT `'mr'`) — Language code (`mr`, `hi`, `en`)
- `officer_id` (UUID, NOT NULL, FK -> `users.id` ON DELETE RESTRICT)
- `recorded_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)
- `revoked_at` (TIMESTAMPTZ)
- `revocation_reason` (TEXT)

---

## 4. Domain 4: Biometric Face Enrollment Master

### 4.1 `face_model_versions`
Metadata-driven catalog of facial feature extraction models.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `model_name` (VARCHAR(50), NOT NULL) — e.g. `'mobilefacenet'`, `'facenet512'`
- `model_version` (VARCHAR(30), NOT NULL) — e.g. `'1.0.0'`
- `embedding_dimension` (INT, NOT NULL) — Metadata-driven (e.g. 128, 512)
- `similarity_metric` (VARCHAR(20), NOT NULL, DEFAULT `'COSINE'`)
- `recommended_threshold` (NUMERIC(4,3), NOT NULL) — Configurable calibrated threshold (e.g. `0.800`)
- `is_active` (BOOLEAN, NOT NULL, DEFAULT `TRUE`)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)
- *Constraints:* `CONSTRAINT uq_face_model_version UNIQUE (model_name, model_version)`

### 4.2 `face_enrollments`
Encrypted facial embedding vectors linked to canonical Customer UUIDs.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `customer_id` (UUID, NOT NULL, FK -> `customers.id` ON DELETE RESTRICT)
- `model_version_id` (UUID, NOT NULL, FK -> `face_model_versions.id` ON DELETE RESTRICT)
- `embedding_encrypted` (BYTEA, NOT NULL) — AES-256-GCM ciphertext
- `embedding_iv` (BYTEA, NOT NULL) — 12-byte initialization vector
- `embedding_auth_tag` (BYTEA, NOT NULL) — 16-byte GCM authentication tag
- `encryption_key_reference` (VARCHAR(50), NOT NULL) — External key identifier (e.g. `'vault_kms_v1'`)
- `quality_score` (NUMERIC(4,3), NOT NULL) — Quality gate metric ($\ge 0.750$)
- `liveness_score` (NUMERIC(4,3)) — Presentation attack metric
- `status` (VARCHAR(20), NOT NULL, DEFAULT `'ACTIVE'`) — CHECK (`status IN ('ACTIVE', 'SUPERSEDED', 'REVOKED', 'PERMANENTLY_ERASED')`)
- `enrolled_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)
- `enrolled_by` (UUID, NOT NULL, FK -> `users.id` ON DELETE RESTRICT)
- `device_id` (VARCHAR(100), NOT NULL)
- `erased_at` (TIMESTAMPTZ)
- `erased_by` (UUID, FK -> `users.id` ON DELETE SET NULL)
- `erasure_reason` (TEXT)

### 4.3 `biometric_retention_records`
Manages the policy-driven lifecycle and scheduled permanent erasure of biometric data.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `customer_id` (UUID, NOT NULL, FK -> `customers.id` ON DELETE RESTRICT)
- `face_enrollment_id` (UUID, NOT NULL, FK -> `face_enrollments.id` ON DELETE CASCADE)
- `retention_policy_name` (VARCHAR(50), NOT NULL, DEFAULT `'POLICY_SUBJECT_TO_CONSENT'`)
- `scheduled_erasure_at` (TIMESTAMPTZ) — Calculated per approved policy upon soft delete
- `retention_status` (VARCHAR(30), NOT NULL, DEFAULT `'ACTIVE'`) — CHECK (`retention_status IN ('ACTIVE', 'GRACE_PERIOD', 'ERASED', 'EXEMPT')`)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

---

## 5. Domain 5: RFID Card Management Master

### 5.1 `rfid_cards`
Physical RFID/NFC cards inventory owned by the organization.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `organization_id` (UUID, NOT NULL, FK -> `organizations.id` ON DELETE RESTRICT)
- `card_uid` (VARCHAR(64), NOT NULL) — Normalized uppercase hex string (e.g. `04A1B2C3D4E5F6`)
- `card_type` (VARCHAR(30), NOT NULL, DEFAULT `'MIFARE_CLASSIC_1K'`)
- `status` (VARCHAR(20), NOT NULL, DEFAULT `'UNASSIGNED'`) — CHECK (`status IN ('UNASSIGNED', 'ACTIVE', 'BLOCKED', 'REVOKED', 'LOST')`)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)
- `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)
- *Constraints:* `CONSTRAINT uq_rfid_card_uid_per_org UNIQUE (organization_id, card_uid)`

### 5.2 `rfid_card_assignments`
Assignment ledger binding an RFID card to a single canonical Customer UUID.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `rfid_card_id` (UUID, NOT NULL, FK -> `rfid_cards.id` ON DELETE RESTRICT)
- `customer_id` (UUID, NOT NULL, FK -> `customers.id` ON DELETE RESTRICT)
- `center_id` (UUID, NOT NULL, FK -> `dairy_centers.id` ON DELETE RESTRICT)
- `is_active` (BOOLEAN, NOT NULL, DEFAULT `TRUE`)
- `assigned_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)
- `assigned_by` (UUID, NOT NULL, FK -> `users.id` ON DELETE RESTRICT)
- `revoked_at` (TIMESTAMPTZ)
- `revoked_by` (UUID, FK -> `users.id` ON DELETE SET NULL)
- `revocation_reason` (TEXT)
- *Indexes / Uniqueness:*
  - `CREATE UNIQUE INDEX uq_active_card_assignment ON rfid_card_assignments (rfid_card_id) WHERE (is_active = TRUE);`
  - `CREATE UNIQUE INDEX uq_active_customer_card ON rfid_card_assignments (customer_id) WHERE (is_active = TRUE);`

---

## 6. Domain 6: Customer Identification Audit Master

### 6.1 `identification_audit_logs`
Immutable telemetry of every customer identification event at collection intake.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `organization_id` (UUID, NOT NULL, FK -> `organizations.id` ON DELETE RESTRICT)
- `center_id` (UUID, NOT NULL, FK -> `dairy_centers.id` ON DELETE RESTRICT)
- `session_id` (UUID) — Optional link to `collection_sessions.id`
- `customer_id` (UUID, FK -> `customers.id` ON DELETE SET NULL) — NULL if UNKNOWN
- `identification_method` (VARCHAR(30), NOT NULL) — CHECK (`identification_method IN ('FACE', 'RFID', 'SUPERVISOR_MANUAL')`)
- `verification_outcome` (VARCHAR(20), NOT NULL) — CHECK (`verification_outcome IN ('SUCCESS', 'FAILED', 'REJECTED_INACTIVE', 'REJECTED_UNKNOWN')`)
- `face_model_version_id` (UUID, FK -> `face_model_versions.id` ON DELETE SET NULL)
- `face_match_score` (NUMERIC(5,4)) — Cosine similarity score
- `rfid_card_uid_scanned` (VARCHAR(64))
- `supervisor_id` (UUID, FK -> `users.id` ON DELETE SET NULL)
- `supervisor_reason_code` (VARCHAR(100))
- `device_id` (VARCHAR(100), NOT NULL)
- `recorded_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

### 6.2 `supervisor_verification_records`
Detailed audit log required when an intake overrides biometrics and RFID via Supervisor Manual Verification.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `audit_log_id` (UUID, NOT NULL, UNIQUE, FK -> `identification_audit_logs.id` ON DELETE CASCADE)
- `supervisor_id` (UUID, NOT NULL, FK -> `users.id` ON DELETE RESTRICT)
- `customer_id` (UUID, NOT NULL, FK -> `customers.id` ON DELETE RESTRICT)
- `center_id` (UUID, NOT NULL, FK -> `dairy_centers.id` ON DELETE RESTRICT)
- `reason_category` (VARCHAR(50), NOT NULL) — CHECK (`reason_category IN ('FACIAL_INJURY', 'LIGHTING_CAMERA_DEFECT', 'CARD_DAMAGED', 'CARD_FORGOTTEN', 'OTHER_DOCUMENTED')`)
- `justification_notes` (TEXT, NOT NULL)
- `authenticated_via` (VARCHAR(30), NOT NULL, DEFAULT `'PIN'`) — CHECK (`authenticated_via IN ('PIN', 'PASSWORD', 'BIOMETRIC')`)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

---

## 7. Domain 7: Milk Intake & Collection Master

### 7.1 `collection_sessions`
Top-level intake session at the collection counter.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `center_id` (UUID, NOT NULL, FK -> `dairy_centers.id` ON DELETE RESTRICT)
- `customer_id` (UUID, NOT NULL, FK -> `customers.id` ON DELETE RESTRICT)
- `business_date` (DATE, NOT NULL)
- `shift_id` (UUID, NOT NULL, FK -> `collection_shifts.id` ON DELETE RESTRICT)
- `shift_type` (VARCHAR(10), NOT NULL) — CHECK (`shift_type IN ('MORNING', 'EVENING')`)
- `selected_milk_category` (VARCHAR(20), NOT NULL) — CHECK (`selected_milk_category IN ('COW', 'BUFFALO')`)
- `identification_method` (VARCHAR(30), NOT NULL) — CHECK (`identification_method IN ('FACE', 'RFID', 'SUPERVISOR_MANUAL')`)
- `identification_log_id` (UUID, FK -> `identification_audit_logs.id` ON DELETE SET NULL)
- `session_state` (VARCHAR(20), NOT NULL, DEFAULT `'OPEN'`) — CHECK (`session_state IN ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')`)
- `intake_sequence_uuid` (UUID, NOT NULL) — Generated uniquely per physical delivery event
- `started_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)
- `completed_at` (TIMESTAMPTZ)
- `operator_id` (UUID, NOT NULL, FK -> `users.id` ON DELETE RESTRICT)
- `device_id` (VARCHAR(100), NOT NULL)

### 7.2 `collection_quality_readings`
Software compositional measurement record (Fat% and SNF%).
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `session_id` (UUID, NOT NULL, FK -> `collection_sessions.id` ON DELETE CASCADE)
- `fat_percentage` (NUMERIC(3,1), NOT NULL)
- `snf_percentage` (NUMERIC(3,1), NOT NULL)
- `density_clr` (NUMERIC(4,1)) — Corrected Lactometer Reading
- `validation_status` (VARCHAR(20), NOT NULL, DEFAULT `'VALID'`) — CHECK (`validation_status IN ('VALID', 'OUT_OF_BOUNDS_OVERRIDDEN', 'SUSPICIOUS')`)
- `reading_source` (VARCHAR(30), NOT NULL, DEFAULT `'MANUAL_ENTRY'`) — CHECK (`reading_source IN ('MANUAL_ENTRY', 'SOFTWARE_SIMULATOR', 'HARDWARE_INTERFACE')`)
- `recorded_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

### 7.3 `collection_weight_readings`
Software mass measurement record.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `session_id` (UUID, NOT NULL, FK -> `collection_sessions.id` ON DELETE CASCADE)
- `measured_weight` (NUMERIC(6,2), NOT NULL)
- `measurement_unit` (VARCHAR(10), NOT NULL, DEFAULT `'KG'`) — CHECK (`measurement_unit IN ('KG', 'LITERS')`)
- `tare_weight` (NUMERIC(6,2), NOT NULL, DEFAULT `0.00`)
- `net_weight` (NUMERIC(6,2), NOT NULL)
- `validation_status` (VARCHAR(20), NOT NULL, DEFAULT `'VALID'`) — CHECK (`validation_status IN ('VALID', 'OUT_OF_BOUNDS_OVERRIDDEN')`)
- `reading_source` (VARCHAR(30), NOT NULL, DEFAULT `'MANUAL_ENTRY'`) — CHECK (`reading_source IN ('MANUAL_ENTRY', 'SOFTWARE_SIMULATOR', 'HARDWARE_INTERFACE')`)
- `recorded_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

### 7.4 `milk_collections`
Finalized, immutable intake transaction.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `session_id` (UUID, NOT NULL, UNIQUE, FK -> `collection_sessions.id` ON DELETE RESTRICT)
- `center_id` (UUID, NOT NULL, FK -> `dairy_centers.id` ON DELETE RESTRICT)
- `customer_id` (UUID, NOT NULL, FK -> `customers.id` ON DELETE RESTRICT)
- `business_date` (DATE, NOT NULL)
- `shift_type` (VARCHAR(10), NOT NULL) — CHECK (`shift_type IN ('MORNING', 'EVENING')`)
- `milk_category` (VARCHAR(20), NOT NULL) — CHECK (`milk_category IN ('COW', 'BUFFALO')`)
- `net_weight` (NUMERIC(6,2), NOT NULL) — CHECK (`net_weight > 0`)
- `measurement_unit` (VARCHAR(10), NOT NULL, DEFAULT `'KG'`)
- `fat_percentage` (NUMERIC(3,1), NOT NULL)
- `snf_percentage` (NUMERIC(3,1), NOT NULL)
- `rate_chart_version_id` (UUID, NOT NULL, FK -> `rate_chart_versions.id` ON DELETE RESTRICT)
- `applied_rate_per_unit` (NUMERIC(6,2), NOT NULL)
- `total_amount` (NUMERIC(10,2), NOT NULL) — CHECK (`total_amount >= 0`)
- `transaction_status` (VARCHAR(20), NOT NULL, DEFAULT `'COMPLETED'`) — CHECK (`transaction_status IN ('COMPLETED', 'REVERSED', 'ADJUSTED')`)
- `client_intake_uuid` (UUID, NOT NULL) — Unique client event UUID
- `idempotency_key` (VARCHAR(128), NOT NULL, UNIQUE)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)
- `synced_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

### 7.5 `collection_receipts`
Thermal slip generation and re-printing tracking.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `collection_id` (UUID, NOT NULL, UNIQUE, FK -> `milk_collections.id` ON DELETE RESTRICT)
- `receipt_number` (VARCHAR(50), NOT NULL, UNIQUE) — e.g. `REC-20261113-M-0012`
- `printed_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)
- `print_count` (INT, NOT NULL, DEFAULT `1`)
- `reprint_reason` (TEXT)

### 7.6 `collection_adjustments`
Audited corrections to collection transactions.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `collection_id` (UUID, NOT NULL, FK -> `milk_collections.id` ON DELETE RESTRICT)
- `original_weight` (NUMERIC(6,2), NOT NULL), `new_weight` (NUMERIC(6,2), NOT NULL)
- `original_fat` (NUMERIC(3,1), NOT NULL), `new_fat` (NUMERIC(3,1), NOT NULL)
- `original_snf` (NUMERIC(3,1), NOT NULL), `new_snf` (NUMERIC(3,1), NOT NULL)
- `original_amount` (NUMERIC(10,2), NOT NULL), `new_amount` (NUMERIC(10,2), NOT NULL)
- `adjustment_difference` (NUMERIC(10,2), NOT NULL)
- `reason` (TEXT, NOT NULL)
- `adjusted_by` (UUID, NOT NULL, FK -> `users.id` ON DELETE RESTRICT)
- `adjusted_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

### 7.7 `collection_reversals`
Complete reversal of an erroneously created collection transaction.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `collection_id` (UUID, NOT NULL, UNIQUE, FK -> `milk_collections.id` ON DELETE RESTRICT)
- `reversed_amount` (NUMERIC(10,2), NOT NULL)
- `reversal_reason` (TEXT, NOT NULL)
- `authorized_by` (UUID, NOT NULL, FK -> `users.id` ON DELETE RESTRICT)
- `reversed_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

---

## 8. Domain 8: Milk Rate Management Master

### 8.1 `rate_charts`
Rate catalog definition.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `organization_id` (UUID, NOT NULL, FK -> `organizations.id` ON DELETE RESTRICT)
- `center_id` (UUID, FK -> `dairy_centers.id` ON DELETE RESTRICT) — NULL = Org Default
- `name` (VARCHAR(100), NOT NULL) — e.g. "Standard Cow Grid Rate 2026"
- `milk_category` (VARCHAR(20), NOT NULL) — CHECK (`milk_category IN ('COW', 'BUFFALO')`)
- `pricing_type` (VARCHAR(30), NOT NULL, DEFAULT `'GRID'`) — CHECK (`pricing_type IN ('GRID', 'TOTAL_SOLIDS_FORMULA', 'TWO_AXIS_FORMULA')`)
- `is_active` (BOOLEAN, NOT NULL, DEFAULT `TRUE`)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

### 8.2 `rate_chart_versions`
Historical versions with time-bound applicability.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `rate_chart_id` (UUID, NOT NULL, FK -> `rate_charts.id` ON DELETE RESTRICT)
- `version_number` (INT, NOT NULL)
- `effective_from` (TIMESTAMPTZ, NOT NULL)
- `effective_to` (TIMESTAMPTZ) — NULL = Active indefinitely
- `formula_definition` (JSONB)
- `base_fat` (NUMERIC(3,1)), `base_snf` (NUMERIC(3,1)), `base_rate` (NUMERIC(6,2))
- `is_approved` (BOOLEAN, NOT NULL, DEFAULT `FALSE`)
- `approved_by` (UUID, FK -> `users.id` ON DELETE RESTRICT)
- `approved_at` (TIMESTAMPTZ)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)
- *Constraints:* `CONSTRAINT uq_rate_chart_version UNIQUE (rate_chart_id, version_number)`

### 8.3 `rate_chart_cells`
Grid cells mapping exact Fat% and SNF% coordinates to rate per unit.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `rate_chart_version_id` (UUID, NOT NULL, FK -> `rate_chart_versions.id` ON DELETE CASCADE)
- `fat_percentage` (NUMERIC(3,1), NOT NULL)
- `snf_percentage` (NUMERIC(3,1), NOT NULL)
- `rate_per_unit` (NUMERIC(6,2), NOT NULL) — CHECK (`rate_per_unit >= 0`)
- *Constraints:* `CONSTRAINT uq_rate_chart_cell UNIQUE (rate_chart_version_id, fat_percentage, snf_percentage)`

### 8.4 `rate_applicability_rules`
Center-specific rate override priority logic.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `rate_chart_id` (UUID, NOT NULL, FK -> `rate_charts.id` ON DELETE CASCADE)
- `center_id` (UUID, NOT NULL, FK -> `dairy_centers.id` ON DELETE CASCADE)
- `priority` (INT, NOT NULL, DEFAULT `1`)
- `is_active` (BOOLEAN, NOT NULL, DEFAULT `TRUE`)

---

## 9. Domain 9: Farmer Financial Ledger Master

### 9.1 `customer_ledger_accounts`
Aggregated customer account header.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `customer_id` (UUID, NOT NULL, UNIQUE, FK -> `customers.id` ON DELETE RESTRICT)
- `organization_id` (UUID, NOT NULL, FK -> `organizations.id` ON DELETE RESTRICT)
- `currency` (VARCHAR(3), NOT NULL, DEFAULT `'INR'`)
- `current_balance` (NUMERIC(12,2), NOT NULL, DEFAULT `0.00`) — Positive = Dairy liability / Net Payable; Negative = Farmer debt / Net Receivable
- `last_transaction_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

### 9.2 `ledger_transactions`
Immutable financial transaction journal.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `organization_id` (UUID, NOT NULL, FK -> `organizations.id` ON DELETE RESTRICT)
- `center_id` (UUID, NOT NULL, FK -> `dairy_centers.id` ON DELETE RESTRICT)
- `customer_id` (UUID, NOT NULL, FK -> `customers.id` ON DELETE RESTRICT)
- `transaction_type` (VARCHAR(40), NOT NULL) — CHECK (`transaction_type IN ('MILK_COLLECTION_CREDIT', 'FEED_PURCHASE_DEBIT', 'ADVANCE_DEBIT', 'DEDUCTION_DEBIT', 'PAYMENT_PAYOUT_DEBIT', 'LEDGER_ADJUSTMENT_CREDIT', 'LEDGER_ADJUSTMENT_DEBIT', 'COLLECTION_REVERSAL_DEBIT')`)
- `direction` (VARCHAR(10), NOT NULL) — CHECK (`direction IN ('CREDIT', 'DEBIT')`)
- `amount` (NUMERIC(10,2), NOT NULL) — CHECK (`amount > 0`)
- `balance_after` (NUMERIC(12,2), NOT NULL)
- `reference_entity` (VARCHAR(30), NOT NULL) — CHECK (`reference_entity IN ('MILK_COLLECTION', 'FEED_SALE', 'CUSTOMER_ADVANCE', 'CUSTOMER_DEDUCTION', 'CUSTOMER_PAYMENT', 'MANUAL_ADJUSTMENT')`)
- `reference_id` (UUID, NOT NULL)
- `description` (TEXT)
- `idempotency_key` (VARCHAR(128), NOT NULL, UNIQUE)
- `created_by` (UUID, NOT NULL, FK -> `users.id` ON DELETE RESTRICT)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

### 9.3 `ledger_entries`
Double-entry balanced accounting entries.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `transaction_id` (UUID, NOT NULL, FK -> `ledger_transactions.id` ON DELETE CASCADE)
- `account_id` (UUID, NOT NULL)
- `account_type` (VARCHAR(30), NOT NULL) — `'CUSTOMER_PAYABLE'`, `'MILK_PURCHASE_EXPENSE'`, `'FEED_INVENTORY'`, `'CASH_BANK'`, `'ADVANCE_RECEIVABLE'`
- `entry_type` (VARCHAR(10), NOT NULL) — CHECK (`entry_type IN ('DEBIT', 'CREDIT')`)
- `amount` (NUMERIC(10,2), NOT NULL) — CHECK (`amount > 0`)

### 9.4 `customer_advances`
Emergency cash advance loans issued to farmers.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `customer_id` (UUID, NOT NULL, FK -> `customers.id` ON DELETE RESTRICT)
- `center_id` (UUID, NOT NULL, FK -> `dairy_centers.id` ON DELETE RESTRICT)
- `advance_date` (DATE, NOT NULL)
- `principal_amount` (NUMERIC(10,2), NOT NULL) — CHECK (`principal_amount > 0`)
- `recovery_type` (VARCHAR(30), NOT NULL, DEFAULT `'MONTHLY_BILL_DEDUCTION'`) — CHECK (`recovery_type IN ('MONTHLY_BILL_DEDUCTION', 'INSTALLMENTS', 'MANUAL')`)
- `total_recovered_amount` (NUMERIC(10,2), NOT NULL, DEFAULT `0.00`)
- `outstanding_amount` (NUMERIC(10,2), NOT NULL)
- `status` (VARCHAR(20), NOT NULL, DEFAULT `'ACTIVE'`) — CHECK (`status IN ('ACTIVE', 'FULLY_RECOVERED', 'WRITTEN_OFF')`)
- `disbursed_by` (UUID, NOT NULL, FK -> `users.id` ON DELETE RESTRICT)
- `disbursed_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

### 9.5 `customer_deductions`
Authorized periodic operational charges.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `customer_id` (UUID, NOT NULL, FK -> `customers.id` ON DELETE RESTRICT)
- `center_id` (UUID, NOT NULL, FK -> `dairy_centers.id` ON DELETE RESTRICT)
- `deduction_category` (VARCHAR(50), NOT NULL) — CHECK (`deduction_category IN ('VETERINARY_MEDICINE', 'AI_BREEDING_CHARGE', 'CATTLE_INSURANCE', 'MEMBERSHIP_FEE', 'OTHER')`)
- `amount` (NUMERIC(10,2), NOT NULL) — CHECK (`amount > 0`)
- `description` (TEXT)
- `is_applied_to_bill` (BOOLEAN, NOT NULL, DEFAULT `FALSE`)
- `applied_bill_id` (UUID) — Link to `monthly_bills.id`
- `approved_by` (UUID, NOT NULL, FK -> `users.id` ON DELETE RESTRICT)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

### 9.6 `customer_adjustments`
Administrative ledger balance adjustments.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `customer_id` (UUID, NOT NULL, FK -> `customers.id` ON DELETE RESTRICT)
- `adjustment_type` (VARCHAR(10), NOT NULL) — CHECK (`adjustment_type IN ('CREDIT', 'DEBIT')`)
- `amount` (NUMERIC(10,2), NOT NULL) — CHECK (`amount > 0`)
- `reason` (TEXT, NOT NULL)
- `approved_by` (UUID, NOT NULL, FK -> `users.id` ON DELETE RESTRICT)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

---

## 10. Domain 10: Periodic Billing & Statements Master

### 10.1 `billing_periods`
Configurable settlement cycles (calendar month by default).
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `center_id` (UUID, NOT NULL, FK -> `dairy_centers.id` ON DELETE RESTRICT)
- `period_name` (VARCHAR(50), NOT NULL) — e.g. "November 2026"
- `start_date` (DATE, NOT NULL)
- `end_date` (DATE, NOT NULL)
- `period_type` (VARCHAR(20), NOT NULL, DEFAULT `'CALENDAR_MONTH'`) — CHECK (`period_type IN ('CALENDAR_MONTH', 'TEN_DAY', 'CUSTOM')`)
- `status` (VARCHAR(20), NOT NULL, DEFAULT `'OPEN'`) — CHECK (`status IN ('OPEN', 'PROCESSING', 'FINALIZED', 'CLOSED')`)
- `finalized_at` (TIMESTAMPTZ)
- `finalized_by` (UUID, FK -> `users.id` ON DELETE RESTRICT)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)
- *Constraints:* `CONSTRAINT uq_center_billing_period UNIQUE (center_id, start_date, end_date)`

### 10.2 `monthly_bills`
Customer billing settlement sheet.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `billing_period_id` (UUID, NOT NULL, FK -> `billing_periods.id` ON DELETE RESTRICT)
- `customer_id` (UUID, NOT NULL, FK -> `customers.id` ON DELETE RESTRICT)
- `center_id` (UUID, NOT NULL, FK -> `dairy_centers.id` ON DELETE RESTRICT)
- `bill_number` (VARCHAR(50), NOT NULL, UNIQUE) — e.g. `BILL-2026-11-0012`
- `opening_balance` (NUMERIC(12,2), NOT NULL, DEFAULT `0.00`)
- `total_cow_milk_weight` (NUMERIC(8,2), NOT NULL, DEFAULT `0.00`)
- `total_cow_milk_amount` (NUMERIC(10,2), NOT NULL, DEFAULT `0.00`)
- `total_buffalo_milk_weight` (NUMERIC(8,2), NOT NULL, DEFAULT `0.00`)
- `total_buffalo_milk_amount` (NUMERIC(10,2), NOT NULL, DEFAULT `0.00`)
- `gross_milk_amount` (NUMERIC(10,2), NOT NULL, DEFAULT `0.00`)
- `total_feed_deductions` (NUMERIC(10,2), NOT NULL, DEFAULT `0.00`)
- `total_advance_deductions` (NUMERIC(10,2), NOT NULL, DEFAULT `0.00`)
- `total_other_deductions` (NUMERIC(10,2), NOT NULL, DEFAULT `0.00`)
- `net_payable_amount` (NUMERIC(12,2), NOT NULL) — `gross_milk_amount - total_deductions + opening_balance`
- `total_paid_amount` (NUMERIC(12,2), NOT NULL, DEFAULT `0.00`)
- `closing_balance` (NUMERIC(12,2), NOT NULL)
- `bill_status` (VARCHAR(20), NOT NULL, DEFAULT `'DRAFT'`) — CHECK (`bill_status IN ('DRAFT', 'FINALIZED', 'PARTIALLY_PAID', 'FULLY_PAID', 'CANCELLED')`)
- `pdf_storage_path` (VARCHAR(255))
- `finalized_at` (TIMESTAMPTZ)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)
- *Constraints:* `CONSTRAINT uq_customer_bill_per_period UNIQUE (customer_id, billing_period_id)`

### 10.3 `monthly_bill_items`
Itemized collection and deduction records included in a bill.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `bill_id` (UUID, NOT NULL, FK -> `monthly_bills.id` ON DELETE CASCADE)
- `item_type` (VARCHAR(30), NOT NULL) — `'MILK_COLLECTION_SUMMARY'`, `'FEED_SALE'`, `'ADVANCE_RECOVERY'`, `'DEDUCTION'`
- `reference_id` (UUID, NOT NULL)
- `amount` (NUMERIC(10,2), NOT NULL)
- `description` (TEXT)

### 10.4 `monthly_bill_adjustments`
Traceable adjustments made to bills during review.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `bill_id` (UUID, NOT NULL, FK -> `monthly_bills.id` ON DELETE CASCADE)
- `adjustment_type` (VARCHAR(10), NOT NULL) — CHECK (`adjustment_type IN ('CREDIT', 'DEBIT')`)
- `amount` (NUMERIC(10,2), NOT NULL)
- `reason` (TEXT, NOT NULL)
- `authorized_by` (UUID, NOT NULL, FK -> `users.id` ON DELETE RESTRICT)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

### 10.5 `bill_finalization_records`
Immutable cryptographic audit record of approved bills.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `billing_period_id` (UUID, NOT NULL, UNIQUE, FK -> `billing_periods.id` ON DELETE RESTRICT)
- `total_farmers_billed` (INT, NOT NULL)
- `total_gross_milk_amount` (NUMERIC(12,2), NOT NULL)
- `total_net_payout_amount` (NUMERIC(12,2), NOT NULL)
- `finalized_by` (UUID, NOT NULL, FK -> `users.id` ON DELETE RESTRICT)
- `finalized_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

---

## 11. Domain 11: Customer Payments & Settlements Master

### 11.1 `payment_batches`
Bulk payment grouping for bank export or cash settlement.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `center_id` (UUID, NOT NULL, FK -> `dairy_centers.id` ON DELETE RESTRICT)
- `batch_number` (VARCHAR(50), NOT NULL, UNIQUE)
- `total_recipients` (INT, NOT NULL)
- `total_disbursement_amount` (NUMERIC(12,2), NOT NULL)
- `payment_method` (VARCHAR(30), NOT NULL, DEFAULT `'BANK_TRANSFER'`) — CHECK (`payment_method IN ('BANK_TRANSFER', 'CASH', 'UPI', 'CHEQUE')`)
- `batch_status` (VARCHAR(20), NOT NULL, DEFAULT `'DRAFT'`) — CHECK (`batch_status IN ('DRAFT', 'SUBMITTED', 'PROCESSING', 'RECONCILED', 'CANCELLED')`)
- `created_by` (UUID, NOT NULL, FK -> `users.id` ON DELETE RESTRICT)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

### 11.2 `payment_batch_items`
Individual payout instruction inside a batch.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `payment_batch_id` (UUID, NOT NULL, FK -> `payment_batches.id` ON DELETE CASCADE)
- `customer_id` (UUID, NOT NULL, FK -> `customers.id` ON DELETE RESTRICT)
- `bill_id` (UUID, FK -> `monthly_bills.id` ON DELETE SET NULL)
- `amount` (NUMERIC(10,2), NOT NULL) — CHECK (`amount > 0`)
- `status` (VARCHAR(20), NOT NULL, DEFAULT `'PENDING'`) — CHECK (`status IN ('PENDING', 'SUBMITTED', 'SUCCESSFUL', 'FAILED', 'REVERSED')`)
- `bank_reference_number` (VARCHAR(100))

### 11.3 `customer_payments`
Confirmed settlement vouchers posted against the customer ledger.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `center_id` (UUID, NOT NULL, FK -> `dairy_centers.id` ON DELETE RESTRICT)
- `customer_id` (UUID, NOT NULL, FK -> `customers.id` ON DELETE RESTRICT)
- `bill_id` (UUID, FK -> `monthly_bills.id` ON DELETE SET NULL)
- `payment_batch_item_id` (UUID, FK -> `payment_batch_items.id` ON DELETE SET NULL)
- `payment_number` (VARCHAR(50), NOT NULL, UNIQUE)
- `payment_mode` (VARCHAR(20), NOT NULL) — CHECK (`payment_mode IN ('CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE')`)
- `amount` (NUMERIC(10,2), NOT NULL) — CHECK (`amount > 0`)
- `payment_status` (VARCHAR(20), NOT NULL, DEFAULT `'PENDING'`) — CHECK (`payment_status IN ('PENDING', 'SUBMITTED', 'SUCCESSFUL', 'FAILED', 'REVERSED', 'RECONCILED')`)
- `transaction_reference` (VARCHAR(100))
- `paid_at` (TIMESTAMPTZ)
- `disbursed_by` (UUID, NOT NULL, FK -> `users.id` ON DELETE RESTRICT)
- `reconciled_at` (TIMESTAMPTZ)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

### 11.4 `payment_reconciliation_records`
Bank statement match audit record.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `customer_payment_id` (UUID, NOT NULL, UNIQUE, FK -> `customer_payments.id` ON DELETE RESTRICT)
- `bank_statement_reference` (VARCHAR(100), NOT NULL)
- `reconciled_by` (UUID, NOT NULL, FK -> `users.id` ON DELETE RESTRICT)
- `reconciled_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

### 11.5 `payment_adjustments`
Handles bounced transfers, stop-payments, or reversals.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `customer_payment_id` (UUID, NOT NULL, FK -> `customer_payments.id` ON DELETE RESTRICT)
- `adjustment_type` (VARCHAR(20), NOT NULL) — `'REVERSAL'`, `'CHARGEBACK'`, `'FEE_DEDUCTION'`
- `amount` (NUMERIC(10,2), NOT NULL)
- `reason` (TEXT, NOT NULL)
- `adjusted_by` (UUID, NOT NULL, FK -> `users.id` ON DELETE RESTRICT)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

---

## 12. Domain 12: Cattle Feed Inventory Master

### 12.1 `feed_categories`
Product classification (e.g. "Pellet Feed", "Mineral Mixtures", "Fodder Seeds").
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `organization_id` (UUID, NOT NULL, FK -> `organizations.id` ON DELETE RESTRICT)
- `name` (VARCHAR(100), NOT NULL)
- `description` (TEXT)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

### 12.2 `feed_products`
Product master with SKU, unit of measure, and default pricing.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `organization_id` (UUID, NOT NULL, FK -> `organizations.id` ON DELETE RESTRICT)
- `category_id` (UUID, NOT NULL, FK -> `feed_categories.id` ON DELETE RESTRICT)
- `sku` (VARCHAR(50), NOT NULL)
- `name` (VARCHAR(150), NOT NULL)
- `package_weight_kg` (NUMERIC(6,2), NOT NULL) — e.g. `50.00` kg bag
- `unit_of_measure` (VARCHAR(10), NOT NULL, DEFAULT `'BAG'`)
- `standard_cost_price` (NUMERIC(10,2), NOT NULL)
- `standard_sale_price` (NUMERIC(10,2), NOT NULL)
- `reorder_threshold` (INT, NOT NULL, DEFAULT `10`)
- `is_active` (BOOLEAN, NOT NULL, DEFAULT `TRUE`)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)
- *Constraints:* `CONSTRAINT uq_feed_sku_per_org UNIQUE (organization_id, sku)`

### 12.3 `suppliers`
Feed manufacturers and distributors.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `organization_id` (UUID, NOT NULL, FK -> `organizations.id` ON DELETE RESTRICT)
- `name` (VARCHAR(150), NOT NULL)
- `phone` (VARCHAR(20), NOT NULL)
- `address` (TEXT)
- `gst_number` (VARCHAR(20))
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

### 12.4 `feed_purchases`
Stock shipments received from suppliers into center inventory.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `center_id` (UUID, NOT NULL, FK -> `dairy_centers.id` ON DELETE RESTRICT)
- `supplier_id` (UUID, NOT NULL, FK -> `suppliers.id` ON DELETE RESTRICT)
- `invoice_number` (VARCHAR(50), NOT NULL)
- `purchase_date` (DATE, NOT NULL)
- `total_cost` (NUMERIC(12,2), NOT NULL)
- `received_by` (UUID, NOT NULL, FK -> `users.id` ON DELETE RESTRICT)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

### 12.5 `inventory_transactions`
Append-only stock movement ledger.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `center_id` (UUID, NOT NULL, FK -> `dairy_centers.id` ON DELETE RESTRICT)
- `product_id` (UUID, NOT NULL, FK -> `feed_products.id` ON DELETE RESTRICT)
- `transaction_type` (VARCHAR(30), NOT NULL) — CHECK (`transaction_type IN ('PURCHASE_RECEIPT', 'SALE_DISPATCH', 'RETURN_INWARD', 'DAMAGED_WRITEOFF', 'AUDIT_CORRECTION')`)
- `quantity_delta` (INT, NOT NULL) — Positive for stock in, negative for stock out
- `stock_balance_after` (INT, NOT NULL) — CHECK (`stock_balance_after >= 0` unless policy allows negative)
- `reference_id` (UUID, NOT NULL)
- `created_by` (UUID, NOT NULL, FK -> `users.id` ON DELETE RESTRICT)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

### 12.6 `feed_sales`
Retail sales of cattle feed to farmers.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `center_id` (UUID, NOT NULL, FK -> `dairy_centers.id` ON DELETE RESTRICT)
- `customer_id` (UUID, NOT NULL, FK -> `customers.id` ON DELETE RESTRICT)
- `invoice_number` (VARCHAR(50), NOT NULL, UNIQUE)
- `sale_date` (DATE, NOT NULL)
- `total_amount` (NUMERIC(10,2), NOT NULL)
- `payment_type` (VARCHAR(20), NOT NULL, DEFAULT `'CREDIT_LEDGER'`) — CHECK (`payment_type IN ('CREDIT_LEDGER', 'CASH')`)
- `is_posted_to_ledger` (BOOLEAN, NOT NULL, DEFAULT `TRUE`)
- `sold_by` (UUID, NOT NULL, FK -> `users.id` ON DELETE RESTRICT)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

### 12.7 `feed_sale_items`
Individual line items on a feed invoice.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `feed_sale_id` (UUID, NOT NULL, FK -> `feed_sales.id` ON DELETE CASCADE)
- `product_id` (UUID, NOT NULL, FK -> `feed_products.id` ON DELETE RESTRICT)
- `quantity` (INT, NOT NULL) — CHECK (`quantity > 0`)
- `unit_price` (NUMERIC(10,2), NOT NULL)
- `subtotal` (NUMERIC(10,2), NOT NULL)

### 12.8 `stock_adjustments`
Physical stock reconciliation audits.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `center_id` (UUID, NOT NULL, FK -> `dairy_centers.id` ON DELETE RESTRICT)
- `product_id` (UUID, NOT NULL, FK -> `feed_products.id` ON DELETE RESTRICT)
- `system_quantity` (INT, NOT NULL)
- `physical_quantity` (INT, NOT NULL)
- `adjustment_quantity` (INT, NOT NULL)
- `reason` (TEXT, NOT NULL)
- `authorized_by` (UUID, NOT NULL, FK -> `users.id` ON DELETE RESTRICT)
- `adjusted_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

---

## 13. Domain 13: Employee Master & Independent Payroll Master

### 13.1 `employees`
Internal dairy workers, intake operators, and supervisors.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `organization_id` (UUID, NOT NULL, FK -> `organizations.id` ON DELETE RESTRICT)
- `user_id` (UUID, UNIQUE, FK -> `users.id` ON DELETE SET NULL)
- `employee_code` (VARCHAR(30), NOT NULL, UNIQUE)
- `full_name` (VARCHAR(150), NOT NULL)
- `contact_phone` (VARCHAR(20), NOT NULL)
- `joining_date` (DATE, NOT NULL)
- `status` (VARCHAR(20), NOT NULL, DEFAULT `'ACTIVE'`) — CHECK (`status IN ('ACTIVE', 'ON_LEAVE', 'TERMINATED', 'RESIGNED')`)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)
- `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

### 13.2 `employee_roles`
Job roles (`COLLECTION_OPERATOR`, `SUPERVISOR`, `ACCOUNTANT`, `MANAGER`, `DRIVER`).
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `role_name` (VARCHAR(50), NOT NULL, UNIQUE)
- `description` (TEXT)

### 13.3 `employee_center_assignments`
Maps employees to work locations.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `employee_id` (UUID, NOT NULL, FK -> `employees.id` ON DELETE CASCADE)
- `center_id` (UUID, NOT NULL, FK -> `dairy_centers.id` ON DELETE RESTRICT)
- `is_primary` (BOOLEAN, NOT NULL, DEFAULT `TRUE`)
- *Constraints:* `CONSTRAINT uq_emp_center UNIQUE (employee_id, center_id)`

### 13.4 `employee_attendance`
Shift attendance log.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `employee_id` (UUID, NOT NULL, FK -> `employees.id` ON DELETE CASCADE)
- `attendance_date` (DATE, NOT NULL)
- `shift_type` (VARCHAR(10), NOT NULL) — CHECK (`shift_type IN ('MORNING', 'EVENING', 'FULL_DAY')`)
- `status` (VARCHAR(20), NOT NULL) — CHECK (`status IN ('PRESENT', 'ABSENT', 'HALF_DAY', 'PAID_LEAVE')`)
- `recorded_by` (UUID, NOT NULL, FK -> `users.id` ON DELETE RESTRICT)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)
- *Constraints:* `CONSTRAINT uq_emp_attendance_date_shift UNIQUE (employee_id, attendance_date, shift_type)`

### 13.5 `salary_structures`
Compensation formula per employee.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `employee_id` (UUID, NOT NULL, UNIQUE, FK -> `employees.id` ON DELETE CASCADE)
- `monthly_base_salary` (NUMERIC(10,2), NOT NULL)
- `daily_wage_rate` (NUMERIC(10,2))
- `overtime_hourly_rate` (NUMERIC(10,2))
- `standard_allowances` (NUMERIC(10,2), NOT NULL, DEFAULT `0.00`)
- `standard_deductions` (NUMERIC(10,2), NOT NULL, DEFAULT `0.00`)
- `effective_from` (DATE, NOT NULL)
- `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

### 13.6 `payroll_runs`
Monthly salary execution batch.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `organization_id` (UUID, NOT NULL, FK -> `organizations.id` ON DELETE RESTRICT)
- `center_id` (UUID, NOT NULL, FK -> `dairy_centers.id` ON DELETE RESTRICT)
- `payroll_period_month` (SMALLINT, NOT NULL) — 1 to 12
- `payroll_period_year` (INT, NOT NULL)
- `total_gross_salary` (NUMERIC(12,2), NOT NULL)
- `total_deductions` (NUMERIC(12,2), NOT NULL)
- `total_net_payout` (NUMERIC(12,2), NOT NULL)
- `status` (VARCHAR(20), NOT NULL, DEFAULT `'DRAFT'`) — CHECK (`status IN ('DRAFT', 'APPROVED', 'DISBURSED', 'CANCELLED')`)
- `approved_by` (UUID, FK -> `users.id` ON DELETE RESTRICT)
- `approved_at` (TIMESTAMPTZ)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)
- *Constraints:* `CONSTRAINT uq_payroll_period UNIQUE (center_id, payroll_period_month, payroll_period_year)`

### 13.7 `payroll_items`
Individual employee pay slip.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `payroll_run_id` (UUID, NOT NULL, FK -> `payroll_runs.id` ON DELETE CASCADE)
- `employee_id` (UUID, NOT NULL, FK -> `employees.id` ON DELETE RESTRICT)
- `days_worked` (NUMERIC(4,1), NOT NULL)
- `base_salary_earned` (NUMERIC(10,2), NOT NULL)
- `overtime_pay` (NUMERIC(10,2), NOT NULL, DEFAULT `0.00`)
- `allowances` (NUMERIC(10,2), NOT NULL, DEFAULT `0.00`)
- `advance_deductions` (NUMERIC(10,2), NOT NULL, DEFAULT `0.00`)
- `other_deductions` (NUMERIC(10,2), NOT NULL, DEFAULT `0.00`)
- `net_salary` (NUMERIC(10,2), NOT NULL)
- `payment_status` (VARCHAR(20), NOT NULL, DEFAULT `'PENDING'`)

### 13.8 `employee_advances`
Staff advance loan records (strictly isolated from farmer advances).
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `employee_id` (UUID, NOT NULL, FK -> `employees.id` ON DELETE RESTRICT)
- `advance_date` (DATE, NOT NULL)
- `amount` (NUMERIC(10,2), NOT NULL)
- `recovered_amount` (NUMERIC(10,2), NOT NULL, DEFAULT `0.00`)
- `outstanding_amount` (NUMERIC(10,2), NOT NULL)
- `status` (VARCHAR(20), NOT NULL, DEFAULT `'ACTIVE'`)
- `disbursed_by` (UUID, NOT NULL, FK -> `users.id` ON DELETE RESTRICT)

### 13.9 `employee_expenses`
Operational expense reimbursements.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `center_id` (UUID, NOT NULL, FK -> `dairy_centers.id` ON DELETE RESTRICT)
- `employee_id` (UUID, NOT NULL, FK -> `employees.id` ON DELETE RESTRICT)
- `expense_category` (VARCHAR(50), NOT NULL)
- `amount` (NUMERIC(10,2), NOT NULL)
- `receipt_url` (VARCHAR(255))
- `status` (VARCHAR(20), NOT NULL, DEFAULT `'PENDING'`)
- `approved_by` (UUID, FK -> `users.id` ON DELETE RESTRICT)

### 13.10 `employee_payment_records`
Confirmed staff salary disbursement records.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `payroll_item_id` (UUID, NOT NULL, UNIQUE, FK -> `payroll_items.id` ON DELETE RESTRICT)
- `payment_mode` (VARCHAR(20), NOT NULL) — `'BANK_TRANSFER'`, `'CASH'`, `'CHEQUE'`
- `amount` (NUMERIC(10,2), NOT NULL)
- `transaction_reference` (VARCHAR(100))
- `paid_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

---

## 14. Domain 14: Edge Device & Offline Synchronization Master

### 14.1 `devices`
Authorized counter PCs, Android tablets, and mobile devices.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `organization_id` (UUID, NOT NULL, FK -> `organizations.id` ON DELETE RESTRICT)
- `center_id` (UUID, NOT NULL, FK -> `dairy_centers.id` ON DELETE RESTRICT)
- `device_identifier` (VARCHAR(100), NOT NULL, UNIQUE) — Hardware fingerprint
- `device_type` (VARCHAR(30), NOT NULL) — CHECK (`device_type IN ('REGISTRATION_TABLET', 'COUNTER_TERMINAL', 'MOBILE_COLLECTOR')`)
- `public_key` (TEXT) — For verifying signed offline sync batches
- `status` (VARCHAR(20), NOT NULL, DEFAULT `'ACTIVE'`) — CHECK (`status IN ('ACTIVE', 'BLOCKED', 'DECOMMISSIONED')`)
- `last_seen_at` (TIMESTAMPTZ)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

### 14.2 `device_sync_state`
Replication state and cursor position per registered device.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `device_id` (UUID, NOT NULL, UNIQUE, FK -> `devices.id` ON DELETE CASCADE)
- `last_upstream_sync_at` (TIMESTAMPTZ)
- `last_downstream_sync_at` (TIMESTAMPTZ)
- `downstream_cursor` (BIGINT, NOT NULL, DEFAULT `0`)
- `client_app_version` (VARCHAR(30))
- `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

### 14.3 `sync_events`
Global append-only replication event log for downstream client pulls.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `event_sequence` (BIGSERIAL, UNIQUE) — Monotonically increasing sync cursor
- `organization_id` (UUID, NOT NULL, FK -> `organizations.id` ON DELETE RESTRICT)
- `center_id` (UUID) — NULL = Global Org event
- `entity_type` (VARCHAR(50), NOT NULL) — `'CUSTOMER'`, `'FACE_ENROLLMENT'`, `'RFID_CARD'`, `'RATE_CHART'`, `'SETTING'`
- `entity_id` (UUID, NOT NULL)
- `action` (VARCHAR(20), NOT NULL) — `'INSERT'`, `'UPDATE'`, `'DELETE'`, `'RESTORE'`
- `payload` (JSONB, NOT NULL)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

### 14.4 `sync_tombstones`
Replication tombstones for immediate downstream deletion propagation.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `tombstone_sequence` (BIGSERIAL, UNIQUE) — High-water mark cursor
- `organization_id` (UUID, NOT NULL, FK -> `organizations.id` ON DELETE RESTRICT)
- `center_id` (UUID)
- `entity_type` (VARCHAR(50), NOT NULL) — `'CUSTOMER'`, `'FACE_ENROLLMENT'`, `'RFID_CARD'`, `'RATE_CHART'`
- `entity_id` (UUID, NOT NULL)
- `reason` (TEXT, NOT NULL)
- `deleted_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

### 14.5 `sync_conflict_records`
Audit log of rejected offline sync events.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `device_id` (UUID, NOT NULL, FK -> `devices.id` ON DELETE CASCADE)
- `idempotency_key` (VARCHAR(128), NOT NULL)
- `entity_type` (VARCHAR(50), NOT NULL)
- `entity_id` (UUID, NOT NULL)
- `conflict_reason` (VARCHAR(100), NOT NULL) — e.g. `'CUSTOMER_SUSPENDED_ON_SERVER'`
- `client_payload` (JSONB, NOT NULL)
- `server_state` (JSONB)
- `resolved_by` (UUID, FK -> `users.id` ON DELETE SET NULL)
- `recorded_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

---

## 15. Domain 15: System Audit & Communications Master

### 15.1 `audit_logs`
System-wide immutable security audit log.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `organization_id` (UUID, NOT NULL, FK -> `organizations.id` ON DELETE RESTRICT)
- `center_id` (UUID)
- `user_id` (UUID, FK -> `users.id` ON DELETE SET NULL)
- `action` (VARCHAR(100), NOT NULL) — e.g. `'RATE_CHART_ACTIVATED'`, `'CUSTOMER_RESTORED'`
- `entity_type` (VARCHAR(50), NOT NULL)
- `entity_id` (UUID, NOT NULL)
- `old_values` (JSONB)
- `new_values` (JSONB)
- `ip_address` (VARCHAR(50))
- `user_agent` (TEXT)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

### 15.2 `approval_records`
Multi-level administrative approvals.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `organization_id` (UUID, NOT NULL, FK -> `organizations.id` ON DELETE RESTRICT)
- `approval_type` (VARCHAR(50), NOT NULL) — `'MONTHLY_BILLING'`, `'RATE_CHANGE'`, `'PAYROLL_RUN'`
- `entity_id` (UUID, NOT NULL)
- `requested_by` (UUID, NOT NULL, FK -> `users.id` ON DELETE RESTRICT)
- `approved_by` (UUID, NOT NULL, FK -> `users.id` ON DELETE RESTRICT)
- `status` (VARCHAR(20), NOT NULL) — `'APPROVED'`, `'REJECTED'`
- `notes` (TEXT)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

### 15.3 `notification_records`
Mobile push and in-app notifications.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `customer_id` (UUID, NOT NULL, FK -> `customers.id` ON DELETE CASCADE)
- `title` (VARCHAR(150), NOT NULL)
- `body` (TEXT, NOT NULL)
- `notification_type` (VARCHAR(30), NOT NULL) — `'COLLECTION_SLIP'`, `'BILL_SUMMARY'`, `'RATE_REVISION'`
- `reference_id` (UUID)
- `is_read` (BOOLEAN, NOT NULL, DEFAULT `FALSE`)
- `sent_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

### 15.4 `notification_delivery_logs`
FCM delivery status telemetry.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `notification_id` (UUID, NOT NULL, FK -> `notification_records.id` ON DELETE CASCADE)
- `device_token` (TEXT, NOT NULL)
- `delivery_status` (VARCHAR(20), NOT NULL) — `'DELIVERED'`, `'FAILED'`
- `response_payload` (JSONB)
- `dispatched_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

### 15.5 `whatsapp_customer_mappings`
Customer opt-in telephone mapping for WhatsApp Business API.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `customer_id` (UUID, NOT NULL, UNIQUE, FK -> `customers.id` ON DELETE CASCADE)
- `whatsapp_phone_number` (VARCHAR(20), NOT NULL)
- `is_opted_in` (BOOLEAN, NOT NULL, DEFAULT `TRUE`)
- `opted_in_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

### 15.6 `whatsapp_messages`
Outbound WhatsApp slip dispatch logs.
- `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
- `customer_id` (UUID, NOT NULL, FK -> `customers.id` ON DELETE CASCADE)
- `message_template` (VARCHAR(50), NOT NULL) — e.g. `'dfarm_daily_collection_slip'`
- `reference_type` (VARCHAR(30), NOT NULL) — `'MILK_COLLECTION'`, `'MONTHLY_BILL'`
- `reference_id` (UUID, NOT NULL)
- `wamid` (VARCHAR(100)) — WhatsApp Message ID from Meta API
- `delivery_status` (VARCHAR(20), NOT NULL, DEFAULT `'SENT'`) — `'SENT'`, `'DELIVERED'`, `'READ'`, `'FAILED'`
- `dispatched_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `NOW()`)

