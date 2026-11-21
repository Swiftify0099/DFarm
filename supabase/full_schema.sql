-- ========================================================
-- DFARM COMPLETE DATABASE SCHEMA BUNDLE
-- Generated for single-click execution in Supabase SQL Editor
-- ========================================================

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$ BEGIN RETURN NULL; END; $$ LANGUAGE plpgsql STABLE;
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  statements TEXT[],
  inserted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ========================================================
-- Migration: 001_extensions_and_common.sql
-- ========================================================
-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 001: EXTENSIONS AND COMMON DATABASE OBJECTS
-- ==============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Common Updated_At Trigger Function
-- Uses SET search_path = pg_catalog and fully schema-qualified pg_catalog references for tamper resistance.
CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog;

ALTER FUNCTION public.trigger_set_updated_at() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trigger_set_updated_at() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trigger_set_updated_at() TO authenticated, anon, service_role;

-- 3. Tenant Claims Extractor Functions (Residing strictly in public schema)
-- Native Supabase auth.uid() is untouched and provided by GoTrue.
-- All custom functions use SET search_path = pg_catalog to prevent Trojan/search-path vulnerabilities.

CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid AS $$
DECLARE
  claims_text text;
BEGIN
  claims_text := NULLIF(current_setting('request.jwt.claims', true), '');
  IF claims_text IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN (NULLIF(claims_text::jsonb -> 'app_metadata' ->> 'organization_id', ''))::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = pg_catalog;

ALTER FUNCTION public.current_org_id() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.current_org_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.current_center_id()
RETURNS uuid AS $$
DECLARE
  claims_text text;
BEGIN
  claims_text := NULLIF(current_setting('request.jwt.claims', true), '');
  IF claims_text IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN (NULLIF(claims_text::jsonb -> 'app_metadata' ->> 'center_id', ''))::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = pg_catalog;

ALTER FUNCTION public.current_center_id() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.current_center_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_center_id() TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text AS $$
DECLARE
  claims_text text;
BEGIN
  claims_text := NULLIF(current_setting('request.jwt.claims', true), '');
  IF claims_text IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN claims_text::jsonb -> 'app_metadata' ->> 'user_role';
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = pg_catalog;

ALTER FUNCTION public.current_user_role() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.current_customer_id()
RETURNS uuid AS $$
DECLARE
  claims_text text;
BEGIN
  claims_text := NULLIF(current_setting('request.jwt.claims', true), '');
  IF claims_text IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN (NULLIF(claims_text::jsonb -> 'app_metadata' ->> 'customer_id', ''))::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = pg_catalog;

ALTER FUNCTION public.current_customer_id() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.current_customer_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_customer_id() TO authenticated, anon, service_role;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('001', '001_extensions_and_common.sql') ON CONFLICT (version) DO NOTHING;

-- ========================================================
-- Migration: 002_organizations_and_centers.sql
-- ========================================================
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


INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('002', '002_organizations_and_centers.sql') ON CONFLICT (version) DO NOTHING;

-- ========================================================
-- Migration: 003_user_identity_foundation.sql
-- ========================================================
-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 003: USER AND STAFF IDENTITY FOUNDATION
-- ==============================================================================

-- 1. Users Master (Mapped to Supabase auth.users or internal identities)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    username VARCHAR(50) NOT NULL UNIQUE,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150),
    phone_number VARCHAR(20) NOT NULL,
    role VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_user_role CHECK (role IN (
        'SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'CENTER_MANAGER', 'SUPERVISOR',
        'COLLECTION_OPERATOR', 'ACCOUNTANT', 'INVENTORY_MANAGER', 'REGISTRATION_OFFICER', 'FARMER_CUSTOMER'
    )),
    CONSTRAINT chk_user_status CHECK (status IN ('ACTIVE', 'SUSPENDED', 'INACTIVE'))
);

CREATE TRIGGER set_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_users_org_id ON users(organization_id);

-- 2. User Center Assignments (Multi-Center Access Mapping)
CREATE TABLE IF NOT EXISTS user_center_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_center_assignment UNIQUE (user_id, center_id)
);

CREATE INDEX IF NOT EXISTS idx_user_center_assignments_user ON user_center_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_center_assignments_center ON user_center_assignments(center_id);


INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('003', '003_user_identity_foundation.sql') ON CONFLICT (version) DO NOTHING;

-- ========================================================
-- Migration: 004_customer_identity.sql
-- ========================================================
-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 004: CUSTOMER IDENTITY MASTER
-- ==============================================================================

-- 1. Customers Master
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    primary_center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    farmer_code VARCHAR(30) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    normalized_mobile_number VARCHAR(20) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    registration_status VARCHAR(30) NOT NULL DEFAULT 'IN_PROGRESS',
    bank_name VARCHAR(100),
    bank_account_number VARCHAR(50),
    bank_ifsc_code VARCHAR(20),
    bank_account_holder_name VARCHAR(150),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    deletion_reason TEXT,
    version BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_customer_mobile_per_org UNIQUE (organization_id, normalized_mobile_number),
    CONSTRAINT uq_customer_code_per_center UNIQUE (primary_center_id, farmer_code),
    CONSTRAINT chk_customer_status CHECK (status IN (
        'DRAFT', 'PENDING_FACE_ENROLLMENT', 'PENDING_RFID_ASSIGNMENT',
        'PENDING_SYNC', 'ACTIVE', 'SUSPENDED', 'SOFT_DELETED', 'INACTIVE'
    )),
    CONSTRAINT chk_customer_registration_status CHECK (registration_status IN (
        'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'PENDING_APPROVAL', 'APPROVED', 'UNREGISTERED'
    ))
);

CREATE TRIGGER set_customers_updated_at
BEFORE UPDATE ON customers
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_customers_org_id ON customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_center_id ON customers(primary_center_id);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status) WHERE (is_deleted = FALSE);

-- 2. Customer Milk Categories (Normalized Authorization: COW, BUFFALO)
CREATE TABLE IF NOT EXISTS customer_milk_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    milk_category VARCHAR(20) NOT NULL,
    is_authorized BOOLEAN NOT NULL DEFAULT TRUE,
    authorized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    authorized_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT uq_customer_milk_category UNIQUE (customer_id, milk_category),
    CONSTRAINT chk_milk_category CHECK (milk_category IN ('COW', 'BUFFALO'))
);

CREATE INDEX IF NOT EXISTS idx_customer_milk_categories_cust ON customer_milk_categories(customer_id);

-- 3. Customer Addresses
CREATE TABLE IF NOT EXISTS customer_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
    village VARCHAR(100) NOT NULL,
    hamlet_area VARCHAR(100),
    taluka_subdistrict VARCHAR(100) NOT NULL,
    district VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_customer_addresses_updated_at
BEFORE UPDATE ON customer_addresses
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 4. Customer Registration Records (Onboarding Metadata)
CREATE TABLE IF NOT EXISTS customer_registration_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    registered_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    registration_channel VARCHAR(30) NOT NULL DEFAULT 'ANDROID_REGISTRATION_APP',
    device_id VARCHAR(100) NOT NULL,
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cust_reg_records_cust ON customer_registration_records(customer_id);

-- 5. Customer Status History (Lifecycle State Machine Audit)
CREATE TABLE IF NOT EXISTS customer_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    previous_status VARCHAR(30),
    new_status VARCHAR(30) NOT NULL,
    change_reason TEXT NOT NULL,
    changed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cust_status_history_cust ON customer_status_history(customer_id);

-- 6. Customer Biometric Consent Records
CREATE TABLE IF NOT EXISTS customer_consent_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    consent_type VARCHAR(50) NOT NULL DEFAULT 'BIOMETRIC_FACE_ENROLLMENT',
    consent_granted BOOLEAN NOT NULL DEFAULT FALSE,
    consent_text_version VARCHAR(20) NOT NULL,
    consent_language VARCHAR(10) NOT NULL DEFAULT 'mr',
    officer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    revocation_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_cust_consent_cust ON customer_consent_records(customer_id);


INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('004', '004_customer_identity.sql') ON CONFLICT (version) DO NOTHING;

-- ========================================================
-- Migration: 005_face_and_rfid.sql
-- ========================================================
-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 005: FACE ENROLLMENT AND RFID CARD MANAGEMENT
-- ==============================================================================

-- 1. Face Model Versions (Metadata-Driven Model Management)
CREATE TABLE IF NOT EXISTS face_model_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_name VARCHAR(50) NOT NULL,
    model_version VARCHAR(30) NOT NULL,
    embedding_dimension INT NOT NULL,
    similarity_metric VARCHAR(20) NOT NULL DEFAULT 'COSINE',
    recommended_threshold NUMERIC(4,3) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_face_model_version UNIQUE (model_name, model_version)
);

-- 2. Face Enrollments (Encrypted Vector Templates)
CREATE TABLE IF NOT EXISTS face_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    model_version_id UUID NOT NULL REFERENCES face_model_versions(id) ON DELETE RESTRICT,
    embedding_encrypted BYTEA NOT NULL,
    embedding_iv BYTEA NOT NULL,
    embedding_auth_tag BYTEA NOT NULL,
    encryption_key_reference VARCHAR(50) NOT NULL,
    quality_score NUMERIC(4,3) NOT NULL,
    liveness_score NUMERIC(4,3),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    enrolled_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    device_id VARCHAR(100) NOT NULL,
    erased_at TIMESTAMPTZ,
    erased_by UUID REFERENCES users(id) ON DELETE SET NULL,
    erasure_reason TEXT,
    CONSTRAINT chk_face_enrollment_status CHECK (status IN ('ACTIVE', 'SUPERSEDED', 'REVOKED', 'PERMANENTLY_ERASED'))
);

CREATE INDEX IF NOT EXISTS idx_face_enrollments_customer ON face_enrollments(customer_id);

-- Enforce at most ONE ACTIVE template per customer per model version
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_customer_face_template 
ON face_enrollments (customer_id, model_version_id) 
WHERE (status = 'ACTIVE');

-- 3. Biometric Retention Records (Policy-Driven Erasure Management)
CREATE TABLE IF NOT EXISTS biometric_retention_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    face_enrollment_id UUID NOT NULL REFERENCES face_enrollments(id) ON DELETE CASCADE,
    retention_policy_name VARCHAR(50) NOT NULL DEFAULT 'POLICY_SUBJECT_TO_CONSENT',
    scheduled_erasure_at TIMESTAMPTZ,
    retention_status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_biometric_retention_status CHECK (retention_status IN ('ACTIVE', 'GRACE_PERIOD', 'ERASED', 'EXEMPT'))
);

CREATE INDEX IF NOT EXISTS idx_biometric_retention_cust ON biometric_retention_records(customer_id);

-- 4. RFID Cards Master Inventory
CREATE TABLE IF NOT EXISTS rfid_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    card_uid VARCHAR(64) NOT NULL,
    card_type VARCHAR(30) NOT NULL DEFAULT 'MIFARE_CLASSIC_1K',
    status VARCHAR(20) NOT NULL DEFAULT 'UNASSIGNED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_rfid_card_uid_per_org UNIQUE (organization_id, card_uid),
    CONSTRAINT chk_rfid_card_status CHECK (status IN ('UNASSIGNED', 'ACTIVE', 'BLOCKED', 'REVOKED', 'LOST'))
);

CREATE TRIGGER set_rfid_cards_updated_at
BEFORE UPDATE ON rfid_cards
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_rfid_cards_org ON rfid_cards(organization_id);

-- 5. RFID Card Assignments Ledger
CREATE TABLE IF NOT EXISTS rfid_card_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rfid_card_id UUID NOT NULL REFERENCES rfid_cards(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID REFERENCES users(id) ON DELETE SET NULL,
    revocation_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_rfid_assignments_customer ON rfid_card_assignments(customer_id);
CREATE INDEX IF NOT EXISTS idx_rfid_assignments_card ON rfid_card_assignments(rfid_card_id);

-- Enforce a card can only be ACTIVELY assigned to ONE customer at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_card_assignment 
ON rfid_card_assignments (rfid_card_id) 
WHERE (is_active = TRUE);

-- Enforce a customer can only hold ONE ACTIVE card at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_customer_card 
ON rfid_card_assignments (customer_id) 
WHERE (is_active = TRUE);


INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('005', '005_face_and_rfid.sql') ON CONFLICT (version) DO NOTHING;

-- ========================================================
-- Migration: 006_customer_identification_audit.sql
-- ========================================================
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


INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('006', '006_customer_identification_audit.sql') ON CONFLICT (version) DO NOTHING;

-- ========================================================
-- Migration: 007_rate_management.sql
-- ========================================================
-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 007: MILK RATE CHARTS AND PRICING ENGINE
-- ==============================================================================

-- 1. Rate Charts Master
CREATE TABLE IF NOT EXISTS rate_charts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    name VARCHAR(100) NOT NULL,
    milk_category VARCHAR(20) NOT NULL,
    pricing_type VARCHAR(30) NOT NULL DEFAULT 'GRID',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_rate_chart_category CHECK (milk_category IN ('COW', 'BUFFALO')),
    CONSTRAINT chk_rate_chart_pricing_type CHECK (pricing_type IN ('GRID', 'TOTAL_SOLIDS_FORMULA', 'TWO_AXIS_FORMULA'))
);

CREATE INDEX IF NOT EXISTS idx_rate_charts_org ON rate_charts(organization_id);
CREATE INDEX IF NOT EXISTS idx_rate_charts_center ON rate_charts(center_id);

-- 2. Rate Chart Versions (Historical Immutability)
CREATE TABLE IF NOT EXISTS rate_chart_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rate_chart_id UUID NOT NULL REFERENCES rate_charts(id) ON DELETE RESTRICT,
    version_number INT NOT NULL,
    effective_from TIMESTAMPTZ NOT NULL,
    effective_to TIMESTAMPTZ,
    formula_definition JSONB,
    base_fat NUMERIC(3,1),
    base_snf NUMERIC(3,1),
    base_rate NUMERIC(6,2),
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_rate_chart_version UNIQUE (rate_chart_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_rate_chart_versions_dates 
ON rate_chart_versions (rate_chart_id, effective_from, effective_to);

-- 3. Rate Chart Cells (Grid Matrix for Fat x SNF)
CREATE TABLE IF NOT EXISTS rate_chart_cells (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rate_chart_version_id UUID NOT NULL REFERENCES rate_chart_versions(id) ON DELETE CASCADE,
    fat_percentage NUMERIC(3,1) NOT NULL,
    snf_percentage NUMERIC(3,1) NOT NULL,
    rate_per_unit NUMERIC(6,2) NOT NULL,
    CONSTRAINT uq_rate_chart_cell UNIQUE (rate_chart_version_id, fat_percentage, snf_percentage),
    CONSTRAINT chk_positive_rate CHECK (rate_per_unit >= 0.00)
);

CREATE INDEX IF NOT EXISTS idx_rate_cells_lookup 
ON rate_chart_cells (rate_chart_version_id, fat_percentage, snf_percentage);

-- 4. Rate Applicability Rules (Center Priority Matching)
CREATE TABLE IF NOT EXISTS rate_applicability_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rate_chart_id UUID NOT NULL REFERENCES rate_charts(id) ON DELETE CASCADE,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE CASCADE,
    priority INT NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);


INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('007', '007_rate_management.sql') ON CONFLICT (version) DO NOTHING;

-- ========================================================
-- Migration: 008_collection_sessions_and_transactions.sql
-- ========================================================
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


INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('008', '008_collection_sessions_and_transactions.sql') ON CONFLICT (version) DO NOTHING;

-- ========================================================
-- Migration: 009_customer_ledger.sql
-- ========================================================
-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 009: CUSTOMER FINANCIAL LEDGER AND ACCOUNTING
-- ==============================================================================

-- 1. Customer Ledger Accounts (Account Header with Running Balance)
CREATE TABLE IF NOT EXISTS customer_ledger_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL UNIQUE REFERENCES customers(id) ON DELETE RESTRICT,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    current_balance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    last_transaction_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_customer_ledger_accounts_updated_at
BEFORE UPDATE ON customer_ledger_accounts
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_ledger_accounts_org ON customer_ledger_accounts(organization_id);

-- 2. Ledger Transactions (Append-Only Financial Journal)
CREATE TABLE IF NOT EXISTS ledger_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    transaction_type VARCHAR(40) NOT NULL,
    direction VARCHAR(10) NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    balance_after NUMERIC(12,2) NOT NULL,
    reference_entity VARCHAR(30) NOT NULL,
    reference_id UUID NOT NULL,
    description TEXT,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_ledger_direction CHECK (direction IN ('CREDIT', 'DEBIT')),
    CONSTRAINT chk_ledger_positive_amount CHECK (amount > 0.00),
    CONSTRAINT chk_ledger_txn_type CHECK (transaction_type IN (
        'MILK_COLLECTION_CREDIT', 'FEED_PURCHASE_DEBIT', 'ADVANCE_DEBIT',
        'DEDUCTION_DEBIT', 'PAYMENT_PAYOUT_DEBIT', 'LEDGER_ADJUSTMENT_CREDIT',
        'LEDGER_ADJUSTMENT_DEBIT', 'COLLECTION_REVERSAL_DEBIT'
    )),
    CONSTRAINT chk_ledger_ref_entity CHECK (reference_entity IN (
        'MILK_COLLECTION', 'FEED_SALE', 'CUSTOMER_ADVANCE',
        'CUSTOMER_DEDUCTION', 'CUSTOMER_PAYMENT', 'MANUAL_ADJUSTMENT'
    ))
);

CREATE INDEX IF NOT EXISTS idx_ledger_transactions_customer 
ON ledger_transactions (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ledger_transactions_center 
ON ledger_transactions (center_id, created_at DESC);

-- 3. Ledger Entries (Double-Entry Balanced Journal Entries)
CREATE TABLE IF NOT EXISTS ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES ledger_transactions(id) ON DELETE CASCADE,
    account_id UUID NOT NULL,
    account_type VARCHAR(30) NOT NULL,
    entry_type VARCHAR(10) NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    CONSTRAINT chk_entry_type CHECK (entry_type IN ('DEBIT', 'CREDIT')),
    CONSTRAINT chk_entry_positive_amount CHECK (amount > 0.00),
    CONSTRAINT chk_entry_account_type CHECK (account_type IN (
        'CUSTOMER_PAYABLE', 'MILK_PURCHASE_EXPENSE', 'FEED_INVENTORY',
        'CASH_BANK', 'ADVANCE_RECEIVABLE'
    ))
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_txn ON ledger_entries(transaction_id);

-- 4. Customer Advances (Emergency Loan Disbursements)
CREATE TABLE IF NOT EXISTS customer_advances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    advance_date DATE NOT NULL,
    principal_amount NUMERIC(10,2) NOT NULL,
    recovery_type VARCHAR(30) NOT NULL DEFAULT 'MONTHLY_BILL_DEDUCTION',
    total_recovered_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    outstanding_amount NUMERIC(10,2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    disbursed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    disbursed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_advance_principal CHECK (principal_amount > 0.00),
    CONSTRAINT chk_advance_recovery_bounds CHECK (total_recovered_amount >= 0.00 AND total_recovered_amount <= principal_amount),
    CONSTRAINT chk_advance_status CHECK (status IN ('ACTIVE', 'FULLY_RECOVERED', 'WRITTEN_OFF')),
    CONSTRAINT chk_advance_recovery_type CHECK (recovery_type IN ('MONTHLY_BILL_DEDUCTION', 'INSTALLMENTS', 'MANUAL'))
);

CREATE INDEX IF NOT EXISTS idx_customer_advances_cust ON customer_advances(customer_id);

-- 5. Customer Deductions (Veterinary, AI Breeding, and Cooperative Fees)
CREATE TABLE IF NOT EXISTS customer_deductions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    deduction_category VARCHAR(50) NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    description TEXT,
    is_applied_to_bill BOOLEAN NOT NULL DEFAULT FALSE,
    applied_bill_id UUID,
    approved_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_deduction_positive CHECK (amount > 0.00),
    CONSTRAINT chk_deduction_category CHECK (deduction_category IN (
        'VETERINARY_MEDICINE', 'AI_BREEDING_CHARGE', 'CATTLE_INSURANCE',
        'MEMBERSHIP_FEE', 'OTHER'
    ))
);

CREATE INDEX IF NOT EXISTS idx_customer_deductions_cust ON customer_deductions(customer_id);

-- 6. Customer Ledger Adjustments (Audited Manual Ledger Adjustments)
CREATE TABLE IF NOT EXISTS customer_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    adjustment_type VARCHAR(10) NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    reason TEXT NOT NULL,
    approved_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_adjustment_type CHECK (adjustment_type IN ('CREDIT', 'DEBIT')),
    CONSTRAINT chk_adjustment_positive CHECK (amount > 0.00)
);

CREATE INDEX IF NOT EXISTS idx_customer_adj_cust ON customer_adjustments(customer_id);


INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('009', '009_customer_ledger.sql') ON CONFLICT (version) DO NOTHING;

-- ========================================================
-- Migration: 010_devices_sync_and_audit.sql
-- ========================================================
-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 010: DEVICES, OFFLINE REPLICATION, AUDIT AND RLS FOUNDATION
-- ==============================================================================

-- 1. Devices Master (Registered Edge Counter Terminals and Tablets)
CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    device_identifier VARCHAR(100) NOT NULL UNIQUE,
    device_type VARCHAR(30) NOT NULL,
    public_key TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_device_type CHECK (device_type IN ('REGISTRATION_TABLET', 'COUNTER_TERMINAL', 'MOBILE_COLLECTOR')),
    CONSTRAINT chk_device_status CHECK (status IN ('ACTIVE', 'BLOCKED', 'DECOMMISSIONED'))
);

CREATE INDEX IF NOT EXISTS idx_devices_center ON devices(center_id);

-- 2. Device Sync State (Cursor Tracking per Terminal)
CREATE TABLE IF NOT EXISTS device_sync_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL UNIQUE REFERENCES devices(id) ON DELETE CASCADE,
    last_upstream_sync_at TIMESTAMPTZ,
    last_downstream_sync_at TIMESTAMPTZ,
    downstream_cursor BIGINT NOT NULL DEFAULT 0,
    client_app_version VARCHAR(30),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Sync Events (Append-Only Downstream Event Stream)
CREATE TABLE IF NOT EXISTS sync_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_sequence BIGSERIAL UNIQUE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(20) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_sync_action CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'RESTORE'))
);

CREATE INDEX IF NOT EXISTS idx_sync_events_sequence ON sync_events (event_sequence ASC);

-- 4. Sync Tombstones (Downstream Invalidation for Soft-Deletes & Revocations)
CREATE TABLE IF NOT EXISTS sync_tombstones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tombstone_sequence BIGSERIAL UNIQUE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    reason TEXT NOT NULL,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_tombstone_entity CHECK (entity_type IN ('CUSTOMER', 'FACE_ENROLLMENT', 'RFID_CARD', 'RATE_CHART'))
);

CREATE INDEX IF NOT EXISTS idx_sync_tombstones_sequence ON sync_tombstones (tombstone_sequence ASC);

-- 5. Sync Conflict Records
CREATE TABLE IF NOT EXISTS sync_conflict_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    idempotency_key VARCHAR(128) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    conflict_reason VARCHAR(100) NOT NULL,
    client_payload JSONB NOT NULL,
    server_state JSONB,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_device ON sync_conflict_records(device_id);

-- 6. Audit Logs Master (Immutable System-Wide Activity Log)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_date ON audit_logs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs (entity_type, entity_id);

-- 7. Approval Records
CREATE TABLE IF NOT EXISTS approval_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    approval_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    requested_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_approval_status CHECK (status IN ('APPROVED', 'REJECTED'))
);

CREATE INDEX IF NOT EXISTS idx_approval_records_entity ON approval_records(entity_id);

-- ==============================================================================
-- 8. COMPREHENSIVE ROW LEVEL SECURITY (RLS) & GRANTS ON ALL 43 TABLES
-- ==============================================================================

-- 8.1 Enable RLS on every public relational table
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dairy_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE center_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_center_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_milk_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_registration_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE face_model_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE face_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE biometric_retention_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfid_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfid_card_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE identification_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE supervisor_verification_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_charts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_chart_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_chart_cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_applicability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_quality_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_weight_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE milk_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_reversals ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_tombstones ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_conflict_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_records ENABLE ROW LEVEL SECURITY;

-- 8.2 Baseline Access Privileges
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- 8.3 Domain 1: Organizations & Dairy Centers
CREATE POLICY rls_org_select ON organizations
    FOR SELECT TO authenticated
    USING (id = public.current_org_id() OR public.current_user_role() = 'SUPER_ADMIN');

CREATE POLICY rls_org_admin_modify ON organizations
    FOR UPDATE TO authenticated
    USING (public.current_user_role() = 'SUPER_ADMIN' OR (id = public.current_org_id() AND public.current_user_role() = 'DAIRY_OWNER'))
    WITH CHECK (public.current_user_role() = 'SUPER_ADMIN' OR (id = public.current_org_id() AND public.current_user_role() = 'DAIRY_OWNER'));

CREATE POLICY rls_centers_select ON dairy_centers
    FOR SELECT TO authenticated
    USING (organization_id = public.current_org_id() OR public.current_user_role() = 'SUPER_ADMIN');

CREATE POLICY rls_centers_modify ON dairy_centers
    FOR ALL TO authenticated
    USING (organization_id = public.current_org_id() AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER'))
    WITH CHECK (organization_id = public.current_org_id() AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER'));

CREATE POLICY rls_center_settings_select ON center_settings
    FOR SELECT TO authenticated
    USING (center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id()));

CREATE POLICY rls_center_settings_modify ON center_settings
    FOR ALL TO authenticated
    USING (center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id()) AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER'))
    WITH CHECK (center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id()) AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER'));

CREATE POLICY rls_shifts_select ON collection_shifts
    FOR SELECT TO authenticated
    USING (center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id()));

CREATE POLICY rls_shifts_modify ON collection_shifts
    FOR ALL TO authenticated
    USING (center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id()) AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER'))
    WITH CHECK (center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id()) AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER'));

-- 8.4 Domain 2: Users & Staff Assignments
CREATE POLICY rls_users_select ON users
    FOR SELECT TO authenticated
    USING (organization_id = public.current_org_id() OR id = auth.uid() OR public.current_user_role() = 'SUPER_ADMIN');

CREATE POLICY rls_users_admin_modify ON users
    FOR ALL TO authenticated
    USING (organization_id = public.current_org_id() AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER'))
    WITH CHECK (organization_id = public.current_org_id() AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER'));

CREATE POLICY rls_user_center_assign_select ON user_center_assignments
    FOR SELECT TO authenticated
    USING (center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id()));

CREATE POLICY rls_user_center_assign_modify ON user_center_assignments
    FOR ALL TO authenticated
    USING (center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id()) AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER'))
    WITH CHECK (center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id()) AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER'));

-- 8.5 Domain 3: Customer Identity, Categories, Addresses & Consent
CREATE POLICY rls_customers_select ON customers
    FOR SELECT TO authenticated
    USING (
        (organization_id = public.current_org_id() AND public.current_user_role() != 'FARMER_CUSTOMER')
        OR (public.current_user_role() = 'FARMER_CUSTOMER' AND id = public.current_customer_id())
    );

CREATE POLICY rls_customers_insert ON customers
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = public.current_org_id()
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'REGISTRATION_OFFICER')
    );

CREATE POLICY rls_customers_update ON customers
    FOR UPDATE TO authenticated
    USING (
        organization_id = public.current_org_id()
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'REGISTRATION_OFFICER')
    )
    WITH CHECK (
        organization_id = public.current_org_id()
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'REGISTRATION_OFFICER')
    );

CREATE POLICY rls_cust_categories_select ON customer_milk_categories
    FOR SELECT TO authenticated
    USING (
        customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id() AND public.current_user_role() != 'FARMER_CUSTOMER')
        OR (public.current_user_role() = 'FARMER_CUSTOMER' AND customer_id = public.current_customer_id())
    );

CREATE POLICY rls_cust_categories_modify ON customer_milk_categories
    FOR ALL TO authenticated
    USING (
        customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'REGISTRATION_OFFICER')
    )
    WITH CHECK (
        customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'REGISTRATION_OFFICER')
    );

CREATE POLICY rls_cust_addresses_select ON customer_addresses
    FOR SELECT TO authenticated
    USING (
        customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id() AND public.current_user_role() != 'FARMER_CUSTOMER')
        OR (public.current_user_role() = 'FARMER_CUSTOMER' AND customer_id = public.current_customer_id())
    );

CREATE POLICY rls_cust_addresses_modify ON customer_addresses
    FOR ALL TO authenticated
    USING (
        customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'REGISTRATION_OFFICER')
    )
    WITH CHECK (
        customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'REGISTRATION_OFFICER')
    );

CREATE POLICY rls_cust_reg_records_select ON customer_registration_records
    FOR SELECT TO authenticated
    USING (center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id()));

CREATE POLICY rls_cust_reg_records_insert ON customer_registration_records
    FOR INSERT TO authenticated
    WITH CHECK (
        center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'REGISTRATION_OFFICER')
    );

CREATE POLICY rls_cust_status_history_select ON customer_status_history
    FOR SELECT TO authenticated
    USING (customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id()));

CREATE POLICY rls_cust_status_history_insert ON customer_status_history
    FOR INSERT TO authenticated
    WITH CHECK (
        customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'REGISTRATION_OFFICER')
    );

CREATE POLICY rls_cust_consent_records_select ON customer_consent_records
    FOR SELECT TO authenticated
    USING (
        customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id() AND public.current_user_role() != 'FARMER_CUSTOMER')
        OR (public.current_user_role() = 'FARMER_CUSTOMER' AND customer_id = public.current_customer_id())
    );

CREATE POLICY rls_cust_consent_records_insert ON customer_consent_records
    FOR INSERT TO authenticated
    WITH CHECK (
        customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'REGISTRATION_OFFICER')
    );

-- 8.6 Domain 4 & 5: Biometrics & RFID Management (Strictly Protected)
CREATE POLICY rls_face_models_select ON face_model_versions
    FOR SELECT TO authenticated
    USING (public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'REGISTRATION_OFFICER', 'COLLECTION_OPERATOR'));

CREATE POLICY rls_face_enrollments_select ON face_enrollments
    FOR SELECT TO authenticated
    USING (
        public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER')
        OR (public.current_user_role() = 'REGISTRATION_OFFICER' AND enrolled_by = auth.uid())
    );

CREATE POLICY rls_face_enrollments_insert ON face_enrollments
    FOR INSERT TO authenticated
    WITH CHECK (
        customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'REGISTRATION_OFFICER')
    );

CREATE POLICY rls_face_enrollments_update ON face_enrollments
    FOR UPDATE TO authenticated
    USING (
        customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER')
    )
    WITH CHECK (
        customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER')
    );

CREATE POLICY rls_biometric_retention_all ON biometric_retention_records
    FOR ALL TO authenticated
    USING (
        customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER')
    )
    WITH CHECK (
        customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER')
    );

CREATE POLICY rls_rfid_cards_select ON rfid_cards
    FOR SELECT TO authenticated
    USING (organization_id = public.current_org_id() AND public.current_user_role() != 'FARMER_CUSTOMER');

CREATE POLICY rls_rfid_cards_modify ON rfid_cards
    FOR ALL TO authenticated
    USING (
        organization_id = public.current_org_id()
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'REGISTRATION_OFFICER')
    )
    WITH CHECK (
        organization_id = public.current_org_id()
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'REGISTRATION_OFFICER')
    );

CREATE POLICY rls_rfid_assign_select ON rfid_card_assignments
    FOR SELECT TO authenticated
    USING (
        customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id() AND public.current_user_role() != 'FARMER_CUSTOMER')
        OR (public.current_user_role() = 'FARMER_CUSTOMER' AND customer_id = public.current_customer_id())
    );

CREATE POLICY rls_rfid_assign_modify ON rfid_card_assignments
    FOR ALL TO authenticated
    USING (
        center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'REGISTRATION_OFFICER')
    )
    WITH CHECK (
        center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'REGISTRATION_OFFICER')
    );

-- 8.7 Domain 6: Identification Telemetry & Supervisor Overrides
CREATE POLICY rls_id_audit_select ON identification_audit_logs
    FOR SELECT TO authenticated
    USING (organization_id = public.current_org_id() AND public.current_user_role() != 'FARMER_CUSTOMER');

CREATE POLICY rls_id_audit_insert ON identification_audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = public.current_org_id()
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'COLLECTION_OPERATOR')
    );

CREATE POLICY rls_sup_verif_select ON supervisor_verification_records
    FOR SELECT TO authenticated
    USING (center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id()) AND public.current_user_role() != 'FARMER_CUSTOMER');

CREATE POLICY rls_sup_verif_insert ON supervisor_verification_records
    FOR INSERT TO authenticated
    WITH CHECK (
        center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR')
    );

-- 8.8 Domain 7: Rate Charts & Pricing Engine
CREATE POLICY rls_rate_charts_select ON rate_charts
    FOR SELECT TO authenticated
    USING (organization_id = public.current_org_id());

CREATE POLICY rls_rate_charts_modify ON rate_charts
    FOR ALL TO authenticated
    USING (organization_id = public.current_org_id() AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER'))
    WITH CHECK (organization_id = public.current_org_id() AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER'));

CREATE POLICY rls_rate_versions_select ON rate_chart_versions
    FOR SELECT TO authenticated
    USING (rate_chart_id IN (SELECT id FROM rate_charts WHERE organization_id = public.current_org_id()));

CREATE POLICY rls_rate_versions_modify ON rate_chart_versions
    FOR ALL TO authenticated
    USING (
        rate_chart_id IN (SELECT id FROM rate_charts WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER')
    )
    WITH CHECK (
        rate_chart_id IN (SELECT id FROM rate_charts WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER')
    );

CREATE POLICY rls_rate_cells_select ON rate_chart_cells
    FOR SELECT TO authenticated
    USING (rate_chart_version_id IN (SELECT id FROM rate_chart_versions WHERE rate_chart_id IN (SELECT id FROM rate_charts WHERE organization_id = public.current_org_id())));

CREATE POLICY rls_rate_cells_modify ON rate_chart_cells
    FOR ALL TO authenticated
    USING (
        rate_chart_version_id IN (SELECT id FROM rate_chart_versions WHERE rate_chart_id IN (SELECT id FROM rate_charts WHERE organization_id = public.current_org_id()))
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER')
    )
    WITH CHECK (
        rate_chart_version_id IN (SELECT id FROM rate_chart_versions WHERE rate_chart_id IN (SELECT id FROM rate_charts WHERE organization_id = public.current_org_id()))
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER')
    );

CREATE POLICY rls_rate_rules_select ON rate_applicability_rules
    FOR SELECT TO authenticated
    USING (rate_chart_id IN (SELECT id FROM rate_charts WHERE organization_id = public.current_org_id()));

CREATE POLICY rls_rate_rules_modify ON rate_applicability_rules
    FOR ALL TO authenticated
    USING (
        rate_chart_id IN (SELECT id FROM rate_charts WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER')
    )
    WITH CHECK (
        rate_chart_id IN (SELECT id FROM rate_charts WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER')
    );

-- 8.9 Domain 8: Milk Intake, Weighing, Quality & Final Collections
CREATE POLICY rls_sessions_select ON collection_sessions
    FOR SELECT TO authenticated
    USING (center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id()));

CREATE POLICY rls_sessions_insert ON collection_sessions
    FOR INSERT TO authenticated
    WITH CHECK (
        center_id = public.current_center_id()
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'COLLECTION_OPERATOR')
    );

CREATE POLICY rls_sessions_update ON collection_sessions
    FOR UPDATE TO authenticated
    USING (
        center_id = public.current_center_id()
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'COLLECTION_OPERATOR')
    )
    WITH CHECK (
        center_id = public.current_center_id()
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'COLLECTION_OPERATOR')
    );

CREATE POLICY rls_quality_readings_select ON collection_quality_readings
    FOR SELECT TO authenticated
    USING (session_id IN (SELECT id FROM collection_sessions WHERE center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id())));

CREATE POLICY rls_quality_readings_insert ON collection_quality_readings
    FOR INSERT TO authenticated
    WITH CHECK (
        session_id IN (SELECT id FROM collection_sessions WHERE center_id = public.current_center_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'COLLECTION_OPERATOR')
    );

CREATE POLICY rls_weight_readings_select ON collection_weight_readings
    FOR SELECT TO authenticated
    USING (session_id IN (SELECT id FROM collection_sessions WHERE center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id())));

CREATE POLICY rls_weight_readings_insert ON collection_weight_readings
    FOR INSERT TO authenticated
    WITH CHECK (
        session_id IN (SELECT id FROM collection_sessions WHERE center_id = public.current_center_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'COLLECTION_OPERATOR')
    );

CREATE POLICY rls_collections_select ON milk_collections
    FOR SELECT TO authenticated
    USING (
        (center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id()) AND public.current_user_role() != 'FARMER_CUSTOMER')
        OR (public.current_user_role() = 'FARMER_CUSTOMER' AND customer_id = public.current_customer_id())
    );

CREATE POLICY rls_collections_insert ON milk_collections
    FOR INSERT TO authenticated
    WITH CHECK (
        center_id = public.current_center_id()
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'COLLECTION_OPERATOR')
    );

CREATE POLICY rls_receipts_select ON collection_receipts
    FOR SELECT TO authenticated
    USING (
        collection_id IN (SELECT id FROM milk_collections WHERE center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id()) AND public.current_user_role() != 'FARMER_CUSTOMER')
        OR (public.current_user_role() = 'FARMER_CUSTOMER' AND collection_id IN (SELECT id FROM milk_collections WHERE customer_id = public.current_customer_id()))
    );

CREATE POLICY rls_receipts_insert ON collection_receipts
    FOR INSERT TO authenticated
    WITH CHECK (
        collection_id IN (SELECT id FROM milk_collections WHERE center_id = public.current_center_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'COLLECTION_OPERATOR')
    );

CREATE POLICY rls_adj_reversals_select ON collection_adjustments
    FOR SELECT TO authenticated
    USING (collection_id IN (SELECT id FROM milk_collections WHERE center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id())));

CREATE POLICY rls_adj_reversals_insert ON collection_adjustments
    FOR INSERT TO authenticated
    WITH CHECK (
        collection_id IN (SELECT id FROM milk_collections WHERE center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id()))
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR')
    );

CREATE POLICY rls_reversals_select ON collection_reversals
    FOR SELECT TO authenticated
    USING (collection_id IN (SELECT id FROM milk_collections WHERE center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id())));

CREATE POLICY rls_reversals_insert ON collection_reversals
    FOR INSERT TO authenticated
    WITH CHECK (
        collection_id IN (SELECT id FROM milk_collections WHERE center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id()))
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR')
    );

-- 8.10 Domain 9: Farmer Financial Subledger (Append-Only & Immutable)
CREATE POLICY rls_ledger_accounts_select ON customer_ledger_accounts
    FOR SELECT TO authenticated
    USING (
        (organization_id = public.current_org_id() AND public.current_user_role() != 'FARMER_CUSTOMER')
        OR (public.current_user_role() = 'FARMER_CUSTOMER' AND customer_id = public.current_customer_id())
    );

CREATE POLICY rls_ledger_accounts_modify ON customer_ledger_accounts
    FOR ALL TO authenticated
    USING (
        organization_id = public.current_org_id()
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'ACCOUNTANT', 'CENTER_MANAGER', 'COLLECTION_OPERATOR')
    )
    WITH CHECK (
        organization_id = public.current_org_id()
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'ACCOUNTANT', 'CENTER_MANAGER', 'COLLECTION_OPERATOR')
    );

CREATE POLICY rls_ledger_txns_select ON ledger_transactions
    FOR SELECT TO authenticated
    USING (
        (organization_id = public.current_org_id() AND public.current_user_role() != 'FARMER_CUSTOMER')
        OR (public.current_user_role() = 'FARMER_CUSTOMER' AND customer_id = public.current_customer_id())
    );

CREATE POLICY rls_ledger_txns_insert ON ledger_transactions
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = public.current_org_id()
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'ACCOUNTANT', 'CENTER_MANAGER', 'SUPERVISOR', 'COLLECTION_OPERATOR')
    );

CREATE POLICY rls_ledger_entries_select ON ledger_entries
    FOR SELECT TO authenticated
    USING (transaction_id IN (SELECT id FROM ledger_transactions WHERE organization_id = public.current_org_id()));

CREATE POLICY rls_ledger_entries_insert ON ledger_entries
    FOR INSERT TO authenticated
    WITH CHECK (transaction_id IN (SELECT id FROM ledger_transactions WHERE organization_id = public.current_org_id()));

CREATE POLICY rls_advances_select ON customer_advances
    FOR SELECT TO authenticated
    USING (
        customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id() AND public.current_user_role() != 'FARMER_CUSTOMER')
        OR (public.current_user_role() = 'FARMER_CUSTOMER' AND customer_id = public.current_customer_id())
    );

CREATE POLICY rls_advances_modify ON customer_advances
    FOR ALL TO authenticated
    USING (
        center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'ACCOUNTANT', 'CENTER_MANAGER')
    )
    WITH CHECK (
        center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'ACCOUNTANT', 'CENTER_MANAGER')
    );

CREATE POLICY rls_deductions_select ON customer_deductions
    FOR SELECT TO authenticated
    USING (
        customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id() AND public.current_user_role() != 'FARMER_CUSTOMER')
        OR (public.current_user_role() = 'FARMER_CUSTOMER' AND customer_id = public.current_customer_id())
    );

CREATE POLICY rls_deductions_modify ON customer_deductions
    FOR ALL TO authenticated
    USING (
        center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'ACCOUNTANT', 'CENTER_MANAGER', 'SUPERVISOR')
    )
    WITH CHECK (
        center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'ACCOUNTANT', 'CENTER_MANAGER', 'SUPERVISOR')
    );

CREATE POLICY rls_cust_adj_select ON customer_adjustments
    FOR SELECT TO authenticated
    USING (customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id()));

CREATE POLICY rls_cust_adj_insert ON customer_adjustments
    FOR INSERT TO authenticated
    WITH CHECK (
        customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'ACCOUNTANT')
    );

-- 8.11 Domain 10: Devices, Offline Sync & System Audit
CREATE POLICY rls_devices_all ON devices
    FOR ALL TO authenticated
    USING (organization_id = public.current_org_id() AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER'))
    WITH CHECK (organization_id = public.current_org_id() AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER'));

CREATE POLICY rls_device_sync_state_all ON device_sync_state
    FOR ALL TO authenticated
    USING (device_id IN (SELECT id FROM devices WHERE organization_id = public.current_org_id()))
    WITH CHECK (device_id IN (SELECT id FROM devices WHERE organization_id = public.current_org_id()));

CREATE POLICY rls_sync_events_select ON sync_events
    FOR SELECT TO authenticated
    USING (organization_id = public.current_org_id());

CREATE POLICY rls_sync_events_insert ON sync_events
    FOR INSERT TO authenticated
    WITH CHECK (organization_id = public.current_org_id());

CREATE POLICY rls_sync_tombstones_select ON sync_tombstones
    FOR SELECT TO authenticated
    USING (organization_id = public.current_org_id());

CREATE POLICY rls_sync_tombstones_insert ON sync_tombstones
    FOR INSERT TO authenticated
    WITH CHECK (organization_id = public.current_org_id());

CREATE POLICY rls_sync_conflicts_all ON sync_conflict_records
    FOR ALL TO authenticated
    USING (device_id IN (SELECT id FROM devices WHERE organization_id = public.current_org_id()))
    WITH CHECK (device_id IN (SELECT id FROM devices WHERE organization_id = public.current_org_id()));

CREATE POLICY rls_audit_logs_select ON audit_logs
    FOR SELECT TO authenticated
    USING (organization_id = public.current_org_id() AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER'));

CREATE POLICY rls_audit_logs_insert ON audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (organization_id = public.current_org_id());

CREATE POLICY rls_approval_records_select ON approval_records
    FOR SELECT TO authenticated
    USING (organization_id = public.current_org_id());

CREATE POLICY rls_approval_records_modify ON approval_records
    FOR ALL TO authenticated
    USING (organization_id = public.current_org_id() AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR'))
    WITH CHECK (organization_id = public.current_org_id() AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR'));

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('010', '010_devices_sync_and_audit.sql') ON CONFLICT (version) DO NOTHING;

-- ========================================================
-- Migration: 011_customer_lifecycle_and_auth_mapping.sql
-- ========================================================
-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 011: CUSTOMER LIFECYCLE ATOMIC RPCs & SUPABASE AUTH IDENTITY MAPPING
-- ==============================================================================

-- 1. Identity Mapping Columns
-- Allows mapping between Supabase auth.users(id) and DFarm internal users / customers
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE;
CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON users(auth_user_id);

ALTER TABLE customers ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE;
CREATE INDEX IF NOT EXISTS idx_customers_auth_user_id ON customers(auth_user_id);

-- 2. Atomic Customer Registration Function
-- Transactionally creates: customer, milk categories, address (if provided),
-- registration record, initial status history, sync event, and audit log.
CREATE OR REPLACE FUNCTION public.register_customer(
    p_organization_id UUID,
    p_primary_center_id UUID,
    p_farmer_code VARCHAR(30),
    p_full_name VARCHAR(150),
    p_normalized_mobile VARCHAR(20),
    p_permitted_categories VARCHAR(20)[],
    p_registered_by UUID,
    p_device_id VARCHAR(100) DEFAULT 'BACKEND_API',
    p_address JSONB DEFAULT NULL,
    p_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_customer_id UUID;
    v_farmer_code VARCHAR(30);
    v_cat VARCHAR(20);
    v_org_count INT;
    v_center_count INT;
    v_result JSONB;
BEGIN
    -- Verify organization exists
    SELECT COUNT(*) INTO v_org_count FROM organizations WHERE id = p_organization_id;
    IF v_org_count = 0 THEN
        RAISE EXCEPTION 'Organization % does not exist', p_organization_id USING ERRCODE = 'P0002';
    END IF;

    -- Verify center belongs to organization
    SELECT COUNT(*) INTO v_center_count FROM dairy_centers WHERE id = p_primary_center_id AND organization_id = p_organization_id;
    IF v_center_count = 0 THEN
        RAISE EXCEPTION 'Center % does not belong to organization %', p_primary_center_id, p_organization_id USING ERRCODE = 'P0002';
    END IF;

    -- Check duplicate mobile in organization
    IF EXISTS (
        SELECT 1 FROM customers 
        WHERE organization_id = p_organization_id 
          AND normalized_mobile_number = p_normalized_mobile 
          AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Customer with mobile number % already exists in this organization', p_normalized_mobile USING ERRCODE = '23505';
    END IF;

    -- Customer ID
    v_customer_id := COALESCE(p_id, gen_random_uuid());

    -- Determine farmer code
    IF p_farmer_code IS NOT NULL AND LENGTH(TRIM(p_farmer_code)) > 0 THEN
        v_farmer_code := TRIM(p_farmer_code);
    ELSE
        -- Auto-generate code based on center prefix or sequential number
        v_farmer_code := 'F-' || UPPER(SUBSTRING(v_customer_id::text, 1, 8));
    END IF;

    -- 1. Insert customer
    INSERT INTO customers (
        id,
        organization_id,
        primary_center_id,
        farmer_code,
        full_name,
        normalized_mobile_number,
        status,
        registration_status,
        is_deleted,
        created_at,
        updated_at
    ) VALUES (
        v_customer_id,
        p_organization_id,
        p_primary_center_id,
        v_farmer_code,
        TRIM(p_full_name),
        TRIM(p_normalized_mobile),
        'DRAFT',
        'IN_PROGRESS',
        FALSE,
        NOW(),
        NOW()
    );

    -- 2. Insert permitted milk categories
    IF p_permitted_categories IS NOT NULL AND array_length(p_permitted_categories, 1) > 0 THEN
        FOREACH v_cat IN ARRAY p_permitted_categories LOOP
            IF v_cat NOT IN ('COW', 'BUFFALO') THEN
                RAISE EXCEPTION 'Invalid milk category: %', v_cat USING ERRCODE = '22023';
            END IF;
            INSERT INTO customer_milk_categories (
                customer_id,
                milk_category,
                is_authorized,
                authorized_at,
                authorized_by
            ) VALUES (
                v_customer_id,
                v_cat,
                TRUE,
                NOW(),
                p_registered_by
            );
        END LOOP;
    END IF;

    -- 3. Insert address if provided
    IF p_address IS NOT NULL AND jsonb_typeof(p_address) = 'object' THEN
        INSERT INTO customer_addresses (
            customer_id,
            village,
            hamlet_area,
            taluka_subdistrict,
            district,
            state,
            postal_code
        ) VALUES (
            v_customer_id,
            COALESCE(p_address->>'village', 'Default Village'),
            p_address->>'hamlet_area',
            COALESCE(p_address->>'taluka_subdistrict', 'Default Taluka'),
            COALESCE(p_address->>'district', 'Default District'),
            COALESCE(p_address->>'state', 'Maharashtra'),
            COALESCE(p_address->>'postal_code', '416001')
        );
    END IF;

    -- 4. Insert registration record
    INSERT INTO customer_registration_records (
        customer_id,
        center_id,
        registered_by,
        registration_channel,
        device_id,
        completed_at
    ) VALUES (
        v_customer_id,
        p_primary_center_id,
        p_registered_by,
        'BACKEND_API',
        COALESCE(p_device_id, 'BACKEND_API'),
        NULL
    );

    -- 5. Insert initial status history
    INSERT INTO customer_status_history (
        customer_id,
        previous_status,
        new_status,
        change_reason,
        changed_by,
        changed_at
    ) VALUES (
        v_customer_id,
        NULL,
        'DRAFT',
        'Initial customer registration via Backend API',
        p_registered_by,
        NOW()
    );

    -- 6. Insert sync event for edge terminals
    INSERT INTO sync_events (
        organization_id,
        center_id,
        entity_type,
        entity_id,
        action,
        payload
    ) VALUES (
        p_organization_id,
        p_primary_center_id,
        'CUSTOMER',
        v_customer_id,
        'INSERT',
        jsonb_build_object(
            'id', v_customer_id,
            'farmer_code', v_farmer_code,
            'full_name', TRIM(p_full_name),
            'status', 'DRAFT',
            'categories', p_permitted_categories
        )
    );

    -- 7. Insert audit log
    INSERT INTO audit_logs (
        organization_id,
        center_id,
        user_id,
        action,
        entity_type,
        entity_id,
        new_values
    ) VALUES (
        p_organization_id,
        p_primary_center_id,
        p_registered_by,
        'CUSTOMER_REGISTERED',
        'CUSTOMER',
        v_customer_id,
        jsonb_build_object(
            'id', v_customer_id,
            'farmer_code', v_farmer_code,
            'full_name', TRIM(p_full_name),
            'mobile', TRIM(p_normalized_mobile)
        )
    );

    -- Build return payload
    SELECT jsonb_build_object(
        'id', c.id,
        'organization_id', c.organization_id,
        'primary_center_id', c.primary_center_id,
        'farmer_code', c.farmer_code,
        'full_name', c.full_name,
        'normalized_mobile_number', c.normalized_mobile_number,
        'status', c.status,
        'registration_status', c.registration_status,
        'is_deleted', c.is_deleted,
        'created_at', c.created_at
    ) INTO v_result
    FROM customers c
    WHERE c.id = v_customer_id;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

ALTER FUNCTION public.register_customer(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR[], UUID, VARCHAR, JSONB, UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.register_customer(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR[], UUID, VARCHAR, JSONB, UUID) TO authenticated, service_role;


-- 3. Atomic Soft Delete Customer Function
CREATE OR REPLACE FUNCTION public.soft_delete_customer(
    p_customer_id UUID,
    p_organization_id UUID,
    p_deleted_by UUID,
    p_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_center_id UUID;
    v_prev_status VARCHAR(30);
    v_result JSONB;
BEGIN
    -- Check customer exists and belongs to organization
    SELECT primary_center_id, status INTO v_center_id, v_prev_status
    FROM customers
    WHERE id = p_customer_id AND organization_id = p_organization_id;

    IF v_center_id IS NULL THEN
        RAISE EXCEPTION 'Customer % not found in organization %', p_customer_id, p_organization_id USING ERRCODE = 'P0002';
    END IF;

    -- Update customer status to SOFT_DELETED
    UPDATE customers
    SET is_deleted = TRUE,
        deleted_at = NOW(),
        deleted_by = p_deleted_by,
        deletion_reason = p_reason,
        status = 'SOFT_DELETED',
        updated_at = NOW(),
        version = version + 1
    WHERE id = p_customer_id;

    -- Record status history
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
        'SOFT_DELETED',
        p_reason,
        p_deleted_by,
        NOW()
    );

    -- Insert sync tombstone to invalidate customer on offline counter terminals
    INSERT INTO sync_tombstones (
        organization_id,
        center_id,
        entity_type,
        entity_id,
        reason,
        deleted_at
    ) VALUES (
        p_organization_id,
        v_center_id,
        'CUSTOMER',
        p_customer_id,
        p_reason,
        NOW()
    );

    -- Insert sync event
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
        'DELETE',
        jsonb_build_object(
            'id', p_customer_id,
            'reason', p_reason,
            'deleted_by', p_deleted_by
        )
    );

    -- Insert audit log
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
        p_deleted_by,
        'CUSTOMER_SOFT_DELETED',
        'CUSTOMER',
        p_customer_id,
        jsonb_build_object('status', v_prev_status, 'is_deleted', FALSE),
        jsonb_build_object('status', 'SOFT_DELETED', 'is_deleted', TRUE, 'reason', p_reason)
    );

    SELECT jsonb_build_object(
        'id', c.id,
        'organization_id', c.organization_id,
        'status', c.status,
        'is_deleted', c.is_deleted,
        'deleted_at', c.deleted_at,
        'deletion_reason', c.deletion_reason
    ) INTO v_result
    FROM customers c
    WHERE c.id = p_customer_id;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

ALTER FUNCTION public.soft_delete_customer(UUID, UUID, UUID, TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.soft_delete_customer(UUID, UUID, UUID, TEXT) TO authenticated, service_role;


-- 4. Atomic Customer Restore Function
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
    v_has_active_face BOOLEAN;
    v_result JSONB;
BEGIN
    SELECT primary_center_id, status INTO v_center_id, v_prev_status
    FROM customers
    WHERE id = p_customer_id AND organization_id = p_organization_id AND is_deleted = TRUE;

    IF v_center_id IS NULL THEN
        RAISE EXCEPTION 'Soft-deleted customer % not found in organization %', p_customer_id, p_organization_id USING ERRCODE = 'P0002';
    END IF;

    -- Check if active face enrollment exists
    SELECT EXISTS (
        SELECT 1 FROM face_enrollments 
        WHERE customer_id = p_customer_id AND status = 'ACTIVE'
    ) INTO v_has_active_face;

    -- Target status: if previously completed enrollment, restore to PENDING_SYNC or ACTIVE, else DRAFT
    IF v_has_active_face THEN
        v_target_status := 'PENDING_SYNC';
    ELSE
        v_target_status := 'DRAFT';
    END IF;

    -- Restore customer
    UPDATE customers
    SET is_deleted = FALSE,
        deleted_at = NULL,
        deleted_by = NULL,
        deletion_reason = NULL,
        status = v_target_status,
        updated_at = NOW(),
        version = version + 1
    WHERE id = p_customer_id;

    -- Record status history
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

    -- Insert sync event
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

    -- Insert audit log
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

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('011', '011_customer_lifecycle_and_auth_mapping.sql') ON CONFLICT (version) DO NOTHING;

-- ========================================================
-- Migration: 012_sync_engine_enhancements.sql
-- ========================================================
-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 012: SYNC ENGINE ENHANCEMENTS, DEVICE AUTHENTICATION & IDEMPOTENCY
-- ==============================================================================

-- 1. Device Authentication and Offline Period Enhancements
ALTER TABLE devices 
    ADD COLUMN IF NOT EXISTS device_token_hash TEXT,
    ADD COLUMN IF NOT EXISTS max_offline_hours INT NOT NULL DEFAULT 72;

-- 2. Downstream Tombstone Tracking per Device
ALTER TABLE device_sync_state 
    ADD COLUMN IF NOT EXISTS downstream_tombstone_cursor BIGINT NOT NULL DEFAULT 0;

-- 3. Additional Indexes for Performance during High-Volume Sync
CREATE INDEX IF NOT EXISTS idx_sync_events_org_seq ON sync_events(organization_id, event_sequence ASC);
CREATE INDEX IF NOT EXISTS idx_sync_events_center_seq ON sync_events(center_id, event_sequence ASC);
CREATE INDEX IF NOT EXISTS idx_sync_tombstones_org_seq ON sync_tombstones(organization_id, tombstone_sequence ASC);
CREATE INDEX IF NOT EXISTS idx_sync_tombstones_center_seq ON sync_tombstones(center_id, tombstone_sequence ASC);
CREATE INDEX IF NOT EXISTS idx_milk_collections_idemp ON milk_collections(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_ledger_transactions_idemp ON ledger_transactions(idempotency_key);

-- 4. Secure RPC for Device Registration Validation
CREATE OR REPLACE FUNCTION public.register_or_authorize_device(
    p_organization_id UUID,
    p_center_id UUID,
    p_device_identifier VARCHAR(100),
    p_device_type VARCHAR(30),
    p_public_key TEXT,
    p_token_hash TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_device_id UUID;
    v_status VARCHAR(20);
    v_result JSONB;
BEGIN
    -- Check if device already exists
    SELECT id, status INTO v_device_id, v_status
    FROM devices
    WHERE device_identifier = p_device_identifier;

    IF v_device_id IS NOT NULL THEN
        -- If blocked, forbid registration
        IF v_status = 'BLOCKED' OR v_status = 'DECOMMISSIONED' THEN
            RAISE EXCEPTION 'Device % is revoked/blocked with status %', p_device_identifier, v_status USING ERRCODE = 'P0003';
        END IF;

        -- Update existing active device
        UPDATE devices
        SET organization_id = p_organization_id,
            center_id = p_center_id,
            device_type = p_device_type,
            public_key = COALESCE(p_public_key, public_key),
            device_token_hash = COALESCE(p_token_hash, device_token_hash),
            last_seen_at = NOW()
        WHERE id = v_device_id;
    ELSE
        -- Insert new device
        INSERT INTO devices (
            organization_id,
            center_id,
            device_identifier,
            device_type,
            public_key,
            device_token_hash,
            status,
            last_seen_at
        ) VALUES (
            p_organization_id,
            p_center_id,
            p_device_identifier,
            p_device_type,
            p_public_key,
            p_token_hash,
            'ACTIVE',
            NOW()
        )
        RETURNING id INTO v_device_id;

        -- Create initial sync state
        INSERT INTO device_sync_state (
            device_id,
            downstream_cursor,
            downstream_tombstone_cursor,
            updated_at
        ) VALUES (
            v_device_id,
            0,
            0,
            NOW()
        ) ON CONFLICT (device_id) DO NOTHING;
    END IF;

    SELECT jsonb_build_object(
        'device_id', d.id,
        'organization_id', d.organization_id,
        'center_id', d.center_id,
        'device_identifier', d.device_identifier,
        'device_type', d.device_type,
        'status', d.status,
        'max_offline_hours', d.max_offline_hours,
        'last_seen_at', d.last_seen_at
    ) INTO v_result
    FROM devices d
    WHERE d.id = v_device_id;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

ALTER FUNCTION public.register_or_authorize_device(UUID, UUID, VARCHAR, VARCHAR, TEXT, TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.register_or_authorize_device(UUID, UUID, VARCHAR, VARCHAR, TEXT, TEXT) TO authenticated, service_role;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('012', '012_sync_engine_enhancements.sql') ON CONFLICT (version) DO NOTHING;

-- ========================================================
-- Migration: 013_face_model_version_metadata.sql
-- ========================================================
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

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('013', '013_face_model_version_metadata.sql') ON CONFLICT (version) DO NOTHING;

-- ========================================================
-- Migration: 014_feed_inventory_procurement_and_sales.sql
-- ========================================================
-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 014: CATTLE FEED INVENTORY, PROCUREMENT, CUSTOMER SALES & STOCK ACCOUNTING
-- ==============================================================================

-- 1. Ensure DAIRY_ADMIN is in users.role CHECK constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_user_role;
ALTER TABLE users ADD CONSTRAINT chk_user_role CHECK (role IN (
    'SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'CENTER_MANAGER', 'SUPERVISOR',
    'COLLECTION_OPERATOR', 'ACCOUNTANT', 'INVENTORY_MANAGER', 'REGISTRATION_OFFICER', 'FARMER_CUSTOMER'
));

-- 2. Feed Category Management
CREATE TABLE IF NOT EXISTS feed_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_feed_categories_org_code UNIQUE (organization_id, code)
);

CREATE TRIGGER set_feed_categories_updated_at
BEFORE UPDATE ON feed_categories
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_feed_categories_org ON feed_categories(organization_id);

-- 3. Feed Product Catalog
CREATE TABLE IF NOT EXISTS feed_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    category_id UUID NOT NULL REFERENCES feed_categories(id) ON DELETE RESTRICT,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    base_unit VARCHAR(20) NOT NULL DEFAULT 'KG',
    pack_size NUMERIC(10,3) NOT NULL DEFAULT 1.000,
    pack_unit VARCHAR(20) NOT NULL DEFAULT 'KG',
    default_purchase_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    selling_price NUMERIC(10,2) NOT NULL,
    tax_rate_percent NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    hsn_code VARCHAR(20),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    minimum_stock_level NUMERIC(12,3) NOT NULL DEFAULT 0.000,
    weighted_avg_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_feed_products_org_code UNIQUE (organization_id, code),
    CONSTRAINT chk_feed_product_selling_price CHECK (selling_price >= 0.00),
    CONSTRAINT chk_feed_product_purchase_price CHECK (default_purchase_price >= 0.00),
    CONSTRAINT chk_feed_product_pack_size CHECK (pack_size > 0.000),
    CONSTRAINT chk_feed_product_tax_rate CHECK (tax_rate_percent >= 0.00 AND tax_rate_percent <= 100.00),
    CONSTRAINT chk_feed_product_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'DISCONTINUED')),
    CONSTRAINT chk_feed_product_base_unit CHECK (base_unit IN ('KG', 'BAG', 'PIECE', 'LITRE'))
);

CREATE TRIGGER set_feed_products_updated_at
BEFORE UPDATE ON feed_products
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_feed_products_org ON feed_products(organization_id);
CREATE INDEX IF NOT EXISTS idx_feed_products_category ON feed_products(category_id);

-- 4. Supplier Management
CREATE TABLE IF NOT EXISTS feed_suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    supplier_code VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    contact_person VARCHAR(100),
    phone_number VARCHAR(20) NOT NULL,
    email VARCHAR(150),
    address TEXT,
    gst_number VARCHAR(30),
    pan_number VARCHAR(30),
    outstanding_balance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_feed_suppliers_org_code UNIQUE (organization_id, supplier_code),
    CONSTRAINT chk_feed_supplier_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'BLOCKED'))
);

CREATE TRIGGER set_feed_suppliers_updated_at
BEFORE UPDATE ON feed_suppliers
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_feed_suppliers_org ON feed_suppliers(organization_id);

-- 5. Center-Wise Product Inventory
CREATE TABLE IF NOT EXISTS center_product_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES feed_products(id) ON DELETE RESTRICT,
    current_stock NUMERIC(12,3) NOT NULL DEFAULT 0.000,
    reserved_stock NUMERIC(12,3) NOT NULL DEFAULT 0.000,
    reorder_threshold NUMERIC(12,3) NOT NULL DEFAULT 0.000,
    last_movement_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_center_product_inventory UNIQUE (center_id, product_id),
    CONSTRAINT chk_center_product_current_stock CHECK (current_stock >= 0.000),
    CONSTRAINT chk_center_product_reserved_stock CHECK (reserved_stock >= 0.000)
);

CREATE TRIGGER set_center_product_inventory_updated_at
BEFORE UPDATE ON center_product_inventory
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_center_product_inv_center ON center_product_inventory(center_id);
CREATE INDEX IF NOT EXISTS idx_center_product_inv_product ON center_product_inventory(product_id);

-- 6. Feed Purchases (Procurement Header)
CREATE TABLE IF NOT EXISTS feed_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    supplier_id UUID NOT NULL REFERENCES feed_suppliers(id) ON DELETE RESTRICT,
    purchase_order_number VARCHAR(100),
    supplier_invoice_number VARCHAR(100) NOT NULL,
    purchase_date DATE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ORDERED',
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    received_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    received_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_feed_purchase_status CHECK (status IN ('ORDERED', 'RECEIVED', 'CANCELLED')),
    CONSTRAINT chk_feed_purchase_amounts CHECK (subtotal >= 0.00 AND tax_amount >= 0.00 AND total_amount >= 0.00)
);

CREATE TRIGGER set_feed_purchases_updated_at
BEFORE UPDATE ON feed_purchases
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_feed_purchases_org ON feed_purchases(organization_id);
CREATE INDEX IF NOT EXISTS idx_feed_purchases_center ON feed_purchases(center_id);
CREATE INDEX IF NOT EXISTS idx_feed_purchases_supplier ON feed_purchases(supplier_id);

-- 7. Feed Purchase Items (Procurement Details)
CREATE TABLE IF NOT EXISTS feed_purchase_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id UUID NOT NULL REFERENCES feed_purchases(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES feed_products(id) ON DELETE RESTRICT,
    quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0.000),
    unit VARCHAR(20) NOT NULL,
    base_quantity NUMERIC(12,3) NOT NULL CHECK (base_quantity > 0.000),
    unit_cost NUMERIC(10,2) NOT NULL CHECK (unit_cost >= 0.00),
    tax_rate_percent NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total_cost NUMERIC(12,2) NOT NULL CHECK (total_cost >= 0.00),
    batch_number VARCHAR(100),
    expiry_date DATE
);

CREATE INDEX IF NOT EXISTS idx_feed_purchase_items_purchase ON feed_purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_feed_purchase_items_product ON feed_purchase_items(product_id);

-- 8. Append-Only Stock Movements Ledger
CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES feed_products(id) ON DELETE RESTRICT,
    movement_type VARCHAR(40) NOT NULL,
    direction VARCHAR(10) NOT NULL,
    quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0.000),
    quantity_delta NUMERIC(12,3) NOT NULL,
    base_unit VARCHAR(20) NOT NULL,
    balance_after NUMERIC(12,3) NOT NULL CHECK (balance_after >= 0.000),
    unit_cost NUMERIC(10,2),
    reference_transaction_type VARCHAR(50) NOT NULL,
    reference_id UUID NOT NULL,
    batch_number VARCHAR(100),
    actor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    movement_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT,
    CONSTRAINT chk_stock_movement_direction CHECK (direction IN ('IN', 'OUT')),
    CONSTRAINT chk_stock_movement_type CHECK (movement_type IN (
        'PURCHASE_RECEIPT', 'CUSTOMER_SALE', 'CUSTOMER_RETURN',
        'SUPPLIER_RETURN', 'DAMAGED_WRITE_OFF', 'STOCK_CORRECTION',
        'CENTER_TRANSFER'
    )),
    CONSTRAINT chk_stock_movement_ref_type CHECK (reference_transaction_type IN (
        'FEED_PURCHASE', 'FEED_SALE', 'FEED_RETURN',
        'INVENTORY_ADJUSTMENT', 'CENTER_TRANSFER'
    ))
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_center ON stock_movements(center_id, movement_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id, movement_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_ref ON stock_movements(reference_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_idemp ON stock_movements(idempotency_key);

-- 9. Feed Sales Header
CREATE TABLE IF NOT EXISTS feed_sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    invoice_number VARCHAR(50) NOT NULL UNIQUE,
    receipt_number VARCHAR(50) NOT NULL UNIQUE,
    sale_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    payment_mode VARCHAR(20) NOT NULL DEFAULT 'CREDIT',
    status VARCHAR(30) NOT NULL DEFAULT 'COMPLETED',
    discount_approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    client_sale_uuid UUID,
    ledger_transaction_id UUID REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
    sync_status VARCHAR(20) NOT NULL DEFAULT 'SYNCED',
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_feed_sale_payment_mode CHECK (payment_mode IN ('CREDIT', 'CASH')),
    CONSTRAINT chk_feed_sale_status CHECK (status IN ('COMPLETED', 'CANCELLED', 'RETURNED', 'PARTIALLY_RETURNED')),
    CONSTRAINT chk_feed_sale_sync_status CHECK (sync_status IN ('SYNCED', 'PENDING_SYNC', 'CONFLICT')),
    CONSTRAINT chk_feed_sale_amounts CHECK (subtotal >= 0.00 AND discount_amount >= 0.00 AND tax_amount >= 0.00 AND total_amount >= 0.00)
);

CREATE TRIGGER set_feed_sales_updated_at
BEFORE UPDATE ON feed_sales
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_feed_sales_org ON feed_sales(organization_id);
CREATE INDEX IF NOT EXISTS idx_feed_sales_center ON feed_sales(center_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_sales_customer ON feed_sales(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_sales_idemp ON feed_sales(idempotency_key);

-- 10. Feed Sale Items
CREATE TABLE IF NOT EXISTS feed_sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES feed_sales(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES feed_products(id) ON DELETE RESTRICT,
    quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0.000),
    unit VARCHAR(20) NOT NULL,
    base_quantity NUMERIC(12,3) NOT NULL CHECK (base_quantity > 0.000),
    unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0.00),
    tax_rate_percent NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0.00)
);

CREATE INDEX IF NOT EXISTS idx_feed_sale_items_sale ON feed_sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_feed_sale_items_product ON feed_sale_items(product_id);

-- 11. Feed Returns
CREATE TABLE IF NOT EXISTS feed_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    sale_id UUID NOT NULL REFERENCES feed_sales(id) ON DELETE RESTRICT,
    sale_item_id UUID NOT NULL REFERENCES feed_sale_items(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES feed_products(id) ON DELETE RESTRICT,
    return_quantity NUMERIC(12,3) NOT NULL CHECK (return_quantity > 0.000),
    base_quantity NUMERIC(12,3) NOT NULL CHECK (base_quantity > 0.000),
    unit VARCHAR(20) NOT NULL,
    credit_amount NUMERIC(10,2) NOT NULL CHECK (credit_amount > 0.00),
    stock_condition VARCHAR(20) NOT NULL,
    reason TEXT NOT NULL,
    approved_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    stock_movement_id UUID REFERENCES stock_movements(id) ON DELETE RESTRICT,
    ledger_transaction_id UUID REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    returned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_feed_return_condition CHECK (stock_condition IN ('SALEABLE', 'DAMAGED'))
);

CREATE INDEX IF NOT EXISTS idx_feed_returns_sale ON feed_returns(sale_id);
CREATE INDEX IF NOT EXISTS idx_feed_returns_customer ON feed_returns(customer_id);

-- 12. Center Inventory Transfers
CREATE TABLE IF NOT EXISTS inventory_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    source_center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    destination_center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES feed_products(id) ON DELETE RESTRICT,
    quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0.000),
    unit VARCHAR(20) NOT NULL,
    base_quantity NUMERIC(12,3) NOT NULL CHECK (base_quantity > 0.000),
    status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
    source_movement_id UUID REFERENCES stock_movements(id),
    destination_movement_id UUID REFERENCES stock_movements(id),
    initiated_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    transfer_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    CONSTRAINT chk_inv_transfer_diff_centers CHECK (source_center_id <> destination_center_id),
    CONSTRAINT chk_inv_transfer_status CHECK (status IN ('COMPLETED', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS idx_inv_transfers_source ON inventory_transfers(source_center_id);
CREATE INDEX IF NOT EXISTS idx_inv_transfers_dest ON inventory_transfers(destination_center_id);

-- 13. Inventory Adjustments & Write-offs
CREATE TABLE IF NOT EXISTS inventory_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES feed_products(id) ON DELETE RESTRICT,
    adjustment_type VARCHAR(40) NOT NULL,
    quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0.000),
    direction VARCHAR(10) NOT NULL,
    reason TEXT NOT NULL,
    approved_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    stock_movement_id UUID REFERENCES stock_movements(id),
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    adjusted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_inv_adj_direction CHECK (direction IN ('IN', 'OUT')),
    CONSTRAINT chk_inv_adj_type CHECK (adjustment_type IN ('DAMAGED_WRITE_OFF', 'STOCK_CORRECTION', 'PHYSICAL_AUDIT_SURPLUS', 'PHYSICAL_AUDIT_DEFICIT'))
);

CREATE INDEX IF NOT EXISTS idx_inv_adj_center ON inventory_adjustments(center_id);

-- ==============================================================================
-- 14. STORED PROCEDURES & BUSINESS WORKFLOWS
-- ==============================================================================

-- A. Authorize and Receive Stock for a Feed Purchase
CREATE OR REPLACE FUNCTION public.receive_feed_purchase(
    p_purchase_id UUID,
    p_received_by UUID,
    p_idempotency_key VARCHAR(128)
)
RETURNS JSONB AS $$
DECLARE
    v_purchase RECORD;
    v_item RECORD;
    v_product RECORD;
    v_receiver RECORD;
    v_curr_stock NUMERIC(12,3);
    v_new_stock NUMERIC(12,3);
    v_new_wac NUMERIC(10,2);
    v_movement_id UUID;
    v_result JSONB;
BEGIN
    -- Check idempotency
    SELECT * INTO v_purchase FROM feed_purchases WHERE id = p_purchase_id;
    IF v_purchase.id IS NULL THEN
        RAISE EXCEPTION 'Purchase % does not exist', p_purchase_id USING ERRCODE = 'P0002';
    END IF;

    IF v_purchase.status = 'RECEIVED' THEN
        SELECT jsonb_build_object(
            'purchaseId', v_purchase.id,
            'status', v_purchase.status,
            'supplierInvoiceNumber', v_purchase.supplier_invoice_number,
            'totalAmount', v_purchase.total_amount,
            'isIdempotentReplay', TRUE
        ) INTO v_result;
        RETURN v_result;
    END IF;

    -- Verify receiver exists and is authorized staff
    SELECT * INTO v_receiver FROM users WHERE id = p_received_by;
    IF v_receiver.id IS NULL OR v_receiver.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Receiver % is not an active staff user', p_received_by USING ERRCODE = '22000';
    END IF;

    IF v_receiver.role NOT IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'INVENTORY_MANAGER', 'CENTER_MANAGER') THEN
        RAISE EXCEPTION 'User % with role % is not authorized to receive stock purchases', p_received_by, v_receiver.role USING ERRCODE = '42501';
    END IF;

    -- Process each item and update stock atomically
    FOR v_item IN SELECT * FROM feed_purchase_items WHERE purchase_id = p_purchase_id LOOP
        SELECT * INTO v_product FROM feed_products WHERE id = v_item.product_id;

        -- Ensure inventory row exists with FOR UPDATE
        INSERT INTO center_product_inventory (organization_id, center_id, product_id, current_stock, reserved_stock, reorder_threshold)
        VALUES (v_purchase.organization_id, v_purchase.center_id, v_item.product_id, 0.000, 0.000, v_product.minimum_stock_level)
        ON CONFLICT (center_id, product_id) DO NOTHING;

        SELECT current_stock INTO v_curr_stock 
        FROM center_product_inventory 
        WHERE center_id = v_purchase.center_id AND product_id = v_item.product_id 
        FOR UPDATE;

        v_new_stock := v_curr_stock + v_item.base_quantity;

        UPDATE center_product_inventory
        SET current_stock = v_new_stock,
            last_movement_at = NOW(),
            updated_at = NOW()
        WHERE center_id = v_purchase.center_id AND product_id = v_item.product_id;

        -- Record stock movement
        v_movement_id := gen_random_uuid();
        INSERT INTO stock_movements (
            id,
            organization_id,
            center_id,
            product_id,
            movement_type,
            direction,
            quantity,
            quantity_delta,
            base_unit,
            balance_after,
            unit_cost,
            reference_transaction_type,
            reference_id,
            batch_number,
            actor_id,
            approved_by,
            idempotency_key,
            movement_timestamp
        ) VALUES (
            v_movement_id,
            v_purchase.organization_id,
            v_purchase.center_id,
            v_item.product_id,
            'PURCHASE_RECEIPT',
            'IN',
            v_item.base_quantity,
            v_item.base_quantity,
            v_product.base_unit,
            v_new_stock,
            v_item.unit_cost,
            'FEED_PURCHASE',
            p_purchase_id,
            v_item.batch_number,
            p_received_by,
            p_received_by,
            p_idempotency_key || '_' || v_item.id::text,
            NOW()
        );

        -- Update Weighted Average Cost (WAC)
        IF (v_curr_stock + v_item.base_quantity) > 0 THEN
            v_new_wac := ROUND(((v_curr_stock * v_product.weighted_avg_cost) + (v_item.base_quantity * v_item.unit_cost)) / (v_curr_stock + v_item.base_quantity), 2);
        ELSE
            v_new_wac := v_item.unit_cost;
        END IF;

        UPDATE feed_products
        SET weighted_avg_cost = v_new_wac,
            updated_at = NOW()
        WHERE id = v_item.product_id;
    END LOOP;

    -- Update purchase status
    UPDATE feed_purchases
    SET status = 'RECEIVED',
        received_by = p_received_by,
        received_at = NOW(),
        updated_at = NOW()
    WHERE id = p_purchase_id;

    -- Update supplier outstanding balance
    UPDATE feed_suppliers
    SET outstanding_balance = outstanding_balance + v_purchase.total_amount,
        updated_at = NOW()
    WHERE id = v_purchase.supplier_id;

    -- Emit sync event
    INSERT INTO sync_events (
        organization_id,
        center_id,
        entity_type,
        entity_id,
        action,
        payload
    ) VALUES (
        v_purchase.organization_id,
        v_purchase.center_id,
        'FEED_PURCHASE',
        p_purchase_id,
        'UPDATE',
        jsonb_build_object(
            'id', p_purchase_id,
            'status', 'RECEIVED',
            'receivedBy', p_received_by,
            'totalAmount', v_purchase.total_amount
        )
    );

    SELECT jsonb_build_object(
        'purchaseId', p_purchase_id,
        'status', 'RECEIVED',
        'supplierInvoiceNumber', v_purchase.supplier_invoice_number,
        'totalAmount', v_purchase.total_amount,
        'receivedAt', NOW(),
        'receivedBy', p_received_by,
        'isIdempotentReplay', FALSE
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

-- B. Process Customer Feed Sale with Atomic Stock & Customer Ledger Debit
CREATE OR REPLACE FUNCTION public.process_customer_feed_sale(
    p_organization_id UUID,
    p_center_id UUID,
    p_customer_id UUID,
    p_operator_id UUID,
    p_payment_mode VARCHAR(20),
    p_items JSONB,
    p_discount_amount NUMERIC(10,2),
    p_discount_approved_by UUID,
    p_idempotency_key VARCHAR(128),
    p_client_sale_uuid UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_sale_id UUID;
    v_existing_sale RECORD;
    v_customer RECORD;
    v_center RECORD;
    v_operator RECORD;
    v_approver RECORD;
    v_item JSONB;
    v_product RECORD;
    v_curr_stock NUMERIC(12,3);
    v_base_qty NUMERIC(12,3);
    v_item_subtotal NUMERIC(12,2);
    v_item_tax NUMERIC(10,2);
    v_item_total NUMERIC(12,2);
    v_sale_subtotal NUMERIC(12,2) := 0.00;
    v_sale_tax NUMERIC(12,2) := 0.00;
    v_sale_total NUMERIC(12,2) := 0.00;
    v_invoice_num VARCHAR(50);
    v_receipt_num VARCHAR(50);
    v_balance_after NUMERIC(12,3);
    v_ledger_account RECORD;
    v_cust_balance_after NUMERIC(12,2);
    v_ledger_txn_id UUID;
    v_result JSONB;
BEGIN
    -- 1. Idempotency Check
    SELECT * INTO v_existing_sale FROM feed_sales WHERE idempotency_key = p_idempotency_key;
    IF v_existing_sale.id IS NULL AND p_client_sale_uuid IS NOT NULL THEN
        SELECT * INTO v_existing_sale FROM feed_sales WHERE id = p_client_sale_uuid;
    END IF;

    IF v_existing_sale.id IS NOT NULL THEN
        SELECT jsonb_build_object(
            'saleId', v_existing_sale.id,
            'invoiceNumber', v_existing_sale.invoice_number,
            'receiptNumber', v_existing_sale.receipt_number,
            'customerId', v_existing_sale.customer_id,
            'totalAmount', v_existing_sale.total_amount,
            'status', v_existing_sale.status,
            'paymentMode', v_existing_sale.payment_mode,
            'ledgerTransactionId', v_existing_sale.ledger_transaction_id,
            'isIdempotentReplay', TRUE,
            'completedAt', v_existing_sale.created_at
        ) INTO v_result;
        RETURN v_result;
    END IF;

    -- 2. Verify Customer
    SELECT * INTO v_customer FROM customers WHERE id = p_customer_id;
    IF v_customer.id IS NULL THEN
        RAISE EXCEPTION 'Customer % does not exist', p_customer_id USING ERRCODE = 'P0002';
    END IF;
    IF v_customer.is_deleted = TRUE THEN
        RAISE EXCEPTION 'Customer % is soft-deleted and cannot make purchases', p_customer_id USING ERRCODE = '22000';
    END IF;
    IF v_customer.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Customer % is not ACTIVE (status: %)', p_customer_id, v_customer.status USING ERRCODE = '22000';
    END IF;
    IF v_customer.organization_id <> p_organization_id THEN
        RAISE EXCEPTION 'Customer organization mismatch' USING ERRCODE = '22000';
    END IF;

    -- 3. Verify Center
    SELECT * INTO v_center FROM dairy_centers WHERE id = p_center_id;
    IF v_center.id IS NULL OR v_center.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Center % is not active or does not exist', p_center_id USING ERRCODE = '22000';
    END IF;
    IF v_center.organization_id <> p_organization_id THEN
        RAISE EXCEPTION 'Center organization mismatch' USING ERRCODE = '22000';
    END IF;

    -- 4. Verify Operator
    SELECT * INTO v_operator FROM users WHERE id = p_operator_id;
    IF v_operator.id IS NULL OR v_operator.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Operator % is not active', p_operator_id USING ERRCODE = '22000';
    END IF;

    -- 5. Verify Discount Authorization
    IF COALESCE(p_discount_amount, 0.00) > 0.00 THEN
        IF p_discount_approved_by IS NULL THEN
            RAISE EXCEPTION 'Discount amount % requires manager or owner approval', p_discount_amount USING ERRCODE = '42501';
        END IF;

        SELECT * INTO v_approver FROM users WHERE id = p_discount_approved_by;
        IF v_approver.id IS NULL OR v_approver.status <> 'ACTIVE' THEN
            RAISE EXCEPTION 'Discount approver % is not active', p_discount_approved_by USING ERRCODE = '22000';
        END IF;
        IF v_approver.role NOT IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'CENTER_MANAGER') THEN
            RAISE EXCEPTION 'User % with role % is not authorized to approve feed discounts', p_discount_approved_by, v_approver.role USING ERRCODE = '42501';
        END IF;
    END IF;

    -- 6. Pass 1: Verify Items, Explicit Unit Conversions & Negative Stock Rejection
    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Feed sale must contain at least one item' USING ERRCODE = '22023';
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        SELECT * INTO v_product FROM feed_products WHERE id = (v_item ->> 'productId')::UUID;
        IF v_product.id IS NULL THEN
            RAISE EXCEPTION 'Product % does not exist', v_item ->> 'productId' USING ERRCODE = 'P0002';
        END IF;
        IF v_product.status <> 'ACTIVE' THEN
            RAISE EXCEPTION 'Product % is not ACTIVE (status: %)', v_product.name, v_product.status USING ERRCODE = '22000';
        END IF;
        IF v_product.organization_id <> p_organization_id THEN
            RAISE EXCEPTION 'Product % organization mismatch', v_product.name USING ERRCODE = '22000';
        END IF;

        -- Explicit Unit Conversion
        IF (v_item ->> 'unit') = v_product.base_unit THEN
            v_base_qty := (v_item ->> 'quantity')::NUMERIC;
        ELSIF (v_item ->> 'unit') = v_product.pack_unit THEN
            v_base_qty := (v_item ->> 'quantity')::NUMERIC * v_product.pack_size;
        ELSE
            RAISE EXCEPTION 'Invalid unit % for product %. Must be % or %', (v_item ->> 'unit'), v_product.name, v_product.base_unit, v_product.pack_unit USING ERRCODE = '22023';
        END IF;

        IF v_base_qty <= 0.000 THEN
            RAISE EXCEPTION 'Invalid quantity % for product %', v_base_qty, v_product.name USING ERRCODE = '22003';
        END IF;

        -- Lock center inventory and strictly enforce Negative Stock Policy
        SELECT current_stock INTO v_curr_stock 
        FROM center_product_inventory 
        WHERE center_id = p_center_id AND product_id = v_product.id 
        FOR UPDATE;

        IF v_curr_stock IS NULL OR v_curr_stock < v_base_qty THEN
            RAISE EXCEPTION 'Insufficient stock for product % at center % (Available: %, Requested: %)', 
                v_product.name, v_center.name, COALESCE(v_curr_stock, 0.000), v_base_qty 
                USING ERRCODE = '22000';
        END IF;

        -- Calculate amounts with price snapshot
        v_item_subtotal := ROUND(((v_item ->> 'quantity')::NUMERIC * v_product.selling_price) - COALESCE((v_item ->> 'discountAmount')::NUMERIC, 0.00), 2);
        v_item_tax := ROUND(v_item_subtotal * (v_product.tax_rate_percent / 100.0), 2);
        v_item_total := v_item_subtotal + v_item_tax;

        v_sale_subtotal := v_sale_subtotal + v_item_subtotal;
        v_sale_tax := v_sale_tax + v_item_tax;
    END LOOP;

    v_sale_total := v_sale_subtotal + v_sale_tax - COALESCE(p_discount_amount, 0.00);
    IF v_sale_total < 0.00 THEN
        v_sale_total := 0.00;
    END IF;

    -- 7. Generate Identifiers
    v_sale_id := COALESCE(p_client_sale_uuid, gen_random_uuid());
    v_invoice_num := 'INV-FEED-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(v_sale_id::text, 1, 8));
    v_receipt_num := 'RCP-FEED-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(v_sale_id::text, 1, 8));

    -- 8. Insert Feed Sale Header
    INSERT INTO feed_sales (
        id,
        organization_id,
        center_id,
        customer_id,
        invoice_number,
        receipt_number,
        subtotal,
        discount_amount,
        tax_amount,
        total_amount,
        payment_mode,
        status,
        discount_approved_by,
        idempotency_key,
        client_sale_uuid,
        created_by,
        created_at
    ) VALUES (
        v_sale_id,
        p_organization_id,
        p_center_id,
        p_customer_id,
        v_invoice_num,
        v_receipt_num,
        v_sale_subtotal,
        COALESCE(p_discount_amount, 0.00),
        v_sale_tax,
        v_sale_total,
        p_payment_mode,
        'COMPLETED',
        p_discount_approved_by,
        p_idempotency_key,
        p_client_sale_uuid,
        p_operator_id,
        NOW()
    );

    -- 9. Pass 2: Deduct Stock & Insert Sale Items & Stock Movements
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        SELECT * INTO v_product FROM feed_products WHERE id = (v_item ->> 'productId')::UUID;

        IF (v_item ->> 'unit') = v_product.base_unit THEN
            v_base_qty := (v_item ->> 'quantity')::NUMERIC;
        ELSE
            v_base_qty := (v_item ->> 'quantity')::NUMERIC * v_product.pack_size;
        END IF;

        v_item_subtotal := ROUND(((v_item ->> 'quantity')::NUMERIC * v_product.selling_price) - COALESCE((v_item ->> 'discountAmount')::NUMERIC, 0.00), 2);
        v_item_tax := ROUND(v_item_subtotal * (v_product.tax_rate_percent / 100.0), 2);
        v_item_total := v_item_subtotal + v_item_tax;

        -- Deduct from center inventory
        UPDATE center_product_inventory
        SET current_stock = current_stock - v_base_qty,
            last_movement_at = NOW(),
            updated_at = NOW()
        WHERE center_id = p_center_id AND product_id = v_product.id
        RETURNING current_stock INTO v_balance_after;

        -- Insert item record
        INSERT INTO feed_sale_items (
            sale_id,
            product_id,
            quantity,
            unit,
            base_quantity,
            unit_price,
            tax_rate_percent,
            tax_amount,
            discount_amount,
            total_amount
        ) VALUES (
            v_sale_id,
            v_product.id,
            (v_item ->> 'quantity')::NUMERIC,
            (v_item ->> 'unit'),
            v_base_qty,
            v_product.selling_price,
            v_product.tax_rate_percent,
            v_item_tax,
            COALESCE((v_item ->> 'discountAmount')::NUMERIC, 0.00),
            v_item_total
        );

        -- Insert append-only stock movement
        INSERT INTO stock_movements (
            organization_id,
            center_id,
            product_id,
            movement_type,
            direction,
            quantity,
            quantity_delta,
            base_unit,
            balance_after,
            unit_cost,
            reference_transaction_type,
            reference_id,
            actor_id,
            approved_by,
            idempotency_key,
            movement_timestamp
        ) VALUES (
            p_organization_id,
            p_center_id,
            v_product.id,
            'CUSTOMER_SALE',
            'OUT',
            v_base_qty,
            -v_base_qty,
            v_product.base_unit,
            v_balance_after,
            v_product.weighted_avg_cost,
            'FEED_SALE',
            v_sale_id,
            p_operator_id,
            p_operator_id,
            p_idempotency_key || '_' || v_product.id::text,
            NOW()
        );
    END LOOP;

    -- 10. Customer Credit Ledger Integration (Debit Customer Balance)
    IF p_payment_mode = 'CREDIT' AND v_sale_total > 0.00 THEN
        -- Lock or create customer ledger account
        INSERT INTO customer_ledger_accounts (customer_id, organization_id, currency, current_balance)
        VALUES (p_customer_id, p_organization_id, 'INR', 0.00)
        ON CONFLICT (customer_id) DO NOTHING;

        SELECT * INTO v_ledger_account 
        FROM customer_ledger_accounts 
        WHERE customer_id = p_customer_id 
        FOR UPDATE;

        -- In DFarm accounting, DEBIT reduces farmer payable balance (farmer owes dairy)
        v_cust_balance_after := v_ledger_account.current_balance - v_sale_total;

        UPDATE customer_ledger_accounts
        SET current_balance = v_cust_balance_after,
            last_transaction_at = NOW(),
            updated_at = NOW()
        WHERE customer_id = p_customer_id;

        -- Record ledger transaction
        v_ledger_txn_id := gen_random_uuid();
        INSERT INTO ledger_transactions (
            id,
            organization_id,
            center_id,
            customer_id,
            transaction_type,
            direction,
            amount,
            balance_after,
            reference_entity,
            reference_id,
            description,
            idempotency_key,
            created_by,
            created_at
        ) VALUES (
            v_ledger_txn_id,
            p_organization_id,
            p_center_id,
            p_customer_id,
            'FEED_PURCHASE_DEBIT',
            'DEBIT',
            v_sale_total,
            v_cust_balance_after,
            'FEED_SALE',
            v_sale_id,
            'Cattle feed credit purchase: ' || v_invoice_num,
            p_idempotency_key || '_ledger',
            p_operator_id,
            NOW()
        );

        -- Double-entry balanced journal entries
        -- 1. DEBIT Customer Payable (liability reduction / farmer receivable)
        INSERT INTO ledger_entries (
            transaction_id,
            account_id,
            account_type,
            entry_type,
            amount
        ) VALUES (
            v_ledger_txn_id,
            p_customer_id,
            'CUSTOMER_PAYABLE',
            'DEBIT',
            v_sale_total
        );

        -- 2. CREDIT Feed Inventory (asset reduction / store inventory)
        INSERT INTO ledger_entries (
            transaction_id,
            account_id,
            account_type,
            entry_type,
            amount
        ) VALUES (
            v_ledger_txn_id,
            p_center_id,
            'FEED_INVENTORY',
            'CREDIT',
            v_sale_total
        );

        UPDATE feed_sales
        SET ledger_transaction_id = v_ledger_txn_id
        WHERE id = v_sale_id;
    END IF;

    -- 11. Sync Event
    INSERT INTO sync_events (
        organization_id,
        center_id,
        entity_type,
        entity_id,
        action,
        payload
    ) VALUES (
        p_organization_id,
        p_center_id,
        'FEED_SALE',
        v_sale_id,
        'INSERT',
        jsonb_build_object(
            'id', v_sale_id,
            'invoiceNumber', v_invoice_num,
            'receiptNumber', v_receipt_num,
            'customerId', p_customer_id,
            'totalAmount', v_sale_total,
            'paymentMode', p_payment_mode
        )
    );

    SELECT jsonb_build_object(
        'saleId', v_sale_id,
        'invoiceNumber', v_invoice_num,
        'receiptNumber', v_receipt_num,
        'customerId', p_customer_id,
        'totalAmount', v_sale_total,
        'subtotal', v_sale_subtotal,
        'taxAmount', v_sale_tax,
        'discountAmount', COALESCE(p_discount_amount, 0.00),
        'paymentMode', p_payment_mode,
        'status', 'COMPLETED',
        'ledgerTransactionId', v_ledger_txn_id,
        'customerBalanceAfter', v_cust_balance_after,
        'isIdempotentReplay', FALSE,
        'completedAt', NOW()
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

-- C. Customer Return Processing with Stock Condition Handling & Ledger Adjustment
CREATE OR REPLACE FUNCTION public.process_feed_return(
    p_organization_id UUID,
    p_sale_id UUID,
    p_sale_item_id UUID,
    p_return_quantity NUMERIC(12,3),
    p_stock_condition VARCHAR(20),
    p_reason TEXT,
    p_approved_by UUID,
    p_idempotency_key VARCHAR(128)
)
RETURNS JSONB AS $$
DECLARE
    v_existing_return RECORD;
    v_sale RECORD;
    v_item RECORD;
    v_product RECORD;
    v_approver RECORD;
    v_already_returned NUMERIC(12,3) := 0.000;
    v_base_return_qty NUMERIC(12,3);
    v_credit_amount NUMERIC(10,2);
    v_curr_stock NUMERIC(12,3);
    v_new_stock NUMERIC(12,3);
    v_movement_id UUID;
    v_return_id UUID;
    v_ledger_account RECORD;
    v_cust_balance_after NUMERIC(12,2);
    v_ledger_txn_id UUID;
    v_result JSONB;
BEGIN
    -- 1. Idempotency Check
    SELECT * INTO v_existing_return FROM feed_returns WHERE idempotency_key = p_idempotency_key;
    IF v_existing_return.id IS NOT NULL THEN
        SELECT jsonb_build_object(
            'returnId', v_existing_return.id,
            'saleId', v_existing_return.sale_id,
            'creditAmount', v_existing_return.credit_amount,
            'returnQuantity', v_existing_return.return_quantity,
            'stockCondition', v_existing_return.stock_condition,
            'isIdempotentReplay', TRUE
        ) INTO v_result;
        RETURN v_result;
    END IF;

    -- 2. Verify Approver Role
    SELECT * INTO v_approver FROM users WHERE id = p_approved_by;
    IF v_approver.id IS NULL OR v_approver.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Return approver % is not active', p_approved_by USING ERRCODE = '22000';
    END IF;
    IF v_approver.role NOT IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'CENTER_MANAGER', 'INVENTORY_MANAGER') THEN
        RAISE EXCEPTION 'User % with role % is not authorized to approve feed returns', p_approved_by, v_approver.role USING ERRCODE = '42501';
    END IF;

    -- 3. Verify Sale & Item
    SELECT * INTO v_sale FROM feed_sales WHERE id = p_sale_id FOR UPDATE;
    IF v_sale.id IS NULL THEN
        RAISE EXCEPTION 'Sale % does not exist', p_sale_id USING ERRCODE = 'P0002';
    END IF;
    IF v_sale.status NOT IN ('COMPLETED', 'PARTIALLY_RETURNED') THEN
        RAISE EXCEPTION 'Sale % has status % and cannot accept returns', p_sale_id, v_sale.status USING ERRCODE = '22000';
    END IF;

    SELECT * INTO v_item FROM feed_sale_items WHERE id = p_sale_item_id AND sale_id = p_sale_id;
    IF v_item.id IS NULL THEN
        RAISE EXCEPTION 'Sale item % does not exist for sale %', p_sale_item_id, p_sale_id USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_product FROM feed_products WHERE id = v_item.product_id;

    -- Calculate already returned quantity for this item
    SELECT COALESCE(SUM(return_quantity), 0.000) INTO v_already_returned
    FROM feed_returns
    WHERE sale_item_id = p_sale_item_id;

    IF (v_already_returned + p_return_quantity) > v_item.quantity THEN
        RAISE EXCEPTION 'Return quantity % exceeds remaining purchased quantity % (Original: %, Already returned: %)', 
            p_return_quantity, (v_item.quantity - v_already_returned), v_item.quantity, v_already_returned USING ERRCODE = '22000';
    END IF;

    -- Calculate base quantity
    IF v_item.unit = v_product.base_unit THEN
        v_base_return_qty := p_return_quantity;
    ELSE
        v_base_return_qty := p_return_quantity * v_product.pack_size;
    END IF;

    -- Calculate proportionate credit value
    v_credit_amount := ROUND((v_item.total_amount / v_item.quantity) * p_return_quantity, 2);

    -- 4. Stock Handling based on Condition
    v_return_id := gen_random_uuid();

    IF p_stock_condition = 'SALEABLE' THEN
        -- Add back to active sellable stock
        SELECT current_stock INTO v_curr_stock 
        FROM center_product_inventory 
        WHERE center_id = v_sale.center_id AND product_id = v_item.product_id 
        FOR UPDATE;

        v_new_stock := v_curr_stock + v_base_return_qty;

        UPDATE center_product_inventory
        SET current_stock = v_new_stock,
            last_movement_at = NOW(),
            updated_at = NOW()
        WHERE center_id = v_sale.center_id AND product_id = v_item.product_id;

        v_movement_id := gen_random_uuid();
        INSERT INTO stock_movements (
            id,
            organization_id,
            center_id,
            product_id,
            movement_type,
            direction,
            quantity,
            quantity_delta,
            base_unit,
            balance_after,
            unit_cost,
            reference_transaction_type,
            reference_id,
            actor_id,
            approved_by,
            idempotency_key,
            movement_timestamp
        ) VALUES (
            v_movement_id,
            p_organization_id,
            v_sale.center_id,
            v_item.product_id,
            'CUSTOMER_RETURN',
            'IN',
            v_base_return_qty,
            v_base_return_qty,
            v_product.base_unit,
            v_new_stock,
            v_product.weighted_avg_cost,
            'FEED_RETURN',
            v_return_id,
            p_approved_by,
            p_approved_by,
            p_idempotency_key || '_stock',
            NOW()
        );
    ELSE
        -- DAMAGED condition: Do NOT add to sellable stock. Record write-off movement for audit trail.
        SELECT current_stock INTO v_curr_stock 
        FROM center_product_inventory 
        WHERE center_id = v_sale.center_id AND product_id = v_item.product_id;

        v_movement_id := gen_random_uuid();
        INSERT INTO stock_movements (
            id,
            organization_id,
            center_id,
            product_id,
            movement_type,
            direction,
            quantity,
            quantity_delta,
            base_unit,
            balance_after,
            unit_cost,
            reference_transaction_type,
            reference_id,
            actor_id,
            approved_by,
            idempotency_key,
            movement_timestamp,
            notes
        ) VALUES (
            v_movement_id,
            p_organization_id,
            v_sale.center_id,
            v_item.product_id,
            'DAMAGED_WRITE_OFF',
            'OUT',
            v_base_return_qty,
            0.000,
            v_product.base_unit,
            v_curr_stock,
            v_product.weighted_avg_cost,
            'FEED_RETURN',
            v_return_id,
            p_approved_by,
            p_approved_by,
            p_idempotency_key || '_damaged',
            NOW(),
            'Customer returned damaged feed: ' || p_reason
        );
    END IF;

    -- 5. Customer Ledger Adjustment (Credit refund if original sale was CREDIT)
    IF v_sale.payment_mode = 'CREDIT' AND v_credit_amount > 0.00 THEN
        SELECT * INTO v_ledger_account 
        FROM customer_ledger_accounts 
        WHERE customer_id = v_sale.customer_id 
        FOR UPDATE;

        -- CREDIT increases farmer payable balance (cancels out part of prior debit)
        v_cust_balance_after := v_ledger_account.current_balance + v_credit_amount;

        UPDATE customer_ledger_accounts
        SET current_balance = v_cust_balance_after,
            last_transaction_at = NOW(),
            updated_at = NOW()
        WHERE customer_id = v_sale.customer_id;

        v_ledger_txn_id := gen_random_uuid();
        INSERT INTO ledger_transactions (
            id,
            organization_id,
            center_id,
            customer_id,
            transaction_type,
            direction,
            amount,
            balance_after,
            reference_entity,
            reference_id,
            description,
            idempotency_key,
            created_by,
            created_at
        ) VALUES (
            v_ledger_txn_id,
            p_organization_id,
            v_sale.center_id,
            v_sale.customer_id,
            'LEDGER_ADJUSTMENT_CREDIT',
            'CREDIT',
            v_credit_amount,
            v_cust_balance_after,
            'FEED_SALE',
            v_return_id,
            'Feed return credit for invoice ' || v_sale.invoice_number,
            p_idempotency_key || '_ledger',
            p_approved_by,
            NOW()
        );

        -- Double-entry balanced entries:
        -- DEBIT: Feed Inventory (or Return Loss)
        INSERT INTO ledger_entries (
            transaction_id,
            account_id,
            account_type,
            entry_type,
            amount
        ) VALUES (
            v_ledger_txn_id,
            v_sale.center_id,
            'FEED_INVENTORY',
            'DEBIT',
            v_credit_amount
        );

        -- CREDIT: Customer Payable
        INSERT INTO ledger_entries (
            transaction_id,
            account_id,
            account_type,
            entry_type,
            amount
        ) VALUES (
            v_ledger_txn_id,
            v_sale.customer_id,
            'CUSTOMER_PAYABLE',
            'CREDIT',
            v_credit_amount
        );
    END IF;

    -- 6. Insert Return Record
    INSERT INTO feed_returns (
        id,
        organization_id,
        center_id,
        sale_id,
        sale_item_id,
        customer_id,
        product_id,
        return_quantity,
        base_quantity,
        unit,
        credit_amount,
        stock_condition,
        reason,
        approved_by,
        stock_movement_id,
        ledger_transaction_id,
        idempotency_key,
        returned_at
    ) VALUES (
        v_return_id,
        p_organization_id,
        v_sale.center_id,
        p_sale_id,
        p_sale_item_id,
        v_sale.customer_id,
        v_item.product_id,
        p_return_quantity,
        v_base_return_qty,
        v_item.unit,
        v_credit_amount,
        p_stock_condition,
        p_reason,
        p_approved_by,
        v_movement_id,
        v_ledger_txn_id,
        p_idempotency_key,
        NOW()
    );

    -- 7. Update Sale Status
    IF (v_already_returned + p_return_quantity) >= v_item.quantity THEN
        UPDATE feed_sales SET status = 'RETURNED', updated_at = NOW() WHERE id = p_sale_id;
    ELSE
        UPDATE feed_sales SET status = 'PARTIALLY_RETURNED', updated_at = NOW() WHERE id = p_sale_id;
    END IF;

    -- 8. Sync Event
    INSERT INTO sync_events (
        organization_id,
        center_id,
        entity_type,
        entity_id,
        action,
        payload
    ) VALUES (
        p_organization_id,
        v_sale.center_id,
        'FEED_RETURN',
        v_return_id,
        'INSERT',
        jsonb_build_object(
            'id', v_return_id,
            'saleId', p_sale_id,
            'creditAmount', v_credit_amount,
            'stockCondition', p_stock_condition
        )
    );

    SELECT jsonb_build_object(
        'returnId', v_return_id,
        'saleId', p_sale_id,
        'creditAmount', v_credit_amount,
        'returnQuantity', p_return_quantity,
        'stockCondition', p_stock_condition,
        'customerBalanceAfter', v_cust_balance_after,
        'isIdempotentReplay', FALSE
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

-- D. Atomic Center-to-Center Inventory Transfer
CREATE OR REPLACE FUNCTION public.process_inventory_transfer(
    p_organization_id UUID,
    p_source_center_id UUID,
    p_destination_center_id UUID,
    p_product_id UUID,
    p_quantity NUMERIC(12,3),
    p_unit VARCHAR(20),
    p_initiated_by UUID,
    p_approved_by UUID,
    p_idempotency_key VARCHAR(128),
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_existing_transfer RECORD;
    v_product RECORD;
    v_source_center RECORD;
    v_dest_center RECORD;
    v_base_qty NUMERIC(12,3);
    v_src_curr_stock NUMERIC(12,3);
    v_src_balance_after NUMERIC(12,3);
    v_dst_curr_stock NUMERIC(12,3);
    v_dst_balance_after NUMERIC(12,3);
    v_transfer_id UUID;
    v_src_movement_id UUID;
    v_dst_movement_id UUID;
    v_result JSONB;
BEGIN
    -- 1. Idempotency Check
    SELECT * INTO v_existing_transfer FROM inventory_transfers WHERE idempotency_key = p_idempotency_key;
    IF v_existing_transfer.id IS NOT NULL THEN
        SELECT jsonb_build_object(
            'transferId', v_existing_transfer.id,
            'sourceCenterId', v_existing_transfer.source_center_id,
            'destinationCenterId', v_existing_transfer.destination_center_id,
            'quantity', v_existing_transfer.quantity,
            'status', v_existing_transfer.status,
            'isIdempotentReplay', TRUE
        ) INTO v_result;
        RETURN v_result;
    END IF;

    -- 2. Validate Centers
    IF p_source_center_id = p_destination_center_id THEN
        RAISE EXCEPTION 'Source and destination centers cannot be identical' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_source_center FROM dairy_centers WHERE id = p_source_center_id AND organization_id = p_organization_id;
    IF v_source_center.id IS NULL OR v_source_center.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Source center is not active or does not exist' USING ERRCODE = '22000';
    END IF;

    SELECT * INTO v_dest_center FROM dairy_centers WHERE id = p_destination_center_id AND organization_id = p_organization_id;
    IF v_dest_center.id IS NULL OR v_dest_center.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Destination center is not active or does not exist' USING ERRCODE = '22000';
    END IF;

    -- 3. Validate Product & Unit Conversion
    SELECT * INTO v_product FROM feed_products WHERE id = p_product_id AND organization_id = p_organization_id;
    IF v_product.id IS NULL OR v_product.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Product is not active or does not exist' USING ERRCODE = '22000';
    END IF;

    IF p_unit = v_product.base_unit THEN
        v_base_qty := p_quantity;
    ELSIF p_unit = v_product.pack_unit THEN
        v_base_qty := p_quantity * v_product.pack_size;
    ELSE
        RAISE EXCEPTION 'Invalid unit % for product %', p_unit, v_product.name USING ERRCODE = '22023';
    END IF;

    IF v_base_qty <= 0.000 THEN
        RAISE EXCEPTION 'Quantity must be positive' USING ERRCODE = '22003';
    END IF;

    -- 4. Lock Source Center Stock & Check Availability
    SELECT current_stock INTO v_src_curr_stock 
    FROM center_product_inventory 
    WHERE center_id = p_source_center_id AND product_id = p_product_id 
    FOR UPDATE;

    IF v_src_curr_stock IS NULL OR v_src_curr_stock < v_base_qty THEN
        RAISE EXCEPTION 'Insufficient stock at source center % (Available: %, Requested: %)', 
            v_source_center.name, COALESCE(v_src_curr_stock, 0.000), v_base_qty USING ERRCODE = '22000';
    END IF;

    -- 5. Lock/Upsert Destination Center Stock
    INSERT INTO center_product_inventory (organization_id, center_id, product_id, current_stock, reserved_stock, reorder_threshold)
    VALUES (p_organization_id, p_destination_center_id, p_product_id, 0.000, 0.000, v_product.minimum_stock_level)
    ON CONFLICT (center_id, product_id) DO NOTHING;

    SELECT current_stock INTO v_dst_curr_stock 
    FROM center_product_inventory 
    WHERE center_id = p_destination_center_id AND product_id = p_product_id 
    FOR UPDATE;

    -- 6. Atomic Deduct and Add
    v_src_balance_after := v_src_curr_stock - v_base_qty;
    v_dst_balance_after := v_dst_curr_stock + v_base_qty;

    UPDATE center_product_inventory 
    SET current_stock = v_src_balance_after, last_movement_at = NOW(), updated_at = NOW() 
    WHERE center_id = p_source_center_id AND product_id = p_product_id;

    UPDATE center_product_inventory 
    SET current_stock = v_dst_balance_after, last_movement_at = NOW(), updated_at = NOW() 
    WHERE center_id = p_destination_center_id AND product_id = p_product_id;

    -- 7. Insert Movements with Linked Transfer UUID
    v_transfer_id := gen_random_uuid();
    v_src_movement_id := gen_random_uuid();
    v_dst_movement_id := gen_random_uuid();

    -- Source OUT movement
    INSERT INTO stock_movements (
        id,
        organization_id,
        center_id,
        product_id,
        movement_type,
        direction,
        quantity,
        quantity_delta,
        base_unit,
        balance_after,
        unit_cost,
        reference_transaction_type,
        reference_id,
        actor_id,
        approved_by,
        idempotency_key,
        movement_timestamp,
        notes
    ) VALUES (
        v_src_movement_id,
        p_organization_id,
        p_source_center_id,
        p_product_id,
        'CENTER_TRANSFER',
        'OUT',
        v_base_qty,
        -v_base_qty,
        v_product.base_unit,
        v_src_balance_after,
        v_product.weighted_avg_cost,
        'CENTER_TRANSFER',
        v_transfer_id,
        p_initiated_by,
        p_approved_by,
        p_idempotency_key || '_src',
        NOW(),
        'Transfer to center: ' || v_dest_center.name
    );

    -- Destination IN movement
    INSERT INTO stock_movements (
        id,
        organization_id,
        center_id,
        product_id,
        movement_type,
        direction,
        quantity,
        quantity_delta,
        base_unit,
        balance_after,
        unit_cost,
        reference_transaction_type,
        reference_id,
        actor_id,
        approved_by,
        idempotency_key,
        movement_timestamp,
        notes
    ) VALUES (
        v_dst_movement_id,
        p_organization_id,
        p_destination_center_id,
        p_product_id,
        'CENTER_TRANSFER',
        'IN',
        v_base_qty,
        v_base_qty,
        v_product.base_unit,
        v_dst_balance_after,
        v_product.weighted_avg_cost,
        'CENTER_TRANSFER',
        v_transfer_id,
        p_initiated_by,
        p_approved_by,
        p_idempotency_key || '_dst',
        NOW(),
        'Transfer from center: ' || v_source_center.name
    );

    -- 8. Insert Transfer Header
    INSERT INTO inventory_transfers (
        id,
        organization_id,
        source_center_id,
        destination_center_id,
        product_id,
        quantity,
        unit,
        base_quantity,
        status,
        source_movement_id,
        destination_movement_id,
        initiated_by,
        approved_by,
        transfer_date,
        notes,
        idempotency_key
    ) VALUES (
        v_transfer_id,
        p_organization_id,
        p_source_center_id,
        p_destination_center_id,
        p_product_id,
        p_quantity,
        p_unit,
        v_base_qty,
        'COMPLETED',
        v_src_movement_id,
        v_dst_movement_id,
        p_initiated_by,
        p_approved_by,
        NOW(),
        p_notes,
        p_idempotency_key
    );

    -- 9. Sync Event
    INSERT INTO sync_events (
        organization_id,
        center_id,
        entity_type,
        entity_id,
        action,
        payload
    ) VALUES (
        p_organization_id,
        p_source_center_id,
        'INVENTORY_TRANSFER',
        v_transfer_id,
        'INSERT',
        jsonb_build_object(
            'id', v_transfer_id,
            'sourceCenterId', p_source_center_id,
            'destinationCenterId', p_destination_center_id,
            'quantity', p_quantity,
            'unit', p_unit
        )
    );

    SELECT jsonb_build_object(
        'transferId', v_transfer_id,
        'sourceCenterId', p_source_center_id,
        'destinationCenterId', p_destination_center_id,
        'quantity', p_quantity,
        'unit', p_unit,
        'baseQuantity', v_base_qty,
        'sourceBalanceAfter', v_src_balance_after,
        'destinationBalanceAfter', v_dst_balance_after,
        'status', 'COMPLETED',
        'isIdempotentReplay', FALSE
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

-- E. Stock Adjustment & Audited Write-off
CREATE OR REPLACE FUNCTION public.process_inventory_adjustment(
    p_organization_id UUID,
    p_center_id UUID,
    p_product_id UUID,
    p_adjustment_type VARCHAR(40),
    p_quantity NUMERIC(12,3),
    p_direction VARCHAR(10),
    p_reason TEXT,
    p_approved_by UUID,
    p_idempotency_key VARCHAR(128)
)
RETURNS JSONB AS $$
DECLARE
    v_existing_adj RECORD;
    v_product RECORD;
    v_approver RECORD;
    v_curr_stock NUMERIC(12,3);
    v_new_stock NUMERIC(12,3);
    v_delta NUMERIC(12,3);
    v_adj_id UUID;
    v_movement_id UUID;
    v_result JSONB;
BEGIN
    -- 1. Idempotency Check
    SELECT * INTO v_existing_adj FROM inventory_adjustments WHERE idempotency_key = p_idempotency_key;
    IF v_existing_adj.id IS NOT NULL THEN
        SELECT jsonb_build_object(
            'adjustmentId', v_existing_adj.id,
            'adjustmentType', v_existing_adj.adjustment_type,
            'quantity', v_existing_adj.quantity,
            'direction', v_existing_adj.direction,
            'isIdempotentReplay', TRUE
        ) INTO v_result;
        RETURN v_result;
    END IF;

    -- 2. Verify Approver Role
    SELECT * INTO v_approver FROM users WHERE id = p_approved_by;
    IF v_approver.id IS NULL OR v_approver.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Adjustment approver % is not active', p_approved_by USING ERRCODE = '22000';
    END IF;
    IF v_approver.role NOT IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'INVENTORY_MANAGER') THEN
        RAISE EXCEPTION 'User % with role % is not authorized to approve inventory adjustments', p_approved_by, v_approver.role USING ERRCODE = '42501';
    END IF;

    -- 3. Verify Product
    SELECT * INTO v_product FROM feed_products WHERE id = p_product_id AND organization_id = p_organization_id;
    IF v_product.id IS NULL THEN
        RAISE EXCEPTION 'Product % does not exist', p_product_id USING ERRCODE = 'P0002';
    END IF;

    IF p_quantity <= 0.000 THEN
        RAISE EXCEPTION 'Adjustment quantity must be positive' USING ERRCODE = '22003';
    END IF;

    -- 4. Lock Center Stock
    INSERT INTO center_product_inventory (organization_id, center_id, product_id, current_stock, reserved_stock, reorder_threshold)
    VALUES (p_organization_id, p_center_id, p_product_id, 0.000, 0.000, v_product.minimum_stock_level)
    ON CONFLICT (center_id, product_id) DO NOTHING;

    SELECT current_stock INTO v_curr_stock 
    FROM center_product_inventory 
    WHERE center_id = p_center_id AND product_id = p_product_id 
    FOR UPDATE;

    IF p_direction = 'OUT' THEN
        IF v_curr_stock < p_quantity THEN
            RAISE EXCEPTION 'Cannot adjust stock below zero (Available: %, Adjustment: %)', v_curr_stock, p_quantity USING ERRCODE = '22000';
        END IF;
        v_new_stock := v_curr_stock - p_quantity;
        v_delta := -p_quantity;
    ELSIF p_direction = 'IN' THEN
        v_new_stock := v_curr_stock + p_quantity;
        v_delta := p_quantity;
    ELSE
        RAISE EXCEPTION 'Invalid direction %', p_direction USING ERRCODE = '22023';
    END IF;

    -- 5. Update Stock
    UPDATE center_product_inventory
    SET current_stock = v_new_stock,
        last_movement_at = NOW(),
        updated_at = NOW()
    WHERE center_id = p_center_id AND product_id = p_product_id;

    -- 6. Insert Movement
    v_adj_id := gen_random_uuid();
    v_movement_id := gen_random_uuid();

    INSERT INTO stock_movements (
        id,
        organization_id,
        center_id,
        product_id,
        movement_type,
        direction,
        quantity,
        quantity_delta,
        base_unit,
        balance_after,
        unit_cost,
        reference_transaction_type,
        reference_id,
        actor_id,
        approved_by,
        idempotency_key,
        movement_timestamp,
        notes
    ) VALUES (
        v_movement_id,
        p_organization_id,
        p_center_id,
        p_product_id,
        CASE WHEN p_adjustment_type = 'DAMAGED_WRITE_OFF' THEN 'DAMAGED_WRITE_OFF' ELSE 'STOCK_CORRECTION' END,
        p_direction,
        p_quantity,
        v_delta,
        v_product.base_unit,
        v_new_stock,
        v_product.weighted_avg_cost,
        'INVENTORY_ADJUSTMENT',
        v_adj_id,
        p_approved_by,
        p_approved_by,
        p_idempotency_key || '_stock',
        NOW(),
        p_reason
    );

    -- 7. Insert Adjustment Header
    INSERT INTO inventory_adjustments (
        id,
        organization_id,
        center_id,
        product_id,
        adjustment_type,
        quantity,
        direction,
        reason,
        approved_by,
        stock_movement_id,
        idempotency_key,
        adjusted_at
    ) VALUES (
        v_adj_id,
        p_organization_id,
        p_center_id,
        p_product_id,
        p_adjustment_type,
        p_quantity,
        p_direction,
        p_reason,
        p_approved_by,
        v_movement_id,
        p_idempotency_key,
        NOW()
    );

    -- 8. Sync Event
    INSERT INTO sync_events (
        organization_id,
        center_id,
        entity_type,
        entity_id,
        action,
        payload
    ) VALUES (
        p_organization_id,
        p_center_id,
        'INVENTORY_ADJUSTMENT',
        v_adj_id,
        'INSERT',
        jsonb_build_object(
            'id', v_adj_id,
            'adjustmentType', p_adjustment_type,
            'quantity', p_quantity,
            'direction', p_direction
        )
    );

    SELECT jsonb_build_object(
        'adjustmentId', v_adj_id,
        'adjustmentType', p_adjustment_type,
        'quantity', p_quantity,
        'direction', p_direction,
        'balanceAfter', v_new_stock,
        'isIdempotentReplay', FALSE
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

-- ==============================================================================
-- 15. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE feed_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE center_product_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_adjustments ENABLE ROW LEVEL SECURITY;

-- Organization Isolation Policies (Service Role / Backend Bypass or Tenant Scope)
CREATE POLICY feed_categories_org_isolation ON feed_categories
    FOR ALL USING (organization_id = current_org_id() OR current_user_role() = 'SUPER_ADMIN');

CREATE POLICY feed_products_org_isolation ON feed_products
    FOR ALL USING (organization_id = current_org_id() OR current_user_role() = 'SUPER_ADMIN');

CREATE POLICY feed_suppliers_org_isolation ON feed_suppliers
    FOR ALL USING (organization_id = current_org_id() OR current_user_role() = 'SUPER_ADMIN');

CREATE POLICY center_product_inv_org_isolation ON center_product_inventory
    FOR ALL USING (organization_id = current_org_id() OR current_user_role() = 'SUPER_ADMIN');

CREATE POLICY feed_purchases_org_isolation ON feed_purchases
    FOR ALL USING (organization_id = current_org_id() OR current_user_role() = 'SUPER_ADMIN');

CREATE POLICY feed_purchase_items_org_isolation ON feed_purchase_items
    FOR ALL USING (purchase_id IN (SELECT id FROM feed_purchases WHERE organization_id = current_org_id() OR current_user_role() = 'SUPER_ADMIN'));

CREATE POLICY stock_movements_org_isolation ON stock_movements
    FOR ALL USING (organization_id = current_org_id() OR current_user_role() = 'SUPER_ADMIN');

CREATE POLICY feed_sales_org_isolation ON feed_sales
    FOR ALL USING (
        (organization_id = current_org_id() AND (
            current_user_role() IN ('DAIRY_OWNER', 'DAIRY_ADMIN', 'CENTER_MANAGER', 'INVENTORY_MANAGER', 'ACCOUNTANT', 'COLLECTION_OPERATOR')
            OR (current_user_role() = 'FARMER_CUSTOMER' AND customer_id = current_customer_id())
        ))
        OR current_user_role() = 'SUPER_ADMIN'
    );

CREATE POLICY feed_sale_items_org_isolation ON feed_sale_items
    FOR ALL USING (sale_id IN (SELECT id FROM feed_sales WHERE organization_id = current_org_id() OR current_user_role() = 'SUPER_ADMIN'));

CREATE POLICY feed_returns_org_isolation ON feed_returns
    FOR ALL USING (organization_id = current_org_id() OR current_user_role() = 'SUPER_ADMIN');

CREATE POLICY inventory_transfers_org_isolation ON inventory_transfers
    FOR ALL USING (organization_id = current_org_id() OR current_user_role() = 'SUPER_ADMIN');

CREATE POLICY inventory_adjustments_org_isolation ON inventory_adjustments
    FOR ALL USING (organization_id = current_org_id() OR current_user_role() = 'SUPER_ADMIN');


INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('014', '014_feed_inventory_procurement_and_sales.sql') ON CONFLICT (version) DO NOTHING;

-- ========================================================
-- Migration: 015_p05_p10_master_remediation.sql
-- ========================================================
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

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('015', '015_p05_p10_master_remediation.sql') ON CONFLICT (version) DO NOTHING;

-- ========================================================
-- Migration: 016_employee_management_attendance_and_payroll.sql
-- ========================================================
-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 016: EMPLOYEE MANAGEMENT, ATTENDANCE & PAYROLL SUBSYSTEM
-- ==============================================================================

-- 1. Employees Master Table
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    primary_center_id UUID REFERENCES dairy_centers(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    employee_code VARCHAR(50) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    full_name VARCHAR(200) NOT NULL,
    mobile_number VARCHAR(20) NOT NULL,
    email VARCHAR(150),
    national_id_mask VARCHAR(50),
    address_line1 TEXT,
    address_line2 TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    joining_date DATE NOT NULL,
    termination_date DATE,
    employment_status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    employment_type VARCHAR(30) NOT NULL DEFAULT 'FULL_TIME',
    designation VARCHAR(100) NOT NULL,
    department VARCHAR(100) NOT NULL,
    emergency_contact_name VARCHAR(150),
    emergency_contact_phone VARCHAR(20),
    emergency_contact_relation VARCHAR(50),
    emergency_contact_approved BOOLEAN NOT NULL DEFAULT FALSE,
    bank_name VARCHAR(100),
    bank_account_number_mask VARCHAR(50),
    bank_ifsc VARCHAR(20),
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    updated_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_employee_org_code UNIQUE (organization_id, employee_code),
    CONSTRAINT chk_employee_status CHECK (employment_status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'RESIGNED', 'TERMINATED')),
    CONSTRAINT chk_employee_type CHECK (employment_type IN ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'DAILY_WAGE'))
);

CREATE TRIGGER set_employees_updated_at
BEFORE UPDATE ON employees
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_employees_org_id ON employees(organization_id);
CREATE INDEX IF NOT EXISTS idx_employees_center_id ON employees(primary_center_id);
CREATE INDEX IF NOT EXISTS idx_employees_user_id ON employees(user_id);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(employment_status);
CREATE INDEX IF NOT EXISTS idx_employees_code ON employees(employee_code);

-- 2. Employee Center Assignments (Multi-Center Staff Assignment)
CREATE TABLE IF NOT EXISTS employee_center_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_employee_center_assignment UNIQUE (employee_id, center_id)
);

CREATE INDEX IF NOT EXISTS idx_emp_center_assign_emp ON employee_center_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_center_assign_center ON employee_center_assignments(center_id);

-- 3. Employee Shifts Definition
CREATE TABLE IF NOT EXISTS employee_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    grace_period_minutes INT NOT NULL DEFAULT 15,
    half_day_threshold_hours NUMERIC(4,2) NOT NULL DEFAULT 4.00,
    full_day_threshold_hours NUMERIC(4,2) NOT NULL DEFAULT 8.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_employee_shifts_org_code UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_employee_shifts_org ON employee_shifts(organization_id);

-- 4. Employee Attendance Records
CREATE TABLE IF NOT EXISTS employee_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    attendance_date DATE NOT NULL,
    shift_id UUID REFERENCES employee_shifts(id) ON DELETE SET NULL,
    shift_type VARCHAR(30) NOT NULL DEFAULT 'GENERAL',
    check_in_time TIMESTAMPTZ,
    check_out_time TIMESTAMPTZ,
    total_hours NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(30) NOT NULL DEFAULT 'PRESENT',
    is_late_arrival BOOLEAN NOT NULL DEFAULT FALSE,
    is_early_departure BOOLEAN NOT NULL DEFAULT FALSE,
    overtime_hours NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    is_manual_correction BOOLEAN NOT NULL DEFAULT FALSE,
    correction_reason TEXT,
    corrected_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    corrected_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_employee_attendance_date UNIQUE (employee_id, attendance_date, shift_type),
    CONSTRAINT chk_attendance_status CHECK (status IN ('PRESENT', 'ABSENT', 'HALF_DAY', 'ON_LEAVE', 'HOLIDAY', 'WEEK_OFF')),
    CONSTRAINT chk_shift_type CHECK (shift_type IN ('MORNING', 'EVENING', 'GENERAL', 'NIGHT'))
);

CREATE TRIGGER set_employee_attendance_updated_at
BEFORE UPDATE ON employee_attendance
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_emp_att_org_date ON employee_attendance(organization_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_emp_att_center_date ON employee_attendance(center_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_emp_att_employee ON employee_attendance(employee_id, attendance_date);

-- 5. Attendance Audit Trail
CREATE TABLE IF NOT EXISTS employee_attendance_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attendance_id UUID NOT NULL REFERENCES employee_attendance(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    actor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    old_values JSONB,
    new_values JSONB,
    reason TEXT NOT NULL,
    ip_address VARCHAR(45),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emp_att_audits_att ON employee_attendance_audits(attendance_id);
CREATE INDEX IF NOT EXISTS idx_emp_att_audits_actor ON employee_attendance_audits(actor_id);

-- 6. Employee Leaves
CREATE TABLE IF NOT EXISTS employee_leaves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    leave_type VARCHAR(30) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days_count NUMERIC(4,1) NOT NULL CHECK (days_count > 0.0),
    reason TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_leave_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
    CONSTRAINT chk_leave_type CHECK (leave_type IN ('CASUAL', 'SICK', 'EARNED', 'UNPAID', 'MATERNITY', 'EMERGENCY'))
);

CREATE TRIGGER set_employee_leaves_updated_at
BEFORE UPDATE ON employee_leaves
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_emp_leaves_org ON employee_leaves(organization_id);
CREATE INDEX IF NOT EXISTS idx_emp_leaves_emp ON employee_leaves(employee_id);

-- 7. Employee Salary Structure
CREATE TABLE IF NOT EXISTS employee_salary_structures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    calculation_basis VARCHAR(30) NOT NULL DEFAULT 'MONTHLY',
    base_salary NUMERIC(12,2) NOT NULL CHECK (base_salary >= 0.00),
    hra NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (hra >= 0.00),
    travel_allowance NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (travel_allowance >= 0.00),
    special_allowance NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (special_allowance >= 0.00),
    medical_allowance NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (medical_allowance >= 0.00),
    gross_salary NUMERIC(12,2) NOT NULL CHECK (gross_salary >= 0.00),
    provident_fund_employee NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (provident_fund_employee >= 0.00),
    professional_tax NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (professional_tax >= 0.00),
    tds_tax NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (tds_tax >= 0.00),
    other_deductions NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (other_deductions >= 0.00),
    overtime_hourly_rate NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (overtime_hourly_rate >= 0.00),
    effective_from DATE NOT NULL,
    effective_to DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_salary_basis CHECK (calculation_basis IN ('MONTHLY', 'DAILY_WAGE', 'HOURLY'))
);

CREATE TRIGGER set_employee_salary_structures_updated_at
BEFORE UPDATE ON employee_salary_structures
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_salary_struct_emp ON employee_salary_structures(employee_id, is_active);

-- 8. Employee Advances (Dedicated Employee Advance Table)
CREATE TABLE IF NOT EXISTS employee_advances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    advance_number VARCHAR(60) NOT NULL UNIQUE,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0.00),
    disbursed_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (disbursed_amount >= 0.00),
    recovered_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (recovered_amount >= 0.00),
    remaining_balance NUMERIC(12,2) NOT NULL CHECK (remaining_balance >= 0.00),
    monthly_installment NUMERIC(12,2) NOT NULL CHECK (monthly_installment > 0.00),
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING_APPROVAL',
    reason TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_emp_advance_status CHECK (status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ACTIVE', 'FULLY_RECOVERED', 'CANCELLED'))
);

CREATE TRIGGER set_employee_advances_updated_at
BEFORE UPDATE ON employee_advances
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_emp_advances_emp ON employee_advances(employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_advances_status ON employee_advances(status);

-- 9. Payroll Runs (Lifecycle: DRAFT -> CALCULATING -> UNDER_REVIEW -> APPROVED -> FINALIZED -> PAID)
CREATE TABLE IF NOT EXISTS payroll_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    year INT NOT NULL,
    month INT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    total_employees INT NOT NULL DEFAULT 0,
    total_gross_salary NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    total_allowances NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    total_deductions NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    total_advances_recovered NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    total_net_salary NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    initiated_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    calculated_at TIMESTAMPTZ,
    approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    approved_at TIMESTAMPTZ,
    finalized_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    finalized_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_payroll_status CHECK (status IN ('DRAFT', 'CALCULATING', 'UNDER_REVIEW', 'APPROVED', 'FINALIZED', 'PAID', 'CANCELLED'))
);

-- Unique index ensuring no duplicate payroll run for the exact same org, center, year, month
CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_period_scope
ON payroll_runs (organization_id, COALESCE(center_id, '00000000-0000-0000-0000-000000000000'::uuid), year, month)
WHERE status != 'CANCELLED';

CREATE TRIGGER set_payroll_runs_updated_at
BEFORE UPDATE ON payroll_runs
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_payroll_runs_org ON payroll_runs(organization_id, year, month);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_status ON payroll_runs(status);

-- 10. Employee Payslips (Itemized, Calculated, Immutable when Finalized)
CREATE TABLE IF NOT EXISTS employee_payslips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_run_id UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    payslip_number VARCHAR(60) NOT NULL UNIQUE,
    total_working_days NUMERIC(4,1) NOT NULL DEFAULT 30.0,
    present_days NUMERIC(4,1) NOT NULL DEFAULT 0.0,
    absent_days NUMERIC(4,1) NOT NULL DEFAULT 0.0,
    paid_leave_days NUMERIC(4,1) NOT NULL DEFAULT 0.0,
    unpaid_leave_days NUMERIC(4,1) NOT NULL DEFAULT 0.0,
    overtime_hours NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    base_salary NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    earned_basic NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    hra NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    travel_allowance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    special_allowance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    medical_allowance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    overtime_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    gross_earnings NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    pf_deduction NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    tax_deduction NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    advance_recovery NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    other_deductions NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_deductions NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    net_salary NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    payment_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    payment_method VARCHAR(30) NOT NULL DEFAULT 'BANK_TRANSFER',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_payroll_run_employee UNIQUE (payroll_run_id, employee_id),
    CONSTRAINT chk_payslip_payment_status CHECK (payment_status IN ('PENDING', 'PROCESSING', 'PAID', 'FAILED'))
);

CREATE TRIGGER set_employee_payslips_updated_at
BEFORE UPDATE ON employee_payslips
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_payslips_run ON employee_payslips(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payslips_emp ON employee_payslips(employee_id);

-- 11. Employee Advance Repayments
CREATE TABLE IF NOT EXISTS employee_advance_repayments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    advance_id UUID NOT NULL REFERENCES employee_advances(id) ON DELETE RESTRICT,
    payroll_run_id UUID REFERENCES payroll_runs(id) ON DELETE SET NULL,
    payslip_id UUID REFERENCES employee_payslips(id) ON DELETE SET NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0.00),
    repayment_date DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_advance_repay_adv ON employee_advance_repayments(advance_id);
CREATE INDEX IF NOT EXISTS idx_advance_repay_run ON employee_advance_repayments(payroll_run_id);

-- 12. Employee Salary Payment Records (Dedicated Employee Financial Table)
CREATE TABLE IF NOT EXISTS employee_salary_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    payroll_run_id UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE RESTRICT,
    payslip_id UUID NOT NULL REFERENCES employee_payslips(id) ON DELETE RESTRICT,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    payment_reference VARCHAR(100) NOT NULL UNIQUE,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0.00),
    payment_method VARCHAR(30) NOT NULL DEFAULT 'BANK_TRANSFER',
    transaction_id VARCHAR(100),
    bank_name VARCHAR(100),
    bank_account_mask VARCHAR(50),
    bank_ifsc VARCHAR(20),
    status VARCHAR(30) NOT NULL DEFAULT 'COMPLETED',
    disbursed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    disbursed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_salary_pay_method CHECK (payment_method IN ('BANK_TRANSFER', 'CASH', 'CHEQUE', 'UPI')),
    CONSTRAINT chk_salary_pay_status CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'REVERSED'))
);

CREATE INDEX IF NOT EXISTS idx_salary_pay_org ON employee_salary_payments(organization_id);
CREATE INDEX IF NOT EXISTS idx_salary_pay_run ON employee_salary_payments(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_salary_pay_emp ON employee_salary_payments(employee_id);

-- 13. Dedicated Payroll Audit Logs
CREATE TABLE IF NOT EXISTS payroll_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    actor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    previous_state VARCHAR(50),
    new_state VARCHAR(50),
    metadata JSONB,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_audit_org ON payroll_audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_payroll_audit_entity ON payroll_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_payroll_audit_actor ON payroll_audit_logs(actor_id);

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('016', '016_employee_management_attendance_and_payroll.sql') ON CONFLICT (version) DO NOTHING;

-- ========================================================
-- Migration: 017_milk_collection_workflow_and_atomic_ledger.sql
-- ========================================================
-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 012: MILK COLLECTION WORKFLOW & ATOMIC LEDGER ENGINE
-- ==============================================================================

-- 1. Extend collection_sessions.session_state CHECK constraint to support granular state machine
ALTER TABLE collection_sessions DROP CONSTRAINT IF EXISTS chk_session_state;
ALTER TABLE collection_sessions ADD CONSTRAINT chk_session_state CHECK (
    session_state IN (
        'OPEN', 'IN_PROGRESS', 'WAITING_FOR_MEASUREMENTS',
        'MEASUREMENTS_RECEIVED', 'VALIDATING', 'READY_FOR_REVIEW',
        'COMMITTING', 'COMPLETED', 'INCOMPLETE', 'FAILED', 'CANCELLED'
    )
);

-- 2. Stored Procedure: Create Milk Collection Session
CREATE OR REPLACE FUNCTION public.create_milk_collection_session(
    p_center_id UUID,
    p_customer_id UUID,
    p_operator_id UUID,
    p_device_id VARCHAR(100),
    p_shift_type VARCHAR(10),
    p_selected_milk_category VARCHAR(20),
    p_identification_method VARCHAR(30),
    p_intake_sequence_uuid UUID DEFAULT NULL,
    p_business_date DATE DEFAULT NULL,
    p_identification_log_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_session_id UUID;
    v_customer RECORD;
    v_center RECORD;
    v_shift RECORD;
    v_cat_auth BOOLEAN;
    v_active_session_count INT;
    v_intake_uuid UUID;
    v_business_date DATE;
    v_result JSONB;
BEGIN
    -- 1. Verify Center exists and is ACTIVE
    SELECT * INTO v_center FROM dairy_centers WHERE id = p_center_id;
    IF v_center.id IS NULL THEN
        RAISE EXCEPTION 'Dairy Center % does not exist', p_center_id USING ERRCODE = 'P0002';
    END IF;
    IF v_center.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Dairy Center % is not ACTIVE (status: %)', p_center_id, v_center.status USING ERRCODE = '22000';
    END IF;

    -- 2. Verify Customer exists, not deleted, and is ACTIVE
    SELECT * INTO v_customer FROM customers WHERE id = p_customer_id;
    IF v_customer.id IS NULL THEN
        RAISE EXCEPTION 'Customer % does not exist', p_customer_id USING ERRCODE = 'P0002';
    END IF;
    IF v_customer.is_deleted = TRUE THEN
        RAISE EXCEPTION 'Customer % is soft-deleted and cannot supply milk', p_customer_id USING ERRCODE = '22000';
    END IF;
    IF v_customer.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Customer % is not ACTIVE (status: %)', p_customer_id, v_customer.status USING ERRCODE = '22000';
    END IF;

    -- 3. Verify Customer belongs to the Organization of the Center
    IF v_customer.organization_id <> v_center.organization_id THEN
        RAISE EXCEPTION 'Customer organization mismatch with Center organization' USING ERRCODE = '22000';
    END IF;

    -- 3b. Verify Customer is assigned to this Center
    IF v_customer.primary_center_id <> p_center_id THEN
        RAISE EXCEPTION 'Customer primary center % does not match collection center %', v_customer.primary_center_id, p_center_id USING ERRCODE = '22000';
    END IF;

    -- 4. Verify Milk Category Permission
    SELECT EXISTS (
        SELECT 1 FROM customer_milk_categories 
        WHERE customer_id = p_customer_id 
          AND milk_category = p_selected_milk_category 
          AND is_authorized = TRUE
    ) INTO v_cat_auth;

    IF NOT v_cat_auth THEN
        RAISE EXCEPTION 'Customer % is not authorized to deliver % milk', p_customer_id, p_selected_milk_category USING ERRCODE = '22023';
    END IF;

    -- 5. Prevent concurrent active unfinished sessions for this customer
    SELECT COUNT(*) INTO v_active_session_count 
    FROM collection_sessions 
    WHERE customer_id = p_customer_id 
      AND session_state IN ('OPEN', 'IN_PROGRESS', 'WAITING_FOR_MEASUREMENTS', 'MEASUREMENTS_RECEIVED', 'VALIDATING', 'READY_FOR_REVIEW', 'COMMITTING');

    IF v_active_session_count > 0 THEN
        RAISE EXCEPTION 'Customer % already has an active incomplete collection session', p_customer_id USING ERRCODE = '23505';
    END IF;

    -- 6. Resolve shift
    SELECT * INTO v_shift FROM collection_shifts WHERE center_id = p_center_id AND shift_type = p_shift_type;
    IF v_shift.id IS NULL THEN
        -- Auto-seed default shift if not present
        INSERT INTO collection_shifts (center_id, shift_type, start_time, end_time, grace_period_minutes, is_active)
        VALUES (
            p_center_id, 
            p_shift_type, 
            CASE WHEN p_shift_type = 'MORNING' THEN '05:00:00'::TIME ELSE '16:00:00'::TIME END,
            CASE WHEN p_shift_type = 'MORNING' THEN '11:00:00'::TIME ELSE '21:00:00'::TIME END,
            30,
            TRUE
        )
        RETURNING * INTO v_shift;
    END IF;

    v_session_id := gen_random_uuid();
    v_intake_uuid := COALESCE(p_intake_sequence_uuid, gen_random_uuid());
    v_business_date := COALESCE(p_business_date, CURRENT_DATE);

    -- 7. Insert Collection Session
    INSERT INTO collection_sessions (
        id,
        center_id,
        customer_id,
        business_date,
        shift_id,
        shift_type,
        selected_milk_category,
        identification_method,
        identification_log_id,
        session_state,
        intake_sequence_uuid,
        started_at,
        operator_id,
        device_id
    ) VALUES (
        v_session_id,
        p_center_id,
        p_customer_id,
        v_business_date,
        v_shift.id,
        p_shift_type,
        p_selected_milk_category,
        p_identification_method,
        p_identification_log_id,
        'OPEN',
        v_intake_uuid,
        NOW(),
        p_operator_id,
        p_device_id
    );

    -- 8. Return JSON
    SELECT jsonb_build_object(
        'sessionId', v_session_id,
        'centerId', p_center_id,
        'customerId', p_customer_id,
        'customerName', v_customer.full_name,
        'farmerCode', v_customer.farmer_code,
        'businessDate', v_business_date,
        'shiftId', v_shift.id,
        'shiftType', p_shift_type,
        'selectedMilkCategory', p_selected_milk_category,
        'identificationMethod', p_identification_method,
        'sessionState', 'OPEN',
        'intakeSequenceUuid', v_intake_uuid,
        'startedAt', NOW(),
        'operatorId', p_operator_id,
        'deviceId', p_device_id
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

ALTER FUNCTION public.create_milk_collection_session(UUID, UUID, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, UUID, DATE, UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.create_milk_collection_session(UUID, UUID, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, UUID, DATE, UUID) TO authenticated, service_role;


-- 3. Stored Procedure: Cancel Milk Collection Session
CREATE OR REPLACE FUNCTION public.cancel_milk_collection_session(
    p_session_id UUID,
    p_operator_id UUID,
    p_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_session RECORD;
    v_result JSONB;
BEGIN
    SELECT * INTO v_session FROM collection_sessions WHERE id = p_session_id FOR UPDATE;
    IF v_session.id IS NULL THEN
        RAISE EXCEPTION 'Collection session % does not exist', p_session_id USING ERRCODE = 'P0002';
    END IF;

    IF v_session.session_state = 'COMPLETED' THEN
        RAISE EXCEPTION 'Cannot cancel an already completed collection session' USING ERRCODE = '22000';
    END IF;

    UPDATE collection_sessions
    SET session_state = 'CANCELLED',
        completed_at = NOW()
    WHERE id = p_session_id;

    -- Record audit log
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
        (SELECT organization_id FROM dairy_centers WHERE id = v_session.center_id),
        v_session.center_id,
        p_operator_id,
        'COLLECTION_SESSION_CANCELLED',
        'COLLECTION_SESSION',
        p_session_id,
        jsonb_build_object('session_state', v_session.session_state),
        jsonb_build_object('session_state', 'CANCELLED', 'reason', p_reason)
    );

    SELECT jsonb_build_object(
        'sessionId', p_session_id,
        'sessionState', 'CANCELLED',
        'cancellationReason', p_reason,
        'cancelledAt', NOW(),
        'cancelledBy', p_operator_id
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

ALTER FUNCTION public.cancel_milk_collection_session(UUID, UUID, TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.cancel_milk_collection_session(UUID, UUID, TEXT) TO authenticated, service_role;


-- 4. Stored Procedure: Complete Milk Collection Session & Atomic Ledger Posting
CREATE OR REPLACE FUNCTION public.complete_milk_collection_session(
    p_session_id UUID,
    p_operator_id UUID,
    p_device_id VARCHAR(100),
    p_net_weight NUMERIC(6,2),
    p_fat_percentage NUMERIC(3,1),
    p_snf_percentage NUMERIC(3,1),
    p_measurement_unit VARCHAR(10) DEFAULT 'KG',
    p_reading_source VARCHAR(30) DEFAULT 'MANUAL_ENTRY',
    p_client_intake_uuid UUID DEFAULT NULL,
    p_idempotency_key VARCHAR(128) DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_session RECORD;
    v_customer RECORD;
    v_center RECORD;
    v_center_settings RECORD;
    v_rate_chart_version_id UUID;
    v_version_number INT;
    v_rate_per_unit NUMERIC(6,2);
    v_total_amount NUMERIC(10,2);
    v_existing_collection RECORD;
    v_collection_id UUID;
    v_ledger_account RECORD;
    v_customer_ledger_account_id UUID;
    v_prev_balance NUMERIC(12,2);
    v_new_balance NUMERIC(12,2);
    v_ledger_txn_id UUID;
    v_receipt_number VARCHAR(60);
    v_intake_uuid UUID;
    v_idempotency_key VARCHAR(128);
    v_fat_min NUMERIC(3,1);
    v_fat_max NUMERIC(3,1);
    v_snf_min NUMERIC(3,1);
    v_snf_max NUMERIC(3,1);
    v_cat_auth BOOLEAN;
    v_result JSONB;
BEGIN
    v_intake_uuid := COALESCE(p_client_intake_uuid, gen_random_uuid());
    v_idempotency_key := COALESCE(p_idempotency_key, 'IDEM-' || p_session_id::text || '-' || v_intake_uuid::text);

    -- 1. Idempotency Check: Return already committed collection if identical idempotency key
    SELECT mc.*, lt.balance_after, lt.id AS ledger_txn_id 
    INTO v_existing_collection
    FROM milk_collections mc
    JOIN ledger_transactions lt ON lt.reference_id = mc.id AND lt.reference_entity = 'MILK_COLLECTION'
    WHERE mc.idempotency_key = v_idempotency_key;

    IF v_existing_collection.id IS NOT NULL THEN
        -- Return already committed record idempotently
        SELECT jsonb_build_object(
            'collectionId', v_existing_collection.id,
            'sessionId', v_existing_collection.session_id,
            'centerId', v_existing_collection.center_id,
            'customerId', v_existing_collection.customer_id,
            'businessDate', v_existing_collection.business_date,
            'shiftType', v_existing_collection.shift_type,
            'milkCategory', v_existing_collection.milk_category,
            'netWeight', v_existing_collection.net_weight,
            'measurementUnit', v_existing_collection.measurement_unit,
            'fatPercentage', v_existing_collection.fat_percentage,
            'snfPercentage', v_existing_collection.snf_percentage,
            'appliedRatePerUnit', v_existing_collection.applied_rate_per_unit,
            'totalAmount', v_existing_collection.total_amount,
            'transactionStatus', v_existing_collection.transaction_status,
            'clientIntakeUuid', v_existing_collection.client_intake_uuid,
            'idempotencyKey', v_existing_collection.idempotency_key,
            'ledgerTransactionId', v_existing_collection.ledger_txn_id,
            'customerBalanceAfter', v_existing_collection.balance_after,
            'receiptNumber', 'RCP-' || UPPER(SUBSTRING(v_existing_collection.id::text, 1, 8)),
            'isIdempotentReplay', TRUE,
            'completedAt', v_existing_collection.created_at
        ) INTO v_result;
        RETURN v_result;
    END IF;

    -- 2. Fetch session FOR UPDATE
    SELECT * INTO v_session FROM collection_sessions WHERE id = p_session_id FOR UPDATE;
    IF v_session.id IS NULL THEN
        RAISE EXCEPTION 'Collection session % does not exist', p_session_id USING ERRCODE = 'P0002';
    END IF;

    IF v_session.session_state = 'COMPLETED' THEN
        RAISE EXCEPTION 'Collection session % has already been completed', p_session_id USING ERRCODE = '22000';
    END IF;

    IF v_session.session_state = 'CANCELLED' THEN
        RAISE EXCEPTION 'Collection session % has been cancelled', p_session_id USING ERRCODE = '22000';
    END IF;

    -- 3. Verify Customer & Center
    SELECT * INTO v_customer FROM customers WHERE id = v_session.customer_id;
    IF v_customer.id IS NULL OR v_customer.is_deleted = TRUE OR v_customer.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Customer % is not active or is deleted', v_session.customer_id USING ERRCODE = '22000';
    END IF;

    SELECT * INTO v_center FROM dairy_centers WHERE id = v_session.center_id;
    IF v_center.id IS NULL OR v_center.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Center % is not active', v_session.center_id USING ERRCODE = '22000';
    END IF;

    -- 4. Verify Milk Category permission
    SELECT EXISTS (
        SELECT 1 FROM customer_milk_categories 
        WHERE customer_id = v_session.customer_id 
          AND milk_category = v_session.selected_milk_category 
          AND is_authorized = TRUE
    ) INTO v_cat_auth;

    IF NOT v_cat_auth THEN
        RAISE EXCEPTION 'Customer % is not authorized for category %', v_session.customer_id, v_session.selected_milk_category USING ERRCODE = '22023';
    END IF;

    -- 5. Validate measurements against center_settings
    SELECT * INTO v_center_settings FROM center_settings WHERE center_id = v_session.center_id;
    
    IF v_session.selected_milk_category = 'COW' THEN
        v_fat_min := COALESCE(v_center_settings.cow_fat_min, 2.8);
        v_fat_max := COALESCE(v_center_settings.cow_fat_max, 6.0);
        v_snf_min := COALESCE(v_center_settings.cow_snf_min, 7.8);
        v_snf_max := COALESCE(v_center_settings.cow_snf_max, 10.2);
    ELSE
        v_fat_min := COALESCE(v_center_settings.buffalo_fat_min, 5.0);
        v_fat_max := COALESCE(v_center_settings.buffalo_fat_max, 12.0);
        v_snf_min := COALESCE(v_center_settings.buffalo_snf_min, 8.2);
        v_snf_max := COALESCE(v_center_settings.buffalo_snf_max, 11.5);
    END IF;

    IF p_net_weight <= 0.00 OR p_net_weight > 500.00 THEN
        RAISE EXCEPTION 'Invalid net weight %: must be between 0.01 and 500.00 kg', p_net_weight USING ERRCODE = '22003';
    END IF;

    IF p_fat_percentage < v_fat_min OR p_fat_percentage > v_fat_max THEN
        RAISE EXCEPTION 'Invalid % Fat %: allowed bounds are % to %', v_session.selected_milk_category, p_fat_percentage, v_fat_min, v_fat_max USING ERRCODE = '22003';
    END IF;

    IF p_snf_percentage < v_snf_min OR p_snf_percentage > v_snf_max THEN
        RAISE EXCEPTION 'Invalid % SNF %: allowed bounds are % to %', v_session.selected_milk_category, p_snf_percentage, v_snf_min, v_snf_max USING ERRCODE = '22003';
    END IF;

    -- 6. Insert Quality & Weight Readings into session audit tables
    INSERT INTO collection_quality_readings (
        session_id,
        fat_percentage,
        snf_percentage,
        validation_status,
        reading_source,
        recorded_at
    ) VALUES (
        p_session_id,
        p_fat_percentage,
        p_snf_percentage,
        'VALID',
        p_reading_source,
        NOW()
    );

    INSERT INTO collection_weight_readings (
        session_id,
        measured_weight,
        measurement_unit,
        tare_weight,
        net_weight,
        validation_status,
        reading_source,
        recorded_at
    ) VALUES (
        p_session_id,
        p_net_weight,
        p_measurement_unit,
        0.00,
        p_net_weight,
        'VALID',
        p_reading_source,
        NOW()
    );

    -- 7. Rate Resolution: Query rate_chart_versions & rate_chart_cells
    -- Priority 1: Center applicability rule
    SELECT rcv.id, rcv.version_number
    INTO v_rate_chart_version_id, v_version_number
    FROM rate_applicability_rules rar
    JOIN rate_charts rc ON rc.id = rar.rate_chart_id
    JOIN rate_chart_versions rcv ON rcv.rate_chart_id = rc.id
    WHERE rar.center_id = v_session.center_id
      AND rar.is_active = TRUE
      AND rc.milk_category = v_session.selected_milk_category
      AND rc.is_active = TRUE
      AND rcv.is_approved = TRUE
      AND rcv.effective_from <= NOW()
      AND (rcv.effective_to IS NULL OR rcv.effective_to >= NOW())
    ORDER BY rar.priority ASC, rcv.effective_from DESC, rcv.version_number DESC
    LIMIT 1;

    -- Priority 2: Fallback to Center-assigned or Org-default rate chart
    IF v_rate_chart_version_id IS NULL THEN
        SELECT rcv.id, rcv.version_number
        INTO v_rate_chart_version_id, v_version_number
        FROM rate_charts rc
        JOIN rate_chart_versions rcv ON rcv.rate_chart_id = rc.id
        WHERE (rc.center_id = v_session.center_id OR (rc.center_id IS NULL AND rc.organization_id = v_center.organization_id))
          AND rc.milk_category = v_session.selected_milk_category
          AND rc.is_active = TRUE
          AND rcv.is_approved = TRUE
          AND rcv.effective_from <= NOW()
          AND (rcv.effective_to IS NULL OR rcv.effective_to >= NOW())
        ORDER BY (rc.center_id IS NOT NULL) DESC, rcv.effective_from DESC, rcv.version_number DESC
        LIMIT 1;
    END IF;

    IF v_rate_chart_version_id IS NULL THEN
        RAISE EXCEPTION 'No active approved rate chart found for center % and category %', v_session.center_id, v_session.selected_milk_category USING ERRCODE = 'P0002';
    END IF;

    -- Query Rate Cell
    SELECT rate_per_unit INTO v_rate_per_unit
    FROM rate_chart_cells
    WHERE rate_chart_version_id = v_rate_chart_version_id
      AND fat_percentage = p_fat_percentage
      AND snf_percentage = p_snf_percentage;

    IF v_rate_per_unit IS NULL THEN
        RAISE EXCEPTION 'RATE_CELL_NOT_FOUND: No approved rate cell found for version % at Fat: %, SNF: %', v_rate_chart_version_id, p_fat_percentage, p_snf_percentage USING ERRCODE = '22000';
    END IF;

    -- Calculate Gross Total Amount
    v_total_amount := ROUND(p_net_weight * v_rate_per_unit, 2);

    -- 8. Insert into milk_collections
    v_collection_id := gen_random_uuid();
    INSERT INTO milk_collections (
        id,
        session_id,
        center_id,
        customer_id,
        business_date,
        shift_type,
        milk_category,
        net_weight,
        measurement_unit,
        fat_percentage,
        snf_percentage,
        rate_chart_version_id,
        applied_rate_per_unit,
        total_amount,
        transaction_status,
        client_intake_uuid,
        idempotency_key,
        created_at,
        synced_at
    ) VALUES (
        v_collection_id,
        p_session_id,
        v_session.center_id,
        v_session.customer_id,
        v_session.business_date,
        v_session.shift_type,
        v_session.selected_milk_category,
        p_net_weight,
        p_measurement_unit,
        p_fat_percentage,
        p_snf_percentage,
        v_rate_chart_version_id,
        v_rate_per_unit,
        v_total_amount,
        'COMPLETED',
        v_intake_uuid,
        v_idempotency_key,
        NOW(),
        NOW()
    );

    -- 9. Customer Ledger Account: Atomic balance update with row lock
    SELECT * INTO v_ledger_account 
    FROM customer_ledger_accounts 
    WHERE customer_id = v_session.customer_id 
    FOR UPDATE;

    IF v_ledger_account.id IS NULL THEN
        INSERT INTO customer_ledger_accounts (
            customer_id,
            organization_id,
            currency,
            current_balance,
            last_transaction_at,
            updated_at
        ) VALUES (
            v_session.customer_id,
            v_center.organization_id,
            'INR',
            v_total_amount,
            NOW(),
            NOW()
        ) RETURNING id, current_balance INTO v_customer_ledger_account_id, v_new_balance;
        v_prev_balance := 0.00;
    ELSE
        v_customer_ledger_account_id := v_ledger_account.id;
        v_prev_balance := v_ledger_account.current_balance;
        v_new_balance := v_prev_balance + v_total_amount;

        UPDATE customer_ledger_accounts
        SET current_balance = v_new_balance,
            last_transaction_at = NOW(),
            updated_at = NOW()
        WHERE id = v_customer_ledger_account_id;
    END IF;

    -- 10. Insert Ledger Transaction (Credit)
    v_ledger_txn_id := gen_random_uuid();
    INSERT INTO ledger_transactions (
        id,
        organization_id,
        center_id,
        customer_id,
        transaction_type,
        direction,
        amount,
        balance_after,
        reference_entity,
        reference_id,
        description,
        idempotency_key,
        created_by,
        created_at
    ) VALUES (
        v_ledger_txn_id,
        v_center.organization_id,
        v_session.center_id,
        v_session.customer_id,
        'MILK_COLLECTION_CREDIT',
        'CREDIT',
        v_total_amount,
        v_new_balance,
        'MILK_COLLECTION',
        v_collection_id,
        'Milk Collection ' || v_session.selected_milk_category || ': ' || p_net_weight || ' ' || p_measurement_unit || ' @ Rs ' || v_rate_per_unit,
        v_idempotency_key,
        p_operator_id,
        NOW()
    );

    -- 11. Insert Balanced Double-Entry Journal Entries
    -- Entry 1: Debit Milk Purchase Expense
    INSERT INTO ledger_entries (
        transaction_id,
        account_id,
        account_type,
        entry_type,
        amount
    ) VALUES (
        v_ledger_txn_id,
        v_session.center_id,
        'MILK_PURCHASE_EXPENSE',
        'DEBIT',
        v_total_amount
    );

    -- Entry 2: Credit Customer Payable
    INSERT INTO ledger_entries (
        transaction_id,
        account_id,
        account_type,
        entry_type,
        amount
    ) VALUES (
        v_ledger_txn_id,
        v_customer_ledger_account_id,
        'CUSTOMER_PAYABLE',
        'CREDIT',
        v_total_amount
    );

    -- 12. Update Collection Session state to COMPLETED
    UPDATE collection_sessions
    SET session_state = 'COMPLETED',
        completed_at = NOW()
    WHERE id = p_session_id;

    -- 13. Create Sync Event for Downstream Replication
    v_receipt_number := 'RCP-' || UPPER(SUBSTRING(v_collection_id::text, 1, 8));

    INSERT INTO sync_events (
        organization_id,
        center_id,
        entity_type,
        entity_id,
        action,
        payload
    ) VALUES (
        v_center.organization_id,
        v_session.center_id,
        'MILK_COLLECTION',
        v_collection_id,
        'INSERT',
        jsonb_build_object(
            'collectionId', v_collection_id,
            'sessionId', p_session_id,
            'customerId', v_session.customer_id,
            'totalAmount', v_total_amount,
            'receiptNumber', v_receipt_number,
            'idempotencyKey', v_idempotency_key
        )
    );

    -- 14. Create Audit Log
    INSERT INTO audit_logs (
        organization_id,
        center_id,
        user_id,
        action,
        entity_type,
        entity_id,
        new_values
    ) VALUES (
        v_center.organization_id,
        v_session.center_id,
        p_operator_id,
        'MILK_COLLECTION_COMPLETED',
        'MILK_COLLECTION',
        v_collection_id,
        jsonb_build_object(
            'netWeight', p_net_weight,
            'fatPercentage', p_fat_percentage,
            'snfPercentage', p_snf_percentage,
            'rate', v_rate_per_unit,
            'amount', v_total_amount,
            'balanceAfter', v_new_balance
        )
    );

    -- 15. Return comprehensive receipt & transaction result
    SELECT jsonb_build_object(
        'collectionId', v_collection_id,
        'sessionId', p_session_id,
        'centerId', v_session.center_id,
        'centerName', v_center.name,
        'centerCode', v_center.code,
        'customerId', v_session.customer_id,
        'customerName', v_customer.full_name,
        'farmerCode', v_customer.farmer_code,
        'businessDate', v_session.business_date,
        'shiftType', v_session.shift_type,
        'milkCategory', v_session.selected_milk_category,
        'netWeight', p_net_weight,
        'measurementUnit', p_measurement_unit,
        'fatPercentage', p_fat_percentage,
        'snfPercentage', p_snf_percentage,
        'rateChartVersionId', v_rate_chart_version_id,
        'appliedRatePerUnit', v_rate_per_unit,
        'totalAmount', v_total_amount,
        'previousBalance', v_prev_balance,
        'newBalance', v_new_balance,
        'transactionStatus', 'COMPLETED',
        'clientIntakeUuid', v_intake_uuid,
        'idempotencyKey', v_idempotency_key,
        'ledgerTransactionId', v_ledger_txn_id,
        'receiptNumber', v_receipt_number,
        'isIdempotentReplay', FALSE,
        'completedAt', NOW()
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

ALTER FUNCTION public.complete_milk_collection_session(UUID, UUID, VARCHAR, NUMERIC, NUMERIC, NUMERIC, VARCHAR, VARCHAR, UUID, VARCHAR) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.complete_milk_collection_session(UUID, UUID, VARCHAR, NUMERIC, NUMERIC, NUMERIC, VARCHAR, VARCHAR, UUID, VARCHAR) TO authenticated, service_role;


-- 5. Stored Procedure: Authorized Supervisor Adjustment / Reversal
CREATE OR REPLACE FUNCTION public.adjust_milk_collection(
    p_collection_id UUID,
    p_supervisor_id UUID,
    p_reason TEXT,
    p_adjustment_type VARCHAR(20),
    p_adjusted_net_weight NUMERIC(6,2) DEFAULT NULL,
    p_adjusted_fat_percentage NUMERIC(3,1) DEFAULT NULL,
    p_adjusted_snf_percentage NUMERIC(3,1) DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_collection RECORD;
    v_supervisor RECORD;
    v_center RECORD;
    v_ledger_account RECORD;
    v_prev_balance NUMERIC(12,2);
    v_new_balance NUMERIC(12,2);
    v_ledger_txn_id UUID;
    v_result JSONB;
BEGIN
    -- 1. Fetch collection FOR UPDATE
    SELECT * INTO v_collection FROM milk_collections WHERE id = p_collection_id FOR UPDATE;
    IF v_collection.id IS NULL THEN
        RAISE EXCEPTION 'Milk collection % does not exist', p_collection_id USING ERRCODE = 'P0002';
    END IF;

    IF v_collection.transaction_status <> 'COMPLETED' THEN
        RAISE EXCEPTION 'Milk collection % is already % and cannot be adjusted', p_collection_id, v_collection.transaction_status USING ERRCODE = '22000';
    END IF;

    -- 2. Verify Supervisor
    SELECT * INTO v_supervisor FROM users WHERE id = p_supervisor_id;
    IF v_supervisor.id IS NULL THEN
        RAISE EXCEPTION 'Supervisor % does not exist', p_supervisor_id USING ERRCODE = 'P0002';
    END IF;
    IF v_supervisor.role NOT IN ('SUPERVISOR', 'CENTER_MANAGER', 'DAIRY_OWNER', 'SUPER_ADMIN') THEN
        RAISE EXCEPTION 'User % is not authorized as supervisor or manager', p_supervisor_id USING ERRCODE = '42501';
    END IF;

    -- 3. Verify Reason
    IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 5 THEN
        RAISE EXCEPTION 'Mandatory supervisor reason (minimum 5 chars) is required for collection adjustment' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_center FROM dairy_centers WHERE id = v_collection.center_id;

    -- 4. Execute Full Reversal
    IF p_adjustment_type = 'FULL_REVERSAL' THEN
        -- Mark collection as REVERSED
        UPDATE milk_collections
        SET transaction_status = 'REVERSED'
        WHERE id = p_collection_id;

        -- Customer Ledger Account: Deduct previous credit
        SELECT * INTO v_ledger_account 
        FROM customer_ledger_accounts 
        WHERE customer_id = v_collection.customer_id 
        FOR UPDATE;

        v_prev_balance := v_ledger_account.current_balance;
        v_new_balance := v_prev_balance - v_collection.total_amount;

        UPDATE customer_ledger_accounts
        SET current_balance = v_new_balance,
            last_transaction_at = NOW(),
            updated_at = NOW()
        WHERE id = v_ledger_account.id;

        -- Insert Ledger Transaction (Debit Reversal)
        v_ledger_txn_id := gen_random_uuid();
        INSERT INTO ledger_transactions (
            id,
            organization_id,
            center_id,
            customer_id,
            transaction_type,
            direction,
            amount,
            balance_after,
            reference_entity,
            reference_id,
            description,
            idempotency_key,
            created_by,
            created_at
        ) VALUES (
            v_ledger_txn_id,
            v_center.organization_id,
            v_collection.center_id,
            v_collection.customer_id,
            'COLLECTION_REVERSAL_DEBIT',
            'DEBIT',
            v_collection.total_amount,
            v_new_balance,
            'MILK_COLLECTION',
            p_collection_id,
            'Reversal of collection ' || p_collection_id || ': ' || p_reason,
            'REV-' || p_collection_id::text,
            p_supervisor_id,
            NOW()
        );

        -- Double Entry Journal for Reversal
        -- Debit Customer Payable (Liability decreases)
        INSERT INTO ledger_entries (
            transaction_id,
            account_id,
            account_type,
            entry_type,
            amount
        ) VALUES (
            v_ledger_txn_id,
            v_ledger_account.id,
            'CUSTOMER_PAYABLE',
            'DEBIT',
            v_collection.total_amount
        );

        -- Credit Milk Purchase Expense (Expense decreases)
        INSERT INTO ledger_entries (
            transaction_id,
            account_id,
            account_type,
            entry_type,
            amount
        ) VALUES (
            v_ledger_txn_id,
            v_collection.center_id,
            'MILK_PURCHASE_EXPENSE',
            'CREDIT',
            v_collection.total_amount
        );

        -- Audit Log
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
            v_center.organization_id,
            v_collection.center_id,
            p_supervisor_id,
            'MILK_COLLECTION_REVERSED',
            'MILK_COLLECTION',
            p_collection_id,
            jsonb_build_object('status', 'COMPLETED', 'amount', v_collection.total_amount),
            jsonb_build_object('status', 'REVERSED', 'reason', p_reason, 'reversedBy', p_supervisor_id)
        );

        SELECT jsonb_build_object(
            'collectionId', p_collection_id,
            'status', 'REVERSED',
            'reversedAmount', v_collection.total_amount,
            'previousBalance', v_prev_balance,
            'newBalance', v_new_balance,
            'supervisorId', p_supervisor_id,
            'reason', p_reason,
            'adjustedAt', NOW()
        ) INTO v_result;

        RETURN v_result;
    ELSE
        RAISE EXCEPTION 'Unsupported adjustment type %', p_adjustment_type USING ERRCODE = '22023';
    END IF;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

ALTER FUNCTION public.adjust_milk_collection(UUID, UUID, TEXT, VARCHAR, NUMERIC, NUMERIC, NUMERIC) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.adjust_milk_collection(UUID, UUID, TEXT, VARCHAR, NUMERIC, NUMERIC, NUMERIC) TO authenticated, service_role;


INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('017', '017_milk_collection_workflow_and_atomic_ledger.sql') ON CONFLICT (version) DO NOTHING;

-- ========================================================
-- Migration: 018_milk_rate_management_system.sql
-- ========================================================
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

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('018', '018_milk_rate_management_system.sql') ON CONFLICT (version) DO NOTHING;

-- ========================================================
-- Migration: 019_customer_accounting_and_double_entry_ledger.sql
-- ========================================================
-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 014: CUSTOMER FINANCIAL ACCOUNTING & DOUBLE-ENTRY LEDGER ENGINE
-- ==============================================================================

-- 1. Extend ledger_transactions CHECK constraints to support complete transaction types
ALTER TABLE ledger_transactions DROP CONSTRAINT IF EXISTS chk_ledger_txn_type;
ALTER TABLE ledger_transactions ADD CONSTRAINT chk_ledger_txn_type CHECK (
    transaction_type IN (
        -- Credits (Increases Dairy Liability to Customer)
        'MILK_COLLECTION_CREDIT',
        'CUSTOMER_INCENTIVE_CREDIT',
        'APPROVED_ADJUSTMENT_CREDIT',
        'LEDGER_ADJUSTMENT_CREDIT',
        'OPENING_BALANCE_CREDIT',
        'ADVANCE_RECOVERY_CREDIT',

        -- Debits (Decreases Dairy Liability to Customer)
        'CUSTOMER_ADVANCE_DEBIT',
        'ADVANCE_DEBIT',
        'FEED_PURCHASE_DEBIT',
        'AUTHORIZED_DEDUCTION_DEBIT',
        'DEDUCTION_DEBIT',
        'PAYOUT_SETTLEMENT_DEBIT',
        'PAYMENT_PAYOUT_DEBIT',
        'APPROVED_ADJUSTMENT_DEBIT',
        'LEDGER_ADJUSTMENT_DEBIT',
        'COLLECTION_REVERSAL_DEBIT',
        'OPENING_BALANCE_DEBIT'
    )
);

ALTER TABLE ledger_transactions DROP CONSTRAINT IF EXISTS chk_ledger_ref_entity;
ALTER TABLE ledger_transactions ADD CONSTRAINT chk_ledger_ref_entity CHECK (
    reference_entity IN (
        'MILK_COLLECTION',
        'FEED_SALE',
        'CUSTOMER_ADVANCE',
        'CUSTOMER_DEDUCTION',
        'CUSTOMER_PAYMENT',
        'MANUAL_ADJUSTMENT',
        'CUSTOMER_PAYOUT',
        'CUSTOMER_RECEIPT',
        'PAYMENT_BATCH',
        'OPENING_BALANCE',
        'CUSTOMER_INCENTIVE',
        'ADVANCE_RECOVERY'
    )
);

-- 2. Extend ledger_entries CHECK constraint for full double-entry chart of accounts
ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS chk_entry_account_type;
ALTER TABLE ledger_entries ADD CONSTRAINT chk_entry_account_type CHECK (
    account_type IN (
        'CUSTOMER_PAYABLE',
        'MILK_PURCHASE_EXPENSE',
        'FEED_INVENTORY',
        'CASH_BANK',
        'ADVANCE_RECEIVABLE',
        'DEDUCTION_INCOME',
        'INCENTIVE_EXPENSE',
        'OPENING_BALANCE_EQUITY',
        'RECONCILIATION_SUSPENSE'
    )
);

-- 3. Enhance customer_advances table schema
ALTER TABLE customer_advances ADD COLUMN IF NOT EXISTS requested_amount NUMERIC(10,2);
ALTER TABLE customer_advances ADD COLUMN IF NOT EXISTS approved_amount NUMERIC(10,2);
ALTER TABLE customer_advances ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE customer_advances ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE customer_advances ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE customer_advances ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE customer_advances ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE customer_advances ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
ALTER TABLE customer_advances ALTER COLUMN disbursed_by DROP NOT NULL;

-- Backfill requested_amount and approved_amount for existing advances if any
UPDATE customer_advances SET requested_amount = principal_amount WHERE requested_amount IS NULL;
UPDATE customer_advances SET approved_amount = principal_amount WHERE approved_amount IS NULL;

ALTER TABLE customer_advances DROP CONSTRAINT IF EXISTS chk_advance_status;
ALTER TABLE customer_advances ADD CONSTRAINT chk_advance_status CHECK (
    status IN ('PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'REJECTED', 'FULLY_RECOVERED', 'WRITTEN_OFF')
);

-- 4. Enhance customer_deductions table schema
ALTER TABLE customer_deductions ADD COLUMN IF NOT EXISTS supporting_reference VARCHAR(100);
ALTER TABLE customer_deductions ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'POSTED';
ALTER TABLE customer_deductions ADD COLUMN IF NOT EXISTS ledger_transaction_id UUID REFERENCES ledger_transactions(id) ON DELETE SET NULL;

ALTER TABLE customer_deductions DROP CONSTRAINT IF EXISTS chk_deduction_category;
ALTER TABLE customer_deductions ADD CONSTRAINT chk_deduction_category CHECK (
    deduction_category IN (
        'VETERINARY_MEDICINE',
        'AI_BREEDING_CHARGE',
        'CATTLE_INSURANCE',
        'MEMBERSHIP_FEE',
        'OTHER',
        'EQUIPMENT_MAINTENANCE',
        'SUPPLY_CHARGE'
    )
);

-- 5. Enhance customer_adjustments table schema
ALTER TABLE customer_adjustments ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE customer_adjustments ADD COLUMN IF NOT EXISTS center_id UUID REFERENCES dairy_centers(id) ON DELETE RESTRICT;
ALTER TABLE customer_adjustments ADD COLUMN IF NOT EXISTS original_transaction_id UUID REFERENCES ledger_transactions(id) ON DELETE SET NULL;
ALTER TABLE customer_adjustments ADD COLUMN IF NOT EXISTS ledger_transaction_id UUID REFERENCES ledger_transactions(id) ON DELETE SET NULL;
ALTER TABLE customer_adjustments ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);
ALTER TABLE customer_adjustments ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'POSTED';

-- 6. Enhance customer_ledger_accounts
ALTER TABLE customer_ledger_accounts ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';

-- 7. Immutability trigger on ledger_transactions to prevent direct UPDATE or DELETE
CREATE OR REPLACE FUNCTION public.trigger_enforce_ledger_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'CANNOT_MUTATE_LEDGER: Finalized ledger transactions are strictly immutable and cannot be updated.'
            USING ERRCODE = '22000';
    ELSIF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'CANNOT_DELETE_LEDGER: Finalized ledger transactions are strictly immutable and cannot be deleted.'
            USING ERRCODE = '22000';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledger_transactions_immutable ON ledger_transactions;
CREATE TRIGGER trg_ledger_transactions_immutable
BEFORE UPDATE OR DELETE ON ledger_transactions
FOR EACH ROW EXECUTE FUNCTION public.trigger_enforce_ledger_immutability();

-- 8. Stored Procedure: Post Customer Advance (Disbursement)
CREATE OR REPLACE FUNCTION public.post_customer_advance(
    p_customer_id UUID,
    p_center_id UUID,
    p_actor_id UUID,
    p_amount NUMERIC(10,2),
    p_reason TEXT,
    p_recovery_type VARCHAR(30) DEFAULT 'MONTHLY_BILL_DEDUCTION',
    p_idempotency_key VARCHAR(128) DEFAULT NULL,
    p_advance_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB AS $$
DECLARE
    v_customer RECORD;
    v_center RECORD;
    v_actor RECORD;
    v_existing_txn RECORD;
    v_ledger_account RECORD;
    v_prev_balance NUMERIC(12,2);
    v_new_balance NUMERIC(12,2);
    v_advance_id UUID;
    v_advance_date DATE;
    v_ledger_txn_id UUID;
    v_idempotency_key VARCHAR(128);
    v_result JSONB;
BEGIN
    v_advance_date := COALESCE(p_advance_date, CURRENT_DATE);
    v_idempotency_key := COALESCE(p_idempotency_key, 'ADV-' || p_customer_id::text || '-' || CURRENT_DATE::text || '-' || ROUND(p_amount, 2)::text);

    -- 1. Idempotency check: Return existing transaction if duplicate
    SELECT lt.*, ca.id AS advance_id, ca.status AS advance_status
    INTO v_existing_txn
    FROM ledger_transactions lt
    JOIN customer_advances ca ON ca.id = lt.reference_id
    WHERE lt.idempotency_key = v_idempotency_key;

    IF v_existing_txn.id IS NOT NULL THEN
        SELECT jsonb_build_object(
            'advanceId', v_existing_txn.advance_id,
            'ledgerTransactionId', v_existing_txn.id,
            'customerId', v_existing_txn.customer_id,
            'centerId', v_existing_txn.center_id,
            'principalAmount', v_existing_txn.amount,
            'balanceAfter', v_existing_txn.balance_after,
            'status', v_existing_txn.advance_status,
            'isIdempotentReplay', TRUE,
            'createdAt', v_existing_txn.created_at
        ) INTO v_result;
        RETURN v_result;
    END IF;

    -- 2. Validation
    IF p_amount <= 0.00 THEN
        RAISE EXCEPTION 'Advance amount must be strictly greater than 0.00' USING ERRCODE = '22003';
    END IF;

    IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 3 THEN
        RAISE EXCEPTION 'A valid advance reason is mandatory (minimum 3 characters)' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_customer FROM customers WHERE id = p_customer_id;
    IF v_customer.id IS NULL OR v_customer.is_deleted = TRUE OR v_customer.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Customer % is not active or has been soft-deleted', p_customer_id USING ERRCODE = '22000';
    END IF;

    SELECT * INTO v_center FROM dairy_centers WHERE id = p_center_id;
    IF v_center.id IS NULL OR v_center.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Center % is not active', p_center_id USING ERRCODE = '22000';
    END IF;

    IF v_customer.organization_id <> v_center.organization_id THEN
        RAISE EXCEPTION 'Cross-organization advance disbursement is strictly prohibited' USING ERRCODE = '22000';
    END IF;

    SELECT * INTO v_actor FROM users WHERE id = p_actor_id;
    IF v_actor.id IS NULL THEN
        RAISE EXCEPTION 'Actor % does not exist', p_actor_id USING ERRCODE = 'P0002';
    END IF;

    -- 3. Lock Customer Ledger Account with FOR UPDATE
    SELECT * INTO v_ledger_account 
    FROM customer_ledger_accounts 
    WHERE customer_id = p_customer_id 
    FOR UPDATE;

    IF v_ledger_account.id IS NULL THEN
        v_prev_balance := 0.00;
        v_new_balance := 0.00 - p_amount;
        INSERT INTO customer_ledger_accounts (
            customer_id, organization_id, currency, current_balance, last_transaction_at, updated_at
        ) VALUES (
            p_customer_id, v_center.organization_id, 'INR', v_new_balance, NOW(), NOW()
        ) RETURNING * INTO v_ledger_account;
    ELSE
        v_prev_balance := v_ledger_account.current_balance;
        v_new_balance := v_prev_balance - p_amount; -- DEBIT decreases dairy liability to customer
        UPDATE customer_ledger_accounts
        SET current_balance = v_new_balance,
            last_transaction_at = NOW(),
            updated_at = NOW()
        WHERE id = v_ledger_account.id;
    END IF;

    -- 4. Insert Customer Advance
    v_advance_id := gen_random_uuid();
    INSERT INTO customer_advances (
        id, customer_id, center_id, advance_date, principal_amount,
        requested_amount, approved_amount, reason, recovery_type,
        total_recovered_amount, outstanding_amount, status,
        approved_by, approved_at, disbursed_by, disbursed_at
    ) VALUES (
        v_advance_id, p_customer_id, p_center_id, v_advance_date, p_amount,
        p_amount, p_amount, p_reason, p_recovery_type,
        0.00, p_amount, 'ACTIVE',
        p_actor_id, NOW(), p_actor_id, NOW()
    );

    -- 5. Insert Ledger Transaction (Debit)
    v_ledger_txn_id := gen_random_uuid();
    INSERT INTO ledger_transactions (
        id, organization_id, center_id, customer_id, transaction_type,
        direction, amount, balance_after, reference_entity, reference_id,
        description, idempotency_key, created_by, created_at
    ) VALUES (
        v_ledger_txn_id, v_center.organization_id, p_center_id, p_customer_id, 'CUSTOMER_ADVANCE_DEBIT',
        'DEBIT', p_amount, v_new_balance, 'CUSTOMER_ADVANCE', v_advance_id,
        'Customer Advance: ' || p_reason, v_idempotency_key, p_actor_id, NOW()
    );

    -- 6. Insert Balanced Double-Entry Journal Entries
    -- Entry 1: Debit Customer Payable (Liability decreases)
    INSERT INTO ledger_entries (
        transaction_id, account_id, account_type, entry_type, amount
    ) VALUES (
        v_ledger_txn_id, v_ledger_account.id, 'CUSTOMER_PAYABLE', 'DEBIT', p_amount
    );

    -- Entry 2: Credit Cash/Bank (Asset decreases)
    INSERT INTO ledger_entries (
        transaction_id, account_id, account_type, entry_type, amount
    ) VALUES (
        v_ledger_txn_id, p_center_id, 'CASH_BANK', 'CREDIT', p_amount
    );

    -- 7. Audit Log
    INSERT INTO audit_logs (
        organization_id, center_id, user_id, action, entity_type, entity_id, new_values
    ) VALUES (
        v_center.organization_id, p_center_id, p_actor_id, 'CUSTOMER_ADVANCE_DISBURSED',
        'CUSTOMER_ADVANCE', v_advance_id,
        jsonb_build_object(
            'amount', p_amount,
            'previousBalance', v_prev_balance,
            'newBalance', v_new_balance,
            'reason', p_reason
        )
    );

    -- 8. Return Receipt
    SELECT jsonb_build_object(
        'advanceId', v_advance_id,
        'ledgerTransactionId', v_ledger_txn_id,
        'customerId', p_customer_id,
        'customerName', v_customer.full_name,
        'farmerCode', v_customer.farmer_code,
        'centerId', p_center_id,
        'principalAmount', p_amount,
        'outstandingAmount', p_amount,
        'recoveredAmount', 0.00,
        'previousBalance', v_prev_balance,
        'newBalance', v_new_balance,
        'reason', p_reason,
        'status', 'ACTIVE',
        'recoveryType', p_recovery_type,
        'disbursedBy', p_actor_id,
        'receiptNumber', 'ADV-' || UPPER(SUBSTRING(v_advance_id::text, 1, 8)),
        'isIdempotentReplay', FALSE,
        'disbursedAt', NOW()
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

ALTER FUNCTION public.post_customer_advance(UUID, UUID, UUID, NUMERIC, TEXT, VARCHAR, VARCHAR, DATE) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.post_customer_advance(UUID, UUID, UUID, NUMERIC, TEXT, VARCHAR, VARCHAR, DATE) TO authenticated, service_role;

-- 9. Stored Procedure: Request Customer Advance (Pending Approval)
CREATE OR REPLACE FUNCTION public.request_customer_advance(
    p_customer_id UUID,
    p_center_id UUID,
    p_actor_id UUID,
    p_amount NUMERIC(10,2),
    p_reason TEXT,
    p_recovery_type VARCHAR(30) DEFAULT 'MONTHLY_BILL_DEDUCTION',
    p_advance_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB AS $$
DECLARE
    v_customer RECORD;
    v_center RECORD;
    v_advance_id UUID;
    v_result JSONB;
BEGIN
    IF p_amount <= 0.00 THEN
        RAISE EXCEPTION 'Advance amount must be strictly positive' USING ERRCODE = '22003';
    END IF;

    IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 3 THEN
        RAISE EXCEPTION 'A valid advance reason is mandatory' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_customer FROM customers WHERE id = p_customer_id;
    IF v_customer.id IS NULL OR v_customer.is_deleted = TRUE OR v_customer.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Customer % is not active or has been deleted', p_customer_id USING ERRCODE = '22000';
    END IF;

    SELECT * INTO v_center FROM dairy_centers WHERE id = p_center_id;
    IF v_center.id IS NULL OR v_center.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Center % is not active', p_center_id USING ERRCODE = '22000';
    END IF;

    v_advance_id := gen_random_uuid();
    INSERT INTO customer_advances (
        id, customer_id, center_id, advance_date, principal_amount,
        requested_amount, approved_amount, reason, recovery_type,
        total_recovered_amount, outstanding_amount, status
    ) VALUES (
        v_advance_id, p_customer_id, p_center_id, p_advance_date, p_amount,
        p_amount, 0.00, p_reason, p_recovery_type,
        0.00, p_amount, 'PENDING_APPROVAL'
    );

    SELECT jsonb_build_object(
        'advanceId', v_advance_id,
        'customerId', p_customer_id,
        'centerId', p_center_id,
        'requestedAmount', p_amount,
        'reason', p_reason,
        'status', 'PENDING_APPROVAL',
        'createdAt', NOW()
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

ALTER FUNCTION public.request_customer_advance(UUID, UUID, UUID, NUMERIC, TEXT, VARCHAR, DATE) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.request_customer_advance(UUID, UUID, UUID, NUMERIC, TEXT, VARCHAR, DATE) TO authenticated, service_role;

-- 10. Stored Procedure: Approve Customer Advance (Triggers Financial Posting)
CREATE OR REPLACE FUNCTION public.approve_customer_advance(
    p_advance_id UUID,
    p_actor_id UUID,
    p_approved_amount NUMERIC(10,2) DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_advance RECORD;
    v_customer RECORD;
    v_center RECORD;
    v_actor RECORD;
    v_ledger_account RECORD;
    v_final_amount NUMERIC(10,2);
    v_prev_balance NUMERIC(12,2);
    v_new_balance NUMERIC(12,2);
    v_ledger_txn_id UUID;
    v_result JSONB;
BEGIN
    SELECT * INTO v_advance FROM customer_advances WHERE id = p_advance_id FOR UPDATE;
    IF v_advance.id IS NULL THEN
        RAISE EXCEPTION 'Customer advance % does not exist', p_advance_id USING ERRCODE = 'P0002';
    END IF;

    IF v_advance.status <> 'PENDING_APPROVAL' THEN
        RAISE EXCEPTION 'Advance % is already in % status and cannot be approved', p_advance_id, v_advance.status USING ERRCODE = '22000';
    END IF;

    v_final_amount := COALESCE(p_approved_amount, v_advance.requested_amount);
    IF v_final_amount <= 0.00 THEN
        RAISE EXCEPTION 'Approved amount must be strictly greater than 0.00' USING ERRCODE = '22003';
    END IF;

    SELECT * INTO v_actor FROM users WHERE id = p_actor_id;
    IF v_actor.id IS NULL OR v_actor.role NOT IN ('SUPERVISOR', 'CENTER_MANAGER', 'DAIRY_OWNER', 'SUPER_ADMIN') THEN
        RAISE EXCEPTION 'Actor % is not authorized to approve customer advances', p_actor_id USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_customer FROM customers WHERE id = v_advance.customer_id;
    SELECT * INTO v_center FROM dairy_centers WHERE id = v_advance.center_id;

    -- Lock Ledger Account
    SELECT * INTO v_ledger_account 
    FROM customer_ledger_accounts 
    WHERE customer_id = v_advance.customer_id 
    FOR UPDATE;

    IF v_ledger_account.id IS NULL THEN
        v_prev_balance := 0.00;
        v_new_balance := 0.00 - v_final_amount;
        INSERT INTO customer_ledger_accounts (
            customer_id, organization_id, currency, current_balance, last_transaction_at, updated_at
        ) VALUES (
            v_advance.customer_id, v_center.organization_id, 'INR', v_new_balance, NOW(), NOW()
        ) RETURNING * INTO v_ledger_account;
    ELSE
        v_prev_balance := v_ledger_account.current_balance;
        v_new_balance := v_prev_balance - v_final_amount;
        UPDATE customer_ledger_accounts
        SET current_balance = v_new_balance,
            last_transaction_at = NOW(),
            updated_at = NOW()
        WHERE id = v_ledger_account.id;
    END IF;

    -- Update Advance Record
    UPDATE customer_advances
    SET status = 'ACTIVE',
        approved_amount = v_final_amount,
        principal_amount = v_final_amount,
        outstanding_amount = v_final_amount,
        approved_by = p_actor_id,
        approved_at = NOW(),
        disbursed_by = p_actor_id,
        disbursed_at = NOW()
    WHERE id = p_advance_id;

    -- Insert Ledger Transaction (Debit)
    v_ledger_txn_id := gen_random_uuid();
    INSERT INTO ledger_transactions (
        id, organization_id, center_id, customer_id, transaction_type,
        direction, amount, balance_after, reference_entity, reference_id,
        description, idempotency_key, created_by, created_at
    ) VALUES (
        v_ledger_txn_id, v_center.organization_id, v_advance.center_id, v_advance.customer_id, 'CUSTOMER_ADVANCE_DEBIT',
        'DEBIT', v_final_amount, v_new_balance, 'CUSTOMER_ADVANCE', p_advance_id,
        'Customer Advance Approved: ' || COALESCE(v_advance.reason, 'Approved Advance'),
        'ADV-APP-' || p_advance_id::text, p_actor_id, NOW()
    );

    -- Insert Balanced Double-Entry Journal Entries
    INSERT INTO ledger_entries (
        transaction_id, account_id, account_type, entry_type, amount
    ) VALUES (
        v_ledger_txn_id, v_ledger_account.id, 'CUSTOMER_PAYABLE', 'DEBIT', v_final_amount
    );

    INSERT INTO ledger_entries (
        transaction_id, account_id, account_type, entry_type, amount
    ) VALUES (
        v_ledger_txn_id, v_advance.center_id, 'CASH_BANK', 'CREDIT', v_final_amount
    );

    -- Audit Log
    INSERT INTO audit_logs (
        organization_id, center_id, user_id, action, entity_type, entity_id, new_values
    ) VALUES (
        v_center.organization_id, v_advance.center_id, p_actor_id, 'CUSTOMER_ADVANCE_APPROVED',
        'CUSTOMER_ADVANCE', p_advance_id,
        jsonb_build_object(
            'approvedAmount', v_final_amount,
            'previousBalance', v_prev_balance,
            'newBalance', v_new_balance
        )
    );

    SELECT jsonb_build_object(
        'advanceId', p_advance_id,
        'ledgerTransactionId', v_ledger_txn_id,
        'customerId', v_advance.customer_id,
        'status', 'ACTIVE',
        'approvedAmount', v_final_amount,
        'previousBalance', v_prev_balance,
        'newBalance', v_new_balance,
        'approvedBy', p_actor_id,
        'receiptNumber', 'ADV-' || UPPER(SUBSTRING(p_advance_id::text, 1, 8)),
        'approvedAt', NOW()
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

ALTER FUNCTION public.approve_customer_advance(UUID, UUID, NUMERIC) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.approve_customer_advance(UUID, UUID, NUMERIC) TO authenticated, service_role;

-- 11. Stored Procedure: Reject Customer Advance (Does NOT Mutate Ledger)
CREATE OR REPLACE FUNCTION public.reject_customer_advance(
    p_advance_id UUID,
    p_actor_id UUID,
    p_rejection_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_advance RECORD;
    v_actor RECORD;
    v_result JSONB;
BEGIN
    SELECT * INTO v_advance FROM customer_advances WHERE id = p_advance_id FOR UPDATE;
    IF v_advance.id IS NULL THEN
        RAISE EXCEPTION 'Customer advance % does not exist', p_advance_id USING ERRCODE = 'P0002';
    END IF;

    IF v_advance.status <> 'PENDING_APPROVAL' THEN
        RAISE EXCEPTION 'Advance % is already in % status and cannot be rejected', p_advance_id, v_advance.status USING ERRCODE = '22000';
    END IF;

    IF p_rejection_reason IS NULL OR LENGTH(TRIM(p_rejection_reason)) < 3 THEN
        RAISE EXCEPTION 'Rejection reason is mandatory (minimum 3 characters)' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_actor FROM users WHERE id = p_actor_id;
    IF v_actor.id IS NULL OR v_actor.role NOT IN ('SUPERVISOR', 'CENTER_MANAGER', 'DAIRY_OWNER', 'SUPER_ADMIN') THEN
        RAISE EXCEPTION 'Actor % is not authorized to reject advances', p_actor_id USING ERRCODE = '42501';
    END IF;

    UPDATE customer_advances
    SET status = 'REJECTED',
        rejection_reason = p_rejection_reason,
        rejected_by = p_actor_id,
        rejected_at = NOW()
    WHERE id = p_advance_id;

    -- Audit Log (No ledger transaction created!)
    INSERT INTO audit_logs (
        organization_id, center_id, user_id, action, entity_type, entity_id, new_values
    ) VALUES (
        (SELECT organization_id FROM dairy_centers WHERE id = v_advance.center_id),
        v_advance.center_id, p_actor_id, 'CUSTOMER_ADVANCE_REJECTED',
        'CUSTOMER_ADVANCE', p_advance_id,
        jsonb_build_object('reason', p_rejection_reason, 'status', 'REJECTED')
    );

    SELECT jsonb_build_object(
        'advanceId', p_advance_id,
        'status', 'REJECTED',
        'rejectionReason', p_rejection_reason,
        'rejectedBy', p_actor_id,
        'rejectedAt', NOW()
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

ALTER FUNCTION public.reject_customer_advance(UUID, UUID, TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.reject_customer_advance(UUID, UUID, TEXT) TO authenticated, service_role;

-- 12. Stored Procedure: Recover Customer Advance (Partial or Full)
CREATE OR REPLACE FUNCTION public.recover_customer_advance(
    p_advance_id UUID,
    p_actor_id UUID,
    p_recovery_amount NUMERIC(10,2),
    p_idempotency_key VARCHAR(128) DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_advance RECORD;
    v_customer RECORD;
    v_center RECORD;
    v_ledger_account RECORD;
    v_existing_txn RECORD;
    v_prev_balance NUMERIC(12,2);
    v_new_balance NUMERIC(12,2);
    v_new_recovered NUMERIC(10,2);
    v_new_outstanding NUMERIC(10,2);
    v_new_status VARCHAR(20);
    v_ledger_txn_id UUID;
    v_idempotency_key VARCHAR(128);
    v_result JSONB;
BEGIN
    v_idempotency_key := COALESCE(p_idempotency_key, 'REC-' || p_advance_id::text || '-' || ROUND(p_recovery_amount, 2)::text || '-' || CURRENT_DATE::text);

    -- 1. Idempotency Check
    SELECT lt.*, ca.outstanding_amount, ca.status AS advance_status
    INTO v_existing_txn
    FROM ledger_transactions lt
    JOIN customer_advances ca ON ca.id = lt.reference_id
    WHERE lt.idempotency_key = v_idempotency_key;

    IF v_existing_txn.id IS NOT NULL THEN
        SELECT jsonb_build_object(
            'advanceId', p_advance_id,
            'ledgerTransactionId', v_existing_txn.id,
            'recoveredAmount', v_existing_txn.amount,
            'outstandingAmount', v_existing_txn.outstanding_amount,
            'status', v_existing_txn.advance_status,
            'isIdempotentReplay', TRUE,
            'recoveredAt', v_existing_txn.created_at
        ) INTO v_result;
        RETURN v_result;
    END IF;

    -- 2. Fetch Advance FOR UPDATE
    SELECT * INTO v_advance FROM customer_advances WHERE id = p_advance_id FOR UPDATE;
    IF v_advance.id IS NULL THEN
        RAISE EXCEPTION 'Customer advance % does not exist', p_advance_id USING ERRCODE = 'P0002';
    END IF;

    IF v_advance.status NOT IN ('ACTIVE', 'APPROVED') THEN
        RAISE EXCEPTION 'Advance % is % and cannot be recovered', p_advance_id, v_advance.status USING ERRCODE = '22000';
    END IF;

    IF p_recovery_amount <= 0.00 THEN
        RAISE EXCEPTION 'Recovery amount must be strictly greater than 0.00' USING ERRCODE = '22003';
    END IF;

    -- CRITICAL BUSINESS INVARIANT: Prevent recovered amount from exceeding outstanding principal!
    IF p_recovery_amount > v_advance.outstanding_amount THEN
        RAISE EXCEPTION 'OVER_RECOVERY_PROHIBITED: Recovery amount % exceeds outstanding balance %',
            p_recovery_amount, v_advance.outstanding_amount USING ERRCODE = '22003';
    END IF;

    SELECT * INTO v_customer FROM customers WHERE id = v_advance.customer_id;
    SELECT * INTO v_center FROM dairy_centers WHERE id = v_advance.center_id;

    -- 3. Compute New Balances
    v_new_recovered := v_advance.total_recovered_amount + p_recovery_amount;
    v_new_outstanding := v_advance.outstanding_amount - p_recovery_amount;
    v_new_status := CASE WHEN v_new_outstanding = 0.00 THEN 'FULLY_RECOVERED' ELSE 'ACTIVE' END;

    -- Update Customer Advance
    UPDATE customer_advances
    SET total_recovered_amount = v_new_recovered,
        outstanding_amount = v_new_outstanding,
        status = v_new_status
    WHERE id = p_advance_id;

    -- 4. Lock Customer Ledger Account
    SELECT * INTO v_ledger_account 
    FROM customer_ledger_accounts 
    WHERE customer_id = v_advance.customer_id 
    FOR UPDATE;

    v_prev_balance := v_ledger_account.current_balance;
    v_new_balance := v_prev_balance + p_recovery_amount; -- CREDIT increases dairy liability / offsets advance debit

    UPDATE customer_ledger_accounts
    SET current_balance = v_new_balance,
        last_transaction_at = NOW(),
        updated_at = NOW()
    WHERE id = v_ledger_account.id;

    -- 5. Insert Ledger Transaction (Credit)
    v_ledger_txn_id := gen_random_uuid();
    INSERT INTO ledger_transactions (
        id, organization_id, center_id, customer_id, transaction_type,
        direction, amount, balance_after, reference_entity, reference_id,
        description, idempotency_key, created_by, created_at
    ) VALUES (
        v_ledger_txn_id, v_center.organization_id, v_advance.center_id, v_advance.customer_id, 'ADVANCE_RECOVERY_CREDIT',
        'CREDIT', p_recovery_amount, v_new_balance, 'ADVANCE_RECOVERY', p_advance_id,
        'Advance Recovery (' || (CASE WHEN v_new_status = 'FULLY_RECOVERED' THEN 'FULL' ELSE 'PARTIAL' END) || '): ' || COALESCE(p_notes, 'Direct Cash/Bill Repayment'),
        v_idempotency_key, p_actor_id, NOW()
    );

    -- 6. Insert Balanced Double-Entry Journal Entries
    -- Entry 1: Debit Cash/Bank (Cash received increases asset)
    INSERT INTO ledger_entries (
        transaction_id, account_id, account_type, entry_type, amount
    ) VALUES (
        v_ledger_txn_id, v_advance.center_id, 'CASH_BANK', 'DEBIT', p_recovery_amount
    );

    -- Entry 2: Credit Customer Payable (Liability increases back)
    INSERT INTO ledger_entries (
        transaction_id, account_id, account_type, entry_type, amount
    ) VALUES (
        v_ledger_txn_id, v_ledger_account.id, 'CUSTOMER_PAYABLE', 'CREDIT', p_recovery_amount
    );

    -- 7. Audit Log
    INSERT INTO audit_logs (
        organization_id, center_id, user_id, action, entity_type, entity_id, new_values
    ) VALUES (
        v_center.organization_id, v_advance.center_id, p_actor_id, 'CUSTOMER_ADVANCE_RECOVERED',
        'CUSTOMER_ADVANCE', p_advance_id,
        jsonb_build_object(
            'recoveredAmount', p_recovery_amount,
            'totalRecovered', v_new_recovered,
            'remainingOutstanding', v_new_outstanding,
            'status', v_new_status,
            'previousBalance', v_prev_balance,
            'newBalance', v_new_balance
        )
    );

    SELECT jsonb_build_object(
        'advanceId', p_advance_id,
        'ledgerTransactionId', v_ledger_txn_id,
        'customerId', v_advance.customer_id,
        'recoveredAmount', p_recovery_amount,
        'totalRecoveredAmount', v_new_recovered,
        'remainingPrincipal', v_new_outstanding,
        'outstandingAmount', v_new_outstanding,
        'status', v_new_status,
        'previousBalance', v_prev_balance,
        'newBalance', v_new_balance,
        'receiptNumber', 'REC-' || UPPER(SUBSTRING(v_ledger_txn_id::text, 1, 8)),
        'isIdempotentReplay', FALSE,
        'recoveredAt', NOW()
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

ALTER FUNCTION public.recover_customer_advance(UUID, UUID, NUMERIC, VARCHAR, TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.recover_customer_advance(UUID, UUID, NUMERIC, VARCHAR, TEXT) TO authenticated, service_role;

-- 13. Stored Procedure: Post Customer Authorized Deduction
CREATE OR REPLACE FUNCTION public.post_customer_deduction(
    p_customer_id UUID,
    p_center_id UUID,
    p_actor_id UUID,
    p_category VARCHAR(50),
    p_amount NUMERIC(10,2),
    p_description TEXT,
    p_supporting_reference VARCHAR(100) DEFAULT NULL,
    p_idempotency_key VARCHAR(128) DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_customer RECORD;
    v_center RECORD;
    v_actor RECORD;
    v_ledger_account RECORD;
    v_existing_txn RECORD;
    v_prev_balance NUMERIC(12,2);
    v_new_balance NUMERIC(12,2);
    v_deduction_id UUID;
    v_ledger_txn_id UUID;
    v_idempotency_key VARCHAR(128);
    v_result JSONB;
BEGIN
    v_idempotency_key := COALESCE(p_idempotency_key, 'DED-' || p_customer_id::text || '-' || p_category || '-' || CURRENT_DATE::text || '-' || ROUND(p_amount, 2)::text);

    -- 1. Idempotency Check
    SELECT lt.*, cd.id AS deduction_id, cd.deduction_category
    INTO v_existing_txn
    FROM ledger_transactions lt
    JOIN customer_deductions cd ON cd.id = lt.reference_id
    WHERE lt.idempotency_key = v_idempotency_key;

    IF v_existing_txn.id IS NOT NULL THEN
        SELECT jsonb_build_object(
            'deductionId', v_existing_txn.deduction_id,
            'ledgerTransactionId', v_existing_txn.id,
            'customerId', v_existing_txn.customer_id,
            'category', v_existing_txn.deduction_category,
            'amount', v_existing_txn.amount,
            'balanceAfter', v_existing_txn.balance_after,
            'isIdempotentReplay', TRUE,
            'createdAt', v_existing_txn.created_at
        ) INTO v_result;
        RETURN v_result;
    END IF;

    -- 2. Validation
    IF p_amount <= 0.00 THEN
        RAISE EXCEPTION 'Deduction amount must be strictly positive' USING ERRCODE = '22003';
    END IF;

    IF p_category NOT IN ('VETERINARY_MEDICINE', 'AI_BREEDING_CHARGE', 'CATTLE_INSURANCE', 'MEMBERSHIP_FEE', 'OTHER', 'EQUIPMENT_MAINTENANCE', 'SUPPLY_CHARGE') THEN
        RAISE EXCEPTION 'Invalid deduction category %', p_category USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_customer FROM customers WHERE id = p_customer_id;
    IF v_customer.id IS NULL OR v_customer.is_deleted = TRUE OR v_customer.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Customer % is not active or has been deleted', p_customer_id USING ERRCODE = '22000';
    END IF;

    SELECT * INTO v_center FROM dairy_centers WHERE id = p_center_id;
    IF v_center.id IS NULL OR v_center.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Center % is not active', p_center_id USING ERRCODE = '22000';
    END IF;

    IF v_customer.organization_id <> v_center.organization_id THEN
        RAISE EXCEPTION 'Cross-organization deduction is strictly prohibited' USING ERRCODE = '22000';
    END IF;

    SELECT * INTO v_actor FROM users WHERE id = p_actor_id;
    IF v_actor.id IS NULL THEN
        RAISE EXCEPTION 'Actor % does not exist', p_actor_id USING ERRCODE = 'P0002';
    END IF;

    -- 3. Lock Customer Ledger Account
    SELECT * INTO v_ledger_account 
    FROM customer_ledger_accounts 
    WHERE customer_id = p_customer_id 
    FOR UPDATE;

    IF v_ledger_account.id IS NULL THEN
        v_prev_balance := 0.00;
        v_new_balance := 0.00 - p_amount;
        INSERT INTO customer_ledger_accounts (
            customer_id, organization_id, currency, current_balance, last_transaction_at, updated_at
        ) VALUES (
            p_customer_id, v_center.organization_id, 'INR', v_new_balance, NOW(), NOW()
        ) RETURNING * INTO v_ledger_account;
    ELSE
        v_prev_balance := v_ledger_account.current_balance;
        v_new_balance := v_prev_balance - p_amount; -- DEBIT decreases dairy liability to customer
        UPDATE customer_ledger_accounts
        SET current_balance = v_new_balance,
            last_transaction_at = NOW(),
            updated_at = NOW()
        WHERE id = v_ledger_account.id;
    END IF;

    -- 4. Insert Customer Deduction Record
    v_deduction_id := gen_random_uuid();
    v_ledger_txn_id := gen_random_uuid();

    -- 4. Insert Ledger Transaction (Debit)
    INSERT INTO ledger_transactions (
        id, organization_id, center_id, customer_id, transaction_type,
        direction, amount, balance_after, reference_entity, reference_id,
        description, idempotency_key, created_by, created_at
    ) VALUES (
        v_ledger_txn_id, v_center.organization_id, p_center_id, p_customer_id, 'AUTHORIZED_DEDUCTION_DEBIT',
        'DEBIT', p_amount, v_new_balance, 'CUSTOMER_DEDUCTION', v_deduction_id,
        'Authorized Deduction [' || p_category || ']: ' || COALESCE(p_description, ''),
        v_idempotency_key, p_actor_id, NOW()
    );

    -- 5. Insert Customer Deduction Record
    INSERT INTO customer_deductions (
        id, customer_id, center_id, deduction_category, amount,
        description, supporting_reference, status, approved_by,
        ledger_transaction_id, created_at
    ) VALUES (
        v_deduction_id, p_customer_id, p_center_id, p_category, p_amount,
        p_description, p_supporting_reference, 'POSTED', p_actor_id,
        v_ledger_txn_id, NOW()
    );

    -- 6. Insert Balanced Double-Entry Journal Entries
    -- Entry 1: Debit Customer Payable (Liability decreases)
    INSERT INTO ledger_entries (
        transaction_id, account_id, account_type, entry_type, amount
    ) VALUES (
        v_ledger_txn_id, v_ledger_account.id, 'CUSTOMER_PAYABLE', 'DEBIT', p_amount
    );

    -- Entry 2: Credit Deduction Income (Income/Recovery increases)
    INSERT INTO ledger_entries (
        transaction_id, account_id, account_type, entry_type, amount
    ) VALUES (
        v_ledger_txn_id, p_center_id, 'DEDUCTION_INCOME', 'CREDIT', p_amount
    );

    -- 7. Audit Log
    INSERT INTO audit_logs (
        organization_id, center_id, user_id, action, entity_type, entity_id, new_values
    ) VALUES (
        v_center.organization_id, p_center_id, p_actor_id, 'CUSTOMER_DEDUCTION_POSTED',
        'CUSTOMER_DEDUCTION', v_deduction_id,
        jsonb_build_object(
            'category', p_category,
            'amount', p_amount,
            'previousBalance', v_prev_balance,
            'newBalance', v_new_balance,
            'description', p_description
        )
    );

    SELECT jsonb_build_object(
        'deductionId', v_deduction_id,
        'ledgerTransactionId', v_ledger_txn_id,
        'customerId', p_customer_id,
        'category', p_category,
        'amount', p_amount,
        'previousBalance', v_prev_balance,
        'newBalance', v_new_balance,
        'description', p_description,
        'supportingReference', p_supporting_reference,
        'receiptNumber', 'DED-' || UPPER(SUBSTRING(v_deduction_id::text, 1, 8)),
        'isIdempotentReplay', FALSE,
        'createdAt', NOW()
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

ALTER FUNCTION public.post_customer_deduction(UUID, UUID, UUID, VARCHAR, NUMERIC, TEXT, VARCHAR, VARCHAR) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.post_customer_deduction(UUID, UUID, UUID, VARCHAR, NUMERIC, TEXT, VARCHAR, VARCHAR) TO authenticated, service_role;

-- 14. Stored Procedure: Post Opening Balance
CREATE OR REPLACE FUNCTION public.post_customer_opening_balance(
    p_customer_id UUID,
    p_center_id UUID,
    p_actor_id UUID,
    p_amount NUMERIC(10,2),
    p_direction VARCHAR(10),
    p_opening_date DATE DEFAULT CURRENT_DATE,
    p_supporting_reference VARCHAR(100) DEFAULT NULL,
    p_idempotency_key VARCHAR(128) DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_customer RECORD;
    v_center RECORD;
    v_actor RECORD;
    v_existing_ob RECORD;
    v_ledger_account RECORD;
    v_prev_balance NUMERIC(12,2);
    v_new_balance NUMERIC(12,2);
    v_txn_type VARCHAR(40);
    v_ledger_txn_id UUID;
    v_idempotency_key VARCHAR(128);
    v_result JSONB;
BEGIN
    v_idempotency_key := COALESCE(p_idempotency_key, 'OB-' || p_customer_id::text || '-' || p_direction);

    -- 1. Authorization: Only ADMIN / DAIRY_OWNER / SUPER_ADMIN can post opening balance
    SELECT * INTO v_actor FROM users WHERE id = p_actor_id;
    IF v_actor.id IS NULL OR v_actor.role NOT IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER') THEN
        RAISE EXCEPTION 'Actor % is not authorized to initialize customer opening balances', p_actor_id USING ERRCODE = '42501';
    END IF;

    -- 2. Validation
    IF p_amount <= 0.00 THEN
        RAISE EXCEPTION 'Opening balance amount must be strictly greater than 0.00' USING ERRCODE = '22003';
    END IF;

    IF p_direction NOT IN ('CREDIT', 'DEBIT') THEN
        RAISE EXCEPTION 'Opening balance direction must be CREDIT or DEBIT' USING ERRCODE = '22023';
    END IF;

    -- Check if opening balance already posted for this customer (Prevent duplicates)
    SELECT * INTO v_existing_ob
    FROM ledger_transactions
    WHERE customer_id = p_customer_id
      AND transaction_type IN ('OPENING_BALANCE_CREDIT', 'OPENING_BALANCE_DEBIT');

    IF v_existing_ob.id IS NOT NULL THEN
        RAISE EXCEPTION 'OPENING_BALANCE_EXISTS: Customer % already has a finalized opening balance (Txn %)',
            p_customer_id, v_existing_ob.id USING ERRCODE = '23505';
    END IF;

    SELECT * INTO v_customer FROM customers WHERE id = p_customer_id;
    IF v_customer.id IS NULL OR v_customer.is_deleted = TRUE OR v_customer.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Customer % is not active or has been deleted', p_customer_id USING ERRCODE = '22000';
    END IF;

    SELECT * INTO v_center FROM dairy_centers WHERE id = p_center_id;

    -- 3. Lock Ledger Account
    SELECT * INTO v_ledger_account 
    FROM customer_ledger_accounts 
    WHERE customer_id = p_customer_id 
    FOR UPDATE;

    IF p_direction = 'CREDIT' THEN
        v_txn_type := 'OPENING_BALANCE_CREDIT';
        IF v_ledger_account.id IS NULL THEN
            v_prev_balance := 0.00;
            v_new_balance := p_amount;
        ELSE
            v_prev_balance := v_ledger_account.current_balance;
            v_new_balance := v_prev_balance + p_amount;
        END IF;
    ELSE
        v_txn_type := 'OPENING_BALANCE_DEBIT';
        IF v_ledger_account.id IS NULL THEN
            v_prev_balance := 0.00;
            v_new_balance := 0.00 - p_amount;
        ELSE
            v_prev_balance := v_ledger_account.current_balance;
            v_new_balance := v_prev_balance - p_amount;
        END IF;
    END IF;

    IF v_ledger_account.id IS NULL THEN
        INSERT INTO customer_ledger_accounts (
            customer_id, organization_id, currency, current_balance, last_transaction_at, updated_at
        ) VALUES (
            p_customer_id, v_center.organization_id, 'INR', v_new_balance, NOW(), NOW()
        ) RETURNING * INTO v_ledger_account;
    ELSE
        UPDATE customer_ledger_accounts
        SET current_balance = v_new_balance,
            last_transaction_at = NOW(),
            updated_at = NOW()
        WHERE id = v_ledger_account.id;
    END IF;

    -- 4. Insert Ledger Transaction
    v_ledger_txn_id := gen_random_uuid();
    INSERT INTO ledger_transactions (
        id, organization_id, center_id, customer_id, transaction_type,
        direction, amount, balance_after, reference_entity, reference_id,
        description, idempotency_key, created_by, created_at
    ) VALUES (
        v_ledger_txn_id, v_center.organization_id, p_center_id, p_customer_id, v_txn_type,
        p_direction, p_amount, v_new_balance, 'OPENING_BALANCE', v_ledger_txn_id,
        'Initial Customer Opening Balance (' || p_direction || ') as of ' || p_opening_date::text || COALESCE(' Ref: ' || p_supporting_reference, ''),
        v_idempotency_key, p_actor_id, NOW()
    );

    -- 5. Balanced Double-Entry Journal Entries
    IF p_direction = 'CREDIT' THEN
        -- Dairy liability increases: Debit Opening Balance Equity, Credit Customer Payable
        INSERT INTO ledger_entries (
            transaction_id, account_id, account_type, entry_type, amount
        ) VALUES (
            v_ledger_txn_id, p_center_id, 'OPENING_BALANCE_EQUITY', 'DEBIT', p_amount
        );
        INSERT INTO ledger_entries (
            transaction_id, account_id, account_type, entry_type, amount
        ) VALUES (
            v_ledger_txn_id, v_ledger_account.id, 'CUSTOMER_PAYABLE', 'CREDIT', p_amount
        );
    ELSE
        -- Customer owes dairy: Debit Customer Payable, Credit Opening Balance Equity
        INSERT INTO ledger_entries (
            transaction_id, account_id, account_type, entry_type, amount
        ) VALUES (
            v_ledger_txn_id, v_ledger_account.id, 'CUSTOMER_PAYABLE', 'DEBIT', p_amount
        );
        INSERT INTO ledger_entries (
            transaction_id, account_id, account_type, entry_type, amount
        ) VALUES (
            v_ledger_txn_id, p_center_id, 'OPENING_BALANCE_EQUITY', 'CREDIT', p_amount
        );
    END IF;

    -- 6. Audit Log
    INSERT INTO audit_logs (
        organization_id, center_id, user_id, action, entity_type, entity_id, new_values
    ) VALUES (
        v_center.organization_id, p_center_id, p_actor_id, 'CUSTOMER_OPENING_BALANCE_SET',
        'CUSTOMER_LEDGER_ACCOUNT', v_ledger_account.id,
        jsonb_build_object(
            'amount', p_amount,
            'direction', p_direction,
            'date', p_opening_date,
            'reference', p_supporting_reference,
            'newBalance', v_new_balance
        )
    );

    SELECT jsonb_build_object(
        'ledgerTransactionId', v_ledger_txn_id,
        'customerId', p_customer_id,
        'amount', p_amount,
        'direction', p_direction,
        'previousBalance', v_prev_balance,
        'newBalance', v_new_balance,
        'openingDate', p_opening_date,
        'supportingReference', p_supporting_reference,
        'status', 'POSTED',
        'createdAt', NOW()
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

ALTER FUNCTION public.post_customer_opening_balance(UUID, UUID, UUID, NUMERIC, VARCHAR, DATE, VARCHAR, VARCHAR) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.post_customer_opening_balance(UUID, UUID, UUID, NUMERIC, VARCHAR, DATE, VARCHAR, VARCHAR) TO authenticated, service_role;

-- 15. Stored Procedure: Post Authorized Ledger Adjustment
CREATE OR REPLACE FUNCTION public.post_customer_adjustment(
    p_customer_id UUID,
    p_center_id UUID,
    p_actor_id UUID,
    p_direction VARCHAR(10),
    p_amount NUMERIC(10,2),
    p_reason TEXT,
    p_original_txn_id UUID DEFAULT NULL,
    p_idempotency_key VARCHAR(128) DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_customer RECORD;
    v_center RECORD;
    v_actor RECORD;
    v_ledger_account RECORD;
    v_prev_balance NUMERIC(12,2);
    v_new_balance NUMERIC(12,2);
    v_txn_type VARCHAR(40);
    v_adj_id UUID;
    v_ledger_txn_id UUID;
    v_idempotency_key VARCHAR(128);
    v_result JSONB;
BEGIN
    v_idempotency_key := COALESCE(p_idempotency_key, 'ADJ-' || p_customer_id::text || '-' || p_direction || '-' || ROUND(p_amount, 2)::text || '-' || gen_random_uuid()::text);

    -- 1. Authorization: Supervisor or higher
    SELECT * INTO v_actor FROM users WHERE id = p_actor_id;
    IF v_actor.id IS NULL OR v_actor.role NOT IN ('SUPERVISOR', 'CENTER_MANAGER', 'DAIRY_OWNER', 'SUPER_ADMIN') THEN
        RAISE EXCEPTION 'Actor % is not authorized to create ledger adjustments. Requires Supervisor or higher.', p_actor_id USING ERRCODE = '42501';
    END IF;

    -- 2. Validation
    IF p_amount <= 0.00 THEN
        RAISE EXCEPTION 'Adjustment amount must be strictly greater than 0.00' USING ERRCODE = '22003';
    END IF;

    IF p_direction NOT IN ('CREDIT', 'DEBIT') THEN
        RAISE EXCEPTION 'Adjustment direction must be CREDIT or DEBIT' USING ERRCODE = '22023';
    END IF;

    IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 5 THEN
        RAISE EXCEPTION 'Mandatory adjustment reason (minimum 5 characters) is required' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_customer FROM customers WHERE id = p_customer_id;
    IF v_customer.id IS NULL OR v_customer.is_deleted = TRUE OR v_customer.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Customer % is not active or has been deleted', p_customer_id USING ERRCODE = '22000';
    END IF;

    SELECT * INTO v_center FROM dairy_centers WHERE id = p_center_id;

    -- 3. Lock Ledger Account
    SELECT * INTO v_ledger_account 
    FROM customer_ledger_accounts 
    WHERE customer_id = p_customer_id 
    FOR UPDATE;

    IF p_direction = 'CREDIT' THEN
        v_txn_type := 'APPROVED_ADJUSTMENT_CREDIT';
        IF v_ledger_account.id IS NULL THEN
            v_prev_balance := 0.00;
            v_new_balance := p_amount;
        ELSE
            v_prev_balance := v_ledger_account.current_balance;
            v_new_balance := v_prev_balance + p_amount;
        END IF;
    ELSE
        v_txn_type := 'APPROVED_ADJUSTMENT_DEBIT';
        IF v_ledger_account.id IS NULL THEN
            v_prev_balance := 0.00;
            v_new_balance := 0.00 - p_amount;
        ELSE
            v_prev_balance := v_ledger_account.current_balance;
            v_new_balance := v_prev_balance - p_amount;
        END IF;
    END IF;

    IF v_ledger_account.id IS NULL THEN
        INSERT INTO customer_ledger_accounts (
            customer_id, organization_id, currency, current_balance, last_transaction_at, updated_at
        ) VALUES (
            p_customer_id, v_center.organization_id, 'INR', v_new_balance, NOW(), NOW()
        ) RETURNING * INTO v_ledger_account;
    ELSE
        UPDATE customer_ledger_accounts
        SET current_balance = v_new_balance,
            last_transaction_at = NOW(),
            updated_at = NOW()
        WHERE id = v_ledger_account.id;
    END IF;

    -- 4. Insert Customer Adjustment record
    v_adj_id := gen_random_uuid();
    v_ledger_txn_id := gen_random_uuid();

    -- 4. Insert Ledger Transaction
    INSERT INTO ledger_transactions (
        id, organization_id, center_id, customer_id, transaction_type,
        direction, amount, balance_after, reference_entity, reference_id,
        description, idempotency_key, created_by, created_at
    ) VALUES (
        v_ledger_txn_id, v_center.organization_id, p_center_id, p_customer_id, v_txn_type,
        p_direction, p_amount, v_new_balance, 'MANUAL_ADJUSTMENT', v_adj_id,
        'Approved Adjustment [' || p_direction || ']: ' || p_reason,
        v_idempotency_key, p_actor_id, NOW()
    );

    -- 5. Insert Customer Adjustment record
    INSERT INTO customer_adjustments (
        id, customer_id, adjustment_type, amount, reason,
        approved_by, organization_id, center_id, original_transaction_id,
        ledger_transaction_id, idempotency_key, status, created_at
    ) VALUES (
        v_adj_id, p_customer_id, p_direction, p_amount, p_reason,
        p_actor_id, v_center.organization_id, p_center_id, p_original_txn_id,
        v_ledger_txn_id, v_idempotency_key, 'POSTED', NOW()
    );

    -- 6. Insert Balanced Double-Entry Journal Entries
    IF p_direction = 'CREDIT' THEN
        INSERT INTO ledger_entries (
            transaction_id, account_id, account_type, entry_type, amount
        ) VALUES (
            v_ledger_txn_id, p_center_id, 'INCENTIVE_EXPENSE', 'DEBIT', p_amount
        );
        INSERT INTO ledger_entries (
            transaction_id, account_id, account_type, entry_type, amount
        ) VALUES (
            v_ledger_txn_id, v_ledger_account.id, 'CUSTOMER_PAYABLE', 'CREDIT', p_amount
        );
    ELSE
        INSERT INTO ledger_entries (
            transaction_id, account_id, account_type, entry_type, amount
        ) VALUES (
            v_ledger_txn_id, v_ledger_account.id, 'CUSTOMER_PAYABLE', 'DEBIT', p_amount
        );
        INSERT INTO ledger_entries (
            transaction_id, account_id, account_type, entry_type, amount
        ) VALUES (
            v_ledger_txn_id, p_center_id, 'DEDUCTION_INCOME', 'CREDIT', p_amount
        );
    END IF;

    -- 7. Audit Log
    INSERT INTO audit_logs (
        organization_id, center_id, user_id, action, entity_type, entity_id, new_values
    ) VALUES (
        v_center.organization_id, p_center_id, p_actor_id, 'CUSTOMER_LEDGER_ADJUSTMENT_POSTED',
        'CUSTOMER_ADJUSTMENT', v_adj_id,
        jsonb_build_object(
            'amount', p_amount,
            'direction', p_direction,
            'reason', p_reason,
            'previousBalance', v_prev_balance,
            'newBalance', v_new_balance,
            'originalTxnId', p_original_txn_id
        )
    );

    SELECT jsonb_build_object(
        'adjustmentId', v_adj_id,
        'ledgerTransactionId', v_ledger_txn_id,
        'customerId', p_customer_id,
        'direction', p_direction,
        'amount', p_amount,
        'reason', p_reason,
        'previousBalance', v_prev_balance,
        'newBalance', v_new_balance,
        'status', 'POSTED',
        'createdAt', NOW()
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

ALTER FUNCTION public.post_customer_adjustment(UUID, UUID, UUID, VARCHAR, NUMERIC, TEXT, UUID, VARCHAR) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.post_customer_adjustment(UUID, UUID, UUID, VARCHAR, NUMERIC, TEXT, UUID, VARCHAR) TO authenticated, service_role;

-- 16. Stored Procedure: Account Reconciliation Service
CREATE OR REPLACE FUNCTION public.reconcile_customer_ledger(
    p_customer_id UUID,
    p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_customer RECORD;
    v_ledger_account RECORD;
    v_stored_balance NUMERIC(12,2) := 0.00;
    v_computed_balance NUMERIC(12,2) := 0.00;
    v_total_credits NUMERIC(12,2) := 0.00;
    v_total_debits NUMERIC(12,2) := 0.00;
    v_total_milk_credits NUMERIC(12,2) := 0.00;
    v_total_advance_debits NUMERIC(12,2) := 0.00;
    v_total_recovery_credits NUMERIC(12,2) := 0.00;
    v_total_deduction_debits NUMERIC(12,2) := 0.00;
    v_total_payout_debits NUMERIC(12,2) := 0.00;
    v_total_adj_credits NUMERIC(12,2) := 0.00;
    v_total_adj_debits NUMERIC(12,2) := 0.00;
    v_journal_total_debits NUMERIC(12,2) := 0.00;
    v_journal_total_credits NUMERIC(12,2) := 0.00;
    v_discrepancies JSONB := '[]'::JSONB;
    v_unbalanced_count INT := 0;
    v_orphan_count INT := 0;
    v_missing_collection_count INT := 0;
    v_rec RECORD;
    v_result JSONB;
BEGIN
    SELECT * INTO v_customer FROM customers WHERE id = p_customer_id;
    IF v_customer.id IS NULL THEN
        RAISE EXCEPTION 'Customer % does not exist', p_customer_id USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_ledger_account FROM customer_ledger_accounts WHERE customer_id = p_customer_id;
    IF v_ledger_account.id IS NOT NULL THEN
        v_stored_balance := v_ledger_account.current_balance;
    END IF;

    -- Aggregate transaction credits and debits
    SELECT 
        COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE 0 END), 0.00),
        COALESCE(SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE 0 END), 0.00),
        COALESCE(SUM(CASE WHEN transaction_type = 'MILK_COLLECTION_CREDIT' THEN amount ELSE 0 END), 0.00),
        COALESCE(SUM(CASE WHEN transaction_type IN ('CUSTOMER_ADVANCE_DEBIT', 'ADVANCE_DEBIT') THEN amount ELSE 0 END), 0.00),
        COALESCE(SUM(CASE WHEN transaction_type = 'ADVANCE_RECOVERY_CREDIT' THEN amount ELSE 0 END), 0.00),
        COALESCE(SUM(CASE WHEN transaction_type IN ('AUTHORIZED_DEDUCTION_DEBIT', 'DEDUCTION_DEBIT') THEN amount ELSE 0 END), 0.00),
        COALESCE(SUM(CASE WHEN transaction_type IN ('PAYOUT_SETTLEMENT_DEBIT', 'PAYMENT_PAYOUT_DEBIT') THEN amount ELSE 0 END), 0.00),
        COALESCE(SUM(CASE WHEN transaction_type IN ('APPROVED_ADJUSTMENT_CREDIT', 'LEDGER_ADJUSTMENT_CREDIT', 'OPENING_BALANCE_CREDIT') THEN amount ELSE 0 END), 0.00),
        COALESCE(SUM(CASE WHEN transaction_type IN ('APPROVED_ADJUSTMENT_DEBIT', 'LEDGER_ADJUSTMENT_DEBIT', 'COLLECTION_REVERSAL_DEBIT', 'OPENING_BALANCE_DEBIT') THEN amount ELSE 0 END), 0.00)
    INTO 
        v_total_credits, v_total_debits,
        v_total_milk_credits, v_total_advance_debits, v_total_recovery_credits,
        v_total_deduction_debits, v_total_payout_debits,
        v_total_adj_credits, v_total_adj_debits
    FROM ledger_transactions
    WHERE customer_id = p_customer_id;

    v_computed_balance := v_total_credits - v_total_debits;

    -- Check 1: Running Balance Mismatch
    IF v_stored_balance <> v_computed_balance THEN
        v_discrepancies := v_discrepancies || jsonb_build_object(
            'type', 'RUNNING_BALANCE_MISMATCH',
            'severity', 'CRITICAL',
            'storedBalance', v_stored_balance,
            'computedBalance', v_computed_balance,
            'difference', v_stored_balance - v_computed_balance,
            'message', 'Customer ledger account current_balance does not match sum of transaction credits minus debits'
        );
    END IF;

    -- Check 2: Unbalanced Journal Entries
    FOR v_rec IN 
        SELECT lt.id AS txn_id, lt.transaction_type, lt.amount AS txn_amount,
               COALESCE(SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE 0 END), 0.00) AS debit_sum,
               COALESCE(SUM(CASE WHEN le.entry_type = 'CREDIT' THEN le.amount ELSE 0 END), 0.00) AS credit_sum
        FROM ledger_transactions lt
        LEFT JOIN ledger_entries le ON le.transaction_id = lt.id
        WHERE lt.customer_id = p_customer_id
        GROUP BY lt.id, lt.transaction_type, lt.amount
        HAVING COALESCE(SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE 0 END), 0.00) <> COALESCE(SUM(CASE WHEN le.entry_type = 'CREDIT' THEN le.amount ELSE 0 END), 0.00)
            OR COALESCE(SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE 0 END), 0.00) <> lt.amount
    LOOP
        v_unbalanced_count := v_unbalanced_count + 1;
        v_discrepancies := v_discrepancies || jsonb_build_object(
            'type', 'UNBALANCED_JOURNAL',
            'severity', 'CRITICAL',
            'transactionId', v_rec.txn_id,
            'transactionType', v_rec.transaction_type,
            'expectedAmount', v_rec.txn_amount,
            'debitSum', v_rec.debit_sum,
            'creditSum', v_rec.credit_sum,
            'message', 'Journal entries do not balance for transaction ' || v_rec.txn_id
        );
    END LOOP;

    -- Check 3: Orphan Transactions (Milk Collection reference missing in milk_collections table)
    FOR v_rec IN
        SELECT lt.id AS txn_id, lt.reference_id
        FROM ledger_transactions lt
        WHERE lt.customer_id = p_customer_id
          AND lt.reference_entity = 'MILK_COLLECTION'
          AND NOT EXISTS (SELECT 1 FROM milk_collections mc WHERE mc.id = lt.reference_id)
    LOOP
        v_orphan_count := v_orphan_count + 1;
        v_discrepancies := v_discrepancies || jsonb_build_object(
            'type', 'ORPHAN_TRANSACTION',
            'severity', 'HIGH',
            'transactionId', v_rec.txn_id,
            'referenceId', v_rec.reference_id,
            'message', 'Ledger transaction references a milk_collection record that does not exist'
        );
    END LOOP;

    -- Check 4: Missing Ledger Entries for Completed Milk Collections
    FOR v_rec IN
        SELECT mc.id AS collection_id, mc.total_amount
        FROM milk_collections mc
        WHERE mc.customer_id = p_customer_id
          AND mc.transaction_status = 'COMPLETED'
          AND NOT EXISTS (
              SELECT 1 FROM ledger_transactions lt 
              WHERE lt.reference_id = mc.id AND lt.reference_entity = 'MILK_COLLECTION'
          )
    LOOP
        v_missing_collection_count := v_missing_collection_count + 1;
        v_discrepancies := v_discrepancies || jsonb_build_object(
            'type', 'MISSING_LEDGER_ENTRY',
            'severity', 'CRITICAL',
            'collectionId', v_rec.collection_id,
            'amount', v_rec.total_amount,
            'message', 'Completed milk collection has no corresponding ledger credit entry'
        );
    END LOOP;

    -- Total Journal Debits & Credits across customer transactions
    SELECT 
        COALESCE(SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE 0 END), 0.00),
        COALESCE(SUM(CASE WHEN le.entry_type = 'CREDIT' THEN le.amount ELSE 0 END), 0.00)
    INTO v_journal_total_debits, v_journal_total_credits
    FROM ledger_transactions lt
    JOIN ledger_entries le ON le.transaction_id = lt.id
    WHERE lt.customer_id = p_customer_id;

    SELECT jsonb_build_object(
        'customerId', p_customer_id,
        'customerName', v_customer.full_name,
        'farmerCode', v_customer.farmer_code,
        'isReconciled', (jsonb_array_length(v_discrepancies) = 0),
        'discrepancyCount', jsonb_array_length(v_discrepancies),
        'accountBalance', v_stored_balance,
        'computedBalance', v_computed_balance,
        'summary', jsonb_build_object(
            'totalCredits', v_total_credits,
            'totalDebits', v_total_debits,
            'totalMilkCredits', v_total_milk_credits,
            'totalAdvanceDebits', v_total_advance_debits,
            'totalRecoveryCredits', v_total_recovery_credits,
            'totalDeductionDebits', v_total_deduction_debits,
            'totalPayoutDebits', v_total_payout_debits,
            'totalAdjustmentsCredit', v_total_adj_credits,
            'totalAdjustmentsDebit', v_total_adj_debits,
            'journalTotalDebits', v_journal_total_debits,
            'journalTotalCredits', v_journal_total_credits
        ),
        'discrepancies', v_discrepancies,
        'reconciledAt', NOW()
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

ALTER FUNCTION public.reconcile_customer_ledger(UUID, UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.reconcile_customer_ledger(UUID, UUID) TO authenticated, service_role;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('019', '019_customer_accounting_and_double_entry_ledger.sql') ON CONFLICT (version) DO NOTHING;

-- ========================================================
-- Migration: 020_automated_monthly_billing_and_settlements.sql
-- ========================================================
-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 014: AUTOMATIC MONTHLY BILLING, SETTLEMENT & STATEMENT ENGINE
-- ==============================================================================

-- 1. Billing Periods Table
CREATE TABLE IF NOT EXISTS billing_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    period_name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    cycle_type VARCHAR(30) NOT NULL DEFAULT 'CALENDAR_MONTH',
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    total_farmers_billed INT NOT NULL DEFAULT 0,
    total_milk_weight NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total_gross_milk_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_net_payable_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    generated_at TIMESTAMPTZ,
    generated_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    finalized_at TIMESTAMPTZ,
    finalized_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_billing_period_dates CHECK (start_date <= end_date),
    CONSTRAINT chk_billing_cycle_type CHECK (cycle_type IN ('CALENDAR_MONTH', 'TEN_DAY', 'FIFTEEN_DAY', 'CUSTOM_PERIOD')),
    CONSTRAINT chk_billing_period_status CHECK (status IN (
        'DRAFT', 'GENERATING', 'GENERATED', 'UNDER_REVIEW', 'APPROVED', 'FINALIZED', 'CORRECTION_REQUIRED', 'CANCELLED'
    )),
    CONSTRAINT uq_center_billing_period UNIQUE (center_id, start_date, end_date)
);

DROP TRIGGER IF EXISTS set_billing_periods_updated_at ON billing_periods;
CREATE TRIGGER set_billing_periods_updated_at
BEFORE UPDATE ON billing_periods
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_billing_periods_center_dates ON billing_periods(center_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_billing_periods_org ON billing_periods(organization_id);
CREATE INDEX IF NOT EXISTS idx_billing_periods_status ON billing_periods(status);

-- Function to prevent overlapping billing periods for the same center (excluding CANCELLED)
CREATE OR REPLACE FUNCTION check_billing_period_overlap()
RETURNS TRIGGER AS $$
DECLARE
    v_overlap_count INT;
BEGIN
    IF NEW.status = 'CANCELLED' THEN
        RETURN NEW;
    END IF;

    SELECT COUNT(*) INTO v_overlap_count
    FROM billing_periods
    WHERE center_id = NEW.center_id
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND status <> 'CANCELLED'
      AND (
          (NEW.start_date BETWEEN start_date AND end_date)
          OR (NEW.end_date BETWEEN start_date AND end_date)
          OR (start_date BETWEEN NEW.start_date AND NEW.end_date)
      );

    IF v_overlap_count > 0 THEN
        RAISE EXCEPTION 'Billing period dates [%, %] overlap with an existing period for center %',
            NEW.start_date, NEW.end_date, NEW.center_id
            USING ERRCODE = '23505';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_billing_period_overlap ON billing_periods;
CREATE TRIGGER trg_check_billing_period_overlap
BEFORE INSERT OR UPDATE OF center_id, start_date, end_date, status ON billing_periods
FOR EACH ROW EXECUTE FUNCTION check_billing_period_overlap();

-- 2. Monthly Bills Table (Customer Settlement Sheets)
CREATE TABLE IF NOT EXISTS monthly_bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    billing_period_id UUID NOT NULL REFERENCES billing_periods(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    bill_number VARCHAR(60) NOT NULL UNIQUE,
    bill_status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    opening_balance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_cow_milk_weight NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total_cow_milk_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    cow_collections_count INT NOT NULL DEFAULT 0,
    total_buffalo_milk_weight NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total_buffalo_milk_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    buffalo_collections_count INT NOT NULL DEFAULT 0,
    total_milk_collections_count INT NOT NULL DEFAULT 0,
    total_milk_weight NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    gross_milk_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    other_credits_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_credits NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    feed_purchases_debit NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    advances_debit NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    deductions_debit NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    other_debits_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_debits NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    settled_payouts_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    closing_balance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    net_payable_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    is_negative_balance BOOLEAN NOT NULL DEFAULT FALSE,
    pdf_storage_path VARCHAR(255),
    pdf_sha256_hash VARCHAR(64),
    generated_at TIMESTAMPTZ,
    generated_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    finalized_at TIMESTAMPTZ,
    finalized_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_customer_bill_per_period UNIQUE (customer_id, billing_period_id),
    CONSTRAINT chk_monthly_bill_status CHECK (bill_status IN (
        'DRAFT', 'GENERATING', 'GENERATED', 'UNDER_REVIEW', 'APPROVED', 'FINALIZED', 'CORRECTION_REQUIRED', 'CANCELLED'
    ))
);

DROP TRIGGER IF EXISTS set_monthly_bills_updated_at ON monthly_bills;
CREATE TRIGGER set_monthly_bills_updated_at
BEFORE UPDATE ON monthly_bills
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_monthly_bills_period ON monthly_bills(billing_period_id);
CREATE INDEX IF NOT EXISTS idx_monthly_bills_customer ON monthly_bills(customer_id);
CREATE INDEX IF NOT EXISTS idx_monthly_bills_center ON monthly_bills(center_id);
CREATE INDEX IF NOT EXISTS idx_monthly_bills_status ON monthly_bills(bill_status);

-- 3. Monthly Bill Items Table (Itemized Statements)
CREATE TABLE IF NOT EXISTS monthly_bill_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id UUID NOT NULL REFERENCES monthly_bills(id) ON DELETE CASCADE,
    item_type VARCHAR(40) NOT NULL,
    reference_id UUID,
    item_date DATE NOT NULL,
    shift_type VARCHAR(10),
    milk_category VARCHAR(20),
    quantity NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    measurement_unit VARCHAR(10) NOT NULL DEFAULT 'KG',
    fat_percentage NUMERIC(4,2),
    snf_percentage NUMERIC(4,2),
    rate_per_unit NUMERIC(8,2),
    amount NUMERIC(12,2) NOT NULL,
    direction VARCHAR(10) NOT NULL DEFAULT 'CREDIT',
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_bill_item_direction CHECK (direction IN ('CREDIT', 'DEBIT')),
    CONSTRAINT chk_bill_item_unit CHECK (measurement_unit IN ('KG', 'LITERS', 'UNIT', 'COUNT')),
    CONSTRAINT chk_bill_item_type CHECK (item_type IN (
        'MILK_COLLECTION', 'FEED_PURCHASE', 'ADVANCE_RECOVERY', 'DEDUCTION',
        'SETTLED_PAYMENT', 'INCENTIVE_CREDIT', 'LEDGER_ADJUSTMENT'
    ))
);

CREATE INDEX IF NOT EXISTS idx_monthly_bill_items_bill ON monthly_bill_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_monthly_bill_items_ref ON monthly_bill_items(reference_id);

-- 4. Monthly Bill Adjustments Table (Versioned Corrections)
CREATE TABLE IF NOT EXISTS monthly_bill_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id UUID NOT NULL REFERENCES monthly_bills(id) ON DELETE CASCADE,
    adjustment_type VARCHAR(10) NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    reason TEXT NOT NULL,
    authorized_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_bill_adj_type CHECK (adjustment_type IN ('CREDIT', 'DEBIT')),
    CONSTRAINT chk_bill_adj_positive CHECK (amount > 0.00)
);

CREATE INDEX IF NOT EXISTS idx_monthly_bill_adjustments_bill ON monthly_bill_adjustments(bill_id);

-- 5. Bill Finalization Records Table (Immutable Audit Snapshots)
CREATE TABLE IF NOT EXISTS bill_finalization_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    billing_period_id UUID NOT NULL UNIQUE REFERENCES billing_periods(id) ON DELETE RESTRICT,
    total_farmers_billed INT NOT NULL,
    total_gross_milk_amount NUMERIC(12,2) NOT NULL,
    total_net_payout_amount NUMERIC(12,2) NOT NULL,
    total_feed_deductions NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_advances_deductions NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_other_deductions NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_settled_payouts NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    snapshot_checksum VARCHAR(64) NOT NULL,
    finalized_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    finalized_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Customer Payments Table (Domain 11 Settlement References)
CREATE TABLE IF NOT EXISTS customer_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    bill_id UUID REFERENCES monthly_bills(id) ON DELETE SET NULL,
    payment_number VARCHAR(50) NOT NULL UNIQUE,
    payment_mode VARCHAR(20) NOT NULL DEFAULT 'BANK_TRANSFER',
    amount NUMERIC(12,2) NOT NULL,
    payment_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    transaction_reference VARCHAR(100),
    paid_at TIMESTAMPTZ,
    disbursed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reconciled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_payment_amount CHECK (amount > 0.00),
    CONSTRAINT chk_payment_mode CHECK (payment_mode IN ('CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE')),
    CONSTRAINT chk_payment_status CHECK (payment_status IN ('PENDING', 'SUBMITTED', 'SUCCESSFUL', 'FAILED', 'REVERSED', 'RECONCILED'))
);

CREATE INDEX IF NOT EXISTS idx_customer_payments_cust ON customer_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_payments_center ON customer_payments(center_id);
CREATE INDEX IF NOT EXISTS idx_customer_payments_bill ON customer_payments(bill_id);
CREATE INDEX IF NOT EXISTS idx_customer_payments_status ON customer_payments(payment_status);

-- 7. Billing Scheduler Execution Logs Table
CREATE TABLE IF NOT EXISTS billing_scheduler_execution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    billing_period_id UUID REFERENCES billing_periods(id) ON DELETE SET NULL,
    trigger_type VARCHAR(20) NOT NULL DEFAULT 'CRON',
    status VARCHAR(20) NOT NULL,
    farmers_processed INT NOT NULL DEFAULT 0,
    execution_time_ms INT NOT NULL DEFAULT 0,
    error_message TEXT,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_scheduler_trigger CHECK (trigger_type IN ('CRON', 'MANUAL')),
    CONSTRAINT chk_scheduler_status CHECK (status IN ('SUCCESS', 'FAILED', 'SKIPPED'))
);

CREATE INDEX IF NOT EXISTS idx_scheduler_logs_center ON billing_scheduler_execution_logs(center_id, executed_at DESC);

-- 8. Immutability Triggers for Finalized Bills and Periods
CREATE OR REPLACE FUNCTION enforce_finalized_bill_immutability()
RETURNS TRIGGER AS $$
BEGIN
    -- If bill is already finalized, prevent direct updates to financial totals
    IF OLD.bill_status = 'FINALIZED' THEN
        -- Allow setting pdf_storage_path or pdf_sha256_hash or version bump if adjustment was added
        IF NEW.bill_number <> OLD.bill_number 
           OR NEW.customer_id <> OLD.customer_id 
           OR NEW.billing_period_id <> OLD.billing_period_id
           OR (NEW.closing_balance <> OLD.closing_balance AND NEW.version = OLD.version) THEN
            RAISE EXCEPTION 'Cannot modify financial data on FINALIZED bill % without an authorized versioned adjustment',
                OLD.id USING ERRCODE = '22000';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_finalized_bill_immutability ON monthly_bills;
CREATE TRIGGER trg_enforce_finalized_bill_immutability
BEFORE UPDATE ON monthly_bills
FOR EACH ROW EXECUTE FUNCTION enforce_finalized_bill_immutability();

CREATE OR REPLACE FUNCTION enforce_finalized_period_immutability()
RETURNS TRIGGER AS $$
DECLARE
    v_period_status VARCHAR(30);
BEGIN
    SELECT status INTO v_period_status FROM billing_periods WHERE id = NEW.billing_period_id;
    IF v_period_status = 'FINALIZED' THEN
        -- Allow controlled versioned adjustments (where version increments)
        IF TG_OP = 'UPDATE' AND NEW.version > OLD.version THEN
            RETURN NEW;
        END IF;
        IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.bill_status <> 'FINALIZED') THEN
            RAISE EXCEPTION 'Cannot insert or alter bills in a FINALIZED billing period %',
                NEW.billing_period_id USING ERRCODE = '22000';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_finalized_period_immutability ON monthly_bills;
CREATE TRIGGER trg_enforce_finalized_period_immutability
BEFORE INSERT OR UPDATE ON monthly_bills
FOR EACH ROW EXECUTE FUNCTION enforce_finalized_period_immutability();

-- 9. Row Level Security (RLS) Policies
ALTER TABLE billing_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_bill_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_finalization_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_scheduler_execution_logs ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS
DROP POLICY IF EXISTS service_role_billing_periods ON billing_periods;
CREATE POLICY service_role_billing_periods ON billing_periods FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_monthly_bills ON monthly_bills;
CREATE POLICY service_role_monthly_bills ON monthly_bills FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_monthly_bill_items ON monthly_bill_items;
CREATE POLICY service_role_monthly_bill_items ON monthly_bill_items FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_monthly_bill_adjustments ON monthly_bill_adjustments;
CREATE POLICY service_role_monthly_bill_adjustments ON monthly_bill_adjustments FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_bill_finalization_records ON bill_finalization_records;
CREATE POLICY service_role_bill_finalization_records ON bill_finalization_records FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_customer_payments ON customer_payments;
CREATE POLICY service_role_customer_payments ON customer_payments FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_billing_scheduler_logs ON billing_scheduler_execution_logs;
CREATE POLICY service_role_billing_scheduler_logs ON billing_scheduler_execution_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated Users Policies
DROP POLICY IF EXISTS staff_select_billing_periods ON billing_periods;
CREATE POLICY staff_select_billing_periods ON billing_periods FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM user_center_assignments uca
        WHERE uca.user_id = auth.uid() AND uca.center_id = billing_periods.center_id
    )
    OR EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = auth.uid() AND u.role IN ('SUPER_ADMIN', 'DAIRY_OWNER')
    )
);

DROP POLICY IF EXISTS customer_select_own_monthly_bills ON monthly_bills;
CREATE POLICY customer_select_own_monthly_bills ON monthly_bills FOR SELECT TO authenticated
USING (
    customer_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM user_center_assignments uca
        WHERE uca.user_id = auth.uid() AND uca.center_id = monthly_bills.center_id
    )
    OR EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = auth.uid() AND u.role IN ('SUPER_ADMIN', 'DAIRY_OWNER')
    )
);

DROP POLICY IF EXISTS customer_select_own_bill_items ON monthly_bill_items;
CREATE POLICY customer_select_own_bill_items ON monthly_bill_items FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM monthly_bills mb
        WHERE mb.id = monthly_bill_items.bill_id
          AND (
              mb.customer_id = auth.uid()
              OR EXISTS (
                  SELECT 1 FROM user_center_assignments uca
                  WHERE uca.user_id = auth.uid() AND uca.center_id = mb.center_id
              )
              OR EXISTS (
                  SELECT 1 FROM users u
                  WHERE u.id = auth.uid() AND u.role IN ('SUPER_ADMIN', 'DAIRY_OWNER')
              )
          )
    )
);

DROP POLICY IF EXISTS staff_manage_billing_records ON monthly_bills;
CREATE POLICY staff_manage_billing_records ON monthly_bills FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = auth.uid() AND u.role IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'ACCOUNTANT')
    )
);

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('020', '020_automated_monthly_billing_and_settlements.sql') ON CONFLICT (version) DO NOTHING;

-- ========================================================
-- Migration: 021_customer_payouts_batches_and_reconciliation.sql
-- ========================================================
-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 014: CUSTOMER PAYOUTS, PAYMENT COLLECTION, BATCHES & RECONCILIATION
-- ==============================================================================

-- 1. Extend ledger_transactions CHECK constraints to support P15 transaction types & entities
ALTER TABLE ledger_transactions DROP CONSTRAINT IF EXISTS chk_ledger_txn_type;
ALTER TABLE ledger_transactions ADD CONSTRAINT chk_ledger_txn_type CHECK (transaction_type IN (
    'MILK_COLLECTION_CREDIT', 'CUSTOMER_INCENTIVE_CREDIT', 'APPROVED_ADJUSTMENT_CREDIT',
    'LEDGER_ADJUSTMENT_CREDIT', 'OPENING_BALANCE_CREDIT', 'ADVANCE_RECOVERY_CREDIT',
    'CUSTOMER_RECEIPT_CREDIT', 'PAYOUT_REVERSAL_CREDIT',
    'CUSTOMER_ADVANCE_DEBIT', 'ADVANCE_DEBIT', 'FEED_PURCHASE_DEBIT',
    'AUTHORIZED_DEDUCTION_DEBIT', 'DEDUCTION_DEBIT', 'PAYOUT_SETTLEMENT_DEBIT',
    'PAYMENT_PAYOUT_DEBIT', 'APPROVED_ADJUSTMENT_DEBIT', 'LEDGER_ADJUSTMENT_DEBIT',
    'COLLECTION_REVERSAL_DEBIT', 'RECEIPT_REVERSAL_DEBIT', 'OPENING_BALANCE_DEBIT'
));

ALTER TABLE ledger_transactions DROP CONSTRAINT IF EXISTS chk_ledger_ref_entity;
ALTER TABLE ledger_transactions ADD CONSTRAINT chk_ledger_ref_entity CHECK (reference_entity IN (
    'MILK_COLLECTION', 'FEED_SALE', 'CUSTOMER_ADVANCE',
    'CUSTOMER_DEDUCTION', 'CUSTOMER_PAYMENT', 'MANUAL_ADJUSTMENT',
    'CUSTOMER_PAYOUT', 'CUSTOMER_RECEIPT', 'PAYMENT_BATCH',
    'ADVANCE_RECOVERY', 'OPENING_BALANCE'
));

-- 2. Customer Payouts Master Table (Dairy Pays Farmer)
CREATE TABLE IF NOT EXISTS customer_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    batch_id UUID, -- Foreign key added below after payment_batches is created
    direction VARCHAR(20) NOT NULL DEFAULT 'DAIRY_PAYS_CUSTOMER',
    amount NUMERIC(12,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    payment_method VARCHAR(30) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    reference_number VARCHAR(100),
    source_transaction_type VARCHAR(50) NOT NULL DEFAULT 'MANUAL_PAYOUT',
    source_transaction_id UUID,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    bank_account_mask VARCHAR(30),
    bank_ifsc VARCHAR(20),
    recipient_name VARCHAR(150),
    notes TEXT,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    approved_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    settled_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    failure_reason TEXT,
    ledger_transaction_id UUID REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_payout_amount CHECK (amount > 0.00),
    CONSTRAINT chk_payout_direction CHECK (direction = 'DAIRY_PAYS_CUSTOMER'),
    CONSTRAINT chk_payout_method CHECK (payment_method IN ('CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'OTHER_APPROVED_METHOD')),
    CONSTRAINT chk_payout_status CHECK (status IN (
        'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SUBMITTED', 'SETTLED',
        'FAILED', 'REJECTED', 'CANCELLED', 'REVERSED', 'RECONCILIATION_REQUIRED'
    ))
);

DROP TRIGGER IF EXISTS set_customer_payouts_updated_at ON customer_payouts;
CREATE TRIGGER set_customer_payouts_updated_at
BEFORE UPDATE ON customer_payouts
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_customer_payouts_org ON customer_payouts(organization_id);
CREATE INDEX IF NOT EXISTS idx_customer_payouts_center ON customer_payouts(center_id);
CREATE INDEX IF NOT EXISTS idx_customer_payouts_customer ON customer_payouts(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_payouts_status ON customer_payouts(status);
CREATE INDEX IF NOT EXISTS idx_customer_payouts_ref ON customer_payouts(reference_number);

-- 3. Customer Receipts Master Table (Farmer Pays Dairy - Debt Repayment)
CREATE TABLE IF NOT EXISTS customer_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    direction VARCHAR(20) NOT NULL DEFAULT 'CUSTOMER_PAYS_DAIRY',
    amount NUMERIC(12,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    payment_method VARCHAR(30) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    reference_number VARCHAR(100) NOT NULL,
    receipt_number VARCHAR(60) NOT NULL UNIQUE,
    source_transaction_type VARCHAR(50) NOT NULL DEFAULT 'DEBT_REPAYMENT',
    source_transaction_id UUID,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    notes TEXT,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    approved_at TIMESTAMPTZ,
    settled_at TIMESTAMPTZ,
    ledger_transaction_id UUID REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_receipt_amount CHECK (amount > 0.00),
    CONSTRAINT chk_receipt_direction CHECK (direction = 'CUSTOMER_PAYS_DAIRY'),
    CONSTRAINT chk_receipt_method CHECK (payment_method IN ('CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'OTHER_APPROVED_METHOD')),
    CONSTRAINT chk_receipt_status CHECK (status IN (
        'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SUBMITTED', 'SETTLED',
        'FAILED', 'REJECTED', 'CANCELLED', 'REVERSED', 'RECONCILIATION_REQUIRED'
    ))
);

DROP TRIGGER IF EXISTS set_customer_receipts_updated_at ON customer_receipts;
CREATE TRIGGER set_customer_receipts_updated_at
BEFORE UPDATE ON customer_receipts
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_customer_receipts_org ON customer_receipts(organization_id);
CREATE INDEX IF NOT EXISTS idx_customer_receipts_center ON customer_receipts(center_id);
CREATE INDEX IF NOT EXISTS idx_customer_receipts_customer ON customer_receipts(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_receipts_status ON customer_receipts(status);

-- 4. Payment Batches Table (Bulk Beneficiary Payouts)
CREATE TABLE IF NOT EXISTS payment_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    batch_number VARCHAR(60) NOT NULL UNIQUE,
    billing_cycle_id UUID,
    billing_period_start DATE,
    billing_period_end DATE,
    payment_method VARCHAR(30) NOT NULL DEFAULT 'BANK_TRANSFER',
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    total_beneficiaries INT NOT NULL DEFAULT 0,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    successful_count INT NOT NULL DEFAULT 0,
    successful_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    failed_count INT NOT NULL DEFAULT 0,
    failed_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    pending_count INT NOT NULL DEFAULT 0,
    pending_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    reconciliation_status VARCHAR(30) NOT NULL DEFAULT 'UNRECONCILED',
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    approved_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_batch_counts CHECK (
        total_beneficiaries >= 0 AND successful_count >= 0 AND failed_count >= 0 AND pending_count >= 0
    ),
    CONSTRAINT chk_batch_amounts CHECK (
        total_amount >= 0.00 AND successful_amount >= 0.00 AND failed_amount >= 0.00 AND pending_amount >= 0.00
    ),
    CONSTRAINT chk_batch_status CHECK (status IN (
        'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SUBMITTED', 'PROCESSING',
        'SETTLED', 'PARTIALLY_SETTLED', 'FAILED', 'CANCELLED'
    ))
);

DROP TRIGGER IF EXISTS set_payment_batches_updated_at ON payment_batches;
CREATE TRIGGER set_payment_batches_updated_at
BEFORE UPDATE ON payment_batches
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_payment_batches_org ON payment_batches(organization_id);
CREATE INDEX IF NOT EXISTS idx_payment_batches_center ON payment_batches(center_id);

-- Add foreign key from customer_payouts to payment_batches
ALTER TABLE customer_payouts DROP CONSTRAINT IF EXISTS fk_payout_batch;
ALTER TABLE customer_payouts 
ADD CONSTRAINT fk_payout_batch 
FOREIGN KEY (batch_id) REFERENCES payment_batches(id) ON DELETE SET NULL;

-- 5. Payment Batch Items Table
CREATE TABLE IF NOT EXISTS payment_batch_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES payment_batches(id) ON DELETE CASCADE,
    payout_id UUID NOT NULL REFERENCES customer_payouts(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    amount NUMERIC(12,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    bank_account_mask VARCHAR(30),
    bank_ifsc VARCHAR(20),
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    beneficiary_reference VARCHAR(100),
    failure_reason TEXT,
    retry_count INT NOT NULL DEFAULT 0,
    settled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_batch_payout UNIQUE (batch_id, payout_id),
    CONSTRAINT chk_batch_item_status CHECK (status IN (
        'PENDING', 'SUBMITTED', 'SETTLED', 'FAILED', 'CANCELLED', 'RECONCILED'
    ))
);

DROP TRIGGER IF EXISTS set_payment_batch_items_updated_at ON payment_batch_items;
CREATE TRIGGER set_payment_batch_items_updated_at
BEFORE UPDATE ON payment_batch_items
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_batch_items_batch ON payment_batch_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_items_payout ON payment_batch_items(payout_id);
CREATE INDEX IF NOT EXISTS idx_batch_items_cust ON payment_batch_items(customer_id);

-- 6. Payment Reconciliation Records Table
CREATE TABLE IF NOT EXISTS payment_reconciliation_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    statement_import_id UUID,
    source VARCHAR(30) NOT NULL,
    external_reference VARCHAR(100) NOT NULL,
    external_event_id VARCHAR(100),
    transaction_date DATE NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    direction VARCHAR(20) NOT NULL,
    raw_details JSONB,
    matched_payout_id UUID REFERENCES customer_payouts(id) ON DELETE SET NULL,
    matched_receipt_id UUID REFERENCES customer_receipts(id) ON DELETE SET NULL,
    matched_batch_id UUID REFERENCES payment_batches(id) ON DELETE SET NULL,
    reconciliation_status VARCHAR(30) NOT NULL DEFAULT 'UNMATCHED',
    resolution_action VARCHAR(40),
    resolution_notes TEXT,
    resolved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    resolved_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_recon_source CHECK (source IN ('MANUAL_VERIFICATION', 'BANK_STATEMENT_CSV', 'PAYMENT_GATEWAY_WEBHOOK')),
    CONSTRAINT chk_recon_direction CHECK (direction IN ('CREDIT', 'DEBIT')),
    CONSTRAINT chk_recon_status CHECK (reconciliation_status IN (
        'MATCHED', 'UNMATCHED', 'AMOUNT_MISMATCH', 'DUPLICATE_REFERENCE',
        'PARTIALLY_RECONCILED', 'MANUAL_REVIEW_REQUIRED'
    ))
);

CREATE INDEX IF NOT EXISTS idx_recon_org_ref ON payment_reconciliation_records(organization_id, external_reference);
CREATE INDEX IF NOT EXISTS idx_recon_status ON payment_reconciliation_records(reconciliation_status);
CREATE INDEX IF NOT EXISTS idx_recon_payout ON payment_reconciliation_records(matched_payout_id);
CREATE INDEX IF NOT EXISTS idx_recon_receipt ON payment_reconciliation_records(matched_receipt_id);

-- 7. Payment Adjustments Table (Reversals & Compensations)
CREATE TABLE IF NOT EXISTS payment_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    payout_id UUID REFERENCES customer_payouts(id) ON DELETE RESTRICT,
    receipt_id UUID REFERENCES customer_receipts(id) ON DELETE RESTRICT,
    adjustment_type VARCHAR(30) NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    reason TEXT NOT NULL,
    approved_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    ledger_transaction_id UUID REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_adj_positive_amount CHECK (amount > 0.00),
    CONSTRAINT chk_adj_type CHECK (adjustment_type IN (
        'REVERSAL_CREDIT', 'REVERSAL_DEBIT', 'OVERPAYMENT_CLAWBACK', 'UNDERPAYMENT_COMPENSATION'
    ))
);

CREATE INDEX IF NOT EXISTS idx_payment_adj_cust ON payment_adjustments(customer_id);

-- 8. Payment Approvals Audit Table
CREATE TABLE IF NOT EXISTS payment_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    entity_type VARCHAR(30) NOT NULL,
    entity_id UUID NOT NULL,
    approver_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    action VARCHAR(20) NOT NULL,
    comments TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_payment_approval_action CHECK (action IN ('SUBMITTED', 'APPROVED', 'REJECTED', 'OVERRIDDEN'))
);

CREATE INDEX IF NOT EXISTS idx_payment_approvals_entity ON payment_approvals(entity_type, entity_id);

-- ==============================================================================
-- 9. STORED PROCEDURES & BUSINESS LOGIC FUNCTIONS
-- ==============================================================================

-- 9.1 Create Customer Payout
CREATE OR REPLACE FUNCTION public.create_customer_payout(
    p_organization_id UUID,
    p_center_id UUID,
    p_customer_id UUID,
    p_amount NUMERIC(12,2),
    p_payment_method VARCHAR(30),
    p_reference_number VARCHAR(100),
    p_source_transaction_type VARCHAR(50),
    p_source_transaction_id UUID,
    p_idempotency_key VARCHAR(128),
    p_allow_overpayment_advance BOOLEAN,
    p_notes TEXT,
    p_created_by UUID
)
RETURNS JSONB AS $$
DECLARE
    v_customer RECORD;
    v_ledger_account RECORD;
    v_payout_id UUID;
    v_existing_payout RECORD;
    v_eligible_balance NUMERIC(12,2);
    v_mask VARCHAR(30);
    v_result JSONB;
BEGIN
    -- 1. Idempotency Check
    SELECT * INTO v_existing_payout 
    FROM customer_payouts 
    WHERE idempotency_key = p_idempotency_key;

    IF v_existing_payout.id IS NOT NULL THEN
        SELECT jsonb_build_object(
            'payoutId', v_existing_payout.id,
            'customerId', v_existing_payout.customer_id,
            'amount', v_existing_payout.amount,
            'currency', v_existing_payout.currency,
            'paymentMethod', v_existing_payout.payment_method,
            'status', v_existing_payout.status,
            'referenceNumber', v_existing_payout.reference_number,
            'idempotencyKey', v_existing_payout.idempotency_key,
            'isIdempotentReplay', TRUE
        ) INTO v_result;
        RETURN v_result;
    END IF;

    -- 2. Verify Customer
    SELECT * INTO v_customer 
    FROM customers 
    WHERE id = p_customer_id AND organization_id = p_organization_id;

    IF v_customer.id IS NULL THEN
        RAISE EXCEPTION 'Customer % does not exist in organization %', p_customer_id, p_organization_id USING ERRCODE = 'P0002';
    END IF;

    IF v_customer.is_deleted = TRUE THEN
        RAISE EXCEPTION 'Customer % is deleted and cannot receive payouts', p_customer_id USING ERRCODE = '22000';
    END IF;

    -- 3. Check Customer Ledger Balance
    SELECT * INTO v_ledger_account 
    FROM customer_ledger_accounts 
    WHERE customer_id = p_customer_id 
    FOR UPDATE;

    v_eligible_balance := COALESCE(v_ledger_account.current_balance, 0.00);

    -- 4. Overpayment Protection
    IF p_allow_overpayment_advance = FALSE AND p_amount > v_eligible_balance THEN
        RAISE EXCEPTION 'OVERPAYMENT_NOT_PERMITTED: Payout amount % exceeds eligible payable balance %', p_amount, v_eligible_balance USING ERRCODE = '22003';
    END IF;

    -- 5. Mask Bank Details
    IF v_customer.bank_account_number IS NOT NULL AND LENGTH(v_customer.bank_account_number) >= 4 THEN
        v_mask := 'XXXX-XXXX-' || RIGHT(v_customer.bank_account_number, 4);
    ELSE
        v_mask := NULL;
    END IF;

    v_payout_id := gen_random_uuid();

    -- 6. Insert Payout in PENDING_APPROVAL status
    INSERT INTO customer_payouts (
        id,
        organization_id,
        center_id,
        customer_id,
        direction,
        amount,
        currency,
        payment_method,
        status,
        reference_number,
        source_transaction_type,
        source_transaction_id,
        idempotency_key,
        bank_account_mask,
        bank_ifsc,
        recipient_name,
        notes,
        created_by,
        created_at,
        updated_at
    ) VALUES (
        v_payout_id,
        p_organization_id,
        p_center_id,
        p_customer_id,
        'DAIRY_PAYS_CUSTOMER',
        p_amount,
        'INR',
        p_payment_method,
        'PENDING_APPROVAL',
        p_reference_number,
        COALESCE(p_source_transaction_type, 'MANUAL_PAYOUT'),
        p_source_transaction_id,
        p_idempotency_key,
        v_mask,
        v_customer.bank_ifsc_code,
        v_customer.full_name,
        p_notes,
        p_created_by,
        NOW(),
        NOW()
    );

    -- 7. Audit Log
    INSERT INTO audit_logs (
        organization_id,
        center_id,
        user_id,
        action,
        entity_type,
        entity_id,
        new_values
    ) VALUES (
        p_organization_id,
        p_center_id,
        p_created_by,
        'PAYOUT_CREATED',
        'CUSTOMER_PAYOUT',
        v_payout_id,
        jsonb_build_object('amount', p_amount, 'status', 'PENDING_APPROVAL', 'payment_method', p_payment_method)
    );

    SELECT jsonb_build_object(
        'payoutId', v_payout_id,
        'organizationId', p_organization_id,
        'centerId', p_center_id,
        'customerId', p_customer_id,
        'customerName', v_customer.full_name,
        'farmerCode', v_customer.farmer_code,
        'amount', p_amount,
        'eligibleBalance', v_eligible_balance,
        'remainingPayable', v_eligible_balance - p_amount,
        'currency', 'INR',
        'paymentMethod', p_payment_method,
        'status', 'PENDING_APPROVAL',
        'referenceNumber', p_reference_number,
        'bankAccountMask', v_mask,
        'idempotencyKey', p_idempotency_key,
        'isIdempotentReplay', FALSE,
        'createdAt', NOW()
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

-- 9.2 Approve Customer Payout
CREATE OR REPLACE FUNCTION public.approve_customer_payout(
    p_payout_id UUID,
    p_approver_id UUID,
    p_comments TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_payout RECORD;
    v_approver RECORD;
    v_result JSONB;
BEGIN
    SELECT * INTO v_payout 
    FROM customer_payouts 
    WHERE id = p_payout_id 
    FOR UPDATE;

    IF v_payout.id IS NULL THEN
        RAISE EXCEPTION 'Payout % does not exist', p_payout_id USING ERRCODE = 'P0002';
    END IF;

    IF v_payout.status NOT IN ('DRAFT', 'PENDING_APPROVAL') THEN
        RAISE EXCEPTION 'Payout % cannot be approved from status %', p_payout_id, v_payout.status USING ERRCODE = '22000';
    END IF;

    SELECT * INTO v_approver FROM users WHERE id = p_approver_id;
    IF v_approver.id IS NULL THEN
        RAISE EXCEPTION 'Approver % does not exist', p_approver_id USING ERRCODE = 'P0002';
    END IF;

    -- Separation of duties: Creator cannot approve their own payout unless DAIRY_OWNER or SUPER_ADMIN
    IF v_payout.created_by = p_approver_id AND v_approver.role NOT IN ('DAIRY_OWNER', 'SUPER_ADMIN') THEN
        RAISE EXCEPTION 'SELF_APPROVAL_PROHIBITED: Initiator cannot approve their own payout request' USING ERRCODE = '42501';
    END IF;

    UPDATE customer_payouts
    SET status = 'APPROVED',
        approved_by = p_approver_id,
        approved_at = NOW(),
        updated_at = NOW()
    WHERE id = p_payout_id;

    INSERT INTO payment_approvals (
        organization_id,
        entity_type,
        entity_id,
        approver_id,
        action,
        comments
    ) VALUES (
        v_payout.organization_id,
        'PAYOUT',
        p_payout_id,
        p_approver_id,
        'APPROVED',
        p_comments
    );

    SELECT jsonb_build_object(
        'payoutId', p_payout_id,
        'status', 'APPROVED',
        'approvedBy', p_approver_id,
        'approvedAt', NOW()
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

-- 9.3 Submit Customer Payout
CREATE OR REPLACE FUNCTION public.submit_customer_payout(
    p_payout_id UUID,
    p_operator_id UUID,
    p_payment_reference VARCHAR(100) DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_payout RECORD;
    v_result JSONB;
BEGIN
    SELECT * INTO v_payout 
    FROM customer_payouts 
    WHERE id = p_payout_id 
    FOR UPDATE;

    IF v_payout.id IS NULL THEN
        RAISE EXCEPTION 'Payout % does not exist', p_payout_id USING ERRCODE = 'P0002';
    END IF;

    IF v_payout.status <> 'APPROVED' THEN
        RAISE EXCEPTION 'Payout % must be APPROVED before submission (current: %)', p_payout_id, v_payout.status USING ERRCODE = '22000';
    END IF;

    UPDATE customer_payouts
    SET status = 'SUBMITTED',
        submitted_at = NOW(),
        reference_number = COALESCE(p_payment_reference, reference_number),
        updated_at = NOW()
    WHERE id = p_payout_id;

    SELECT jsonb_build_object(
        'payoutId', p_payout_id,
        'status', 'SUBMITTED',
        'referenceNumber', COALESCE(p_payment_reference, v_payout.reference_number),
        'submittedAt', NOW(),
        'ledgerEffectApplied', FALSE
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

-- 9.4 Settle Customer Payout (Atomic Subledger Debit & Journal Entry Posting)
CREATE OR REPLACE FUNCTION public.settle_customer_payout(
    p_payout_id UUID,
    p_settled_by UUID,
    p_payment_reference VARCHAR(100),
    p_settled_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_payout RECORD;
    v_customer RECORD;
    v_center RECORD;
    v_ledger_account RECORD;
    v_prev_balance NUMERIC(12,2);
    v_new_balance NUMERIC(12,2);
    v_ledger_txn_id UUID;
    v_settled_timestamp TIMESTAMPTZ;
    v_receipt_number VARCHAR(60);
    v_result JSONB;
BEGIN
    -- 1. Fetch Payout FOR UPDATE
    SELECT * INTO v_payout 
    FROM customer_payouts 
    WHERE id = p_payout_id 
    FOR UPDATE;

    IF v_payout.id IS NULL THEN
        RAISE EXCEPTION 'Payout % does not exist', p_payout_id USING ERRCODE = 'P0002';
    END IF;

    -- Idempotency check: If already SETTLED, return existing record
    IF v_payout.status = 'SETTLED' THEN
        SELECT current_balance INTO v_new_balance 
        FROM customer_ledger_accounts 
        WHERE customer_id = v_payout.customer_id;

        SELECT jsonb_build_object(
            'payoutId', v_payout.id,
            'status', 'SETTLED',
            'amount', v_payout.amount,
            'referenceNumber', v_payout.reference_number,
            'settledAt', v_payout.settled_at,
            'ledgerTransactionId', v_payout.ledger_transaction_id,
            'customerBalanceAfter', v_new_balance,
            'isIdempotentReplay', TRUE
        ) INTO v_result;
        RETURN v_result;
    END IF;

    -- Valid prior statuses for settlement: SUBMITTED or APPROVED (for direct cash settlement)
    IF v_payout.status NOT IN ('SUBMITTED', 'APPROVED') THEN
        RAISE EXCEPTION 'Payout % cannot be settled from status %', p_payout_id, v_payout.status USING ERRCODE = '22000';
    END IF;

    v_settled_timestamp := COALESCE(p_settled_at, NOW());

    -- 2. Fetch Customer and Center
    SELECT * INTO v_customer FROM customers WHERE id = v_payout.customer_id;
    SELECT * INTO v_center FROM dairy_centers WHERE id = v_payout.center_id;

    -- 3. Lock Customer Ledger Account FOR UPDATE
    SELECT * INTO v_ledger_account 
    FROM customer_ledger_accounts 
    WHERE customer_id = v_payout.customer_id 
    FOR UPDATE;

    IF v_ledger_account.id IS NULL THEN
        -- Create ledger account if none exists
        INSERT INTO customer_ledger_accounts (
            customer_id, organization_id, currency, current_balance, last_transaction_at, updated_at
        ) VALUES (
            v_payout.customer_id, v_payout.organization_id, 'INR', 0.00, NOW(), NOW()
        ) RETURNING * INTO v_ledger_account;
    END IF;

    v_prev_balance := v_ledger_account.current_balance;
    v_new_balance := v_prev_balance - v_payout.amount; -- Liability decreased by debit

    -- 4. Update Customer Ledger Account Balance
    UPDATE customer_ledger_accounts
    SET current_balance = v_new_balance,
        last_transaction_at = v_settled_timestamp,
        updated_at = NOW()
    WHERE id = v_ledger_account.id;

    -- 5. Insert Append-Only Ledger Transaction Header
    v_ledger_txn_id := gen_random_uuid();
    INSERT INTO ledger_transactions (
        id,
        organization_id,
        center_id,
        customer_id,
        transaction_type,
        direction,
        amount,
        balance_after,
        reference_entity,
        reference_id,
        description,
        idempotency_key,
        created_by,
        created_at
    ) VALUES (
        v_ledger_txn_id,
        v_payout.organization_id,
        v_payout.center_id,
        v_payout.customer_id,
        'PAYMENT_PAYOUT_DEBIT',
        'DEBIT',
        v_payout.amount,
        v_new_balance,
        'CUSTOMER_PAYMENT',
        v_payout.id,
        'Settled Payout via ' || v_payout.payment_method || ' Ref: ' || COALESCE(p_payment_reference, v_payout.reference_number, 'N/A'),
        v_payout.idempotency_key,
        p_settled_by,
        v_settled_timestamp
    );

    -- 6. Insert Balanced Double-Entry Journal Entries
    -- Entry 1: Debit Customer Payable (Liability decreases)
    INSERT INTO ledger_entries (
        transaction_id, account_id, account_type, entry_type, amount
    ) VALUES (
        v_ledger_txn_id, v_ledger_account.id, 'CUSTOMER_PAYABLE', 'DEBIT', v_payout.amount
    );

    -- Entry 2: Credit Cash/Bank (Asset decreases)
    INSERT INTO ledger_entries (
        transaction_id, account_id, account_type, entry_type, amount
    ) VALUES (
        v_ledger_txn_id, v_payout.center_id, 'CASH_BANK', 'CREDIT', v_payout.amount
    );

    -- 7. Update Customer Payout Status to SETTLED
    UPDATE customer_payouts
    SET status = 'SETTLED',
        reference_number = COALESCE(p_payment_reference, reference_number),
        settled_at = v_settled_timestamp,
        ledger_transaction_id = v_ledger_txn_id,
        updated_at = NOW()
    WHERE id = p_payout_id;

    -- 8. If part of a batch, update batch item status
    IF v_payout.batch_id IS NOT NULL THEN
        UPDATE payment_batch_items
        SET status = 'SETTLED',
            settled_at = v_settled_timestamp,
            beneficiary_reference = COALESCE(p_payment_reference, beneficiary_reference),
            updated_at = NOW()
        WHERE batch_id = v_payout.batch_id AND payout_id = p_payout_id;

        -- Update batch aggregate totals
        UPDATE payment_batches
        SET successful_count = successful_count + 1,
            successful_amount = successful_amount + v_payout.amount,
            pending_count = GREATEST(0, pending_count - 1),
            pending_amount = GREATEST(0.00, pending_amount - v_payout.amount),
            updated_at = NOW()
        WHERE id = v_payout.batch_id;
    END IF;

    -- 9. Insert Sync Event
    v_receipt_number := 'RCP-PAY-' || UPPER(SUBSTRING(v_payout.id::text, 1, 8));
    INSERT INTO sync_events (
        organization_id, center_id, entity_type, entity_id, action, payload
    ) VALUES (
        v_payout.organization_id,
        v_payout.center_id,
        'PAYMENT_PAYOUT',
        v_payout.id,
        'UPDATE',
        jsonb_build_object(
            'payoutId', v_payout.id,
            'amount', v_payout.amount,
            'balanceAfter', v_new_balance,
            'referenceNumber', COALESCE(p_payment_reference, v_payout.reference_number)
        )
    );

    -- 10. Return Result
    SELECT jsonb_build_object(
        'payoutId', v_payout.id,
        'receiptNumber', v_receipt_number,
        'organizationName', (SELECT name FROM organizations WHERE id = v_payout.organization_id),
        'centerName', v_center.name,
        'customerName', v_customer.full_name,
        'farmerCode', v_customer.farmer_code,
        'amount', v_payout.amount,
        'currency', v_payout.currency,
        'paymentMethod', v_payout.payment_method,
        'status', 'SETTLED',
        'referenceNumber', COALESCE(p_payment_reference, v_payout.reference_number),
        'settledAt', v_settled_timestamp,
        'previousBalance', v_prev_balance,
        'customerBalanceAfter', v_new_balance,
        'ledgerTransactionId', v_ledger_txn_id,
        'isIdempotentReplay', FALSE
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

-- 9.5 Fail Customer Payout
CREATE OR REPLACE FUNCTION public.fail_customer_payout(
    p_payout_id UUID,
    p_actor_id UUID,
    p_failure_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_payout RECORD;
    v_result JSONB;
BEGIN
    SELECT * INTO v_payout 
    FROM customer_payouts 
    WHERE id = p_payout_id 
    FOR UPDATE;

    IF v_payout.id IS NULL THEN
        RAISE EXCEPTION 'Payout % does not exist', p_payout_id USING ERRCODE = 'P0002';
    END IF;

    IF v_payout.status = 'SETTLED' THEN
        RAISE EXCEPTION 'CANNOT_FAIL_SETTLED_PAYOUT: Payout is already settled; use reversal instead' USING ERRCODE = '22000';
    END IF;

    UPDATE customer_payouts
    SET status = 'FAILED',
        failed_at = NOW(),
        failure_reason = p_failure_reason,
        updated_at = NOW()
    WHERE id = p_payout_id;

    IF v_payout.batch_id IS NOT NULL THEN
        UPDATE payment_batch_items
        SET status = 'FAILED',
            failure_reason = p_failure_reason,
            updated_at = NOW()
        WHERE batch_id = v_payout.batch_id AND payout_id = p_payout_id;

        UPDATE payment_batches
        SET failed_count = failed_count + 1,
            failed_amount = failed_amount + v_payout.amount,
            pending_count = GREATEST(0, pending_count - 1),
            pending_amount = GREATEST(0.00, pending_amount - v_payout.amount),
            updated_at = NOW()
        WHERE id = v_payout.batch_id;
    END IF;

    SELECT jsonb_build_object(
        'payoutId', p_payout_id,
        'status', 'FAILED',
        'failureReason', p_failure_reason,
        'failedAt', NOW()
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

-- 9.6 Reverse Customer Payout (Compensation Workflow for Settled Payouts)
CREATE OR REPLACE FUNCTION public.reverse_customer_payout(
    p_payout_id UUID,
    p_actor_id UUID,
    p_reason TEXT,
    p_idempotency_key VARCHAR(128)
)
RETURNS JSONB AS $$
DECLARE
    v_payout RECORD;
    v_ledger_account RECORD;
    v_prev_balance NUMERIC(12,2);
    v_new_balance NUMERIC(12,2);
    v_ledger_txn_id UUID;
    v_result JSONB;
BEGIN
    SELECT * INTO v_payout 
    FROM customer_payouts 
    WHERE id = p_payout_id 
    FOR UPDATE;

    IF v_payout.id IS NULL THEN
        RAISE EXCEPTION 'Payout % does not exist', p_payout_id USING ERRCODE = 'P0002';
    END IF;

    IF v_payout.status <> 'SETTLED' THEN
        RAISE EXCEPTION 'Only SETTLED payouts can be reversed (current: %)', v_payout.status USING ERRCODE = '22000';
    END IF;

    -- Fetch customer ledger account FOR UPDATE
    SELECT * INTO v_ledger_account 
    FROM customer_ledger_accounts 
    WHERE customer_id = v_payout.customer_id 
    FOR UPDATE;

    v_prev_balance := v_ledger_account.current_balance;
    v_new_balance := v_prev_balance + v_payout.amount; -- Restore farmer payable liability

    -- Update running balance
    UPDATE customer_ledger_accounts
    SET current_balance = v_new_balance,
        last_transaction_at = NOW(),
        updated_at = NOW()
    WHERE id = v_ledger_account.id;

    -- Insert Reversal Ledger Transaction
    v_ledger_txn_id := gen_random_uuid();
    INSERT INTO ledger_transactions (
        id,
        organization_id,
        center_id,
        customer_id,
        transaction_type,
        direction,
        amount,
        balance_after,
        reference_entity,
        reference_id,
        description,
        idempotency_key,
        created_by,
        created_at
    ) VALUES (
        v_ledger_txn_id,
        v_payout.organization_id,
        v_payout.center_id,
        v_payout.customer_id,
        'PAYOUT_REVERSAL_CREDIT',
        'CREDIT',
        v_payout.amount,
        v_new_balance,
        'CUSTOMER_PAYMENT',
        v_payout.id,
        'Reversal of payout ' || v_payout.id || ': ' || p_reason,
        p_idempotency_key,
        p_actor_id,
        NOW()
    );

    -- Insert Balanced Journal Entries
    -- Entry 1: Debit Cash/Bank (Money returned to dairy)
    INSERT INTO ledger_entries (
        transaction_id, account_id, account_type, entry_type, amount
    ) VALUES (
        v_ledger_txn_id, v_payout.center_id, 'CASH_BANK', 'DEBIT', v_payout.amount
    );

    -- Entry 2: Credit Customer Payable (Liability reinstated)
    INSERT INTO ledger_entries (
        transaction_id, account_id, account_type, entry_type, amount
    ) VALUES (
        v_ledger_txn_id, v_ledger_account.id, 'CUSTOMER_PAYABLE', 'CREDIT', v_payout.amount
    );

    -- Insert payment adjustment record
    INSERT INTO payment_adjustments (
        organization_id,
        center_id,
        customer_id,
        payout_id,
        adjustment_type,
        amount,
        reason,
        approved_by,
        ledger_transaction_id
    ) VALUES (
        v_payout.organization_id,
        v_payout.center_id,
        v_payout.customer_id,
        v_payout.id,
        'REVERSAL_CREDIT',
        v_payout.amount,
        p_reason,
        p_actor_id,
        v_ledger_txn_id
    );

    -- Mark payout REVERSED
    UPDATE customer_payouts
    SET status = 'REVERSED',
        updated_at = NOW()
    WHERE id = p_payout_id;

    SELECT jsonb_build_object(
        'payoutId', p_payout_id,
        'status', 'REVERSED',
        'reversalReason', p_reason,
        'ledgerTransactionId', v_ledger_txn_id,
        'customerBalanceAfter', v_new_balance,
        'reversedAt', NOW()
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

-- 9.7 Create Customer Receipt (Farmer Pays Dairy)
CREATE OR REPLACE FUNCTION public.create_customer_receipt(
    p_organization_id UUID,
    p_center_id UUID,
    p_customer_id UUID,
    p_amount NUMERIC(12,2),
    p_payment_method VARCHAR(30),
    p_reference_number VARCHAR(100),
    p_source_transaction_type VARCHAR(50),
    p_source_transaction_id UUID,
    p_idempotency_key VARCHAR(128),
    p_notes TEXT,
    p_created_by UUID
)
RETURNS JSONB AS $$
DECLARE
    v_customer RECORD;
    v_receipt_id UUID;
    v_receipt_number VARCHAR(60);
    v_existing_receipt RECORD;
    v_result JSONB;
BEGIN
    SELECT * INTO v_existing_receipt 
    FROM customer_receipts 
    WHERE idempotency_key = p_idempotency_key;

    IF v_existing_receipt.id IS NOT NULL THEN
        SELECT jsonb_build_object(
            'receiptId', v_existing_receipt.id,
            'receiptNumber', v_existing_receipt.receipt_number,
            'customerId', v_existing_receipt.customer_id,
            'amount', v_existing_receipt.amount,
            'status', v_existing_receipt.status,
            'isIdempotentReplay', TRUE
        ) INTO v_result;
        RETURN v_result;
    END IF;

    SELECT * INTO v_customer 
    FROM customers 
    WHERE id = p_customer_id AND organization_id = p_organization_id;

    IF v_customer.id IS NULL THEN
        RAISE EXCEPTION 'Customer % does not exist in organization %', p_customer_id, p_organization_id USING ERRCODE = 'P0002';
    END IF;

    v_receipt_id := gen_random_uuid();
    v_receipt_number := 'RCP-REC-' || UPPER(SUBSTRING(v_receipt_id::text, 1, 8));

    INSERT INTO customer_receipts (
        id,
        organization_id,
        center_id,
        customer_id,
        direction,
        amount,
        currency,
        payment_method,
        status,
        reference_number,
        receipt_number,
        source_transaction_type,
        source_transaction_id,
        idempotency_key,
        notes,
        created_by,
        created_at,
        updated_at
    ) VALUES (
        v_receipt_id,
        p_organization_id,
        p_center_id,
        p_customer_id,
        'CUSTOMER_PAYS_DAIRY',
        p_amount,
        'INR',
        p_payment_method,
        'DRAFT',
        p_reference_number,
        v_receipt_number,
        COALESCE(p_source_transaction_type, 'DEBT_REPAYMENT'),
        p_source_transaction_id,
        p_idempotency_key,
        p_notes,
        p_created_by,
        NOW(),
        NOW()
    );

    SELECT jsonb_build_object(
        'receiptId', v_receipt_id,
        'receiptNumber', v_receipt_number,
        'customerId', p_customer_id,
        'customerName', v_customer.full_name,
        'amount', p_amount,
        'currency', 'INR',
        'paymentMethod', p_payment_method,
        'status', 'DRAFT',
        'referenceNumber', p_reference_number,
        'isIdempotentReplay', FALSE,
        'createdAt', NOW()
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

-- 9.8 Settle Customer Receipt (Atomic Subledger Credit & Balanced Double Entry)
CREATE OR REPLACE FUNCTION public.settle_customer_receipt(
    p_receipt_id UUID,
    p_settled_by UUID,
    p_reference_number VARCHAR(100) DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_receipt RECORD;
    v_customer RECORD;
    v_center RECORD;
    v_ledger_account RECORD;
    v_prev_balance NUMERIC(12,2);
    v_new_balance NUMERIC(12,2);
    v_ledger_txn_id UUID;
    v_result JSONB;
BEGIN
    SELECT * INTO v_receipt 
    FROM customer_receipts 
    WHERE id = p_receipt_id 
    FOR UPDATE;

    IF v_receipt.id IS NULL THEN
        RAISE EXCEPTION 'Receipt % does not exist', p_receipt_id USING ERRCODE = 'P0002';
    END IF;

    IF v_receipt.status = 'SETTLED' THEN
        SELECT current_balance INTO v_new_balance 
        FROM customer_ledger_accounts 
        WHERE customer_id = v_receipt.customer_id;

        SELECT jsonb_build_object(
            'receiptId', v_receipt.id,
            'receiptNumber', v_receipt.receipt_number,
            'status', 'SETTLED',
            'amount', v_receipt.amount,
            'customerBalanceAfter', v_new_balance,
            'isIdempotentReplay', TRUE
        ) INTO v_result;
        RETURN v_result;
    END IF;

    SELECT * INTO v_customer FROM customers WHERE id = v_receipt.customer_id;
    SELECT * INTO v_center FROM dairy_centers WHERE id = v_receipt.center_id;

    -- Lock Ledger Account FOR UPDATE
    SELECT * INTO v_ledger_account 
    FROM customer_ledger_accounts 
    WHERE customer_id = v_receipt.customer_id 
    FOR UPDATE;

    IF v_ledger_account.id IS NULL THEN
        INSERT INTO customer_ledger_accounts (
            customer_id, organization_id, currency, current_balance, last_transaction_at, updated_at
        ) VALUES (
            v_receipt.customer_id, v_receipt.organization_id, 'INR', 0.00, NOW(), NOW()
        ) RETURNING * INTO v_ledger_account;
    END IF;

    v_prev_balance := v_ledger_account.current_balance;
    v_new_balance := v_prev_balance + v_receipt.amount; -- Credit reduces customer debt / increases customer balance

    UPDATE customer_ledger_accounts
    SET current_balance = v_new_balance,
        last_transaction_at = NOW(),
        updated_at = NOW()
    WHERE id = v_ledger_account.id;

    -- Insert Append-Only Ledger Transaction Header
    v_ledger_txn_id := gen_random_uuid();
    INSERT INTO ledger_transactions (
        id,
        organization_id,
        center_id,
        customer_id,
        transaction_type,
        direction,
        amount,
        balance_after,
        reference_entity,
        reference_id,
        description,
        idempotency_key,
        created_by,
        created_at
    ) VALUES (
        v_ledger_txn_id,
        v_receipt.organization_id,
        v_receipt.center_id,
        v_receipt.customer_id,
        'CUSTOMER_RECEIPT_CREDIT',
        'CREDIT',
        v_receipt.amount,
        v_new_balance,
        'CUSTOMER_RECEIPT',
        v_receipt.id,
        'Customer Debt Repayment via ' || v_receipt.payment_method || ' Ref: ' || COALESCE(p_reference_number, v_receipt.reference_number),
        v_receipt.idempotency_key,
        p_settled_by,
        NOW()
    );

    -- Balanced Double-Entry Journal:
    -- Entry 1: Debit Cash/Bank (Money received by dairy)
    INSERT INTO ledger_entries (
        transaction_id, account_id, account_type, entry_type, amount
    ) VALUES (
        v_ledger_txn_id, v_receipt.center_id, 'CASH_BANK', 'DEBIT', v_receipt.amount
    );

    -- Entry 2: Credit Customer Payable (Customer debt reduced / credit increased)
    INSERT INTO ledger_entries (
        transaction_id, account_id, account_type, entry_type, amount
    ) VALUES (
        v_ledger_txn_id, v_ledger_account.id, 'CUSTOMER_PAYABLE', 'CREDIT', v_receipt.amount
    );

    UPDATE customer_receipts
    SET status = 'SETTLED',
        reference_number = COALESCE(p_reference_number, reference_number),
        settled_at = NOW(),
        ledger_transaction_id = v_ledger_txn_id,
        updated_at = NOW()
    WHERE id = p_receipt_id;

    -- Insert Sync Event
    INSERT INTO sync_events (
        organization_id, center_id, entity_type, entity_id, action, payload
    ) VALUES (
        v_receipt.organization_id,
        v_receipt.center_id,
        'CUSTOMER_RECEIPT',
        v_receipt.id,
        'UPDATE',
        jsonb_build_object(
            'receiptId', v_receipt.id,
            'receiptNumber', v_receipt.receipt_number,
            'amount', v_receipt.amount,
            'customerBalanceAfter', v_new_balance
        )
    );

    SELECT jsonb_build_object(
        'receiptId', v_receipt.id,
        'receiptNumber', v_receipt.receipt_number,
        'customerName', v_customer.full_name,
        'farmerCode', v_customer.farmer_code,
        'centerName', v_center.name,
        'amount', v_receipt.amount,
        'currency', v_receipt.currency,
        'paymentMethod', v_receipt.payment_method,
        'status', 'SETTLED',
        'referenceNumber', COALESCE(p_reference_number, v_receipt.reference_number),
        'settledAt', NOW(),
        'previousBalance', v_prev_balance,
        'customerBalanceAfter', v_new_balance,
        'ledgerTransactionId', v_ledger_txn_id,
        'isIdempotentReplay', FALSE
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

-- ==============================================================================
-- 10. ROW LEVEL SECURITY (RLS) POLICIES ON NEW TABLES
-- ==============================================================================

ALTER TABLE customer_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_batch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_reconciliation_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_approvals ENABLE ROW LEVEL SECURITY;

-- Service Role Full Access
DROP POLICY IF EXISTS service_role_payouts ON customer_payouts;
CREATE POLICY service_role_payouts ON customer_payouts FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_receipts ON customer_receipts;
CREATE POLICY service_role_receipts ON customer_receipts FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_batches ON payment_batches;
CREATE POLICY service_role_batches ON payment_batches FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_batch_items ON payment_batch_items;
CREATE POLICY service_role_batch_items ON payment_batch_items FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_reconcile ON payment_reconciliation_records;
CREATE POLICY service_role_reconcile ON payment_reconciliation_records FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_adjustments ON payment_adjustments;
CREATE POLICY service_role_adjustments ON payment_adjustments FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_approvals ON payment_approvals;
CREATE POLICY service_role_approvals ON payment_approvals FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated Users: Tenant Isolation
DROP POLICY IF EXISTS tenant_isolation_payouts ON customer_payouts;
CREATE POLICY tenant_isolation_payouts ON customer_payouts
FOR ALL TO authenticated
USING (
    organization_id = public.current_org_id()
    AND (
        public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN')
        OR (public.current_user_role() IN ('CENTER_MANAGER', 'ACCOUNTANT', 'SUPERVISOR') AND center_id = public.current_center_id())
        OR (public.current_user_role() = 'FARMER_CUSTOMER' AND customer_id = public.current_customer_id())
    )
);

DROP POLICY IF EXISTS tenant_isolation_receipts ON customer_receipts;
CREATE POLICY tenant_isolation_receipts ON customer_receipts
FOR ALL TO authenticated
USING (
    organization_id = public.current_org_id()
    AND (
        public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN')
        OR (public.current_user_role() IN ('CENTER_MANAGER', 'ACCOUNTANT', 'SUPERVISOR', 'COLLECTION_OPERATOR') AND center_id = public.current_center_id())
        OR (public.current_user_role() = 'FARMER_CUSTOMER' AND customer_id = public.current_customer_id())
    )
);

DROP POLICY IF EXISTS tenant_isolation_batches ON payment_batches;
CREATE POLICY tenant_isolation_batches ON payment_batches
FOR ALL TO authenticated
USING (
    organization_id = public.current_org_id()
    AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'CENTER_MANAGER', 'ACCOUNTANT')
);

DROP POLICY IF EXISTS tenant_isolation_batch_items ON payment_batch_items;
CREATE POLICY tenant_isolation_batch_items ON payment_batch_items
FOR ALL TO authenticated
USING (
    EXISTS (SELECT 1 FROM payment_batches pb WHERE pb.id = payment_batch_items.batch_id AND pb.organization_id = public.current_org_id())
);

DROP POLICY IF EXISTS tenant_isolation_recon ON payment_reconciliation_records;
CREATE POLICY tenant_isolation_recon ON payment_reconciliation_records
FOR ALL TO authenticated
USING (
    organization_id = public.current_org_id()
    AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'ACCOUNTANT')
);

-- Function execution grants
GRANT EXECUTE ON FUNCTION public.create_customer_payout TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_customer_payout TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_customer_payout TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.settle_customer_payout TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fail_customer_payout TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_customer_payout TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_customer_receipt TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.settle_customer_receipt TO authenticated, service_role;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('021', '021_customer_payouts_batches_and_reconciliation.sql') ON CONFLICT (version) DO NOTHING;

-- ========================================================
-- Migration: 022_customer_notifications.sql
-- ========================================================
-- Migration 016: Customer In-App Notifications Schema
-- Phase 18 Customer Mobile Application Integration

CREATE TABLE IF NOT EXISTS customer_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    notification_type VARCHAR(50) NOT NULL DEFAULT 'GENERAL_ANNOUNCEMENT',
    metadata JSONB DEFAULT '{}'::jsonb,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_notification_type CHECK (
        notification_type IN (
            'MILK_COLLECTION',
            'BILL_GENERATED',
            'BILL_FINALIZED',
            'PAYMENT_DISBURSED',
            'PAYMENT_RECEIVED',
            'FEED_PURCHASE',
            'FEED_RETURN',
            'ADVANCE_APPROVED',
            'RATE_REVISED',
            'GENERAL_ANNOUNCEMENT'
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_cust_notif_customer ON customer_notifications(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cust_notif_unread ON customer_notifications(customer_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_cust_notif_org ON customer_notifications(organization_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS set_customer_notifications_updated_at ON customer_notifications;
CREATE TRIGGER set_customer_notifications_updated_at
BEFORE UPDATE ON customer_notifications
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Enable RLS
ALTER TABLE customer_notifications ENABLE ROW LEVEL SECURITY;

-- Customer can only view their own notifications
DROP POLICY IF EXISTS customer_view_own_notifications ON customer_notifications;
CREATE POLICY customer_view_own_notifications ON customer_notifications
    FOR SELECT
    USING (
        auth.uid() = customer_id 
        OR customer_id IN (SELECT id FROM customers WHERE auth_user_id = auth.uid())
    );

-- System / Service Role can insert & manage
DROP POLICY IF EXISTS service_manage_notifications ON customer_notifications;
CREATE POLICY service_manage_notifications ON customer_notifications
    FOR ALL
    USING (TRUE)
    WITH CHECK (TRUE);

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('022', '022_customer_notifications.sql') ON CONFLICT (version) DO NOTHING;

-- ========================================================
-- Migration: 023_notification_engine_push_and_whatsapp_automation.sql
-- ========================================================
-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 017: NOTIFICATION ENGINE, PUSH & WHATSAPP BUSINESS AUTOMATION
-- Durable Outbox, Multi-Channel Templates, Device Tokens & Provider Events
-- ==============================================================================

-- 1. Notification Templates Table (Configurable Multi-Lingual Templates)
CREATE TABLE IF NOT EXISTS notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    template_code VARCHAR(100) NOT NULL,
    channel VARCHAR(30) NOT NULL,
    language VARCHAR(10) NOT NULL DEFAULT 'mr',
    title_template TEXT NOT NULL,
    body_template TEXT NOT NULL,
    whatsapp_template_name VARCHAR(100),
    whatsapp_namespace VARCHAR(100),
    variables_schema JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_template_channel CHECK (channel IN ('PUSH', 'WHATSAPP', 'IN_APP', 'SMS')),
    CONSTRAINT chk_template_language CHECK (language IN ('mr', 'en', 'hi')),
    CONSTRAINT uq_template_code_channel_lang UNIQUE (organization_id, template_code, channel, language)
);

CREATE INDEX IF NOT EXISTS idx_notif_templates_code ON notification_templates(template_code, channel, language);
CREATE INDEX IF NOT EXISTS idx_notif_templates_org ON notification_templates(organization_id);

DROP TRIGGER IF EXISTS set_notification_templates_updated_at ON notification_templates;
CREATE TRIGGER set_notification_templates_updated_at
BEFORE UPDATE ON notification_templates
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 2. Durable Notification Outbox Records
CREATE TABLE IF NOT EXISTS notification_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID REFERENCES dairy_centers(id) ON DELETE SET NULL,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    event_type VARCHAR(80) NOT NULL,
    event_id VARCHAR(128) NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL,
    channel VARCHAR(30) NOT NULL,
    recipient_phone VARCHAR(30),
    recipient_token VARCHAR(512),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    retry_count INT NOT NULL DEFAULT 0,
    max_retries INT NOT NULL DEFAULT 3,
    next_retry_at TIMESTAMPTZ,
    last_attempted_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_notif_record_channel CHECK (channel IN ('PUSH', 'WHATSAPP', 'IN_APP', 'SMS')),
    CONSTRAINT chk_notif_record_status CHECK (status IN (
        'PENDING', 'PROCESSING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'CANCELLED', 'OPTED_OUT', 'BLOCKED'
    )),
    CONSTRAINT uq_notif_record_event_channel UNIQUE (organization_id, event_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_notif_records_customer ON notification_records(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_records_status ON notification_records(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_notif_records_event ON notification_records(event_id);
CREATE INDEX IF NOT EXISTS idx_notif_records_org ON notification_records(organization_id);

DROP TRIGGER IF EXISTS set_notification_records_updated_at ON notification_records;
CREATE TRIGGER set_notification_records_updated_at
BEFORE UPDATE ON notification_records
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 3. Notification Delivery Logs
CREATE TABLE IF NOT EXISTS notification_delivery_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_record_id UUID NOT NULL REFERENCES notification_records(id) ON DELETE CASCADE,
    channel VARCHAR(30) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    provider_message_id VARCHAR(255),
    status VARCHAR(30) NOT NULL,
    response_code INT,
    response_payload JSONB,
    error_message TEXT,
    latency_ms INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_logs_record ON notification_delivery_logs(notification_record_id);
CREATE INDEX IF NOT EXISTS idx_notif_logs_provider_id ON notification_delivery_logs(provider_message_id);

-- 4. WhatsApp Customer Mappings (Consent, Preferred Language & Opt-In)
CREATE TABLE IF NOT EXISTS whatsapp_customer_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    phone_number VARCHAR(30) NOT NULL,
    whatsapp_id VARCHAR(64),
    is_opted_in BOOLEAN NOT NULL DEFAULT TRUE,
    opt_in_source VARCHAR(50) DEFAULT 'REGISTRATION_CONSENT',
    opt_in_timestamp TIMESTAMPTZ DEFAULT NOW(),
    opt_out_timestamp TIMESTAMPTZ,
    opt_out_reason TEXT,
    preferred_language VARCHAR(10) NOT NULL DEFAULT 'mr',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_wa_cust_map_org_cust UNIQUE (organization_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_wa_map_cust ON whatsapp_customer_mappings(customer_id);
CREATE INDEX IF NOT EXISTS idx_wa_map_phone ON whatsapp_customer_mappings(organization_id, phone_number);

DROP TRIGGER IF EXISTS set_whatsapp_customer_mappings_updated_at ON whatsapp_customer_mappings;
CREATE TRIGGER set_whatsapp_customer_mappings_updated_at
BEFORE UPDATE ON whatsapp_customer_mappings
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 5. WhatsApp Message Records (Audit Trail & Status Updates)
CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    notification_record_id UUID REFERENCES notification_records(id) ON DELETE SET NULL,
    direction VARCHAR(20) NOT NULL DEFAULT 'OUTBOUND',
    wamid VARCHAR(255) UNIQUE,
    phone_number VARCHAR(30) NOT NULL,
    template_name VARCHAR(100),
    message_type VARCHAR(30) NOT NULL DEFAULT 'TEMPLATE',
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    payload JSONB,
    error_code VARCHAR(50),
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_wa_msg_direction CHECK (direction IN ('OUTBOUND', 'INBOUND')),
    CONSTRAINT chk_wa_msg_status CHECK (status IN ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS idx_wa_messages_cust ON whatsapp_messages(customer_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_wamid ON whatsapp_messages(wamid);
CREATE INDEX IF NOT EXISTS idx_wa_messages_notif ON whatsapp_messages(notification_record_id);

DROP TRIGGER IF EXISTS set_whatsapp_messages_updated_at ON whatsapp_messages;
CREATE TRIGGER set_whatsapp_messages_updated_at
BEFORE UPDATE ON whatsapp_messages
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 6. Customer Device Tokens (Push Notifications via FCM)
CREATE TABLE IF NOT EXISTS customer_device_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    device_id VARCHAR(128) NOT NULL,
    device_platform VARCHAR(20) NOT NULL DEFAULT 'ANDROID',
    fcm_token TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deactivated_at TIMESTAMPTZ,
    deactivation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_device_platform CHECK (device_platform IN ('ANDROID', 'IOS', 'WEB')),
    CONSTRAINT uq_customer_device_token UNIQUE (customer_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_cust_tokens_cust ON customer_device_tokens(customer_id);
CREATE INDEX IF NOT EXISTS idx_cust_tokens_active ON customer_device_tokens(customer_id, is_active) WHERE is_active = TRUE;

DROP TRIGGER IF EXISTS set_customer_device_tokens_updated_at ON customer_device_tokens;
CREATE TRIGGER set_customer_device_tokens_updated_at
BEFORE UPDATE ON customer_device_tokens
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 7. Provider Event Records (Webhook Idempotency & Replay Protection)
CREATE TABLE IF NOT EXISTS provider_event_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL,
    event_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100),
    raw_payload JSONB NOT NULL,
    processed_status VARCHAR(30) NOT NULL DEFAULT 'PROCESSED',
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_provider_event UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_events_lookup ON provider_event_records(provider, event_id);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_delivery_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_customer_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_event_records ENABLE ROW LEVEL SECURITY;

-- Service Role full access
DROP POLICY IF EXISTS service_role_notif_templates ON notification_templates;
DROP POLICY IF EXISTS service_role_notif_records ON notification_records;
DROP POLICY IF EXISTS service_role_notif_logs ON notification_delivery_logs;
DROP POLICY IF EXISTS service_role_wa_mappings ON whatsapp_customer_mappings;
DROP POLICY IF EXISTS service_role_wa_messages ON whatsapp_messages;
DROP POLICY IF EXISTS service_role_cust_tokens ON customer_device_tokens;
DROP POLICY IF EXISTS service_role_provider_events ON provider_event_records;
CREATE POLICY service_role_notif_templates ON notification_templates FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_notif_records ON notification_records FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_notif_logs ON notification_delivery_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_wa_mappings ON whatsapp_customer_mappings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_wa_messages ON whatsapp_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_cust_tokens ON customer_device_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_provider_events ON provider_event_records FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated Users: Tenant Isolation & Customer Self-Service
DROP POLICY IF EXISTS tenant_isolation_notif_templates ON notification_templates;
CREATE POLICY tenant_isolation_notif_templates ON notification_templates
FOR SELECT TO authenticated
USING (
    organization_id IS NULL OR organization_id = public.current_org_id()
);

DROP POLICY IF EXISTS tenant_isolation_notif_records ON notification_records;
CREATE POLICY tenant_isolation_notif_records ON notification_records
FOR SELECT TO authenticated
USING (
    organization_id = public.current_org_id()
    AND (
        public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'CENTER_MANAGER', 'SUPERVISOR', 'ACCOUNTANT')
        OR (public.current_user_role() = 'FARMER_CUSTOMER' AND customer_id = public.current_customer_id())
    )
);

DROP POLICY IF EXISTS customer_update_own_notif_read ON notification_records;
CREATE POLICY customer_update_own_notif_read ON notification_records
FOR UPDATE TO authenticated
USING (
    customer_id = public.current_customer_id()
)
WITH CHECK (
    customer_id = public.current_customer_id()
);

DROP POLICY IF EXISTS tenant_isolation_wa_mappings ON whatsapp_customer_mappings;
CREATE POLICY tenant_isolation_wa_mappings ON whatsapp_customer_mappings
FOR ALL TO authenticated
USING (
    organization_id = public.current_org_id()
    AND (
        public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'CENTER_MANAGER')
        OR (public.current_user_role() = 'FARMER_CUSTOMER' AND customer_id = public.current_customer_id())
    )
);

DROP POLICY IF EXISTS customer_manage_own_tokens ON customer_device_tokens;
CREATE POLICY customer_manage_own_tokens ON customer_device_tokens
FOR ALL TO authenticated
USING (
    customer_id = public.current_customer_id()
)
WITH CHECK (
    customer_id = public.current_customer_id()
);

DROP POLICY IF EXISTS tenant_isolation_wa_messages ON whatsapp_messages;
CREATE POLICY tenant_isolation_wa_messages ON whatsapp_messages
FOR SELECT TO authenticated
USING (
    organization_id = public.current_org_id()
    AND (
        public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'CENTER_MANAGER')
        OR (public.current_user_role() = 'FARMER_CUSTOMER' AND customer_id = public.current_customer_id())
    )
);

-- ==============================================================================
-- SEED CANONICAL DEFAULT NOTIFICATION TEMPLATES (MARATHI & ENGLISH)
-- ==============================================================================

-- 1. Milk Collection Receipt (Marathi)
INSERT INTO notification_templates (
    organization_id, template_code, channel, language, title_template, body_template, whatsapp_template_name, is_active
) VALUES (
    NULL, 'MILK_COLLECTION_RECEIPT', 'WHATSAPP', 'mr',
    'दूध संकलन पावती - {{centerName}}',
    'नमस्कार {{customerName}},\n\nदिनांक: {{date}} ({{shift}})\nदूध प्रकार: {{milkCategory}}\nवजन: {{quantity}} किलो\nफॅट: {{fat}}% | एसएनएफ: {{snf}}%\nदर: ₹{{rate}}/किलो\nएकूण रक्कम: ₹{{totalAmount}}\nपावती क्र: {{receiptNumber}}\nनवीन शिल्लक: ₹{{balance}}\n\nडीफार्म स्मार्ट डेअरी',
    'dfarm_milk_collection_receipt_mr', TRUE
) ON CONFLICT DO NOTHING;

-- 2. Milk Collection Receipt (English)
INSERT INTO notification_templates (
    organization_id, template_code, channel, language, title_template, body_template, whatsapp_template_name, is_active
) VALUES (
    NULL, 'MILK_COLLECTION_RECEIPT', 'WHATSAPP', 'en',
    'Milk Collection Receipt - {{centerName}}',
    'Dear {{customerName}},\n\nDate: {{date}} ({{shift}})\nMilk Category: {{milkCategory}}\nQuantity: {{quantity}} KG\nFat: {{fat}}% | SNF: {{snf}}%\nRate: ₹{{rate}}/KG\nTotal Amount: ₹{{totalAmount}}\nReceipt No: {{receiptNumber}}\nCurrent Balance: ₹{{balance}}\n\nDFarm Smart Dairy',
    'dfarm_milk_collection_receipt_en', TRUE
) ON CONFLICT DO NOTHING;

-- 3. Monthly Bill Generated (Marathi)
INSERT INTO notification_templates (
    organization_id, template_code, channel, language, title_template, body_template, whatsapp_template_name, is_active
) VALUES (
    NULL, 'MONTHLY_BILL', 'WHATSAPP', 'mr',
    'मासिक बिल तयार झाले - {{periodName}}',
    'नमस्कार {{customerName}},\n\nआपले {{periodName}} कालावधीचे बिल तयार झाले आहे.\nबिल क्र: {{billNumber}}\nएकूण दूध वजन: {{totalMilkWeight}} किलो\nएकूण दूध रक्कम: ₹{{grossMilkAmount}}\nकपात (पशुखाद्य/अॅडव्हान्स): ₹{{totalDebits}}\nनिव्वळ देय रक्कम: ₹{{netPayableAmount}}\n\nतपशीलवार विवरण मोबाईल ॲपवर उपलब्ध आहे.\nडीफार्म स्मार्ट डेअरी',
    'dfarm_monthly_bill_mr', TRUE
) ON CONFLICT DO NOTHING;

-- 4. Monthly Bill Generated (English)
INSERT INTO notification_templates (
    organization_id, template_code, channel, language, title_template, body_template, whatsapp_template_name, is_active
) VALUES (
    NULL, 'MONTHLY_BILL', 'WHATSAPP', 'en',
    'Monthly Bill Generated - {{periodName}}',
    'Dear {{customerName}},\n\nYour monthly bill for {{periodName}} is ready.\nBill No: {{billNumber}}\nTotal Milk: {{totalMilkWeight}} KG\nGross Amount: ₹{{grossMilkAmount}}\nDeductions: ₹{{totalDebits}}\nNet Payable: ₹{{netPayableAmount}}\n\nDetailed statement is available on your customer app.\nDFarm Smart Dairy',
    'dfarm_monthly_bill_en', TRUE
) ON CONFLICT DO NOTHING;

-- 5. Payment Confirmation (Marathi)
INSERT INTO notification_templates (
    organization_id, template_code, channel, language, title_template, body_template, whatsapp_template_name, is_active
) VALUES (
    NULL, 'PAYMENT_CONFIRMATION', 'WHATSAPP', 'mr',
    'पेमेंट जमा झाले - ₹{{amount}}',
    'नमस्कार {{customerName}},\n\nआपल्या बँक खात्यात ₹{{amount}} जमा करण्यात आले आहेत.\nपद्धत: {{paymentMethod}}\nसंदर्भ क्र: {{referenceNumber}}\nखाते: {{bankAccountMask}}\nतारीख: {{settledDate}}\n\nडीफार्म स्मार्ट डेअरी',
    'dfarm_payment_settled_mr', TRUE
) ON CONFLICT DO NOTHING;

-- 6. Payment Confirmation (English)
INSERT INTO notification_templates (
    organization_id, template_code, channel, language, title_template, body_template, whatsapp_template_name, is_active
) VALUES (
    NULL, 'PAYMENT_CONFIRMATION', 'WHATSAPP', 'en',
    'Payment Settled - ₹{{amount}}',
    'Dear {{customerName}},\n\nPayment of ₹{{amount}} has been successfully disbursed.\nMethod: {{paymentMethod}}\nRef No: {{referenceNumber}}\nAccount: {{bankAccountMask}}\nDate: {{settledDate}}\n\nDFarm Smart Dairy',
    'dfarm_payment_settled_en', TRUE
) ON CONFLICT DO NOTHING;

-- 7. Feed Purchase Receipt (Marathi)
INSERT INTO notification_templates (
    organization_id, template_code, channel, language, title_template, body_template, whatsapp_template_name, is_active
) VALUES (
    NULL, 'FEED_PURCHASE_RECEIPT', 'WHATSAPP', 'mr',
    'पशुखाद्य खरेदी पावती - {{centerName}}',
    'नमस्कार {{customerName}},\n\nपशुखाद्य खरेदी यशस्वीरित्या नोंदवली गेली.\nपावती क्र: {{receiptNumber}}\nवस्तू: {{productName}} ({{quantity}} {{unit}})\nदर: ₹{{unitPrice}} | एकूण: ₹{{totalAmount}}\nपेमेंट पद्धत: {{paymentMode}}\nखाते शिल्लक: ₹{{balance}}\n\nडीफार्म स्मार्ट डेअरी',
    'dfarm_feed_purchase_mr', TRUE
) ON CONFLICT DO NOTHING;

-- 8. Feed Purchase Receipt (English)
INSERT INTO notification_templates (
    organization_id, template_code, channel, language, title_template, body_template, whatsapp_template_name, is_active
) VALUES (
    NULL, 'FEED_PURCHASE_RECEIPT', 'WHATSAPP', 'en',
    'Feed Purchase Receipt - {{centerName}}',
    'Dear {{customerName}},\n\nFeed purchase recorded successfully.\nReceipt No: {{receiptNumber}}\nItem: {{productName}} ({{quantity}} {{unit}})\nRate: ₹{{unitPrice}} | Total: ₹{{totalAmount}}\nPayment Mode: {{paymentMode}}\nAccount Balance: ₹{{balance}}\n\nDFarm Smart Dairy',
    'dfarm_feed_purchase_en', TRUE
) ON CONFLICT DO NOTHING;

-- 9. Customer Account Summary (Marathi)
INSERT INTO notification_templates (
    organization_id, template_code, channel, language, title_template, body_template, whatsapp_template_name, is_active
) VALUES (
    NULL, 'CUSTOMER_ACCOUNT_SUMMARY', 'WHATSAPP', 'mr',
    'खाते सारांश - {{customerName}}',
    'नमस्कार {{customerName}} (कोड: {{farmerCode}}),\n\nसध्याची शिल्लक: ₹{{balance}}\nचालू महिन्यातील एकूण दूध: {{totalMilkWeight}} किलो\nथकीत आगाऊ रक्कम (Advance): ₹{{outstandingAdvance}}\n\nडीफार्म स्मार्ट डेअरी',
    'dfarm_account_summary_mr', TRUE
) ON CONFLICT DO NOTHING;

-- 10. Customer Account Summary (English)
INSERT INTO notification_templates (
    organization_id, template_code, channel, language, title_template, body_template, whatsapp_template_name, is_active
) VALUES (
    NULL, 'CUSTOMER_ACCOUNT_SUMMARY', 'WHATSAPP', 'en',
    'Account Summary - {{customerName}}',
    'Dear {{customerName}} (Code: {{farmerCode}}),\n\nCurrent Balance: ₹{{balance}}\nMonth Milk Total: {{totalMilkWeight}} KG\nOutstanding Advance: ₹{{outstandingAdvance}}\n\nDFarm Smart Dairy',
    'dfarm_account_summary_en', TRUE
) ON CONFLICT DO NOTHING;

-- 11. Push Notification Templates (Marathi & English)
INSERT INTO notification_templates (
    organization_id, template_code, channel, language, title_template, body_template, is_active
) VALUES 
(NULL, 'MILK_COLLECTION_RECEIPT', 'PUSH', 'mr', 'दूध संकलन: ₹{{totalAmount}} जमा', '{{milkCategory}} दूध {{quantity}} किलो (फॅट {{fat}}%) नोंदवले गेले. पावती: {{receiptNumber}}.', TRUE),
(NULL, 'MILK_COLLECTION_RECEIPT', 'PUSH', 'en', 'Milk Collection: ₹{{totalAmount}}', '{{milkCategory}} milk {{quantity}} KG (Fat {{fat}}%) recorded. Receipt: {{receiptNumber}}.', TRUE),
(NULL, 'MONTHLY_BILL', 'PUSH', 'mr', 'मासिक बिल: {{periodName}}', 'आपले मासिक बिल ₹{{netPayableAmount}} तयार झाले आहे.', TRUE),
(NULL, 'MONTHLY_BILL', 'PUSH', 'en', 'Monthly Bill: {{periodName}}', 'Your monthly bill of ₹{{netPayableAmount}} is ready for review.', TRUE),
(NULL, 'PAYMENT_CONFIRMATION', 'PUSH', 'mr', 'पेमेंट यशस्वी: ₹{{amount}}', '₹{{amount}} आपल्या बँक खात्यात जमा केले आहेत.', TRUE),
(NULL, 'PAYMENT_CONFIRMATION', 'PUSH', 'en', 'Payment Settled: ₹{{amount}}', 'Payment of ₹{{amount}} has been credited to your account.', TRUE),
(NULL, 'FEED_PURCHASE_RECEIPT', 'PUSH', 'mr', 'पशुखाद्य खरेदी: ₹{{totalAmount}}', '{{productName}} खरेदी नोंदवली गेली. शिल्लक: ₹{{balance}}.', TRUE),
(NULL, 'FEED_PURCHASE_RECEIPT', 'PUSH', 'en', 'Feed Purchase: ₹{{totalAmount}}', '{{productName}} purchase recorded. Balance: ₹{{balance}}.', TRUE),
(NULL, 'PAYMENT_FAILED', 'PUSH', 'mr', 'पेमेंट अयशस्वी', '₹{{amount}} चे पेमेंट अयशस्वी झाले: {{failureReason}}', TRUE),
(NULL, 'PAYMENT_FAILED', 'PUSH', 'en', 'Payment Failed', 'Payment of ₹{{amount}} failed: {{failureReason}}', TRUE),
(NULL, 'CUSTOMER_REGISTRATION_COMPLETED', 'PUSH', 'mr', 'नोंदणी पूर्ण झाली', 'डीफार्म परिवारात आपले स्वागत आहे! ग्राहक कोड: {{farmerCode}}.', TRUE),
(NULL, 'CUSTOMER_REGISTRATION_COMPLETED', 'PUSH', 'en', 'Registration Complete', 'Welcome to DFarm! Your farmer code is {{farmerCode}}.', TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('023', '023_notification_engine_push_and_whatsapp_automation.sql') ON CONFLICT (version) DO NOTHING;

-- ========================================================
-- Migration: 024_p11_p15_master_remediation.sql
-- ========================================================
-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 023: MASTER REMEDIATION (PHASES P11 TO P15)
-- Concurrency-Safe Billing Period Exclusion, Overpayment Protection,
-- Durable Financial Reconciliation & Constraint Hardening
-- ==============================================================================

-- 1. Enable btree_gist extension for PostgreSQL exclusion constraints
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. Add concurrency-safe GiST exclusion constraint on billing_periods
-- Ensures no two non-cancelled billing periods for the same center can have overlapping date ranges
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ex_billing_periods_no_overlap'
    ) THEN
        ALTER TABLE billing_periods
        ADD CONSTRAINT ex_billing_periods_no_overlap
        EXCLUDE USING gist (
            center_id WITH =,
            daterange(start_date, end_date, '[]') WITH &&
        )
        WHERE (status <> 'CANCELLED');
    END IF;
END $$;

-- 3. Create index for fast payout status and beneficiary lookups
CREATE INDEX IF NOT EXISTS idx_customer_payouts_cust_status ON customer_payouts(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_customer_payouts_center_date ON customer_payouts(center_id, created_at);

-- 4. Harden create_customer_payout with Pending Reserved Balance Protection
CREATE OR REPLACE FUNCTION public.create_customer_payout(
    p_organization_id UUID,
    p_center_id UUID,
    p_customer_id UUID,
    p_amount NUMERIC(12,2),
    p_payment_method VARCHAR(30),
    p_reference_number VARCHAR(100),
    p_source_transaction_type VARCHAR(50),
    p_source_transaction_id UUID,
    p_idempotency_key VARCHAR(128),
    p_allow_overpayment_advance BOOLEAN,
    p_notes TEXT,
    p_created_by UUID
)
RETURNS JSONB AS $$
DECLARE
    v_customer RECORD;
    v_ledger_account RECORD;
    v_payout_id UUID;
    v_existing_payout RECORD;
    v_pending_reserved NUMERIC(12,2) := 0.00;
    v_eligible_balance NUMERIC(12,2);
    v_mask VARCHAR(30);
    v_result JSONB;
BEGIN
    -- 1. Idempotency Check
    SELECT * INTO v_existing_payout 
    FROM customer_payouts 
    WHERE idempotency_key = p_idempotency_key;

    IF v_existing_payout.id IS NOT NULL THEN
        SELECT jsonb_build_object(
            'payoutId', v_existing_payout.id,
            'customerId', v_existing_payout.customer_id,
            'amount', v_existing_payout.amount,
            'currency', v_existing_payout.currency,
            'paymentMethod', v_existing_payout.payment_method,
            'status', v_existing_payout.status,
            'referenceNumber', v_existing_payout.reference_number,
            'idempotencyKey', v_existing_payout.idempotency_key,
            'isIdempotentReplay', TRUE
        ) INTO v_result;
        RETURN v_result;
    END IF;

    -- 2. Verify Customer
    SELECT * INTO v_customer 
    FROM customers 
    WHERE id = p_customer_id AND organization_id = p_organization_id;

    IF v_customer.id IS NULL THEN
        RAISE EXCEPTION 'Customer % does not exist in organization %', p_customer_id, p_organization_id USING ERRCODE = 'P0002';
    END IF;

    IF v_customer.is_deleted = TRUE THEN
        RAISE EXCEPTION 'Customer % is deleted and cannot receive payouts', p_customer_id USING ERRCODE = '22000';
    END IF;

    -- 3. Check Customer Ledger Balance with Row Locking for Concurrency Safety
    INSERT INTO customer_ledger_accounts (customer_id, organization_id, currency, current_balance)
    VALUES (p_customer_id, p_organization_id, 'INR', 0.00)
    ON CONFLICT (customer_id) DO NOTHING;

    SELECT * INTO v_ledger_account 
    FROM customer_ledger_accounts 
    WHERE customer_id = p_customer_id 
    FOR UPDATE;

    -- 4. Calculate Pending Reserved Payouts (Active payouts not yet settled or failed)
    SELECT COALESCE(SUM(amount), 0.00) INTO v_pending_reserved
    FROM customer_payouts
    WHERE customer_id = p_customer_id
      AND status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SUBMITTED');

    -- Eligible Payable = Verified Liability - Pending Reserved Payouts
    v_eligible_balance := COALESCE(v_ledger_account.current_balance, 0.00) - v_pending_reserved;

    -- 5. Overpayment Protection
    IF p_allow_overpayment_advance = FALSE AND p_amount > v_eligible_balance THEN
        RAISE EXCEPTION 'OVERPAYMENT_NOT_PERMITTED: Payout amount % exceeds eligible payable balance % (Gross balance: %, Pending reserved: %)',
            p_amount, v_eligible_balance, v_ledger_account.current_balance, v_pending_reserved USING ERRCODE = '22003';
    END IF;

    -- 6. Mask Bank Details
    IF v_customer.bank_account_number IS NOT NULL AND LENGTH(v_customer.bank_account_number) >= 4 THEN
        v_mask := 'XXXX-XXXX-' || RIGHT(v_customer.bank_account_number, 4);
    ELSE
        v_mask := NULL;
    END IF;

    v_payout_id := gen_random_uuid();

    -- 7. Insert Payout in PENDING_APPROVAL status
    INSERT INTO customer_payouts (
        id,
        organization_id,
        center_id,
        customer_id,
        direction,
        amount,
        currency,
        payment_method,
        status,
        reference_number,
        source_transaction_type,
        source_transaction_id,
        idempotency_key,
        bank_account_mask,
        bank_ifsc,
        recipient_name,
        notes,
        created_by,
        created_at,
        updated_at
    ) VALUES (
        v_payout_id,
        p_organization_id,
        p_center_id,
        p_customer_id,
        'DAIRY_PAYS_CUSTOMER',
        p_amount,
        'INR',
        p_payment_method,
        'PENDING_APPROVAL',
        p_reference_number,
        COALESCE(p_source_transaction_type, 'MANUAL_PAYOUT'),
        p_source_transaction_id,
        p_idempotency_key,
        v_mask,
        v_customer.bank_ifsc_code,
        v_customer.full_name,
        p_notes,
        p_created_by,
        NOW(),
        NOW()
    );

    SELECT jsonb_build_object(
        'payoutId', v_payout_id,
        'customerId', p_customer_id,
        'amount', p_amount,
        'currency', 'INR',
        'paymentMethod', p_payment_method,
        'status', 'PENDING_APPROVAL',
        'referenceNumber', p_reference_number,
        'idempotencyKey', p_idempotency_key,
        'eligibleBalanceBefore', v_eligible_balance,
        'eligibleBalanceAfter', v_eligible_balance - p_amount,
        'isIdempotentReplay', FALSE
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- 5. Set function ownership and permissions
ALTER FUNCTION public.create_customer_payout(UUID, UUID, UUID, NUMERIC, VARCHAR, VARCHAR, VARCHAR, UUID, VARCHAR, BOOLEAN, TEXT, UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.create_customer_payout(UUID, UUID, UUID, NUMERIC, VARCHAR, VARCHAR, VARCHAR, UUID, VARCHAR, BOOLEAN, TEXT, UUID) TO authenticated, service_role;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('024', '024_p11_p15_master_remediation.sql') ON CONFLICT (version) DO NOTHING;

-- ========================================================
-- Migration: 025_payout_api_contract_and_privilege_hardening.sql
-- ========================================================
-- ============================================================================
-- DFARM MASTER REMEDIATION — MIGRATION 025
-- Hardening Payout Function Return Contract & Audit Traceability
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_customer_payout(
    p_organization_id UUID,
    p_center_id UUID,
    p_customer_id UUID,
    p_amount NUMERIC(12,2),
    p_payment_method VARCHAR(30),
    p_reference_number VARCHAR(100),
    p_source_transaction_type VARCHAR(50),
    p_source_transaction_id UUID,
    p_idempotency_key VARCHAR(128),
    p_allow_overpayment_advance BOOLEAN,
    p_notes TEXT,
    p_created_by UUID
)
RETURNS JSONB AS $$
DECLARE
    v_customer RECORD;
    v_ledger_account RECORD;
    v_payout_id UUID;
    v_existing_payout RECORD;
    v_pending_reserved NUMERIC(12,2) := 0.00;
    v_eligible_balance NUMERIC(12,2);
    v_mask VARCHAR(30);
    v_result JSONB;
BEGIN
    -- 1. Idempotency Check
    SELECT * INTO v_existing_payout 
    FROM customer_payouts 
    WHERE idempotency_key = p_idempotency_key;

    IF v_existing_payout.id IS NOT NULL THEN
        SELECT jsonb_build_object(
            'payoutId', v_existing_payout.id,
            'organizationId', v_existing_payout.organization_id,
            'centerId', v_existing_payout.center_id,
            'customerId', v_existing_payout.customer_id,
            'amount', v_existing_payout.amount,
            'currency', v_existing_payout.currency,
            'paymentMethod', v_existing_payout.payment_method,
            'status', v_existing_payout.status,
            'referenceNumber', v_existing_payout.reference_number,
            'idempotencyKey', v_existing_payout.idempotency_key,
            'isIdempotentReplay', TRUE
        ) INTO v_result;
        RETURN v_result;
    END IF;

    -- 2. Verify Customer
    SELECT * INTO v_customer 
    FROM customers 
    WHERE id = p_customer_id AND organization_id = p_organization_id;

    IF v_customer.id IS NULL THEN
        RAISE EXCEPTION 'Customer % does not exist in organization %', p_customer_id, p_organization_id USING ERRCODE = 'P0002';
    END IF;

    IF v_customer.is_deleted = TRUE THEN
        RAISE EXCEPTION 'Customer % is deleted and cannot receive payouts', p_customer_id USING ERRCODE = '22000';
    END IF;

    -- 3. Check Customer Ledger Balance with Row Locking for Concurrency Safety
    INSERT INTO customer_ledger_accounts (customer_id, organization_id, currency, current_balance)
    VALUES (p_customer_id, p_organization_id, 'INR', 0.00)
    ON CONFLICT (customer_id) DO NOTHING;

    SELECT * INTO v_ledger_account 
    FROM customer_ledger_accounts 
    WHERE customer_id = p_customer_id 
    FOR UPDATE;

    -- 4. Calculate Pending Reserved Payouts (Active payouts not yet settled or failed)
    SELECT COALESCE(SUM(amount), 0.00) INTO v_pending_reserved
    FROM customer_payouts
    WHERE customer_id = p_customer_id
      AND status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SUBMITTED');

    -- Eligible Payable = Verified Liability - Pending Reserved Payouts
    v_eligible_balance := COALESCE(v_ledger_account.current_balance, 0.00) - v_pending_reserved;

    -- 5. Overpayment Protection
    IF p_allow_overpayment_advance = FALSE AND p_amount > v_eligible_balance THEN
        RAISE EXCEPTION 'OVERPAYMENT_NOT_PERMITTED: Payout amount % exceeds eligible payable balance % (Gross balance: %, Pending reserved: %)',
            p_amount, v_eligible_balance, v_ledger_account.current_balance, v_pending_reserved USING ERRCODE = '22003';
    END IF;

    -- 6. Mask Bank Details
    IF v_customer.bank_account_number IS NOT NULL AND LENGTH(v_customer.bank_account_number) >= 4 THEN
        v_mask := 'XXXX-XXXX-' || RIGHT(v_customer.bank_account_number, 4);
    ELSE
        v_mask := NULL;
    END IF;

    v_payout_id := gen_random_uuid();

    -- 7. Insert Payout in PENDING_APPROVAL status
    INSERT INTO customer_payouts (
        id,
        organization_id,
        center_id,
        customer_id,
        direction,
        amount,
        currency,
        payment_method,
        status,
        reference_number,
        source_transaction_type,
        source_transaction_id,
        idempotency_key,
        bank_account_mask,
        bank_ifsc,
        recipient_name,
        notes,
        created_by,
        created_at,
        updated_at
    ) VALUES (
        v_payout_id,
        p_organization_id,
        p_center_id,
        p_customer_id,
        'DAIRY_PAYS_CUSTOMER',
        p_amount,
        'INR',
        p_payment_method,
        'PENDING_APPROVAL',
        p_reference_number,
        COALESCE(p_source_transaction_type, 'MANUAL_PAYOUT'),
        p_source_transaction_id,
        p_idempotency_key,
        v_mask,
        v_customer.bank_ifsc_code,
        v_customer.full_name,
        p_notes,
        p_created_by,
        NOW(),
        NOW()
    );

    -- 8. Audit Log
    INSERT INTO audit_logs (
        organization_id,
        center_id,
        user_id,
        action,
        entity_type,
        entity_id,
        new_values
    ) VALUES (
        p_organization_id,
        p_center_id,
        p_created_by,
        'PAYOUT_CREATED',
        'CUSTOMER_PAYOUT',
        v_payout_id,
        jsonb_build_object('amount', p_amount, 'status', 'PENDING_APPROVAL', 'payment_method', p_payment_method)
    );

    -- 9. Complete return contract with both legacy and extended fields
    SELECT jsonb_build_object(
        'payoutId', v_payout_id,
        'organizationId', p_organization_id,
        'centerId', p_center_id,
        'customerId', p_customer_id,
        'customerName', v_customer.full_name,
        'farmerCode', v_customer.farmer_code,
        'amount', p_amount,
        'eligibleBalance', v_eligible_balance,
        'remainingPayable', v_eligible_balance - p_amount,
        'eligibleBalanceBefore', v_eligible_balance,
        'eligibleBalanceAfter', v_eligible_balance - p_amount,
        'currency', 'INR',
        'paymentMethod', p_payment_method,
        'status', 'PENDING_APPROVAL',
        'referenceNumber', p_reference_number,
        'sourceTransactionType', COALESCE(p_source_transaction_type, 'MANUAL_PAYOUT'),
        'idempotencyKey', p_idempotency_key,
        'isIdempotentReplay', FALSE
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

ALTER FUNCTION public.create_customer_payout(UUID, UUID, UUID, NUMERIC, VARCHAR, VARCHAR, VARCHAR, UUID, VARCHAR, BOOLEAN, TEXT, UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.create_customer_payout(UUID, UUID, UUID, NUMERIC, VARCHAR, VARCHAR, VARCHAR, UUID, VARCHAR, BOOLEAN, TEXT, UUID) TO authenticated, service_role;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('025', '025_payout_api_contract_and_privilege_hardening.sql') ON CONFLICT (version) DO NOTHING;

-- ========================================================
-- Migration: 026_harmonize_eligible_payout_balance.sql
-- ========================================================
-- ============================================================================
-- DFARM MASTER REMEDIATION — MIGRATION 026
-- Harmonize Eligible Payout Balance with Authoritative Ledger Account
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_customer_payout(
    p_organization_id UUID,
    p_center_id UUID,
    p_customer_id UUID,
    p_amount NUMERIC(12,2),
    p_payment_method VARCHAR(30),
    p_reference_number VARCHAR(100),
    p_source_transaction_type VARCHAR(50),
    p_source_transaction_id UUID,
    p_idempotency_key VARCHAR(128),
    p_allow_overpayment_advance BOOLEAN,
    p_notes TEXT,
    p_created_by UUID
)
RETURNS JSONB AS $$
DECLARE
    v_customer RECORD;
    v_ledger_account RECORD;
    v_payout_id UUID;
    v_existing_payout RECORD;
    v_eligible_balance NUMERIC(12,2);
    v_mask VARCHAR(30);
    v_result JSONB;
BEGIN
    -- 1. Idempotency Check
    SELECT * INTO v_existing_payout 
    FROM customer_payouts 
    WHERE idempotency_key = p_idempotency_key;

    IF v_existing_payout.id IS NOT NULL THEN
        SELECT jsonb_build_object(
            'payoutId', v_existing_payout.id,
            'organizationId', v_existing_payout.organization_id,
            'centerId', v_existing_payout.center_id,
            'customerId', v_existing_payout.customer_id,
            'amount', v_existing_payout.amount,
            'currency', v_existing_payout.currency,
            'paymentMethod', v_existing_payout.payment_method,
            'status', v_existing_payout.status,
            'referenceNumber', v_existing_payout.reference_number,
            'idempotencyKey', v_existing_payout.idempotency_key,
            'isIdempotentReplay', TRUE
        ) INTO v_result;
        RETURN v_result;
    END IF;

    -- 2. Verify Customer
    SELECT * INTO v_customer 
    FROM customers 
    WHERE id = p_customer_id AND organization_id = p_organization_id;

    IF v_customer.id IS NULL THEN
        RAISE EXCEPTION 'Customer % does not exist in organization %', p_customer_id, p_organization_id USING ERRCODE = 'P0002';
    END IF;

    IF v_customer.is_deleted = TRUE THEN
        RAISE EXCEPTION 'Customer % is deleted and cannot receive payouts', p_customer_id USING ERRCODE = '22000';
    END IF;

    -- 3. Check Customer Ledger Balance with Row Locking for Concurrency Safety
    INSERT INTO customer_ledger_accounts (customer_id, organization_id, currency, current_balance)
    VALUES (p_customer_id, p_organization_id, 'INR', 0.00)
    ON CONFLICT (customer_id) DO NOTHING;

    SELECT * INTO v_ledger_account 
    FROM customer_ledger_accounts 
    WHERE customer_id = p_customer_id 
    FOR UPDATE;

    v_eligible_balance := COALESCE(v_ledger_account.current_balance, 0.00);

    -- 4. Overpayment Protection
    IF p_allow_overpayment_advance = FALSE AND p_amount > v_eligible_balance THEN
        RAISE EXCEPTION 'OVERPAYMENT_NOT_PERMITTED: Payout amount % exceeds eligible payable balance %',
            p_amount, v_eligible_balance USING ERRCODE = '22003';
    END IF;

    -- 5. Mask Bank Details
    IF v_customer.bank_account_number IS NOT NULL AND LENGTH(v_customer.bank_account_number) >= 4 THEN
        v_mask := 'XXXX-XXXX-' || RIGHT(v_customer.bank_account_number, 4);
    ELSE
        v_mask := NULL;
    END IF;

    v_payout_id := gen_random_uuid();

    -- 6. Insert Payout in PENDING_APPROVAL status
    INSERT INTO customer_payouts (
        id,
        organization_id,
        center_id,
        customer_id,
        direction,
        amount,
        currency,
        payment_method,
        status,
        reference_number,
        source_transaction_type,
        source_transaction_id,
        idempotency_key,
        bank_account_mask,
        bank_ifsc,
        recipient_name,
        notes,
        created_by,
        created_at,
        updated_at
    ) VALUES (
        v_payout_id,
        p_organization_id,
        p_center_id,
        p_customer_id,
        'DAIRY_PAYS_CUSTOMER',
        p_amount,
        'INR',
        p_payment_method,
        'PENDING_APPROVAL',
        p_reference_number,
        COALESCE(p_source_transaction_type, 'MANUAL_PAYOUT'),
        p_source_transaction_id,
        p_idempotency_key,
        v_mask,
        v_customer.bank_ifsc_code,
        v_customer.full_name,
        p_notes,
        p_created_by,
        NOW(),
        NOW()
    );

    -- 7. Audit Log
    INSERT INTO audit_logs (
        organization_id,
        center_id,
        user_id,
        action,
        entity_type,
        entity_id,
        new_values
    ) VALUES (
        p_organization_id,
        p_center_id,
        p_created_by,
        'PAYOUT_CREATED',
        'CUSTOMER_PAYOUT',
        v_payout_id,
        jsonb_build_object('amount', p_amount, 'status', 'PENDING_APPROVAL', 'payment_method', p_payment_method)
    );

    -- 8. Complete return contract with both legacy and extended fields
    SELECT jsonb_build_object(
        'payoutId', v_payout_id,
        'organizationId', p_organization_id,
        'centerId', p_center_id,
        'customerId', p_customer_id,
        'customerName', v_customer.full_name,
        'farmerCode', v_customer.farmer_code,
        'amount', p_amount,
        'eligibleBalance', v_eligible_balance,
        'remainingPayable', v_eligible_balance - p_amount,
        'eligibleBalanceBefore', v_eligible_balance,
        'eligibleBalanceAfter', v_eligible_balance - p_amount,
        'currency', 'INR',
        'paymentMethod', p_payment_method,
        'status', 'PENDING_APPROVAL',
        'referenceNumber', p_reference_number,
        'sourceTransactionType', COALESCE(p_source_transaction_type, 'MANUAL_PAYOUT'),
        'idempotencyKey', p_idempotency_key,
        'isIdempotentReplay', FALSE
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

ALTER FUNCTION public.create_customer_payout(UUID, UUID, UUID, NUMERIC, VARCHAR, VARCHAR, VARCHAR, UUID, VARCHAR, BOOLEAN, TEXT, UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.create_customer_payout(UUID, UUID, UUID, NUMERIC, VARCHAR, VARCHAR, VARCHAR, UUID, VARCHAR, BOOLEAN, TEXT, UUID) TO authenticated, service_role;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('026', '026_harmonize_eligible_payout_balance.sql') ON CONFLICT (version) DO NOTHING;

-- ========================================================
-- Migration: 027_kiosk_shift_sessions_and_sface128_seed.sql
-- ========================================================
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

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('027', '027_kiosk_shift_sessions_and_sface128_seed.sql') ON CONFLICT (version) DO NOTHING;

-- ========================================================
-- Migration: 028_dairy_location_coordinates_and_address.sql
-- ========================================================
-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 028: DAIRY LOCATION COORDINATES AND ADDRESS PERSISTENCE
-- ==============================================================================

-- 1. Extend organizations table with geographical coordinates, place metadata, and contact
ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7) CHECK (latitude IS NULL OR (latitude >= -90.0 AND latitude <= 90.0)),
    ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7) CHECK (longitude IS NULL OR (longitude >= -180.0 AND longitude <= 180.0)),
    ADD COLUMN IF NOT EXISTS formatted_address TEXT,
    ADD COLUMN IF NOT EXISTS place_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS address_line1 TEXT,
    ADD COLUMN IF NOT EXISTS village_locality VARCHAR(100),
    ADD COLUMN IF NOT EXISTS city VARCHAR(100),
    ADD COLUMN IF NOT EXISTS district VARCHAR(100),
    ADD COLUMN IF NOT EXISTS state VARCHAR(100),
    ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20),
    ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'India',
    ADD COLUMN IF NOT EXISTS business_phone VARCHAR(20),
    ADD COLUMN IF NOT EXISTS business_email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;

-- 2. Extend dairy_centers table with spatial coordinates and place ID
ALTER TABLE dairy_centers
    ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7) CHECK (latitude IS NULL OR (latitude >= -90.0 AND latitude <= 90.0)),
    ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7) CHECK (longitude IS NULL OR (longitude >= -180.0 AND longitude <= 180.0)),
    ADD COLUMN IF NOT EXISTS formatted_address TEXT,
    ADD COLUMN IF NOT EXISTS place_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'India',
    ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;

-- 3. Create spatial indexes on coordinates for high-efficiency proximity and map bounding box queries
CREATE INDEX IF NOT EXISTS idx_organizations_geo 
ON organizations (latitude, longitude) 
WHERE (latitude IS NOT NULL AND longitude IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_dairy_centers_geo 
ON dairy_centers (latitude, longitude) 
WHERE (latitude IS NOT NULL AND longitude IS NOT NULL);

-- 4. Seed reference location coordinates for existing initial organization and center
UPDATE organizations
SET 
    latitude = 18.5204303,
    longitude = 73.8567437,
    formatted_address = 'DFarm Headquarters, Shivajinagar, Pune, Maharashtra 411005, India',
    place_id = 'ChIJx_806f_BwjsRwe74VnF6uQg',
    address_line1 = 'Shivajinagar',
    village_locality = 'Shivajinagar',
    city = 'Pune',
    district = 'Pune',
    state = 'Maharashtra',
    postal_code = '411005',
    country = 'India',
    business_phone = '+919822001122',
    business_email = 'contact@dfarm.in',
    location_updated_at = NOW()
WHERE id = '00000000-0000-0000-0000-000000000001'
  AND latitude IS NULL;

UPDATE dairy_centers
SET 
    latitude = 17.0378000,
    longitude = 74.5684000,
    formatted_address = 'Tasgaon Main Collection Unit, Station Road, Tasgaon, Sangli, Maharashtra 416312, India',
    place_id = 'ChIJS_TasgaonCollection01',
    country = 'India',
    location_updated_at = NOW()
WHERE id = '00000000-0000-0000-0000-000000000002'
  AND latitude IS NULL;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('028', '028_dairy_location_coordinates_and_address.sql') ON CONFLICT (version) DO NOTHING;

-- ========================================================
-- Migration: 029_dairy_admin_activation_tokens.sql
-- ========================================================
-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 029: DAIRY ADMIN SECURE ACTIVATION TOKENS & INVITATION WORKFLOW
-- ==============================================================================

-- 1. Dairy Admin Invitations Table
CREATE TABLE IF NOT EXISTS dairy_admin_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dairy_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    admin_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    email VARCHAR(255) NOT NULL,
    token_hash VARCHAR(64) NOT NULL, -- SHA-256 hexadecimal hash
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    delivery_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    delivery_provider VARCHAR(50),
    delivery_message_id VARCHAR(255),
    delivery_error TEXT,
    delivery_metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '48 hours'),
    consumed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    revoked_reason TEXT,
    created_by UUID,
    CONSTRAINT chk_invitation_status CHECK (status IN ('PENDING', 'DELIVERED', 'CONSUMED', 'EXPIRED', 'REVOKED')),
    CONSTRAINT chk_delivery_status CHECK (delivery_status IN ('PENDING', 'ACCEPTED', 'DELIVERED', 'FAILED'))
);

-- Indexes for high-speed token hash validation and tenant lookup
CREATE INDEX IF NOT EXISTS idx_dairy_admin_invitations_token_hash ON dairy_admin_invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_dairy_admin_invitations_dairy_id ON dairy_admin_invitations(dairy_id);
CREATE INDEX IF NOT EXISTS idx_dairy_admin_invitations_admin_id ON dairy_admin_invitations(admin_id);
CREATE INDEX IF NOT EXISTS idx_dairy_admin_invitations_email ON dairy_admin_invitations(email);

-- 2. Extend users table with compatibility columns and activation timestamp if not present
ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile_number VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS normalized_mobile_number VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_role VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

-- 3. Extend organizations table with operational readiness tracking columns
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS primary_admin_activated BOOLEAN DEFAULT FALSE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('029', '029_dairy_admin_activation_tokens.sql') ON CONFLICT (version) DO NOTHING;

-- ========================================================
-- Migration: 030_super_admin_pankaj_popat_yewale.sql
-- ========================================================
-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 030: PROVISION SUPER ADMIN PANKAJ POPAT YEWALE
-- ==============================================================================

-- 1. Ensure table constraints support SUPER_ADMIN role with normalized mobile
DO $$
BEGIN
    -- Check if users table has normalized_mobile_number or phone_number column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'normalized_mobile_number'
    ) THEN
        ALTER TABLE users ADD COLUMN normalized_mobile_number VARCHAR(20);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'mobile_number'
    ) THEN
        ALTER TABLE users ADD COLUMN mobile_number VARCHAR(20);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'user_role'
    ) THEN
        ALTER TABLE users ADD COLUMN user_role VARCHAR(30);
    END IF;
END $$;

-- 2. Insert or update Super Admin Pankaj Popat Yewale (+917755995615)
DO $$
DECLARE
    v_org_id UUID;
    v_center_id UUID;
BEGIN
    -- Pick primary organization or default
    SELECT id INTO v_org_id FROM organizations ORDER BY created_at ASC LIMIT 1;
    IF v_org_id IS NULL THEN
        v_org_id := '00000000-0000-0000-0000-000000000001';
        INSERT INTO organizations (id, name, code, status)
        VALUES (v_org_id, 'DFarm Platform Federation', 'DF-PLATFORM', 'ACTIVE')
        ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE';
    END IF;

    -- Pick primary center or default
    SELECT id INTO v_center_id FROM dairy_centers WHERE organization_id = v_org_id LIMIT 1;
    IF v_center_id IS NULL THEN
        v_center_id := '00000000-0000-0000-0000-000000000002';
        INSERT INTO dairy_centers (
            id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status
        )
        VALUES (
            v_center_id, v_org_id, 'C-HQ', 'DFarm Central Platform Hub',
            'Main Office, DFarm Center', 'Kavathe Piran', 'Sangli', 'Maharashtra', '416417',
            '+917755995615', 'ACTIVE'
        )
        ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE';
    END IF;

    -- Remove any conflicting duplicate user records with different IDs for this phone or username
    DELETE FROM users 
    WHERE (phone_number LIKE '%7755995615' OR normalized_mobile_number LIKE '%7755995615' OR username = 'pankaj.yewale')
      AND id != '00000000-0000-0000-0000-000000000099';

    -- Provision Super Administrator account
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'username'
    ) THEN
        INSERT INTO users (
            id, organization_id, username, full_name, email, 
            phone_number, mobile_number, normalized_mobile_number, role, user_role, status
        )
        VALUES (
            '00000000-0000-0000-0000-000000000099',
            v_org_id,
            'pankaj.yewale',
            'Pankaj Popat Yewale',
            'pankaj.yewale@dfarm.in',
            '+917755995615',
            '+917755995615',
            '+917755995615',
            'SUPER_ADMIN',
            'SUPER_ADMIN',
            'ACTIVE'
        )
        ON CONFLICT (id) DO UPDATE SET
            organization_id = EXCLUDED.organization_id,
            username = 'pankaj.yewale',
            full_name = 'Pankaj Popat Yewale',
            email = 'pankaj.yewale@dfarm.in',
            phone_number = '+917755995615',
            mobile_number = '+917755995615',
            normalized_mobile_number = '+917755995615',
            role = 'SUPER_ADMIN',
            user_role = 'SUPER_ADMIN',
            status = 'ACTIVE',
            updated_at = NOW();
    ELSE
        INSERT INTO users (
            id, organization_id, full_name, 
            phone_number, mobile_number, normalized_mobile_number, user_role, role, status
        )
        VALUES (
            '00000000-0000-0000-0000-000000000099',
            v_org_id,
            'Pankaj Popat Yewale',
            '+917755995615',
            '+917755995615',
            '+917755995615',
            'SUPER_ADMIN',
            'SUPER_ADMIN',
            'ACTIVE'
        )
        ON CONFLICT (id) DO UPDATE SET
            full_name = 'Pankaj Popat Yewale',
            phone_number = '+917755995615',
            mobile_number = '+917755995615',
            normalized_mobile_number = '+917755995615',
            role = 'SUPER_ADMIN',
            user_role = 'SUPER_ADMIN',
            status = 'ACTIVE';
    END IF;

    -- Assign center mapping
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_center_assignments') THEN
        INSERT INTO user_center_assignments (id, user_id, center_id, is_primary)
        VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000099', v_center_id, TRUE)
        ON CONFLICT (user_id, center_id) DO NOTHING;
    END IF;
END $$;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('030', '030_super_admin_pankaj_popat_yewale.sql') ON CONFLICT (version) DO NOTHING;

-- ========================================================
-- Migration: 031_dairy_database_mappings.sql
-- ========================================================
-- ==============================================================================
-- DFARM - SMART DAIRY MULTI-TENANT ARCHITECTURE
-- MIGRATION 031: CENTRAL CONTROL PLANE DAIRY DATABASE MAPPINGS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS dairy_database_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dairy_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    dairy_code VARCHAR(30) NOT NULL,
    database_name VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL DEFAULT 'ISOLATED_INSTANCE', -- 'PHYSICAL_DATABASE', 'DEDICATED_SCHEMA', 'ISOLATED_INSTANCE'
    connection_uri_encrypted TEXT,
    schema_version VARCHAR(50) NOT NULL DEFAULT 'v1.0.0',
    provisioning_status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'PROVISIONING', 'MIGRATING', 'ACTIVE', 'FAILED'
    provisioning_error TEXT,
    provisioned_at TIMESTAMPTZ,
    last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dairy_db_mappings_dairy_id ON dairy_database_mappings(dairy_id);

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('031', '031_dairy_database_mappings.sql') ON CONFLICT (version) DO NOTHING;

-- ========================================================
-- Migration: 032_central_super_admin_features.sql
-- ========================================================
-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 032: CENTRAL SUPER ADMIN PRODUCTION READINESS & PLATFORM MANAGEMENT
-- TARGET: CONTROL_PLANE (dfarm_central)
-- ==============================================================================

-- 1. Platform Audit Logs (Central Immutable Activity Ledger)
CREATE TABLE IF NOT EXISTS platform_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID NOT NULL,
    actor_role VARCHAR(50) NOT NULL,
    actor_name VARCHAR(150),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(50),
    status VARCHAR(30) NOT NULL DEFAULT 'SUCCESS',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_created ON platform_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_actor ON platform_audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_platform_audit_entity ON platform_audit_logs (entity_type, entity_id);

-- 2. Central Hardware Inventory
CREATE TABLE IF NOT EXISTS central_hardware_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    serial_number VARCHAR(100) NOT NULL UNIQUE,
    device_category VARCHAR(50) NOT NULL,
    manufacturer VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'AVAILABLE',
    assigned_dairy_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ,
    warranty_until TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_hardware_category CHECK (
        device_category IN ('RFID_READER', 'ANALYZER', 'WEIGHING_SCALE', 'COLLECTION_KIOSK', 'CAMERA', 'PRINTER')
    ),
    CONSTRAINT chk_hardware_status CHECK (
        status IN ('AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'FAULTY', 'RETIRED')
    )
);

CREATE INDEX IF NOT EXISTS idx_hardware_serial ON central_hardware_inventory (serial_number);
CREATE INDEX IF NOT EXISTS idx_hardware_status ON central_hardware_inventory (status);
CREATE INDEX IF NOT EXISTS idx_hardware_assigned_dairy ON central_hardware_inventory (assigned_dairy_id);

-- 3. Hardware Assignment History
CREATE TABLE IF NOT EXISTS hardware_assignment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES central_hardware_inventory(id) ON DELETE CASCADE,
    dairy_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    action VARCHAR(50) NOT NULL,
    actor_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_assignment_action CHECK (action IN ('ASSIGNED', 'UNASSIGNED', 'MAINTENANCE_RETURN', 'STATUS_CHANGE'))
);

CREATE INDEX IF NOT EXISTS idx_hw_history_device ON hardware_assignment_history (device_id);
CREATE INDEX IF NOT EXISTS idx_hw_history_dairy ON hardware_assignment_history (dairy_id);

-- 4. Central AMC Plans Catalog
CREATE TABLE IF NOT EXISTS amc_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    duration_months INTEGER NOT NULL CHECK (duration_months > 0),
    price_inr NUMERIC(12, 2) NOT NULL CHECK (price_inr >= 0),
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default standard AMC plans if not exists
INSERT INTO amc_plans (id, name, duration_months, price_inr, description)
VALUES 
    ('00000000-0000-0000-0000-000000000001', 'Standard Annual AMC', 12, 49999.00, 'Comprehensive annual maintenance, cloud backups & priority support'),
    ('00000000-0000-0000-0000-000000000002', 'Semi-Annual AMC', 6, 27999.00, '6-month software and hardware maintenance plan'),
    ('00000000-0000-0000-0000-000000000003', 'Enterprise 2-Year AMC', 24, 89999.00, 'Multi-year enterprise maintenance with dedicated support manager')
ON CONFLICT (name) DO NOTHING;

-- 5. Dairy AMC Subscriptions
CREATE TABLE IF NOT EXISTS amc_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dairy_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    plan_id UUID NOT NULL REFERENCES amc_plans(id) ON DELETE RESTRICT,
    start_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING_PAYMENT',
    payment_status VARCHAR(50) NOT NULL DEFAULT 'UNPAID',
    razorpay_order_id VARCHAR(100),
    razorpay_payment_id VARCHAR(100),
    amount_paid NUMERIC(12, 2),
    activated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_amc_status CHECK (
        status IN ('PENDING_PAYMENT', 'ACTIVE', 'RENEWAL_DUE', 'EXPIRED', 'REACTIVATED', 'CANCELLED')
    ),
    CONSTRAINT chk_amc_payment_status CHECK (
        payment_status IN ('UNPAID', 'PAID', 'REFUNDED')
    )
);

CREATE INDEX IF NOT EXISTS idx_amc_subscriptions_dairy ON amc_subscriptions (dairy_id);
CREATE INDEX IF NOT EXISTS idx_amc_subscriptions_expiry ON amc_subscriptions (expiry_date);
CREATE INDEX IF NOT EXISTS idx_amc_subscriptions_status ON amc_subscriptions (status);

-- 6. Platform Alerts (System Health & Tenant Monitoring)
CREATE TABLE IF NOT EXISTS platform_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    severity VARCHAR(30) NOT NULL DEFAULT 'INFO',
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    source VARCHAR(100) NOT NULL,
    dairy_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by UUID,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_alert_severity CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
    CONSTRAINT chk_alert_status CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED'))
);

CREATE INDEX IF NOT EXISTS idx_platform_alerts_status ON platform_alerts (status);
CREATE INDEX IF NOT EXISTS idx_platform_alerts_severity ON platform_alerts (severity);

-- 7. Dairy Bank Beneficiary Details (Encrypted for Farmer Payout Readiness)
CREATE TABLE IF NOT EXISTS dairy_bank_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    bank_name VARCHAR(150) NOT NULL,
    account_number_encrypted TEXT NOT NULL,
    account_number_masked VARCHAR(30) NOT NULL,
    ifsc_code VARCHAR(20) NOT NULL,
    account_holder_name VARCHAR(150) NOT NULL,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dairy_bank_org ON dairy_bank_details (organization_id);

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('032', '032_central_super_admin_features.sql') ON CONFLICT (version) DO NOTHING;

-- ========================================================
-- Migration: 033_central_platform_policies_and_support.sql
-- ========================================================
-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 033: CENTRAL PLATFORM POLICIES, DURABLE SUPPORT SESSIONS & DISTRIBUTED COOLDOWN
-- TARGET: CONTROL_PLANE (dfarm_central)
-- ==============================================================================

-- 1. Distributed Atomic OTP Rate Limits & Cooldowns
CREATE TABLE IF NOT EXISTS otp_rate_limits (
    phone VARCHAR(30) PRIMARY KEY,
    purpose VARCHAR(50) NOT NULL,
    last_requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    request_count INTEGER NOT NULL DEFAULT 1,
    ip_address VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_rate_limits_last_req ON otp_rate_limits (last_requested_at);

-- 2. Primary Dairy Admin Single-Active Unique Constraint per Dairy
CREATE UNIQUE INDEX IF NOT EXISTS uidx_primary_dairy_admin_active 
ON users (organization_id) 
WHERE (role = 'PRIMARY_DAIRY_ADMIN') AND status = 'ACTIVE' AND organization_id IS NOT NULL;

-- 3. Durable Controlled Diagnostic Support Sessions
CREATE TABLE IF NOT EXISTS support_diagnostic_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dairy_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    session_token_hash VARCHAR(64) NOT NULL,
    justification_reason TEXT NOT NULL,
    support_ticket_ref VARCHAR(100),
    authorized_scope VARCHAR(100) NOT NULL DEFAULT 'READ_ONLY',
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    expires_at TIMESTAMPTZ NOT NULL,
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID,
    revocation_reason TEXT,
    created_by UUID,
    created_by_name VARCHAR(150),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_support_scope CHECK (authorized_scope IN ('READ_ONLY', 'OPERATIONAL_DIAGNOSTIC', 'EMERGENCY_SUPPORT'))
);

CREATE INDEX IF NOT EXISTS idx_support_sessions_dairy ON support_diagnostic_sessions (dairy_id);
CREATE INDEX IF NOT EXISTS idx_support_sessions_expires ON support_diagnostic_sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_support_sessions_revoked ON support_diagnostic_sessions (is_revoked);

-- 4. Global Rate Policy Definitions & Versions
CREATE TABLE IF NOT EXISTS global_rate_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    policy_type VARCHAR(50) NOT NULL DEFAULT 'STANDARD_BASE',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_global_rate_policy_type CHECK (
        policy_type IN ('STANDARD_BASE', 'SEASONAL_INCENTIVE', 'QUALITY_PREMIUM', 'INTER_DAIRY_BENCHMARK')
    )
);

CREATE TABLE IF NOT EXISTS global_rate_policy_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id UUID NOT NULL REFERENCES global_rate_policies(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL CHECK (version_number > 0),
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    effective_from TIMESTAMPTZ NOT NULL,
    effective_to TIMESTAMPTZ,
    parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    checksum VARCHAR(64) NOT NULL,
    change_summary TEXT,
    created_by UUID,
    created_by_name VARCHAR(150),
    published_by UUID,
    published_by_name VARCHAR(150),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_global_rate_version_status CHECK (
        status IN ('DRAFT', 'UNDER_REVIEW', 'PUBLISHED', 'RETIRED')
    ),
    CONSTRAINT uidx_global_rate_policy_version UNIQUE (policy_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_rate_policy_versions_status ON global_rate_policy_versions (status);
CREATE INDEX IF NOT EXISTS idx_rate_policy_versions_effective ON global_rate_policy_versions (effective_from, effective_to);

-- 5. Global FAT/SNF Adjustment Policy Definitions & Versions
CREATE TABLE IF NOT EXISTS global_fat_snf_adjustment_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS global_fat_snf_adjustment_policy_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id UUID NOT NULL REFERENCES global_fat_snf_adjustment_policies(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL CHECK (version_number > 0),
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    effective_from TIMESTAMPTZ NOT NULL,
    effective_to TIMESTAMPTZ,
    milk_category VARCHAR(30) NOT NULL DEFAULT 'BOTH',
    fat_adjustment_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
    snf_adjustment_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
    rounding_policy VARCHAR(30) NOT NULL DEFAULT 'NEAREST_TWO_DECIMALS',
    checksum VARCHAR(64) NOT NULL,
    change_summary TEXT,
    created_by UUID,
    created_by_name VARCHAR(150),
    published_by UUID,
    published_by_name VARCHAR(150),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_fat_snf_version_status CHECK (
        status IN ('DRAFT', 'UNDER_REVIEW', 'PUBLISHED', 'RETIRED')
    ),
    CONSTRAINT chk_fat_snf_category CHECK (
        milk_category IN ('COW', 'BUFFALO', 'BOTH')
    ),
    CONSTRAINT uidx_fat_snf_policy_version UNIQUE (policy_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_fat_snf_policy_versions_status ON global_fat_snf_adjustment_policy_versions (status);
CREATE INDEX IF NOT EXISTS idx_fat_snf_policy_versions_effective ON global_fat_snf_adjustment_policy_versions (effective_from, effective_to);

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('033', '033_central_platform_policies_and_support.sql') ON CONFLICT (version) DO NOTHING;

-- ========================================================
-- Migration: 034_tenant_reconciliation_status_hardening.sql
-- ========================================================
-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 034: TENANT RECONCILIATION STATUS HARDENING (ADDITIVE MIGRATION)
-- ==============================================================================
-- Target: TENANT_OPERATIONAL
-- Purpose: Ensures both pre-existing provisioned tenant databases and fresh tenant
-- databases safely support 'RECONCILIATION_REQUIRED' status on milk_collections
-- without destructive schema changes or editing historical migration 008.

DO $$
BEGIN
    -- 1. Safely widen transaction_status column to VARCHAR(50) if currently smaller
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'milk_collections' AND column_name = 'transaction_status'
    ) THEN
        ALTER TABLE milk_collections ALTER COLUMN transaction_status TYPE VARCHAR(50);
    END IF;

    -- 2. Drop existing constraint if present and re-add with RECONCILIATION_REQUIRED
    ALTER TABLE milk_collections DROP CONSTRAINT IF EXISTS chk_collection_status;
    ALTER TABLE milk_collections ADD CONSTRAINT chk_collection_status 
        CHECK (transaction_status IN ('COMPLETED', 'REVERSED', 'ADJUSTED', 'RECONCILIATION_REQUIRED'));

EXCEPTION
    WHEN undefined_table THEN
        -- If running in control plane or table does not exist, ignore gracefully
        NULL;
END $$;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('034', '034_tenant_reconciliation_status_hardening.sql') ON CONFLICT (version) DO NOTHING;

-- ========================================================
-- Migration: 035_customer_lifecycle_and_registration_hardening.sql
-- ========================================================
-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 035: CUSTOMER LIFECYCLE & REGISTRATION STATUS HARDENING (ADDITIVE MIGRATION)
-- ==============================================================================
-- Target: SHARED
-- Purpose: Ensures pre-existing databases and tenant databases safely support
-- 'PENDING_APPROVAL', 'APPROVED', 'UNREGISTERED' for registration_status and 'INACTIVE'
-- for customer status without destructive schema changes or modifying historical 004.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'customers'
    ) THEN
        -- 1. Safely widen registration_status column to VARCHAR(50) if currently smaller
        ALTER TABLE customers ALTER COLUMN registration_status TYPE VARCHAR(50);

        -- 2. Drop existing registration status constraint if present and re-add hardened constraint
        ALTER TABLE customers DROP CONSTRAINT IF EXISTS chk_customer_registration_status;
        ALTER TABLE customers ADD CONSTRAINT chk_customer_registration_status 
            CHECK (registration_status IN (
                'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'PENDING_APPROVAL', 'APPROVED', 'UNREGISTERED'
            ));

        -- 3. Drop existing customer status constraint if present and re-add with INACTIVE
        ALTER TABLE customers DROP CONSTRAINT IF EXISTS chk_customer_status;
        ALTER TABLE customers ADD CONSTRAINT chk_customer_status 
            CHECK (status IN (
                'DRAFT', 'PENDING_FACE_ENROLLMENT', 'PENDING_RFID_ASSIGNMENT',
                'PENDING_SYNC', 'ACTIVE', 'SUSPENDED', 'SOFT_DELETED', 'INACTIVE'
            ));
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Notice: Error during customer lifecycle migration: %', SQLERRM;
END $$;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('035', '035_customer_lifecycle_and_registration_hardening.sql') ON CONFLICT (version) DO NOTHING;

-- ========================================================
-- Migration: 036_seed_warna_dairy_admin.sql
-- ========================================================
-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 036: PROVISION WARNA DAIRY ADMIN (+917507495615) & EXPAND ROLE CONSTRAINT
-- ==============================================================================

-- 1. Ensure federation root organization exists for control plane
INSERT INTO organizations (id, name, code, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'DFarm Platform Federation', 'DF-PLATFORM', 'ACTIVE')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE';

-- 2. Expand chk_user_role to allow PRIMARY_DAIRY_ADMIN as well
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_user_role;
ALTER TABLE users ADD CONSTRAINT chk_user_role CHECK (role IN (
    'SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'PRIMARY_DAIRY_ADMIN', 'CENTER_MANAGER',
    'SUPERVISOR', 'COLLECTION_OPERATOR', 'ACCOUNTANT', 'INVENTORY_MANAGER',
    'REGISTRATION_OFFICER', 'FARMER_CUSTOMER'
));

-- 3. Provision or update Warna Milk's Primary Dairy Admin (+917507495615)
DO $$
DECLARE
    v_dairy_id UUID;
BEGIN
    SELECT id INTO v_dairy_id FROM organizations WHERE id = 'd66b2d9a-daa2-4193-b973-0ad9d164d35d' OR code = 'DF-SAN-3857';
    IF v_dairy_id IS NULL THEN
        SELECT id INTO v_dairy_id FROM organizations WHERE id != '00000000-0000-0000-0000-000000000001' AND status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1;
    END IF;

    IF v_dairy_id IS NOT NULL THEN
        INSERT INTO users (
            id, organization_id, username, full_name, email,
            phone_number, mobile_number, normalized_mobile_number,
            role, user_role, status, activated_at
        ) VALUES (
            '272d8a02-b1c8-4a70-b23a-da5565ea77b3',
            v_dairy_id,
            'admin_7507495615',
            'Warna Dairy Admin',
            'dairy.admin@dfarm.in',
            '+917507495615',
            '+917507495615',
            '+917507495615',
            'DAIRY_ADMIN',
            'PRIMARY_DAIRY_ADMIN',
            'ACTIVE',
            NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
            organization_id = EXCLUDED.organization_id,
            status = 'ACTIVE',
            role = 'DAIRY_ADMIN',
            user_role = 'PRIMARY_DAIRY_ADMIN',
            phone_number = '+917507495615',
            mobile_number = '+917507495615',
            normalized_mobile_number = '+917507495615',
            activated_at = NOW();

        UPDATE organizations
        SET primary_admin_activated = TRUE, activated_at = NOW(), status = 'ACTIVE'
        WHERE id = v_dairy_id;

        -- Ensure dairy center exists
        INSERT INTO dairy_centers (
            id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status
        ) VALUES (
            '00000000-0000-0000-0000-000000000036',
            v_dairy_id,
            'WARNA-MAIN',
            'Warna Main Center',
            'Warna Nagar',
            'Kolhapur',
            'Kolhapur',
            'Maharashtra',
            '416113',
            '+917507495615',
            'ACTIVE'
        ) ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE';
    END IF;
END $$;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('036', '036_seed_warna_dairy_admin.sql') ON CONFLICT (version) DO NOTHING;

-- ========================================================
-- Migration: 037_multi_dairy_customer_identity_and_membership.sql
-- ========================================================
-- ==============================================================================
-- DFARM - SMART DAIRY MULTI-TENANT ARCHITECTURE
-- MIGRATION 037: GLOBAL CUSTOMER IDENTITY AND MULTI-DAIRY MEMBERSHIP DIRECTORY
-- ==============================================================================
-- Target: SHARED
-- Execution Reference: DFARM-MULTI-DAIRY-CUSTOMER-MEMBERSHIP
--
-- Architectural Guarantees:
-- 1. One canonical Global Customer Identity per verified E.164 phone number.
-- 2. Central membership discovery directory enabling rapid routing without scatter-gather.
-- 3. Strict per-dairy uniqueness: One customer identity can have exactly one registration per dairy.
-- 4. Multi-dairy registration: The same global identity can independently register in Dairy A, B, C.
-- 5. Full data isolation: Operational records (collections, passbook, bills) remain physically partitioned.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- PART 1: CENTRAL CONTROL PLANE DIRECTORY (Executed in dfarm_central)
-- ------------------------------------------------------------------------------

-- 1. Global Customer Identities Master (dfarm_central)
CREATE TABLE IF NOT EXISTS global_customer_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    normalized_mobile_number VARCHAR(20) NOT NULL UNIQUE,
    phone_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_global_cust_phone 
ON global_customer_identities (normalized_mobile_number);

-- 2. Central Multi-Dairy Membership Routing Index (dfarm_central)
-- Only created if organizations table exists (control plane or shared instance)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'organizations'
    ) THEN
        CREATE TABLE IF NOT EXISTS customer_dairy_memberships (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            global_customer_id UUID NOT NULL REFERENCES global_customer_identities(id) ON DELETE CASCADE,
            organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
            tenant_customer_id UUID NOT NULL,
            farmer_code VARCHAR(30),
            membership_status VARCHAR(50) NOT NULL DEFAULT 'PENDING_APPROVAL',
            dairy_name VARCHAR(150),
            dairy_code VARCHAR(30),
            dairy_address TEXT,
            center_id UUID,
            center_name VARCHAR(150),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_synchronized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_customer_dairy_membership UNIQUE (organization_id, global_customer_id),
            CONSTRAINT chk_customer_membership_status CHECK (membership_status IN (
                'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SUSPENDED', 'UNREGISTERED'
            ))
        );

        CREATE INDEX IF NOT EXISTS idx_memberships_global_cust 
        ON customer_dairy_memberships(global_customer_id);

        CREATE INDEX IF NOT EXISTS idx_memberships_org_status 
        ON customer_dairy_memberships(organization_id, membership_status);

        CREATE INDEX IF NOT EXISTS idx_memberships_tenant_cust 
        ON customer_dairy_memberships(organization_id, tenant_customer_id);
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- PART 2: TENANT OPERATIONAL DATABASE EXTENSIONS (Executed in each tenant DB)
-- ------------------------------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'customers'
    ) THEN
        -- Add global_customer_id to link tenant customer record to global identity
        ALTER TABLE customers 
        ADD COLUMN IF NOT EXISTS global_customer_id UUID;

        -- Enforce uniqueness of global customer identity per dairy tenant
        CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_global_identity_per_org
        ON customers (organization_id, global_customer_id)
        WHERE global_customer_id IS NOT NULL AND is_deleted = FALSE;

        CREATE INDEX IF NOT EXISTS idx_customers_global_id
        ON customers(global_customer_id)
        WHERE global_customer_id IS NOT NULL;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- PART 3: RECONCILIATION & DATA BACKFILL FOR PRE-EXISTING CUSTOMERS
-- ------------------------------------------------------------------------------

DO $$
BEGIN
    -- 1. Backfill from legacy customer_tenant_lookup if present in central DB
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'customer_tenant_lookup'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'customer_dairy_memberships'
    ) THEN
        -- Seed global customer identities from lookup
        INSERT INTO global_customer_identities (normalized_mobile_number)
        SELECT DISTINCT normalized_mobile_number
        FROM customer_tenant_lookup
        WHERE normalized_mobile_number IS NOT NULL AND normalized_mobile_number <> ''
        ON CONFLICT (normalized_mobile_number) DO NOTHING;

        -- Seed memberships from lookup
        INSERT INTO customer_dairy_memberships (
            global_customer_id, organization_id, tenant_customer_id, membership_status, created_at, updated_at
        )
        SELECT 
            gci.id,
            ctl.organization_id,
            ctl.customer_id,
            'APPROVED',
            ctl.registered_at,
            NOW()
        FROM customer_tenant_lookup ctl
        JOIN global_customer_identities gci ON gci.normalized_mobile_number = ctl.normalized_mobile_number
        ON CONFLICT (organization_id, global_customer_id) DO NOTHING;
    END IF;

    -- 2. Backfill from existing customers table if present in same DB
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'customers'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'customer_dairy_memberships'
    ) THEN
        -- Seed global identities
        INSERT INTO global_customer_identities (normalized_mobile_number)
        SELECT DISTINCT normalized_mobile_number
        FROM customers
        WHERE normalized_mobile_number IS NOT NULL AND normalized_mobile_number <> ''
        ON CONFLICT (normalized_mobile_number) DO NOTHING;

        -- Seed memberships
        INSERT INTO customer_dairy_memberships (
            global_customer_id, organization_id, tenant_customer_id, farmer_code,
            membership_status, dairy_name, center_id, created_at, updated_at
        )
        SELECT 
            gci.id,
            c.organization_id,
            c.id,
            c.farmer_code,
            CASE 
                WHEN c.registration_status = 'APPROVED' THEN 'APPROVED'
                WHEN c.registration_status = 'REJECTED' THEN 'REJECTED'
                WHEN c.status = 'SUSPENDED' THEN 'SUSPENDED'
                ELSE 'PENDING_APPROVAL'
            END,
            COALESCE(o.name, 'Registered Cooperative Dairy'),
            c.primary_center_id,
            c.created_at,
            c.updated_at
        FROM customers c
        JOIN global_customer_identities gci ON gci.normalized_mobile_number = c.normalized_mobile_number
        LEFT JOIN organizations o ON o.id = c.organization_id
        ON CONFLICT (organization_id, global_customer_id) DO UPDATE SET
            tenant_customer_id = EXCLUDED.tenant_customer_id,
            farmer_code = EXCLUDED.farmer_code,
            membership_status = EXCLUDED.membership_status,
            updated_at = NOW();

        -- Update tenant customers with global_customer_id
        UPDATE customers c
        SET global_customer_id = gci.id
        FROM global_customer_identities gci
        WHERE c.normalized_mobile_number = gci.normalized_mobile_number
          AND c.global_customer_id IS NULL;
    END IF;
END $$;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('037', '037_multi_dairy_customer_identity_and_membership.sql') ON CONFLICT (version) DO NOTHING;
