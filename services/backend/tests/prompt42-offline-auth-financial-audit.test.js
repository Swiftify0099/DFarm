import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../dist/app.js';
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

const app = createApp();
const tokenService = new HmacJwtTokenService();

test('PROMPT 4.2: Comprehensive Offline Session Authorization & Financial Precision Audit Suite', async (suite) => {
  const isConnected = await db.checkConnection();
  if (!isConnected) {
    console.log('[PROMPT 4.2 TEST] Real PostgreSQL connection is unavailable. Suite skipped.');
    suite.skip('Real PostgreSQL environment unavailable');
    return;
  }

  // Tenant Fixture Identifiers
  const orgAlpha = '00000000-0000-0000-0000-0000000042a1';
  const orgBeta = '00000000-0000-0000-0000-0000000042b2';
  const centerAlpha = '00000000-0000-0000-0000-0000000042c1';
  const centerBeta = '00000000-0000-0000-0000-0000000042c2';
  const operatorAlpha = '00000000-0000-0000-0000-0000000042d1';
  const operatorBeta = '00000000-0000-0000-0000-0000000042d2';
  const customerAlpha = '00000000-0000-0000-0000-0000000042e1';
  const customerBeta = '00000000-0000-0000-0000-0000000042e2';
  const sessionAlphaOpen = '00000000-0000-0000-0000-0000000042f1';
  const sessionAlphaClosed = '00000000-0000-0000-0000-0000000042f2';
  const sessionBetaOpen = '00000000-0000-0000-0000-0000000042f3';

  const chartCowAlpha = '00000000-0000-0000-0000-000000004201';
  const verCowAlpha1 = '00000000-0000-0000-0000-000000004211';
  const chartCowBeta = '00000000-0000-0000-0000-000000004202';
  const verCowBeta1 = '00000000-0000-0000-0000-000000004212';

  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

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
      await client.query(`
        ALTER TABLE milk_collections
        ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;

        ALTER TABLE milk_collections DROP CONSTRAINT IF EXISTS milk_collections_idempotency_key_key;

        CREATE UNIQUE INDEX IF NOT EXISTS uq_milk_collections_org_idempotency
        ON milk_collections (organization_id, idempotency_key);
      `);

      await client.query(`
        INSERT INTO organizations (id, name, code, status)
        VALUES 
          ('${orgAlpha}', 'Audit Alpha Cooperative 4.2', 'A42_${codeSuffix}', 'ACTIVE'),
          ('${orgBeta}', 'Audit Beta Cooperative 4.2', 'B42_${codeSuffix}', 'ACTIVE')
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE';
      `);

      await client.query(`
        INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status, timezone)
        VALUES 
          ('${centerAlpha}', '${orgAlpha}', 'C42A_${codeSuffix}', 'Audit Alpha Center 4.2', 'Center Rd', 'VillageAlpha', 'District', 'State', '416001', '+919876543210', 'ACTIVE', 'Asia/Kolkata'),
          ('${centerBeta}', '${orgBeta}', 'C42B_${codeSuffix}', 'Audit Beta Center 4.2', 'Center Rd', 'VillageBeta', 'District', 'State', '416002', '+919876543211', 'ACTIVE', 'Asia/Kolkata')
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE';
      `);

      await client.query(`
        INSERT INTO users (id, organization_id, username, phone_number, full_name, role, status)
        VALUES 
          ('${operatorAlpha}', '${orgAlpha}', 'op42_a_${codeSuffix}', '+919822992201', 'Operator Audit Alpha 4.2', 'COLLECTION_OPERATOR', 'ACTIVE'),
          ('${operatorBeta}', '${orgBeta}', 'op42_b_${codeSuffix}', '+919822992202', 'Operator Audit Beta 4.2', 'COLLECTION_OPERATOR', 'ACTIVE')
        ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', username = EXCLUDED.username;
      `);

      await client.query(`
        INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status)
        VALUES 
          ('${customerAlpha}', '${orgAlpha}', '${centerAlpha}', 'F-A42', 'Farmer Alpha Audit 4.2', '+919822771101', 'ACTIVE', 'APPROVED'),
          ('${customerBeta}', '${orgBeta}', '${centerBeta}', 'F-B42', 'Farmer Beta Audit 4.2', '+919822771102', 'ACTIVE', 'APPROVED')
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

      const yesterdayOpen = `${yesterday}T06:00:00Z`;
      const yesterdayClose = `${yesterday}T09:30:00Z`;

      await client.query(`
        INSERT INTO kiosk_shift_sessions (id, session_code, organization_id, center_id, business_date, shift, status, opened_at, closed_at, opening_operator_id, device_identifier, total_liters, total_amount, transaction_count)
        VALUES 
          ('${sessionAlphaOpen}', 'SES-42-OPEN', '${orgAlpha}', '${centerAlpha}', '${today}', 'MORNING', 'OPEN', NOW(), NULL, '${operatorAlpha}', 'KIOSK_42_A', 0, 0, 0),
          ('${sessionAlphaClosed}', 'SES-42-CLOSED', '${orgAlpha}', '${centerAlpha}', '${yesterday}', 'MORNING', 'CLOSED', '${yesterdayOpen}'::timestamptz, '${yesterdayClose}'::timestamptz, '${operatorAlpha}', 'KIOSK_42_A', 100, 4000, 10),
          ('${sessionBetaOpen}', 'SES-42-BETA', '${orgBeta}', '${centerBeta}', '${today}', 'MORNING', 'OPEN', NOW(), NULL, '${operatorBeta}', 'KIOSK_42_B', 0, 0, 0)
        ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, business_date = EXCLUDED.business_date, closed_at = EXCLUDED.closed_at, opened_at = EXCLUDED.opened_at;
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

      await client.query(`
        INSERT INTO rate_charts (id, organization_id, center_id, name, milk_category, pricing_type, is_active)
        VALUES 
          ('${chartCowAlpha}', '${orgAlpha}', NULL, 'Alpha 4.2 Cow GRID Chart', 'COW', 'GRID', TRUE),
          ('${chartCowBeta}', '${orgBeta}', NULL, 'Beta 4.2 Cow FORMULA Chart', 'COW', 'TWO_AXIS_FORMULA', TRUE)
        ON CONFLICT (id) DO UPDATE SET is_active = TRUE, pricing_type = EXCLUDED.pricing_type;

        INSERT INTO rate_chart_versions (id, rate_chart_id, version_number, status, pricing_unit, measurement_unit, base_fat, base_snf, base_rate, fat_min, fat_max, snf_min, snf_max, formula_definition, effective_from, effective_to, is_approved)
        VALUES 
          ('${verCowAlpha1}', '${chartCowAlpha}', 1, 'DRAFT', 'PER_KG', 'KG', 3.5, 8.5, 38.0, 2.5, 6.0, 7.5, 10.0, NULL, '${yesterday} 00:00:00Z', NULL, TRUE),
          ('${verCowBeta1}', '${chartCowBeta}', 1, 'DRAFT', 'PER_KG', 'KG', 4.0, 8.5, 42.0, 2.5, 6.0, 7.5, 10.0, '{"fatFactor": 4.5, "snfFactor": 3.5}', '${yesterday} 00:00:00Z', NULL, TRUE)
        ON CONFLICT (id) DO UPDATE SET status = 'DRAFT', is_approved = TRUE, effective_from = EXCLUDED.effective_from, formula_definition = EXCLUDED.formula_definition;

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

  // ==========================================================================
  // SECTION 1: Server-Issued Offline Session Authorization Matrix (P0)
  // ==========================================================================

  // Generate valid server-issued authorization for closed sessionAlphaClosed
  const validClosedAuth = offlineSessionAuthService.generateAuthorization({
    organizationId: orgAlpha,
    centerId: centerAlpha,
    sessionId: sessionAlphaClosed,
    sessionCode: 'SES-42-CLOSED',
    businessDate: yesterday,
    shift: 'MORNING',
    deviceIdentifier: 'KIOSK_42_A',
    operatorId: operatorAlpha,
    operatorName: 'Operator Audit Alpha 4.2',
    timezone: 'Asia/Kolkata',
    validFrom: `${yesterday}T06:00:00Z`,
    validUntil: `${yesterday}T12:00:00Z`,
    maxReconciliationDays: 30,
  });

  // 1a. Valid Signed Offline Authorization -> ACCEPTED
  await suite.test('1a. Valid Signed Offline Authorization: Accepted and credited for closed session', async () => {
    const batch = {
      batchId: crypto.randomUUID(),
      schemaVersion: 1,
      deviceId: 'KIOSK_42_A',
      offlineAuthorizationToken: validClosedAuth.token,
      transactions: [
        {
          clientIntakeUuid: crypto.randomUUID(),
          idempotencyKey: `CLOSED-AUTH-VALID-${Date.now()}`,
          customerId: customerAlpha,
          sessionId: sessionAlphaClosed,
          milkCategory: 'COW',
          weightLiters: 10.0,
          fatPercentage: 4.0,
          snfPercentage: 8.5,
          ratePerLiter: 40.10,
          totalAmount: 401.00,
          businessDate: yesterday,
          collectionTimestamp: `${yesterday}T07:15:00Z`,
          deviceId: 'KIOSK_42_A',
        },
      ],
    };

    const res = await bulkUseCase.execute({
      organizationId: orgAlpha,
      operatorId: operatorAlpha,
      operatorName: 'Operator Audit Alpha 4.2',
      authenticatedDeviceId: 'KIOSK_42_A',
      requestId: 'req-auth-valid',
      batch,
    });

    assert.strictEqual(res.summary.accepted, 1);
    assert.strictEqual(res.results[0].status, 'ACCEPTED');
  });

  // 1b. Missing Authorization for Closed Session -> OFFLINE_AUTHORIZATION_MISSING
  await suite.test('1b. Missing Offline Authorization: Strictly rejected for closed session', async () => {
    const batch = {
      batchId: crypto.randomUUID(),
      schemaVersion: 1,
      deviceId: 'KIOSK_42_A',
      transactions: [
        {
          clientIntakeUuid: crypto.randomUUID(),
          idempotencyKey: `CLOSED-NO-AUTH-${Date.now()}`,
          customerId: customerAlpha,
          sessionId: sessionAlphaClosed,
          milkCategory: 'COW',
          weightLiters: 10.0,
          fatPercentage: 4.0,
          snfPercentage: 8.5,
          ratePerLiter: 40.10,
          totalAmount: 401.00,
          businessDate: yesterday,
          collectionTimestamp: `${yesterday}T07:15:00Z`,
          deviceId: 'KIOSK_42_A',
        },
      ],
    };

    const res = await bulkUseCase.execute({
      organizationId: orgAlpha,
      operatorId: operatorAlpha,
      operatorName: 'Operator Audit Alpha 4.2',
      requestId: 'req-no-auth',
      batch,
    });

    assert.strictEqual(res.summary.rejected, 1);
    assert.strictEqual(res.results[0].status, 'REJECTED');
    assert.strictEqual(res.results[0].errorCode, 'OFFLINE_AUTHORIZATION_MISSING');
  });

  // 1c. Tampered / Altered Authorization Signature or Payload -> OFFLINE_AUTHORIZATION_INVALID
  await suite.test('1c. Tampered Authorization: Signature mismatch strictly rejected', async () => {
    const parts = validClosedAuth.token.split('.');
    // Tamper the payload JSON (e.g. modify validUntil)
    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
    const modifiedPayload = JSON.parse(payloadJson);
    modifiedPayload.deviceIdentifier = 'ROGUE_DEVICE';
    const forgedPayloadB64 = Buffer.from(JSON.stringify(modifiedPayload)).toString('base64url');
    const forgedToken = `${parts[0]}.${forgedPayloadB64}.${parts[2]}`; // signature no longer matches

    const batch = {
      batchId: crypto.randomUUID(),
      schemaVersion: 1,
      deviceId: 'KIOSK_42_A',
      offlineAuthorizationToken: forgedToken,
      transactions: [
        {
          clientIntakeUuid: crypto.randomUUID(),
          idempotencyKey: `CLOSED-TAMPER-${Date.now()}`,
          customerId: customerAlpha,
          sessionId: sessionAlphaClosed,
          milkCategory: 'COW',
          weightLiters: 10.0,
          fatPercentage: 4.0,
          snfPercentage: 8.5,
          ratePerLiter: 40.10,
          totalAmount: 401.00,
          businessDate: yesterday,
          collectionTimestamp: `${yesterday}T07:15:00Z`,
          deviceId: 'KIOSK_42_A',
        },
      ],
    };

    const res = await bulkUseCase.execute({
      organizationId: orgAlpha,
      operatorId: operatorAlpha,
      operatorName: 'Operator Audit Alpha 4.2',
      authenticatedDeviceId: 'KIOSK_42_A',
      requestId: 'req-tamper-auth',
      batch,
    });

    assert.strictEqual(res.summary.rejected, 1);
    assert.strictEqual(res.results[0].status, 'REJECTED');
    assert.strictEqual(res.results[0].errorCode, 'OFFLINE_AUTHORIZATION_INVALID');
  });

  // 1d. Expired Authorization (past 30-day max reconciliation retention) -> OFFLINE_AUTHORIZATION_EXPIRED
  await suite.test('1d. Expired Authorization: Rejected when retention window exceeded', async () => {
    const expiredAuth = offlineSessionAuthService.generateAuthorization({
      organizationId: orgAlpha,
      centerId: centerAlpha,
      sessionId: sessionAlphaClosed,
      sessionCode: 'SES-42-CLOSED',
      businessDate: yesterday,
      shift: 'MORNING',
      deviceIdentifier: 'KIOSK_42_A',
      operatorId: operatorAlpha,
      timezone: 'Asia/Kolkata',
      validFrom: new Date(Date.now() - 40 * 86400000).toISOString(),
      validUntil: new Date(Date.now() - 39 * 86400000).toISOString(),
      maxReconciliationDays: 30,
    });

    const batch = {
      batchId: crypto.randomUUID(),
      schemaVersion: 1,
      deviceId: 'KIOSK_42_A',
      offlineAuthorizationToken: expiredAuth.token,
      transactions: [
        {
          clientIntakeUuid: crypto.randomUUID(),
          idempotencyKey: `CLOSED-EXPIRED-${Date.now()}`,
          customerId: customerAlpha,
          sessionId: sessionAlphaClosed,
          milkCategory: 'COW',
          weightLiters: 10.0,
          fatPercentage: 4.0,
          snfPercentage: 8.5,
          ratePerLiter: 40.10,
          totalAmount: 401.00,
          businessDate: yesterday,
          collectionTimestamp: `${yesterday}T07:15:00Z`,
          deviceId: 'KIOSK_42_A',
        },
      ],
    };

    const res = await bulkUseCase.execute({
      organizationId: orgAlpha,
      operatorId: operatorAlpha,
      operatorName: 'Operator Audit Alpha 4.2',
      authenticatedDeviceId: 'KIOSK_42_A',
      requestId: 'req-expired-auth',
      batch,
    });

    assert.strictEqual(res.summary.rejected, 1);
    assert.strictEqual(res.results[0].status, 'REJECTED');
    assert.strictEqual(res.results[0].errorCode, 'OFFLINE_AUTHORIZATION_EXPIRED');
  });

  // 1e. Organization Mismatch -> OFFLINE_ORGANIZATION_MISMATCH
  await suite.test('1e. Organization Mismatch: Authorization from Dairy Beta rejected in Dairy Alpha', async () => {
    const crossOrgAuth = offlineSessionAuthService.generateAuthorization({
      organizationId: orgBeta, // Belongs to Beta
      centerId: centerBeta,
      sessionId: sessionAlphaClosed,
      sessionCode: 'SES-42-CLOSED',
      businessDate: yesterday,
      shift: 'MORNING',
      deviceIdentifier: 'KIOSK_42_A',
      operatorId: operatorAlpha,
      timezone: 'Asia/Kolkata',
      validFrom: `${yesterday}T06:00:00Z`,
      validUntil: `${yesterday}T12:00:00Z`,
    });

    const batch = {
      batchId: crypto.randomUUID(),
      schemaVersion: 1,
      deviceId: 'KIOSK_42_A',
      offlineAuthorizationToken: crossOrgAuth.token,
      transactions: [
        {
          clientIntakeUuid: crypto.randomUUID(),
          idempotencyKey: `CLOSED-CROSS-ORG-${Date.now()}`,
          customerId: customerAlpha,
          sessionId: sessionAlphaClosed,
          milkCategory: 'COW',
          weightLiters: 10.0,
          fatPercentage: 4.0,
          snfPercentage: 8.5,
          ratePerLiter: 40.10,
          totalAmount: 401.00,
          businessDate: yesterday,
          collectionTimestamp: `${yesterday}T07:15:00Z`,
          deviceId: 'KIOSK_42_A',
        },
      ],
    };

    const res = await bulkUseCase.execute({
      organizationId: orgAlpha,
      operatorId: operatorAlpha,
      operatorName: 'Operator Audit Alpha 4.2',
      authenticatedDeviceId: 'KIOSK_42_A',
      requestId: 'req-cross-org',
      batch,
    });

    assert.strictEqual(res.summary.rejected, 1);
    assert.strictEqual(res.results[0].status, 'REJECTED');
    assert.strictEqual(res.results[0].errorCode, 'OFFLINE_ORGANIZATION_MISMATCH');
  });

  // 1f. Center Mismatch -> OFFLINE_CENTER_MISMATCH
  await suite.test('1f. Center Mismatch: Authorization for Center B rejected at Center A', async () => {
    const crossCenterAuth = offlineSessionAuthService.generateAuthorization({
      organizationId: orgAlpha,
      centerId: centerBeta, // Wrong center
      sessionId: sessionAlphaClosed,
      sessionCode: 'SES-42-CLOSED',
      businessDate: yesterday,
      shift: 'MORNING',
      deviceIdentifier: 'KIOSK_42_A',
      operatorId: operatorAlpha,
      timezone: 'Asia/Kolkata',
      validFrom: `${yesterday}T06:00:00Z`,
      validUntil: `${yesterday}T12:00:00Z`,
    });

    const batch = {
      batchId: crypto.randomUUID(),
      schemaVersion: 1,
      deviceId: 'KIOSK_42_A',
      offlineAuthorizationToken: crossCenterAuth.token,
      transactions: [
        {
          clientIntakeUuid: crypto.randomUUID(),
          idempotencyKey: `CLOSED-CROSS-CENTER-${Date.now()}`,
          customerId: customerAlpha,
          sessionId: sessionAlphaClosed,
          milkCategory: 'COW',
          weightLiters: 10.0,
          fatPercentage: 4.0,
          snfPercentage: 8.5,
          ratePerLiter: 40.10,
          totalAmount: 401.00,
          businessDate: yesterday,
          collectionTimestamp: `${yesterday}T07:15:00Z`,
          deviceId: 'KIOSK_42_A',
        },
      ],
    };

    const res = await bulkUseCase.execute({
      organizationId: orgAlpha,
      operatorId: operatorAlpha,
      operatorName: 'Operator Audit Alpha 4.2',
      authenticatedDeviceId: 'KIOSK_42_A',
      requestId: 'req-cross-center',
      batch,
    });

    assert.strictEqual(res.summary.rejected, 1);
    assert.strictEqual(res.results[0].status, 'REJECTED');
    assert.strictEqual(res.results[0].errorCode, 'OFFLINE_CENTER_MISMATCH');
  });

  // 1g. Device Mismatch -> OFFLINE_DEVICE_MISMATCH
  await suite.test('1g. Device Mismatch: Authorization for Device X rejected when submitted from Device Y', async () => {
    const wrongDeviceAuth = offlineSessionAuthService.generateAuthorization({
      organizationId: orgAlpha,
      centerId: centerAlpha,
      sessionId: sessionAlphaClosed,
      sessionCode: 'SES-42-CLOSED',
      businessDate: yesterday,
      shift: 'MORNING',
      deviceIdentifier: 'ROGUE_DEVICE_99', // Wrong device
      operatorId: operatorAlpha,
      timezone: 'Asia/Kolkata',
      validFrom: `${yesterday}T06:00:00Z`,
      validUntil: `${yesterday}T12:00:00Z`,
    });

    const batch = {
      batchId: crypto.randomUUID(),
      schemaVersion: 1,
      deviceId: 'KIOSK_42_A',
      offlineAuthorizationToken: wrongDeviceAuth.token,
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
          collectionTimestamp: `${yesterday}T07:15:00Z`,
          deviceId: 'KIOSK_42_A',
        },
      ],
    };

    const res = await bulkUseCase.execute({
      organizationId: orgAlpha,
      operatorId: operatorAlpha,
      operatorName: 'Operator Audit Alpha 4.2',
      authenticatedDeviceId: 'KIOSK_42_A',
      requestId: 'req-dev-mismatch',
      batch,
    });

    assert.strictEqual(res.summary.rejected, 1);
    assert.strictEqual(res.results[0].status, 'REJECTED');
    assert.strictEqual(res.results[0].errorCode, 'OFFLINE_DEVICE_MISMATCH');
  });

  // 1h. Session Mismatch / Cross-Session Replay -> OFFLINE_SESSION_MISMATCH
  await suite.test('1h. Cross-Session Replay: Authorization for Session A cannot authorize Session B', async () => {
    // Generate auth strictly for sessionAlphaOpen
    const openSessionAuth = offlineSessionAuthService.generateAuthorization({
      organizationId: orgAlpha,
      centerId: centerAlpha,
      sessionId: sessionAlphaOpen,
      sessionCode: 'SES-42-OPEN',
      businessDate: today,
      shift: 'MORNING',
      deviceIdentifier: 'KIOSK_42_A',
      operatorId: operatorAlpha,
      timezone: 'Asia/Kolkata',
      validFrom: new Date().toISOString(),
      validUntil: new Date(Date.now() + 14 * 3600000).toISOString(),
    });

    // Attempt to submit this auth against sessionAlphaClosed!
    const batch = {
      batchId: crypto.randomUUID(),
      schemaVersion: 1,
      deviceId: 'KIOSK_42_A',
      offlineAuthorizationToken: openSessionAuth.token,
      transactions: [
        {
          clientIntakeUuid: crypto.randomUUID(),
          idempotencyKey: `CLOSED-CROSS-SES-${Date.now()}`,
          customerId: customerAlpha,
          sessionId: sessionAlphaClosed, // Targets closed session!
          milkCategory: 'COW',
          weightLiters: 10.0,
          fatPercentage: 4.0,
          snfPercentage: 8.5,
          ratePerLiter: 40.10,
          totalAmount: 401.00,
          businessDate: yesterday,
          collectionTimestamp: `${yesterday}T07:15:00Z`,
          deviceId: 'KIOSK_42_A',
        },
      ],
    };

    const res = await bulkUseCase.execute({
      organizationId: orgAlpha,
      operatorId: operatorAlpha,
      operatorName: 'Operator Audit Alpha 4.2',
      authenticatedDeviceId: 'KIOSK_42_A',
      requestId: 'req-cross-session',
      batch,
    });

    assert.strictEqual(res.summary.rejected, 1);
    assert.strictEqual(res.results[0].status, 'REJECTED');
    assert.strictEqual(res.results[0].errorCode, 'OFFLINE_SESSION_MISMATCH');
  });

  // 1i. Business Date Mismatch -> OFFLINE_BUSINESS_DATE_MISMATCH
  await suite.test('1i. Business Date Mismatch: Authorization date does not match session date', async () => {
    const wrongDateAuth = offlineSessionAuthService.generateAuthorization({
      organizationId: orgAlpha,
      centerId: centerAlpha,
      sessionId: sessionAlphaClosed,
      sessionCode: 'SES-42-CLOSED',
      businessDate: '2026-01-01', // Wrong business date
      shift: 'MORNING',
      deviceIdentifier: 'KIOSK_42_A',
      operatorId: operatorAlpha,
      timezone: 'Asia/Kolkata',
      validFrom: `${yesterday}T06:00:00Z`,
      validUntil: `${yesterday}T12:00:00Z`,
    });

    const batch = {
      batchId: crypto.randomUUID(),
      schemaVersion: 1,
      deviceId: 'KIOSK_42_A',
      offlineAuthorizationToken: wrongDateAuth.token,
      transactions: [
        {
          clientIntakeUuid: crypto.randomUUID(),
          idempotencyKey: `CLOSED-DATE-MISMATCH-${Date.now()}`,
          customerId: customerAlpha,
          sessionId: sessionAlphaClosed,
          milkCategory: 'COW',
          weightLiters: 10.0,
          fatPercentage: 4.0,
          snfPercentage: 8.5,
          ratePerLiter: 40.10,
          totalAmount: 401.00,
          businessDate: yesterday,
          collectionTimestamp: `${yesterday}T07:15:00Z`,
          deviceId: 'KIOSK_42_A',
        },
      ],
    };

    const res = await bulkUseCase.execute({
      organizationId: orgAlpha,
      operatorId: operatorAlpha,
      operatorName: 'Operator Audit Alpha 4.2',
      authenticatedDeviceId: 'KIOSK_42_A',
      requestId: 'req-date-mismatch',
      batch,
    });

    assert.strictEqual(res.summary.rejected, 1);
    assert.strictEqual(res.results[0].status, 'REJECTED');
    assert.strictEqual(res.results[0].errorCode, 'OFFLINE_BUSINESS_DATE_MISMATCH');
  });

  // 1j. Key Rotation / Secret Isolation
  await suite.test('1j. Key Rotation / Secret Isolation: Token signed with different secret is rejected', () => {
    const rotatedService = new OfflineSessionAuthorizationService('different-secret-key-that-does-not-match');
    const foreignAuth = rotatedService.generateAuthorization({
      organizationId: orgAlpha,
      centerId: centerAlpha,
      sessionId: sessionAlphaClosed,
      sessionCode: 'SES-42-CLOSED',
      businessDate: yesterday,
      shift: 'MORNING',
      deviceIdentifier: 'KIOSK_42_A',
      operatorId: operatorAlpha,
    });

    const verifyResult = offlineSessionAuthService.verifyToken(foreignAuth.token);
    assert.strictEqual(verifyResult.isValid, false);
    assert.strictEqual(verifyResult.errorCode, 'OFFLINE_AUTHORIZATION_INVALID');
  });

  // ==========================================================================
  // SECTION 2: Financial Precision & Commercial HALF_UP Rounding (P1)
  // ==========================================================================

  await suite.test('2a. HALF_UP Commercial Rounding Boundaries: Exact paise precision at .5 midpoint', () => {
    // ₹31.505 boundary -> rounds UP to 31.51
    assert.strictEqual(roundHalfUp(31.505, 2), 31.51, '31.505 must round up to 31.51');

    // ₹31.504 boundary -> rounds DOWN to 31.50
    assert.strictEqual(roundHalfUp(31.504, 2), 31.50, '31.504 must round down to 31.50');

    // ₹10.005 boundary -> 10.01
    assert.strictEqual(roundHalfUp(10.005, 2), 10.01);
    assert.strictEqual(roundHalfUp(10.0049, 2), 10.00);

    // Multi-decimal arithmetic without drift
    assert.strictEqual(roundHalfUp(10.55 * 40.10, 2), 423.06); // 423.055 -> 423.06
    assert.strictEqual(roundHalfUp(12.345 * 45.67, 2), 563.80);
    assert.strictEqual(roundHalfUp(35.555, 2), 35.56);
    assert.strictEqual(roundHalfUp(35.554, 2), 35.55);

    // Repeated calculations on identical inputs
    for (let i = 0; i < 100; i++) {
      assert.strictEqual(roundHalfUp(31.505, 2), 31.51);
    }
  });

  await suite.test('2b. RateService Authoritative Rate Validation: Strict exact-paise comparison without loose tolerances', async () => {
    // Exact match
    const exact = await RateService.validateHistoricalRate({
      organizationId: orgAlpha,
      milkCategory: 'COW',
      fat: 4.0,
      snf: 8.5,
      weightLiters: 10.55,
      ratePerLiter: 40.10,
      totalAmount: 423.06, // 10.55 * 40.10 = 423.055 -> 423.06
      businessDate: today,
      rateChartVersionId: verCowAlpha1,
    });
    assert.strictEqual(exact.isValid, true);
    assert.strictEqual(exact.authoritativeTotal, 423.06);

    // 1-paise total discrepancy (submitted 423.05 instead of authoritative 423.06) -> Must be rejected!
    const drift = await RateService.validateHistoricalRate({
      organizationId: orgAlpha,
      milkCategory: 'COW',
      fat: 4.0,
      snf: 8.5,
      weightLiters: 10.55,
      ratePerLiter: 40.10,
      totalAmount: 423.05, // Off by 1 paise!
      businessDate: today,
      rateChartVersionId: verCowAlpha1,
    });
    assert.strictEqual(drift.isValid, false);
    assert.strictEqual(drift.errorCode, 'TOTAL_AMOUNT_MISMATCH');
  });

  // ==========================================================================
  // SECTION 3: FORMULA & GRID Rate Matrix Parity (P1)
  // ==========================================================================

  await suite.test('3a. FORMULA Calculation: Base rate + increments without arbitrary fallbacks', async () => {
    // Formula for Beta: base_rate = 42.0, base_fat = 4.0, base_snf = 8.5, fatFactor = 4.5, snfFactor = 3.5
    // Milk: Fat 4.2, SNF 8.7
    // Rate = 42.0 + (4.2 - 4.0)*4.5 + (8.7 - 8.5)*3.5 = 42.0 + 0.90 + 0.70 = 43.60
    const val = await RateService.validateHistoricalRate({
      organizationId: orgBeta,
      milkCategory: 'COW',
      fat: 4.2,
      snf: 8.7,
      weightLiters: 15.0,
      ratePerLiter: 43.60,
      totalAmount: roundHalfUp(15.0 * 43.60, 2), // 654.00
      businessDate: today,
      rateChartVersionId: verCowBeta1,
    });

    assert.strictEqual(val.isValid, true);
    assert.strictEqual(val.authoritativeRate, 43.60);
    assert.strictEqual(val.authoritativeTotal, 654.00);
  });

  await suite.test('3b. GRID Calculation: Missing cell strictly returns RATE_CELL_NOT_FOUND', async () => {
    // verCowAlpha1 does not have cell for Fat 5.8, SNF 9.9
    const missing = await RateService.validateHistoricalRate({
      organizationId: orgAlpha,
      milkCategory: 'COW',
      fat: 5.8,
      snf: 9.9,
      weightLiters: 10.0,
      ratePerLiter: 45.00,
      totalAmount: 450.00,
      businessDate: today,
      rateChartVersionId: verCowAlpha1,
    });

    assert.strictEqual(missing.isValid, false);
    assert.strictEqual(missing.errorCode, 'RATE_CELL_NOT_FOUND');
  });

  // ==========================================================================
  // SECTION 4: Concurrency & PostgreSQL Double-Entry Ledger Consistency (P0)
  // ==========================================================================

  await suite.test('4. PostgreSQL Concurrency: Parallel submissions with same authorization remain atomic and uncorrupted', async () => {
    const auth = offlineSessionAuthService.generateAuthorization({
      organizationId: orgAlpha,
      centerId: centerAlpha,
      sessionId: sessionAlphaClosed,
      sessionCode: 'SES-42-CLOSED',
      businessDate: yesterday,
      shift: 'MORNING',
      deviceIdentifier: 'KIOSK_42_A',
      operatorId: operatorAlpha,
      timezone: 'Asia/Kolkata',
      validFrom: `${yesterday}T06:00:00Z`,
      validUntil: `${yesterday}T12:00:00Z`,
    });

    let targetDb;
    try {
      targetDb = await tenantDbManager.getTenantDb(orgAlpha);
    } catch {
      targetDb = db;
    }

    const initialLedger = await targetDb.query(
      `SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1 AND organization_id = $2`,
      [customerAlpha, orgAlpha]
    );
    const startBalance = parseFloat(initialLedger.rows[0]?.current_balance || '0');

    // 4a. Parallel race condition: Two concurrent requests with the identical idempotency key
    const raceIdempotencyKey = `RACE-42-${Date.now()}`;
    const raceItem = {
      clientIntakeUuid: crypto.randomUUID(),
      idempotencyKey: raceIdempotencyKey,
      customerId: customerAlpha,
      sessionId: sessionAlphaClosed,
      milkCategory: 'COW',
      weightLiters: 10.0,
      fatPercentage: 4.0,
      snfPercentage: 8.5,
      ratePerLiter: 40.10,
      totalAmount: 401.00,
      businessDate: yesterday,
      collectionTimestamp: `${yesterday}T07:25:00Z`,
      deviceId: 'KIOSK_42_A',
      offlineAuthorizationToken: auth.token,
    };

    const [raceRes1, raceRes2] = await Promise.all([
      bulkUseCase.execute({
        organizationId: orgAlpha,
        operatorId: operatorAlpha,
        operatorName: 'Operator Audit Alpha 4.2',
        authenticatedDeviceId: 'KIOSK_42_A',
        requestId: 'req-race-1',
        batch: {
          batchId: crypto.randomUUID(),
          schemaVersion: 1,
          deviceId: 'KIOSK_42_A',
          transactions: [raceItem],
        },
      }),
      bulkUseCase.execute({
        organizationId: orgAlpha,
        operatorId: operatorAlpha,
        operatorName: 'Operator Audit Alpha 4.2',
        authenticatedDeviceId: 'KIOSK_42_A',
        requestId: 'req-race-2',
        batch: {
          batchId: crypto.randomUUID(),
          schemaVersion: 1,
          deviceId: 'KIOSK_42_A',
          transactions: [raceItem],
        },
      }),
    ]);

    const statuses = [raceRes1.results[0].status, raceRes2.results[0].status].sort();
    assert.deepStrictEqual(statuses, ['ACCEPTED', 'REPLAYED'], 'Exactly one concurrent request must win (ACCEPTED) and one must replay (REPLAYED)');

    // Verify ledger incremented by exactly 1 * 401.00, not double-counted
    const ledgerAfterRace = await targetDb.query(
      `SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1 AND organization_id = $2`,
      [customerAlpha, orgAlpha]
    );
    const balanceAfterRace = parseFloat(ledgerAfterRace.rows[0].current_balance);
    assert.strictEqual(balanceAfterRace, roundHalfUp(startBalance + 401.00, 2), 'Concurrent identical submissions must post exactly one credit');

    // 4b. Multi-transaction offline batch under one authorization
    const multiBatch = {
      batchId: crypto.randomUUID(),
      schemaVersion: 1,
      deviceId: 'KIOSK_42_A',
      offlineAuthorizationToken: auth.token,
      transactions: [
        {
          clientIntakeUuid: crypto.randomUUID(),
          idempotencyKey: `MULTI-42-1-${Date.now()}`,
          customerId: customerAlpha,
          sessionId: sessionAlphaClosed,
          milkCategory: 'COW',
          weightLiters: 10.0,
          fatPercentage: 4.0,
          snfPercentage: 8.5,
          ratePerLiter: 40.10,
          totalAmount: 401.00,
          businessDate: yesterday,
          collectionTimestamp: `${yesterday}T07:26:00Z`,
          deviceId: 'KIOSK_42_A',
        },
        {
          clientIntakeUuid: crypto.randomUUID(),
          idempotencyKey: `MULTI-42-2-${Date.now()}`,
          customerId: customerAlpha,
          sessionId: sessionAlphaClosed,
          milkCategory: 'COW',
          weightLiters: 10.0,
          fatPercentage: 4.0,
          snfPercentage: 8.5,
          ratePerLiter: 40.10,
          totalAmount: 401.00,
          businessDate: yesterday,
          collectionTimestamp: `${yesterday}T07:27:00Z`,
          deviceId: 'KIOSK_42_A',
        },
      ],
    };

    const multiRes = await bulkUseCase.execute({
      organizationId: orgAlpha,
      operatorId: operatorAlpha,
      operatorName: 'Operator Audit Alpha 4.2',
      authenticatedDeviceId: 'KIOSK_42_A',
      requestId: 'req-multi-offline',
      batch: multiBatch,
    });

    assert.strictEqual(multiRes.summary.accepted, 2);

    const endLedger = await targetDb.query(
      `SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1 AND organization_id = $2`,
      [customerAlpha, orgAlpha]
    );
    const expectedEndBalance = roundHalfUp(balanceAfterRace + 2 * 401.00, 2);
    const actualEndBalance = parseFloat(endLedger.rows[0].current_balance);
    assert.strictEqual(actualEndBalance, expectedEndBalance, 'Farmer ledger balance must increment by exactly 2 * 401.00');
  });

  // ==========================================================================
  // SECTION 5: Active Session Issuance Contract Verification
  // ==========================================================================

  await suite.test('5. Session Route Contract: GET /sessions/active returns offlineAuthorization lease for open session', async () => {
    const res = await request(app)
      .get('/api/v1/collections/sessions/active')
      .set('Authorization', `Bearer ${tokenAlpha}`)
      .set('x-dairy-tenant-id', orgAlpha)
      .query({ deviceId: 'KIOSK_42_A' });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data.offlineAuthorization, 'Active session must include offlineAuthorization lease');
    assert.ok(res.body.data.offlineAuthorization.token, 'Offline authorization lease must include signed token');
    assert.strictEqual(res.body.data.offlineAuthorization.payload.organizationId, orgAlpha);
    assert.strictEqual(res.body.data.offlineAuthorization.payload.deviceIdentifier, 'KIOSK_42_A');

    // Verify token cryptographically
    const verify = offlineSessionAuthService.verifyToken(res.body.data.offlineAuthorization.token);
    assert.strictEqual(verify.isValid, true);
  });
});
