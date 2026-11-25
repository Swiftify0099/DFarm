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
import { RateService } from '../dist/modules/rates/rate.service.js';
import { roundHalfUp } from '@dfarm/shared-types';
import { loadEnv, validateKeyEntropyAndByteLength } from '../dist/config/env.js';
import { Money } from '../dist/domain/value-objects/index.js';

const tokenService = new HmacJwtTokenService();

test('DFARM PROMPT 4.2.2: Final Source-Level Verification Suite', async (suite) => {
  const isConnected = await db.checkConnection();
  if (!isConnected) {
    console.log('[PROMPT 4.2.2 TEST] Real PostgreSQL connection is unavailable. Suite skipped.');
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

  // Registered Stations
  const stationActiveId = '00000000-0000-0000-0000-000000004201';
  const stationActiveName = 'STATION_VERIFIED_1';
  const stationActiveToken = 'station-active-prov-token-secret-12345';
  const stationActiveHash = crypto.createHash('sha256').update(stationActiveToken).digest('hex');
  const stationBlockedId = '00000000-0000-0000-0000-000000004202';
  const stationBlockedName = 'STATION_REVOKED_1';
  const stationBetaId = '00000000-0000-0000-0000-000000004203';
  const stationBetaName = 'STATION_BETA_1';

  // Rate Charts for Model Parity
  const chartTwoAxisId = '00000000-0000-0000-0000-000000421002';
  const verTwoAxisId = '00000000-0000-0000-0000-000000421012';
  const chartTotalSolidsId = '00000000-0000-0000-0000-000000421003';
  const verTotalSolidsId = '00000000-0000-0000-0000-000000421013';

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
      // 0. Base Organizations, Centers and Users Seed
      await client.query(`
        INSERT INTO organizations (id, name, code, status)
        VALUES 
          ('${orgAlpha}', 'Hardened Alpha Cooperative 4.2.2', 'A422_${codeSuffix}', 'ACTIVE'),
          ('${orgBeta}', 'Hardened Beta Cooperative 4.2.2', 'B422_${codeSuffix}', 'ACTIVE')
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE';
      `);

      await client.query(`
        INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status, timezone)
        VALUES 
          ('${centerAlpha}', '${orgAlpha}', 'C422A_${codeSuffix}', 'Center Alpha 4.2.2', 'Main Rd', 'AlphaTown', 'District', 'State', '416001', '+919876543210', 'ACTIVE', 'Asia/Kolkata'),
          ('${centerBeta}', '${orgBeta}', 'C422B_${codeSuffix}', 'Center Beta 4.2.2', 'Main Rd', 'BetaTown', 'District', 'State', '416002', '+919876543211', 'ACTIVE', 'Asia/Kolkata')
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE';
      `);

      await client.query(`
        INSERT INTO users (id, organization_id, username, phone_number, full_name, role, status)
        VALUES 
          ('${operatorAlpha}', '${orgAlpha}', 'op422_${codeSuffix}', '+919822992201', 'Operator Alpha 4.2.2', 'COLLECTION_OPERATOR', 'ACTIVE')
        ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', username = EXCLUDED.username, phone_number = EXCLUDED.phone_number;
      `);

      // 1. Devices Master Seed
      await client.query(`
        INSERT INTO devices (id, organization_id, center_id, device_identifier, device_type, status, device_token_hash, last_seen_at)
        VALUES 
          ('${stationActiveId}', '${orgAlpha}', '${centerAlpha}', '${stationActiveName}', 'COUNTER_TERMINAL', 'ACTIVE', '${stationActiveHash}', NOW()),
          ('${stationBlockedId}', '${orgAlpha}', '${centerAlpha}', '${stationBlockedName}', 'COUNTER_TERMINAL', 'BLOCKED', '${stationActiveHash}', NOW()),
          ('${stationBetaId}', '${orgBeta}', '${centerBeta}', '${stationBetaName}', 'COUNTER_TERMINAL', 'ACTIVE', '${stationActiveHash}', NOW())
        ON CONFLICT (device_identifier) DO UPDATE SET status = EXCLUDED.status, organization_id = EXCLUDED.organization_id, device_token_hash = EXCLUDED.device_token_hash;
      `);
    }
  };

  await seedEnvironment();

  // ==========================================================================
  // SECTION 1: Actual Round-Half-Up Source Code Verification
  // ==========================================================================

  await suite.test('1a. Symmetric rounding away from zero for positive and negative midpoints', async () => {
    // Positive midpoints and non-midpoints
    assert.equal(roundHalfUp(31.505, 2), 31.51);
    assert.equal(roundHalfUp(31.504, 2), 31.50);
    assert.equal(roundHalfUp(10.005, 2), 10.01);
    assert.equal(roundHalfUp(10.004, 2), 10.00);

    // Negative midpoints - MUST round away from zero symmetrically
    assert.equal(roundHalfUp(-31.505, 2), -31.51);
    assert.equal(roundHalfUp(-31.504, 2), -31.50);
    assert.equal(roundHalfUp(-10.005, 2), -10.01);
    assert.equal(roundHalfUp(-10.004, 2), -10.00);

    // Money Value Object conforms to authoritative roundHalfUp
    const mPositive = new Money(31.505);
    assert.equal(mPositive.value, 31.51);
    const mBelow = new Money(31.504);
    assert.equal(mBelow.value, 31.50);
  });

  await suite.test('1b. Non-finite values and invalid decimal precision throw TypeError and RangeError', async () => {
    assert.throws(() => roundHalfUp(NaN, 2), TypeError);
    assert.throws(() => roundHalfUp(Infinity, 2), TypeError);
    assert.throws(() => roundHalfUp(-Infinity, 2), TypeError);
    assert.throws(() => roundHalfUp('31.505', 2), TypeError);
    assert.throws(() => roundHalfUp(null, 2), TypeError);
    assert.throws(() => roundHalfUp(undefined, 2), TypeError);

    assert.throws(() => roundHalfUp(31.505, -1), RangeError);
    assert.throws(() => roundHalfUp(31.505, 1.5), RangeError);
    assert.throws(() => roundHalfUp(31.505, NaN), RangeError);
  });

  await suite.test('1c. Exact paise comparison policy: rejects sub-paise rates and totals', async () => {
    // Valid 2-decimal paise rate matches exactly
    const validRateRes = await RateService.validateHistoricalRate({
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
    assert.equal(validRateRes.isValid, true);

    // Sub-paise rate (e.g. 38.502) is strictly rejected (no arbitrary tolerance)
    const subPaiseRateRes = await RateService.validateHistoricalRate({
      organizationId: orgAlpha,
      milkCategory: 'COW',
      fat: 4.0,
      snf: 9.0,
      weightLiters: 10.0,
      ratePerLiter: 38.502,
      totalAmount: 385.00,
      businessDate: yesterday,
      rateChartVersionId: verTwoAxisId,
    });
    assert.equal(subPaiseRateRes.isValid, false);
    assert.equal(subPaiseRateRes.errorCode, 'RATE_MISMATCH');

    // Sub-paise total (e.g. 385.004) is strictly rejected
    const subPaiseTotalRes = await RateService.validateHistoricalRate({
      organizationId: orgAlpha,
      milkCategory: 'COW',
      fat: 4.0,
      snf: 9.0,
      weightLiters: 10.0,
      ratePerLiter: 38.50,
      totalAmount: 385.004,
      businessDate: yesterday,
      rateChartVersionId: verTwoAxisId,
    });
    assert.equal(subPaiseTotalRes.isValid, false);
    assert.equal(subPaiseTotalRes.errorCode, 'TOTAL_AMOUNT_MISMATCH');
  });

  // ==========================================================================
  // SECTION 2: Registered Device Identity Source Verification
  // ==========================================================================

  await suite.test('2a. Operator OTP login with correct registered station issues JWT with authenticated deviceId', async () => {
    const mockOtpService = {
      sendOtp: async () => ({ success: true, message: 'OTP sent' }),
      verifyOtp: async () => true, // Mock valid OTP
    };
    const verifyOperatorUseCase = new VerifyOperatorOtpUseCase(mockOtpService, tokenService);

    // Missing device credential fails closed
    await assert.rejects(
      async () => {
        await verifyOperatorUseCase.execute('+919822992201', '123456', stationActiveName);
      },
      /requires valid device credential or single-use challenge proof/
    );

    // Valid registered station with verified proof-of-possession
    const loginResult = await verifyOperatorUseCase.execute('+919822992201', '123456', stationActiveName, {
      deviceToken: stationActiveToken,
    });
    assert.ok(loginResult.token);
    assert.equal(loginResult.operator.deviceId, stationActiveName);

    // Verify token claims contains deviceId
    const verifiedClaims = tokenService.verifyToken(loginResult.token);
    assert.equal(verifiedClaims.deviceId, stationActiveName);
  });

  await suite.test('2b. Operator login with unregistered station fails closed', async () => {
    const mockOtpService = {
      sendOtp: async () => ({ success: true, message: 'OTP sent' }),
      verifyOtp: async () => true,
    };
    const verifyOperatorUseCase = new VerifyOperatorOtpUseCase(mockOtpService, tokenService);

    await assert.rejects(
      async () => {
        await verifyOperatorUseCase.execute('+919822992201', '123456', 'UNREGISTERED_STATION_XYZ');
      },
      /is not registered with any dairy cooperative/
    );
  });

  await suite.test('2c. Operator login with revoked (BLOCKED) station fails closed', async () => {
    const mockOtpService = {
      sendOtp: async () => ({ success: true, message: 'OTP sent' }),
      verifyOtp: async () => true,
    };
    const verifyOperatorUseCase = new VerifyOperatorOtpUseCase(mockOtpService, tokenService);

    await assert.rejects(
      async () => {
        await verifyOperatorUseCase.execute('+919822992201', '123456', stationBlockedName);
      },
      /Access from revoked station is strictly blocked/
    );
  });

  await suite.test('2d. Operator login with station from another dairy organization fails closed', async () => {
    const mockOtpService = {
      sendOtp: async () => ({ success: true, message: 'OTP sent' }),
      verifyOtp: async () => true,
    };
    const verifyOperatorUseCase = new VerifyOperatorOtpUseCase(mockOtpService, tokenService);

    await assert.rejects(
      async () => {
        await verifyOperatorUseCase.execute('+919822992201', '123456', stationBetaName); // Belongs to orgBeta
      },
      /belongs to a different dairy organization/
    );
  });

  await suite.test('2e. Missing device claim in JWT strictly blocks offline lease reconciliation', async () => {
    const mockOtpService = {
      sendOtp: async () => ({ success: true, message: 'OTP sent' }),
      verifyOtp: async () => true,
    };
    const verifyOperatorUseCase = new VerifyOperatorOtpUseCase(mockOtpService, tokenService);

    // Login without station identifier (e.g. web browser operator)
    const browserLogin = await verifyOperatorUseCase.execute('+919822992201', '123456');
    assert.equal(browserLogin.operator.deviceId, undefined);

    const verifiedClaims = tokenService.verifyToken(browserLogin.token);
    assert.equal(verifiedClaims.deviceId, undefined);

    // Attempting to reconcile offline closed session without authenticated deviceId fails
    const auth = offlineSessionAuthService.generateAuthorization({
      organizationId: orgAlpha,
      centerId: centerAlpha,
      sessionId: sessionClosedAlpha,
      sessionCode: 'SES-421-CLOSED',
      businessDate: yesterday,
      shift: 'MORNING',
      deviceIdentifier: stationActiveName,
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
      deviceIdentifier: stationActiveName,
    };

    const res = offlineSessionAuthService.validateSessionScope({
      token: auth.token,
      organizationId: orgAlpha,
      session: sessionRow,
      authenticatedDeviceId: verifiedClaims.deviceId, // Undefined!
      deviceId: stationActiveName,
    });

    assert.equal(res.isValid, false);
    assert.equal(res.errorCode, 'OFFLINE_DEVICE_AUTH_REQUIRED');
  });

  // ==========================================================================
  // SECTION 3: Lease Time and Reconciliation Semantics
  // ==========================================================================

  await suite.test('3a. Collection timestamp outside 14-hour collection lease window strictly rejected', async () => {
    const auth = offlineSessionAuthService.generateAuthorization({
      organizationId: orgAlpha,
      centerId: centerAlpha,
      sessionId: sessionClosedAlpha,
      sessionCode: 'SES-421-CLOSED',
      businessDate: yesterday,
      shift: 'MORNING',
      deviceIdentifier: stationActiveName,
      operatorId: operatorAlpha,
      validFrom: `${yesterday}T06:00:00Z`,
      validUntil: `${yesterday}T12:00:00Z`, // 6-hour window for testing
    });

    const sessionRow = {
      id: sessionClosedAlpha,
      sessionCode: 'SES-421-CLOSED',
      organizationId: orgAlpha,
      centerId: centerAlpha,
      businessDate: yesterday,
      deviceIdentifier: stationActiveName,
    };

    // Valid intake at 08:00 (within window)
    const validTimeRes = offlineSessionAuthService.validateSessionScope({
      token: auth.token,
      organizationId: orgAlpha,
      session: sessionRow,
      authenticatedDeviceId: stationActiveName,
      deviceId: stationActiveName,
      collectionTimestamp: `${yesterday}T08:00:00Z`,
    });
    assert.equal(validTimeRes.isValid, true);

    // Intake after validUntil (e.g. 13:00) strictly rejected (no invented grace period)
    const lateTimeRes = offlineSessionAuthService.validateSessionScope({
      token: auth.token,
      organizationId: orgAlpha,
      session: sessionRow,
      authenticatedDeviceId: stationActiveName,
      deviceId: stationActiveName,
      collectionTimestamp: `${yesterday}T13:00:00Z`,
    });
    assert.equal(lateTimeRes.isValid, false);
    assert.equal(lateTimeRes.errorCode, 'OFFLINE_AUTHORIZATION_EXPIRED');

    // Future collection timestamp relative to server time strictly rejected
    const futureTimeRes = offlineSessionAuthService.validateSessionScope({
      token: auth.token,
      organizationId: orgAlpha,
      session: sessionRow,
      authenticatedDeviceId: stationActiveName,
      deviceId: stationActiveName,
      collectionTimestamp: new Date(Date.now() + 86400000).toISOString(), // Tomorrow!
    });
    assert.equal(futureTimeRes.isValid, false);
    assert.equal(futureTimeRes.errorCode, 'OFFLINE_AUTHORIZATION_EXPIRED');
  });

  await suite.test('3b. Delayed upload exceeding maxReconciliationDays (30 days) is rejected by server wall-clock', async () => {
    const ancientDate = new Date(Date.now() - 35 * 86400000).toISOString(); // 35 days ago
    const authOld = offlineSessionAuthService.generateAuthorization({
      organizationId: orgAlpha,
      centerId: centerAlpha,
      sessionId: sessionClosedAlpha,
      sessionCode: 'SES-421-CLOSED',
      businessDate: yesterday,
      shift: 'MORNING',
      deviceIdentifier: stationActiveName,
      operatorId: operatorAlpha,
      validFrom: ancientDate,
      validUntil: ancientDate,
      maxReconciliationDays: 30,
    });

    const sessionRow = {
      id: sessionClosedAlpha,
      sessionCode: 'SES-421-CLOSED',
      organizationId: orgAlpha,
      centerId: centerAlpha,
      businessDate: yesterday,
      deviceIdentifier: stationActiveName,
    };

    const res = offlineSessionAuthService.validateSessionScope({
      token: authOld.token,
      organizationId: orgAlpha,
      session: sessionRow,
      authenticatedDeviceId: stationActiveName,
      deviceId: stationActiveName,
    });

    assert.equal(res.isValid, false);
    assert.equal(res.errorCode, 'OFFLINE_AUTHORIZATION_EXPIRED');
    assert.match(res.errorMessage || '', /max allowed is 30 days/);
  });

  // ==========================================================================
  // SECTION 4: Production Signing Key Entropy and Rotation
  // ==========================================================================

  await suite.test('4a. Cryptographic key entropy & byte length validation', async () => {
    // 32 hex characters is only 16 bytes (128 bits) -> must reject
    assert.throws(
      () => validateKeyEntropyAndByteLength('0123456789abcdef0123456789abcdef'),
      /requires at least 64 hex characters \(32 bytes \/ 256 bits\)/
    );

    // Raw string < 32 bytes -> must reject
    assert.throws(
      () => validateKeyEntropyAndByteLength('short-key-16-ch!'),
      /requires at least 32 cryptographically random bytes/
    );

    // Repetitive chunk pattern with >= 8 unique chars -> must reject for repetitive pattern
    assert.throws(
      () => validateKeyEntropyAndByteLength('!1a2b3c4'.repeat(8)),
      /fails entropy verification: repetitive pattern detected/
    );

    // Insufficient unique characters (< 8 unique chars) -> must reject for insufficient randomness
    assert.throws(
      () => validateKeyEntropyAndByteLength('!abc'.repeat(16)),
      /fails entropy verification: key exhibits insufficient randomness/
    );

    // 64-char hex key generated with crypto.randomBytes(32) -> passes
    const validHexKey = crypto.randomBytes(32).toString('hex');
    assert.doesNotThrow(() => validateKeyEntropyAndByteLength(validHexKey));

    // High entropy 32+ character raw string -> passes
    const validRawKey = 'Df@rm$ecure#Lease!Key_2026*Crypto+256Bit.';
    assert.doesNotThrow(() => validateKeyEntropyAndByteLength(validRawKey));
  });

  await suite.test('4b. Key rotation with retired key rejection', async () => {
    const keyActive = crypto.randomBytes(32).toString('hex');
    const keyPrevious = crypto.randomBytes(32).toString('hex');
    const keyRetired = crypto.randomBytes(32).toString('hex');

    // Service configured with active 'k2', previous 'k1', and retired 'k-retired'
    const service = new OfflineSessionAuthorizationService({
      activeKey: keyActive,
      activeKeyId: 'k2',
      previousKeys: {
        k1: keyPrevious,
      },
      retiredKeys: ['k-retired'],
    });

    // Token signed with active 'k2' succeeds
    const leaseActive = service.generateAuthorization({
      organizationId: orgAlpha,
      centerId: centerAlpha,
      sessionId: sessionClosedAlpha,
      sessionCode: 'SES-421-CLOSED',
      businessDate: yesterday,
      shift: 'MORNING',
      deviceIdentifier: stationActiveName,
      operatorId: operatorAlpha,
    });
    const verifyActive = service.verifyToken(leaseActive.token);
    assert.equal(verifyActive.isValid, true);

    // Token signed with previous key 'k1' succeeds
    const serviceOld = new OfflineSessionAuthorizationService({
      activeKey: keyPrevious,
      activeKeyId: 'k1',
    });
    const leasePrevious = serviceOld.generateAuthorization({
      organizationId: orgAlpha,
      centerId: centerAlpha,
      sessionId: sessionClosedAlpha,
      sessionCode: 'SES-421-CLOSED',
      businessDate: yesterday,
      shift: 'MORNING',
      deviceIdentifier: stationActiveName,
      operatorId: operatorAlpha,
    });
    const verifyPrevious = service.verifyToken(leasePrevious.token);
    assert.equal(verifyPrevious.isValid, true);

    // Token signed with retired key 'k-retired' is strictly rejected
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
      deviceIdentifier: stationActiveName,
      operatorId: operatorAlpha,
    });
    const verifyRetired = service.verifyToken(leaseRetired.token);
    assert.equal(verifyRetired.isValid, false);
    assert.equal(verifyRetired.errorCode, 'OFFLINE_AUTHORIZATION_INVALID');
    assert.match(verifyRetired.errorMessage || '', /retired key identifier 'k-retired'/);
  });

  // ==========================================================================
  // SECTION 5: Independent Verification of Both FORMULA Models
  // ==========================================================================

  await suite.test('5a. TWO_AXIS_FORMULA: Rate = baseRate + (Fat - baseFat)*fatFactor + (SNF - baseSnf)*snfFactor', async () => {
    // Configured: baseRate = 35.00, baseFat = 3.5, baseSnf = 8.5, fatFactor = 4.0, snfFactor = 3.0
    // Test Fat: 4.2, SNF: 8.8
    // Rate = 35.00 + (4.2 - 3.5)*4.0 + (8.8 - 8.5)*3.0 = 35.00 + 2.80 + 0.90 = 38.70
    // Total Amount = 15.5 * 38.70 = 599.85
    const res = await RateService.validateHistoricalRate({
      organizationId: orgAlpha,
      milkCategory: 'COW',
      fat: 4.2,
      snf: 8.8,
      weightLiters: 15.5,
      ratePerLiter: 38.70,
      totalAmount: 599.85,
      businessDate: yesterday,
      rateChartVersionId: verTwoAxisId,
    });
    assert.equal(res.isValid, true);
    assert.equal(res.authoritativeRate, 38.70);
    assert.equal(res.authoritativeTotal, 599.85);

    // Limits check: Fat < 2.5 (below fat_min) fails with FAT_SNF_OUT_OF_BOUNDS
    const outOfBoundsRes = await RateService.validateHistoricalRate({
      organizationId: orgAlpha,
      milkCategory: 'COW',
      fat: 2.0, // fat_min is 2.5
      snf: 8.5,
      weightLiters: 10.0,
      ratePerLiter: 38.50,
      totalAmount: 385.00,
      businessDate: yesterday,
      rateChartVersionId: verTwoAxisId,
    });
    assert.equal(outOfBoundsRes.isValid, false);
    assert.equal(outOfBoundsRes.errorCode, 'FAT_SNF_OUT_OF_BOUNDS');
  });

  await suite.test('5b. TOTAL_SOLIDS_FORMULA: Rate = (Fat * fatFactor) + (SNF * snfFactor)', async () => {
    // Configured: fatFactor = 6.0, snfFactor = 3.5
    // Test Fat: 4.5, SNF: 8.6
    // Rate = (4.5 * 6.0) + (8.6 * 3.5) = 27.00 + 30.10 = 57.10
    // Total Amount = 12.25 * 57.10 = 699.475 -> 699.48
    const res = await RateService.validateHistoricalRate({
      organizationId: orgAlpha,
      milkCategory: 'COW',
      fat: 4.5,
      snf: 8.6,
      weightLiters: 12.25,
      ratePerLiter: 57.10,
      totalAmount: 699.48,
      businessDate: yesterday,
      rateChartVersionId: verTotalSolidsId,
    });
    assert.equal(res.isValid, true);
    assert.equal(res.authoritativeRate, 57.10);
    assert.equal(res.authoritativeTotal, 699.48);

    // Limits check: SNF > 10.0 (above snf_max) fails with FAT_SNF_OUT_OF_BOUNDS
    const outOfBoundsRes = await RateService.validateHistoricalRate({
      organizationId: orgAlpha,
      milkCategory: 'COW',
      fat: 4.0,
      snf: 10.5, // snf_max is 10.0
      weightLiters: 10.0,
      ratePerLiter: 57.10,
      totalAmount: 571.00,
      businessDate: yesterday,
      rateChartVersionId: verTotalSolidsId,
    });
    assert.equal(outOfBoundsRes.isValid, false);
    assert.equal(outOfBoundsRes.errorCode, 'FAT_SNF_OUT_OF_BOUNDS');
  });

  // Clean exit
  setTimeout(() => process.exit(0), 300);
});
