-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 012: SYNC ENGINE ENHANCEMENTS, DEVICE AUTHENTICATION & IDEMPOTENCY
-- ==============================================================================

-- 1. Device Authentication and Offline Period Enhancements
ALTER TABLE devices 
    ADD COLUMN IF NOT EXISTS device_token_hash TEXT,
    ADD COLUMN IF NOT EXISTS max_offline_hours INT NOT NULL DEFAULT 72;

-- 2. Downstream Tombstone Tracking per Device
ALTER TABLE device_sync_state 
    ADD COLUMN IF NOT EXISTS downstream_tombstone_cursor BIGINT NOT NULL DEFAULT 0;

-- 3. Additional Indexes for Performance during High-Volume Sync
CREATE INDEX IF NOT EXISTS idx_sync_events_org_seq ON sync_events(organization_id, event_sequence ASC);
CREATE INDEX IF NOT EXISTS idx_sync_events_center_seq ON sync_events(center_id, event_sequence ASC);
CREATE INDEX IF NOT EXISTS idx_sync_tombstones_org_seq ON sync_tombstones(organization_id, tombstone_sequence ASC);
CREATE INDEX IF NOT EXISTS idx_sync_tombstones_center_seq ON sync_tombstones(center_id, tombstone_sequence ASC);
CREATE INDEX IF NOT EXISTS idx_milk_collections_idemp ON milk_collections(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_ledger_transactions_idemp ON ledger_transactions(idempotency_key);

-- 4. Secure RPC for Device Registration Validation
CREATE OR REPLACE FUNCTION public.register_or_authorize_device(
    p_organization_id UUID,
    p_center_id UUID,
    p_device_identifier VARCHAR(100),
    p_device_type VARCHAR(30),
    p_public_key TEXT,
    p_token_hash TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_device_id UUID;
    v_status VARCHAR(20);
    v_result JSONB;
BEGIN
    -- Check if device already exists
    SELECT id, status INTO v_device_id, v_status
    FROM devices
    WHERE device_identifier = p_device_identifier;

    IF v_device_id IS NOT NULL THEN
        -- If blocked, forbid registration
        IF v_status = 'BLOCKED' OR v_status = 'DECOMMISSIONED' THEN
            RAISE EXCEPTION 'Device % is revoked/blocked with status %', p_device_identifier, v_status USING ERRCODE = 'P0003';
        END IF;

        -- Update existing active device
        UPDATE devices
        SET organization_id = p_organization_id,
            center_id = p_center_id,
            device_type = p_device_type,
            public_key = COALESCE(p_public_key, public_key),
            device_token_hash = COALESCE(p_token_hash, device_token_hash),
            last_seen_at = NOW()
        WHERE id = v_device_id;
    ELSE
        -- Insert new device
        INSERT INTO devices (
            organization_id,
            center_id,
            device_identifier,
            device_type,
            public_key,
            device_token_hash,
            status,
            last_seen_at
        ) VALUES (
            p_organization_id,
            p_center_id,
            p_device_identifier,
            p_device_type,
            p_public_key,
            p_token_hash,
            'ACTIVE',
            NOW()
        )
        RETURNING id INTO v_device_id;

        -- Create initial sync state
        INSERT INTO device_sync_state (
            device_id,
            downstream_cursor,
            downstream_tombstone_cursor,
            updated_at
        ) VALUES (
            v_device_id,
            0,
            0,
            NOW()
        ) ON CONFLICT (device_id) DO NOTHING;
    END IF;

    SELECT jsonb_build_object(
        'device_id', d.id,
        'organization_id', d.organization_id,
        'center_id', d.center_id,
        'device_identifier', d.device_identifier,
        'device_type', d.device_type,
        'status', d.status,
        'max_offline_hours', d.max_offline_hours,
        'last_seen_at', d.last_seen_at
    ) INTO v_result
    FROM devices d
    WHERE d.id = v_device_id;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

ALTER FUNCTION public.register_or_authorize_device(UUID, UUID, VARCHAR, VARCHAR, TEXT, TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.register_or_authorize_device(UUID, UUID, VARCHAR, VARCHAR, TEXT, TEXT) TO authenticated, service_role;
