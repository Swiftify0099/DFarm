import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import { assertDisposablePg17Cluster } from '../../../scripts/pg17-safety-guard.js';

const { Pool } = pg;

const TEST_PG_URL = process.env['TEST_POSTGRES_URL'] || '';
const REQUIRE_REAL_PG = process.env['REQUIRE_REAL_POSTGRES'] === '1';

async function canConnectRealPostgres(url) {
  if (!url) return false;
  const probe = new Pool({ connectionString: url, connectionTimeoutMillis: 2000 });
  probe.on('error', () => {});
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
  const closedPools = new WeakSet();
  let cleanupPromise = null;

  const closePoolCleanly = async (pool, label, closeAction) => {
    if (!pool || closedPools.has(pool)) return;
    closedPools.add(pool);

    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      if (pool.totalCount === pool.idleCount && pool.waitingCount === 0) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    if (pool.totalCount !== pool.idleCount || pool.waitingCount > 0) {
      throw new Error(
        `Pool '${label}' still had checked-out or waiting clients before teardown (total=${pool.totalCount}, idle=${pool.idleCount}, waiting=${pool.waitingCount}).`
      );
    }

    const expectedRemovals = Number(pool.totalCount || 0);
    let removedCount = 0;
    let resolveRemoved;
    const removedPromise =
      expectedRemovals > 0
        ? new Promise((resolve) => {
            resolveRemoved = resolve;
          })
        : Promise.resolve();

    const onRemove = () => {
      removedCount += 1;
      if (removedCount >= expectedRemovals && resolveRemoved) {
        resolveRemoved();
      }
    };

    if (expectedRemovals > 0) {
      pool.on('remove', onRemove);
    }

    try {
      if (closeAction) {
        await closeAction();
      } else if (!pool.ending && !pool.ended) {
        await pool.end();
      }

      if (expectedRemovals > 0) {
        await Promise.race([
          removedPromise,
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
      }
    } finally {
      if (expectedRemovals > 0) {
        pool.off('remove', onRemove);
      }
    }
  };

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
  } finally {
    await cleanup();
  }
});
