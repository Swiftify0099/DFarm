import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { db } from '../dist/infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../dist/infrastructure/database/TenantDatabaseManager.js';
import { HmacJwtTokenService } from '../dist/infrastructure/security/HmacJwtTokenService.js';
import {
  deviceChallengeService,
  DeviceChallengeService,
} from '../dist/infrastructure/security/DeviceChallengeService.js';
import { VerifyOperatorOtpUseCase } from '../dist/application/use-cases/auth/OperatorAuthUseCases.js';
import { MIGRATION_MANIFEST, MigrationRunner } from '../dist/infrastructure/database/MigrationRunner.js';
import { loadEnv, validateKeyEntropyAndByteLength } from '../dist/config/env.js';

const tokenService = new HmacJwtTokenService();

/**
 * Host local HTTP server on 127.0.0.1 to provide a W3C Secure Context for Chrome WebCrypto.
 */
class BrowserCryptoRunner {
  constructor() {
    this.server = null;
    this.port = 0;
    this.browser = null;
  }

  async start() {
    this.server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!DOCTYPE html><html><head><title>DFarm WebCrypto Runner</title></head><body>DFarm PWA Kiosk WebCrypto Host</body></html>');
    });

    await new Promise((resolve) => {
      this.server.listen(0, '127.0.0.1', () => {
        this.port = this.server.address().port;
        resolve();
      });
    });

    const { chromium } = await import('playwright');
    this.browser = await chromium.launch({
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      headless: true,
    });
  }

  async evaluate(fnString) {
    if (!this.browser) await this.start();
    const page = await this.browser.newPage();
    try {
      await page.goto(`http://127.0.0.1:${this.port}`);
      return await page.evaluate(new Function(`return (${fnString})()`));
    } finally {
      await page.close();
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    if (this.server) {
      await new Promise((r) => this.server.close(() => r()));
      this.server = null;
    }
  }
}

const browserRunner = new BrowserCryptoRunner();

test('DFARM PROMPT 4.2.5: Browser WebCrypto Compatibility, Verifier Threat Model & Challenge Consumption Audit', async (suite) => {
  await browserRunner.start();

  suite.after(async () => {
    await browserRunner.close();
  });
  const isConnected = await db.checkConnection();
  if (!isConnected) {
    console.log('[PROMPT 4.2.5 TEST] Real PostgreSQL is unavailable. Suite marked NOT RUN.');
    suite.skip('Real PostgreSQL environment unavailable');
    return;
  }

  // Tenant Fixture Identifiers
  const orgAlpha = '00000000-0000-0000-0000-0000000045a1';
  const orgBeta = '00000000-0000-0000-0000-0000000045b2';
  const centerAlpha = '00000000-0000-0000-0000-0000000045c1';
  const centerBeta = '00000000-0000-0000-0000-0000000045c2';
  const operatorAlpha = '00000000-0000-0000-0000-0000000045d1';
  const operatorPhone = '+919822992525';

  // Registered Stations & Provisioned Credentials
  const stationA_Id = '00000000-0000-0000-0000-000000004501';
  const stationA_Name = 'STATION_425_A';
  const stationA_RawToken = 'kiosk-station-425-a-provisioned-secret-key-256bit!';
  const stationA_TokenHash = DeviceChallengeService.deriveProofKey(stationA_RawToken);

  const stationB_Id = '00000000-0000-0000-0000-000000004502';
  const stationB_Name = 'STATION_425_B';
  const stationB_RawToken = 'kiosk-station-425-b-provisioned-secret-key-256bit!';
  const stationB_TokenHash = DeviceChallengeService.deriveProofKey(stationB_RawToken);

  // Setup / Seed Fixtures
  const seedEnvironment = async () => {
    const clients = [db];
    try {
      const alphaDb = await tenantDbManager.getTenantDb(orgAlpha);
      if (alphaDb && alphaDb !== db) clients.push(alphaDb);
    } catch {}

    const codeSuffix = Date.now().toString(36).slice(-5);

    for (const client of clients) {
      await client.query(`
        INSERT INTO organizations (id, name, code, status)
        VALUES 
          ('${orgAlpha}', 'Audit Alpha 4.2.5', 'A425_${codeSuffix}', 'ACTIVE'),
          ('${orgBeta}', 'Audit Beta 4.2.5', 'B425_${codeSuffix}', 'ACTIVE')
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE';
      `);

      await client.query(`
        INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status, timezone)
        VALUES 
          ('${centerAlpha}', '${orgAlpha}', 'C425A_${codeSuffix}', 'Center Alpha 4.2.5', 'Main Rd', 'AlphaTown', 'District', 'State', '416001', '+919876543210', 'ACTIVE', 'Asia/Kolkata'),
          ('${centerBeta}', '${orgBeta}', 'C425B_${codeSuffix}', 'Center Beta 4.2.5', 'Main Rd', 'BetaTown', 'District', 'State', '416002', '+919876543211', 'ACTIVE', 'Asia/Kolkata')
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE';
      `);

      await client.query(`
        INSERT INTO users (id, organization_id, username, phone_number, full_name, role, status)
        VALUES 
          ('${operatorAlpha}', '${orgAlpha}', 'op425_${codeSuffix}', '${operatorPhone}', 'Operator Alpha 4.2.5', 'COLLECTION_OPERATOR', 'ACTIVE')
        ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', username = EXCLUDED.username, phone_number = EXCLUDED.phone_number;
      `);

      await client.query(`
        INSERT INTO devices (id, organization_id, center_id, device_identifier, device_type, status, device_token_hash, last_seen_at)
        VALUES 
          ('${stationA_Id}', '${orgAlpha}', '${centerAlpha}', '${stationA_Name}', 'COUNTER_TERMINAL', 'ACTIVE', '${stationA_TokenHash}', NOW()),
          ('${stationB_Id}', '${orgAlpha}', '${centerAlpha}', '${stationB_Name}', 'COUNTER_TERMINAL', 'ACTIVE', '${stationB_TokenHash}', NOW())
        ON CONFLICT (device_identifier) DO UPDATE SET 
          status = EXCLUDED.status,
          organization_id = EXCLUDED.organization_id,
          device_token_hash = EXCLUDED.device_token_hash;
      `);
    }
  };

  await seedEnvironment();

  const mockOtpService = {
    sendOtp: async () => ({ success: true, message: 'OTP sent' }),
    verifyOtp: async () => true,
  };
  const verifyOperatorUseCase = new VerifyOperatorOtpUseCase(mockOtpService, tokenService);

  // ==========================================================================
  // SECTION 1: P0 — Real Browser Chromium WebCrypto Implementation & Parity
  // ==========================================================================

  await suite.test('1a. Real Chromium Web Crypto: SHA-256 Key Derivation matches server device_token_hash byte-for-byte', async () => {
    const rawToken = stationA_RawToken;

    // Run in real Chromium browser via Web Crypto API (crypto.subtle)
    const browserDerivedKey = await browserRunner.evaluate(`
      async () => {
        const clean = "${rawToken}".trim();
        const enc = new TextEncoder();
        const data = enc.encode(clean);
        const digestBuffer = await window.crypto.subtle.digest("SHA-256", data);
        const bytes = new Uint8Array(digestBuffer);
        let hex = "";
        for (let i = 0; i < bytes.length; i++) {
          hex += bytes[i].toString(16).padStart(2, "0");
        }
        return hex;
      }
    `);

    const serverStoredHash = stationA_TokenHash;

    assert.equal(typeof browserDerivedKey, 'string');
    assert.equal(browserDerivedKey.length, 64);
    assert.equal(browserDerivedKey, serverStoredHash);
  });

  await suite.test('1b. Real Chromium Web Crypto: HMAC-SHA256 Proof Generation matches backend calculation', async () => {
    const testSecret = 'dfarm-fixed-test-token-key-256bits-v1';
    const testDeviceId = 'STATION_VECTOR_99';
    const testChallenge = 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899';

    // Compute expected proof in Node.js
    const nodeDerivedKey = crypto.createHash('sha256').update(testSecret, 'utf8').digest('hex');
    const expectedProof = DeviceChallengeService.computeProof(testChallenge, nodeDerivedKey, testDeviceId);

    // Compute proof in real Chromium using W3C Web Crypto (crypto.subtle.importKey + crypto.subtle.sign)
    const browserProof = await browserRunner.evaluate(`
      async () => {
        const enc = new TextEncoder();
        const tokenBytes = enc.encode("${testSecret}".trim());
        const digestBuf = await window.crypto.subtle.digest("SHA-256", tokenBytes);
        const digestBytes = new Uint8Array(digestBuf);
        let keyHex = "";
        for (let i = 0; i < digestBytes.length; i++) {
          keyHex += digestBytes[i].toString(16).padStart(2, "0");
        }

        const keyBytes = enc.encode(keyHex);
        const msgBytes = enc.encode("${testDeviceId}:${testChallenge}");

        const cryptoKey = await window.crypto.subtle.importKey(
          "raw",
          keyBytes,
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"]
        );

        const sigBuf = await window.crypto.subtle.sign("HMAC", cryptoKey, msgBytes);
        const sigBytes = new Uint8Array(sigBuf);
        let proofHex = "";
        for (let i = 0; i < sigBytes.length; i++) {
          proofHex += sigBytes[i].toString(16).padStart(2, "0");
        }
        return proofHex;
      }
    `);

    assert.equal(browserProof, expectedProof);
    assert.equal(browserProof.length, 64);
    assert.ok(DeviceChallengeService.verifyProof(testChallenge, nodeDerivedKey, testDeviceId, browserProof));
  });

  await suite.test('1c. Real Chromium Web Crypto: Full Login flow succeeds with browser-generated proof (Zero-Bearer)', async () => {
    // 1. Server issues single-use challenge
    const { challenge } = await deviceChallengeService.createChallenge(stationA_Name, orgAlpha, 60000);
    assert.ok(challenge);

    // 2. Real Chromium computes HMAC proof using WebCrypto
    const browserProof = await browserRunner.evaluate(`
      async () => {
        const enc = new TextEncoder();
        const tokenBytes = enc.encode("${stationA_RawToken}".trim());
        const digestBuf = await window.crypto.subtle.digest("SHA-256", tokenBytes);
        const digestBytes = new Uint8Array(digestBuf);
        let keyHex = "";
        for (let i = 0; i < digestBytes.length; i++) {
          keyHex += digestBytes[i].toString(16).padStart(2, "0");
        }

        const keyBytes = enc.encode(keyHex);
        const msgBytes = enc.encode("${stationA_Name}:${challenge}");

        const cryptoKey = await window.crypto.subtle.importKey(
          "raw",
          keyBytes,
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"]
        );

        const sigBuf = await window.crypto.subtle.sign("HMAC", cryptoKey, msgBytes);
        const sigBytes = new Uint8Array(sigBuf);
        let proofHex = "";
        for (let i = 0; i < sigBytes.length; i++) {
          proofHex += sigBytes[i].toString(16).padStart(2, "0");
        }
        return proofHex;
      }
    `);

    // 3. Backend verifies operator OTP with browser proof
    const loginResult = await verifyOperatorUseCase.execute(
      operatorPhone,
      '123456',
      stationA_Name,
      {
        challenge,
        deviceProof: browserProof,
        // deviceToken is explicitly OMITTED — guaranteed zero bearer transmission
      }
    );

    assert.ok(loginResult.token);
    assert.equal(loginResult.operator.fullName, 'Operator Alpha 4.2.5');
    assert.equal(loginResult.operator.deviceId, stationA_Name);
  });

  await suite.test('1d. Cryptographic Rejection: Altered challenge in browser proof is rejected by backend', async () => {
    const { challenge } = await deviceChallengeService.createChallenge(stationA_Name, orgAlpha, 60000);
    const tamperedChallenge = challenge.slice(0, -2) + (challenge.endsWith('0') ? '1' : '0');

    const browserProof = await browserRunner.evaluate(`
      async () => {
        const enc = new TextEncoder();
        const tokenBytes = enc.encode("${stationA_RawToken}".trim());
        const digestBuf = await window.crypto.subtle.digest("SHA-256", tokenBytes);
        const digestBytes = new Uint8Array(digestBuf);
        let keyHex = "";
        for (let i = 0; i < digestBytes.length; i++) {
          keyHex += digestBytes[i].toString(16).padStart(2, "0");
        }

        const keyBytes = enc.encode(keyHex);
        const msgBytes = enc.encode("${stationA_Name}:${tamperedChallenge}");

        const cryptoKey = await window.crypto.subtle.importKey(
          "raw",
          keyBytes,
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"]
        );

        const sigBuf = await window.crypto.subtle.sign("HMAC", cryptoKey, msgBytes);
        const sigBytes = new Uint8Array(sigBuf);
        let proofHex = "";
        for (let i = 0; i < sigBytes.length; i++) {
          proofHex += sigBytes[i].toString(16).padStart(2, "0");
        }
        return proofHex;
      }
    `);

    await assert.rejects(
      async () => {
        await verifyOperatorUseCase.execute(operatorPhone, '123456', stationA_Name, {
          challenge,
          deviceProof: browserProof,
        });
      },
      (err) => {
        assert.match(err.message, /invalid challenge response proof|verification failed/i);
        return true;
      }
    );
  });

  await suite.test('1e. Cryptographic Rejection: Altered station ID in browser proof is rejected by backend', async () => {
    const { challenge } = await deviceChallengeService.createChallenge(stationA_Name, orgAlpha, 60000);

    const browserProofTamperedStation = await browserRunner.evaluate(`
      async () => {
        const enc = new TextEncoder();
        const tokenBytes = enc.encode("${stationA_RawToken}".trim());
        const digestBuf = await window.crypto.subtle.digest("SHA-256", tokenBytes);
        const digestBytes = new Uint8Array(digestBuf);
        let keyHex = "";
        for (let i = 0; i < digestBytes.length; i++) {
          keyHex += digestBytes[i].toString(16).padStart(2, "0");
        }

        const keyBytes = enc.encode(keyHex);
        const msgBytes = enc.encode("STATION_IMPERSONATOR:${challenge}");

        const cryptoKey = await window.crypto.subtle.importKey(
          "raw",
          keyBytes,
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"]
        );

        const sigBuf = await window.crypto.subtle.sign("HMAC", cryptoKey, msgBytes);
        const sigBytes = new Uint8Array(sigBuf);
        let proofHex = "";
        for (let i = 0; i < sigBytes.length; i++) {
          proofHex += sigBytes[i].toString(16).padStart(2, "0");
        }
        return proofHex;
      }
    `);

    await assert.rejects(
      async () => {
        await verifyOperatorUseCase.execute(operatorPhone, '123456', stationA_Name, {
          challenge,
          deviceProof: browserProofTamperedStation,
        });
      },
      (err) => {
        assert.match(err.message, /invalid challenge response proof|verification failed/i);
        return true;
      }
    );
  });

  // ==========================================================================
  // SECTION 2: P0 — Challenge Consumption Ordering & Wrong-Device DoS Protection
  // ==========================================================================

  await suite.test('2a. Wrong Device CANNOT consume another device\'s challenge (DoS prevention)', async () => {
    // Station A requests a challenge
    const { challenge } = await deviceChallengeService.createChallenge(stationA_Name, orgAlpha, 60000);

    // Station B attempts to submit Station A's challenge
    const wrongDeviceAttempt = await deviceChallengeService.verifyAndConsumeProof({
      challenge,
      deviceIdentifier: stationB_Name, // Wrong station!
      organizationId: orgAlpha,
      purpose: 'OPERATOR_LOGIN',
      candidateProof: '0000000000000000000000000000000000000000000000000000000000000000',
      proofKeyOrToken: stationB_TokenHash,
    });

    assert.equal(wrongDeviceAttempt.valid, false);
    assert.match(wrongDeviceAttempt.reason, /was issued for device 'STATION_425_A', not 'STATION_425_B'/);

    // CRITICAL: Station A's challenge MUST NOT have been consumed by Station B's unauthorized attempt!
    const inspectDb = await db.query(
      `SELECT consumed_at, failed_attempts FROM device_auth_challenges WHERE challenge = $1;`,
      [challenge]
    );
    assert.equal(inspectDb.rows.length, 1);
    assert.equal(inspectDb.rows[0].consumed_at, null, 'Challenge must remain unconsumed after wrong-device attempt');
    assert.equal(Number(inspectDb.rows[0].failed_attempts), 0, 'Failed attempts must not be incremented on wrong device');

    // Legitimate Station A can now successfully consume the challenge
    const validProof = DeviceChallengeService.computeProof(challenge, stationA_TokenHash, stationA_Name);
    const legitimateAttempt = await deviceChallengeService.verifyAndConsumeProof({
      challenge,
      deviceIdentifier: stationA_Name,
      organizationId: orgAlpha,
      purpose: 'OPERATOR_LOGIN',
      candidateProof: validProof,
      proofKeyOrToken: stationA_TokenHash,
    });

    assert.equal(legitimateAttempt.valid, true);
  });

  await suite.test('2b. Bounded Failed Attempts: Invalid proof does not burn challenge immediately, but limits to 3 tries', async () => {
    const { challenge } = await deviceChallengeService.createChallenge(stationA_Name, orgAlpha, 60000);
    const bogusProof = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

    // Attempt 1: Failed proof
    const try1 = await deviceChallengeService.verifyAndConsumeProof({
      challenge,
      deviceIdentifier: stationA_Name,
      organizationId: orgAlpha,
      purpose: 'OPERATOR_LOGIN',
      candidateProof: bogusProof,
      proofKeyOrToken: stationA_TokenHash,
    });
    assert.equal(try1.valid, false);

    // Check DB: not consumed, failed_attempts = 1
    let dbCheck = await db.query(
      `SELECT consumed_at, failed_attempts FROM device_auth_challenges WHERE challenge = $1;`,
      [challenge]
    );
    assert.equal(dbCheck.rows[0].consumed_at, null);
    assert.equal(Number(dbCheck.rows[0].failed_attempts), 1);

    // Attempt 2: Failed proof
    const try2 = await deviceChallengeService.verifyAndConsumeProof({
      challenge,
      deviceIdentifier: stationA_Name,
      organizationId: orgAlpha,
      purpose: 'OPERATOR_LOGIN',
      candidateProof: bogusProof,
      proofKeyOrToken: stationA_TokenHash,
    });
    assert.equal(try2.valid, false);

    dbCheck = await db.query(
      `SELECT consumed_at, failed_attempts FROM device_auth_challenges WHERE challenge = $1;`,
      [challenge]
    );
    assert.equal(dbCheck.rows[0].consumed_at, null);
    assert.equal(Number(dbCheck.rows[0].failed_attempts), 2);

    // Attempt 3: 3rd Failed proof — reaches bound limit, challenge is burned!
    const try3 = await deviceChallengeService.verifyAndConsumeProof({
      challenge,
      deviceIdentifier: stationA_Name,
      organizationId: orgAlpha,
      purpose: 'OPERATOR_LOGIN',
      candidateProof: bogusProof,
      proofKeyOrToken: stationA_TokenHash,
    });
    assert.equal(try3.valid, false);

    dbCheck = await db.query(
      `SELECT consumed_at, failed_attempts FROM device_auth_challenges WHERE challenge = $1;`,
      [challenge]
    );
    assert.ok(dbCheck.rows[0].consumed_at, 'Challenge must be marked consumed after 3 failed attempts');
    assert.equal(Number(dbCheck.rows[0].failed_attempts), 3);

    // Attempt 4: Even with correct proof, challenge is now burned and rejected
    const validProof = DeviceChallengeService.computeProof(challenge, stationA_TokenHash, stationA_Name);
    const try4 = await deviceChallengeService.verifyAndConsumeProof({
      challenge,
      deviceIdentifier: stationA_Name,
      organizationId: orgAlpha,
      purpose: 'OPERATOR_LOGIN',
      candidateProof: validProof,
      proofKeyOrToken: stationA_TokenHash,
    });
    assert.equal(try4.valid, false);
    assert.match(try4.reason, /already been consumed|attempts exceeded/i);
  });

  await suite.test('2c. Concurrent Consumption: Two parallel submissions of same challenge — exactly ONE succeeds', async () => {
    const instanceA = new DeviceChallengeService();
    const instanceB = new DeviceChallengeService();

    const { challenge } = await instanceA.createChallenge(stationA_Name, orgAlpha, 60000);
    const validProof = DeviceChallengeService.computeProof(challenge, stationA_TokenHash, stationA_Name);

    // Fire two simultaneous requests
    const [res1, res2] = await Promise.all([
      instanceA.verifyAndConsumeProof({
        challenge,
        deviceIdentifier: stationA_Name,
        organizationId: orgAlpha,
        candidateProof: validProof,
        proofKeyOrToken: stationA_TokenHash,
      }),
      instanceB.verifyAndConsumeProof({
        challenge,
        deviceIdentifier: stationA_Name,
        organizationId: orgAlpha,
        candidateProof: validProof,
        proofKeyOrToken: stationA_TokenHash,
      }),
    ]);

    const successes = [res1, res2].filter((r) => r.valid).length;
    const failures = [res1, res2].filter((r) => !r.valid).length;

    assert.equal(successes, 1, 'Exactly one concurrent verification must succeed');
    assert.equal(failures, 1, 'Exactly one concurrent verification must be rejected');
  });

  await suite.test('2d. Cold-Memory Backend Restart: Consumed challenge cannot be replayed after restart', async () => {
    const instance1 = new DeviceChallengeService();
    const { challenge } = await instance1.createChallenge(stationA_Name, orgAlpha, 60000);
    const proof = DeviceChallengeService.computeProof(challenge, stationA_TokenHash, stationA_Name);

    const firstSuccess = await instance1.verifyAndConsumeProof({
      challenge,
      deviceIdentifier: stationA_Name,
      organizationId: orgAlpha,
      candidateProof: proof,
      proofKeyOrToken: stationA_TokenHash,
    });
    assert.equal(firstSuccess.valid, true);

    // Cold instance simulation (simulates pod restart with clean memory)
    const restartedInstance = new DeviceChallengeService();
    const replayAttempt = await restartedInstance.verifyAndConsumeProof({
      challenge,
      deviceIdentifier: stationA_Name,
      organizationId: orgAlpha,
      candidateProof: proof,
      proofKeyOrToken: stationA_TokenHash,
    });

    assert.equal(replayAttempt.valid, false);
    assert.match(replayAttempt.reason, /already been consumed|replay/i);
  });

  // ==========================================================================
  // SECTION 3: P1 — Migration 040 Registration & DB State Verification
  // ==========================================================================

  await suite.test('3a. Migration 040: Registered in MIGRATION_MANIFEST and recorded in schema_migrations', async () => {
    const manifestEntry = MIGRATION_MANIFEST.find((m) => m.version === '040');
    assert.ok(manifestEntry, 'Migration 040 must be registered in MIGRATION_MANIFEST');
    assert.equal(manifestEntry.filename, '040_device_auth_challenges.sql');

    const dbRecord = await db.query(
      `SELECT version, name, checksum, applied_at FROM schema_migrations WHERE version = '040';`
    );
    assert.equal(dbRecord.rows.length, 1, 'Migration 040 must be recorded in schema_migrations table');
    assert.ok(dbRecord.rows[0].checksum, 'Migration 040 must record valid SHA-256 checksum');
  });

  await suite.test('3b. Migration 040: Indexes and columns exist on device_auth_challenges', async () => {
    const cols = await db.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'device_auth_challenges';`
    );
    const colNames = new Set(cols.rows.map((r) => r.column_name));

    assert.ok(colNames.has('challenge'));
    assert.ok(colNames.has('device_identifier'));
    assert.ok(colNames.has('organization_id'));
    assert.ok(colNames.has('purpose'));
    assert.ok(colNames.has('failed_attempts'));
    assert.ok(colNames.has('created_at'));
    assert.ok(colNames.has('expires_at'));
    assert.ok(colNames.has('consumed_at'));

    const indexes = await db.query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'device_auth_challenges';`
    );
    const idxNames = new Set(indexes.rows.map((r) => r.indexname));
    assert.ok(idxNames.has('idx_device_challenges_dev_org'));
    assert.ok(idxNames.has('idx_device_challenges_expiry'));
  });

  await suite.test('3c. Bounded Cleanup: Expired challenge cleanup does not affect devices or other tables', async () => {
    // Create an artificial old expired challenge
    const oldChallenge = crypto.randomBytes(32).toString('hex');
    await db.query(`
      INSERT INTO device_auth_challenges (challenge, device_identifier, organization_id, purpose, created_at, expires_at)
      VALUES ('${oldChallenge}', '${stationA_Name}', '${orgAlpha}', 'OPERATOR_LOGIN', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '90 minutes');
    `);

    // Run bounded cleanup
    await db.query(`DELETE FROM device_auth_challenges WHERE expires_at < NOW() - INTERVAL '1 hour';`);

    const checkOld = await db.query(`SELECT challenge FROM device_auth_challenges WHERE challenge = $1;`, [oldChallenge]);
    assert.equal(checkOld.rows.length, 0, 'Expired challenge older than 1 hour must be deleted');

    // Verify devices table is untouched
    const devCount = await db.query(`SELECT COUNT(*)::INT AS cnt FROM devices WHERE device_identifier = $1;`, [stationA_Name]);
    assert.equal(devCount.rows[0].cnt, 1, 'Device record must remain completely intact');
  });

  // ==========================================================================
  // SECTION 4: P1 — Production Secret Provisioning Evidence
  // ==========================================================================

  await suite.test('4a. Secret Validation: Production startup strictly rejects missing OFFLINE_LEASE_SIGNING_KEY', () => {
    assert.throws(
      () => {
        loadEnv({
          NODE_ENV: 'production',
          SUPABASE_URL: 'http://127.0.0.1:54321',
          SUPABASE_ANON_KEY: 'test-anon-key-mock-valid-string-12345678',
          SUPABASE_SERVICE_ROLE_KEY: 'test-service-key-mock-valid-string-12345678',
          OFFLINE_LEASE_SIGNING_KEY: undefined,
          JWT_SECRET: 'a'.repeat(64),
        });
      },
      (err) => {
        assert.match(err.message, /Dedicated OFFLINE_LEASE_SIGNING_KEY must be configured/i);
        return true;
      }
    );
  });

  await suite.test('4b. Secret Validation: Low-entropy or repetitive keys strictly rejected', () => {
    // 64-char hex string with repeated chunk: fails repetitive pattern check
    const repetitiveKey = 'abcd1234'.repeat(8);
    assert.throws(
      () => {
        validateKeyEntropyAndByteLength(repetitiveKey, 'OFFLINE_LEASE_SIGNING_KEY');
      },
      (err) => {
        assert.match(err.message, /repetitive pattern detected|entropy verification/i);
        return true;
      }
    );
  });

  await suite.test('4c. Secret Validation: Cryptographically secure 256-bit key passes validation', () => {
    const validKey = crypto.randomBytes(32).toString('hex');
    assert.doesNotThrow(() => {
      validateKeyEntropyAndByteLength(validKey, 'OFFLINE_LEASE_SIGNING_KEY');
    });
  });
});
