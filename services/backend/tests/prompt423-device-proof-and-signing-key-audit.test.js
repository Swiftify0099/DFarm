import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { db } from '../dist/infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../dist/infrastructure/database/TenantDatabaseManager.js';
import { HmacJwtTokenService } from '../dist/infrastructure/security/HmacJwtTokenService.js';
import {
  offlineSessionAuthService,
  OfflineSessionAuthorizationService,
} from '../dist/infrastructure/security/OfflineSessionAuthorizationService.js';
import { PostgresCollectionTransactionRepository } from '../dist/infrastructure/repositories/PostgresCollectionTransactionRepository.js';
import { PostgresCustomerRepository } from '../dist/infrastructure/repositories/PostgresCustomerRepository.js';
import { PostgresShiftSessionRepository } from '../dist/infrastructure/repositories/PostgresShiftSessionRepository.js';
import { BulkCollectionSyncUseCase } from '../dist/application/use-cases/collections/BulkCollectionSyncUseCase.js';
import { VerifyOperatorOtpUseCase } from '../dist/application/use-cases/auth/OperatorAuthUseCases.js';
import { deviceChallengeService, DeviceChallengeService } from '../dist/infrastructure/security/DeviceChallengeService.js';
import { hashToken } from '../dist/security.js';
import { loadEnv, validateKeyEntropyAndByteLength } from '../dist/config/env.js';

const tokenService = new HmacJwtTokenService();

test('DFARM PROMPT 4.2.3: Device Proof-of-Possession & Production Signing Key Audit Suite', async (suite) => {
  const isConnected = await db.checkConnection();
  if (!isConnected) {
    console.log('[PROMPT 4.2.3 TEST] Real PostgreSQL connection is unavailable. Suite skipped.');
    suite.skip('Real PostgreSQL environment unavailable');
    return;
  }

  // Tenant Fixture Identifiers
  const orgAlpha = '00000000-0000-0000-0000-0000000043a1';
  const orgBeta = '00000000-0000-0000-0000-0000000043b2';
  const centerAlpha = '00000000-0000-0000-0000-0000000043c1';
  const centerBeta = '00000000-0000-0000-0000-0000000043c2';
  const operatorAlpha = '00000000-0000-0000-0000-0000000043d1';
  const customerAlpha = '00000000-0000-0000-0000-0000000043e1';
  const sessionAlpha = '00000000-0000-0000-0000-0000000043f1';

  // Registered Stations & Distinct Cryptographic Credentials
  const stationA_Id = '00000000-0000-0000-0000-000000004301';
  const stationA_Name = 'STATION_A';
  const stationA_Token = 'kiosk-station-a-secret-provisioning-credential-256bit-ok!';
  const stationA_Hash = hashToken(stationA_Token);

  const stationB_Id = '00000000-0000-0000-0000-000000004302';
  const stationB_Name = 'STATION_B';
  const stationB_Token = 'kiosk-station-b-secret-provisioning-credential-256bit-ok!';
  const stationB_Hash = hashToken(stationB_Token);

  const stationBlocked_Id = '00000000-0000-0000-0000-000000004303';
  const stationBlocked_Name = 'STATION_REVOKED_X';
  const stationBlocked_Token = 'kiosk-station-revoked-secret-credential-256bit-ok!';
  const stationBlocked_Hash = hashToken(stationBlocked_Token);

  const stationDecom_Id = '00000000-0000-0000-0000-000000004304';
  const stationDecom_Name = 'STATION_DECOMMISSIONED_Y';
  const stationDecom_Token = 'kiosk-station-decom-secret-credential-256bit-ok!';
  const stationDecom_Hash = hashToken(stationDecom_Token);

  const stationBeta_Id = '00000000-0000-0000-0000-000000004305';
  const stationBeta_Name = 'STATION_BETA_Z';
  const stationBeta_Token = 'kiosk-station-beta-secret-provisioning-credential-ok!';
  const stationBeta_Hash = hashToken(stationBeta_Token);

  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const customerRepo = new PostgresCustomerRepository();
  const sessionRepo = new PostgresShiftSessionRepository();
  const transactionRepo = new PostgresCollectionTransactionRepository();
  const bulkUseCase = new BulkCollectionSyncUseCase(customerRepo, sessionRepo, transactionRepo);

  // Setup / Seed Fixtures
  const seedEnvironment = async () => {
    const clients = [db];
    try {
      const alphaDb = await tenantDbManager.getTenantDb(orgAlpha);
      if (alphaDb !== db) clients.push(alphaDb);
    } catch {}

    const codeSuffix = Date.now().toString(36).slice(-5);

    for (const client of clients) {
      await client.query(`
        INSERT INTO organizations (id, name, code, status)
        VALUES 
          ('${orgAlpha}', 'Hardened Alpha Cooperative 4.2.3', 'A423_${codeSuffix}', 'ACTIVE'),
          ('${orgBeta}', 'Hardened Beta Cooperative 4.2.3', 'B423_${codeSuffix}', 'ACTIVE')
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE';
      `);

      await client.query(`
        INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status, timezone)
        VALUES 
          ('${centerAlpha}', '${orgAlpha}', 'C423A_${codeSuffix}', 'Center Alpha 4.2.3', 'Main Rd', 'AlphaTown', 'District', 'State', '416001', '+919876543210', 'ACTIVE', 'Asia/Kolkata'),
          ('${centerBeta}', '${orgBeta}', 'C423B_${codeSuffix}', 'Center Beta 4.2.3', 'Main Rd', 'BetaTown', 'District', 'State', '416002', '+919876543211', 'ACTIVE', 'Asia/Kolkata')
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE';
      `);

      await client.query(`
        INSERT INTO users (id, organization_id, username, phone_number, full_name, role, status)
        VALUES 
          ('${operatorAlpha}', '${orgAlpha}', 'op423_${codeSuffix}', '+919822992203', 'Operator Alpha 4.2.3', 'COLLECTION_OPERATOR', 'ACTIVE')
        ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', username = EXCLUDED.username, phone_number = EXCLUDED.phone_number;
      `);

      // Seed Devices Master with explicit tokens & statuses
      await client.query(`
        INSERT INTO devices (id, organization_id, center_id, device_identifier, device_type, status, device_token_hash, last_seen_at)
        VALUES 
          ('${stationA_Id}', '${orgAlpha}', '${centerAlpha}', '${stationA_Name}', 'COUNTER_TERMINAL', 'ACTIVE', '${stationA_Hash}', NOW()),
          ('${stationB_Id}', '${orgAlpha}', '${centerAlpha}', '${stationB_Name}', 'COUNTER_TERMINAL', 'ACTIVE', '${stationB_Hash}', NOW()),
          ('${stationBlocked_Id}', '${orgAlpha}', '${centerAlpha}', '${stationBlocked_Name}', 'COUNTER_TERMINAL', 'BLOCKED', '${stationBlocked_Hash}', NOW()),
          ('${stationDecom_Id}', '${orgAlpha}', '${centerAlpha}', '${stationDecom_Name}', 'COUNTER_TERMINAL', 'DECOMMISSIONED', '${stationDecom_Hash}', NOW()),
          ('${stationBeta_Id}', '${orgBeta}', '${centerBeta}', '${stationBeta_Name}', 'COUNTER_TERMINAL', 'ACTIVE', '${stationBeta_Hash}', NOW())
        ON CONFLICT (device_identifier) DO UPDATE SET 
          status = EXCLUDED.status, 
          organization_id = EXCLUDED.organization_id, 
          device_token_hash = EXCLUDED.device_token_hash;
      `);

      // Seed Active and Closed Shift Sessions for station A
      await client.query(`
        INSERT INTO kiosk_shift_sessions (
          id, organization_id, center_id, session_code, business_date, shift, status, 
          opening_operator_id, device_identifier, opened_at, closed_at
        )
        VALUES (
          '${sessionAlpha}', '${orgAlpha}', '${centerAlpha}', 'SES-423-A', '${yesterday}', 'MORNING', 'CLOSED',
          '${operatorAlpha}', '${stationA_Name}', '${yesterday}T06:00:00Z', '${yesterday}T12:00:00Z'
        )
        ON CONFLICT (id) DO UPDATE SET 
          status = EXCLUDED.status, 
          device_identifier = EXCLUDED.device_identifier;
      `);
    }
  };

  await seedEnvironment();

  const mockOtpService = {
    sendOtp: async () => ({ success: true, message: 'OTP sent' }),
    verifyOtp: async () => true, // Valid OTP
  };
  const verifyOperatorUseCase = new VerifyOperatorOtpUseCase(mockOtpService, tokenService);

  // ==========================================================================
  // SECTION 1: P0 — Attempt Device Identifier Claiming & Proof-of-Possession
  // ==========================================================================

  await suite.test('1a. Station A authenticates with correct device credential -> SUCCESS (claims STATION_A)', async () => {
    const loginResult = await verifyOperatorUseCase.execute(
      '+919822992203',
      '123456',
      stationA_Name,
      { deviceToken: stationA_Token }
    );
    assert.ok(loginResult.token);
    assert.equal(loginResult.operator.deviceId, stationA_Name);

    const claims = tokenService.verifyToken(loginResult.token);
    assert.equal(claims.deviceId, stationA_Name);
  });

  await suite.test('1b. Station B sends Station A identifier with MISSING device credential -> REJECTED (fail closed)', async () => {
    // Attempting to claim Station A with NO deviceToken or challenge proof
    await assert.rejects(
      async () => {
        await verifyOperatorUseCase.execute('+919822992203', '123456', stationA_Name);
      },
      /Station identity 'STATION_A' requires valid device credential or single-use challenge proof/
    );
  });

  await suite.test('1c. Station B sends Station A identifier with Station B credential -> REJECTED (credential mismatch)', async () => {
    // Operator is on Station B (possessing stationB_Token), but passes deviceIdentifier: STATION_A
    await assert.rejects(
      async () => {
        await verifyOperatorUseCase.execute(
          '+919822992203',
          '123456',
          stationA_Name,
          { deviceToken: stationB_Token } // Device B's credential!
        );
      },
      /Invalid device credential provided for station 'STATION_A'/
    );
  });

  await suite.test('1d. Station B sends Station A identifier with bogus/incorrect credential -> REJECTED', async () => {
    await assert.rejects(
      async () => {
        await verifyOperatorUseCase.execute(
          '+919822992203',
          '123456',
          stationA_Name,
          { deviceToken: 'bogus-incorrect-token-12345' }
        );
      },
      /Invalid device credential provided for station 'STATION_A'/
    );
  });

  await suite.test('1e. Unregistered station identifier -> REJECTED', async () => {
    await assert.rejects(
      async () => {
        await verifyOperatorUseCase.execute(
          '+919822992203',
          '123456',
          'NON_EXISTENT_STATION',
          { deviceToken: 'any-token' }
        );
      },
      /is not registered with any dairy cooperative/
    );
  });

  await suite.test('1f. Revoked station (BLOCKED) -> REJECTED (fail closed)', async () => {
    await assert.rejects(
      async () => {
        await verifyOperatorUseCase.execute(
          '+919822992203',
          '123456',
          stationBlocked_Name,
          { deviceToken: stationBlocked_Token }
        );
      },
      /Access from revoked station is strictly blocked/
    );
  });

  await suite.test('1g. Decommissioned station (DECOMMISSIONED) -> REJECTED (fail closed)', async () => {
    await assert.rejects(
      async () => {
        await verifyOperatorUseCase.execute(
          '+919822992203',
          '123456',
          stationDecom_Name,
          { deviceToken: stationDecom_Token }
        );
      },
      /Access from revoked station is strictly blocked/
    );
  });

  await suite.test('1h. Cross-organization device identifier claiming -> REJECTED (fail closed)', async () => {
    // Operator Alpha (Org Alpha) tries to claim Station Beta (Org Beta)
    await assert.rejects(
      async () => {
        await verifyOperatorUseCase.execute(
          '+919822992203',
          '123456',
          stationBeta_Name,
          { deviceToken: stationBeta_Token }
        );
      },
      /belongs to a different dairy organization/
    );
  });

  // ==========================================================================
  // SECTION 2: Single-Use Challenge-Response & Replay Protection
  // ==========================================================================

  await suite.test('2a. Challenge-Response: Valid single-use challenge and HMAC proof succeeds', async () => {
    // 1. Server generates short-lived challenge
    const { challenge } = await deviceChallengeService.createChallenge(stationA_Name, orgAlpha, 60000);
    assert.ok(challenge);

    // 2. Client derives K_proof = SHA-256(deviceToken) and computes HMAC proof
    const proofKey = DeviceChallengeService.deriveProofKey(stationA_Token);
    const proof = DeviceChallengeService.computeProof(challenge, proofKey, stationA_Name);

    // 3. Submit OTP verification with challenge & proof
    const loginResult = await verifyOperatorUseCase.execute(
      '+919822992203',
      '123456',
      stationA_Name,
      {
        deviceToken: stationA_Token,
        challenge,
        deviceProof: proof,
      }
    );

    assert.ok(loginResult.token);
    assert.equal(loginResult.operator.deviceId, stationA_Name);
  });

  await suite.test('2b. Challenge-Response Replay Attack: Replaying already-consumed challenge is REJECTED', async () => {
    // 1. Generate challenge
    const { challenge } = await deviceChallengeService.createChallenge(stationA_Name, orgAlpha, 60000);
    const proofKey = DeviceChallengeService.deriveProofKey(stationA_Token);
    const proof = DeviceChallengeService.computeProof(challenge, proofKey, stationA_Name);

    // 2. First login succeeds and atomically consumes the challenge
    const firstAttempt = await verifyOperatorUseCase.execute(
      '+919822992203',
      '123456',
      stationA_Name,
      {
        deviceToken: stationA_Token,
        challenge,
        deviceProof: proof,
      }
    );
    assert.ok(firstAttempt.token);

    // 3. Second login with the EXACT same challenge must fail (atomic single-use consumption)
    await assert.rejects(
      async () => {
        await verifyOperatorUseCase.execute(
          '+919822992203',
          '123456',
          stationA_Name,
          {
            deviceToken: stationA_Token,
            challenge,
            deviceProof: proof,
          }
        );
      },
      /replay attack rejected/
    );
  });

  await suite.test('2c. Challenge-Response: Expired challenge is REJECTED', async () => {
    // Generate challenge with negative / zero TTL (already expired)
    const { challenge } = await deviceChallengeService.createChallenge(stationA_Name, orgAlpha, -1000);
    const proofKey = DeviceChallengeService.deriveProofKey(stationA_Token);
    const proof = DeviceChallengeService.computeProof(challenge, proofKey, stationA_Name);

    await assert.rejects(
      async () => {
        await verifyOperatorUseCase.execute(
          '+919822992203',
          '123456',
          stationA_Name,
          {
            deviceToken: stationA_Token,
            challenge,
            deviceProof: proof,
          }
        );
      },
      /Challenge token has expired/
    );
  });

  await suite.test('2d. Challenge-Response: Challenge issued for Station A cannot be used for Station B', async () => {
    const { challenge } = await deviceChallengeService.createChallenge(stationA_Name, orgAlpha, 60000);
    const proofKeyB = DeviceChallengeService.deriveProofKey(stationB_Token);
    const proof = DeviceChallengeService.computeProof(challenge, proofKeyB, stationB_Name);

    await assert.rejects(
      async () => {
        await verifyOperatorUseCase.execute(
          '+919822992203',
          '123456',
          stationB_Name,
          {
            deviceToken: stationB_Token,
            challenge,
            deviceProof: proof,
          }
        );
      },
      /Challenge was issued for device 'STATION_A', not 'STATION_B'/
    );
  });

  await suite.test('2e. Challenge-Response: Attacker-supplied token + self-signed proof CANNOT bypass persisted device_token_hash', async () => {
    const { challenge } = await deviceChallengeService.createChallenge(stationA_Name, orgAlpha, 60000);
    const rogueToken = 'attacker-forged-token-attempt';
    const rogueProof = DeviceChallengeService.computeProof(challenge, rogueToken, stationA_Name);

    await assert.rejects(
      async () => {
        await verifyOperatorUseCase.execute(
          '+919822992203',
          '123456',
          stationA_Name,
          {
            deviceToken: rogueToken,
            challenge,
            deviceProof: rogueProof,
          }
        );
      },
      /Invalid device credential provided for station 'STATION_A'/
    );
  });

  suite.after(async () => {
    await tenantDbManager.closeAllPools().catch(() => {});
    await db.close().catch(() => {});
  });

  // ==========================================================================
  // SECTION 3: Cross-Device Offline Lease Protection
  // ==========================================================================

  await suite.test('3a. Copied offline lease signed for Station A CANNOT be reconciled through Station B connection', async () => {
    // Generate offline lease specifically signed for STATION_A
    const authLeaseStationA = offlineSessionAuthService.generateAuthorization({
      organizationId: orgAlpha,
      centerId: centerAlpha,
      sessionId: sessionAlpha,
      sessionCode: 'SES-423-A',
      businessDate: yesterday,
      shift: 'MORNING',
      deviceIdentifier: stationA_Name,
      operatorId: operatorAlpha,
      validFrom: `${yesterday}T06:00:00Z`,
      validUntil: `${yesterday}T12:00:00Z`,
    });

    const sessionRow = {
      id: sessionAlpha,
      sessionCode: 'SES-423-A',
      organizationId: orgAlpha,
      centerId: centerAlpha,
      businessDate: yesterday,
      deviceIdentifier: stationA_Name,
    };

    // Station B authenticates legitimately with its own credential
    const loginStationB = await verifyOperatorUseCase.execute(
      '+919822992203',
      '123456',
      stationB_Name,
      { deviceToken: stationB_Token }
    );
    const verifiedClaimsB = tokenService.verifyToken(loginStationB.token);
    assert.equal(verifiedClaimsB.deviceId, stationB_Name);

    // Station B attempts to sync/reconcile using Station A's lease token
    const res = offlineSessionAuthService.validateSessionScope({
      token: authLeaseStationA.token,
      organizationId: orgAlpha,
      session: sessionRow,
      authenticatedDeviceId: verifiedClaimsB.deviceId, // STATION_B
      deviceId: stationA_Name,
    });

    assert.equal(res.isValid, false);
    assert.equal(res.errorCode, 'OFFLINE_DEVICE_MISMATCH');
    assert.match(
      res.errorMessage || '',
      /does not match server-authenticated station identity \(STATION_B\)/
    );
  });

  await suite.test('3b. Legitimate Station A connection reconciles Station A offline lease -> SUCCESS', async () => {
    const authLeaseStationA = offlineSessionAuthService.generateAuthorization({
      organizationId: orgAlpha,
      centerId: centerAlpha,
      sessionId: sessionAlpha,
      sessionCode: 'SES-423-A',
      businessDate: yesterday,
      shift: 'MORNING',
      deviceIdentifier: stationA_Name,
      operatorId: operatorAlpha,
      validFrom: `${yesterday}T06:00:00Z`,
      validUntil: `${yesterday}T12:00:00Z`,
    });

    const sessionRow = {
      id: sessionAlpha,
      sessionCode: 'SES-423-A',
      organizationId: orgAlpha,
      centerId: centerAlpha,
      businessDate: yesterday,
      deviceIdentifier: stationA_Name,
    };

    const loginStationA = await verifyOperatorUseCase.execute(
      '+919822992203',
      '123456',
      stationA_Name,
      { deviceToken: stationA_Token }
    );
    const verifiedClaimsA = tokenService.verifyToken(loginStationA.token);
    assert.equal(verifiedClaimsA.deviceId, stationA_Name);

    const res = offlineSessionAuthService.validateSessionScope({
      token: authLeaseStationA.token,
      organizationId: orgAlpha,
      session: sessionRow,
      authenticatedDeviceId: verifiedClaimsA.deviceId, // STATION_A
      deviceId: stationA_Name,
      collectionTimestamp: `${yesterday}T08:00:00Z`,
    });

    assert.equal(res.isValid, true);
    assert.equal(res.payload?.deviceIdentifier, stationA_Name);
  });

  // ==========================================================================
  // SECTION 4: Production Signing Key Entropy & Isolation Audit
  // ==========================================================================

  await suite.test('4a. Production startup strictly fails closed if dedicated OFFLINE_LEASE_SIGNING_KEY is missing', async () => {
    const originalNodeEnv = process.env['NODE_ENV'];
    const originalKey = process.env['OFFLINE_LEASE_SIGNING_KEY'];

    try {
      assert.throws(
        () => {
          loadEnv({
            NODE_ENV: 'production',
            SUPABASE_URL: 'https://demo.supabase.co',
            SUPABASE_ANON_KEY: 'placeholder_supabase_anon_key_for_test',
            SUPABASE_SERVICE_ROLE_KEY: 'placeholder_supabase_service_role_key_for_test',
            OFFLINE_LEASE_SIGNING_KEY: undefined, // Missing!
          });
        },
        /Dedicated OFFLINE_LEASE_SIGNING_KEY must be configured/
      );
    } finally {
      process.env['NODE_ENV'] = originalNodeEnv;
      if (originalKey) process.env['OFFLINE_LEASE_SIGNING_KEY'] = originalKey;
    }
  });

  await suite.test('4b. Production startup rejects key with insufficient bytes (< 32 bytes / 256 bits)', async () => {
    assert.throws(
      () => {
        loadEnv({
          NODE_ENV: 'production',
          SUPABASE_URL: 'https://demo.supabase.co',
          SUPABASE_ANON_KEY: 'placeholder_supabase_anon_key_for_test',
          SUPABASE_SERVICE_ROLE_KEY: 'placeholder_supabase_service_role_key_for_test',
          OFFLINE_LEASE_SIGNING_KEY: 'short-key-16-bytes-only!!',
        });
      },
      /requires at least 32 cryptographically random bytes/
    );
  });

  await suite.test('4c. Production startup rejects 32-character hex key (which is only 16 bytes / 128 bits)', async () => {
    assert.throws(
      () => {
        loadEnv({
          NODE_ENV: 'production',
          SUPABASE_URL: 'https://demo.supabase.co',
          SUPABASE_ANON_KEY: 'placeholder_supabase_anon_key_for_test',
          SUPABASE_SERVICE_ROLE_KEY: 'placeholder_supabase_service_role_key_for_test',
          OFFLINE_LEASE_SIGNING_KEY: 'abcd'.repeat(8), // 32 hex chars = 16 bytes!
        });
      },
      /hex format requires at least 64 hex characters \(32 bytes \/ 256 bits\)/
    );
  });

  await suite.test('4d. Production startup rejects repetitive patterns / low entropy keys', async () => {
    assert.throws(
      () => {
        validateKeyEntropyAndByteLength('!1a2b3c4'.repeat(8));
      },
      /repetitive pattern detected/
    );

    assert.throws(
      () => {
        validateKeyEntropyAndByteLength('!abc'.repeat(16));
      },
      /insufficient randomness/
    );
  });

  await suite.test('4e. Valid CSPRNG generated key (openssl rand -hex 32, 64 hex chars) passes startup verification', async () => {
    // Simulates openssl rand -hex 32
    const csprngHexKey = crypto.randomBytes(32).toString('hex');
    assert.equal(csprngHexKey.length, 64);

    assert.doesNotThrow(() => {
      loadEnv({
        NODE_ENV: 'production',
        SUPABASE_URL: 'https://demo.supabase.co',
        SUPABASE_ANON_KEY: 'placeholder_supabase_anon_key_for_test',
        SUPABASE_SERVICE_ROLE_KEY: 'placeholder_supabase_service_role_key_for_test',
        JWT_SECRET: crypto.randomBytes(32).toString('hex'),
        ADMIN_OTP_SECRET: crypto.randomBytes(32).toString('hex'),
        TENANT_DB_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
        DATA_ENCRYPTION_KEY_HEX: crypto.randomBytes(32).toString('hex'),
        OFFLINE_LEASE_SIGNING_KEY: csprngHexKey,
        DOVE_SMS_AUTHKEY: 'dove-prod-auth-key-test-valid-123456',
      });
    });
  });

  await suite.test('4f. Key rotation: previous key validates unexpired leases, active key signs new leases', async () => {
    const activeKey = crypto.randomBytes(32).toString('hex');
    const previousKey = crypto.randomBytes(32).toString('hex');

    // Earlier service instance running on previousKey (k0)
    const authServiceK0 = new OfflineSessionAuthorizationService({
      activeKey: previousKey,
      activeKeyId: 'k0',
    });

    const leaseIssuedUnderK0 = authServiceK0.generateAuthorization({
      organizationId: orgAlpha,
      centerId: centerAlpha,
      sessionId: sessionAlpha,
      sessionCode: 'SES-423-A',
      businessDate: yesterday,
      shift: 'MORNING',
      deviceIdentifier: stationA_Name,
      operatorId: operatorAlpha,
      validFrom: `${yesterday}T06:00:00Z`,
      validUntil: `${yesterday}T12:00:00Z`,
    });

    // Upgraded service instance with activeKey (k1) and previousKey in key ring
    const authServiceRotated = new OfflineSessionAuthorizationService({
      activeKey: activeKey,
      activeKeyId: 'k1',
      previousKeys: {
        k0: previousKey,
      },
    });

    // 1. Unexpired lease from k0 verifies successfully during rotation
    const verifyK0Lease = authServiceRotated.verifyToken(leaseIssuedUnderK0.token);
    assert.equal(verifyK0Lease.isValid, true);
    assert.equal(verifyK0Lease.payload?.sessionCode, 'SES-423-A');

    // 2. Newly generated lease is signed with activeKey (k1)
    const newLeaseK1 = authServiceRotated.generateAuthorization({
      organizationId: orgAlpha,
      centerId: centerAlpha,
      sessionId: sessionAlpha,
      sessionCode: 'SES-423-A',
      businessDate: today,
      shift: 'MORNING',
      deviceIdentifier: stationA_Name,
      operatorId: operatorAlpha,
    });
    const headerK1 = JSON.parse(Buffer.from(newLeaseK1.token.split('.')[0], 'base64url').toString('utf8'));
    assert.equal(headerK1.kid, 'k1');
  });

  await suite.test('4g. Retired key identifier is rejected even if key exists in ring', async () => {
    const activeKey = crypto.randomBytes(32).toString('hex');
    const retiredKey = crypto.randomBytes(32).toString('hex');

    const serviceWithRetired = new OfflineSessionAuthorizationService({
      activeKey: activeKey,
      activeKeyId: 'k2',
      previousKeys: {
        k_retired: retiredKey,
      },
      retiredKeys: ['k_retired'],
    });

    // Simulate token forged or previously issued under retired key
    const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'DFARM-OFFLINE-SESSION-AUTH', ver: 1, kid: 'k_retired' })).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify({ authorizationId: 'auth-1', version: 1 })).toString('base64url');
    const sig = crypto.createHmac('sha256', retiredKey).update(`${headerB64}.${payloadB64}`).digest('base64url');
    const token = `${headerB64}.${payloadB64}.${sig}`;

    const res = serviceWithRetired.verifyToken(token);
    assert.equal(res.isValid, false);
    assert.match(res.errorMessage || '', /signed with retired key identifier 'k_retired'/);
  });
});
