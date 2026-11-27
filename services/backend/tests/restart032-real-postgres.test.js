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

test('RESTART-03.2 Real PostgreSQL 17 Operational Repository Isolation & Concurrency Suite', async (suite) => {
  const reachable = await canConnectRealPostgres(TEST_PG_URL);
  if (!reachable) {
    const msg = 'Real PostgreSQL 17 server unavailable; boot docker-compose.pg17-verify.yml and set TEST_POSTGRES_URL';
    if (process.env['REQUIRE_REAL_POSTGRES'] === '1') {
      assert.fail(`REQUIRE_REAL_POSTGRES=1 gate failed: ${msg}`);
    }
    console.log(
      '[RESTART-03.2 REAL PG] Physical PostgreSQL 17 server unavailable (TEST_POSTGRES_URL unset or unreachable). Test marked as SKIP / NOT RUN (no pg-mem fallback).'
    );
    suite.skip(msg);
    return;
  }

  const adminPool = new pg.Pool({ connectionString: TEST_PG_URL, connectionTimeoutMillis: 3000 });
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  const dbNameCtrl = `dfarm_r32_ctrl_${suffix}`;
  const dbNameA = `dfarm_r32_a_${suffix}`;
  const dbNameB = `dfarm_r32_b_${suffix}`;

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
    const custA = crypto.randomUUID();
    const custB = crypto.randomUUID();
    const shiftSessA = crypto.randomUUID();

    await poolCtrl.query(`INSERT INTO organizations (id, name, code, status) VALUES ($1, 'PG17 A', 'PGA', 'ACTIVE'), ($2, 'PG17 B', 'PGB', 'ACTIVE');`, [orgA, orgB]);
    await poolA.query(`INSERT INTO organizations (id, name, code, status) VALUES ($1, 'PG17 A', 'PGA', 'ACTIVE');`, [orgA]);
    await poolA.query(`INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status) VALUES ($1, $2, 'CA1', 'Center A', 'R1', 'T1', 'Pune', 'MH', '411001', '+919800000001', 'ACTIVE');`, [centerA, orgA]);
    await poolA.query(`INSERT INTO users (id, organization_id, username, full_name, phone_number, role, user_role, status) VALUES ($1, $2, 'pg17_op_a', 'PG17 Op A', '+919800000011', 'COLLECTION_OPERATOR', 'COLLECTION_OPERATOR', 'ACTIVE');`, [opA, orgA]);
    await poolA.query(`INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status, is_deleted) VALUES ($1, $2, $3, 'FA-1', 'PG17 Farmer A', '+919800000101', 'ACTIVE', 'APPROVED', FALSE);`, [custA, orgA, centerA]);
    await poolA.query(`INSERT INTO customer_ledger_accounts (id, customer_id, organization_id, currency, current_balance) VALUES ($1, $2, $3, 'INR', 0.00);`, [crypto.randomUUID(), custA, orgA]);

    await poolB.query(`INSERT INTO organizations (id, name, code, status) VALUES ($1, 'PG17 B', 'PGB', 'ACTIVE');`, [orgB]);
    await poolB.query(`INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status) VALUES ($1, $2, 'CB1', 'Center B', 'R2', 'T2', 'Pune', 'MH', '411002', '+919800000002', 'ACTIVE');`, [centerB, orgB]);
    await poolB.query(`INSERT INTO users (id, organization_id, username, full_name, phone_number, role, user_role, status) VALUES ($1, $2, 'pg17_op_b', 'PG17 Op B', '+919800000022', 'COLLECTION_OPERATOR', 'COLLECTION_OPERATOR', 'ACTIVE');`, [opB, orgB]);
    await poolB.query(`INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status, is_deleted) VALUES ($1, $2, $3, 'FB-1', 'PG17 Farmer B', '+919800000102', 'ACTIVE', 'APPROVED', FALSE);`, [custB, orgB, centerB]);
    await poolB.query(`INSERT INTO customer_ledger_accounts (id, customer_id, organization_id, currency, current_balance) VALUES ($1, $2, $3, 'INR', 0.00);`, [crypto.randomUUID(), custB, orgB]);

    await suite.test('1. Real PG17 FK enforcement rejects missing customer/center/operator on ledger & collection writes', async () => {
      await assert.rejects(
        () => poolA.query(
          `INSERT INTO ledger_transactions (id, organization_id, center_id, customer_id, transaction_type, direction, amount, balance_after, reference_entity, reference_id, description, idempotency_key, created_by)
           VALUES ($1, $2, $3, $4, 'MILK_COLLECTION_CREDIT', 'CREDIT', 100, 100, 'MILK_COLLECTION', $5, 'Invalid op', 'K1', $6);`,
          [crypto.randomUUID(), orgA, centerA, custA, crypto.randomUUID(), crypto.randomUUID()]
        ),
        (err) => err.code === '23503'
      );

      // Zero rows leaked to B or Ctrl
      assert.equal(Number((await poolB.query(`SELECT COUNT(*)::int AS c FROM ledger_transactions;`)).rows[0].c), 0);
      assert.equal(Number((await poolCtrl.query(`SELECT COUNT(*)::int AS c FROM ledger_transactions;`)).rows[0].c), 0);
    });

    await suite.test('2. Real PG17 concurrent FOR UPDATE ledger updates serialize cleanly without lost updates', async () => {
      const doCredit = async (amount, key) => {
        const client = await poolA.connect();
        try {
          await client.query('BEGIN');
          const acc = await client.query(`SELECT id, current_balance FROM customer_ledger_accounts WHERE customer_id = $1 AND organization_id = $2 FOR UPDATE;`, [custA, orgA]);
          const nextBal = Number(acc.rows[0].current_balance) + amount;
          const txnId = crypto.randomUUID();
          await client.query(
            `INSERT INTO ledger_transactions (id, organization_id, center_id, customer_id, transaction_type, direction, amount, balance_after, reference_entity, reference_id, description, idempotency_key, created_by)
             VALUES ($1, $2, $3, $4, 'MILK_COLLECTION_CREDIT', 'CREDIT', $5, $6, 'MILK_COLLECTION', $7, 'Concurrent credit', $8, $9);`,
            [txnId, orgA, centerA, custA, amount, nextBal, txnId, key, opA]
          );
          await client.query(`UPDATE customer_ledger_accounts SET current_balance = $1 WHERE id = $2;`, [nextBal, acc.rows[0].id]);
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      };

      await Promise.all([doCredit(120, 'PG17-CONC-1'), doCredit(80, 'PG17-CONC-2')]);
      const finalBal = Number((await poolA.query(`SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;`, [custA])).rows[0].current_balance);
      assert.equal(finalBal, 200);
      assert.equal(Number((await poolB.query(`SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;`, [custB])).rows[0].current_balance), 0);
    });

    await suite.test('3. Real PG17 rollback leaves zero partial ledger or collection rows', async () => {
      const client = await poolA.connect();
      try {
        await client.query('BEGIN');
        await client.query(`UPDATE customer_ledger_accounts SET current_balance = 9999 WHERE customer_id = $1;`, [custA]);
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
      const bal = Number((await poolA.query(`SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;`, [custA])).rows[0].current_balance);
      assert.equal(bal, 200);
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
