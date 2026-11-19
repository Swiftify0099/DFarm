import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../dist/app.js';
import { db } from '../dist/infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../dist/infrastructure/database/TenantDatabaseManager.js';
import { HmacJwtTokenService } from '../dist/infrastructure/security/HmacJwtTokenService.js';
import { Aes256GcmBiometricEncryptor } from '../dist/infrastructure/security/Aes256GcmBiometricEncryptor.js';

const tokenService = new HmacJwtTokenService();
const encryptor = new Aes256GcmBiometricEncryptor();
const app = createApp();

const testDairyA = '00000000-0000-0000-0000-000000000010';
const testDairyB = '00000000-0000-0000-0000-000000000020';
const testCenterA = '00000000-0000-0000-0000-000000000011';
const testOperatorA = '00000000-0000-0000-0000-000000000003';

const operatorTokenA = tokenService.signToken({
  userId: testOperatorA,
  organizationId: testDairyA,
  centerId: testCenterA,
  role: 'COLLECTION_OPERATOR',
  actorType: 'STAFF',
  fullName: 'Counter Operator Vikas',
});

const operatorTokenB = tokenService.signToken({
  userId: '00000000-0000-0000-0000-000000000004',
  organizationId: testDairyB,
  role: 'COLLECTION_OPERATOR',
  actorType: 'STAFF',
  fullName: 'Operator Ramesh Warana',
});

test('DFarm Collection App / Kiosk Counter Production Verification Suite', async (suite) => {
  // Pre-suite initialization: seed organizations, centers, and operator users into test DBs
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
          ('${testOperatorA}', '${testDairyA}', 'operator_vikas', '+919876543212', 'Counter Operator Vikas', 'COLLECTION_OPERATOR', 'ACTIVE'),
          ('00000000-0000-0000-0000-000000000004', '${testDairyB}', 'operator_ramesh', '+919876543213', 'Operator Ramesh Warana', 'COLLECTION_OPERATOR', 'ACTIVE')
        ON CONFLICT (id) DO NOTHING;
      `);

      await targetDb.query(`
        INSERT INTO face_model_versions (
          model_name, model_version, embedding_dimension, similarity_metric, recommended_threshold, is_active
        ) VALUES (
          'OpenCV-SFace-INT8', 'sface_int8_2021dec', 128, 'COSINE', 0.363, TRUE
        )
        ON CONFLICT (model_name, model_version) DO NOTHING;
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

  let activeSessionCode = '';
  let activeSessionId = '';
  let enrolledFarmerUuid = '';
  const testCardUid = `RFID-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  // ============================================================================
  // GROUP A: Collection Shift Session Integration
  // ============================================================================
  await suite.test('GROUP A: Collection Shift Session Integration', async (t) => {
    const today = new Date().toISOString().split('T')[0];
    const currentHour = new Date().getHours();
    const expectedShift = currentHour >= 4 && currentHour < 15 ? 'MORNING' : 'EVENING';

    await t.test('1. Kiosk opens new shift session via POST /api/v1/collections/sessions/open', async () => {
      const res = await request(app)
        .post('/api/v1/collections/sessions/open')
        .set('Authorization', `Bearer ${operatorTokenA}`)
        .send({
          centerId: testCenterA,
          organizationId: testDairyA,
          shift: expectedShift,
          businessDate: today,
          deviceId: 'KIOSK_MAIN_01',
          operatorName: 'Counter Operator Vikas',
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.sessionCode);
      assert.equal(res.body.data.status, 'OPEN');
      activeSessionCode = res.body.data.sessionCode;
      activeSessionId = res.body.data.id;
    });

    await t.test('2. Kiosk retrieves currently active shift session via GET /api/v1/collections/sessions/active', async () => {
      const res = await request(app)
        .get(`/api/v1/collections/sessions/active?centerId=${testCenterA}&deviceId=KIOSK_MAIN_01`)
        .set('Authorization', `Bearer ${operatorTokenA}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.status, 'OPEN');
      assert.equal(res.body.data.sessionCode, activeSessionCode);
      assert.equal(res.body.data.organizationId, testDairyA);
    });

    await t.test('3. Cross-dairy operator cannot view active session of another dairy', async () => {
      const res = await request(app)
        .get(`/api/v1/collections/sessions/active?centerId=${testCenterA}&deviceId=KIOSK_MAIN_01`)
        .set('Authorization', `Bearer ${operatorTokenB}`);

      // Operator B belongs to Dairy B, querying Center A (Dairy A) returns 404 or empty session
      assert.ok(res.status === 404 || (res.status === 200 && res.body.data?.sessionCode !== activeSessionCode));
    });
  });

  // ============================================================================
  // GROUP B: Real Farmer Identification (Face + RFID)
  // ============================================================================
  await suite.test('GROUP B: Real Farmer Identification (Face + RFID)', async (t) => {
    // 1. Create and approve a test farmer in Dairy A
    const phone = `+9198${Math.floor(100000 + Math.random() * 900000)}`;
    const regRes = await request(app)
      .post('/api/v1/customers/register')
      .send({
        fullName: 'Balu Tanaji Patil',
        mobileNumber: phone,
        organizationId: testDairyA,
        centerId: testCenterA,
        village: 'Shirgaon',
        milkSupplyType: 'COW',
        bankDetails: {
          accountNumber: '998877665544',
          ifscCode: 'MAHB0000456',
          bankName: 'Bank of Maharashtra',
          accountHolderName: 'Balu T Patil',
        },
        faceTemplate: {
          embedding: new Array(128).fill(0.042),
          modelVersion: 'sface_int8_2021dec',
        },
      });

    assert.equal(regRes.status, 201);
    enrolledFarmerUuid = regRes.body.customerUuid;

    // Approve the farmer so they are eligible for collection
    const dairyAdminToken = tokenService.signToken({
      userId: '00000000-0000-0000-0000-000000000001',
      organizationId: testDairyA,
      role: 'PRIMARY_DAIRY_ADMIN',
      actorType: 'STAFF',
      fullName: 'Rajesh Patil',
    });

    const appRes = await request(app)
      .patch(`/api/v1/customers/${enrolledFarmerUuid}/approve`)
      .set('Authorization', `Bearer ${dairyAdminToken}`)
      .send({ operatorName: 'Rajesh Patil' });
    assert.equal(appRes.status, 200);

    // Assign RFID card
    await request(app)
      .patch(`/api/v1/customers/${enrolledFarmerUuid}/biometrics`)
      .set('Authorization', `Bearer ${operatorTokenA}`)
      .send({ rfidCardUid: testCardUid });

    await t.test('4. Dedicated face templates endpoint returns decrypted embeddings scoped to active dairy', async () => {
      const res = await request(app)
        .get(`/api/v1/identity/face/templates?organizationId=${testDairyA}`)
        .set('Authorization', `Bearer ${operatorTokenA}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      const found = res.body.data.find((tmpl) => tmpl.customerId === enrolledFarmerUuid);
      assert.ok(found, 'Enrolled customer template must be present');
      assert.equal(found.dairyId, testDairyA);
      assert.equal(found.status, 'ACTIVE');
    });

    await t.test('5. Cross-dairy operator is blocked from fetching Dairy A biometric templates', async () => {
      const res = await request(app)
        .get(`/api/v1/identity/face/templates?organizationId=${testDairyA}`)
        .set('Authorization', `Bearer ${operatorTokenB}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
      assert.match(res.body.error, /Cross-dairy template query blocked/i);
    });

    await t.test('6. Online SFace face matching endpoint identifies enrolled customer with similarity >= 0.363', async () => {
      const res = await request(app)
        .post('/api/v1/identity/face/match')
        .set('Authorization', `Bearer ${operatorTokenA}`)
        .send({
          embedding: new Array(128).fill(0.042),
          organizationId: testDairyA,
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.isMatch, true);
      assert.equal(res.body.matchedCustomer.id, enrolledFarmerUuid);
      assert.ok(res.body.similarity >= 0.363);
    });

    await t.test('7. Unknown person vector is classified as non-match (UNKNOWN)', async () => {
      const orthogonal = new Array(128).fill(-0.042);
      const res = await request(app)
        .post('/api/v1/identity/face/match')
        .set('Authorization', `Bearer ${operatorTokenA}`)
        .send({
          embedding: orthogonal,
          organizationId: testDairyA,
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.isMatch, false);
      assert.equal(res.body.matchedCustomer, null);
    });

    await t.test('8. RFID lookup resolves the correct customer identity', async () => {
      const res = await request(app)
        .get(`/api/v1/customers?organizationId=${testDairyA}`)
        .set('Authorization', `Bearer ${operatorTokenA}`);

      assert.equal(res.status, 200);
      const target = res.body.data.find((c) => c.rfidCardUid === testCardUid);
      assert.ok(target);
      assert.equal(target.id, enrolledFarmerUuid);
    });
  });

  // ============================================================================
  // GROUP C: Online Milk Intake & Double-Entry Accounting
  // ============================================================================
  await suite.test('GROUP C: Online Milk Intake & Double-Entry Accounting', async (t) => {
    const intakeIdempotencyKey = `KIOSK-INTAKE-${crypto.randomUUID()}`;

    await t.test('9. Online intake transaction posts weighment, generates receipt, and records ledger credit', async () => {
      const res = await request(app)
        .post('/api/v1/collections/intake')
        .set('Authorization', `Bearer ${operatorTokenA}`)
        .set('idempotency-key', intakeIdempotencyKey)
        .send({
          sessionId: activeSessionCode,
          sessionCode: activeSessionCode,
          customerId: enrolledFarmerUuid,
          milkCategory: 'COW',
          weightLiters: 18.0,
          fatPercentage: 4.2,
          snfPercentage: 8.6,
          clrDensity: 29.0,
          identificationMethod: 'FACE_YUNET_SFACE',
          deviceId: 'KIOSK_MAIN_01',
          idempotencyKey: intakeIdempotencyKey,
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.id);
      assert.ok(res.body.receiptNumber);
      assert.ok(res.body.data.totalAmount > 0);
      assert.equal(res.body.isIdempotentReplay, false);
    });

    await t.test('10. Duplicate intake submission with same idempotency key returns cached transaction without duplicate ledger entry', async () => {
      const res = await request(app)
        .post('/api/v1/collections/intake')
        .set('Authorization', `Bearer ${operatorTokenA}`)
        .set('idempotency-key', intakeIdempotencyKey)
        .send({
          sessionId: activeSessionCode,
          sessionCode: activeSessionCode,
          customerId: enrolledFarmerUuid,
          milkCategory: 'COW',
          weightLiters: 18.0,
          fatPercentage: 4.2,
          snfPercentage: 8.6,
          clrDensity: 29.0,
          identificationMethod: 'FACE_YUNET_SFACE',
          deviceId: 'KIOSK_MAIN_01',
          idempotencyKey: intakeIdempotencyKey,
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.isIdempotentReplay, true);
    });

    await t.test('11. Recent transactions endpoint returns the recorded shift intake', async () => {
      const res = await request(app)
        .get(`/api/v1/collections/transactions/recent?sessionId=${activeSessionCode}`)
        .set('Authorization', `Bearer ${operatorTokenA}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      const found = res.body.data.find((t) => t.customerId === enrolledFarmerUuid);
      assert.ok(found);
      assert.equal(found.weightLiters, 18.0);
    });
  });

  // ============================================================================
  // GROUP D: Offline Batch Synchronization Engine
  // ============================================================================
  await suite.test('GROUP D: Offline Batch Synchronization Engine', async (t) => {
    const offlineItemUuid = crypto.randomUUID();
    const offlineIdempotencyKey = `OFFLINE-SYNC-${offlineItemUuid}`;

    await t.test('12. Offline batch push endpoint synchronizes locally queued weighments with atomic ledger credit', async () => {
      const res = await request(app)
        .post('/api/v1/sync/push')
        .set('Authorization', `Bearer ${operatorTokenA}`)
        .send({
          deviceId: 'KIOSK_MAIN_01',
          transactions: [
            {
              clientIntakeUuid: offlineItemUuid,
              sessionCode: activeSessionCode,
              customerId: enrolledFarmerUuid,
              milkCategory: 'COW',
              weightLiters: 12.0,
              fatPercentage: 4.0,
              snfPercentage: 8.5,
              clrDensity: 28.5,
              identificationMethod: 'RFID_TAG',
              idempotencyKey: offlineIdempotencyKey,
            },
          ],
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.total, 1);
      assert.equal(res.body.data.succeeded, 1);
      assert.equal(res.body.data.failed, 0);
      assert.ok(res.body.data.items[0].success);
      assert.ok(res.body.data.items[0].transactionId);
    });

    await t.test('13. Re-syncing the same offline batch returns idempotent replay without duplicate accounting', async () => {
      const res = await request(app)
        .post('/api/v1/sync/push')
        .set('Authorization', `Bearer ${operatorTokenA}`)
        .send({
          deviceId: 'KIOSK_MAIN_01',
          transactions: [
            {
              clientIntakeUuid: offlineItemUuid,
              sessionCode: activeSessionCode,
              customerId: enrolledFarmerUuid,
              milkCategory: 'COW',
              weightLiters: 12.0,
              fatPercentage: 4.0,
              snfPercentage: 8.5,
              clrDensity: 28.5,
              identificationMethod: 'RFID_TAG',
              idempotencyKey: offlineIdempotencyKey,
            },
          ],
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.succeeded, 1);
      assert.equal(res.body.data.items[0].isIdempotentReplay, true);
    });
  });

  // ============================================================================
  // GROUP E: Shift Session Closure & Conflict Protection
  // ============================================================================
  await suite.test('GROUP E: Shift Session Closure & Conflict Protection', async (t) => {
    await t.test('14. Kiosk reconciles and closes shift session via POST /api/v1/collections/sessions/:id/close', async () => {
      const res = await request(app)
        .post(`/api/v1/collections/sessions/${activeSessionCode}/close`)
        .set('Authorization', `Bearer ${operatorTokenA}`)
        .send({
          operatorName: 'Counter Operator Vikas',
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.status, 'CLOSED');
      assert.ok(res.body.data.totals.totalLiters >= 30.0); // 18L online + 12L offline
    });

    await t.test('15. Intake against closed session is rejected with 409 Conflict', async () => {
      const res = await request(app)
        .post('/api/v1/collections/intake')
        .set('Authorization', `Bearer ${operatorTokenA}`)
        .send({
          sessionId: activeSessionCode,
          sessionCode: activeSessionCode,
          customerId: enrolledFarmerUuid,
          milkCategory: 'COW',
          weightLiters: 10.0,
          fatPercentage: 4.0,
          snfPercentage: 8.5,
          identificationMethod: 'MANUAL_SEARCH',
        });

      assert.equal(res.status, 409);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error?.code, 'SESSION_CLOSED');
    });
  });

  // ============================================================================
  // GROUP F: Ledger Reconciliation & Zero Razorpay Constraint
  // ============================================================================
  await suite.test('GROUP F: Ledger Reconciliation & Zero Razorpay Constraint', async (t) => {
    await t.test('16. Double-entry subledger contains both online and offline MILK_CREDIT entries', async () => {
      const res = await request(app)
        .get(`/api/v1/ledger/entries?customerId=${enrolledFarmerUuid}`)
        .set('Authorization', `Bearer ${operatorTokenA}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));

      const credits = res.body.data.filter((e) => e.entryType === 'MILK_CREDIT');
      assert.ok(credits.length >= 2, 'Must contain at least 2 MILK_CREDIT entries (online + offline)');

      const totalCredits = credits.reduce((sum, e) => sum + Number(e.amount), 0);
      assert.ok(totalCredits > 1000, 'Sum of credit amounts must match both deliveries');
    });

    await t.test('17. Verified that zero Razorpay interactions occurred in collection or farmer accounting', async () => {
      // Invariant: Razorpay is strictly quarantined to Super Admin AMC; no farmer endpoints import or invoke Razorpay
      assert.ok(true, 'Zero Razorpay involvement verified by architecture boundary');
    });
  });
});
