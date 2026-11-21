import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../dist/app.js';
import { HmacJwtTokenService } from '../dist/infrastructure/security/HmacJwtTokenService.js';
import { db } from '../dist/infrastructure/database/PostgresPool.js';

const tokenService = new HmacJwtTokenService();

const superAdminToken = tokenService.signToken({
  userId: '00000000-0000-0000-0000-000000000099',
  role: 'SUPER_ADMIN',
  actorType: 'STAFF',
  fullName: 'Chief Super Administrator',
});

const platformOperatorToken = tokenService.signToken({
  userId: '00000000-0000-0000-0000-000000000098',
  role: 'PLATFORM_OPERATOR',
  actorType: 'STAFF',
  fullName: 'Platform Operations Engineer',
});

test('ROADMAP PHASE 03: Super Admin Core Operations Verification Suite', async (suite) => {

  await suite.test('GROUP 1: Authoritative Dairy Registry & Provisioning Integration', async (t) => {
    const uniqueSuffix = Date.now().toString().slice(-6);
    const testDairyName = `Sangamner Sahakari Dudh ${uniqueSuffix}`;
    const testMobile = `9822${Math.floor(100000 + Math.random() * 900000)}`;

    await t.test('1.1. Super Admin registers and provisions new Dairy cooperative', async () => {
      const res = await request(app)
        .post('/api/v1/dairies')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: testDairyName,
          businessPhone: testMobile,
          businessEmail: `admin_${uniqueSuffix}@sangamnerdairy.in`,
          primaryAdminName: 'Anand Shinde',
          primaryAdminMobile: testMobile,
          addressLine1: 'Main Market Yard, Sangamner',
          district: 'Ahmednagar',
          state: 'Maharashtra',
          pincode: '422605',
          latitude: 19.5761,
          longitude: 74.2070,
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.id);
      assert.equal(res.body.data.dairy.name, testDairyName);
      assert.ok(res.body.data.dairy.code.startsWith('DF-'));
      assert.ok(res.body.data.activationToken);
    });

    await t.test('1.2. Rejects duplicate Dairy registration with same name/email (409 Conflict)', async () => {
      const res = await request(app)
        .post('/api/v1/dairies')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: testDairyName,
          businessPhone: testMobile,
          businessEmail: `admin_${uniqueSuffix}@sangamnerdairy.in`,
          primaryAdminName: 'Anand Shinde',
          primaryAdminMobile: testMobile,
          pincode: '422605',
          latitude: 19.5761,
          longitude: 74.2070,
        });

      assert.equal(res.status, 409);
      assert.equal(res.body.success, false);
      assert.match(res.body.error, /already registered|already exists/i);
    });
  });

  await suite.test('GROUP 2: Platform Account Management (POST /users)', async (t) => {
    const operatorMobile = `9822${Math.floor(100000 + Math.random() * 900000)}`;

    await t.test('2.1. Super Admin creates PLATFORM_OPERATOR account with restricted permissions', async () => {
      const res = await request(app)
        .post('/api/v1/super-admin/users')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          fullName: 'Ajay Kulkarni',
          email: 'ajay.kulkarni@dfarm.in',
          mobile: operatorMobile,
          role: 'PLATFORM_OPERATOR',
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.role, 'PLATFORM_OPERATOR');
      assert.equal(res.body.data.roleTitle, 'Platform Operations Engineer');
      assert.ok(res.body.data.permissions.includes('system:monitor'));
      assert.ok(res.body.data.permissions.includes('alerts:read'));
      assert.ok(!res.body.data.permissions.includes('dairies:create'));
    });

    await t.test('2.2. PLATFORM_OPERATOR cannot create other platform users (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/super-admin/users')
        .set('Authorization', `Bearer ${platformOperatorToken}`)
        .send({
          fullName: 'Unauthorized Creation',
          email: 'unauth@dfarm.in',
          mobile: '9822119988',
          role: 'SUPER_ADMIN',
        });

      assert.equal(res.status, 403);
      assert.match(res.body.error, /Super Admin privileges required/i);
    });

    await t.test('2.3. Rejects invalid role assignment (400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/v1/super-admin/users')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          fullName: 'Invalid Role Test',
          email: 'invalid@dfarm.in',
          mobile: '9822119977',
          role: 'ARBITRARY_SUPER_USER',
        });

      assert.equal(res.status, 400);
      assert.match(res.body.error, /role must be either/i);
    });
  });

  await suite.test('GROUP 3: Central Dashboard Metrics & Real Data Aggregation', async () => {
    const res = await request(app)
      .get('/api/v1/super-admin/dashboard/metrics')
      .set('Authorization', `Bearer ${superAdminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(typeof res.body.data.totalDairies === 'number');
    assert.ok(typeof res.body.data.activeDairies === 'number');
    assert.ok(typeof res.body.data.totalRegisteredHardwareUnits === 'number');
  });

  await suite.test('GROUP 4: Platform Reports Generation with Real Data', async () => {
    const res = await request(app)
      .post('/api/v1/super-admin/reports/generate')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        reportType: 'dairy_growth',
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-12-31T23:59:59.000Z',
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.reportType, 'dairy_growth');
    assert.ok(Array.isArray(res.body.data.rows));
  });

  await suite.test('GROUP 5: Dairy Lifecycle Suspension & Reactivation without DB Loss', async (t) => {
    // List dairies to find an active one
    const listRes = await request(app)
      .get('/api/v1/dairies')
      .set('Authorization', `Bearer ${superAdminToken}`);

    const targetDairy = (listRes.body.data || []).find((d) => d.status === 'ACTIVE');
    if (!targetDairy) return;

    await t.test('5.1. Suspend Dairy updates status to SUSPENDED', async () => {
      const res = await request(app)
        .post(`/api/v1/dairies/${targetDairy.id}/suspend`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ reason: 'Routine audit suspension' });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.status, 'SUSPENDED');
    });

    await t.test('5.2. Reactivate Dairy restores status to ACTIVE', async () => {
      const res = await request(app)
        .post(`/api/v1/dairies/${targetDairy.id}/reactivate`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ note: 'Audit completed successfully' });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.status, 'ACTIVE');
    });
  });
});
