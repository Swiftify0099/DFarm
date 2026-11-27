import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { assertDisposablePg17Cluster } from '../../../scripts/pg17-safety-guard.js';

const { Pool } = pg;

const TEST_PG_URL = process.env['TEST_POSTGRES_URL'] || '';
const REQUIRE_REAL_PG = process.env['REQUIRE_REAL_POSTGRES'] === '1';

async function canConnectRealPostgres(url) {
  if (!url) return false;
  const probe = new Pool({ connectionString: url, connectionTimeoutMillis: 2000 });
  try {
    const res = await probe.query('SELECT version() AS v;');
    return Boolean(res.rows[0]?.v);
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => {});
  }
}

function makeDbUrl(baseUrl, dbName) {
  const u = new URL(baseUrl);
  u.pathname = `/${dbName}`;
  return u.toString();
}

test('RESTART-04 Real PostgreSQL 17.12 Device Auth, Offline Sync Isolation & Atomicity Suite', async (suite) => {
  const reachable = await canConnectRealPostgres(TEST_PG_URL);
  if (!reachable) {
    const msg =
      'Real PostgreSQL 17 server unavailable (TEST_POSTGRES_URL unset or unreachable); boot docker-compose.pg17-verify.yml and set TEST_POSTGRES_URL.';
    if (REQUIRE_REAL_PG) {
      assert.fail(`REQUIRE_REAL_POSTGRES=1 gate failed: ${msg}`);
    }
    console.log(`[RESTART-04 REAL PG] ${msg} Marked as SKIP / NOT RUN (no pg-mem fallback).`);
    suite.skip(msg);
    return;
  }

  await assertDisposablePg17Cluster({ connectionString: TEST_PG_URL });

  const poolErrors = [];
  const attachPoolErrorGuard = (pool, label) => {
    pool.on('error', (err) => {
      poolErrors.push({ label, code: err?.code, message: err?.message || String(err) });
    });
    return pool;
  };

  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  const dbNameCtrl = `dfarm_r04_ctrl_${suffix}`;
  const dbNameA = `dfarm_r04_a_${suffix}`;
  const dbNameB = `dfarm_r04_b_${suffix}`;

  const ctrlUrl = makeDbUrl(TEST_PG_URL, dbNameCtrl);
  const urlA = makeDbUrl(TEST_PG_URL, dbNameA);
  const urlB = makeDbUrl(TEST_PG_URL, dbNameB);

  const adminPool = attachPoolErrorGuard(new Pool({ connectionString: TEST_PG_URL, connectionTimeoutMillis: 5000 }), 'adminPool');
  let poolCtrl;
  let poolA;
  let poolB;

  const orgA = crypto.randomUUID();
  const orgB = crypto.randomUUID();

  try {
    await adminPool.query(`CREATE DATABASE ${dbNameCtrl};`);
    await adminPool.query(`CREATE DATABASE ${dbNameA};`);
    await adminPool.query(`CREATE DATABASE ${dbNameB};`);

    poolCtrl = attachPoolErrorGuard(new Pool({ connectionString: ctrlUrl, max: 5 }), 'poolCtrl');
    poolA = attachPoolErrorGuard(new Pool({ connectionString: urlA, max: 15 }), 'poolA');
    poolB = attachPoolErrorGuard(new Pool({ connectionString: urlB, max: 10 }), 'poolB');

    const verRes = await poolA.query(`SELECT current_setting('server_version_num')::int AS ver_num;`);
    const verNum = Number(verRes.rows[0]?.ver_num || 0);
    assert.ok(verNum >= 170000 && verNum < 180000, `Expected PostgreSQL 17.x, got ${verNum}`);

    process.env['NODE_ENV'] = 'test';
    process.env['TEST_REAL_POSTGRES'] = '1';
    process.env['DATABASE_TLS_MODE'] = 'disable';
    process.env['CENTRAL_DATABASE_URL'] = ctrlUrl;
    process.env['DATABASE_URL'] = ctrlUrl;
    process.env['DATABASE_PROVISIONER_URL'] = ctrlUrl;
    process.env['TENANT_POOL_CONNECTION_TIMEOUT_MS'] = '5000';

    const { MigrationRunner } = await import('../dist/infrastructure/database/MigrationRunner.js');
    await MigrationRunner.runControlPlaneMigrations(poolCtrl);
    await MigrationRunner.runTenantMigrations(poolA, orgA);
    await MigrationRunner.runTenantMigrations(poolB, orgB);

    const { createApp } = await import('../dist/app.js');
    const { db } = await import('../dist/infrastructure/database/PostgresPool.js');
    const { tenantDbManager } = await import('../dist/infrastructure/database/TenantDatabaseManager.js');
    const { CredentialEncryption } = await import('../dist/infrastructure/security/CredentialEncryption.js');
    const { HmacJwtTokenService } = await import('../dist/infrastructure/security/HmacJwtTokenService.js');
    const { createDeviceToken, verifyDeviceToken, hashToken } = await import('../dist/security.js');
    const { signJwt } = await import('../dist/jwt.js');
    const { SyncService } = await import('../dist/modules/sync/sync.service.js');

    const controlPlaneAdapter = {
      query: (text, params) => poolCtrl.query(text, params),
      withTransaction: async (callback) => {
        const client = await poolCtrl.connect();
        try {
          await client.query('BEGIN');
          const result = await callback(client);
          await client.query('COMMIT');
          return result;
        } catch (err) {
          await client.query('ROLLBACK').catch(() => {});
          throw err;
        } finally {
          client.release();
        }
      },
    };
    tenantDbManager.setControlPlaneDb(controlPlaneAdapter);

    const app = createApp();
    const tokenService = new HmacJwtTokenService();

    const centerA1 = crypto.randomUUID();
    const centerA2 = crypto.randomUUID();
    const centerB1 = crypto.randomUUID();
    const ownerA = crypto.randomUUID();
    const opA = crypto.randomUUID();
    const opInactiveA = crypto.randomUUID();
    const opWrongCenterA = crypto.randomUUID();
    const opCustRoleA = crypto.randomUUID();
    const ownerB = crypto.randomUUID();
    const opB = crypto.randomUUID();
    const custB = crypto.randomUUID();

    // Seed control plane
    await poolCtrl.query(
      `INSERT INTO organizations (id, name, code, status)
       VALUES ($1, 'PG17 Sync Dairy A', $3, 'ACTIVE'),
              ($2, 'PG17 Sync Dairy B', $4, 'ACTIVE');`,
      [orgA, orgB, `R04_A_${suffix}`, `R04_B_${suffix}`]
    );
    await poolCtrl.query(
      `INSERT INTO users (id, organization_id, username, phone_number, full_name, role, user_role, status)
       VALUES ($1, $2, $3, '+919700000001', 'Owner A', 'DAIRY_OWNER', 'DAIRY_OWNER', 'ACTIVE'),
              ($4, $2, $5, '+919700000002', 'Op A', 'COLLECTION_OPERATOR', 'COLLECTION_OPERATOR', 'ACTIVE'),
              ($6, $7, $8, '+919700000003', 'Owner B', 'DAIRY_OWNER', 'DAIRY_OWNER', 'ACTIVE'),
              ($9, $7, $10, '+919700000004', 'Op B', 'COLLECTION_OPERATOR', 'COLLECTION_OPERATOR', 'ACTIVE');`,
      [
        ownerA, orgA, `ownA_${suffix}`,
        opA, `opA_${suffix}`,
        ownerB, orgB, `ownB_${suffix}`,
        opB, `opB_${suffix}`,
      ]
    );
    await poolCtrl.query(
      `INSERT INTO dairy_database_mappings (
         id, dairy_id, dairy_code, database_name, resource_type,
         connection_uri_encrypted, schema_version, provisioning_status, provisioned_at, last_verified_at
       ) VALUES
         ($1, $2, $3, $4, 'PHYSICAL_DATABASE', $5, 'v1.0.0', 'ACTIVE', NOW(), NOW()),
         ($6, $7, $8, $9, 'PHYSICAL_DATABASE', $10, 'v1.0.0', 'ACTIVE', NOW(), NOW());`,
      [
        crypto.randomUUID(), orgA, `R04_A_${suffix}`, dbNameA, CredentialEncryption.encrypt(urlA),
        crypto.randomUUID(), orgB, `R04_B_${suffix}`, dbNameB, CredentialEncryption.encrypt(urlB),
      ]
    );

    // Seed Tenant A
    await poolA.query(`INSERT INTO organizations (id, name, code, status) VALUES ($1, 'PG17 Sync Dairy A', $2, 'ACTIVE');`, [orgA, `R04_A_${suffix}`]);
    await poolA.query(
      `INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
       VALUES ($1, $2, 'CA1', 'Center A1', 'Rd 1', 'Town A', 'Dist A', 'MH', '416312', '+919700000011', 'ACTIVE'),
              ($3, $2, 'CA2', 'Center A2', 'Rd 2', 'Town A2', 'Dist A', 'MH', '416313', '+919700000012', 'ACTIVE');`,
      [centerA1, orgA, centerA2]
    );
    await poolA.query(
      `INSERT INTO users (id, organization_id, username, phone_number, full_name, role, user_role, status)
       VALUES ($1, $2, $3, '+919700000001', 'Owner A', 'DAIRY_OWNER', 'DAIRY_OWNER', 'ACTIVE'),
              ($4, $2, $5, '+919700000002', 'Op A', 'COLLECTION_OPERATOR', 'COLLECTION_OPERATOR', 'ACTIVE'),
              ($6, $2, $7, '+919700000005', 'Inactive Op', 'COLLECTION_OPERATOR', 'COLLECTION_OPERATOR', 'INACTIVE'),
              ($8, $2, $9, '+919700000006', 'Wrong Center Op', 'COLLECTION_OPERATOR', 'COLLECTION_OPERATOR', 'ACTIVE'),
              ($10, $2, $11, '+919700000007', 'Customer Role User', 'FARMER_CUSTOMER', 'FARMER_CUSTOMER', 'ACTIVE');`,
      [
        ownerA, orgA, `ownA_${suffix}`,
        opA, `opA_${suffix}`,
        opInactiveA, `opInactA_${suffix}`,
        opWrongCenterA, `opWrongA_${suffix}`,
        opCustRoleA, `opCustA_${suffix}`,
      ]
    );
    await poolA.query(
      `INSERT INTO user_center_assignments (id, user_id, center_id, is_primary)
       VALUES ($1, $2, $3, TRUE), ($4, $5, $6, TRUE);`,
      [crypto.randomUUID(), opA, centerA1, crypto.randomUUID(), opWrongCenterA, centerA2]
    );
    const rcA = crypto.randomUUID();
    const rcvA = crypto.randomUUID();
    await poolA.query(`INSERT INTO rate_charts (id, organization_id, center_id, name, milk_category, pricing_type, is_active) VALUES ($1, $2, $3, 'A Cow Rate', 'COW', 'GRID', TRUE);`, [rcA, orgA, centerA1]);
    await poolA.query(`INSERT INTO rate_chart_versions (id, rate_chart_id, version_number, effective_from, base_fat, base_snf, base_rate, is_approved) VALUES ($1, $2, 1, NOW() - INTERVAL '1 day', 4.0, 8.5, 42.0, TRUE);`, [rcvA, rcA]);
    await poolA.query(`INSERT INTO rate_chart_cells (rate_chart_version_id, fat_percentage, snf_percentage, rate_per_unit) VALUES ($1, 4.2, 8.6, 42.0);`, [rcvA]);

    // Seed Tenant B
    await poolB.query(`INSERT INTO organizations (id, name, code, status) VALUES ($1, 'PG17 Sync Dairy B', $2, 'ACTIVE');`, [orgB, `R04_B_${suffix}`]);
    await poolB.query(
      `INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
       VALUES ($1, $2, 'CB1', 'Center B1', 'Rd B', 'Town B', 'Dist B', 'MH', '416314', '+919700000021', 'ACTIVE');`,
      [centerB1, orgB]
    );
    await poolB.query(
      `INSERT INTO users (id, organization_id, username, phone_number, full_name, role, user_role, status)
       VALUES ($1, $2, $3, '+919700000003', 'Owner B', 'DAIRY_OWNER', 'DAIRY_OWNER', 'ACTIVE'),
              ($4, $2, $5, '+919700000004', 'Op B', 'COLLECTION_OPERATOR', 'COLLECTION_OPERATOR', 'ACTIVE');`,
      [ownerB, orgB, `ownB_${suffix}`, opB, `opB_${suffix}`]
    );
    await poolB.query(
      `INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status, is_deleted)
       VALUES ($1, $2, $3, 'FB-900', 'Tenant B Farmer', '+919700000900', 'ACTIVE', 'APPROVED', FALSE);`,
      [custB, orgB, centerB1]
    );
    const rcB = crypto.randomUUID();
    const rcvB = crypto.randomUUID();
    await poolB.query(`INSERT INTO rate_charts (id, organization_id, center_id, name, milk_category, pricing_type, is_active) VALUES ($1, $2, $3, 'B Cow Rate', 'COW', 'GRID', TRUE);`, [rcB, orgB, centerB1]);
    await poolB.query(`INSERT INTO rate_chart_versions (id, rate_chart_id, version_number, effective_from, base_fat, base_snf, base_rate, is_approved) VALUES ($1, $2, 1, NOW() - INTERVAL '1 day', 4.0, 8.5, 45.0, TRUE);`, [rcvB, rcB]);

    const ownerTokenA = tokenService.signToken({ userId: ownerA, organizationId: orgA, centerId: centerA1, role: 'DAIRY_OWNER', actorType: 'STAFF' });
    const ownerTokenB = tokenService.signToken({ userId: ownerB, organizationId: orgB, centerId: centerB1, role: 'DAIRY_OWNER', actorType: 'STAFF' });
    const opTokenA = tokenService.signToken({ userId: opA, organizationId: orgA, centerId: centerA1, role: 'COLLECTION_OPERATOR', actorType: 'STAFF' });

    let devAId;
    let devAToken;
    let devAIdentifier = `PG17-KIOSK-A-${suffix}`;
    let devBId;
    let devBToken;
    let devBIdentifier = `PG17-KIOSK-B-${suffix}`;
    const custAId = crypto.randomUUID();
    const custAMobile = `+919822${Math.floor(100000 + Math.random() * 899999)}`;
    const custACode = `FA-${suffix.slice(0, 4)}`;

    await suite.test('1-2. Device registration & signed token issuance in isolated tenant DB (hash only stored)', async () => {
      const regA = await request(app)
        .post('/api/v1/devices/register')
        .set('Authorization', `Bearer ${ownerTokenA}`)
        .send({
          deviceIdentifier: devAIdentifier,
          deviceType: 'COUNTER_TERMINAL',
          centerId: centerA1,
          publicKey: 'pk-pg17-a',
          appVersion: '2.1.0',
        });
      assert.equal(regA.status, 200, `Register A failed: ${JSON.stringify(regA.body)}`);
      devAId = regA.body.data.deviceId;
      devAToken = regA.body.data.token;

      const claims = verifyDeviceToken(devAToken);
      assert.equal(claims.sub, devAId);
      assert.equal(claims.organizationId, orgA);
      assert.equal(claims.centerId, centerA1);
      assert.equal(claims.deviceIdentifier, devAIdentifier);

      const devRowA = await poolA.query(`SELECT device_token_hash FROM devices WHERE id = $1;`, [devAId]);
      assert.equal(devRowA.rows[0].device_token_hash, hashToken(devAToken));
      assert.equal((await poolCtrl.query(`SELECT to_regclass('public.devices') AS reg;`)).rows[0].reg, null);
      assert.equal((await poolB.query(`SELECT COUNT(*)::int AS c FROM devices WHERE id = $1;`, [devAId])).rows[0].c, 0);

      const regB = await request(app)
        .post('/api/v1/devices/register')
        .set('Authorization', `Bearer ${ownerTokenB}`)
        .send({
          deviceIdentifier: devBIdentifier,
          deviceType: 'COUNTER_TERMINAL',
          centerId: centerB1,
          publicKey: 'pk-pg17-b',
        });
      assert.equal(regB.status, 200);
      devBId = regB.body.data.deviceId;
      devBToken = regB.body.data.token;
    });

    await suite.test('3-4. Valid token authentication & raw ID / invalid / app-JWT / legacy token rejection', async () => {
      const statusOk = await request(app).get('/api/v1/sync/status').set('Authorization', `Bearer ${devAToken}`);
      assert.equal(statusOk.status, 200);
      assert.equal(statusOk.body.data.deviceId, devAId);

      assert.equal((await request(app).post('/api/v1/sync/push').send({ deviceId: devAId, events: [] })).status, 401);
      assert.equal((await request(app).post('/api/v1/sync/push').set('X-Device-ID', devAId).send({ events: [] })).status, 401);
      assert.equal((await request(app).get(`/api/v1/sync/status?deviceId=${devAId}`)).status, 401);
      assert.equal((await request(app).post('/api/v1/sync/push').set('Authorization', `Bearer ${devAId}`).send({ events: [] })).status, 401);
      assert.equal((await request(app).post('/api/v1/sync/push').set('Authorization', `Bearer ${opTokenA}`).send({ events: [] })).status, 401);
      assert.equal(
        (await request(app).post('/api/v1/sync/push').set('Authorization', `Bearer ${signJwt({ sub: devAId, type: 'device' }, 3600)}`).send({ events: [] })).body.error.code,
        'DEVICE_RE_REGISTRATION_REQUIRED'
      );
      assert.equal(
        (await request(app).post('/api/v1/sync/push').set('Authorization', `Bearer ${signJwt({ sub: devAId, type: 'device', organizationId: orgA, centerId: centerA1, deviceIdentifier: devAIdentifier }, -30)}`).send({ events: [] })).body.error.code,
        'DEVICE_TOKEN_EXPIRED'
      );
    });

    await suite.test('11-13 & 21-22. Customer registration, duplicate idempotency, mobile conflict, invalid actor & no fabricated data', async () => {
      // Missing data must fail (no fabricated 'Farmer' / '0000000000' / fallback user)
      const badCustId = crypto.randomUUID();
      const badRes = await request(app)
        .post('/api/v1/sync/push')
        .set('Authorization', `Bearer ${devAToken}`)
        .send({
          events: [
            {
              id: crypto.randomUUID(),
              entityType: 'CUSTOMER_REGISTRATION',
              entityId: badCustId,
              idempotencyKey: `BAD-CUST-${badCustId}`,
              payload: { permittedCategories: ['COW'] },
            },
          ],
        });
      assert.equal(badRes.status, 200);
      assert.equal(badRes.body.data.applied, 0);
      assert.equal(badRes.body.data.results[0].status, 'ERROR');
      assert.equal((await poolA.query(`SELECT COUNT(*)::int AS c FROM customers WHERE id = $1;`, [badCustId])).rows[0].c, 0);

      // Valid customer registration
      const regEvt = {
        id: crypto.randomUUID(),
        entityType: 'CUSTOMER_REGISTRATION',
        entityId: custAId,
        idempotencyKey: `CUST-A-${custAId}`,
        payload: {
          farmerCode: custACode,
          fullName: 'PG17 Valid Farmer A',
          mobileNumber: custAMobile,
          authorizedBy: opA,
          permittedCategories: ['COW'],
        },
      };
      const okRes = await request(app)
        .post('/api/v1/sync/push')
        .set('Authorization', `Bearer ${devAToken}`)
        .send({ events: [regEvt] });
      assert.equal(okRes.status, 200);
      assert.equal(okRes.body.data.applied, 1);
      assert.equal(okRes.body.data.results[0].status, 'COMMITTED');

      // Duplicate customer idempotency
      const dupRes = await request(app)
        .post('/api/v1/sync/push')
        .set('Authorization', `Bearer ${devAToken}`)
        .send({ events: [regEvt] });
      assert.equal(dupRes.status, 200);
      assert.equal(dupRes.body.data.results[0].status, 'DUPLICATE');

      // Duplicate mobile conflict
      const conflictCustId = crypto.randomUUID();
      const confRes = await request(app)
        .post('/api/v1/sync/push')
        .set('Authorization', `Bearer ${devAToken}`)
        .send({
          events: [
            {
              id: crypto.randomUUID(),
              entityType: 'CUSTOMER_REGISTRATION',
              entityId: conflictCustId,
              idempotencyKey: `CONF-${conflictCustId}`,
              payload: {
                farmerCode: `FC-${suffix.slice(0, 4)}`,
                fullName: 'Duplicate Mobile Farmer',
                mobileNumber: custAMobile,
                authorizedBy: opA,
                permittedCategories: ['COW'],
              },
            },
          ],
        });
      assert.equal(confRes.status, 200);
      assert.equal(confRes.body.data.conflicts, 1);
      assert.equal(confRes.body.data.results[0].status, 'CONFLICT');
      assert.equal((await poolA.query(`SELECT COUNT(*)::int AS c FROM customers WHERE id = $1;`, [conflictCustId])).rows[0].c, 0);
      assert.equal((await poolA.query(`SELECT COUNT(*)::int AS c FROM sync_conflict_records WHERE entity_id = $1;`, [conflictCustId])).rows[0].c, 1);
      assert.equal((await poolB.query(`SELECT COUNT(*)::int AS c FROM customers WHERE id = $1;`, [custAId])).rows[0].c, 0);
    });

    await suite.test('7-10 & 14-15. Milk collection, duplicate idempotency, pull, acknowledge & status + payout/receipt ledgerEffectApplied', async () => {
      const colId = crypto.randomUUID();
      const colKey = `PG17-COL-${colId}`;
      const colEvent = {
        id: crypto.randomUUID(),
        entityType: 'MILK_COLLECTION',
        entityId: colId,
        idempotencyKey: colKey,
        payload: {
          customerId: custAId,
          operatorId: opA,
          rateChartVersionId: rcvA,
          businessDate: '2026-11-27',
          shiftType: 'MORNING',
          milkCategory: 'COW',
          netWeight: 10.0,
          fatPercentage: 4.2,
          snfPercentage: 8.6,
          appliedRatePerUnit: 42.0,
          totalAmount: 420.0,
          identificationMethod: 'RFID',
        },
      };

      const pushRes = await request(app)
        .post('/api/v1/sync/push')
        .set('Authorization', `Bearer ${devAToken}`)
        .send({ events: [colEvent] });
      assert.equal(pushRes.status, 200);
      assert.equal(pushRes.body.data.applied, 1);
      assert.equal(pushRes.body.data.results[0].status, 'COMMITTED');
      assert.equal(pushRes.body.data.results[0].ledgerEffectApplied, true);

      // Replay duplicate
      const replayRes = await request(app)
        .post('/api/v1/sync/push')
        .set('Authorization', `Bearer ${devAToken}`)
        .send({ events: [colEvent] });
      assert.equal(replayRes.status, 200);
      assert.equal(replayRes.body.data.results[0].status, 'DUPLICATE');

      // Verify exactly 1 collection, 1 ledger txn, 2 balanced entries, balance=420, 0 in Tenant B & control plane
      assert.equal((await poolA.query(`SELECT COUNT(*)::int AS c FROM milk_collections WHERE id = $1;`, [colId])).rows[0].c, 1);
      assert.equal((await poolA.query(`SELECT COUNT(*)::int AS c FROM ledger_transactions WHERE reference_id = $1;`, [colId])).rows[0].c, 1);
      assert.equal((await poolA.query(`SELECT COUNT(*)::int AS c FROM ledger_entries le JOIN ledger_transactions lt ON le.transaction_id = lt.id WHERE lt.reference_id = $1;`, [colId])).rows[0].c, 2);
      assert.equal(Number((await poolA.query(`SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;`, [custAId])).rows[0].current_balance), 420);
      assert.equal((await poolB.query(`SELECT COUNT(*)::int AS c FROM milk_collections;`)).rows[0].c, 0);
      assert.equal((await poolCtrl.query(`SELECT to_regclass('public.milk_collections') AS reg;`)).rows[0].reg, null);

      // Offline payout & receipt preserve ledgerEffectApplied: false
      const payoutId = crypto.randomUUID();
      const receiptId = crypto.randomUUID();
      const payRecRes = await request(app)
        .post('/api/v1/sync/push')
        .set('Authorization', `Bearer ${devAToken}`)
        .send({
          events: [
            {
              id: crypto.randomUUID(),
              entityType: 'OFFLINE_PAYMENT_PAYOUT',
              entityId: payoutId,
              idempotencyKey: `PAY-${payoutId}`,
              payload: { customerId: custAId, operatorId: opA, amount: 50, paymentMethod: 'CASH' },
            },
            {
              id: crypto.randomUUID(),
              entityType: 'OFFLINE_CUSTOMER_RECEIPT',
              entityId: receiptId,
              idempotencyKey: `RCP-${receiptId}`,
              payload: { customerId: custAId, operatorId: opA, amount: 25, paymentMethod: 'CASH' },
            },
          ],
        });
      assert.equal(payRecRes.status, 200);
      assert.equal(payRecRes.body.data.results[0].ledgerEffectApplied, false);
      assert.equal(payRecRes.body.data.results[1].ledgerEffectApplied, false);
      assert.equal(Number((await poolA.query(`SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;`, [custAId])).rows[0].current_balance), 420);

      // Pull, acknowledge, status
      const pullRes = await request(app).get('/api/v1/sync/pull?cursor=0&tombstoneCursor=0').set('Authorization', `Bearer ${devAToken}`);
      assert.equal(pullRes.status, 200);
      assert.ok(pullRes.body.data.customers.some((c) => c.id === custAId));
      assert.ok(!pullRes.body.data.customers.some((c) => c.id === custB));

      const ackRes = await request(app)
        .post('/api/v1/sync/acknowledge')
        .set('Authorization', `Bearer ${devAToken}`)
        .send({ downstreamCursor: 5, downstreamTombstoneCursor: 1, clientAppVersion: '2.1.0' });
      assert.equal(ackRes.status, 200);
      assert.equal(ackRes.body.data.downstreamCursor, 5);

      const stRes = await request(app).get('/api/v1/sync/status').set('Authorization', `Bearer ${devAToken}`);
      assert.equal(stRes.status, 200);
      assert.equal(stRes.body.data.downstreamCursor, 5);
    });

    await suite.test('16, 19-21. Savepoint isolation, concurrent duplicate batch, atomic rollback & invalid operator rejection', async () => {
      // Partial batch failure on real PG17 savepoints + invalid operators
      const validColId = crypto.randomUUID();
      const badOpColId = crypto.randomUUID();
      const inactiveOpColId = crypto.randomUUID();
      const wrongCenterOpColId = crypto.randomUUID();
      const custRoleOpColId = crypto.randomUUID();
      const crossOpColId = crypto.randomUUID();

      const partialRes = await request(app)
        .post('/api/v1/sync/push')
        .set('Authorization', `Bearer ${devAToken}`)
        .send({
          events: [
            {
              id: crypto.randomUUID(),
              entityType: 'MILK_COLLECTION',
              entityId: badOpColId,
              idempotencyKey: `BAD-OP-${badOpColId}`,
              payload: { customerId: custAId, operatorId: crypto.randomUUID(), milkCategory: 'COW', netWeight: 5, fatPercentage: 4.2, snfPercentage: 8.6, appliedRatePerUnit: 42, totalAmount: 210 },
            },
            {
              id: crypto.randomUUID(),
              entityType: 'MILK_COLLECTION',
              entityId: inactiveOpColId,
              idempotencyKey: `INACT-OP-${inactiveOpColId}`,
              payload: { customerId: custAId, operatorId: opInactiveA, milkCategory: 'COW', netWeight: 5, fatPercentage: 4.2, snfPercentage: 8.6, appliedRatePerUnit: 42, totalAmount: 210 },
            },
            {
              id: crypto.randomUUID(),
              entityType: 'MILK_COLLECTION',
              entityId: wrongCenterOpColId,
              idempotencyKey: `WC-OP-${wrongCenterOpColId}`,
              payload: { customerId: custAId, operatorId: opWrongCenterA, milkCategory: 'COW', netWeight: 5, fatPercentage: 4.2, snfPercentage: 8.6, appliedRatePerUnit: 42, totalAmount: 210 },
            },
            {
              id: crypto.randomUUID(),
              entityType: 'MILK_COLLECTION',
              entityId: custRoleOpColId,
              idempotencyKey: `CR-OP-${custRoleOpColId}`,
              payload: { customerId: custAId, operatorId: opCustRoleA, milkCategory: 'COW', netWeight: 5, fatPercentage: 4.2, snfPercentage: 8.6, appliedRatePerUnit: 42, totalAmount: 210 },
            },
            {
              id: crypto.randomUUID(),
              entityType: 'MILK_COLLECTION',
              entityId: crossOpColId,
              idempotencyKey: `X-OP-${crossOpColId}`,
              payload: { customerId: custAId, operatorId: opB, milkCategory: 'COW', netWeight: 5, fatPercentage: 4.2, snfPercentage: 8.6, appliedRatePerUnit: 42, totalAmount: 210 },
            },
            {
              id: crypto.randomUUID(),
              entityType: 'MILK_COLLECTION',
              entityId: validColId,
              idempotencyKey: `VALID-COL-${validColId}`,
              payload: { customerId: custAId, operatorId: opA, rateChartVersionId: rcvA, milkCategory: 'COW', netWeight: 5, fatPercentage: 4.2, snfPercentage: 8.6, appliedRatePerUnit: 42, totalAmount: 210 },
            },
          ],
        });
      assert.equal(partialRes.status, 200);
      assert.equal(partialRes.body.data.applied, 1);
      assert.equal(partialRes.body.data.results[0].status, 'ERROR');
      assert.equal(partialRes.body.data.results[1].status, 'ERROR');
      assert.equal(partialRes.body.data.results[2].status, 'ERROR');
      assert.equal(partialRes.body.data.results[3].status, 'ERROR');
      assert.equal(partialRes.body.data.results[4].status, 'ERROR');
      assert.equal(partialRes.body.data.results[5].status, 'COMMITTED');

      // Concurrent duplicate batch submission
      const concId1 = crypto.randomUUID();
      const concId2 = crypto.randomUUID();
      const concKey = `CONC-PG17-${suffix}-${concId1}`;
      const makeConcReq = (entityId) =>
        request(app)
          .post('/api/v1/sync/push')
          .set('Authorization', `Bearer ${devAToken}`)
          .send({
            events: [
              {
                id: crypto.randomUUID(),
                entityType: 'MILK_COLLECTION',
                entityId,
                idempotencyKey: concKey,
                payload: { customerId: custAId, operatorId: opA, rateChartVersionId: rcvA, milkCategory: 'COW', netWeight: 4, fatPercentage: 4.2, snfPercentage: 8.6, appliedRatePerUnit: 42, totalAmount: 168 },
              },
            ],
          });

      const [r1, r2] = await Promise.all([makeConcReq(concId1), makeConcReq(concId2)]);
      assert.equal(r1.status, 200);
      assert.equal(r2.status, 200);
      const statuses = [r1.body.data.results[0].status, r2.body.data.results[0].status].sort();
      assert.deepEqual(statuses, ['COMMITTED', 'DUPLICATE']);
      assert.equal((await poolA.query(`SELECT COUNT(*)::int AS c FROM milk_collections WHERE idempotency_key = $1;`, [concKey])).rows[0].c, 1);
      assert.equal(Number((await poolA.query(`SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;`, [custAId])).rows[0].current_balance), 420 + 210 + 168);

      // Atomic rollback on real PostgreSQL savepoint failure (Section 7):
      // Trigger an aborted transaction or SAVEPOINT failure on real PG17 and verify entire batch rolls back with 0 partial writes
      const balBefore = Number((await poolA.query(`SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;`, [custAId])).rows[0].current_balance);
      const countBefore = Number((await poolA.query(`SELECT COUNT(*)::int AS c FROM milk_collections;`)).rows[0].c);
      const origStrict = tenantDbManager.getStrictTenantDb.bind(tenantDbManager);
      const realTenantDb = await origStrict(orgA);
      tenantDbManager.getStrictTenantDb = async () => ({
        query: (sql, p) => realTenantDb.query(sql, p),
        withTransaction: async (cb) =>
          realTenantDb.withTransaction(async (client) => {
            const wrappedClient = {
              query: async (sql, p) => {
                if (typeof sql === 'string' && sql.startsWith('ROLLBACK TO SAVEPOINT')) {
                  // Force a real PostgreSQL syntax/savepoint failure by running invalid savepoint release
                  return client.query('RELEASE SAVEPOINT nonexistent_pg17_sp;');
                }
                return client.query(sql, p);
              },
            };
            return cb(wrappedClient);
          }),
      });
      try {
        const spFailId = crypto.randomUUID();
        const spFailRes = await request(app)
          .post('/api/v1/sync/push')
          .set('Authorization', `Bearer ${devAToken}`)
          .send({
            events: [
              {
                id: crypto.randomUUID(),
                entityType: 'MILK_COLLECTION',
                entityId: spFailId,
                idempotencyKey: `SP-OK-${spFailId}`,
                payload: { customerId: custAId, operatorId: opA, rateChartVersionId: rcvA, milkCategory: 'COW', netWeight: 2, fatPercentage: 4.2, snfPercentage: 8.6, appliedRatePerUnit: 42, totalAmount: 84 },
              },
              {
                id: crypto.randomUUID(),
                entityType: 'CUSTOMER_REGISTRATION',
                entityId: crypto.randomUUID(),
                idempotencyKey: `SP-TRIG-ROLLBACK-${spFailId}`,
                payload: { permittedCategories: ['COW'] },
              },
            ],
          });
        assert.ok(spFailRes.status >= 400, `Savepoint failure must abort batch, got ${spFailRes.status}`);
        assert.equal(Number((await poolA.query(`SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;`, [custAId])).rows[0].current_balance), balBefore);
        assert.equal(Number((await poolA.query(`SELECT COUNT(*)::int AS c FROM milk_collections;`)).rows[0].c), countBefore);
      } finally {
        tenantDbManager.getStrictTenantDb = origStrict;
      }
    });

    await suite.test('17-18. Cross-tenant rejection & unavailable tenant DB failure (503)', async () => {
      // Tenant A device pushing Tenant B customer or header is rejected
      const crossCustRes = await request(app)
        .post('/api/v1/sync/push')
        .set('Authorization', `Bearer ${devAToken}`)
        .send({
          events: [
            {
              id: crypto.randomUUID(),
              entityType: 'MILK_COLLECTION',
              entityId: crypto.randomUUID(),
              idempotencyKey: `CROSS-CUST-${suffix}`,
              payload: { customerId: custB, operatorId: opA, rateChartVersionId: rcvA, milkCategory: 'COW', netWeight: 5, fatPercentage: 4.2, snfPercentage: 8.6, appliedRatePerUnit: 42, totalAmount: 210 },
            },
          ],
        });
      assert.equal(crossCustRes.status, 200);
      assert.equal(crossCustRes.body.data.applied, 0);
      assert.equal(crossCustRes.body.data.results[0].status, 'ERROR');
      assert.equal((await poolB.query(`SELECT COUNT(*)::int AS c FROM milk_collections;`)).rows[0].c, 0);

      // Cross-tenant header rejected 403
      const crossHdr = await request(app)
        .post('/api/v1/sync/push')
        .set('Authorization', `Bearer ${devAToken}`)
        .set('X-Dairy-Tenant-Id', orgB)
        .send({ events: [] });
      assert.equal(crossHdr.status, 403);

      // Unmapped tenant returns 503
      const unmappedToken = createDeviceToken({
        sub: crypto.randomUUID(),
        organizationId: crypto.randomUUID(),
        centerId: crypto.randomUUID(),
        deviceIdentifier: 'PG17-UNMAPPED',
      }).token;
      const unmappedRes = await request(app)
        .post('/api/v1/sync/push')
        .set('Authorization', `Bearer ${unmappedToken}`)
        .send({ events: [] });
      assert.equal(unmappedRes.status, 503);
    });

    await suite.test('5-6. Device revocation & revoked-token replay rejection', async () => {
      const rev = await request(app)
        .post('/api/v1/devices/revoke')
        .set('Authorization', `Bearer ${ownerTokenA}`)
        .send({ deviceId: devAId, reason: 'Decommissioned in PG17 gate' });
      assert.equal(rev.status, 200);
      assert.equal(rev.body.data.status, 'BLOCKED');

      const replay = await request(app)
        .post('/api/v1/sync/push')
        .set('Authorization', `Bearer ${devAToken}`)
        .send({ events: [] });
      assert.equal(replay.status, 403);
      assert.equal(replay.body.error.code, 'DEVICE_REVOKED');

      // Audit log recorded in Tenant A DB
      const auditRes = await poolA.query(
        `SELECT action, entity_id FROM audit_logs WHERE entity_id = $1 AND action = 'DEVICE_REVOKED';`,
        [devAId]
      );
      assert.equal(auditRes.rows.length, 1);

      // Tenant B device remains operational and completely isolated
      const devBStatus = await request(app).get('/api/v1/sync/status').set('Authorization', `Bearer ${devBToken}`);
      assert.equal(devBStatus.status, 200);
      assert.equal(devBStatus.body.data.organizationId, orgB);
    });

    await tenantDbManager.closeAllPools();
    await db.close();
    assert.deepEqual(poolErrors, [], `Unexpected async pool errors: ${JSON.stringify(poolErrors)}`);
  } finally {
    const closePoolCleanly = async (p) => {
      if (!p) return;
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        if (p.totalCount === p.idleCount && p.waitingCount === 0) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      await p.end();
    };
    const waitForDbIdle = async (dbName) => {
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        const res = await adminPool.query(
          `SELECT COUNT(*)::int AS cnt FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid();`,
          [dbName]
        );
        if (Number(res.rows[0]?.cnt || 0) === 0) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    };

    await closePoolCleanly(poolCtrl);
    await closePoolCleanly(poolA);
    await closePoolCleanly(poolB);
    await waitForDbIdle(dbNameA);
    await waitForDbIdle(dbNameB);
    await waitForDbIdle(dbNameCtrl);
    await adminPool.query(`DROP DATABASE IF EXISTS ${dbNameA} WITH (FORCE);`);
    await adminPool.query(`DROP DATABASE IF EXISTS ${dbNameB} WITH (FORCE);`);
    await adminPool.query(`DROP DATABASE IF EXISTS ${dbNameCtrl} WITH (FORCE);`);
    await adminPool.end();
    assert.deepEqual(poolErrors, [], `Unexpected async pool errors during cleanup: ${JSON.stringify(poolErrors)}`);
  }
});
