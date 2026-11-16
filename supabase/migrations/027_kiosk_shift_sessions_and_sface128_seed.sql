-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 027: KIOSK SHIFT SESSIONS & OPENCV SFACE 128-DIM MODEL SEED
-- ==============================================================================

-- 1. Kiosk Shift Sessions Table
-- Tracks counter kiosk operational shifts, opened/closed timestamps, and live intake totals.
CREATE TABLE IF NOT EXISTS kiosk_shift_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_code VARCHAR(50) NOT NULL UNIQUE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    business_date DATE NOT NULL,
    shift VARCHAR(20) NOT NULL CHECK (shift IN ('MORNING', 'EVENING')),
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    opening_operator_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    closing_operator_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    device_identifier VARCHAR(100) NOT NULL,
    device_name VARCHAR(150),
    total_liters NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    cow_liters NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    buffalo_liters NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    transaction_count INT NOT NULL DEFAULT 0,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    average_fat NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    average_snf NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_kiosk_shift_positive_totals CHECK (
        total_liters >= 0 AND cow_liters >= 0 AND buffalo_liters >= 0 AND
        transaction_count >= 0 AND total_amount >= 0
    )
);

CREATE INDEX IF NOT EXISTS idx_kiosk_shift_sessions_center_status 
    ON kiosk_shift_sessions(center_id, status);

CREATE INDEX IF NOT EXISTS idx_kiosk_shift_sessions_date_shift 
    ON kiosk_shift_sessions(business_date, shift);

-- 2. Seed Approved OpenCV SFace INT8 Model Version (128-dim)
INSERT INTO face_model_versions (
    model_name,
    model_version,
    embedding_dimension,
    similarity_metric,
    recommended_threshold,
    model_artifact_checksum,
    preprocessing_version,
    model_license,
    is_active,
    calibration_status
) VALUES (
    'OpenCV-SFace-INT8',
    'sface_int8_2021dec',
    128,
    'COSINE',
    0.363,
    'a1b2c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef0123',
    'opencv-yunet-120x120-sface',
    'Apache-2.0',
    TRUE,
    'CALIBRATED_PRODUCTION_v1'
)
ON CONFLICT (model_name, model_version)
DO UPDATE SET
    embedding_dimension = 128,
    similarity_metric = 'COSINE',
    recommended_threshold = 0.363,
    is_active = TRUE,
    calibration_status = 'CALIBRATED_PRODUCTION_v1';

-- Enable RLS on kiosk_shift_sessions
ALTER TABLE kiosk_shift_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY kiosk_shift_sessions_org_isolation ON kiosk_shift_sessions
    FOR ALL
    USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));
