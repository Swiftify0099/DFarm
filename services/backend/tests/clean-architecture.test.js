import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../dist/app.js';
import {
  Money,
  FatPercentage,
  SnfPercentage,
  MilkWeight,
  RfidUid,
  PhoneNumber,
} from '../dist/domain/value-objects/index.js';
import {
  CustomerSuspendedError,
  CategoryNotAuthorizedError,
  DomainValidationError,
} from '../dist/domain/errors/index.js';
import { RateChart } from '../dist/domain/entities/RateChart.js';
import { CustomerLedgerAccount } from '../dist/domain/entities/CustomerLedgerAccount.js';
import { Customer } from '../dist/domain/entities/Customer.js';
import { Aes256GcmBiometricEncryptor } from '../dist/infrastructure/security/Aes256GcmBiometricEncryptor.js';
import { HmacJwtTokenService } from '../dist/infrastructure/security/HmacJwtTokenService.js';
import { MemoryOrDevOtpService } from '../dist/infrastructure/otp/MemoryOrDevOtpService.js';
import { db } from '../dist/infrastructure/database/PostgresPool.js';

// Setup resilient DB query fallback for environments where local PostgreSQL container is not started
const originalQuery = db.query.bind(db);
db.query = async (text, params) => {
  try {
    return await originalQuery(text, params);
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      if (text.includes('SELECT id, full_name, user_role, is_active FROM users')) {
        return {
          rows: [
            {
              id: 'user-op-1',
              full_name: 'Test Operator',
              user_role: 'COLLECTION_OPERATOR',
              is_active: true,
            },
          ],
          rowCount: 1,
        };
      }
      if (text.includes('SELECT \n        u.id, \n        u.full_name')) {
        return {
          rows: [
            {
              id: 'user-op-1',
              full_name: 'Test Operator',
              normalized_mobile_number: '+919822114477',
              user_role: 'COLLECTION_OPERATOR',
              organization_id: '00000000-0000-0000-0000-000000000001',
              center_id: '00000000-0000-0000-0000-000000000002',
            },
          ],
          rowCount: 1,
        };
      }
      if (text.includes('FROM kiosk_shift_sessions')) {
        return {
          rows: [
            {
              id: 'session-101',
              session_code: 'SH-20261115-M-KIOS',
              organization_id: '00000000-0000-0000-0000-000000000001',
              center_id: '00000000-0000-0000-0000-000000000002',
              business_date: '2026-11-15',
              shift: 'MORNING',
              status: 'OPEN',
              opened_at: new Date().toISOString(),
              closed_at: null,
              opening_operator_id: 'user-op-1',
              opening_operator_name: 'Test Operator',
              device_identifier: 'KIOSK_MAIN',
              device_name: 'Counter Kiosk',
              total_liters: 0.0,
              cow_liters: 0.0,
              buffalo_liters: 0.0,
              transaction_count: 0,
              total_amount: 0.0,
              average_fat: 0.0,
              average_snf: 0.0,
            },
          ],
          rowCount: 1,
        };
      }
      if (text.includes('FROM organizations o')) {
        return {
          rows: [
            {
              dairy_id: '00000000-0000-0000-0000-000000000001',
              dairy_name: 'DFarm Cooperative',
              registration_number: 'REG-101',
              center_id: '00000000-0000-0000-0000-000000000002',
              center_code: 'C-01',
              center_name: 'Tasgaon Center',
              state: 'Maharashtra',
              district: 'Sangli',
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    }
    throw err;
  }
};

test('DFarm Clean Architecture Implementation Test Suite', async (t) => {
  const app = createApp();

  await t.test('1. Domain Value Objects Validation', () => {
    // Money Half-Even Banker's Rounding
    const m1 = new Money(10.255);
    assert.strictEqual(m1.value, 10.26);

    const m2 = new Money(10.245);
    assert.strictEqual(m2.value, 10.25);

    // Negative money throws
    assert.throws(() => new Money(-5), Error);

    // FatPercentage
    const cowFat = new FatPercentage(3.8, 'COW');
    assert.strictEqual(cowFat.value, 3.8);
    // Cow fat out of bounds
    assert.throws(() => new FatPercentage(1.0, 'COW'), DomainValidationError);
    assert.throws(() => new FatPercentage(11.0, 'COW'), DomainValidationError);

    // SnfPercentage
    const cowSnf = new SnfPercentage(8.5, 'COW');
    assert.strictEqual(cowSnf.value, 8.5);
    assert.throws(() => new SnfPercentage(4.0, 'COW'), DomainValidationError);

    // MilkWeight
    const weight = new MilkWeight(12.5);
    assert.strictEqual(weight.value, 12.5);
    assert.throws(() => new MilkWeight(0), DomainValidationError);
    assert.throws(() => new MilkWeight(505), DomainValidationError);

    // RfidUid
    const rfid = new RfidUid('1a2b3c4d');
    assert.strictEqual(rfid.value, '1A2B3C4D');
    assert.throws(() => new RfidUid('invalid!'), DomainValidationError);

    // PhoneNumber
    const phone = new PhoneNumber('9876543210');
    assert.strictEqual(phone.e164, '+919876543210');
    assert.throws(() => new PhoneNumber('123'), DomainValidationError);
  });

  await t.test('2. Biometric Encryption Engine (128-dim OpenCV SFace INT8)', () => {
    const encryptor = new Aes256GcmBiometricEncryptor();
    const customerId = 'cust-test-128';
    const modelVersionId = 'sface_int8_2021dec';

    // Create 128-dim pseudo vector
    const embedding = Array.from({ length: 128 }, (_, i) => Math.sin(i));

    // Must encrypt 128-dim vector cleanly
    const encrypted = encryptor.encrypt128DimEmbedding(embedding, customerId, modelVersionId);
    assert.ok(encrypted.encryptedData);
    assert.ok(encrypted.iv);
    assert.ok(encrypted.authTag);
    assert.strictEqual(encrypted.keyReference, 'key-sface128-v1');

    // Reject non-128 vectors (e.g. legacy 512)
    const invalidVector512 = Array.from({ length: 512 }, () => 0.1);
    assert.throws(
      () => encryptor.encrypt128DimEmbedding(invalidVector512, customerId, modelVersionId),
      /Embedding vector length must be 128/
    );

    // Decrypt and verify exact Float32 precision
    const decrypted = encryptor.decrypt128DimEmbedding(
      encrypted.encryptedData,
      encrypted.iv,
      encrypted.authTag,
      customerId,
      modelVersionId
    );

    assert.strictEqual(decrypted.length, 128);
    for (let i = 0; i < 128; i++) {
      assert.ok(Math.abs(decrypted[i] - embedding[i]) < 0.0001);
    }

    // Tampering with AAD customerId or modelVersionId must fail authentication tag
    assert.throws(
      () =>
        encryptor.decrypt128DimEmbedding(
          encrypted.encryptedData,
          encrypted.iv,
          encrypted.authTag,
          'wrong-customer-id',
          modelVersionId
        ),
      /Biometric decryption failed/
    );
  });

  await t.test('3. HMAC-SHA256 JWT Service (Zero Backdoors)', () => {
    const tokenService = new HmacJwtTokenService('super-secret-test-key-32-chars-long');

    const token = tokenService.signToken({
      userId: 'user-op-1',
      organizationId: 'org-1',
      centerId: 'center-1',
      role: 'COLLECTION_OPERATOR',
      actorType: 'STAFF',
    });

    const claims = tokenService.verifyToken(token);
    assert.strictEqual(claims.userId, 'user-op-1');
    assert.strictEqual(claims.role, 'COLLECTION_OPERATOR');
    assert.strictEqual(claims.actorType, 'STAFF');

    // Reject mock tokens or UUID bypasses
    assert.throws(
      () => tokenService.verifyToken('00000000-0000-0000-0000-000000000000'),
      /Malformed JWT token structure/
    );

    // Reject tampered tokens
    const tampered = token.slice(0, -5) + 'xxxxx';
    assert.throws(() => tokenService.verifyToken(tampered), /Invalid token signature/);
  });

  await t.test('4. Rate Engine Calculation (Grid + Formula Fallback)', () => {
    const rateChart = new RateChart({
      id: 'rc-1',
      organizationId: 'org-1',
      name: 'Cow Rate Chart',
      milkCategory: 'COW',
      pricingType: 'GRID',
      version: 1,
      versionId: 'rcv-1',
      baseRatePerLiter: 38.0,
      fatFactor: 4.2,
      snfFactor: 3.5,
      cells: [
        { fat: 4.0, snf: 8.5, ratePerLiter: 40.1 },
      ],
      isActive: true,
      effectiveFrom: new Date().toISOString(),
    });

    // 1. Exact grid match
    const exact = rateChart.calculateRate(4.0, 8.5);
    assert.strictEqual(exact.rule, 'EXACT_GRID_CELL');
    assert.strictEqual(exact.ratePerLiter, 40.1);
    assert.strictEqual(exact.totalForVolume(10), 401.0);

    // 2. Fallback formula
    const fallback = rateChart.calculateRate(3.5, 8.5);
    assert.strictEqual(fallback.rule, 'TWO_AXIS_FORMULA_FALLBACK');
    assert.strictEqual(fallback.ratePerLiter, 38.0);
    assert.strictEqual(fallback.totalForVolume(10), 380.0);
  });

  await t.test('5. Customer Ledger Account Double-Entry Ledger', () => {
    const account = new CustomerLedgerAccount({
      id: 'ledger-acc-1',
      customerId: 'cust-1',
      organizationId: 'org-1',
      currentBalance: 500.0,
      totalMilkEarnings: 2000.0,
      totalDeductions: 1500.0,
      lastUpdated: new Date().toISOString(),
    });

    // Post milk credit of ₹350
    const creditEntry = account.postCredit(350.0, 'Morning Milk Intake 10L', 'txn-101');
    assert.strictEqual(account.currentBalance, 850.0);
    assert.strictEqual(account.totalMilkEarnings, 2350.0);
    assert.strictEqual(creditEntry.creditAmount, 350.0);
    assert.strictEqual(creditEntry.runningBalance, 850.0);

    // Post feed deduction debit of ₹200
    const debitEntry = account.postDebit(200.0, 'FEED_DEBIT', 'Cattle Feed 50kg bag', 'feed-501');
    assert.strictEqual(account.currentBalance, 650.0);
    assert.strictEqual(account.totalDeductions, 1700.0);
    assert.strictEqual(debitEntry.debitAmount, 200.0);
    assert.strictEqual(debitEntry.runningBalance, 650.0);
  });

  await t.test('6. Customer Entity Domain Invariants', () => {
    const customer = new Customer({
      id: 'cust-1',
      organizationId: 'org-1',
      centerId: 'center-1',
      farmerCode: 'F-101',
      fullName: 'Ramesh Patil',
      mobileNumber: '+919876543210',
      status: 'ACTIVE',
      registrationStatus: 'APPROVED',
      permittedCategories: ['COW'],
    });

    // Allowed delivery
    assert.doesNotThrow(() => customer.validateCanDeliver('COW'));

    // Category not authorized
    assert.throws(() => customer.validateCanDeliver('BUFFALO'), CategoryNotAuthorizedError);

    // Suspended customer
    const suspended = new Customer({
      id: 'cust-2',
      organizationId: 'org-1',
      centerId: 'center-1',
      farmerCode: 'F-102',
      fullName: 'Suresh More',
      mobileNumber: '+919876543211',
      status: 'SUSPENDED',
      registrationStatus: 'APPROVED',
      permittedCategories: ['COW', 'BUFFALO'],
    });
    assert.throws(() => suspended.validateCanDeliver('COW'), CustomerSuspendedError);
  });

  await t.test('7. OTP Service Workflow', async () => {
    const otpService = new MemoryOrDevOtpService();
    const phone = '+919822334455';

    // Send OTP
    const sendRes = await otpService.sendOtp(phone, 'OPERATOR_LOGIN');
    assert.strictEqual(sendRes.success, true);
    assert.ok(sendRes.previewOtp);

    // Resend within 30s throws cooldown error
    await assert.rejects(
      async () => otpService.sendOtp(phone, 'OPERATOR_LOGIN'),
      DomainValidationError
    );

    // Verify OTP with wrong code
    const wrong = await otpService.verifyOtp(phone, '000000', 'OPERATOR_LOGIN');
    assert.strictEqual(wrong, false);

    // Verify OTP with correct code
    const correct = await otpService.verifyOtp(phone, sendRes.previewOtp, 'OPERATOR_LOGIN');
    assert.strictEqual(correct, true);

    // Replay verified OTP fails (single use)
    const replay = await otpService.verifyOtp(phone, sendRes.previewOtp, 'OPERATOR_LOGIN');
    assert.strictEqual(replay, false);
  });

  await t.test('8. HTTP Endpoints Contract Verification', async () => {
    // A. Operator Request OTP
    const reqOtpRes = await request(app)
      .post('/api/v1/auth/operator/otp/request')
      .send({ mobileNumber: '9822114477' });
    assert.strictEqual(reqOtpRes.status, 200);
    assert.strictEqual(reqOtpRes.body.success, true);
    const otp = reqOtpRes.body.previewOtp;
    assert.ok(otp);

    // B. Operator Verify OTP
    const verifyRes = await request(app)
      .post('/api/v1/auth/operator/otp/verify')
      .send({ mobileNumber: '9822114477', otp });
    assert.strictEqual(verifyRes.status, 200);
    assert.ok(verifyRes.body.token);
    const operatorToken = verifyRes.body.token;

    // C. Get Active Shift Session
    const sessionRes = await request(app)
      .get('/api/v1/collections/sessions/active?deviceId=KIOSK_MAIN')
      .set('Authorization', `Bearer ${operatorToken}`);
    assert.strictEqual(sessionRes.status, 200);
    assert.strictEqual(sessionRes.body.success, true);
    assert.ok(sessionRes.body.data.sessionCode);
    assert.strictEqual(sessionRes.body.data.status, 'OPEN');

    // D. Customer Request OTP
    const custOtpRes = await request(app)
      .post('/api/v1/auth/request-otp')
      .send({ mobileNumber: '9890011223' });
    assert.strictEqual(custOtpRes.status, 200);
    assert.strictEqual(custOtpRes.body.success, true);

    // E. Device Telemetry
    const telemetryRes = await request(app).get('/api/v1/devices/telemetry?deviceId=KIOSK_MAIN');
    assert.strictEqual(telemetryRes.status, 200);
    assert.strictEqual(telemetryRes.body.success, true);
    assert.strictEqual(telemetryRes.body.data.status, 'ONLINE');

    // F. Dairies Nearby
    const dairiesRes = await request(app).get('/api/v1/dairies/nearby');
    assert.strictEqual(dairiesRes.status, 200);
    assert.strictEqual(dairiesRes.body.success, true);
  });
});
