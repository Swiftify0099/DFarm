-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 006: CUSTOMER IDENTIFICATION AUDIT
-- ==============================================================================

-- 1. Identification Audit Logs (Telemetry for Face, RFID, and Manual Intake)
CREATE TABLE IF NOT EXISTS identification_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    session_id UUID,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    identification_method VARCHAR(30) NOT NULL,
    verification_outcome VARCHAR(20) NOT NULL,
    face_model_version_id UUID REFERENCES face_model_versions(id) ON DELETE SET NULL,
    face_match_score NUMERIC(5,4),
    rfid_card_uid_scanned VARCHAR(64),
    supervisor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    supervisor_reason_code VARCHAR(100),
    device_id VARCHAR(100) NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_id_method CHECK (identification_method IN ('FACE', 'RFID', 'SUPERVISOR_MANUAL')),
    CONSTRAINT chk_id_outcome CHECK (verification_outcome IN ('SUCCESS', 'FAILED', 'REJECTED_INACTIVE', 'REJECTED_UNKNOWN'))
);

CREATE INDEX IF NOT EXISTS idx_id_audit_center ON identification_audit_logs(center_id);
CREATE INDEX IF NOT EXISTS idx_id_audit_customer ON identification_audit_logs(customer_id);
CREATE INDEX IF NOT EXISTS idx_id_audit_timestamp ON identification_audit_logs(recorded_at DESC);

-- 2. Supervisor Verification Records (Mandatory Audit for Manual Overrides)
CREATE TABLE IF NOT EXISTS supervisor_verification_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_log_id UUID NOT NULL UNIQUE REFERENCES identification_audit_logs(id) ON DELETE CASCADE,
    supervisor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    reason_category VARCHAR(50) NOT NULL,
    justification_notes TEXT NOT NULL,
    authenticated_via VARCHAR(30) NOT NULL DEFAULT 'PIN',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_sup_reason_cat CHECK (reason_category IN (
        'FACIAL_INJURY', 'LIGHTING_CAMERA_DEFECT', 'CARD_DAMAGED',
        'CARD_FORGOTTEN', 'OTHER_DOCUMENTED'
    )),
    CONSTRAINT chk_sup_auth_via CHECK (authenticated_via IN ('PIN', 'PASSWORD', 'BIOMETRIC'))
);

CREATE INDEX IF NOT EXISTS idx_sup_verif_supervisor ON supervisor_verification_records(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_sup_verif_customer ON supervisor_verification_records(customer_id);

