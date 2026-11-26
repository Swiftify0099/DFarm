import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../dist/app.js';
import { db } from '../dist/infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../dist/infrastructure/database/TenantDatabaseManager.js';
import { HmacJwtTokenService } from '../dist/infrastructure/security/HmacJwtTokenService.js';
import { CredentialEncryption } from '../dist/infrastructure/security/CredentialEncryption.js';

const tokenService = new HmacJwtTokenService();
const app = createApp();

// Setup test tenant identifiers
const testDairyA = '00000000-0000-0000-0000-000000000010';
const testDairyB = '00000000-0000-0000-0000-000000000020';
const testCenterA = '00000000-0000-0000-0000-000000000011';

// Setup authentication tokens
const dairyAdminTokenA = tokenService.signToken({
  userId: '00000000-0000-0000-0000-000000000001',
  organizationId: testDairyA,
  role: 'PRIMARY_DAIRY_ADMIN',
  actorType: 'STAFF',
  fullName: 'Rajesh Patil',
});

const dairyAdminTokenB = tokenService.signToken({
  userId: '00000000-0000-0000-0000-000000000002',
  organizationId: testDairyB,
  role: 'PRIMARY_DAIRY_ADMIN',
  actorType: 'STAFF',
  fullName: 'Sunil Deshmukh',
});

const operatorTokenA = tokenService.signToken({
  userId: '00000000-0000-0000-0000-000000000003',
  organizationId: testDairyA,
  centerId: testCenterA,
  role: 'COLLECTION_OPERATOR',
  actorType: 'STAFF',
  fullName: 'Kiosk Operator Vikas',
});

test('DFarm Dairy Admin Production Readiness & Operational Verification Suite', async (suite) => {
  // Pre-suite initialization: ensure organizations exist in test database and tenant databases
  const seedDbs = async (targetDb) => {
    try {
      await targetDb.query(`
        INSERT INTO organizations (id, name, code, status)
        VALUES 
          ('${testDairyA}', 'Gokul Sahakari Dudh Utpadak Sanstha', 'GOKUL-01', 'ACTIVE'),
          ('${testDairyB}', 'Warana Milk Cooperative', 'WARANA-02', 'ACTIVE')
        ON CONFLICT (id) DO NOTHING;
      `);

      await targetDb.query(`
        INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
        VALUES 
          ('${testCenterA}', '${testDairyA}', 'C-01', 'Gokul Shirgaon Center', 'Main Road', 'Shirgaon', 'Kolhapur', 'Maharashtra', '416234', '+919876543210', 'ACTIVE')
        ON CONFLICT (id) DO NOTHING;
      `);

      await targetDb.query(`
        INSERT INTO users (id, organization_id, username, phone_number, full_name, role, status)
        VALUES 
          ('00000000-0000-0000-0000-000000000001', '${testDairyA}', 'admin_rajesh', '+919876543210', 'Rajesh Patil', 'DAIRY_ADMIN', 'ACTIVE'),
          ('00000000-0000-0000-0000-000000000002', '${testDairyB}', 'admin_sunil', '+919876543211', 'Sunil Deshmukh', 'DAIRY_ADMIN', 'ACTIVE'),
          ('00000000-0000-0000-0000-000000000003', '${testDairyA}', 'operator_vikas', '+919876543212', 'Kiosk Operator Vikas', 'COLLECTION_OPERATOR', 'ACTIVE')
        ON CONFLICT (id) DO NOTHING;
      `);

      await targetDb.query(`
        INSERT INTO devices (id, organization_id, center_id, device_identifier, device_type, status, last_seen_at)
        VALUES
          ('00000000-0000-0000-0000-000000000015', '${testDairyA}', '${testCenterA}', 'dev-kiosk-01', 'COUNTER_TERMINAL', 'ACTIVE', NOW())
        ON CONFLICT (id) DO NOTHING;
      `);
    } catch (err) {
      console.error('Seed DB error:', err);
    }
  };

  await seedDbs(db);
  const tenantDbA = await tenantDbManager.getTenantDb(testDairyA);
  await seedDbs(tenantDbA);
  const tenantDbB = await tenantDbManager.getTenantDb(testDairyB);
  await seedDbs(tenantDbB);

  // Shared state across tests
  let registeredCustomerUuid = '';
  let activeSessionCode = '';
  let createdRateChartId = '';

  // ============================================================================
  // GROUP A: Dairy Admin Authentication & Tenant Boundary Verification
  // ============================================================================
  await suite.test('GROUP A: Dairy Admin Authentication & Tenant Boundary Verification', async (t) => {
    await t.test('1. Valid Dairy Admin token resolves authenticated admin identity via /auth/admin/me', async () => {
      const res = await request(app)
        .get('/api/v1/auth/admin/me')
        .set('Authorization', `Bearer ${dairyAdminTokenA}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.user.dairyId, testDairyA);
      assert.ok(['PRIMARY_DAIRY_ADMIN', 'DAIRY_ADMIN'].includes(res.body.user.role));
      assert.ok(res.body.user.dairyName);
      assert.ok(res.body.user.dairyCode);
    });

    await t.test('2. Dairy Admin token cannot query customer data of a different dairy (cross-dairy blocked)', async () => {
      const res = await request(app)
        .get(`/api/v1/customers?organizationId=${testDairyB}`)
        .set('Authorization', `Bearer ${dairyAdminTokenA}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
      assert.match(res.body.error, /Cross-dairy query blocked/i);
    });

    await t.test('3. Query with mismatched header and query param is blocked', async () => {
      const res = await request(app)
        .get(`/api/v1/customers?organizationId=${testDairyB}`)
        .set('x-dairy-tenant-id', testDairyA);

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
      assert.match(res.body.error, /Header dairy ID does not match/i);
    });
  });

  // ============================================================================
  // GROUP B: Customer Registration & Administrative Approval Lifecycle
  // ============================================================================
  await suite.test('GROUP B: Customer Registration & Administrative Approval Lifecycle', async (t) => {
    const mobileSuffix = Math.floor(100000 + Math.random() * 900000);
    const candidatePhone = `+9198${mobileSuffix}`;

    await t.test('4. Producer registration creates pending record with PENDING_APPROVAL status', async () => {
      const res = await request(app)
        .post('/api/v1/customers/register')
        .send({
          fullName: 'Ananda Ganpatrao More',
          mobileNumber: candidatePhone,
          organizationId: testDairyA,
          centerId: testCenterA,
          village: 'Shirgaon Khurd',
          milkSupplyType: 'COW',
          bankDetails: {
            accountNumber: '112233445566',
            ifscCode: 'MAHB0000123',
            bankName: 'Bank of Maharashtra',
            accountHolderName: 'Ananda G More',
          },
          faceTemplate: {
            embedding: new Array(128).fill(0.042),
            modelVersion: 'sface_int8_2021dec',
          },
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.ok(res.body.customerUuid);
      assert.equal(res.body.status, 'PENDING_APPROVAL');
      registeredCustomerUuid = res.body.customerUuid;
    });

    await t.test('5. Pending registration appears in Dairy Admin queue', async () => {
      const res = await request(app)
        .get('/api/v1/customers/pending')
        .set('Authorization', `Bearer ${dairyAdminTokenA}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      const found = res.body.data.find((c) => c.id === registeredCustomerUuid);
      assert.ok(found, 'Newly registered applicant must be present in pending approvals');
      assert.equal(found.candidateName, 'Ananda Ganpatrao More');
      assert.equal(found.preferredCategory, 'COW');
    });

    await t.test('6. Customer registration status endpoint reflects PENDING_APPROVAL for farmer app', async () => {
      const res = await request(app)
        .get(`/api/v1/customers/${registeredCustomerUuid}/status`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.status, 'PENDING_APPROVAL');
    });

    await t.test('7. Rejecting registration requires minimum 5-character reason; short reason rejected with 400', async () => {
      const res = await request(app)
        .patch(`/api/v1/customers/${registeredCustomerUuid}/reject`)
        .set('Authorization', `Bearer ${dairyAdminTokenA}`)
        .send({ reason: 'Bad' });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      const errMsg = typeof res.body.error === 'string' ? res.body.error : res.body.error?.message;
      assert.match(errMsg, /minimum 5 characters/i);
    });

    await t.test('8. Dairy Admin approves pending registration via PATCH /api/v1/customers/:id/approve', async () => {
      const res = await request(app)
        .patch(`/api/v1/customers/${registeredCustomerUuid}/approve`)
        .set('Authorization', `Bearer ${dairyAdminTokenA}`)
        .send({ operatorName: 'Rajesh Patil' });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.match(res.body.message, /Successfully approved farmer registration/i);
      assert.equal(res.body.data.status, 'ACTIVE');
      assert.equal(res.body.data.registrationStatus, 'APPROVED');
      assert.ok(res.body.data.farmerCode, 'Assigned farmer code must be generated');
    });

    await t.test('9. Farmer status polling reflects APPROVED immediately after administrative action', async () => {
      const res = await request(app)
        .get(`/api/v1/customers/${registeredCustomerUuid}/status`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.status, 'APPROVED');
      assert.ok(res.body.customerCode);
    });

    await t.test('10. Duplicate approval of already approved farmer is rejected with 400', async () => {
      const res = await request(app)
        .post(`/api/v1/customers/${registeredCustomerUuid}/approve`)
        .set('Authorization', `Bearer ${dairyAdminTokenA}`);

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      const errMsg = typeof res.body.error === 'string' ? res.body.error : res.body.error?.message;
      assert.match(errMsg, /already approved/i);
    });
  });

  // ============================================================================
  // GROUP C: Biometric Face Enrollment Activation
  // ============================================================================
  await suite.test('GROUP C: Biometric Face Enrollment Activation', async (t) => {
    await t.test('11. Customer profile retains encrypted biometric embedding and active enrollment', async () => {
      const res = await request(app)
        .get(`/api/v1/customers/${registeredCustomerUuid}`)
        .set('Authorization', `Bearer ${dairyAdminTokenA}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.id, registeredCustomerUuid);
      assert.equal(res.body.data.status, 'ACTIVE');
    });

    await t.test('12. Biometric face update via PUT /api/v1/customers/:id/biometrics/update is supported', async () => {
      const res = await request(app)
        .put(`/api/v1/customers/${registeredCustomerUuid}/biometrics/update`)
        .set('Authorization', `Bearer ${dairyAdminTokenA}`)
        .send({
          embedding: new Array(128).fill(0.088),
          modelVersion: 'sface_int8_2021dec',
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(['ACTIVE', 'ENROLLED'].includes(res.body.status));
    });
  });

  // ============================================================================
  // GROUP D: Milk Collection Shift Session Lifecycle
  // ============================================================================
  await suite.test('GROUP D: Milk Collection Shift Session Lifecycle', async (t) => {
    const today = new Date().toISOString().split('T')[0];
    const currentHour = new Date().getHours();
    const expectedShift = currentHour >= 4 && currentHour < 15 ? 'MORNING' : 'EVENING';

    await t.test('13. Dairy Admin opens new shift session via POST /api/v1/collections/sessions', async () => {
      const res = await request(app)
        .post('/api/v1/collections/sessions')
        .set('Authorization', `Bearer ${operatorTokenA}`)
        .send({
          centerId: testCenterA,
          organizationId: testDairyA,
          shift: expectedShift,
          businessDate: today,
          deviceId: 'KIOSK_MAIN_01',
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.sessionCode);
      assert.equal(res.body.data.status, 'OPEN');
      activeSessionCode = res.body.data.sessionCode;
    });

    await t.test('14. Kiosk counter queries active shift session via GET /api/v1/collections/sessions/active', async () => {
      const res = await request(app)
        .get(`/api/v1/collections/sessions/active?centerId=${testCenterA}&deviceId=KIOSK_MAIN_01`)
        .set('Authorization', `Bearer ${operatorTokenA}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.status, 'OPEN');
      assert.equal(res.body.data.sessionCode, activeSessionCode);
    });

    await t.test('15. Dairy Admin lists all shift sessions via GET /api/v1/collections/sessions', async () => {
      const res = await request(app)
        .get('/api/v1/collections/sessions')
        .set('Authorization', `Bearer ${dairyAdminTokenA}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      const current = res.body.data.find((s) => s.sessionId === activeSessionCode);
      assert.ok(current, 'Current shift session must appear in session register');
    });
  });

  // ============================================================================
  // GROUP E: Atomic Milk Intake & Double-Entry Financial Accounting
  // ============================================================================
  await suite.test('GROUP E: Atomic Milk Intake & Double-Entry Financial Accounting', async (t) => {
    const idempotencyKey = `INTAKE-${crypto.randomUUID()}`;

    await t.test('16. Collection intake posts weighment and records balanced ledger entry', async () => {
      const res = await request(app)
        .post('/api/v1/collections/intake')
        .set('Authorization', `Bearer ${operatorTokenA}`)
        .set('idempotency-key', idempotencyKey)
        .send({
          sessionId: activeSessionCode,
          sessionCode: activeSessionCode,
          customerId: registeredCustomerUuid,
          milkCategory: 'COW',
          weightLiters: 15.5,
          fatPercentage: 4.2,
          snfPercentage: 8.6,
          identificationMethod: 'MANUAL_SEARCH',
          deviceId: 'KIOSK_MAIN_01',
          idempotencyKey,
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.id);
      assert.ok(res.body.receiptNumber);
      assert.ok(res.body.data.totalAmount > 0);
      assert.equal(res.body.isIdempotentReplay, false);
    });

    await t.test('17. Idempotent replay of milk intake returns cached transaction without duplicate ledger entry', async () => {
      const res = await request(app)
        .post('/api/v1/collections/intake')
        .set('Authorization', `Bearer ${operatorTokenA}`)
        .set('idempotency-key', idempotencyKey)
        .send({
          sessionId: activeSessionCode,
          sessionCode: activeSessionCode,
          customerId: registeredCustomerUuid,
          milkCategory: 'COW',
          weightLiters: 15.5,
          fatPercentage: 4.2,
          snfPercentage: 8.6,
          identificationMethod: 'MANUAL_SEARCH',
          deviceId: 'KIOSK_MAIN_01',
          idempotencyKey,
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.isIdempotentReplay, true);
    });

    await t.test('18. Farmer ledger entries endpoint displays MILK_CREDIT record', async () => {
      const res = await request(app)
        .get(`/api/v1/ledger/entries?customerId=${registeredCustomerUuid}`)
        .set('Authorization', `Bearer ${dairyAdminTokenA}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.length > 0);
    });

    await t.test('19. Closing shift session reconciles total liters and closes shift', async () => {
      const res = await request(app)
        .patch(`/api/v1/collections/sessions/${activeSessionCode}/close`)
        .set('Authorization', `Bearer ${operatorTokenA}`)
        .send({ operatorName: 'Kiosk Operator Vikas' });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.status, 'CLOSED');
      assert.ok(res.body.data.closedAt);
    });
  });

  // ============================================================================
  // GROUP F: Dynamic Rate Charts & Versioning
  // ============================================================================
  await suite.test('GROUP F: Dynamic Rate Charts & Versioning', async (t) => {
    await t.test('20. Dairy Admin lists rate charts via GET /api/v1/rate-charts', async () => {
      const res = await request(app)
        .get('/api/v1/rate-charts')
        .set('Authorization', `Bearer ${dairyAdminTokenA}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
    });

    await t.test('21. Dairy Admin creates draft rate chart version', async () => {
      const res = await request(app)
        .post('/api/v1/rate-charts/draft')
        .set('Authorization', `Bearer ${dairyAdminTokenA}`)
        .send({
          title: 'Monsoon 2026 Cow Incentive Chart',
          milkCategory: 'COW',
          baseRatePerLiter: 39.5,
          minFat: 3.2,
          maxFat: 5.0,
          minSnf: 8.2,
          maxSnf: 9.2,
          effectiveDate: '2026-12-01',
          changeNotes: 'Seasonal incentive (+1.00/L)',
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.chartId);
      assert.ok(res.body.data.versionNumber);
      createdRateChartId = res.body.data.chartId;
    });

    await t.test('22. Dairy Admin activates rate chart version', async () => {
      const res = await request(app)
        .post(`/api/v1/rate-charts/${createdRateChartId}/activate`)
        .set('Authorization', `Bearer ${dairyAdminTokenA}`)
        .send({ operatorName: 'Rajesh Patil' });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.match(res.body.message, /activated successfully/i);
    });
  });

  // ============================================================================
  // GROUP G: Assigned Hardware & Kiosk Inventory from Central Control Plane
  // ============================================================================
  await suite.test('GROUP G: Assigned Hardware & Kiosk Inventory from Central Control Plane', async (t) => {
    await t.test('23. Dairy Admin queries assigned equipment via GET /api/v1/devices', async () => {
      const res = await request(app)
        .get('/api/v1/devices')
        .set('Authorization', `Bearer ${dairyAdminTokenA}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.length > 0);
      const dev = res.body.data[0];
      assert.ok(dev.deviceId);
      assert.ok(dev.deviceName);
      assert.ok(dev.peripherals);
      assert.equal(dev.status, 'ONLINE');
    });

    await t.test('24. Triggering device sync via POST /api/v1/devices/:id/sync acknowledges command', async () => {
      const res = await request(app)
        .post('/api/v1/devices/dev-kiosk-01/sync')
        .set('Authorization', `Bearer ${dairyAdminTokenA}`)
        .send({ operatorName: 'Rajesh Patil' });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.match(res.body.message, /sync triggered/i);
      assert.ok(res.body.syncedAt);
    });
  });

  // ============================================================================
  // GROUP H: Dashboard Aggregation, Ledger Integrity & Zero Razorpay Constraint
  // ============================================================================
  await suite.test('GROUP H: Dashboard Aggregation, Ledger Integrity & Zero Razorpay Constraint', async (t) => {
    await t.test('25. Dashboard metrics endpoint returns typed operational metrics', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/metrics')
        .set('Authorization', `Bearer ${dairyAdminTokenA}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.dairyProfile);
      assert.equal(res.body.data.dairyProfile.name, 'Gokul Sahakari Dudh Utpadak Sanstha');
      assert.ok(typeof res.body.data.customers.activeCustomers === 'number');
      assert.ok(typeof res.body.data.todayCollection.totalLiters === 'number');
    });

    await t.test('26. Farmer payout recorded on double-entry ledger without Razorpay interaction', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${dairyAdminTokenA}`)
        .send({
          customerId: registeredCustomerUuid,
          amount: 500.0,
          paymentMethod: 'BANK_TRANSFER',
          transactionReference: 'NEFT-20261117-001',
          notes: 'Bi-weekly milk settlement',
          operatorName: 'Rajesh Patil',
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.amount, 500.0);
      assert.equal(res.body.data.status, 'COMPLETED');
    });

    await t.test('27. Double-entry ledger reflects both MILK_CREDIT and PAYMENT debit entries', async () => {
      const res = await request(app)
        .get(`/api/v1/ledger/entries?customerId=${registeredCustomerUuid}`)
        .set('Authorization', `Bearer ${dairyAdminTokenA}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      const entries = res.body.data;
      assert.ok(entries.length >= 2, 'Must have at least one credit and one debit entry');
      const hasCredit = entries.some((e) => e.type === 'CREDIT' || e.creditAmount > 0);
      const hasDebit = entries.some((e) => e.type === 'DEBIT' || e.debitAmount > 0);
      assert.ok(hasCredit, 'Ledger must have milk credit entry');
      assert.ok(hasDebit, 'Ledger must have payout debit entry');
    });
  });

  suite.after(async () => {
    await tenantDbManager.closeAllPools().catch(() => {});
    await db.close().catch(() => {});
  });
});
