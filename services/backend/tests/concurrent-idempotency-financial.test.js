import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import { MigrationRunner } from '../dist/infrastructure/database/MigrationRunner.js';

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

  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  const dbNameCtrl = `dfarm_conc_ctrl_${suffix}`;
  const dbNameAlpha = `dfarm_conc_a_${suffix}`;
  const dbNameBeta = `dfarm_conc_b_${suffix}`;

  const ctrlUrl = makeDbUrl(TEST_PG_URL, dbNameCtrl);
  const alphaUrl = makeDbUrl(TEST_PG_URL, dbNameAlpha);
  const betaUrl = makeDbUrl(TEST_PG_URL, dbNameBeta);

  const adminPool = new Pool({ connectionString: TEST_PG_URL, connectionTimeoutMillis: 5000 });
  let poolCtrl;
  let poolAlpha;
  let poolBeta;

  const orgAlpha = crypto.randomUUID();
  const orgBeta = crypto.randomUUID();

  try {
    await adminPool.query(`CREATE DATABASE ${dbNameCtrl};`);
    await adminPool.query(`CREATE DATABASE ${dbNameAlpha};`);
    await adminPool.query(`CREATE DATABASE ${dbNameBeta};`);

    poolCtrl = new Pool({ connectionString: ctrlUrl, max: 5 });
    poolAlpha = new Pool({ connectionString: alphaUrl, max: 15 });
    poolBeta = new Pool({ connectionString: betaUrl, max: 10 });

    await MigrationRunner.runControlPlaneMigrations(poolCtrl);
    await MigrationRunner.runTenantMigrations(poolAlpha, orgAlpha);
    await MigrationRunner.runTenantMigrations(poolBeta, orgBeta);

    process.env['NODE_ENV'] = 'test';
    process.env['TEST_REAL_POSTGRES'] = '1';
    process.env['DATABASE_TLS_MODE'] = 'disable';
    process.env['CENTRAL_DATABASE_URL'] = ctrlUrl;
    process.env['DATABASE_URL'] = ctrlUrl;
    process.env['DATABASE_PROVISIONER_URL'] = ctrlUrl;
    process.env['TENANT_POOL_CONNECTION_TIMEOUT_MS'] = '5000';

    const { db } = await import('../dist/infrastructure/database/PostgresPool.js');
    const { tenantDbManager } = await import('../dist/infrastructure/database/TenantDatabaseManager.js');
    const { CredentialEncryption } = await import('../dist/infrastructure/security/CredentialEncryption.js');
    const { PostgresCollectionTransactionRepository } = await import('../dist/infrastructure/repositories/PostgresCollectionTransactionRepository.js');
    const { PostgresCustomerRepository } = await import('../dist/infrastructure/repositories/PostgresCustomerRepository.js');
    const { PostgresShiftSessionRepository } = await import('../dist/infrastructure/repositories/PostgresShiftSessionRepository.js');
    const { PostgresRateChartRepository } = await import('../dist/infrastructure/repositories/PostgresRateChartRepository.js');
    const { PostgresLedgerRepository } = await import('../dist/infrastructure/repositories/PostgresLedgerRepository.js');
    const { ProcessMilkIntakeUseCase } = await import('../dist/application/use-cases/collections/MilkIntakeUseCases.js');

    suite.after(async () => {
      await tenantDbManager.closeAllPools().catch(() => {});
      await db.close().catch(() => {});
    });

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
    await tenantDbManager.initialize();

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
        `INSERT INTO users (id, organization_id, username, phone_number, full_name, role, user_role, status)
         VALUES ($1, $2, $3, $4, $5, 'COLLECTION_OPERATOR', 'COLLECTION_OPERATOR', 'ACTIVE');`,
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
    try {
      const { tenantDbManager } = await import('../dist/infrastructure/database/TenantDatabaseManager.js');
      const { db } = await import('../dist/infrastructure/database/PostgresPool.js');
      await tenantDbManager.closeAllPools().catch(() => {});
      await db.close().catch(() => {});
    } catch {}
    await poolCtrl?.end().catch(() => {});
    await poolAlpha?.end().catch(() => {});
    await poolBeta?.end().catch(() => {});
    await adminPool.query(`DROP DATABASE IF EXISTS ${dbNameAlpha} WITH (FORCE);`).catch(() => {});
    await adminPool.query(`DROP DATABASE IF EXISTS ${dbNameBeta} WITH (FORCE);`).catch(() => {});
    await adminPool.query(`DROP DATABASE IF EXISTS ${dbNameCtrl} WITH (FORCE);`).catch(() => {});
    await adminPool.end().catch(() => {});
  }
});
