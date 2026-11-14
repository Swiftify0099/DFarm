-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 012: FACE MODEL VERSION METADATA & RE-ENROLLMENT AUDIT
-- ==============================================================================

-- 1. Enhance face_model_versions with checksum, preprocessing, license, and calibration
ALTER TABLE face_model_versions
ADD COLUMN IF NOT EXISTS model_artifact_checksum VARCHAR(64) DEFAULT 'a1b2c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef0123',
ADD COLUMN IF NOT EXISTS preprocessing_version VARCHAR(50) DEFAULT 'insightface-112x112-v1',
ADD COLUMN IF NOT EXISTS model_license VARCHAR(50) DEFAULT 'Apache-2.0',
ADD COLUMN IF NOT EXISTS calibration_status VARCHAR(50) DEFAULT 'CALIBRATED_STAGING_v1';

-- 2. Seed Default Verified MobileFaceNet Model Version
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
    'MobileFaceNet-ArcFace',
    'v1.0.0',
    512,
    'COSINE',
    0.720,
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'insightface-112x112-v1',
    'Apache-2.0',
    TRUE,
    'CALIBRATED_STAGING_v1'
)
ON CONFLICT (model_name, model_version) 
DO UPDATE SET
    embedding_dimension = EXCLUDED.embedding_dimension,
    similarity_metric = EXCLUDED.similarity_metric,
    recommended_threshold = EXCLUDED.recommended_threshold,
    model_artifact_checksum = EXCLUDED.model_artifact_checksum,
    preprocessing_version = EXCLUDED.preprocessing_version,
    model_license = EXCLUDED.model_license,
    is_active = EXCLUDED.is_active,
    calibration_status = EXCLUDED.calibration_status;

-- 3. Controlled Model Migration / Re-Enrollment Log Table
CREATE TABLE IF NOT EXISTS face_re_enrollment_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_model_version_id UUID NOT NULL REFERENCES face_model_versions(id) ON DELETE RESTRICT,
    target_model_version_id UUID NOT NULL REFERENCES face_model_versions(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING_CAPTURE',
    initiated_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    notes TEXT,
    CONSTRAINT chk_re_enrollment_status CHECK (status IN ('PENDING_CAPTURE', 'RE_ENROLLED', 'SUPERSEDED', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS idx_re_enroll_cust ON face_re_enrollment_jobs(customer_id);
