import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../dist/app.js';
import { tenantDbManager } from '../dist/infrastructure/database/TenantDatabaseManager.js';
import { HmacJwtTokenService } from '../dist/infrastructure/security/HmacJwtTokenService.js';
import { doveOtpService } from '../dist/infrastructure/otp/DoveOtpService.js';
import { inMemoryDairies } from '../dist/infrastructure/database/InMemoryDairyStore.js';

const tokenService = new HmacJwtTokenService();
const app = createApp();

test('DFARM Customer Registration -> Selected Dairy Tenant DB -> Admin Approval -> Customer Status E2E Verification Suite', async (suite) => {
  const warnaDairyId = '38918630-4fee-4cec-96ea-a3a899aae7bc';
  const warnaDairyCode = 'DF-SAN-2395';
  const warnaDairyName = "Warna Milk's";
  const warnaAdminPhone = '+919834388787';

  const otherDairyId = '00000000-0000-0000-0000-000000000099';
  const otherDairyCode = 'DF-KOL-9999';
  const otherDairyName = 'Gokul Test Dairy';

  const customerMobile = '7755995615';
  const customerMobileE164 = '+917755995615';
  const customerFullName = 'Shubhangi popat Yewale';

  let globalCustomerId = '';
  let customerTenantId = '';
  let dairyAdminToken = '';
  let otherAdminToken = '';

  await suite.test('0. Setup: Clean State & Initialize Authoritative Warna Dairy with FAILED DB', async () => {
    const controlDb = tenantDbManager.getControlPlaneDb();

    // Clean any previous test data
    await controlDb.query(`
      DELETE FROM customer_dairy_memberships WHERE organization_id = '${warnaDairyId}';
      DELETE FROM global_customer_identities WHERE normalized_mobile_number = '${customerMobileE164}';
      DELETE FROM organizations WHERE id = '${warnaDairyId}';
    `).catch(() => {});

    // Insert authoritative organization into control plane
    await controlDb.query(
      `INSERT INTO organizations (id, name, code, status, business_phone, business_email)
       VALUES ($1, $2, $3, 'ACTIVE', '9834388787', 'pankajye5656@gmail.com')
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code;`,
      [warnaDairyId, warnaDairyName, warnaDairyCode]
    );

    // Register in inMemoryDairies to reflect directory state
    inMemoryDairies.set(warnaDairyId, {
      id: warnaDairyId,
      code: warnaDairyCode,
      name: warnaDairyName,
      status: 'active',
      primaryAdminMobile: '9834388787',
      primaryAdminName: 'popat yewale',
      contact: { businessPhone: '9834388787', businessEmail: 'pankajye5656@gmail.com' },
      location: { addressLine1: 'Kavathe Piran', district: 'sangli', state: 'Maharashtra', pincode: '416417' },
    });

    // Simulate the exact initial state: DB FAILED
    const failedMapping = {
      id: crypto.randomUUID(),
      dairyId: warnaDairyId,
      dairyCode: warnaDairyCode,
      databaseName: `dfarm_tenant_df_san_2395_389186304fee`,
      resourceType: 'PHYSICAL_DATABASE',
      schemaVersion: 'v1.0.0',
      provisioningStatus: 'FAILED',
      provisioningError: 'CRITICAL: Tenant database provisioning failed for DF-SAN-2395: connect ECONNREFUSED 127.0.0.1:54322',
      lastVerifiedAt: new Date().toISOString(),
    };
    tenantDbManager.tenantMappings.set(warnaDairyId, failedMapping);
  });

  await suite.test('1. Stage 4 Pre-Condition: Registration MUST FAIL SAFELY when Tenant DB is in FAILED State', async () => {
    const regRes = await request(app)
      .post('/api/v1/customers/register')
      .send({
        fullName: customerFullName,
        mobileNumber: customerMobile,
        organizationId: warnaDairyId,
        village: 'Kavathe Piran',
        categories: ['COW'],
      });

    assert.equal(regRes.status, 503, 'Must return 503 Service Unavailable when DB is FAILED');
    assert.equal(regRes.body.success, false);
    assert.equal(regRes.body.code, 'TENANT_DATABASE_UNAVAILABLE');
    assert.ok(regRes.body.error.includes('unavailable'), 'Actionable error message required');
  });

  await suite.test('2. Stage 2 & 4: Tenant DB Provisioning Recovery & Database Activation', async () => {
    // Re-provision tenant DB to ACTIVE using test runner double
    const activeMapping = await tenantDbManager.provisionTenantDatabase({
      dairyId: warnaDairyId,
      dairyCode: warnaDairyCode,
      dairyName: warnaDairyName,
    });

    assert.equal(activeMapping.dairyId, warnaDairyId);
    assert.equal(activeMapping.provisioningStatus, 'ACTIVE');

    const tenantDb = await tenantDbManager.getTenantDb(warnaDairyId);
    assert.ok(tenantDb, 'Tenant DB connection must be operational');
    const aliveCheck = await tenantDb.query('SELECT 1 as alive;');
    assert.equal(aliveCheck.rows[0].alive, 1);
  });

  await suite.test('3. Stage 4 & 5: Customer Registration saves into Authoritative Tenant DB as PENDING_APPROVAL', async () => {
    const regRes = await request(app)
      .post('/api/v1/customers/register')
      .send({
        fullName: customerFullName,
        mobileNumber: customerMobile,
        organizationId: warnaDairyId,
        village: 'Kavathe Piran',
        categories: ['COW'],
        bankDetails: {
          accountNumber: '12345678912',
          bankName: 'SBI',
          ifscCode: 'SBIN0919659',
        },
      });

    assert.equal(regRes.status, 201, 'Registration must succeed once DB is ACTIVE');
    assert.equal(regRes.body.success, true);
    assert.equal(regRes.body.status, 'PENDING_APPROVAL');
    customerTenantId = regRes.body.customerUuid || regRes.body.data.id;
    assert.ok(customerTenantId, 'Must return assigned customerUuid');

    // Verify registration physically exists in the selected tenant database
    const tenantDb = await tenantDbManager.getTenantDb(warnaDairyId);
    const tenantRow = await tenantDb.query(
      `SELECT id, organization_id, full_name, normalized_mobile_number, registration_status, status FROM customers WHERE id = $1;`,
      [customerTenantId]
    );
    assert.equal(tenantRow.rows.length, 1, 'Record must exist in Warna tenant DB');
    assert.equal(tenantRow.rows[0].organization_id, warnaDairyId);
    assert.equal(tenantRow.rows[0].registration_status, 'PENDING_APPROVAL');

    // Verify central membership directory
    const controlDb = tenantDbManager.getControlPlaneDb();
    const memRow = await controlDb.query(
      `SELECT * FROM customer_dairy_memberships WHERE organization_id = $1 AND tenant_customer_id = $2;`,
      [warnaDairyId, customerTenantId]
    );
    assert.equal(memRow.rows.length, 1, 'Central membership directory must track registration');
    assert.equal(memRow.rows[0].membership_status, 'PENDING_APPROVAL');
    globalCustomerId = memRow.rows[0].global_customer_id;
    assert.ok(globalCustomerId);
  });

  await suite.test('4. Stage 5: Duplicate Registration within Same Dairy is Rejected', async () => {
    const dupRes = await request(app)
      .post('/api/v1/customers/register')
      .send({
        fullName: 'Shubhangi popat Yewale Duplicate',
        mobileNumber: customerMobile,
        organizationId: warnaDairyId,
        village: 'Kavathe Piran',
      });

    assert.ok(dupRes.status === 400 || dupRes.status === 409);
    const errText = typeof dupRes.body.error === 'object' ? JSON.stringify(dupRes.body.error) : (dupRes.body.error || '');
    assert.match(errText, /already exists/i, 'Must prevent duplicate registration');
  });

  await suite.test('5. Stage 6: Dairy Admin Login dynamically resolves to Authoritative Warna Org', async () => {
    // Popat Yewale (9834388787) requests and verifies OTP
    doveOtpService.registerAuthorizedAdminPhone(warnaAdminPhone);
    const reqOtpRes = await request(app)
      .post('/api/v1/auth/admin/otp/request')
      .send({ phone: warnaAdminPhone });

    assert.equal(reqOtpRes.status, 200);
    const otp = reqOtpRes.body.previewOtp || '123456';

    const verifyOtpRes = await request(app)
      .post('/api/v1/auth/admin/otp/verify')
      .send({ phone: warnaAdminPhone, otp });

    assert.equal(verifyOtpRes.status, 200);
    assert.equal(verifyOtpRes.body.success, true);
    assert.ok(verifyOtpRes.body.token);
    dairyAdminToken = verifyOtpRes.body.token;

    // Verify user object and token claims resolve to authoritative Warna dairy ID
    assert.equal(verifyOtpRes.body.user.dairyId, warnaDairyId, 'Admin dairyId must be authoritative Warna ID');
    assert.equal(verifyOtpRes.body.user.dairyCode, warnaDairyCode, 'Admin dairyCode must be DF-SAN-2395');

    const claims = tokenService.verifyToken(dairyAdminToken);
    assert.equal(claims.organizationId, warnaDairyId, 'JWT organizationId must be authoritative Warna ID');
  });

  await suite.test('6. Stage 7: Dairy Admin Pending Queue displays Applicant', async () => {
    const pendingRes = await request(app)
      .get(`/api/v1/customers/pending?organizationId=${warnaDairyId}`)
      .set('Authorization', `Bearer ${dairyAdminToken}`);

    assert.equal(pendingRes.status, 200);
    assert.equal(pendingRes.body.success, true);
    assert.ok(Array.isArray(pendingRes.body.data));
    assert.ok(pendingRes.body.count >= 1);

    const applicant = pendingRes.body.data.find((c) => c.id === customerTenantId);
    assert.ok(applicant, 'Applicant must appear in pending queue');
    assert.equal(applicant.candidateName, customerFullName);
    assert.equal(applicant.dairyId, warnaDairyId);
    assert.equal(applicant.status, 'PENDING');
  });

  await suite.test('7. Stage 7: Cross-Tenant Isolation: Another Dairy Admin cannot see Applicant', async () => {
    // Provision Other Dairy
    await tenantDbManager.provisionTenantDatabase({
      dairyId: otherDairyId,
      dairyCode: otherDairyCode,
      dairyName: otherDairyName,
    });

    otherAdminToken = tokenService.signToken({
      userId: crypto.randomUUID(),
      organizationId: otherDairyId,
      role: 'DAIRY_ADMIN',
      actorType: 'STAFF',
      fullName: 'Other Admin',
    });

    // Other admin queries their own pending queue -> must NOT contain Warna applicant
    const otherPendingRes = await request(app)
      .get(`/api/v1/customers/pending?organizationId=${otherDairyId}`)
      .set('Authorization', `Bearer ${otherAdminToken}`);

    assert.equal(otherPendingRes.status, 200);
    const foundOther = otherPendingRes.body.data.find((c) => c.id === customerTenantId);
    assert.equal(foundOther, undefined, 'Warna applicant must NOT appear in Other dairy queue');

    // Attempting cross-tenant access to Warna pending list with other token -> blocked with 403
    const crossRes = await request(app)
      .get(`/api/v1/customers/pending?organizationId=${warnaDairyId}`)
      .set('Authorization', `Bearer ${otherAdminToken}`);

    assert.equal(crossRes.status, 403, 'Cross-tenant query must be rejected with 403 Forbidden');
  });

  await suite.test('8. Stage 8 & 9: Dairy Admin Approves Applicant -> Tenant & Central Sync', async () => {
    const approveRes = await request(app)
      .post(`/api/v1/customers/${customerTenantId}/approve`)
      .set('Authorization', `Bearer ${dairyAdminToken}`)
      .send({
        operatorName: 'popat yewale',
        customerCode: 'F-SAN-001',
      });

    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.body.success, true);
    assert.equal(approveRes.body.status, 'ACTIVE');
    assert.equal(approveRes.body.farmerCode, 'F-SAN-001');

    // Verify tenant record is now APPROVED and ACTIVE
    const tenantDb = await tenantDbManager.getTenantDb(warnaDairyId);
    const updatedTenant = await tenantDb.query(
      `SELECT registration_status, status, farmer_code FROM customers WHERE id = $1;`,
      [customerTenantId]
    );
    assert.equal(updatedTenant.rows[0].registration_status, 'APPROVED');
    assert.equal(updatedTenant.rows[0].status, 'ACTIVE');
    assert.equal(updatedTenant.rows[0].farmer_code, 'F-SAN-001');

    // Verify central membership directory is synchronized to APPROVED
    const controlDb = tenantDbManager.getControlPlaneDb();
    const updatedMem = await controlDb.query(
      `SELECT membership_status, farmer_code FROM customer_dairy_memberships WHERE organization_id = $1 AND tenant_customer_id = $2;`,
      [warnaDairyId, customerTenantId]
    );
    assert.equal(updatedMem.rows[0].membership_status, 'APPROVED');
    assert.equal(updatedMem.rows[0].farmer_code, 'F-SAN-001');
  });

  await suite.test('9. Stage 10: Customer App Status Polling reflects APPROVED and assigned Dairy Name', async () => {
    const statusRes = await request(app)
      .get(`/api/v1/customers/${customerTenantId}/status`)
      .query({ organizationId: warnaDairyId });

    assert.equal(statusRes.status, 200);
    assert.equal(statusRes.body.success, true);
    assert.equal(statusRes.body.status, 'APPROVED');
    assert.equal(statusRes.body.customerCode, 'F-SAN-001');
    assert.equal(statusRes.body.assignedDairyName, warnaDairyName);
  });
});
