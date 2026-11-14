-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 002: ORGANIZATIONS AND COLLECTION CENTERS
-- ==============================================================================

-- 1. Organizations Master
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    code VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_organization_code UNIQUE (code),
    CONSTRAINT chk_org_status CHECK (status IN ('ACTIVE', 'SUSPENDED', 'INACTIVE'))
);

CREATE TRIGGER set_organizations_updated_at
BEFORE UPDATE ON organizations
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 2. Dairy Centers (Branches / Collection Units)
CREATE TABLE IF NOT EXISTS dairy_centers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(150) NOT NULL,
    address_line1 VARCHAR(200) NOT NULL,
    address_line2 VARCHAR(200),
    village_town VARCHAR(100) NOT NULL,
    district VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    contact_phone VARCHAR(20) NOT NULL,
    contact_email VARCHAR(150),
    timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_dairy_center_code_per_org UNIQUE (organization_id, code),
    CONSTRAINT chk_center_status CHECK (status IN ('ACTIVE', 'SUSPENDED', 'INACTIVE'))
);

CREATE TRIGGER set_dairy_centers_updated_at
BEFORE UPDATE ON dairy_centers
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_dairy_centers_org_id ON dairy_centers(organization_id);

-- 3. Center Settings (Configurable Limits, Business Hours, Timezone)
CREATE TABLE IF NOT EXISTS center_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    center_id UUID NOT NULL UNIQUE REFERENCES dairy_centers(id) ON DELETE CASCADE,
    business_timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
    billing_cycle_type VARCHAR(30) NOT NULL DEFAULT 'CALENDAR_MONTH',
    weight_measurement_unit VARCHAR(10) NOT NULL DEFAULT 'KG',
    collection_lock_window_hours NUMERIC(4,1) NOT NULL DEFAULT 4.0,
    allow_manual_identification BOOLEAN NOT NULL DEFAULT TRUE,
    allow_cow_milk BOOLEAN NOT NULL DEFAULT TRUE,
    allow_buffalo_milk BOOLEAN NOT NULL DEFAULT TRUE,
    cow_fat_min NUMERIC(3,1) NOT NULL DEFAULT 2.8,
    cow_fat_max NUMERIC(3,1) NOT NULL DEFAULT 6.0,
    cow_snf_min NUMERIC(3,1) NOT NULL DEFAULT 7.8,
    cow_snf_max NUMERIC(3,1) NOT NULL DEFAULT 10.2,
    buffalo_fat_min NUMERIC(3,1) NOT NULL DEFAULT 5.0,
    buffalo_fat_max NUMERIC(3,1) NOT NULL DEFAULT 12.0,
    buffalo_snf_min NUMERIC(3,1) NOT NULL DEFAULT 8.2,
    buffalo_snf_max NUMERIC(3,1) NOT NULL DEFAULT 11.5,
    offline_sync_max_disconnection_hours INT NOT NULL DEFAULT 72,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_billing_cycle_type CHECK (billing_cycle_type IN ('CALENDAR_MONTH', 'TEN_DAY', 'FIFTEEN_DAY', 'WEEKLY')),
    CONSTRAINT chk_weight_unit CHECK (weight_measurement_unit IN ('KG', 'LITERS'))
);

CREATE TRIGGER set_center_settings_updated_at
BEFORE UPDATE ON center_settings
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 4. Collection Shifts
CREATE TABLE IF NOT EXISTS collection_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE CASCADE,
    shift_type VARCHAR(10) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    grace_period_minutes INT NOT NULL DEFAULT 30,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_center_shift UNIQUE (center_id, shift_type),
    CONSTRAINT chk_shift_type CHECK (shift_type IN ('MORNING', 'EVENING'))
);

CREATE INDEX IF NOT EXISTS idx_collection_shifts_center_id ON collection_shifts(center_id);

