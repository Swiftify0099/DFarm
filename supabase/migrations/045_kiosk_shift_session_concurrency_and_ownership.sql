-- ==============================================================================
-- DFARM - SMART DAIRY MULTI-TENANT ARCHITECTURE
-- MIGRATION 045: KIOSK SHIFT SESSION CONCURRENCY & OWNERSHIP INTEGRITY
-- ==============================================================================
-- Target: TENANT_OPERATIONAL
-- Purpose:
--   1. Prevent concurrent duplicate OPEN shift sessions for the same
--      (organization_id, center_id, device_identifier) atomically in PostgreSQL.
--   2. Add tenant-scoped lookup indexes for session_code and (center, date, shift).
--   3. Preserves historical CLOSED sessions and existing session_code uniqueness.

CREATE UNIQUE INDEX IF NOT EXISTS uq_kiosk_shift_sessions_active_open
ON kiosk_shift_sessions (organization_id, center_id, device_identifier)
WHERE (status = 'OPEN');

CREATE INDEX IF NOT EXISTS idx_kiosk_shift_sessions_org_code
ON kiosk_shift_sessions (organization_id, session_code);

CREATE INDEX IF NOT EXISTS idx_kiosk_shift_sessions_org_center_date_shift
ON kiosk_shift_sessions (organization_id, center_id, business_date, shift);
