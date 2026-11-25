import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../dist/app.js';
import { db } from '../dist/infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../dist/infrastructure/database/TenantDatabaseManager.js';
import { HmacJwtTokenService } from '../dist/infrastructure/security/HmacJwtTokenService.js';
import { PostgresCollectionTransactionRepository } from '../dist/infrastructure/repositories/PostgresCollectionTransactionRepository.js';
import { PostgresCustomerRepository } from '../dist/infrastructure/repositories/PostgresCustomerRepository.js';
import { PostgresShiftSessionRepository } from '../dist/infrastructure/repositories/PostgresShiftSessionRepository.js';
import { BulkCollectionSyncUseCase } from '../dist/application/use-cases/collections/BulkCollectionSyncUseCase.js';
import { RateService } from '../dist/modules/rates/rate.service.js';
import { roundHalfUp } from '../dist/domain/services/FinancialPolicyResolutionService.js';
import { offlineSessionAuthService } from '../dist/infrastructure/security/OfflineSessionAuthorizationService.js';

const app = createApp();
const tokenService = new HmacJwtTokenService();

test('PROMPT 4.1: Security, Offline Closed Session Authorization & Financial Accuracy Audit Suite', async (suite) => {
  const isConnected = await db.checkConnection();
  if (!isConnected) {
    console.log('[PROMPT 4.1 TEST] Real PostgreSQL connection is unavailable. Suite skipped.');
    suite.skip('Real PostgreSQL environment unavailable');
    return;
  }

  // Tenant Fixture Identifiers
  const orgAlpha = '00000000-0000-0000-0000-0000000041a1';
  const orgBeta = '00000000-0000-0000-0000-0000000041b2';
  const centerAlpha = '00000000-0000-0000-0000-0000000041c1';
  const centerBeta = '00000000-0000-0000-0000-0000000041c2';
  const operatorAlpha = '00000000-0000-0000-0000-0000000041d1';
  const operatorBeta = '00000000-0000-0000-0000-0000000041d2';
  const customerAlpha = '00000000-0000-0000-0000-0000000041e1';
  const customerBeta = '00000000-0000-0000-0000-0000000041e2';
  const sessionAlphaOpen = '00000000-0000-0000-0000-0000000041f1';
  const sessionAlphaClosed = '00000000-0000-0000-0000-0000000041f2';
  const sessionBetaOpen = '00000000-0000-0000-0000-0000000041f3';

  const chartCowAlpha = '00000000-0000-0000-0000-000000004101';
  const verCowAlpha1 = '00000000-0000-0000-0000-000000004111';
  const chartCowBeta = '00000000-0000-0000-0000-000000004102'; // FORMULA chart
  const verCowBeta1 = '00000000-0000-0000-0000-000000004112';

  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  // Auth Tokens
  const tokenAlpha = tokenService.signToken({
    userId: operatorAlpha,
    organizationId: orgAlpha,
    role: 'COLLECTION_OPERATOR',
    actorType: 'STAFF',
    centerId: centerAlpha,
  });

  const tokenBeta = tokenService.signToken({
    userId: operatorBeta,
    organizationId: orgBeta,
    role: 'COLLECTION_OPERATOR',
    actorType: 'STAFF',
    centerId: centerBeta,
  });

  const customerRepo = new PostgresCustomerRepository();
  const sessionRepo = new PostgresShiftSessionRepository();
  const transactionRepo = new PostgresCollectionTransactionRepository();
  const bulkUseCase = new BulkCollectionSyncUseCase(customerRepo, sessionRepo, transactionRepo);

  // Setup / Seed Helper
  const seedAuditEnvironment = async () => {
    const clients = [db];
    try {
      const alphaDb = await tenantDbManager.getTenantDb(orgAlpha);
      if (alphaDb !== db) clients.push(alphaDb);
    } catch {}
    try {
      const betaDb = await tenantDbManager.getTenantDb(orgBeta);
      if (betaDb !== db && !clients.includes(betaDb)) clients.push(betaDb);
    } catch {}

    const codeSuffix = Date.now().toString(36).slice(-5);

    for (const client of clients) {
      // 1. Ensure schema columns & indexes
      await client.query(`
        ALTER TABLE milk_collections
        ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;

        ALTER TABLE milk_collections DROP CONSTRAINT IF EXISTS milk_collections_idempotency_key_key;

        CREATE UNIQUE INDEX IF NOT EXISTS uq_milk_collections_org_idempotency
        ON milk_collections (organization_id, idempotency_key);
      `);

      // 2. Organizations
      await client.query(`
        INSERT INTO organizations (id, name, code, status)
        VALUES 
          ('${orgAlpha}', 'Audit Alpha Cooperative', 'AA_${codeSuffix}', 'ACTIVE'),
          ('${orgBeta}', 'Audit Beta Cooperative', 'AB_${codeSuffix}', 'ACTIVE')
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE';
      `);

      // 3. Dairy Centers
      await client.query(`
        INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status, timezone)
        VALUES 
          ('${centerAlpha}', '${orgAlpha}', 'CA_${codeSuffix}', 'Audit Alpha Center', 'Center Rd', 'VillageAlpha', 'District', 'State', '416001', '+919876543210', 'ACTIVE', 'Asia/Kolkata'),
          ('${centerBeta}', '${orgBeta}', 'CB_${codeSuffix}', 'Audit Beta Center', 'Center Rd', 'VillageBeta', 'District', 'State', '416002', '+919876543211', 'ACTIVE', 'Asia/Kolkata')
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE';
      `);

      // 4. Users (Operators)
      await client.query(`
        INSERT INTO users (id, organization_id, username, phone_number, full_name, role, status)
        VALUES 
          ('${operatorAlpha}', '${orgAlpha}', 'op_aud_a_${codeSuffix}', '+919822991101', 'Operator Audit Alpha', 'COLLECTION_OPERATOR', 'ACTIVE'),
          ('${operatorBeta}', '${orgBeta}', 'op_aud_b_${codeSuffix}', '+919822991102', 'Operator Audit Beta', 'COLLECTION_OPERATOR', 'ACTIVE')
        ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', username = EXCLUDED.username;
      `);

      // 5. Customers
      await client.query(`
        INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status)
        VALUES 
          ('${customerAlpha}', '${orgAlpha}', '${centerAlpha}', 'F-AA01', 'Farmer Alpha Audit', '+919822770001', 'ACTIVE', 'APPROVED'),
          ('${customerBeta}', '${orgBeta}', '${centerBeta}', 'F-BB01', 'Farmer Beta Audit', '+919822770002', 'ACTIVE', 'APPROVED')
        ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE';

        INSERT INTO customer_milk_categories (customer_id, milk_category, authorized_by)
        VALUES 
          ('${customerAlpha}', 'COW', '${operatorAlpha}'),
          ('${customerBeta}', 'COW', '${operatorBeta}')
        ON CONFLICT (customer_id, milk_category) DO NOTHING;

        INSERT INTO customer_ledger_accounts (id, customer_id, organization_id, current_balance, currency)
        VALUES 
          (gen_random_uuid(), '${customerAlpha}', '${orgAlpha}', 0.00, 'INR'),
          (gen_random_uuid(), '${customerBeta}', '${orgBeta}', 0.00, 'INR')
        ON CONFLICT DO NOTHING;
      `);

      // 6. Shift Sessions: Open session and Legitimate Closed session
      const yesterdayOpen = `${yesterday}T06:00:00Z`;
      const yesterdayClose = `${yesterday}T09:30:00Z`;

      await client.query(`
        INSERT INTO kiosk_shift_sessions (id, session_code, organization_id, center_id, business_date, shift, status, opened_at, closed_at, opening_operator_id, device_identifier, total_liters, total_amount, transaction_count)
        VALUES 
          ('${sessionAlphaOpen}', 'SES-AUD-OPEN', '${orgAlpha}', '${centerAlpha}', '${today}', 'MORNING', 'OPEN', NOW(), NULL, '${operatorAlpha}', 'KIOSK_AUDIT_A', 0, 0, 0),
          ('${sessionAlphaClosed}', 'SES-AUD-CLOSED', '${orgAlpha}', '${centerAlpha}', '${yesterday}', 'MORNING', 'CLOSED', '${yesterdayOpen}'::timestamptz, '${yesterdayClose}'::timestamptz, '${operatorAlpha}', 'KIOSK_AUDIT_A', 100, 4000, 10),
          ('${sessionBetaOpen}', 'SES-AUD-BETA', '${orgBeta}', '${centerBeta}', '${today}', 'MORNING', 'OPEN', NOW(), NULL, '${operatorBeta}', 'KIOSK_AUDIT_B', 0, 0, 0)
        ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, business_date = EXCLUDED.business_date, closed_at = EXCLUDED.closed_at, opened_at = EXCLUDED.opened_at;
      `);

      // 7. Rate Charts: Alpha has GRID, Beta has FORMULA
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

        INSERT INTO rate_charts (id, organization_id, center_id, name, milk_category, pricing_type, is_active)
        VALUES 
          ('${chartCowAlpha}', '${orgAlpha}', NULL, 'Alpha Audit Cow GRID Chart', 'COW', 'GRID', TRUE),
          ('${chartCowBeta}', '${orgBeta}', NULL, 'Beta Audit Cow FORMULA Chart', 'COW', 'TWO_AXIS_FORMULA', TRUE)
        ON CONFLICT (id) DO UPDATE SET is_active = TRUE, pricing_type = EXCLUDED.pricing_type;

        -- Reset to DRAFT first to bypass trigger immutability if re-running
        INSERT INTO rate_chart_versions (id, rate_chart_id, version_number, status, pricing_unit, measurement_unit, base_fat, base_snf, base_rate, fat_min, fat_max, snf_min, snf_max, formula_definition, effective_from, effective_to, is_approved)
        VALUES 
          ('${verCowAlpha1}', '${chartCowAlpha}', 1, 'DRAFT', 'PER_KG', 'KG', 3.5, 8.5, 38.0, 2.5, 6.0, 7.5, 10.0, NULL, '${yesterday} 00:00:00Z', NULL, TRUE),
          ('${verCowBeta1}', '${chartCowBeta}', 1, 'DRAFT', 'PER_KG', 'KG', 4.0, 8.5, 42.0, 2.5, 6.0, 7.5, 10.0, '{"fatFactor": 4.5, "snfFactor": 3.5}', '${yesterday} 00:00:00Z', NULL, TRUE)
        ON CONFLICT (id) DO UPDATE SET status = 'DRAFT', is_approved = TRUE, effective_from = EXCLUDED.effective_from, formula_definition = EXCLUDED.formula_definition;

        -- Seed exact GRID cells for verCowAlpha1
        INSERT INTO rate_chart_cells (rate_chart_version_id, fat_percentage, snf_percentage, rate_per_unit)
        VALUES 
          ('${verCowAlpha1}', 3.5, 8.5, 38.00),
          ('${verCowAlpha1}', 4.0, 8.5, 40.10),
          ('${verCowAlpha1}', 4.2, 8.5, 40.94),
          ('${verCowAlpha1}', 4.5, 8.5, 42.20)
        ON CONFLICT DO NOTHING;

        UPDATE rate_chart_versions SET status = 'PUBLISHED' WHERE id IN ('${verCowAlpha1}', '${verCowBeta1}');
      `);
    }
  };

  await seedAuditEnvironment();

  // --------------------------------------------------------------------------
  // Subtest 1: Route Security & Auth Boundary Hardening (401/403)
  // --------------------------------------------------------------------------
  await suite.test('1. Security Hardening: All sync and bulk routes strictly reject unauthenticated or cross-tenant access', async () => {
    // 1a. Missing Auth Token -> HTTP 401
    const unauthBulk1 = await request(app).post('/api/v1/collections/sync/bulk').send({ transactions: [] });
    assert.strictEqual(unauthBulk1.status, 401, 'POST /api/v1/collections/sync/bulk must reject unauthenticated requests');

    const unauthBulk2 = await request(app).post('/api/v1/collections/bulk').send({ transactions: [] });
    assert.strictEqual(unauthBulk2.status, 401, 'POST /api/v1/collections/bulk must reject unauthenticated requests');

    const unauthSyncBulk = await request(app).post('/api/v1/sync/bulk').send({ transactions: [] });
    assert.strictEqual(unauthSyncBulk.status, 401, 'POST /api/v1/sync/bulk must reject unauthenticated requests');

    const unauthSyncTxn = await request(app).post('/api/v1/sync/transactions').send({ transactions: [] });
    assert.strictEqual(unauthSyncTxn.status, 401, 'POST /api/v1/sync/transactions must reject unauthenticated requests');

    // 1b. Cross-Tenant Spoofing in Header -> HTTP 403
    const crossTenantHeader = await request(app)
      .post('/api/v1/collections/sync/bulk')
      .set('Authorization', `Bearer ${tokenAlpha}`)
      .set('x-organization-id', orgBeta)
      .send({ batchId: 'batch-test-cross', transactions: [] });
    assert.strictEqual(crossTenantHeader.status, 403, 'Cross-tenant x-organization-id mismatch must return 403 Forbidden');

    // 1c. Cross-Tenant Spoofing in Body -> HTTP 403
    const crossTenantBody = await request(app)
      .post('/api/v1/collections/sync/bulk')
      .set('Authorization', `Bearer ${tokenAlpha}`)
      .send({ organizationId: orgBeta, batchId: 'batch-test-cross-body', transactions: [] });
    assert.strictEqual(crossTenantBody.status, 403, 'Cross-tenant body.organizationId mismatch must return 403 Forbidden');

    // 1d. Rate Sync Cross-Tenant Block -> HTTP 403
    const crossTenantRateSync = await request(app)
      .get('/api/v1/rates/sync')
      .set('Authorization', `Bearer ${tokenAlpha}`)
      .set('x-organization-id', orgBeta);
    assert.strictEqual(crossTenantRateSync.status, 403, 'Cross-tenant rate sync must return 403 Forbidden');
  });

  // --------------------------------------------------------------------------
  // Subtest 2: Idempotency Key Payload Integrity (Exact Replay vs Conflicting Payload)
  // --------------------------------------------------------------------------
  await suite.test('2. Idempotency Payload Integrity: Exact replay returns canonical; Conflicting payload is rejected', async () => {
    const canonicalKey = `IDEM-AUDIT-${Date.now()}`;
    const initialIntakeUuid = crypto.randomUUID();

    // Initial valid collection
    const initialBatch = {
      batchId: crypto.randomUUID(),
      schemaVersion: 1,
      deviceId: 'KIOSK_AUDIT_A',
      transactions: [
        {
          clientIntakeUuid: initialIntakeUuid,
          idempotencyKey: canonicalKey,
          customerId: customerAlpha,
          sessionId: sessionAlphaOpen,
          milkCategory: 'COW',
          weightLiters: 10.0,
          fatPercentage: 4.0,
          snfPercentage: 8.5,
          ratePerLiter: 40.10,
          totalAmount: 401.00,
          businessDate: today,
        },
      ],
    };

    const initialRes = await bulkUseCase.execute({
      organizationId: orgAlpha,
      operatorId: operatorAlpha,
      operatorName: 'Operator Audit Alpha',
      requestId: 'req-aud-1',
      batch: initialBatch,
    });

    assert.strictEqual(initialRes.summary.accepted, 1);
    assert.strictEqual(initialRes.results[0].status, 'ACCEPTED');
    assert.strictEqual(initialRes.results[0].isIdempotentReplay, false);
    const serverTxnId = initialRes.results[0].serverTransactionId;
    const receiptNum = initialRes.results[0].receiptNumber;

    // Check ledger credit after initial intake
    let targetDb;
    try {
      targetDb = await tenantDbManager.getTenantDb(orgAlpha);
    } catch {
      targetDb = db;
    }

    const ledgerAfter1 = await targetDb.query(
      `SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1 AND organization_id = $2`,
      [customerAlpha, orgAlpha]
    );
    const balance1 = parseFloat(ledgerAfter1.rows[0].current_balance);
    assert.ok(balance1 >= 401.00, 'Customer ledger balance should have received 401.00 INR credit');

    // Exact Replay: Resubmit IDENTICAL transaction
    const replayBatch = {
      batchId: crypto.randomUUID(),
      schemaVersion: 1,
      deviceId: 'KIOSK_AUDIT_A',
      transactions: [
        {
          clientIntakeUuid: initialIntakeUuid,
          idempotencyKey: canonicalKey,
          customerId: customerAlpha,
          sessionId: sessionAlphaOpen,
          milkCategory: 'COW',
          weightLiters: 10.0,
          fatPercentage: 4.0,
          snfPercentage: 8.5,
          ratePerLiter: 40.10,
          totalAmount: 401.00,
          businessDate: today,
        },
      ],
    };

    const replayRes = await bulkUseCase.execute({
      organizationId: orgAlpha,
      operatorId: operatorAlpha,
      operatorName: 'Operator Audit Alpha',
      requestId: 'req-aud-2',
      batch: replayBatch,
    });

    assert.strictEqual(replayRes.summary.replayed, 1);
    assert.strictEqual(replayRes.results[0].status, 'REPLAYED');
    assert.strictEqual(replayRes.results[0].isIdempotentReplay, true);
    assert.strictEqual(replayRes.results[0].serverTransactionId, serverTxnId);
    assert.strictEqual(replayRes.results[0].receiptNumber, receiptNum);

    // Verify ZERO additional ledger credit and ZERO double count
    const ledgerAfter2 = await targetDb.query(
      `SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1 AND organization_id = $2`,
      [customerAlpha, orgAlpha]
    );
    const balance2 = parseFloat(ledgerAfter2.rows[0].current_balance);
    assert.strictEqual(balance2, balance1, 'Ledger balance must NOT increment on idempotent replay');

    // Conflicting Payload Attack: Reusing canonicalKey with DIFFERENT weight (25.0 L instead of 10.0 L)
    const conflictBatch = {
      batchId: crypto.randomUUID(),
      schemaVersion: 1,
      deviceId: 'KIOSK_AUDIT_A',
      transactions: [
        {
          clientIntakeUuid: crypto.randomUUID(),
          idempotencyKey: canonicalKey,
          customerId: customerAlpha,
          sessionId: sessionAlphaOpen,
          milkCategory: 'COW',
          weightLiters: 25.0, // Conflicting parameter!
          fatPercentage: 4.0,
          snfPercentage: 8.5,
          ratePerLiter: 40.10,
          totalAmount: 1002.50,
          businessDate: today,
        },
      ],
    };

    const conflictRes = await bulkUseCase.execute({
      organizationId: orgAlpha,
      operatorId: operatorAlpha,
      operatorName: 'Operator Audit Alpha',
      requestId: 'req-aud-3',
      batch: conflictBatch,
    });

    assert.strictEqual(conflictRes.summary.rejected, 1, 'Conflicting payload must be rejected');
    assert.strictEqual(conflictRes.results[0].status, 'REJECTED');
    assert.strictEqual(conflictRes.results[0].errorCode, 'IDEMPOTENCY_PAYLOAD_MISMATCH');
    assert.ok(
      conflictRes.results[0].errorMessage.includes('IDEMPOTENCY_PAYLOAD_MISMATCH') ||
      conflictRes.results[0].errorMessage.includes('different transaction payload')
    );

    // Verify database row still contains canonical 10.0 L and not 25.0 L
    const txnCheck = await targetDb.query(
      `SELECT net_weight, total_amount FROM milk_collections WHERE idempotency_key = $1 AND organization_id = $2`,
      [canonicalKey, orgAlpha]
    );
    assert.strictEqual(txnCheck.rows.length, 1);
    assert.strictEqual(parseFloat(txnCheck.rows[0].net_weight), 10.0, 'Canonical row must not be overwritten');
    assert.strictEqual(parseFloat(txnCheck.rows[0].total_amount), 401.00);
  });

  // --------------------------------------------------------------------------
  // Subtest 3: In-Batch Duplicate Item Protection
  // --------------------------------------------------------------------------
  await suite.test('3. In-Batch Duplicates: Identical in-batch item is replayed; Conflicting in-batch item is rejected', async () => {
    const dupKeyIdentical = `BATCH-DUP-SAME-${Date.now()}`;
    const dupKeyConflict = `BATCH-DUP-DIFF-${Date.now()}`;

    const batch = {
      batchId: crypto.randomUUID(),
      schemaVersion: 1,
      deviceId: 'KIOSK_AUDIT_A',
      transactions: [
        // Pair 1: Identical duplicate items in same batch
        {
          clientIntakeUuid: crypto.randomUUID(),
          idempotencyKey: dupKeyIdentical,
          customerId: customerAlpha,
          sessionId: sessionAlphaOpen,
          milkCategory: 'COW',
          weightLiters: 5.0,
          fatPercentage: 4.0,
          snfPercentage: 8.5,
          ratePerLiter: 40.10,
          totalAmount: 200.50,
          businessDate: today,
        },
        {
          clientIntakeUuid: crypto.randomUUID(),
          idempotencyKey: dupKeyIdentical,
          customerId: customerAlpha,
          sessionId: sessionAlphaOpen,
          milkCategory: 'COW',
          weightLiters: 5.0, // Identical
          fatPercentage: 4.0,
          snfPercentage: 8.5,
          ratePerLiter: 40.10,
          totalAmount: 200.50,
          businessDate: today,
        },
        // Pair 2: Conflicting duplicate items in same batch
        {
          clientIntakeUuid: crypto.randomUUID(),
          idempotencyKey: dupKeyConflict,
          customerId: customerAlpha,
          sessionId: sessionAlphaOpen,
          milkCategory: 'COW',
          weightLiters: 8.0,
          fatPercentage: 4.0,
          snfPercentage: 8.5,
          ratePerLiter: 40.10,
          totalAmount: 320.80,
          businessDate: today,
        },
        {
          clientIntakeUuid: crypto.randomUUID(),
          idempotencyKey: dupKeyConflict,
          customerId: customerAlpha,
          sessionId: sessionAlphaOpen,
          milkCategory: 'COW',
          weightLiters: 12.0, // Conflicting weight!
          fatPercentage: 4.0,
          snfPercentage: 8.5,
          ratePerLiter: 40.10,
          totalAmount: 481.20,
          businessDate: today,
        },
      ],
    };

    const res = await bulkUseCase.execute({
      organizationId: orgAlpha,
      operatorId: operatorAlpha,
      operatorName: 'Operator Audit Alpha',
      requestId: 'req-aud-batch-dup',
      batch,
    });

    assert.strictEqual(res.summary.accepted, 2, 'Two first-occurrence items should be accepted');
    assert.strictEqual(res.summary.replayed, 1, 'Identical in-batch duplicate should be replayed');
    assert.strictEqual(res.summary.rejected, 1, 'Conflicting in-batch duplicate should be rejected');

    assert.strictEqual(res.results[0].status, 'ACCEPTED');
    assert.strictEqual(res.results[1].status, 'REPLAYED');
    assert.strictEqual(res.results[1].isIdempotentReplay, true);
    assert.strictEqual(res.results[2].status, 'ACCEPTED');
    assert.strictEqual(res.results[3].status, 'REJECTED');
    assert.strictEqual(res.results[3].errorCode, 'IDEMPOTENCY_PAYLOAD_MISMATCH');
  });

  // --------------------------------------------------------------------------
  // Subtest 4: Closed-Session Offline Authorization
  // --------------------------------------------------------------------------
  await suite.test('4. Closed Session Authorization: Legitimate shift window accepted; Temporal or device violations rejected', async () => {
    const validClosedAuth = offlineSessionAuthService.generateAuthorization({
      organizationId: orgAlpha,
      centerId: centerAlpha,
      sessionId: sessionAlphaClosed,
      sessionCode: 'SES-AUD-CLOSED',
      businessDate: yesterday,
      shift: 'MORNING',
      deviceIdentifier: 'KIOSK_AUDIT_A',
      operatorId: operatorAlpha,
      timezone: 'Asia/Kolkata',
      validFrom: `${yesterday}T06:00:00Z`,
      validUntil: `${yesterday}T12:00:00Z`,
    });

    // 4a. Legitimate Offline Closed Session with valid server-issued authorization
    const legitimateClosedBatch = {
      batchId: crypto.randomUUID(),
      schemaVersion: 1,
      deviceId: 'KIOSK_AUDIT_A',
      offlineAuthorizationToken: validClosedAuth.token,
      transactions: [
        {
          clientIntakeUuid: crypto.randomUUID(),
          idempotencyKey: `CLOSED-LEGIT-${Date.now()}`,
          customerId: customerAlpha,
          sessionId: sessionAlphaClosed,
          milkCategory: 'COW',
          weightLiters: 10.0,
          fatPercentage: 4.0,
          snfPercentage: 8.5,
          ratePerLiter: 40.10,
          totalAmount: 401.00,
          businessDate: yesterday,
          collectionTimestamp: `${yesterday}T07:30:00Z`, // Between opened (06:00) and closed (09:30)
          deviceId: 'KIOSK_AUDIT_A',
        },
      ],
    };

    const legitRes = await bulkUseCase.execute({
      organizationId: orgAlpha,
      operatorId: operatorAlpha,
      operatorName: 'Operator Audit Alpha',
      requestId: 'req-aud-closed-1',
      batch: legitimateClosedBatch,
    });

    assert.strictEqual(legitRes.summary.accepted, 1, 'Legitimate closed session offline intake must be accepted');
    assert.strictEqual(legitRes.results[0].status, 'ACCEPTED');

    // 4b. Temporal Violation: Timestamp far outside session operational window
    const invalidTimeBatch = {
      batchId: crypto.randomUUID(),
      schemaVersion: 1,
      deviceId: 'KIOSK_AUDIT_A',
      offlineAuthorizationToken: validClosedAuth.token,
      transactions: [
        {
          clientIntakeUuid: crypto.randomUUID(),
          idempotencyKey: `CLOSED-BADTIME-${Date.now()}`,
          customerId: customerAlpha,
          sessionId: sessionAlphaClosed,
          milkCategory: 'COW',
          weightLiters: 10.0,
          fatPercentage: 4.0,
          snfPercentage: 8.5,
          ratePerLiter: 40.10,
          totalAmount: 401.00,
          businessDate: yesterday,
          collectionTimestamp: `${yesterday}T16:00:00Z`, // 6.5 hours after session closed (09:30)
          deviceId: 'KIOSK_AUDIT_A',
        },
      ],
    };

    const badTimeRes = await bulkUseCase.execute({
      organizationId: orgAlpha,
      operatorId: operatorAlpha,
      operatorName: 'Operator Audit Alpha',
      requestId: 'req-aud-closed-2',
      batch: invalidTimeBatch,
    });

    assert.strictEqual(badTimeRes.summary.rejected, 1);
    assert.strictEqual(badTimeRes.results[0].status, 'REJECTED');
    assert.strictEqual(badTimeRes.results[0].errorCode, 'OFFLINE_AUTHORIZATION_EXPIRED');

    // 4c. Device Mismatch: Submitted device does not match session deviceIdentifier
    const deviceMismatchBatch = {
      batchId: crypto.randomUUID(),
      schemaVersion: 1,
      deviceId: 'ROGUE_DEVICE_99',
      offlineAuthorizationToken: validClosedAuth.token,
      transactions: [
        {
          clientIntakeUuid: crypto.randomUUID(),
          idempotencyKey: `CLOSED-DEV-MISMATCH-${Date.now()}`,
          customerId: customerAlpha,
          sessionId: sessionAlphaClosed,
          milkCategory: 'COW',
          weightLiters: 10.0,
          fatPercentage: 4.0,
          snfPercentage: 8.5,
          ratePerLiter: 40.10,
          totalAmount: 401.00,
          businessDate: yesterday,
          collectionTimestamp: `${yesterday}T07:30:00Z`,
          deviceId: 'ROGUE_DEVICE_99',
        },
      ],
    };

    const badDevRes = await bulkUseCase.execute({
      organizationId: orgAlpha,
      operatorId: operatorAlpha,
      operatorName: 'Operator Audit Alpha',
      requestId: 'req-aud-closed-3',
      batch: deviceMismatchBatch,
    });

    assert.strictEqual(badDevRes.summary.rejected, 1);
    assert.strictEqual(badDevRes.results[0].status, 'REJECTED');
    assert.strictEqual(badDevRes.results[0].errorCode, 'OFFLINE_DEVICE_MISMATCH');
  });

  // --------------------------------------------------------------------------
  // Subtest 5: Financial Precision & Standard Commercial Half-Up Rounding
  // --------------------------------------------------------------------------
  await suite.test('5. Financial Precision: Exact half-up rounding (ROUND_HALF_UP) eliminates floating point drift', () => {
    // 5a. Borderline half-up tests
    assert.strictEqual(roundHalfUp(10.55 * 40.15, 2), 423.58); // 423.5825 -> 423.58
    assert.strictEqual(roundHalfUp(12.345 * 45.67, 2), 563.80); // 563.79615 -> 563.80
    assert.strictEqual(roundHalfUp(10.005, 2), 10.01);         // standard half-up at midpoint
    assert.strictEqual(roundHalfUp(10.004, 2), 10.00);

    // 5b. Verify rate calculation in RateService matches roundHalfUp
    const rateVal = RateService.validateHistoricalRate({
      organizationId: orgAlpha,
      milkCategory: 'COW',
      fat: 4.0,
      snf: 8.5,
      weightLiters: 10.55,
      ratePerLiter: 40.10,
      totalAmount: roundHalfUp(10.55 * 40.10, 2),
      businessDate: today,
      rateChartVersionId: verCowAlpha1,
    });

    return rateVal.then((res) => {
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.authoritativeRate, 40.10);
      assert.strictEqual(res.authoritativeTotal, 423.06); // 10.55 * 40.10 = 423.055 -> 423.06
    });
  });

  // --------------------------------------------------------------------------
  // Subtest 6: FORMULA Rate Chart Sync Delivery & Calculations
  // --------------------------------------------------------------------------
  await suite.test('6. FORMULA Rate Chart Delivery: Delivers full parameters and calculates exact rates offline', async () => {
    // Sync rates for Beta (FORMULA)
    const res = await request(app)
      .get('/api/v1/rates/sync')
      .set('Authorization', `Bearer ${tokenBeta}`)
      .set('x-dairy-tenant-id', orgBeta);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    const data = res.body.data;
    assert.strictEqual(data.charts.length, 1);

    const formulaChart = data.charts[0];
    assert.strictEqual(formulaChart.pricingType, 'FORMULA');
    assert.strictEqual(formulaChart.baseRate, 42.0);
    assert.strictEqual(formulaChart.baseFat, 4.0);
    assert.strictEqual(formulaChart.baseSnf, 8.5);
    assert.strictEqual(formulaChart.fatFactor, 4.5);
    assert.strictEqual(formulaChart.snfFactor, 3.5);
    assert.strictEqual(formulaChart.fatMin, 2.5);
    assert.strictEqual(formulaChart.fatMax, 6.0);
    assert.strictEqual(formulaChart.snfMin, 7.5);
    assert.strictEqual(formulaChart.snfMax, 10.0);

    // Offline client calculation verification:
    // Milk: Fat 4.2, SNF 8.7
    // Formula: 42.0 + (4.2 - 4.0)*4.5 + (8.7 - 8.5)*3.5 = 42.0 + 0.90 + 0.70 = 43.60
    const calculatedRate = roundHalfUp(
      formulaChart.baseRate +
      (4.2 - formulaChart.baseFat) * formulaChart.fatFactor +
      (8.7 - formulaChart.baseSnf) * formulaChart.snfFactor,
      2
    );
    assert.strictEqual(calculatedRate, 43.60);

    const calculatedTotal = roundHalfUp(10.0 * calculatedRate, 2);
    assert.strictEqual(calculatedTotal, 436.00);

    // Submit to bulk sync with this calculated formula rate
    const formulaBatch = {
      batchId: crypto.randomUUID(),
      schemaVersion: 1,
      deviceId: 'KIOSK_AUDIT_B',
      transactions: [
        {
          clientIntakeUuid: crypto.randomUUID(),
          idempotencyKey: `FORMULA-INTAKE-${Date.now()}`,
          customerId: customerBeta,
          sessionId: sessionBetaOpen,
          milkCategory: 'COW',
          weightLiters: 10.0,
          fatPercentage: 4.2,
          snfPercentage: 8.7,
          ratePerLiter: calculatedRate,
          totalAmount: calculatedTotal,
          businessDate: today,
        },
      ],
    };

    const formulaIntakeRes = await bulkUseCase.execute({
      organizationId: orgBeta,
      operatorId: operatorBeta,
      operatorName: 'Operator Audit Beta',
      requestId: 'req-aud-formula-1',
      batch: formulaBatch,
    });

    assert.strictEqual(formulaIntakeRes.summary.accepted, 1);
    assert.strictEqual(formulaIntakeRes.results[0].status, 'ACCEPTED');
  });

  // --------------------------------------------------------------------------
  // Subtest 7: Dynamic ETag Invalidation
  // --------------------------------------------------------------------------
  await suite.test('7. ETag & Cache Freshness: Returns 304 on match; Invalidates when formula or cell updates', async () => {
    // 7a. Initial fetch provides ETag
    const res1 = await request(app)
      .get('/api/v1/rates/sync')
      .set('Authorization', `Bearer ${tokenAlpha}`);

    assert.strictEqual(res1.status, 200);
    const etag1 = res1.headers['etag'];
    assert.ok(etag1, 'ETag header must be present on rates sync');

    // 7b. Request with If-None-Match returns 304 Not Modified
    const res2 = await request(app)
      .get('/api/v1/rates/sync')
      .set('Authorization', `Bearer ${tokenAlpha}`)
      .set('if-none-match', etag1);

    assert.strictEqual(res2.status, 304, 'ETag match must return 304 Not Modified');

    // 7c. Update rate version base rate to trigger dynamic ETag change
    let targetDb;
    try {
      targetDb = await tenantDbManager.getTenantDb(orgAlpha);
    } catch {
      targetDb = db;
    }

    await targetDb.query(
      `UPDATE rate_chart_versions SET base_rate = 39.5 WHERE id = $1`,
      [verCowAlpha1]
    );

    const res3 = await request(app)
      .get('/api/v1/rates/sync')
      .set('Authorization', `Bearer ${tokenAlpha}`);

    assert.strictEqual(res3.status, 200);
    const etag2 = res3.headers['etag'];
    assert.notStrictEqual(etag1, etag2, 'ETag must change dynamically when rate parameters are modified');
  });
});
