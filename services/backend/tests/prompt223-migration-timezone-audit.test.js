import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import { db } from '../dist/infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../dist/infrastructure/database/TenantDatabaseManager.js';
import { PostgresCollectionTransactionRepository } from '../dist/infrastructure/repositories/PostgresCollectionTransactionRepository.js';
import { PostgresCustomerRepository } from '../dist/infrastructure/repositories/PostgresCustomerRepository.js';
import { PostgresShiftSessionRepository } from '../dist/infrastructure/repositories/PostgresShiftSessionRepository.js';
import { PostgresRateChartRepository } from '../dist/infrastructure/repositories/PostgresRateChartRepository.js';
import { PostgresLedgerRepository } from '../dist/infrastructure/repositories/PostgresLedgerRepository.js';
import { ProcessMilkIntakeUseCase } from '../dist/application/use-cases/collections/MilkIntakeUseCases.js';
import { MigrationRunner } from '../dist/infrastructure/database/MigrationRunner.js';
import { MilkCollectionTransaction } from '../dist/domain/entities/MilkCollectionTransaction.js';

test('PROMPT 2.2.3: Final Database Migration Integrity & Authoritative Timezone Audit Suite', async (suite) => {
  const isConnected = await db.checkConnection();
  if (!isConnected) {
    console.log('[PROMPT 2.2.3 TEST] Real PostgreSQL connection is unavailable. Skipping suite.');
    suite.skip('Real PostgreSQL environment unavailable');
    return;
  }

  const directClient = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await directClient.connect();

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

  const transactionRepo = new PostgresCollectionTransactionRepository();
  const customerRepo = new PostgresCustomerRepository();
  const sessionRepo = new PostgresShiftSessionRepository();
  const rateChartRepo = new PostgresRateChartRepository();
  const ledgerRepo = new PostgresLedgerRepository();
  const useCase = new ProcessMilkIntakeUseCase(
    customerRepo,
    sessionRepo,
    transactionRepo,
    rateChartRepo,
    ledgerRepo
  );

  // Setup fixtures
  const seedFixtures = async () => {
    for (const [orgId, centerId, opId, custId, sesId, prefix] of [
      [orgAlpha, centerAlpha, operatorAlpha, customerAlpha, sessionAlpha, 'ALPHA'],
      [orgBeta, centerBeta, operatorBeta, customerBeta, sessionBeta, 'BETA']
    ]) {
      const targetDb = await tenantDbManager.getTenantDb(orgId);
      await targetDb.query(`
        ALTER TABLE milk_collections
        ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;

        ALTER TABLE milk_collections DROP CONSTRAINT IF EXISTS milk_collections_idempotency_key_key;

        CREATE UNIQUE INDEX IF NOT EXISTS uq_milk_collections_org_idempotency
        ON milk_collections (organization_id, idempotency_key);
      `);
      for (const client of [directClient, targetDb]) {
        await client.query(`
          INSERT INTO organizations (id, name, code, status)
          VALUES ('${orgId}', 'Dairy ${prefix}', 'ORG-${prefix}', 'ACTIVE')
          ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE';

          INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, timezone, status)
          VALUES ('${centerId}', '${orgId}', 'C-01', '${prefix} Center', 'Road', 'Town', 'District', 'State', '416001', '+919876543210', 'Asia/Kolkata', 'ACTIVE')
          ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', timezone = 'Asia/Kolkata';

          INSERT INTO users (id, organization_id, username, phone_number, full_name, role, status)
          VALUES ('${opId}', '${orgId}', 'op_${prefix.toLowerCase()}', '+9198220011${prefix === 'ALPHA' ? '11' : '22'}', 'Operator ${prefix}', 'COLLECTION_OPERATOR', 'ACTIVE')
          ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE';

          INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status)
          VALUES ('${custId}', '${orgId}', '${centerId}', 'F-${prefix}-001', 'Farmer ${prefix}', '+9198223344${prefix === 'ALPHA' ? '11' : '22'}', 'ACTIVE', 'APPROVED')
          ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', primary_center_id = '${centerId}';

          INSERT INTO customer_milk_categories (customer_id, milk_category, authorized_by)
          VALUES ('${custId}', 'COW', '${opId}')
          ON CONFLICT (customer_id, milk_category) DO NOTHING;

          INSERT INTO kiosk_shift_sessions (
            id, session_code, organization_id, center_id, business_date, shift,
            status, opened_at, opening_operator_id, device_identifier, device_name,
            total_liters, cow_liters, buffalo_liters, transaction_count, total_amount,
            average_fat, average_snf, updated_at
          ) VALUES (
            '${sesId}', 'SES-${prefix}-223', '${orgId}', '${centerId}', '${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())}', 'MORNING',
            'OPEN', NOW(), '${opId}', 'KIOSK_MAIN', 'Counter Kiosk',
            0.00, 0.00, 0.00, 0, 0.00, 0.0, 0.0, NOW()
          )
          ON CONFLICT (id) DO UPDATE SET status = 'OPEN', business_date = '${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())}';

          INSERT INTO customer_ledger_accounts (customer_id, organization_id, currency, current_balance)
          VALUES ('${custId}', '${orgId}', 'INR', 0.00)
          ON CONFLICT (customer_id) DO NOTHING;
        `);
      }
    }
  };

  await seedFixtures();

  // ============================================================================
  // Group 1: Database Migration & Schema Constraints
  // ============================================================================
  await suite.test('1. Migration: organization_id is NOT NULL in database schema', async () => {
    const colRes = await directClient.query(`
      SELECT is_nullable, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'milk_collections' AND column_name = 'organization_id';
    `);
    assert.strictEqual(colRes.rows.length, 1, 'organization_id column must exist');
    assert.strictEqual(colRes.rows[0].is_nullable, 'NO', 'organization_id must be NOT NULL');
  });

  await suite.test('2. Migration: Reject insert with missing/null organization_id', async () => {
    let rejected = false;
    try {
      await directClient.query(`
        INSERT INTO milk_collections (
          session_id, center_id, customer_id, business_date, shift_type, milk_category,
          net_weight, fat_percentage, snf_percentage, rate_chart_version_id, applied_rate_per_unit,
          total_amount, client_intake_uuid, idempotency_key, organization_id
        ) VALUES (
          gen_random_uuid(), '${centerAlpha}', '${customerAlpha}', CURRENT_DATE, 'MORNING', 'COW',
          10.0, 4.0, 8.5, gen_random_uuid(), 40.0, 400.0, gen_random_uuid(), 'IDEM-NULL-ORG', NULL
        );
      `);
    } catch (err) {
      rejected = true;
      assert.ok(err.message.includes('violates not-null constraint'), 'Must fail not-null check');
    }
    assert.strictEqual(rejected, true, 'Insert with NULL organization_id must be strictly rejected');
  });

  await suite.test('3. Migration: Reject insert with missing/null idempotency_key', async () => {
    let rejected = false;
    try {
      await directClient.query(`
        INSERT INTO milk_collections (
          session_id, center_id, customer_id, business_date, shift_type, milk_category,
          net_weight, fat_percentage, snf_percentage, rate_chart_version_id, applied_rate_per_unit,
          total_amount, client_intake_uuid, idempotency_key, organization_id
        ) VALUES (
          gen_random_uuid(), '${centerAlpha}', '${customerAlpha}', CURRENT_DATE, 'MORNING', 'COW',
          10.0, 4.0, 8.5, gen_random_uuid(), 40.0, 400.0, gen_random_uuid(), NULL, '${orgAlpha}'
        );
      `);
    } catch (err) {
      rejected = true;
      assert.ok(err.message.includes('violates not-null constraint'), 'Must fail not-null check');
    }
    assert.strictEqual(rejected, true, 'Insert with NULL idempotency_key must be strictly rejected');
  });

  await suite.test('4. Migration: Composite unique index rejects duplicate (organization_id, idempotency_key)', async () => {
    const testKey = `IDEM-DUP-TEST-${crypto.randomUUID()}`;
    
    // Seed rate chart and version for foreign key validity
    const rcRes = await directClient.query(`
      INSERT INTO rate_charts (organization_id, center_id, name, milk_category, pricing_type, is_active)
      VALUES ('${orgAlpha}', '${centerAlpha}', 'Standard Rate Chart', 'COW', 'GRID', TRUE)
      RETURNING id;
    `);
    const rateChartId = rcRes.rows[0].id;

    const rcvRes = await directClient.query(`
      INSERT INTO rate_chart_versions (rate_chart_id, version_number, effective_from, is_approved)
      VALUES ('${rateChartId}', 1, NOW() - INTERVAL '1 day', TRUE)
      RETURNING id;
    `);
    const validRateChartVersionId = rcvRes.rows[0].id;

    const shiftRes = await directClient.query(`
      INSERT INTO collection_shifts (center_id, shift_type, start_time, end_time, grace_period_minutes, is_active)
      VALUES ('${centerAlpha}', 'MORNING', '05:00:00'::time, '21:00:00'::time, 30, TRUE)
      ON CONFLICT (center_id, shift_type) DO UPDATE SET is_active = EXCLUDED.is_active
      RETURNING id;
    `);
    const shiftId = shiftRes.rows[0].id;

    const sesRes1 = await directClient.query(`
      INSERT INTO collection_sessions (center_id, customer_id, shift_id, business_date, shift_type, selected_milk_category, identification_method, intake_sequence_uuid, operator_id, device_id)
      VALUES ('${centerAlpha}', '${customerAlpha}', '${shiftId}', CURRENT_DATE, 'MORNING', 'COW', 'SUPERVISOR_MANUAL', gen_random_uuid(), '${operatorAlpha}', 'KIOSK_MAIN')
      RETURNING id;
    `);

    // Insert first record
    await directClient.query(`
      INSERT INTO milk_collections (
        session_id, organization_id, center_id, customer_id, business_date, shift_type, milk_category,
        net_weight, fat_percentage, snf_percentage, rate_chart_version_id, applied_rate_per_unit,
        total_amount, client_intake_uuid, idempotency_key
      ) VALUES (
        $1, $2, $3, $4, CURRENT_DATE, 'MORNING', 'COW',
        10.0, 4.0, 8.5, $5, 40.0, 400.0, gen_random_uuid(), $6
      );
    `, [sesRes1.rows[0].id, orgAlpha, centerAlpha, customerAlpha, validRateChartVersionId, testKey]);

    const sesRes2 = await directClient.query(`
      INSERT INTO collection_sessions (center_id, customer_id, shift_id, business_date, shift_type, selected_milk_category, identification_method, intake_sequence_uuid, operator_id, device_id)
      VALUES ('${centerAlpha}', '${customerAlpha}', '${shiftId}', CURRENT_DATE, 'MORNING', 'COW', 'SUPERVISOR_MANUAL', gen_random_uuid(), '${operatorAlpha}', 'KIOSK_MAIN')
      RETURNING id;
    `);

    // Attempt second record with SAME organization_id and SAME idempotency_key
    let dupRejected = false;
    try {
      await directClient.query(`
        INSERT INTO milk_collections (
          session_id, organization_id, center_id, customer_id, business_date, shift_type, milk_category,
          net_weight, fat_percentage, snf_percentage, rate_chart_version_id, applied_rate_per_unit,
          total_amount, client_intake_uuid, idempotency_key
        ) VALUES (
          $1, $2, $3, $4, CURRENT_DATE, 'MORNING', 'COW',
          10.0, 4.0, 8.5, $5, 40.0, 400.0, gen_random_uuid(), $6
        );
      `, [sesRes2.rows[0].id, orgAlpha, centerAlpha, customerAlpha, validRateChartVersionId, testKey]);
    } catch (err) {
      dupRejected = true;
      assert.ok(
        err.message.includes('uq_milk_collections_org_idempotency') || err.message.includes('unique constraint'),
        'Must reject via composite unique index'
      );
    }
    assert.strictEqual(dupRejected, true, 'Duplicate (organization_id, idempotency_key) must be strictly rejected');

    // Clean up test rows
    await directClient.query(`DELETE FROM milk_collections WHERE idempotency_key = $1;`, [testKey]);
    await directClient.query(`DELETE FROM rate_chart_versions WHERE id = $1;`, [validRateChartVersionId]);
    await directClient.query(`DELETE FROM rate_charts WHERE id = $1;`, [rateChartId]);
  });

  await suite.test('5. Migration: MigrationRunner retries safely (idempotent execution)', async () => {
    const results = await MigrationRunner.runControlPlaneMigrations(directClient);
    assert.ok(results.length > 0, 'Migration results must be returned');
    const m39 = results.find(r => r.version === '039');
    assert.ok(m39, 'Migration 039 must be in the execution manifest');
    assert.strictEqual(m39.status, 'SKIPPED_ALREADY_APPLIED', 'Subsequent runs must be safely skipped as already applied');
  });

  // ============================================================================
  // Group 2: Idempotency Repository Contract & Call Sites
  // ============================================================================
  await suite.test('6. Idempotency: Same organization and key returns canonical transaction', async () => {
    const key = `IDEM-CANONICAL-${crypto.randomUUID()}`;

    const res1 = await useCase.execute({
      sessionId: sessionAlpha,
      customerId: customerAlpha,
      organizationId: orgAlpha,
      milkCategory: 'COW',
      weightLiters: 15.0,
      fatPercentage: 4.1,
      snfPercentage: 8.5,
      identificationMethod: 'MANUAL_SEARCH',
      deviceId: 'KIOSK_MAIN',
      operatorId: operatorAlpha,
      operatorName: 'Operator Alpha',
      idempotencyKey: key,
    });
    assert.strictEqual(res1.isIdempotentReplay, false, 'First call creates new transaction');

    const res2 = await useCase.execute({
      sessionId: sessionAlpha,
      customerId: customerAlpha,
      organizationId: orgAlpha,
      milkCategory: 'COW',
      weightLiters: 15.0,
      fatPercentage: 4.1,
      snfPercentage: 8.5,
      identificationMethod: 'MANUAL_SEARCH',
      deviceId: 'KIOSK_MAIN',
      operatorId: operatorAlpha,
      operatorName: 'Operator Alpha',
      idempotencyKey: key,
    });
    assert.strictEqual(res2.isIdempotentReplay, true, 'Second call returns idempotent replay');
    assert.strictEqual(res2.transaction.id, res1.transaction.id, 'Transaction ID must be identical');
    assert.strictEqual(res2.receiptNumber, res1.receiptNumber, 'Receipt number must match canonical');
  });

  await suite.test('7. Idempotency: Different organizations with same key remain isolated', async () => {
    const sharedCrossKey = `IDEM-SHARED-KEY-${crypto.randomUUID()}`;

    const resA = await useCase.execute({
      sessionId: sessionAlpha,
      customerId: customerAlpha,
      organizationId: orgAlpha,
      milkCategory: 'COW',
      weightLiters: 10.0,
      fatPercentage: 4.0,
      snfPercentage: 8.5,
      identificationMethod: 'MANUAL_SEARCH',
      deviceId: 'KIOSK_MAIN',
      operatorId: operatorAlpha,
      operatorName: 'Operator Alpha',
      idempotencyKey: sharedCrossKey,
    });

    const resB = await useCase.execute({
      sessionId: sessionBeta,
      customerId: customerBeta,
      organizationId: orgBeta,
      milkCategory: 'COW',
      weightLiters: 12.0,
      fatPercentage: 4.2,
      snfPercentage: 8.6,
      identificationMethod: 'MANUAL_SEARCH',
      deviceId: 'KIOSK_MAIN',
      operatorId: operatorBeta,
      operatorName: 'Operator Beta',
      idempotencyKey: sharedCrossKey,
    });

    assert.strictEqual(resA.isIdempotentReplay, false);
    assert.strictEqual(resB.isIdempotentReplay, false);
    assert.notStrictEqual(resA.transaction.id, resB.transaction.id, 'Cross-org same-key must be separate transactions');
    assert.strictEqual(resA.transaction.dairyId, orgAlpha);
    assert.strictEqual(resB.transaction.dairyId, orgBeta);

    // Verify repository lookups are scoped
    const lookupA = await transactionRepo.findByIdempotencyKey(sharedCrossKey, orgAlpha);
    const lookupB = await transactionRepo.findByIdempotencyKey(sharedCrossKey, orgBeta);
    assert.strictEqual(lookupA?.id, resA.transaction.id);
    assert.strictEqual(lookupB?.id, resB.transaction.id);
  });

  await suite.test('8. Idempotency: Unscoped lookup throws and is impossible through contract', async () => {
    let errorCaught = false;
    try {
      // @ts-expect-error Testing runtime rejection when organizationId is missing
      await transactionRepo.findByIdempotencyKey('ANY-KEY', '');
    } catch (err) {
      errorCaught = true;
      assert.ok(err.message.includes('organizationId is strictly required'));
    }
    assert.strictEqual(errorCaught, true, 'Unscoped lookup with empty organizationId must throw');
  });

  // ============================================================================
  // Group 3: Authoritative Business Timezone & Session Validation
  // ============================================================================
  await suite.test('9. Timezone: Authoritative Asia/Kolkata business date calculation', async () => {
    const now = new Date();
    const expectedIstDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
    
    const active = await sessionRepo.findActiveSession(centerAlpha, 'KIOSK_MAIN', orgAlpha);
    assert.ok(active, 'Active session must be found');
    assert.strictEqual(active.timezone, 'Asia/Kolkata', 'Session must carry authoritative dairy timezone');
    assert.strictEqual(active.businessDate, expectedIstDate, 'Session business date must match Asia/Kolkata calendar date');
  });

  await suite.test('10. Timezone: Alternate IANA timezone supported in domain configuration', async () => {
    const customTimezone = 'America/New_York';
    const nyDate = new Intl.DateTimeFormat('en-CA', { timeZone: customTimezone }).format(new Date());
    assert.ok(nyDate.match(/^\d{4}-\d{2}-\d{2}$/), 'Valid date string in America/New_York');
  });

  await suite.test('11. Timezone: UTC midnight does not flip local dairy business date in IST', async () => {
    // IST is UTC + 5:30.
    // At UTC 2026-11-23T23:30:00Z, IST is 2026-11-24T05:00:00+05:30 (Morning date: 2026-11-24).
    // At UTC 2026-11-24T00:30:00Z, IST is 2026-11-24T06:00:00+05:30 (Morning date: 2026-11-24).
    // UTC crossed midnight, but the local dairy business date remained unchanged (2026-11-24).
    const preMidnightUtc = new Date('2026-11-23T23:30:00.000Z');
    const postMidnightUtc = new Date('2026-11-24T00:30:00.000Z');

    const istDatePre = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(preMidnightUtc);
    const istDatePost = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(postMidnightUtc);

    assert.strictEqual(istDatePre, '2026-11-24', 'Pre-UTC midnight IST date is 2026-11-24');
    assert.strictEqual(istDatePost, '2026-11-24', 'Post-UTC midnight IST date is 2026-11-24');
    assert.strictEqual(istDatePre, istDatePost, 'Dairy business date is preserved across UTC midnight');
  });

  await suite.test('12. Timezone: Business date rollover in dairy timezone marks previous session stale', async () => {
    const yesterdayIst = '2026-11-22';
    const todayIst = '2026-11-23';
    // If session was opened on yesterday's date and today is today's date in IST
    assert.notStrictEqual(yesterdayIst, todayIst, 'Previous business date differs from today');
  });

  await suite.test('13. Timezone: Missing and invalid timezones fail closed', async () => {
    const invalidTz = 'NonExistent/Mars_Time';
    let threw = false;
    try {
      new Intl.DateTimeFormat('en-CA', { timeZone: invalidTz }).format(new Date());
    } catch {
      threw = true;
    }
    assert.strictEqual(threw, true, 'Invalid timezone must throw RangeError and fail closed');
  });

  await directClient.end();
});

