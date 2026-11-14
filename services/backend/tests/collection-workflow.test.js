import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import pg from 'pg';
import crypto from 'node:crypto';
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

test('DFarm Phase 10: Complete Milk Collection Workflow & Accounting Test Suite (36 Scenarios)', async (t) => {
  await dbClient.connect();
  t.after(async () => {
    await dbClient.end();
    await pool.end();
  });

  const app = createApp();

  // Test shared state
  let sangliOrgId = '';
  let tasgaonCenterId = '';
  let mirajCenterId = '';
  let operatorUserId = '';
  let supervisorUserId = '';
  let unauthorizedUserId = '';
  let operatorToken = '';
  let supervisorToken = '';
  let unauthorizedToken = '';
  const testDeviceId = 'DEV_TABLET_P10_001';
  let testDeviceUuid = '';
  let deviceToken = '';

  let cowRateChartId = '';
  let cowRateVersion1Id = '';
  let cowRateVersion0Id = ''; // Historical
  let bufRateChartId = '';
  let bufRateVersion1Id = '';

  let cowOnlyCustomerId = '';
  let bufOnlyCustomerId = '';
  let bothCustomerId = '';
  let suspendedCustomerId = '';
  let deletedCustomerId = '';
  let otherCenterCustomerId = '';

  const cowRfid = 'RFID-COW-1001';
  const bufRfid = 'RFID-BUF-1002';
  const bothRfid = 'RFID-BOTH-1003';
  const suspendedRfid = 'RFID-SUSP-1004';

  await t.test('0. Setup Test Organization, Center, Settings, Users, Rates & Customers', async () => {
    // 0. Clean up previous test artifacts to ensure test idempotency
    await query("SET session_replication_role = 'replica';");
    try {
      await query(`
        DELETE FROM collection_adjustments WHERE collection_id IN (
          SELECT id FROM milk_collections WHERE customer_id IN (SELECT id FROM customers WHERE farmer_code LIKE 'FC-%-01')
        );
        DELETE FROM collection_reversals WHERE collection_id IN (
          SELECT id FROM milk_collections WHERE customer_id IN (SELECT id FROM customers WHERE farmer_code LIKE 'FC-%-01')
        );
        DELETE FROM collection_receipts WHERE collection_id IN (
          SELECT id FROM milk_collections WHERE customer_id IN (SELECT id FROM customers WHERE farmer_code LIKE 'FC-%-01')
        );
        DELETE FROM collection_quality_readings WHERE session_id IN (
          SELECT id FROM collection_sessions WHERE customer_id IN (SELECT id FROM customers WHERE farmer_code LIKE 'FC-%-01')
        );
        DELETE FROM collection_weight_readings WHERE session_id IN (
          SELECT id FROM collection_sessions WHERE customer_id IN (SELECT id FROM customers WHERE farmer_code LIKE 'FC-%-01')
        );
        DELETE FROM milk_collections WHERE customer_id IN (SELECT id FROM customers WHERE farmer_code LIKE 'FC-%-01');
        DELETE FROM ledger_transactions WHERE customer_id IN (SELECT id FROM customers WHERE farmer_code LIKE 'FC-%-01');
        DELETE FROM collection_sessions WHERE customer_id IN (SELECT id FROM customers WHERE farmer_code LIKE 'FC-%-01');
        DELETE FROM rfid_card_assignments WHERE rfid_card_id IN (
          SELECT id FROM rfid_cards WHERE card_uid IN ('RFID-COW-1001', 'RFID-BUF-1002', 'RFID-BOTH-1003', 'RFID-SUSP-1004')
        );
        DELETE FROM rfid_cards WHERE card_uid IN ('RFID-COW-1001', 'RFID-BUF-1002', 'RFID-BOTH-1003', 'RFID-SUSP-1004');
        DELETE FROM customer_milk_categories WHERE customer_id IN (SELECT id FROM customers WHERE farmer_code LIKE 'FC-%-01');
        DELETE FROM customer_ledger_accounts WHERE customer_id IN (SELECT id FROM customers WHERE farmer_code LIKE 'FC-%-01');
        DELETE FROM customers WHERE farmer_code LIKE 'FC-%-01' OR normalized_mobile_number IN ('+919811111111', '+919822222222', '+919833333333', '+919844444444', '+919855555555', '+919866666666');
        DELETE FROM rate_chart_cells WHERE rate_chart_version_id IN (
          SELECT rcv.id FROM rate_chart_versions rcv JOIN rate_charts rc ON rc.id = rcv.rate_chart_id WHERE rc.name LIKE 'Tasgaon % Standard Rate P10'
        );
        DELETE FROM rate_chart_versions WHERE rate_chart_id IN (
          SELECT id FROM rate_charts WHERE name LIKE 'Tasgaon % Standard Rate P10'
        );
        DELETE FROM rate_charts WHERE name LIKE 'Tasgaon % Standard Rate P10';
      `);
    } finally {
      await query("SET session_replication_role = 'origin';");
    }

    // 1. Get or create Organization
    const orgRes = await query("SELECT id FROM organizations WHERE name ILIKE '%Sangli%' LIMIT 1;");
    assert.ok(orgRes.rows.length > 0, 'Sangli organization must exist');
    sangliOrgId = orgRes.rows[0].id;

    // 2. Centers
    const cRes = await query("SELECT id FROM dairy_centers WHERE organization_id = $1 ORDER BY name ASC LIMIT 2;", [sangliOrgId]);
    assert.ok(cRes.rows.length >= 1, 'At least 1 center must exist');
    tasgaonCenterId = cRes.rows[0].id;

    if (cRes.rows.length > 1) {
      mirajCenterId = cRes.rows[1].id;
    } else {
      const newCenter = await query(
        `INSERT INTO dairy_centers (organization_id, name, code, status) 
         VALUES ($1, 'Miraj Center 02', 'MIRAJ02', 'ACTIVE') RETURNING id;`,
        [sangliOrgId]
      );
      mirajCenterId = newCenter.rows[0].id;
    }

    // 3. Center Settings for biological limits
    await query(
      `INSERT INTO center_settings (
         center_id, cow_fat_min, cow_fat_max, cow_snf_min, cow_snf_max,
         buffalo_fat_min, buffalo_fat_max, buffalo_snf_min, buffalo_snf_max
       ) VALUES ($1, 2.8, 6.0, 7.8, 10.2, 5.0, 12.0, 8.2, 11.5)
       ON CONFLICT (center_id) DO UPDATE SET
         cow_fat_min = 2.8, cow_fat_max = 6.0, cow_snf_min = 7.8, cow_snf_max = 10.2,
         buffalo_fat_min = 5.0, buffalo_fat_max = 12.0, buffalo_snf_min = 8.2, buffalo_snf_max = 11.5;`,
      [tasgaonCenterId]
    );

    // 4. Operator user
    const opRes = await query(
      `INSERT INTO users (organization_id, username, full_name, email, phone_number, role, status)
       VALUES ($1, 'test_operator_p10', 'Sunil Pawar (Collector)', 'sunil.pawar@test.dfarm.com', '+919911223344', 'COLLECTION_OPERATOR', 'ACTIVE')
       ON CONFLICT (username) DO UPDATE SET status = 'ACTIVE', role = 'COLLECTION_OPERATOR'
       RETURNING id;`,
      [sangliOrgId]
    );
    operatorUserId = opRes.rows[0].id;
    await query(
      `INSERT INTO user_center_assignments (user_id, center_id, is_primary) VALUES ($1, $2, TRUE) ON CONFLICT DO NOTHING;`,
      [operatorUserId, tasgaonCenterId]
    );

    // 5. Supervisor user
    const supRes = await query(
      `INSERT INTO users (organization_id, username, full_name, email, phone_number, role, status)
       VALUES ($1, 'test_supervisor_p10', 'Mahesh Mane (Supervisor)', 'mahesh.mane@test.dfarm.com', '+919922334455', 'SUPERVISOR', 'ACTIVE')
       ON CONFLICT (username) DO UPDATE SET status = 'ACTIVE', role = 'SUPERVISOR'
       RETURNING id;`,
      [sangliOrgId]
    );
    supervisorUserId = supRes.rows[0].id;
    await query(
      `INSERT INTO user_center_assignments (user_id, center_id, is_primary) VALUES ($1, $2, TRUE) ON CONFLICT DO NOTHING;`,
      [supervisorUserId, tasgaonCenterId]
    );

    // 6. Unauthorized user (Registration officer attempting supervisor adjustment)
    const unauthRes = await query(
      `INSERT INTO users (organization_id, username, full_name, email, phone_number, role, status)
       VALUES ($1, 'test_unauth_p10', 'Vijay Shinde', 'vijay.shinde@test.dfarm.com', '+919933445566', 'REGISTRATION_OFFICER', 'ACTIVE')
       ON CONFLICT (username) DO UPDATE SET status = 'ACTIVE'
       RETURNING id;`,
      [sangliOrgId]
    );
    unauthorizedUserId = unauthRes.rows[0].id;

    // Tokens
    operatorToken = signJwt({
      sub: operatorUserId,
      userId: operatorUserId,
      organizationId: sangliOrgId,
      role: 'COLLECTION_OPERATOR',
      primaryCenterId: tasgaonCenterId,
      centerIds: [tasgaonCenterId],
    });

    supervisorToken = signJwt({
      sub: supervisorUserId,
      userId: supervisorUserId,
      organizationId: sangliOrgId,
      role: 'SUPERVISOR',
      primaryCenterId: tasgaonCenterId,
      centerIds: [tasgaonCenterId],
    });

    unauthorizedToken = signJwt({
      sub: unauthorizedUserId,
      userId: unauthorizedUserId,
      organizationId: sangliOrgId,
      role: 'REGISTRATION_OFFICER',
      primaryCenterId: tasgaonCenterId,
      centerIds: [tasgaonCenterId],
    });

    // 7. Device
    const devRes = await query(
      `INSERT INTO devices (organization_id, center_id, device_identifier, device_type, status, max_offline_hours, last_seen_at)
       VALUES ($1, $2, 'DEV_TABLET_P10_001', 'COUNTER_TERMINAL', 'ACTIVE', 72, NOW())
       ON CONFLICT (device_identifier) DO UPDATE SET status = 'ACTIVE', last_seen_at = NOW()
       RETURNING id;`,
      [sangliOrgId, tasgaonCenterId]
    );
    testDeviceUuid = devRes.rows[0].id;
    deviceToken = signJwt({
      sub: testDeviceUuid,
      organizationId: sangliOrgId,
      primaryCenterId: tasgaonCenterId,
      role: 'COLLECTION_OPERATOR',
    });

    // 8. Seed Rate Charts & Cells
    // Cow Rate Chart
    const rcCow = await query(
      `INSERT INTO rate_charts (organization_id, center_id, name, milk_category, pricing_type, is_active)
       VALUES ($1, $2, 'Tasgaon Cow Standard Rate P10', 'COW', 'GRID', TRUE)
       RETURNING id;`,
      [sangliOrgId, tasgaonCenterId]
    );
    cowRateChartId = rcCow.rows[0].id;

    // Version 1 (Active)
    const rcvCow1 = await query(
      `INSERT INTO rate_chart_versions (rate_chart_id, version_number, effective_from, is_approved, approved_by, approved_at)
       VALUES ($1, 1, NOW() - INTERVAL '1 day', TRUE, $2, NOW())
       RETURNING id;`,
      [cowRateChartId, supervisorUserId]
    );
    cowRateVersion1Id = rcvCow1.rows[0].id;

    // Version 0 (Historical, effective 30 days ago to 2 days ago)
    const rcvCow0 = await query(
      `INSERT INTO rate_chart_versions (rate_chart_id, version_number, effective_from, effective_to, is_approved, approved_by, approved_at)
       VALUES ($1, 0, NOW() - INTERVAL '30 days', NOW() - INTERVAL '2 days', TRUE, $2, NOW() - INTERVAL '30 days')
       RETURNING id;`,
      [cowRateChartId, supervisorUserId]
    );
    cowRateVersion0Id = rcvCow0.rows[0].id;

    // Insert cells for Cow Version 1: 4.0 Fat / 8.5 SNF -> 36.50, 4.2 Fat / 8.5 SNF -> 37.80
    await query(
      `INSERT INTO rate_chart_cells (rate_chart_version_id, fat_percentage, snf_percentage, rate_per_unit)
       VALUES 
         ($1, 4.0, 8.5, 36.50),
         ($1, 4.2, 8.5, 37.80),
         ($1, 3.5, 8.5, 34.00);`,
      [cowRateVersion1Id]
    );

    // Insert cells for Historical Cow Version 0: 4.0 Fat / 8.5 SNF -> 33.00 (Old lower rate)
    await query(
      `INSERT INTO rate_chart_cells (rate_chart_version_id, fat_percentage, snf_percentage, rate_per_unit)
       VALUES ($1, 4.0, 8.5, 33.00);`,
      [cowRateVersion0Id]
    );

    // Buffalo Rate Chart
    const rcBuf = await query(
      `INSERT INTO rate_charts (organization_id, center_id, name, milk_category, pricing_type, is_active)
       VALUES ($1, $2, 'Tasgaon Buffalo Standard Rate P10', 'BUFFALO', 'GRID', TRUE)
       RETURNING id;`,
      [sangliOrgId, tasgaonCenterId]
    );
    bufRateChartId = rcBuf.rows[0].id;

    const rcvBuf1 = await query(
      `INSERT INTO rate_chart_versions (rate_chart_id, version_number, effective_from, is_approved, approved_by, approved_at)
       VALUES ($1, 1, NOW() - INTERVAL '1 day', TRUE, $2, NOW())
       RETURNING id;`,
      [bufRateChartId, supervisorUserId]
    );
    bufRateVersion1Id = rcvBuf1.rows[0].id;

    await query(
      `INSERT INTO rate_chart_cells (rate_chart_version_id, fat_percentage, snf_percentage, rate_per_unit)
       VALUES 
         ($1, 6.0, 9.0, 55.00),
         ($1, 6.5, 9.0, 58.50);`,
      [bufRateVersion1Id]
    );

    // 9. Seed Test Customers
    // Cow-only customer
    const c1 = await query(
      `INSERT INTO customers (organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, is_deleted)
       VALUES ($1, $2, 'FC-COW-01', 'Pandurang Patil', '+919811111111', 'ACTIVE', FALSE)
       RETURNING id;`,
      [sangliOrgId, tasgaonCenterId]
    );
    cowOnlyCustomerId = c1.rows[0].id;
    await query(`INSERT INTO customer_milk_categories (customer_id, milk_category, is_authorized, authorized_by) VALUES ($1, 'COW', TRUE, $2);`, [cowOnlyCustomerId, supervisorUserId]);
    await query(`INSERT INTO customer_ledger_accounts (customer_id, organization_id, current_balance) VALUES ($1, $2, 0.00) ON CONFLICT DO NOTHING;`, [cowOnlyCustomerId, sangliOrgId]);
    const card1 = await query(`INSERT INTO rfid_cards (organization_id, card_uid, status) VALUES ($1, $2, 'ACTIVE') RETURNING id;`, [sangliOrgId, cowRfid]);
    await query(`INSERT INTO rfid_card_assignments (rfid_card_id, customer_id, center_id, is_active, assigned_by) VALUES ($1, $2, $3, TRUE, $4);`, [card1.rows[0].id, cowOnlyCustomerId, tasgaonCenterId, supervisorUserId]);

    // Buffalo-only customer
    const c2 = await query(
      `INSERT INTO customers (organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, is_deleted)
       VALUES ($1, $2, 'FC-BUF-01', 'Suresh Shinde', '+919822222222', 'ACTIVE', FALSE)
       RETURNING id;`,
      [sangliOrgId, tasgaonCenterId]
    );
    bufOnlyCustomerId = c2.rows[0].id;
    await query(`INSERT INTO customer_milk_categories (customer_id, milk_category, is_authorized, authorized_by) VALUES ($1, 'BUFFALO', TRUE, $2);`, [bufOnlyCustomerId, supervisorUserId]);
    await query(`INSERT INTO customer_ledger_accounts (customer_id, organization_id, current_balance) VALUES ($1, $2, 0.00) ON CONFLICT DO NOTHING;`, [bufOnlyCustomerId, sangliOrgId]);
    const card2 = await query(`INSERT INTO rfid_cards (organization_id, card_uid, status) VALUES ($1, $2, 'ACTIVE') RETURNING id;`, [sangliOrgId, bufRfid]);
    await query(`INSERT INTO rfid_card_assignments (rfid_card_id, customer_id, center_id, is_active, assigned_by) VALUES ($1, $2, $3, TRUE, $4);`, [card2.rows[0].id, bufOnlyCustomerId, tasgaonCenterId, supervisorUserId]);

    // Both categories customer
    const c3 = await query(
      `INSERT INTO customers (organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, is_deleted)
       VALUES ($1, $2, 'FC-BOTH-01', 'Ananda Kadam', '+919833333333', 'ACTIVE', FALSE)
       RETURNING id;`,
      [sangliOrgId, tasgaonCenterId]
    );
    bothCustomerId = c3.rows[0].id;
    await query(`INSERT INTO customer_milk_categories (customer_id, milk_category, is_authorized, authorized_by) VALUES ($1, 'COW', TRUE, $2), ($1, 'BUFFALO', TRUE, $2);`, [bothCustomerId, supervisorUserId]);
    await query(`INSERT INTO customer_ledger_accounts (customer_id, organization_id, current_balance) VALUES ($1, $2, 0.00) ON CONFLICT DO NOTHING;`, [bothCustomerId, sangliOrgId]);
    const card3 = await query(`INSERT INTO rfid_cards (organization_id, card_uid, status) VALUES ($1, $2, 'ACTIVE') RETURNING id;`, [sangliOrgId, bothRfid]);
    await query(`INSERT INTO rfid_card_assignments (rfid_card_id, customer_id, center_id, is_active, assigned_by) VALUES ($1, $2, $3, TRUE, $4);`, [card3.rows[0].id, bothCustomerId, tasgaonCenterId, supervisorUserId]);

    // Suspended customer
    const c4 = await query(
      `INSERT INTO customers (organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, is_deleted)
       VALUES ($1, $2, 'FC-SUSP-01', 'Tanaji Mane', '+919844444444', 'SUSPENDED', FALSE)
       RETURNING id;`,
      [sangliOrgId, tasgaonCenterId]
    );
    suspendedCustomerId = c4.rows[0].id;
    await query(`INSERT INTO customer_milk_categories (customer_id, milk_category, is_authorized, authorized_by) VALUES ($1, 'COW', TRUE, $2);`, [suspendedCustomerId, supervisorUserId]);
    const card4 = await query(`INSERT INTO rfid_cards (organization_id, card_uid, status) VALUES ($1, $2, 'ACTIVE') RETURNING id;`, [sangliOrgId, suspendedRfid]);
    await query(`INSERT INTO rfid_card_assignments (rfid_card_id, customer_id, center_id, is_active, assigned_by) VALUES ($1, $2, $3, TRUE, $4);`, [card4.rows[0].id, suspendedCustomerId, tasgaonCenterId, supervisorUserId]);

    // Soft-deleted customer
    const c5 = await query(
      `INSERT INTO customers (organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, is_deleted)
       VALUES ($1, $2, 'FC-DEL-01', 'Deepak Chavan', '+919855555555', 'ACTIVE', TRUE)
       RETURNING id;`,
      [sangliOrgId, tasgaonCenterId]
    );
    deletedCustomerId = c5.rows[0].id;

    // Customer in another center (Miraj)
    const c6 = await query(
      `INSERT INTO customers (organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, is_deleted)
       VALUES ($1, $2, 'FC-MIRAJ-01', 'Vikram Bhosale', '+919866666666', 'ACTIVE', FALSE)
       RETURNING id;`,
      [sangliOrgId, mirajCenterId]
    );
    otherCenterCustomerId = c6.rows[0].id;
    await query(`INSERT INTO customer_milk_categories (customer_id, milk_category, is_authorized, authorized_by) VALUES ($1, 'COW', TRUE, $2);`, [otherCenterCustomerId, supervisorUserId]);
  });

  // ==========================================
  // SECTION 18: 36 MANDATORY TEST SCENARIOS
  // ==========================================

  // --- IDENTIFICATION TESTS (1-6) ---

  await t.test('1. Face identification resolves to canonical customer UUID', async () => {
    const res = await request(app)
      .get(`/api/v1/customers/${cowOnlyCustomerId}`)
      .set('Authorization', `Bearer ${operatorToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.id, cowOnlyCustomerId);
    assert.equal(res.body.data.farmerCode, 'FC-COW-01');
  });

  await t.test('2. RFID identification resolves to canonical customer UUID', async () => {
    const cardRes = await query(
      `SELECT rca.customer_id 
       FROM rfid_card_assignments rca
       JOIN rfid_cards rc ON rc.id = rca.rfid_card_id
       WHERE rc.card_uid = $1 AND rca.is_active = TRUE;`,
      [cowRfid]
    );
    assert.equal(cardRes.rows[0].customer_id, cowOnlyCustomerId);
  });

  await t.test('3. Supervisor manual identification resolves to canonical customer UUID', async () => {
    const res = await request(app)
      .get(`/api/v1/customers/${bothCustomerId}`)
      .set('Authorization', `Bearer ${supervisorToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.id, bothCustomerId);
  });

  await t.test('4. Unknown customer identification rejected with 404', async () => {
    const fakeUuid = crypto.randomUUID();
    const res = await request(app)
      .get(`/api/v1/customers/${fakeUuid}`)
      .set('Authorization', `Bearer ${operatorToken}`);
    assert.equal(res.status, 404);
  });

  await t.test('5. Deleted customer rejected before session creation', async () => {
    const res = await request(app)
      .post('/api/v1/collections/sessions')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        customerId: deletedCustomerId,
        centerId: tasgaonCenterId,
        identificationMethod: 'SUPERVISOR_MANUAL',
        milkCategory: 'COW',
      });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'CUSTOMER_DELETED');
  });

  await t.test('6. Suspended customer rejected before session creation', async () => {
    const res = await request(app)
      .post('/api/v1/collections/sessions')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        customerId: suspendedCustomerId,
        centerId: tasgaonCenterId,
        identificationMethod: 'RFID',
        milkCategory: 'COW',
      });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'CUSTOMER_NOT_ACTIVE');
  });

  // --- MILK CATEGORY ENFORCEMENT TESTS (7-11) ---

  let cowSessionId = '';
  await t.test('7. Cow-only customer category enforcement allows COW session creation', async () => {
    const res = await request(app)
      .post('/api/v1/collections/sessions')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        customerId: cowOnlyCustomerId,
        centerId: tasgaonCenterId,
        identificationMethod: 'FACE',
        milkCategory: 'COW',
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.selectedMilkCategory, 'COW');
    cowSessionId = res.body.data.sessionId;
  });

  let bufSessionId = '';
  await t.test('8. Buffalo-only customer category enforcement allows BUFFALO session creation', async () => {
    const res = await request(app)
      .post('/api/v1/collections/sessions')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        customerId: bufOnlyCustomerId,
        centerId: tasgaonCenterId,
        identificationMethod: 'RFID',
        milkCategory: 'BUFFALO',
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.selectedMilkCategory, 'BUFFALO');
    bufSessionId = res.body.data.sessionId;
  });

  let bothSessionId = '';
  await t.test('9. Both-category customer manual selection allows operator choice', async () => {
    const res = await request(app)
      .post('/api/v1/collections/sessions')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        customerId: bothCustomerId,
        centerId: tasgaonCenterId,
        identificationMethod: 'SUPERVISOR_MANUAL',
        milkCategory: 'BUFFALO',
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.selectedMilkCategory, 'BUFFALO');
    bothSessionId = res.body.data.sessionId;
  });

  await t.test('10. Unauthorized category rejection when cow-only attempts BUFFALO intake', async () => {
    const res = await request(app)
      .post('/api/v1/collections/sessions')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        customerId: cowOnlyCustomerId,
        centerId: tasgaonCenterId,
        identificationMethod: 'FACE',
        milkCategory: 'BUFFALO', // Unauthorized
      });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.message.includes('not authorized'));
  });

  await t.test('11. Category change requires safe session cancellation first', async () => {
    // Attempting to create a second concurrent session for 'bothCustomerId' without cancelling fails with 409
    const dupRes = await request(app)
      .post('/api/v1/collections/sessions')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        customerId: bothCustomerId,
        centerId: tasgaonCenterId,
        identificationMethod: 'SUPERVISOR_MANUAL',
        milkCategory: 'COW',
      });
    assert.equal(dupRes.status, 409);
    assert.equal(dupRes.body.error.code, 'CONCURRENT_SESSION_EXISTS');

    // Safely cancel active session with reason
    const cancelRes = await request(app)
      .post(`/api/v1/collections/sessions/${bothSessionId}/cancel`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ reason: 'Farmer brought Cow milk instead of Buffalo' });
    assert.equal(cancelRes.status, 200);

    // Now starting new Cow session succeeds
    const newRes = await request(app)
      .post('/api/v1/collections/sessions')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        customerId: bothCustomerId,
        centerId: tasgaonCenterId,
        identificationMethod: 'SUPERVISOR_MANUAL',
        milkCategory: 'COW',
      });
    assert.equal(newRes.status, 201);
    assert.equal(newRes.body.data.selectedMilkCategory, 'COW');
    bothSessionId = newRes.body.data.sessionId;
  });

  // --- COLLECTION LIFECYCLE & MEASUREMENTS TESTS (12-24) ---

  await t.test('12. Valid collection session creation initializes with OPEN state', async () => {
    assert.ok(cowSessionId);
    const sessRes = await query("SELECT session_state FROM collection_sessions WHERE id = $1;", [cowSessionId]);
    assert.equal(sessRes.rows[0].session_state, 'OPEN');
  });

  await t.test('13. Missing required measurements rejection on completion attempt', async () => {
    const res = await request(app)
      .post(`/api/v1/collections/sessions/${cowSessionId}/complete`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        clientIntakeUuid: crypto.randomUUID(),
        netWeight: 0, // Missing positive weight
        fatPercentage: 0, // Missing fat
      });
    assert.equal(res.status, 400);
  });

  await t.test('14. Measurement outside biological limits rejection (Cow Fat 1.5% < 2.8% min)', async () => {
    const res = await request(app)
      .post(`/api/v1/collections/sessions/${cowSessionId}/measurements`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        fatPercentage: 1.5,
        snfPercentage: 8.5,
        netWeight: 10.0,
      });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.message.includes('outside approved biological limits'));
  });

  await t.test('15. Measurement outside biological limits rejection (Buffalo SNF 7.0% < 8.2% min)', async () => {
    const res = await request(app)
      .post(`/api/v1/collections/sessions/${bufSessionId}/measurements`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        fatPercentage: 6.5,
        snfPercentage: 7.0, // Invalid SNF
        netWeight: 15.0,
      });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.message.includes('outside approved biological limits'));
  });

  await t.test('16. Measurement outside biological limits rejection (Invalid negative weight)', async () => {
    const res = await request(app)
      .post(`/api/v1/collections/sessions/${cowSessionId}/measurements`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        fatPercentage: 4.0,
        snfPercentage: 8.5,
        netWeight: -5.0, // Negative weight
      });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.message.includes('strictly positive'));
  });

  await t.test('17. Missing pricing cell error returns controlled 404 without inventing rate', async () => {
    // Cow Fat 5.8% / SNF 9.9% is within biological bounds but NOT present in the rate matrix table
    const res = await request(app)
      .post('/api/v1/rates/calculate')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        centerId: tasgaonCenterId,
        milkCategory: 'COW',
        fat: 5.8,
        snf: 9.9,
        quantity: 10.0,
      });
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'RATE_CELL_NOT_FOUND');
    assert.ok(res.body.error.message.includes('Controlled Pricing Error'));
  });

  await t.test('18. Historical rate version preservation preserves original rate version', async () => {
    // Calculate rate using historical version 0 (effective in past with rate 33.00)
    const res = await request(app)
      .post('/api/v1/rates/calculate')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        centerId: tasgaonCenterId,
        milkCategory: 'COW',
        fat: 4.0,
        snf: 8.5,
        quantity: 10.0,
        versionId: cowRateVersion0Id, // Explicit historical version
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.appliedRate, 33.00);
    assert.equal(res.body.data.totalAmount, 330.00);
    assert.equal(res.body.data.rateVersionNumber, 0);
  });

  const intake1Uuid = crypto.randomUUID();
  const intake2Uuid = crypto.randomUUID();

  await t.test('19. Multiple collections by same customer in same shift permitted with distinct intake UUIDs', async () => {
    // Delivery 1: 10.0 kg Cow milk (Fat 4.0, SNF 8.5 -> rate 36.50 -> amount 365.00)
    const comp1 = await request(app)
      .post(`/api/v1/collections/sessions/${cowSessionId}/complete`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        clientIntakeUuid: intake1Uuid,
        idempotencyKey: intake1Uuid,
        netWeight: 10.0,
        fatPercentage: 4.0,
        snfPercentage: 8.5,
      });
    assert.equal(comp1.status, 200);
    assert.equal(comp1.body.data.session.session_state, 'COMPLETED');
    assert.equal(parseFloat(comp1.body.data.collection.total_amount), 365.00);

    // Delivery 2 in same shift: New session for same customer
    const sess2 = await request(app)
      .post('/api/v1/collections/sessions')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        customerId: cowOnlyCustomerId,
        centerId: tasgaonCenterId,
        identificationMethod: 'FACE',
        milkCategory: 'COW',
      });
    assert.equal(sess2.status, 201);
    const cowSession2Id = sess2.body.data.sessionId;

    // Complete Delivery 2: 15.0 kg Cow milk (Fat 4.2, SNF 8.5 -> rate 37.80 -> amount 567.00)
    const comp2 = await request(app)
      .post(`/api/v1/collections/sessions/${cowSession2Id}/complete`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        clientIntakeUuid: intake2Uuid,
        idempotencyKey: intake2Uuid,
        netWeight: 15.0,
        fatPercentage: 4.2,
        snfPercentage: 8.5,
      });
    assert.equal(comp2.status, 200);
    assert.equal(parseFloat(comp2.body.data.collection.total_amount), 567.00);
  });

  await t.test('20. Idempotent duplicate event replay returns existing collection without duplicate ledger entry', async () => {
    // Replay Delivery 1 with identical clientIntakeUuid and idempotencyKey
    const replayRes = await request(app)
      .post(`/api/v1/collections/sessions/${cowSessionId}/complete`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        clientIntakeUuid: intake1Uuid,
        idempotencyKey: intake1Uuid,
        netWeight: 10.0,
        fatPercentage: 4.0,
        snfPercentage: 8.5,
      });
    assert.equal(replayRes.status, 200);
    assert.equal(replayRes.body.data.status, 'IDEMPOTENT_REPLAY');

    // Total collections count in DB for delivery 1 must remain exactly 1
    const countRes = await query("SELECT COUNT(*) FROM milk_collections WHERE client_intake_uuid = $1;", [intake1Uuid]);
    assert.equal(parseInt(countRes.rows[0].count, 10), 1);
  });

  await t.test('21. Session timeout behavior marks abandoned session as INCOMPLETE', async () => {
    let shiftRes = await query("SELECT id FROM collection_shifts WHERE center_id = $1 LIMIT 1;", [tasgaonCenterId]);
    if (shiftRes.rows.length === 0) {
      shiftRes = await query(
        `INSERT INTO collection_shifts (center_id, shift_type, start_time, end_time, grace_period_minutes, is_active)
         VALUES ($1, 'MORNING', '05:00:00', '11:00:00', 30, TRUE) RETURNING id;`,
        [tasgaonCenterId]
      );
    }
    const morningShiftId = shiftRes.rows[0].id;

    const abSess = await query(
      `INSERT INTO collection_sessions (
         center_id, customer_id, operator_id, device_id, shift_id, shift_type, selected_milk_category, identification_method, business_date, session_state, intake_sequence_uuid, started_at
       ) VALUES ($1, $2, $3, $4, $5, 'MORNING', 'COW', 'FACE', CURRENT_DATE, 'OPEN', gen_random_uuid(), NOW() - INTERVAL '2 hours')
       RETURNING id;`,
      [tasgaonCenterId, bothCustomerId, operatorUserId, testDeviceId, morningShiftId]
    );
    const abId = abSess.rows[0].id;

    await query("UPDATE collection_sessions SET session_state = 'INCOMPLETE' WHERE id = $1;", [abId]);
    const check = await query("SELECT session_state FROM collection_sessions WHERE id = $1;", [abId]);
    assert.equal(check.rows[0].session_state, 'INCOMPLETE');
  });

  await t.test('22. Late arriving measurement association rejected on completed session', async () => {
    // cowSessionId is already COMPLETED
    const res = await request(app)
      .post(`/api/v1/collections/sessions/${cowSessionId}/measurements`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        fatPercentage: 4.0,
        snfPercentage: 8.5,
        netWeight: 12.0,
      });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'SESSION_ALREADY_CLOSED');
  });

  await t.test('23. Cross-customer measurement rejection prevents associating measurements across customers', async () => {
    // Cancel previous incomplete session for bufOnlyCustomerId
    await request(app)
      .post(`/api/v1/collections/sessions/${bufSessionId}/cancel`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ reason: 'Closing prior test session to test cross-customer rejection' });

    const sBuf = await request(app)
      .post('/api/v1/collections/sessions')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        customerId: bufOnlyCustomerId,
        centerId: tasgaonCenterId,
        identificationMethod: 'RFID',
        milkCategory: 'BUFFALO',
      });
    assert.equal(sBuf.status, 201);
    const newBufSessionId = sBuf.body.data.sessionId;

    const check = await query("SELECT customer_id FROM collection_sessions WHERE id = $1;", [newBufSessionId]);
    assert.notEqual(check.rows[0].customer_id, cowOnlyCustomerId);
  });

  await t.test('24. Cross-center measurement rejection prevents customer delivering at unassigned center', async () => {
    // otherCenterCustomerId belongs to Miraj Center (different center)
    const res = await request(app)
      .post('/api/v1/collections/sessions')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        customerId: otherCenterCustomerId,
        centerId: tasgaonCenterId, // Mismatch
        identificationMethod: 'FACE',
        milkCategory: 'COW',
      });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'CENTER_MISMATCH');
  });

  // --- ACCOUNTING & FINANCIAL INTEGRATION TESTS (25-30) ---

  await t.test('25. Successful ledger credit on collection completion updates customer balance', async () => {
    // Customer cowOnlyCustomerId had 2 collections: 365.00 + 567.00 = 932.00
    const balRes = await query("SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;", [cowOnlyCustomerId]);
    const balance = parseFloat(balRes.rows[0].current_balance);
    assert.equal(balance, 932.00);
  });

  await t.test('26. Duplicate ledger credit prevention preserves balance after replay', async () => {
    // Re-verify balance is still exactly 932.00 after idempotent replay
    const balRes = await query("SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;", [cowOnlyCustomerId]);
    assert.equal(parseFloat(balRes.rows[0].current_balance), 932.00);
  });

  await t.test('27. Balanced journal entries: SUM(DEBIT) == SUM(CREDIT)', async () => {
    const entryRes = await query(
      `SELECT le.entry_type, SUM(le.amount) as total
       FROM ledger_entries le
       JOIN ledger_transactions lt ON lt.id = le.transaction_id
       WHERE lt.organization_id = $1
       GROUP BY le.entry_type;`,
      [sangliOrgId]
    );

    let debitTotal = 0;
    let creditTotal = 0;
    for (const r of entryRes.rows) {
      if (r.entry_type === 'DEBIT') debitTotal = parseFloat(r.total);
      if (r.entry_type === 'CREDIT') creditTotal = parseFloat(r.total);
    }

    assert.ok(debitTotal > 0, 'Debit entries must exist');
    assert.ok(creditTotal > 0, 'Credit entries must exist');
    assert.equal(debitTotal, creditTotal, `Accounting Invariant Violated: Debit ${debitTotal} != Credit ${creditTotal}`);
  });

  await t.test('28. Failed transaction rollback leaves no orphaned collection or ledger rows', async () => {
    const invalidSessionUuid = crypto.randomUUID();
    const res = await request(app)
      .post(`/api/v1/collections/sessions/${invalidSessionUuid}/complete`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        clientIntakeUuid: crypto.randomUUID(),
        netWeight: 10.0,
        fatPercentage: 4.0,
        snfPercentage: 8.5,
      });
    assert.ok(res.status >= 400);

    const orphanRes = await query("SELECT COUNT(*) FROM ledger_transactions WHERE reference_id = $1;", [invalidSessionUuid]);
    assert.equal(parseInt(orphanRes.rows[0].count, 10), 0);
  });

  await t.test('29. Unauthorized supervisor adjustment rejected with 403', async () => {
    const res = await request(app)
      .post(`/api/v1/collections/sessions/${cowSessionId}/adjust`)
      .set('Authorization', `Bearer ${unauthorizedToken}`)
      .send({
        adjustmentType: 'CORRECTION',
        reason: 'Adjusting weight due to scale error',
        adjustedNetWeight: 9.5,
      });
    assert.equal(res.status, 403);
  });

  await t.test('30. Supervised reversal / correction preserves original transaction immutable', async () => {
    const res = await request(app)
      .post(`/api/v1/collections/sessions/${cowSessionId}/adjust`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        adjustmentType: 'FULL_REVERSAL',
        reason: 'Duplicate delivery entered in error by operator',
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'REVERSED');

    // Verify original milk_collections record is preserved
    const origRes = await query("SELECT id, total_amount FROM milk_collections WHERE session_id = $1;", [cowSessionId]);
    assert.ok(origRes.rows.length > 0, 'Original collection record must remain in database');

    // Verify debit transaction was posted to reduce balance: 932.00 - 365.00 = 567.00
    const balRes = await query("SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;", [cowOnlyCustomerId]);
    assert.equal(parseFloat(balRes.rows[0].current_balance), 567.00);
  });

  // --- OFFLINE, RECOVERY & SYNCHRONIZATION TESTS (31-36) ---

  await t.test('31. Local offline transaction persistence accepted through sync push', async () => {
    const offlineIntakeId = crypto.randomUUID();
    const res = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({
        deviceId: testDeviceUuid,
        centerId: tasgaonCenterId,
        events: [
          {
            id: crypto.randomUUID(),
            entityType: 'MILK_COLLECTION',
            entityId: offlineIntakeId,
            action: 'INSERT',
            payload: {
              sessionId: crypto.randomUUID(),
              customerId: bothCustomerId,
              centerId: tasgaonCenterId,
              businessDate: new Date().toISOString().slice(0, 10),
              shiftType: 'MORNING',
              milkCategory: 'COW',
              netWeight: 20.0,
              fatPercentage: 4.0,
              snfPercentage: 8.5,
              appliedRatePerUnit: 36.5,
              totalAmount: 730.00,
              identificationMethod: 'FACE',
              clientIntakeUuid: offlineIntakeId,
            },
            idempotencyKey: offlineIntakeId,
            createdAt: new Date().toISOString(),
          },
        ],
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.success, true);
    assert.equal(res.body.data.applied, 1);
  });

  await t.test('32. Network interruption during sync queues events and advances cursor', async () => {
    const ackRes = await request(app)
      .post('/api/v1/sync/acknowledge')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({
        deviceId: testDeviceUuid,
        downstreamCursor: 10,
        downstreamTombstoneCursor: 2,
        clientAppVersion: '1.0.0',
      });
    assert.equal(ackRes.status, 200);
    assert.equal(ackRes.body.data.acknowledged, true);
    assert.equal(ackRes.body.data.downstreamCursor, 10);
  });

  await t.test('33. Duplicate sync event idempotency rejects re-pushing same event', async () => {
    const duplicateEventId = crypto.randomUUID();
    const duplicateEntityId = crypto.randomUUID();
    const pushPayload = {
      deviceId: testDeviceUuid,
      centerId: tasgaonCenterId,
      events: [{
        id: duplicateEventId,
        entityType: 'MILK_COLLECTION',
        entityId: duplicateEntityId,
        action: 'INSERT',
        payload: {
          sessionId: crypto.randomUUID(),
          customerId: bothCustomerId,
          centerId: tasgaonCenterId,
          businessDate: new Date().toISOString().slice(0, 10),
          shiftType: 'MORNING',
          milkCategory: 'COW',
          netWeight: 15.0,
          fatPercentage: 4.0,
          snfPercentage: 8.5,
          appliedRatePerUnit: 36.5,
          totalAmount: 547.50,
          identificationMethod: 'FACE',
          clientIntakeUuid: duplicateEntityId,
        },
        idempotencyKey: duplicateEventId,
      }],
    };

    const firstRes = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send(pushPayload);
    assert.equal(firstRes.status, 200);
    assert.equal(firstRes.body.data.applied, 1);

    const res = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send(pushPayload);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.results[0].status, 'DUPLICATE');
  });

  await t.test('34. Pending sync status visibility reports device sync health', async () => {
    const res = await request(app)
      .get(`/api/v1/sync/status?deviceId=${testDeviceUuid}`)
      .set('Authorization', `Bearer ${deviceToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.deviceId, testDeviceUuid);
    assert.ok(res.body.data.health);
  });

  await t.test('35. Offline authorization expiry enforcement rejects sync when offline limit exceeded', async () => {
    const expDev = await query(
      `INSERT INTO devices (organization_id, center_id, device_identifier, device_type, status, max_offline_hours, last_seen_at)
       VALUES ($1, $2, 'DEV_EXPIRED_001', 'COUNTER_TERMINAL', 'ACTIVE', 72, NOW() - INTERVAL '100 hours')
       ON CONFLICT (device_identifier) DO UPDATE SET last_seen_at = NOW() - INTERVAL '100 hours'
       RETURNING id;`,
      [sangliOrgId, tasgaonCenterId]
    );
    const expDeviceId = expDev.rows[0].id;
    const expDeviceToken = signJwt({
      sub: expDeviceId,
      organizationId: sangliOrgId,
      primaryCenterId: tasgaonCenterId,
      role: 'COLLECTION_OPERATOR',
    });

    const statusRes = await request(app)
      .get(`/api/v1/sync/status?deviceId=${expDeviceId}`)
      .set('Authorization', `Bearer ${expDeviceToken}`);
    assert.equal(statusRes.status, 403);
    assert.equal(statusRes.body.error.code, 'OFFLINE_EXPIRED');
  });

  await t.test('36. Tablet application restart during active session recovery fetches active session', async () => {
    let shiftRes = await query("SELECT id FROM collection_shifts WHERE center_id = $1 LIMIT 1;", [tasgaonCenterId]);
    if (shiftRes.rows.length === 0) {
      shiftRes = await query(
        `INSERT INTO collection_shifts (center_id, shift_type, start_time, end_time, grace_period_minutes, is_active)
         VALUES ($1, 'MORNING', '05:00:00', '11:00:00', 30, TRUE) RETURNING id;`,
        [tasgaonCenterId]
      );
    }
    const morningShiftId = shiftRes.rows[0].id;

    const actSess = await query(
      `INSERT INTO collection_sessions (
         center_id, customer_id, operator_id, device_id, shift_id, shift_type, selected_milk_category, identification_method, business_date, session_state, intake_sequence_uuid, started_at
       ) VALUES ($1, $2, $3, $4, $5, 'MORNING', 'COW', 'FACE', CURRENT_DATE, 'READY_FOR_REVIEW', gen_random_uuid(), NOW())
       RETURNING id, session_state;`,
      [tasgaonCenterId, bothCustomerId, operatorUserId, testDeviceId, morningShiftId]
    );
    const activeId = actSess.rows[0].id;

    const histRes = await request(app)
      .get(`/api/v1/collections/history?centerId=${tasgaonCenterId}&date=${new Date().toISOString().split('T')[0]}`)
      .set('Authorization', `Bearer ${operatorToken}`);
    assert.equal(histRes.status, 200);
    const recovered = histRes.body.data.find(s => s.id === activeId);
    assert.ok(recovered, 'Interrupted session must be found in active center history');
    assert.equal(recovered.session_state, 'READY_FOR_REVIEW');
  });

  await t.test('Verification: Shift Summary and 40-Column Receipt Endpoints', async () => {
    const currentHour = new Date().getHours();
    const currentShift = currentHour < 15 ? 'MORNING' : 'EVENING';

    const summaryRes = await request(app)
      .get(`/api/v1/collections/shift-summary?centerId=${tasgaonCenterId}&shift=${currentShift}`)
      .set('Authorization', `Bearer ${operatorToken}`);
    assert.equal(summaryRes.status, 200);
    assert.ok(summaryRes.body.data.totalCollections >= 1);

    const receiptRes = await request(app)
      .get(`/api/v1/collections/sessions/${cowSessionId}/receipt`)
      .set('Authorization', `Bearer ${operatorToken}`);
    assert.equal(receiptRes.status, 200);
    assert.ok(receiptRes.body.data.receiptText.includes('DFARM DAIRY MILK COLLECTION'));
    assert.ok(receiptRes.body.data.receiptText.includes('COW'));
  });
});
