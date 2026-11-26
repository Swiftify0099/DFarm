import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../dist/app.js';
import { tenantDbManager } from '../dist/infrastructure/database/TenantDatabaseManager.js';
import { HmacJwtTokenService } from '../dist/infrastructure/security/HmacJwtTokenService.js';

const tokenService = new HmacJwtTokenService();
const app = createApp();

function generateNormalizedVector(seed = 1) {
  const vec = [];
  let sumSq = 0;
  for (let i = 0; i < 128; i++) {
    const val = Math.sin((i + 1) * seed) * Math.cos((i + 3) * 0.5);
    vec.push(val);
    sumSq += val * val;
  }
  const norm = Math.sqrt(sumSq);
  return vec.map((v) => v / norm);
}

test('Customer Face Biometrics Update 404 Resolution Suite', async (suite) => {
  const dairyId = '38918630-4fee-4cec-96ea-a3a899aae7bc';
  const customerId = 'ccd1cd2d-64f9-4650-9d38-d3373aa89eca';
  const globalId = 'ccd1cd2d-64f9-4650-9d38-d3373aa89ec0';
  const phone = '+917755995615';

  const customerToken = tokenService.signToken({
    userId: customerId,
    organizationId: dairyId,
    globalCustomerId: globalId,
    role: 'FARMER_CUSTOMER',
    actorType: 'CUSTOMER',
  });

  const guestToken = tokenService.signToken({
    userId: `unregistered:${phone}`,
    globalCustomerId: globalId,
    role: 'GUEST_FARMER',
    actorType: 'CUSTOMER',
  });

  const faceEmbedding = generateNormalizedVector(42);

  await suite.test('0. Setup: Provision tenant DB and seed authoritative farmer + center records', async () => {
    const { db } = await import('../dist/infrastructure/database/PostgresPool.js');
    await db.query(
      `INSERT INTO organizations (id, name, code, status) VALUES ($1, 'BioTest Dairy', 'BIO-389', 'ACTIVE') ON CONFLICT (id) DO NOTHING;`,
      [dairyId]
    );
    await tenantDbManager.provisionTenantDatabase({
      dairyId,
      dairyCode: 'BIO-389',
      dairyName: 'BioTest Dairy',
    });
    const tenantDb = await tenantDbManager.getStrictTenantDb(dairyId);
    await tenantDb.query(
      `INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
       VALUES ('38918630-4fee-4cec-96ea-a3a899aae701', $1, 'C-01', 'Warna Main Center', 'Main Road', 'Kavathe Piran', 'Sangli', 'Maharashtra', '416417', '+919834388787', 'ACTIVE')
       ON CONFLICT (id) DO NOTHING;`,
      [dairyId]
    );
    await db.query(
      `INSERT INTO global_customer_identities (id, normalized_mobile_number, phone_verified_at)
       VALUES ($1, $2, NOW()) ON CONFLICT (normalized_mobile_number) DO NOTHING;`,
      [globalId, phone]
    );
    await db.query(
      `INSERT INTO customer_dairy_memberships (id, global_customer_id, organization_id, tenant_customer_id, farmer_code, customer_name, membership_status)
       VALUES ('38918630-4fee-4cec-96ea-a3a899aa0001', $1, $2, $3, 'F-101', 'Pandurang Patil', 'APPROVED')
       ON CONFLICT DO NOTHING;`,
      [globalId, dairyId, customerId]
    );
    await tenantDb.query(
      `INSERT INTO users (id, organization_id, username, full_name, phone_number, role, status)
       VALUES ('00000000-0000-0000-0000-000000000099', $1, 'bio_staff', 'Bio Staff', '+919800000099', 'COLLECTION_OPERATOR', 'ACTIVE')
       ON CONFLICT (id) DO NOTHING;`,
      [dairyId]
    );
    await tenantDb.query(
      `INSERT INTO customers (
         id, organization_id, primary_center_id, farmer_code, full_name,
         normalized_mobile_number, status, registration_status, is_deleted, global_customer_id
       ) VALUES (
         $1, $2, '38918630-4fee-4cec-96ea-a3a899aae701', 'F-101', 'Pandurang Patil',
         $3, 'ACTIVE', 'APPROVED', FALSE, $4
       ) ON CONFLICT (id) DO NOTHING;`,
      [customerId, dairyId, phone, globalId]
    );
  });

  await suite.test('1. Explicit customerId POST /customers/:id/biometrics/update succeeds (no 404)', async () => {
    const res = await request(app)
      .post(`/api/v1/customers/${customerId}/biometrics/update`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('x-organization-id', dairyId)
      .send({
        embedding: faceEmbedding,
        modelVersion: 'sface_int8_2021dec',
        organizationId: dairyId,
      });

    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);
    assert.equal(res.body.isBiometricEnrolled, true);
    assert.equal(res.body.status, 'ENROLLED');
    assert.equal(res.body.biometricStatus?.status, 'ENROLLED');
  });

  await suite.test('2. "me" alias POST /customers/me/biometrics/update succeeds (no 404)', async () => {
    const updatedEmbedding = generateNormalizedVector(43);
    const res = await request(app)
      .post('/api/v1/customers/me/biometrics/update')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('x-organization-id', dairyId)
      .send({
        embedding: updatedEmbedding,
        modelVersion: 'sface_int8_2021dec',
        organizationId: dairyId,
      });

    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);
    assert.equal(res.body.isBiometricEnrolled, true);
  });

  await suite.test('3. Unregistered guest session resolves existing registered farmer via verified phone or rejects unregistered (DF-015 no fake auto-provisioning)', async () => {
    const guestEmbedding = generateNormalizedVector(44);
    const res = await request(app)
      .post('/api/v1/customers/me/biometrics/update')
      .set('Authorization', `Bearer ${guestToken}`)
      .set('x-organization-id', dairyId)
      .send({
        embedding: guestEmbedding,
        modelVersion: 'sface_int8_2021dec',
        organizationId: dairyId,
      });

    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);

    const unregisteredPhone = '+917755000099';
    const { db } = await import('../dist/infrastructure/database/PostgresPool.js');
    await db.query(
      `INSERT INTO global_customer_identities (id, normalized_mobile_number, phone_verified_at)
       VALUES ('38918630-4fee-4cec-96ea-a3a899aa0099', $1, NOW()) ON CONFLICT (normalized_mobile_number) DO NOTHING;`,
      [unregisteredPhone]
    );
    const trulyUnregisteredToken = tokenService.signToken({
      userId: `unregistered:${unregisteredPhone}`,
      globalCustomerId: '38918630-4fee-4cec-96ea-a3a899aa0099',
      role: 'GUEST_FARMER',
      actorType: 'CUSTOMER',
    });
    const unregRes = await request(app)
      .post('/api/v1/customers/me/biometrics/update')
      .set('Authorization', `Bearer ${trulyUnregisteredToken}`)
      .set('x-organization-id', dairyId)
      .send({
        embedding: guestEmbedding,
        modelVersion: 'sface_int8_2021dec',
        organizationId: dairyId,
      });
    assert.equal(unregRes.status, 404);
  });

  await suite.test('4. Unmapped customer UUID rejected 401; explicitly seeded tenant customer succeeds without route auto-provisioning', async () => {
    const unmappedToken = tokenService.signToken({
      userId: '77777777-8888-9999-aaaa-ffffffffffff',
      organizationId: dairyId,
      role: 'FARMER_CUSTOMER',
      actorType: 'CUSTOMER',
    });
    const unmappedRes = await request(app)
      .post('/api/v1/customers/77777777-8888-9999-aaaa-ffffffffffff/biometrics/update')
      .set('Authorization', `Bearer ${unmappedToken}`)
      .set('x-organization-id', dairyId)
      .send({ embedding: faceEmbedding, modelVersion: 'sface_int8_2021dec', organizationId: dairyId });
    assert.equal(unmappedRes.status, 401);

    const randomCustId = '77777777-8888-9999-aaaa-bbbbbbbbbbbb';
    const { db } = await import('../dist/infrastructure/database/PostgresPool.js');
    await db.query(
      `INSERT INTO organizations (id, name, code, status) VALUES ($1, 'BioTest Dairy', 'BIO-389', 'ACTIVE') ON CONFLICT (id) DO NOTHING;`,
      [dairyId]
    );
    await db.query(
      `INSERT INTO global_customer_identities (id, normalized_mobile_number, phone_verified_at)
       VALUES ('77777777-8888-9999-aaaa-bbbbbbbbbbb0', '+917755995699', NOW()) ON CONFLICT (normalized_mobile_number) DO NOTHING;`
    );
    await db.query(
      `INSERT INTO customer_dairy_memberships (id, global_customer_id, organization_id, tenant_customer_id, farmer_code, customer_name, membership_status)
       VALUES ('77777777-8888-9999-aaaa-bbbbbbbbbbb1', '77777777-8888-9999-aaaa-bbbbbbbbbbb0', $1, $2, 'F-HEAL1', 'Self Heal Farmer', 'APPROVED')
       ON CONFLICT DO NOTHING;`,
      [dairyId, randomCustId]
    );
    const tenantDb = await tenantDbManager.getTenantDb(dairyId);
    await tenantDb.query(
      `INSERT INTO customers (
         id, organization_id, primary_center_id, farmer_code, full_name,
         normalized_mobile_number, status, registration_status, is_deleted, global_customer_id
       ) VALUES (
         $1, $2, '38918630-4fee-4cec-96ea-a3a899aae701', 'F-HEAL1', 'Self Heal Farmer',
         '+917755995699', 'ACTIVE', 'APPROVED', FALSE, '77777777-8888-9999-aaaa-bbbbbbbbbbb0'
       ) ON CONFLICT (id) DO NOTHING;`,
      [randomCustId, dairyId]
    );

    const devToken = tokenService.signToken({
      userId: randomCustId,
      organizationId: dairyId,
      globalCustomerId: '77777777-8888-9999-aaaa-bbbbbbbbbbb0',
      role: 'FARMER_CUSTOMER',
      actorType: 'CUSTOMER',
    });

    const res = await request(app)
      .post(`/api/v1/customers/${randomCustId}/biometrics/update`)
      .set('Authorization', `Bearer ${devToken}`)
      .set('x-organization-id', dairyId)
      .send({
        embedding: faceEmbedding,
        modelVersion: 'sface_int8_2021dec',
        organizationId: dairyId,
      });

    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);
    assert.equal(res.body.isBiometricEnrolled, true);

    // Centrally mapped membership WITHOUT tenant customer record must return 404 (no fake customer auto-provisioning)
    const missingTenantCustId = '77777777-8888-9999-aaaa-cccccccccccc';
    await db.query(
      `INSERT INTO global_customer_identities (id, normalized_mobile_number, phone_verified_at)
       VALUES ('77777777-8888-9999-aaaa-ccccccccccc0', '+917755995688', NOW()) ON CONFLICT (normalized_mobile_number) DO NOTHING;`
    );
    await db.query(
      `INSERT INTO customer_dairy_memberships (id, global_customer_id, organization_id, tenant_customer_id, farmer_code, customer_name, membership_status)
       VALUES ('77777777-8888-9999-aaaa-ccccccccccc1', '77777777-8888-9999-aaaa-ccccccccccc0', $1, $2, 'F-MISS1', 'Missing Tenant Farmer', 'APPROVED')
       ON CONFLICT DO NOTHING;`,
      [dairyId, missingTenantCustId]
    );
    const missingToken = tokenService.signToken({
      userId: missingTenantCustId,
      organizationId: dairyId,
      globalCustomerId: '77777777-8888-9999-aaaa-ccccccccccc0',
      role: 'FARMER_CUSTOMER',
      actorType: 'CUSTOMER',
    });
    const missingRes = await request(app)
      .post(`/api/v1/customers/${missingTenantCustId}/biometrics/update`)
      .set('Authorization', `Bearer ${missingToken}`)
      .set('x-organization-id', dairyId)
      .send({
        embedding: faceEmbedding,
        modelVersion: 'sface_int8_2021dec',
        organizationId: dairyId,
      });
    assert.equal(missingRes.status, 404);
  });

  await suite.test('5. Verify AES-256-GCM encryption in tenant DB face_enrollments', async () => {
    const tenantDb = await tenantDbManager.getTenantDb(dairyId);
    const rows = await tenantDb.query(
      `SELECT embedding_encrypted, embedding_iv, embedding_auth_tag, status
       FROM face_enrollments
       WHERE customer_id = $1 AND status = 'ACTIVE' LIMIT 1;`,
      [customerId]
    );

    assert.ok(rows.rows.length > 0, 'Face enrollment row should exist in tenant DB');
    const row = rows.rows[0];
    assert.ok(row.embedding_encrypted, 'Encrypted embedding should be populated');
    assert.ok(row.embedding_iv, 'IV should be populated');
    assert.ok(row.embedding_auth_tag, 'Auth tag should be populated');
    assert.equal(row.status, 'ACTIVE');
  });

  await suite.test('6. Profile read-back GET /customers/me returns updated status', async () => {
    const res = await request(app)
      .get('/api/v1/customers/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('x-organization-id', dairyId);

    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.id, customerId);
    assert.equal(res.body.data.isBiometricEnrolled, true);
  });
});
