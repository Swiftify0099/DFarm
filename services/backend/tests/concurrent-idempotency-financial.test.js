import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { db } from '../dist/infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../dist/infrastructure/database/TenantDatabaseManager.js';
import { PostgresCollectionTransactionRepository } from '../dist/infrastructure/repositories/PostgresCollectionTransactionRepository.js';
import { PostgresCustomerRepository } from '../dist/infrastructure/repositories/PostgresCustomerRepository.js';
import { PostgresShiftSessionRepository } from '../dist/infrastructure/repositories/PostgresShiftSessionRepository.js';
import { PostgresRateChartRepository } from '../dist/infrastructure/repositories/PostgresRateChartRepository.js';
import { PostgresLedgerRepository } from '../dist/infrastructure/repositories/PostgresLedgerRepository.js';
import { ProcessMilkIntakeUseCase } from '../dist/application/use-cases/collections/MilkIntakeUseCases.js';

test('DFarm P0: Concurrent Collection Idempotency & Financial Atomicity Integration Suite', async (suite) => {
  const isConnected = await db.checkConnection();
  if (!isConnected) {
    console.log('[CONCURRENCY TEST] Real PostgreSQL connection is unavailable. Test marked as NOT RUN.');
    suite.skip('Real PostgreSQL environment unavailable');
    return;
  }

  const orgAlpha = '00000000-0000-0000-0000-0000000000a1';
  const orgBeta = '00000000-0000-0000-0000-0000000000b2';
  const centerAlpha = '00000000-0000-0000-0000-0000000000c1';
  const centerBeta = '00000000-0000-0000-0000-0000000000c2';
  const operatorAlpha = '00000000-0000-0000-0000-0000000000d1';
  const operatorBeta = '00000000-0000-0000-0000-0000000000d2';
  const customerAlpha = '00000000-0000-0000-0000-0000000000e1';
  const customerBeta = '00000000-0000-0000-0000-0000000000e2';
  const sessionAlpha = '00000000-0000-0000-0000-0000000000f1';
  const sessionBeta = '00000000-0000-0000-0000-0000000000f2';

  // Apply migration 039 on database
  await db.query(`
    ALTER TABLE milk_collections
    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;

    ALTER TABLE milk_collections DROP CONSTRAINT IF EXISTS milk_collections_idempotency_key_key;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_milk_collections_org_idempotency
    ON milk_collections (organization_id, idempotency_key);
  `);

  // Seed organizations, centers, users, customers, and open sessions
  const seedFixture = async (orgId, centerId, opId, custId, sesId, codePrefix) => {
    const targetDb = await tenantDbManager.getTenantDb(orgId);

    // Apply migration 039 on targetDb if not already applied
    await targetDb.query(`
      ALTER TABLE milk_collections
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;

      ALTER TABLE milk_collections DROP CONSTRAINT IF EXISTS milk_collections_idempotency_key_key;

      CREATE UNIQUE INDEX IF NOT EXISTS uq_milk_collections_org_idempotency
      ON milk_collections (organization_id, idempotency_key);
    `);

    await targetDb.query(`
      INSERT INTO organizations (id, name, code, status)
      VALUES ('${orgId}', 'Cooperative Dairy ${codePrefix}', 'ORG-${codePrefix}', 'ACTIVE')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE';

      INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
      VALUES ('${centerId}', '${orgId}', 'C-01', '${codePrefix} Center', 'Main Road', 'Village', 'District', 'State', '416001', '+919876543210', 'ACTIVE')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE';

      INSERT INTO users (id, organization_id, username, phone_number, full_name, role, status)
      VALUES ('${opId}', '${orgId}', 'op_${codePrefix.toLowerCase()}', '+9198220011${codePrefix === 'ALPHA' ? '11' : '22'}', 'Operator ${codePrefix}', 'COLLECTION_OPERATOR', 'ACTIVE')
      ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE';

      INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status)
      VALUES ('${custId}', '${orgId}', '${centerId}', 'F-${codePrefix}-001', 'Farmer ${codePrefix}', '+9198223344${codePrefix === 'ALPHA' ? '11' : '22'}', 'ACTIVE', 'APPROVED')
      ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', primary_center_id = '${centerId}';

      INSERT INTO customer_milk_categories (customer_id, milk_category, authorized_by)
      VALUES ('${custId}', 'COW', '${opId}'), ('${custId}', 'BUFFALO', '${opId}')
      ON CONFLICT (customer_id, milk_category) DO NOTHING;

      INSERT INTO kiosk_shift_sessions (
        id, session_code, organization_id, center_id, business_date, shift,
        status, opened_at, opening_operator_id, device_identifier, device_name,
        total_liters, cow_liters, buffalo_liters, transaction_count, total_amount,
        average_fat, average_snf, updated_at
      ) VALUES (
        '${sesId}', 'SES-${codePrefix}-TODAY', '${orgId}', '${centerId}', CURRENT_DATE, 'MORNING',
        'OPEN', NOW(), '${opId}', 'KIOSK_CONCURRENT', 'Counter Kiosk',
        0.00, 0.00, 0.00, 0, 0.00,
        0.0, 0.0, NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        status = 'OPEN',
        total_liters = 0.00,
        cow_liters = 0.00,
        buffalo_liters = 0.00,
        transaction_count = 0,
        total_amount = 0.00,
        business_date = CURRENT_DATE;

      INSERT INTO customer_ledger_accounts (customer_id, organization_id, currency, current_balance)
      VALUES ('${custId}', '${orgId}', 'INR', 0.00)
      ON CONFLICT (customer_id) DO UPDATE SET current_balance = 0.00;
    `);
  };

  await seedFixture(orgAlpha, centerAlpha, operatorAlpha, customerAlpha, sessionAlpha, 'ALPHA');
  await seedFixture(orgBeta, centerBeta, operatorBeta, customerBeta, sessionBeta, 'BETA');

  const tenantDbA = await tenantDbManager.getTenantDb(orgAlpha);
  const tenantDbB = await tenantDbManager.getTenantDb(orgBeta);

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

    // Dispatch concurrent requests simultaneously
    const [res1, res2] = await Promise.all([
      useCase.execute({ ...intakeDTO }),
      useCase.execute({ ...intakeDTO }),
    ]);

    // 1. Both requests must succeed and return the exact same canonical transaction ID
    assert.strictEqual(res1.transaction.id, res2.transaction.id, 'Both concurrent requests must resolve to the identical canonical transaction ID');
    assert.strictEqual(res1.receiptNumber, res2.receiptNumber, 'Receipt numbers must match');

    // 2. Exactly one request must be the winner (isIdempotentReplay = false) and the other must be the replay (isIdempotentReplay = true)
    const replayFlags = [res1.isIdempotentReplay, res2.isIdempotentReplay].sort();
    assert.deepStrictEqual(replayFlags, [false, true], 'Exactly one request must be original and exactly one must be idempotent replay');

    // 3. Database verification: Exactly 1 collection row exists
    const mcRes = await tenantDbA.query(
      `SELECT COUNT(*) as count FROM milk_collections WHERE organization_id = $1 AND idempotency_key = $2`,
      [orgAlpha, sharedIdempotencyKey]
    );
    assert.strictEqual(Number(mcRes.rows[0].count), 1, 'Exactly one milk_collections row must exist in PostgreSQL');

    // 4. Session tally verification: exactly 10.0L added (NOT 20.0L)
    const sesRes = await tenantDbA.query(
      `SELECT total_liters, total_amount, transaction_count FROM kiosk_shift_sessions WHERE id = $1`,
      [sessionAlpha]
    );
    assert.strictEqual(Number(sesRes.rows[0].total_liters), 10.0, 'Session total_liters must reflect exactly 1 intake (10.0L)');
    assert.strictEqual(Number(sesRes.rows[0].transaction_count), 1, 'Session transaction_count must be exactly 1');

    // 5. Farmer ledger credit verification: exactly 1 credit posted
    const ledgerRes = await tenantDbA.query(
      `SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1 AND organization_id = $2`,
      [customerAlpha, orgAlpha]
    );
    const expectedAmount = Number(res1.transaction.totalAmount);
    assert.strictEqual(Number(ledgerRes.rows[0].current_balance), expectedAmount, 'Farmer ledger balance must reflect exactly 1 intake credit');

    // 6. Ledger transactions table verification: exactly 1 entry for this collection
    const ltRes = await tenantDbA.query(
      `SELECT COUNT(*) as count FROM ledger_transactions WHERE organization_id = $1 AND reference_id = $2`,
      [orgAlpha, res1.transaction.id]
    );
    assert.strictEqual(Number(ltRes.rows[0].count), 1, 'Exactly 1 ledger_transactions row must exist');
  });

  await suite.test('2. Tenant isolation: Same idempotency key in different organization creates independent collection without leak', async () => {
    const sharedKey = `IDEM-CROSS-ORG-${crypto.randomUUID()}`;

    // Org Alpha intake
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

    // Org Beta intake with identical idempotency key
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

    // Org Beta must NOT see Org Alpha's transaction
    assert.notStrictEqual(resAlpha.transaction.id, resBeta.transaction.id, 'Cross-tenant idempotency keys must produce distinct transactions');
    assert.strictEqual(resBeta.transaction.dairyId, orgBeta);
    assert.strictEqual(resAlpha.transaction.dairyId, orgAlpha);

    // Verify lookup isolation
    const lookupAlpha = await transactionRepo.findByIdempotencyKey(sharedKey, orgAlpha);
    const lookupBeta = await transactionRepo.findByIdempotencyKey(sharedKey, orgBeta);
    assert.strictEqual(lookupAlpha?.id, resAlpha.transaction.id);
    assert.strictEqual(lookupBeta?.id, resBeta.transaction.id);
  });

  await suite.test('3. Financial Atomicity: Full rollback on failure and successful retry', async () => {
    const failingKey = `IDEM-ROLLBACK-${crypto.randomUUID()}`;

    // A. Attempt intake with invalid/non-existent session ID to trigger failure during atomic transaction
    let errorCaught = false;
    try {
      await useCase.execute({
        sessionId: '00000000-0000-0000-0000-999999999999', // non-existent session
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
    assert.strictEqual(errorCaught, true, 'Intake with invalid session must throw');

    // Confirm total rollback: zero rows in milk_collections for this failing key
    const mcCheck = await tenantDbA.query(
      `SELECT COUNT(*) as count FROM milk_collections WHERE organization_id = $1 AND idempotency_key = $2`,
      [orgAlpha, failingKey]
    );
    assert.strictEqual(Number(mcCheck.rows[0].count), 0, 'Rolled back transaction must leave 0 milk_collections rows');

    // B. Safe Retry: Retrying with the same idempotency key and valid session succeeds
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

    assert.strictEqual(retryRes.isIdempotentReplay, false, 'Retry after failure must successfully create canonical transaction');
    assert.ok(retryRes.transaction.id, 'Transaction ID must be assigned on retry');

    const mcRetryCheck = await tenantDbA.query(
      `SELECT COUNT(*) as count FROM milk_collections WHERE organization_id = $1 AND idempotency_key = $2`,
      [orgAlpha, failingKey]
    );
    assert.strictEqual(Number(mcRetryCheck.rows[0].count), 1, 'Retry must create exactly 1 collection row');
  });
});
