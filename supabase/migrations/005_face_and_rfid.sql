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

