import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { db } from '../dist/infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../dist/infrastructure/database/TenantDatabaseManager.js';
import { PostgresCollectionTransactionRepository } from '../dist/infrastructure/repositories/PostgresCollectionTransactionRepository.js';
import { PostgresCustomerRepository } from '../dist/infrastructure/repositories/PostgresCustomerRepository.js';
import { PostgresShiftSessionRepository } from '../dist/infrastructure/repositories/PostgresShiftSessionRepository.js';
import { PostgresLedgerRepository } from '../dist/infrastructure/repositories/PostgresLedgerRepository.js';
import { BulkCollectionSyncUseCase } from '../dist/application/use-cases/collections/BulkCollectionSyncUseCase.js';
import { RateService } from '../dist/modules/rates/rate.service.js';
import { offlineSessionAuthService } from '../dist/infrastructure/security/OfflineSessionAuthorizationService.js';

test('PROMPT 4: Backend Sync Gateway, Bulk Collection API, Tenant Isolation & Rate Matrix Suite', async (suite) => {
  const isConnected = await db.checkConnection();
  if (!isConnected) {
    console.log('[PROMPT 4 TEST] Real PostgreSQL connection is unavailable. Suite skipped.');
    suite.skip('Real PostgreSQL environment unavailable');
    return;
  }

  // Tenant Fixture Identifiers
  const orgAlpha = '00000000-0000-0000-0000-000000004a01';
  const orgBeta = '00000000-0000-0000-0000-000000004b02';
  const centerAlpha1 = '00000000-0000-0000-0000-000000004c01';
  const centerAlpha2 = '00000000-0000-0000-0000-000000004c02';
  const centerBeta = '00000000-0000-0000-0000-000000004c03';
  const operatorAlpha = '00000000-0000-0000-0000-000000004d01';
  const operatorBeta = '00000000-0000-0000-0000-000000004d02';
  const customerAlpha = '00000000-0000-0000-0000-000000004e01';
  const customerBeta = '00000000-0000-0000-0000-000000004e02';
  const sessionAlphaOpen = '00000000-0000-0000-0000-000000004f01';
  const sessionAlphaClosed = '00000000-0000-0000-0000-000000004f02';
  const sessionBetaOpen = '00000000-0000-0000-0000-000000004f03';

  const chartCowAlpha = '00000000-0000-0000-0000-0000000040c1';
  const verCowAlpha1 = '00000000-0000-0000-0000-000000004011';
  const verCowAlpha2 = '00000000-0000-0000-0000-000000004022'; // historical expired
  const chartBufAlpha = '00000000-0000-0000-0000-0000000040b1';
  const verBufAlpha1 = '00000000-0000-0000-0000-000000004033';

  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const customerRepo = new PostgresCustomerRepository();
  const sessionRepo = new PostgresShiftSessionRepository();
  const transactionRepo = new PostgresCollectionTransactionRepository();
  const ledgerRepo = new PostgresLedgerRepository();
  const bulkUseCase = new BulkCollectionSyncUseCase(customerRepo, sessionRepo, transactionRepo);

  // Seed Helper
  const seedEnvironment = async () => {
    const clients = [db];
    try {
      const alphaDb = await tenantDbManager.getTenantDb(orgAlpha);
      if (alphaDb !== db) clients.push(alphaDb);
    } catch {}
    try {
      const betaDb = await tenantDbManager.getTenantDb(orgBeta);
      if (betaDb !== db && !clients.includes(betaDb)) clients.push(betaDb);
    } catch {}

    for (const client of clients) {
      // 1. Ensure composite unique constraint exists
      await client.query(`
        ALTER TABLE milk_collections
        ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;

        ALTER TABLE milk_collections DROP CONSTRAINT IF EXISTS milk_collections_idempotency_key_key;

        CREATE UNIQUE INDEX IF NOT EXISTS uq_milk_collections_org_idempotency
        ON milk_collections (organization_id, idempotency_key);
      `);

      // 2. Seed Organizations
      const codeSuffix = Date.now().toString(36).slice(-5);
      await client.query(`
        INSERT INTO organizations (id, name, code, status)
        VALUES 
          ('${orgAlpha}', 'Alpha Cooperative Dairy', 'OA_${codeSuffix}', 'ACTIVE'),
          ('${orgBeta}', 'Beta Cooperative Dairy', 'OB_${codeSuffix}', 'ACTIVE')
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE';
      `);

      // 3. Seed Dairy Centers
      await client.query(`
        INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status, timezone)
        VALUES 
          ('${centerAlpha1}', '${orgAlpha}', 'CA1_${codeSuffix}', 'Alpha Main Center', 'Main Rd', 'AlphaVillage', 'District', 'State', '416001', '+919876543210', 'ACTIVE', 'Asia/Kolkata'),
          ('${centerAlpha2}', '${orgAlpha}', 'CA2_${codeSuffix}', 'Alpha Branch Center', 'Branch Rd', 'AlphaBranch', 'District', 'State', '416002', '+919876543211', 'ACTIVE', 'Asia/Kolkata'),
          ('${centerBeta}', '${orgBeta}', 'CB1_${codeSuffix}', 'Beta Center', 'Beta Rd', 'BetaVillage', 'District', 'State', '416003', '+919876543212', 'ACTIVE', 'Asia/Kolkata')
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE';
      `);

      // 4. Seed Operators
      await client.query(`
        INSERT INTO users (id, organization_id, username, phone_number, full_name, role, status)
        VALUES 
          ('${operatorAlpha}', '${orgAlpha}', 'op_a_${codeSuffix}', '+919822441101', 'Operator Alpha', 'COLLECTION_OPERATOR', 'ACTIVE'),
          ('${operatorBeta}', '${orgBeta}', 'op_b_${codeSuffix}', '+919822441102', 'Operator Beta', 'COLLECTION_OPERATOR', 'ACTIVE')
        ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', username = EXCLUDED.username;
      `);

      // 5. Seed Customers
      await client.query(`
        INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status)
        VALUES 
          ('${customerAlpha}', '${orgAlpha}', '${centerAlpha1}', 'F-A01', 'Farmer Alpha', '+919822990001', 'ACTIVE', 'APPROVED'),
          ('${customerBeta}', '${orgBeta}', '${centerBeta}', 'F-B01', 'Farmer Beta', '+919822990002', 'ACTIVE', 'APPROVED')
        ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE';

        INSERT INTO customer_milk_categories (customer_id, milk_category, authorized_by)
        VALUES 
          ('${customerAlpha}', 'COW', '${operatorAlpha}'),
          ('${customerAlpha}', 'BUFFALO', '${operatorAlpha}'),
          ('${customerBeta}', 'COW', '${operatorBeta}'),
          ('${customerBeta}', 'BUFFALO', '${operatorBeta}')
        ON CONFLICT (customer_id, milk_category) DO NOTHING;

        INSERT INTO customer_ledger_accounts (id, customer_id, organization_id, current_balance, currency)
        VALUES 
          (gen_random_uuid(), '${customerAlpha}', '${orgAlpha}', 0.00, 'INR'),
          (gen_random_uuid(), '${customerBeta}', '${orgBeta}', 0.00, 'INR')
        ON CONFLICT DO NOTHING;
      `);

      // 6. Seed Shift Sessions (Open and Closed)
      await client.query(`
        INSERT INTO kiosk_shift_sessions (id, session_code, organization_id, center_id, business_date, shift, status, opened_at, opening_operator_id, device_identifier, total_liters, total_amount, transaction_count)
        VALUES 
          ('${sessionAlphaOpen}', 'SES-A-OPEN', '${orgAlpha}', '${centerAlpha1}', '${today}', 'MORNING', 'OPEN', NOW(), '${operatorAlpha}', 'KIOSK_P4_A', 0, 0, 0),
          ('${sessionAlphaClosed}', 'SES-A-CLOSED', '${orgAlpha}', '${centerAlpha1}', '${yesterday}', 'EVENING', 'CLOSED', NOW() - INTERVAL '1 day', '${operatorAlpha}', 'KIOSK_P4_A', 100, 4000, 10),
          ('${sessionBetaOpen}', 'SES-B-OPEN', '${orgBeta}', '${centerBeta}', '${today}', 'MORNING', 'OPEN', NOW(), '${operatorBeta}', 'KIOSK_P4_B', 0, 0, 0)
        ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, business_date = EXCLUDED.business_date;
      `);

      // 7. Seed Rate Charts, Versions and Exact Cells
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
          ('${chartCowAlpha}', '${orgAlpha}', NULL, 'Alpha Standard Cow Rate Chart', 'COW', 'GRID', TRUE),
          ('${chartBufAlpha}', '${orgAlpha}', NULL, 'Alpha Standard Buffalo Rate Chart', 'BUFFALO', 'GRID', TRUE)
        ON CONFLICT (id) DO UPDATE SET is_active = TRUE;

        -- Version 1 (Active covering today) - insert as DRAFT first to allow cell insertion
        INSERT INTO rate_chart_versions (id, rate_chart_id, version_number, status, pricing_unit, measurement_unit, base_fat, base_snf, base_rate, effective_from, effective_to, is_approved)
        VALUES 
          ('${verCowAlpha1}', '${chartCowAlpha}', 1, 'DRAFT', 'PER_KG', 'KG', 3.5, 8.5, 38.0, '${today} 00:00:00Z', NULL, TRUE),
          ('${verBufAlpha1}', '${chartBufAlpha}', 1, 'DRAFT', 'PER_KG', 'KG', 6.0, 9.0, 62.0, '${today} 00:00:00Z', NULL, TRUE)
        ON CONFLICT (id) DO UPDATE SET is_approved = TRUE, status = 'DRAFT';

        -- Version 2 (Historical version for yesterday, rate base 37.0)
        INSERT INTO rate_chart_versions (id, rate_chart_id, version_number, status, pricing_unit, measurement_unit, base_fat, base_snf, base_rate, effective_from, effective_to, is_approved)
        VALUES 
          ('${verCowAlpha2}', '${chartCowAlpha}', 2, 'DRAFT', 'PER_KG', 'KG', 3.5, 8.5, 37.0, '${yesterday} 00:00:00Z', '${yesterday} 23:59:59Z', TRUE)
        ON CONFLICT (id) DO UPDATE SET is_approved = TRUE, status = 'DRAFT';

        -- Seed exact grid cells for verCowAlpha1 (Fat 3.5-4.5, SNF 8.5-9.0)
        INSERT INTO rate_chart_cells (rate_chart_version_id, fat_percentage, snf_percentage, rate_per_unit)
        VALUES 
          ('${verCowAlpha1}', 3.5, 8.5, 38.00),
          ('${verCowAlpha1}', 4.0, 8.5, 40.10),
          ('${verCowAlpha1}', 4.2, 8.5, 40.94),
          ('${verCowAlpha1}', 4.5, 8.5, 42.20)
        ON CONFLICT DO NOTHING;

        -- Seed historical cell for verCowAlpha2 (Fat 4.0, SNF 8.5 was 39.10 yesterday)
        INSERT INTO rate_chart_cells (rate_chart_version_id, fat_percentage, snf_percentage, rate_per_unit)
        VALUES 
          ('${verCowAlpha2}', 4.0, 8.5, 39.10)
        ON CONFLICT DO NOTHING;

        -- Now transition to PUBLISHED / SUPERSEDED (trigger will lock them from then on)
        UPDATE rate_chart_versions SET status = 'PUBLISHED' WHERE id IN ('${verCowAlpha1}', '${verBufAlpha1}');
        UPDATE rate_chart_versions SET status = 'SUPERSEDED' WHERE id = '${verCowAlpha2}';
      `);
    }
  };

  await seedEnvironment();

  // --------------------------------------------------------------------------
  // Subtest 1: Bulk Ingestion: Single & Multiple Valid Collections
  // --------------------------------------------------------------------------
  await suite.test('1. Bulk Ingestion: Multiple valid transactions atomically accepted', async () => {
    const key1 = `SYNC-TEST-${Date.now()}-1`;
    const key2 = `SYNC-TEST-${Date.now()}-2`;

    const batch = {
      batchId: crypto.randomUUID(),
      schemaVersion: 1,
      deviceId: 'KIOSK_P4_A',
      transactions: [
        {
          clientIntakeUuid: crypto.randomUUID(),
          idempotencyKey: key1,
          customerId: customerAlpha,
          sessionId: sessionAlphaOpen,
          centerId: centerAlpha1,
          milkCategory: 'COW',
          quantityLiters: 10,
          fat: 4.0,
          snf: 8.5,
          rateChartVersionId: verCowAlpha1,
          ratePerLiter: 40.10,
          totalAmount: 401.00,
          collectionTimestamp: new Date().toISOString(),
          businessDate: today,
        },
        {
          clientIntakeUuid: crypto.randomUUID(),
          idempotencyKey: key2,
          customerId: customerAlpha,
          sessionId: sessionAlphaOpen,
          centerId: centerAlpha1,
          milkCategory: 'COW',
          quantityLiters: 15,
          fat: 4.2,
          snf: 8.5,
          rateChartVersionId: verCowAlpha1,
          ratePerLiter: 40.94,
          totalAmount: 614.10,
          collectionTimestamp: new Date().toISOString(),
          businessDate: today,
        },
      ],
    };

    const response = await bulkUseCase.execute({
      organizationId: orgAlpha,
      operatorId: operatorAlpha,
      operatorName: 'Operator Alpha',
      requestId: 'req-test-1',
      batch,
    });

    assert.equal(response.summary.received, 2);
    assert.equal(response.summary.accepted, 2);
    assert.equal(response.summary.replayed, 0);
    assert.equal(response.summary.rejected, 0);
    assert.equal(response.results[0].status, 'ACCEPTED');
    assert.equal(response.results[1].status, 'ACCEPTED');
    assert.ok(response.results[0].serverTransactionId);
    assert.ok(response.results[0].receiptNumber);
  });

  // --------------------------------------------------------------------------
  // Subtest 2: Idempotent Replay: ZERO Duplicate Ledger Credit & Tallies
  // --------------------------------------------------------------------------
  await suite.test('2. Idempotent Replay: Duplicate batch returns canonical records with 0 duplicate ledger credits', async () => {
    const replayKey = `SYNC-REPLAY-${Date.now()}`;
    const clientUuid = crypto.randomUUID();

    const singleItemBatch = {
      batchId: crypto.randomUUID(),
      schemaVersion: 1,
      transactions: [
        {
          clientIntakeUuid: clientUuid,
          idempotencyKey: replayKey,
          customerId: customerAlpha,
          sessionId: sessionAlphaOpen,
          milkCategory: 'COW',
          quantityLiters: 20,
          fat: 4.0,
          snf: 8.5,
          rateChartVersionId: verCowAlpha1,
          ratePerLiter: 40.10,
          totalAmount: 802.00,
          collectionTimestamp: new Date().toISOString(),
          businessDate: today,
        },
      ],
    };

    // First submission
    const res1 = await bulkUseCase.execute({
      organizationId: orgAlpha,
      operatorId: operatorAlpha,
      operatorName: 'Operator Alpha',
      requestId: 'req-replay-1',
      batch: singleItemBatch,
    });
    assert.equal(res1.results[0].status, 'ACCEPTED');
    assert.equal(res1.results[0].isIdempotentReplay, false);
    const originalTxnId = res1.results[0].serverTransactionId;
    const originalReceipt = res1.results[0].receiptNumber;

    // Check balance after first submission
    const targetDb = await tenantDbManager.getTenantDb(orgAlpha);
    const ledgerBefore = await targetDb.query(
      `SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1 AND organization_id = $2`,
      [customerAlpha, orgAlpha]
    );
    const balanceBefore = Number(ledgerBefore.rows[0].current_balance);

    // Second submission with exact same batch
    const res2 = await bulkUseCase.execute({
      organizationId: orgAlpha,
      operatorId: operatorAlpha,
      operatorName: 'Operator Alpha',
      requestId: 'req-replay-2',
      batch: singleItemBatch,
    });

    assert.equal(res2.summary.received, 1);
    assert.equal(res2.summary.accepted, 0);
    assert.equal(res2.summary.replayed, 1);
    assert.equal(res2.results[0].status, 'REPLAYED');
    assert.equal(res2.results[0].isIdempotentReplay, true);
    assert.equal(res2.results[0].serverTransactionId, originalTxnId);
    assert.equal(res2.results[0].receiptNumber, originalReceipt);

    // Verify balance is completely unchanged (ZERO duplicate credit!)
    const ledgerAfter = await targetDb.query(
      `SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1 AND organization_id = $2`,
      [customerAlpha, orgAlpha]
    );
    const balanceAfter = Number(ledgerAfter.rows[0].current_balance);
    assert.equal(balanceAfter, balanceBefore);
  });

  // --------------------------------------------------------------------------
  // Subtest 3: Concurrent Batches with Same Idempotency Key
  // --------------------------------------------------------------------------
  await suite.test('3. Concurrent Idempotency: Parallel requests with same key create exactly 1 transaction', async () => {
    const concurrentKey = `SYNC-CONCURRENT-${Date.now()}`;
    const cUuid = crypto.randomUUID();

    const makeBatch = () => ({
      batchId: crypto.randomUUID(),
      schemaVersion: 1,
      transactions: [
        {
          clientIntakeUuid: cUuid,
          idempotencyKey: concurrentKey,
          customerId: customerAlpha,
          sessionId: sessionAlphaOpen,
          milkCategory: 'COW',
          quantityLiters: 10,
          fat: 4.0,
          snf: 8.5,
          rateChartVersionId: verCowAlpha1,
          ratePerLiter: 40.10,
          totalAmount: 401.00,
          collectionTimestamp: new Date().toISOString(),
          businessDate: today,
        },
      ],
    });

    // Execute concurrently
    const [p1, p2] = await Promise.all([
      bulkUseCase.execute({
        organizationId: orgAlpha,
        operatorId: operatorAlpha,
        operatorName: 'Operator Alpha',
        requestId: 'req-conc-1',
        batch: makeBatch(),
      }),
      bulkUseCase.execute({
        organizationId: orgAlpha,
        operatorId: operatorAlpha,
        operatorName: 'Operator Alpha',
        requestId: 'req-conc-2',
        batch: makeBatch(),
      }),
    ]);

    const statuses = [p1.results[0].status, p2.results[0].status];
    assert.ok(statuses.includes('ACCEPTED'), 'One concurrent request must be accepted');
    assert.ok(statuses.includes('REPLAYED'), 'The duplicate concurrent request must be replayed');

    // Verify exactly 1 row in milk_collections in tenant DB
    const targetDb = await tenantDbManager.getTenantDb(orgAlpha);
    const countRes = await targetDb.query(
      `SELECT COUNT(*)::int as count FROM milk_collections WHERE idempotency_key = $1 AND organization_id = $2`,
      [concurrentKey, orgAlpha]
    );
    assert.equal(countRes.rows[0].count, 1);
  });

  // --------------------------------------------------------------------------
  // Subtest 4: Partial-Success Semantics (Mixed Valid & Invalid Items)
  // --------------------------------------------------------------------------
  await suite.test('4. Partial-Success Semantics: Valid items commit, invalid items rejected per-item', async () => {
    const validKey = `SYNC-PARTIAL-VALID-${Date.now()}`;
    const invalidKey = `SYNC-PARTIAL-INVALID-${Date.now()}`;

    const mixedBatch = {
      batchId: crypto.randomUUID(),
      schemaVersion: 1,
      transactions: [
        {
          clientIntakeUuid: crypto.randomUUID(),
          idempotencyKey: validKey,
          customerId: customerAlpha,
          sessionId: sessionAlphaOpen,
          milkCategory: 'COW',
          quantityLiters: 12,
          fat: 4.0,
          snf: 8.5,
          rateChartVersionId: verCowAlpha1,
          ratePerLiter: 40.10,
          totalAmount: 481.20,
          collectionTimestamp: new Date().toISOString(),
          businessDate: today,
        },
        {
          clientIntakeUuid: crypto.randomUUID(),
          idempotencyKey: invalidKey,
          customerId: '00000000-0000-0000-0000-nonexistent000', // Non-existent customer
          sessionId: sessionAlphaOpen,
          milkCategory: 'COW',
          quantityLiters: 10,
          fat: 4.0,
          snf: 8.5,
          rateChartVersionId: verCowAlpha1,
          ratePerLiter: 40.10,
          totalAmount: 401.00,
          collectionTimestamp: new Date().toISOString(),
          businessDate: today,
        },
      ],
    };

    const res = await bulkUseCase.execute({
      organizationId: orgAlpha,
      operatorId: operatorAlpha,
      operatorName: 'Operator Alpha',
      requestId: 'req-partial',
      batch: mixedBatch,
    });

    assert.equal(res.summary.received, 2);
    assert.equal(res.summary.accepted, 1);
    assert.equal(res.summary.rejected, 1);
    assert.equal(res.results[0].status, 'ACCEPTED');
    assert.equal(res.results[1].status, 'REJECTED');
    assert.equal(res.results[1].errorCode, 'CUSTOMER_NOT_FOUND');
  });

  // --------------------------------------------------------------------------
  // Subtest 5: Batch Size Limit Protection (> 100 items rejected with 413)
  // --------------------------------------------------------------------------
  await suite.test('5. Batch Size Protection: Payloads exceeding 100 items rejected safely', async () => {
    const oversizedTransactions = [];
    for (let i = 0; i < 105; i++) {
      oversizedTransactions.push({
        clientIntakeUuid: crypto.randomUUID(),
        idempotencyKey: `OVER-${i}`,
        customerId: customerAlpha,
        sessionId: sessionAlphaOpen,
        milkCategory: 'COW',
        quantityLiters: 10,
        fat: 4.0,
        snf: 8.5,
        ratePerLiter: 40.10,
        totalAmount: 401.00,
        collectionTimestamp: new Date().toISOString(),
        businessDate: today,
      });
    }

    await assert.rejects(
      async () => {
        await bulkUseCase.execute({
          organizationId: orgAlpha,
          operatorId: operatorAlpha,
          operatorName: 'Operator Alpha',
          requestId: 'req-oversized',
          batch: {
            batchId: 'batch-oversized',
            schemaVersion: 1,
            transactions: oversizedTransactions,
          },
        });
      },
      (err) => err.statusCode === 413 && err.code === 'BATCH_SIZE_EXCEEDED'
    );
  });

  // --------------------------------------------------------------------------
  // Subtest 6: Strict Tenant & Centre Isolation
  // --------------------------------------------------------------------------
  await suite.test('6. Strict Tenant & Centre Isolation: Cross-tenant & cross-centre rejected', async () => {
    // A. Cross-tenant customer submission
    const crossTenantBatch = {
      batchId: crypto.randomUUID(),
      schemaVersion: 1,
      transactions: [
        {
          clientIntakeUuid: crypto.randomUUID(),
          idempotencyKey: `CROSS-TENANT-${Date.now()}`,
          customerId: customerBeta, // Belongs to orgBeta!
          sessionId: sessionAlphaOpen,
          milkCategory: 'COW',
          quantityLiters: 10,
          fat: 4.0,
          snf: 8.5,
          rateChartVersionId: verCowAlpha1,
          ratePerLiter: 40.10,
          totalAmount: 401.00,
          collectionTimestamp: new Date().toISOString(),
          businessDate: today,
        },
      ],
    };

    const crossRes = await bulkUseCase.execute({
      organizationId: orgAlpha,
      operatorId: operatorAlpha,
      operatorName: 'Operator Alpha',
      requestId: 'req-cross-tenant',
      batch: crossTenantBatch,
    });
    assert.equal(crossRes.results[0].status, 'REJECTED');
    assert.ok(
      crossRes.results[0].errorCode === 'CUSTOMER_NOT_FOUND' ||
      crossRes.results[0].errorCode === 'CROSS_TENANT_CUSTOMER_BLOCKED'
    );

    // B. Same idempotency key in different organizations remains isolated
    const sharedKey = `ISOLATED-KEY-${Date.now()}`;
    const batchAlpha = {
      batchId: crypto.randomUUID(),
      schemaVersion: 1,
      transactions: [
        {
          clientIntakeUuid: crypto.randomUUID(),
          idempotencyKey: sharedKey,
          customerId: customerAlpha,
          sessionId: sessionAlphaOpen,
          milkCategory: 'COW',
          quantityLiters: 10,
          fat: 4.0,
          snf: 8.5,
          rateChartVersionId: verCowAlpha1,
          ratePerLiter: 40.10,
          totalAmount: 401.00,
          collectionTimestamp: new Date().toISOString(),
          businessDate: today,
        },
      ],
    };

    const resA = await bulkUseCase.execute({
      organizationId: orgAlpha,
      operatorId: operatorAlpha,
      operatorName: 'Operator Alpha',
      requestId: 'req-iso-a',
      batch: batchAlpha,
    });
    assert.equal(resA.results[0].status, 'ACCEPTED');

    // Ensure chart exists for orgBeta
    let betaClients = [db];
    try {
      const bClient = await tenantDbManager.getTenantDb(orgBeta);
      if (bClient && bClient !== db) betaClients.push(bClient);
    } catch {}

    for (const bCl of betaClients) {
      await bCl.query(`
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
        VALUES ('00000000-0000-0000-0000-0000000040b2', '${orgBeta}', NULL, 'Beta Cow Chart', 'COW', 'GRID', TRUE)
        ON CONFLICT DO NOTHING;
        INSERT INTO rate_chart_versions (id, rate_chart_id, version_number, status, pricing_unit, measurement_unit, base_fat, base_snf, base_rate, effective_from, effective_to, is_approved)
        VALUES ('00000000-0000-0000-0000-000000004044', '00000000-0000-0000-0000-0000000040b2', 1, 'DRAFT', 'PER_KG', 'KG', 3.5, 8.5, 38.0, '${today} 00:00:00Z', NULL, TRUE)
        ON CONFLICT (id) DO UPDATE SET status = 'DRAFT';
        INSERT INTO rate_chart_cells (rate_chart_version_id, fat_percentage, snf_percentage, rate_per_unit)
        VALUES ('00000000-0000-0000-0000-000000004044', 4.0, 8.5, 40.10)
        ON CONFLICT DO NOTHING;
        UPDATE rate_chart_versions SET status = 'PUBLISHED' WHERE id = '00000000-0000-0000-0000-000000004044';
      `);
    }

    const batchBeta = {
      batchId: crypto.randomUUID(),
      schemaVersion: 1,
      transactions: [
        {
          clientIntakeUuid: crypto.randomUUID(),
          idempotencyKey: sharedKey, // Identical key in Beta
          customerId: customerBeta,
          sessionId: sessionBetaOpen,
          milkCategory: 'COW',
          quantityLiters: 10,
          fat: 4.0,
          snf: 8.5,
          rateChartVersionId: '00000000-0000-0000-0000-000000004044',
          ratePerLiter: 40.10,
          totalAmount: 401.00,
          collectionTimestamp: new Date().toISOString(),
          businessDate: today,
        },
      ],
    };

    const resB = await bulkUseCase.execute({
      organizationId: orgBeta,
      operatorId: operatorBeta,
      operatorName: 'Operator Beta',
      requestId: 'req-iso-b',
      batch: batchBeta,
    });
    // Org Beta accepts independently without collision or leaking!
    assert.equal(resB.results[0].status, 'ACCEPTED');
  });

  // --------------------------------------------------------------------------
  // Subtest 7: Session Offline Reconciliation (Closed Sessions & Mismatches)
  // --------------------------------------------------------------------------
  await suite.test('7. Session Offline Reconciliation: Legitimate closed session accepted, mismatched date rejected', async () => {
    // Generate valid server-issued offline authorization token for the closed session
    const closedAuth = offlineSessionAuthService.generateAuthorization({
      organizationId: orgAlpha,
      centerId: centerAlpha1,
      sessionId: sessionAlphaClosed,
      sessionCode: 'SES-A-CLOSED',
      businessDate: yesterday,
      shift: 'EVENING',
      deviceIdentifier: 'KIOSK_P4_A',
      operatorId: operatorAlpha,
      operatorName: 'Operator Alpha',
      timezone: 'Asia/Kolkata',
      validFrom: `${yesterday}T12:00:00Z`,
      validUntil: `${yesterday}T23:59:59Z`,
      maxReconciliationDays: 30,
    });

    // A. Offline collection taken during yesterday's shift, synced after session closed
    const offlineHistoricalBatch = {
      batchId: crypto.randomUUID(),
      schemaVersion: 1,
      deviceId: 'KIOSK_P4_A',
      offlineAuthorizationToken: closedAuth.token,
      transactions: [
        {
          clientIntakeUuid: crypto.randomUUID(),
          idempotencyKey: `SYNC-HISTORICAL-${Date.now()}`,
          customerId: customerAlpha,
          sessionId: sessionAlphaClosed, // Closed session from yesterday
          milkCategory: 'COW',
          quantityLiters: 10,
          fat: 4.0,
          snf: 8.5,
          rateChartVersionId: verCowAlpha2, // Historical rate version valid yesterday
          ratePerLiter: 39.10, // Historical rate from verCowAlpha2
          totalAmount: 391.00,
          collectionTimestamp: `${yesterday}T18:30:00Z`,
          businessDate: yesterday,
          deviceId: 'KIOSK_P4_A',
        },
      ],
    };

    const histRes = await bulkUseCase.execute({
      organizationId: orgAlpha,
      operatorId: operatorAlpha,
      operatorName: 'Operator Alpha',
      authenticatedDeviceId: 'KIOSK_P4_A',
      requestId: 'req-hist-session',
      batch: offlineHistoricalBatch,
    });
    assert.equal(histRes.results[0].status, 'ACCEPTED');

    // B. Mismatched business date rejected
    const badDateBatch = {
      batchId: crypto.randomUUID(),
      schemaVersion: 1,
      transactions: [
        {
          clientIntakeUuid: crypto.randomUUID(),
          idempotencyKey: `SYNC-BADDATE-${Date.now()}`,
          customerId: customerAlpha,
          sessionId: sessionAlphaOpen, // Today's session
          milkCategory: 'COW',
          quantityLiters: 10,
          fat: 4.0,
          snf: 8.5,
          rateChartVersionId: verCowAlpha1,
          ratePerLiter: 40.10,
          totalAmount: 401.00,
          collectionTimestamp: new Date().toISOString(),
          businessDate: '2020-01-01', // Fraudulent / mismatched date
        },
      ],
    };

    const badDateRes = await bulkUseCase.execute({
      organizationId: orgAlpha,
      operatorId: operatorAlpha,
      operatorName: 'Operator Alpha',
      requestId: 'req-baddate',
      batch: badDateBatch,
    });
    assert.equal(badDateRes.results[0].status, 'REJECTED');
    assert.equal(badDateRes.results[0].errorCode, 'SESSION_BUSINESS_DATE_MISMATCH');
  });

  // --------------------------------------------------------------------------
  // Subtest 8: Rate Matrix Delivery API (GET /api/v1/rates/sync)
  // --------------------------------------------------------------------------
  await suite.test('8. Rate Matrix Delivery: Complete active GRID cells and indexed gridMatrix delivered', async () => {
    const payload = await RateService.getSyncRateCharts(orgAlpha, centerAlpha1, today);

    assert.equal(payload.organizationId, orgAlpha);
    assert.ok(payload.charts.length >= 1);

    const cowChart = payload.charts.find((c) => c.milkCategory === 'COW');
    assert.ok(cowChart, 'Cow rate chart must be present');
    assert.equal(cowChart.pricingType, 'GRID');
    assert.ok(cowChart.cellCount >= 4, 'Must contain all configured cells');

    // Verify exact precision without rounding away decimals
    const cell40 = cowChart.cells.find((c) => Math.abs(c.fat - 4.0) < 0.05 && Math.abs(c.snf - 8.5) < 0.05);
    assert.ok(cell40);
    assert.equal(cell40.ratePerLiter, 40.10);

    // Verify indexed gridMatrix
    assert.ok(cowChart.gridMatrix['4.0']);
    assert.equal(cowChart.gridMatrix['4.0']['8.5'], 40.10);

    // Missing cell verification: Fat 1.0, SNF 5.0 must NOT exist
    assert.equal(cowChart.gridMatrix['1.0'], undefined);
  });

  // --------------------------------------------------------------------------
  // Subtest 9: Historical Rate Validation: Tampering & Missing Cell Rejection
  // --------------------------------------------------------------------------
  await suite.test('9. Rate Tampering & Precision: Mismatches and missing cells strictly rejected', async () => {
    // A. Tampered rate (client inflated rate from 40.10 to 55.00)
    const tamperedRateBatch = {
      batchId: crypto.randomUUID(),
      schemaVersion: 1,
      transactions: [
        {
          clientIntakeUuid: crypto.randomUUID(),
          idempotencyKey: `TAMPER-RATE-${Date.now()}`,
          customerId: customerAlpha,
          sessionId: sessionAlphaOpen,
          milkCategory: 'COW',
          quantityLiters: 10,
          fat: 4.0,
          snf: 8.5,
          rateChartVersionId: verCowAlpha1,
          ratePerLiter: 55.00, // Tampered! Authoritative is 40.10
          totalAmount: 550.00,
          collectionTimestamp: new Date().toISOString(),
          businessDate: today,
        },
      ],
    };

    const resTamper = await bulkUseCase.execute({
      organizationId: orgAlpha,
      operatorId: operatorAlpha,
      operatorName: 'Operator Alpha',
      requestId: 'req-tamper-rate',
      batch: tamperedRateBatch,
    });
    assert.equal(resTamper.results[0].status, 'REJECTED');
    assert.equal(resTamper.results[0].errorCode, 'RATE_MISMATCH');

    // B. Missing cell in GRID (Fat 3.0, SNF 8.5 is valid biologically, but has no rate cell)
    const missingCellBatch = {
      batchId: crypto.randomUUID(),
      schemaVersion: 1,
      transactions: [
        {
          clientIntakeUuid: crypto.randomUUID(),
          idempotencyKey: `MISSING-CELL-${Date.now()}`,
          customerId: customerAlpha,
          sessionId: sessionAlphaOpen,
          milkCategory: 'COW',
          quantityLiters: 10,
          fat: 3.0,
          snf: 8.5,
          rateChartVersionId: verCowAlpha1,
          ratePerLiter: 30.00,
          totalAmount: 300.00,
          collectionTimestamp: new Date().toISOString(),
          businessDate: today,
        },
      ],
    };

    const resMissing = await bulkUseCase.execute({
      organizationId: orgAlpha,
      operatorId: operatorAlpha,
      operatorName: 'Operator Alpha',
      requestId: 'req-missing-cell',
      batch: missingCellBatch,
    });
    assert.equal(resMissing.results[0].status, 'REJECTED');
    assert.equal(resMissing.results[0].errorCode, 'RATE_CELL_NOT_FOUND');

    // C. Tampered total amount (rate is 40.10, 10L = 401.00, but client sent 999.00)
    const tamperedTotalBatch = {
      batchId: crypto.randomUUID(),
      schemaVersion: 1,
      transactions: [
        {
          clientIntakeUuid: crypto.randomUUID(),
          idempotencyKey: `TAMPER-TOTAL-${Date.now()}`,
          customerId: customerAlpha,
          sessionId: sessionAlphaOpen,
          milkCategory: 'COW',
          quantityLiters: 10,
          fat: 4.0,
          snf: 8.5,
          rateChartVersionId: verCowAlpha1,
          ratePerLiter: 40.10,
          totalAmount: 999.00, // Tampered total!
          collectionTimestamp: new Date().toISOString(),
          businessDate: today,
        },
      ],
    };

    const resTotal = await bulkUseCase.execute({
      organizationId: orgAlpha,
      operatorId: operatorAlpha,
      operatorName: 'Operator Alpha',
      requestId: 'req-tamper-total',
      batch: tamperedTotalBatch,
    });
    assert.equal(resTotal.results[0].status, 'REJECTED');
    assert.equal(resTotal.results[0].errorCode, 'TOTAL_AMOUNT_MISMATCH');
  });
});
