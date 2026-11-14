import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import pg from 'pg';
import { createApp } from '../dist/app.js';
import { signJwt } from '../dist/jwt.js';
import { pool } from '../dist/config/db.js';

const { Client } = pg;
const dbClient = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
});

test('Verification for history?limit=1, dashboard/metrics, and auth/centers', async (t) => {
  await dbClient.connect();
  t.after(async () => {
    await dbClient.end();
    await pool.end();
  });

  const app = createApp();

  const orgRes = await dbClient.query('SELECT id FROM organizations LIMIT 1;');
  assert.ok(orgRes.rows.length > 0, 'Organization must exist');
  const orgId = orgRes.rows[0].id;

  const userRes = await dbClient.query(
    `INSERT INTO users (id, organization_id, username, full_name, email, phone_number, role, status)
     VALUES (gen_random_uuid(), $1, 'verify_dash_user', 'Verify Dash User', 'verify.dash@dfarm.test', '+919999988888', 'DAIRY_OWNER', 'ACTIVE')
     ON CONFLICT (username) DO UPDATE SET status = 'ACTIVE', role = 'DAIRY_OWNER'
     RETURNING id;`,
    [orgId]
  );
  const testUserId = userRes.rows[0].id;

  // Sign JWT without primaryCenterId (admin user across all centers)
  const token = signJwt({
    sub: testUserId,
    organizationId: orgId,
    role: 'DAIRY_OWNER',
    email: 'verify.dash@dfarm.test',
  });

  await t.test('1. GET /api/v1/collections/history?limit=1 without centerId returns 200 instead of 500', async () => {
    const res = await request(app)
      .get('/api/v1/collections/history?limit=1')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200, `Expected 200 but got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
  });

  await t.test('2. GET /api/v1/dashboard/metrics?date=2026-11-14 returns 200 instead of 404', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/metrics?date=2026-11-14')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200, `Expected 200 but got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data);
    assert.equal(res.body.data.businessDate, '2026-11-14');
    assert.ok(typeof res.body.data.todayTotalMilkQtyKg === 'number');
  });

  await t.test('3. GET /api/v1/auth/centers returns 200 with centers list', async () => {
    const res = await request(app)
      .get('/api/v1/auth/centers')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200, `Expected 200 but got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.data.length > 0);
  });
});
