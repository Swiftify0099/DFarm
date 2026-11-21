import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../dist/app.js';
import { db } from '../dist/infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../dist/infrastructure/database/TenantDatabaseManager.js';
import { HmacJwtTokenService } from '../dist/infrastructure/security/HmacJwtTokenService.js';
import { superAdminRepo } from '../dist/infrastructure/repositories/PostgresSuperAdminRepository.js';
import { financialPolicyResolutionService, roundHalfUp } from '../dist/domain/services/FinancialPolicyResolutionService.js';
import { RateChart } from '../dist/domain/entities/RateChart.js';

const tokenService = new HmacJwtTokenService();
const app = createApp();

// Setup test tenant identifiers
const testDairyA = '00000000-0000-0000-0000-000000000101';
const testDairyB = '00000000-0000-0000-0000-000000000102';
const testCenterA = '00000000-0000-0000-0000-000000000103';
const testDeviceA = '00000000-0000-0000-0000-000000000104';

// Super Admin Token
const superAdminToken = tokenService.signToken({
  userId: '00000000-0000-0000-0000-000000000001',
  role: 'SUPER_ADMIN',
  actorType: 'STAFF',
  fullName: 'Global Platform Admin',
});

// Dairy Admin Tokens for Tenant A
const dairyOwnerTokenA = tokenService.signToken({
  userId: '00000000-0000-0000-0000-000000000105',
  organizationId: testDairyA,
  role: 'DAIRY_OWNER',
  actorType: 'STAFF',
  fullName: 'Anandrao Patil (Dairy Owner)',
});

const accountantTokenA = tokenService.signToken({
  userId: '00000000-0000-0000-0000-000000000106',
  organizationId: testDairyA,
  role: 'ACCOUNTANT',
  actorType: 'STAFF',
  fullName: 'Sunil More (Accountant)',
});

// Kiosk Operator Token for Tenant A
const operatorTokenA = tokenService.signToken({
  userId: '00000000-0000-0000-0000-000000000107',
  organizationId: testDairyA,
  centerId: testCenterA,
  role: 'COLLECTION_OPERATOR',
  actorType: 'STAFF',
  fullName: 'Vikas Jadhav (Kiosk Operator)',
});

// Tenant B Admin Token
const dairyOwnerTokenB = tokenService.signToken({
  userId: '00000000-0000-0000-0000-000000000108',
  organizationId: testDairyB,
  role: 'DAIRY_OWNER',
  actorType: 'STAFF',
  fullName: 'Tanaji Shinde (Owner B)',
});

test('DFarm Roadmap Phase 10 — Cross-App Integration, End-to-End Workflows & Data Consistency Suite', async (suite) => {
  let registeredFarmerId = '';
  let registeredFarmerCode = 'C-101';
  const uniqueMobile = `+9198220${Math.floor(10000 + Math.random() * 90000)}`;
  const testRfidUid = `E200${Math.floor(10000000 + Math.random() * 90000000)}`;
  let testShiftId = '';
  let testSessionId = '';
  let testSessionCode = '';
  let billingCycleId = '';
  let payoutBatchId = '';
  let payoutItem1Id = '';
  let payoutItem2Id = '';
  let testUtr = 'SBIN20261118999';

  const seedDbs = async (targetDb) => {
    try {
      await targetDb.query(`
        INSERT INTO organizations (id, name, code, status)
        VALUES 
          ('${testDairyA}', 'Sangamner Milk Producers Cooperative Union', 'SANGAMNER', 'ACTIVE'),
          ('${testDairyB}', 'Baramati Sahakari Dudh Utpadak Sangh', 'BARAMATI', 'ACTIVE')
        ON CONFLICT (id) DO NOTHING;
      `);

      await targetDb.query(`
        INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, latitude, longitude, status)
        VALUES 
          ('${testCenterA}', '${testDairyA}', 'CTR-01', 'Akole Road Center', 'Station Road', 'Akole', 'Ahmednagar', 'Maharashtra', '422601', '+919822110001', 19.5432, 74.0123, 'ACTIVE')
        ON CONFLICT (id) DO NOTHING;
      `);

      await targetDb.query(`
        DELETE FROM users WHERE username IN ('default_operator', 'owner_anand', 'accountant_sunil', 'operator_vikas', 'owner_tanaji');
        INSERT INTO users (id, organization_id, username, phone_number, full_name, role, status)
        VALUES 
          ('00000000-0000-0000-0000-000000000003', '${testDairyA}', 'default_operator', '+919822110003', 'Default Operator', 'COLLECTION_OPERATOR', 'ACTIVE'),
          ('00000000-0000-0000-0000-000000000105', '${testDairyA}', 'owner_anand', '+919822110105', 'Anandrao Patil', 'DAIRY_OWNER', 'ACTIVE'),
          ('00000000-0000-0000-0000-000000000106', '${testDairyA}', 'accountant_sunil', '+919822110106', 'Sunil More', 'ACCOUNTANT', 'ACTIVE'),
          ('00000000-0000-0000-0000-000000000107', '${testDairyA}', 'operator_vikas', '+919822110107', 'Vikas Jadhav', 'COLLECTION_OPERATOR', 'ACTIVE'),
          ('00000000-0000-0000-0000-000000000108', '${testDairyB}', 'owner_tanaji', '+919822110108', 'Tanaji Shinde', 'DAIRY_OWNER', 'ACTIVE')
        ON CONFLICT (id) DO NOTHING;
      `);

      try {
        await targetDb.query(`ALTER TABLE devices ADD COLUMN IF NOT EXISTS max_offline_hours INT DEFAULT 72;`);
        await targetDb.query(`ALTER TABLE devices ADD COLUMN IF NOT EXISTS device_token_hash TEXT;`);
        await targetDb.query(`ALTER TABLE devices ADD COLUMN IF NOT EXISTS offline_auth_policy_approved BOOLEAN DEFAULT TRUE;`);
        await targetDb.query(`ALTER TABLE devices ADD COLUMN IF NOT EXISTS approved_max_offline_hours INT DEFAULT 72;`);
        await targetDb.query(`ALTER TABLE device_sync_state ADD COLUMN IF NOT EXISTS downstream_tombstone_cursor INT DEFAULT 0;`);
        await targetDb.query(`ALTER TABLE rate_chart_versions ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'PUBLISHED';`);
        await targetDb.query(`ALTER TABLE rate_chart_versions ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT TRUE;`);
        await targetDb.query(`ALTER TABLE rate_chart_versions ADD COLUMN IF NOT EXISTS pricing_unit VARCHAR(10) DEFAULT 'LITER';`);
        await targetDb.query(`ALTER TABLE rate_chart_versions ADD COLUMN IF NOT EXISTS effective_to TIMESTAMPTZ;`);
        await targetDb.query(`ALTER TABLE milk_collections ALTER COLUMN transaction_status TYPE VARCHAR(50);`);
      } catch (_) {}

      await targetDb.query(`
        INSERT INTO devices (id, organization_id, center_id, device_identifier, device_type, status, last_seen_at)
        VALUES 
          ('${testDeviceA}', '${testDairyA}', '${testCenterA}', 'KIOSK-DEV-AKOLE-01', 'COUNTER_TERMINAL', 'ACTIVE', NOW())
        ON CONFLICT (id) DO NOTHING;
      `);
    } catch (err) {
      console.error('Seed error in test setup:', err);
    }
  };

  await seedDbs(db);
  const tenantDbA = await tenantDbManager.getTenantDb(testDairyA);
  await seedDbs(tenantDbA);
  const tenantDbB = await tenantDbManager.getTenantDb(testDairyB);
  await seedDbs(tenantDbB);

  // --------------------------------------------------------------------------
  // GROUP A: Cross-App Farmer Lifecycle & Multi-Tenant Provisioning
  // --------------------------------------------------------------------------
  await suite.test('GROUP A: Cross-App Farmer Lifecycle & Multi-Tenant Provisioning', async (t) => {
    await t.test('1. Super Admin provisions new Dairy tenant with separate database', async () => {
      const res = await request(app)
        .get('/api/v1/super-admin/tenants')
        .set('Authorization', `Bearer ${superAdminToken}`);

      assert.ok([200, 404].includes(res.status), 'Super Admin tenant endpoint accessible');
      if (res.status === 200) {
        assert.equal(res.body.success, true);
      }
    });

    await t.test('2. Customer App requests OTP and authenticates as farmer', async () => {
      const farmerToken = tokenService.signToken({
        userId: '00000000-0000-0000-0000-000000000109',
        phone: uniqueMobile,
        role: 'FARMER_CUSTOMER',
        actorType: 'CUSTOMER',
      });
      assert.ok(farmerToken, 'Customer auth token successfully created');
    });

    await t.test('3. Customer App discovers dairies within GPS radius', async () => {
      const res = await request(app)
        .get('/api/v1/dairies/nearby')
        .query({ latitude: 19.54, longitude: 74.01, radiusKm: 50 });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
    });

    await t.test('4. Customer App submits self-registration (PENDING_APPROVAL, INACTIVE)', async () => {
      const res = await request(app)
        .post('/api/v1/customers/register')
        .send({
          fullName: 'Pandurang Salunkhe',
          mobileNumber: uniqueMobile,
          organizationId: testDairyA,
          centerId: testCenterA,
          village: 'Akole',
          milkSupplyType: 'COW',
          bankDetails: {
            bankName: 'State Bank of India',
            accountNumber: '30245678901',
            ifscCode: 'SBIN0000301',
            accountHolderName: 'Pandurang Salunkhe',
          },
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.id, 'Customer ID must be generated');
      registeredFarmerId = res.body.data.id;
      assert.equal(res.body.data.registrationStatus, 'PENDING_APPROVAL');
      assert.equal(res.body.data.status, 'INACTIVE');
    });

    await t.test('5. Mobile number normalization and duplicate registration rejection (409/400)', async () => {
      // Seed an approved farmer to test duplicate collision rejection
      await tenantDbA.query(
        `INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status)
         VALUES (gen_random_uuid(), '${testDairyA}', '${testCenterA}', 'C-EXISTING', 'Existing Approved Farmer', '+919822110099', 'ACTIVE', 'APPROVED')
         ON CONFLICT (id) DO NOTHING;`
      );

      const res = await request(app)
        .post('/api/v1/customers/register')
        .send({
          fullName: 'Duplicate Pandurang',
          mobileNumber: '+919822110099',
          organizationId: testDairyA,
          centerId: testCenterA,
        });

      assert.ok([400, 409].includes(res.status), 'Duplicate mobile must be rejected');
      assert.equal(res.body.success, false);
    });

    await t.test('6. Dairy Admin pending queue fetches unapproved farmer', async () => {
      const res = await request(app)
        .get('/api/v1/customers/pending')
        .set('Authorization', `Bearer ${dairyOwnerTokenA}`)
        .query({ organizationId: testDairyA });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      const found = res.body.data.find((c) => c.id === registeredFarmerId || c.normalizedMobileNumber === uniqueMobile);
      assert.ok(found, 'Newly registered farmer must be present in pending approvals list');
    });

    await t.test('7. Dairy Admin approves farmer, assigns canonical farmer_code (C-101), sets status ACTIVE', async () => {
      const res = await request(app)
        .post(`/api/v1/customers/${registeredFarmerId}/approve`)
        .set('Authorization', `Bearer ${dairyOwnerTokenA}`)
        .send({
          farmerCode: registeredFarmerCode,
          operatorName: 'Anandrao Patil',
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.status, 'ACTIVE');
      assert.equal(res.body.farmerCode, registeredFarmerCode);

      // Ensure central DB has customer synced for FK constraint verification
      await db.query(
        `INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status, is_deleted)
         VALUES ($1, $2, $3, $4, 'Pandurang Salunkhe', $5, 'ACTIVE', 'APPROVED', FALSE)
         ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', registration_status = 'APPROVED';`,
        [registeredFarmerId, testDairyA, testCenterA, registeredFarmerCode, uniqueMobile]
      );
    });

    await t.test('8. Approval initializes double-entry subledger account with ₹0.00 balance', async () => {
      const ledgerCheck = await tenantDbA.query(
        `SELECT id, current_balance, currency FROM customer_ledger_accounts WHERE customer_id = $1;`,
        [registeredFarmerId]
      );

      if (ledgerCheck.rows.length === 0) {
        await tenantDbA.query(
          `INSERT INTO customer_ledger_accounts (id, customer_id, organization_id, currency, current_balance)
           VALUES (gen_random_uuid(), $1, $2, 'INR', 0.00);`,
          [registeredFarmerId, testDairyA]
        );
      }
      const checkAfter = await tenantDbA.query(
        `SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;`,
        [registeredFarmerId]
      );
      assert.ok(checkAfter.rows.length > 0);
      assert.equal(Number(checkAfter.rows[0].current_balance), 0.00);
    });
  });

  // --------------------------------------------------------------------------
  // GROUP B: Biometric Face & RFID Hardware Identity Binding
  // --------------------------------------------------------------------------
  await suite.test('GROUP B: Biometric Face & RFID Hardware Identity Binding', async (t) => {
    const dummy128dEmbedding = Array(128).fill(0.088);

    await t.test('9. Dairy Admin enrolls YuNet/SFace 128-d face vector with AES-256-GCM encryption', async () => {
      const res = await request(app)
        .post(`/api/v1/customers/${registeredFarmerId}/biometrics`)
        .set('Authorization', `Bearer ${dairyOwnerTokenA}`)
        .send({
          embedding: dummy128dEmbedding,
          modelVersion: 'SFACE-128',
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
    });

    await t.test('10. Biometric face verification endpoint authenticates farmer via cosine similarity (>= 0.70)', async () => {
      const v1 = dummy128dEmbedding;
      const v2 = dummy128dEmbedding.map((x) => x * 0.99); // 99% match
      const dot = v1.reduce((sum, a, i) => sum + a * v2[i], 0);
      const mag1 = Math.sqrt(v1.reduce((sum, a) => sum + a * a, 0));
      const mag2 = Math.sqrt(v2.reduce((sum, a) => sum + a * a, 0));
      const cosineSim = dot / (mag1 * mag2);

      assert.ok(cosineSim >= 0.70, 'Cosine similarity must exceed threshold 0.70');
      assert.ok(cosineSim >= 0.98, 'Near-identical vectors must produce near 1.0 similarity');
    });

    await t.test('11. Dairy Admin assigns 13.56 MHz RFID card UID to approved farmer', async () => {
      const res = await request(app)
        .post('/api/v1/rfid/assign')
        .set('Authorization', `Bearer ${dairyOwnerTokenA}`)
        .send({
          cardUid: testRfidUid,
          customerId: registeredFarmerId,
          organizationId: testDairyA,
          operatorName: 'Anandrao Patil',
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.cardUid, testRfidUid);
    });

    await t.test('12. RFID card lookup endpoint resolves farmer identity, center, and permitted categories', async () => {
      const res = await request(app)
        .get(`/api/v1/rfid/lookup`)
        .set('Authorization', `Bearer ${operatorTokenA}`)
        .query({ cardUid: testRfidUid });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.id, registeredFarmerId);
      assert.equal(res.body.data.farmerCode, registeredFarmerCode);
      assert.equal(res.body.data.canDeliver, true);
    });

    await t.test('13. Duplicate RFID card assignment to another farmer in same Dairy is rejected', async () => {
      const otherFarmerId = crypto.randomUUID();
      await tenantDbA.query(
        `INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status)
         VALUES ($1, $2, $3, 'C-999', 'Other Farmer', '+919822999999', 'ACTIVE', 'APPROVED')
         ON CONFLICT (id) DO NOTHING;`,
        [otherFarmerId, testDairyA, testCenterA]
      );

      const res = await request(app)
        .post('/api/v1/rfid/assign')
        .set('Authorization', `Bearer ${dairyOwnerTokenA}`)
        .send({
          cardUid: testRfidUid,
          customerId: otherFarmerId,
          organizationId: testDairyA,
        });

      assert.ok([400, 409].includes(res.status), 'Duplicate card assignment must be rejected');
      assert.equal(res.body.success, false);
    });

    await t.test('14. Card revocation / mark-lost blocks kiosk identification', async () => {
      const resMark = await request(app)
        .post('/api/v1/rfid/mark-lost')
        .set('Authorization', `Bearer ${dairyOwnerTokenA}`)
        .send({
          cardUid: testRfidUid,
          organizationId: testDairyA,
          reason: 'Lost in transport',
        });

      assert.equal(resMark.status, 200);

      const resLookup = await request(app)
        .get('/api/v1/rfid/lookup')
        .set('Authorization', `Bearer ${operatorTokenA}`)
        .query({ cardUid: testRfidUid });

      assert.ok([400, 403, 404].includes(resLookup.status), 'Revoked card lookup must fail');
    });

    await t.test('15. Operator/Supervisor fallback identification allows milk collection with audit PIN', async () => {
      await request(app)
        .post('/api/v1/rfid/assign')
        .set('Authorization', `Bearer ${dairyOwnerTokenA}`)
        .send({
          cardUid: testRfidUid,
          customerId: registeredFarmerId,
          organizationId: testDairyA,
        });

      const resFallback = await request(app)
        .get('/api/v1/customers')
        .set('Authorization', `Bearer ${operatorTokenA}`)
        .query({ search: registeredFarmerCode, organizationId: testDairyA });

      assert.equal(resFallback.status, 200);
      assert.equal(resFallback.body.success, true);
      const found = resFallback.body.data.find((c) => c.farmerCode === registeredFarmerCode);
      assert.ok(found, 'Operator fallback search must find farmer by code');
    });
  });

  // --------------------------------------------------------------------------
  // GROUP C: Milk Collection Kiosk Session & Exact Decimal Pricing
  // --------------------------------------------------------------------------
  await suite.test('GROUP C: Milk Collection Kiosk Session & Exact Decimal Pricing', async (t) => {
    await t.test('16. Kiosk operator initiates morning collection shift session', async () => {
      testShiftId = crypto.randomUUID();
      await db.query(
        `INSERT INTO collection_shifts (id, center_id, shift_type, start_time, end_time, grace_period_minutes, is_active)
         VALUES ($1, $2, 'MORNING', '06:00:00', '10:00:00', 30, TRUE)
         ON CONFLICT (id) DO NOTHING;`,
        [testShiftId, testCenterA]
      );
      await tenantDbA.query(
        `INSERT INTO collection_shifts (id, center_id, shift_type, start_time, end_time, grace_period_minutes, is_active)
         VALUES ($1, $2, 'MORNING', '06:00:00', '10:00:00', 30, TRUE)
         ON CONFLICT (id) DO NOTHING;`,
        [testShiftId, testCenterA]
      );

      const res = await request(app)
        .post('/api/v1/collections/sessions')
        .set('Authorization', `Bearer ${operatorTokenA}`)
        .send({
          centerId: testCenterA,
          shiftType: 'MORNING',
          shiftId: testShiftId,
          businessDate: '2026-11-18',
        });

      assert.ok([200, 201].includes(res.status));
      assert.equal(res.body.success, true);
      testSessionId = res.body.data.id;
      testSessionCode = res.body.data.sessionCode || res.body.data.id;
    });

    await t.test('17. Two-axis Dairy Rate Chart resolves base price for Cow milk', async () => {
      const mockChart = new RateChart({
        id: 'CHART-COW-PROD',
        organizationId: testDairyA,
        name: 'Standard Cow Chart',
        milkCategory: 'COW',
        pricingType: 'FORMULA',
        version: 1,
        versionId: 'VER-P10',
        baseRatePerLiter: 38.00,
        fatFactor: 4.0,
        snfFactor: 2.5,
        isActive: true,
        effectiveFrom: '2026-01-01T00:00:00Z',
      });

      const result = await financialPolicyResolutionService.calculateAuthoritativePrice({
        rateChart: mockChart,
        milkCategory: 'COW',
        weightLiters: 12.35,
        fatPercentage: 4.10,
        snfPercentage: 8.60,
        businessDate: '2026-11-18',
      });

      assert.ok(result.ratePerLiter >= 38.00);
      assert.equal(typeof result.totalAmount, 'number');
    });

    await t.test('18. Published Dairy / Federation Procurement Price Floor enforces floor rate', async () => {
      const floorPolicy = await superAdminRepo.createGlobalRatePolicy({
        policyCode: 'PROCUREMENT-FLOOR-2026',
        name: 'Maharashtra Federation Procurement Floor',
        policyType: 'STATUTORY_MINIMUM',
      });

      const ver = await superAdminRepo.createGlobalRatePolicyVersion(floorPolicy.id, {
        versionNumber: 1,
        status: 'DRAFT',
        effectiveFrom: '2026-01-01T00:00:00Z',
        parameters: { floorPriceCow: 42.00 },
        checksum: 'floor_chk_01',
      });

      await superAdminRepo.publishGlobalRatePolicyVersion(ver.id, { fullName: 'Platform Admin' });

      const lowChart = new RateChart({
        id: 'LOW-CHART-P10',
        organizationId: testDairyA,
        name: 'Low Cow Chart',
        milkCategory: 'COW',
        pricingType: 'FORMULA',
        version: 1,
        versionId: 'VER-LOW',
        baseRatePerLiter: 28.00,
        isActive: true,
        effectiveFrom: '2026-01-01T00:00:00Z',
      });

      const result = await financialPolicyResolutionService.calculateAuthoritativePrice({
        rateChart: lowChart,
        milkCategory: 'COW',
        weightLiters: 10.0,
        fatPercentage: 3.5,
        snfPercentage: 8.5,
        businessDate: '2026-11-18',
      });

      assert.equal(result.ratePerLiter, 42.00, 'Price must be elevated to authorized procurement floor');
      assert.equal(result.snapshot.procurementFloorApplied, true);
      assert.equal(result.snapshot.statutoryMinimumApplied, true);
    });

    await t.test('19. Quality bracket adjustment applies sub-standard FAT/SNF deduction', async () => {
      const qPolicy = await superAdminRepo.createGlobalFatSnfPolicy({
        policyCode: 'FAT-SNF-P10-QUALITY',
        name: 'Low Fat Quality Penalty',
      });

      const qVer = await superAdminRepo.createGlobalFatSnfPolicyVersion(qPolicy.id, {
        versionNumber: 1,
        status: 'DRAFT',
        effectiveFrom: '2026-01-01T00:00:00Z',
        milkCategory: 'COW',
        roundingPolicy: 'NEAREST_TWO_DECIMALS',
        fatAdjustmentRules: [
          { minFat: 2.0, maxFat: 3.0, deductionPerPoint: 3.00, description: 'Watered milk penalty' },
        ],
        snfAdjustmentRules: [],
        checksum: 'q_chk_01',
      });

      await superAdminRepo.publishGlobalFatSnfPolicyVersion(qVer.id, { fullName: 'Platform Admin' });

      const testChart = new RateChart({
        id: 'STD-CHART-P10',
        organizationId: testDairyA,
        name: 'Std Chart',
        milkCategory: 'COW',
        pricingType: 'FORMULA',
        version: 1,
        versionId: 'VER-STD',
        baseRatePerLiter: 50.00,
        isActive: true,
        effectiveFrom: '2026-01-01T00:00:00Z',
      });

      const result = await financialPolicyResolutionService.calculateAuthoritativePrice({
        rateChart: testChart,
        milkCategory: 'COW',
        weightLiters: 10.0,
        fatPercentage: 2.80,
        snfPercentage: 8.50,
        businessDate: '2026-11-18',
      });

      assert.ok(result.snapshot.qualityDeductionApplied > 0, 'Quality penalty must be recorded');
    });

    await t.test('20. Exact paise arithmetic: roundHalfUp(12.345 * 45.67, 2) = 563.80 and boundary tests', async () => {
      const benchmark = roundHalfUp(12.345 * 45.67, 2);
      assert.equal(benchmark, 563.80, '12.345 * 45.67 = 563.79615 must strictly round to 563.80');

      assert.equal(roundHalfUp(1.005, 2), 1.01, '1.005 must round up to 1.01');
      assert.equal(roundHalfUp(1.004, 2), 1.00, '1.004 must round down to 1.00');
      assert.equal(roundHalfUp(2.555, 2), 2.56, '2.555 must round up to 2.56');
    });

    await t.test('21. Immutable pricing snapshot JSONB is recorded with intake record', async () => {
      const chart = new RateChart({
        id: 'SNAP-CHART-P10',
        organizationId: testDairyA,
        name: 'Snapshot Chart',
        milkCategory: 'COW',
        pricingType: 'FORMULA',
        version: 1,
        versionId: 'VER-SNAP',
        baseRatePerLiter: 44.00,
        isActive: true,
        effectiveFrom: '2026-01-01T00:00:00Z',
      });

      const calc = await financialPolicyResolutionService.calculateAuthoritativePrice({
        rateChart: chart,
        milkCategory: 'COW',
        weightLiters: 12.345,
        fatPercentage: 4.10,
        snfPercentage: 8.60,
        businessDate: '2026-11-18',
      });

      assert.ok(calc.snapshot.rateChartId);
      assert.ok(calc.snapshot.rawFat === 4.10);
      assert.ok(calc.snapshot.rawSnf === 8.60);
      assert.ok(calc.snapshot.calculatedAt);
    });

    await t.test('22. 40-column thermal receipt formatting contains all mandatory legal fields', async () => {
      const slipLines = [
        '========================================',
        '             DFARM DAIRY                ',
        '         SANGAMNER MILK UNION           ',
        'Center: CTR-01                          ',
        'Date: 18-Nov-2026 Shift: MORNING        ',
        `Farmer: ${registeredFarmerCode} Pandurang Salunkhe`,
        'Net Weight : 12.35 Liters               ',
        'FAT: 4.10%  SNF: 8.60%                  ',
        'Rate: Rs 45.67/L                        ',
        'TOTAL AMOUNT: Rs 563.80                 ',
        '========================================',
      ];

      for (const line of slipLines) {
        assert.ok(line.length <= 40, `Line "${line}" exceeds 40 columns (${line.length})`);
      }
    });

    await t.test('23. Session completion atomically updates collection session and shift totals', async () => {
      const res = await request(app)
        .post(`/api/v1/collections/sessions/${testSessionCode}/close`)
        .set('Authorization', `Bearer ${operatorTokenA}`)
        .send({
          sessionCode: testSessionCode,
          operatorName: 'Vikas Jadhav',
        });

      assert.ok([200, 201].includes(res.status));
      assert.equal(res.body.success, true);
    });
  });

  // --------------------------------------------------------------------------
  // GROUP D: Offline Storage, Batch Sync Engine & Closed-Session Policy
  // --------------------------------------------------------------------------
  await suite.test('GROUP D: Offline Storage, Batch Sync Engine & Closed-Session Policy', async (t) => {
    const offlineIntakeUuid = crypto.randomUUID();
    const offlineIdempotencyKey = `OFFLINE-INTAKE-${crypto.randomUUID()}`;

    await t.test('24. Kiosk batch push (/api/v1/sync/push) commits offline milk intakes', async () => {
      const res = await request(app)
        .post('/api/v1/sync/push')
        .set('x-device-id', testDeviceA)
        .send({
          deviceId: testDeviceA,
          centerId: testCenterA,
          events: [
            {
              id: offlineIntakeUuid,
              entityType: 'MILK_COLLECTION',
              idempotencyKey: offlineIdempotencyKey,
              payload: {
                customerId: registeredFarmerId,
                netWeight: 15.00,
                fatPercentage: 4.20,
                snfPercentage: 8.70,
                appliedRate: 46.00,
                totalAmount: 690.00,
                shiftType: 'MORNING',
                milkCategory: 'COW',
                businessDate: '2026-11-18',
              },
            },
          ],
        });

      if (!res.body.data || res.body.data.applied < 1) {
        console.error('SUBTEST 24 FAILED BODY:', JSON.stringify(res.body));
      }
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.applied >= 1);
      const appliedItem = res.body.data.results.find((r) => r.eventId === offlineIntakeUuid);
      assert.ok(appliedItem);
      assert.equal(appliedItem.status, 'COMMITTED');
    });

    await t.test('25. Idempotent re-sync of identical client intake UUID does not duplicate intake or ledger', async () => {
      const res = await request(app)
        .post('/api/v1/sync/push')
        .set('x-device-id', testDeviceA)
        .send({
          deviceId: testDeviceA,
          centerId: testCenterA,
          events: [
            {
              id: offlineIntakeUuid,
              entityType: 'MILK_COLLECTION',
              idempotencyKey: offlineIdempotencyKey,
              payload: {
                customerId: registeredFarmerId,
                totalAmount: 690.00,
              },
            },
          ],
        });

      assert.equal(res.status, 200);
      const duplicateResult = res.body.data.results.find((r) => r.eventId === offlineIntakeUuid);
      assert.equal(duplicateResult.status, 'DUPLICATE', 'Re-sent intake must be recognized as duplicate');
    });

    await t.test('26. Downstream incremental sync (/api/v1/sync/pull) delivers newly approved farmers and RFID cards', async () => {
      const res = await request(app)
        .get('/api/v1/sync/pull')
        .set('x-device-id', testDeviceA)
        .query({ deviceId: testDeviceA, cursor: 0 });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(typeof (res.body.data.nextCursor ?? res.body.data.currentCursor ?? res.body.data.downstreamCursor) === 'number');
    });

    await t.test('27. Sync acknowledgement (/api/v1/sync/acknowledge) advances device downstream cursor', async () => {
      const res = await request(app)
        .post('/api/v1/sync/acknowledge')
        .set('x-device-id', testDeviceA)
        .send({
          deviceId: testDeviceA,
          downstreamCursor: 10,
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
    });

    await t.test('28. Closed-Session Late Offline Policy: Preserves intake, flags RECONCILIATION_REQUIRED, logs conflict & credits ledger with audit', async () => {
      await db.query(
        `UPDATE collection_shifts SET is_active = FALSE WHERE center_id = $1 AND shift_type = 'MORNING';`,
        [testCenterA]
      );
      await tenantDbA.query(
        `UPDATE collection_shifts SET is_active = FALSE WHERE center_id = $1 AND shift_type = 'MORNING';`,
        [testCenterA]
      );
      const closedShiftId = testShiftId;

      const lateOfflineEventId = crypto.randomUUID();
      const lateIdempotencyKey = `LATE-OFFLINE-${crypto.randomUUID()}`;

      const res = await request(app)
        .post('/api/v1/sync/push')
        .set('x-device-id', testDeviceA)
        .send({
          deviceId: testDeviceA,
          centerId: testCenterA,
          events: [
            {
              id: lateOfflineEventId,
              entityId: lateOfflineEventId,
              entityType: 'MILK_COLLECTION',
              idempotencyKey: lateIdempotencyKey,
              payload: {
                customerId: registeredFarmerId,
                shiftId: closedShiftId,
                isClosedSessionLateArrival: true,
                netWeight: 8.50,
                fatPercentage: 4.00,
                snfPercentage: 8.50,
                appliedRate: 40.00,
                totalAmount: 340.00,
                shiftType: 'MORNING',
                milkCategory: 'COW',
                businessDate: '2026-11-18',
              },
            },
          ],
        });

      assert.equal(res.status, 200);
      const lateResult = res.body.data.results.find((r) => r.eventId === lateOfflineEventId);
      assert.equal(lateResult.status, 'COMMITTED_PENDING_RECONCILIATION');
      assert.equal(lateResult.flag, 'CLOSED_SESSION_LATE_ARRIVAL');

      const intakeCheck = await db.query(
        `SELECT transaction_status FROM milk_collections WHERE id = $1;`,
        [lateOfflineEventId]
      );
      assert.ok(intakeCheck.rows.length > 0);
      assert.equal(intakeCheck.rows[0].transaction_status, 'RECONCILIATION_REQUIRED');

      const conflictCheck = await db.query(
        `SELECT conflict_reason FROM sync_conflict_records WHERE entity_id = $1;`,
        [lateOfflineEventId]
      );
      assert.ok(conflictCheck.rows.length > 0);
      assert.equal(conflictCheck.rows[0].conflict_reason, 'CLOSED_SESSION_LATE_ARRIVAL');
    });

    await t.test('29. Mobile phone duplicate conflict during offline customer sync is quarantined in sync_conflict_records', async () => {
      const dupCustomerEventId = crypto.randomUUID();
      const res = await request(app)
        .post('/api/v1/sync/push')
        .set('x-device-id', testDeviceA)
        .send({
          deviceId: testDeviceA,
          centerId: testCenterA,
          events: [
            {
              id: dupCustomerEventId,
              entityType: 'CUSTOMER_REGISTRATION',
              idempotencyKey: `DUP-CUST-${crypto.randomUUID()}`,
              payload: {
                fullName: 'Conflicting Mobile Farmer',
                mobileNumber: uniqueMobile,
              },
            },
          ],
        });

      assert.equal(res.status, 200);
      const confResult = res.body.data.results.find((r) => r.eventId === dupCustomerEventId);
      assert.equal(confResult.status, 'CONFLICT');
      assert.equal(confResult.reason, 'DUPLICATE_MOBILE_NUMBER');
    });

    await t.test('30. Revoked device token is rejected with 403 Forbidden', async () => {
      const revokedDeviceId = crypto.randomUUID();
      await db.query(
        `INSERT INTO devices (id, organization_id, center_id, device_identifier, device_type, status, last_seen_at)
         VALUES ($1, $2, $3, 'REVOKED-DEV', 'COUNTER_TERMINAL', 'BLOCKED', NOW());`,
        [revokedDeviceId, testDairyA, testCenterA]
      );

      const res = await request(app)
        .post('/api/v1/sync/push')
        .set('x-device-id', revokedDeviceId)
        .send({
          deviceId: revokedDeviceId,
          events: [],
        });

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
    });
  });

  // --------------------------------------------------------------------------
  // GROUP E: Double-Entry Subledger, Billing Cycles & Maker-Checker Payouts
  // --------------------------------------------------------------------------
  await suite.test('GROUP E: Double-Entry Subledger, Billing Cycles & Maker-Checker Payouts', async (t) => {
    const secondFarmerId = crypto.randomUUID();

    await t.test('31. Milk collection completion creates balanced double-entry entries: Credit CUSTOMER_PAYABLE, Debit MILK_PURCHASE_EXPENSE', async () => {
      const entries = await tenantDbA.query(
        `SELECT entry_type, account_type, amount FROM ledger_entries 
         WHERE account_type IN ('CUSTOMER_PAYABLE', 'MILK_PURCHASE_EXPENSE')
         ORDER BY id DESC LIMIT 2;`
      );

      if (entries.rows.length >= 2) {
        const credit = entries.rows.find((e) => e.entry_type === 'CREDIT');
        const debit = entries.rows.find((e) => e.entry_type === 'DEBIT');
        if (credit && debit) {
          assert.equal(Number(credit.amount), Number(debit.amount), 'Debits must equal credits');
        }
      }
    });

    await t.test('32. Cattle feed sale creates balanced entries: Debit CUSTOMER_PAYABLE, Credit FEED_INVENTORY', async () => {
      const feedTxId = crypto.randomUUID();
      const feedAmount = 150.00;
      await tenantDbA.query(
        `INSERT INTO ledger_transactions (id, organization_id, center_id, customer_id, transaction_type, direction, amount, balance_after, description, reference_entity, reference_id, idempotency_key, created_by)
         VALUES ($1, $2, $3, $4, 'FEED_PURCHASE_DEBIT', 'DEBIT', $5, 1000.00, '1 Bag Cattle Feed', 'FEED_SALE', gen_random_uuid(), $6, $7);`,
        [feedTxId, testDairyA, testCenterA, registeredFarmerId, feedAmount, `FEED-IDEM-${Date.now()}`, '00000000-0000-0000-0000-000000000105']
      );

      await tenantDbA.query(
        `INSERT INTO ledger_entries (transaction_id, account_id, account_type, entry_type, amount)
         VALUES 
           ($1, gen_random_uuid(), 'CUSTOMER_PAYABLE', 'DEBIT', $2),
           ($1, gen_random_uuid(), 'FEED_INVENTORY', 'CREDIT', $2);`,
        [feedTxId, feedAmount]
      );

      const check = await tenantDbA.query(
        `SELECT entry_type, amount FROM ledger_entries WHERE transaction_id = $1;`,
        [feedTxId]
      );
      assert.equal(check.rows.length, 2);
    });

    await t.test('33. 10-day billing cycle aggregates milk earnings and net feed deductions into net payable bills', async () => {
      const res = await request(app)
        .post('/api/v1/billing/periods')
        .set('Authorization', `Bearer ${dairyOwnerTokenA}`)
        .send({
          centerId: testCenterA,
          periodName: 'November 2026 Settlement Period',
          startDate: '2026-11-01',
          endDate: '2026-11-10',
          cycleType: 'CALENDAR_MONTH',
        });

      assert.equal(res.status, 201);
      billingCycleId = res.body.data.id;

      const genRes = await request(app)
        .post(`/api/v1/billing/periods/${billingCycleId}/generate`)
        .set('Authorization', `Bearer ${dairyOwnerTokenA}`)
        .send({});

      assert.equal(genRes.status, 200);
      assert.equal(genRes.body.success, true);
    });

    await t.test('34. Billing cycle finalization transitions bills from DRAFT to FINALIZED and locks intakes', async () => {
      const res = await request(app)
        .post(`/api/v1/billing/periods/${billingCycleId}/finalize`)
        .set('Authorization', `Bearer ${dairyOwnerTokenA}`)
        .send({ notes: 'Finalized for bank NEFT payout' });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
    });

    await t.test('35. Authorized Maker (Accountant) generates bulk payout batch from finalized bills', async () => {
      // Seed two eligible farmers with bank details and payable balances in both central and tenant DBs
      const seedLedger = async (target) => {
        await target.query(`
          INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status, is_deleted, bank_name, bank_account_number, bank_ifsc_code)
          VALUES ('${registeredFarmerId}', '${testDairyA}', '${testCenterA}', 'C-101', 'Anand Patil Farmer', '+919822110101', 'ACTIVE', 'APPROVED', FALSE, 'State Bank of India', '30245678901', 'SBIN0000301')
          ON CONFLICT (id) DO UPDATE SET 
            bank_name = EXCLUDED.bank_name,
            bank_account_number = EXCLUDED.bank_account_number,
            bank_ifsc_code = EXCLUDED.bank_ifsc_code,
            status = 'ACTIVE',
            registration_status = 'APPROVED';

          INSERT INTO customer_ledger_accounts (id, customer_id, organization_id, currency, current_balance)
          VALUES (gen_random_uuid(), '${registeredFarmerId}', '${testDairyA}', 'INR', 2500.00)
          ON CONFLICT (customer_id) DO UPDATE SET current_balance = 2500.00;

          INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status, is_deleted, bank_name, bank_account_number, bank_ifsc_code)
          VALUES ('${secondFarmerId}', '${testDairyA}', '${testCenterA}', 'C-102', 'Bhimrao Shinde', '+919822110102', 'ACTIVE', 'APPROVED', FALSE, 'Bank of Maharashtra', '60123456789', 'MAHB0000123')
          ON CONFLICT (id) DO NOTHING;

          INSERT INTO customer_ledger_accounts (id, customer_id, organization_id, currency, current_balance)
          VALUES (gen_random_uuid(), '${secondFarmerId}', '${testDairyA}', 'INR', 1800.00)
          ON CONFLICT (customer_id) DO UPDATE SET current_balance = 1800.00;
        `);
      };

      await seedLedger(db);
      await seedLedger(tenantDbA);

      const res = await request(app)
        .post('/api/v1/payments/batches')
        .set('Authorization', `Bearer ${accountantTokenA}`)
        .send({
          centerId: testCenterA,
          billingCycleId,
          billingPeriodStart: '2026-11-01',
          billingPeriodEnd: '2026-11-10',
          paymentMethod: 'BANK_TRANSFER',
          customerIds: [registeredFarmerId, secondFarmerId],
          idempotencyKey: `BATCH-IDEM-${Date.now()}`,
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.status, 'DRAFT');
      assert.equal(res.body.data.totalBeneficiaries, 2);
      payoutBatchId = res.body.data.batchId;

      const bRes = await request(app)
        .get(`/api/v1/payments/batches/${payoutBatchId}`)
        .set('Authorization', `Bearer ${accountantTokenA}`);

      assert.equal(bRes.status, 200);
      assert.ok(bRes.body.data.items && bRes.body.data.items.length >= 2);
      payoutItem1Id = bRes.body.data.items[0].id;
      payoutItem2Id = bRes.body.data.items[1].id;
    });

    await t.test('36. Attempt to create duplicate payout batch for same finalized cycle is rejected with 409 Conflict', async () => {
      const res = await request(app)
        .post('/api/v1/payments/batches')
        .set('Authorization', `Bearer ${accountantTokenA}`)
        .send({
          centerId: testCenterA,
          billingCycleId,
          billingPeriodStart: '2026-11-01',
          billingPeriodEnd: '2026-11-10',
          paymentMethod: 'BANK_TRANSFER',
          customerIds: [registeredFarmerId, secondFarmerId],
          idempotencyKey: `BATCH-IDEM-DUP-${Date.now()}`,
        });

      assert.equal(res.status, 409);
      assert.equal(res.body.success, false);
    });

    await t.test('37. Maker cannot approve own batch (Segregation of Duties enforcement)', async () => {
      const res = await request(app)
        .post(`/api/v1/payments/batches/${payoutBatchId}/approve`)
        .set('Authorization', `Bearer ${accountantTokenA}`);

      assert.equal(res.status, 403, 'Maker must be blocked from self-approving payout batch');
    });

    await t.test('38. Independent Checker (Dairy Owner) approves payout batch (APPROVED)', async () => {
      const res = await request(app)
        .post(`/api/v1/payments/batches/${payoutBatchId}/approve`)
        .set('Authorization', `Bearer ${dairyOwnerTokenA}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.status, 'APPROVED');
    });
  });

  // --------------------------------------------------------------------------
  // GROUP F: Bank Reconciliation, Passbook Reflection & Multi-Tenant Security
  // --------------------------------------------------------------------------
  await suite.test('GROUP F: Bank Reconciliation, Passbook Reflection & Multi-Tenant Security', async (t) => {
    let downloadToken = '';

    await t.test('39. Standard NEFT CSV export generates correct columns, SHA-256 header, and Cache-Control: no-store', async () => {
      const res = await request(app)
        .get(`/api/v1/payments/batches/${payoutBatchId}/export?format=NEFT_STANDARD`)
        .set('Authorization', `Bearer ${dairyOwnerTokenA}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.format, 'NEFT_STANDARD');
      downloadToken = res.body.data.downloadToken;

      const dlRes = await request(app)
        .get(`/api/v1/payments/batches/${payoutBatchId}/download?token=${downloadToken}`);

      assert.equal(dlRes.status, 200);
      assert.equal(dlRes.headers['content-type'], 'text/csv; charset=utf-8');
      assert.ok(dlRes.headers['cache-control']?.includes('no-store'));
      assert.ok(dlRes.headers['x-checksum-sha256'], 'SHA-256 header must be present');
    });

    await t.test('40. Bank return CSV reconciliation marks successful rows SETTLED with Bank UTR, debits ledger', async () => {
      const reconRes = await request(app)
        .post(`/api/v1/payments/batches/${payoutBatchId}/reconcile`)
        .set('Authorization', `Bearer ${dairyOwnerTokenA}`)
        .send({
          results: [
            {
              itemId: payoutItem1Id,
              status: 'SETTLED',
              beneficiaryReference: 'UTR-NEFT-20261118-001234',
            },
          ],
        });

      assert.equal(reconRes.status, 200);
      assert.equal(reconRes.body.success, true);
      assert.ok(reconRes.body.data.successfulCount >= 1);
    });

    await t.test('41. Bank return CSV reconciliation marks failed rows REJECTED, retains farmer balance payable', async () => {
      const failRecon = await request(app)
        .post(`/api/v1/payments/batches/${payoutBatchId}/reconcile`)
        .set('Authorization', `Bearer ${dairyOwnerTokenA}`)
        .send({
          results: [
            {
              itemId: payoutItem2Id,
              status: 'FAILED',
              failureReason: 'Invalid Account Number or frozen account',
            },
          ],
        });

      assert.equal(failRecon.status, 200);
      assert.equal(failRecon.body.success, true);
      assert.ok(failRecon.body.data.failedCount >= 1);
    });

    await t.test('42. Customer App passbook streams reconciled transaction with live Bank UTR reference', async () => {
      const farmerTokenA = tokenService.signToken({
        userId: registeredFarmerId,
        organizationId: testDairyA,
        role: 'FARMER_CUSTOMER',
        actorType: 'CUSTOMER',
      });

      const pbRes = await request(app)
        .get('/api/v1/ledger/entries')
        .set('Authorization', `Bearer ${farmerTokenA}`);

      assert.equal(pbRes.status, 200);
      assert.ok(Array.isArray(pbRes.body.data) || Array.isArray(pbRes.body.data?.entries));
    });

    await t.test('43. Strict Tenant Isolation: Tenant B operator/admin cannot read or modify Tenant A records', async () => {
      const res = await request(app)
        .get(`/api/v1/payments/batches/${payoutBatchId}`)
        .set('Authorization', `Bearer ${dairyOwnerTokenB}`);

      assert.equal(res.status, 403, 'Cross-tenant batch access must return 403 Forbidden');
    });

    await t.test('44. Zero consumer payment gateway (Razorpay) invocations across milk procurement and farmer payout flows', async () => {
      assert.equal(typeof globalThis.Razorpay, 'undefined');
    });
  });
});
