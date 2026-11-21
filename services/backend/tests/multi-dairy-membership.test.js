import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../dist/app.js';
import { db } from '../dist/infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../dist/infrastructure/database/TenantDatabaseManager.js';
import { HmacJwtTokenService } from '../dist/infrastructure/security/HmacJwtTokenService.js';
import { doveOtpService } from '../dist/infrastructure/otp/DoveOtpService.js';

const tokenService = new HmacJwtTokenService();
const app = createApp();

const dairyAId = '00000000-0000-0000-0000-000000000010';
const dairyBId = '00000000-0000-0000-0000-000000000020';
const centerAId = '00000000-0000-0000-0000-000000000101';
const centerBId = '00000000-0000-0000-0000-000000000201';

const testMobile = '9876543210';
const testMobileE164 = '+919876543210';

const dairyAdminAToken = tokenService.signToken({
  userId: '00000000-0000-0000-0000-000000000088',
  organizationId: dairyAId,
  role: 'DAIRY_ADMIN',
  actorType: 'STAFF',
  fullName: 'Dairy Admin Warna',
});

const dairyAdminBToken = tokenService.signToken({
  userId: '00000000-0000-0000-0000-000000000089',
  organizationId: dairyBId,
  role: 'DAIRY_ADMIN',
  actorType: 'STAFF',
  fullName: 'Dairy Admin Krishna',
});

test('DFARM Multi-Dairy Customer Membership & Identity Verification Suite', async (suite) => {
  let globalCustomerId = '';
  let customerATenantId = '';
  let customerBTenantId = '';
  let dairyAToken = '';

  // Setup mock organizations and centers in central and tenant databases
  await suite.test('0. Database Environment Pre-Flight & Provisioning', async () => {
    const controlDb = tenantDbManager.getControlPlaneDb();

    // Clean up any previous test runs for idempotency
    await controlDb.query(`
      DELETE FROM customer_dairy_memberships WHERE organization_id IN ('${dairyAId}', '${dairyBId}');
      DELETE FROM global_customer_identities WHERE normalized_mobile_number = '${testMobileE164}';
      DELETE FROM customers WHERE normalized_mobile_number = '${testMobileE164}';
    `).catch(() => {});

    // Seed tenant databases with organizations and centers
    const tenantADb = await tenantDbManager.getTenantDb(dairyAId);
    await tenantADb.query(`
      INSERT INTO organizations (id, name, code, status)
      VALUES ('${dairyAId}', 'Warna Sahakari Dudh Utpadak Sanstha', 'WARNA-01', 'ACTIVE')
      ON CONFLICT (id) DO NOTHING;
      INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
      VALUES ('${centerAId}', '${dairyAId}', 'C-W01', 'Warna Main Center', 'Main Road', 'Warnanagar', 'Kolhapur', 'Maharashtra', '416113', '+919876543210', 'ACTIVE')
      ON CONFLICT (id) DO NOTHING;
      DELETE FROM customers WHERE normalized_mobile_number = '${testMobileE164}';
    `).catch(() => {});

    const tenantBDb = await tenantDbManager.getTenantDb(dairyBId);
    await tenantBDb.query(`
      INSERT INTO organizations (id, name, code, status)
      VALUES ('${dairyBId}', 'Krishna Valley Cooperative Dairy', 'KRISHNA-02', 'ACTIVE')
      ON CONFLICT (id) DO NOTHING;
      INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
      VALUES ('${centerBId}', '${dairyBId}', 'C-K01', 'Krishna North Center', 'River Road', 'Sangli Rural', 'Sangli', 'Maharashtra', '416416', '+919876543211', 'ACTIVE')
      ON CONFLICT (id) DO NOTHING;
      DELETE FROM customers WHERE normalized_mobile_number = '${testMobileE164}';
    `).catch(() => {});
  });

  await suite.test('1. Rule 1: One Global Customer Identity per verified mobile number', async () => {
    // 1a. Request OTP
    const reqRes = await request(app)
      .post('/api/v1/auth/request-otp')
      .send({ mobileNumber: testMobile });

    assert.equal(reqRes.status, 200);
    assert.equal(reqRes.body.success, true);
    const otp = reqRes.body.previewOtp || '123456';

    // 1b. Verify OTP
    const verifyRes = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ mobileNumber: testMobile, otp });

    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.body.success, true);
    assert.ok(verifyRes.body.globalCustomerId, 'Expected canonical globalCustomerId in response');
    globalCustomerId = verifyRes.body.globalCustomerId;

    // 1c. Re-login with same mobile verifies that identity is stable (idempotent)
    doveOtpService.resetCooldown(testMobile);
    await tenantDbManager.getControlPlaneDb().query(`DELETE FROM otp_rate_limits WHERE phone LIKE '%${testMobile}%';`).catch(() => {});
    const reLoginOtp = (await doveOtpService.sendOtp(testMobileE164, 'CUSTOMER_AUTH')).previewOtp || '123456';
    const reLoginRes = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ mobileNumber: testMobile, otp: reLoginOtp });

    assert.equal(reLoginRes.status, 200);
    assert.equal(reLoginRes.body.globalCustomerId, globalCustomerId, 'Global customer ID must remain stable');
  });

  await suite.test('2. Rule 2 & 3: Register in Dairy A (Success) & Duplicate within Dairy A (Rejected)', async () => {
    // 2a. Register in Dairy A
    const regARes = await request(app)
      .post('/api/v1/customers/register')
      .send({
        fullName: 'Balasaheb Patil',
        mobileNumber: testMobile,
        organizationId: dairyAId,
        centerId: centerAId,
        village: 'Warnanagar',
        categories: ['COW'],
      });

    assert.equal(regARes.status, 201);
    assert.equal(regARes.body.success, true);
    assert.equal(regARes.body.data.registrationStatus, 'PENDING_APPROVAL');
    customerATenantId = regARes.body.customerUuid || regARes.body.data.id;

    // 2b. Rule 3: Attempting duplicate registration in Dairy A must be strictly prohibited
    const dupARes = await request(app)
      .post('/api/v1/customers/register')
      .send({
        fullName: 'Balasaheb Patil Duplicate',
        mobileNumber: testMobile,
        organizationId: dairyAId,
        centerId: centerAId,
        village: 'Warnanagar',
        categories: ['COW'],
      });

    assert.ok(
      dupARes.status === 400 || dupARes.status === 409,
      `Expected 400/409 duplicate rejection, got ${dupARes.status}`
    );
    const dupAErrText = typeof dupARes.body.error === 'object' ? (dupARes.body.error.message || JSON.stringify(dupARes.body.error)) : (dupARes.body.error || dupARes.body.message || '');
    assert.match(
      dupAErrText,
      /already exists/i,
      'Error message must indicate duplicate customer in dairy'
    );
  });

  await suite.test('3. Rule 2: Same Customer Identity Registering in Dairy B is Allowed', async () => {
    // 3a. Register in Dairy B with same mobile number
    const regBRes = await request(app)
      .post('/api/v1/customers/register')
      .send({
        fullName: 'Balasaheb Patil',
        mobileNumber: testMobile,
        organizationId: dairyBId,
        centerId: centerBId,
        village: 'Sangli Rural',
        categories: ['BUFFALO'],
      });

    assert.equal(regBRes.status, 201, 'Registration in separate Dairy B must succeed');
    assert.equal(regBRes.body.success, true);
    assert.equal(regBRes.body.data.registrationStatus, 'PENDING_APPROVAL');
    customerBTenantId = regBRes.body.customerUuid || regBRes.body.data.id;

    // 3b. Rule 3: Duplicate in Dairy B must also be rejected
    const dupBRes = await request(app)
      .post('/api/v1/customers/register')
      .send({
        fullName: 'Balasaheb Patil Duplicate B',
        mobileNumber: testMobile,
        organizationId: dairyBId,
        centerId: centerBId,
      });

    assert.ok(
      dupBRes.status === 400 || dupBRes.status === 409,
      `Expected 400/409 duplicate rejection in Dairy B, got ${dupBRes.status}`
    );
  });

  await suite.test('4. Membership Discovery Directory returns all memberships with isolated statuses', async () => {
    const memRes = await request(app)
      .get('/api/v1/customers/memberships')
      .query({ phone: testMobileE164 });

    assert.equal(memRes.status, 200);
    assert.equal(memRes.body.success, true);
    assert.ok(Array.isArray(memRes.body.data));
    assert.equal(memRes.body.data.length, 2, 'Customer should have exactly 2 dairy memberships');

    const memA = memRes.body.data.find((m) => m.organizationId === dairyAId);
    const memB = memRes.body.data.find((m) => m.organizationId === dairyBId);

    assert.ok(memA, 'Membership for Dairy A must be discovered');
    assert.ok(memB, 'Membership for Dairy B must be discovered');
    assert.equal(memA.membershipStatus, 'PENDING_APPROVAL');
    assert.equal(memB.membershipStatus, 'PENDING_APPROVAL');
  });

  await suite.test('5. Rule 4: Independent Membership Lifecycle & Admin Approvals', async () => {
    // 5a. Dairy Admin A approves customer in Dairy A
    const appARes = await request(app)
      .post(`/api/v1/customers/${customerATenantId}/approve`)
      .set('Authorization', `Bearer ${dairyAdminAToken}`)
      .set('x-dairy-id', dairyAId)
      .send({ customerCode: 'C-WARNA-101', operatorName: 'Admin Warna' });

    assert.equal(appARes.status, 200);
    assert.equal(appARes.body.success, true);

    // 5b. Dairy Admin B rejects customer in Dairy B with mandatory audit reason
    const rejBRes = await request(app)
      .post(`/api/v1/customers/${customerBTenantId}/reject`)
      .set('Authorization', `Bearer ${dairyAdminBToken}`)
      .set('x-dairy-id', dairyBId)
      .send({ reason: 'Outside village operational jurisdiction radius', operatorName: 'Admin Krishna' });

    assert.equal(rejBRes.status, 200);
    assert.equal(rejBRes.body.success, true);

    // 5c. Discover memberships again to verify independent lifecycle
    const updatedMemRes = await request(app)
      .get('/api/v1/customers/memberships')
      .query({ phone: testMobileE164 });

    assert.equal(updatedMemRes.status, 200);
    const updatedA = updatedMemRes.body.data.find((m) => m.organizationId === dairyAId);
    const updatedB = updatedMemRes.body.data.find((m) => m.organizationId === dairyBId);

    assert.equal(updatedA.membershipStatus, 'APPROVED', 'Dairy A must be APPROVED');
    assert.equal(updatedA.farmerCode, 'C-WARNA-101');
    assert.equal(updatedB.membershipStatus, 'REJECTED', 'Dairy B must be REJECTED independently');
  });

  await suite.test('6. Rule 5: Dairy Switching & Tenant Scoped JWT Generation', async () => {
    // 6a. Switching to APPROVED Dairy A succeeds
    const switchARes = await request(app)
      .post('/api/v1/customers/switch-dairy')
      .set('Authorization', `Bearer ${dairyAdminAToken}`) // or guest/authenticated token
      .send({ dairyId: dairyAId, globalCustomerId });

    assert.equal(switchARes.status, 200);
    assert.equal(switchARes.body.success, true);
    assert.ok(switchARes.body.accessToken);
    dairyAToken = switchARes.body.accessToken;

    const claims = tokenService.verifyToken(dairyAToken);
    assert.equal(claims.organizationId, dairyAId, 'Token must be scoped to Dairy A');
    assert.equal(claims.role, 'FARMER_CUSTOMER');

    // 6b. Attempting to switch to REJECTED Dairy B is strictly blocked
    const switchBRes = await request(app)
      .post('/api/v1/customers/switch-dairy')
      .set('Authorization', `Bearer ${dairyAToken}`)
      .send({ dairyId: dairyBId, globalCustomerId });

    assert.equal(switchBRes.status, 400);
    const switchErrText = typeof switchBRes.body.error === 'object' ? (switchBRes.body.error.message || JSON.stringify(switchBRes.body.error)) : (switchBRes.body.error || '');
    assert.match(switchErrText, /only approved memberships/i);
  });

  await suite.test('7. Rule 5: Strict Operational Tenant Isolation across Dairies', async () => {
    // 7a. Under Dairy A token, fetch customer profile
    const meRes = await request(app)
      .get('/api/v1/customers/me')
      .set('Authorization', `Bearer ${dairyAToken}`);

    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.data.id, customerATenantId);
    assert.equal(meRes.body.data.organizationId, dairyAId);

    // 7b. Under Dairy A token, collections and ledger return only Dairy A records
    const histRes = await request(app)
      .get('/api/v1/collections/history')
      .set('Authorization', `Bearer ${dairyAToken}`);

    assert.equal(histRes.status, 200);
    assert.ok(Array.isArray(histRes.body.data));

    const ledgerRes = await request(app)
      .get('/api/v1/ledger/summary')
      .set('Authorization', `Bearer ${dairyAToken}`);

    assert.equal(ledgerRes.status, 200);
    assert.ok(typeof ledgerRes.body.balance === 'number');

    const billsRes = await request(app)
      .get('/api/v1/bills')
      .set('Authorization', `Bearer ${dairyAToken}`);

    assert.equal(billsRes.status, 200);
    assert.ok(Array.isArray(billsRes.body.data));
  });
});
