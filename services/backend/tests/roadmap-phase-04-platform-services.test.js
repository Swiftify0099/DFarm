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

test('ROADMAP PHASE 04: Super Admin Platform Services & Governance Verification Suite', async (suite) => {
  let createdDairyId;
  let createdHardwareId;
  let createdAmcPlanId;
  let createdSubscriptionId;
  let createdRatePolicyId;
  let createdRateVersionId;
  let createdFatSnfPolicyId;
  let createdFatSnfVersionId;
  let createdSupportSessionId;

  // Setup: Provision a Dairy for hardware assignment and AMC
  await suite.test('0. Setup: Ensure an active test Dairy exists', async () => {
    const uniqueSuffix = Date.now().toString().slice(-6);
    const res = await request(app)
      .post('/api/v1/dairies')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        name: `Baramati Milk Union ${uniqueSuffix}`,
        businessPhone: `9822${Math.floor(100000 + Math.random() * 900000)}`,
        businessEmail: `baramati_${uniqueSuffix}@dfarm.in`,
        primaryAdminName: 'Sanjay Patil',
        primaryAdminMobile: `9822${Math.floor(100000 + Math.random() * 900000)}`,
        pincode: '413102',
        district: 'Pune',
        state: 'Maharashtra',
      });

    assert.equal(res.status, 201);
    createdDairyId = res.body.data.dairy.id;
    assert.ok(createdDairyId);
  });

  // Group 1: Central Hardware Master & Inventory
  await suite.test('GROUP 1: Central Hardware Master & Inventory Lifecycle', async (t) => {
    const serial = `ANALYZER-SN-${Date.now().toString().slice(-6)}`;

    await t.test('1.1. Super Admin registers new milk analyzer hardware', async () => {
      const res = await request(app)
        .post('/api/v1/super-admin/hardware')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          serialNumber: serial,
          deviceCategory: 'ANALYZER',
          manufacturer: 'Essae-Teraoka',
          model: 'MA-800 Pro Ultra',
          warrantyUntil: '2028-12-31',
          notes: 'Precision optical sensor, dual-frequency ultrasonic',
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.serialNumber, serial);
      assert.equal(res.body.data.deviceCategory, 'ANALYZER');
      assert.equal(res.body.data.status, 'AVAILABLE');
      createdHardwareId = res.body.data.id;
    });

    await t.test('1.2. Rejects duplicate serial number registration (409 Conflict)', async () => {
      const res = await request(app)
        .post('/api/v1/super-admin/hardware')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          serialNumber: serial,
          deviceCategory: 'ANALYZER',
          manufacturer: 'Essae-Teraoka',
          model: 'MA-800 Pro Ultra',
        });

      assert.equal(res.status, 409);
      assert.equal(res.body.success, false);
      assert.match(res.body.error, /already registered/i);
    });

    await t.test('1.3. Assigns hardware to an active Dairy', async () => {
      const res = await request(app)
        .post(`/api/v1/super-admin/hardware/${createdHardwareId}/assign`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          dairyId: createdDairyId,
          notes: 'Deployed to Main Collection Center 1',
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.status, 'ASSIGNED');
      assert.equal(res.body.data.dairyId, createdDairyId);
    });

    await t.test('1.4. Updates hardware operational status to MAINTENANCE', async () => {
      const res = await request(app)
        .patch(`/api/v1/super-admin/hardware/${createdHardwareId}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          status: 'MAINTENANCE',
          notes: 'Ultrasonic transducer re-calibration scheduled',
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.status, 'MAINTENANCE');
    });

    await t.test('1.5. Unassigns hardware back to central inventory', async () => {
      const res = await request(app)
        .post(`/api/v1/super-admin/hardware/${createdHardwareId}/unassign`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          notes: 'Returned from field for routine lab overhaul',
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.status, 'AVAILABLE');
    });
  });

  // Group 2: Central AMC Subscriptions & Razorpay Verification
  await suite.test('GROUP 2: Central AMC Plans & Subscriptions', async (t) => {
    const planName = `Platinum Cooperative Annual Care ${Date.now().toString().slice(-4)}`;

    await t.test('2.1. Super Admin creates annual AMC plan', async () => {
      const res = await request(app)
        .post('/api/v1/super-admin/amc/plans')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: planName,
          durationMonths: 12,
          priceInr: 18000,
          description: 'Full hardware replacement, calibration and 24x7 priority support',
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.name, planName);
      assert.equal(res.body.data.priceInr, 18000);
      createdAmcPlanId = res.body.data.id;
    });

    await t.test('2.2. Creates AMC subscription for Dairy', async () => {
      const res = await request(app)
        .post('/api/v1/super-admin/amc/subscriptions')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          dairyId: createdDairyId,
          planId: createdAmcPlanId,
          startDate: '2026-04-01',
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.dairyId, createdDairyId);
      assert.equal(res.body.data.planId, createdAmcPlanId);
      assert.equal(res.body.data.paymentStatus, 'UNPAID');
      createdSubscriptionId = res.body.data.id;
    });

    await t.test('2.3. Verifies Razorpay payment for AMC subscription', async () => {
      const res = await request(app)
        .post(`/api/v1/super-admin/amc/subscriptions/${createdSubscriptionId}/verify-payment`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          razorpayPaymentId: 'pay_test_amc_' + Date.now(),
          razorpaySignature: 'sig_mock_verified',
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.status, 'ACTIVE');
      assert.equal(res.body.data.paymentStatus, 'PAID');
    });
  });

  // Group 3: Central Global Rate Policy Engine
  await suite.test('GROUP 3: Central Global Rate Policy Engine', async (t) => {
    const policyCode = `GRP-MAHA-${Date.now().toString().slice(-4)}`;

    await t.test('3.1. Super Admin creates new global rate policy', async () => {
      const res = await request(app)
        .post('/api/v1/super-admin/policies/rate')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          policyCode,
          name: 'Maharashtra State Cooperative Baseline Rate Policy',
          description: 'Official minimum support rates and quality brackets for cow & buffalo milk',
          policyType: 'STATUTORY_MINIMUM',
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.policyCode, policyCode);
      assert.equal(res.body.data.policyType, 'STATUTORY_MINIMUM');
      createdRatePolicyId = res.body.data.id;
    });

    await t.test('3.2. Drafts rate policy version with parameters & checksum calculation', async () => {
      const res = await request(app)
        .post(`/api/v1/super-admin/policies/rate/${createdRatePolicyId}/versions`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          effectiveFrom: '2026-06-01',
          changeSummary: 'Q2 2026 Standard procurement revision',
          parameters: {
            cow: { baseFat: 3.5, baseSnf: 8.5, baseRate: 38.0 },
            buffalo: { baseFat: 6.0, baseSnf: 9.0, baseRate: 58.0 },
          },
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.status, 'DRAFT');
      assert.equal(res.body.data.versionNumber, 1);
      assert.ok(res.body.data.checksum);
      assert.equal(typeof res.body.data.checksum, 'string');
      assert.equal(res.body.data.checksum.length, 64); // SHA-256
      createdRateVersionId = res.body.data.id;
    });

    await t.test('3.3. Publishes global rate policy version', async () => {
      const res = await request(app)
        .post(`/api/v1/super-admin/policies/rate/${createdRatePolicyId}/versions/${createdRateVersionId}/publish`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send();

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.status, 'PUBLISHED');
      assert.ok(res.body.data.publishedAt);
    });

    await t.test('3.4. Lists global rate policies with active versions', async () => {
      const res = await request(app)
        .get('/api/v1/super-admin/policies/rate')
        .set('Authorization', `Bearer ${superAdminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      const found = res.body.data.find((p) => p.id === createdRatePolicyId);
      assert.ok(found);
      assert.ok(found.versions.length >= 1);
      assert.equal(found.versions[0].status, 'PUBLISHED');
    });
  });

  // Group 4: Central Global FAT/SNF Adjustment Policy Engine
  await suite.test('GROUP 4: Central Global FAT/SNF Adjustment Policy Engine', async (t) => {
    const policyCode = `FATSNF-STD-${Date.now().toString().slice(-4)}`;

    await t.test('4.1. Super Admin creates new global FAT/SNF adjustment policy', async () => {
      const res = await request(app)
        .post('/api/v1/super-admin/policies/fat-snf')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          policyCode,
          name: 'Standard Precision Deduction Policy 2026',
          description: 'Zero guessed values - mathematically defined calibration steps and temperature compensation brackets',
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.policyCode, policyCode);
      createdFatSnfPolicyId = res.body.data.id;
    });

    await t.test('4.2. Drafts FAT/SNF version with explicit deduction rules and rounding policy', async () => {
      const res = await request(app)
        .post(`/api/v1/super-admin/policies/fat-snf/${createdFatSnfPolicyId}/versions`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          effectiveFrom: '2026-05-01',
          milkCategory: 'BOTH',
          roundingPolicy: 'NEAREST_TWO_DECIMALS',
          changeSummary: 'Harmonized temperature and SNF deduction grid',
          fatAdjustmentRules: [
            { minFat: 3.0, maxFat: 3.49, deductionPerPoint: 0.25 },
            { minFat: 3.5, maxFat: 5.0, deductionPerPoint: 0.00 },
          ],
          snfAdjustmentRules: [
            { minSnf: 8.0, maxSnf: 8.49, deductionPerPoint: 0.30 },
            { minSnf: 8.5, maxSnf: 10.0, deductionPerPoint: 0.00 },
          ],
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.status, 'DRAFT');
      assert.equal(res.body.data.versionNumber, 1);
      assert.equal(res.body.data.roundingPolicy, 'NEAREST_TWO_DECIMALS');
      assert.ok(res.body.data.checksum);
      assert.equal(res.body.data.checksum.length, 64);
      createdFatSnfVersionId = res.body.data.id;
    });

    await t.test('4.3. Publishes FAT/SNF adjustment policy version', async () => {
      const res = await request(app)
        .post(`/api/v1/super-admin/policies/fat-snf/${createdFatSnfPolicyId}/versions/${createdFatSnfVersionId}/publish`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send();

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.status, 'PUBLISHED');
      assert.ok(res.body.data.publishedAt);
    });

    await t.test('4.4. Lists global FAT/SNF policies verifying separation of concerns', async () => {
      const res = await request(app)
        .get('/api/v1/super-admin/policies/fat-snf')
        .set('Authorization', `Bearer ${superAdminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      const found = res.body.data.find((p) => p.id === createdFatSnfPolicyId);
      assert.ok(found);
      assert.equal(found.versions[0].status, 'PUBLISHED');
      assert.equal(found.versions[0].roundingPolicy, 'NEAREST_TWO_DECIMALS');
    });
  });

  // Group 5: Diagnostic Support Sessions & Platform Alerts
  await suite.test('GROUP 5: Platform Diagnostic Support Sessions & Alerts', async (t) => {
    await t.test('5.1. Super Admin requests time-bound diagnostic support session (PostgreSQL persisted)', async () => {
      const res = await request(app)
        .post('/api/v1/super-admin/support/sessions')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          dairyId: createdDairyId,
          justificationReason: 'Customer reported weighing scale calibration drift in morning shift session',
          supportTicketRef: 'INC-2026-0981',
          durationMinutes: 60,
          authorizedScope: 'OPERATIONAL_DIAGNOSTIC',
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.dairyId, createdDairyId);
      assert.equal(res.body.data.status, 'active');
      assert.equal(res.body.data.supportTicketRef, 'INC-2026-0981');
      assert.ok(res.body.data.id);
      createdSupportSessionId = res.body.data.id;
    });

    await t.test('5.2. Retrieves active support sessions list', async () => {
      const res = await request(app)
        .get('/api/v1/super-admin/support/sessions')
        .set('Authorization', `Bearer ${superAdminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      const session = res.body.data.find((s) => s.id === createdSupportSessionId);
      assert.ok(session);
      assert.equal(session.status, 'active');
    });

    await t.test('5.3. Super Admin revokes diagnostic support session', async () => {
      const res = await request(app)
        .post(`/api/v1/super-admin/support/sessions/${createdSupportSessionId}/revoke`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          reason: 'Investigation completed, scale transducer replaced',
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.status, 'revoked');
      assert.ok(res.body.data.revokedAt);
    });

    await t.test('5.4. Query platform alerts list and verify resolution', async () => {
      const alertsRes = await request(app)
        .get('/api/v1/super-admin/alerts')
        .set('Authorization', `Bearer ${superAdminToken}`);

      assert.equal(alertsRes.status, 200);
      assert.equal(alertsRes.body.success, true);
      assert.ok(Array.isArray(alertsRes.body.data));

      if (alertsRes.body.data.length > 0) {
        const firstAlert = alertsRes.body.data[0];
        const resolveRes = await request(app)
          .post(`/api/v1/super-admin/alerts/${firstAlert.id}/resolve`)
          .set('Authorization', `Bearer ${superAdminToken}`)
          .send();

        assert.equal(resolveRes.status, 200);
        assert.equal(resolveRes.body.success, true);
        assert.equal(resolveRes.body.data.status, 'RESOLVED');
      }
    });
  });

  // Group 6: Platform Operator Least Privilege Enforcement
  await suite.test('GROUP 6: Platform Operator Least Privilege Boundaries', async (t) => {
    await t.test('6.1. Platform Operator CAN read alerts, hardware list, AMC plans, and policies', async () => {
      const hRes = await request(app)
        .get('/api/v1/super-admin/hardware')
        .set('Authorization', `Bearer ${platformOperatorToken}`);
      assert.equal(hRes.status, 200);

      const aRes = await request(app)
        .get('/api/v1/super-admin/alerts')
        .set('Authorization', `Bearer ${platformOperatorToken}`);
      assert.equal(aRes.status, 200);

      const amcRes = await request(app)
        .get('/api/v1/super-admin/amc/plans')
        .set('Authorization', `Bearer ${platformOperatorToken}`);
      assert.equal(amcRes.status, 200);

      const polRes = await request(app)
        .get('/api/v1/super-admin/policies/rate')
        .set('Authorization', `Bearer ${platformOperatorToken}`);
      assert.equal(polRes.status, 200);
    });

    await t.test('6.2. Platform Operator CANNOT register hardware (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/super-admin/hardware')
        .set('Authorization', `Bearer ${platformOperatorToken}`)
        .send({
          serialNumber: 'UNAUTH-DEV-001',
          deviceCategory: 'PRINTER',
          manufacturer: 'Epson',
          model: 'TM-T82X',
        });

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
      assert.match(res.body.error, /Super Admin privilege/i);
    });

    await t.test('6.3. Platform Operator CANNOT create AMC plans (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/super-admin/amc/plans')
        .set('Authorization', `Bearer ${platformOperatorToken}`)
        .send({
          name: 'Unauthorized AMC Plan',
          durationMonths: 6,
          priceInr: 5000,
        });

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
    });

    await t.test('6.4. Platform Operator CANNOT create diagnostic support sessions (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/super-admin/support/sessions')
        .set('Authorization', `Bearer ${platformOperatorToken}`)
        .send({
          dairyId: createdDairyId,
          justificationReason: 'Unauthorized support request',
          durationMinutes: 30,
          authorizedScope: 'FULL_ADMIN',
        });

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
    });

    await t.test('6.5. Platform Operator CANNOT create global rate policies (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/super-admin/policies/rate')
        .set('Authorization', `Bearer ${platformOperatorToken}`)
        .send({
          policyCode: 'UNAUTH-RATE-01',
          name: 'Unauthorized Rate Policy',
        });

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
    });

    await t.test('6.6. Platform Operator CANNOT create global FAT/SNF policies (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/super-admin/policies/fat-snf')
        .set('Authorization', `Bearer ${platformOperatorToken}`)
        .send({
          policyCode: 'UNAUTH-FATSNF-01',
          name: 'Unauthorized FAT/SNF Policy',
        });

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
    });
  });
});
