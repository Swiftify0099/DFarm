-- ========================================================
-- DFARM REMAINING MIGRATIONS (030 TO 037)
-- Run directly in Supabase SQL Editor
-- ========================================================


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
