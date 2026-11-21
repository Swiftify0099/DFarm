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
