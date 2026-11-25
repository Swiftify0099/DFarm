-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 041: DAIRY ADMIN REALTIME MONITORING, STATION HEARTBEATS & OUTBOX
-- ==============================================================================

-- 1. Enhance Devices & Sync State Tables for Station Monitoring
ALTER TABLE devices 
    ADD COLUMN IF NOT EXISTS name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS revocation_reason TEXT;

ALTER TABLE device_sync_state
    ADD COLUMN IF NOT EXISTS pending_queue_count INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_sync_error TEXT,
    ADD COLUMN IF NOT EXISTS sync_failure_category VARCHAR(50),
    ADD COLUMN IF NOT EXISTS battery_level INT,
    ADD COLUMN IF NOT EXISTS network_mode VARCHAR(20),
    ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ;

-- 2. Transactional Dashboard Event Outbox
-- Every operational collection, session, and station lifecycle event
-- is committed transactionally before publication to the SSE transport.
CREATE TABLE IF NOT EXISTS dashboard_events_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id VARCHAR(100) NOT NULL UNIQUE,
    event_type VARCHAR(50) NOT NULL,
    schema_version INT NOT NULL DEFAULT 1,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    center_id UUID REFERENCES dairy_centers(id) ON DELETE SET NULL,
    entity_id VARCHAR(100) NOT NULL,
    aggregate_version BIGINT NOT NULL DEFAULT 1,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_outbox_status CHECK (status IN ('PENDING', 'PUBLISHED', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS idx_outbox_org_created ON dashboard_events_outbox (organization_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_outbox_org_center ON dashboard_events_outbox (organization_id, center_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_outbox_status_created ON dashboard_events_outbox (status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_outbox_event_id ON dashboard_events_outbox (event_id);

-- Enable Row Level Security
ALTER TABLE dashboard_events_outbox ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rls_dashboard_events_outbox_isolation') THEN
        CREATE POLICY rls_dashboard_events_outbox_isolation ON dashboard_events_outbox
            FOR ALL
            USING (
                organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
            );
    END IF;
END $$;
