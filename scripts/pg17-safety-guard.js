import pg from 'pg';

const { Pool } = pg;

export const PERMITTED_DISPOSABLE_PG17_HOSTS = new Set([
  '127.0.0.1',
  'localhost',
  'postgres',
  'postgres17',
]);

export const EXPECTED_DISPOSABLE_PG17_USER = 'postgres';
export const EXPECTED_DISPOSABLE_PG17_DB = 'dfarm_central';

/**
 * Validates all mandatory fail-closed invariants before allowing any role creation,
 * database creation, or database deletion against a disposable PostgreSQL 17 cluster.
 *
 * Refuses to rely solely on localhost or server version.
 */
export async function assertDisposablePg17Cluster(options = {}) {
  const env = options.env || process.env;
  const testPgUrl = options.connectionString ?? env['TEST_POSTGRES_URL'] ?? '';

  // 1. Explicit test environment required
  if (env['NODE_ENV'] !== 'test') {
    throw new Error(
      `Refusing disposable PG17 cluster mutation: NODE_ENV must equal 'test' (got '${env['NODE_ENV'] || 'unset'}').`
    );
  }

  // 2. Explicit disposable-cluster opt-in required
  if (env['DFARM_ALLOW_DISPOSABLE_PG17_MUTATIONS'] !== '1') {
    throw new Error(
      'Refusing disposable PG17 cluster mutation: DFARM_ALLOW_DISPOSABLE_PG17_MUTATIONS=1 is required.'
    );
  }

  if (!testPgUrl || !String(testPgUrl).trim()) {
    throw new Error('TEST_POSTGRES_URL is required for disposable PG17 cluster verification.');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(testPgUrl);
  } catch {
    throw new Error('TEST_POSTGRES_URL is not a valid URL.');
  }

  if (parsedUrl.protocol !== 'postgres:' && parsedUrl.protocol !== 'postgresql:') {
    throw new Error(`Invalid TEST_POSTGRES_URL protocol '${parsedUrl.protocol}'.`);
  }

  // 3. Target host must be explicitly permitted (and never a cloud/TLS production endpoint)
  const hostname = parsedUrl.hostname.toLowerCase();
  if (!PERMITTED_DISPOSABLE_PG17_HOSTS.has(hostname)) {
    throw new Error(
      `Refusing disposable PG17 cluster mutation against non-permitted host '${parsedUrl.hostname}'.`
    );
  }

  const sslMode = parsedUrl.searchParams.get('sslmode');
  if (
    sslMode === 'require' ||
    sslMode === 'verify-ca' ||
    sslMode === 'verify-full' ||
    /supabase\.|neon\.tech|render\.com|amazonaws\.com/i.test(testPgUrl)
  ) {
    throw new Error('Refusing disposable PG17 cluster mutation against TLS/cloud-hosted connection string.');
  }

  // 4. Expected privileged test user and expected central test database
  const urlUser = decodeURIComponent(parsedUrl.username || '');
  const urlDb = parsedUrl.pathname.replace(/^\//, '');
  if (urlUser !== EXPECTED_DISPOSABLE_PG17_USER) {
    throw new Error(
      `Refusing disposable PG17 cluster mutation: expected privileged test user '${EXPECTED_DISPOSABLE_PG17_USER}', got '${urlUser || 'unset'}'.`
    );
  }
  if (urlDb !== EXPECTED_DISPOSABLE_PG17_DB) {
    throw new Error(
      `Refusing disposable PG17 cluster mutation: expected test database '${EXPECTED_DISPOSABLE_PG17_DB}', got '${urlDb || 'unset'}'.`
    );
  }

  const ownPool = !options.pool;
  const pool =
    options.pool ||
    new Pool({
      connectionString: testPgUrl,
      connectionTimeoutMillis: 5000,
      max: 2,
    });

  try {
    // 5. Verify live server version is 17.x and active session matches expected db/user
    const verRes = await pool.query(
      `SELECT version() AS version_text,
              current_setting('server_version') AS server_version,
              current_setting('server_version_num')::int AS server_version_num,
              current_database() AS active_db,
              current_user AS active_user;`
    );
    const row = verRes.rows[0] || {};
    const serverVersion = String(row.server_version || 'unknown');
    const versionText = String(row.version_text || '');
    const serverVersionNum = Number(row.server_version_num || 0);
    const activeDb = String(row.active_db || '');
    const activeUser = String(row.active_user || '');

    if (serverVersionNum < 170000 || serverVersionNum >= 180000) {
      throw new Error(
        `Expected PostgreSQL 17.x (170000..179999), got ${serverVersion} (${serverVersionNum}).`
      );
    }
    if (activeDb !== EXPECTED_DISPOSABLE_PG17_DB) {
      throw new Error(
        `Connected database mismatch: expected '${EXPECTED_DISPOSABLE_PG17_DB}', got '${activeDb}'.`
      );
    }
    if (activeUser !== EXPECTED_DISPOSABLE_PG17_USER) {
      throw new Error(
        `Connected user mismatch: expected '${EXPECTED_DISPOSABLE_PG17_USER}', got '${activeUser}'.`
      );
    }

    // 6. Verify authenticated role has required disposable-test permissions
    const roleRes = await pool.query(
      `SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolcanlogin, rolbypassrls
       FROM pg_roles
       WHERE rolname = current_user;`
    );
    if (roleRes.rows.length === 0) {
      throw new Error(`Authenticated role '${activeUser}' not found in pg_roles.`);
    }
    const role = roleRes.rows[0];
    if (!role.rolsuper || !role.rolcreatedb || !role.rolcanlogin) {
      throw new Error(
        `Role '${activeUser}' lacks required disposable-cluster privileges (super=${role.rolsuper}, createdb=${role.rolcreatedb}, login=${role.rolcanlogin}).`
      );
    }

    return {
      versionText,
      serverVersion,
      serverVersionNum,
      activeDb,
      activeUser,
    };
  } finally {
    if (ownPool) {
      await pool.end().catch(() => {});
    }
  }
}
