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
