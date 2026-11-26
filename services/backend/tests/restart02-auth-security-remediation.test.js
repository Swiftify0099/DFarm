import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';

process.env.NODE_ENV = 'test';
if (!process.env.TENANT_POOL_CONNECTION_TIMEOUT_MS) {
  process.env.TENANT_POOL_CONNECTION_TIMEOUT_MS = '1000';
}

const { createApp } = await import('../dist/app.js');
const { loadEnv } = await import('../dist/config/env.js');
const { HmacJwtTokenService } = await import('../dist/infrastructure/security/HmacJwtTokenService.js');
const { Aes256GcmBiometricEncryptor } = await import('../dist/infrastructure/security/Aes256GcmBiometricEncryptor.js');
const { CredentialEncryption } = await import('../dist/infrastructure/security/CredentialEncryption.js');
const { BiometricEncryptionEngine } = await import('../dist/biometric/encryption.js');
const { AuthService } = await import('../dist/modules/auth/auth.service.js');
const { RefreshTokenUseCase } = await import('../dist/application/use-cases/auth/CustomerAuthUseCases.js');
const { tokenRevocationService } = await import('../dist/infrastructure/security/TokenRevocationService.js');
const { doveSmsService } = await import('../dist/infrastructure/sms/DoveSmsService.js');
const { WhatsAppWebhookHandler } = await import('../dist/modules/notifications/webhooks/whatsapp-webhook.handler.js');
const { authenticate: rootDbAuthenticate } = await import('../dist/middleware/authenticate.js');
const { db } = await import('../dist/infrastructure/database/PostgresPool.js');
const { tenantDbManager } = await import('../dist/infrastructure/database/TenantDatabaseManager.js');
const { signJwt } = await import('../dist/jwt.js');

const app = createApp();
const tokenService = new HmacJwtTokenService();

function buildValidProdEnv(overrides = {}) {
  return {
    NODE_ENV: 'production',
    SUPABASE_URL: 'https://demo.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid_anon_payload',
    SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid_service_payload',
    JWT_SECRET: crypto.randomBytes(32).toString('hex'),
    ADMIN_OTP_SECRET: crypto.randomBytes(32).toString('hex'),
    TENANT_DB_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
    DATA_ENCRYPTION_KEY_HEX: crypto.randomBytes(32).toString('hex'),
    OFFLINE_LEASE_SIGNING_KEY: crypto.randomBytes(32).toString('hex'),
    DOVE_SMS_AUTHKEY: 'dove-prod-auth-key-test-valid-987654',
    CORS_ALLOWED_ORIGINS: 'https://admin.dfarm.in,https://dairy.dfarm.in',
    ALLOW_TEST_PREVIEW_OTP: 'false',
    ...overrides,
  };
}

test('RESTART-02: Complete Auth, Authorization, OTP, JWT & Secrets Remediation Suite', async (suite) => {
  const orgAId = '22222222-1111-4111-a111-000000000101';
  const orgBId = '22222222-1111-4111-a111-000000000102';
  const centerAId = '22222222-1111-4111-a111-000000000201';
  const superAdminId = '22222222-1111-4111-a111-000000000301';
  const dairyAdminAId = '22222222-1111-4111-a111-000000000302';
  const operatorAId = '22222222-1111-4111-a111-000000000303';
  const suspendedAdminId = '22222222-1111-4111-a111-000000000304';
  const farmerAId = '22222222-1111-4111-a111-000000000401';
  const farmerBId = '22222222-1111-4111-a111-000000000402';

  await db.query(
    `INSERT INTO organizations (id, name, code, status)
     VALUES
       ($1, 'Restart02 Dairy A', 'R02-A', 'ACTIVE'),
       ($2, 'Restart02 Dairy B', 'R02-B', 'ACTIVE')
     ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE';`,
    [orgAId, orgBId]
  );

  await db.query(
    `INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
     VALUES ($1, $2, 'C-R02', 'Main R02 Center', 'Road 1', 'Village A', 'Pune', 'Maharashtra', '411001', '+919800000001', 'ACTIVE')
     ON CONFLICT (id) DO NOTHING;`,
    [centerAId, orgAId]
  );

  await db.query(
    `INSERT INTO users (id, organization_id, username, full_name, email, phone_number, mobile_number, normalized_mobile_number, role, user_role, status)
     VALUES
       ($1, $5, 'r02_super', 'R02 Super Admin', 'super.r02@dfarm.in', '+919811000001', '+919811000001', '+919811000001', 'SUPER_ADMIN', 'SUPER_ADMIN', 'ACTIVE'),
       ($2, $5, 'r02_admin_a', 'R02 Dairy Admin A', 'admina.r02@dfarm.in', '+919811000002', '+919811000002', '+919811000002', 'DAIRY_ADMIN', 'PRIMARY_DAIRY_ADMIN', 'ACTIVE'),
       ($3, $5, 'r02_op_a', 'R02 Operator A', 'opa.r02@dfarm.in', '+919811000003', '+919811000003', '+919811000003', 'COLLECTION_OPERATOR', 'COLLECTION_OPERATOR', 'ACTIVE'),
       ($4, $5, 'r02_susp', 'R02 Suspended', 'susp.r02@dfarm.in', '+919811000004', '+919811000004', '+919811000004', 'DAIRY_ADMIN', 'DAIRY_ADMIN', 'SUSPENDED')
     ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, role = EXCLUDED.role, user_role = EXCLUDED.user_role;`,
    [superAdminId, dairyAdminAId, operatorAId, suspendedAdminId, orgAId]
  );

  await db.query(
    `INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status, is_deleted)
     VALUES
       ($1, $3, $4, 'R02-F1', 'R02 Farmer A', '+919822000001', 'ACTIVE', 'APPROVED', FALSE),
       ($2, $5, $4, 'R02-F2', 'R02 Farmer B', '+919822000002', 'ACTIVE', 'APPROVED', FALSE)
     ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', is_deleted = FALSE, organization_id = EXCLUDED.organization_id;`,
    [farmerAId, farmerBId, orgAId, centerAId, orgBId]
  );

  await tenantDbManager.provisionTenantDatabase({ dairyId: orgAId, dairyCode: 'R02-A', dairyName: 'Restart02 Dairy A' });
  await tenantDbManager.provisionTenantDatabase({ dairyId: orgBId, dairyCode: 'R02-B', dairyName: 'Restart02 Dairy B' });
  const tenantDbA = await tenantDbManager.getStrictTenantDb(orgAId);
  const tenantDbB = await tenantDbManager.getStrictTenantDb(orgBId);
  const centerBId = '22222222-1111-4111-a111-000000000202';
  await tenantDbA.query(
    `INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
     VALUES ($1, $2, 'C-R02', 'Main R02 Center', 'Road 1', 'Village A', 'Pune', 'Maharashtra', '411001', '+919800000001', 'ACTIVE')
     ON CONFLICT (id) DO NOTHING;`,
    [centerAId, orgAId]
  );
  await tenantDbA.query(
    `INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status, is_deleted)
     VALUES ($1, $2, $3, 'R02-F1', 'R02 Farmer A', '+919822000001', 'ACTIVE', 'APPROVED', FALSE)
     ON CONFLICT (id) DO NOTHING;`,
    [farmerAId, orgAId, centerAId]
  );
  await tenantDbB.query(
    `INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
     VALUES ($1, $2, 'C-R02B', 'Main R02B Center', 'Road 2', 'Village B', 'Pune', 'Maharashtra', '411001', '+919800000002', 'ACTIVE')
     ON CONFLICT (id) DO NOTHING;`,
    [centerBId, orgBId]
  );
  await tenantDbB.query(
    `INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status, is_deleted)
     VALUES ($1, $2, $3, 'R02-F2', 'R02 Farmer B', '+919822000002', 'ACTIVE', 'APPROVED', FALSE)
     ON CONFLICT (id) DO NOTHING;`,
    [farmerBId, orgBId, centerBId]
  );

  const superAdminToken = tokenService.signToken({
    userId: superAdminId,
    organizationId: orgAId,
    role: 'SUPER_ADMIN',
    actorType: 'STAFF',
    tokenType: 'access',
  });
  const dairyAdminAToken = tokenService.signToken({
    userId: dairyAdminAId,
    organizationId: orgAId,
    centerId: centerAId,
    role: 'PRIMARY_DAIRY_ADMIN',
    actorType: 'STAFF',
    tokenType: 'access',
  });
  const operatorAToken = tokenService.signToken({
    userId: operatorAId,
    organizationId: orgAId,
    centerId: centerAId,
    role: 'COLLECTION_OPERATOR',
    actorType: 'STAFF',
    tokenType: 'access',
  });
  const farmerAToken = tokenService.signToken({
    userId: farmerAId,
    organizationId: orgAId,
    centerId: centerAId,
    role: 'FARMER_CUSTOMER',
    actorType: 'CUSTOMER',
    tokenType: 'access',
  });

  await suite.test('DF-001: Passwordless staff /login endpoints are disabled across all mount paths', async () => {
    for (const loginPath of ['/api/v1/auth/login', '/api/users/auth/login', '/api/auth/login']) {
      const res = await request(app)
        .post(loginPath)
        .send({ phone: '+919811000001', organizationId: orgAId, role: 'SUPER_ADMIN' });
      assert.ok(res.status === 404 || res.status === 401 || res.status === 410, `Expected rejection on ${loginPath}, got ${res.status}`);
      assert.equal(res.body?.token, undefined);
      assert.equal(res.body?.accessToken, undefined);
    }

    await assert.rejects(
      async () => AuthService.loginStaff('+919811000001', orgAId),
      /Passwordless staff login is permanently disabled/i
    );
  });

  await suite.test('DF-002: Dairy lifecycle endpoints enforce 401 unauthenticated and 403 cross-tenant/role checks', async () => {
    // Public discovery stays reachable
    const nearbyRes = await request(app).get('/api/v1/dairies/nearby');
    assert.equal(nearbyRes.status, 200);

    // Unauthenticated rejected 401
    for (const [method, url] of [
      ['get', '/api/v1/dairies'],
      ['get', '/api/v1/dairies/tenant-databases'],
      ['get', `/api/v1/dairies/${orgAId}`],
      ['post', '/api/v1/dairies'],
      ['post', `/api/v1/dairies/${orgAId}/suspend`],
      ['post', `/api/v1/dairies/${orgAId}/reactivate`],
      ['patch', `/api/v1/dairies/${orgAId}/location`],
      ['post', `/api/v1/dairies/${orgAId}/retry-provisioning`],
      ['post', '/api/v1/dairies/invitations/resend'],
      ['delete', `/api/v1/dairies/${orgAId}`],
    ]) {
      const r = await request(app)[method](url).send({});
      assert.equal(r.status, 401, `Expected 401 on ${method.toUpperCase()} ${url}, got ${r.status}`);
    }

    // Farmer and Dairy Admin rejected 403 on Super Admin lifecycle operations
    assert.equal(
      (await request(app).post('/api/v1/dairies').set('Authorization', `Bearer ${farmerAToken}`).send({ name: 'Rogue' })).status,
      403
    );
    assert.equal(
      (await request(app).post('/api/v1/dairies').set('Authorization', `Bearer ${dairyAdminAToken}`).send({ name: 'Rogue' })).status,
      403
    );
    assert.equal(
      (await request(app).post(`/api/v1/dairies/${orgAId}/suspend`).set('Authorization', `Bearer ${dairyAdminAToken}`).send({})).status,
      403
    );

    // Dairy Admin A can view own dairy A, blocked on dairy B (403)
    assert.equal(
      (await request(app).get(`/api/v1/dairies/${orgAId}`).set('Authorization', `Bearer ${dairyAdminAToken}`)).status,
      200
    );
    assert.equal(
      (await request(app).get(`/api/v1/dairies/${orgBId}`).set('Authorization', `Bearer ${dairyAdminAToken}`)).status,
      403
    );
    assert.equal(
      (await request(app).patch(`/api/v1/dairies/${orgBId}/location`).set('Authorization', `Bearer ${dairyAdminAToken}`).send({ latitude: 18.5, longitude: 73.8 })).status,
      403
    );
  });

  await suite.test('DF-014: Dairy invitation endpoints reject public dairyCode enumeration', async () => {
    const valRes = await request(app).get('/api/v1/dairies/invitations/validate?dairyCode=R02-A');
    assert.equal(valRes.status, 400);

    const otpReqRes = await request(app).post('/api/v1/dairies/invitations/otp/request').send({ dairyCode: 'R02-A' });
    assert.equal(otpReqRes.status, 400);

    const actRes = await request(app).post('/api/v1/dairies/invitations/activate').send({ dairyCode: 'R02-A', otp: '123456' });
    assert.equal(actRes.status, 400);
  });

  await suite.test('DF-004/005/006/010/015: All previously optionalAuthenticate & no-op routes fail closed (401/403)', async () => {
    const protectedEndpoints = [
      ['get', '/api/v1/customers'],
      ['get', '/api/v1/customers/memberships'],
      ['get', '/api/v1/customers/pending'],
      ['get', `/api/v1/customers/${farmerAId}/status`],
      ['post', `/api/v1/customers/${farmerAId}/approve`],
      ['post', `/api/v1/customers/${farmerAId}/suspend`],
      ['patch', `/api/v1/customers/${farmerAId}`],
      ['delete', `/api/v1/customers/${farmerAId}`],
      ['post', `/api/v1/customers/${farmerAId}/biometrics`],
      ['get', '/api/v1/identity/face/templates'],
      ['post', '/api/v1/identity/face/detect-and-embed'],
      ['post', '/api/v1/identity/face/match'],
      ['get', '/api/v1/identity/face/enrollments'],
      ['post', '/api/v1/identity/face/enrollments/some-id/revoke'],
      ['get', '/api/v1/collections/sessions'],
      ['get', '/api/v1/collections/sessions/active'],
      ['post', '/api/v1/collections/sessions/open'],
      ['get', '/api/v1/collections/transactions/recent'],
      ['get', '/api/v1/collections/quality/readings'],
      ['get', `/api/v1/ledger/accounts/${farmerAId}`],
      ['get', '/api/v1/ledger/entries'],
      ['post', '/api/v1/ledger/adjustment'],
      ['get', '/api/v1/payments'],
      ['post', '/api/v1/payments'],
      ['get', '/api/v1/bills'],
      ['post', '/api/v1/bills/generate'],
      ['get', '/api/v1/feed/products'],
      ['get', '/api/v1/feed/sales'],
      ['get', '/api/v1/feed/movements'],
      ['get', '/api/v1/rate-charts'],
      ['post', '/api/v1/rate-charts/draft'],
      ['get', '/api/v1/rfid'],
      ['post', '/api/v1/rfid/assign'],
      ['get', '/api/v1/devices'],
      ['get', '/api/v1/devices/telemetry'],
      ['get', '/api/v1/staff'],
      ['get', '/api/v1/reports/collections'],
      ['get', '/api/v1/audit'],
      ['get', '/api/v1/notifications'],
      ['get', '/api/v1/dashboard/metrics'],
    ];

    for (const [method, url] of protectedEndpoints) {
      const r = await request(app)[method](url).send({});
      assert.equal(r.status, 401, `Expected 401 on unauthenticated ${method.toUpperCase()} ${url}, got ${r.status}`);
    }

    // No-op authorizePermission bypasses closed: COLLECTION_OPERATOR & FARMER_CUSTOMER must receive 403 (never reach controller)
    for (const [method, url] of [
      ['get', '/api/v1/customers/pending'],
      ['post', `/api/v1/customers/${farmerAId}/approve`],
      ['post', `/api/v1/customers/${farmerAId}/suspend`],
      ['delete', `/api/v1/customers/${farmerAId}`],
      ['post', '/api/v1/identity/face/enrollments/fake-id/revoke'],
      ['post', '/api/v1/rfid/assign'],
      ['post', '/api/v1/ledger/adjustment'],
      ['post', '/api/v1/payments'],
      ['post', '/api/v1/bills/generate'],
      ['post', '/api/v1/rate-charts/draft'],
    ]) {
      const opRes = await request(app)[method](url).set('Authorization', `Bearer ${operatorAToken}`).send({});
      assert.equal(opRes.status, 403, `Expected 403 for COLLECTION_OPERATOR on ${method.toUpperCase()} ${url}, got ${opRes.status}`);

      const fRes = await request(app)[method](url).set('Authorization', `Bearer ${farmerAToken}`).send({});
      assert.equal(fRes.status, 403, `Expected 403 for FARMER_CUSTOMER on ${method.toUpperCase()} ${url}, got ${fRes.status}`);
    }

    // DF-015: Bank details IDOR blocked for COLLECTION_OPERATOR and cross-dairy Dairy Admin
    const opBankRes = await request(app)
      .put(`/api/v1/customers/${farmerAId}/bank-details`)
      .set('Authorization', `Bearer ${operatorAToken}`)
      .send({ bankName: 'SBI', accountNumber: '1234567890', ifscCode: 'SBIN0001234' });
    assert.equal(opBankRes.status, 403);

    const crossBankRes = await request(app)
      .put(`/api/v1/customers/${farmerBId}/bank-details`)
      .set('Authorization', `Bearer ${dairyAdminAToken}`)
      .send({ bankName: 'SBI', accountNumber: '1234567890', ifscCode: 'SBIN0001234' });
    assert.ok(crossBankRes.status === 403 || crossBankRes.status === 404);
  });

  await suite.test('DF-008: Hardcoded AES-256-GCM fallback removed; key length/entropy/tampering enforced', async () => {
    const defaultHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const validHex = crypto.randomBytes(32).toString('hex');
    const prevHex = crypto.randomBytes(32).toString('hex');

    // Missing in production -> throws
    assert.throws(() => loadEnv(buildValidProdEnv({ DATA_ENCRYPTION_KEY_HEX: undefined })), /DATA_ENCRYPTION_KEY_HEX/i);
    // Default literal -> rejected
    assert.throws(() => loadEnv(buildValidProdEnv({ DATA_ENCRYPTION_KEY_HEX: defaultHex })), /DATA_ENCRYPTION_KEY_HEX/i);
    // 32-char (16-byte) hex -> rejected
    assert.throws(() => loadEnv(buildValidProdEnv({ DATA_ENCRYPTION_KEY_HEX: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6' })), /64/i);
    // Reused JWT_SECRET -> rejected
    const sharedSecret = crypto.randomBytes(32).toString('hex');
    assert.throws(
      () => loadEnv(buildValidProdEnv({ JWT_SECRET: sharedSecret, DATA_ENCRYPTION_KEY_HEX: sharedSecret })),
      /isolated/i
    );

    const prevNodeEnv = process.env['NODE_ENV'];
    const prevCredKey = process.env['TENANT_DB_ENCRYPTION_KEY'];
    try {
      process.env['NODE_ENV'] = 'production';
      assert.throws(() => new Aes256GcmBiometricEncryptor(defaultHex), /default or placeholder/i);
      assert.throws(() => new BiometricEncryptionEngine(defaultHex), /default or placeholder/i);
      assert.throws(() => new Aes256GcmBiometricEncryptor('not-hex-key'), /64/i);
      process.env['TENANT_DB_ENCRYPTION_KEY'] = 'dfarm-super-secret-encryption-key-32chars!';
      assert.throws(() => CredentialEncryption.encrypt('postgres://secret'), /TENANT_DB_ENCRYPTION_KEY/i);
    } finally {
      process.env['NODE_ENV'] = prevNodeEnv;
      if (prevCredKey !== undefined) process.env['TENANT_DB_ENCRYPTION_KEY'] = prevCredKey;
      else delete process.env['TENANT_DB_ENCRYPTION_KEY'];
    }

    // Valid encrypt -> tamper rejection -> previousKey rotation decryption
    const encOld = new Aes256GcmBiometricEncryptor(prevHex, 'key-sface128-v1');
    const vector = Array.from({ length: 128 }, (_, i) => (i + 1) * 0.01);
    const cipher = encOld.encrypt128DimEmbedding(vector, farmerAId, 'v1');

    // Tamper authTag or ciphertext or AAD -> rejected
    assert.throws(() => encOld.decrypt128DimEmbedding(cipher.encryptedData, cipher.iv, '00'.repeat(16), farmerAId, 'v1'));
    assert.throws(() => encOld.decrypt128DimEmbedding(cipher.encryptedData, cipher.iv, cipher.authTag, farmerBId, 'v1'));

    // New key with previousKeysHex can still decrypt historical record
    const encRotated = new Aes256GcmBiometricEncryptor(validHex, 'key-sface128-v2', [prevHex]);
    const dec = encRotated.decrypt128DimEmbedding(cipher.encryptedData, cipher.iv, cipher.authTag, farmerAId, 'v1');
    assert.equal(dec.length, 128);
    assert.ok(Math.abs(dec[0] - vector[0]) < 1e-5);
  });

  await suite.test('DF-009: Root middleware/authenticate.ts fails closed (503 on DB failure, 403 on suspended/unmapped, no claim fallback)', async () => {
    const validStaffJwt = signJwt({ sub: dairyAdminAId, userId: dairyAdminAId, role: 'DAIRY_ADMIN', organizationId: orgAId });
    const suspStaffJwt = signJwt({ sub: suspendedAdminId, userId: suspendedAdminId, role: 'DAIRY_ADMIN', organizationId: orgAId });
    const unmappedJwt = signJwt({ sub: '99999999-9999-4999-a999-999999999999', role: 'SUPER_ADMIN', organizationId: orgAId });

    // 1. Valid DB user resolves req.auth
    await new Promise((resolve, reject) => {
      const fakeReq = { headers: { authorization: `Bearer ${validStaffJwt}` } };
      rootDbAuthenticate(fakeReq, {}, (err) => {
        if (err) return reject(err);
        assert.equal(fakeReq.auth.userId, dairyAdminAId);
        assert.equal(fakeReq.auth.actorType, 'STAFF');
        resolve();
      });
    });

    // 2. Suspended staff rejected 403
    await new Promise((resolve) => {
      const fakeReq = { headers: { authorization: `Bearer ${suspStaffJwt}` } };
      rootDbAuthenticate(fakeReq, {}, (err) => {
        assert.ok(err);
        assert.equal(err.statusCode, 403);
        resolve();
      });
    });

    // 3. Unmapped identity rejected 403 (never trusted from token claims!)
    await new Promise((resolve) => {
      const fakeReq = { headers: { authorization: `Bearer ${unmappedJwt}` } };
      rootDbAuthenticate(fakeReq, {}, (err) => {
        assert.ok(err);
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'UNMAPPED_IDENTITY');
        resolve();
      });
    });

    // 4. DB failure returns 503 AUTH_DB_UNAVAILABLE (fails closed!)
    const origQuery = db.query.bind(db);
    db.query = async () => {
      throw new Error('ECONNREFUSED simulated outage');
    };
    try {
      await new Promise((resolve) => {
        const fakeReq = { headers: { authorization: `Bearer ${validStaffJwt}` } };
        rootDbAuthenticate(fakeReq, {}, (err) => {
          assert.ok(err);
          assert.equal(err.statusCode, 503);
          assert.equal(err.code, 'AUTH_DB_UNAVAILABLE');
          resolve();
        });
      });
    } finally {
      db.query = origQuery;
    }
  });

  await suite.test('DF-011: RefreshTokenUseCase enforces refresh tokenType, DB state, single-use rotation, and logout revocation', async () => {
    const refreshUseCase = new RefreshTokenUseCase(tokenService);
    const staffRefresh = tokenService.signToken({
      userId: dairyAdminAId,
      organizationId: orgAId,
      role: 'PRIMARY_DAIRY_ADMIN',
      actorType: 'STAFF',
      tokenType: 'refresh',
    }, 3600);
    const suspRefresh = tokenService.signToken({
      userId: suspendedAdminId,
      organizationId: orgAId,
      role: 'DAIRY_ADMIN',
      actorType: 'STAFF',
      tokenType: 'refresh',
    }, 3600);
    const guestToken = tokenService.signToken({
      userId: 'unregistered:+919800000999',
      role: 'GUEST_FARMER',
      actorType: 'CUSTOMER',
      tokenType: 'access',
    }, 3600);

    // 1. Access token & guest token rejected
    assert.equal((await request(app).post('/api/v1/auth/refresh-token').send({ refreshToken: dairyAdminAToken })).status, 401);
    assert.equal((await request(app).post('/api/v1/auth/refresh-token').send({ refreshToken: guestToken })).status, 401);
    assert.equal((await request(app).post('/api/v1/auth/refresh-token').set('Authorization', `Bearer ${staffRefresh}`).send({})).status, 200);

    // 2. Replaying rotated staffRefresh must now fail (401 TOKEN_REVOKED)
    const replayRes = await request(app).post('/api/v1/auth/refresh-token').send({ refreshToken: staffRefresh });
    assert.equal(replayRes.status, 401);

    // 3. Suspended user refresh rejected 403
    await assert.rejects(async () => refreshUseCase.execute(suspRefresh), /suspended|inactive/i);

    // 4. Logout revokes access token immediately
    const tempAccess = tokenService.signToken({
      userId: dairyAdminAId,
      organizationId: orgAId,
      role: 'PRIMARY_DAIRY_ADMIN',
      actorType: 'STAFF',
      tokenType: 'access',
    }, 3600);
    assert.equal((await request(app).get('/api/v1/customers').set('Authorization', `Bearer ${tempAccess}`)).status, 200);
    const logoutRes = await request(app).post('/api/v1/auth/logout').set('Authorization', `Bearer ${tempAccess}`).send({});
    assert.equal(logoutRes.status, 200);
    assert.equal((await request(app).get('/api/v1/customers').set('Authorization', `Bearer ${tempAccess}`)).status, 401);

    // Check revocation service helper directly
    assert.equal(tokenRevocationService.isRevokedSync(tempAccess), true);
  });

  await suite.test('DF-013: Weak/placeholder DoveSMS and WhatsApp webhook secrets fail closed in production', async () => {
    assert.throws(() => loadEnv(buildValidProdEnv({ DOVE_SMS_AUTHKEY: 'ba9dcdcdfcXX' })), /DOVE_SMS_AUTHKEY/i);
    assert.throws(() => loadEnv(buildValidProdEnv({ DOVE_SMS_AUTHKEY: undefined })), /DOVE_SMS_AUTHKEY/i);
    assert.throws(
      () => loadEnv(buildValidProdEnv({ WHATSAPP_ENABLED: 'true', WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'dfarm_whatsapp_verify_token_default' })),
      /WHATSAPP_WEBHOOK_VERIFY_TOKEN/i
    );

    const prevNodeEnv = process.env['NODE_ENV'];
    const prevKey = process.env['DOVE_SMS_AUTHKEY'];
    try {
      process.env['NODE_ENV'] = 'production';
      process.env['DOVE_SMS_AUTHKEY'] = 'ba9dcdcdfcXX';
      const smsRes = await doveSmsService.sendLoginOtpSms('+919811000001', 'Test OTP 123456');
      assert.equal(smsRes.success, false);

      assert.throws(
        () => WhatsAppWebhookHandler.verifyChallenge('subscribe', 'dfarm_whatsapp_verify_token_default', 'ok'),
        /not configured/i
      );
      assert.equal(
        WhatsAppWebhookHandler.verifySignature(Buffer.from('{}'), 'sha256=deadbeef'),
        false
      );
    } finally {
      process.env['NODE_ENV'] = prevNodeEnv;
      if (prevKey !== undefined) process.env['DOVE_SMS_AUTHKEY'] = prevKey;
      else delete process.env['DOVE_SMS_AUTHKEY'];
    }
  });
});
