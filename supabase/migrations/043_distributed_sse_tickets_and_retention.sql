-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 043: DISTRIBUTED SSE TICKET REDEMPTIONS & OUTBOX RETENTION CLEANUP
-- ==============================================================================

-- 1. Distributed Single-Use SSE Ticket Redemptions Table
-- Enforces atomic, deployment-wide single-use redemption across all backend instances.
-- Replaying a ticket against any backend instance triggers a primary key conflict.
CREATE TABLE IF NOT EXISTS sse_ticket_redemptions (
    jti VARCHAR(64) PRIMARY KEY,
    user_id UUID,
    organization_id UUID,
    expires_at TIMESTAMPTZ NOT NULL,
    redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sse_ticket_redemptions_exp ON sse_ticket_redemptions (expires_at);

-- 2. Stored Procedure for Bounded Non-Blocking Outbox Retention Cleanup
-- Purges only PUBLISHED events older than the specified retention days.
-- Never purges PENDING, FAILED, or worker-claimed events.
CREATE OR REPLACE FUNCTION cleanup_dashboard_events_outbox(
    p_retention_days INT DEFAULT 7,
    p_batch_size INT DEFAULT 500
) RETURNS INT AS $$
DECLARE
    v_purged_count INT := 0;
BEGIN
    WITH candidate_rows AS (
        SELECT id FROM dashboard_events_outbox
        WHERE status = 'PUBLISHED'
          AND published_at < NOW() - (p_retention_days || ' days')::INTERVAL
        ORDER BY created_at ASC
        LIMIT p_batch_size
        FOR UPDATE SKIP LOCKED
    )
    DELETE FROM dashboard_events_outbox
    WHERE id IN (SELECT id FROM candidate_rows);

    GET DIAGNOSTICS v_purged_count = ROW_COUNT;
    RETURN v_purged_count;
END;
$$ LANGUAGE plpgsql;

-- 3. Optional pg_cron Scheduling (Operational Status: Active if pg_cron is enabled, else PENDING)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule(
            'dfarm_outbox_hourly_retention_cleanup',
            '0 * * * *',
            'SELECT cleanup_dashboard_events_outbox(7, 500);'
        );
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        -- pg_cron not active or insufficient privileges; in-process Node.js scheduler acts as primary
        NULL;
END;
$$;
