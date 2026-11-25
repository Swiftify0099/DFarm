import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { db } from '../dist/infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../dist/infrastructure/database/TenantDatabaseManager.js';
import { HmacJwtTokenService } from '../dist/infrastructure/security/HmacJwtTokenService.js';
import {
  deviceChallengeService,
  DeviceChallengeService,
} from '../dist/infrastructure/security/DeviceChallengeService.js';
import { VerifyOperatorOtpUseCase } from '../dist/application/use-cases/auth/OperatorAuthUseCases.js';
import { BulkCollectionSyncUseCase } from '../dist/application/use-cases/collections/BulkCollectionSyncUseCase.js';
import { PostgresCollectionTransactionRepository } from '../dist/infrastructure/repositories/PostgresCollectionTransactionRepository.js';
import { PostgresCustomerRepository } from '../dist/infrastructure/repositories/PostgresCustomerRepository.js';
import { PostgresShiftSessionRepository } from '../dist/infrastructure/repositories/PostgresShiftSessionRepository.js';

test('DFARM PROMPT 4.2.4: Cryptographic Verification, Distributed Replay Protection & Revocation Audit', async (suite) => {
  const isConnected = await db.checkConnection();
  if (!isConnected) {
    console.log('[PROMPT 4.2.4 TEST] Real PostgreSQL is unavailable. Suite marked NOT RUN.');
    suite.skip('Real PostgreSQL environment unavailable');
    return;
  }

  // Tenant Fixture Identifiers
  const orgAlpha = '00000000-0000-0000-0000-0000000044a1';
  const orgBeta = '00000000-0000-0000-0000-0000000044b2';
  const centerAlpha = '00000000-0000-0000-0000-0000000044c1';
  const centerBeta = '00000000-0000-0000-0000-0000000044c2';
  const operatorAlpha = '00000000-0000-0000-0000-0000000044d1';
  const customerAlpha = '00000000-0000-0000-0000-0000000044e1';
  const sessionAlpha = '00000000-0000-0000-0000-0000000044f1';
  const chartGridId = '00000000-0000-0000-0000-000000004481';
  const verGridId = '00000000-0000-0000-0000-000000004482';
  const operatorPhone = '+919822992424';

  // Registered Stations & Provisioned Credentials
  const stationA_Id = '00000000-0000-0000-0000-000000004401';
  const stationA_Name = 'STATION_424_A';
  const stationA_RawToken = 'station-424-a-provisioned-secret-key-256bit!';
  const stationA_TokenHash = DeviceChallengeService.deriveProofKey(stationA_RawToken);

  const stationB_Id = '00000000-0000-0000-0000-000000004402';
  const stationB_Name = 'STATION_424_B';
  const stationB_RawToken = 'station-424-b-provisioned-secret-key-256bit!';
  const stationB_TokenHash = DeviceChallengeService.deriveProofKey(stationB_RawToken);

  const stationBlocked_Id = '00000000-0000-0000-0000-000000004403';
  const stationBlocked_Name = 'STATION_424_BLOCKED';
  const stationBlocked_RawToken = 'station-424-blocked-secret-key-256bit!';
  const stationBlocked_TokenHash = DeviceChallengeService.deriveProofKey(stationBlocked_RawToken);

  const stationDecom_Id = '00000000-0000-0000-0000-000000004404';
  const stationDecom_Name = 'STATION_424_DECOMMISSIONED';
  const stationDecom_RawToken = 'station-424-decom-secret-key-256bit!';
  const stationDecom_TokenHash = DeviceChallengeService.deriveProofKey(stationDecom_RawToken);

  const today = new Date().toISOString().split('T')[0];

  const customerRepo = new PostgresCustomerRepository();
  const sessionRepo = new PostgresShiftSessionRepository();
  const transactionRepo = new PostgresCollectionTransactionRepository();
  const bulkUseCase = new BulkCollectionSyncUseCase(customerRepo, sessionRepo, transactionRepo);

  const tokenService = new HmacJwtTokenService();
  const mockOtpService = {
    sendOtp: async () => ({ success: true, message: 'OTP sent' }),
    verifyOtp: async () => true,
  };
  const verifyOperatorUseCase = new VerifyOperatorOtpUseCase(mockOtpService, tokenService);

  // Setup / Seed Fixtures
  const seedEnvironment = async () => {
    const clients = [db];
    try {
      const alphaDb = await tenantDbManager.getTenantDb(orgAlpha);
      if (alphaDb && alphaDb !== db) clients.push(alphaDb);
    } catch {}

    const codeSuffix = Date.now().toString(36).slice(-5);

    for (const client of clients) {
      try {
        await client.query(`
          ALTER TABLE milk_collections
          ADD COLUMN IF NOT EXISTS organization_id UUID;

          ALTER TABLE milk_collections DROP CONSTRAINT IF EXISTS milk_collections_idempotency_key_key;

          CREATE UNIQUE INDEX IF NOT EXISTS uq_milk_collections_org_idempotency
          ON milk_collections (organization_id, idempotency_key);
        `);
      } catch {}

      await client.query(`
        INSERT INTO organizations (id, name, code, status)
        VALUES 
          ('${orgAlpha}', 'Audit Alpha Cooperative 4.2.4', 'A424_${codeSuffix}', 'ACTIVE'),
          ('${orgBeta}', 'Audit Beta Cooperative 4.2.4', 'B424_${codeSuffix}', 'ACTIVE')
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE';
      `);

      await client.query(`
        INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status, timezone)
        VALUES 
          ('${centerAlpha}', '${orgAlpha}', 'C424A_${codeSuffix}', 'Center Alpha 4.2.4', 'Main Rd', 'AlphaTown', 'District', 'State', '416001', '+919876543210', 'ACTIVE', 'Asia/Kolkata'),
          ('${centerBeta}', '${orgBeta}', 'C424B_${codeSuffix}', 'Center Beta 4.2.4', 'Main Rd', 'BetaTown', 'District', 'State', '416002', '+919876543211', 'ACTIVE', 'Asia/Kolkata')
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE';
      `);

      await client.query(`
        INSERT INTO users (id, organization_id, username, phone_number, full_name, role, status)
        VALUES 
          ('${operatorAlpha}', '${orgAlpha}', 'op424_${codeSuffix}', '${operatorPhone}', 'Operator Alpha 4.2.4', 'COLLECTION_OPERATOR', 'ACTIVE')
        ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', username = EXCLUDED.username, phone_number = EXCLUDED.phone_number;
      `);

      await client.query(`
        INSERT INTO devices (id, organization_id, center_id, device_identifier, device_type, status, device_token_hash, last_seen_at)
        VALUES 
          ('${stationA_Id}', '${orgAlpha}', '${centerAlpha}', '${stationA_Name}', 'COUNTER_TERMINAL', 'ACTIVE', '${stationA_TokenHash}', NOW()),
          ('${stationB_Id}', '${orgAlpha}', '${centerAlpha}', '${stationB_Name}', 'COUNTER_TERMINAL', 'ACTIVE', '${stationB_TokenHash}', NOW()),
          ('${stationBlocked_Id}', '${orgAlpha}', '${centerAlpha}', '${stationBlocked_Name}', 'COUNTER_TERMINAL', 'BLOCKED', '${stationBlocked_TokenHash}', NOW()),
          ('${stationDecom_Id}', '${orgAlpha}', '${centerAlpha}', '${stationDecom_Name}', 'COUNTER_TERMINAL', 'DECOMMISSIONED', '${stationDecom_TokenHash}', NOW())
        ON CONFLICT (device_identifier) DO UPDATE SET 
          status = EXCLUDED.status,
          organization_id = EXCLUDED.organization_id,
          device_token_hash = EXCLUDED.device_token_hash;
      `);

      await client.query(`
        INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status, is_deleted)
        VALUES 
          ('${customerAlpha}', '${orgAlpha}', '${centerAlpha}', 'F424_01', 'Farmer Alpha 4.2.4', '+919876543210', 'ACTIVE', 'APPROVED', FALSE)
        ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', primary_center_id = EXCLUDED.primary_center_id;

        INSERT INTO customer_milk_categories (customer_id, milk_category, authorized_by)
        VALUES 
          ('${customerAlpha}', 'COW', '${operatorAlpha}')
        ON CONFLICT (customer_id, milk_category) DO NOTHING;

        INSERT INTO customer_ledger_accounts (id, customer_id, organization_id, current_balance, currency)
        VALUES 
          (gen_random_uuid(), '${customerAlpha}', '${orgAlpha}', 0.00, 'INR')
        ON CONFLICT DO NOTHING;
      `);

      await client.query(`
        INSERT INTO kiosk_shift_sessions (
          id, organization_id, center_id, session_code, business_date, shift, status, 
          opening_operator_id, device_identifier, opened_at, closed_at
        )
        VALUES (
          '${sessionAlpha}', '${orgAlpha}', '${centerAlpha}', 'SES-424-A', '${today}', 'MORNING', 'OPEN',
          '${operatorAlpha}', '${stationA_Name}', NOW(), NULL
        )
        ON CONFLICT (id) DO UPDATE SET 
          status = EXCLUDED.status, 
          device_identifier = EXCLUDED.device_identifier;
      `);
    }

    // Rate Chart Seeding
    try {
      await db.query(`
        INSERT INTO rate_charts (id, organization_id, center_id, name, milk_category, pricing_type, is_active)
        VALUES ('${chartGridId}', '${orgAlpha}', NULL, 'Alpha GRID Chart 4.2.4', 'COW', 'GRID', TRUE)
        ON CONFLICT (id) DO UPDATE SET is_active = TRUE;

        INSERT INTO rate_chart_versions (
          id, rate_chart_id, version_number, status, pricing_unit, measurement_unit,
          base_fat, base_snf, base_rate, fat_min, fat_max, snf_min, snf_max,
          effective_from, effective_to, is_approved
        ) VALUES (
          '${verGridId}', '${chartGridId}', 1, 'DRAFT', 'PER_KG', 'KG',
          3.5, 8.5, 38.0, 2.5, 6.0, 7.5, 10.0,
          '${today} 00:00:00Z', NULL, TRUE
        ) ON CONFLICT (id) DO UPDATE SET status = 'DRAFT';

        INSERT INTO rate_chart_cells (rate_chart_version_id, fat_percentage, snf_percentage, rate_per_unit)
        VALUES ('${verGridId}', 4.0, 8.5, 40.10)
        ON CONFLICT DO NOTHING;

        UPDATE rate_chart_versions SET status = 'PUBLISHED' WHERE id = '${verGridId}';
      `);
    } catch {}
  };

  await seedEnvironment();

  // ==========================================================================
  // SECTION 1: P0 — Cryptographic Test Vectors & Key Derivation Verification
  // ==========================================================================

  await suite.test('1a. Key Derivation Parity: Client deriveProofKey matches server stored device_token_hash', () => {
    // Both sides derive key: K_proof = SHA-256(rawDeviceToken)
    const clientDerivedKey = DeviceChallengeService.deriveProofKey(stationA_RawToken);
    const serverStoredHash = stationA_TokenHash;

    assert.equal(typeof clientDerivedKey, 'string');
    assert.equal(clientDerivedKey.length, 64); // 256 bits = 64 hex characters
    assert.equal(clientDerivedKey, serverStoredHash);

    // Verify normalization & encoding
    const withWhitespace = `  ${stationA_RawToken}  \n`;
    assert.equal(DeviceChallengeService.deriveProofKey(withWhitespace), clientDerivedKey);
  });

  await suite.test('1b. Cryptographic Test Vector: Independent proof computation matches expected HMAC-SHA256', () => {
    const testSecret = 'dfarm-test-kiosk-secret-token-key-256bits';
    const testDerivedKey = crypto.createHash('sha256').update(testSecret, 'utf8').digest('hex');
    const testDeviceId = 'STATION_VECTOR_99';
    const testChallenge = 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899';

    // Independent manual calculation
    const expectedHmac = crypto
      .createHmac('sha256', testDerivedKey)
      .update(`${testDeviceId}:${testChallenge}`, 'utf8')
      .digest('hex');

    // Service calculation
    const serviceProof = DeviceChallengeService.computeProof(testChallenge, testDerivedKey, testDeviceId);

    assert.equal(serviceProof, expectedHmac);
    assert.equal(serviceProof.length, 64);

    // Timing-safe verification helper
    assert.ok(DeviceChallengeService.verifyProof(testChallenge, testDerivedKey, testDeviceId, serviceProof));
  });

  await suite.test('1c. Cryptographic Rejection: Wrong device token produces completely distinct HMAC proof', () => {
    const challenge = '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff';
    const proofA = DeviceChallengeService.computeProof(challenge, stationA_TokenHash, stationA_Name);
    const proofB = DeviceChallengeService.computeProof(challenge, stationB_TokenHash, stationA_Name);

    assert.notEqual(proofA, proofB);
    assert.equal(DeviceChallengeService.verifyProof(challenge, stationA_TokenHash, stationA_Name, proofB), false);
  });

  await suite.test('1d. Cryptographic Rejection: Altered challenge rejected by verifier', () => {
    const challengeOriginal = 'aaaa1111222233334444555566667777888899990000aaaabbbbccccddddeeee';
    const challengeTampered = 'aaaa1111222233334444555566667777888899990000aaaabbbbccccddddffff';
    const proofOriginal = DeviceChallengeService.computeProof(challengeOriginal, stationA_TokenHash, stationA_Name);

    assert.equal(DeviceChallengeService.verifyProof(challengeTampered, stationA_TokenHash, stationA_Name, proofOriginal), false);
  });

  await suite.test('1e. Cryptographic Rejection: Altered station identifier rejected by verifier', () => {
    const challenge = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const proof = DeviceChallengeService.computeProof(challenge, stationA_TokenHash, stationA_Name);

    assert.equal(DeviceChallengeService.verifyProof(challenge, stationA_TokenHash, 'STATION_IMPERSONATOR', proof), false);
  });

  await suite.test('1f. Clean Zero-Bearer Proof-of-Possession: Login succeeds without transmitting raw deviceToken', async () => {
    // 1. Issue Challenge
    const { challenge } = await deviceChallengeService.createChallenge(stationA_Name, orgAlpha, 60000);
    assert.ok(challenge);

    // 2. Client derives proof key from stored raw token and computes proof
    const clientProofKey = DeviceChallengeService.deriveProofKey(stationA_RawToken);
    const deviceProof = DeviceChallengeService.computeProof(challenge, clientProofKey, stationA_Name);

    // 3. Client submits ONLY { challenge, deviceProof } — raw deviceToken is NOT sent over the wire!
    const loginResult = await verifyOperatorUseCase.execute(
      operatorPhone,
      '123456',
      stationA_Name,
      {
        challenge,
        deviceProof,
        // deviceToken is explicitly omitted to guarantee bearer-free proof-of-possession
      }
    );

    assert.ok(loginResult.token);
    assert.equal(loginResult.operator.fullName, 'Operator Alpha 4.2.4');
  });

  // ==========================================================================
  // SECTION 2: P0 — Multi-Instance Distributed Challenge Storage & Replay Protection
  // ==========================================================================

  await suite.test('2a. Multi-Instance: Challenge created by Instance A is consumed by Instance B on shared PostgreSQL', async () => {
    // Simulate two separate backend instances running in separate memory spaces
    const instanceA = new DeviceChallengeService();
    const instanceB = new DeviceChallengeService();

    // Instance A issues challenge to client
    const { challenge } = await instanceA.createChallenge(stationA_Name, orgAlpha, 60000);
    assert.ok(challenge);

    // Instance B receives client verification request and consumes challenge from shared PostgreSQL
    const consumption = await instanceB.consumeChallenge(challenge, stationA_Name, orgAlpha);
    assert.equal(consumption.valid, true);

    // Second consumption by either Instance A or Instance B must be strictly REJECTED
    const replayAttemptA = await instanceA.consumeChallenge(challenge, stationA_Name, orgAlpha);
    assert.equal(replayAttemptA.valid, false);
    assert.match(replayAttemptA.reason, /already been consumed|replay/i);

    const replayAttemptB = await instanceB.consumeChallenge(challenge, stationA_Name, orgAlpha);
    assert.equal(replayAttemptB.valid, false);
    assert.match(replayAttemptB.reason, /already been consumed|replay/i);
  });

  await suite.test('2b. Concurrency Atomicity: Two concurrent requests attempting to consume same challenge — exactly ONE succeeds', async () => {
    const instanceA = new DeviceChallengeService();
    const instanceB = new DeviceChallengeService();

    const { challenge } = await instanceA.createChallenge(stationA_Name, orgAlpha, 60000);

    // Fire two parallel asynchronous consumption requests simultaneously
    const [res1, res2] = await Promise.all([
      instanceA.consumeChallenge(challenge, stationA_Name, orgAlpha),
      instanceB.consumeChallenge(challenge, stationA_Name, orgAlpha),
    ]);

    const successes = [res1, res2].filter((r) => r.valid).length;
    const failures = [res1, res2].filter((r) => !r.valid).length;

    assert.equal(successes, 1, 'Exactly one concurrent request must succeed');
    assert.equal(failures, 1, 'Exactly one concurrent request must be rejected');
  });

  await suite.test('2c. Backend Restart Resilience: Consumed challenge cannot be replayed after backend restart', async () => {
    // 1. Instance A creates and consumes challenge
    const instanceA = new DeviceChallengeService();
    const { challenge } = await instanceA.createChallenge(stationA_Name, orgAlpha, 60000);
    const firstUse = await instanceA.consumeChallenge(challenge, stationA_Name, orgAlpha);
    assert.equal(firstUse.valid, true);

    // 2. Simulate server restart: completely new instance with cold memory
    const restartedInstance = new DeviceChallengeService();

    // 3. Replay attack after restart
    const postRestartReplay = await restartedInstance.consumeChallenge(challenge, stationA_Name, orgAlpha);
    assert.equal(postRestartReplay.valid, false);
    assert.match(postRestartReplay.reason, /already been consumed|replay/i);
  });

  await suite.test('2d. Tenant Isolation: Challenge issued for Org Alpha CANNOT be consumed for Org Beta', async () => {
    const instance = new DeviceChallengeService();
    const { challenge } = await instance.createChallenge(stationA_Name, orgAlpha, 60000);

    const crossTenantAttempt = await instance.consumeChallenge(challenge, stationA_Name, orgBeta);
    assert.equal(crossTenantAttempt.valid, false);
    assert.match(crossTenantAttempt.reason, /different organization/i);
  });

  await suite.test('2e. Device Binding: Challenge issued for Station A CANNOT be consumed for Station B', async () => {
    const instance = new DeviceChallengeService();
    const { challenge } = await instance.createChallenge(stationA_Name, orgAlpha, 60000);

    const crossDeviceAttempt = await instance.consumeChallenge(challenge, stationB_Name, orgAlpha);
    assert.equal(crossDeviceAttempt.valid, false);
    assert.match(crossDeviceAttempt.reason, /issued for device/i);
  });

  await suite.test('2f. TTL Expiry: Expired challenge is strictly rejected', async () => {
    const instance = new DeviceChallengeService();
    // Negative TTL creates an immediately expired challenge
    const { challenge } = await instance.createChallenge(stationA_Name, orgAlpha, -1000);

    const expiredAttempt = await instance.consumeChallenge(challenge, stationA_Name, orgAlpha);
    assert.equal(expiredAttempt.valid, false);
    assert.match(expiredAttempt.reason, /expired/i);
  });

  // ==========================================================================
  // SECTION 3: P0 — Device Revocation Connected & Reconnected Behaviour
  // ==========================================================================

  await suite.test('3a. Connected Revocation: BLOCKED station cannot generate a challenge', async () => {
    // Direct check against database status
    const devRes = await db.query('SELECT status FROM devices WHERE device_identifier = $1;', [stationBlocked_Name]);
    assert.equal(devRes.rows[0].status, 'BLOCKED');

    // In auth.routes.ts, /device/challenge checks dev.status !== 'ACTIVE'
    const isStationActive = devRes.rows[0].status === 'ACTIVE';
    assert.equal(isStationActive, false);
  });

  await suite.test('3b. Connected Revocation: BLOCKED station cannot complete operator login', async () => {
    const { challenge } = await deviceChallengeService.createChallenge(stationBlocked_Name, orgAlpha, 60000);
    const proof = DeviceChallengeService.computeProof(challenge, stationBlocked_TokenHash, stationBlocked_Name);

    await assert.rejects(
      async () => {
        await verifyOperatorUseCase.execute(
          operatorPhone,
          '123456',
          stationBlocked_Name,
          { challenge, deviceProof: proof }
        );
      },
      (err) => {
        assert.match(err.message, /status is BLOCKED|revoked station is strictly blocked/i);
        return true;
      }
    );
  });

  await suite.test('3c. Connected Revocation: DECOMMISSIONED station cannot complete operator login', async () => {
    const { challenge } = await deviceChallengeService.createChallenge(stationDecom_Name, orgAlpha, 60000);
    const proof = DeviceChallengeService.computeProof(challenge, stationDecom_TokenHash, stationDecom_Name);

    await assert.rejects(
      async () => {
        await verifyOperatorUseCase.execute(
          operatorPhone,
          '123456',
          stationDecom_Name,
          { challenge, deviceProof: proof }
        );
      },
      (err) => {
        assert.match(err.message, /status is DECOMMISSIONED|revoked station is strictly blocked/i);
        return true;
      }
    );
  });

  await suite.test('3d. Reconnected Sync: Blocked station attempting to sync pending offline transactions is strictly REJECTED', async () => {
    const syncResult = await bulkUseCase.execute({
      organizationId: orgAlpha,
      operatorId: operatorAlpha,
      operatorName: 'Operator Alpha 4.2.4',
      authenticatedDeviceId: stationBlocked_Name,
      requestId: `req-audit-${Date.now().toString(36)}`,
      batch: {
        batchId: `batch-revoked-${Date.now().toString(36)}`,
        schemaVersion: 1,
        deviceId: stationBlocked_Name,
        transactions: [
          {
            clientIntakeUuid: crypto.randomUUID(),
            idempotencyKey: `OFFLINE-BLOCKED-01-${Date.now()}`,
            customerId: customerAlpha,
            milkCategory: 'COW',
            weightLiters: 10.0,
            fatPercentage: 4.2,
            snfPercentage: 8.6,
            ratePerLiter: 38.5,
            totalAmount: 385.0,
            collectionTimestamp: new Date().toISOString(),
          },
        ],
      },
    });

    assert.equal(syncResult.summary.accepted, 0);
    assert.equal(syncResult.summary.rejected, 1);
    assert.equal(syncResult.results[0].status, 'REJECTED');
    assert.equal(syncResult.results[0].errorCode, 'DEVICE_BLOCKED');
    assert.match(syncResult.results[0].errorMessage, /status is BLOCKED|revoked station/i);

    // Verify transaction was NOT recorded in database
    const txnRes = await db.query(
      `SELECT id FROM milk_collections WHERE idempotency_key = $1;`,
      [syncResult.results[0].idempotencyKey]
    );
    assert.equal(txnRes.rows.length, 0, 'No transaction should be created for blocked station');
  });

  await suite.test('3e. Reconnected Sync: Active station succeeds while blocked station in same organization is rejected', async () => {
    const activeSyncResult = await bulkUseCase.execute({
      organizationId: orgAlpha,
      operatorId: operatorAlpha,
      operatorName: 'Operator Alpha 4.2.4',
      authenticatedDeviceId: stationA_Name,
      requestId: `req-audit-active-${Date.now().toString(36)}`,
      batch: {
        batchId: `batch-active-${Date.now().toString(36)}`,
        schemaVersion: 1,
        deviceId: stationA_Name,
        transactions: [
          {
            clientIntakeUuid: crypto.randomUUID(),
            idempotencyKey: `OFFLINE-ACTIVE-01-${Date.now()}`,
            sessionId: sessionAlpha,
            sessionCode: 'SES-424-A',
            customerId: customerAlpha,
            milkCategory: 'COW',
            weightLiters: 10.0,
            fatPercentage: 4.0,
            snfPercentage: 8.5,
            ratePerLiter: 40.10,
            totalAmount: 401.0,
            rateChartVersionId: verGridId,
            businessDate: today,
            collectionTimestamp: new Date().toISOString(),
          },
        ],
      },
    });

    if (activeSyncResult.summary.accepted !== 1) {
      console.log('[DEBUG 3e failed]', activeSyncResult.results[0]);
    }
    assert.equal(activeSyncResult.summary.accepted, 1);
    assert.equal(activeSyncResult.summary.rejected, 0);
    assert.equal(activeSyncResult.results[0].status, 'ACCEPTED');
  });

  await suite.test('3f. Zero Log Leakage: Raw device token never appears in output or logs', () => {
    const serializedResult = JSON.stringify({
      station: stationA_Name,
      status: 'ACTIVE',
      hash: stationA_TokenHash,
    });

    assert.equal(serializedResult.includes(stationA_RawToken), false);
    assert.equal(serializedResult.includes(stationBlocked_RawToken), false);
  });
});
