-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 008: COLLECTION SESSIONS AND TRANSACTIONS
-- ==============================================================================

-- 1. Collection Sessions
CREATE TABLE IF NOT EXISTS collection_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    business_date DATE NOT NULL,
    shift_id UUID NOT NULL REFERENCES collection_shifts(id) ON DELETE RESTRICT,
    shift_type VARCHAR(10) NOT NULL,
    selected_milk_category VARCHAR(20) NOT NULL,
    identification_method VARCHAR(30) NOT NULL,
    identification_log_id UUID REFERENCES identification_audit_logs(id) ON DELETE SET NULL,
    session_state VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    intake_sequence_uuid UUID NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    operator_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    device_id VARCHAR(100) NOT NULL,
    CONSTRAINT chk_session_shift_type CHECK (shift_type IN ('MORNING', 'EVENING')),
    CONSTRAINT chk_session_milk_category CHECK (selected_milk_category IN ('COW', 'BUFFALO')),
    CONSTRAINT chk_session_id_method CHECK (identification_method IN ('FACE', 'RFID', 'SUPERVISOR_MANUAL')),
    CONSTRAINT chk_session_state CHECK (session_state IN ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS idx_collection_sessions_cust ON collection_sessions(customer_id);
CREATE INDEX IF NOT EXISTS idx_collection_sessions_center_date ON collection_sessions(center_id, business_date, shift_type);

-- 2. Quality Readings (Fat% and SNF%)
CREATE TABLE IF NOT EXISTS collection_quality_readings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES collection_sessions(id) ON DELETE CASCADE,
    fat_percentage NUMERIC(3,1) NOT NULL,
    snf_percentage NUMERIC(3,1) NOT NULL,
    density_clr NUMERIC(4,1),
    validation_status VARCHAR(20) NOT NULL DEFAULT 'VALID',
    reading_source VARCHAR(30) NOT NULL DEFAULT 'MANUAL_ENTRY',
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_quality_fat CHECK (fat_percentage >= 1.5 AND fat_percentage <= 15.0),
    CONSTRAINT chk_quality_snf CHECK (snf_percentage >= 5.0 AND snf_percentage <= 13.0),
    CONSTRAINT chk_quality_validation_status CHECK (validation_status IN ('VALID', 'OUT_OF_BOUNDS_OVERRIDDEN', 'SUSPICIOUS')),
    CONSTRAINT chk_quality_source CHECK (reading_source IN ('MANUAL_ENTRY', 'SOFTWARE_SIMULATOR', 'HARDWARE_INTERFACE'))
);

CREATE INDEX IF NOT EXISTS idx_quality_readings_session ON collection_quality_readings(session_id);

-- 3. Weight Readings
CREATE TABLE IF NOT EXISTS collection_weight_readings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES collection_sessions(id) ON DELETE CASCADE,
    measured_weight NUMERIC(6,2) NOT NULL,
    measurement_unit VARCHAR(10) NOT NULL DEFAULT 'KG',
    tare_weight NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    net_weight NUMERIC(6,2) NOT NULL,
    validation_status VARCHAR(20) NOT NULL DEFAULT 'VALID',
    reading_source VARCHAR(30) NOT NULL DEFAULT 'MANUAL_ENTRY',
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_weight_positive CHECK (net_weight > 0.00),
    CONSTRAINT chk_weight_unit CHECK (measurement_unit IN ('KG', 'LITERS')),
    CONSTRAINT chk_weight_validation_status CHECK (validation_status IN ('VALID', 'OUT_OF_BOUNDS_OVERRIDDEN')),
    CONSTRAINT chk_weight_source CHECK (reading_source IN ('MANUAL_ENTRY', 'SOFTWARE_SIMULATOR', 'HARDWARE_INTERFACE'))
);

CREATE INDEX IF NOT EXISTS idx_weight_readings_session ON collection_weight_readings(session_id);

-- 4. Finalized Milk Collections
CREATE TABLE IF NOT EXISTS milk_collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL UNIQUE REFERENCES collection_sessions(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    business_date DATE NOT NULL,
    shift_type VARCHAR(10) NOT NULL,
    milk_category VARCHAR(20) NOT NULL,
    net_weight NUMERIC(6,2) NOT NULL,
    measurement_unit VARCHAR(10) NOT NULL DEFAULT 'KG',
    fat_percentage NUMERIC(3,1) NOT NULL,
    snf_percentage NUMERIC(3,1) NOT NULL,
    rate_chart_version_id UUID NOT NULL REFERENCES rate_chart_versions(id) ON DELETE RESTRICT,
    applied_rate_per_unit NUMERIC(6,2) NOT NULL,
    total_amount NUMERIC(10,2) NOT NULL,
    transaction_status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED',
    client_intake_uuid UUID NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_collection_weight CHECK (net_weight > 0.00),
    CONSTRAINT chk_collection_amount CHECK (total_amount >= 0.00),
    CONSTRAINT chk_collection_shift CHECK (shift_type IN ('MORNING', 'EVENING')),
    CONSTRAINT chk_collection_category CHECK (milk_category IN ('COW', 'BUFFALO')),
    CONSTRAINT chk_collection_status CHECK (transaction_status IN ('COMPLETED', 'REVERSED', 'ADJUSTED', 'RECONCILIATION_REQUIRED'))
);

CREATE INDEX IF NOT EXISTS idx_milk_collections_cust ON milk_collections(customer_id);
CREATE INDEX IF NOT EXISTS idx_milk_collections_shift_summary 
ON milk_collections (center_id, business_date, shift_type, milk_category);

-- 5. Collection Receipts
CREATE TABLE IF NOT EXISTS collection_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id UUID NOT NULL UNIQUE REFERENCES milk_collections(id) ON DELETE RESTRICT,
    receipt_number VARCHAR(50) NOT NULL UNIQUE,
    printed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    print_count INT NOT NULL DEFAULT 1,
    reprint_reason TEXT
);

-- 6. Collection Adjustments
CREATE TABLE IF NOT EXISTS collection_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id UUID NOT NULL REFERENCES milk_collections(id) ON DELETE RESTRICT,
    original_weight NUMERIC(6,2) NOT NULL,
    new_weight NUMERIC(6,2) NOT NULL,
    original_fat NUMERIC(3,1) NOT NULL,
    new_fat NUMERIC(3,1) NOT NULL,
    original_snf NUMERIC(3,1) NOT NULL,
    new_snf NUMERIC(3,1) NOT NULL,
    original_amount NUMERIC(10,2) NOT NULL,
    new_amount NUMERIC(10,2) NOT NULL,
    adjustment_difference NUMERIC(10,2) NOT NULL,
    reason TEXT NOT NULL,
    adjusted_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    adjusted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_collection_adj_collection ON collection_adjustments(collection_id);

-- 7. Collection Reversals
CREATE TABLE IF NOT EXISTS collection_reversals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id UUID NOT NULL UNIQUE REFERENCES milk_collections(id) ON DELETE RESTRICT,
    reversed_amount NUMERIC(10,2) NOT NULL,
    reversal_reason TEXT NOT NULL,
    authorized_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reversed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

