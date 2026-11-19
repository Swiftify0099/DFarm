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
