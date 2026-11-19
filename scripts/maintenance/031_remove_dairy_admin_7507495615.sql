-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 031: PERMANENTLY REMOVE DAIRY ADMIN & RELATED RECORDS FOR +91 7507495615
-- ==============================================================================

DO $$
DECLARE
    v_target_mobile VARCHAR := '7507495615';
    v_user_ids UUID[];
    v_org_ids UUID[];
BEGIN
    -- 1. Identify matching user IDs
    SELECT ARRAY_AGG(id) INTO v_user_ids
    FROM users
    WHERE normalized_mobile_number LIKE '%' || v_target_mobile
       OR mobile_number LIKE '%' || v_target_mobile
       OR phone_number LIKE '%' || v_target_mobile
       OR username LIKE '%' || v_target_mobile;

    -- 2. Identify associated organization IDs
    SELECT ARRAY_AGG(DISTINCT organization_id) INTO v_org_ids
    FROM users
    WHERE id = ANY(v_user_ids)
      AND organization_id IS NOT NULL;

    -- Also check organizations table by business_phone
    SELECT ARRAY_CAT(v_org_ids, ARRAY_AGG(id)) INTO v_org_ids
    FROM organizations
    WHERE business_phone LIKE '%' || v_target_mobile;

    -- 3. Delete invitations
    IF v_user_ids IS NOT NULL AND array_length(v_user_ids, 1) > 0 THEN
        DELETE FROM dairy_admin_invitations
        WHERE admin_id = ANY(v_user_ids);
    END IF;

    IF v_org_ids IS NOT NULL AND array_length(v_org_ids, 1) > 0 THEN
        DELETE FROM dairy_admin_invitations
        WHERE dairy_id = ANY(v_org_ids);
    END IF;

    -- 4. Delete user center assignments
    IF v_user_ids IS NOT NULL AND array_length(v_user_ids, 1) > 0 THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_center_assignments') THEN
            DELETE FROM user_center_assignments
            WHERE user_id = ANY(v_user_ids);
        END IF;
    END IF;

    -- 5. Delete users
    IF v_user_ids IS NOT NULL AND array_length(v_user_ids, 1) > 0 THEN
        DELETE FROM users
        WHERE id = ANY(v_user_ids);
    END IF;

    -- 6. Delete dairy centers if created specifically for this admin/organization
    IF v_org_ids IS NOT NULL AND array_length(v_org_ids, 1) > 0 THEN
        -- Only delete centers for organizations that have no remaining users
        DELETE FROM dairy_centers
        WHERE organization_id = ANY(v_org_ids)
          AND NOT EXISTS (
              SELECT 1 FROM users WHERE organization_id = dairy_centers.organization_id
          );

        -- Delete organizations if no remaining users exist
        DELETE FROM organizations
        WHERE id = ANY(v_org_ids)
          AND NOT EXISTS (
              SELECT 1 FROM users WHERE organization_id = organizations.id
          );
    END IF;

    RAISE NOTICE 'Successfully purged dairy admin and related records for %', v_target_mobile;
END $$;
