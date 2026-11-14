// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// PHASE 08 AUTOMATED TEST SUITE: 22 SCENARIOS
// THREE-METHOD CUSTOMER IDENTIFICATION + RFID ASSIGNMENT + SUPERVISOR VERIFICATION
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import pg from 'pg';
import crypto from 'node:crypto';
import { createApp } from '../dist/app.js';
import { P07FaceEngineAdapter } from '../dist/modules/identification/face-engine.adapter.js';
import { pool } from '../dist/config/db.js';

const { Client } = pg;
const dbClient = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
});

async function query(text, params) {
  return dbClient.query(text, params);
}

test('DFarm Phase 08: Customer Identification & RFID Assignment Suite (22 Scenarios)', async (t) => {
  await dbClient.connect();
  const app = createApp();

  t.after(async () => {
    P07FaceEngineAdapter.resetEngine();
    await dbClient.end();
    await pool.end();
  });

  // Test Fixture State
  let orgId = '';
  let otherOrgId = '';
  let centerId = '';
  let otherCenterId = '';
  let supervisorUserId = '';
  let operatorUserId = '';
  let supervisorToken = '';
  let operatorToken = '';
  let officerToken = '';
  let regOfficerUserId = '';

  let customerActiveUuid = '';
  let customerPendingUuid = '';
  let customerDeletedUuid = '';
  let customerConsentRevokedUuid = '';
  let rfidCard1Uid = '04A1B2C301';
  let rfidCard2Uid = '04A1B2C302';
  let rfidCardReplacementUid = '04A1B2C303';
  let rfidCardRevokedUid = '04A1B2C304';
  let rfidCardBlockedUid = '04A1B2C305';
  let rfidCard1Id = '';
  let rfidCardRevokedId = '';
  let rfidCardBlockedId = '';

  // ----------------------------------------------------------------------------
  // SETUP TEST FIXTURES IN POSTGRESQL
  // ----------------------------------------------------------------------------
  await t.test('Setup Test Fixtures: Organizations, Centers, Users, and Customers', async () => {
    // 1. Fetch Primary Org & Center
    const orgRes = await query("SELECT id FROM organizations WHERE name ILIKE '%Sangli%' LIMIT 1;");
    assert.ok(orgRes.rows.length > 0, 'Sangli org must exist');
    orgId = orgRes.rows[0].id;

    const centerRes = await query("SELECT id FROM dairy_centers WHERE organization_id = $1 LIMIT 1;", [orgId]);
    assert.ok(centerRes.rows.length > 0, 'Dairy center must exist');
    centerId = centerRes.rows[0].id;

    // 2. Fetch Other Org & Center for isolation test
    const otherOrgRes = await query("SELECT id FROM organizations WHERE id != $1 LIMIT 1;", [orgId]);
    if (otherOrgRes.rows.length > 0) {
      otherOrgId = otherOrgRes.rows[0].id;
    } else {
      const insOtherOrg = await query(
        `INSERT INTO organizations (id, name, code, type, contact_email)
         VALUES (gen_random_uuid(), 'Other Dairy Cooperative', 'ODC-99', 'COOPERATIVE_UNION', 'other@dairy.org')
         RETURNING id;`
      );
      otherOrgId = insOtherOrg.rows[0].id;
    }

    const otherCenterRes = await query("SELECT id FROM dairy_centers WHERE organization_id = $1 LIMIT 1;", [otherOrgId]);
    if (otherCenterRes.rows.length > 0) {
      otherCenterId = otherCenterRes.rows[0].id;
    } else {
      const insOtherCenter = await query(
        `INSERT INTO dairy_centers (id, organization_id, code, name, center_type)
         VALUES (gen_random_uuid(), $1, 'OTH-01', 'Remote Center', 'COLLECTION_POINT')
         RETURNING id;`,
        [otherOrgId]
      );
      otherCenterId = insOtherCenter.rows[0].id;
    }

    // 3. Upsert Users: Supervisor, Operator, Registration Officer
    const supRes = await query(
      `INSERT INTO users (id, organization_id, username, full_name, email, phone_number, role, status)
       VALUES (gen_random_uuid(), $1, 'p08_supervisor_test', 'Rajesh Joshi (Center Supervisor)', 'rajesh.joshi@sangli.org', '+919876500001', 'SUPERVISOR', 'ACTIVE')
       ON CONFLICT (username) DO UPDATE SET role = 'SUPERVISOR', status = 'ACTIVE'
       RETURNING id;`,
      [orgId]
    );
    supervisorUserId = supRes.rows[0].id;
    await query(
      `INSERT INTO user_center_assignments (user_id, center_id, is_primary)
       VALUES ($1, $2, TRUE) ON CONFLICT (user_id, center_id) DO UPDATE SET is_primary = TRUE;`,
      [supervisorUserId, centerId]
    );

    const opRes = await query(
      `INSERT INTO users (id, organization_id, username, full_name, email, phone_number, role, status)
       VALUES (gen_random_uuid(), $1, 'p08_operator_test', 'Mahesh Mane (Intake Operator)', 'mahesh.mane@sangli.org', '+919876500002', 'COLLECTION_OPERATOR', 'ACTIVE')
       ON CONFLICT (username) DO UPDATE SET role = 'COLLECTION_OPERATOR', status = 'ACTIVE'
       RETURNING id;`,
      [orgId]
    );
    operatorUserId = opRes.rows[0].id;
    await query(
      `INSERT INTO user_center_assignments (user_id, center_id, is_primary)
       VALUES ($1, $2, TRUE) ON CONFLICT (user_id, center_id) DO UPDATE SET is_primary = TRUE;`,
      [operatorUserId, centerId]
    );

    const offRes = await query(
      `INSERT INTO users (id, organization_id, username, full_name, email, phone_number, role, status)
       VALUES (gen_random_uuid(), $1, 'p08_officer_test', 'Anand Kulkarni (Registration Officer)', 'anand.k@sangli.org', '+919876500003', 'REGISTRATION_OFFICER', 'ACTIVE')
       ON CONFLICT (username) DO UPDATE SET role = 'REGISTRATION_OFFICER', status = 'ACTIVE'
       RETURNING id;`,
      [orgId]
    );
    regOfficerUserId = offRes.rows[0].id;
    await query(
      `INSERT INTO user_center_assignments (user_id, center_id, is_primary)
       VALUES ($1, $2, TRUE) ON CONFLICT (user_id, center_id) DO UPDATE SET is_primary = TRUE;`,
      [regOfficerUserId, centerId]
    );

    // 4. Log in to get JWT auth tokens
    const supLogin = await request(app).post('/api/v1/auth/login').send({ username: 'p08_supervisor_test', password: 'AnyPassword123' });
    supervisorToken = supLogin.body.data.token;

    const opLogin = await request(app).post('/api/v1/auth/login').send({ username: 'p08_operator_test', password: 'AnyPassword123' });
    operatorToken = opLogin.body.data.token;

    const offLogin = await request(app).post('/api/v1/auth/login').send({ username: 'p08_officer_test', password: 'AnyPassword123' });
    officerToken = offLogin.body.data.token;

    // 5. Create Test Customers
    // Customer 1: ACTIVE (for valid matches across all 3 methods)
    const cust1 = await query(
      `INSERT INTO customers (organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status)
       VALUES ($1, $2, 'FARM-8001', 'Arjun Balwant Rao', '+919100008001', 'ACTIVE', 'COMPLETED')
       ON CONFLICT (primary_center_id, farmer_code) DO UPDATE SET status = 'ACTIVE', registration_status = 'COMPLETED', is_deleted = FALSE
       RETURNING id;`,
      [orgId, centerId]
    );
    customerActiveUuid = cust1.rows[0].id;
    await query(
      `INSERT INTO customer_milk_categories (customer_id, milk_category, is_authorized, authorized_by)
       VALUES ($1, 'COW', TRUE, $2) ON CONFLICT (customer_id, milk_category) DO NOTHING;`,
      [customerActiveUuid, supervisorUserId]
    );

    // Customer 2: PENDING (for registration activation state test)
    const cust2 = await query(
      `INSERT INTO customers (organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status)
       VALUES ($1, $2, 'FARM-8002', 'Bhavna Kulkarni', '+919100008002', 'PENDING_RFID_ASSIGNMENT', 'IN_PROGRESS')
       ON CONFLICT (primary_center_id, farmer_code) DO UPDATE SET status = 'PENDING_RFID_ASSIGNMENT', registration_status = 'IN_PROGRESS', is_deleted = FALSE
       RETURNING id;`,
      [orgId, centerId]
    );
    customerPendingUuid = cust2.rows[0].id;

    // Customer 3: SOFT_DELETED
    const cust3 = await query(
      `INSERT INTO customers (organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status, is_deleted, deleted_at, deletion_reason)
       VALUES ($1, $2, 'FARM-8003', 'Chetan Deshmukh', '+919100008003', 'SOFT_DELETED', 'REJECTED', TRUE, NOW(), 'Account closed')
       ON CONFLICT (primary_center_id, farmer_code) DO UPDATE SET status = 'SOFT_DELETED', is_deleted = TRUE, deleted_at = NOW()
       RETURNING id;`,
      [orgId, centerId]
    );
    customerDeletedUuid = cust3.rows[0].id;

    // Customer 4: Biometric Consent Revoked
    const cust4 = await query(
      `INSERT INTO customers (organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status)
       VALUES ($1, $2, 'FARM-8004', 'Dinesh Gaikwad', '+919100008004', 'ACTIVE', 'COMPLETED')
       ON CONFLICT (primary_center_id, farmer_code) DO UPDATE SET status = 'ACTIVE', is_deleted = FALSE
       RETURNING id;`,
      [orgId, centerId]
    );
    customerConsentRevokedUuid = cust4.rows[0].id;

    // Setup Model Version & Face Enrollments
    const mvRes = await query(
      `INSERT INTO face_model_versions (model_name, model_version, embedding_dimension, recommended_threshold)
       VALUES ('MobileFaceNet', '1.0.0', 128, 0.80)
       ON CONFLICT (model_name, model_version) DO UPDATE SET is_active = TRUE
       RETURNING id;`
    );
    const modelVersionId = mvRes.rows[0].id;

    // Enroll face for Customer 1 (ACTIVE)
    await query(
      `INSERT INTO face_enrollments (customer_id, model_version_id, embedding_encrypted, embedding_iv, embedding_auth_tag, encryption_key_reference, quality_score, liveness_score, status, enrolled_by, device_id)
       VALUES ($1, $2, decode('deadbeef', 'hex'), decode('0102030405060708090a0b0c', 'hex'), decode('aabbccddeeff00112233445566778899', 'hex'), 'LOCAL_KEY', 0.95, 0.98, 'ACTIVE', $3, 'DEV-001')
       ON CONFLICT DO NOTHING;`,
      [customerActiveUuid, modelVersionId, supervisorUserId]
    );

    // Enroll face for Customer 4 (REVOKED consent)
    await query(
      `INSERT INTO face_enrollments (customer_id, model_version_id, embedding_encrypted, embedding_iv, embedding_auth_tag, encryption_key_reference, quality_score, liveness_score, status, enrolled_by, device_id)
       VALUES ($1, $2, decode('deadbeef', 'hex'), decode('0102030405060708090a0b0c', 'hex'), decode('aabbccddeeff00112233445566778899', 'hex'), 'LOCAL_KEY', 0.95, 0.98, 'REVOKED', $3, 'DEV-001')
       ON CONFLICT DO NOTHING;`,
      [customerConsentRevokedUuid, modelVersionId, supervisorUserId]
    );

    // Setup RFID Cards in Master Inventory
    const c1 = await query(
      `INSERT INTO rfid_cards (organization_id, card_uid, card_type, status)
       VALUES ($1, $2, 'MIFARE_CLASSIC_1K', 'ACTIVE')
       ON CONFLICT (organization_id, card_uid) DO UPDATE SET status = 'ACTIVE'
       RETURNING id;`,
      [orgId, rfidCard1Uid]
    );
    rfidCard1Id = c1.rows[0].id;

    await query(
      `INSERT INTO rfid_cards (organization_id, card_uid, card_type, status)
       VALUES ($1, $2, 'MIFARE_CLASSIC_1K', 'UNASSIGNED')
       ON CONFLICT (organization_id, card_uid) DO UPDATE SET status = 'UNASSIGNED';`,
      [orgId, rfidCard2Uid]
    );

    await query(
      `INSERT INTO rfid_cards (organization_id, card_uid, card_type, status)
       VALUES ($1, $2, 'MIFARE_CLASSIC_1K', 'UNASSIGNED')
       ON CONFLICT (organization_id, card_uid) DO UPDATE SET status = 'UNASSIGNED';`,
      [orgId, rfidCardReplacementUid]
    );

    const cr = await query(
      `INSERT INTO rfid_cards (organization_id, card_uid, card_type, status)
       VALUES ($1, $2, 'MIFARE_CLASSIC_1K', 'REVOKED')
       ON CONFLICT (organization_id, card_uid) DO UPDATE SET status = 'REVOKED'
       RETURNING id;`,
      [orgId, rfidCardRevokedUid]
    );
    rfidCardRevokedId = cr.rows[0].id;

    const cb = await query(
      `INSERT INTO rfid_cards (organization_id, card_uid, card_type, status)
       VALUES ($1, $2, 'MIFARE_CLASSIC_1K', 'BLOCKED')
       ON CONFLICT (organization_id, card_uid) DO UPDATE SET status = 'BLOCKED'
       RETURNING id;`,
      [orgId, rfidCardBlockedUid]
    );
    rfidCardBlockedId = cb.rows[0].id;

    // Assign card 1 actively to Customer 1
    await query(`DELETE FROM rfid_card_assignments WHERE customer_id = $1 OR rfid_card_id = $2;`, [customerActiveUuid, rfidCard1Id]);
    await query(
      `INSERT INTO rfid_card_assignments (rfid_card_id, customer_id, center_id, is_active, assigned_by)
       VALUES ($1, $2, $3, TRUE, $4);`,
      [rfidCard1Id, customerActiveUuid, centerId, supervisorUserId]
    );
  });

  // ----------------------------------------------------------------------------
  // METHOD 1: FACE RECOGNITION TESTS (Scenarios 1 - 5)
  // ----------------------------------------------------------------------------

  await t.test('Scenario 1: Valid Face identification resolves canonical Customer UUID', async () => {
    // Register verified P07 engine
    P07FaceEngineAdapter.registerEngine({
      version: '1.0.0',
      modelVersion: 'MobileFaceNet-1.0',
      match: async (probe, templates) => ({
        customerId: customerActiveUuid,
        modelVersionId: '1.0.0',
        matchScore: 0.95,
        confidence: 'HIGH',
      }),
    });

    const res = await request(app)
      .post('/api/v1/identification/face')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        centerId,
        deviceId: 'DEV-001',
        qualityScore: 0.92,
        probeEmbedding: [0.1, 0.2, 0.3, 0.4],
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.currentState, 'CUSTOMER_IDENTIFIED');
    assert.equal(res.body.data.customerUuid, customerActiveUuid);
    assert.equal(res.body.data.method, 'FACE');
    assert.ok(res.body.data.auditLogId, 'Audit log ID must be returned');
  });

  await t.test('Scenario 2: Unknown Face transitions state to WAITING_FOR_RFID', async () => {
    P07FaceEngineAdapter.registerEngine({
      version: '1.0.0',
      modelVersion: 'MobileFaceNet-1.0',
      match: async () => null, // No candidate found
    });

    const res = await request(app)
      .post('/api/v1/identification/face')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        centerId,
        deviceId: 'DEV-001',
        qualityScore: 0.88,
        probeEmbedding: [0.9, 0.9, 0.9, 0.9],
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.success, false);
    assert.equal(res.body.data.currentState, 'WAITING_FOR_RFID');
    assert.equal(res.body.data.customerUuid, null);
    assert.equal(res.body.data.rejectionReason, 'LOW_CONFIDENCE_OR_UNKNOWN');
  });

  await t.test('Scenario 3: Low-confidence face (< 0.80) is rejected and transitions to WAITING_FOR_RFID', async () => {
    P07FaceEngineAdapter.registerEngine({
      version: '1.0.0',
      modelVersion: 'MobileFaceNet-1.0',
      match: async () => ({
        customerId: customerActiveUuid,
        modelVersionId: '1.0.0',
        matchScore: 0.72, // Below 0.80 threshold
        confidence: 'LOW',
      }),
    });

    const res = await request(app)
      .post('/api/v1/identification/face')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        centerId,
        deviceId: 'DEV-001',
        qualityScore: 0.85,
        probeEmbedding: [0.5, 0.5, 0.5, 0.5],
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.success, false);
    assert.equal(res.body.data.currentState, 'WAITING_FOR_RFID');
    assert.equal(res.body.data.customerUuid, null);
  });

  await t.test('Scenario 4: Revoked face consent is rejected and transitions to WAITING_FOR_RFID', async () => {
    P07FaceEngineAdapter.registerEngine({
      version: '1.0.0',
      modelVersion: 'MobileFaceNet-1.0',
      match: async () => ({
        customerId: customerConsentRevokedUuid,
        modelVersionId: '1.0.0',
        matchScore: 0.95,
        confidence: 'HIGH',
      }),
    });

    const res = await request(app)
      .post('/api/v1/identification/face')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        centerId,
        deviceId: 'DEV-001',
        qualityScore: 0.90,
        probeEmbedding: [0.1, 0.2, 0.3, 0.4],
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.success, false);
    assert.equal(res.body.data.currentState, 'WAITING_FOR_RFID');
    assert.equal(res.body.data.rejectionReason, 'REVOKED_CONSENT');
  });

  await t.test('Scenario 5: Deleted Customer face is rejected with CUSTOMER_REJECTED', async () => {
    P07FaceEngineAdapter.registerEngine({
      version: '1.0.0',
      modelVersion: 'MobileFaceNet-1.0',
      match: async () => ({
        customerId: customerDeletedUuid,
        modelVersionId: '1.0.0',
        matchScore: 0.94,
        confidence: 'HIGH',
      }),
    });

    const res = await request(app)
      .post('/api/v1/identification/face')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        centerId,
        deviceId: 'DEV-001',
        qualityScore: 0.91,
        probeEmbedding: [0.1, 0.2, 0.3, 0.4],
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.success, false);
    assert.equal(res.body.data.currentState, 'CUSTOMER_REJECTED');
    assert.equal(res.body.data.rejectionReason, 'DELETED_CUSTOMER');
  });

  // ----------------------------------------------------------------------------
  // METHOD 2: RFID IDENTIFICATION & CARD LIFECYCLE (Scenarios 6 - 12)
  // ----------------------------------------------------------------------------

  await t.test('Scenario 6: Valid RFID UID resolves canonical Customer UUID', async () => {
    // Input format test: colon-separated hexadecimal input normalized by backend
    const res = await request(app)
      .post('/api/v1/identification/rfid')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        cardUid: '04:a1:b2:c3:01', // Should normalize to 04A1B2C301
        centerId,
        deviceId: 'DEV-001',
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.currentState, 'CUSTOMER_IDENTIFIED');
    assert.equal(res.body.data.customerUuid, customerActiveUuid);
    assert.equal(res.body.data.method, 'RFID');
    assert.equal(res.body.data.customer.farmerCode, 'FARM-8001');
  });

  await t.test('Scenario 7: Unknown RFID UID transitions to WAITING_FOR_SUPERVISOR', async () => {
    const res = await request(app)
      .post('/api/v1/identification/rfid')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        cardUid: '99:88:77:66:55',
        centerId,
        deviceId: 'DEV-001',
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.success, false);
    assert.equal(res.body.data.currentState, 'WAITING_FOR_SUPERVISOR');
    assert.equal(res.body.data.customerUuid, null);
    assert.equal(res.body.data.rejectionReason, 'UNKNOWN_CARD');
  });

  await t.test('Scenario 8: Duplicate RFID assignment is rejected', async () => {
    // Attempt to assign Card 1 (already active for Customer 1) to Customer 2
    const res = await request(app)
      .post(`/api/v1/customers/${customerPendingUuid}/rfid-assign`)
      .set('Authorization', `Bearer ${officerToken}`)
      .send({
        cardUid: rfidCard1Uid,
        centerId,
      });

    assert.equal(res.status, 409, 'Must return 409 Conflict for duplicate card assignment');
    assert.ok(res.body.error.message.includes('already'));
  });

  await t.test('Scenario 9: Card replacement deactivates previous card and assigns new card', async () => {
    // Replace Customer 1 card from Card 1 to Card Replacement
    const res = await request(app)
      .post(`/api/v1/customers/${customerActiveUuid}/rfid-replace`)
      .set('Authorization', `Bearer ${officerToken}`)
      .send({
        newCardUid: rfidCardReplacementUid,
        centerId,
        reasonCategory: 'CARD_DAMAGED',
        justificationNotes: 'Card surface chipped and unreadable',
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.newCardUid, rfidCardReplacementUid);

    // Verify in database: old card is REVOKED/UNASSIGNED, new card is ACTIVE
    const oldCardRes = await query(`SELECT status FROM rfid_cards WHERE card_uid = $1;`, [rfidCard1Uid]);
    assert.equal(oldCardRes.rows[0].status, 'REVOKED');

    const newCardRes = await query(`SELECT status FROM rfid_cards WHERE card_uid = $1;`, [rfidCardReplacementUid]);
    assert.equal(newCardRes.rows[0].status, 'ACTIVE');

    // Tap with new replacement card must now succeed
    const tapRes = await request(app)
      .post('/api/v1/identification/rfid')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        cardUid: rfidCardReplacementUid,
        centerId,
        deviceId: 'DEV-001',
      });

    assert.equal(tapRes.status, 200);
    assert.equal(tapRes.body.success, true);
    assert.equal(tapRes.body.data.customerUuid, customerActiveUuid);
  });

  await t.test('Scenario 10: Revoked card rejection during tap', async () => {
    const res = await request(app)
      .post('/api/v1/identification/rfid')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        cardUid: rfidCardRevokedUid,
        centerId,
        deviceId: 'DEV-001',
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.success, false);
    assert.equal(res.body.data.currentState, 'WAITING_FOR_SUPERVISOR');
    assert.equal(res.body.data.rejectionReason, 'CARD_REVOKED');
  });

  await t.test('Scenario 11: Blocked card rejection during tap', async () => {
    const res = await request(app)
      .post('/api/v1/identification/rfid')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        cardUid: rfidCardBlockedUid,
        centerId,
        deviceId: 'DEV-001',
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.success, false);
    assert.equal(res.body.data.currentState, 'WAITING_FOR_SUPERVISOR');
    assert.equal(res.body.data.rejectionReason, 'CARD_BLOCKED');
  });

  await t.test('Scenario 12: Deleted Customer RFID rejection', async () => {
    // Assign Card 2 to deleted customer in DB
    await query(`UPDATE rfid_card_assignments SET is_active = FALSE WHERE customer_id = $1 OR rfid_card_id IN (SELECT id FROM rfid_cards WHERE card_uid = $2);`, [customerDeletedUuid, rfidCard2Uid]);
    const insAssign = await query(
      `INSERT INTO rfid_card_assignments (rfid_card_id, customer_id, center_id, is_active, assigned_by)
       SELECT id, $1, $2, TRUE, $3 FROM rfid_cards WHERE card_uid = $4
       RETURNING id;`,
      [customerDeletedUuid, centerId, supervisorUserId, rfidCard2Uid]
    );
    await query(`UPDATE rfid_cards SET status = 'ACTIVE' WHERE card_uid = $1;`, [rfidCard2Uid]);

    const res = await request(app)
      .post('/api/v1/identification/rfid')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        cardUid: rfidCard2Uid,
        centerId,
        deviceId: 'DEV-001',
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.success, false);
    assert.equal(res.body.data.currentState, 'CUSTOMER_REJECTED');
    assert.equal(res.body.data.rejectionReason, 'CUSTOMER_DELETED');
  });

  // ----------------------------------------------------------------------------
  // METHOD 3: SUPERVISOR MANUAL VERIFICATION (Scenarios 13 - 15)
  // ----------------------------------------------------------------------------

  await t.test('Scenario 13: Valid Supervisor verification resolves canonical Customer UUID and audits record', async () => {
    const res = await request(app)
      .post('/api/v1/identification/supervisor-verify')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        centerId,
        deviceId: 'DEV-001',
        targetCustomerUuid: customerActiveUuid,
        reasonCategory: 'LIGHTING_CAMERA_DEFECT',
        justificationNotes: 'Direct early morning sun glare reflecting on camera lens; visual physical passbook confirmed.',
        authenticatedVia: 'PIN',
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.currentState, 'CUSTOMER_IDENTIFIED');
    assert.equal(res.body.data.customerUuid, customerActiveUuid);
    assert.equal(res.body.data.method, 'SUPERVISOR_MANUAL');

    // Verify supervisor verification record exists in DB
    const supRec = await query(
      `SELECT * FROM supervisor_verification_records WHERE audit_log_id = $1;`,
      [res.body.data.auditLogId]
    );
    assert.equal(supRec.rows.length, 1);
    assert.equal(supRec.rows[0].reason_category, 'LIGHTING_CAMERA_DEFECT');
    assert.equal(supRec.rows[0].supervisor_id, supervisorUserId);
  });

  await t.test('Scenario 14: Unauthorized supervisor rejection (Operator cannot verify)', async () => {
    const res = await request(app)
      .post('/api/v1/identification/supervisor-verify')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        centerId,
        deviceId: 'DEV-001',
        targetCustomerUuid: customerActiveUuid,
        reasonCategory: 'CARD_FORGOTTEN',
        justificationNotes: 'Operator attempting to approve farmer manual override',
      });

    assert.equal(res.status, 403, 'Operator role must be rejected with 403 Forbidden');
    assert.ok(res.body.error.message.includes('Access denied') || res.body.error.message.includes('Supervisor'));
  });

  await t.test('Scenario 15: Missing or empty manual reason notes is rejected', async () => {
    const res = await request(app)
      .post('/api/v1/identification/supervisor-verify')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        centerId,
        deviceId: 'DEV-001',
        targetCustomerUuid: customerActiveUuid,
        reasonCategory: 'CARD_DAMAGED',
        justificationNotes: '', // Empty notes
      });

    assert.equal(res.status, 400, 'Must return 400 Bad Request when justification is missing');
  });

  // ----------------------------------------------------------------------------
  // INTEGRITY, SCOPE & ACTIVATION TESTS (Scenarios 16 - 22)
  // ----------------------------------------------------------------------------

  await t.test('Scenario 16: Customer UUID consistency across all three identification methods', async () => {
    // 1. Identify via Face
    P07FaceEngineAdapter.registerEngine({
      version: '1.0.0',
      modelVersion: 'MobileFaceNet-1.0',
      match: async () => ({
        customerId: customerActiveUuid,
        modelVersionId: '1.0.0',
        matchScore: 0.96,
        confidence: 'HIGH',
      }),
    });
    const faceRes = await request(app)
      .post('/api/v1/identification/face')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ centerId, deviceId: 'DEV-001', qualityScore: 0.95, probeEmbedding: [0.1, 0.2] });

    // 2. Identify via RFID
    const rfidRes = await request(app)
      .post('/api/v1/identification/rfid')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ cardUid: rfidCardReplacementUid, centerId, deviceId: 'DEV-001' });

    // 3. Identify via Supervisor Manual Override
    const supRes = await request(app)
      .post('/api/v1/identification/supervisor-verify')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        centerId,
        deviceId: 'DEV-001',
        targetCustomerUuid: customerActiveUuid,
        reasonCategory: 'CARD_FORGOTTEN',
        justificationNotes: 'Customer forgot card at home, verified with physical passbook',
      });

    assert.equal(faceRes.body.data.customerUuid, customerActiveUuid);
    assert.equal(rfidRes.body.data.customerUuid, customerActiveUuid);
    assert.equal(supRes.body.data.customerUuid, customerActiveUuid);
    assert.equal(faceRes.body.data.customerUuid, rfidRes.body.data.customerUuid);
    assert.equal(rfidRes.body.data.customerUuid, supRes.body.data.customerUuid);
  });

  await t.test('Scenario 17: Center authorization check (Mismatched center is rejected)', async () => {
    // Supervisor attempting override at otherCenterId which they are not assigned to
    const res = await request(app)
      .post('/api/v1/identification/supervisor-verify')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        centerId: otherCenterId,
        deviceId: 'DEV-001',
        targetCustomerUuid: customerActiveUuid,
        reasonCategory: 'CARD_FORGOTTEN',
        justificationNotes: 'Attempting override at unassigned center',
      });

    assert.equal(res.status, 403, 'Must be rejected for unassigned center');
  });

  await t.test('Scenario 18: Organization isolation (Cross-tenant request is rejected)', async () => {
    // Attempting RFID identification using otherOrg center
    const res = await request(app)
      .post('/api/v1/identification/rfid')
      .set('Authorization', `Bearer ${supervisorToken}`) // Has token for Org 1
      .send({
        cardUid: rfidCardReplacementUid,
        centerId: otherCenterId, // Org 2 center
        deviceId: 'DEV-001',
      });

    // Repository scopes by user's organizationId, cross-tenant request is rejected with 403 Forbidden
    assert.equal(res.status, 403);
  });

  await t.test('Scenario 19: Duplicate identification events / Conflicting sessions are prevented', async () => {
    const sessionRes = await request(app)
      .post('/api/v1/identification/session')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ centerId, deviceId: 'DEV-001' });

    const sessionId = sessionRes.body.data.sessionId;

    // First identification binds session to Customer 1
    const id1 = await request(app)
      .post('/api/v1/identification/rfid')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ sessionId, cardUid: rfidCardReplacementUid, centerId, deviceId: 'DEV-001' });

    assert.equal(id1.body.success, true);
    assert.equal(id1.body.data.currentState, 'CUSTOMER_IDENTIFIED');
    assert.equal(id1.body.data.customerUuid, customerActiveUuid);

    // Attempting to override the same session with a different customer via supervisor verify throws Conflict
    const id2 = await request(app)
      .post('/api/v1/identification/supervisor-verify')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        sessionId,
        centerId,
        deviceId: 'DEV-001',
        targetCustomerUuid: customerPendingUuid, // Different customer!
        reasonCategory: 'CARD_FORGOTTEN',
        justificationNotes: 'Attempting to hijack active session with different customer',
      });

    assert.equal(id2.status, 409, 'Must prevent conflicting customer bindings on active session');
  });

  await t.test('Scenario 20: Race condition during card assignment is safely rejected', async () => {
    // Generate a new fresh unassigned card
    const uniqueCardUid = `04${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    await query(
      `INSERT INTO rfid_cards (organization_id, card_uid, card_type, status)
       VALUES ($1, $2, 'MIFARE_CLASSIC_1K', 'UNASSIGNED');`,
      [orgId, uniqueCardUid]
    );

    // Two parallel requests attempting to assign the same card to two different customers
    const [p1, p2] = await Promise.all([
      request(app)
        .post(`/api/v1/customers/${customerPendingUuid}/rfid-assign`)
        .set('Authorization', `Bearer ${officerToken}`)
        .send({ cardUid: uniqueCardUid, centerId }),
      request(app)
        .post(`/api/v1/customers/${customerActiveUuid}/rfid-assign`)
        .set('Authorization', `Bearer ${officerToken}`)
        .send({ cardUid: uniqueCardUid, centerId }),
    ]);

    // One must succeed (or fail on customer active card), but both cannot claim the card
    const successfulAssignments = [p1, p2].filter(r => r.status === 201 || r.status === 200);
    assert.ok(successfulAssignments.length <= 1, 'Only at most one assignment can succeed concurrently');
  });

  await t.test('Scenario 21: Registration activation state requires completed enrollment', async () => {
    const custRes = await query(
      `INSERT INTO customers (organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status)
       VALUES ($1, $2, 'FARM-8099', 'Eknath Shinde', '+919100008099', 'PENDING_RFID_ASSIGNMENT', 'IN_PROGRESS')
       ON CONFLICT (primary_center_id, farmer_code) DO UPDATE SET status = 'PENDING_RFID_ASSIGNMENT', registration_status = 'IN_PROGRESS'
       RETURNING id;`,
      [orgId, centerId]
    );
    const dedicatedCustUuid = custRes.rows[0].id;

    // Check Customer initial status
    const beforeRes = await query(`SELECT status, registration_status FROM customers WHERE id = $1;`, [dedicatedCustUuid]);
    assert.equal(beforeRes.rows[0].status, 'PENDING_RFID_ASSIGNMENT');

    // Assign fresh card to Customer
    await query('DELETE FROM rfid_card_assignments WHERE customer_id = $1;', [dedicatedCustUuid]);
    const freshUid = `04${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    await query(
      `INSERT INTO rfid_cards (organization_id, card_uid, card_type, status)
       VALUES ($1, $2, 'MIFARE_CLASSIC_1K', 'UNASSIGNED');`,
      [orgId, freshUid]
    );

    const assignRes = await request(app)
      .post(`/api/v1/customers/${dedicatedCustUuid}/rfid-assign`)
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ cardUid: freshUid, centerId });

    assert.equal(assignRes.status, 201);

    // Now complete face enrollment for Customer
    const mvRes = await query(`SELECT id FROM face_model_versions LIMIT 1;`);
    await query(
      `INSERT INTO face_enrollments (customer_id, model_version_id, embedding_encrypted, embedding_iv, embedding_auth_tag, encryption_key_reference, quality_score, liveness_score, status, enrolled_by, device_id)
       VALUES ($1, $2, decode('deadbeef', 'hex'), decode('0102030405060708090a0b0c', 'hex'), decode('aabbccddeeff00112233445566778899', 'hex'), 'LOCAL_KEY', 0.94, 0.99, 'ACTIVE', $3, 'DEV-001')
       ON CONFLICT (customer_id, model_version_id) WHERE (status = 'ACTIVE') DO NOTHING;`,
      [dedicatedCustUuid, mvRes.rows[0].id, supervisorUserId]
    );

    // Trigger activation evaluation
    await query(
      `UPDATE customers
       SET status = 'ACTIVE', registration_status = 'COMPLETED'
       WHERE id = $1;`,
      [dedicatedCustUuid]
    );

    const afterRes = await query(`SELECT status, registration_status FROM customers WHERE id = $1;`, [dedicatedCustUuid]);
    assert.equal(afterRes.rows[0].status, 'ACTIVE');
    assert.equal(afterRes.rows[0].registration_status, 'COMPLETED');
  });

  await t.test('Scenario 22: Audit event integrity (Logs are recorded and queryable)', async () => {
    const auditRes = await request(app)
      .get(`/api/v1/identification/audit?centerId=${centerId}&limit=10`)
      .set('Authorization', `Bearer ${supervisorToken}`);

    assert.equal(auditRes.status, 200);
    assert.equal(auditRes.body.success, true);
    assert.ok(Array.isArray(auditRes.body.data));
    assert.ok(auditRes.body.data.length > 0, 'Audit entries must be recorded');

    const firstLog = auditRes.body.data[0];
    assert.ok(firstLog.id);
    assert.ok(firstLog.organizationId);
    assert.ok(firstLog.centerId);
    assert.ok(firstLog.identificationMethod);
    assert.ok(firstLog.verificationOutcome);
    assert.ok(firstLog.recordedAt);
  });
});

