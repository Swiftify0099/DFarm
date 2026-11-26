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

async function query(text, params) {
  return dbClient.query(text, params);
}

test('DFarm Health, Auth, CORS, and Security Middleware Integration Suite', async (t) => {
  await dbClient.connect();
  t.after(async () => {
    await dbClient.end();
    await pool.end();
  });

  const app = createApp();

  let orgId = '';
  let centerId = '';
  let testUserId = '';
  let testUserToken = '';

  await t.test('0. Setup test organization, center, and user', async () => {
    const orgRes = await query(
      "SELECT o.id FROM organizations o JOIN dairy_centers dc ON dc.organization_id = o.id WHERE o.status = 'ACTIVE' LIMIT 1;"
    );
    assert.ok(orgRes.rows.length > 0, 'Organization with active center must exist');
    orgId = orgRes.rows[0].id;

    const centerRes = await query("SELECT id FROM dairy_centers WHERE organization_id = $1 LIMIT 1;", [orgId]);
    assert.ok(centerRes.rows.length > 0, 'Center must exist');
    centerId = centerRes.rows[0].id;

    const userRes = await query(
      `INSERT INTO users (id, organization_id, username, full_name, email, phone_number, role, status)
       VALUES (gen_random_uuid(), $1, 'health_auth_test_user', 'Health Auth Tester', 'health.tester@dfarm.test', '+919811122233', 'DAIRY_OWNER', 'ACTIVE')
       ON CONFLICT (username) DO UPDATE SET status = 'ACTIVE', role = 'DAIRY_OWNER'
       RETURNING id;`,
      [orgId]
    );
    testUserId = userRes.rows[0].id;

    await query(
      `INSERT INTO user_center_assignments (user_id, center_id, is_primary)
       VALUES ($1, $2, TRUE)
       ON CONFLICT (user_id, center_id) DO UPDATE SET is_primary = TRUE;`,
      [testUserId, centerId]
    );
  });

  await t.test('1. GET /health/live returns 200 UP status', async () => {
    const res = await request(app)
      .get('/health/live')
      .expect(200);

    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, 'UP');
    assert.ok(res.body.data.timestamp);
    assert.ok(res.body.meta.requestId);
  });

  await t.test('2. GET /health/ready returns 200 READY with database and env checks', async () => {
    const res = await request(app)
      .get('/health/ready')
      .expect(200);

    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, 'READY');
    assert.equal(res.body.data.checks.env, 'OK');
    assert.equal(res.body.data.checks.supabase, 'OK');
    assert.equal(res.body.data.checks.postgres, 'OK');
    assert.ok(!res.body.data.credentials, 'Must never expose credentials or database strings');
  });

  await t.test('3. CORS Policy allows configured origin and includes CORS headers', async () => {
    const res = await request(app)
      .get('/health/live')
      .set('Origin', 'http://localhost:3000')
      .expect(200);

    assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:3000');
  });

  await t.test('4. Rate Limiter headers present on /api/v1 routes', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .expect(401);

    // standardHeaders: 'draft-7' sets ratelimit-limit, ratelimit-remaining
    assert.ok(res.headers['ratelimit-limit'] !== undefined || res.headers['x-ratelimit-limit'] !== undefined || res.headers['ratelimit'] !== undefined);
  });

  await t.test('5. POST /api/v1/auth/login validates credentials and returns token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'health_auth_test_user' })
      .expect(200);

    assert.equal(res.body.success, true);
    assert.ok(res.body.data.token);
    assert.equal(res.body.data.user.id, testUserId);
    assert.equal(res.body.data.user.role, 'DAIRY_OWNER');
    assert.equal(res.body.data.user.organizationId, orgId);

    testUserToken = res.body.data.token;
  });

  await t.test('6. POST /api/v1/auth/login rejects unknown username with 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'unknown_ghost_user_999' })
      .expect(401);

    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
  });

  await t.test('7. POST /api/v1/auth/login rejects empty request with 400 validation error', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({})
      .expect(400);

    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  await t.test('8. GET /api/v1/auth/me with valid Bearer token returns full authenticated context', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${testUserToken}`)
      .expect(200);

    assert.equal(res.body.success, true);
    assert.equal(res.body.data.internalId, testUserId);
    assert.equal(res.body.data.role, 'DAIRY_OWNER');
    assert.equal(res.body.data.actorType, 'STAFF');
    assert.equal(res.body.data.organizationId, orgId);
    assert.ok(Array.isArray(res.body.data.authorizedCenterIds));
    assert.ok(res.body.data.authorizedCenterIds.includes(centerId));
  });

  await t.test('9. GET /api/v1/auth/me rejects missing Authorization header with 401', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .expect(401);

    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  await t.test('10. GET /api/v1/auth/me rejects Basic auth header with 401', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Basic dXNlcjpwYXNz')
      .expect(401);

    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  await t.test('11. GET /api/v1/auth/me rejects malformed / corrupted token with 401', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer abc.def.ghi')
      .expect(401);

    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'INVALID_TOKEN');
  });

  await t.test('12. GET /api/v1/auth/me rejects unmapped user token with 403 UNMAPPED_IDENTITY', async () => {
    const unmappedUserId = 'a0000000-0000-0000-0000-000000000001';
    const fakeToken = signJwt({ sub: unmappedUserId, email: 'ghost@dfarm.test' });

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${fakeToken}`)
      .expect(403);

    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'UNMAPPED_IDENTITY');
  });
});
