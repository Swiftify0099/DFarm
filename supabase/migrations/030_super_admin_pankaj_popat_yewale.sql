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
