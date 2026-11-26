import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../dist/app.js';
import { db } from '../dist/infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../dist/infrastructure/database/TenantDatabaseManager.js';
import { HmacJwtTokenService } from '../dist/infrastructure/security/HmacJwtTokenService.js';

const app = createApp();
const tokenService = new HmacJwtTokenService();

test('DFarm Collection Operator Authorization & Complete Lifecycle Suite', async (suite) => {
  const warnaDairyId = '38918630-4fee-4cec-96ea-a3a899aae7bc'; // Warna Milk's
  const warnaCenterId = '38918630-4fee-4cec-96ea-a3a899aae701';
  const popatAdminId = '37b8de06-0023-4935-b1bb-3d7152065e6e';
  const popatPhone = '9834388787';

  const popatAdminToken = tokenService.signToken({
    userId: popatAdminId,
    organizationId: warnaDairyId,
    role: 'PRIMARY_DAIRY_ADMIN',
    actorType: 'STAFF',
  });

  const operatorPhone = '9876543212';
  const customerPhone = '9876543299';
  const unregisteredPhone = '9111222333';

  // Ensure isolated tenant DB exists for Warna before onboarding & session tests
  await tenantDbManager.provisionTenantDatabase({
    dairyId: warnaDairyId,
    dairyCode: 'DF-SAN-2395',
    dairyName: "Warna Milk's",
  });
  const warnaTenantDb = await tenantDbManager.getStrictTenantDb(warnaDairyId);
  await warnaTenantDb.query(
    `INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
     VALUES ($1, $2, 'C-01', 'Warna Main Center', 'Main Road', 'Kavathe Piran', 'Sangli', 'Maharashtra', '416417', '+919834388787', 'ACTIVE')
     ON CONFLICT (id) DO NOTHING;`,
    [warnaCenterId, warnaDairyId]
  );

  // Seed customer user for negative RBAC testing
  await db.query(`
    INSERT INTO users (id, organization_id, username, full_name, phone_number, role, status)
    VALUES ('00000000-0000-0000-0000-000000000999', '${warnaDairyId}', 'farmer_test', 'Suresh Farmer', '+91${customerPhone}', 'FARMER_CUSTOMER', 'ACTIVE')
    ON CONFLICT (id) DO UPDATE SET role = 'FARMER_CUSTOMER', status = 'ACTIVE';
  `);

  await suite.test('1. REPRODUCTION: Unregistered mobile number is rejected with 401 UNAUTHORIZED', async () => {
    const res = await request(app)
      .post('/api/v1/auth/operator/otp/request')
      .send({ mobileNumber: unregisteredPhone });

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'UNAUTHORIZED');
    assert.strictEqual(res.body.error.message, 'Mobile number is not registered as an authorized operator.');
  });

  await suite.test('2. RBAC HARDENING: Customer mobile number attempting operator login is rejected', async () => {
    const res = await request(app)
      .post('/api/v1/auth/operator/otp/request')
      .send({ mobileNumber: customerPhone });

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
    assert.ok(
      res.body.error.message.includes('registered as a customer') ||
      res.body.error.message.includes('authorized operator')
    );
  });

  await suite.test('3. DAIRY ADMIN: Onboard new Collection Operator for Warna Milk', async () => {
    // 3a. Verify centers list endpoint
    const centersRes = await request(app)
      .get('/api/v1/staff/centers')
      .set('Authorization', `Bearer ${popatAdminToken}`);
    
    assert.strictEqual(centersRes.status, 200);
    assert.strictEqual(centersRes.body.success, true);
    assert.ok(Array.isArray(centersRes.body.data));

    // 3b. Onboard operator
    const onboardRes = await request(app)
      .post('/api/v1/staff')
      .set('Authorization', `Bearer ${popatAdminToken}`)
      .send({
        fullName: 'Vikas Suresh Patil',
        mobileNumber: operatorPhone,
        role: 'COLLECTION_OPERATOR',
        centerId: warnaCenterId,
        counterName: 'Counter 1',
        email: 'vikas.patil@warna.local',
      });

    assert.strictEqual(onboardRes.status, 201);
    assert.strictEqual(onboardRes.body.success, true);
    assert.strictEqual(onboardRes.body.data.fullName, 'Vikas Suresh Patil');
    assert.strictEqual(onboardRes.body.data.role, 'COLLECTION_OPERATOR');
    assert.strictEqual(onboardRes.body.data.centerId, warnaCenterId);
    assert.strictEqual(onboardRes.body.data.dairyId, warnaDairyId);
    assert.ok(onboardRes.body.data.permissions.includes('collections:intake'));
  });

  let savedOtp = '';
  let operatorToken = '';
  let operatorSession = null;

  await suite.test('4. OPERATOR AUTH: Request OTP for onboarded operator succeeds with real 6-digit OTP', async () => {
    const reqOtpRes = await request(app)
      .post('/api/v1/auth/operator/otp/request')
      .send({ mobileNumber: operatorPhone });

    assert.strictEqual(reqOtpRes.status, 200);
    assert.strictEqual(reqOtpRes.body.success, true);
    assert.ok(reqOtpRes.body.previewOtp);
    assert.strictEqual(reqOtpRes.body.previewOtp.length, 6);
    savedOtp = reqOtpRes.body.previewOtp;
  });

  await suite.test('5. OPERATOR AUTH: Verify OTP issues valid JWT and resolves Warna Dairy & Center context', async () => {
    // Verify OTP using saved OTP from step 4
    const verifyRes = await request(app)
      .post('/api/v1/auth/operator/otp/verify')
      .send({ mobileNumber: operatorPhone, otp: savedOtp });

    assert.strictEqual(verifyRes.status, 200);
    assert.strictEqual(verifyRes.body.success, true);
    assert.ok(verifyRes.body.token);

    operatorToken = verifyRes.body.token;
    operatorSession = verifyRes.body.operator;

    assert.strictEqual(operatorSession.fullName, 'Vikas Suresh Patil');
    assert.strictEqual(operatorSession.role, 'COLLECTION_OPERATOR');
    assert.strictEqual(operatorSession.dairyId, warnaDairyId);
    assert.strictEqual(operatorSession.centerId, warnaCenterId);
    assert.ok(operatorSession.dairyName);
    assert.ok(operatorSession.dairyCode);
  });

  await suite.test('6. COLLECTION APP: Authenticated operator opens shift session in assigned center', async () => {
    const sessionRes = await request(app)
      .post('/api/v1/collections/sessions/open')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        shift: 'MORNING',
        milkType: 'COW',
        centerId: warnaCenterId,
        counterNumber: 'Counter 1',
      });

    assert.ok(sessionRes.status === 200 || sessionRes.status === 201);
    assert.strictEqual(sessionRes.body.success, true);
    assert.ok(sessionRes.body.data.sessionCode);
    assert.strictEqual(sessionRes.body.data.status, 'OPEN');
  });

  await suite.test('7. SUSPENSION ENFORCEMENT: Suspended operator is immediately denied OTP request', async () => {
    // Dairy admin suspends the operator
    const suspendRes = await request(app)
      .patch(`/api/v1/staff/${operatorSession.id}/status`)
      .set('Authorization', `Bearer ${popatAdminToken}`)
      .send({ status: 'SUSPENDED' });

    assert.strictEqual(suspendRes.status, 200);
    assert.strictEqual(suspendRes.body.success, true);

    // Suspended operator tries to request OTP
    const otpAttempt = await request(app)
      .post('/api/v1/auth/operator/otp/request')
      .send({ mobileNumber: operatorPhone });

    assert.strictEqual(otpAttempt.status, 401);
    assert.strictEqual(otpAttempt.body.success, false);
    assert.ok(otpAttempt.body.error.message.includes('suspended or inactive'));

    // Reactivate operator for remaining tests
    await request(app)
      .patch(`/api/v1/staff/${operatorSession.id}/status`)
      .set('Authorization', `Bearer ${popatAdminToken}`)
      .send({ status: 'ACTIVE' });
  });

  await suite.test('8. MULTI-DAIRY ISOLATION: Operator from Dairy A cannot operate in Dairy B', async () => {
    const dairyBId = '00000000-0000-0000-0000-000000000020';
    const fakeCenterB = '00000000-0000-0000-0000-000000000021';

    // Attempting intake for another dairy using operatorToken
    const intakeRes = await request(app)
      .post('/api/v1/collections/transactions')
      .set('Authorization', `Bearer ${operatorToken}`)
      .set('X-Dairy-Id', dairyBId)
      .send({
        customerId: '00000000-0000-0000-0000-000000000999',
        centerId: fakeCenterB,
        milkType: 'COW',
        quantityKg: 10.5,
        fat: 4.2,
        snf: 8.5,
      });

    // Cross-tenant mismatch is caught by tenant guard / center isolation
    assert.ok(
      intakeRes.status === 400 ||
      intakeRes.status === 401 ||
      intakeRes.status === 403 ||
      intakeRes.status === 404
    );
  });
});
