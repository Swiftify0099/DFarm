import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { db } from '../dist/infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../dist/infrastructure/database/TenantDatabaseManager.js';
import { HmacJwtTokenService } from '../dist/infrastructure/security/HmacJwtTokenService.js';
import { offlineSessionAuthService, OfflineSessionAuthorizationService } from '../dist/infrastructure/security/OfflineSessionAuthorizationService.js';
import { PostgresCollectionTransactionRepository } from '../dist/infrastructure/repositories/PostgresCollectionTransactionRepository.js';
import { PostgresCustomerRepository } from '../dist/infrastructure/repositories/PostgresCustomerRepository.js';
import { PostgresShiftSessionRepository } from '../dist/infrastructure/repositories/PostgresShiftSessionRepository.js';
import { BulkCollectionSyncUseCase } from '../dist/application/use-cases/collections/BulkCollectionSyncUseCase.js';
import { RateService } from '../dist/modules/rates/rate.service.js';
import { roundHalfUp } from '@dfarm/shared-types';

const tokenService = new HmacJwtTokenService();

test('PROMPT 4.2.1: Final Financial Safety, Formula Parity & Offline Lease Hardening Suite', async (suite) => {
  const isConnected = await db.checkConnection();
  if (!isConnected) {
    console.log('[PROMPT 4.2.1 TEST] Real PostgreSQL connection is unavailable. Suite skipped.');
    suite.skip('Real PostgreSQL environment unavailable');
    return;
  }

  // Tenant Fixture Identifiers
  const orgAlpha = '00000000-0000-0000-0000-0000000042a1';
  const orgBeta = '00000000-0000-0000-0000-0000000042b2';
  const centerAlpha = '00000000-0000-0000-0000-0000000042c1';
  const centerBeta = '00000000-0000-0000-0000-0000000042c2';
  const operatorAlpha = '00000000-0000-0000-0000-0000000042d1';
  const customerAlpha = '00000000-0000-0000-0000-0000000042e1';
  const sessionClosedAlpha = '00000000-0000-0000-0000-0000000042f2';

  // Rate Charts for Model Parity
  const chartGridId = '00000000-0000-0000-0000-000000421001';
  const verGridId = '00000000-0000-0000-0000-000000421011';
  const chartTwoAxisId = '00000000-0000-0000-0000-000000421002';
  const verTwoAxisId = '00000000-0000-0000-0000-000000421012';
  const chartTotalSolidsId = '00000000-0000-0000-0000-000000421003';
  const verTotalSolidsId = '00000000-0000-0000-0000-000000421013';
  const chartUnsupportedId = '00000000-0000-0000-0000-000000421004';
  const verUnsupportedId = '00000000-0000-0000-0000-000000421014';

  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const customerRepo = new PostgresCustomerRepository();
  const sessionRepo = new PostgresShiftSessionRepository();
  const transactionRepo = new PostgresCollectionTransactionRepository();
  const bulkUseCase = new BulkCollectionSyncUseCase(customerRepo, sessionRepo, transactionRepo);

  // Setup / Seed Database Fixtures
  const seedEnvironment = async () => {
    const clients = [db];
    try {
      const alphaDb = await tenantDbManager.getTenantDb(orgAlpha);
      if (alphaDb !== db) clients.push(alphaDb);
    } catch {}

    const codeSuffix = Date.now().toString(36).slice(-5);

    for (const client of clients) {
      await client.query(`
        ALTER TABLE milk_collections
        ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;

        ALTER TABLE milk_collections DROP CONSTRAINT IF EXISTS milk_collections_idempotency_key_key;

        CREATE UNIQUE INDEX IF NOT EXISTS uq_milk_collections_org_idempotency
        ON milk_collections (organization_id, idempotency_key);
      `);

      await client.query(`
        ALTER TABLE rate_charts DROP CONSTRAINT IF EXISTS chk_rate_chart_pricing_type;
        ALTER TABLE rate_charts ADD CONSTRAINT chk_rate_chart_pricing_type 
          CHECK (pricing_type IN ('GRID', 'TOTAL_SOLIDS_FORMULA', 'TWO_AXIS_FORMULA', 'FORMULA', 'UNSUPPORTED_TIER'));
      `);

      await client.query(`
        INSERT INTO organizations (id, name, code, status)
        VALUES 
          ('${orgAlpha}', 'Hardened Alpha Cooperative 4.2.1', 'A421_${codeSuffix}', 'ACTIVE'),
          ('${orgBeta}', 'Hardened Beta Cooperative 4.2.1', 'B421_${codeSuffix}', 'ACTIVE')
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE';
      `);

      await client.query(`
        INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status, timezone)
        VALUES 
          ('${centerAlpha}', '${orgAlpha}', 'C421A_${codeSuffix}', 'Center Alpha 4.2.1', 'Main Rd', 'AlphaTown', 'District', 'State', '416001', '+919876543210', 'ACTIVE', 'Asia/Kolkata'),
          ('${centerBeta}', '${orgBeta}', 'C421B_${codeSuffix}', 'Center Beta 4.2.1', 'Main Rd', 'BetaTown', 'District', 'State', '416002', '+919876543211', 'ACTIVE', 'Asia/Kolkata')
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE';
      `);

      await client.query(`
        INSERT INTO users (id, organization_id, username, phone_number, full_name, role, status)
        VALUES 
          ('${operatorAlpha}', '${orgAlpha}', 'op421_${codeSuffix}', '+919822992205', 'Operator Alpha 4.2.1', 'COLLECTION_OPERATOR', 'ACTIVE')
        ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', username = EXCLUDED.username;
      `);

      await client.query(`
        INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status)
        VALUES 
          ('${customerAlpha}', '${orgAlpha}', '${centerAlpha}', 'F-A421', 'Farmer Alpha 4.2.1', '+919822771105', 'ACTIVE', 'APPROVED')
        ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE';

        INSERT INTO customer_milk_categories (customer_id, milk_category, authorized_by)
        VALUES 
          ('${customerAlpha}', 'COW', '${operatorAlpha}')
        ON CONFLICT (customer_id, milk_category) DO NOTHING;

        INSERT INTO customer_ledger_accounts (id, customer_id, organization_id, current_balance, currency)
        VALUES 
          (gen_random_uuid(), '${customerAlpha}', '${orgAlpha}', 0.00, 'INR')
        ON CONFLICT DO NOTHING;
      `);

      const yesterdayOpen = `${yesterday}T06:00:00Z`;
      const yesterdayClose = `${yesterday}T09:30:00Z`;

      await client.query(`
        INSERT INTO kiosk_shift_sessions (id, session_code, organization_id, center_id, business_date, shift, status, opened_at, closed_at, opening_operator_id, device_identifier, total_liters, total_amount, transaction_count)
        VALUES 
          ('${sessionClosedAlpha}', 'SES-421-CLOSED', '${orgAlpha}', '${centerAlpha}', '${yesterday}', 'MORNING', 'CLOSED', '${yesterdayOpen}'::timestamptz, '${yesterdayClose}'::timestamptz, '${operatorAlpha}', 'STATION_COUNTER_1', 100, 4000, 10)
        ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, business_date = EXCLUDED.business_date, closed_at = EXCLUDED.closed_at, opened_at = EXCLUDED.opened_at, device_identifier = EXCLUDED.device_identifier;
      `);

      await client.query(`
        ALTER TABLE rate_chart_versions
        ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'DRAFT',
        ADD COLUMN IF NOT EXISTS pricing_unit VARCHAR(20) DEFAULT 'PER_KG',
        ADD COLUMN IF NOT EXISTS measurement_unit VARCHAR(10) DEFAULT 'KG',
        ADD COLUMN IF NOT EXISTS fat_min NUMERIC(5,2),
        ADD COLUMN IF NOT EXISTS fat_max NUMERIC(5,2),
        ADD COLUMN IF NOT EXISTS snf_min NUMERIC(5,2),
        ADD COLUMN IF NOT EXISTS snf_max NUMERIC(5,2),
        ADD COLUMN IF NOT EXISTS formula_definition JSONB;
      `);

      // Rate Charts: GRID, TWO_AXIS_FORMULA, TOTAL_SOLIDS_FORMULA, and UNSUPPORTED_TIER
      await client.query(`
        INSERT INTO rate_charts (id, organization_id, center_id, name, milk_category, pricing_type, is_active)
        VALUES 
          ('${chartGridId}', '${orgAlpha}', NULL, 'Alpha GRID Chart 4.2.1', 'COW', 'GRID', TRUE),
          ('${chartTwoAxisId}', '${orgAlpha}', NULL, 'Alpha TWO_AXIS Chart 4.2.1', 'COW', 'TWO_AXIS_FORMULA', TRUE),
          ('${chartTotalSolidsId}', '${orgAlpha}', NULL, 'Alpha TOTAL_SOLIDS Chart 4.2.1', 'COW', 'TOTAL_SOLIDS_FORMULA', TRUE),
          ('${chartUnsupportedId}', '${orgAlpha}', NULL, 'Alpha Unsupported Chart 4.2.1', 'COW', 'UNSUPPORTED_TIER', TRUE)
        ON CONFLICT (id) DO UPDATE SET is_active = TRUE, pricing_type = EXCLUDED.pricing_type;

        INSERT INTO rate_chart_versions (id, rate_chart_id, version_number, status, pricing_unit, measurement_unit, base_fat, base_snf, base_rate, fat_min, fat_max, snf_min, snf_max, formula_definition, effective_from, effective_to, is_approved)
        VALUES 
          ('${verGridId}', '${chartGridId}', 1, 'DRAFT', 'PER_KG', 'KG', 3.5, 8.5, 38.0, 2.5, 6.0, 7.5, 10.0, NULL, '${yesterday} 00:00:00Z', NULL, TRUE),
          ('${verTwoAxisId}', '${chartTwoAxisId}', 1, 'DRAFT', 'PER_KG', 'KG', 3.5, 8.5, 35.0, 2.5, 6.0, 7.5, 10.0, '{"fatFactor": 4.0, "snfFactor": 3.0}', '${yesterday} 00:00:00Z', NULL, TRUE),
          ('${verTotalSolidsId}', '${chartTotalSolidsId}', 1, 'DRAFT', 'PER_KG', 'KG', 3.5, 8.5, 0.0, 2.5, 6.0, 7.5, 10.0, '{"fatFactor": 6.0, "snfFactor": 3.5}', '${yesterday} 00:00:00Z', NULL, TRUE),
          ('${verUnsupportedId}', '${chartUnsupportedId}', 1, 'DRAFT', 'PER_KG', 'KG', 3.5, 8.5, 40.0, 2.5, 6.0, 7.5, 10.0, NULL, '${yesterday} 00:00:00Z', NULL, TRUE)
        ON CONFLICT (id) DO UPDATE SET status = 'DRAFT', is_approved = TRUE, formula_definition = EXCLUDED.formula_definition, base_rate = EXCLUDED.base_rate;

        INSERT INTO rate_chart_cells (rate_chart_version_id, fat_percentage, snf_percentage, rate_per_unit)
        VALUES 
          ('${verGridId}', 4.0, 8.5, 40.10)
        ON CONFLICT DO NOTHING;

        UPDATE rate_chart_versions SET status = 'PUBLISHED' WHERE id IN ('${verGridId}', '${verTwoAxisId}', '${verTotalSolidsId}', '${verUnsupportedId}');
      `);
    }
  };

  await seedEnvironment();

  // ==========================================================================
  // SECTION 1: Financial Rounding — Reject Invalid Inputs (P0)
  // ==========================================================================

  await suite.test('1a. roundHalfUp rejects NaN, Infinity, -Infinity, non-numbers with TypeError', async () => {
    assert.throws(() => roundHalfUp(NaN), TypeError);
    assert.throws(() => roundHalfUp(Infinity), TypeError);
    assert.throws(() => roundHalfUp(-Infinity), TypeError);
    assert.throws(() => roundHalfUp('31.505'), TypeError);
    assert.throws(() => roundHalfUp(null), TypeError);
    assert.throws(() => roundHalfUp(undefined), TypeError);
  });

  await suite.test('1b. RateService.validateHistoricalRate rejects non-finite and invalid inputs with INVALID_FINANCIAL_VALUES', async () => {
    const nanFatResult = await RateService.validateHistoricalRate({
      organizationId: orgAlpha,
      milkCategory: 'COW',
      fat: NaN,
      snf: 8.5,
      weightLiters: 10.0,
      ratePerLiter: 40.10,
      totalAmount: 401.00,
      businessDate: yesterday,
      rateChartVersionId: verGridId,
    });
    assert.equal(nanFatResult.isValid, false);
    assert.equal(nanFatResult.errorCode, 'INVALID_FINANCIAL_VALUES');

    const infWeightResult = await RateService.validateHistoricalRate({
      organizationId: orgAlpha,
      milkCategory: 'COW',
      fat: 4.0,
      snf: 8.5,
      weightLiters: Infinity,
      ratePerLiter: 40.10,
      totalAmount: 401.00,
      businessDate: yesterday,
      rateChartVersionId: verGridId,
    });
    assert.equal(infWeightResult.isValid, false);
    assert.equal(infWeightResult.errorCode, 'INVALID_FINANCIAL_VALUES');

    const negativeAmountResult = await RateService.validateHistoricalRate({
      organizationId: orgAlpha,
      milkCategory: 'COW',
      fat: 4.0,
      snf: 8.5,
      weightLiters: 10.0,
      ratePerLiter: 40.10,
      totalAmount: -401.00,
      businessDate: yesterday,
      rateChartVersionId: verGridId,
    });
    assert.equal(negativeAmountResult.isValid, false);
    assert.equal(negativeAmountResult.errorCode, 'INVALID_FINANCIAL_VALUES');
  });

  await suite.test('1c. BulkCollectionSync strictly rejects non-finite inputs and does not update ledger or session', async () => {
    const auth = offlineSessionAuthService.generateAuthorization({
      organizationId: orgAlpha,
      centerId: centerAlpha,
      sessionId: sessionClosedAlpha,
      sessionCode: 'SES-421-CLOSED',
      businessDate: yesterday,
      shift: 'MORNING',
      deviceIdentifier: 'STATION_COUNTER_1',
      operatorId: operatorAlpha,
      validFrom: `${yesterday}T06:00:00Z`,
      validUntil: `${yesterday}T12:00:00Z`,
    });

    const initialLedger = await db.query(
      `SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;`,
      [customerAlpha]
    );
    const balanceBefore = Number(initialLedger.rows[0]?.current_balance || 0);

    const invalidBatch = {
      batchId: crypto.randomUUID(),
      schemaVersion: 1,
      deviceId: 'STATION_COUNTER_1',
      offlineAuthorizationToken: auth.token,
      transactions: [
        {
          clientIntakeUuid: crypto.randomUUID(),
          idempotencyKey: `IDEM-INV-${crypto.randomUUID()}`,
          sessionId: sessionClosedAlpha,
          sessionCode: 'SES-421-CLOSED',
          customerId: customerAlpha,
          milkCategory: 'COW',
          weightLiters: NaN, // Invalid non-finite
          fatPercentage: 4.0,
          snfPercentage: 8.5,
          ratePerLiter: 40.10,
          totalAmount: 401.00,
          businessDate: yesterday,
          collectionTimestamp: `${yesterday}T07:15:00Z`,
          rateChartVersionId: verGridId,
          deviceId: 'STATION_COUNTER_1',
        },
      ],
    };

    const syncResult = await bulkUseCase.execute({
      organizationId: orgAlpha,
      operatorId: operatorAlpha,
      operatorName: 'Operator Alpha 4.2.1',
      authenticatedDeviceId: 'STATION_COUNTER_1',
      requestId: 'req-inv-financial',
      batch: invalidBatch,
    });
    assert.equal(syncResult.summary.accepted, 0);
    assert.equal(syncResult.summary.rejected, 1);
    assert.equal(syncResult.results[0].status, 'REJECTED');
    assert.equal(syncResult.results[0].errorCode, 'INVALID_FINANCIAL_VALUES');

    // Confirm no ledger updates occurred
    const finalLedger = await db.query(
      `SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;`,
      [customerAlpha]
    );
    const balanceAfter = Number(finalLedger.rows[0]?.current_balance || 0);
    assert.equal(balanceAfter, balanceBefore);
  });

  // ==========================================================================
  // SECTION 2: Rounding Implementation Consistency & Parity
  // ==========================================================================

  await suite.test('2. Boundary precision: half-paise midpoint, negative rounding and quantity x rate', async () => {
    // 31.505 -> 31.51
    assert.equal(roundHalfUp(31.505, 2), 31.51);
    // 31.504 -> 31.50
    assert.equal(roundHalfUp(31.504, 2), 31.50);
    // Immediately below half-paise boundary
    assert.equal(roundHalfUp(31.5049999999, 2), 31.50);
    // Immediately above half-paise boundary
    assert.equal(roundHalfUp(31.5050000001, 2), 31.51);
    // Negative values symmetric round away from zero
    assert.equal(roundHalfUp(-31.505, 2), -31.51);
    assert.equal(roundHalfUp(-31.504, 2), -31.50);
    // Large supported amounts
    assert.equal(roundHalfUp(99999999.995, 2), 100000000.00);
    assert.equal(roundHalfUp(99999999.994, 2), 99999999.99);
    // Small supported amounts
    assert.equal(roundHalfUp(0.005, 2), 0.01);
    assert.equal(roundHalfUp(0.004, 2), 0.00);
    // Quantity x rate calculation
    assert.equal(roundHalfUp(15.75 * 42.55, 2), 670.16);
    assert.equal(roundHalfUp(12.50 * 55.05, 2), 688.13);
  });

  // ==========================================================================
  // SECTION 3: FORMULA Model Parity (P1)
  // ==========================================================================

  await suite.test('3a. TWO_AXIS_FORMULA: Rate = baseRate + (Fat - baseFat)*fatFactor + (SNF - baseSnf)*snfFactor', async () => {
    // Base: 35.00, baseFat: 3.5, baseSnf: 8.5, fatFactor: 4.0, snfFactor: 3.0
    // Test Fat: 4.0, SNF: 9.0
    // 35.00 + (4.0 - 3.5)*4.0 + (9.0 - 8.5)*3.0 = 35.00 + 2.00 + 1.50 = 38.50
    const res = await RateService.validateHistoricalRate({
      organizationId: orgAlpha,
      milkCategory: 'COW',
      fat: 4.0,
      snf: 9.0,
      weightLiters: 10.0,
      ratePerLiter: 38.50,
      totalAmount: 385.00,
      businessDate: yesterday,
      rateChartVersionId: verTwoAxisId,
    });
    assert.equal(res.isValid, true);
    assert.equal(res.authoritativeRate, 38.50);
    assert.equal(res.authoritativeTotal, 385.00);
  });

  await suite.test('3b. TOTAL_SOLIDS_FORMULA: Rate = (Fat * fatFactor) + (SNF * snfFactor)', async () => {
    // fatFactor: 6.0, snfFactor: 3.5
    // Test Fat: 4.0, SNF: 8.5
    // (4.0 * 6.0) + (8.5 * 3.5) = 24.00 + 29.75 = 53.75
    const res = await RateService.validateHistoricalRate({
      organizationId: orgAlpha,
      milkCategory: 'COW',
      fat: 4.0,
      snf: 8.5,
      weightLiters: 10.0,
      ratePerLiter: 53.75,
      totalAmount: 537.50,
      businessDate: yesterday,
      rateChartVersionId: verTotalSolidsId,
    });
    assert.equal(res.isValid, true);
    assert.equal(res.authoritativeRate, 53.75);
    assert.equal(res.authoritativeTotal, 537.50);
  });

  await suite.test('3c. GRID: Configured cell passes; missing cell fails closed with RATE_CELL_NOT_FOUND', async () => {
    // Cell (4.0, 8.5) is present in DB at rate 40.10
    const passRes = await RateService.validateHistoricalRate({
      organizationId: orgAlpha,
      milkCategory: 'COW',
      fat: 4.0,
      snf: 8.5,
      weightLiters: 10.0,
      ratePerLiter: 40.10,
      totalAmount: 401.00,
      businessDate: yesterday,
      rateChartVersionId: verGridId,
    });
    assert.equal(passRes.isValid, true);
    assert.equal(passRes.authoritativeRate, 40.10);

    // Missing cell (4.8, 8.5) strictly fails closed
    const failRes = await RateService.validateHistoricalRate({
      organizationId: orgAlpha,
      milkCategory: 'COW',
      fat: 4.8,
      snf: 8.5,
      weightLiters: 10.0,
      ratePerLiter: 40.10,
      totalAmount: 401.00,
      businessDate: yesterday,
      rateChartVersionId: verGridId,
    });
    assert.equal(failRes.isValid, false);
    assert.equal(failRes.errorCode, 'RATE_CELL_NOT_FOUND');
  });

  await suite.test('3d. Unsupported pricing type strictly fails closed with UNSUPPORTED_PRICING_MODEL', async () => {
    const res = await RateService.validateHistoricalRate({
      organizationId: orgAlpha,
      milkCategory: 'COW',
      fat: 4.0,
      snf: 8.5,
      weightLiters: 10.0,
      ratePerLiter: 40.00,
      totalAmount: 400.00,
      businessDate: yesterday,
      rateChartVersionId: verUnsupportedId,
    });
    assert.equal(res.isValid, false);
    assert.equal(res.errorCode, 'UNSUPPORTED_PRICING_MODEL');
  });

  // ==========================================================================
  // SECTION 4: Dedicated Offline Lease Signing Key (P1)
  // ==========================================================================

  await suite.test('4a. Production startup enforcement: fails if OFFLINE_LEASE_SIGNING_KEY missing in production', async () => {
    const originalEnv = process.env['NODE_ENV'];
    const originalKey = process.env['OFFLINE_LEASE_SIGNING_KEY'];
    try {
      process.env['NODE_ENV'] = 'production';
      delete process.env['OFFLINE_LEASE_SIGNING_KEY'];

      assert.throws(() => {
        new OfflineSessionAuthorizationService({ activeKey: '' });
      }, /Production startup failed: Dedicated OFFLINE_LEASE_SIGNING_KEY must be configured/);
    } finally {
      process.env['NODE_ENV'] = originalEnv;
      if (originalKey) process.env['OFFLINE_LEASE_SIGNING_KEY'] = originalKey;
    }
  });

  await suite.test('4b. Token header contains kid and resolves active key', async () => {
    const service = new OfflineSessionAuthorizationService({
      activeKey: 'dedicated-test-signing-key-32chars!!',
      activeKeyId: 'k-prod-1',
    });

    const lease = service.generateAuthorization({
      organizationId: orgAlpha,
      centerId: centerAlpha,
      sessionId: sessionClosedAlpha,
      sessionCode: 'SES-421-CLOSED',
      businessDate: yesterday,
      shift: 'MORNING',
      deviceIdentifier: 'STATION_COUNTER_1',
      operatorId: operatorAlpha,
    });

    const [headerB64] = lease.token.split('.');
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
    assert.equal(header.kid, 'k-prod-1');
    assert.equal(header.alg, 'HS256');

    const verifyRes = service.verifyToken(lease.token);
    assert.equal(verifyRes.isValid, true);
    assert.equal(verifyRes.payload?.organizationId, orgAlpha);
  });

  await suite.test('4c. Key rotation: verifies unexpired leases signed with previous registered key and rejects retired key', async () => {
    const key1 = 'secret-rotation-key-1-at-least-32chars!';
    const key2 = 'secret-rotation-key-2-at-least-32chars!';
    const keyRetired = 'secret-rotation-retired-at-least-32ch!';

    // Service at Time 1 (active key: k1)
    const service1 = new OfflineSessionAuthorizationService({
      activeKey: key1,
      activeKeyId: 'k1',
    });
    const leaseTime1 = service1.generateAuthorization({
      organizationId: orgAlpha,
      centerId: centerAlpha,
      sessionId: sessionClosedAlpha,
      sessionCode: 'SES-421-CLOSED',
      businessDate: yesterday,
      shift: 'MORNING',
      deviceIdentifier: 'STATION_COUNTER_1',
      operatorId: operatorAlpha,
    });

    // Service at Time 2 (active key rotated to k2, k1 registered in previousKeys)
    const service2 = new OfflineSessionAuthorizationService({
      activeKey: key2,
      activeKeyId: 'k2',
      previousKeys: {
        k1: key1,
      },
    });

    // 1. Verify leaseTime1 (signed with k1) against service2 (has k1 in keyRing)
    const verifyTime1 = service2.verifyToken(leaseTime1.token);
    assert.equal(verifyTime1.isValid, true);

    // 2. New lease generated with service2 has kid 'k2'
    const leaseTime2 = service2.generateAuthorization({
      organizationId: orgAlpha,
      centerId: centerAlpha,
      sessionId: sessionClosedAlpha,
      sessionCode: 'SES-421-CLOSED',
      businessDate: yesterday,
      shift: 'MORNING',
      deviceIdentifier: 'STATION_COUNTER_1',
      operatorId: operatorAlpha,
    });
    const verifyTime2 = service2.verifyToken(leaseTime2.token);
    assert.equal(verifyTime2.isValid, true);

    // 3. Lease signed with retired / unknown key (kRetired) strictly rejected
    const serviceRetired = new OfflineSessionAuthorizationService({
      activeKey: keyRetired,
      activeKeyId: 'k-retired',
    });
    const leaseRetired = serviceRetired.generateAuthorization({
      organizationId: orgAlpha,
      centerId: centerAlpha,
      sessionId: sessionClosedAlpha,
      sessionCode: 'SES-421-CLOSED',
      businessDate: yesterday,
      shift: 'MORNING',
      deviceIdentifier: 'STATION_COUNTER_1',
      operatorId: operatorAlpha,
    });

    const verifyRetired = service2.verifyToken(leaseRetired.token);
    assert.equal(verifyRetired.isValid, false);
    assert.equal(verifyRetired.errorCode, 'OFFLINE_AUTHORIZATION_INVALID');
  });

  // ==========================================================================
  // SECTION 5: Server-Authenticated Station Identity at Sync Time (P0)
  // ==========================================================================

  await suite.test('5a. Missing authenticated station identity strictly rejected with OFFLINE_DEVICE_AUTH_REQUIRED', async () => {
    const auth = offlineSessionAuthService.generateAuthorization({
      organizationId: orgAlpha,
      centerId: centerAlpha,
      sessionId: sessionClosedAlpha,
      sessionCode: 'SES-421-CLOSED',
      businessDate: yesterday,
      shift: 'MORNING',
      deviceIdentifier: 'STATION_COUNTER_1',
      operatorId: operatorAlpha,
      validFrom: `${yesterday}T06:00:00Z`,
      validUntil: `${yesterday}T12:00:00Z`,
    });

    const sessionRow = {
      id: sessionClosedAlpha,
      sessionCode: 'SES-421-CLOSED',
      organizationId: orgAlpha,
      centerId: centerAlpha,
      businessDate: yesterday,
      deviceIdentifier: 'STATION_COUNTER_1',
    };

    const res = offlineSessionAuthService.validateSessionScope({
      token: auth.token,
      organizationId: orgAlpha,
      session: sessionRow,
      authenticatedDeviceId: undefined, // Missing server authentication
      deviceId: 'STATION_COUNTER_1',
    });

    assert.equal(res.isValid, false);
    assert.equal(res.errorCode, 'OFFLINE_DEVICE_AUTH_REQUIRED');
  });

  await suite.test('5b. Copied lease from STATION_COUNTER_1 submitted by STATION_COUNTER_2 rejected with OFFLINE_DEVICE_MISMATCH', async () => {
    const auth = offlineSessionAuthService.generateAuthorization({
      organizationId: orgAlpha,
      centerId: centerAlpha,
      sessionId: sessionClosedAlpha,
      sessionCode: 'SES-421-CLOSED',
      businessDate: yesterday,
      shift: 'MORNING',
      deviceIdentifier: 'STATION_COUNTER_1',
      operatorId: operatorAlpha,
      validFrom: `${yesterday}T06:00:00Z`,
      validUntil: `${yesterday}T12:00:00Z`,
    });

    const sessionRow = {
      id: sessionClosedAlpha,
      sessionCode: 'SES-421-CLOSED',
      organizationId: orgAlpha,
      centerId: centerAlpha,
      businessDate: yesterday,
      deviceIdentifier: 'STATION_COUNTER_1',
    };

    // Rogue / different station submits copied lease
    const res = offlineSessionAuthService.validateSessionScope({
      token: auth.token,
      organizationId: orgAlpha,
      session: sessionRow,
      authenticatedDeviceId: 'STATION_COUNTER_2', // Authenticated station is 2, not 1
      deviceId: 'STATION_COUNTER_1',
    });

    assert.equal(res.isValid, false);
    assert.equal(res.errorCode, 'OFFLINE_DEVICE_MISMATCH');
  });

  await suite.test('5c. Client DTO deviceId mismatch against authenticated identity rejected with OFFLINE_DEVICE_MISMATCH', async () => {
    const auth = offlineSessionAuthService.generateAuthorization({
      organizationId: orgAlpha,
      centerId: centerAlpha,
      sessionId: sessionClosedAlpha,
      sessionCode: 'SES-421-CLOSED',
      businessDate: yesterday,
      shift: 'MORNING',
      deviceIdentifier: 'STATION_COUNTER_1',
      operatorId: operatorAlpha,
      validFrom: `${yesterday}T06:00:00Z`,
      validUntil: `${yesterday}T12:00:00Z`,
    });

    const sessionRow = {
      id: sessionClosedAlpha,
      sessionCode: 'SES-421-CLOSED',
      organizationId: orgAlpha,
      centerId: centerAlpha,
      businessDate: yesterday,
      deviceIdentifier: 'STATION_COUNTER_1',
    };

    const res = offlineSessionAuthService.validateSessionScope({
      token: auth.token,
      organizationId: orgAlpha,
      session: sessionRow,
      authenticatedDeviceId: 'STATION_COUNTER_1',
      deviceId: 'STATION_COUNTER_FAKE', // Client claims a different device
    });

    assert.equal(res.isValid, false);
    assert.equal(res.errorCode, 'OFFLINE_DEVICE_MISMATCH');
  });

  await suite.test('5d. Cross-center lease replay rejected with OFFLINE_CENTER_MISMATCH', async () => {
    const auth = offlineSessionAuthService.generateAuthorization({
      organizationId: orgAlpha,
      centerId: centerAlpha,
      sessionId: sessionClosedAlpha,
      sessionCode: 'SES-421-CLOSED',
      businessDate: yesterday,
      shift: 'MORNING',
      deviceIdentifier: 'STATION_COUNTER_1',
      operatorId: operatorAlpha,
      validFrom: `${yesterday}T06:00:00Z`,
      validUntil: `${yesterday}T12:00:00Z`,
    });

    const sessionRowCenterBeta = {
      id: sessionClosedAlpha,
      sessionCode: 'SES-421-CLOSED',
      organizationId: orgAlpha,
      centerId: centerBeta, // Different Center
      businessDate: yesterday,
      deviceIdentifier: 'STATION_COUNTER_1',
    };

    const res = offlineSessionAuthService.validateSessionScope({
      token: auth.token,
      organizationId: orgAlpha,
      session: sessionRowCenterBeta,
      authenticatedDeviceId: 'STATION_COUNTER_1',
      deviceId: 'STATION_COUNTER_1',
    });

    assert.equal(res.isValid, false);
    assert.equal(res.errorCode, 'OFFLINE_CENTER_MISMATCH');
  });

  await suite.test('5e. Full PostgreSQL Bulk Intake with matching authenticated station identity succeeds atomically', async () => {
    const auth = offlineSessionAuthService.generateAuthorization({
      organizationId: orgAlpha,
      centerId: centerAlpha,
      sessionId: sessionClosedAlpha,
      sessionCode: 'SES-421-CLOSED',
      businessDate: yesterday,
      shift: 'MORNING',
      deviceIdentifier: 'STATION_COUNTER_1',
      operatorId: operatorAlpha,
      validFrom: `${yesterday}T06:00:00Z`,
      validUntil: `${yesterday}T12:00:00Z`,
    });

    const validBatch = {
      batchId: crypto.randomUUID(),
      schemaVersion: 1,
      deviceId: 'STATION_COUNTER_1',
      offlineAuthorizationToken: auth.token,
      transactions: [
        {
          clientIntakeUuid: crypto.randomUUID(),
          idempotencyKey: `IDEM-421-OK-${crypto.randomUUID()}`,
          sessionId: sessionClosedAlpha,
          sessionCode: 'SES-421-CLOSED',
          customerId: customerAlpha,
          milkCategory: 'COW',
          weightLiters: 15.75,
          fatPercentage: 4.0,
          snfPercentage: 8.5,
          ratePerLiter: 40.10,
          totalAmount: 631.58, // 15.75 * 40.10 = 631.575 -> 631.58
          businessDate: yesterday,
          collectionTimestamp: `${yesterday}T07:30:00Z`,
          rateChartVersionId: verGridId,
          deviceId: 'STATION_COUNTER_1',
        },
      ],
    };

    const syncResult = await bulkUseCase.execute({
      organizationId: orgAlpha,
      operatorId: operatorAlpha,
      operatorName: 'Operator Alpha 4.2.1',
      authenticatedDeviceId: 'STATION_COUNTER_1',
      requestId: 'req-valid-sync',
      batch: validBatch,
    });
    if (syncResult.summary.accepted !== 1) {
      console.log('5e RESULT FAILED:', JSON.stringify(syncResult.results[0], null, 2));
    }
    assert.equal(syncResult.summary.accepted, 1);
    assert.equal(syncResult.summary.rejected, 0);
    assert.equal(syncResult.results[0].status, 'ACCEPTED');
    assert.ok(syncResult.results[0].serverTransactionId);

    // Clean exit
    setTimeout(() => process.exit(0), 200);
  });
});
