# DFarm: Complete Entity-Relationship (ER) Diagrams
**Phase 03 of 20: Visual Database Architecture & Relationship Schemas**

---

## 1. Complete System Entity-Relationship Architecture

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ DAIRY_CENTERS : owns
    ORGANIZATIONS ||--o{ USERS : employs
    DAIRY_CENTERS ||--|| CENTER_SETTINGS : configures
    DAIRY_CENTERS ||--o{ COLLECTION_SHIFTS : schedules
    DAIRY_CENTERS ||--o{ CUSTOMERS : registers
    DAIRY_CENTERS ||--o{ MILK_COLLECTIONS : collects
    DAIRY_CENTERS ||--o{ BILLING_PERIODS : manages
    
    CUSTOMERS ||--o{ CUSTOMER_MILK_CATEGORIES : authorized_for
    CUSTOMERS ||--o{ FACE_ENROLLMENTS : enrolled_with
    CUSTOMERS ||--o{ RFID_CARD_ASSIGNMENTS : assigned_to
    CUSTOMERS ||--|| CUSTOMER_LEDGER_ACCOUNTS : maintains
    CUSTOMERS ||--o{ COLLECTION_SESSIONS : attends
    CUSTOMERS ||--o{ MONTHLY_BILLS : receives
    CUSTOMERS ||--o{ FEED_SALES : purchases

    COLLECTION_SESSIONS ||--|| MILK_COLLECTIONS : finalizes
    RATE_CHART_VERSIONS ||--o{ MILK_COLLECTIONS : prices
    MILK_COLLECTIONS ||--|| LEDGER_TRANSACTIONS : posts_credit
    FEED_SALES ||--|| LEDGER_TRANSACTIONS : posts_debit
    MONTHLY_BILLS ||--o{ CUSTOMER_PAYMENTS : settles
```

---

## 2. Customer Identity, Biometric & RFID Subgraph

```mermaid
erDiagram
    CUSTOMERS {
        uuid id PK
        uuid organization_id FK
        uuid primary_center_id FK
        varchar farmer_code UK
        varchar full_name
        varchar normalized_mobile_number UK
        varchar status
        boolean is_deleted
        bigint version
    }

    CUSTOMER_MILK_CATEGORIES {
        uuid id PK
        uuid customer_id FK
        varchar milk_category
        boolean is_authorized
    }

    FACE_ENROLLMENTS {
        uuid id PK
        uuid customer_id FK
        uuid model_version_id FK
        bytea embedding_encrypted
        bytea embedding_iv
        numeric quality_score
        varchar status
    }

    FACE_MODEL_VERSIONS {
        uuid id PK
        varchar model_name
        varchar model_version
        int embedding_dimension
        numeric recommended_threshold
    }

    RFID_CARDS {
        uuid id PK
        uuid organization_id FK
        varchar card_uid UK
        varchar status
    }

    RFID_CARD_ASSIGNMENTS {
        uuid id PK
        uuid rfid_card_id FK
        uuid customer_id FK
        boolean is_active
        timestamptz assigned_at
    }

    IDENTIFICATION_AUDIT_LOGS {
        uuid id PK
        uuid center_id FK
        uuid customer_id FK
        varchar identification_method
        varchar verification_outcome
        numeric face_match_score
    }

    SUPERVISOR_VERIFICATION_RECORDS {
        uuid id PK
        uuid audit_log_id FK
        uuid supervisor_id FK
        varchar reason_category
        text justification_notes
    }

    CUSTOMERS ||--o{ CUSTOMER_MILK_CATEGORIES : permits
    CUSTOMERS ||--o{ FACE_ENROLLMENTS : possesses
    FACE_MODEL_VERSIONS ||--o{ FACE_ENROLLMENTS : versioned_by
    CUSTOMERS ||--o{ RFID_CARD_ASSIGNMENTS : assigned
    RFID_CARDS ||--o{ RFID_CARD_ASSIGNMENTS : binds
    CUSTOMERS ||--o{ IDENTIFICATION_AUDIT_LOGS : identified_in
    IDENTIFICATION_AUDIT_LOGS ||--|| SUPERVISOR_VERIFICATION_RECORDS : audited_by
```

---

## 3. Milk Intake, Quality & Rate Snapshots Subgraph

```mermaid
erDiagram
    COLLECTION_SHIFTS {
        uuid id PK
        uuid center_id FK
        varchar shift_type
        time start_time
        time end_time
    }

    COLLECTION_SESSIONS {
        uuid id PK
        uuid center_id FK
        uuid customer_id FK
        uuid shift_id FK
        date business_date
        varchar selected_milk_category
        varchar session_state
        uuid intake_sequence_uuid
    }

    COLLECTION_QUALITY_READINGS {
        uuid id PK
        uuid session_id FK
        numeric fat_percentage
        numeric snf_percentage
        varchar validation_status
    }

    COLLECTION_WEIGHT_READINGS {
        uuid id PK
        uuid session_id FK
        numeric net_weight
        varchar measurement_unit
    }

    MILK_COLLECTIONS {
        uuid id PK
        uuid session_id FK
        uuid customer_id FK
        uuid rate_chart_version_id FK
        numeric net_weight
        numeric fat_percentage
        numeric snf_percentage
        numeric applied_rate_per_unit
        numeric total_amount
        varchar idempotency_key UK
    }

    RATE_CHARTS {
        uuid id PK
        uuid organization_id FK
        varchar name
        varchar milk_category
        varchar pricing_type
    }

    RATE_CHART_VERSIONS {
        uuid id PK
        uuid rate_chart_id FK
        int version_number
        timestamptz effective_from
        timestamptz effective_to
    }

    RATE_CHART_CELLS {
        uuid id PK
        uuid rate_chart_version_id FK
        numeric fat_percentage
        numeric snf_percentage
        numeric rate_per_unit
    }

    COLLECTION_SHIFTS ||--o{ COLLECTION_SESSIONS : schedules
    COLLECTION_SESSIONS ||--|| COLLECTION_QUALITY_READINGS : measures_quality
    COLLECTION_SESSIONS ||--|| COLLECTION_WEIGHT_READINGS : measures_weight
    COLLECTION_SESSIONS ||--|| MILK_COLLECTIONS : completes
    RATE_CHARTS ||--o{ RATE_CHART_VERSIONS : releases
    RATE_CHART_VERSIONS ||--o{ RATE_CHART_CELLS : defines_matrix
    RATE_CHART_VERSIONS ||--o{ MILK_COLLECTIONS : applies_to
```

---

## 4. Farmer Financial Ledger & Billing Subgraph

```mermaid
erDiagram
    CUSTOMER_LEDGER_ACCOUNTS {
        uuid id PK
        uuid customer_id FK
        numeric current_balance
        timestamptz last_transaction_at
    }

    LEDGER_TRANSACTIONS {
        uuid id PK
        uuid customer_id FK
        varchar transaction_type
        varchar direction
        numeric amount
        numeric balance_after
        varchar reference_entity
        uuid reference_id
        varchar idempotency_key UK
    }

    CUSTOMER_ADVANCES {
        uuid id PK
        uuid customer_id FK
        numeric principal_amount
        numeric outstanding_amount
        varchar status
    }

    BILLING_PERIODS {
        uuid id PK
        uuid center_id FK
        date start_date
        date end_date
        varchar status
    }

    MONTHLY_BILLS {
        uuid id PK
        uuid billing_period_id FK
        uuid customer_id FK
        varchar bill_number UK
        numeric gross_milk_amount
        numeric total_feed_deductions
        numeric total_advance_deductions
        numeric net_payable_amount
        varchar bill_status
    }

    CUSTOMER_PAYMENTS {
        uuid id PK
        uuid customer_id FK
        uuid bill_id FK
        varchar payment_number UK
        varchar payment_mode
        numeric amount
        varchar payment_status
    }

    CUSTOMER_LEDGER_ACCOUNTS ||--o{ LEDGER_TRANSACTIONS : posts_to
    BILLING_PERIODS ||--o{ MONTHLY_BILLS : aggregates
    MONTHLY_BILLS ||--o{ CUSTOMER_PAYMENTS : settles
    LEDGER_TRANSACTIONS ||--o{ CUSTOMER_ADVANCES : tracks_advance
```

---

## 5. Employee Master & Isolated Payroll Subgraph

```mermaid
erDiagram
    EMPLOYEES {
        uuid id PK
        uuid organization_id FK
        uuid user_id FK
        varchar employee_code UK
        varchar full_name
        date joining_date
        varchar status
    }

    SALARY_STRUCTURES {
        uuid id PK
        uuid employee_id FK
        numeric monthly_base_salary
        numeric daily_wage_rate
        numeric standard_allowances
    }

    EMPLOYEE_ATTENDANCE {
        uuid id PK
        uuid employee_id FK
        date attendance_date
        varchar shift_type
        varchar status
    }

    PAYROLL_RUNS {
        uuid id PK
        uuid center_id FK
        smallint payroll_period_month
        int payroll_period_year
        numeric total_net_payout
        varchar status
    }

    PAYROLL_ITEMS {
        uuid id PK
        uuid payroll_run_id FK
        uuid employee_id FK
        numeric days_worked
        numeric base_salary_earned
        numeric net_salary
        varchar payment_status
    }

    EMPLOYEES ||--|| SALARY_STRUCTURES : defines_pay
    EMPLOYEES ||--o{ EMPLOYEE_ATTENDANCE : attends
    PAYROLL_RUNS ||--o{ PAYROLL_ITEMS : calculates
    EMPLOYEES ||--o{ PAYROLL_ITEMS : receives_pay
```

---

## 6. Offline Synchronization & Replication Subgraph

```mermaid
erDiagram
    DEVICES {
        uuid id PK
        uuid center_id FK
        varchar device_identifier UK
        varchar device_type
        text public_key
        varchar status
    }

    DEVICE_SYNC_STATE {
        uuid id PK
        uuid device_id FK
        timestamptz last_upstream_sync_at
        timestamptz last_downstream_sync_at
        bigint downstream_cursor
    }

    SYNC_EVENTS {
        uuid id PK
        bigserial event_sequence UK
        varchar entity_type
        uuid entity_id
        varchar action
        jsonb payload
    }

    SYNC_TOMBSTONES {
        uuid id PK
        bigserial tombstone_sequence UK
        varchar entity_type
        uuid entity_id
        text reason
        timestamptz deleted_at
    }

    DEVICES ||--|| DEVICE_SYNC_STATE : tracks
    DEVICES ||--o{ SYNC_EVENTS : reads_from
    DEVICES ||--o{ SYNC_TOMBSTONES : invalidates_via
```

