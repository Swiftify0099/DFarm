import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import { assertDisposablePg17Cluster } from '../../../scripts/pg17-safety-guard.js';
import { createPoolShutdownManager } from './helpers/pool-lifecycle-helpers.js';

const { Pool } = pg;

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

  // Genuine shutdown failures must surface rather than being silently ignored.
  if (endErr && (reachable || !isConnectionUnavailableError(endErr) || process.env['REQUIRE_REAL_POSTGRES'] === '1')) {
    throw endErr;
  }

  // Async pool errors when PostgreSQL appeared reachable or in strict mode must fail closed.
  if (probeErrors.length > 0 && (reachable || process.env['REQUIRE_REAL_POSTGRES'] === '1')) {
    throw probeErrors[0];
  }

  // Unexpected non-connection query failures in strict mode must fail closed.
  if (queryErr && !isConnectionUnavailableError(queryErr) && process.env['REQUIRE_REAL_POSTGRES'] === '1') {
    throw queryErr;
  }

  return reachable;
}

function makeDbUrl(baseUrl, dbName) {
  const u = new URL(baseUrl);
  u.pathname = `/${dbName}`;
  return u.toString();
}

test('DFarm P0: Concurrent Collection Idempotency & Financial Atomicity Integration Suite', async (suite) => {
  const reachable = await canConnectRealPostgres(TEST_PG_URL);
  if (!reachable) {
    const msg = 'Real PostgreSQL environment unavailable (TEST_POSTGRES_URL unset or unreachable)';
    if (REQUIRE_REAL_PG) {
      assert.fail(`REQUIRE_REAL_POSTGRES=1 gate failed: ${msg}`);
    }
    console.log('[CONCURRENCY TEST] Real PostgreSQL connection is unavailable. Test marked as SKIP / NOT RUN.');
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
  const dbNameCtrl = `dfarm_conc_ctrl_${suffix}`;
  const dbNameAlpha = `dfarm_conc_a_${suffix}`;
  const dbNameBeta = `dfarm_conc_b_${suffix}`;

  const ctrlUrl = makeDbUrl(TEST_PG_URL, dbNameCtrl);
  const alphaUrl = makeDbUrl(TEST_PG_URL, dbNameAlpha);
  const betaUrl = makeDbUrl(TEST_PG_URL, dbNameBeta);

  const adminPool = attachPoolErrorGuard(
    new Pool({ connectionString: TEST_PG_URL, connectionTimeoutMillis: 5000 }),
    'adminPool'
  );
  let poolCtrl;
  let poolAlpha;
  let poolBeta;
  let tenantDbManagerRef = null;
  let dbRef = null;
  const createdDatabases = [];
  let cleanupPromise = null;
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

  const orgAlpha = crypto.randomUUID();
  const orgBeta = crypto.randomUUID();

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

      // 1. Close all TenantDatabaseManager pools before global PostgresPool and direct test pools
      if (tenantDbManagerRef) {
        for (const [orgId, label] of [
          [orgAlpha, 'tenantPoolAlpha'],
          [orgBeta, 'tenantPoolBeta'],
        ]) {
          await runStep(async () => {
            const tenantPool = tenantDbManagerRef.getTenantPool?.(orgId);
            if (tenantPool) {
              attachPoolErrorGuard(tenantPool, label);
              await closePoolCleanly(tenantPool, label, () => tenantDbManagerRef.closeTenantPool(orgId));
            }
          });
        }
        await runStep(() => tenantDbManagerRef.closeAllPools());
      }

      // 2. Close global PostgresPool singleton safely
      if (dbRef) {
        await runStep(async () => {
          attachPoolErrorGuard(dbRef.pool, 'globalDbPool');
          await closePoolCleanly(dbRef.pool, 'globalDbPool', () => dbRef.close());
        });
      }

      // 3. Close direct test pools
      await runStep(() => closePoolCleanly(poolCtrl, 'poolCtrl'));
      await runStep(() => closePoolCleanly(poolAlpha, 'poolAlpha'));
      await runStep(() => closePoolCleanly(poolBeta, 'poolBeta'));

      // 4. Wait for all dependent connections to settle, then drop created disposable databases
      for (const dbName of [...createdDatabases].reverse()) {
        await runStep(async () => {
          await waitForDbIdle(dbName);
          await adminPool.query(`DROP DATABASE IF EXISTS ${dbName};`);
        });
      }

      // 5. Close admin maintenance pool last
      await runStep(() => closePoolCleanly(adminPool, 'adminPool'));

      assert.deepEqual(poolErrors, [], `Unexpected async PostgreSQL pool errors: ${JSON.stringify(poolErrors)}`);
      if (cleanupErrors.length > 0) {
        throw cleanupErrors[0];
      }
    })();
    return cleanupPromise;
  };

  try {
    await adminPool.query(`CREATE DATABASE ${dbNameCtrl};`);
    createdDatabases.push(dbNameCtrl);
    await adminPool.query(`CREATE DATABASE ${dbNameAlpha};`);
    createdDatabases.push(dbNameAlpha);
    await adminPool.query(`CREATE DATABASE ${dbNameBeta};`);
    createdDatabases.push(dbNameBeta);

    poolCtrl = attachPoolErrorGuard(new Pool({ connectionString: ctrlUrl, max: 5 }), 'poolCtrl');
    poolAlpha = attachPoolErrorGuard(new Pool({ connectionString: alphaUrl, max: 15 }), 'poolAlpha');
    poolBeta = attachPoolErrorGuard(new Pool({ connectionString: betaUrl, max: 10 }), 'poolBeta');

    const verRes = await poolAlpha.query(`SELECT current_setting('server_version_num')::int AS ver_num;`);
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
    const ctrlMigs = await MigrationRunner.runControlPlaneMigrations(poolCtrl);
    const alphaMigs = await MigrationRunner.runTenantMigrations(poolAlpha, orgAlpha);
    const betaMigs = await MigrationRunner.runTenantMigrations(poolBeta, orgBeta);
    assert.ok(ctrlMigs.every((m) => m.status === 'APPLIED'));
    assert.ok(alphaMigs.every((m) => m.status === 'APPLIED'));
    assert.ok(betaMigs.every((m) => m.status === 'APPLIED'));

    const { db } = await import('../dist/infrastructure/database/PostgresPool.js');
    dbRef = db;
    attachPoolErrorGuard(db.pool, 'globalDbPool');
    const { tenantDbManager } = await import('../dist/infrastructure/database/TenantDatabaseManager.js');
    tenantDbManagerRef = tenantDbManager;
    const { CredentialEncryption } = await import('../dist/infrastructure/security/CredentialEncryption.js');
    const { PostgresCollectionTransactionRepository } = await import('../dist/infrastructure/repositories/PostgresCollectionTransactionRepository.js');
    const { PostgresCustomerRepository } = await import('../dist/infrastructure/repositories/PostgresCustomerRepository.js');
    const { PostgresShiftSessionRepository } = await import('../dist/infrastructure/repositories/PostgresShiftSessionRepository.js');
    const { PostgresRateChartRepository } = await import('../dist/infrastructure/repositories/PostgresRateChartRepository.js');
    const { PostgresLedgerRepository } = await import('../dist/infrastructure/repositories/PostgresLedgerRepository.js');
    const { ProcessMilkIntakeUseCase } = await import('../dist/application/use-cases/collections/MilkIntakeUseCases.js');

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

    await poolCtrl.query(
      `INSERT INTO organizations (id, name, code, status)
       VALUES ($1, 'Cooperative Dairy ALPHA', $3, 'ACTIVE'),
              ($2, 'Cooperative Dairy BETA', $4, 'ACTIVE');`,
      [orgAlpha, orgBeta, `ORG_A_${suffix}`, `ORG_B_${suffix}`]
    );
    await poolCtrl.query(
      `INSERT INTO dairy_database_mappings (
         id, dairy_id, dairy_code, database_name, resource_type,
         connection_uri_encrypted, schema_version, provisioning_status, provisioned_at, last_verified_at
       ) VALUES
         ($1, $2, $3, $4, 'PHYSICAL_DATABASE', $5, 'v1.0.0', 'ACTIVE', NOW(), NOW()),
         ($6, $7, $8, $9, 'PHYSICAL_DATABASE', $10, 'v1.0.0', 'ACTIVE', NOW(), NOW());`,
      [
        crypto.randomUUID(), orgAlpha, `ORG_A_${suffix}`, dbNameAlpha, CredentialEncryption.encrypt(alphaUrl),
        crypto.randomUUID(), orgBeta, `ORG_B_${suffix}`, dbNameBeta, CredentialEncryption.encrypt(betaUrl),
      ]
    );
    await tenantDbManager.initialize(controlPlaneAdapter);
    assert.equal(tenantDbManager.getControlPlaneDb(), controlPlaneAdapter);
    assert.equal(tenantDbManager.getTenantMapping(orgAlpha)?.databaseName, dbNameAlpha);
    assert.equal(tenantDbManager.getTenantMapping(orgBeta)?.databaseName, dbNameBeta);
    const verifyTenantA = await tenantDbManager.getStrictTenantDb(orgAlpha);
    const verifyTenantB = await tenantDbManager.getStrictTenantDb(orgBeta);
    attachPoolErrorGuard(tenantDbManager.getTenantPool(orgAlpha), 'tenantPoolAlpha');
    attachPoolErrorGuard(tenantDbManager.getTenantPool(orgBeta), 'tenantPoolBeta');
    assert.equal((await verifyTenantA.query('SELECT current_database() AS d;')).rows[0].d, dbNameAlpha);
    assert.equal((await verifyTenantB.query('SELECT current_database() AS d;')).rows[0].d, dbNameBeta);

    const centerAlpha = crypto.randomUUID();
    const centerBeta = crypto.randomUUID();
    const operatorAlpha = crypto.randomUUID();
    const operatorBeta = crypto.randomUUID();
    const customerAlpha = crypto.randomUUID();
    const customerBeta = crypto.randomUUID();
    const sessionAlpha = crypto.randomUUID();
    const sessionBeta = crypto.randomUUID();

    const seedFixture = async (pool, orgId, centerId, opId, custId, sesId, codePrefix) => {
      await pool.query(
        `INSERT INTO organizations (id, name, code, status)
         VALUES ($1, $2, $3, 'ACTIVE') ON CONFLICT (id) DO NOTHING;`,
        [orgId, `Cooperative Dairy ${codePrefix}`, `ORG-${codePrefix}-${suffix}`]
      );
      await pool.query(
        `INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
         VALUES ($1, $2, 'C-01', $3, 'Main Road', 'Village', 'District', 'State', '416001', '+919876543210', 'ACTIVE');`,
        [centerId, orgId, `${codePrefix} Center`]
      );
      await pool.query(
        `INSERT INTO users (id, organization_id, username, phone_number, full_name, role, status)
         VALUES ($1, $2, $3, $4, $5, 'COLLECTION_OPERATOR', 'ACTIVE');`,
        [opId, orgId, `op_${codePrefix.toLowerCase()}_${suffix}`, `+91982200${codePrefix === 'ALPHA' ? '1111' : '2222'}`, `Operator ${codePrefix}`]
      );
      await pool.query(
        `INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status)
         VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', 'APPROVED');`,
        [custId, orgId, centerId, `F-${codePrefix}-001`, `Farmer ${codePrefix}`, `+91982233${codePrefix === 'ALPHA' ? '1111' : '2222'}`]
      );
      await pool.query(
        `INSERT INTO customer_milk_categories (customer_id, milk_category, authorized_by)
         VALUES ($1, 'COW', $2), ($1, 'BUFFALO', $2);`,
        [custId, opId]
      );
      await pool.query(
        `INSERT INTO kiosk_shift_sessions (
           id, session_code, organization_id, center_id, business_date, shift,
           status, opened_at, opening_operator_id, device_identifier, device_name,
           total_liters, cow_liters, buffalo_liters, transaction_count, total_amount,
           average_fat, average_snf, updated_at
         ) VALUES (
           $1, $2, $3, $4, CURRENT_DATE, 'MORNING',
           'OPEN', NOW(), $5, 'KIOSK_CONCURRENT', 'Counter Kiosk',
           0.00, 0.00, 0.00, 0, 0.00, 0.0, 0.0, NOW()
         );`,
        [sesId, `SES-${codePrefix}-${suffix}`, orgId, centerId, opId]
      );
      await pool.query(
        `INSERT INTO customer_ledger_accounts (customer_id, organization_id, currency, current_balance)
         VALUES ($1, $2, 'INR', 0.00);`,
        [custId, orgId]
      );
    };

    await seedFixture(poolAlpha, orgAlpha, centerAlpha, operatorAlpha, customerAlpha, sessionAlpha, 'ALPHA');
    await seedFixture(poolBeta, orgBeta, centerBeta, operatorBeta, customerBeta, sessionBeta, 'BETA');

    const tenantDbA = await tenantDbManager.getStrictTenantDb(orgAlpha);
    const customerRepo = new PostgresCustomerRepository();
    const sessionRepo = new PostgresShiftSessionRepository();
    const transactionRepo = new PostgresCollectionTransactionRepository();
    const rateChartRepo = new PostgresRateChartRepository();
    const ledgerRepo = new PostgresLedgerRepository();

    const useCase = new ProcessMilkIntakeUseCase(
      customerRepo,
      sessionRepo,
      transactionRepo,
      rateChartRepo,
      ledgerRepo
    );

    await suite.test('1. Two concurrent requests with same idempotency key create exactly 1 transaction, 1 session update, 1 ledger credit', async () => {
      const sharedIdempotencyKey = `IDEM-CONCUR-${crypto.randomUUID()}`;
      const intakeDTO = {
        sessionId: sessionAlpha,
        customerId: customerAlpha,
        organizationId: orgAlpha,
        milkCategory: 'COW',
        weightLiters: 10.0,
        fatPercentage: 4.0,
        snfPercentage: 8.5,
        identificationMethod: 'MANUAL_SEARCH',
        deviceId: 'KIOSK_CONCURRENT',
        operatorId: operatorAlpha,
        operatorName: 'Operator Alpha',
        idempotencyKey: sharedIdempotencyKey,
      };

      const [res1, res2] = await Promise.all([
        useCase.execute({ ...intakeDTO }),
        useCase.execute({ ...intakeDTO }),
      ]);

      assert.strictEqual(res1.transaction.id, res2.transaction.id);
      assert.strictEqual(res1.receiptNumber, res2.receiptNumber);

      const replayFlags = [res1.isIdempotentReplay, res2.isIdempotentReplay].sort();
      assert.deepStrictEqual(replayFlags, [false, true]);

      const mcRes = await tenantDbA.query(
        `SELECT COUNT(*) as count FROM milk_collections WHERE organization_id = $1 AND idempotency_key = $2`,
        [orgAlpha, sharedIdempotencyKey]
      );
      assert.strictEqual(Number(mcRes.rows[0].count), 1);

      const sesRes = await tenantDbA.query(
        `SELECT total_liters, total_amount, transaction_count FROM kiosk_shift_sessions WHERE id = $1`,
        [sessionAlpha]
      );
      assert.strictEqual(Number(sesRes.rows[0].total_liters), 10.0);
      assert.strictEqual(Number(sesRes.rows[0].transaction_count), 1);

      const ledgerRes = await tenantDbA.query(
        `SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1 AND organization_id = $2`,
        [customerAlpha, orgAlpha]
      );
      assert.strictEqual(Number(ledgerRes.rows[0].current_balance), Number(res1.transaction.totalAmount));

      const ltRes = await tenantDbA.query(
        `SELECT COUNT(*) as count FROM ledger_transactions WHERE organization_id = $1 AND reference_id = $2`,
        [orgAlpha, res1.transaction.id]
      );
      assert.strictEqual(Number(ltRes.rows[0].count), 1);
    });

    await suite.test('2. Tenant isolation: Same idempotency key in different organization creates independent collection without leak', async () => {
      const sharedKey = `IDEM-CROSS-ORG-${crypto.randomUUID()}`;

      const resAlpha = await useCase.execute({
        sessionId: sessionAlpha,
        customerId: customerAlpha,
        organizationId: orgAlpha,
        milkCategory: 'COW',
        weightLiters: 5.0,
        fatPercentage: 4.0,
        snfPercentage: 8.5,
        identificationMethod: 'MANUAL_SEARCH',
        deviceId: 'KIOSK_CONCURRENT',
        operatorId: operatorAlpha,
        operatorName: 'Operator Alpha',
        idempotencyKey: sharedKey,
      });
      assert.strictEqual(resAlpha.isIdempotentReplay, false);

      const resBeta = await useCase.execute({
        sessionId: sessionBeta,
        customerId: customerBeta,
        organizationId: orgBeta,
        milkCategory: 'COW',
        weightLiters: 12.0,
        fatPercentage: 4.2,
        snfPercentage: 8.6,
        identificationMethod: 'MANUAL_SEARCH',
        deviceId: 'KIOSK_CONCURRENT',
        operatorId: operatorBeta,
        operatorName: 'Operator Beta',
        idempotencyKey: sharedKey,
      });
      assert.strictEqual(resBeta.isIdempotentReplay, false);

      assert.notStrictEqual(resAlpha.transaction.id, resBeta.transaction.id);
      assert.strictEqual(resBeta.transaction.dairyId, orgBeta);
      assert.strictEqual(resAlpha.transaction.dairyId, orgAlpha);

      const lookupAlpha = await transactionRepo.findByIdempotencyKey(sharedKey, orgAlpha);
      const lookupBeta = await transactionRepo.findByIdempotencyKey(sharedKey, orgBeta);
      assert.strictEqual(lookupAlpha?.id, resAlpha.transaction.id);
      assert.strictEqual(lookupBeta?.id, resBeta.transaction.id);
    });

    await suite.test('3. Financial Atomicity: Full rollback on failure and successful retry', async () => {
      const failingKey = `IDEM-ROLLBACK-${crypto.randomUUID()}`;

      let errorCaught = false;
      try {
        await useCase.execute({
          sessionId: '00000000-0000-0000-0000-999999999999',
          customerId: customerAlpha,
          organizationId: orgAlpha,
          milkCategory: 'COW',
          weightLiters: 8.0,
          fatPercentage: 3.8,
          snfPercentage: 8.5,
          identificationMethod: 'MANUAL_SEARCH',
          deviceId: 'KIOSK_CONCURRENT',
          operatorId: operatorAlpha,
          operatorName: 'Operator Alpha',
          idempotencyKey: failingKey,
        });
      } catch {
        errorCaught = true;
      }
      assert.strictEqual(errorCaught, true);

      const mcCheck = await tenantDbA.query(
        `SELECT COUNT(*) as count FROM milk_collections WHERE organization_id = $1 AND idempotency_key = $2`,
        [orgAlpha, failingKey]
      );
      assert.strictEqual(Number(mcCheck.rows[0].count), 0);

      const retryRes = await useCase.execute({
        sessionId: sessionAlpha,
        customerId: customerAlpha,
        organizationId: orgAlpha,
        milkCategory: 'COW',
        weightLiters: 8.0,
        fatPercentage: 3.8,
        snfPercentage: 8.5,
        identificationMethod: 'MANUAL_SEARCH',
        deviceId: 'KIOSK_CONCURRENT',
        operatorId: operatorAlpha,
        operatorName: 'Operator Alpha',
        idempotencyKey: failingKey,
      });

      assert.strictEqual(retryRes.isIdempotentReplay, false);
      assert.ok(retryRes.transaction.id);

      const mcRetryCheck = await tenantDbA.query(
        `SELECT COUNT(*) as count FROM milk_collections WHERE organization_id = $1 AND idempotency_key = $2`,
        [orgAlpha, failingKey]
      );
      assert.strictEqual(Number(mcRetryCheck.rows[0].count), 1);
    });

    // ─── PHASE 2: Pool / Shutdown Lifecycle Regression Tests ─────────────────
    // These tests verify the corrected lifecycle invariants introduced in
    // RESTART-03.7 against real PostgreSQL 17 and do NOT use
    // DROP DATABASE ... WITH (FORCE) or pg_terminate_backend() as workarounds.

    const registerExtraTenantDb = async (dairyId, dairyCode, dbName) => {
      const dbUrl = makeDbUrl(TEST_PG_URL, dbName);
      await adminPool.query(`CREATE DATABASE ${dbName};`);
      createdDatabases.push(dbName);
      await poolCtrl.query(
        `INSERT INTO organizations (id, name, code, status) VALUES ($1, $2, $3, 'ACTIVE') ON CONFLICT DO NOTHING;`,
        [dairyId, `Lifecycle Dairy ${dairyCode}`, dairyCode]
      );
      await poolCtrl.query(
        `INSERT INTO dairy_database_mappings (
           id, dairy_id, dairy_code, database_name, resource_type,
           connection_uri_encrypted, schema_version, provisioning_status, provisioned_at, last_verified_at
         ) VALUES ($1, $2, $3, $4, 'PHYSICAL_DATABASE', $5, 'v1.0.0', 'ACTIVE', NOW(), NOW());`,
        [crypto.randomUUID(), dairyId, dairyCode, dbName, CredentialEncryption.encrypt(dbUrl)]
      );
      return dbUrl;
    };

    await suite.test('4. Repeated closeTenantPool() calls on the same dairy end the real pool once and are idempotent', async () => {
      const orgLifecycle = crypto.randomUUID();
      const dbLifecycle = `dfarm_lc_${suffix}`;
      await registerExtraTenantDb(orgLifecycle, `LC-${suffix}`, dbLifecycle);

      const client = await tenantDbManagerRef.getStrictTenantDb(orgLifecycle);
      assert.equal((await client.query('SELECT current_database() AS d;')).rows[0].d, dbLifecycle);
      const livePool = tenantDbManagerRef.getTenantPool(orgLifecycle);
      assert.ok(livePool, 'Pool should be created after getStrictTenantDb()');
      attachPoolErrorGuard(livePool, 'tenantPoolLifecycle');

      await tenantDbManagerRef.closeTenantPool(orgLifecycle);
      assert.strictEqual(livePool.ended, true, 'Underlying pg.Pool must be ended after first closeTenantPool()');
      assert.strictEqual(tenantDbManagerRef.getTenantPool(orgLifecycle), undefined, 'Pool must be evicted after close');

      // Second close must succeed without calling pool.end() again.
      await tenantDbManagerRef.closeTenantPool(orgLifecycle);
      assert.strictEqual(livePool.ended, true);
      await waitForDbIdle(dbLifecycle);
    });

    await suite.test('5. Concurrent closeTenantPool() and closeAllPools() await the same shutdown without premature completion', async () => {
      const orgConcA = crypto.randomUUID();
      const orgConcB = crypto.randomUUID();
      const dbConcA = `dfarm_cca_${suffix}`;
      const dbConcB = `dfarm_ccb_${suffix}`;
      await registerExtraTenantDb(orgConcA, `CCA-${suffix}`, dbConcA);
      await registerExtraTenantDb(orgConcB, `CCB-${suffix}`, dbConcB);

      const clientA = await tenantDbManagerRef.getStrictTenantDb(orgConcA);
      const clientB = await tenantDbManagerRef.getStrictTenantDb(orgConcB);
      assert.equal((await clientA.query('SELECT 1 AS ok;')).rows[0].ok, 1);
      assert.equal((await clientB.query('SELECT 1 AS ok;')).rows[0].ok, 1);

      const poolA = tenantDbManagerRef.getTenantPool(orgConcA);
      const poolB = tenantDbManagerRef.getTenantPool(orgConcB);
      assert.ok(poolA && poolB, 'Both tenant pools must be active');
      attachPoolErrorGuard(poolA, 'tenantPoolConcA');
      attachPoolErrorGuard(poolB, 'tenantPoolConcB');

      // Race closeTenantPool(orgConcA) twice alongside closeAllPools().
      const results = await Promise.allSettled([
        tenantDbManagerRef.closeTenantPool(orgConcA),
        tenantDbManagerRef.closeTenantPool(orgConcA),
        tenantDbManagerRef.closeAllPools(),
      ]);

      for (const r of results) {
        assert.strictEqual(r.status, 'fulfilled', `Concurrent shutdown failed: ${r.reason?.message}`);
      }
      assert.strictEqual(poolA.ended, true, 'poolA must be fully ended when closeAllPools() resolves');
      assert.strictEqual(poolB.ended, true, 'poolB must be fully ended when closeAllPools() resolves');
      assert.strictEqual(tenantDbManagerRef.getTenantPool(orgConcA), undefined);
      assert.strictEqual(tenantDbManagerRef.getTenantPool(orgConcB), undefined);

      await waitForDbIdle(dbConcA);
      await waitForDbIdle(dbConcB);
    });

    await suite.test('6. wrapPgPool().close() interacts safely with manager-level shutdown (no double-end)', async () => {
      const orgWrap = crypto.randomUUID();
      const dbWrap = `dfarm_wp_${suffix}`;
      await registerExtraTenantDb(orgWrap, `WP-${suffix}`, dbWrap);

      const wrappedClient = await tenantDbManagerRef.getStrictTenantDb(orgWrap);
      assert.equal((await wrappedClient.query('SELECT 1 AS ok;')).rows[0].ok, 1);
      const rawPool = tenantDbManagerRef.getTenantPool(orgWrap);
      assert.ok(rawPool, 'Pool must be open');
      attachPoolErrorGuard(rawPool, 'tenantPoolWrap');

      const [wr, mr, ar] = await Promise.allSettled([
        wrappedClient.close?.(),
        tenantDbManagerRef.closeTenantPool(orgWrap),
        tenantDbManagerRef.closeAllPools(),
      ]);
      assert.strictEqual(wr.status, 'fulfilled', `wrappedClient.close(): ${wr.reason?.message}`);
      assert.strictEqual(mr.status, 'fulfilled', `closeTenantPool(): ${mr.reason?.message}`);
      assert.strictEqual(ar.status, 'fulfilled', `closeAllPools(): ${ar.reason?.message}`);
      assert.strictEqual(rawPool.ended, true, 'Underlying pg.Pool must be ended');
      assert.strictEqual(tenantDbManagerRef.getTenantPool(orgWrap), undefined,
        'Pool must be absent from manager after wrapPgPool().close() + closeTenantPool()');

      await waitForDbIdle(dbWrap);
    });

    await suite.test('7. Real pg.Pool error event capture and canConnectRealPostgres() unreachable handling', async () => {
      // 7a. Real pg.Pool emits an async 'error' event on a guarded pool -> captured cleanly.
      const captured = [];
      const testPool = new Pool({ connectionString: alphaUrl, max: 1, connectionTimeoutMillis: 5000 });
      testPool.on('error', (err) => {
        captured.push({ code: err?.code, message: err?.message || String(err) });
      });
      await testPool.query('SELECT 1;');
      const syntheticErr = Object.assign(new Error('Simulated idle pool error'), { code: 'ECONNRESET' });
      testPool.emit('error', syntheticErr);
      assert.strictEqual(captured.length, 1);
      assert.strictEqual(captured[0].code, 'ECONNRESET');
      await closePoolCleanly(testPool, 'errorCaptureTestPool');

      // 7b. Unavailable endpoint returns false cleanly and closes probe without leaking handles.
      const unreachable = await canConnectRealPostgres('postgresql://postgres:postgres@127.0.0.1:59998/nonexistent');
      assert.strictEqual(unreachable, false);
    });

    await suite.test('8. Database deletion only proceeds after all dependent connections are gone and partial setup cleans up', async () => {
      // 8a. Live connection prevents waitForDbIdle and DROP DATABASE; after clean close, DROP DATABASE succeeds without FORCE.
      const dbIdle = `dfarm_wi_${suffix}`;
      const idleUrl = makeDbUrl(TEST_PG_URL, dbIdle);
      await adminPool.query(`CREATE DATABASE ${dbIdle};`);
      createdDatabases.push(dbIdle);

      const idlePool = new Pool({ connectionString: idleUrl, max: 1, connectionTimeoutMillis: 5000 });
      attachPoolErrorGuard(idlePool, 'idlePool');

      const client = await idlePool.connect();
      let idleThrew = false;
      try {
        await waitForDbIdle(dbIdle);
      } catch (err) {
        idleThrew = true;
        assert.ok(
          err.message.includes('still had') || err.message.includes('active'),
          `waitForDbIdle must report remaining connections, got: ${err.message}`
        );
      }
      assert.strictEqual(idleThrew, true,
        'waitForDbIdle must throw when a live client connection is still open');

      client.release();
      await closePoolCleanly(idlePool, 'idlePool');
      await waitForDbIdle(dbIdle);
      await adminPool.query(`DROP DATABASE ${dbIdle};`);
      const idx = createdDatabases.indexOf(dbIdle);
      if (idx !== -1) createdDatabases.splice(idx, 1);

      // 8b. Partial setup failure: invalid encrypted URI does not leave a pool registered.
      const orgBroken = crypto.randomUUID();
      await poolCtrl.query(
        `INSERT INTO organizations (id, name, code, status) VALUES ($1, 'Broken Dairy', $2, 'ACTIVE') ON CONFLICT DO NOTHING;`,
        [orgBroken, `BRK-${suffix}`]
      );
      await poolCtrl.query(
        `INSERT INTO dairy_database_mappings (
           id, dairy_id, dairy_code, database_name, resource_type,
           connection_uri_encrypted, schema_version, provisioning_status, provisioned_at, last_verified_at
         ) VALUES ($1, $2, $3, $4, 'PHYSICAL_DATABASE', 'not-valid-ciphertext', 'v1.0.0', 'ACTIVE', NOW(), NOW());`,
        [crypto.randomUUID(), orgBroken, `BRK-${suffix}`, `dfarm_brk_${suffix}`]
      );
      await assert.rejects(
        () => tenantDbManagerRef.getStrictTenantDb(orgBroken),
        (err) =>
          err?.status === 'CONNECTION_FAILED' ||
          err?.code === 'CONNECTION_FAILED' ||
          err?.code === 'TENANT_DATABASE_UNAVAILABLE' ||
          /Invalid encrypted credential format|Failed to initialize tenant database pool|decrypt/i.test(err?.message || '')
      );
      assert.strictEqual(tenantDbManagerRef.getTenantPool(orgBroken), undefined,
        'Failed partial initialization must not leave a pool in tenantPools');
    });

    await suite.test('9. Repeated closeAllPools() and PostgresDatabase.close() calls are idempotent and settle cleanly', async () => {
      await tenantDbManagerRef.closeAllPools();
      await tenantDbManagerRef.closeAllPools();
      const [c1, c2] = await Promise.allSettled([
        dbRef.close(),
        dbRef.close(),
      ]);
      assert.strictEqual(c1.status, 'fulfilled', `First db.close(): ${c1.reason?.message}`);
      assert.strictEqual(c2.status, 'fulfilled', `Concurrent db.close(): ${c2.reason?.message}`);
      assert.strictEqual(dbRef.pool.ended, true, 'Central db.pool must be ended after db.close()');
    });

    await suite.test('10. Real PG17 physical provisioning migration failure closes actual pg.Pool, evicts after closure, and leaves zero pg_stat_activity connections', async () => {
      const orgProvFail = crypto.randomUUID();
      const codeProvFail = `PF${suffix}`;
      const dbProvFail = tenantDbManagerRef.generateTenantDatabaseName(orgProvFail, codeProvFail);
      const origRunTenantMigrations = MigrationRunner.runTenantMigrations;

      let migrationInvoked = false;
      let capturedPool = null;
      let poolEndCalled = false;
      let poolPresentWhenEndStarted = false;
      let poolEndedBeforeEndFinished = true;
      let activeConnectionsDuringMigration = 0;

      MigrationRunner.runTenantMigrations = async (tenantClient, dairyId) => {
        if (dairyId !== orgProvFail) {
          return origRunTenantMigrations.call(MigrationRunner, tenantClient, dairyId);
        }
        migrationInvoked = true;

        // Verify the real physical pg.Pool was created and registered before migrations run.
        capturedPool = tenantDbManagerRef.getTenantPool(orgProvFail);
        assert.ok(capturedPool instanceof Pool, 'Physical provisioning must register a real pg.Pool instance');
        attachPoolErrorGuard(capturedPool, 'provFailPool');

        // Open an actual physical PostgreSQL connection to the newly created disposable tenant DB.
        const dbCheck = await tenantClient.query('SELECT current_database() AS db;');
        assert.strictEqual(dbCheck.rows[0]?.db, dbProvFail);

        const activityDuring = await adminPool.query(
          `SELECT COUNT(*)::int AS cnt FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid();`,
          [dbProvFail]
        );
        activeConnectionsDuringMigration = Number(activityDuring.rows[0]?.cnt || 0);
        assert.ok(
          activeConnectionsDuringMigration >= 1,
          `Expected at least 1 active physical PG17 connection to ${dbProvFail} during migration`
        );

        const origPoolEnd = capturedPool.end.bind(capturedPool);
        capturedPool.end = async (...args) => {
          poolEndCalled = true;
          poolPresentWhenEndStarted = tenantDbManagerRef.getTenantPool(orgProvFail) === capturedPool;
          poolEndedBeforeEndFinished = Boolean(capturedPool.ended);
          return origPoolEnd(...args);
        };

        throw new Error('Controlled PG17 migration failure after physical pool registration');
      };

      try {
        await assert.rejects(
          () =>
            tenantDbManagerRef.provisionTenantDatabase({
              dairyId: orgProvFail,
              dairyCode: codeProvFail,
              dairyName: 'Physical Provision Fail Dairy',
              adminConnectionString: TEST_PG_URL,
            }),
          /Controlled PG17 migration failure after physical pool registration/
        );

        assert.strictEqual(migrationInvoked, true, 'MigrationRunner.runTenantMigrations must have been invoked');
        assert.ok(capturedPool instanceof Pool, 'Physical pg.Pool must have been created before failure');
        assert.strictEqual(poolEndCalled, true, 'Physical pg.Pool.end() must be called on migration failure');
        assert.strictEqual(
          poolPresentWhenEndStarted,
          true,
          'Manager must not evict tenant pool before pool.end() runs'
        );
        assert.strictEqual(poolEndedBeforeEndFinished, false, 'Pool must not already be ended when cleanup starts');
        assert.strictEqual(capturedPool.ended, true, 'Physical pg.Pool must reach ended=true after failure cleanup');
        assert.strictEqual(
          tenantDbManagerRef.getTenantPool(orgProvFail),
          undefined,
          'Manager must evict failed tenant pool after closure'
        );

        const mapping = tenantDbManagerRef.getTenantMapping(orgProvFail);
        assert.strictEqual(mapping?.provisioningStatus, 'FAILED');
        assert.match(
          mapping?.provisioningError || '',
          /Controlled PG17 migration failure after physical pool registration/
        );

        // Wait for TCP socket teardown to settle and verify zero remaining connections in pg_stat_activity.
        await waitForDbIdle(dbProvFail);
        const activityAfter = await adminPool.query(
          `SELECT COUNT(*)::int AS cnt FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid();`,
          [dbProvFail]
        );
        assert.strictEqual(
          Number(activityAfter.rows[0]?.cnt || 0),
          0,
          `Expected 0 remaining pg_stat_activity connections to ${dbProvFail} after failed provisioning cleanup`
        );

        // Clean disposable tenant DB via normal DROP DATABASE after verifying zero connections.
        await adminPool.query(`DROP DATABASE IF EXISTS "${dbProvFail}";`);
      } finally {
        MigrationRunner.runTenantMigrations = origRunTenantMigrations;
        const leftoverDbCheck = await adminPool.query(
          `SELECT 1 FROM pg_database WHERE datname = $1;`,
          [dbProvFail]
        );
        if (leftoverDbCheck.rows.length > 0 && !createdDatabases.includes(dbProvFail)) {
          createdDatabases.push(dbProvFail);
        }
      }
    });
    // ─── END Phase 2 lifecycle regression tests ───────────────────────────────
  } finally {
    await cleanup();
  }
});
