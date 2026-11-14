-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 011: CUSTOMER LIFECYCLE ATOMIC RPCs & SUPABASE AUTH IDENTITY MAPPING
-- ==============================================================================

-- 1. Identity Mapping Columns
-- Allows mapping between Supabase auth.users(id) and DFarm internal users / customers
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE;
CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON users(auth_user_id);

ALTER TABLE customers ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE;
CREATE INDEX IF NOT EXISTS idx_customers_auth_user_id ON customers(auth_user_id);

-- 2. Atomic Customer Registration Function
-- Transactionally creates: customer, milk categories, address (if provided),
-- registration record, initial status history, sync event, and audit log.
CREATE OR REPLACE FUNCTION public.register_customer(
    p_organization_id UUID,
    p_primary_center_id UUID,
    p_farmer_code VARCHAR(30),
    p_full_name VARCHAR(150),
    p_normalized_mobile VARCHAR(20),
    p_permitted_categories VARCHAR(20)[],
    p_registered_by UUID,
    p_device_id VARCHAR(100) DEFAULT 'BACKEND_API',
    p_address JSONB DEFAULT NULL,
    p_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_customer_id UUID;
    v_farmer_code VARCHAR(30);
    v_cat VARCHAR(20);
    v_org_count INT;
    v_center_count INT;
    v_result JSONB;
BEGIN
    -- Verify organization exists
    SELECT COUNT(*) INTO v_org_count FROM organizations WHERE id = p_organization_id;
    IF v_org_count = 0 THEN
        RAISE EXCEPTION 'Organization % does not exist', p_organization_id USING ERRCODE = 'P0002';
    END IF;

    -- Verify center belongs to organization
    SELECT COUNT(*) INTO v_center_count FROM dairy_centers WHERE id = p_primary_center_id AND organization_id = p_organization_id;
    IF v_center_count = 0 THEN
        RAISE EXCEPTION 'Center % does not belong to organization %', p_primary_center_id, p_organization_id USING ERRCODE = 'P0002';
    END IF;

    -- Check duplicate mobile in organization
    IF EXISTS (
        SELECT 1 FROM customers 
        WHERE organization_id = p_organization_id 
          AND normalized_mobile_number = p_normalized_mobile 
          AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Customer with mobile number % already exists in this organization', p_normalized_mobile USING ERRCODE = '23505';
    END IF;

    -- Customer ID
    v_customer_id := COALESCE(p_id, gen_random_uuid());

    -- Determine farmer code
    IF p_farmer_code IS NOT NULL AND LENGTH(TRIM(p_farmer_code)) > 0 THEN
        v_farmer_code := TRIM(p_farmer_code);
    ELSE
        -- Auto-generate code based on center prefix or sequential number
        v_farmer_code := 'F-' || UPPER(SUBSTRING(v_customer_id::text, 1, 8));
    END IF;

    -- 1. Insert customer
    INSERT INTO customers (
        id,
        organization_id,
        primary_center_id,
        farmer_code,
        full_name,
        normalized_mobile_number,
        status,
        registration_status,
        is_deleted,
        created_at,
        updated_at
    ) VALUES (
        v_customer_id,
        p_organization_id,
        p_primary_center_id,
        v_farmer_code,
        TRIM(p_full_name),
        TRIM(p_normalized_mobile),
        'DRAFT',
        'IN_PROGRESS',
        FALSE,
        NOW(),
        NOW()
    );

    -- 2. Insert permitted milk categories
    IF p_permitted_categories IS NOT NULL AND array_length(p_permitted_categories, 1) > 0 THEN
        FOREACH v_cat IN ARRAY p_permitted_categories LOOP
            IF v_cat NOT IN ('COW', 'BUFFALO') THEN
                RAISE EXCEPTION 'Invalid milk category: %', v_cat USING ERRCODE = '22023';
            END IF;
            INSERT INTO customer_milk_categories (
                customer_id,
                milk_category,
                is_authorized,
                authorized_at,
                authorized_by
            ) VALUES (
                v_customer_id,
                v_cat,
                TRUE,
                NOW(),
                p_registered_by
            );
        END LOOP;
    END IF;

    -- 3. Insert address if provided
    IF p_address IS NOT NULL AND jsonb_typeof(p_address) = 'object' THEN
        INSERT INTO customer_addresses (
            customer_id,
            village,
            hamlet_area,
            taluka_subdistrict,
            district,
            state,
            postal_code
        ) VALUES (
            v_customer_id,
            COALESCE(p_address->>'village', 'Default Village'),
            p_address->>'hamlet_area',
            COALESCE(p_address->>'taluka_subdistrict', 'Default Taluka'),
            COALESCE(p_address->>'district', 'Default District'),
            COALESCE(p_address->>'state', 'Maharashtra'),
            COALESCE(p_address->>'postal_code', '416001')
        );
    END IF;

    -- 4. Insert registration record
    INSERT INTO customer_registration_records (
        customer_id,
        center_id,
        registered_by,
        registration_channel,
        device_id,
        completed_at
    ) VALUES (
        v_customer_id,
        p_primary_center_id,
        p_registered_by,
        'BACKEND_API',
        COALESCE(p_device_id, 'BACKEND_API'),
        NULL
    );

    -- 5. Insert initial status history
    INSERT INTO customer_status_history (
        customer_id,
        previous_status,
        new_status,
        change_reason,
        changed_by,
        changed_at
    ) VALUES (
        v_customer_id,
        NULL,
        'DRAFT',
        'Initial customer registration via Backend API',
        p_registered_by,
        NOW()
    );

    -- 6. Insert sync event for edge terminals
    INSERT INTO sync_events (
        organization_id,
        center_id,
        entity_type,
        entity_id,
        action,
        payload
    ) VALUES (
        p_organization_id,
        p_primary_center_id,
        'CUSTOMER',
        v_customer_id,
        'INSERT',
        jsonb_build_object(
            'id', v_customer_id,
            'farmer_code', v_farmer_code,
            'full_name', TRIM(p_full_name),
            'status', 'DRAFT',
            'categories', p_permitted_categories
        )
    );

    -- 7. Insert audit log
    INSERT INTO audit_logs (
        organization_id,
        center_id,
        user_id,
        action,
        entity_type,
        entity_id,
        new_values
    ) VALUES (
        p_organization_id,
        p_primary_center_id,
        p_registered_by,
        'CUSTOMER_REGISTERED',
        'CUSTOMER',
        v_customer_id,
        jsonb_build_object(
            'id', v_customer_id,
            'farmer_code', v_farmer_code,
            'full_name', TRIM(p_full_name),
            'mobile', TRIM(p_normalized_mobile)
        )
    );

    -- Build return payload
    SELECT jsonb_build_object(
        'id', c.id,
        'organization_id', c.organization_id,
        'primary_center_id', c.primary_center_id,
        'farmer_code', c.farmer_code,
        'full_name', c.full_name,
        'normalized_mobile_number', c.normalized_mobile_number,
        'status', c.status,
        'registration_status', c.registration_status,
        'is_deleted', c.is_deleted,
        'created_at', c.created_at
    ) INTO v_result
    FROM customers c
    WHERE c.id = v_customer_id;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

ALTER FUNCTION public.register_customer(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR[], UUID, VARCHAR, JSONB, UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.register_customer(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR[], UUID, VARCHAR, JSONB, UUID) TO authenticated, service_role;


-- 3. Atomic Soft Delete Customer Function
CREATE OR REPLACE FUNCTION public.soft_delete_customer(
    p_customer_id UUID,
    p_organization_id UUID,
    p_deleted_by UUID,
    p_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_center_id UUID;
    v_prev_status VARCHAR(30);
    v_result JSONB;
BEGIN
    -- Check customer exists and belongs to organization
    SELECT primary_center_id, status INTO v_center_id, v_prev_status
    FROM customers
    WHERE id = p_customer_id AND organization_id = p_organization_id;

    IF v_center_id IS NULL THEN
        RAISE EXCEPTION 'Customer % not found in organization %', p_customer_id, p_organization_id USING ERRCODE = 'P0002';
    END IF;

    -- Update customer status to SOFT_DELETED
    UPDATE customers
    SET is_deleted = TRUE,
        deleted_at = NOW(),
        deleted_by = p_deleted_by,
        deletion_reason = p_reason,
        status = 'SOFT_DELETED',
        updated_at = NOW(),
        version = version + 1
    WHERE id = p_customer_id;

    -- Record status history
    INSERT INTO customer_status_history (
        customer_id,
        previous_status,
        new_status,
        change_reason,
        changed_by,
        changed_at
    ) VALUES (
        p_customer_id,
        v_prev_status,
        'SOFT_DELETED',
        p_reason,
        p_deleted_by,
        NOW()
    );

    -- Insert sync tombstone to invalidate customer on offline counter terminals
    INSERT INTO sync_tombstones (
        organization_id,
        center_id,
        entity_type,
        entity_id,
        reason,
        deleted_at
    ) VALUES (
        p_organization_id,
        v_center_id,
        'CUSTOMER',
        p_customer_id,
        p_reason,
        NOW()
    );

    -- Insert sync event
    INSERT INTO sync_events (
        organization_id,
        center_id,
        entity_type,
        entity_id,
        action,
        payload
    ) VALUES (
        p_organization_id,
        v_center_id,
        'CUSTOMER',
        p_customer_id,
        'DELETE',
        jsonb_build_object(
            'id', p_customer_id,
            'reason', p_reason,
            'deleted_by', p_deleted_by
        )
    );

    -- Insert audit log
    INSERT INTO audit_logs (
        organization_id,
        center_id,
        user_id,
        action,
        entity_type,
        entity_id,
        old_values,
        new_values
    ) VALUES (
        p_organization_id,
        v_center_id,
        p_deleted_by,
        'CUSTOMER_SOFT_DELETED',
        'CUSTOMER',
        p_customer_id,
        jsonb_build_object('status', v_prev_status, 'is_deleted', FALSE),
        jsonb_build_object('status', 'SOFT_DELETED', 'is_deleted', TRUE, 'reason', p_reason)
    );

    SELECT jsonb_build_object(
        'id', c.id,
        'organization_id', c.organization_id,
        'status', c.status,
        'is_deleted', c.is_deleted,
        'deleted_at', c.deleted_at,
        'deletion_reason', c.deletion_reason
    ) INTO v_result
    FROM customers c
    WHERE c.id = p_customer_id;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

ALTER FUNCTION public.soft_delete_customer(UUID, UUID, UUID, TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.soft_delete_customer(UUID, UUID, UUID, TEXT) TO authenticated, service_role;


-- 4. Atomic Customer Restore Function
CREATE OR REPLACE FUNCTION public.restore_customer(
    p_customer_id UUID,
    p_organization_id UUID,
    p_restored_by UUID,
    p_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_center_id UUID;
    v_prev_status VARCHAR(30);
    v_target_status VARCHAR(30);
    v_has_active_face BOOLEAN;
    v_result JSONB;
BEGIN
    SELECT primary_center_id, status INTO v_center_id, v_prev_status
    FROM customers
    WHERE id = p_customer_id AND organization_id = p_organization_id AND is_deleted = TRUE;

    IF v_center_id IS NULL THEN
        RAISE EXCEPTION 'Soft-deleted customer % not found in organization %', p_customer_id, p_organization_id USING ERRCODE = 'P0002';
    END IF;

    -- Check if active face enrollment exists
    SELECT EXISTS (
        SELECT 1 FROM face_enrollments 
        WHERE customer_id = p_customer_id AND status = 'ACTIVE'
    ) INTO v_has_active_face;

    -- Target status: if previously completed enrollment, restore to PENDING_SYNC or ACTIVE, else DRAFT
    IF v_has_active_face THEN
        v_target_status := 'PENDING_SYNC';
    ELSE
        v_target_status := 'DRAFT';
    END IF;

    -- Restore customer
    UPDATE customers
    SET is_deleted = FALSE,
        deleted_at = NULL,
        deleted_by = NULL,
        deletion_reason = NULL,
        status = v_target_status,
        updated_at = NOW(),
        version = version + 1
    WHERE id = p_customer_id;

    -- Record status history
    INSERT INTO customer_status_history (
        customer_id,
        previous_status,
        new_status,
        change_reason,
        changed_by,
        changed_at
    ) VALUES (
        p_customer_id,
        v_prev_status,
        v_target_status,
        p_reason,
        p_restored_by,
        NOW()
    );

    -- Insert sync event
    INSERT INTO sync_events (
        organization_id,
        center_id,
        entity_type,
        entity_id,
        action,
        payload
    ) VALUES (
        p_organization_id,
        v_center_id,
        'CUSTOMER',
        p_customer_id,
        'RESTORE',
        jsonb_build_object(
            'id', p_customer_id,
            'restored_by', p_restored_by,
            'reason', p_reason,
            'target_status', v_target_status
        )
    );

    -- Insert audit log
    INSERT INTO audit_logs (
        organization_id,
        center_id,
        user_id,
        action,
        entity_type,
        entity_id,
        old_values,
        new_values
    ) VALUES (
        p_organization_id,
        v_center_id,
        p_restored_by,
        'CUSTOMER_RESTORED',
        'CUSTOMER',
        p_customer_id,
        jsonb_build_object('status', v_prev_status, 'is_deleted', TRUE),
        jsonb_build_object('status', v_target_status, 'is_deleted', FALSE, 'reason', p_reason)
    );

    SELECT jsonb_build_object(
        'id', c.id,
        'organization_id', c.organization_id,
        'status', c.status,
        'is_deleted', c.is_deleted
    ) INTO v_result
    FROM customers c
    WHERE c.id = p_customer_id;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

ALTER FUNCTION public.restore_customer(UUID, UUID, UUID, TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.restore_customer(UUID, UUID, UUID, TEXT) TO authenticated, service_role;
