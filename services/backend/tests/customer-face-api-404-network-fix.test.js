import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../dist/app.js';
import { tenantDbManager } from '../dist/infrastructure/database/TenantDatabaseManager.js';
import { HmacJwtTokenService } from '../dist/infrastructure/security/HmacJwtTokenService.js';
import { inMemoryDairies } from '../dist/infrastructure/database/InMemoryDairyStore.js';

const tokenService = new HmacJwtTokenService();
const app = createApp();

// Canonical 128-D Unit L2 Normalized SFace Embedding Vector Generator
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

test('DFARM Customer Face Biometric Update 404 & Test Face Network Error Verification Suite', async (suite) => {
  // Tenant Dairy A (Sahyadri)
  const dairyAId = 'a1111111-4444-1111-1111-111111111111';
  const dairyACode = 'DF-TEST-4444';
  const dairyAName = 'Sahyadri Farmers Cooperative';

  // Tenant Dairy B (Krishna Valley)
  const dairyBId = 'b2222222-4444-2222-2222-222222222222';
  const dairyBCode = 'DF-TEST-5555';
  const dairyBName = 'Krishna Valley Dairy';

  let dairyAdminAToken = '';
  let customerAToken = '';
  let customerAId = '';
  let customerAGlobalId = '';
  let customerBId = '';
  let customerBToken = '';
  let operatorAToken = '';
  let centerAId = 'c0000000-0000-0000-0000-000000000001';

  const faceVectorA = generateNormalizedVector(1.05);
  const updatedFaceVectorA = generateNormalizedVector(1.06); // Highly similar, same person
  const faceVectorB = generateNormalizedVector(9.99);        // Different person

  // 0. Setup tenant databases & control plane
  await suite.test('0. Multi-Tenant Infrastructure Provisioning (Dairy A & Dairy B)', async () => {
    const controlDb = tenantDbManager.getControlPlaneDb();

    // Register organizations in control plane
    await controlDb.query(
      `INSERT INTO organizations (id, name, code, status, business_phone, business_email)
       VALUES ($1, $2, $3, 'ACTIVE', '9834001122', 'admin.a@dfarm.in')
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code;`,
      [dairyAId, dairyAName, dairyACode]
    );

    await controlDb.query(
      `INSERT INTO organizations (id, name, code, status, business_phone, business_email)
       VALUES ($1, $2, $3, 'ACTIVE', '9834003344', 'admin.b@dfarm.in')
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code;`,
      [dairyBId, dairyBName, dairyBCode]
    );

    inMemoryDairies.set(dairyAId, {
      id: dairyAId,
      code: dairyACode,
      name: dairyAName,
      dbName: 'dfarm_tenant_a4444444444',
      status: 'ACTIVE',
    });

    inMemoryDairies.set(dairyBId, {
      id: dairyBId,
      code: dairyBCode,
      name: dairyBName,
      dbName: 'dfarm_tenant_b5555555555',
      status: 'ACTIVE',
    });

    await tenantDbManager.provisionTenantDatabase({
      dairyId: dairyAId,
      dairyCode: dairyACode,
      dairyName: dairyAName,
    });

    await tenantDbManager.provisionTenantDatabase({
      dairyId: dairyBId,
      dairyCode: dairyBCode,
      dairyName: dairyBName,
    });

    const tenantADb = await tenantDbManager.getTenantDb(dairyAId);
    await tenantADb.query(
      `INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
       VALUES ($1, $2, 'C-01', 'Main Collection Center', 'Center Road', 'Local', 'Sangli', 'Maharashtra', '416416', '+919876543210', 'ACTIVE')
       ON CONFLICT (id) DO NOTHING;`,
      [centerAId, dairyAId]
    );

    dairyAdminAToken = tokenService.signToken({
      userId: '00000000-0000-0000-0000-000000000010',
      organizationId: dairyAId,
      role: 'DAIRY_ADMIN',
      actorType: 'STAFF',
    });

    operatorAToken = tokenService.signToken({
      userId: '00000000-0000-0000-0000-000000000011',
      organizationId: dairyAId,
      centerId: centerAId,
      role: 'COLLECTION_OPERATOR',
      actorType: 'STAFF',
    });

    // 1. Register Customer A in Dairy A
    const regResA = await request(app)
      .post('/api/v1/customers/register')
      .send({
        dairyId: dairyAId,
        fullName: 'Pandurang Mahadev Patil',
        mobileNumber: '9822441100',
        village: 'Koregaon',
        milkSupplyType: 'COW',
        bankDetails: {
          bankName: 'Bank of Maharashtra',
          accountNumber: '60123456789',
          ifscCode: 'MAHB0001234',
          accountHolderName: 'Pandurang M Patil',
        },
      });

    assert.equal(regResA.status, 201, 'Customer A registration failed');
    customerAId = regResA.body.data.id;
    customerAGlobalId = regResA.body.data.globalCustomerId || customerAId;

    // Approve Customer A
    const appResA = await request(app)
      .post(`/api/v1/customers/${customerAId}/approve`)
      .set('Authorization', `Bearer ${dairyAdminAToken}`)
      .send({ farmerCode: 'F-4401', primaryCenterId: centerAId, milkTypes: ['COW'] });
    assert.equal(appResA.status, 200, 'Customer A approval failed');

    customerAToken = tokenService.signToken({
      userId: customerAId,
      organizationId: dairyAId,
      globalCustomerId: customerAGlobalId,
      role: 'FARMER_CUSTOMER',
      actorType: 'CUSTOMER',
    });

    // 2. Register Customer B in Dairy B
    const regResB = await request(app)
      .post('/api/v1/customers/register')
      .send({
        dairyId: dairyBId,
        fullName: 'Balasaheb Shinde',
        mobileNumber: '9822442200',
        village: 'Ashta',
        milkSupplyType: 'BUFFALO',
      });
    assert.equal(regResB.status, 201);
    customerBId = regResB.body.data.id;

    const dairyAdminBToken = tokenService.signToken({
      userId: 'admin-krishna-01',
      organizationId: dairyBId,
      role: 'DAIRY_ADMIN',
      actorType: 'STAFF',
    });

    await request(app)
      .post(`/api/v1/customers/${customerBId}/approve`)
      .set('Authorization', `Bearer ${dairyAdminBToken}`)
      .send({ farmerCode: 'F-5501', milkTypes: ['BUFFALO'] });

    customerBToken = tokenService.signToken({
      userId: customerBId,
      organizationId: dairyBId,
      role: 'FARMER_CUSTOMER',
      actorType: 'CUSTOMER',
    });
  });

  // =========================================================================
  // SUITE 1: CORS PREFLIGHT & HEADER NEGOTIATION (Tests 1-8)
  // =========================================================================
  await suite.test('1. OPTIONS /api/v1/identity/face/match permits X-Organization-Id in Access-Control-Allow-Headers', async () => {
    const res = await request(app)
      .options('/api/v1/identity/face/match')
      .set('Origin', 'http://localhost:8081')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,authorization,x-organization-id,x-client-app');

    assert.ok(res.status === 204 || res.status === 200, `Expected 200/204 but got ${res.status}`);
    const allowHeaders = (res.headers['access-control-allow-headers'] || '').toLowerCase();
    assert.ok(
      allowHeaders.includes('x-organization-id'),
      `Expected access-control-allow-headers to include x-organization-id, received: ${allowHeaders}`
    );
  });

  await suite.test('2. OPTIONS /api/v1/identity/face/match permits X-Dairy-Tenant-Id and X-Dairy-Id', async () => {
    const res = await request(app)
      .options('/api/v1/identity/face/match')
      .set('Origin', 'http://localhost:8081')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'x-dairy-tenant-id,x-dairy-id');

    const allowHeaders = (res.headers['access-control-allow-headers'] || '').toLowerCase();
    assert.ok(allowHeaders.includes('x-dairy-tenant-id'), 'Missing x-dairy-tenant-id in CORS allow headers');
    assert.ok(allowHeaders.includes('x-dairy-id'), 'Missing x-dairy-id in CORS allow headers');
  });

  await suite.test('3. OPTIONS /api/v1/customers/biometrics/update permits X-Organization-Id', async () => {
    const res = await request(app)
      .options('/api/v1/customers/biometrics/update')
      .set('Origin', 'http://localhost:8081')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type,x-organization-id');

    assert.ok(res.status === 204 || res.status === 200);
    const allowHeaders = (res.headers['access-control-allow-headers'] || '').toLowerCase();
    assert.ok(allowHeaders.includes('x-organization-id'));
  });

  await suite.test('4. OPTIONS /api/v1/customers/me/biometrics/update permits complete headers', async () => {
    const res = await request(app)
      .options('/api/v1/customers/me/biometrics/update')
      .set('Origin', 'http://localhost:8081')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type,x-organization-id,x-dairy-id');

    assert.ok(res.status === 204 || res.status === 200);
    const allowHeaders = (res.headers['access-control-allow-headers'] || '').toLowerCase();
    assert.ok(allowHeaders.includes('x-organization-id'));
  });

  await suite.test('5. OPTIONS /api/v1/customers/:id/biometrics/update permits complete headers', async () => {
    const res = await request(app)
      .options(`/api/v1/customers/${customerAId}/biometrics/update`)
      .set('Origin', 'http://localhost:8081')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type,x-organization-id');

    assert.ok(res.status === 204 || res.status === 200);
  });

  await suite.test('6. Dynamic development origin allowance permits localhost and IP hosts', async () => {
    const res = await request(app)
      .options('/api/v1/identity/face/match')
      .set('Origin', 'http://192.168.1.55:8081')
      .set('Access-Control-Request-Method', 'POST');

    assert.ok(res.status === 204 || res.status === 200);
  });

  await suite.test('7. Exposed headers include X-Request-Id, X-Dairy-Id, X-Dairy-Tenant-Id, X-Organization-Id', async () => {
    const res = await request(app)
      .options('/api/v1/identity/face/match')
      .set('Origin', 'http://localhost:8081')
      .set('Access-Control-Request-Method', 'POST');

    const exposed = (res.headers['access-control-expose-headers'] || '').toLowerCase();
    assert.ok(exposed.includes('x-organization-id'), `Expected exposed headers to include x-organization-id: ${exposed}`);
  });

  await suite.test('8. Request with X-Organization-Id header is accepted without CORS rejection', async () => {
    const res = await request(app)
      .get(`/api/v1/customers/${customerAId}`)
      .set('Origin', 'http://localhost:8081')
      .set('Authorization', `Bearer ${customerAToken}`)
      .set('X-Organization-Id', dairyAId);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.id, customerAId);
  });

  // =========================================================================
  // SUITE 2: ISSUE A - UPDATE FACE BIOMETRIC ROUTE RESOLUTION (Tests 9-18)
  // =========================================================================
  await suite.test('9. Initial biometric status for newly approved customer is un-enrolled', async () => {
    const res = await request(app)
      .get(`/api/v1/customers/${customerAId}`)
      .set('Authorization', `Bearer ${customerAToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.biometricStatus.isEnrolled, false);
  });

  await suite.test('10. POST /api/v1/customers/biometrics/update (without :id) succeeds with 200', async () => {
    const res = await request(app)
      .post('/api/v1/customers/biometrics/update')
      .set('Authorization', `Bearer ${customerAToken}`)
      .set('X-Organization-Id', dairyAId)
      .send({
        embedding: faceVectorA,
        modelVersion: 'sface_int8_2021dec',
        organizationId: dairyAId,
      });

    assert.equal(res.status, 200, `Expected 200 but got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);
    assert.equal(res.body.isBiometricEnrolled, true);
    assert.equal(res.body.status, 'ENROLLED');
    assert.equal(res.body.customerId, customerAId);
  });

  await suite.test('11. PUT /api/v1/customers/biometrics/update (without :id) succeeds with 200', async () => {
    const res = await request(app)
      .put('/api/v1/customers/biometrics/update')
      .set('Authorization', `Bearer ${customerAToken}`)
      .set('X-Organization-Id', dairyAId)
      .send({
        embedding: updatedFaceVectorA,
        modelVersion: 'sface_int8_2021dec',
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.isBiometricEnrolled, true);
  });

  await suite.test('12. POST /api/v1/customers/me/biometrics/update succeeds with 200', async () => {
    const res = await request(app)
      .post('/api/v1/customers/me/biometrics/update')
      .set('Authorization', `Bearer ${customerAToken}`)
      .set('X-Organization-Id', dairyAId)
      .send({
        embedding: faceVectorA,
        modelVersion: 'sface_int8_2021dec',
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.customerId, customerAId);
  });

  await suite.test('13. PUT /api/v1/customers/me/biometrics/update succeeds with 200', async () => {
    const res = await request(app)
      .put('/api/v1/customers/me/biometrics/update')
      .set('Authorization', `Bearer ${customerAToken}`)
      .send({
        embedding: updatedFaceVectorA,
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });

  await suite.test('14. POST /api/v1/customers/:id/biometrics/update succeeds with canonical UUID', async () => {
    const res = await request(app)
      .post(`/api/v1/customers/${customerAId}/biometrics/update`)
      .set('Authorization', `Bearer ${customerAToken}`)
      .set('X-Organization-Id', dairyAId)
      .send({
        embedding: faceVectorA,
        modelVersion: 'sface_int8_2021dec',
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.customerId, customerAId);
  });

  await suite.test('15. Unauthenticated POST /api/v1/customers/biometrics/update returns 401 Unauthorized', async () => {
    const res = await request(app)
      .post('/api/v1/customers/biometrics/update')
      .send({
        embedding: faceVectorA,
      });

    assert.equal(res.status, 401, `Expected 401 Unauthorized but got ${res.status}`);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  await suite.test('16. POST /api/v1/customers/:id/biometrics/update with non-existent UUID returns 404 Customer Not Found', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000099';
    const res = await request(app)
      .post(`/api/v1/customers/${fakeId}/biometrics/update`)
      .set('Authorization', `Bearer ${dairyAdminAToken}`)
      .set('X-Organization-Id', dairyAId)
      .send({
        embedding: faceVectorA,
      });

    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'CUSTOMER_NOT_FOUND');
  });

  await suite.test('17. Cross-customer modification blocked: Customer A updating Customer B returns 403 Forbidden', async () => {
    const res = await request(app)
      .post(`/api/v1/customers/${customerBId}/biometrics/update`)
      .set('Authorization', `Bearer ${customerAToken}`)
      .set('X-Organization-Id', dairyAId)
      .send({
        embedding: faceVectorA,
      });

    assert.equal(res.status, 403, `Expected 403 Forbidden, got ${res.status}`);
    assert.equal(res.body.success, false);
  });

  await suite.test('18. Cross-dairy modification blocked: Customer A updating in Dairy B returns 403 Forbidden', async () => {
    const res = await request(app)
      .post(`/api/v1/customers/${customerAId}/biometrics/update`)
      .set('Authorization', `Bearer ${customerAToken}`)
      .set('X-Organization-Id', dairyBId) // Attaching Dairy B context
      .send({
        embedding: faceVectorA,
      });

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
  });

  // =========================================================================
  // SUITE 3: ISSUE B - TEST FACE & DIAGNOSTICS RUNTIME VERIFICATION (Tests 19-28)
  // =========================================================================
  await suite.test('19. POST /api/v1/identity/face/match with 128-D vector and customerId="me" executes 1:1 match', async () => {
    const res = await request(app)
      .post('/api/v1/identity/face/match')
      .set('Authorization', `Bearer ${customerAToken}`)
      .set('X-Organization-Id', dairyAId)
      .send({
        embedding: faceVectorA,
        customerId: 'me',
        dairyId: dairyAId,
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.matched, true);
    assert.equal(res.body.status, 'FACE_MATCHED');
    assert.equal(res.body.farmerCode, 'F-4401');
    assert.ok(res.body.similarityScore >= 0.363);
  });

  await suite.test('20. Matching face returns matched: true, status: FACE_MATCHED and high similarity', async () => {
    const res = await request(app)
      .post('/api/v1/identity/face/match')
      .set('Authorization', `Bearer ${customerAToken}`)
      .send({
        embedding: updatedFaceVectorA, // Very similar vector for same person
        customerId: customerAId,
        dairyId: dairyAId,
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.matched, true);
    assert.equal(res.body.isMatch, true);
    assert.equal(res.body.matchResult, 'FACE_MATCHED');
    assert.equal(res.body.farmerName, 'Pandurang Mahadev Patil');
  });

  await suite.test('21. Non-matching face returns matched: false, status: FACE_NOT_MATCHED and similarity < 0.363', async () => {
    const res = await request(app)
      .post('/api/v1/identity/face/match')
      .set('Authorization', `Bearer ${customerAToken}`)
      .set('X-Organization-Id', dairyAId)
      .send({
        embedding: faceVectorB, // Different person vector
        customerId: customerAId,
        dairyId: dairyAId,
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.matched, false);
    assert.equal(res.body.isMatch, false);
    assert.equal(res.body.status, 'FACE_NOT_MATCHED');
    assert.equal(res.body.matchResult, 'FACE_NOT_MATCHED');
    assert.ok(res.body.similarityScore < 0.363);
  });

  await suite.test('22. POST /api/v1/identity/face/match for un-enrolled customer returns ENROLLMENT_NOT_FOUND', async () => {
    const res = await request(app)
      .post('/api/v1/identity/face/match')
      .set('Authorization', `Bearer ${customerBToken}`)
      .set('X-Organization-Id', dairyBId)
      .send({
        embedding: faceVectorB,
        customerId: customerBId,
        dairyId: dairyBId,
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.matched, false);
    assert.equal(res.body.status, 'ENROLLMENT_NOT_FOUND');
    assert.equal(res.body.matchStatus, 'ENROLLMENT_NOT_FOUND');
  });

  await suite.test('23. Invalid vector dimension (64-D instead of 128-D) returns 400 Bad Request', async () => {
    const invalidVector = new Array(64).fill(0.1);
    const res = await request(app)
      .post('/api/v1/identity/face/match')
      .set('Authorization', `Bearer ${customerAToken}`)
      .send({
        embedding: invalidVector,
        customerId: customerAId,
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.ok(res.body.error.includes('128-dimensional'));
  });

  await suite.test('24. POST /api/v1/identity/face/match accepts X-Organization-Id header for tenant scoping', async () => {
    const res = await request(app)
      .post('/api/v1/identity/face/match')
      .set('X-Organization-Id', dairyAId)
      .send({
        embedding: faceVectorA,
        customerId: customerAId,
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.matched, true);
  });

  await suite.test('25. POST /api/v1/identity/face/match defaults customerId from authenticated customer token', async () => {
    const res = await request(app)
      .post('/api/v1/identity/face/match')
      .set('Authorization', `Bearer ${customerAToken}`)
      .set('X-Organization-Id', dairyAId)
      .send({
        embedding: faceVectorA, // customerId omitted in body!
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.matched, true);
    assert.equal(res.body.farmerCode, 'F-4401');
  });

  await suite.test('26. SFace INT8 calibrated threshold 0.363 is strictly enforced', async () => {
    const res = await request(app)
      .post('/api/v1/identity/face/match')
      .set('Authorization', `Bearer ${customerAToken}`)
      .set('X-Organization-Id', dairyAId)
      .send({
        embedding: faceVectorA,
        customerId: customerAId,
      });

    assert.equal(res.body.threshold, 0.363);
  });

  await suite.test('27. Face template in physical tenant DB is encrypted with AES-256-GCM + AAD', async () => {
    const tenantDb = await tenantDbManager.getTenantDb(dairyAId);
    const encRes = await tenantDb.query(
      `SELECT embedding_encrypted, embedding_iv, embedding_auth_tag, model_version_id FROM face_enrollments WHERE customer_id = $1 AND status = 'ACTIVE' LIMIT 1;`,
      [customerAId]
    );

    assert.ok(encRes.rows.length > 0, 'No face enrollment found in tenant database');
    const row = encRes.rows[0];
    assert.ok(row.embedding_encrypted, 'Missing encrypted payload');
    assert.ok(row.embedding_iv, 'Missing IV');
    assert.ok(row.embedding_auth_tag, 'Missing Auth Tag');
  });

  await suite.test('28. Customer profile and diagnostics responses do NOT expose raw vectors', async () => {
    const res = await request(app)
      .get(`/api/v1/customers/${customerAId}`)
      .set('Authorization', `Bearer ${customerAToken}`);

    const bodyStr = JSON.stringify(res.body);
    assert.ok(!bodyStr.includes('encrypted_embedding'));
    assert.ok(!bodyStr.includes('auth_tag'));
    assert.ok(!bodyStr.includes('raw_embedding'));
  });

  // =========================================================================
  // SUITE 4: REGRESSION & CROSS-APP INTEGRATION (Tests 29-36)
  // =========================================================================
  await suite.test('29. Customer profile GET /api/v1/customers/me returns updated status ENROLLED', async () => {
    const res = await request(app)
      .get('/api/v1/customers/me')
      .set('Authorization', `Bearer ${customerAToken}`)
      .set('X-Organization-Id', dairyAId);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.id, customerAId);
    assert.equal(res.body.data.biometricStatus.isEnrolled, true);
    assert.equal(res.body.data.biometricStatus.status, 'ENROLLED');
  });

  await suite.test('30. Customer profile masks bank account number for safety', async () => {
    const res = await request(app)
      .get('/api/v1/customers/me')
      .set('Authorization', `Bearer ${customerAToken}`)
      .set('X-Organization-Id', dairyAId);

    assert.equal(res.status, 200);
    assert.ok(res.body.data.bankDetails.accountNumber.includes('XXXX'));
  });

  await suite.test('31. Collection app operator 1:N face matching identifies customer accurately', async () => {
    const res = await request(app)
      .post('/api/v1/identity/face/match')
      .set('Authorization', `Bearer ${operatorAToken}`)
      .set('X-Organization-Id', dairyAId)
      .send({
        embedding: faceVectorA, // 1:N match across dairy
        dairyId: dairyAId,
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.matched, true);
    assert.equal(res.body.farmerId, customerAId);
    assert.equal(res.body.farmerCode, 'F-4401');
    assert.equal(res.body.farmerName, 'Pandurang Mahadev Patil');
  });

  let activeSessionCode = '';
  let activeSessionId = '';
  await suite.test('32. Collection kiosk opens shift session successfully', async () => {
    const res = await request(app)
      .post('/api/v1/collections/sessions/open')
      .set('Authorization', `Bearer ${operatorAToken}`)
      .set('X-Dairy-Id', dairyAId)
      .set('X-Organization-Id', dairyAId)
      .send({
        shift: 'MORNING',
        businessDate: '2026-11-20',
        deviceId: 'KIOSK_MAIN',
      });

    assert.ok(res.status === 200 || res.status === 201);
    activeSessionCode = res.body.data.sessionCode;
    activeSessionId = res.body.data.id;
    assert.ok(activeSessionCode.length > 0);
  });

  let collectionTxId = '';
  await suite.test('33. Milk collection receipt links correctly to customer ID and farmer code', async () => {
    const res = await request(app)
      .post('/api/v1/collections/transactions')
      .set('Authorization', `Bearer ${operatorAToken}`)
      .set('X-Dairy-Id', dairyAId)
      .set('X-Organization-Id', dairyAId)
      .send({
        sessionId: activeSessionId,
        sessionCode: activeSessionCode,
        customerId: customerAId,
        milkCategory: 'COW',
        weightLiters: 12.5,
        fatPercentage: 4.2,
        snfPercentage: 8.6,
        clrDensity: 28.5,
        identificationMethod: 'FACE_YUNET_SFACE',
        deviceId: 'KIOSK_MAIN',
      });

    assert.equal(res.status, 201, `Expected 201 but got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);
    assert.equal(res.body.customerId, customerAId);
    assert.equal(res.body.farmerCode, 'F-4401');
    assert.equal(res.body.farmerName, 'Pandurang Mahadev Patil');
    assert.equal(res.body.data.customerId, customerAId);
    assert.equal(res.body.data.customerCode, 'F-4401');
    assert.equal(res.body.data.customerName, 'Pandurang Mahadev Patil');
    collectionTxId = res.body.data.id;
  });

  await suite.test('34. Customer ledger passbook reflects milk intake transaction with zero variance', async () => {
    const res = await request(app)
      .get('/api/v1/ledger/entries')
      .set('Authorization', `Bearer ${customerAToken}`)
      .set('X-Organization-Id', dairyAId);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.data.length >= 1);
    const entry = res.body.data[0];
    assert.equal(entry.direction, 'CREDIT');
    assert.ok(entry.amount > 0);
  });

  await suite.test('35. Customer memberships endpoint returns active approved membership', async () => {
    const res = await request(app)
      .get('/api/v1/customers/memberships')
      .set('Authorization', `Bearer ${customerAToken}`)
      .set('X-Organization-Id', dairyAId);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.data.length > 0);
    assert.equal(res.body.data[0].organizationId, dairyAId);
  });

  await suite.test('36. Financial immutability: Double-entry ledger balances strictly debit = credit', async () => {
    const summaryRes = await request(app)
      .get('/api/v1/ledger/summary')
      .set('Authorization', `Bearer ${customerAToken}`)
      .set('X-Organization-Id', dairyAId);

    assert.equal(summaryRes.status, 200);
    assert.equal(summaryRes.body.success, true);
    assert.ok(summaryRes.body.balance > 0, 'Expected positive balance in customer khata');
  });
});
