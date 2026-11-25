-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 014: MILK RATE MANAGEMENT SYSTEM & CROSS-PHASE INTEGRATION STABILIZATION
-- ==============================================================================

-- 1. Extend rate_chart_versions with Lifecycle Status, Pricing Unit, and Audit Fields
ALTER TABLE rate_chart_versions
ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
ADD COLUMN IF NOT EXISTS pricing_unit VARCHAR(20) NOT NULL DEFAULT 'PER_KG',
ADD COLUMN IF NOT EXISTS measurement_unit VARCHAR(10) NOT NULL DEFAULT 'KG',
ADD COLUMN IF NOT EXISTS fat_min NUMERIC(3,1),
ADD COLUMN IF NOT EXISTS fat_max NUMERIC(3,1),
ADD COLUMN IF NOT EXISTS snf_min NUMERIC(3,1),
ADD COLUMN IF NOT EXISTS snf_max NUMERIC(3,1),
ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES users(id) ON DELETE RESTRICT,
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS published_by UUID REFERENCES users(id) ON DELETE RESTRICT,
ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES users(id) ON DELETE RESTRICT,
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Add constraints on status and pricing_unit
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_rate_version_status'
    ) THEN
        ALTER TABLE rate_chart_versions
        ADD CONSTRAINT chk_rate_version_status
        CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'PUBLISHED', 'SUPERSEDED', 'ARCHIVED'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_rate_version_pricing_unit'
    ) THEN
        ALTER TABLE rate_chart_versions
        ADD CONSTRAINT chk_rate_version_pricing_unit
        CHECK (pricing_unit IN ('PER_KG', 'PER_LITER'));
    END IF;
END $$;

-- Backfill existing versions status based on is_approved
UPDATE rate_chart_versions
SET status = 'PUBLISHED'
WHERE is_approved = TRUE AND status = 'DRAFT';

-- 2. Prevent Modification of Published Rate Chart Cells (Immutability Trigger)
CREATE OR REPLACE FUNCTION public.check_rate_chart_cell_immutability()
RETURNS TRIGGER AS $$
DECLARE
    v_version_status VARCHAR(30);
BEGIN
    SELECT status INTO v_version_status
    FROM rate_chart_versions
    WHERE id = COALESCE(NEW.rate_chart_version_id, OLD.rate_chart_version_id);

    IF v_version_status IN ('PUBLISHED', 'SUPERSEDED', 'ARCHIVED') THEN
        RAISE EXCEPTION 'RATE_CHART_IMMUTABLE: Cannot modify or delete cells in a % rate chart version', v_version_status
        USING ERRCODE = '22000';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rate_chart_cell_immutability ON rate_chart_cells;
CREATE TRIGGER trg_rate_chart_cell_immutability
BEFORE INSERT OR UPDATE OR DELETE ON rate_chart_cells
FOR EACH ROW
EXECUTE FUNCTION public.check_rate_chart_cell_immutability();

-- 3. Extend milk_collections with canonical pricing_unit and explicit optional volume
ALTER TABLE milk_collections
ADD COLUMN IF NOT EXISTS pricing_unit VARCHAR(20) NOT NULL DEFAULT 'PER_KG',
ADD COLUMN IF NOT EXISTS volume_liters NUMERIC(6,2),
ADD COLUMN IF NOT EXISTS volume_unit VARCHAR(10) DEFAULT 'LITERS';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_collection_pricing_unit'
    ) THEN
        ALTER TABLE milk_collections
        ADD CONSTRAINT chk_collection_pricing_unit
        CHECK (pricing_unit IN ('PER_KG', 'PER_LITER'));
    END IF;
END $$;

-- 4. Extend devices with Explicit Offline Policy Approval
ALTER TABLE devices
ADD COLUMN IF NOT EXISTS offline_auth_policy_approved BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS approved_max_offline_hours INT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS offline_policy_approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
ADD COLUMN IF NOT EXISTS offline_policy_approved_at TIMESTAMPTZ;

-- 5. Extend center_settings with Explicit Offline Policy Approval & Canonical Units
ALTER TABLE center_settings
ADD COLUMN IF NOT EXISTS offline_auth_policy_approved BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS approved_max_offline_hours INT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS offline_policy_approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
ADD COLUMN IF NOT EXISTS offline_policy_approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS default_weight_unit VARCHAR(10) NOT NULL DEFAULT 'KG',
ADD COLUMN IF NOT EXISTS default_pricing_unit VARCHAR(20) NOT NULL DEFAULT 'PER_KG';

-- 6. System Configurations Master Table (Centralized Policy & Metadata)
CREATE TABLE IF NOT EXISTS system_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT,
    config_key VARCHAR(100) NOT NULL,
    config_value JSONB NOT NULL,
    description TEXT,
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_system_config_key UNIQUE (organization_id, config_key)
);

CREATE INDEX IF NOT EXISTS idx_system_config_org_key ON system_configurations(organization_id, config_key);

-- Seed Central Face Model Calibration Configuration (Unapproved for production fail-safe)
INSERT INTO system_configurations (
    organization_id,
    config_key,
    config_value,
    description,
    is_approved
) VALUES (
    NULL,
    'face_recognition_calibration',
    jsonb_build_object(
        'modelName', 'MobileFaceNet-ArcFace',
        'modelVersion', 'v1.0.0',
        'embeddingDimension', 512,
        'similarityMetric', 'COSINE',
        'recommendedThreshold', 0.720,
        'modelArtifactChecksum', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        'artifactStatus', 'UNVERIFIED_EMPTY_DIGEST',
        'calibrationStatus', 'STAGING_UNVERIFIED',
        'isApprovedForProduction', false,
        'failSafeBehavior', 'REJECT_OR_FALLBACK_TO_RFID'
    ),
    'Centralized face recognition model version and calibration threshold configuration',
    FALSE
) ON CONFLICT (organization_id, config_key) DO UPDATE
SET config_value = EXCLUDED.config_value,
    is_approved = EXCLUDED.is_approved,
    updated_at = NOW();

-- Seed Canonical Measurement Units Configuration
INSERT INTO system_configurations (
    organization_id,
    config_key,
    config_value,
    description,
    is_approved
) VALUES (
    NULL,
    'canonical_measurement_contract',
    jsonb_build_object(
        'defaultQuantityUnit', 'KG',
        'defaultPricingUnit', 'PER_KG',
        'independentVolumeAllowed', true,
        'silentConversionAllowed', false,
        'densityConversionFactorApproved', false
    ),
    'Canonical measurement units and explicit pricing unit contracts',
    TRUE
) ON CONFLICT (organization_id, config_key) DO UPDATE
SET config_value = EXCLUDED.config_value,
    is_approved = EXCLUDED.is_approved,
    updated_at = NOW();

-- 7. Stored Procedure: Publish Rate Chart Version with Immutability and Event Publishing
CREATE OR REPLACE FUNCTION public.publish_rate_chart_version(
    p_rate_chart_id UUID,
    p_version_id UUID,
    p_published_by UUID
)
RETURNS JSONB AS $$
DECLARE
    v_chart RECORD;
    v_version RECORD;
    v_cell_count INT;
    v_result JSONB;
BEGIN
    -- 1. Check chart exists
    SELECT * INTO v_chart FROM rate_charts WHERE id = p_rate_chart_id FOR UPDATE;
    IF v_chart.id IS NULL THEN
        RAISE EXCEPTION 'Rate chart % not found', p_rate_chart_id USING ERRCODE = 'P0002';
    END IF;

    -- 2. Check version exists and belongs to chart
    SELECT * INTO v_version FROM rate_chart_versions 
    WHERE id = p_version_id AND rate_chart_id = p_rate_chart_id FOR UPDATE;
    IF v_version.id IS NULL THEN
        RAISE EXCEPTION 'Rate chart version % not found for chart %', p_version_id, p_rate_chart_id USING ERRCODE = 'P0002';
    END IF;

    -- 3. Version must be approved or submit-ready
    IF v_version.status = 'PUBLISHED' THEN
        RAISE EXCEPTION 'Rate chart version % is already published', p_version_id USING ERRCODE = '22000';
    END IF;

    -- 4. Check matrix cells exist
    SELECT COUNT(*) INTO v_cell_count FROM rate_chart_cells WHERE rate_chart_version_id = p_version_id;
    IF v_cell_count = 0 THEN
        RAISE EXCEPTION 'Cannot publish rate chart version % with 0 cells in matrix', p_version_id USING ERRCODE = '22000';
    END IF;

    -- 5. Supersede previously published versions with overlapping or earlier validity
    UPDATE rate_chart_versions
    SET status = 'SUPERSEDED',
        effective_to = LEAST(COALESCE(effective_to, v_version.effective_from), v_version.effective_from),
        updated_at = NOW()
    WHERE rate_chart_id = p_rate_chart_id
      AND id <> p_version_id
      AND status = 'PUBLISHED'
      AND effective_from <= v_version.effective_from;

    -- 6. Set status to PUBLISHED
    UPDATE rate_chart_versions
    SET status = 'PUBLISHED',
        is_approved = TRUE,
        approved_by = COALESCE(approved_by, p_published_by),
        approved_at = COALESCE(approved_at, NOW()),
        published_by = p_published_by,
        published_at = NOW(),
        updated_at = NOW()
    WHERE id = p_version_id;

    -- 7. Emit downstream sync event for edge terminals
    INSERT INTO sync_events (
        organization_id,
        center_id,
        entity_type,
        entity_id,
        action,
        payload
    ) VALUES (
        v_chart.organization_id,
        v_chart.center_id,
        'RATE_CHART',
        p_version_id,
        'INSERT',
        jsonb_build_object(
            'rateChartId', v_chart.id,
            'rateChartName', v_chart.name,
            'milkCategory', v_chart.milk_category,
            'versionId', p_version_id,
            'versionNumber', v_version.version_number,
            'effectiveFrom', v_version.effective_from,
            'effectiveTo', v_version.effective_to,
            'pricingUnit', v_version.pricing_unit,
            'cellCount', v_cell_count
        )
    );

    -- 8. Audit log
    INSERT INTO audit_logs (
        organization_id,
        center_id,
        user_id,
        action,
        entity_type,
        entity_id,
        new_values
    ) VALUES (
        v_chart.organization_id,
        v_chart.center_id,
        p_published_by,
        'RATE_CHART_VERSION_PUBLISHED',
        'RATE_CHART_VERSION',
        p_version_id,
        jsonb_build_object(
            'rateChartId', p_rate_chart_id,
            'versionId', p_version_id,
            'versionNumber', v_version.version_number,
            'cellCount', v_cell_count
        )
    );

    SELECT jsonb_build_object(
        'rateChartId', v_chart.id,
        'versionId', p_version_id,
        'versionNumber', v_version.version_number,
        'status', 'PUBLISHED',
        'isApproved', TRUE,
        'publishedAt', NOW(),
        'cellCount', v_cell_count
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

ALTER FUNCTION public.publish_rate_chart_version(UUID, UUID, UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.publish_rate_chart_version(UUID, UUID, UUID) TO authenticated, service_role;
