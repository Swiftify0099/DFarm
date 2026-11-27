import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import { assertDisposablePg17Cluster } from '../../../scripts/pg17-safety-guard.js';
import { createPoolShutdownManager } from './helpers/pool-lifecycle-helpers.js';

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

test('RESTART-03.3 Real PostgreSQL 17 Actual Repositories Integration, Concurrency & Idempotency Suite', async (suite) => {
  const reachable = await canConnectRealPostgres(TEST_PG_URL);
  if (!reachable) {
    const msg =
      'Real PostgreSQL 17 server unavailable (TEST_POSTGRES_URL unset or unreachable); boot docker-compose.pg17-verify.yml and set TEST_POSTGRES_URL.';
    if (REQUIRE_REAL_PG) {
      assert.fail(`REQUIRE_REAL_POSTGRES=1 gate failed: ${msg}`);
    }
    console.log(`[RESTART-03.3 REAL PG REPOS] ${msg} Marked as SKIP / NOT RUN (no pg-mem fallback).`);
    suite.skip(msg);
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
  const dbNameCtrl = `dfarm_r33_ctrl_${suffix}`;
  const dbNameA = `dfarm_r33_a_${suffix}`;
  const dbNameB = `dfarm_r33_b_${suffix}`;

  const ctrlUrl = makeDbUrl(TEST_PG_URL, dbNameCtrl);
  const urlA = makeDbUrl(TEST_PG_URL, dbNameA);
  const urlB = makeDbUrl(TEST_PG_URL, dbNameB);

  const adminPool = attachPoolErrorGuard(
    new Pool({ connectionString: TEST_PG_URL, connectionTimeoutMillis: 5000 }),
    'adminPool'
  );
  let poolCtrl;
  let poolA;
  let poolB;
  let tenantDbManagerRef = null;
  let dbRef = null;
  const createdDatabases = [];
  const { closePoolCleanly } = createPoolShutdownManager();

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

  const orgA = crypto.randomUUID();
  const orgB = crypto.randomUUID();
  let primaryError = null;

  try {
    await adminPool.query(`CREATE DATABASE ${dbNameCtrl};`);
    createdDatabases.push(dbNameCtrl);
    await adminPool.query(`CREATE DATABASE ${dbNameA};`);
    createdDatabases.push(dbNameA);
    await adminPool.query(`CREATE DATABASE ${dbNameB};`);
    createdDatabases.push(dbNameB);

    poolCtrl = attachPoolErrorGuard(new Pool({ connectionString: ctrlUrl, max: 5 }), 'poolCtrl');
    poolA = attachPoolErrorGuard(new Pool({ connectionString: urlA, max: 15 }), 'poolA');
    poolB = attachPoolErrorGuard(new Pool({ connectionString: urlB, max: 10 }), 'poolB');

    // Point backend singletons to disposable control-plane DB BEFORE importing any dist/ module (config/env.js)
    process.env['NODE_ENV'] = 'test';
    process.env['TEST_REAL_POSTGRES'] = '1';
    process.env['DATABASE_TLS_MODE'] = 'disable';
    process.env['CENTRAL_DATABASE_URL'] = ctrlUrl;
    process.env['DATABASE_URL'] = ctrlUrl;
    process.env['DATABASE_PROVISIONER_URL'] = ctrlUrl;
    process.env['TENANT_POOL_CONNECTION_TIMEOUT_MS'] = '5000';

    const { MigrationRunner } = await import('../dist/infrastructure/database/MigrationRunner.js');
    const ctrlMigrations = await MigrationRunner.runControlPlaneMigrations(poolCtrl);
    const tenantAMigrations = await MigrationRunner.runTenantMigrations(poolA, orgA);
    const tenantBMigrations = await MigrationRunner.runTenantMigrations(poolB, orgB);

    const { db } = await import('../dist/infrastructure/database/PostgresPool.js');
    dbRef = db;
    attachPoolErrorGuard(db.pool, 'globalDbPool');
    const { tenantDbManager } = await import('../dist/infrastructure/database/TenantDatabaseManager.js');
    tenantDbManagerRef = tenantDbManager;
    const { CredentialEncryption } = await import('../dist/infrastructure/security/CredentialEncryption.js');
    const {
      PostgresLedgerRepository,
      PostgresCollectionTransactionRepository,
      PostgresShiftSessionRepository,
      PostgresCustomerMembershipRepository,
    } = await import('../dist/infrastructure/index.js');
    const { MilkCollectionTransaction } = await import('../dist/domain/entities/MilkCollectionTransaction.js');
    const { KioskShiftSession } = await import('../dist/domain/entities/KioskShiftSession.js');
    const { CustomerLedgerAccount } = await import('../dist/domain/entities/CustomerLedgerAccount.js');
    const { CustomerMembership } = await import('../dist/domain/entities/CustomerMembership.js');

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

    const centerA = crypto.randomUUID();
    const centerB = crypto.randomUUID();
    const opA = crypto.randomUUID();
    const opInactive = crypto.randomUUID();
    const opCustomerRole = crypto.randomUUID();
    const opB = crypto.randomUUID();
    const custA = crypto.randomUUID();
    const custB = crypto.randomUUID();
    const sharedCustUuid = crypto.randomUUID();

    // Seed control-plane organizations and encrypted tenant mappings
    await poolCtrl.query(
      `INSERT INTO organizations (id, name, code, status)
       VALUES ($1, 'PG17 Repo Dairy A', $3, 'ACTIVE'),
              ($2, 'PG17 Repo Dairy B', $4, 'ACTIVE');`,
      [orgA, orgB, `R33_A_${suffix}`, `R33_B_${suffix}`]
    );
    await poolCtrl.query(
      `INSERT INTO dairy_database_mappings (
         id, dairy_id, dairy_code, database_name, resource_type,
         connection_uri_encrypted, schema_version, provisioning_status, provisioned_at, last_verified_at
       ) VALUES
         ($1, $2, $3, $4, 'PHYSICAL_DATABASE', $5, 'v1.0.0', 'ACTIVE', NOW(), NOW()),
         ($6, $7, $8, $9, 'PHYSICAL_DATABASE', $10, 'v1.0.0', 'ACTIVE', NOW(), NOW());`,
      [
        crypto.randomUUID(), orgA, `R33_A_${suffix}`, dbNameA, CredentialEncryption.encrypt(urlA),
        crypto.randomUUID(), orgB, `R33_B_${suffix}`, dbNameB, CredentialEncryption.encrypt(urlB),
      ]
    );

    await tenantDbManager.initialize(controlPlaneAdapter);
    assert.equal(tenantDbManager.getControlPlaneDb(), controlPlaneAdapter);
    assert.equal(tenantDbManager.getTenantMapping(orgA)?.databaseName, dbNameA);
    assert.equal(tenantDbManager.getTenantMapping(orgB)?.databaseName, dbNameB);

    // Seed Dairy A tenant DB (003_user_identity_foundation.sql uses role column)
    await poolA.query(`INSERT INTO organizations (id, name, code, status) VALUES ($1, 'PG17 Repo Dairy A', $2, 'ACTIVE');`, [orgA, `R33_A_${suffix}`]);
    await poolA.query(
      `INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
       VALUES ($1, $2, 'CA-33', 'Center A33', 'Road A', 'Village A', 'Pune', 'MH', '411001', '+919800000101', 'ACTIVE');`,
      [centerA, orgA]
    );
    await poolA.query(
      `INSERT INTO users (id, organization_id, username, full_name, phone_number, role, status) VALUES
         ($1, $4, 'r33_op_a', 'R33 Op A', '+919800000201', 'COLLECTION_OPERATOR', 'ACTIVE'),
         ($2, $4, 'r33_op_inact', 'R33 Inactive', '+919800000202', 'COLLECTION_OPERATOR', 'SUSPENDED'),
         ($3, $4, 'r33_cust_role', 'R33 Cust Role', '+919800000203', 'FARMER_CUSTOMER', 'ACTIVE');`,
      [opA, opInactive, opCustomerRole, orgA]
    );
    await poolA.query(
      `INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status, is_deleted) VALUES
         ($1, $3, $4, 'FA-3301', 'Farmer A', '+919800000301', 'ACTIVE', 'APPROVED', FALSE),
         ($2, $3, $4, 'FA-SHARED', 'Shared UUID A', '+919800000302', 'ACTIVE', 'APPROVED', FALSE);`,
      [custA, sharedCustUuid, orgA, centerA]
    );

    // Seed Dairy B tenant DB (including same sharedCustUuid!)
    await poolB.query(`INSERT INTO organizations (id, name, code, status) VALUES ($1, 'PG17 Repo Dairy B', $2, 'ACTIVE');`, [orgB, `R33_B_${suffix}`]);
    await poolB.query(
      `INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
       VALUES ($1, $2, 'CB-33', 'Center B33', 'Road B', 'Village B', 'Pune', 'MH', '411002', '+919800000102', 'ACTIVE');`,
      [centerB, orgB]
    );
    await poolB.query(
      `INSERT INTO users (id, organization_id, username, full_name, phone_number, role, status)
       VALUES ($1, $2, 'r33_op_b', 'R33 Op B', '+919800000204', 'COLLECTION_OPERATOR', 'ACTIVE');`,
      [opB, orgB]
    );
    await poolB.query(
      `INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status, is_deleted) VALUES
         ($1, $3, $4, 'FB-3301', 'Farmer B', '+919800000401', 'ACTIVE', 'APPROVED', FALSE),
         ($2, $3, $4, 'FB-SHARED', 'Shared UUID B', '+919800000402', 'ACTIVE', 'APPROVED', FALSE);`,
      [custB, sharedCustUuid, orgB, centerB]
    );

    const ledgerRepo = new PostgresLedgerRepository();
    const collectionRepo = new PostgresCollectionTransactionRepository();
    const sessionRepo = new PostgresShiftSessionRepository();
    const membershipRepo = new PostgresCustomerMembershipRepository();

    await suite.test('1. PostgreSQL 17.x version, migration manifests & TenantDatabaseManager strict real-PG resolution', async () => {
      const verRes = await poolA.query(`SELECT current_setting('server_version_num')::int AS ver_num;`);
      const verNum = Number(verRes.rows[0]?.ver_num || 0);
      assert.ok(verNum >= 170000 && verNum < 180000, `Expected PostgreSQL 17.x, got ${verNum}`);

      assert.ok(ctrlMigrations.every((m) => m.status === 'APPLIED'));
      assert.ok(tenantAMigrations.every((m) => m.status === 'APPLIED'));
      assert.ok(tenantBMigrations.every((m) => m.status === 'APPLIED'));
      assert.ok(ctrlMigrations.some((m) => m.version === '044' && m.status === 'APPLIED'));
      assert.ok(!ctrlMigrations.some((m) => m.version === '045'));
      assert.ok(!ctrlMigrations.some((m) => m.filename === '031_remove_dairy_admin_7507495615.sql'));
      assert.ok(tenantAMigrations.some((m) => m.version === '045' && m.status === 'APPLIED'));
      assert.ok(tenantBMigrations.some((m) => m.version === '045' && m.status === 'APPLIED'));
      assert.ok(!tenantAMigrations.some((m) => m.version === '044'));

      const tenantDbA = await tenantDbManager.getStrictTenantDb(orgA);
      const tenantDbB = await tenantDbManager.getStrictTenantDb(orgB);
      attachPoolErrorGuard(tenantDbManager.getTenantPool(orgA), `tenantPool_${orgA.slice(0, 8)}`);
      attachPoolErrorGuard(tenantDbManager.getTenantPool(orgB), `tenantPool_${orgB.slice(0, 8)}`);
      assert.equal((await tenantDbA.query('SELECT current_database() AS d;')).rows[0].d, dbNameA);
      assert.equal((await tenantDbB.query('SELECT current_database() AS d;')).rows[0].d, dbNameB);

      const idxRes = await poolA.query(
        `SELECT indexname FROM pg_indexes WHERE tablename = 'kiosk_shift_sessions' AND indexname = 'uq_kiosk_shift_sessions_active_open';`
      );
      assert.equal(idxRes.rows.length, 1);
    });

    await suite.test('2. PostgresLedgerRepository: actor enforcement, cross-tenant rejection, concurrency & idempotency on PG17', async () => {
      // 2a. Missing / invalid / inactive / customer-role / cross-tenant operator & customer rejection
      const accInit = new CustomerLedgerAccount({
        id: crypto.randomUUID(),
        customerId: custA,
        organizationId: orgA,
        currentBalance: 0,
        totalMilkEarnings: 0,
        totalDeductions: 0,
        lastUpdated: new Date().toISOString(),
      });
      const invalidOpEntry = accInit.postCredit(50, 'Should fail');
      await assert.rejects(() => ledgerRepo.save(accInit, invalidOpEntry), (e) => e.code === 'INVALID_OPERATOR');
      await assert.rejects(() => ledgerRepo.save(accInit, invalidOpEntry, { operatorId: '' }), (e) => e.code === 'INVALID_OPERATOR');
      await assert.rejects(() => ledgerRepo.save(accInit, invalidOpEntry, { operatorId: crypto.randomUUID() }), (e) => e.code === 'INVALID_OPERATOR');
      await assert.rejects(() => ledgerRepo.save(accInit, invalidOpEntry, { operatorId: opB }), (e) => e.code === 'INVALID_OPERATOR');
      await assert.rejects(() => ledgerRepo.save(accInit, invalidOpEntry, { operatorId: opInactive }), (e) => e.code === 'OPERATOR_INACTIVE');
      await assert.rejects(() => ledgerRepo.save(accInit, invalidOpEntry, { operatorId: opCustomerRole }), (e) => e.code === 'UNAUTHORIZED_OPERATOR');
      await assert.rejects(
        () => ledgerRepo.appendEntry({ organizationId: orgA, customerId: custB, operatorId: opA, entryType: 'CREDIT', amount: 20, description: 'Cross cust' }),
        (e) => e.name === 'CustomerNotFoundError'
      );

      // 2b. Same entry ID submitted concurrently twice via save() -> applied exactly once
      const s1 = new CustomerLedgerAccount({ id: crypto.randomUUID(), customerId: custA, organizationId: orgA, currentBalance: 0, totalMilkEarnings: 0, totalDeductions: 0, lastUpdated: new Date().toISOString() });
      const s2 = new CustomerLedgerAccount({ id: s1.id, customerId: custA, organizationId: orgA, currentBalance: 0, totalMilkEarnings: 0, totalDeductions: 0, lastUpdated: new Date().toISOString() });
      const sameEntry = s1.postCredit(100, 'Concurrent identical save entry');
      await Promise.all([
        ledgerRepo.save(s1, sameEntry, { operatorId: opA }),
        ledgerRepo.save(s2, { ...sameEntry }, { operatorId: opA }),
      ]);
      assert.equal((await ledgerRepo.findByCustomer(custA, orgA)).currentBalance, 100);
      assert.equal(Number((await poolA.query(`SELECT COUNT(*)::int AS c FROM ledger_entries WHERE transaction_id = $1;`, [sameEntry.id])).rows[0].c), 2);

      // 2c. Same idempotency key submitted concurrently twice via appendEntry() -> applied once
      const sharedIdem = `R33-IDEM-${crypto.randomUUID()}`;
      const [r1, r2] = await Promise.all([
        ledgerRepo.appendEntry({ organizationId: orgA, customerId: custA, operatorId: opA, entryType: 'CREDIT', amount: 75, description: 'Concurrent appendEntry idem', idempotencyKey: sharedIdem }),
        ledgerRepo.appendEntry({ organizationId: orgA, customerId: custA, operatorId: opA, entryType: 'CREDIT', amount: 75, description: 'Concurrent appendEntry idem', idempotencyKey: sharedIdem }),
      ]);
      assert.equal(r1.ledgerTransactionId, r2.ledgerTransactionId);
      assert.deepEqual([r1.isIdempotentReplay, r2.isIdempotentReplay].sort(), [false, true]);
      assert.equal((await ledgerRepo.findByCustomer(custA, orgA)).currentBalance, 175);

      // 2d. Subsequent replay of already committed entry -> zero balance change & zero updated_at mutation
      const beforeReplay = await poolA.query(`SELECT current_balance, updated_at FROM customer_ledger_accounts WHERE customer_id = $1;`, [custA]);
      await ledgerRepo.save(s1, sameEntry, { operatorId: opA });
      const replayAppend = await ledgerRepo.appendEntry({ organizationId: orgA, customerId: custA, operatorId: opA, entryType: 'CREDIT', amount: 75, description: 'Replay', idempotencyKey: sharedIdem });
      assert.equal(replayAppend.isIdempotentReplay, true);
      const afterReplay = await poolA.query(`SELECT current_balance, updated_at FROM customer_ledger_accounts WHERE customer_id = $1;`, [custA]);
      assert.equal(Number(afterReplay.rows[0].current_balance), 175);
      assert.equal(afterReplay.rows[0].updated_at.getTime(), beforeReplay.rows[0].updated_at.getTime());

      // 2e. Two distinct credit entries submitted concurrently via save() -> both reflected
      const cSnap1 = await ledgerRepo.findByCustomer(custA, orgA);
      const cSnap2 = await ledgerRepo.findByCustomer(custA, orgA);
      const cE1 = cSnap1.postCredit(60, 'Concurrent save credit 1');
      const cE2 = cSnap2.postCredit(40, 'Concurrent save credit 2');
      await Promise.all([
        ledgerRepo.save(cSnap1, cE1, { operatorId: opA }),
        ledgerRepo.save(cSnap2, cE2, { operatorId: opA }),
      ]);
      assert.equal((await ledgerRepo.findByCustomer(custA, orgA)).currentBalance, 275);

      // 2f. Two distinct debit entries submitted concurrently via save() -> both reflected
      const dSnap1 = await ledgerRepo.findByCustomer(custA, orgA);
      const dSnap2 = await ledgerRepo.findByCustomer(custA, orgA);
      const dE1 = dSnap1.postDebit(25, 'FEED_DEBIT', 'Concurrent save debit 1');
      const dE2 = dSnap2.postDebit(15, 'FEED_DEBIT', 'Concurrent save debit 2');
      await Promise.all([
        ledgerRepo.save(dSnap1, dE1, { operatorId: opA }),
        ledgerRepo.save(dSnap2, dE2, { operatorId: opA }),
      ]);
      assert.equal((await ledgerRepo.findByCustomer(custA, orgA)).currentBalance, 235);

      // 2g. Credit & debit racing against the same account -> exact net balance
      const raceC = await ledgerRepo.findByCustomer(custA, orgA);
      const raceD = await ledgerRepo.findByCustomer(custA, orgA);
      const rcEntry = raceC.postCredit(90, 'Race credit');
      const rdEntry = raceD.postDebit(35, 'FEED_DEBIT', 'Race debit');
      await Promise.all([
        ledgerRepo.save(raceC, rcEntry, { operatorId: opA }),
        ledgerRepo.save(raceD, rdEntry, { operatorId: opA }),
      ]);
      assert.equal((await ledgerRepo.findByCustomer(custA, orgA)).currentBalance, 290);

      // 2h. Mid-transaction failures (after journal insert, and after ledger_entries insert before account update) roll back completely
      const origGetStrict = tenantDbManager.getStrictTenantDb.bind(tenantDbManager);
      const injectFailureOnSql = async (sqlSubstring) => {
        const realTenantDbA = await origGetStrict(orgA);
        tenantDbManager.getStrictTenantDb = async (id) => {
          if (id !== orgA) return origGetStrict(id);
          return {
            query: (text, params) => realTenantDbA.query(text, params),
            withTransaction: (cb) =>
              realTenantDbA.withTransaction(async (client) => {
                const origClientQuery = client.query.bind(client);
                client.query = async (sql, params) => {
                  if (typeof sql === 'string' && sql.includes(sqlSubstring)) {
                    throw new Error(`Injected failure on ${sqlSubstring}`);
                  }
                  return origClientQuery(sql, params);
                };
                try {
                  return await cb(client);
                } finally {
                  client.query = origClientQuery;
                }
              }),
          };
        };
      };

      const txnCountBeforeFail = Number((await poolA.query(`SELECT COUNT(*)::int AS c FROM ledger_transactions WHERE customer_id = $1;`, [custA])).rows[0].c);
      const lineCountBeforeFail = Number((await poolA.query(`SELECT COUNT(*)::int AS c FROM ledger_entries;`)).rows[0].c);

      await injectFailureOnSql('INSERT INTO ledger_entries');
      try {
        await assert.rejects(
          () => ledgerRepo.appendEntry({ organizationId: orgA, customerId: custA, operatorId: opA, entryType: 'CREDIT', amount: 500, description: 'Fail on entries' }),
          (e) => e.statusCode === 503
        );
      } finally {
        tenantDbManager.getStrictTenantDb = origGetStrict;
      }

      await injectFailureOnSql('UPDATE customer_ledger_accounts');
      try {
        await assert.rejects(
          () => ledgerRepo.appendEntry({ organizationId: orgA, customerId: custA, operatorId: opA, entryType: 'DEBIT', amount: 50, description: 'Fail on account update' }),
          (e) => e.statusCode === 503
        );
      } finally {
        tenantDbManager.getStrictTenantDb = origGetStrict;
      }

      assert.equal((await ledgerRepo.findByCustomer(custA, orgA)).currentBalance, 290);
      assert.equal(Number((await poolA.query(`SELECT COUNT(*)::int AS c FROM ledger_transactions WHERE customer_id = $1;`, [custA])).rows[0].c), txnCountBeforeFail);
      assert.equal(Number((await poolA.query(`SELECT COUNT(*)::int AS c FROM ledger_entries;`)).rows[0].c), lineCountBeforeFail);

      // 2i. Same customer UUID in Dairy A vs Dairy B has strictly isolated balances and zero central dual-write
      await ledgerRepo.appendEntry({ organizationId: orgA, customerId: sharedCustUuid, operatorId: opA, entryType: 'CREDIT', amount: 310, description: 'Shared UUID Dairy A' });
      await ledgerRepo.appendEntry({ organizationId: orgB, customerId: sharedCustUuid, operatorId: opB, entryType: 'CREDIT', amount: 45, description: 'Shared UUID Dairy B' });
      assert.equal((await ledgerRepo.findByCustomer(sharedCustUuid, orgA)).currentBalance, 310);
      assert.equal((await ledgerRepo.findByCustomer(sharedCustUuid, orgB)).currentBalance, 45);
      assert.equal((await poolCtrl.query(`SELECT to_regclass('public.ledger_transactions') AS reg;`)).rows[0].reg, null);
      assert.equal((await poolCtrl.query(`SELECT to_regclass('public.customer_ledger_accounts') AS reg;`)).rows[0].reg, null);
    });

    await suite.test('3. PostgresShiftSessionRepository: PG17 isolation, 045 concurrent open conflict, real not-found vs 503', async () => {
      const sessionA = new KioskShiftSession({
        id: crypto.randomUUID(),
        sessionCode: `R33-SA-${suffix}`,
        organizationId: orgA,
        centerId: centerA,
        businessDate: '2026-11-27',
        shift: 'MORNING',
        status: 'OPEN',
        openedAt: new Date().toISOString(),
        openingOperatorId: opA,
        openingOperatorName: 'R33 Op A',
        deviceIdentifier: 'R33-KIOSK-1',
        deviceName: 'Kiosk 1',
      });
      assert.deepEqual(sessionA.totals, {
        totalLiters: 0,
        cowLiters: 0,
        buffaloLiters: 0,
        transactionCount: 0,
        totalAmount: 0,
        averageFat: 0,
        averageSnf: 0,
      });
      await sessionRepo.save(sessionA);

      const savedSessA = await sessionRepo.findById(sessionA.id, orgA);
      assert.equal(savedSessA?.id, sessionA.id);
      assert.deepEqual(savedSessA?.totals, {
        totalLiters: 0,
        cowLiters: 0,
        buffaloLiters: 0,
        transactionCount: 0,
        totalAmount: 0,
        averageFat: 0,
        averageSnf: 0,
      });
      assert.equal(await sessionRepo.findById(sessionA.id, orgB), null);
      assert.equal(await sessionRepo.findByCode(sessionA.sessionCode, orgB), null);
      assert.equal(await sessionRepo.findActiveSession(centerA, 'R33-KIOSK-1', orgB), null);

      // Concurrent opening conflict on same center+device hits 045 partial unique index (SessionConflictError)
      const race1 = new KioskShiftSession({
        id: crypto.randomUUID(),
        sessionCode: `R33-RACE1-${suffix}`,
        organizationId: orgA,
        centerId: centerA,
        businessDate: '2026-11-27',
        shift: 'EVENING',
        status: 'OPEN',
        openedAt: new Date().toISOString(),
        openingOperatorId: opA,
        openingOperatorName: 'R33 Op A',
        deviceIdentifier: 'R33-KIOSK-RACE',
        deviceName: 'Kiosk Race',
      });
      const race2 = new KioskShiftSession({
        id: crypto.randomUUID(),
        sessionCode: `R33-RACE2-${suffix}`,
        organizationId: orgA,
        centerId: centerA,
        businessDate: '2026-11-27',
        shift: 'EVENING',
        status: 'OPEN',
        openedAt: new Date().toISOString(),
        openingOperatorId: opA,
        openingOperatorName: 'R33 Op A',
        deviceIdentifier: 'R33-KIOSK-RACE',
        deviceName: 'Kiosk Race',
      });
      const settled = await Promise.allSettled([sessionRepo.save(race1), sessionRepo.save(race2)]);
      assert.equal(settled.filter((s) => s.status === 'fulfilled').length, 1);
      const rejected = settled.filter((s) => s.status === 'rejected');
      assert.equal(rejected.length, 1);
      assert.equal(rejected[0].reason.name, 'SessionConflictError');
      assert.equal(rejected[0].reason.code, 'ACTIVE_SESSION_ALREADY_EXISTS');

      // Real unmapped tenant raises 503 TenantDatabaseUnavailableError (not null)
      await assert.rejects(
        () => sessionRepo.findById(sessionA.id, crypto.randomUUID()),
        (e) => e.statusCode === 503 && e.code === 'TENANT_MAPPING_MISSING'
      );
      assert.equal((await poolCtrl.query(`SELECT to_regclass('public.kiosk_shift_sessions') AS reg;`)).rows[0].reg, null);

      // Device registry lookup must NOT swallow unrelated DB failures on tenantDb
      const origGetStrictSess = tenantDbManager.getStrictTenantDb.bind(tenantDbManager);
      const realTenantDbForDevErr = await origGetStrictSess(orgA);
      tenantDbManager.getStrictTenantDb = async (id) => {
        if (id !== orgA) return origGetStrictSess(id);
        return {
          query: async (sql, params) => {
            if (typeof sql === 'string' && sql.includes('FROM devices')) {
              const err = new Error('Simulated permission/schema failure on devices');
              err.code = '42501';
              throw err;
            }
            return realTenantDbForDevErr.query(sql, params);
          },
          withTransaction: (cb) => realTenantDbForDevErr.withTransaction(cb),
        };
      };
      try {
        await assert.rejects(
          () =>
            sessionRepo.save(
              new KioskShiftSession({
                id: crypto.randomUUID(),
                sessionCode: `R33-DEVERR-${suffix}`,
                organizationId: orgA,
                centerId: centerA,
                businessDate: '2026-11-27',
                shift: 'EVENING',
                status: 'OPEN',
                openedAt: new Date().toISOString(),
                openingOperatorId: opA,
                openingOperatorName: 'R33 Op A',
                deviceIdentifier: 'R33-DEV-ERR',
                deviceName: 'Kiosk Err',
              })
            ),
          (e) => e.statusCode === 503 && e.status === 'QUERY_FAILED'
        );
      } finally {
        tenantDbManager.getStrictTenantDb = origGetStrictSess;
      }
    });

    await suite.test('4. PostgresCollectionTransactionRepository: atomic intake, concurrency, idempotency, isolation & rollback on PG17', async () => {
      const activeSessA = await sessionRepo.findActiveSession(centerA, 'R33-KIOSK-1', orgA);
      assert.ok(activeSessA);
      const dairyBCustBBalBefore = (await ledgerRepo.findByCustomer(custB, orgB))?.currentBalance || 0;

      const mkTxn = (id, key, weight, amount) =>
        new MilkCollectionTransaction({
          id,
          transactionCode: `TXN-${id.slice(0, 8)}`,
          sessionId: activeSessA.id,
          dairyId: orgA,
          centerId: centerA,
          customerId: custA,
          customerCode: 'FA-3301',
          customerName: 'Farmer A',
          timestamp: new Date().toISOString(),
          date: '2026-11-27',
          shift: 'MORNING',
          milkCategory: 'COW',
          weightLiters: weight,
          fatPercentage: 4.0,
          snfPercentage: 8.5,
          clrDensity: 28.5,
          appliedRatePerLiter: 40,
          rateChartVersion: 1,
          totalAmount: amount,
          identificationMethod: 'MANUAL_SEARCH',
          syncStatus: 'SYNCED_CLOUD',
          deviceId: 'R33-KIOSK-1',
          operatorName: 'R33 Op A',
          idempotencyKey: key,
        });

      // 4a. Duplicate concurrent saveAtomicIntake -> 1 collection row, 1 ledger credit, 1 session increment
      const dupKey = `R33-COLL-DUP-${crypto.randomUUID()}`;
      const [i1, i2] = await Promise.all([
        collectionRepo.saveAtomicIntake({
          transaction: mkTxn(crypto.randomUUID(), dupKey, 10, 400),
          session: activeSessA,
          totalAmount: 400,
          weightLiters: 10,
          fatPercentage: 4.0,
          snfPercentage: 8.5,
          milkCategory: 'COW',
          customerId: custA,
          organizationId: orgA,
          centerId: centerA,
          operatorId: opA,
          operatorName: 'R33 Op A',
          appliedRate: 40,
        }),
        collectionRepo.saveAtomicIntake({
          transaction: mkTxn(crypto.randomUUID(), dupKey, 10, 400),
          session: activeSessA,
          totalAmount: 400,
          weightLiters: 10,
          fatPercentage: 4.0,
          snfPercentage: 8.5,
          milkCategory: 'COW',
          customerId: custA,
          organizationId: orgA,
          centerId: centerA,
          operatorId: opA,
          operatorName: 'R33 Op A',
          appliedRate: 40,
        }),
      ]);
      assert.equal(i1.transaction.id, i2.transaction.id);
      assert.deepEqual([i1.isIdempotentReplay, i2.isIdempotentReplay].sort(), [false, true]);
      assert.equal((await ledgerRepo.findByCustomer(custA, orgA)).currentBalance, 690);

      // 4b. Two distinct concurrent intakes -> both accumulate cleanly
      await Promise.all([
        collectionRepo.saveAtomicIntake({
          transaction: mkTxn(crypto.randomUUID(), `R33-C1-${crypto.randomUUID()}`, 5, 200),
          session: activeSessA,
          totalAmount: 200,
          weightLiters: 5,
          fatPercentage: 4.0,
          snfPercentage: 8.5,
          milkCategory: 'COW',
          customerId: custA,
          organizationId: orgA,
          centerId: centerA,
          operatorId: opA,
          operatorName: 'R33 Op A',
          appliedRate: 40,
        }),
        collectionRepo.saveAtomicIntake({
          transaction: mkTxn(crypto.randomUUID(), `R33-C2-${crypto.randomUUID()}`, 7.5, 300),
          session: activeSessA,
          totalAmount: 300,
          weightLiters: 7.5,
          fatPercentage: 4.0,
          snfPercentage: 8.5,
          milkCategory: 'COW',
          customerId: custA,
          organizationId: orgA,
          centerId: centerA,
          operatorId: opA,
          operatorName: 'R33 Op A',
          appliedRate: 40,
        }),
      ]);
      assert.equal((await ledgerRepo.findByCustomer(custA, orgA)).currentBalance, 1190);
      const updatedSessA = await sessionRepo.findById(activeSessA.id, orgA);
      assert.equal(updatedSessA.totals.transactionCount, 3);
      assert.equal(updatedSessA.totals.totalLiters, 22.5);
      assert.equal(updatedSessA.totals.totalAmount, 900);

      // 4c. Cross-tenant customer/session/operator rejection
      await assert.rejects(
        () =>
          collectionRepo.saveAtomicIntake({
            transaction: new MilkCollectionTransaction({ ...mkTxn(crypto.randomUUID(), `R33-XC-${crypto.randomUUID()}`, 5, 200).toJSON(), customerId: custB }),
            session: activeSessA,
            totalAmount: 200,
            weightLiters: 5,
            fatPercentage: 4.0,
            snfPercentage: 8.5,
            milkCategory: 'COW',
            customerId: custB,
            organizationId: orgA,
            centerId: centerA,
            operatorId: opA,
            operatorName: 'R33 Op A',
            appliedRate: 40,
          }),
        (e) => e.code === 'INVALID_CUSTOMER'
      );

      // 4d. Mid-transaction saveAtomicIntake rollback leaves zero partial collection, session, or ledger rows
      const rollbackKey = `R33-COLL-RB-${crypto.randomUUID()}`;
      const colCountBeforeRb = Number((await poolA.query(`SELECT COUNT(*)::int AS c FROM milk_collections WHERE organization_id = $1;`, [orgA])).rows[0].c);
      const balBeforeRb = (await ledgerRepo.findByCustomer(custA, orgA)).currentBalance;
      const sessBeforeRb = await sessionRepo.findById(activeSessA.id, orgA);

      const origGetStrictColl = tenantDbManager.getStrictTenantDb.bind(tenantDbManager);
      const realTenantDbAForColl = await origGetStrictColl(orgA);
      tenantDbManager.getStrictTenantDb = async (id) => {
        if (id !== orgA) return origGetStrictColl(id);
        return {
          query: (text, params) => realTenantDbAForColl.query(text, params),
          withTransaction: (cb) =>
            realTenantDbAForColl.withTransaction(async (client) => {
              const origClientQuery = client.query.bind(client);
              client.query = async (sql, params) => {
                if (typeof sql === 'string' && sql.includes('UPDATE customer_ledger_accounts')) {
                  throw new Error('Injected atomic intake rollback failure');
                }
                return origClientQuery(sql, params);
              };
              try {
                return await cb(client);
              } finally {
                client.query = origClientQuery;
              }
            }),
        };
      };
      try {
        await assert.rejects(() =>
          collectionRepo.saveAtomicIntake({
            transaction: mkTxn(crypto.randomUUID(), rollbackKey, 6, 240),
            session: activeSessA,
            totalAmount: 240,
            weightLiters: 6,
            fatPercentage: 4.0,
            snfPercentage: 8.5,
            milkCategory: 'COW',
            customerId: custA,
            organizationId: orgA,
            centerId: centerA,
            operatorId: opA,
            operatorName: 'R33 Op A',
            appliedRate: 40,
          })
        );
      } finally {
        tenantDbManager.getStrictTenantDb = origGetStrictColl;
      }

      assert.equal(Number((await poolA.query(`SELECT COUNT(*)::int AS c FROM milk_collections WHERE organization_id = $1;`, [orgA])).rows[0].c), colCountBeforeRb);
      assert.equal(Number((await poolA.query(`SELECT COUNT(*)::int AS c FROM milk_collections WHERE idempotency_key = $1;`, [rollbackKey])).rows[0].c), 0);
      assert.equal((await ledgerRepo.findByCustomer(custA, orgA)).currentBalance, balBeforeRb);
      assert.equal((await sessionRepo.findById(activeSessA.id, orgA)).totals.transactionCount, sessBeforeRb.totals.transactionCount);

      // 4e. Zero leakage to control plane or Dairy B
      assert.equal((await poolCtrl.query(`SELECT to_regclass('public.milk_collections') AS reg;`)).rows[0].reg, null);
      assert.equal(Number((await poolB.query(`SELECT COUNT(*)::int AS c FROM milk_collections;`)).rows[0].c), 0);
      assert.equal((await ledgerRepo.findByCustomer(custB, orgB))?.currentBalance || 0, dairyBCustBBalBefore);
    });

    await suite.test('5. PostgresCustomerMembershipRepository: 037 schema alignment, tenant customerName hydration, save/upsert, status update & cross-tenant isolation', async () => {
      // 5a. Verify migration 037 authoritative control-plane columns (no customer_name PII column)
      const colsRes = await poolCtrl.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'customer_dairy_memberships';`
      );
      const colNames = colsRes.rows.map((r) => r.column_name);
      assert.ok(!colNames.includes('customer_name'), 'customer_dairy_memberships must NOT define customer_name');
      assert.ok(colNames.includes('dairy_name'));
      assert.ok(colNames.includes('dairy_code'));
      assert.ok(colNames.includes('dairy_address'));
      assert.ok(colNames.includes('center_name'));

      // 5b. Global identity create & lookup
      const memPhone = `+919855${suffix.replace(/[^0-9]/g, '1').slice(0, 6).padEnd(6, '7')}`;
      const gIdentity = await membershipRepo.createGlobalIdentity(memPhone);
      assert.ok(gIdentity.id);
      const foundIdentity = await membershipRepo.findGlobalIdentityByPhone(memPhone);
      assert.equal(foundIdentity?.id, gIdentity.id);

      // 5c. Save/upsert memberships for sharedCustUuid across Dairy A & Dairy B
      const memAId = crypto.randomUUID();
      const memBId = crypto.randomUUID();
      await membershipRepo.saveMembership(
        new CustomerMembership({
          id: memAId,
          globalCustomerId: gIdentity.id,
          organizationId: orgA,
          tenantCustomerId: sharedCustUuid,
          farmerCode: 'FA-SHARED',
          membershipStatus: 'PENDING_APPROVAL',
          dairyName: 'PG17 Repo Dairy A',
          dairyCode: `R33_A_${suffix}`,
          dairyAddress: 'Road A',
          centerId: centerA,
          centerName: 'Center A33',
        })
      );
      // Upsert same (organization_id, global_customer_id) -> updates cleanly without duplicate row
      await membershipRepo.saveMembership(
        new CustomerMembership({
          id: crypto.randomUUID(),
          globalCustomerId: gIdentity.id,
          organizationId: orgA,
          tenantCustomerId: sharedCustUuid,
          farmerCode: 'FA-SHARED-UPD',
          membershipStatus: 'APPROVED',
          dairyName: 'PG17 Repo Dairy A',
          dairyCode: `R33_A_${suffix}`,
          dairyAddress: 'Road A Updated',
          centerId: centerA,
          centerName: 'Center A33',
        })
      );
      await membershipRepo.saveMembership(
        new CustomerMembership({
          id: memBId,
          globalCustomerId: gIdentity.id,
          organizationId: orgB,
          tenantCustomerId: sharedCustUuid,
          farmerCode: 'FB-SHARED',
          membershipStatus: 'APPROVED',
          dairyName: 'PG17 Repo Dairy B',
          dairyCode: `R33_B_${suffix}`,
          dairyAddress: 'Road B',
          centerId: centerB,
          centerName: 'Center B33',
        })
      );

      // 5d. List & findMembership resolve exact tenant customerName from each tenant DB strictly
      const list = await membershipRepo.listMembershipsByGlobalId(gIdentity.id);
      assert.equal(list.length, 2);
      const itemA = list.find((m) => m.organizationId === orgA);
      const itemB = list.find((m) => m.organizationId === orgB);
      assert.equal(itemA?.customerName, 'Shared UUID A');
      assert.equal(itemA?.farmerCode, 'FA-SHARED-UPD');
      assert.equal(itemA?.dairyAddress, 'Road A Updated');
      assert.equal(itemB?.customerName, 'Shared UUID B');

      const singleA = await membershipRepo.findMembership(gIdentity.id, orgA);
      assert.equal(singleA?.customerName, 'Shared UUID A');
      const singleB = await membershipRepo.findMembership(gIdentity.id, orgB);
      assert.equal(singleB?.customerName, 'Shared UUID B');

      // 5e. updateMembershipStatus scoped strictly by (organizationId, tenantCustomerId)
      await membershipRepo.updateMembershipStatus(orgA, sharedCustUuid, 'SUSPENDED', 'FA-SUSP');
      const afterUpdateA = await membershipRepo.findMembership(gIdentity.id, orgA);
      const afterUpdateB = await membershipRepo.findMembership(gIdentity.id, orgB);
      assert.equal(afterUpdateA?.membershipStatus, 'SUSPENDED');
      assert.equal(afterUpdateA?.farmerCode, 'FA-SUSP');
      assert.equal(afterUpdateB?.membershipStatus, 'APPROVED');
      assert.equal(afterUpdateB?.farmerCode, 'FB-SHARED');
    });
  } catch (err) {
    primaryError = err;
    throw err;
  } finally {
    const cleanupErrors = [];
    const runStep = async (fn) => {
      try {
        await fn();
      } catch (err) {
        cleanupErrors.push(err instanceof Error ? err : new Error(String(err)));
      }
    };

    if (tenantDbManagerRef) {
      const knownDairyIds = new Set([orgA, orgB]);
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

    if (dbRef) {
      await runStep(async () => {
        attachPoolErrorGuard(dbRef.pool, 'globalDbPool');
        await closePoolCleanly(dbRef.pool, 'globalDbPool', () => dbRef.close());
        assert.strictEqual(dbRef.pool.ended, true, 'Global db.pool must reach ended=true');
      });
    }

    for (const [pool, label] of [
      [poolCtrl, 'poolCtrl'],
      [poolA, 'poolA'],
      [poolB, 'poolB'],
    ]) {
      if (pool) {
        await runStep(async () => {
          await closePoolCleanly(pool, label);
          assert.strictEqual(pool.ended, true, `Pool '${label}' must reach ended=true`);
        });
      }
    }

    for (const dbName of [...createdDatabases].reverse()) {
      await runStep(async () => {
        await waitForDbIdle(dbName);
        await adminPool.query(`DROP DATABASE IF EXISTS ${dbName};`);
      });
    }

    await runStep(async () => {
      await closePoolCleanly(adminPool, 'adminPool');
      assert.strictEqual(adminPool.ended, true, 'adminPool must reach ended=true');
    });

    await runStep(async () => {
      assert.deepEqual(poolErrors, [], `Unexpected async PostgreSQL pool errors: ${JSON.stringify(poolErrors)}`);
    });

    if (cleanupErrors.length > 0) {
      const cleanErr =
        cleanupErrors.length === 1
          ? cleanupErrors[0]
          : new AggregateError(
              cleanupErrors,
              `Cleanup failed with ${cleanupErrors.length} errors: ${cleanupErrors.map((e) => e.message).join('; ')}`
            );
      if (primaryError) {
        const orig = primaryError instanceof Error ? primaryError : new Error(String(primaryError));
        throw new AggregateError([orig, cleanErr], `${orig.message} (cleanup also failed: ${cleanErr.message})`);
      }
      throw cleanErr;
    }
  }
});
