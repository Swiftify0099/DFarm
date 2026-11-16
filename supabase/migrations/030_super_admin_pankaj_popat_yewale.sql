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
        ON CONFLICT DO NOTHING;
    END IF;

    -- Pick primary center or default
    SELECT id INTO v_center_id FROM dairy_centers WHERE organization_id = v_org_id LIMIT 1;
    IF v_center_id IS NULL THEN
        v_center_id := '00000000-0000-0000-0000-000000000002';
        INSERT INTO dairy_centers (id, organization_id, code, name, status)
        VALUES (v_center_id, v_org_id, 'C-HQ', 'DFarm Central Platform Hub', 'ACTIVE')
        ON CONFLICT DO NOTHING;
    END IF;

    -- Provision Super Administrator account
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'username'
    ) THEN
        INSERT INTO users (
            id, organization_id, username, full_name, email, 
            phone_number, normalized_mobile_number, role, status
        )
        VALUES (
            '00000000-0000-0000-0000-000000000099',
            v_org_id,
            'pankaj.yewale',
            'Pankaj Popat Yewale',
            'pankaj.yewale@dfarm.platform',
            '+917755995615',
            '+917755995615',
            'SUPER_ADMIN',
            'ACTIVE'
        )
        ON CONFLICT (id) DO UPDATE SET
            full_name = 'Pankaj Popat Yewale',
            normalized_mobile_number = '+917755995615',
            phone_number = '+917755995615',
            role = 'SUPER_ADMIN',
            status = 'ACTIVE',
            updated_at = NOW();
    ELSE
        INSERT INTO users (
            id, organization_id, full_name, 
            normalized_mobile_number, user_role, is_active, primary_center_id
        )
        VALUES (
            '00000000-0000-0000-0000-000000000099',
            v_org_id,
            'Pankaj Popat Yewale',
            '+917755995615',
            'SUPER_ADMIN',
            TRUE,
            v_center_id
        )
        ON CONFLICT (id) DO UPDATE SET
            full_name = 'Pankaj Popat Yewale',
            normalized_mobile_number = '+917755995615',
            user_role = 'SUPER_ADMIN',
            is_active = TRUE;
    END IF;

    -- Assign center mapping
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_center_assignments') THEN
        INSERT INTO user_center_assignments (id, user_id, center_id, is_primary)
        VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000099', v_center_id, TRUE)
        ON CONFLICT (user_id, center_id) DO NOTHING;
    END IF;
END $$;
