-- Migration 044: Durable token revocation table (control-plane)
-- Phase: RESTART-02.1 — DF-011 / DF-009
-- Target: CONTROL_PLANE (central database that stores revoked JTI/token-hash entries)
-- Applied to: Supabase/PostgreSQL central database
-- Idempotent: Yes (IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, CREATE OR REPLACE FUNCTION)

-- Core revocation table: stores token_key (JTI UUID or SHA-256 hex of raw token)
CREATE TABLE IF NOT EXISTS revoked_tokens (
  token_key     TEXT        PRIMARY KEY,
  revoked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,
  reason        TEXT
);

-- Index for efficient cleanup and lookup of unexpired entries
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires_at
  ON revoked_tokens (expires_at);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_revoked_at
  ON revoked_tokens (revoked_at);

-- Bounded non-blocking retention cleanup for expired revocation records only.
-- Unexpired records (expires_at > NOW()) are never deleted.
CREATE OR REPLACE FUNCTION cleanup_revoked_tokens(
  p_batch_size INT DEFAULT 500
) RETURNS INT AS $$
DECLARE
  v_purged_count INT := 0;
BEGIN
  WITH expired_batch AS (
    SELECT token_key FROM revoked_tokens
    WHERE expires_at <= NOW()
    ORDER BY expires_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM revoked_tokens
  WHERE token_key IN (SELECT token_key FROM expired_batch);

  GET DIAGNOSTICS v_purged_count = ROW_COUNT;
  RETURN v_purged_count;
END;
$$ LANGUAGE plpgsql;

-- Row-level security: prevent anon/authenticated roles from reading or mutating revoked_tokens
ALTER TABLE revoked_tokens ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'revoked_tokens' AND policyname = 'deny_all_non_service'
  ) THEN
    CREATE POLICY deny_all_non_service ON revoked_tokens
      FOR ALL
      TO PUBLIC
      USING (false);
  END IF;
END $$;
