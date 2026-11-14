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

test('DFarm Customer Lifecycle, RBAC & Soft-Delete/Restore Security Suite', async (t) => {
  await dbClient.connect();
  t.after(async () => {
    await dbClient.end();
    await pool.end();
  });

  const app = createApp();

  let orgId = '';
  let centerId = '';
  let operatorToken = '';
  let officerToken = '';
  let ownerToken = '';
  let createdCustomerId = '';
  const testMobile = `+9198333${Math.floor(10000 + Math.random() * 90000)}`;

  await t.test('0. Setup users with distinct roles (COLLECTION_OPERATOR, REGISTRATION_OFFICER, DAIRY_OWNER)', async () => {
    const orgRes = await query("SELECT id FROM organizations LIMIT 1;");
    orgId = orgRes.rows[0].id;

    const centerRes = await query("SELECT id FROM dairy_centers WHERE organization_id = $1 LIMIT 1;", [orgId]);
    centerId = centerRes.rows[0].id;

    // 1. Collection Operator user
    const opUser = await query(
      `INSERT INTO users (id, organization_id, username, full_name, email, phone_number, role, status)
       VALUES (gen_random_uuid(), $1, 'rbac_op_user', 'Operator Ramesh', 'ramesh@dfarm.test', '+919800000001', 'COLLECTION_OPERATOR', 'ACTIVE')
       ON CONFLICT (username) DO UPDATE SET status = 'ACTIVE', role = 'COLLECTION_OPERATOR'
       RETURNING id;`,
      [orgId]
    );
    await query(
      `INSERT INTO user_center_assignments (user_id, center_id, is_primary)
       VALUES ($1, $2, TRUE) ON CONFLICT DO NOTHING;`,
      [opUser.rows[0].id, centerId]
    );

    // 2. Registration Officer user
    const roUser = await query(
      `INSERT INTO users (id, organization_id, username, full_name, email, phone_number, role, status)
       VALUES (gen_random_uuid(), $1, 'rbac_ro_user', 'Officer Suresh', 'suresh@dfarm.test', '+919800000002', 'REGISTRATION_OFFICER', 'ACTIVE')
       ON CONFLICT (username) DO UPDATE SET status = 'ACTIVE', role = 'REGISTRATION_OFFICER'
       RETURNING id;`,
      [orgId]
    );
    await query(
      `INSERT INTO user_center_assignments (user_id, center_id, is_primary)
       VALUES ($1, $2, TRUE) ON CONFLICT DO NOTHING;`,
      [roUser.rows[0].id, centerId]
    );

    // 3. Dairy Owner user
    const ownerUser = await query(
      `INSERT INTO users (id, organization_id, username, full_name, email, phone_number, role, status)
       VALUES (gen_random_uuid(), $1, 'rbac_owner_user', 'Owner Anil', 'anil@dfarm.test', '+919800000003', 'DAIRY_OWNER', 'ACTIVE')
       ON CONFLICT (username) DO UPDATE SET status = 'ACTIVE', role = 'DAIRY_OWNER'
       RETURNING id;`,
      [orgId]
    );
    await query(
      `INSERT INTO user_center_assignments (user_id, center_id, is_primary)
       VALUES ($1, $2, TRUE) ON CONFLICT DO NOTHING;`,
      [ownerUser.rows[0].id, centerId]
    );

    // Obtain login tokens
    const opLogin = await request(app).post('/api/v1/auth/login').send({ username: 'rbac_op_user' });
    operatorToken = opLogin.body.data.token;

    const roLogin = await request(app).post('/api/v1/auth/login').send({ username: 'rbac_ro_user' });
    officerToken = roLogin.body.data.token;

    const ownerLogin = await request(app).post('/api/v1/auth/login').send({ username: 'rbac_owner_user' });
    ownerToken = ownerLogin.body.data.token;
  });

  await t.test('1. RBAC: COLLECTION_OPERATOR is rejected with 403 when creating customer', async () => {
    const res = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        centerId: centerId,
        farmerCode: `C-${Math.floor(1000 + Math.random() * 9000)}`,
        fullName: 'Rejected Customer By Operator',
        mobileNumber: testMobile,
        permittedCategories: ['COW'],
      })
      .expect(403);

    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'FORBIDDEN');
  });

  await t.test('2. RBAC: REGISTRATION_OFFICER is permitted to register new customer (201)', async () => {
    const res = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${officerToken}`)
      .send({
        centerId: centerId,
        farmerCode: `FARM-${Math.floor(10000 + Math.random() * 90000)}`,
        fullName: 'Prakash Rao Shinde',
        mobileNumber: testMobile,
        permittedCategories: ['COW', 'BUFFALO'],
        address: {
          village: 'Tasgaon Rural',
          talukaSubdistrict: 'Tasgaon',
          district: 'Sangli',
          state: 'Maharashtra',
          postalCode: '416312',
        },
      })
      .expect(201);

    assert.equal(res.body.success, true);
    assert.ok(res.body.data.id);
    assert.equal(res.body.data.fullName, 'Prakash Rao Shinde');
    assert.equal(res.body.data.status, 'DRAFT');
    assert.equal(res.body.data.isDeleted, false);

    createdCustomerId = res.body.data.id;
  });

  await t.test('3. RBAC: COLLECTION_OPERATOR is rejected with 403 when soft-deleting customer', async () => {
    const res = await request(app)
      .delete(`/api/v1/customers/${createdCustomerId}`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ reason: 'Operator unauthorized attempt' })
      .expect(403);

    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'FORBIDDEN');
  });

  await t.test('4. Soft-Delete without required reason is rejected with 400 validation error', async () => {
    const res = await request(app)
      .delete(`/api/v1/customers/${createdCustomerId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({})
      .expect(400);

    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  await t.test('5. Authorized Owner soft-deletes customer with reason', async () => {
    const res = await request(app)
      .delete(`/api/v1/customers/${createdCustomerId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ reason: 'Farmer moved to another district' })
      .expect(200);

    assert.equal(res.body.success, true);
    assert.equal(res.body.data.isDeleted, true);
    assert.equal(res.body.data.status, 'SOFT_DELETED');

    // Verify in database directly
    const dbCheck = await query(
      "SELECT is_deleted, status, deletion_reason FROM customers WHERE id = $1;",
      [createdCustomerId]
    );
    assert.equal(dbCheck.rows[0].is_deleted, true);
    assert.equal(dbCheck.rows[0].status, 'SOFT_DELETED');
    assert.equal(dbCheck.rows[0].deletion_reason, 'Farmer moved to another district');

    // Verify audit log exists
    const auditCheck = await query(
      "SELECT action, entity_type FROM audit_logs WHERE entity_id = $1 ORDER BY created_at DESC LIMIT 1;",
      [createdCustomerId]
    );
    assert.ok(auditCheck.rows.length > 0, 'Audit log entry must be created');
    assert.equal(auditCheck.rows[0].action, 'CUSTOMER_SOFT_DELETED');

    // Verify sync tombstone exists
    const tombstoneCheck = await query(
      "SELECT entity_type, entity_id FROM sync_tombstones WHERE entity_id = $1;",
      [createdCustomerId]
    );
    assert.ok(tombstoneCheck.rows.length > 0, 'Sync tombstone entry must be created');
    assert.equal(tombstoneCheck.rows[0].entity_type, 'CUSTOMER');
  });

  await t.test('6. GET /api/v1/customers excludes soft-deleted customer from active lists', async () => {
    const res = await request(app)
      .get('/api/v1/customers')
      .set('Authorization', `Bearer ${officerToken}`)
      .query({ search: 'Prakash Rao Shinde' })
      .expect(200);

    assert.equal(res.body.success, true);
    const found = res.body.data.items.find(c => c.id === createdCustomerId);
    assert.equal(found, undefined, 'Soft-deleted customer must not appear in normal list queries');
  });

  await t.test('7. RBAC: COLLECTION_OPERATOR is rejected with 403 when restoring customer', async () => {
    const res = await request(app)
      .post(`/api/v1/customers/${createdCustomerId}/restore`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ reason: 'Unauthorized restore' })
      .expect(403);

    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'FORBIDDEN');
  });

  await t.test('8. Authorized Owner restores soft-deleted customer', async () => {
    const res = await request(app)
      .post(`/api/v1/customers/${createdCustomerId}/restore`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ reason: 'Farmer returned and resumed dairy deliveries' })
      .expect(200);

    assert.equal(res.body.success, true);
    assert.equal(res.body.data.isDeleted, false);
    assert.equal(res.body.data.status, 'PENDING_FACE_ENROLLMENT');

    // Verify in database
    const dbCheck = await query(
      "SELECT is_deleted, status, deletion_reason FROM customers WHERE id = $1;",
      [createdCustomerId]
    );
    assert.equal(dbCheck.rows[0].is_deleted, false);
    assert.equal(dbCheck.rows[0].status, 'PENDING_FACE_ENROLLMENT');
    assert.equal(dbCheck.rows[0].deletion_reason, null);

    // Verify audit log exists
    const auditCheck = await query(
      "SELECT action FROM audit_logs WHERE entity_id = $1 ORDER BY created_at DESC LIMIT 1;",
      [createdCustomerId]
    );
    assert.equal(auditCheck.rows[0].action, 'CUSTOMER_RESTORED');
  });

  await t.test('9. Restored customer reappears in active customer listings', async () => {
    const res = await request(app)
      .get('/api/v1/customers')
      .set('Authorization', `Bearer ${officerToken}`)
      .query({ search: 'Prakash Rao Shinde' })
      .expect(200);

    assert.equal(res.body.success, true);
    const found = res.body.data.items.find(c => c.id === createdCustomerId);
    assert.ok(found, 'Restored customer must now appear in active list queries');
    assert.equal(found.id, createdCustomerId);
    assert.equal(found.status, 'PENDING_FACE_ENROLLMENT');
  });
});
