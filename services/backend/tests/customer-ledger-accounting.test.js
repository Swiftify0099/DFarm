import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import pg from 'pg';
import crypto from 'node:crypto';
import { assertDisposablePg17Cluster } from '../../../scripts/pg17-safety-guard.js';
import { createPoolShutdownManager } from './helpers/pool-lifecycle-helpers.js';

const { Pool } = pg;

// Strictly require explicit TEST_POSTGRES_URL. Never fall back to DATABASE_URL or ambient ports.
const TEST_PG_URL = process.env['TEST_POSTGRES_URL'] || '';
const REQUIRE_REAL_PG = process.env['REQUIRE_REAL_POSTGRES'] === '1';

const CONNECTION_UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  '28P01',
  '28000',
  '3D000',
  '57P01',
  '57P02',
  '57P03',
]);

function isConnectionUnavailableError(err) {
  if (!err) return false;
  if (CONNECTION_UNAVAILABLE_CODES.has(err.code)) return true;
  const msg = String(err.message || '');
  return (
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('Connection terminated') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ENOTFOUND') ||
    msg.includes('socket hang up')
  );
}

async function canConnectRealPostgres(url) {
  if (!url) return false;
  const probe = new Pool({ connectionString: url, connectionTimeoutMillis: 2000 });
  const probeErrors = [];
  probe.on('error', (err) => {
    probeErrors.push(err);
  });

  let reachable = false;
  let queryErr = null;
  let endErr = null;

  try {
    const res = await probe.query('SELECT version() AS v;');
    reachable = Boolean(res.rows[0]?.v);
  } catch (err) {
    queryErr = err;
    reachable = false;
  } finally {
    try {
      await probe.end();
    } catch (err) {
      endErr = err;
    }
  }

  if (endErr && (reachable || !isConnectionUnavailableError(endErr) || REQUIRE_REAL_PG)) {
    throw endErr;
  }
  if (probeErrors.length > 0 && (reachable || REQUIRE_REAL_PG)) {
    throw probeErrors[0];
  }
  if (queryErr && !isConnectionUnavailableError(queryErr) && REQUIRE_REAL_PG) {
    throw queryErr;
  }

  return reachable;
}

function makeDbUrl(baseUrl, dbName) {
  const u = new URL(baseUrl);
  u.pathname = `/${dbName}`;
  return u.toString();
}

test('DFarm Phase 12: Customer Financial Accounting & Double-Entry Ledger Suite (Isolated Database-Per-Dairy PG17)', async (t) => {
  const reachable = await canConnectRealPostgres(TEST_PG_URL);
  if (!reachable) {
    const msg =
      'Real PostgreSQL 17 server unavailable (TEST_POSTGRES_URL unset or unreachable); no ambient fallback permitted.';
    if (REQUIRE_REAL_PG) {
      assert.fail(`REQUIRE_REAL_POSTGRES=1 gate failed: ${msg}`);
    }
    console.log(`[CUSTOMER LEDGER ACCOUNTING] ${msg} Marked as SKIP / NOT RUN.`);
    t.skip(msg);
    return;
  }

  await assertDisposablePg17Cluster({ connectionString: TEST_PG_URL });

  const poolErrors = [];
  const guardedPools = new WeakSet();
  const attachPoolErrorGuard = (pool, label) => {
    if (!pool || guardedPools.has(pool)) return pool;
    guardedPools.add(pool);
    pool.on('error', (err) => {
      poolErrors.push({ label, code: err?.code, message: err?.message || String(err) });
    });
    return pool;
  };

  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  const dbNameCtrl = `dfarm_l12_ctrl_${suffix}`;
  const dbNameOrg1 = `dfarm_l12_org1_${suffix}`;
  const dbNameOrg2 = `dfarm_l12_org2_${suffix}`;

  const ctrlUrl = makeDbUrl(TEST_PG_URL, dbNameCtrl);
  const org1Url = makeDbUrl(TEST_PG_URL, dbNameOrg1);
  const org2Url = makeDbUrl(TEST_PG_URL, dbNameOrg2);

  const adminPool = attachPoolErrorGuard(
    new Pool({ connectionString: TEST_PG_URL, connectionTimeoutMillis: 5000 }),
    'adminPool'
  );
  let poolCtrl;
  let poolOrg1;
  let poolOrg2;
  let tenantDbManagerRef = null;
  let dbRef = null;
  let realtimePublisherRef = null;
  let sseTicketServiceRef = null;
  const createdDatabases = [];
  let cleanupPromise = null;
  const { closePoolCleanly } = createPoolShutdownManager();

  const org1Id = crypto.randomUUID();
  const org2Id = crypto.randomUUID();

  const waitForDbIdle = async (dbName) => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const res = await adminPool.query(
        `SELECT COUNT(*)::int AS cnt FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid();`,
        [dbName]
      );
      if (Number(res.rows[0]?.cnt || 0) === 0) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const finalRes = await adminPool.query(
      `SELECT COUNT(*)::int AS cnt FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid();`,
      [dbName]
    );
    const remaining = Number(finalRes.rows[0]?.cnt || 0);
    if (remaining > 0) {
      throw new Error(
        `Disposable database '${dbName}' still had ${remaining} active/idle connection(s) before DROP DATABASE.`
      );
    }
  };

  const cleanup = () => {
    if (cleanupPromise) return cleanupPromise;
    cleanupPromise = (async () => {
      const cleanupErrors = [];
      const runStep = async (fn) => {
        try {
          await fn();
        } catch (err) {
          cleanupErrors.push(err instanceof Error ? err : new Error(String(err)));
        }
      };

      // 1. Stop background producers and await all in-flight background work before closing pools
      if (realtimePublisherRef) {
        await runStep(() => realtimePublisherRef.destroy());
      }
      if (sseTicketServiceRef) {
        await runStep(() => sseTicketServiceRef.destroy());
      }

      // 2. Close all TenantDatabaseManager pools cleanly and verify removal
      if (tenantDbManagerRef) {
        const knownDairyIds = new Set([org1Id, org2Id]);
        for (const m of tenantDbManagerRef.getAllMappings?.() || []) {
          if (m?.dairyId) knownDairyIds.add(m.dairyId);
        }
        for (const dairyId of knownDairyIds) {
          await runStep(async () => {
            const tenantPool = tenantDbManagerRef.getTenantPool?.(dairyId);
            if (tenantPool) {
              const label = `tenantPool_${dairyId.slice(0, 8)}`;
              attachPoolErrorGuard(tenantPool, label);
              await closePoolCleanly(tenantPool, label, () => tenantDbManagerRef.closeTenantPool(dairyId));
              assert.strictEqual(tenantPool.ended, true, `Tenant pool '${label}' must reach ended=true`);
              assert.strictEqual(
                tenantDbManagerRef.getTenantPool(dairyId),
                undefined,
                `Tenant pool '${label}' must be evicted from manager`
              );
            }
          });
        }
        await runStep(() => tenantDbManagerRef.closeAllPools());
      }

      // 3. Close global PostgresPool singleton safely
      if (dbRef) {
        await runStep(async () => {
          attachPoolErrorGuard(dbRef.pool, 'globalDbPool');
          await closePoolCleanly(dbRef.pool, 'globalDbPool', () => dbRef.close());
          assert.strictEqual(dbRef.pool.ended, true, 'Global db.pool must reach ended=true');
        });
      }

      // 4. Close direct test pools cleanly and verify all reached ended=true
      for (const [pool, label] of [
        [poolCtrl, 'poolCtrl'],
        [poolOrg1, 'poolOrg1'],
        [poolOrg2, 'poolOrg2'],
      ]) {
        if (pool) {
          await runStep(async () => {
            await closePoolCleanly(pool, label);
            assert.strictEqual(pool.ended, true, `Pool '${label}' must reach ended=true`);
          });
        }
      }

      // 5. Confirm zero pg_stat_activity connections, then drop disposable databases cleanly (no WITH FORCE)
      for (const dbName of [...createdDatabases].reverse()) {
        await runStep(async () => {
          await waitForDbIdle(dbName);
          await adminPool.query(`DROP DATABASE IF EXISTS ${dbName};`);
          const dropCheck = await adminPool.query(
            `SELECT 1 FROM pg_database WHERE datname = $1;`,
            [dbName]
          );
          assert.strictEqual(dropCheck.rows.length, 0, `Disposable database '${dbName}' must be dropped`);
        });
      }

      // 6. Close admin maintenance pool last
      await runStep(async () => {
        await closePoolCleanly(adminPool, 'adminPool');
        assert.strictEqual(adminPool.ended, true, 'adminPool must reach ended=true');
      });

      // 7. Fail loudly if any unexpected async pool error was captured
      await runStep(async () => {
        assert.deepEqual(poolErrors, [], `Unexpected async PostgreSQL pool errors: ${JSON.stringify(poolErrors)}`);
      });

      if (cleanupErrors.length === 1) {
        throw cleanupErrors[0];
      }
      if (cleanupErrors.length > 1) {
        throw new AggregateError(
          cleanupErrors,
          `Cleanup failed with ${cleanupErrors.length} errors: ${cleanupErrors.map((e) => e.message).join('; ')}`
        );
      }
    })();
    return cleanupPromise;
  };

  let primaryError = null;

  try {
    await adminPool.query(`CREATE DATABASE ${dbNameCtrl};`);
    createdDatabases.push(dbNameCtrl);
    await adminPool.query(`CREATE DATABASE ${dbNameOrg1};`);
    createdDatabases.push(dbNameOrg1);
    await adminPool.query(`CREATE DATABASE ${dbNameOrg2};`);
    createdDatabases.push(dbNameOrg2);

    poolCtrl = attachPoolErrorGuard(new Pool({ connectionString: ctrlUrl, max: 10 }), 'poolCtrl');
    poolOrg1 = attachPoolErrorGuard(new Pool({ connectionString: org1Url, max: 15 }), 'poolOrg1');
    poolOrg2 = attachPoolErrorGuard(new Pool({ connectionString: org2Url, max: 10 }), 'poolOrg2');

    const verRes = await poolOrg1.query(`SELECT current_setting('server_version_num')::int AS ver_num;`);
    const verNum = Number(verRes.rows[0]?.ver_num || 0);
    assert.ok(verNum >= 170000 && verNum < 180000, `Expected PostgreSQL 17.x, got ${verNum}`);

    // Point backend singletons to disposable control-plane DB BEFORE importing any dist/ module (config/env.js)
    process.env['NODE_ENV'] = 'test';
    process.env['TEST_REAL_POSTGRES'] = '1';
    process.env['DATABASE_TLS_MODE'] = 'disable';
    process.env['CENTRAL_DATABASE_URL'] = ctrlUrl;
    process.env['DATABASE_URL'] = ctrlUrl;
    process.env['DATABASE_PROVISIONER_URL'] = ctrlUrl;
    process.env['TENANT_POOL_CONNECTION_TIMEOUT_MS'] = '5000';

    const { MigrationRunner } = await import('../dist/infrastructure/database/MigrationRunner.js');
    const ctrlMigs = await MigrationRunner.runControlPlaneMigrations(poolCtrl);
    const org1Migs = await MigrationRunner.runTenantMigrations(poolOrg1, org1Id);
    const org2Migs = await MigrationRunner.runTenantMigrations(poolOrg2, org2Id);
    assert.ok(ctrlMigs.every((m) => m.status === 'APPLIED'));
    assert.ok(org1Migs.every((m) => m.status === 'APPLIED'));
    assert.ok(org2Migs.every((m) => m.status === 'APPLIED'));

    const { createApp } = await import('../dist/app.js');
    const { db } = await import('../dist/infrastructure/database/PostgresPool.js');
    dbRef = db;
    attachPoolErrorGuard(db.pool, 'globalDbPool');
    const { tenantDbManager } = await import('../dist/infrastructure/database/TenantDatabaseManager.js');
    tenantDbManagerRef = tenantDbManager;
    const { realtimePublisher } = await import('../dist/infrastructure/realtime/RealtimeEventPublisher.js');
    realtimePublisherRef = realtimePublisher;
    const { sseTicketService } = await import('../dist/infrastructure/security/SseTicketService.js');
    sseTicketServiceRef = sseTicketService;
    const { CredentialEncryption } = await import('../dist/infrastructure/security/CredentialEncryption.js');
    const { HmacJwtTokenService } = await import('../dist/infrastructure/security/HmacJwtTokenService.js');
    const { PostgresLedgerRepository } = await import('../dist/infrastructure/repositories/PostgresLedgerRepository.js');
    const { CustomerLedgerAccount } = await import('../dist/domain/entities/CustomerLedgerAccount.js');

    const controlPlaneAdapter = {
      query: (text, params) => poolCtrl.query(text, params),
      withTransaction: async (callback) => {
        const client = await poolCtrl.connect();
        let txErr = null;
        let rollbackErr = null;
        try {
          await client.query('BEGIN');
          const result = await callback(client);
          await client.query('COMMIT');
          return result;
        } catch (err) {
          txErr = err;
          try {
            await client.query('ROLLBACK');
          } catch (rbErr) {
            rollbackErr = rbErr;
          }
          if (rollbackErr) {
            const orig = txErr instanceof Error ? txErr : new Error(String(txErr));
            const rb = rollbackErr instanceof Error ? rollbackErr : new Error(String(rollbackErr));
            throw new AggregateError([orig, rb], `${orig.message} (ROLLBACK also failed: ${rb.message})`);
          }
          throw err;
        } finally {
          client.release(rollbackErr || undefined);
        }
      },
    };
    tenantDbManager.setControlPlaneDb(controlPlaneAdapter);

    const app = createApp();
    const tokenService = new HmacJwtTokenService();
    const ledgerRepo = new PostgresLedgerRepository();

    const org1Code = `L12_A_${suffix.toUpperCase()}`;
    const org2Code = `L12_B_${suffix.toUpperCase()}`;
    const center1Id = crypto.randomUUID();
    const center2Id = crypto.randomUUID();
    const adminUserId = crypto.randomUUID();
    const supervisorUserId = crypto.randomUUID();
    const operatorUserId = crypto.randomUUID();
    const org2AdminUserId = crypto.randomUUID();

    const customer1Id = crypto.randomUUID();
    const customer2Id = crypto.randomUUID();
    const org2CustomerId = crypto.randomUUID();
    const globalCust1Id = crypto.randomUUID();
    const globalCust2Id = crypto.randomUUID();
    const globalCustOrg2Id = crypto.randomUUID();

    let adminToken = '';
    let supervisorToken = '';
    let operatorToken = '';
    let org2AdminToken = '';
    let customer1Token = '';

    let testAdvanceId = '';
    let testCollectionId = '';

    await t.test('0. Setup Disposable Isolated Organizations, Mappings, Centers, Staff, and Customers', async () => {
      // Seed control-plane organizations & authoritative encrypted tenant DB mappings
      await poolCtrl.query(
        `INSERT INTO organizations (id, name, code, status)
         VALUES ($1, 'L12 Isolated Dairy A', $2, 'ACTIVE'),
                ($3, 'L12 Isolated Dairy B', $4, 'ACTIVE');`,
        [org1Id, org1Code, org2Id, org2Code]
      );

      await poolCtrl.query(
        `INSERT INTO dairy_database_mappings (
           id, dairy_id, dairy_code, database_name, resource_type,
           connection_uri_encrypted, schema_version, provisioning_status, provisioned_at, last_verified_at
         ) VALUES
           ($1, $2, $3, $4, 'PHYSICAL_DATABASE', $5, 'v1.0.0', 'ACTIVE', NOW(), NOW()),
           ($6, $7, $8, $9, 'PHYSICAL_DATABASE', $10, 'v1.0.0', 'ACTIVE', NOW(), NOW());`,
        [
          crypto.randomUUID(), org1Id, org1Code, dbNameOrg1, CredentialEncryption.encrypt(org1Url),
          crypto.randomUUID(), org2Id, org2Code, dbNameOrg2, CredentialEncryption.encrypt(org2Url),
        ]
      );

      await tenantDbManager.initialize(controlPlaneAdapter);
      assert.equal(tenantDbManager.getControlPlaneDb(), controlPlaneAdapter);
      assert.equal(tenantDbManager.getTenantMapping(org1Id)?.databaseName, dbNameOrg1);
      assert.equal(tenantDbManager.getTenantMapping(org2Id)?.databaseName, dbNameOrg2);
      const strictDb1 = await tenantDbManager.getStrictTenantDb(org1Id);
      const strictDb2 = await tenantDbManager.getStrictTenantDb(org2Id);
      attachPoolErrorGuard(tenantDbManager.getTenantPool(org1Id), `tenantPool_${org1Id.slice(0, 8)}`);
      attachPoolErrorGuard(tenantDbManager.getTenantPool(org2Id), `tenantPool_${org2Id.slice(0, 8)}`);
      assert.equal((await strictDb1.query('SELECT current_database() AS d;')).rows[0].d, dbNameOrg1);
      assert.equal((await strictDb2.query('SELECT current_database() AS d;')).rows[0].d, dbNameOrg2);

      // Seed tenant DB A & control plane mirrors for auth verification
      for (const targetPool of [poolCtrl, poolOrg1]) {
        await targetPool.query(
          `INSERT INTO organizations (id, name, code, status)
           VALUES ($1, 'L12 Isolated Dairy A', $2, 'ACTIVE')
           ON CONFLICT (id) DO NOTHING;`,
          [org1Id, org1Code]
        );
        await targetPool.query(
          `INSERT INTO dairy_centers (
             id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status
           ) VALUES ($1, $2, 'C-L12-A', 'L12 Center A', 'Road A', 'Town A', 'Sangli', 'Maharashtra', '416417', '+919800001001', 'ACTIVE')
           ON CONFLICT (id) DO NOTHING;`,
          [center1Id, org1Id]
        );
        await targetPool.query(
          `INSERT INTO users (id, organization_id, username, full_name, email, phone_number, role, status) VALUES
             ($1, $4, 'l12_admin_' || $5, 'Admin L12', 'l12_admin_' || $5 || '@dfarm.test', '+9199' || $5 || '1', 'DAIRY_OWNER', 'ACTIVE'),
             ($2, $4, 'l12_sup_' || $5, 'Supervisor L12', 'l12_sup_' || $5 || '@dfarm.test', '+9199' || $5 || '2', 'SUPERVISOR', 'ACTIVE'),
             ($3, $4, 'l12_op_' || $5, 'Operator L12', 'l12_op_' || $5 || '@dfarm.test', '+9199' || $5 || '3', 'COLLECTION_OPERATOR', 'ACTIVE')
           ON CONFLICT (id) DO NOTHING;`,
          [adminUserId, supervisorUserId, operatorUserId, org1Id, suffix]
        );
        await targetPool.query(
          `INSERT INTO user_center_assignments (user_id, center_id, is_primary)
           VALUES ($1, $4, TRUE), ($2, $4, TRUE), ($3, $4, TRUE)
           ON CONFLICT DO NOTHING;`,
          [adminUserId, supervisorUserId, operatorUserId, center1Id]
        );
      }

      // Seed tenant DB B & control plane mirrors
      for (const targetPool of [poolCtrl, poolOrg2]) {
        await targetPool.query(
          `INSERT INTO organizations (id, name, code, status)
           VALUES ($1, 'L12 Isolated Dairy B', $2, 'ACTIVE')
           ON CONFLICT (id) DO NOTHING;`,
          [org2Id, org2Code]
        );
        await targetPool.query(
          `INSERT INTO dairy_centers (
             id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status
           ) VALUES ($1, $2, 'C-L12-B', 'L12 Center B', 'Road B', 'Town B', 'Kolhapur', 'Maharashtra', '416001', '+919800001002', 'ACTIVE')
           ON CONFLICT (id) DO NOTHING;`,
          [center2Id, org2Id]
        );
        await targetPool.query(
          `INSERT INTO users (id, organization_id, username, full_name, email, phone_number, role, status)
           VALUES ($1, $2, 'l12_org2_admin_' || $3, 'Org2 Admin L12', 'l12_org2_' || $3 || '@dfarm.test', '+9199' || $3 || '4', 'DAIRY_OWNER', 'ACTIVE')
           ON CONFLICT (id) DO NOTHING;`,
          [org2AdminUserId, org2Id, suffix]
        );
        await targetPool.query(
          `INSERT INTO user_center_assignments (user_id, center_id, is_primary)
           VALUES ($1, $2, TRUE) ON CONFLICT DO NOTHING;`,
          [org2AdminUserId, center2Id]
        );
      }

      // Seed customers in isolated Tenant DBs
      await poolOrg1.query(
        `INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status, is_deleted, global_customer_id)
         VALUES
           ($1, $3, $4, 'FC-L12-01', 'Ramesh L12', '+9198' || $5 || '1', 'ACTIVE', 'APPROVED', FALSE, $6),
           ($2, $3, $4, 'FC-L12-02', 'Suresh L12', '+9198' || $5 || '2', 'ACTIVE', 'APPROVED', FALSE, $7);`,
        [customer1Id, customer2Id, org1Id, center1Id, suffix, globalCust1Id, globalCust2Id]
      );

      await poolOrg2.query(
        `INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status, is_deleted, global_customer_id)
         VALUES ($1, $2, $3, 'FC-L12-03', 'Anand L12', '+9198' || $4 || '3', 'ACTIVE', 'APPROVED', FALSE, $5);`,
        [org2CustomerId, org2Id, center2Id, suffix, globalCustOrg2Id]
      );

      // Seed central global identities & memberships for customer JWT verification
      await poolCtrl.query(
        `INSERT INTO global_customer_identities (id, normalized_mobile_number, phone_verified_at)
         VALUES
           ($1, '+9198' || $4 || '1', NOW()),
           ($2, '+9198' || $4 || '2', NOW()),
           ($3, '+9198' || $4 || '3', NOW());`,
        [globalCust1Id, globalCust2Id, globalCustOrg2Id, suffix]
      );

      await poolCtrl.query(
        `INSERT INTO customer_dairy_memberships (
           id, global_customer_id, organization_id, tenant_customer_id, farmer_code,
           membership_status, dairy_name, dairy_code, center_id, center_name
         ) VALUES
           ($1, $2, $3, $4, 'FC-L12-01', 'APPROVED', 'L12 Isolated Dairy A', $5, $6, 'L12 Center A'),
           ($7, $8, $3, $9, 'FC-L12-02', 'APPROVED', 'L12 Isolated Dairy A', $5, $6, 'L12 Center A'),
           ($10, $11, $12, $13, 'FC-L12-03', 'APPROVED', 'L12 Isolated Dairy B', $14, $15, 'L12 Center B');`,
        [
          crypto.randomUUID(), globalCust1Id, org1Id, customer1Id, org1Code, center1Id,
          crypto.randomUUID(), globalCust2Id, customer2Id,
          crypto.randomUUID(), globalCustOrg2Id, org2Id, org2CustomerId, org2Code, center2Id,
        ]
      );

      await poolOrg1.query(
        `INSERT INTO customer_milk_categories (customer_id, milk_category, is_authorized, authorized_by)
         VALUES ($1, 'COW', TRUE, $3), ($2, 'COW', TRUE, $3);`,
        [customer1Id, customer2Id, adminUserId]
      );

      await poolOrg1.query(
        `INSERT INTO center_settings (
           center_id, cow_fat_min, cow_fat_max, cow_snf_min, cow_snf_max,
           buffalo_fat_min, buffalo_fat_max, buffalo_snf_min, buffalo_snf_max
         ) VALUES ($1, 2.8, 6.0, 7.8, 10.2, 5.0, 12.0, 8.2, 11.5)
         ON CONFLICT (center_id) DO UPDATE SET
           cow_fat_min = 2.8, cow_fat_max = 6.0, cow_snf_min = 7.8, cow_snf_max = 10.2;`,
        [center1Id]
      );

      const rcRes = await poolOrg1.query(
        `INSERT INTO rate_charts (organization_id, center_id, name, milk_category, pricing_type, is_active)
         VALUES ($1, $2, 'L12 Cow Rate Chart', 'COW', 'GRID', TRUE) RETURNING id;`,
        [org1Id, center1Id]
      );
      const rcvRes = await poolOrg1.query(
        `INSERT INTO rate_chart_versions (rate_chart_id, version_number, effective_from, is_approved, approved_by, approved_at)
         VALUES ($1, 1, NOW() - INTERVAL '1 day', TRUE, $2, NOW()) RETURNING id;`,
        [rcRes.rows[0].id, supervisorUserId]
      );
      await poolOrg1.query(
        `INSERT INTO rate_chart_cells (rate_chart_version_id, fat_percentage, snf_percentage, rate_per_unit)
         VALUES ($1, 4.0, 8.5, 36.50), ($1, 4.2, 8.5, 37.80), ($1, 3.5, 8.5, 34.00);`,
        [rcvRes.rows[0].id]
      );

      adminToken = tokenService.signToken({
        userId: adminUserId,
        organizationId: org1Id,
        centerId: center1Id,
        role: 'DAIRY_OWNER',
        actorType: 'STAFF',
        fullName: 'Admin L12',
      });
      supervisorToken = tokenService.signToken({
        userId: supervisorUserId,
        organizationId: org1Id,
        centerId: center1Id,
        role: 'SUPERVISOR',
        actorType: 'STAFF',
        fullName: 'Supervisor L12',
      });
      operatorToken = tokenService.signToken({
        userId: operatorUserId,
        organizationId: org1Id,
        centerId: center1Id,
        role: 'COLLECTION_OPERATOR',
        actorType: 'STAFF',
        fullName: 'Operator L12',
      });
      org2AdminToken = tokenService.signToken({
        userId: org2AdminUserId,
        organizationId: org2Id,
        centerId: center2Id,
        role: 'DAIRY_OWNER',
        actorType: 'STAFF',
        fullName: 'Org2 Admin L12',
      });
      customer1Token = tokenService.signToken({
        userId: customer1Id,
        organizationId: org1Id,
        centerId: center1Id,
        globalCustomerId: globalCust1Id,
        role: 'FARMER_CUSTOMER',
        actorType: 'CUSTOMER',
        fullName: 'Ramesh L12',
      });
    });

    await t.test('1. Milk credit: synchronous credit increases running liability balance & creates balanced journal in Tenant A only', async () => {
      const sessionRes = await poolOrg1.query(
        `SELECT public.create_milk_collection_session(
           $1::uuid, $2::uuid, $3::uuid, 'TEST_POS_01'::varchar, 'MORNING'::varchar,
           'COW'::varchar, 'SUPERVISOR_MANUAL'::varchar, gen_random_uuid(), CURRENT_DATE, NULL
         ) AS result;`,
        [center1Id, customer1Id, supervisorUserId]
      );
      const session = sessionRes.rows[0].result;

      const completeRes = await poolOrg1.query(
        `SELECT public.complete_milk_collection_session(
           $1::uuid, $2::uuid, 'TEST_POS_01'::varchar, 10.0::numeric, 4.0::numeric,
           8.5::numeric, 'KG'::varchar, 'MANUAL_ENTRY'::varchar, gen_random_uuid(), ('IDEM-L12-MILK-' || $3)::varchar
         ) AS result;`,
        [session.sessionId, supervisorUserId, suffix]
      );
      const complete = completeRes.rows[0].result;
      assert.ok(complete.collectionId);
      assert.ok(complete.newBalance > 0);
      testCollectionId = complete.collectionId;
      const milkCreditAmount = complete.totalAmount;

      const cla = await poolOrg1.query('SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;', [customer1Id]);
      assert.equal(parseFloat(cla.rows[0].current_balance), milkCreditAmount);

      const lt = await poolOrg1.query(
        "SELECT * FROM ledger_transactions WHERE reference_id = $1 AND transaction_type = 'MILK_COLLECTION_CREDIT';",
        [testCollectionId]
      );
      assert.equal(lt.rows.length, 1);
      assert.equal(lt.rows[0].direction, 'CREDIT');
      assert.equal(parseFloat(lt.rows[0].amount), milkCreditAmount);

      const le = await poolOrg1.query('SELECT * FROM ledger_entries WHERE transaction_id = $1;', [lt.rows[0].id]);
      assert.equal(le.rows.length, 2);
      const debitEntry = le.rows.find((e) => e.entry_type === 'DEBIT');
      const creditEntry = le.rows.find((e) => e.entry_type === 'CREDIT');
      assert.equal(parseFloat(debitEntry.amount), milkCreditAmount);
      assert.equal(parseFloat(creditEntry.amount), milkCreditAmount);
      assert.equal(debitEntry.account_type, 'MILK_PURCHASE_EXPENSE');
      assert.equal(creditEntry.account_type, 'CUSTOMER_PAYABLE');

      // Zero leakage to control plane or Tenant B
      assert.equal((await poolCtrl.query(`SELECT to_regclass('public.ledger_transactions') AS reg;`)).rows[0].reg, null);
      assert.equal(Number((await poolOrg2.query('SELECT COUNT(*)::int AS c FROM ledger_transactions;')).rows[0].c), 0);
    });

    await t.test('2. Advance debit: emergency cash advance reduces dairy liability balance, returns consistent balanceAfter & handles idempotent replay', async () => {
      const prevBalance = parseFloat(
        (await poolOrg1.query('SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;', [customer1Id])).rows[0].current_balance
      );
      const advanceAmount = 200.0;
      const advIdemKey = `IDEM-L12-ADV-${suffix}`;
      const advRes = await poolOrg1.query(
        `SELECT public.post_customer_advance(
           $1::uuid, $2::uuid, $3::uuid, $4::numeric, $5::text, 'MONTHLY_BILL_DEDUCTION'::varchar, $6::varchar, CURRENT_DATE
         ) AS result;`,
        [customer1Id, center1Id, supervisorUserId, advanceAmount, 'Emergency purchase of veterinary medicines', advIdemKey]
      );
      const data = advRes.rows[0].result;
      assert.ok(data.advanceId);
      testAdvanceId = data.advanceId;
      assert.equal(Number(data.principalAmount), advanceAmount);
      assert.equal(data.status, 'ACTIVE');
      assert.equal(data.isIdempotentReplay, false);
      assert.equal(Number(data.previousBalance), prevBalance);

      const expectedBalance = parseFloat((prevBalance - advanceAmount).toFixed(2));
      assert.equal(Number(data.balanceAfter), expectedBalance);
      assert.equal(Number(data.newBalance), expectedBalance);

      // Idempotent replay must return matching balanceAfter & newBalance without double-debiting
      const replayAdvRes = await poolOrg1.query(
        `SELECT public.post_customer_advance(
           $1::uuid, $2::uuid, $3::uuid, $4::numeric, $5::text, 'MONTHLY_BILL_DEDUCTION'::varchar, $6::varchar, CURRENT_DATE
         ) AS result;`,
        [customer1Id, center1Id, supervisorUserId, advanceAmount, 'Emergency purchase of veterinary medicines', advIdemKey]
      );
      const replayData = replayAdvRes.rows[0].result;
      assert.equal(replayData.isIdempotentReplay, true);
      assert.equal(replayData.advanceId, testAdvanceId);
      assert.equal(Number(replayData.balanceAfter), expectedBalance);
      assert.equal(Number(replayData.newBalance), expectedBalance);

      const balAfterReplay = parseFloat(
        (await poolOrg1.query('SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;', [customer1Id])).rows[0].current_balance
      );
      assert.equal(balAfterReplay, expectedBalance);

      const lt = await poolOrg1.query("SELECT * FROM ledger_transactions WHERE reference_id = $1 AND transaction_type = 'CUSTOMER_ADVANCE_DEBIT';", [testAdvanceId]);
      assert.equal(lt.rows.length, 1);
      const le = await poolOrg1.query('SELECT * FROM ledger_entries WHERE transaction_id = $1;', [lt.rows[0].id]);
      assert.equal(le.rows.length, 2);
      assert.equal(le.rows.find((e) => e.entry_type === 'DEBIT').account_type, 'CUSTOMER_PAYABLE');
      assert.equal(le.rows.find((e) => e.entry_type === 'CREDIT').account_type, 'CASH_BANK');
    });

    await t.test('3. Partial advance recovery: partially recovers advance & credits customer liability ledger', async () => {
      const prevBalance = parseFloat(
        (await poolOrg1.query('SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;', [customer1Id])).rows[0].current_balance
      );
      const recoveryAmount = 80.0;
      const recRes = await poolOrg1.query(
        `SELECT public.recover_customer_advance($1::uuid, $2::uuid, $3::numeric, $4::varchar, $5::text) AS result;`,
        [testAdvanceId, operatorUserId, recoveryAmount, `IDEM-L12-REC1-${suffix}`, 'Cash counter repayment of Rs 80']
      );
      const data = recRes.rows[0].result;
      assert.equal(Number(data.recoveredAmount), recoveryAmount);
      assert.equal(Number(data.remainingPrincipal), 120.0);
      assert.equal(data.status, 'ACTIVE');
      assert.equal(Number(data.newBalance), parseFloat((prevBalance + recoveryAmount).toFixed(2)));
    });

    await t.test('4. Full advance recovery: settles remaining principal & rejects over-recovery', async () => {
      await assert.rejects(
        () =>
          poolOrg1.query(
            `SELECT public.recover_customer_advance($1::uuid, $2::uuid, $3::numeric, NULL, 'Over-recovery attempt') AS result;`,
            [testAdvanceId, operatorUserId, 150.0]
          ),
        /OVER_RECOVERY_PROHIBITED|exceeds/i
      );

      const settleRes = await poolOrg1.query(
        `SELECT public.recover_customer_advance($1::uuid, $2::uuid, $3::numeric, $4::varchar, 'Full final settlement') AS result;`,
        [testAdvanceId, operatorUserId, 120.0, `IDEM-L12-REC2-${suffix}`]
      );
      const data = settleRes.rows[0].result;
      assert.equal(Number(data.totalRecoveredAmount), 200.0);
      assert.equal(Number(data.remainingPrincipal), 0.0);
      assert.equal(data.status, 'FULLY_RECOVERED');
    });

    await t.test('5. Deduction posting: authorized charges reduce liability balance with balanced journal', async () => {
      const prevBalance = parseFloat(
        (await poolOrg1.query('SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;', [customer1Id])).rows[0].current_balance
      );
      const deductionAmount = 50.0;
      const dedRes = await poolOrg1.query(
        `SELECT public.post_customer_deduction(
           $1::uuid, $2::uuid, $3::uuid, 'VETERINARY_MEDICINE'::varchar, $4::numeric, $5::text, 'VET-INV-891'::varchar, $6::varchar
         ) AS result;`,
        [customer1Id, center1Id, supervisorUserId, deductionAmount, 'Deworming & Mineral mixture kit', `IDEM-L12-DED-${suffix}`]
      );
      const data = dedRes.rows[0].result;
      assert.equal(Number(data.amount), deductionAmount);
      assert.equal(Number(data.newBalance), parseFloat((prevBalance - deductionAmount).toFixed(2)));

      const lt = await poolOrg1.query("SELECT * FROM ledger_transactions WHERE reference_id = $1 AND transaction_type = 'AUTHORIZED_DEDUCTION_DEBIT';", [data.deductionId]);
      assert.equal(lt.rows.length, 1);
      const le = await poolOrg1.query('SELECT * FROM ledger_entries WHERE transaction_id = $1;', [lt.rows[0].id]);
      assert.equal(le.rows.length, 2);
      assert.equal(le.rows.find((e) => e.entry_type === 'DEBIT').account_type, 'CUSTOMER_PAYABLE');
      assert.equal(le.rows.find((e) => e.entry_type === 'CREDIT').account_type, 'DEDUCTION_INCOME');
    });

    await t.test('6. Duplicate financial event: duplicate idempotency key returns cached receipt without double-posting', async () => {
      const balanceBefore = parseFloat(
        (await poolOrg1.query('SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;', [customer1Id])).rows[0].current_balance
      );
      const replayRes = await poolOrg1.query(
        `SELECT public.post_customer_deduction(
           $1::uuid, $2::uuid, $3::uuid, 'VETERINARY_MEDICINE'::varchar, 50.00::numeric, 'Replay'::text, NULL, $4::varchar
         ) AS result;`,
        [customer1Id, center1Id, supervisorUserId, `IDEM-L12-DED-${suffix}`]
      );
      assert.equal(replayRes.rows[0].result.isIdempotentReplay, true);

      const balanceAfter = parseFloat(
        (await poolOrg1.query('SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;', [customer1Id])).rows[0].current_balance
      );
      assert.equal(balanceAfter, balanceBefore);
    });

    await t.test('7. Balanced journal: every transaction in ledger has SUM(Debits) = SUM(Credits)', async () => {
      const unbalanced = await poolOrg1.query(
        `SELECT lt.id, lt.amount,
                COALESCE(SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE 0 END), 0) AS total_debit,
                COALESCE(SUM(CASE WHEN le.entry_type = 'CREDIT' THEN le.amount ELSE 0 END), 0) AS total_credit
         FROM ledger_transactions lt
         LEFT JOIN ledger_entries le ON le.transaction_id = lt.id
         WHERE lt.customer_id = $1
         GROUP BY lt.id, lt.amount
         HAVING COALESCE(SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE 0 END), 0) <> COALESCE(SUM(CASE WHEN le.entry_type = 'CREDIT' THEN le.amount ELSE 0 END), 0)
            OR COALESCE(SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE 0 END), 0) <> lt.amount;`,
        [customer1Id]
      );
      assert.equal(unbalanced.rows.length, 0);
    });

    await t.test('8. Unbalanced journal rejection: direct insertion of invalid/negative/oversized entries is rejected with exact SQLSTATEs', async () => {
      const existingTxnRes = await poolOrg1.query(
        `SELECT id FROM ledger_transactions WHERE customer_id = $1 LIMIT 1;`,
        [customer1Id]
      );
      assert.equal(existingTxnRes.rows.length, 1);
      const validTxnId = existingTxnRes.rows[0].id;

      // 8a. entry_type exceeding VARCHAR(10) fails with SQLSTATE 22001 (string_data_right_truncation)
      await assert.rejects(
        () =>
          poolOrg1.query(
            `INSERT INTO ledger_entries (transaction_id, account_id, account_type, entry_type, amount)
             VALUES ($1, $2, 'CUSTOMER_PAYABLE', 'INVALID_TYPE', 100.00);`,
            [validTxnId, customer1Id]
          ),
        (err) => err.code === '22001'
      );

      // 8b. entry_type <= 10 chars violating chk_entry_type fails with SQLSTATE 23514
      await assert.rejects(
        () =>
          poolOrg1.query(
            `INSERT INTO ledger_entries (transaction_id, account_id, account_type, entry_type, amount)
             VALUES ($1, $2, 'CUSTOMER_PAYABLE', 'BOGUS', 100.00);`,
            [validTxnId, customer1Id]
          ),
        (err) => err.code === '23514' && /chk_entry_type/i.test(String(err.constraint || err.message))
      );

      // 8c. negative amount violating chk_entry_positive_amount fails with SQLSTATE 23514
      await assert.rejects(
        () =>
          poolOrg1.query(
            `INSERT INTO ledger_entries (transaction_id, account_id, account_type, entry_type, amount)
             VALUES ($1, $2, 'CUSTOMER_PAYABLE', 'DEBIT', -50.00);`,
            [validTxnId, customer1Id]
          ),
        (err) => err.code === '23514' && /chk_entry_positive_amount/i.test(String(err.constraint || err.message))
      );

      // 8d. empty string passed as UUID fails with SQLSTATE 22P02 (invalid_text_representation)
      await assert.rejects(
        () =>
          poolOrg1.query(
            `SELECT * FROM customer_ledger_accounts WHERE customer_id = $1::uuid;`,
            ['']
          ),
        (err) => err.code === '22P02'
      );
    });

    await t.test('9. Running balance summary: HTTP summary endpoint matches authoritative tenant DB balance', async () => {
      const dbBal = parseFloat(
        (await poolOrg1.query('SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;', [customer1Id])).rows[0].current_balance
      );
      const summaryRes = await request(app)
        .get(`/api/v1/ledger/summary?customerId=${customer1Id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      assert.equal(summaryRes.status, 200);
      assert.equal(summaryRes.body.success, true);
      assert.equal(summaryRes.body.data.customerId, customer1Id);
      assert.equal(summaryRes.body.data.currentBalance, dbBal);

      const acctRes = await request(app)
        .get(`/api/v1/ledger/accounts/${customer1Id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      assert.equal(acctRes.status, 200);
      assert.equal(acctRes.body.currentBalance, dbBal);
    });

    await t.test('10. Opening balance: initializes opening balance & prevents duplicates', async () => {
      const obRes = await poolOrg1.query(
        `SELECT public.post_customer_opening_balance(
           $1::uuid, $2::uuid, $3::uuid, 500.00::numeric, 'CREDIT'::varchar, '2026-04-01'::date, 'PREV-COOP-AUDIT-2026'::varchar, $4::varchar
         ) AS result;`,
        [customer2Id, center1Id, adminUserId, `IDEM-L12-OB-${suffix}`]
      );
      assert.equal(Number(obRes.rows[0].result.newBalance), 500.0);

      await assert.rejects(
        () =>
          poolOrg1.query(
            `SELECT public.post_customer_opening_balance(
               $1::uuid, $2::uuid, $3::uuid, 300.00::numeric, 'DEBIT'::varchar, CURRENT_DATE, 'ANOTHER-REF'::varchar, NULL
             ) AS result;`,
            [customer2Id, center1Id, adminUserId]
          ),
        /OPENING_BALANCE_EXISTS/
      );
    });

    await t.test('11. Reversal: supervisor collection reversal creates debit reversal transaction and restores prior balance', async () => {
      const prevBalance = parseFloat(
        (await poolOrg1.query('SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;', [customer1Id])).rows[0].current_balance
      );
      const colAmount = parseFloat(
        (await poolOrg1.query('SELECT total_amount FROM milk_collections WHERE id = $1;', [testCollectionId])).rows[0].total_amount
      );
      const revRes = await poolOrg1.query(
        `SELECT public.adjust_milk_collection($1::uuid, $2::uuid, 'Reversal of erroneous intake reading'::text, 'FULL_REVERSAL'::varchar, NULL, NULL, NULL) AS result;`,
        [testCollectionId, supervisorUserId]
      );
      const rev = revRes.rows[0].result;
      assert.equal(rev.status, 'REVERSED');
      assert.equal(Number(rev.reversedAmount), colAmount);
      assert.equal(Number(rev.newBalance), parseFloat((prevBalance - colAmount).toFixed(2)));

      const lt = await poolOrg1.query("SELECT * FROM ledger_transactions WHERE reference_id = $1 AND transaction_type = 'COLLECTION_REVERSAL_DEBIT';", [testCollectionId]);
      assert.equal(lt.rows.length, 1);
      assert.equal(lt.rows[0].direction, 'DEBIT');
    });

    await t.test('12. Adjustment approval: authorized adjustment endpoint updates tenant balance with authenticated operatorId', async () => {
      const prevBalance = parseFloat(
        (await poolOrg1.query('SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;', [customer1Id])).rows[0].current_balance
      );
      const adjAmount = 150.0;
      const res = await request(app)
        .post('/api/v1/ledger/adjustment')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerId: customer1Id,
          type: 'CREDIT',
          amount: adjAmount,
          reason: 'Authorized festive seasonal incentive approved by Board',
          operatorId: operatorUserId, // Attempted body override must be ignored in favor of req.user.userId
        });
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);

      const newBalance = parseFloat(
        (await poolOrg1.query('SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;', [customer1Id])).rows[0].current_balance
      );
      assert.equal(newBalance, parseFloat((prevBalance + adjAmount).toFixed(2)));

      const latestTxn = await poolOrg1.query(
        `SELECT created_by, amount, direction FROM ledger_transactions WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 1;`,
        [customer1Id]
      );
      assert.equal(latestTxn.rows[0].created_by, adminUserId, 'Server must record req.user.userId, never client-supplied operatorId');
    });

    await t.test('13. Unauthorized adjustment: Operator and Farmer cannot perform ledger adjustments (403 Forbidden)', async () => {
      const opRes = await request(app)
        .post('/api/v1/ledger/adjustment')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          customerId: customer1Id,
          type: 'CREDIT',
          amount: 100.0,
          reason: 'Unauthorized bonus attempt',
        });
      assert.equal(opRes.status, 403);

      const custRes = await request(app)
        .post('/api/v1/ledger/adjustment')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          customerId: customer1Id,
          type: 'CREDIT',
          amount: 500.0,
          reason: 'Customer trying to credit self',
        });
      assert.equal(custRes.status, 403);
    });

    await t.test('14. Immutable historical transactions: direct UPDATE or DELETE on ledger_transactions triggers database exception', async () => {
      const lt = await poolOrg1.query('SELECT id FROM ledger_transactions WHERE customer_id = $1 LIMIT 1;', [customer1Id]);
      assert.ok(lt.rows.length > 0);
      const txnId = lt.rows[0].id;

      await assert.rejects(
        () => poolOrg1.query('UPDATE ledger_transactions SET amount = 9999.00 WHERE id = $1;', [txnId]),
        /CANNOT_MUTATE_LEDGER/
      );
      await assert.rejects(
        () => poolOrg1.query('DELETE FROM ledger_transactions WHERE id = $1;', [txnId]),
        /CANNOT_DELETE_LEDGER/
      );
    });

    await t.test('15. Customer ownership: customer reads only own ledger; cross-customer access is forbidden', async () => {
      const ownRes = await request(app)
        .get('/api/v1/ledger/summary')
        .set('Authorization', `Bearer ${customer1Token}`);
      assert.equal(ownRes.status, 200);
      assert.equal(ownRes.body.data.customerId, customer1Id);

      const otherRes = await request(app)
        .get(`/api/v1/ledger/accounts/${customer2Id}`)
        .set('Authorization', `Bearer ${customer1Token}`);
      assert.equal(otherRes.status, 403);
    });

    await t.test('16. Cross-organization isolation: Staff from Org 2 cannot read or post to Org 1 customer ledger', async () => {
      const crossRead = await request(app)
        .get(`/api/v1/ledger/accounts/${customer1Id}?organizationId=${org1Id}`)
        .set('Authorization', `Bearer ${org2AdminToken}`);
      assert.equal(crossRead.status, 403);

      const crossAdj = await request(app)
        .post('/api/v1/ledger/adjustment')
        .set('Authorization', `Bearer ${org2AdminToken}`)
        .send({
          organizationId: org1Id,
          customerId: customer1Id,
          type: 'DEBIT',
          amount: 50.0,
          reason: 'Cross org adjustment attempt',
        });
      assert.equal(crossAdj.status, 403);

      assert.equal(await ledgerRepo.findByCustomer(customer1Id, org2Id), null);
    });

    await t.test('17. Reconciliation success: clean customer ledger returns isReconciled: true and 0 discrepancies', async () => {
      const recRes = await poolOrg1.query('SELECT public.reconcile_customer_ledger($1::uuid, $2::uuid) AS result;', [
        customer1Id,
        adminUserId,
      ]);
      const report = recRes.rows[0].result;
      const reportJson = JSON.stringify(report, null, 2);
      assert.equal(report.customerId, customer1Id, reportJson);
      assert.equal(report.isReconciled, true, `Expected clean ledger to reconcile cleanly; discrepancies: ${reportJson}`);
      assert.equal(report.discrepancyCount, 0, reportJson);
      assert.deepEqual(report.discrepancies, [], reportJson);
      assert.equal(Number(report.accountBalance), Number(report.computedBalance), reportJson);
      const netFromSummary = parseFloat((Number(report.summary.totalCredits) - Number(report.summary.totalDebits)).toFixed(2));
      assert.equal(Number(report.accountBalance), netFromSummary, reportJson);
      assert.equal(Number(report.summary.journalTotalDebits), Number(report.summary.journalTotalCredits), reportJson);
    });

    await t.test('18. Reconciliation mismatch detection: detects running balance drift without auto-correcting', async () => {
      await poolOrg1.query('UPDATE customer_ledger_accounts SET current_balance = current_balance + 100.00 WHERE customer_id = $1;', [customer2Id]);
      const recRes = await poolOrg1.query('SELECT public.reconcile_customer_ledger($1::uuid, $2::uuid) AS result;', [
        customer2Id,
        adminUserId,
      ]);
      const report = recRes.rows[0].result;
      assert.equal(report.isReconciled, false);
      assert.ok(report.discrepancyCount > 0);
      const mismatch = report.discrepancies.find((d) => d.type === 'RUNNING_BALANCE_MISMATCH');
      assert.ok(mismatch);
      assert.equal(Number(mismatch.difference), 100.0);

      await poolOrg1.query('UPDATE customer_ledger_accounts SET current_balance = current_balance - 100.00 WHERE customer_id = $1;', [customer2Id]);
    });

    await t.test('19. Decimal precision: financial calculations use exact PostgreSQL NUMERIC arithmetic without floating-point error', async () => {
      const precRes = await poolOrg1.query(`
        SELECT
          (0.10::numeric(10,2) + 0.20::numeric(10,2)) AS exact_sum,
          (123456.78::numeric(12,2) - 0.01::numeric(12,2)) AS exact_sub;
      `);
      assert.equal(precRes.rows[0].exact_sum, '0.30');
      assert.equal(precRes.rows[0].exact_sub, '123456.77');
    });

    await t.test('20. Database rollback: transactional failure leaves zero partial entries in ledger or accounts', async () => {
      const balanceBefore = (await poolOrg1.query('SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;', [customer1Id])).rows[0].current_balance;
      const countBefore = (await poolOrg1.query('SELECT COUNT(*) FROM ledger_transactions WHERE customer_id = $1;', [customer1Id])).rows[0].count;

      await assert.rejects(() =>
        poolOrg1.query(
          `SELECT public.post_customer_deduction($1::uuid, $2::uuid, $3::uuid, 'VETERINARY_MEDICINE'::varchar, -100.00::numeric, 'Invalid'::text, NULL, NULL);`,
          [customer1Id, center1Id, supervisorUserId]
        )
      );

      const balanceAfter = (await poolOrg1.query('SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;', [customer1Id])).rows[0].current_balance;
      const countAfter = (await poolOrg1.query('SELECT COUNT(*) FROM ledger_transactions WHERE customer_id = $1;', [customer1Id])).rows[0].count;
      assert.equal(balanceAfter, balanceBefore);
      assert.equal(countAfter, countBefore);
    });

    await t.test('21. Feed debit via PostgresLedgerRepository.save(): double-entry journal, idempotency & actor enforcement', async () => {
      const accountBefore = await ledgerRepo.findByCustomer(customer1Id, org1Id);
      assert.ok(accountBefore);
      const prevBal = accountBefore.currentBalance;
      const feedDebitAmount = 750.0;
      const feedSaleId = crypto.randomUUID();
      const feedEntry = accountBefore.postDebit(feedDebitAmount, 'FEED_DEBIT', 'Feed Purchase Invoice #FEED-2026-9901', feedSaleId);
      const idempotencyKey = `IDEM-L12-FEED-${suffix}`;

      // Missing actor must reject
      await assert.rejects(
        () => ledgerRepo.save(accountBefore, feedEntry),
        (err) => err.name === 'DomainValidationError' && err.code === 'INVALID_OPERATOR'
      );

      await ledgerRepo.save(accountBefore, feedEntry, { operatorId: operatorUserId, idempotencyKey });
      // Idempotent replay must not double-debit
      await ledgerRepo.save(accountBefore, feedEntry, { operatorId: operatorUserId, idempotencyKey });

      const expectedBal = parseFloat((prevBal - feedDebitAmount).toFixed(2));
      const accountAfter = await ledgerRepo.findByCustomer(customer1Id, org1Id);
      assert.equal(accountAfter.currentBalance, expectedBal);

      const le = await poolOrg1.query('SELECT * FROM ledger_entries WHERE transaction_id = $1;', [feedEntry.id]);
      assert.equal(le.rows.length, 2);
      assert.equal(le.rows.find((e) => e.entry_type === 'DEBIT').account_type, 'CUSTOMER_PAYABLE');
      assert.equal(le.rows.find((e) => e.entry_type === 'CREDIT').account_type, 'FEED_INVENTORY');
    });

    await t.test('22. Payout, Ledger Entries, Reports & Operator Least-Privilege Verification', async () => {
      const balBeforePayout = (await ledgerRepo.findByCustomer(customer1Id, org1Id)).currentBalance;
      const payoutAmount = 100.0;

      const payRes = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerId: customer1Id,
          amount: payoutAmount,
          paymentMethod: 'BANK_TRANSFER',
          transactionReference: `UTR-L12-${suffix}`,
          notes: 'Payout settlement test',
        });
      assert.equal(payRes.status, 201);
      assert.equal(payRes.body.success, true);

      const balAfterPayout = (await ledgerRepo.findByCustomer(customer1Id, org1Id)).currentBalance;
      assert.equal(balAfterPayout, parseFloat((balBeforePayout - payoutAmount).toFixed(2)));

      const entriesRes = await request(app)
        .get(`/api/v1/ledger/entries?customerId=${customer1Id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      assert.equal(entriesRes.status, 200);
      assert.ok(entriesRes.body.count >= 4);

      const paymentsRes = await request(app)
        .get('/api/v1/payments')
        .set('Authorization', `Bearer ${adminToken}`);
      assert.equal(paymentsRes.status, 200);
      assert.ok(paymentsRes.body.count >= 1);

      const colReportRes = await request(app)
        .get('/api/v1/reports/collections')
        .set('Authorization', `Bearer ${adminToken}`);
      assert.equal(colReportRes.status, 200);
      assert.equal(colReportRes.body.success, true);

      // Collection operator lacks billing:read/passbook:view_own/collections:view_all on /ledger/entries
      const opEntriesRes = await request(app)
        .get(`/api/v1/ledger/entries?customerId=${customer1Id}`)
        .set('Authorization', `Bearer ${operatorToken}`);
      assert.equal(opEntriesRes.status, 403);
    });

    await t.test('23. Fix D: Customer auth resolves tenant DB strictly, enforces ownership/status & fails closed on outage', async () => {
      // 23a. Valid customer authentication succeeds (200) and resolves from tenant DB, never control-plane customers
      const validSummary = await request(app)
        .get('/api/v1/ledger/summary')
        .set('Authorization', `Bearer ${customer1Token}`);
      assert.equal(validSummary.status, 200);
      assert.equal(validSummary.body.data.customerId, customer1Id);

      // 23b. Customer attempting to read another customer's ledger -> 403
      const crossCustLedger = await request(app)
        .get(`/api/v1/ledger/accounts/${customer2Id}`)
        .set('Authorization', `Bearer ${customer1Token}`);
      assert.equal(crossCustLedger.status, 403);

      // 23c. Wrong tenant ID in JWT (customer1 belongs to org1Id, token claims org2Id) -> 403 TENANT_CONTEXT_MISMATCH
      const wrongTenantToken = tokenService.signToken({
        userId: customer1Id,
        organizationId: org2Id,
        centerId: center2Id,
        globalCustomerId: globalCust1Id,
        role: 'FARMER_CUSTOMER',
        actorType: 'CUSTOMER',
        fullName: 'Ramesh L12',
      });
      const wrongTenantRes = await request(app)
        .get('/api/v1/ledger/summary')
        .set('Authorization', `Bearer ${wrongTenantToken}`);
      assert.equal(wrongTenantRes.status, 403);

      // 23d. Customer belonging to another dairy (org2CustomerId with org1Id claim) -> 403
      const otherDairyCustomerToken = tokenService.signToken({
        userId: org2CustomerId,
        organizationId: org1Id,
        centerId: center1Id,
        globalCustomerId: globalCustOrg2Id,
        role: 'FARMER_CUSTOMER',
        actorType: 'CUSTOMER',
        fullName: 'Anand L12',
      });
      const otherDairyRes = await request(app)
        .get('/api/v1/ledger/summary')
        .set('Authorization', `Bearer ${otherDairyCustomerToken}`);
      assert.equal(otherDairyRes.status, 403);

      // 23e. Missing membership -> fail closed (401)
      const unmappedCustToken = tokenService.signToken({
        userId: crypto.randomUUID(),
        organizationId: org1Id,
        globalCustomerId: crypto.randomUUID(),
        role: 'FARMER_CUSTOMER',
        actorType: 'CUSTOMER',
      });
      const missingMemRes = await request(app)
        .get('/api/v1/ledger/summary')
        .set('Authorization', `Bearer ${unmappedCustToken}`);
      assert.equal(missingMemRes.status, 401);

      // 23f. Suspended and soft-deleted customer -> 403
      const suspCustId = crypto.randomUUID();
      const suspGlobalId = crypto.randomUUID();
      const delCustId = crypto.randomUUID();
      const delGlobalId = crypto.randomUUID();
      await poolOrg1.query(
        `INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status, is_deleted, global_customer_id)
         VALUES
           ($1, $3, $4, 'FC-SUSP', 'Suspended Farmer', '+9198' || $5 || '8', 'SUSPENDED', 'APPROVED', FALSE, $6),
           ($2, $3, $4, 'FC-DEL', 'Deleted Farmer', '+9198' || $5 || '9', 'ACTIVE', 'APPROVED', TRUE, $7);`,
        [suspCustId, delCustId, org1Id, center1Id, suffix, suspGlobalId, delGlobalId]
      );
      await poolCtrl.query(
        `INSERT INTO global_customer_identities (id, normalized_mobile_number, phone_verified_at)
         VALUES ($1, '+9198' || $3 || '8', NOW()), ($2, '+9198' || $3 || '9', NOW());`,
        [suspGlobalId, delGlobalId, suffix]
      );
      await poolCtrl.query(
        `INSERT INTO customer_dairy_memberships (id, global_customer_id, organization_id, tenant_customer_id, farmer_code, membership_status, dairy_name, dairy_code, center_id, center_name)
         VALUES
           ($1, $2, $3, $4, 'FC-SUSP', 'APPROVED', 'L12 Isolated Dairy A', $5, $6, 'L12 Center A'),
           ($7, $8, $3, $9, 'FC-DEL', 'APPROVED', 'L12 Isolated Dairy A', $5, $6, 'L12 Center A');`,
        [crypto.randomUUID(), suspGlobalId, org1Id, suspCustId, org1Code, center1Id, crypto.randomUUID(), delGlobalId, delCustId]
      );
      const suspToken = tokenService.signToken({
        userId: suspCustId,
        organizationId: org1Id,
        globalCustomerId: suspGlobalId,
        role: 'FARMER_CUSTOMER',
        actorType: 'CUSTOMER',
      });
      const delToken = tokenService.signToken({
        userId: delCustId,
        organizationId: org1Id,
        globalCustomerId: delGlobalId,
        role: 'FARMER_CUSTOMER',
        actorType: 'CUSTOMER',
      });
      assert.equal((await request(app).get('/api/v1/ledger/summary').set('Authorization', `Bearer ${suspToken}`)).status, 403);
      assert.equal((await request(app).get('/api/v1/ledger/summary').set('Authorization', `Bearer ${delToken}`)).status, 403);

      // 23g. Control-plane DB unavailable -> fail closed 503 AUTH_DB_UNAVAILABLE
      const origCtrlQuery = controlPlaneAdapter.query;
      controlPlaneAdapter.query = async (sql, params) => {
        if (typeof sql === 'string' && sql.includes('customer_dairy_memberships')) {
          throw new Error('Simulated control-plane outage');
        }
        return origCtrlQuery(sql, params);
      };
      try {
        const ctrlOutageRes = await request(app)
          .get('/api/v1/ledger/summary')
          .set('Authorization', `Bearer ${customer1Token}`);
        assert.equal(ctrlOutageRes.status, 503);
      } finally {
        controlPlaneAdapter.query = origCtrlQuery;
      }

      // 23h. Tenant DB unavailable -> fail closed 503 AUTH_DB_UNAVAILABLE / TENANT_DATABASE_UNAVAILABLE
      const origGetStrict = tenantDbManager.getStrictTenantDb.bind(tenantDbManager);
      tenantDbManager.getStrictTenantDb = async () => {
        throw new Error('Simulated tenant DB outage');
      };
      try {
        const tenantOutageRes = await request(app)
          .get('/api/v1/ledger/summary')
          .set('Authorization', `Bearer ${customer1Token}`);
        assert.equal(tenantOutageRes.status, 503);
      } finally {
        tenantDbManager.getStrictTenantDb = origGetStrict;
      }
    });
  } catch (err) {
    primaryError = err;
    throw err;
  } finally {
    try {
      await cleanup();
    } catch (cleanupErr) {
      if (primaryError) {
        const orig = primaryError instanceof Error ? primaryError : new Error(String(primaryError));
        const clean = cleanupErr instanceof Error ? cleanupErr : new Error(String(cleanupErr));
        throw new AggregateError(
          [orig, clean],
          `${orig.message} (cleanup also failed: ${clean.message})`
        );
      }
      throw cleanupErr;
    }
  }
});
