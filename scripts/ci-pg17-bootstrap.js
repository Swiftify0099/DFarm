import pg from 'pg';
import crypto from 'node:crypto';
import { assertDisposablePg17Cluster } from './pg17-safety-guard.js';

const { Pool } = pg;

const TEST_PG_URL = process.env['TEST_POSTGRES_URL'] || '';

async function main() {
  const preflight = await assertDisposablePg17Cluster({ connectionString: TEST_PG_URL });
  console.log(`PostgreSQL server version: ${preflight.versionText}`);
  console.log(`PostgreSQL server_version_num: ${preflight.serverVersionNum}`);
  console.log(
    `Verified disposable PG17 target (db=${preflight.activeDb}, user=${preflight.activeUser}, opt-in=enabled).`
  );

  const pool = new Pool({
    connectionString: TEST_PG_URL,
    connectionTimeoutMillis: 5000,
    max: 3,
  });

  const probeDbName = `dfarm_bootstrap_probe_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;

  try {
    // 1. Verify primary bootstrap role (postgres) exists and has superuser + createdb
    const pgRoleRes = await pool.query(
      `SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolbypassrls
       FROM pg_roles
       WHERE rolname = 'postgres';`
    );
    if (pgRoleRes.rows.length === 0) {
      throw new Error("Required owner role 'postgres' does not exist in CI cluster.");
    }
    if (!pgRoleRes.rows[0].rolsuper || !pgRoleRes.rows[0].rolcreatedb) {
      throw new Error("Role 'postgres' must have SUPERUSER and CREATEDB in disposable CI cluster.");
    }

    // 3. Idempotently bootstrap minimum Supabase compatibility roles audited from active migrations
    // Audited across supabase/migrations/*.sql: postgres, anon, authenticated, service_role.
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER NOBYPASSRLS;
        ELSE
          ALTER ROLE anon WITH NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER NOBYPASSRLS;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER NOBYPASSRLS;
        ELSE
          ALTER ROLE authenticated WITH NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER NOBYPASSRLS;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
          CREATE ROLE service_role NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER BYPASSRLS;
        ELSE
          ALTER ROLE service_role WITH NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER BYPASSRLS;
        END IF;
      END $$;
    `);

    // 4. Verify all required roles & attributes (print role names & attributes only, never credentials)
    const rolesRes = await pool.query(`
      SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolbypassrls
      FROM pg_roles
      WHERE rolname IN ('postgres', 'anon', 'authenticated', 'service_role')
      ORDER BY rolname;
    `);

    const expected = new Map([
      ['anon', { rolsuper: false, rolinherit: false, rolcreaterole: false, rolcreatedb: false, rolcanlogin: false, rolbypassrls: false }],
      ['authenticated', { rolsuper: false, rolinherit: false, rolcreaterole: false, rolcreatedb: false, rolcanlogin: false, rolbypassrls: false }],
      ['postgres', { rolsuper: true, rolcreatedb: true, rolcanlogin: true }],
      ['service_role', { rolsuper: false, rolinherit: false, rolcreaterole: false, rolcreatedb: false, rolcanlogin: false, rolbypassrls: true }],
    ]);

    if (rolesRes.rows.length !== 4) {
      throw new Error(`Expected 4 bootstrapped roles, found ${rolesRes.rows.length}`);
    }

    console.log('Verified PostgreSQL CI roles and attributes:');
    for (const row of rolesRes.rows) {
      console.log(
        `  - ${row.rolname}: superuser=${row.rolsuper}, inherit=${row.rolinherit}, createrole=${row.rolcreaterole}, createdb=${row.rolcreatedb}, login=${row.rolcanlogin}, bypassrls=${row.rolbypassrls}`
      );
      const exp = expected.get(row.rolname);
      for (const [k, v] of Object.entries(exp)) {
        if (Boolean(row[k]) !== v) {
          throw new Error(`Role '${row.rolname}' attribute '${k}' expected ${v}, got ${row[k]}`);
        }
      }
    }

    // 5. Verify ability to create and drop disposable test databases cleanly
    await pool.query(`CREATE DATABASE ${probeDbName};`);
    const probePool = new Pool({
      connectionString: (() => {
        const u = new URL(TEST_PG_URL);
        u.pathname = `/${probeDbName}`;
        return u.toString();
      })(),
      connectionTimeoutMillis: 3000,
      max: 1,
    });
    try {
      const dbCheck = await probePool.query(`SELECT current_database() AS db;`);
      if (dbCheck.rows[0]?.db !== probeDbName) {
        throw new Error(`Probe database check failed: expected ${probeDbName}, got ${dbCheck.rows[0]?.db}`);
      }
    } finally {
      await probePool.end();
    }
    await pool.query(`DROP DATABASE IF EXISTS ${probeDbName} WITH (FORCE);`);
    console.log(`Verified disposable test database create/drop lifecycle (${probeDbName}).`);
    console.log('CI PostgreSQL 17 role bootstrap & preflight validation PASSED.');
  } finally {
    await pool.query(`DROP DATABASE IF EXISTS ${probeDbName} WITH (FORCE);`).catch(() => {});
    await pool.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error(`CI PostgreSQL 17 bootstrap failed: ${err?.message || err}`);
  process.exit(1);
});
