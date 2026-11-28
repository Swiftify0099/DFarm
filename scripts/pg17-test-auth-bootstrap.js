import pg from 'pg';
import {
  PERMITTED_DISPOSABLE_PG17_HOSTS,
  assertDisposablePg17Cluster,
} from './pg17-safety-guard.js';

const { Pool } = pg;

function assertSafeDisposableDatabaseClient(connectionString) {
  if (process.env['NODE_ENV'] !== 'test') {
    throw new Error(
      `Refusing test-only auth.uid() bootstrap: NODE_ENV must equal 'test' (got '${process.env['NODE_ENV'] || 'unset'}').`
    );
  }
  if (process.env['DFARM_ALLOW_DISPOSABLE_PG17_MUTATIONS'] !== '1') {
    throw new Error(
      'Refusing test-only auth.uid() bootstrap: DFARM_ALLOW_DISPOSABLE_PG17_MUTATIONS=1 is required.'
    );
  }
  if (connectionString) {
    const parsed = new URL(connectionString);
    const host = parsed.hostname.toLowerCase();
    if (!PERMITTED_DISPOSABLE_PG17_HOSTS.has(host)) {
      throw new Error(
        `Refusing test-only auth.uid() bootstrap against non-permitted host '${parsed.hostname}'.`
      );
    }
    const sslMode = parsed.searchParams.get('sslmode');
    if (
      sslMode === 'require' ||
      sslMode === 'verify-ca' ||
      sslMode === 'verify-full' ||
      /supabase\.|neon\.tech|render\.com|amazonaws\.com/i.test(connectionString)
    ) {
      throw new Error('Refusing test-only auth.uid() bootstrap against TLS/cloud endpoint.');
    }
  }
}

/**
 * Isolated test-only helper for disposable PostgreSQL 17 test databases that do not run GoTrue.
 * Checks pg_proc first and creates auth.uid() ONLY when absent — NEVER overwrites an existing auth.uid().
 */
export async function ensureDisposableTestAuthUid(queryable, options = {}) {
  assertSafeDisposableDatabaseClient(options.connectionString);

  const verRes = await queryable.query(
    `SELECT current_setting('server_version_num')::int AS ver_num;`
  );
  const verNum = Number(verRes.rows[0]?.ver_num || 0);
  if (verNum < 170000 || verNum >= 180000) {
    throw new Error(`Expected disposable PostgreSQL 17.x for test auth bootstrap, got ${verNum}.`);
  }

  const existing = await queryable.query(`
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid';
  `);

  if (existing.rows.length > 0) {
    return { created: false, preservedExisting: true };
  }

  await queryable.query(`CREATE SCHEMA IF NOT EXISTS auth;`);

  // Use CREATE FUNCTION (never CREATE OR REPLACE) inside an advisory/exception-free fresh check
  await queryable.query(`
    CREATE FUNCTION auth.uid()
    RETURNS uuid AS $$
    DECLARE
      claims_text text;
    BEGIN
      claims_text := NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '');
      IF claims_text IS NULL THEN
        RETURN NULL;
      END IF;
      RETURN NULLIF(claims_text::jsonb ->> 'sub', '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql STABLE;
  `);

  await queryable.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        GRANT USAGE ON SCHEMA auth TO anon;
        GRANT EXECUTE ON FUNCTION auth.uid() TO anon;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT USAGE ON SCHEMA auth TO authenticated;
        GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT USAGE ON SCHEMA auth TO service_role;
        GRANT EXECUTE ON FUNCTION auth.uid() TO service_role;
      END IF;
    END $$;
  `);

  return { created: true, preservedExisting: false };
}

/**
 * Bootstraps test-only auth.uid() on a target database URL of a verified disposable PG17 cluster.
 */
export async function bootstrapDisposableTestAuthOnUrl(targetUrl, centralClusterUrl) {
  await assertDisposablePg17Cluster({ connectionString: centralClusterUrl });
  assertSafeDisposableDatabaseClient(targetUrl);

  const pool = new Pool({
    connectionString: targetUrl,
    connectionTimeoutMillis: 5000,
    max: 1,
  });
  try {
    return await ensureDisposableTestAuthUid(pool, { connectionString: targetUrl });
  } finally {
    await pool.end();
  }
}
