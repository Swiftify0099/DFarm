import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../dist/app.js';
import { tenantDbManager } from '../dist/infrastructure/database/TenantDatabaseManager.js';
import { HmacJwtTokenService } from '../dist/infrastructure/security/HmacJwtTokenService.js';
import { inMemoryDairies } from '../dist/infrastructure/database/InMemoryDairyStore.js';

const tokenService = new HmacJwtTokenService();
const app = createApp();

// Canonical 128-D Unit L2 Normalized SFace Embedding Vectors
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

function averageVectors(vectors) {
  const dim = vectors[0].length;
  const acc = new Array(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) acc[i] += v[i];
  }
  const avg = acc.map((v) => v / vectors.length);
  let sumSq = 0;
  for (let i = 0; i < dim; i++) sumSq += avg[i] * avg[i];
  const norm = Math.sqrt(sumSq);
  return avg.map((v) => v / norm);
}

test('DFARM End-to-End Biometric Pipeline & Multi-Tenant Database Isolation Suite', async (suite) => {
  // Tenant Dairy A (Warna)
  const dairyAId = '38918630-4fee-4cec-96ea-a3a899aae7bc';
  const dairyACode = 'DF-SAN-2395';
  const dairyAName = "Warna Milk's";

  // Tenant Dairy B (Rajhans)
  const dairyBId = '88888888-8888-8888-8888-888888888888';
  const dairyBCode = 'DF-KOL-8888';
  const dairyBName = 'Rajhans Dairy Cooperative';

  let dairyAdminAToken = '';
  let dairyAdminBToken = '';
  let customerAId = '';
  let customerAToken = '';
  let customerBId = '';

  const customerAFiveSamples = [
    generateNormalizedVector(1.01),
    generateNormalizedVector(1.02),
    generateNormalizedVector(1.03),
    generateNormalizedVector(1.04),
    generateNormalizedVector(1.05),
  ];
  const customerAAveragedTemplate = averageVectors(customerAFiveSamples);
  const customerBTemplate = generateNormalizedVector(7.77);
  const unknownProbe = generateNormalizedVector(99.99);

  await suite.test('1. Multi-Tenant Infrastructure Provisioning (Dairy A & Dairy B)', async () => {
    const controlDb = tenantDbManager.getControlPlaneDb();

    // Register organizations in control plane
    await controlDb.query(
      `INSERT INTO organizations (id, name, code, status, business_phone, business_email)
       VALUES ($1, $2, $3, 'ACTIVE', '9834388787', 'admin.a@dfarm.in')
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code;`,
      [dairyAId, dairyAName, dairyACode]
    );

    await controlDb.query(
      `INSERT INTO organizations (id, name, code, status, business_phone, business_email)
       VALUES ($1, $2, $3, 'ACTIVE', '9834388788', 'admin.b@dfarm.in')
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code;`,
      [dairyBId, dairyBName, dairyBCode]
    );

    inMemoryDairies.set(dairyAId, {
      id: dairyAId,
      code: dairyACode,
      name: dairyAName,
      status: 'active',
      primaryAdminMobile: '9834388787',
      primaryAdminName: 'Admin A',
      contact: { businessPhone: '9834388787', businessEmail: 'admin.a@dfarm.in' },
      location: { addressLine1: 'Kavathe Piran', district: 'Sangli', state: 'Maharashtra', pincode: '416417' },
    });

    inMemoryDairies.set(dairyBId, {
      id: dairyBId,
      code: dairyBCode,
      name: dairyBName,
      status: 'active',
      primaryAdminMobile: '9834388788',
      primaryAdminName: 'Admin B',
      contact: { businessPhone: '9834388788', businessEmail: 'admin.b@dfarm.in' },
      location: { addressLine1: 'Kolhapur Road', district: 'Kolhapur', state: 'Maharashtra', pincode: '416001' },
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

    dairyAdminAToken = tokenService.signToken({
      userId: 'admin-a',
      role: 'DAIRY_ADMIN',
      organizationId: dairyAId,
      actorType: 'STAFF',
    });

    dairyAdminBToken = tokenService.signToken({
      userId: 'admin-b',
      role: 'DAIRY_ADMIN',
      organizationId: dairyBId,
      actorType: 'STAFF',
    });

    assert.ok(dairyAdminAToken);
    assert.ok(dairyAdminBToken);
  });

  await suite.test('2. Customer Registration & Dairy Admin Approval Lifecycle', async () => {
    // Register Customer A in Dairy A
    const regResA = await request(app)
      .post('/api/v1/customers/register')
      .send({
        selectedDairyId: dairyAId,
        organizationId: dairyAId,
        fullName: 'Santosh Popat Patil',
        village: 'Kavathe Piran',
        mobileNumber: '9123456781',
        milkSupplyType: 'BUFFALO',
        biometricConsent: true,
      });

    assert.strictEqual(regResA.status, 201);
    assert.strictEqual(regResA.body.success, true);
    customerAId = regResA.body.customerUuid || regResA.body.data?.id || regResA.body.data?.customerId;
    assert.ok(customerAId);

    // Approve Customer A with Farmer Code C-201
    const approveResA = await request(app)
      .post(`/api/v1/customers/${customerAId}/approve`)
      .set('Authorization', `Bearer ${dairyAdminAToken}`)
      .send({
        farmerCode: 'C-201',
        permittedCategories: ['BUFFALO'],
      })
      .expect(200);

    assert.strictEqual(approveResA.body.data.status, 'ACTIVE');
    assert.strictEqual(approveResA.body.data.farmerCode, 'C-201');

    // Register Customer B in Dairy B
    const regResB = await request(app)
      .post('/api/v1/customers/register')
      .send({
        selectedDairyId: dairyBId,
        organizationId: dairyBId,
        fullName: 'Balu Tanaji Jadhav',
        village: 'Shiroli',
        mobileNumber: '9123456782',
        milkSupplyType: 'COW',
        biometricConsent: true,
      });

    assert.strictEqual(regResB.status, 201);
    assert.strictEqual(regResB.body.success, true);
    customerBId = regResB.body.customerUuid || regResB.body.data?.id || regResB.body.data?.customerId;
    assert.ok(customerBId);

    // Approve Customer B with Farmer Code C-301
    const approveResB = await request(app)
      .post(`/api/v1/customers/${customerBId}/approve`)
      .set('Authorization', `Bearer ${dairyAdminBToken}`)
      .send({
        farmerCode: 'C-301',
        permittedCategories: ['COW'],
      })
      .expect(200);

    assert.strictEqual(approveResB.body.data.status, 'ACTIVE');
    assert.strictEqual(approveResB.body.data.farmerCode, 'C-301');

    // Sign Customer A JWT token
    customerAToken = tokenService.signToken({
      userId: customerAId,
      organizationId: dairyAId,
      role: 'FARMER_CUSTOMER',
      actorType: 'CUSTOMER',
    });
  });

  await suite.test('3. Customer App: 5-Sample Face Enrollment & Read-back Verification', async () => {
    // Prior to enrollment, verify biometricStatus.isEnrolled is false
    const preCheck = await request(app)
      .get(`/api/v1/customers/${customerAId}`)
      .set('Authorization', `Bearer ${customerAToken}`)
      .set('x-dairy-id', dairyAId)
      .expect(200);

    assert.strictEqual(preCheck.body.data.biometricStatus?.isEnrolled, false);

    // Submit 5-sample averaged normalized 128-D template
    const enrollRes = await request(app)
      .post(`/api/v1/customers/me/biometrics/update`)
      .set('Authorization', `Bearer ${customerAToken}`)
      .set('x-dairy-id', dairyAId)
      .send({
        modelVersion: 'sface_int8_2021dec',
        embedding: customerAAveragedTemplate,
        confidence: 0.985,
        organizationId: dairyAId,
      })
      .expect(200);

    assert.strictEqual(enrollRes.body.success, true);
    assert.strictEqual(enrollRes.body.isBiometricEnrolled, true);
    assert.strictEqual(enrollRes.body.biometricStatus.status, 'ENROLLED');

    // Read-back verification from Dairy A tenant database
    const postCheck = await request(app)
      .get(`/api/v1/customers/${customerAId}`)
      .set('Authorization', `Bearer ${customerAToken}`)
      .set('x-dairy-id', dairyAId)
      .expect(200);

    assert.strictEqual(postCheck.body.data.biometricStatus?.isEnrolled, true);
    assert.strictEqual(postCheck.body.data.biometricStatus?.status, 'ENROLLED');
  });

  await suite.test('4. Customer App: Test Face Button Verification & Discrete Statuses', async () => {
    // 4a. Live face match against enrolled profile template -> FACE_MATCHED
    const testMatchRes = await request(app)
      .post('/api/v1/identity/face/match')
      .set('Authorization', `Bearer ${customerAToken}`)
      .set('x-dairy-id', dairyAId)
      .send({
        embedding: customerAFiveSamples[0], // Frame 1 probe
        customerId: customerAId,
        dairyId: dairyAId,
      })
      .expect(200);

    assert.strictEqual(testMatchRes.body.matched, true);
    assert.strictEqual(testMatchRes.body.matchResult, 'FACE_MATCHED');
    assert.strictEqual(testMatchRes.body.farmerCode, 'C-201');
    assert.strictEqual(testMatchRes.body.farmerName, 'Santosh Popat Patil');
    assert.ok(testMatchRes.body.similarityScore >= 0.363);

    // 4b. Non-matching probe (different person) -> FACE_NOT_MATCHED
    const testMismatchRes = await request(app)
      .post('/api/v1/identity/face/match')
      .set('Authorization', `Bearer ${customerAToken}`)
      .set('x-dairy-id', dairyAId)
      .send({
        embedding: unknownProbe,
        customerId: customerAId,
        dairyId: dairyAId,
      })
      .expect(200);

    assert.strictEqual(testMismatchRes.body.matched, false);
    assert.strictEqual(testMismatchRes.body.matchResult, 'FACE_NOT_MATCHED');

    // 4c. Test Face on unenrolled Customer B -> ENROLLMENT_NOT_FOUND
    const testUnenrolledRes = await request(app)
      .post('/api/v1/identity/face/match')
      .set('Authorization', `Bearer ${dairyAdminBToken}`)
      .set('x-dairy-id', dairyBId)
      .send({
        embedding: customerBTemplate,
        customerId: customerBId,
        dairyId: dairyBId,
      })
      .expect(200);

    assert.strictEqual(testUnenrolledRes.body.matched, false);
    assert.strictEqual(testUnenrolledRes.body.matchResult, 'ENROLLMENT_NOT_FOUND');
  });

  await suite.test('5. Collection App: Kiosk Face Recognition & Hardware State Synchronization', async () => {
    // Fetch enrolled templates for Dairy A kiosk cache
    const templatesRes = await request(app)
      .get(`/api/v1/identity/face/templates?organizationId=${dairyAId}`)
      .set('Authorization', `Bearer ${dairyAdminAToken}`)
      .set('x-dairy-id', dairyAId)
      .expect(200);

    assert.strictEqual(templatesRes.body.success, true);
    assert.ok(Array.isArray(templatesRes.body.data));
    assert.strictEqual(templatesRes.body.data.length, 1);

    const template = templatesRes.body.data[0];
    assert.strictEqual(template.farmerCode, 'C-201');
    assert.strictEqual(template.fullName, 'Santosh Popat Patil');
    assert.strictEqual(template.status, 'ACTIVE');
    assert.ok(Array.isArray(template.embedding));
    assert.strictEqual(template.embedding.length, 128);

    // Kiosk online recognition match for live farmer in Dairy A
    const kioskMatchRes = await request(app)
      .post('/api/v1/identity/face/match')
      .set('Authorization', `Bearer ${dairyAdminAToken}`)
      .set('x-dairy-id', dairyAId)
      .send({
        embedding: customerAFiveSamples[2],
        organizationId: dairyAId,
      })
      .expect(200);

    assert.strictEqual(kioskMatchRes.body.matched, true);
    assert.strictEqual(kioskMatchRes.body.matchResult, 'FACE_MATCHED');
    assert.strictEqual(kioskMatchRes.body.farmerCode, 'C-201');
    assert.strictEqual(kioskMatchRes.body.farmerName, 'Santosh Popat Patil');

    // Unknown person recognition in Dairy A -> UNKNOWN_PERSON
    const unknownRes = await request(app)
      .post('/api/v1/identity/face/match')
      .set('Authorization', `Bearer ${dairyAdminAToken}`)
      .set('x-dairy-id', dairyAId)
      .send({
        embedding: unknownProbe,
        organizationId: dairyAId,
      })
      .expect(200);

    assert.strictEqual(unknownRes.body.matched, false);
    assert.strictEqual(unknownRes.body.matchResult, 'UNKNOWN_PERSON');
  });

  await suite.test('6. Multi-Tenant Database Isolation: Zero Cross-Tenant Biometric Leakage', async () => {
    // Dairy B kiosk requests face templates: Must return 0 templates (Customer A is in Dairy A)
    const dairyBTemplatesRes = await request(app)
      .get(`/api/v1/identity/face/templates?organizationId=${dairyBId}`)
      .set('Authorization', `Bearer ${dairyAdminBToken}`)
      .set('x-dairy-id', dairyBId)
      .expect(200);

    assert.strictEqual(dairyBTemplatesRes.body.success, true);
    assert.strictEqual(dairyBTemplatesRes.body.data.length, 0);

    // Customer A probe sent to Dairy B: Must NOT recognize, must return UNKNOWN_PERSON
    const crossDairyMatch = await request(app)
      .post('/api/v1/identity/face/match')
      .set('Authorization', `Bearer ${dairyAdminBToken}`)
      .set('x-dairy-id', dairyBId)
      .send({
        embedding: customerAFiveSamples[0],
        organizationId: dairyBId,
      })
      .expect(200);

    assert.strictEqual(crossDairyMatch.body.matched, false);
    assert.strictEqual(crossDairyMatch.body.matchResult, 'UNKNOWN_PERSON');
  });

  await suite.test('7. Shift Session Lifecycle Integrity (No Regression)', async () => {
    // Verify shift session open and query
    const openSessionRes = await request(app)
      .post('/api/v1/collections/sessions/open')
      .set('Authorization', `Bearer ${dairyAdminAToken}`)
      .set('x-dairy-id', dairyAId)
      .send({
        dairyId: dairyAId,
        shift: 'EVENING',
        operatorId: 'operator-warna-1',
      })
      .expect(201);

    assert.strictEqual(openSessionRes.body.success, true);
    assert.ok(openSessionRes.body.data.sessionCode);

    // Active session retrieval
    const activeSessionRes = await request(app)
      .get('/api/v1/collections/sessions/active')
      .set('Authorization', `Bearer ${dairyAdminAToken}`)
      .set('x-dairy-id', dairyAId)
      .expect(200);

    assert.strictEqual(activeSessionRes.body.success, true);
    assert.strictEqual(activeSessionRes.body.data.status, 'OPEN');
  });
});
