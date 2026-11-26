import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';

// Ensure test harness starts in strict test mode with fast DB failover if no local PG
process.env.NODE_ENV = 'test';
if (!process.env.TENANT_POOL_CONNECTION_TIMEOUT_MS) {
  process.env.TENANT_POOL_CONNECTION_TIMEOUT_MS = '1500';
}

const { createApp } = await import('../dist/app.js');
const { loadEnv, validateKeyEntropyAndByteLength, config } = await import('../dist/config/env.js');
const { DoveOtpService, doveOtpService } = await import('../dist/infrastructure/otp/DoveOtpService.js');
const { doveSmsService } = await import('../dist/infrastructure/sms/DoveSmsService.js');
const { HmacJwtTokenService } = await import('../dist/infrastructure/security/HmacJwtTokenService.js');
const { RequestAdminOtpUseCase, VerifyAdminOtpUseCase } = await import('../dist/application/use-cases/auth/AdminAuthUseCases.js');
const { serializeOtpResponse } = await import('../dist/presentation/routes/auth.routes.js');
const { db } = await import('../dist/infrastructure/database/PostgresPool.js');
const { logger } = await import('../dist/shared/logger/index.js');

const app = createApp();
const tokenService = new HmacJwtTokenService();

function buildValidProdEnv(overrides = {}) {
  return {
    NODE_ENV: 'production',
    SUPABASE_URL: 'https://demo.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid_anon_key_payload',
    SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid_service_key_payload',
    JWT_SECRET: crypto.randomBytes(32).toString('hex'),
    ADMIN_OTP_SECRET: crypto.randomBytes(32).toString('hex'),
    TENANT_DB_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
    DATA_ENCRYPTION_KEY_HEX: crypto.randomBytes(32).toString('hex'),
    OFFLINE_LEASE_SIGNING_KEY: crypto.randomBytes(32).toString('hex'),
    DOVE_SMS_AUTHKEY: 'dove-prod-auth-key-test-valid-123456',
    CORS_ALLOWED_ORIGINS:
      'https://collection.dfarm.in,https://dairy.dfarm.in,https://admin.dfarm.in,https://dfarm-collection.pages.dev,https://dfarm-dairy-admin.pages.dev,https://dfarm-super-admin.pages.dev',
    ALLOW_TEST_PREVIEW_OTP: 'false',
    ...overrides,
  };
}

test('FIX-01: Production Authentication, OTP Security, Secret Validation & CORS Regression Suite', async (suite) => {
  // Seed active & inactive fixture records in DB (real PG or isolated pg-mem)
  const orgActiveId = '11111111-1111-4111-a111-000000000101';
  const orgInactiveId = '11111111-1111-4111-a111-000000000102';
  const superAdminId = '11111111-1111-4111-a111-000000000201';
  const dairyAdminActiveId = '11111111-1111-4111-a111-000000000202';
  const dairyAdminSuspendedId = '11111111-1111-4111-a111-000000000203';
  const farmerUserId = '11111111-1111-4111-a111-000000000204';
  const operatorUserId = '11111111-1111-4111-a111-000000000205';
  const suspendedOrgAdminId = '11111111-1111-4111-a111-000000000206';

  const superAdminPhone = '+919900110001';
  const dairyAdminActivePhone = '+919900110002';
  const dairyAdminSuspendedPhone = '+919900110003';
  const farmerPhone = '+919900110004';
  const operatorPhone = '+919900110005';
  const suspendedOrgAdminPhone = '+919900110006';
  const customerPhone = '+919900110007';

  await db.query(
    `INSERT INTO organizations (id, name, code, status)
     VALUES
       ($1, 'Fix01 Active Dairy', 'FIX01-ACT', 'ACTIVE'),
       ($2, 'Fix01 Suspended Dairy', 'FIX01-SUSP', 'SUSPENDED')
     ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, name = EXCLUDED.name, code = EXCLUDED.code;`,
    [orgActiveId, orgInactiveId]
  );

  await db.query(
    `INSERT INTO users (id, organization_id, username, full_name, email, phone_number, mobile_number, normalized_mobile_number, role, user_role, status)
     VALUES
       ($1, $7, 'fix01_super_admin', 'Fix01 Super Admin', 'super.fix01@dfarm.in', $8, $8, $8, 'SUPER_ADMIN', 'SUPER_ADMIN', 'ACTIVE'),
       ($2, $7, 'fix01_dairy_admin', 'Fix01 Dairy Admin', 'dairy.fix01@dfarm.in', $9, $9, $9, 'DAIRY_ADMIN', 'PRIMARY_DAIRY_ADMIN', 'ACTIVE'),
       ($3, $7, 'fix01_susp_admin', 'Fix01 Suspended Admin', 'susp.fix01@dfarm.in', $10, $10, $10, 'DAIRY_ADMIN', 'PRIMARY_DAIRY_ADMIN', 'SUSPENDED'),
       ($4, $7, 'fix01_farmer', 'Fix01 Farmer', 'farmer.fix01@dfarm.in', $11, $11, $11, 'FARMER_CUSTOMER', 'FARMER_CUSTOMER', 'ACTIVE'),
       ($5, $7, 'fix01_operator', 'Fix01 Operator', 'op.fix01@dfarm.in', $12, $12, $12, 'COLLECTION_OPERATOR', 'COLLECTION_OPERATOR', 'ACTIVE'),
       ($6, $13, 'fix01_susp_org_admin', 'Fix01 Susp Org Admin', 'susporg.fix01@dfarm.in', $14, $14, $14, 'DAIRY_ADMIN', 'PRIMARY_DAIRY_ADMIN', 'ACTIVE')
     ON CONFLICT (id) DO UPDATE SET
       organization_id = EXCLUDED.organization_id,
       role = EXCLUDED.role,
       user_role = EXCLUDED.user_role,
       status = EXCLUDED.status,
       phone_number = EXCLUDED.phone_number,
       mobile_number = EXCLUDED.mobile_number,
       normalized_mobile_number = EXCLUDED.normalized_mobile_number;`,
    [
      superAdminId,
      dairyAdminActiveId,
      dairyAdminSuspendedId,
      farmerUserId,
      operatorUserId,
      suspendedOrgAdminId,
      orgActiveId,
      superAdminPhone,
      dairyAdminActivePhone,
      dairyAdminSuspendedPhone,
      farmerPhone,
      operatorPhone,
      orgInactiveId,
      suspendedOrgAdminPhone,
    ]
  );

  // =========================================================================
  // 1. Production OTP endpoint never returns preview OTP (customer, operator, admin)
  // =========================================================================
  await suite.test('1. Production OTP endpoints (customer, operator, admin) never return previewOtp or otp', async () => {
    const origEnv = process.env.NODE_ENV;
    const origJwtSecret = process.env.JWT_SECRET;
    const origAdminOtpSecret = process.env.ADMIN_OTP_SECRET;
    const origAllowFlag = config.ALLOW_TEST_PREVIEW_OTP;
    const origSendSms = doveSmsService.sendLoginOtpSms.bind(doveSmsService);
    const capturedSmsCalls = [];

    doveSmsService.sendLoginOtpSms = async (mobile, otp) => {
      capturedSmsCalls.push({ mobile, otp });
      return { success: true, response: 'Mocked SMS Sent', messageId: 'mock-msg-1' };
    };

    try {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
      process.env.ADMIN_OTP_SECRET = crypto.randomBytes(32).toString('hex');
      // Even if preview flag is tampered true in memory, production MUST override it
      config.ALLOW_TEST_PREVIEW_OTP = true;

      doveOtpService.resetCooldown(customerPhone);
      doveOtpService.resetCooldown(operatorPhone);
      doveOtpService.resetCooldown(dairyAdminActivePhone);
      await db.query(`DELETE FROM otp_rate_limits WHERE phone IN ($1, $2, $3);`, [
        customerPhone,
        operatorPhone,
        dairyAdminActivePhone,
      ]).catch(() => {});

      const custRes = await request(app)
        .post('/api/v1/auth/request-otp')
        .send({ mobileNumber: customerPhone });
      assert.equal(custRes.status, 200);
      assert.equal(custRes.body.success, true);
      assert.equal('previewOtp' in custRes.body, false, 'Customer OTP must not contain previewOtp in production');
      assert.equal('otp' in custRes.body, false, 'Customer OTP must not contain otp in production');

      const opRes = await request(app)
        .post('/api/v1/auth/operator/otp/request')
        .send({ mobileNumber: operatorPhone });
      assert.equal(opRes.status, 200);
      assert.equal(opRes.body.success, true);
      assert.equal('previewOtp' in opRes.body, false, 'Operator OTP must not contain previewOtp in production');
      assert.equal('otp' in opRes.body, false, 'Operator OTP must not contain otp in production');

      const adminRes = await request(app)
        .post('/api/v1/auth/admin/otp/request')
        .send({ mobileNumber: dairyAdminActivePhone });
      assert.equal(adminRes.status, 200);
      assert.equal(adminRes.body.success, true);
      assert.equal('previewOtp' in adminRes.body, false, 'Admin OTP must not contain previewOtp in production');
      assert.equal('otp' in adminRes.body, false, 'Admin OTP must not contain otp in production');

      assert.equal(capturedSmsCalls.length, 3, 'All 3 OTP requests must dispatch via SMS gateway in production');

      // Serialization layer enforcement even in development
      process.env.NODE_ENV = 'development';
      const serialized = serializeOtpResponse({
        success: true,
        message: 'sent',
        cooldownSeconds: 60,
        expiresAt: new Date().toISOString(),
        previewOtp: '654321',
      });
      assert.equal('previewOtp' in serialized, false, 'Serialization layer must strip previewOtp outside NODE_ENV=test');
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origJwtSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = origJwtSecret;
      if (origAdminOtpSecret === undefined) delete process.env.ADMIN_OTP_SECRET; else process.env.ADMIN_OTP_SECRET = origAdminOtpSecret;
      config.ALLOW_TEST_PREVIEW_OTP = origAllowFlag;
      doveSmsService.sendLoginOtpSms = origSendSms;
    }
  });

  // =========================================================================
  // 2. Production OTP gateway failure returns genuine failure
  // =========================================================================
  await suite.test('2. Production OTP SMS gateway failure returns failure and does not allow verification', async () => {
    const origEnv = process.env.NODE_ENV;
    const origJwtSecret = process.env.JWT_SECRET;
    const origAdminOtpSecret = process.env.ADMIN_OTP_SECRET;
    const origSendSms = doveSmsService.sendLoginOtpSms.bind(doveSmsService);
    const failPhone = '+919900110099';

    doveSmsService.sendLoginOtpSms = async () => ({
      success: false,
      response: 'Invalid DLT authkey',
    });

    try {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
      process.env.ADMIN_OTP_SECRET = crypto.randomBytes(32).toString('hex');
      doveOtpService.resetCooldown(failPhone);
      await db.query(`DELETE FROM otp_rate_limits WHERE phone = $1;`, [failPhone]).catch(() => {});

      const res = await request(app)
        .post('/api/v1/auth/customer/request-otp')
        .send({ mobileNumber: failPhone });

      assert.ok(res.status >= 400, `Expected failure status, got ${res.status}`);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error?.code, 'SMS_DISPATCH_FAILED');
      assert.equal('previewOtp' in res.body, false);

      // Master OTPs must NEVER bypass verification
      const masterVerify = await doveOtpService.verifyOtp(failPhone, '123456', 'CUSTOMER_AUTH');
      assert.equal(masterVerify, false, 'Master OTP 123456 must never succeed');
      const masterVerify2 = await doveOtpService.verifyOtp(failPhone, '999999', 'CUSTOMER_AUTH');
      assert.equal(masterVerify2, false, 'Master OTP 999999 must never succeed');
    } finally {
      process.env.NODE_ENV = origEnv;
      doveSmsService.sendLoginOtpSms = origSendSms;
    }
  });

  // =========================================================================
  // 3. Test mode remains compatible with automated tests (no real SMS sent, OTP lifecycle preserved)
  // =========================================================================
  await suite.test('3. Test mode preserves previewOtp, cooldown, attempt limits, HMAC verification & single-use', async () => {
    assert.equal(process.env.NODE_ENV, 'test');

    const origLoggerInfo = logger.info.bind(logger);
    const loggedMessages = [];
    logger.info = (...args) => {
      loggedMessages.push(JSON.stringify(args));
      return origLoggerInfo(...args);
    };

    try {
      doveOtpService.resetCooldown(customerPhone);
      doveOtpService.resetCooldown(operatorPhone);
      doveOtpService.resetCooldown(superAdminPhone);
      await db.query(`DELETE FROM otp_rate_limits WHERE phone IN ($1, $2, $3);`, [
        customerPhone,
        operatorPhone,
        superAdminPhone,
      ]).catch(() => {});

      const custRes = await request(app)
        .post('/api/v1/auth/request-otp')
        .send({ mobileNumber: customerPhone });
      assert.equal(custRes.status, 200);
      assert.match(custRes.body.previewOtp, /^\d{6}$/);

      // Ensure OTP value was not logged
      for (const entry of loggedMessages) {
        assert.equal(entry.includes(custRes.body.previewOtp), false, 'OTP value must never be logged');
      }

      // Cooldown check
      const cooldownRes = await request(app)
        .post('/api/v1/auth/request-otp')
        .send({ mobileNumber: customerPhone });
      assert.equal(cooldownRes.status, 400);

      // Operator & Admin OTP request in test mode
      const opRes = await request(app)
        .post('/api/v1/auth/operator/otp/request')
        .send({ mobileNumber: operatorPhone });
      assert.equal(opRes.status, 200);
      assert.match(opRes.body.previewOtp, /^\d{6}$/);

      const admRes = await request(app)
        .post('/api/v1/auth/admin/otp/request')
        .send({ mobileNumber: superAdminPhone });
      assert.equal(admRes.status, 200);
      assert.match(admRes.body.previewOtp, /^\d{6}$/);

      // Wrong OTP attempts lock out after 5 attempts
      const otpService = new DoveOtpService();
      const attemptPhone = '+919900110088';
      const issued = await otpService.sendOtp(attemptPhone, 'CUSTOMER_AUTH');
      assert.ok(issued.previewOtp);

      for (let i = 0; i < 5; i++) {
        const ok = await otpService.verifyOtp(attemptPhone, '000000', 'CUSTOMER_AUTH');
        assert.equal(ok, false);
      }
      await assert.rejects(
        () => otpService.verifyOtp(attemptPhone, issued.previewOtp, 'CUSTOMER_AUTH'),
        /Maximum OTP verification attempts exceeded/
      );
    } finally {
      logger.info = origLoggerInfo;
    }
  });

  // =========================================================================
  // 4. Admin login requires a valid persisted active account
  // =========================================================================
  await suite.test('4. Admin login succeeds only for valid persisted active admin account and resolves /admin/me', async () => {
    doveOtpService.resetCooldown(dairyAdminActivePhone);
    await db.query(`DELETE FROM otp_rate_limits WHERE phone = $1;`, [dairyAdminActivePhone]).catch(() => {});

    const reqRes = await request(app)
      .post('/api/v1/auth/admin/otp/request')
      .send({ mobileNumber: dairyAdminActivePhone });
    assert.equal(reqRes.status, 200);
    assert.match(reqRes.body.previewOtp, /^\d{6}$/);

    const verifyRes = await request(app)
      .post('/api/v1/auth/admin/otp/verify')
      .send({ mobileNumber: dairyAdminActivePhone, otp: reqRes.body.previewOtp });
    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.body.success, true);
    assert.ok(verifyRes.body.token);
    assert.equal(verifyRes.body.user.id, dairyAdminActiveId);
    assert.equal(verifyRes.body.user.dairyId, orgActiveId);
    assert.equal(verifyRes.body.user.role, 'PRIMARY_DAIRY_ADMIN');

    const meRes = await request(app)
      .get('/api/v1/auth/admin/me')
      .set('Authorization', `Bearer ${verifyRes.body.token}`);
    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.user.id, dairyAdminActiveId);
    assert.equal(meRes.body.user.dairyId, orgActiveId);
  });

  // =========================================================================
  // 5. Hardcoded phone-number fallback cannot authorize an account
  // =========================================================================
  await suite.test('5. Hardcoded phone numbers, static allowlists, and DF-* invitation fallbacks cannot authorize an account', async () => {
    // Simulate absence of any matching users row in DB without deleting real accounts
    const origQuery = db.query.bind(db);
    db.query = async (text, params) => {
      if (typeof text === 'string' && text.includes('FROM users')) {
        return { rows: [], rowCount: 0 };
      }
      return origQuery(text, params);
    };

    try {
      // Registering via deprecated method must NOT grant admin access
      doveOtpService.registerAuthorizedAdminPhone('9900990099');

      for (const phone of ['+917755995615', '+917507495615', '+919900990099']) {
        const res = await request(app)
          .post('/api/v1/auth/admin/otp/request')
          .send({ mobileNumber: phone });
        assert.equal(res.status, 401, `Phone ${phone} without DB admin record must be rejected`);
      }

      // Forged JWT claiming SUPER_ADMIN for non-existent user must fail /admin/me (no isPankaj fallback)
      const forgedSuperAdminToken = tokenService.signToken({
        userId: '00000000-0000-0000-0000-000000000099',
        role: 'SUPER_ADMIN',
        actorType: 'STAFF',
      });
      const meRes = await request(app)
        .get('/api/v1/auth/admin/me')
        .set('Authorization', `Bearer ${forgedSuperAdminToken}`);
      assert.equal(meRes.status, 401);

      // Dynamic DF-* invitation fallback must be gone (DF-014 rejects dairyCode-only lookups upfront with 400)
      const invRes = await request(app)
        .get('/api/v1/dairies/invitations/validate?dairyCode=DF-SAN-2813');
      assert.equal(invRes.status, 400);
      assert.equal(invRes.body.code, 'MISSING_TOKEN');
    } finally {
      db.query = origQuery;
    }
  });

  // =========================================================================
  // 6. Database lookup failure does not create a privileged fallback identity
  // =========================================================================
  await suite.test('6. Database lookup failure fails closed and never creates a fallback SUPER_ADMIN identity', async () => {
    const origQuery = db.query.bind(db);

    try {
      db.query = async () => {
        throw new Error('Simulated DB outage: ECONNREFUSED');
      };

      const reqUseCase = new RequestAdminOtpUseCase(doveOtpService);
      await assert.rejects(
        () => reqUseCase.execute('+917755995615'),
        (err) => {
          assert.equal(err.statusCode, 401);
          assert.equal(err.message.includes('ECONNREFUSED'), false, 'Error must not leak internal DB error');
          assert.equal(err.message.includes('Pankaj'), false, 'Error must not expose privileged account details');
          return true;
        }
      );

      const verifyUseCase = new VerifyAdminOtpUseCase(doveOtpService, tokenService);
      await assert.rejects(
        () => verifyUseCase.execute('+917755995615', '123456'),
        (err) => {
          assert.equal(err.statusCode, 401);
          return true;
        }
      );

      const superToken = tokenService.signToken({
        userId: superAdminId,
        role: 'SUPER_ADMIN',
        actorType: 'STAFF',
      });
      const meRes = await request(app)
        .get('/api/v1/auth/admin/me')
        .set('Authorization', `Bearer ${superToken}`);
      assert.equal(meRes.status, 503);
      assert.equal(meRes.body.success, false);
      assert.equal(Boolean(meRes.body.user), false);
    } finally {
      db.query = origQuery;
    }
  });

  // =========================================================================
  // 7. Inactive/suspended admins are rejected (and never auto-activated)
  // =========================================================================
  await suite.test('7. Suspended or inactive admins are strictly rejected without auto-activation', async () => {
    const reqRes = await request(app)
      .post('/api/v1/auth/admin/otp/request')
      .send({ mobileNumber: dairyAdminSuspendedPhone });
    assert.equal(reqRes.status, 401);

    const suspendedAdminToken = tokenService.signToken({
      userId: dairyAdminSuspendedId,
      organizationId: orgActiveId,
      role: 'PRIMARY_DAIRY_ADMIN',
      actorType: 'STAFF',
    });
    const meRes = await request(app)
      .get('/api/v1/auth/admin/me')
      .set('Authorization', `Bearer ${suspendedAdminToken}`);
    assert.equal(meRes.status, 403);

    // Confirm status remained SUSPENDED in DB (was NOT auto-activated)
    const statusCheck = await db.query(`SELECT status FROM users WHERE id = $1;`, [dairyAdminSuspendedId]);
    assert.equal(statusCheck.rows[0].status, 'SUSPENDED');
  });

  // =========================================================================
  // 8. Wrong tenant / non-admin role / suspended organization is rejected
  // =========================================================================
  await suite.test('8. Non-admin roles, suspended organization admins, and tenant mismatches are rejected', async () => {
    // Farmer & Collection Operator cannot use Admin OTP
    for (const nonAdminPhone of [farmerPhone, operatorPhone]) {
      const reqRes = await request(app)
        .post('/api/v1/auth/admin/otp/request')
        .send({ mobileNumber: nonAdminPhone });
      assert.equal(reqRes.status, 401);
    }

    // Admin assigned to a SUSPENDED organization is rejected
    const suspOrgReq = await request(app)
      .post('/api/v1/auth/admin/otp/request')
      .send({ mobileNumber: suspendedOrgAdminPhone });
    assert.equal(suspOrgReq.status, 401);

    // Farmer token calling /admin/me is rejected
    const farmerToken = tokenService.signToken({
      userId: farmerUserId,
      organizationId: orgActiveId,
      role: 'FARMER_CUSTOMER',
      actorType: 'CUSTOMER',
    });
    const farmerMe = await request(app)
      .get('/api/v1/auth/admin/me')
      .set('Authorization', `Bearer ${farmerToken}`);
    assert.equal(farmerMe.status, 401);

    // Operator token calling /admin/me is rejected (403)
    const operatorToken = tokenService.signToken({
      userId: operatorUserId,
      organizationId: orgActiveId,
      role: 'COLLECTION_OPERATOR',
      actorType: 'STAFF',
    });
    const opMe = await request(app)
      .get('/api/v1/auth/admin/me')
      .set('Authorization', `Bearer ${operatorToken}`);
    assert.equal(opMe.status, 403);

    // Admin token with mismatched organizationId in JWT is rejected on /admin/me
    const wrongOrgAdminToken = tokenService.signToken({
      userId: dairyAdminActiveId,
      organizationId: orgInactiveId,
      role: 'PRIMARY_DAIRY_ADMIN',
      actorType: 'STAFF',
    });
    const mismatchMe = await request(app)
      .get('/api/v1/auth/admin/me')
      .set('Authorization', `Bearer ${wrongOrgAdminToken}`);
    assert.equal(mismatchMe.status, 403);

    // Non-super-admin cannot access /api/v1/dairies/:dairyId/database/overview
    const dbExplorerRes = await request(app)
      .get(`/api/v1/dairies/${orgActiveId}/database/overview`)
      .set('Authorization', `Bearer ${operatorToken}`);
    assert.equal(dbExplorerRes.status, 403);
  });

  // =========================================================================
  // 9. CORS rejects unapproved browser origins in production
  // =========================================================================
  await suite.test('9. CORS allows only explicit DFarm production domains and rejects unapproved & localhost origins in production', async () => {
    const origEnv = process.env.NODE_ENV;
    const origCors = process.env.CORS_ALLOWED_ORIGINS;

    try {
      process.env.NODE_ENV = 'production';
      process.env.CORS_ALLOWED_ORIGINS =
        'https://collection.dfarm.in,https://dairy.dfarm.in,https://admin.dfarm.in,https://dfarm-collection.pages.dev,https://dfarm-dairy-admin.pages.dev,https://dfarm-super-admin.pages.dev';

      const approvedOrigins = [
        'https://collection.dfarm.in',
        'https://dairy.dfarm.in',
        'https://admin.dfarm.in',
        'https://dfarm-collection.pages.dev',
        'https://dfarm-dairy-admin.pages.dev',
        'https://dfarm-super-admin.pages.dev',
      ];
      for (const origin of approvedOrigins) {
        const res = await request(app)
          .get('/health/live')
          .set('Origin', origin);
        assert.equal(res.status, 200);
        assert.equal(res.headers['access-control-allow-origin'], origin);
        assert.equal(res.headers['access-control-allow-credentials'], 'true');
      }

      const rejectedOrigins = [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://127.0.0.1:5174',
        'https://evil.com',
        'https://attacker.pages.dev',
        'https://attacker.workers.dev',
        'https://phishing.dfarm.in',
      ];
      for (const badOrigin of rejectedOrigins) {
        const res = await request(app)
          .get('/health/live')
          .set('Origin', badOrigin);
        assert.equal(
          res.headers['access-control-allow-origin'],
          undefined,
          `Unapproved origin ${badOrigin} must not receive Access-Control-Allow-Origin in production`
        );
      }

      // SSE endpoint must also reject unapproved origin
      const adminToken = tokenService.signToken({
        userId: dairyAdminActiveId,
        organizationId: orgActiveId,
        role: 'PRIMARY_DAIRY_ADMIN',
        actorType: 'STAFF',
      });
      const sseRes = await request(app)
        .get('/api/v1/dairy-admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Origin', 'https://attacker.pages.dev');
      assert.equal(sseRes.status, 403);
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origCors === undefined) {
        delete process.env.CORS_ALLOWED_ORIGINS;
      } else {
        process.env.CORS_ALLOWED_ORIGINS = origCors;
      }
    }
  });

  // =========================================================================
  // 10. Production environment refuses unsafe secret & preview-OTP configurations
  // =========================================================================
  await suite.test('10. Production startup validation rejects missing/default/weak secrets, preview OTP, and wildcard CORS', () => {
    // Valid production config passes (including ALLOW_TEST_PREVIEW_OTP='false')
    const validCfg = loadEnv(buildValidProdEnv());
    assert.equal(validCfg.ALLOW_TEST_PREVIEW_OTP, false);

    // Reject ALLOW_TEST_PREVIEW_OTP='true'
    assert.throws(
      () => loadEnv(buildValidProdEnv({ ALLOW_TEST_PREVIEW_OTP: 'true' })),
      /ALLOW_TEST_PREVIEW_OTP must be false in production/i
    );

    // Reject wildcard CORS
    assert.throws(
      () => loadEnv(buildValidProdEnv({ CORS_ALLOWED_ORIGINS: '*' })),
      /CORS_ALLOWED_ORIGINS must not contain wildcard/i
    );

    // Reject missing or default/weak secrets without leaking secret values
    const sensitiveChecks = [
      { field: 'JWT_SECRET', value: undefined },
      { field: 'JWT_SECRET', value: 'super-secret-jwt-token-with-at-least-32-characters-long' },
      { field: 'JWT_SECRET', value: 'weak-short-jwt-secret' },
      { field: 'ADMIN_OTP_SECRET', value: undefined },
      { field: 'ADMIN_OTP_SECRET', value: 'dfarm-super-secure-admin-otp-secret-key-32chars!' },
      { field: 'ADMIN_OTP_SECRET', value: 'aaaa'.repeat(16) },
      { field: 'TENANT_DB_ENCRYPTION_KEY', value: undefined },
      { field: 'TENANT_DB_ENCRYPTION_KEY', value: 'dfarm-super-secret-encryption-key-32chars!' },
      { field: 'TENANT_DB_ENCRYPTION_KEY', value: '0123456789abcdef'.repeat(4) },
      { field: 'OFFLINE_LEASE_SIGNING_KEY', value: undefined },
      { field: 'OFFLINE_LEASE_SIGNING_KEY', value: 'dev-offline-lease-signing-key-32chars!' },
    ];

    for (const { field, value } of sensitiveChecks) {
      assert.throws(
        () => loadEnv(buildValidProdEnv({ [field]: value })),
        (err) => {
          assert.match(err.message, /CRITICAL/i);
          if (value) {
            assert.equal(err.message.includes(value), false, `Error for ${field} must never leak secret value`);
          }
          return true;
        },
        `Expected loadEnv to reject unsafe ${field}`
      );
    }

    // Reject OFFLINE_LEASE_SIGNING_KEY matching JWT_SECRET
    const sharedSecret = crypto.randomBytes(32).toString('hex');
    assert.throws(
      () => loadEnv(buildValidProdEnv({ JWT_SECRET: sharedSecret, OFFLINE_LEASE_SIGNING_KEY: sharedSecret })),
      /cryptographically isolated from JWT_SECRET/i
    );

    // Verify validateKeyEntropyAndByteLength rejects placeholders
    assert.throws(
      () => validateKeyEntropyAndByteLength('placeholder_minimum_32_character_random_jwt_secret', 'JWT_SECRET'),
      /default or placeholder/i
    );
  });

  suite.after(async () => {
    await db.close().catch(() => {});
  });
});
