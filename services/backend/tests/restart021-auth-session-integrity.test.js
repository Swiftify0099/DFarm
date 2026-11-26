import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';

process.env.NODE_ENV = 'test';
if (!process.env.TENANT_POOL_CONNECTION_TIMEOUT_MS) {
  process.env.TENANT_POOL_CONNECTION_TIMEOUT_MS = '1000';
}

const { createApp } = await import('../dist/app.js');
const { HmacJwtTokenService } = await import('../dist/infrastructure/security/HmacJwtTokenService.js');
const { TokenRevocationService } = await import('../dist/infrastructure/security/TokenRevocationService.js');
const { AuthService } = await import('../dist/modules/auth/auth.service.js');
const { doveOtpService } = await import('../dist/infrastructure/otp/DoveOtpService.js');
const { db } = await import('../dist/infrastructure/database/PostgresPool.js');
const { tenantDbManager } = await import('../dist/infrastructure/database/TenantDatabaseManager.js');

const app = createApp();
const tokenService = new HmacJwtTokenService();

function generateUnitEmbedding(seed = 1) {
  const vec = Array.from({ length: 128 }, (_, i) => Math.sin((i + 1) * seed) * Math.cos((i + 2) * 0.4));
  const norm = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0));
  return vec.map((v) => v / norm);
}

test('RESTART-02.1: Durable Token Revocation, Account Authority, Centers & Registration Security Suite', async (suite) => {
  const orgActiveA = '44444444-1111-4111-a111-000000000101';
  const orgActiveB = '44444444-1111-4111-a111-000000000102';
  const orgSuspC = '44444444-1111-4111-a111-000000000103';

  const centerA1 = '44444444-1111-4111-a111-000000000201';
  const centerA2 = '44444444-1111-4111-a111-000000000202';
  const centerB1 = '44444444-1111-4111-a111-000000000203';

  const superAdminId = '44444444-1111-4111-a111-000000000301';
  const dairyAdminAId = '44444444-1111-4111-a111-000000000302';
  const operatorAssignedId = '44444444-1111-4111-a111-000000000303';
  const operatorUnassignedId = '44444444-1111-4111-a111-000000000304';
  const suspendedStaffId = '44444444-1111-4111-a111-000000000305';
  const dairyAdminSuspOrgId = '44444444-1111-4111-a111-000000000306';

  const activeCustId = '44444444-1111-4111-a111-000000000401';
  const suspCustId = '44444444-1111-4111-a111-000000000402';
  const delCustId = '44444444-1111-4111-a111-000000000403';
  const suspOrgCustId = '44444444-1111-4111-a111-000000000404';
  const globalCustActiveId = '44444444-1111-4111-a111-000000000501';

  await db.query(
    `INSERT INTO organizations (id, name, code, status)
     VALUES
       ($1, 'R021 Dairy Alpha', 'R021_ALPHA', 'ACTIVE'),
       ($2, 'R021 Dairy Beta', 'R021_BETA', 'ACTIVE'),
       ($3, 'R021 Dairy Suspended', 'R021_SUSP', 'SUSPENDED')
     ON CONFLICT (id) DO NOTHING;`,
    [orgActiveA, orgActiveB, orgSuspC]
  );

  await db.query(
    `INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
     VALUES
       ($1, $4, 'R021-A1', 'Alpha Center One', 'Road 1', 'V1', 'D1', 'MH', '416001', '+919900010201', 'ACTIVE'),
       ($2, $4, 'R021-A2', 'Alpha Center Two', 'Road 2', 'V2', 'D1', 'MH', '416002', '+919900010202', 'ACTIVE'),
       ($3, $5, 'R021-B1', 'Beta Center One', 'Road 3', 'V3', 'D2', 'MH', '416003', '+919900010203', 'ACTIVE')
     ON CONFLICT (id) DO NOTHING;`,
    [centerA1, centerA2, centerB1, orgActiveA, orgActiveB]
  );

  await db.query(
    `INSERT INTO users (id, organization_id, username, full_name, role, status, user_role, phone_number)
     VALUES
       ($1, $7, 'superadmin_r021', 'Super Admin R021', 'SUPER_ADMIN', 'ACTIVE', 'SUPER_ADMIN', '+919900010301'),
       ($2, $8, 'dairyadmin_r021', 'Dairy Admin R021', 'DAIRY_ADMIN', 'ACTIVE', 'DAIRY_ADMIN', '+919900010302'),
       ($3, $8, 'op_assigned_r021', 'Assigned Op R021', 'COLLECTION_OPERATOR', 'ACTIVE', 'COLLECTION_OPERATOR', '+919900010303'),
       ($4, $8, 'op_unassigned_r021', 'Unassigned Op R021', 'COLLECTION_OPERATOR', 'ACTIVE', 'COLLECTION_OPERATOR', '+919900010304'),
       ($5, $8, 'susp_staff_r021', 'Suspended Staff R021', 'DAIRY_ADMIN', 'SUSPENDED', 'DAIRY_ADMIN', '+919900010305'),
       ($6, $9, 'susp_org_admin_r021', 'Suspended Org Admin R021', 'DAIRY_ADMIN', 'ACTIVE', 'DAIRY_ADMIN', '+919900010306')
     ON CONFLICT (id) DO NOTHING;`,
    [
      superAdminId,
      dairyAdminAId,
      operatorAssignedId,
      operatorUnassignedId,
      suspendedStaffId,
      dairyAdminSuspOrgId,
      orgActiveA,
      orgActiveA,
      orgSuspC,
    ]
  );

  await db.query(
    `INSERT INTO user_center_assignments (user_id, center_id, is_primary)
     VALUES ($1, $2, TRUE)
     ON CONFLICT DO NOTHING;`,
    [operatorAssignedId, centerA1]
  );

  await db.query(
    `INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, mobile_number, normalized_mobile_number, status, registration_status, is_deleted)
     VALUES
       ($1, $5, $6, 'F-901', 'Active Farmer', '+919900010401', '+919900010401', 'ACTIVE', 'APPROVED', FALSE),
       ($2, $5, $6, 'F-902', 'Suspended Farmer', '+919900010402', '+919900010402', 'SUSPENDED', 'APPROVED', FALSE),
       ($3, $5, $6, 'F-903', 'Deleted Farmer', '+919900010403', '+919900010403', 'ACTIVE', 'APPROVED', TRUE),
       ($4, $7, $6, 'F-904', 'SuspOrg Farmer', '+919900010404', '+919900010404', 'ACTIVE', 'APPROVED', FALSE)
     ON CONFLICT (id) DO NOTHING;`,
    [activeCustId, suspCustId, delCustId, suspOrgCustId, orgActiveA, centerA1, orgSuspC]
  );

  await db.query(
    `INSERT INTO global_customer_identities (id, normalized_mobile_number, phone_verified_at)
     VALUES ($1, '+919900010401', NOW())
     ON CONFLICT (normalized_mobile_number) DO NOTHING;`,
    [globalCustActiveId]
  );

  await tenantDbManager.provisionTenantDatabase({
    dairyId: orgActiveA,
    dairyCode: 'R021_ALPHA',
    dairyName: 'R021 Dairy Alpha',
  });

  const tenantDbA = await tenantDbManager.getTenantDb(orgActiveA);
  await tenantDbA.query(
    `INSERT INTO organizations (id, name, code, status)
     VALUES ($1, 'R021 Dairy Alpha', 'R021_ALPHA', 'ACTIVE')
     ON CONFLICT (id) DO NOTHING;`,
    [orgActiveA]
  );
  await tenantDbA.query(
    `INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
     VALUES ($1, $2, 'R021-A1', 'Alpha Center One', 'Road 1', 'V1', 'D1', 'MH', '416001', '+919900010201', 'ACTIVE')
     ON CONFLICT (id) DO NOTHING;`,
    [centerA1, orgActiveA]
  );
  await tenantDbA.query(
    `INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status, is_deleted)
     VALUES ($1, $2, $3, 'F-901', 'Active Farmer', '+919900010401', 'ACTIVE', 'APPROVED', FALSE)
     ON CONFLICT (id) DO NOTHING;`,
    [activeCustId, orgActiveA, centerA1]
  );

  const superAdminToken = tokenService.signToken({
    userId: superAdminId,
    role: 'SUPER_ADMIN',
    actorType: 'STAFF',
    tokenType: 'access',
  }, 3600);

  const dairyAdminToken = tokenService.signToken({
    userId: dairyAdminAId,
    organizationId: orgActiveA,
    role: 'DAIRY_ADMIN',
    actorType: 'STAFF',
    tokenType: 'access',
  }, 3600);

  const suspendedStaffToken = tokenService.signToken({
    userId: suspendedStaffId,
    organizationId: orgActiveA,
    role: 'DAIRY_ADMIN',
    actorType: 'STAFF',
    tokenType: 'access',
  }, 3600);

  const suspOrgAdminToken = tokenService.signToken({
    userId: dairyAdminSuspOrgId,
    organizationId: orgSuspC,
    role: 'DAIRY_ADMIN',
    actorType: 'STAFF',
    tokenType: 'access',
  }, 3600);

  // =========================================================================
  // PHASE 1 & 2: DURABLE REVOCATION, CROSS-INSTANCE & ATOMIC REFRESH
  // =========================================================================
  await suite.test('1. Revocation visibility across independent instances + expired cleanup keeps unexpired rows', async () => {
    const instanceA = new TokenRevocationService();
    const instanceB = new TokenRevocationService();

    const tempJti = crypto.randomUUID();
    const expiredJti = crypto.randomUUID();
    const sampleToken = tokenService.signToken({
      userId: dairyAdminAId,
      organizationId: orgActiveA,
      role: 'DAIRY_ADMIN',
      actorType: 'STAFF',
      tokenType: 'access',
      jti: tempJti,
    }, 3600);

    // Not revoked initially on either instance
    assert.equal(await instanceA.isRevoked(sampleToken, tempJti), false);
    assert.equal(await instanceB.isRevoked(sampleToken, tempJti), false);

    // Revoke via instanceA -> persisted in shared DB -> instanceB sees it without sharing in-memory Map
    await instanceA.revokeAsync({ token: sampleToken, jti: tempJti, expiresAtSeconds: Math.floor(Date.now() / 1000) + 3600 });
    assert.equal(await instanceB.isRevoked(sampleToken, tempJti), true);

    // Insert one already-expired entry, prune expired entries, confirm unexpired tempJti remains intact
    await db.query(
      `INSERT INTO revoked_tokens (token_key, expires_at, reason)
       VALUES ($1, NOW() - INTERVAL '10 minutes', 'EXPIRED_TEST')
       ON CONFLICT (token_key) DO NOTHING;`,
      [expiredJti]
    );
    const purgedCount = await instanceA.pruneExpiredPersisted(500);
    assert.ok(purgedCount >= 1);

    const unexpiredRes = await db.query(`SELECT 1 FROM revoked_tokens WHERE token_key = $1;`, [tempJti]);
    assert.equal(unexpiredRes.rows.length, 1, 'Unexpired revocation entry must NOT be deleted');

    const routeRes = await request(app)
      .get('/api/v1/customers')
      .set('Authorization', `Bearer ${sampleToken}`);
    assert.equal(routeRes.status, 401);
  });

  await suite.test('2. Fail-closed DB outage handling on isRevoked(), revokeAsync(), and /auth/logout', async () => {
    const isolated = new TokenRevocationService();
    const origQuery = db.query.bind(db);

    db.query = async (sql, ...args) => {
      if (typeof sql === 'string' && sql.includes('revoked_tokens')) {
        throw new Error('simulated connection refused');
      }
      return origQuery(sql, ...args);
    };

    try {
      await assert.rejects(
        () => isolated.isRevoked('dummy.jwt.tok', 'jti-fail-closed'),
        (err) => err.statusCode === 503 && err.code === 'AUTH_DB_UNAVAILABLE'
      );

      await assert.rejects(
        () => isolated.revokeAsync({ jti: 'jti-write-fail' }),
        (err) => err.statusCode === 503 && err.code === 'REVOCATION_DB_UNAVAILABLE'
      );

      const activeTok = tokenService.signToken({
        userId: dairyAdminAId,
        organizationId: orgActiveA,
        role: 'DAIRY_ADMIN',
        actorType: 'STAFF',
        tokenType: 'access',
      }, 3600);

      // Logout must NOT claim "Logged out successfully" on DB outage
      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${activeTok}`)
        .send({});
      assert.equal(logoutRes.status, 503);
      assert.equal(logoutRes.body.success, false);
      assert.equal(logoutRes.body.code, 'REVOCATION_DB_UNAVAILABLE');
    } finally {
      db.query = origQuery;
    }
  });

  await suite.test('3. Concurrent simultaneous /auth/refresh-token allows strictly ONE winner (atomic consumption)', async () => {
    const singleUseRefresh = tokenService.signToken({
      userId: dairyAdminAId,
      organizationId: orgActiveA,
      role: 'DAIRY_ADMIN',
      actorType: 'STAFF',
      tokenType: 'refresh',
    }, 3600);

    const results = await Promise.all([
      request(app).post('/api/v1/auth/refresh-token').send({ refreshToken: singleUseRefresh }),
      request(app).post('/api/v1/auth/refresh-token').send({ refreshToken: singleUseRefresh }),
      request(app).post('/api/v1/auth/refresh-token').send({ refreshToken: singleUseRefresh }),
    ]);

    const successes = results.filter((r) => r.status === 200);
    const rejections = results.filter((r) => r.status === 401);
    assert.equal(successes.length, 1, `Expected strictly 1 winner across concurrent refreshes, got ${successes.length}`);
    assert.equal(rejections.length, 2, 'Concurrent replay siblings must be rejected with 401');
  });

  // =========================================================================
  // PHASE 3: UNIFIED ACCOUNT & ORG STATUS VALIDATION
  // =========================================================================
  await suite.test('4. Unified auth enforces live DB active/suspended/deleted/unmapped/org status across both middlewares', async () => {
    // Active staff succeeds on both presentation & module routes
    assert.equal((await request(app).get('/api/v1/customers').set('Authorization', `Bearer ${dairyAdminToken}`)).status, 200);
    assert.equal((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${dairyAdminToken}`)).status, 200);

    // Suspended staff rejected 403 on BOTH
    assert.equal((await request(app).get('/api/v1/customers').set('Authorization', `Bearer ${suspendedStaffToken}`)).status, 403);
    assert.equal((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${suspendedStaffToken}`)).status, 403);

    // Staff in suspended org rejected 403 on BOTH
    assert.equal((await request(app).get('/api/v1/customers').set('Authorization', `Bearer ${suspOrgAdminToken}`)).status, 403);
    assert.equal((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${suspOrgAdminToken}`)).status, 403);

    // Unmapped staff rejected (401 presentation, 403 module)
    const ghostStaffToken = tokenService.signToken({
      userId: '44444444-dead-4111-a111-999999999999',
      organizationId: orgActiveA,
      role: 'DAIRY_ADMIN',
      actorType: 'STAFF',
      tokenType: 'access',
    }, 3600);
    assert.equal((await request(app).get('/api/v1/customers').set('Authorization', `Bearer ${ghostStaffToken}`)).status, 401);
    assert.equal((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${ghostStaffToken}`)).status, 403);

    // Customer states: ACTIVE passes, SUSPENDED / DELETED / SUSP_ORG rejected 403 on BOTH
    const custToken = (id, orgId = orgActiveA) => tokenService.signToken({
      userId: id,
      organizationId: orgId,
      role: 'FARMER_CUSTOMER',
      actorType: 'CUSTOMER',
      tokenType: 'access',
    }, 3600);

    assert.equal((await request(app).get(`/api/v1/customers/${activeCustId}`).set('Authorization', `Bearer ${custToken(activeCustId)}`)).status, 200);
    assert.equal((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${custToken(activeCustId)}`)).status, 200);

    assert.equal((await request(app).get(`/api/v1/customers/${suspCustId}`).set('Authorization', `Bearer ${custToken(suspCustId)}`)).status, 403);
    assert.equal((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${custToken(suspCustId)}`)).status, 403);

    assert.equal((await request(app).get(`/api/v1/customers/${delCustId}`).set('Authorization', `Bearer ${custToken(delCustId)}`)).status, 403);
    assert.equal((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${custToken(delCustId)}`)).status, 403);

    assert.equal((await request(app).get(`/api/v1/customers/${suspOrgCustId}`).set('Authorization', `Bearer ${custToken(suspOrgCustId, orgSuspC)}`)).status, 403);
    assert.equal((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${custToken(suspOrgCustId, orgSuspC)}`)).status, 403);
  });

  // =========================================================================
  // PHASE 4: CUSTOMER REGISTRATION SECURITY
  // =========================================================================
  await suite.test('5. /customers/register enforces identity proof, active org, matching center, no dummy center & biometric consent', async () => {
    const newPhone = '+919900010999';
    const guestId = '44444444-1111-4111-a111-000000000999';
    await db.query(
      `INSERT INTO global_customer_identities (id, normalized_mobile_number, phone_verified_at)
       VALUES ($1, $2, NOW()) ON CONFLICT (normalized_mobile_number) DO NOTHING;`,
      [guestId, newPhone]
    );
    const guestToken = tokenService.signToken({
      userId: `unregistered:${newPhone}`,
      globalCustomerId: guestId,
      role: 'GUEST_FARMER',
      actorType: 'CUSTOMER',
      tokenType: 'access',
    }, 3600);

    // 1. Unauthenticated caller without OTP proof rejected 401
    const unverifiedRes = await request(app).post('/api/v1/customers/register').send({
      mobileNumber: newPhone,
      organizationId: orgActiveA,
      fullName: 'Unverified Attacker',
    });
    assert.equal(unverifiedRes.status, 401);
    assert.equal(unverifiedRes.body.code, 'REGISTRATION_PROOF_REQUIRED');

    // 2. Non-existent organization rejected 400
    const badOrgRes = await request(app)
      .post('/api/v1/customers/register')
      .set('Authorization', `Bearer ${guestToken}`)
      .send({
        mobileNumber: newPhone,
        organizationId: '44444444-dead-4111-a111-888888888888',
        fullName: 'Bad Org Farmer',
      });
    assert.equal(badOrgRes.status, 400);
    assert.equal(badOrgRes.body.code, 'INVALID_ORGANIZATION');

    // 3. Suspended organization rejected 403
    const suspOrgRes = await request(app)
      .post('/api/v1/customers/register')
      .set('Authorization', `Bearer ${guestToken}`)
      .send({
        mobileNumber: newPhone,
        organizationId: orgSuspC,
        fullName: 'Susp Org Farmer',
      });
    assert.equal(suspOrgRes.status, 403);
    assert.equal(suspOrgRes.body.code, 'ORGANIZATION_INACTIVE');

    // 4. Cross-tenant centerId rejected 403
    const crossCenterRes = await request(app)
      .post('/api/v1/customers/register')
      .set('Authorization', `Bearer ${guestToken}`)
      .send({
        mobileNumber: newPhone,
        organizationId: orgActiveA,
        centerId: centerB1,
        fullName: 'Cross Center Farmer',
      });
    assert.equal(crossCenterRes.status, 403);
    assert.equal(crossCenterRes.body.code, 'CROSS_TENANT_CENTER');

    // 5. Biometric payload without biometricConsent: true rejected 400
    const noConsentRes = await request(app)
      .post('/api/v1/customers/register')
      .set('Authorization', `Bearer ${guestToken}`)
      .send({
        mobileNumber: newPhone,
        organizationId: orgActiveA,
        centerId: centerA1,
        fullName: 'Consent Check Farmer',
        biometricConsent: false,
        faceTemplate: { modelVersion: 'sface_int8_2021dec', embedding: generateUnitEmbedding(1), confidence: 0.96 },
      });
    assert.equal(noConsentRes.status, 400);
    assert.equal(noConsentRes.body.code, 'BIOMETRIC_CONSENT_REQUIRED');

    // 6. Unauthorized staff cross-dairy registration rejected 403
    const staffCrossRes = await request(app)
      .post('/api/v1/customers/register')
      .set('Authorization', `Bearer ${dairyAdminToken}`)
      .send({
        mobileNumber: newPhone,
        organizationId: orgActiveB,
        centerId: centerB1,
        fullName: 'Cross Staff Farmer',
      });
    assert.equal(staffCrossRes.status, 403);

    // 7. Missing center in active provisioned org with zero active centers returns 400 NO_ACTIVE_CENTER (no fabricated center)
    const unmappedOrg = '44444444-dead-4111-a111-666666666666';
    await db.query(`INSERT INTO organizations (id, name, code, status) VALUES ($1, 'Unmapped Org', 'UNMAPPED_R021', 'ACTIVE') ON CONFLICT (id) DO NOTHING;`, [unmappedOrg]);
    const unmappedOrgRes = await request(app)
      .post('/api/v1/customers/register')
      .set('Authorization', `Bearer ${guestToken}`)
      .send({ mobileNumber: newPhone, organizationId: unmappedOrg, fullName: 'Unmapped Org Farmer' });
    assert.equal(unmappedOrgRes.status, 503);
    assert.equal(unmappedOrgRes.body.code, 'TENANT_MAPPING_MISSING');

    const zeroCenterOrg = '44444444-dead-4111-a111-777777777777';
    await db.query(`INSERT INTO organizations (id, name, code, status) VALUES ($1, 'Zero Center Org', 'ZERO_C_R021', 'ACTIVE') ON CONFLICT (id) DO NOTHING;`, [zeroCenterOrg]);
    await tenantDbManager.provisionTenantDatabase({
      dairyId: zeroCenterOrg,
      dairyCode: 'ZERO_C_R021',
      dairyName: 'Zero Center Org',
    });
    const zeroCenterTenantDb = await tenantDbManager.getStrictTenantDb(zeroCenterOrg);
    await zeroCenterTenantDb.query(`DELETE FROM dairy_centers;`);
    const noCenterRes = await request(app)
      .post('/api/v1/customers/register')
      .set('Authorization', `Bearer ${guestToken}`)
      .send({ mobileNumber: newPhone, organizationId: zeroCenterOrg, fullName: 'No Center Farmer' });
    assert.equal(noCenterRes.status, 400);
    assert.equal(noCenterRes.body.code, 'NO_ACTIVE_CENTER');

    // 8. Inline OTP-verified registration succeeds cleanly and starts PENDING_APPROVAL
    doveOtpService.resetCooldown('+919900010998');
    const otpReq = await request(app).post('/api/v1/auth/request-otp').send({ mobileNumber: '+919900010998' });
    const inlineOtp = otpReq.body.previewOtp;
    const validRes = await request(app)
      .post('/api/v1/customers/register')
      .send({
        mobileNumber: '+919900010998',
        otp: inlineOtp,
        organizationId: orgActiveA,
        centerId: centerA1,
        fullName: 'Valid Registered Farmer',
      });
    assert.equal(validRes.status, 201);
    assert.equal(validRes.body.status, 'PENDING_APPROVAL');
  });

  // =========================================================================
  // PHASE 5 & 7: CENTER SCOPING & SUPER ADMIN AUTH
  // =========================================================================
  await suite.test('6. AuthService.getCenters enforces strict operator assignments, org scoping, Super Admin selection & DB fail-closed', async () => {
    const mkCtx = (userId, role, organizationId) => ({
      userId,
      role,
      organizationId,
      actorType: 'STAFF',
      authUser: { id: userId },
      centerIds: [],
      token: '',
      userSupabaseClient: {},
    });

    // Assigned operator gets ONLY centerA1 (not centerA2!)
    const opAssignedCenters = await AuthService.getCenters(mkCtx(operatorAssignedId, 'COLLECTION_OPERATOR', orgActiveA));
    assert.equal(opAssignedCenters.length, 1);
    assert.equal(opAssignedCenters[0].id, centerA1);

    // Unassigned operator gets [] (never org-wide centers or hardcoded UUIDs!)
    const opUnassignedCenters = await AuthService.getCenters(mkCtx(operatorUnassignedId, 'COLLECTION_OPERATOR', orgActiveA));
    assert.deepEqual(opUnassignedCenters, []);

    // Dairy Admin gets active org centers (centerA1, centerA2)
    const adminCenters = await AuthService.getCenters(mkCtx(dairyAdminAId, 'DAIRY_ADMIN', orgActiveA));
    assert.equal(adminCenters.length, 2);

    // Cross-tenant query rejected 403
    await assert.rejects(
      () => AuthService.getCenters(mkCtx(dairyAdminAId, 'DAIRY_ADMIN', orgActiveA), orgActiveB),
      (err) => err.statusCode === 403
    );

    // Super Admin with explicit orgActiveB selection gets centerB1; without org gets []
    assert.deepEqual(await AuthService.getCenters(mkCtx(superAdminId, 'SUPER_ADMIN', '')), []);
    const superOrgB = await AuthService.getCenters(mkCtx(superAdminId, 'SUPER_ADMIN', ''), orgActiveB);
    assert.equal(superOrgB.length, 1);
    assert.equal(superOrgB[0].id, centerB1);

    // DB outage fails closed 503 AUTH_DB_UNAVAILABLE
    const origQuery = db.query.bind(db);
    db.query = async () => { throw new Error('center DB down'); };
    try {
      await assert.rejects(
        () => AuthService.getCenters(mkCtx(dairyAdminAId, 'DAIRY_ADMIN', orgActiveA)),
        (err) => err.statusCode === 503 && err.code === 'AUTH_DB_UNAVAILABLE'
      );
    } finally {
      db.query = origQuery;
    }

    // Phase 7: Super Admin router enforces 401/403/200 strictly
    assert.equal((await request(app).get('/api/v1/super-admin/dashboard/metrics')).status, 401);
    assert.equal((await request(app).get('/api/v1/super-admin/dashboard/metrics').set('Authorization', 'Bearer invalid.jwt.sig')).status, 401);
    assert.equal((await request(app).get('/api/v1/super-admin/dashboard/metrics').set('Authorization', `Bearer ${dairyAdminToken}`)).status, 403);
    assert.equal((await request(app).get('/api/v1/super-admin/dashboard/metrics').set('Authorization', `Bearer ${superAdminToken}`)).status, 200);
  });
});
