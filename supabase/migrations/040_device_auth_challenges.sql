-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 040: DISTRIBUTED DEVICE AUTH CHALLENGES (P0 REPLAY PROTECTION)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS device_auth_challenges (
    challenge VARCHAR(64) PRIMARY KEY,
    device_identifier VARCHAR(100) NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    purpose VARCHAR(30) NOT NULL DEFAULT 'OPERATOR_LOGIN',
    failed_attempts INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ
);

-- Ensure failed_attempts column exists if table was previously created
ALTER TABLE device_auth_challenges ADD COLUMN IF NOT EXISTS failed_attempts INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_device_challenges_dev_org ON device_auth_challenges (device_identifier, organization_id);
CREATE INDEX IF NOT EXISTS idx_device_challenges_expiry ON device_auth_challenges (expires_at);

