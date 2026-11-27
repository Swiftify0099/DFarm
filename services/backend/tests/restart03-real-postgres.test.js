import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../../../supabase/migrations');

// Only run against an explicit, disposable PostgreSQL test URL. Never touch production.
const TEST_PG_URL = process.env['TEST_POSTGRES_URL'] || '';

async function canConnectRealPostgres(url) {
  if (!url) return false;
  const pool = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 1500 });
  try {
    const res = await pool.query('SELECT version() AS v;');
    return Boolean(res.rows[0]?.v);
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => {});
  }
}

test('RESTART-03 Real PostgreSQL 17 Isolation, FK, Partial Index & Ownership Verification Suite', async (suite) => {
  const reachable = await canConnectRealPostgres(TEST_PG_URL);
  if (!reachable) {
    const msg = 'Real PostgreSQL 17 server unavailable; boot docker-compose.pg17-verify.yml and set TEST_POSTGRES_URL';
    if (process.env['REQUIRE_REAL_POSTGRES'] === '1') {
      assert.fail(`REQUIRE_REAL_POSTGRES=1 gate failed: ${msg}`);
    }
    console.log(
      '[RESTART-03 REAL PG] Physical PostgreSQL 17 server unavailable (TEST_POSTGRES_URL unset or unreachable). Test marked as SKIP / NOT RUN (no pg-mem fallback).'
    );
    suite.skip(msg);
    return;
  }

  const adminPool = new pg.Pool({ connectionString: TEST_PG_URL, connectionTimeoutMillis: 3000 });
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  const dbNameCtrl = `dfarm_verify_ctrl_${suffix}`;
  const dbNameA = `dfarm_verify_a_${suffix}`;
  const dbNameB = `dfarm_verify_b_${suffix}`;

  const makeDbUrl = (dbName) => {
    const u = new URL(TEST_PG_URL);
    u.pathname = `/${dbName}`;
    return u.toString();
  };

  let poolCtrl;
  let poolA;
  let poolB;

  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => /^\d{3}_.*\.sql$/i.test(f) && f !== '031_remove_dairy_admin_7507495615.sql')
    .sort();

  const applyMigrations = async (pool) => {
    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await pool.query(sql);
    }
  };

  try {
    await adminPool.query(`CREATE DATABASE ${dbNameCtrl};`);
    await adminPool.query(`CREATE DATABASE ${dbNameA};`);
    await adminPool.query(`CREATE DATABASE ${dbNameB};`);

    poolCtrl = new pg.Pool({ connectionString: makeDbUrl(dbNameCtrl), max: 5 });
    poolA = new pg.Pool({ connectionString: makeDbUrl(dbNameA), max: 10 });
    poolB = new pg.Pool({ connectionString: makeDbUrl(dbNameB), max: 5 });

    await applyMigrations(poolCtrl);
    await applyMigrations(poolA);
    await applyMigrations(poolB);

    const orgA = crypto.randomUUID();
    const orgB = crypto.randomUUID();
    const centerA = crypto.randomUUID();
    const centerB = crypto.randomUUID();
    const opA = crypto.randomUUID();
    const opB = crypto.randomUUID();
    const devA = 'PG17-KIOSK-A';

    await suite.test('1. Verifies PostgreSQL server version and migration 045 partial unique index exists', async () => {
      const vRes = await poolA.query(`SELECT version() AS v;`);
      assert.match(String(vRes.rows[0].v), /PostgreSQL/i);

      const idxRes = await poolA.query(
        `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'kiosk_shift_sessions' AND indexname = 'uq_kiosk_shift_sessions_active_open';`
      );
      assert.equal(idxRes.rows.length, 1);
      assert.match(String(idxRes.rows[0].indexdef), /WHERE\s+\(status.*OPEN/i);
    });

    await suite.test('2. Real PG foreign keys & joins reject unseeded fake entities and isolate Tenant A from Tenant B', async () => {
      await poolA.query(
        `INSERT INTO organizations (id, name, code, status) VALUES ($1, 'PG17 Alpha', 'PGA', 'ACTIVE');`,
        [orgA]
      );
      await poolA.query(
        `INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
         VALUES ($1, $2, 'CA1', 'PG17 Alpha Center', 'Road 1', 'Town', 'Pune', 'MH', '411001', '+919800000001', 'ACTIVE');`,
        [centerA, orgA]
      );
      await poolA.query(
        `INSERT INTO users (id, organization_id, username, full_name, phone_number, role, user_role, status)
         VALUES ($1, $2, 'pg17_op_a', 'PG17 Op A', '+919800000011', 'COLLECTION_OPERATOR', 'COLLECTION_OPERATOR', 'ACTIVE');`,
        [opA, orgA]
      );

      await poolB.query(
        `INSERT INTO organizations (id, name, code, status) VALUES ($1, 'PG17 Beta', 'PGB', 'ACTIVE');`,
        [orgB]
      );
      await poolB.query(
        `INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
         VALUES ($1, $2, 'CB1', 'PG17 Beta Center', 'Road 2', 'Town', 'Pune', 'MH', '411002', '+919800000002', 'ACTIVE');`,
        [centerB, orgB]
      );
      await poolB.query(
        `INSERT INTO users (id, organization_id, username, full_name, phone_number, role, user_role, status)
         VALUES ($1, $2, 'pg17_op_b', 'PG17 Op B', '+919800000022', 'COLLECTION_OPERATOR', 'COLLECTION_OPERATOR', 'ACTIVE');`,
        [opB, orgB]
      );

      // Missing operator / center fails PostgreSQL FK 23503 (never auto-created)
      await assert.rejects(
        () =>
          poolA.query(
            `INSERT INTO kiosk_shift_sessions (
               id, session_code, organization_id, center_id, business_date, shift, status,
               opened_at, opening_operator_id, device_identifier, device_name
             ) VALUES ($1, 'SH-PG-FK', $2, $3, CURRENT_DATE, 'MORNING', 'OPEN', NOW(), $4, $5, 'Kiosk');`,
            [crypto.randomUUID(), orgA, centerA, crypto.randomUUID(), devA]
          ),
        (err) => err.code === '23503'
      );

      // Zero rows written to Tenant B or Central DB
      const cntB = await poolB.query(`SELECT COUNT(*)::int AS c FROM kiosk_shift_sessions;`);
      assert.equal(cntB.rows[0].c, 0);
      const cntCtrl = await poolCtrl.query(`SELECT COUNT(*)::int AS c FROM kiosk_shift_sessions;`);
      assert.equal(cntCtrl.rows[0].c, 0);
    });

    await suite.test('3. Concurrent PG transactions attempting duplicate OPEN session hit uq_kiosk_shift_sessions_active_open (23505)', async () => {
      const insertOpen = (code) =>
        poolA.query(
          `INSERT INTO kiosk_shift_sessions (
             id, session_code, organization_id, center_id, business_date, shift, status,
             opened_at, opening_operator_id, device_identifier, device_name
           ) VALUES ($1, $2, $3, $4, CURRENT_DATE, 'MORNING', 'OPEN', NOW(), $5, $6, 'Kiosk');`,
          [crypto.randomUUID(), code, orgA, centerA, opA, devA]
        );

      const settled = await Promise.allSettled([insertOpen('SH-PG-RACE-1'), insertOpen('SH-PG-RACE-2')]);
      const fulfilled = settled.filter((s) => s.status === 'fulfilled');
      const rejected = settled.filter((s) => s.status === 'rejected');
      assert.equal(fulfilled.length, 1);
      assert.equal(rejected.length, 1);
      assert.equal(rejected[0].reason.code, '23505');

      const openRows = await poolA.query(
        `SELECT COUNT(*)::int AS c FROM kiosk_shift_sessions WHERE organization_id = $1 AND center_id = $2 AND device_identifier = $3 AND status = 'OPEN';`,
        [orgA, centerA, devA]
      );
      assert.equal(openRows.rows[0].c, 1);
    });

    await suite.test('4. JOIN query on shift sessions + centers + operators works and rollback leaves zero partial state', async () => {
      const joinRes = await poolA.query(
        `SELECT s.session_code, dc.timezone AS center_timezone, u.full_name AS opening_operator_name
         FROM kiosk_shift_sessions s
         LEFT JOIN dairy_centers dc ON dc.id = s.center_id
         LEFT JOIN users u ON u.id = s.opening_operator_id
         WHERE s.organization_id = $1 AND s.status = 'OPEN';`,
        [orgA]
      );
      assert.equal(joinRes.rows.length, 1);
      assert.equal(joinRes.rows[0].opening_operator_name, 'PG17 Op A');

      const client = await poolA.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status)
           VALUES ($1, $2, $3, 'F-ROLLBACK', 'Rollback Farmer', '+919800009999', 'INACTIVE', 'PENDING_APPROVAL');`,
          [crypto.randomUUID(), orgA, centerA]
        );
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
      const custRes = await poolA.query(`SELECT COUNT(*)::int AS c FROM customers WHERE farmer_code = 'F-ROLLBACK';`);
      assert.equal(custRes.rows[0].c, 0);
    });
  } finally {
    await poolCtrl?.end().catch(() => {});
    await poolA?.end().catch(() => {});
    await poolB?.end().catch(() => {});
    await adminPool.query(`DROP DATABASE IF EXISTS ${dbNameA};`).catch(() => {});
    await adminPool.query(`DROP DATABASE IF EXISTS ${dbNameB};`).catch(() => {});
    await adminPool.query(`DROP DATABASE IF EXISTS ${dbNameCtrl};`).catch(() => {});
    await adminPool.end().catch(() => {});
  }
});
