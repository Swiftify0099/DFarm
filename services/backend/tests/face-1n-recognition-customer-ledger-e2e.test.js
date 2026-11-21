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

test('DFARM Complete Face 1:N Recognition, Customer Diagnostics & Ledger Integrity Suite', async (suite) => {
  // Tenant Dairy A (Warna Cooperative)
  const dairyAId = 'a1111111-1111-1111-1111-111111111111';
  const dairyACode = 'DF-WAR-1111';
  const dairyAName = 'Warna Milk Cooperative';

  // Tenant Dairy B (Rajhans Cooperative)
  const dairyBId = 'b2222222-2222-2222-2222-222222222222';
  const dairyBCode = 'DF-RAJ-2222';
  const dairyBName = 'Rajhans Dairy Cooperative';

  let dairyAdminAToken = '';
  let operatorAToken = '';
  let customerAId = '';
  let customerAGlobalId = '';
  let customerAToken = '';
  let centerAId = 'c0000000-0000-0000-0000-000000000001';
  let sessionACode = '';
  let sessionAId = '';

  const customerAFiveSamples = [
    generateNormalizedVector(2.01),
    generateNormalizedVector(2.02),
    generateNormalizedVector(2.03),
    generateNormalizedVector(2.04),
    generateNormalizedVector(2.05),
  ];
  const customerAAveragedTemplate = averageVectors(customerAFiveSamples);
  const unknownProbe = generateNormalizedVector(99.99);

  await suite.test('1. Multi-Tenant Infrastructure Provisioning (Dairy A & Dairy B)', async () => {
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
      dbName: 'dfarm_tenant_a11111111111',
      status: 'ACTIVE',
    });

    inMemoryDairies.set(dairyBId, {
      id: dairyBId,
      code: dairyBCode,
      name: dairyBName,
      dbName: 'dfarm_tenant_b22222222222',
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

    // Generate tokens
    dairyAdminAToken = tokenService.signToken({
      userId: '00000000-0000-0000-0000-000000000010',
      role: 'DAIRY_ADMIN',
      organizationId: dairyAId,
      actorType: 'STAFF',
    });

    operatorAToken = tokenService.signToken({
      userId: '00000000-0000-0000-0000-000000000011',
      role: 'COLLECTION_OPERATOR',
      organizationId: dairyAId,
      centerId: centerAId,
      actorType: 'STAFF',
    });

    assert.ok(dairyAdminAToken);
    assert.ok(operatorAToken);
  });

  await suite.test('2. Customer Registration in Dairy A & Approval by Dairy Admin', async () => {
    // Register customer in Dairy A
    const regRes = await request(app)
      .post('/api/v1/customers/register')
      .send({
        fullName: 'Prakash Patil',
        mobileNumber: '9822334455',
        dairyId: dairyAId,
        village: 'Kodoli',
        milkSupplyType: 'COW',
        bankDetails: {
          bankName: 'State Bank of India',
          accountNumber: '12345678901',
          ifscCode: 'SBIN0001234',
          accountHolderName: 'Prakash Patil',
        },
      });

    assert.strictEqual(regRes.status, 201);
    assert.ok(regRes.body.data.id);
    customerAId = regRes.body.data.id;
    customerAGlobalId = regRes.body.data.globalCustomerId || customerAId;

    // Approve customer
    const approveRes = await request(app)
      .post(`/api/v1/customers/${customerAId}/approve`)
      .set('Authorization', `Bearer ${dairyAdminAToken}`)
      .send({
        farmerCode: 'WAR-101',
        primaryCenterId: centerAId,
        milkTypes: ['COW'],
      });

    assert.strictEqual(approveRes.status, 200);
    assert.strictEqual(approveRes.body.data.registrationStatus, 'APPROVED');

    // Customer App Auth Token
    customerAToken = tokenService.signToken({
      userId: customerAGlobalId,
      role: 'FARMER_CUSTOMER',
      organizationId: dairyAId,
      actorType: 'FARMER',
    });
    assert.ok(customerAToken);
  });

  await suite.test('3. Issue C Verification: Customer App Biometric Update/Re-enrollment (5 Quality Samples)', async () => {
    // Customer updates biometrics using Customer App
    const updateRes = await request(app)
      .post(`/api/v1/customers/${customerAId}/biometrics/update`)
      .set('Authorization', `Bearer ${customerAToken}`)
      .send({
        embedding: customerAAveragedTemplate,
        modelVersion: 'sface_int8_2021dec',
        organizationId: dairyAId,
        confidence: 0.98,
      });

    assert.strictEqual(updateRes.status, 200);
    assert.strictEqual(updateRes.body.success, true);
    assert.strictEqual(updateRes.body.status, 'ENROLLED');
    assert.strictEqual(updateRes.body.isBiometricEnrolled, true);
    assert.strictEqual(updateRes.body.biometricStatus?.version, 'sface_int8_2021dec');
  });

  await suite.test('4. Issue C Verification: Customer App Diagnostics / Test Face Sensor', async () => {
    // 4a. Read-only verification with matching probe vector against enrolled template
    const matchProbe = customerAFiveSamples[0]; // Sample 1 has high cosine similarity with averaged vector (~0.99)
    const testMatchRes = await request(app)
      .post('/api/v1/identity/face/match')
      .set('Authorization', `Bearer ${customerAToken}`)
      .send({
        embedding: matchProbe,
        customerId: customerAId,
        organizationId: dairyAId,
      });

    assert.strictEqual(testMatchRes.status, 200);
    assert.strictEqual(testMatchRes.body.success, true);
    assert.strictEqual(testMatchRes.body.isMatch, true);
    assert.strictEqual(testMatchRes.body.status, 'FACE_MATCHED');
    assert.ok(testMatchRes.body.similarity >= 0.363);
    assert.ok(testMatchRes.body.confidenceScore >= 70);
    assert.strictEqual(testMatchRes.body.farmerName, 'Prakash Patil');

    // 4b. Test with an unmatched probe vector against the same customer
    const testUnmatchRes = await request(app)
      .post('/api/v1/identity/face/match')
      .set('Authorization', `Bearer ${customerAToken}`)
      .send({
        embedding: unknownProbe,
        customerId: customerAId,
        organizationId: dairyAId,
      });

    assert.strictEqual(testUnmatchRes.status, 200);
    assert.strictEqual(testUnmatchRes.body.success, true);
    assert.strictEqual(testUnmatchRes.body.isMatch, false);
    assert.strictEqual(testUnmatchRes.body.status, 'FACE_NOT_MATCHED');
    assert.strictEqual(testUnmatchRes.body.rejectionReason, 'NO_MATCH_BELOW_THRESHOLD');
    assert.ok(testUnmatchRes.body.similarity < 0.363);

    // 4c. Test query for a non-enrolled customer ID
    const notEnrolledRes = await request(app)
      .post('/api/v1/identity/face/match')
      .set('Authorization', `Bearer ${customerAToken}`)
      .send({
        embedding: matchProbe,
        customerId: '00000000-0000-0000-0000-000000000999',
        organizationId: dairyAId,
      });

    assert.strictEqual(notEnrolledRes.status, 200);
    assert.strictEqual(notEnrolledRes.body.status, 'ENROLLMENT_NOT_FOUND');
    assert.strictEqual(notEnrolledRes.body.isMatch, false);
  });

  await suite.test('5. Issue B Verification: Collection App 1:N Face Recognition Across Dairy', async () => {
    // Operator triggers 1:N matching (NO customerId supplied)
    // Probe matches Prakash Patil's enrolled template
    const probe = customerAFiveSamples[1];
    const match1NRes = await request(app)
      .post('/api/v1/identity/face/match')
      .set('Authorization', `Bearer ${operatorAToken}`)
      .set('X-Dairy-Id', dairyAId)
      .send({
        embedding: probe,
        organizationId: dairyAId,
      });

    assert.strictEqual(match1NRes.status, 200);
    assert.strictEqual(match1NRes.body.success, true);
    assert.strictEqual(match1NRes.body.isMatch, true);
    assert.strictEqual(match1NRes.body.status, 'FACE_MATCHED');
    assert.strictEqual(match1NRes.body.farmerId, customerAId);
    assert.strictEqual(match1NRes.body.farmerName, 'Prakash Patil');
    assert.strictEqual(match1NRes.body.farmerCode, 'WAR-101');
    assert.ok(match1NRes.body.similarity >= 0.363);
    assert.ok(match1NRes.body.confidenceScore >= 70);

    // Unknown probe returns UNKNOWN_PERSON
    const unknownRes = await request(app)
      .post('/api/v1/identity/face/match')
      .set('Authorization', `Bearer ${operatorAToken}`)
      .set('X-Dairy-Id', dairyAId)
      .send({
        embedding: unknownProbe,
        organizationId: dairyAId,
      });

    assert.strictEqual(unknownRes.status, 200);
    assert.strictEqual(unknownRes.body.isMatch, false);
    assert.strictEqual(unknownRes.body.status, 'UNKNOWN_PERSON');
    assert.strictEqual(unknownRes.body.rejectionReason, 'NO_MATCH_BELOW_THRESHOLD');
    assert.strictEqual(unknownRes.body.matchedCustomer, null);
    assert.strictEqual(unknownRes.body.threshold, 0.363);
  });

  await suite.test('6. Issue A Verification: Collection Receipt Creation & Customer Binding', async () => {
    // Open a shift session first
    const openRes = await request(app)
      .post('/api/v1/collections/sessions/open')
      .set('Authorization', `Bearer ${operatorAToken}`)
      .set('X-Dairy-Id', dairyAId)
      .send({
        shift: 'MORNING',
        businessDate: '2026-11-20',
        deviceId: 'KIOSK_MAIN',
      });

    assert.strictEqual(openRes.status, 201);
    sessionACode = openRes.body.data.sessionCode;
    sessionAId = openRes.body.data.id;

    // Process milk collection intake
    const intakeRes = await request(app)
      .post('/api/v1/collections/transactions')
      .set('Authorization', `Bearer ${operatorAToken}`)
      .set('X-Dairy-Id', dairyAId)
      .send({
        sessionId: sessionAId,
        sessionCode: sessionACode,
        customerId: customerAId,
        milkCategory: 'COW',
        weightLiters: 12.5,
        fatPercentage: 4.2,
        snfPercentage: 8.6,
        clrDensity: 28.5,
        identificationMethod: 'FACE_YUNET_SFACE',
        deviceId: 'KIOSK_MAIN',
      });

    assert.strictEqual(intakeRes.status, 201);
    assert.strictEqual(intakeRes.body.success, true);
    assert.ok(intakeRes.body.receiptNumber.startsWith('RCP-'));
    assert.strictEqual(intakeRes.body.customerId, customerAId);
    assert.strictEqual(intakeRes.body.farmerId, customerAId);
    assert.strictEqual(intakeRes.body.farmerName, 'Prakash Patil');
    assert.strictEqual(intakeRes.body.farmerCode, 'WAR-101');
    assert.ok(intakeRes.body.data.totalAmount > 0);
    assert.strictEqual(intakeRes.body.customerBalanceAfter, intakeRes.body.data.totalAmount);
  });

  await suite.test('7. Issue A Verification: Double-Entry Ledger Posting & Passbook Reflection', async () => {
    // 7a. Customer App Passbook / Ledger Entries
    const ledgerRes = await request(app)
      .get('/api/v1/ledger/entries')
      .set('Authorization', `Bearer ${customerAToken}`)
      .set('X-Dairy-Tenant-Id', dairyAId);

    assert.strictEqual(ledgerRes.status, 200);
    assert.strictEqual(ledgerRes.body.success, true);
    assert.ok(ledgerRes.body.data.length >= 1);
    const entry = ledgerRes.body.data[0];
    assert.strictEqual(entry.direction, 'CREDIT');
    assert.ok(entry.amount > 0);
    assert.ok(entry.runningBalance > 0);

    // 7b. Customer App Khata Summary
    const summaryRes = await request(app)
      .get('/api/v1/ledger/summary')
      .set('Authorization', `Bearer ${customerAToken}`)
      .set('X-Dairy-Tenant-Id', dairyAId);

    assert.strictEqual(summaryRes.status, 200);
    assert.strictEqual(summaryRes.body.success, true);
    assert.ok(summaryRes.body.balance > 0);

    // 7c. Customer App Collection History
    const historyRes = await request(app)
      .get('/api/v1/collections/history')
      .set('Authorization', `Bearer ${customerAToken}`)
      .set('X-Dairy-Tenant-Id', dairyAId);

    assert.strictEqual(historyRes.status, 200);
    assert.strictEqual(historyRes.body.success, true);
    assert.ok(historyRes.body.data.length >= 1);
    assert.strictEqual(historyRes.body.data[0].customerName, 'Prakash Patil');
    assert.strictEqual(historyRes.body.data[0].weightLiters, 12.5);

    // 7d. Customer App Monthly Summary
    const monthlyRes = await request(app)
      .get('/api/v1/collections/summary/monthly?monthYear=2026-11')
      .set('Authorization', `Bearer ${customerAToken}`)
      .set('X-Dairy-Tenant-Id', dairyAId);

    assert.strictEqual(monthlyRes.status, 200);
    assert.strictEqual(monthlyRes.body.success, true);
    assert.strictEqual(monthlyRes.body.data.totalLiters, 12.5);
    assert.strictEqual(monthlyRes.body.data.transactionCount, 1);

    // 7e. Dairy Admin Customer Profile View
    const adminTxnsRes = await request(app)
      .get(`/api/v1/collections/transactions?customerId=${customerAId}`)
      .set('Authorization', `Bearer ${dairyAdminAToken}`)
      .set('X-Dairy-Id', dairyAId);

    assert.strictEqual(adminTxnsRes.status, 200);
    assert.strictEqual(adminTxnsRes.body.success, true);
    assert.ok(adminTxnsRes.body.data.length >= 1);
    assert.strictEqual(adminTxnsRes.body.data[0].customerName, 'Prakash Patil');
    assert.strictEqual(adminTxnsRes.body.data[0].weightLiters, 12.5);
  });

  await suite.test('8. Cross-Tenant Isolation: Complete Biometric & Financial Separation', async () => {
    // Dairy B operator cannot match Dairy A customer via face
    const probe = customerAFiveSamples[0];
    const operatorBToken = tokenService.signToken({
      userId: '00000000-0000-0000-0000-000000000020',
      role: 'COLLECTION_OPERATOR',
      organizationId: dairyBId,
      actorType: 'STAFF',
    });

    const crossMatchRes = await request(app)
      .post('/api/v1/identity/face/match')
      .set('Authorization', `Bearer ${operatorBToken}`)
      .set('X-Dairy-Id', dairyBId)
      .send({
        embedding: probe,
        organizationId: dairyBId,
      });

    assert.strictEqual(crossMatchRes.status, 200);
    assert.strictEqual(crossMatchRes.body.isMatch, false);
    assert.strictEqual(crossMatchRes.body.status, 'UNKNOWN_PERSON');

    // Cross-dairy template listing blocked
    const crossTemplatesRes = await request(app)
      .get(`/api/v1/identity/face/templates?organizationId=${dairyAId}`)
      .set('Authorization', `Bearer ${operatorBToken}`);

    assert.strictEqual(crossTemplatesRes.status, 403);
  });
});
