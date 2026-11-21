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

  await suite.test('3. Guest farmer with unregistered session auto-resolves or self-heals in development', async () => {
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
  });

  await suite.test('4. Development self-healing for unseeded UUID in dev mode (no dead-end 404)', async () => {
    const randomCustId = '77777777-8888-9999-aaaa-bbbbbbbbbbbb';
    const devToken = tokenService.signToken({
      userId: randomCustId,
      organizationId: dairyId,
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
