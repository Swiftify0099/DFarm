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

test('DFarm Backend Customer & Authentication APIs Integration Test Suite', async (t) => {
  await dbClient.connect();
  t.after(async () => {
    await dbClient.end();
    await pool.end();
  });

  const app = createApp();

  // Test state
  let sangliOrgId = '';
  let tasgaonCenterId = '';
  let registrationOfficerUserId = '';
  let authToken = '';
  let createdCustomerUuid = '';
  const uniqueMobile = `+9198765${Math.floor(10000 + Math.random() * 90000)}`;

  await t.test('0. Setup test organization, center, and registration officer', async () => {
    // 1. Fetch Sangli organization
    const orgRes = await query(
      "SELECT id FROM organizations WHERE name ILIKE '%Sangli%' LIMIT 1;"
    );
    assert.ok(orgRes.rows.length > 0, 'Sangli organization must exist in DB');
    sangliOrgId = orgRes.rows[0].id;

    // 2. Fetch Tasgaon center
    const centerRes = await query(
      "SELECT id FROM dairy_centers WHERE organization_id = $1 LIMIT 1;",
      [sangliOrgId]
    );
    assert.ok(centerRes.rows.length > 0, 'Dairy center must exist in Sangli org');
    tasgaonCenterId = centerRes.rows[0].id;

    // 3. Upsert Registration Officer user
    const userRes = await query(
      `INSERT INTO users (id, organization_id, username, full_name, email, phone_number, role, status)
       VALUES (gen_random_uuid(), $1, 'reg_officer_test', 'Suresh Patil (Field Officer)', 'suresh.patil@sanglidairy.com', '+919988776655', 'REGISTRATION_OFFICER', 'ACTIVE')
       ON CONFLICT (username) DO UPDATE 
       SET status = 'ACTIVE', role = 'REGISTRATION_OFFICER'
       RETURNING id;`,
      [sangliOrgId]
    );
    registrationOfficerUserId = userRes.rows[0].id;

    // 4. Assign to center
    await query(
      `INSERT INTO user_center_assignments (user_id, center_id, is_primary)
       VALUES ($1, $2, TRUE)
       ON CONFLICT (user_id, center_id) DO UPDATE SET is_primary = TRUE;`,
      [registrationOfficerUserId, tasgaonCenterId]
    );
  });

  await t.test('1. Admin / Officer Login with valid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'reg_officer_test' })
      .expect(200);

    assert.equal(res.body.success, true);
    assert.ok(res.body.data.token, 'Token must be returned');
    assert.equal(res.body.data.user.username, 'reg_officer_test');
    assert.equal(res.body.data.user.role, 'REGISTRATION_OFFICER');
    assert.equal(res.body.data.user.organizationId, sangliOrgId);
    assert.ok(res.body.data.user.primaryCenterId, 'Primary center ID must be assigned');

    authToken = res.body.data.token;
  });

  await t.test('2. GET /api/v1/auth/me returns officer profile and assigned centers', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    assert.equal(res.body.success, true);
    assert.equal(res.body.data.internalId, registrationOfficerUserId);
    assert.equal(res.body.data.role, 'REGISTRATION_OFFICER');
  });

  await t.test('3. Expired or invalid token returns 401 UNAUTHORIZED', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer invalid-expired-token-xyz')
      .expect(401);

    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'INVALID_TOKEN');
  });

  await t.test('4. Register customer with COW category', async () => {
    const cowMobile = `+9198765${Math.floor(10000 + Math.random() * 90000)}`;
    const res = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${authToken}`)
      .set('X-Center-ID', tasgaonCenterId)
      .send({
        fullName: 'Anand Shinde',
        mobileNumber: cowMobile,
        permittedCategories: ['COW'],
        centerId: tasgaonCenterId,
        address: {
          village: 'Tasgaon',
          district: 'Sangli',
          talukaSubdistrict: 'Tasgaon',
          state: 'Maharashtra',
          postalCode: '416312',
        },
      })
      .expect(201);

    assert.equal(res.body.success, true);
    assert.ok(res.body.data.id, 'Canonical customer UUID must be created');
    assert.equal(res.body.data.fullName, 'Anand Shinde');
    assert.equal(res.body.data.status, 'DRAFT');
    assert.deepEqual(res.body.data.permittedCategories, ['COW']);
  });

  await t.test('5. Register customer with BUFFALO category', async () => {
    const buffaloMobile = `+9198765${Math.floor(10000 + Math.random() * 90000)}`;
    const res = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${authToken}`)
      .set('X-Center-ID', tasgaonCenterId)
      .send({
        fullName: 'Balasaheb Kadam',
        mobileNumber: buffaloMobile,
        permittedCategories: ['BUFFALO'],
        centerId: tasgaonCenterId,
        address: {
          village: 'Kavathe Mahankal',
          district: 'Sangli',
          talukaSubdistrict: 'Kavathe',
          state: 'Maharashtra',
          postalCode: '416405',
        },
      })
      .expect(201);

    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, 'DRAFT');
    assert.deepEqual(res.body.data.permittedCategories, ['BUFFALO']);
  });

  await t.test('6. Register customer with BOTH categories and Canonical UUID generation', async () => {
    const res = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${authToken}`)
      .set('X-Center-ID', tasgaonCenterId)
      .send({
        fullName: 'Pandurang Mane',
        mobileNumber: uniqueMobile,
        permittedCategories: ['COW', 'BUFFALO'],
        centerId: tasgaonCenterId,
        address: {
          village: 'Nandre',
          district: 'Sangli',
          talukaSubdistrict: 'Miraj',
          state: 'Maharashtra',
          postalCode: '416416',
        },
      })
      .expect(201);

    assert.equal(res.body.success, true);
    assert.ok(res.body.data.id, 'Canonical customer UUID must exist');
    assert.equal(res.body.data.fullName, 'Pandurang Mane');
    assert.equal(res.body.data.normalizedMobileNumber, uniqueMobile);
    assert.equal(res.body.data.status, 'DRAFT');
    assert.equal(res.body.data.registrationStatus, 'IN_PROGRESS');
    assert.equal(res.body.data.permittedCategories.length, 2);

    createdCustomerUuid = res.body.data.id;

    // Verify record directly in PostgreSQL
    const dbCheck = await query(
      'SELECT id, full_name, status, registration_status FROM customers WHERE id = $1;',
      [createdCustomerUuid]
    );
    assert.equal(dbCheck.rows.length, 1, 'Record must exist in PostgreSQL customers table');
    assert.equal(dbCheck.rows[0].status, 'DRAFT');
    assert.equal(dbCheck.rows[0].registration_status, 'IN_PROGRESS');
  });

  await t.test('7. Unique mobile validation rejects duplicate number in organization', async () => {
    const res = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${authToken}`)
      .set('X-Center-ID', tasgaonCenterId)
      .send({
        fullName: 'Another Farmer',
        mobileNumber: uniqueMobile, // Same mobile as Pandurang Mane
        permittedCategories: ['COW'],
        centerId: tasgaonCenterId,
      })
      .expect(409);

    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'DUPLICATE_MOBILE_NUMBER');
  });

  await t.test('8. GET /api/v1/customers lists customers with pagination', async () => {
    const res = await request(app)
      .get('/api/v1/customers?page=1&limit=10')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data.items), 'Items must be an array');
    assert.ok(res.body.data.total >= 3, 'Must have at least 3 registered customers');
  });

  await t.test('9. GET /api/v1/customers with search queries matching records', async () => {
    const res = await request(app)
      .get(`/api/v1/customers?search=Pandurang`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    assert.equal(res.body.success, true);
    assert.ok(res.body.data.items.length >= 1);
    assert.ok(
      res.body.data.items.some((c) => c.id === createdCustomerUuid),
      'Search results must include created customer'
    );
  });

  await t.test('10. GET /api/v1/customers/:customerId retrieves full customer profile', async () => {
    const res = await request(app)
      .get(`/api/v1/customers/${createdCustomerUuid}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    assert.equal(res.body.success, true);
    assert.equal(res.body.data.id, createdCustomerUuid);
    assert.equal(res.body.data.fullName, 'Pandurang Mane');
    assert.equal(res.body.data.address.village, 'Nandre');
    assert.equal(res.body.data.address.district, 'Sangli');
  });

  await t.test('11. PATCH /api/v1/customers/:customerId updates editable customer details', async () => {
    const res = await request(app)
      .patch(`/api/v1/customers/${createdCustomerUuid}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        fullName: 'Pandurang Tukaram Mane',
        address: {
          village: 'Nandre Gaon',
          district: 'Sangli',
          talukaSubdistrict: 'Miraj',
          state: 'Maharashtra',
          postalCode: '416416',
        },
      })
      .expect(200);

    assert.equal(res.body.success, true);
    assert.equal(res.body.data.fullName, 'Pandurang Tukaram Mane');
  });

  await t.test('12. Unauthorized registration without token rejected with 401', async () => {
    const res = await request(app)
      .post('/api/v1/customers')
      .send({
        fullName: 'Unauthorized Farmer',
        mobileNumber: '+919999900000',
        permittedCategories: ['COW'],
      })
      .expect(401);

    assert.equal(res.body.success, false);
  });
});
