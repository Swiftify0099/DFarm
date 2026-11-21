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
