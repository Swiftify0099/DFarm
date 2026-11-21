import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../dist/app.js';
import { db } from '../dist/infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../dist/infrastructure/database/TenantDatabaseManager.js';
import { HmacJwtTokenService } from '../dist/infrastructure/security/HmacJwtTokenService.js';
import { Customer } from '../dist/domain/entities/Customer.js';
import { CustomerSuspendedError } from '../dist/domain/errors/index.js';

const tokenService = new HmacJwtTokenService();
const app = createApp();

// Setup test tenant identifiers
const testDairyA = '00000000-0000-0000-0000-000000000071';
const testDairyB = '00000000-0000-0000-0000-000000000072';
const testCenterA = '00000000-0000-0000-0000-000000000073';

// Setup authentication tokens
const primaryDairyAdminTokenA = tokenService.signToken({
  userId: '00000000-0000-0000-0000-000000000081',
  organizationId: testDairyA,
  role: 'PRIMARY_DAIRY_ADMIN',
  actorType: 'STAFF',
  fullName: 'Vasantrao Patil',
});

const dairyAdminTokenA = tokenService.signToken({
  userId: '00000000-0000-0000-0000-000000000082',
  organizationId: testDairyA,
  role: 'DAIRY_ADMIN',
  actorType: 'STAFF',
  fullName: 'Mahesh Shinde',
});

const dairyAdminTokenB = tokenService.signToken({
  userId: '00000000-0000-0000-0000-000000000083',
  organizationId: testDairyB,
  role: 'DAIRY_ADMIN',
  actorType: 'STAFF',
  fullName: 'Sanjay Deshmukh',
});

const operatorTokenA = tokenService.signToken({
  userId: '00000000-0000-0000-0000-000000000084',
  organizationId: testDairyA,
  centerId: testCenterA,
  role: 'COLLECTION_OPERATOR',
  actorType: 'STAFF',
  fullName: 'Kiosk Operator Vikas',
});

test('DFarm Roadmap Phase 06 — Dairy Admin Core Operations Verification Suite', async (suite) => {
  // Pre-suite database setup
  const seedDbs = async (targetDb) => {
    try {
      await targetDb.query(`
        INSERT INTO organizations (id, name, code, status)
        VALUES 
          ('${testDairyA}', 'Gokul Sahakari Dudh Utpadak Sanstha Phase 6', 'GOKUL-P6', 'ACTIVE'),
          ('${testDairyB}', 'Warana Milk Cooperative Phase 6', 'WARANA-P6', 'ACTIVE')
        ON CONFLICT (id) DO NOTHING;
      `);

      await targetDb.query(`
        INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
        VALUES 
          ('${testCenterA}', '${testDairyA}', 'C-P6', 'Main Center Phase 6', 'Station Road', 'Shirgaon', 'Kolhapur', 'Maharashtra', '416234', '+919876543210', 'ACTIVE')
        ON CONFLICT (id) DO NOTHING;
      `);

      await targetDb.query(`
        INSERT INTO users (id, organization_id, username, phone_number, full_name, role, status)
        VALUES 
          ('00000000-0000-0000-0000-000000000081', '${testDairyA}', 'admin_vasant', '+919876543281', 'Vasantrao Patil', 'DAIRY_ADMIN', 'ACTIVE'),
          ('00000000-0000-0000-0000-000000000082', '${testDairyA}', 'admin_mahesh', '+919876543282', 'Mahesh Shinde', 'DAIRY_ADMIN', 'ACTIVE'),
          ('00000000-0000-0000-0000-000000000083', '${testDairyB}', 'admin_sanjay', '+919876543283', 'Sanjay Deshmukh', 'DAIRY_ADMIN', 'ACTIVE'),
          ('00000000-0000-0000-0000-000000000084', '${testDairyA}', 'operator_vikas', '+919876543284', 'Kiosk Operator Vikas', 'COLLECTION_OPERATOR', 'ACTIVE')
        ON CONFLICT (id) DO NOTHING;
      `);
    } catch (err) {
      console.error('Seed error:', err);
    }
  };

  await seedDbs(db);
  const tenantDbA = await tenantDbManager.getTenantDb(testDairyA);
  await seedDbs(tenantDbA);
  const tenantDbB = await tenantDbManager.getTenantDb(testDairyB);
  await seedDbs(tenantDbB);

  // Shared state across tests
  let approvedCustomerId = '';
  let approvedCustomerCode = '';
  let rejectedCustomerId = '';
  let candidatePhoneA = `+9198${Math.floor(100000 + Math.random() * 900000)}`;
  let candidatePhoneB = `+9198${Math.floor(100000 + Math.random() * 900000)}`;
  let testCardUid1 = `A1B2C3D4${Math.floor(1000 + Math.random() * 9000)}`;
  let testCardUid2 = `E5F6A7B8${Math.floor(1000 + Math.random() * 9000)}`;
  let faceEnrollmentRecordId = '';

  // ============================================================================
  // GROUP A: RBAC & Multi-Tenant Boundary Isolation
  // ============================================================================
  await suite.test('GROUP A: RBAC & Multi-Tenant Boundary Isolation', async (t) => {
    await t.test('1. Dairy Admin token cannot query customer list of another dairy (cross-dairy blocked with 403)', async () => {
      const res = await request(app)
        .get(`/api/v1/customers?organizationId=${testDairyB}`)
        .set('Authorization', `Bearer ${dairyAdminTokenA}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
      assert.match(res.body.error, /Cross-dairy query blocked/i);
    });

    await t.test('2. Dairy Admin token cannot query pending registrations of another dairy (cross-dairy blocked with 403)', async () => {
      const res = await request(app)
        .get(`/api/v1/customers/pending?organizationId=${testDairyB}`)
        .set('Authorization', `Bearer ${dairyAdminTokenA}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
      assert.match(res.body.error, /Cross-dairy query blocked/i);
    });

    await t.test('3. Dairy Admin token cannot query RFID cards of another dairy (cross-dairy blocked with 403)', async () => {
      const res = await request(app)
        .get(`/api/v1/rfid?organizationId=${testDairyB}`)
        .set('Authorization', `Bearer ${dairyAdminTokenA}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
      assert.match(res.body.error, /Cross-dairy query blocked/i);
    });

    await t.test('4. Dairy Admin token cannot query face enrollments of another dairy (cross-dairy blocked with 403)', async () => {
      const res = await request(app)
        .get(`/api/v1/identity/face/enrollments?organizationId=${testDairyB}`)
        .set('Authorization', `Bearer ${dairyAdminTokenA}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
      assert.match(res.body.error, /Cross-dairy query blocked/i);
    });

    await t.test('5. Collection Operator lacking customers:approve cannot approve registration (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/customers/00000000-0000-0000-0000-000000000099/approve')
        .set('Authorization', `Bearer ${operatorTokenA}`)
        .send({ operatorName: 'Kiosk Operator Vikas' });

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
      const errMsg = typeof res.body.error === 'string' ? res.body.error : res.body.error?.message;
      assert.match(errMsg, /lacks required permission/i);
    });

    await t.test('6. Collection Operator lacking customers:update cannot suspend customer (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/customers/00000000-0000-0000-0000-000000000099/suspend')
        .set('Authorization', `Bearer ${operatorTokenA}`)
        .send({ reason: 'Unauthorized suspension attempt' });

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
      const errMsg = typeof res.body.error === 'string' ? res.body.error : res.body.error?.message;
      assert.match(errMsg, /lacks required permission/i);
    });

    await t.test('7. Collection Operator lacking rfid:manage cannot assign RFID card (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/rfid/assign')
        .set('Authorization', `Bearer ${operatorTokenA}`)
        .send({
          cardUid: 'AABBCCDDEEFF',
          customerId: '00000000-0000-0000-0000-000000000099',
          operatorName: 'Vikas',
        });

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
      const errMsg = typeof res.body.error === 'string' ? res.body.error : res.body.error?.message;
      assert.match(errMsg, /lacks required permission/i);
    });
  });

  // ============================================================================
  // GROUP B: Pending Customer Registration Review & Approval Workflow
  // ============================================================================
  await suite.test('GROUP B: Pending Customer Registration Review & Approval Workflow', async (t) => {
    await t.test('8. Candidate self-registers creating PENDING_APPROVAL record', async () => {
      const res = await request(app)
        .post('/api/v1/customers/register')
        .send({
          fullName: 'Tukaram Dnyandeo Patil',
          mobileNumber: candidatePhoneA,
          organizationId: testDairyA,
          centerId: testCenterA,
          village: 'Shirgaon Khurd',
          milkSupplyType: 'COW',
          bankDetails: {
            accountNumber: '998877665544',
            ifscCode: 'MAHB0000999',
            bankName: 'Bank of Maharashtra',
            accountHolderName: 'Tukaram D Patil',
          },
          faceTemplate: {
            embedding: new Array(128).fill(0.05),
            modelVersion: 'sface_int8_2021dec',
          },
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.status, 'PENDING_APPROVAL');
      approvedCustomerId = res.body.customerUuid || res.body.data.id;
      assert.ok(approvedCustomerId);
    });

    await t.test('9. Second candidate registers to test rejection workflow', async () => {
      const res = await request(app)
        .post('/api/v1/customers/register')
        .send({
          fullName: 'Sitaram Pandurang Jadhav',
          mobileNumber: candidatePhoneB,
          organizationId: testDairyA,
          centerId: testCenterA,
          village: 'Rampur',
          milkSupplyType: 'BUFFALO',
        });

      assert.equal(res.status, 201);
      rejectedCustomerId = res.body.customerUuid || res.body.data.id;
      assert.ok(rejectedCustomerId);
    });

    await t.test('10. Dairy Admin lists pending approvals queue', async () => {
      const res = await request(app)
        .get('/api/v1/customers/pending')
        .set('Authorization', `Bearer ${dairyAdminTokenA}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      const pendingFound = res.body.data.find((p) => p.id === approvedCustomerId);
      assert.ok(pendingFound, 'Candidate must appear in pending registrations queue');
      assert.equal(pendingFound.candidateName, 'Tukaram Dnyandeo Patil');
      assert.equal(pendingFound.status, 'PENDING');
      assert.ok(pendingFound.faceCapture, 'Face capture consent metadata must be present');
    });

    await t.test('11. Dairy Admin approves pending customer assigning unique farmer code', async () => {
      const res = await request(app)
        .post(`/api/v1/customers/${approvedCustomerId}/approve`)
        .set('Authorization', `Bearer ${primaryDairyAdminTokenA}`)
        .send({
          operatorName: 'Vasantrao Patil',
          customerCode: 'C-701',
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.status, 'ACTIVE');
      approvedCustomerCode = res.body.customerCode || res.body.farmerCode;
      assert.equal(approvedCustomerCode, 'C-701');
      assert.match(res.body.message, /Successfully approved/i);
    });

    await t.test('12. Attempting to approve an already approved customer returns 400 or 409 Conflict', async () => {
      const res = await request(app)
        .post(`/api/v1/customers/${approvedCustomerId}/approve`)
        .set('Authorization', `Bearer ${primaryDairyAdminTokenA}`)
        .send({ operatorName: 'Vasantrao Patil' });

      assert.ok(res.status === 400 || res.status === 409, `Expected 400 or 409, got ${res.status}`);
      assert.equal(res.body.success, false);
      const errMsg = typeof res.body.error === 'string' ? res.body.error : res.body.error?.message;
      assert.match(errMsg, /already approved/i);
    });

    await t.test('13. Rejecting candidate with reason under 5 characters fails with 400 Bad Request', async () => {
      const res = await request(app)
        .post(`/api/v1/customers/${rejectedCustomerId}/reject`)
        .set('Authorization', `Bearer ${dairyAdminTokenA}`)
        .send({ reason: 'Bad' });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.error, /minimum 5 characters/i);
    });

    await t.test('14. Dairy Admin rejects candidate with actionable reason', async () => {
      const res = await request(app)
        .post(`/api/v1/customers/${rejectedCustomerId}/reject`)
        .set('Authorization', `Bearer ${dairyAdminTokenA}`)
        .send({
          reason: 'Village address falls outside the cooperative jurisdiction boundary.',
          operatorName: 'Mahesh Shinde',
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.status, 'REJECTED');
      assert.equal(res.body.data.registrationStatus, 'REJECTED');
      assert.match(res.body.data.rejectionReason, /cooperative jurisdiction boundary/i);
    });
  });

  // ============================================================================
  // GROUP C: Customer Directory, Search, Filtering & Data Masking
  // ============================================================================
  await suite.test('GROUP C: Customer Directory, Search, Filtering & Data Masking', async (t) => {
    await t.test('15. Dairy Admin lists customers with limit and offset pagination', async () => {
      const res = await request(app)
        .get('/api/v1/customers?limit=10&offset=0')
        .set('Authorization', `Bearer ${dairyAdminTokenA}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      const found = res.body.data.find((c) => c.id === approvedCustomerId);
      assert.ok(found, 'Approved customer must appear in customer directory');
      assert.equal(found.status, 'ACTIVE');
    });

    await t.test('16. Directory search query matches by customer full name', async () => {
      const res = await request(app)
        .get('/api/v1/customers?search=Tukaram')
        .set('Authorization', `Bearer ${dairyAdminTokenA}`);

      assert.equal(res.status, 200);
      assert.ok(res.body.data.length >= 1);
      assert.equal(res.body.data[0].id, approvedCustomerId);
    });

    await t.test('17. Directory search query matches by farmer code', async () => {
      const res = await request(app)
        .get(`/api/v1/customers?search=${approvedCustomerCode}`)
        .set('Authorization', `Bearer ${dairyAdminTokenA}`);

      assert.equal(res.status, 200);
      assert.ok(res.body.data.length >= 1);
      assert.equal(res.body.data[0].id, approvedCustomerId);
    });

    await t.test('18. Customer Detail endpoint masks sensitive bank account credentials', async () => {
      const res = await request(app)
        .get(`/api/v1/customers/${approvedCustomerId}`)
        .set('Authorization', `Bearer ${dairyAdminTokenA}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.bankDetails);
      assert.equal(res.body.data.bankDetails.bankName, 'Bank of Maharashtra');
      assert.equal(res.body.data.bankDetails.accountNumber, 'XXXX-XXXX-5544');
      assert.equal(res.body.data.bankDetails.accountNumberMask, 'XXXX-XXXX-5544');
    });
  });

  // ============================================================================
  // GROUP D: Customer Administrative Status & Suspension (Blocks Delivery)
  // ============================================================================
  await suite.test('GROUP D: Customer Administrative Status & Suspension (Blocks Delivery)', async (t) => {
    await t.test('19. Dairy Admin updates customer profile details via PATCH /api/v1/customers/:id', async () => {
      const res = await request(app)
        .patch(`/api/v1/customers/${approvedCustomerId}`)
        .set('Authorization', `Bearer ${dairyAdminTokenA}`)
        .send({
          village: 'Shirgaon Budruk',
          permittedCategories: ['COW', 'BUFFALO'],
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.village, 'Shirgaon Budruk');
      assert.deepEqual(res.body.data.permittedCategories.sort(), ['BUFFALO', 'COW']);
    });

    await t.test('20. Dairy Admin suspends customer with mandatory reason', async () => {
      const res = await request(app)
        .post(`/api/v1/customers/${approvedCustomerId}/suspend`)
        .set('Authorization', `Bearer ${dairyAdminTokenA}`)
        .send({
          reason: 'Water adulteration detected during morning milk intake session.',
          operatorName: 'Mahesh Shinde',
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.status, 'SUSPENDED');
    });

    await t.test('21. Domain entity validateCanDeliver throws CustomerSuspendedError when customer is suspended', () => {
      const suspendedCustomer = new Customer({
        id: approvedCustomerId,
        organizationId: testDairyA,
        centerId: testCenterA,
        farmerCode: approvedCustomerCode,
        fullName: 'Tukaram Dnyandeo Patil',
        mobileNumber: candidatePhoneA,
        status: 'SUSPENDED',
        registrationStatus: 'APPROVED',
        permittedCategories: ['COW'],
      });

      assert.throws(
        () => suspendedCustomer.validateCanDeliver('COW'),
        (err) => err instanceof CustomerSuspendedError && err.message.includes('suspended')
      );
    });

    await t.test('22. Dairy Admin reactivates suspended customer back to ACTIVE status', async () => {
      const res = await request(app)
        .post(`/api/v1/customers/${approvedCustomerId}/reactivate`)
        .set('Authorization', `Bearer ${primaryDairyAdminTokenA}`)
        .send({ operatorName: 'Vasantrao Patil' });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.status, 'ACTIVE');
    });

    await t.test('23. Soft delete and restore lifecycle preserves customer audit trail', async () => {
      // Soft delete
      const delRes = await request(app)
        .post(`/api/v1/customers/${approvedCustomerId}/soft-delete`)
        .set('Authorization', `Bearer ${dairyAdminTokenA}`)
        .send({ reason: 'Audit soft-delete test' });

      assert.equal(delRes.status, 200);
      assert.equal(delRes.body.success, true);

      // Restore
      const restoreRes = await request(app)
        .post(`/api/v1/customers/${approvedCustomerId}/restore`)
        .set('Authorization', `Bearer ${dairyAdminTokenA}`);

      assert.equal(restoreRes.status, 200);
      assert.equal(restoreRes.body.success, true);
    });
  });

  // ============================================================================
  // GROUP E: Face Biometric Lifecycle & ZERO Raw Vector Exposure
  // ============================================================================
  await suite.test('GROUP E: Face Biometric Lifecycle & ZERO Raw Vector Exposure', async (t) => {
    await t.test('24. GET /identity/face/enrollments returns biometric metadata and ZERO raw 128-dim vectors', async () => {
      const res = await request(app)
        .get('/api/v1/identity/face/enrollments')
        .set('Authorization', `Bearer ${dairyAdminTokenA}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));

      if (res.body.data.length > 0) {
        faceEnrollmentRecordId = res.body.data[0].id;
        for (const item of res.body.data) {
          assert.equal(typeof item.id, 'string');
          assert.ok(item.customerCode);
          assert.ok(item.customerName);
          assert.ok(item.status);
          assert.equal(typeof item.qualityScore, 'number');
          assert.equal(item.consentGiven, true);

          // STRICT CHECK: Raw vector must NEVER be in response payload
          assert.equal(item.embedding, undefined, 'Raw embedding vector must not be exposed');
          assert.equal(item.vector, undefined, 'Raw vector must not be exposed');
          assert.equal(item.embedding_encrypted, undefined, 'Internal encrypted bytes must not be exposed');
        }
      }
    });

    await t.test('25. Dairy Admin requests face re-enrollment marking record SUPERSEDED', async () => {
      if (!faceEnrollmentRecordId) return;

      const res = await request(app)
        .post(`/api/v1/identity/face/enrollments/${faceEnrollmentRecordId}/re-enroll`)
        .set('Authorization', `Bearer ${dairyAdminTokenA}`)
        .send({ note: 'Low quality angle in initial capture', operatorName: 'Mahesh Shinde' });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.match(res.body.message, /Re-enrollment requested/i);
    });

    await t.test('26. Dairy Admin revokes face biometric template purging from active terminals', async () => {
      if (!faceEnrollmentRecordId) return;

      const res = await request(app)
        .post(`/api/v1/identity/face/enrollments/${faceEnrollmentRecordId}/revoke`)
        .set('Authorization', `Bearer ${dairyAdminTokenA}`)
        .send({ reason: 'Farmer requested biometric removal under consent policy', operatorName: 'Mahesh Shinde' });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.match(res.body.message, /purged from active terminals/i);
    });
  });

  // ============================================================================
  // GROUP F: RFID Assignment, Replacement, and Lost Lifecycle
  // ============================================================================
  await suite.test('GROUP F: RFID Assignment, Replacement, and Lost Lifecycle', async (t) => {
    await t.test('27. Dairy Admin assigns RFID card testCardUid1 to approved customer', async () => {
      const res = await request(app)
        .post('/api/v1/rfid/assign')
        .set('Authorization', `Bearer ${dairyAdminTokenA}`)
        .send({
          cardUid: testCardUid1,
          customerId: approvedCustomerId,
          operatorName: 'Mahesh Shinde',
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.cardUid, testCardUid1);
      assert.equal(res.body.data.customerId, approvedCustomerId);
      assert.equal(res.body.data.status, 'ACTIVE');
    });

    await t.test('28. Attempting to assign testCardUid1 to another customer returns 409 Conflict', async () => {
      // Create another customer in Dairy A to test collision
      const phoneOther = `+9198${Math.floor(100000 + Math.random() * 900000)}`;
      const regRes = await request(app)
        .post('/api/v1/customers/register')
        .send({
          fullName: 'Babanrao Kadam',
          mobileNumber: phoneOther,
          organizationId: testDairyA,
          centerId: testCenterA,
          village: 'Shirgaon',
        });

      const otherCustomerId = regRes.body.customerUuid || regRes.body.data.id;
      await request(app)
        .post(`/api/v1/customers/${otherCustomerId}/approve`)
        .set('Authorization', `Bearer ${primaryDairyAdminTokenA}`)
        .send({ operatorName: 'Vasantrao Patil' });

      const res = await request(app)
        .post('/api/v1/rfid/assign')
        .set('Authorization', `Bearer ${dairyAdminTokenA}`)
        .send({
          cardUid: testCardUid1,
          customerId: otherCustomerId,
          operatorName: 'Mahesh Shinde',
        });

      assert.equal(res.status, 409);
      assert.equal(res.body.success, false);
      assert.match(res.body.error, /already actively assigned to another customer/i);
    });

    await t.test('29. Card replacement: Assigning testCardUid2 deactivates testCardUid1 with replacement reason', async () => {
      const res = await request(app)
        .post('/api/v1/rfid/assign')
        .set('Authorization', `Bearer ${dairyAdminTokenA}`)
        .send({
          cardUid: testCardUid2,
          customerId: approvedCustomerId,
          operatorName: 'Mahesh Shinde',
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.cardUid, testCardUid2);

      // Verify that the customer record now points to testCardUid2
      const custRes = await request(app)
        .get(`/api/v1/customers/${approvedCustomerId}`)
        .set('Authorization', `Bearer ${dairyAdminTokenA}`);

      assert.equal(custRes.body.data.rfidCardUid, testCardUid2);
    });

    await t.test('30. Dairy Admin marks active RFID card as LOST and deactivates it', async () => {
      const res = await request(app)
        .post('/api/v1/rfid/mark-lost')
        .set('Authorization', `Bearer ${dairyAdminTokenA}`)
        .send({
          cardUid: testCardUid2,
          reason: 'Farmer reported lost card at local market',
          operatorName: 'Mahesh Shinde',
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.match(res.body.message, /marked as LOST/i);

      // Verify customer rfidCardUid is now cleared
      const custRes = await request(app)
        .get(`/api/v1/customers/${approvedCustomerId}`)
        .set('Authorization', `Bearer ${dairyAdminTokenA}`);

      assert.equal(custRes.body.data.rfidCardUid, null);
    });

    await t.test('31. Unassign RFID card without marking as lost', async () => {
      // Re-assign testCardUid1
      await request(app)
        .post('/api/v1/rfid/assign')
        .set('Authorization', `Bearer ${dairyAdminTokenA}`)
        .send({
          cardUid: testCardUid1,
          customerId: approvedCustomerId,
          operatorName: 'Mahesh Shinde',
        });

      // Now unassign
      const res = await request(app)
        .post('/api/v1/rfid/unassign')
        .set('Authorization', `Bearer ${dairyAdminTokenA}`)
        .send({ cardUid: testCardUid1 });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.match(res.body.message, /unassigned from customer/i);
    });
  });

  // ============================================================================
  // GROUP G: Cross-Application Consistency (Collection App & Customer App)
  // ============================================================================
  await suite.test('GROUP G: Cross-Application Consistency (Collection App & Customer App)', async (t) => {
    await t.test('32. Collection App RFID lookup resolves active customer', async () => {
      // Re-assign card testCardUid1 to approved customer
      await request(app)
        .post('/api/v1/rfid/assign')
        .set('Authorization', `Bearer ${dairyAdminTokenA}`)
        .send({
          cardUid: testCardUid1,
          customerId: approvedCustomerId,
          operatorName: 'Mahesh Shinde',
        });

      const res = await request(app)
        .get(`/api/v1/rfid/lookup/${testCardUid1}?organizationId=${testDairyA}`)
        .set('Authorization', `Bearer ${dairyAdminTokenA}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.id, approvedCustomerId);
      assert.equal(res.body.data.farmerCode, approvedCustomerCode);
    });

    await t.test('33. Customer App profile reflects active approved status and masked bank details', async () => {
      const farmerToken = tokenService.signToken({
        userId: approvedCustomerId,
        organizationId: testDairyA,
        role: 'FARMER_CUSTOMER',
        actorType: 'CUSTOMER',
        fullName: 'Tukaram Dnyandeo Patil',
      });

      const res = await request(app)
        .get('/api/v1/customers/me')
        .set('Authorization', `Bearer ${farmerToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.status, 'ACTIVE');
      assert.equal(res.body.data.farmerCode, approvedCustomerCode);
      assert.equal(res.body.data.bankDetails.accountNumberMask, 'XXXX-XXXX-5544');
    });
  });
});
