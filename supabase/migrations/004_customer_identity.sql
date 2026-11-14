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
        'PENDING_SYNC', 'ACTIVE', 'SUSPENDED', 'SOFT_DELETED'
    )),
    CONSTRAINT chk_customer_registration_status CHECK (registration_status IN ('IN_PROGRESS', 'COMPLETED', 'REJECTED'))
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

