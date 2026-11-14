import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import pg from 'pg';
import { createApp } from '../dist/app.js';
import { pool } from '../dist/config/db.js';

const { Client } = pg;
const dbClient = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
});

async function query(text, params) {
  return dbClient.query(text, params);
}

test('DFarm Customer Registration App - Master API Connectivity & Contract Test Suite', async (t) => {
  await dbClient.connect();
  t.after(async () => {
    await dbClient.end();
    await pool.end();
  });

  const app = createApp();

  let orgId = '';
  let centerId = '';
  let staffUserId = '';
  let staffToken = '';
  let createdCustomerId = '';

  await t.test('0. Setup test organization, center, and registration officer', async () => {
    const orgRes = await query('SELECT id FROM organizations LIMIT 1;');
    assert.ok(orgRes.rows.length > 0, 'Organization must exist');
    orgId = orgRes.rows[0].id;

    const centerRes = await query('SELECT id FROM dairy_centers WHERE organization_id = $1 LIMIT 1;', [orgId]);
    assert.ok(centerRes.rows.length > 0, 'Center must exist');
    centerId = centerRes.rows[0].id;

    const userRes = await query(
      `INSERT INTO users (id, organization_id, username, full_name, email, phone_number, role, status)
       VALUES (gen_random_uuid(), $1, 'reg_officer_test', 'Registration Officer Test', 'reg.officer@dfarm.test', '+919877788899', 'REGISTRATION_OFFICER', 'ACTIVE')
       ON CONFLICT (username) DO UPDATE SET status = 'ACTIVE', role = 'REGISTRATION_OFFICER', email = 'reg.officer@dfarm.test'
       RETURNING id;`,
      [orgId]
    );
    staffUserId = userRes.rows[0].id;

    await query(
      `INSERT INTO user_center_assignments (user_id, center_id, is_primary)
       VALUES ($1, $2, TRUE)
       ON CONFLICT (user_id, center_id) DO UPDATE SET is_primary = TRUE;`,
      [staffUserId, centerId]
    );
  });

  await t.test('1. Staff Login using email and password returning token and assigned centers', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'reg.officer@dfarm.test',
        password: 'Password123',
      });

    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.token, 'Token must be present in response data');
    staffToken = res.body.data.token;

    const user = res.body.data.user;
    assert.ok(user, 'User object must be present in response data');
    assert.equal(user.email, 'reg.officer@dfarm.test');
    assert.ok(Array.isArray(user.assignedCenters), 'assignedCenters must be an array');
    assert.ok(user.assignedCenters.length > 0, 'Must have at least 1 assigned center');
  });

  await t.test('2. Centers dropdown options endpoint (GET /api/v1/auth/centers)', async () => {
    const res = await request(app)
      .get('/api/v1/auth/centers')
      .set('Authorization', `Bearer ${staffToken}`);

    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data), 'Centers data must be an array');
    assert.ok(res.body.data.length > 0, 'Must contain active centers');
    const firstCenter = res.body.data[0];
    assert.ok(firstCenter.id, 'Center must have id');
    assert.ok(firstCenter.name, 'Center must have name');
  });

  await t.test('3. Customer Registration with Android contract & optional address fields', async () => {
    const uniquePhone = `+9198${Math.floor(10000000 + Math.random() * 90000000)}`;

    const res = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        fullName: 'Balasaheb Shinde',
        normalizedMobileNumber: uniquePhone,
        permittedCategories: ['COW', 'BUFFALO'],
        primaryCenterId: centerId,
        address: {
          village: 'Kasaba Bawada',
          district: 'Kolhapur',
          state: 'Maharashtra',
          talukaSubdistrict: null, // Verifying null/omitted optional address field acceptance
          postalCode: null,
        },
      });

    assert.equal(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.id, 'Customer canonical UUID must be returned');
    assert.equal(res.body.data.fullName, 'Balasaheb Shinde');
    assert.equal(res.body.data.status, 'DRAFT');
    createdCustomerId = res.body.data.id;
  });

  await t.test('4. Duplicate Mobile Number returns 409 Conflict', async () => {
    const existingPhone = '+919876543210';
    // Ensure one customer with this phone exists in the org
    await query(
      `INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'F-DUP-001', 'Duplicate Existing Farmer', $3, 'ACTIVE', 'COMPLETED', NOW(), NOW())
       ON CONFLICT (organization_id, normalized_mobile_number) DO NOTHING;`,
      [orgId, centerId, existingPhone]
    );

    const res = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        fullName: 'Another Farmer',
        mobileNumber: existingPhone,
        permittedCategories: ['COW'],
        primaryCenterId: centerId,
      });

    assert.equal(res.status, 409, `Expected 409 Conflict, got ${res.status}: ${JSON.stringify(res.body)}`);
  });

  await t.test('5. RFID Assignment contract returns enriched DTO compatible with Android', async () => {
    const cardUid = `A1B2C3${Math.floor(1000 + Math.random() * 9000).toString(16).toUpperCase()}`;

    const res = await request(app)
      .post(`/api/v1/customers/${createdCustomerId}/rfid-assign`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        cardUid,
        cardType: 'MIFARE_CLASSIC_1K',
        deviceId: 'REGISTRATION_APP',
      });

    assert.equal(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);
    const data = res.body.data;
    assert.ok(data.id, 'Must contain id');
    assert.ok(data.assignmentId, 'Must contain assignmentId');
    assert.ok(data.rfidCardId, 'Must contain rfidCardId');
    assert.equal(data.customerId, createdCustomerId);
    assert.equal(data.status, 'ACTIVE');
  });

  await t.test('6. Customer RFID Status returns active card and assignment history', async () => {
    const res = await request(app)
      .get(`/api/v1/customers/${createdCustomerId}/rfid-status`)
      .set('Authorization', `Bearer ${staffToken}`);

    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.equal(res.body.success, true);
    const data = res.body.data;
    assert.ok(data.activeCard, 'activeCard must be present');
    assert.ok(data.activeCard.cardUid, 'activeCard must have cardUid');
    assert.ok(Array.isArray(data.assignmentHistory), 'assignmentHistory must be array');
    assert.ok(data.assignmentHistory.length > 0, 'assignmentHistory must not be empty');
    assert.ok(data.assignmentHistory[0].id, 'History item must have id');
  });

  await t.test('7. RFID Replacement contract returns enriched DTO compatible with Android', async () => {
    const newCardUid = `D4E5F6${Math.floor(1000 + Math.random() * 9000).toString(16).toUpperCase()}`;

    const res = await request(app)
      .post(`/api/v1/customers/${createdCustomerId}/rfid-replace`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        newCardUid,
        reason: 'Physical card surface cracked',
      });

    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);
    const data = res.body.data;
    assert.ok(data.id || data.newAssignmentId, 'Must contain assignment identifier');
    assert.equal(data.customerId, createdCustomerId);
    assert.equal(data.newCardUid, newCardUid);
  });

  await t.test('8. Customer Soft-Delete (Deactivation) with mandatory reason', async () => {
    const res = await request(app)
      .delete(`/api/v1/customers/${createdCustomerId}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        reason: 'Temporary suspension requested by farmer',
      });

    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.isDeleted, true);
    assert.equal(res.body.data.status, 'SOFT_DELETED');
  });

  await t.test('9. Listing customers filtered by status=SOFT_DELETED finds deactivated customer', async () => {
    const res = await request(app)
      .get('/api/v1/customers?status=SOFT_DELETED')
      .set('Authorization', `Bearer ${staffToken}`);

    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.equal(res.body.success, true);
    const items = res.body.data.items;
    assert.ok(Array.isArray(items), 'Items must be an array');
    const found = items.find((c) => c.id === createdCustomerId);
    assert.ok(found, 'Deactivated customer must be listed under SOFT_DELETED status filter');
    assert.equal(found.isDeleted, true);
  });

  await t.test('10. Customer Restoration with mandatory reason', async () => {
    const res = await request(app)
      .post(`/api/v1/customers/${createdCustomerId}/restore`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        reason: 'Farmer resumed dairy supply operations',
      });

    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.isDeleted, false);
    assert.ok(
      ['ACTIVE', 'PENDING_FACE_ENROLLMENT'].includes(res.body.data.status),
      `Expected status to be ACTIVE or PENDING_FACE_ENROLLMENT, got ${res.body.data.status}`
    );
  });
});
