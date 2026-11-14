-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 015: MASTER REMEDIATION (PHASES P05 TO P10)
-- Schema Hardening, Face Model Governance, Atomic Customer Lifecycle
-- ==============================================================================

-- 1. Face Model Version Governance & Calibration Metadata
ALTER TABLE face_model_versions
ADD COLUMN IF NOT EXISTS model_artifact_checksum VARCHAR(64) DEFAULT 'INVALID_EMPTY_HASH',
ADD COLUMN IF NOT EXISTS preprocessing_version VARCHAR(50) DEFAULT 'insightface-112x112-v1',
ADD COLUMN IF NOT EXISTS model_license VARCHAR(50) DEFAULT 'Apache-2.0',
ADD COLUMN IF NOT EXISTS calibration_status VARCHAR(50) DEFAULT 'NOT_CALIBRATED';

-- Seed/Update Canonical MobileFaceNet-ArcFace Model with Truthful Calibration & Digest Metadata
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
    'INVALID_EMPTY_HASH',
    'insightface-112x112-v1',
    'Apache-2.0',
    TRUE,
    'NOT_CALIBRATED'
)
ON CONFLICT (model_name, model_version) 
DO UPDATE SET
    embedding_dimension = 512,
    similarity_metric = 'COSINE',
    recommended_threshold = 0.720,
    model_artifact_checksum = 'INVALID_EMPTY_HASH',
    preprocessing_version = 'insightface-112x112-v1',
    model_license = 'Apache-2.0',
    is_active = TRUE,
    calibration_status = 'NOT_CALIBRATED';

-- Ensure all other existing model records are marked NOT_CALIBRATED and INVALID_EMPTY_HASH
UPDATE face_model_versions
SET calibration_status = 'NOT_CALIBRATED',
    model_artifact_checksum = 'INVALID_EMPTY_HASH'
WHERE model_artifact_checksum = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
   OR calibration_status != 'NOT_CALIBRATED';

-- 2. Controlled Model Migration / Re-Enrollment Log Table
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

-- 3. Center Validation Limits Approval Metadata
ALTER TABLE center_settings
ADD COLUMN IF NOT EXISTS limits_approved BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS limits_status VARCHAR(50) DEFAULT 'PENDING_OWNER_APPROVAL',
ADD COLUMN IF NOT EXISTS limits_version VARCHAR(20) DEFAULT 'v1.0-draft';

-- 4. Atomic, Hardened Customer Restore Function (Verifies Biometric Consent, Face & RFID)
CREATE OR REPLACE FUNCTION public.restore_customer(
    p_customer_id UUID,
    p_organization_id UUID,
    p_restored_by UUID,
    p_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_center_id UUID;
    v_prev_status VARCHAR(30);
    v_target_status VARCHAR(30);
    v_has_active_consent BOOLEAN;
    v_has_active_face BOOLEAN;
    v_has_active_rfid BOOLEAN;
    v_result JSONB;
BEGIN
    -- Verify customer exists in organization and is currently soft-deleted
    SELECT primary_center_id, status INTO v_center_id, v_prev_status
    FROM customers
    WHERE id = p_customer_id AND organization_id = p_organization_id AND is_deleted = TRUE;

    IF v_center_id IS NULL THEN
        RAISE EXCEPTION 'Soft-deleted customer % not found in organization %', p_customer_id, p_organization_id USING ERRCODE = 'P0002';
    END IF;

    -- 1. Check valid current biometric consent
    SELECT EXISTS (
        SELECT 1 FROM customer_consent_records
        WHERE customer_id = p_customer_id 
          AND consent_type = 'BIOMETRIC_FACE_ENROLLMENT'
          AND consent_granted = TRUE
          AND revoked_at IS NULL
    ) INTO v_has_active_consent;

    -- 2. Check active face enrollment
    SELECT EXISTS (
        SELECT 1 FROM face_enrollments 
        WHERE customer_id = p_customer_id AND status = 'ACTIVE'
    ) INTO v_has_active_face;

    -- 3. Check active RFID assignment
    SELECT EXISTS (
        SELECT 1 FROM rfid_card_assignments
        WHERE customer_id = p_customer_id AND is_active = TRUE
    ) INTO v_has_active_rfid;

    -- Determine target state strictly based on completed prerequisites
    IF NOT v_has_active_consent OR NOT v_has_active_face THEN
        v_target_status := 'PENDING_FACE_ENROLLMENT';
    ELSIF NOT v_has_active_rfid THEN
        v_target_status := 'PENDING_RFID_ASSIGNMENT';
    ELSE
        v_target_status := 'ACTIVE';
    END IF;

    -- Atomic customer reactivation
    UPDATE customers
    SET is_deleted = FALSE,
        deleted_at = NULL,
        deleted_by = NULL,
        deletion_reason = NULL,
        status = v_target_status,
        updated_at = NOW(),
        version = version + 1
    WHERE id = p_customer_id;

    -- Record status history audit
    INSERT INTO customer_status_history (
        customer_id,
        previous_status,
        new_status,
        change_reason,
        changed_by,
        changed_at
    ) VALUES (
        p_customer_id,
        v_prev_status,
        v_target_status,
        p_reason,
        p_restored_by,
        NOW()
    );

    -- Remove customer tombstone so offline devices re-admit this customer
    DELETE FROM sync_tombstones
    WHERE organization_id = p_organization_id
      AND entity_type = 'CUSTOMER'
      AND entity_id = p_customer_id;

    -- Record sync event for downstream distribution
    INSERT INTO sync_events (
        organization_id,
        center_id,
        entity_type,
        entity_id,
        action,
        payload
    ) VALUES (
        p_organization_id,
        v_center_id,
        'CUSTOMER',
        p_customer_id,
        'RESTORE',
        jsonb_build_object(
            'id', p_customer_id,
            'restored_by', p_restored_by,
            'reason', p_reason,
            'target_status', v_target_status
        )
    );

    -- Insert system audit log
    INSERT INTO audit_logs (
        organization_id,
        center_id,
        user_id,
        action,
        entity_type,
        entity_id,
        old_values,
        new_values
    ) VALUES (
        p_organization_id,
        v_center_id,
        p_restored_by,
        'CUSTOMER_RESTORED',
        'CUSTOMER',
        p_customer_id,
        jsonb_build_object('status', v_prev_status, 'is_deleted', TRUE),
        jsonb_build_object('status', v_target_status, 'is_deleted', FALSE, 'reason', p_reason)
    );

    SELECT jsonb_build_object(
        'id', c.id,
        'organization_id', c.organization_id,
        'status', c.status,
        'is_deleted', c.is_deleted
    ) INTO v_result
    FROM customers c
    WHERE c.id = p_customer_id;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

ALTER FUNCTION public.restore_customer(UUID, UUID, UUID, TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.restore_customer(UUID, UUID, UUID, TEXT) TO authenticated, service_role;

-- 5. Record Migration in schema_migrations
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('015', 'p05_p10_master_remediation')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
