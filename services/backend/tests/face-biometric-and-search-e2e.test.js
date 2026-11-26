import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../dist/app.js';
import { tenantDbManager } from '../dist/infrastructure/database/TenantDatabaseManager.js';
import { HmacJwtTokenService } from '../dist/infrastructure/security/HmacJwtTokenService.js';
import { inMemoryDairies } from '../dist/infrastructure/database/InMemoryDairyStore.js';

const tokenService = new HmacJwtTokenService();
const app = createApp();

// Canonical 128-D Unit L2 Normalized SFace Embedding Fixture
const TEST_EMBEDDING_128D = [
  -0.082143, 0.041285, 0.012541, -0.098412, 0.065412, 0.112451, -0.045123, 0.032145,
  0.078451, -0.065124, 0.092145, 0.035124, -0.124512, 0.084125, -0.012541, 0.054123,
  0.063214, -0.042151, 0.095412, -0.074125, 0.032145, 0.105412, -0.084125, 0.021541,
  0.045123, -0.062145, 0.087412, 0.034125, -0.095412, 0.054123, -0.032145, 0.074125,
  -0.041254, 0.085412, -0.064125, 0.093214, 0.012541, -0.075412, 0.062145, 0.045123,
  0.084125, -0.032145, 0.054123, -0.092145, 0.075412, 0.021541, -0.065412, 0.041254,
  -0.074125, 0.093214, 0.015412, -0.084125, 0.052145, 0.063214, -0.041254, 0.075412,
  0.032145, -0.065412, 0.084125, -0.021541, 0.093214, 0.045123, -0.074125, 0.052145,
  -0.054123, 0.075412, -0.032145, 0.084125, 0.021541, -0.093214, 0.065412, 0.041254,
  0.074125, -0.052145, 0.063214, -0.084125, 0.045123, 0.015412, -0.075412, 0.093214,
  -0.062145, 0.084125, 0.032145, -0.074125, 0.054123, 0.021541, -0.095412, 0.063214,
  0.041254, -0.085412, 0.075412, -0.032145, 0.092145, 0.054123, -0.064125, 0.045123,
  -0.075412, 0.062145, 0.012541, -0.084125, 0.093214, 0.032145, -0.054123, 0.074125,
  0.045123, -0.063214, 0.085412, -0.041254, 0.075412, 0.021541, -0.092145, 0.065412,
  -0.084125, 0.054123, 0.032145, -0.075412, 0.062145, 0.041254, -0.093214, 0.074125,
  0.021541, -0.065412, 0.084125, -0.045123, 0.075412, 0.032145, -0.085412, 0.062145,
];

test('DFARM Targeted Fix E2E: Face Biometric Update, Test Face, Collection Recognition & Customer Search Enter', async (suite) => {
  const warnaDairyId = '38918630-4fee-4cec-96ea-a3a899aae7bc';
  const warnaDairyCode = 'DF-SAN-2395';
  const warnaDairyName = "Warna Milk's";

  const customerMobile = '7755995615';
  const customerFullName = 'Shubhangi Popat Yewale';
  const assignedFarmerCode = 'C-101';

  let customerTenantId = '';
  let dairyAdminToken = '';
  let customerAuthToken = '';

  await suite.test('0. Setup: Initialize Dairy, Provision Tenant DB & Admin Session', async () => {
    const controlDb = tenantDbManager.getControlPlaneDb();

    // Clean any pre-existing farmer registration state for this mobile number
    await controlDb.query(`
      DELETE FROM customer_dairy_memberships WHERE organization_id = '${warnaDairyId}';
      DELETE FROM global_customer_identities WHERE normalized_mobile_number = '+91${customerMobile}';
      DELETE FROM customers WHERE organization_id = '${warnaDairyId}';
    `).catch(() => {});

    // Register organization in control plane
    await controlDb.query(
      `INSERT INTO organizations (id, name, code, status, business_phone, business_email)
       VALUES ($1, $2, $3, 'ACTIVE', '9834388787', 'pankajye5656@gmail.com')
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code;`,
      [warnaDairyId, warnaDairyName, warnaDairyCode]
    );

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

    await tenantDbManager.provisionTenantDatabase({
      dairyId: warnaDairyId,
      dairyCode: warnaDairyCode,
      dairyName: warnaDairyName,
    });

    const tenantDb = await tenantDbManager.getTenantDb(warnaDairyId);
    await tenantDb.query(
      `INSERT INTO dairy_centers (
         id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status
       ) VALUES (
         '38918630-4fee-4cec-96ea-a3a899aae701', $1, 'C-01', 'Warna Main Center', 'Kavathe Piran', 'Kavathe Piran', 'Sangli', 'Maharashtra', '416417', '+919834388787', 'ACTIVE'
       ) ON CONFLICT (id) DO NOTHING;`,
      [warnaDairyId]
    );
    await tenantDb.query(`DELETE FROM customers WHERE organization_id = $1;`, [warnaDairyId]).catch(() => {});
    await tenantDb.query(
      `INSERT INTO users (id, organization_id, username, full_name, phone_number, role, status)
       VALUES ($1, $2, 'admin_warna_01', 'Warna Admin 01', '+919834388787', 'DAIRY_ADMIN', 'ACTIVE')
       ON CONFLICT (id) DO NOTHING;`,
      ['38918630-4fee-4cec-96ea-000000000011', warnaDairyId]
    );
    const { db } = await import('../dist/infrastructure/database/PostgresPool.js');
    await db.query(
      `INSERT INTO users (id, organization_id, username, full_name, phone_number, role, status)
       VALUES ($1, $2, 'admin_warna_01', 'Warna Admin 01', '+919834388787', 'DAIRY_ADMIN', 'ACTIVE')
       ON CONFLICT (id) DO NOTHING;`,
      ['38918630-4fee-4cec-96ea-000000000011', warnaDairyId]
    );

    dairyAdminToken = tokenService.signToken({
      userId: '38918630-4fee-4cec-96ea-000000000011',
      role: 'DAIRY_ADMIN',
      organizationId: warnaDairyId,
      actorType: 'STAFF',
    });

    assert.ok(dairyAdminToken);
  });

  await suite.test('1. Onboard Farmer into Selected Dairy Tenant Database', async () => {
    // 1. Register customer via onboarding API (staff-assisted with authenticated DAIRY_ADMIN)
    const regRes = await request(app)
      .post('/api/v1/customers/register')
      .set('Authorization', `Bearer ${dairyAdminToken}`)
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

    assert.equal(regRes.status, 201);
    assert.equal(regRes.body.success, true);
    customerTenantId = regRes.body.customerUuid || regRes.body.data?.id;
    assert.ok(customerTenantId);

    customerAuthToken = tokenService.signToken({
      userId: customerTenantId,
      role: 'CUSTOMER',
      organizationId: warnaDairyId,
      actorType: 'CUSTOMER',
    });

    // 2. Dairy Admin Approves Farmer with Code C-101
    const approveRes = await request(app)
      .post(`/api/v1/customers/${customerTenantId}/approve`)
      .set('Authorization', `Bearer ${dairyAdminToken}`)
      .send({
        assignedFarmerCode,
        permittedCategories: ['COW', 'BUFFALO'],
      });

    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.body.data.registrationStatus, 'APPROVED');
    assert.equal(approveRes.body.data.farmerCode, assignedFarmerCode);
  });

  await suite.test('2. Issue A: Face Biometric Update persists encrypted 128D embedding in tenant DB', async () => {
    const updateRes = await request(app)
      .post(`/api/v1/customers/${customerTenantId}/biometrics/update?organizationId=${warnaDairyId}`)
      .set('Authorization', `Bearer ${customerAuthToken}`)
      .send({
        modelVersion: 'sface_int8_2021dec',
        embedding: TEST_EMBEDDING_128D,
        confidence: 0.98,
        organizationId: warnaDairyId,
      });

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.success, true);
    assert.equal(updateRes.body.biometricStatus.isEnrolled, true);
    assert.equal(updateRes.body.biometricStatus.version, 'sface_int8_2021dec');

    // Verify tenant DB record directly
    const tenantDb = await tenantDbManager.getTenantDb(warnaDairyId);
    const rows = await tenantDb.query(
      `SELECT id, customer_id, model_version_id, status FROM face_enrollments WHERE customer_id = $1 AND status = 'ACTIVE'`,
      [customerTenantId]
    );

    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].customer_id, customerTenantId);
    assert.equal(rows.rows[0].status, 'ACTIVE');
  });

  await suite.test('3. Issue C: Collection App retrieves decrypted 128D enrolled templates for Dairy', async () => {
    const templatesRes = await request(app)
      .get(`/api/v1/identity/face/templates?organizationId=${warnaDairyId}`)
      .set('Authorization', `Bearer ${dairyAdminToken}`)
      .set('X-Dairy-Id', warnaDairyId);

    assert.equal(templatesRes.status, 200);
    assert.equal(templatesRes.body.success, true);
    assert.ok(templatesRes.body.count >= 1);

    const template = templatesRes.body.data.find((t) => t.customerId === customerTenantId);
    assert.ok(template, 'Enrolled template must be present in dairy templates list');
    assert.equal(template.farmerCode, assignedFarmerCode);
    assert.equal(template.fullName, customerFullName);
    assert.equal(template.embedding.length, 128);

    // Verify cosine similarity of retrieved template against probe embedding is >= 0.99
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < 128; i++) {
      dot += TEST_EMBEDDING_128D[i] * template.embedding[i];
      normA += TEST_EMBEDDING_128D[i] ** 2;
      normB += template.embedding[i] ** 2;
    }
    const similarity = dot / (Math.sqrt(normA) * Math.sqrt(normB));
    assert.ok(similarity > 0.99, `Retrieved embedding similarity ${similarity} must match original`);
  });

  await suite.test('4. Issue B & C: Face Matching API correctly verifies farmer identity', async () => {
    // 1. Probe matching exact enrolled face
    const matchRes = await request(app)
      .post('/api/v1/identity/face/match')
      .set('Authorization', `Bearer ${dairyAdminToken}`)
      .set('X-Dairy-Id', warnaDairyId)
      .send({
        embedding: TEST_EMBEDDING_128D,
        organizationId: warnaDairyId,
      });

    assert.equal(matchRes.status, 200);
    assert.equal(matchRes.body.success, true);
    assert.equal(matchRes.body.matched, true);
    assert.equal(matchRes.body.farmerId, customerTenantId);
    assert.equal(matchRes.body.farmerCode, assignedFarmerCode);
    assert.equal(matchRes.body.farmerName, customerFullName);
    assert.ok(matchRes.body.similarityScore > 0.363);
    assert.ok(matchRes.body.confidenceScore >= 70);

    // 2. Probe with an unknown person embedding (orthogonal vector)
    const unknownEmbedding = new Array(128).fill(0);
    unknownEmbedding[0] = 1.0;

    const unknownRes = await request(app)
      .post('/api/v1/identity/face/match')
      .set('Authorization', `Bearer ${dairyAdminToken}`)
      .set('X-Dairy-Id', warnaDairyId)
      .send({
        embedding: unknownEmbedding,
        organizationId: warnaDairyId,
      });

    assert.equal(unknownRes.status, 200);
    assert.equal(unknownRes.body.matched, false);
  });

  await suite.test('5. Issue D: Collection App Customer Search Enter Key & Directory Lookups', async () => {
    // 1. Lookup by farmerCode C-101
    const searchCodeRes = await request(app)
      .get(`/api/v1/customers?search=${assignedFarmerCode}&organizationId=${warnaDairyId}`)
      .set('Authorization', `Bearer ${dairyAdminToken}`)
      .set('X-Dairy-Id', warnaDairyId);

    assert.equal(searchCodeRes.status, 200);
    assert.equal(searchCodeRes.body.success, true);
    assert.equal(searchCodeRes.body.count, 1);
    assert.equal(searchCodeRes.body.data[0].farmerCode, assignedFarmerCode);
    assert.equal(searchCodeRes.body.data[0].fullName, customerFullName);

    // 2. Lookup by mobileNumber 7755995615
    const searchPhoneRes = await request(app)
      .get(`/api/v1/customers?search=${customerMobile}&organizationId=${warnaDairyId}`)
      .set('Authorization', `Bearer ${dairyAdminToken}`)
      .set('X-Dairy-Id', warnaDairyId);

    assert.equal(searchPhoneRes.status, 200);
    assert.equal(searchPhoneRes.body.count, 1);
    assert.equal(searchPhoneRes.body.data[0].farmerCode, assignedFarmerCode);

    // 3. Lookup by partial name 'Shubhangi'
    const searchNameRes = await request(app)
      .get(`/api/v1/customers?search=Shubhangi&organizationId=${warnaDairyId}`)
      .set('Authorization', `Bearer ${dairyAdminToken}`)
      .set('X-Dairy-Id', warnaDairyId);

    assert.equal(searchNameRes.status, 200);
    assert.equal(searchNameRes.body.count, 1);
    assert.equal(searchNameRes.body.data[0].farmerCode, assignedFarmerCode);

    // 4. Verify search without organizationId parameter but with X-Dairy-Id header succeeds
    const headerSearchRes = await request(app)
      .get(`/api/v1/customers?search=${assignedFarmerCode}`)
      .set('Authorization', `Bearer ${dairyAdminToken}`)
      .set('X-Dairy-Id', warnaDairyId);

    assert.equal(headerSearchRes.status, 200);
    assert.equal(headerSearchRes.body.count, 1);

    // 5. Lookup non-existent customer returns empty list cleanly without 500 error
    const notFoundRes = await request(app)
      .get(`/api/v1/customers?search=NONEXISTENT_9999&organizationId=${warnaDairyId}`)
      .set('Authorization', `Bearer ${dairyAdminToken}`)
      .set('X-Dairy-Id', warnaDairyId);

    assert.equal(notFoundRes.status, 200);
    assert.equal(notFoundRes.body.count, 0);
  });
});
