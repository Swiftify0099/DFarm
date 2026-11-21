-- ==============================================================================
-- DFARM - SMART DAIRY MULTI-TENANT ARCHITECTURE
-- MIGRATION 038: PLATFORM FEDERATION CONTROL PLANE DATABASE MAPPING
-- ==============================================================================

-- 1. Ensure platform federation root organization exists
INSERT INTO organizations (id, name, code, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'DFarm Platform Federation', 'DF-PLATFORM', 'ACTIVE')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code, status = 'ACTIVE';

-- 2. Ensure platform federation database mapping is registered and active
INSERT INTO dairy_database_mappings (
    id,
    dairy_id,
    dairy_code,
    database_name,
    resource_type,
    schema_version,
    provisioning_status,
    provisioned_at,
    last_verified_at
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'DF-PLATFORM',
    'postgres',
    'PHYSICAL_DATABASE',
    'v1.0.0',
    'ACTIVE',
    NOW(),
    NOW()
)
ON CONFLICT (dairy_id) DO UPDATE SET
    provisioning_status = 'ACTIVE',
    last_verified_at = NOW();
