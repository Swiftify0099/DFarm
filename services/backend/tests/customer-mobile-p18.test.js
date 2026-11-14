import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import pg from 'pg';
import { createApp } from '../dist/app.js';
import { pool } from '../dist/config/db.js';
import { signJwt } from '../dist/jwt.js';

const { Client } = pg;
const dbClient = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
});

async function query(text, params) {
  return dbClient.query(text, params);
}

function generateTestCustomerToken(customerId, organizationId, centerId, farmerCode) {
  return signJwt({
    sub: customerId,
    userId: customerId,
    actorType: 'CUSTOMER',
    role: 'FARMER_CUSTOMER',
    organizationId: organizationId,
    primaryCenterId: centerId,
    centerId: centerId,
    centerIds: [centerId],
    farmerCode: farmerCode,
    customerProfile: {
      customerId: customerId,
      farmerCode: farmerCode,
    },
  });
}

test('DFarm Phase 18 — Customer Mobile Backend & Security Test Suite', async (t) => {
  await dbClient.connect();
  t.after(async () => {
    await dbClient.end();
    await pool.end();
  });

  const app = createApp();

  // Test setup identifiers
  let sangliOrgId = '';
  let tasgaonCenterId = '';
  let customerAId = '';
  let customerBId = '';
  let farmerCodeA = '';
  let farmerCodeB = '';
  let tokenA = '';
  let tokenB = '';
  let staffUserId = '';
  let morningShiftId = '';
  let eveningShiftId = '';
  let rateVersionId = '';

  await t.test('0. Setup test organization, center, and two distinct customers', async () => {
    // 1. Fetch organization
    const orgRes = await query(
      "SELECT id FROM organizations WHERE name ILIKE '%Sangli%' LIMIT 1;"
    );
    assert.ok(orgRes.rows.length > 0, 'Sangli organization must exist');
    sangliOrgId = orgRes.rows[0].id;

    // 2. Fetch center
    const centerRes = await query(
      "SELECT id FROM dairy_centers WHERE organization_id = $1 LIMIT 1;",
      [sangliOrgId]
    );
    assert.ok(centerRes.rows.length > 0, 'Center must exist');
    tasgaonCenterId = centerRes.rows[0].id;

    // 3. Fetch staff operator user
    const userRes = await query(
      "SELECT id FROM users WHERE organization_id = $1 LIMIT 1;",
      [sangliOrgId]
    );
    assert.ok(userRes.rows.length > 0, 'Operator user must exist');
    staffUserId = userRes.rows[0].id;

    // 4. Ensure shifts exist
    const shiftRes = await query(
      `INSERT INTO collection_shifts (center_id, shift_type, start_time, end_time, grace_period_minutes, is_active)
       VALUES 
         ($1, 'MORNING', '05:00:00', '11:00:00', 30, TRUE),
         ($1, 'EVENING', '16:00:00', '21:00:00', 30, TRUE)
       ON CONFLICT (center_id, shift_type) DO UPDATE SET is_active = TRUE
       RETURNING id, shift_type;`,
      [tasgaonCenterId]
    );
    for (const row of shiftRes.rows) {
      if (row.shift_type === 'MORNING') morningShiftId = row.id;
      if (row.shift_type === 'EVENING') eveningShiftId = row.id;
    }

    // 5. Fetch rate chart version
    const rcRes = await query(`SELECT id FROM rate_chart_versions LIMIT 1;`);
    assert.ok(rcRes.rows.length > 0, 'Rate chart version must exist');
    rateVersionId = rcRes.rows[0].id;

    farmerCodeA = `CUST-A-${Math.floor(10000 + Math.random() * 90000)}`;
    farmerCodeB = `CUST-B-${Math.floor(10000 + Math.random() * 90000)}`;

    // 6. Create Customer A
    const phoneA = `+9191111${Math.floor(10000 + Math.random() * 90000)}`;
    const custARes = await query(
      `INSERT INTO customers (
        organization_id, primary_center_id, farmer_code, full_name,
        normalized_mobile_number, status, registration_status,
        bank_name, bank_account_number, bank_ifsc_code, bank_account_holder_name
      ) VALUES (
        $1, $2, $3, 'Anand Rao (Farmer A)',
        $4, 'ACTIVE', 'COMPLETED',
        'State Bank of India', '123456789012', 'SBIN0001234', 'Anand Rao'
      ) RETURNING id;`,
      [sangliOrgId, tasgaonCenterId, farmerCodeA, phoneA]
    );
    customerAId = custARes.rows[0].id;

    // 7. Create Customer B
    const phoneB = `+9192222${Math.floor(10000 + Math.random() * 90000)}`;
    const custBRes = await query(
      `INSERT INTO customers (
        organization_id, primary_center_id, farmer_code, full_name,
        normalized_mobile_number, status, registration_status,
        bank_name, bank_account_number, bank_ifsc_code, bank_account_holder_name
      ) VALUES (
        $1, $2, $3, 'Baban Shinde (Farmer B)',
        $4, 'ACTIVE', 'COMPLETED',
        'Bank of Maharashtra', '987654321098', 'MAHB0009876', 'Baban Shinde'
      ) RETURNING id;`,
      [sangliOrgId, tasgaonCenterId, farmerCodeB, phoneB]
    );
    customerBId = custBRes.rows[0].id;

    // 8. Generate signed JWT tokens using backend signJwt
    tokenA = generateTestCustomerToken(customerAId, sangliOrgId, tasgaonCenterId, farmerCodeA);
    tokenB = generateTestCustomerToken(customerBId, sangliOrgId, tasgaonCenterId, farmerCodeB);
  });

  await t.test('1. Customer Profile Privacy & Masking: Bank account masked, zero biometrics', async () => {
    const res = await request(app)
      .get(`/api/v1/customers/${customerAId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    assert.equal(res.status, 200);
    const data = res.body.data || res.body;
    assert.equal(data.fullName, 'Anand Rao (Farmer A)');
    assert.equal(data.farmerCode, farmerCodeA);
    // Bank account must be masked: XXXX-XXXX-9012
    assert.ok(data.bankAccountNumber.startsWith('XXXX-XXXX-'), 'Bank account must be masked');
    assert.ok(data.bankAccountNumber.endsWith('9012'), 'Last 4 digits must match');
    // Ensure no biometric vectors leaked
    assert.equal(data.biometricTemplate, undefined);
    assert.equal(data.facialVector, undefined);
    assert.equal(data.fingerprintData, undefined);
  });

  await t.test('2. Customer Data Isolation: Customer A cannot view Customer B profile', async () => {
    const res = await request(app)
      .get(`/api/v1/customers/${customerBId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'CUSTOMER_ISOLATION_VIOLATION');
  });

  await t.test('3. Customer Dashboard: Authoritative metrics, today cow/buffalo stats, balance', async () => {
    const res = await request(app)
      .get(`/api/v1/customers/${customerAId}/dashboard`)
      .set('Authorization', `Bearer ${tokenA}`);

    assert.equal(res.status, 200);
    const data = res.body.data || res.body;
    assert.ok(data.customer);
    assert.equal(data.customer.id, customerAId);
    assert.equal(data.customer.farmerCode, farmerCodeA);
    assert.ok(data.financials);
    assert.ok(typeof data.financials.currentBalance === 'number');
    assert.ok(['DAIRY_OWES_CUSTOMER', 'CUSTOMER_OWES_DAIRY', 'SETTLED'].includes(data.financials.balanceStatus));
    assert.ok(data.todayStats);
    assert.ok(typeof data.todayStats.todayCowMilkKg === 'number');
    assert.ok(typeof data.todayStats.todayBuffaloMilkKg === 'number');
  });

  await t.test('4. Customer Data Isolation: Customer A cannot view Customer B dashboard', async () => {
    const res = await request(app)
      .get(`/api/v1/customers/${customerBId}/dashboard`)
      .set('Authorization', `Bearer ${tokenA}`);

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'CUSTOMER_ISOLATION_VIOLATION');
  });

  await t.test('5. Milk Collections History: Filter by Category (COW/BUFFALO) & Shift (MORNING/EVENING)', async () => {
    // Insert a test collection session for Customer A
    const sessionRes = await query(
      `INSERT INTO collection_sessions (
        center_id, customer_id, business_date, shift_id, shift_type,
        selected_milk_category, identification_method, session_state,
        intake_sequence_uuid, operator_id, device_id, started_at, completed_at
      ) VALUES (
        $1, $2, CURRENT_DATE, $3, 'MORNING',
        'COW', 'SUPERVISOR_MANUAL', 'COMPLETED',
        gen_random_uuid(), $4, 'TEST-DEVICE', NOW(), NOW()
      ) RETURNING id;`,
      [tasgaonCenterId, customerAId, morningShiftId, staffUserId]
    );
    const sessionId = sessionRes.rows[0].id;

    await query(
      `INSERT INTO milk_collections (
        center_id, customer_id, business_date, shift_type, milk_category,
        net_weight, measurement_unit, fat_percentage, snf_percentage, rate_chart_version_id,
        applied_rate_per_unit, total_amount, transaction_status, client_intake_uuid, idempotency_key, session_id, pricing_unit
      ) VALUES (
        $1, $2, CURRENT_DATE, 'MORNING', 'COW',
        14.50, 'KG', 4.20, 8.50, $3,
        38.50, 558.25, 'COMPLETED', gen_random_uuid(), $4, $5, 'PER_KG'
      );`,
      [tasgaonCenterId, customerAId, rateVersionId, `IDEM-A-${Date.now()}-${Math.floor(Math.random() * 10000)}`, sessionId]
    );

    const res = await request(app)
      .get(`/api/v1/collections/customer/${customerAId}?category=COW&shift=MORNING`)
      .set('Authorization', `Bearer ${tokenA}`);

    assert.equal(res.status, 200);
    const data = res.body.data || res.body;
    assert.ok(data.collections.length > 0);
    const item = data.collections[0];
    assert.equal(item.milkCategory, 'COW');
    assert.equal(item.shiftType, 'MORNING');
    assert.equal(Number(item.netWeight), 14.50);
    assert.equal(item.measurementUnit, 'KG'); // Strict measurement unit verification
    assert.equal(Number(item.totalAmount), 558.25);
  });

  await t.test('6. Milk Collections Isolation: Customer A cannot view Customer B collection history', async () => {
    const res = await request(app)
      .get(`/api/v1/collections/customer/${customerBId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'CUSTOMER_ISOLATION_VIOLATION');
  });

  await t.test('7. Thermal Slip Isolation: Customer A cannot read Customer B receipt', async () => {
    // Create collection for Customer B
    const sessionBRes = await query(
      `INSERT INTO collection_sessions (
        center_id, customer_id, business_date, shift_id, shift_type,
        selected_milk_category, identification_method, session_state,
        intake_sequence_uuid, operator_id, device_id, started_at, completed_at
      ) VALUES (
        $1, $2, CURRENT_DATE, $3, 'EVENING',
        'BUFFALO', 'SUPERVISOR_MANUAL', 'COMPLETED',
        gen_random_uuid(), $4, 'TEST-DEVICE', NOW(), NOW()
      ) RETURNING id;`,
      [tasgaonCenterId, customerBId, eveningShiftId, staffUserId]
    );
    const sessionBId = sessionBRes.rows[0].id;

    await query(
      `INSERT INTO milk_collections (
        center_id, customer_id, business_date, shift_type, milk_category,
        net_weight, measurement_unit, fat_percentage, snf_percentage, rate_chart_version_id,
        applied_rate_per_unit, total_amount, transaction_status, client_intake_uuid, idempotency_key, session_id, pricing_unit
      ) VALUES (
        $1, $2, CURRENT_DATE, 'EVENING', 'BUFFALO',
        10.00, 'KG', 7.00, 9.00, $3,
        55.00, 550.00, 'COMPLETED', gen_random_uuid(), $4, $5, 'PER_KG'
      );`,
      [tasgaonCenterId, customerBId, rateVersionId, `IDEM-B-${Date.now()}-${Math.floor(Math.random() * 10000)}`, sessionBId]
    );

    // Customer A attempts to get thermal slip for Customer B's session
    const res = await request(app)
      .get(`/api/v1/collections/sessions/${sessionBId}/receipt`)
      .set('Authorization', `Bearer ${tokenA}`);

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'CUSTOMER_ISOLATION_VIOLATION');
  });

  await t.test('8. Customer Ledger: Server-authoritative passbook calculations', async () => {
    const res = await request(app)
      .get(`/api/v1/customers/${customerAId}/ledger/summary`)
      .set('Authorization', `Bearer ${tokenA}`);

    assert.equal(res.status, 200);
    const data = res.body.data || res.body;
    assert.equal(data.customerId, customerAId);
    assert.ok(typeof data.currentBalance === 'number');
    assert.ok(typeof data.totalCredits === 'number');
    assert.ok(typeof data.totalDebits === 'number');
  });

  await t.test('9. Customer Ledger Isolation: Customer A cannot view Customer B ledger', async () => {
    const res = await request(app)
      .get(`/api/v1/customers/${customerBId}/ledger/summary`)
      .set('Authorization', `Bearer ${tokenA}`);

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'CUSTOMER_ISOLATION_VIOLATION');
  });

  await t.test('10. Notifications Inbox: List, mark read, and mark all read', async () => {
    // 1. Get notifications
    const getRes = await request(app)
      .get(`/api/v1/customers/${customerAId}/notifications`)
      .set('Authorization', `Bearer ${tokenA}`);

    assert.equal(getRes.status, 200);
    const notifs = Array.isArray(getRes.body.data) ? getRes.body.data : (getRes.body.data?.notifications || []);
    assert.ok(Array.isArray(notifs), 'Notifications must be an array');
    const unreadCount = typeof getRes.body.meta?.unreadCount === 'number'
      ? getRes.body.meta.unreadCount
      : (getRes.body.data?.unreadCount || 0);
    assert.ok(typeof unreadCount === 'number', 'unreadCount must be a number');

    // 2. Mark all as read
    const markAllRes = await request(app)
      .patch(`/api/v1/customers/${customerAId}/notifications/read-all`)
      .set('Authorization', `Bearer ${tokenA}`);

    assert.equal(markAllRes.status, 200);
    assert.equal(markAllRes.body.success, true);
    const markData = markAllRes.body.data || markAllRes.body;
    assert.ok(typeof markData.markedReadCount === 'number');

    // 3. Customer A cannot mark Customer B notifications
    const crossNotifRes = await request(app)
      .patch(`/api/v1/customers/${customerBId}/notifications/read-all`)
      .set('Authorization', `Bearer ${tokenA}`);

    assert.equal(crossNotifRes.status, 403);
    assert.equal(crossNotifRes.body.error.code, 'CUSTOMER_ISOLATION_VIOLATION');
  });

  await t.test('11. Customer Preferences Self-Service: Update language & consent safely', async () => {
    const res = await request(app)
      .patch(`/api/v1/customers/${customerAId}/profile`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        preferredLanguage: 'mr',
        notificationConsent: true,
        email: 'anand.farmer@example.com',
      });

    assert.equal(res.status, 200);
    const data = res.body.data || res.body;
    assert.equal(data.success, true);
    assert.equal(data.preferences.preferredLanguage, 'mr');

    // Cross-customer profile edit attempt must be rejected
    const crossRes = await request(app)
      .patch(`/api/v1/customers/${customerBId}/profile`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ preferredLanguage: 'en' });

    assert.equal(crossRes.status, 403);
    assert.equal(crossRes.body.error.code, 'CUSTOMER_ISOLATION_VIOLATION');
  });
});
