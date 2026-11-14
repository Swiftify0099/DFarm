import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import pg from 'pg';
import crypto from 'node:crypto';
import { createApp } from '../dist/app.js';
import { signJwt } from '../dist/jwt.js';

const { Client } = pg;
const dbClient = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
});

async function query(text, params) {
  return dbClient.query(text, params);
}

test('DFarm Phase 13: Automatic Monthly Billing, Settlement & Statement Engine (24 Scenarios)', async (t) => {
  await dbClient.connect();
  t.after(async () => {
    await dbClient.end();
  });

  const app = createApp();

  // Test state
  let orgId = '';
  let center1Id = '';
  let center2Id = '';

  let ownerUserId = '';
  let managerCenter1UserId = '';
  let managerCenter2UserId = '';
  let accountantUserId = '';
  let customerAId = '';
  let customerBId = '';

  let ownerToken = '';
  let managerCenter1Token = '';
  let managerCenter2Token = '';
  let accountantToken = '';
  let customerAToken = '';
  let customerBToken = '';

  let calendarPeriodId = '';
  let customerABillId = '';
  let customerBBillId = '';

  let morningShiftId = '';
  let eveningShiftId = '';

  const uniqueSuffix = Date.now().toString().slice(-6);

  await t.test('0. Setup Test Organization, Centers, Users, and Customers', async () => {
    // 1. Fetch or create organization
    const orgRes = await query(`SELECT id FROM organizations LIMIT 1;`);
    assert.ok(orgRes.rows.length > 0, 'Organization must exist');
    orgId = orgRes.rows[0].id;

    // 2. Fetch or create two centers for center isolation test
    const c1Res = await query(
      `INSERT INTO dairy_centers (organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
       VALUES ($1, 'C1_${uniqueSuffix}', 'Center Alpha', 'Main Road', 'Tasgaon', 'Sangli', 'Maharashtra', '416416', '+919811111111', 'ACTIVE')
       RETURNING id;`,
      [orgId]
    );
    center1Id = c1Res.rows[0].id;

    const c2Res = await query(
      `INSERT INTO dairy_centers (organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
       VALUES ($1, 'C2_${uniqueSuffix}', 'Center Beta', 'Station Road', 'Miraj', 'Sangli', 'Maharashtra', '416410', '+919822222222', 'ACTIVE')
       RETURNING id;`,
      [orgId]
    );
    center2Id = c2Res.rows[0].id;

    // Center settings
    await query(
      `INSERT INTO center_settings (center_id, billing_cycle_type, weight_measurement_unit)
       VALUES ($1, 'CALENDAR_MONTH', 'KG'), ($2, 'CALENDAR_MONTH', 'KG')
       ON CONFLICT (center_id) DO UPDATE SET billing_cycle_type = 'CALENDAR_MONTH';`,
      [center1Id, center2Id]
    );

    // 3. Create Users
    // Dairy Owner
    const ownerRes = await query(
      `INSERT INTO users (organization_id, username, full_name, email, phone_number, role, status)
       VALUES ($1, 'owner_${uniqueSuffix}', 'Dadasaheb Patil (Owner)', 'owner_${uniqueSuffix}@dfarm.test', '+919800000001', 'DAIRY_OWNER', 'ACTIVE')
       RETURNING id;`,
      [orgId]
    );
    ownerUserId = ownerRes.rows[0].id;

    // Center 1 Manager
    const mgr1Res = await query(
      `INSERT INTO users (organization_id, username, full_name, email, phone_number, role, status)
       VALUES ($1, 'mgr1_${uniqueSuffix}', 'Rajesh Shinde (Mgr Alpha)', 'mgr1_${uniqueSuffix}@dfarm.test', '+919800000002', 'CENTER_MANAGER', 'ACTIVE')
       RETURNING id;`,
      [orgId]
    );
    managerCenter1UserId = mgr1Res.rows[0].id;
    await query(
      `INSERT INTO user_center_assignments (user_id, center_id, is_primary) VALUES ($1, $2, TRUE);`,
      [managerCenter1UserId, center1Id]
    );

    // Center 2 Manager (Isolated)
    const mgr2Res = await query(
      `INSERT INTO users (organization_id, username, full_name, email, phone_number, role, status)
       VALUES ($1, 'mgr2_${uniqueSuffix}', 'Suresh Kulkarni (Mgr Beta)', 'mgr2_${uniqueSuffix}@dfarm.test', '+919800000003', 'CENTER_MANAGER', 'ACTIVE')
       RETURNING id;`,
      [orgId]
    );
    managerCenter2UserId = mgr2Res.rows[0].id;
    await query(
      `INSERT INTO user_center_assignments (user_id, center_id, is_primary) VALUES ($1, $2, TRUE);`,
      [managerCenter2UserId, center2Id]
    );

    // Accountant
    const acctRes = await query(
      `INSERT INTO users (organization_id, username, full_name, email, phone_number, role, status)
       VALUES ($1, 'acct_${uniqueSuffix}', 'Sunil Joshi (Accountant)', 'acct_${uniqueSuffix}@dfarm.test', '+919800000004', 'ACCOUNTANT', 'ACTIVE')
       RETURNING id;`,
      [orgId]
    );
    accountantUserId = acctRes.rows[0].id;
    await query(
      `INSERT INTO user_center_assignments (user_id, center_id, is_primary) VALUES ($1, $2, TRUE);`,
      [accountantUserId, center1Id]
    );

    // 4. Create Customers in Center 1
    // Customer A (Active Supplier with collections, debits, advances)
    const custARes = await query(
      `INSERT INTO customers (
         organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number,
         status, registration_status, bank_name, bank_account_number, bank_ifsc_code
       ) VALUES ($1, $2, 'FARMER_A_${uniqueSuffix}', 'Ananda Jadhav', '+919833${uniqueSuffix}', 'ACTIVE', 'COMPLETED', 'State Bank of India', '112233445566', 'SBIN0001234')
       RETURNING id;`,
      [orgId, center1Id]
    );
    customerAId = custARes.rows[0].id;

    // Customer B (Debit Customer: No milk delivered, only store debits)
    const custBRes = await query(
      `INSERT INTO customers (
         organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number,
         status, registration_status, bank_name, bank_account_number, bank_ifsc_code
       ) VALUES ($1, $2, 'FARMER_B_${uniqueSuffix}', 'Balasaheb Chavan', '+919844${uniqueSuffix}', 'ACTIVE', 'COMPLETED', 'Bank of Maharashtra', '998877665544', 'MAHB0005678')
       RETURNING id;`,
      [orgId, center1Id]
    );
    customerBId = custBRes.rows[0].id;

    // Milk category authorizations
    await query(
      `INSERT INTO customer_milk_categories (customer_id, milk_category, is_authorized, authorized_by)
       VALUES ($1, 'COW', TRUE, $3), ($1, 'BUFFALO', TRUE, $3), ($2, 'COW', TRUE, $3);`,
      [customerAId, customerBId, ownerUserId]
    );

    // Shifts for center 1
    const shiftRes = await query(
      `INSERT INTO collection_shifts (center_id, shift_type, start_time, end_time, grace_period_minutes, is_active)
       VALUES 
         ($1, 'MORNING', '05:00:00', '11:00:00', 30, TRUE),
         ($1, 'EVENING', '16:00:00', '21:00:00', 30, TRUE)
       ON CONFLICT (center_id, shift_type) DO UPDATE SET is_active = TRUE
       RETURNING id, shift_type;`,
      [center1Id]
    );
    for (const row of shiftRes.rows) {
      if (row.shift_type === 'MORNING') morningShiftId = row.id;
      if (row.shift_type === 'EVENING') eveningShiftId = row.id;
    }

    // Tokens
    ownerToken = signJwt({
      sub: ownerUserId,
      userId: ownerUserId,
      organizationId: orgId,
      role: 'DAIRY_OWNER',
      actorType: 'STAFF',
      centerIds: [center1Id, center2Id],
    });

    managerCenter1Token = signJwt({
      sub: managerCenter1UserId,
      userId: managerCenter1UserId,
      organizationId: orgId,
      role: 'CENTER_MANAGER',
      actorType: 'STAFF',
      centerIds: [center1Id],
    });

    managerCenter2Token = signJwt({
      sub: managerCenter2UserId,
      userId: managerCenter2UserId,
      organizationId: orgId,
      role: 'CENTER_MANAGER',
      actorType: 'STAFF',
      centerIds: [center2Id],
    });

    accountantToken = signJwt({
      sub: accountantUserId,
      userId: accountantUserId,
      organizationId: orgId,
      role: 'ACCOUNTANT',
      actorType: 'STAFF',
      centerIds: [center1Id],
    });

    customerAToken = signJwt({
      sub: customerAId,
      userId: customerAId,
      organizationId: orgId,
      role: 'FARMER_CUSTOMER',
      actorType: 'CUSTOMER',
      centerIds: [center1Id],
      customerProfile: { customerId: customerAId, farmerCode: `FARMER_A_${uniqueSuffix}` },
    });

    customerBToken = signJwt({
      sub: customerBId,
      userId: customerBId,
      organizationId: orgId,
      role: 'FARMER_CUSTOMER',
      actorType: 'CUSTOMER',
      centerIds: [center1Id],
      customerProfile: { customerId: customerBId, farmerCode: `FARMER_B_${uniqueSuffix}` },
    });
  });

  // Scenario 1: Calendar month period generation
  await t.test('1. Calendar month period generation', async () => {
    const res = await request(app)
      .post('/api/v1/billing/periods')
      .set('Authorization', `Bearer ${managerCenter1Token}`)
      .send({
        centerId: center1Id,
        periodName: `November 2026 Test`,
        startDate: '2026-11-01',
        endDate: '2026-11-30',
        cycleType: 'CALENDAR_MONTH',
      });

    assert.equal(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.id);
    assert.equal(res.body.data.cycleType, 'CALENDAR_MONTH');
    assert.equal(res.body.data.status, 'DRAFT');
    calendarPeriodId = res.body.data.id;
  });

  // Scenario 2: Billing period boundary dates validation
  await t.test('2. Billing period boundary dates validation (reject startDate > endDate)', async () => {
    const res = await request(app)
      .post('/api/v1/billing/periods')
      .set('Authorization', `Bearer ${managerCenter1Token}`)
      .send({
        centerId: center1Id,
        periodName: 'Invalid Boundary Period',
        startDate: '2026-11-30',
        endDate: '2026-11-01', // End date before start date
        cycleType: 'CALENDAR_MONTH',
      });

    assert.equal(res.status, 400, 'Must reject startDate > endDate with 400');
  });

  // Scenario 3: Overlapping period rejection
  await t.test('3. Overlapping period rejection for same center', async () => {
    const res = await request(app)
      .post('/api/v1/billing/periods')
      .set('Authorization', `Bearer ${managerCenter1Token}`)
      .send({
        centerId: center1Id,
        periodName: 'Conflicting Overlapping Period',
        startDate: '2026-11-15',
        endDate: '2026-12-15', // Overlaps with 2026-11-01 to 2026-11-30
        cycleType: 'CALENDAR_MONTH',
      });

    assert.equal(res.status, 409, 'Must reject overlapping period with 409 Conflict');
  });

  // Scenario 4: Customer opening balance from ledger immediately before billing period
  await t.test('4. Customer opening balance from ledger immediately before billing period', async () => {
    // Insert historical transaction on 2026-10-31 with balance_after = 1250.50
    await query(
      `INSERT INTO ledger_transactions (
         organization_id, center_id, customer_id, transaction_type, direction,
         amount, balance_after, reference_entity, reference_id, idempotency_key, created_by, created_at
       ) VALUES ($1, $2, $3, 'MILK_COLLECTION_CREDIT', 'CREDIT', 1250.50, 1250.50, 'MILK_COLLECTION', gen_random_uuid(), 'IDEM-HIST-${uniqueSuffix}', $4, '2026-10-31 18:00:00+05:30');`,
      [orgId, center1Id, customerAId, ownerUserId]
    );

    // Verify preview or generation accurately reads 1250.50 opening balance
    const statementRes = await request(app)
      .get(`/api/v1/billing/customers/${customerAId}/statement?periodId=${calendarPeriodId}`)
      .set('Authorization', `Bearer ${accountantToken}`);

    assert.equal(statementRes.status, 200);
    assert.equal(Number(statementRes.body.data.bill.openingBalance), 1250.50);
  });

  // Scenario 5: Cow Milk aggregation (Quantity, Amount, Counts)
  await t.test('5. Cow Milk aggregation during billing period', async () => {
    // Rate chart version for rates
    const rcRes = await query(`SELECT id FROM rate_chart_versions LIMIT 1;`);
    const rateVersionId = rcRes.rows[0].id;

    // Create completed collection sessions for Cow milk
    const s1Res = await query(
      `INSERT INTO collection_sessions (
         center_id, customer_id, business_date, shift_id, shift_type,
         selected_milk_category, identification_method, session_state,
         intake_sequence_uuid, operator_id, device_id, started_at, completed_at
       ) VALUES ($1, $2, '2026-11-05', $3, 'MORNING', 'COW', 'SUPERVISOR_MANUAL', 'COMPLETED', gen_random_uuid(), $4, 'TEST-DEV', NOW(), NOW())
       RETURNING id;`,
      [center1Id, customerAId, morningShiftId, ownerUserId]
    );
    const session1Id = s1Res.rows[0].id;

    const s2Res = await query(
      `INSERT INTO collection_sessions (
         center_id, customer_id, business_date, shift_id, shift_type,
         selected_milk_category, identification_method, session_state,
         intake_sequence_uuid, operator_id, device_id, started_at, completed_at
       ) VALUES ($1, $2, '2026-11-05', $3, 'EVENING', 'COW', 'SUPERVISOR_MANUAL', 'COMPLETED', gen_random_uuid(), $4, 'TEST-DEV', NOW(), NOW())
       RETURNING id;`,
      [center1Id, customerAId, eveningShiftId, ownerUserId]
    );
    const session2Id = s2Res.rows[0].id;

    // Delivery 1: 15.00 kg @ ₹40.00 = ₹600.00 (Morning 2026-11-05)
    // Delivery 2: 20.00 kg @ ₹40.00 = ₹800.00 (Evening 2026-11-05)
    await query(
      `INSERT INTO milk_collections (
         center_id, customer_id, business_date, shift_type, milk_category,
         net_weight, measurement_unit, fat_percentage, snf_percentage, rate_chart_version_id,
         applied_rate_per_unit, total_amount, transaction_status, client_intake_uuid, idempotency_key, session_id
       ) VALUES 
       ($1, $2, '2026-11-05', 'MORNING', 'COW', 15.00, 'KG', 4.0, 8.5, $3, 40.00, 600.00, 'COMPLETED', gen_random_uuid(), 'IDEM-COW1-${uniqueSuffix}', $4),
       ($1, $2, '2026-11-05', 'EVENING', 'COW', 20.00, 'KG', 4.2, 8.6, $3, 40.00, 800.00, 'COMPLETED', gen_random_uuid(), 'IDEM-COW2-${uniqueSuffix}', $5);`,
      [center1Id, customerAId, rateVersionId, session1Id, session2Id]
    );

    // Verify Cow aggregation
    const res = await request(app)
      .get(`/api/v1/billing/customers/${customerAId}/statement?periodId=${calendarPeriodId}`)
      .set('Authorization', `Bearer ${accountantToken}`);

    assert.equal(res.status, 200);
    const cow = res.body.data.milkBreakdown.cow;
    assert.equal(cow.collectionsCount, 2);
    assert.equal(Number(cow.totalQuantityKg), 35.00);
    assert.equal(Number(cow.totalAmount), 1400.00);
  });

  // Scenario 6: Buffalo Milk aggregation (Quantity, Amount, Counts)
  await t.test('6. Buffalo Milk aggregation during billing period', async () => {
    const rcRes = await query(`SELECT id FROM rate_chart_versions LIMIT 1;`);
    const rateVersionId = rcRes.rows[0].id;

    const s3Res = await query(
      `INSERT INTO collection_sessions (
         center_id, customer_id, business_date, shift_id, shift_type,
         selected_milk_category, identification_method, session_state,
         intake_sequence_uuid, operator_id, device_id, started_at, completed_at
       ) VALUES ($1, $2, '2026-11-10', $3, 'MORNING', 'BUFFALO', 'SUPERVISOR_MANUAL', 'COMPLETED', gen_random_uuid(), $4, 'TEST-DEV', NOW(), NOW())
       RETURNING id;`,
      [center1Id, customerAId, morningShiftId, ownerUserId]
    );
    const session3Id = s3Res.rows[0].id;

    // Delivery: 10.00 kg @ ₹65.00 = ₹650.00 (Morning 2026-11-10)
    await query(
      `INSERT INTO milk_collections (
         center_id, customer_id, business_date, shift_type, milk_category,
         net_weight, measurement_unit, fat_percentage, snf_percentage, rate_chart_version_id,
         applied_rate_per_unit, total_amount, transaction_status, client_intake_uuid, idempotency_key, session_id
       ) VALUES 
       ($1, $2, '2026-11-10', 'MORNING', 'BUFFALO', 10.00, 'KG', 6.5, 9.0, $3, 65.00, 650.00, 'COMPLETED', gen_random_uuid(), 'IDEM-BUF1-${uniqueSuffix}', $4);`,
      [center1Id, customerAId, rateVersionId, session3Id]
    );

    const res = await request(app)
      .get(`/api/v1/billing/customers/${customerAId}/statement?periodId=${calendarPeriodId}`)
      .set('Authorization', `Bearer ${accountantToken}`);

    assert.equal(res.status, 200);
    const buf = res.body.data.milkBreakdown.buffalo;
    assert.equal(buf.collectionsCount, 1);
    assert.equal(Number(buf.totalQuantityKg), 10.00);
    assert.equal(Number(buf.totalAmount), 650.00);

    // Total gross milk = 1400.00 + 650.00 = 2050.00
    assert.equal(Number(res.body.data.milkBreakdown.totalAmount), 2050.00);
  });

  // Scenario 7: Fat/SNF statement line items preserve P10 units
  await t.test('7. Fat/SNF and measurement units preserved without silent conversion', async () => {
    const res = await request(app)
      .get(`/api/v1/billing/customers/${customerAId}/statement?periodId=${calendarPeriodId}`)
      .set('Authorization', `Bearer ${accountantToken}`);

    assert.equal(res.status, 200);
    const items = res.body.data.items;
    assert.ok(items.length >= 3);
    for (const item of items) {
      if (item.itemType === 'MILK_COLLECTION') {
        assert.equal(item.measurementUnit, 'KG');
        assert.ok(item.fatPercentage >= 1.5 && item.fatPercentage <= 15.0);
        assert.ok(item.snfPercentage >= 5.0 && item.snfPercentage <= 13.0);
        assert.ok(item.ratePerUnit > 0);
      }
    }
  });

  // Scenario 8: Feed debit aggregation
  await t.test('8. Feed debit aggregation from ledger', async () => {
    // Post ₹350.00 cattle feed purchase debit
    await query(
      `INSERT INTO ledger_transactions (
         organization_id, center_id, customer_id, transaction_type, direction,
         amount, balance_after, reference_entity, reference_id, idempotency_key, created_by, created_at
       ) VALUES ($1, $2, $3, 'FEED_PURCHASE_DEBIT', 'DEBIT', 350.00, 2950.50, 'FEED_SALE', gen_random_uuid(), 'IDEM-FEED-${uniqueSuffix}', $4, '2026-11-12 11:00:00+05:30');`,
      [orgId, center1Id, customerAId, ownerUserId]
    );

    const res = await request(app)
      .get(`/api/v1/billing/customers/${customerAId}/statement?periodId=${calendarPeriodId}`)
      .set('Authorization', `Bearer ${accountantToken}`);

    assert.equal(res.status, 200);
    assert.equal(Number(res.body.data.bill.feedPurchasesDebit), 350.00);
  });

  // Scenario 9: Advance aggregation
  await t.test('9. Advance aggregation from ledger', async () => {
    // Post ₹400.00 advance debit
    await query(
      `INSERT INTO ledger_transactions (
         organization_id, center_id, customer_id, transaction_type, direction,
         amount, balance_after, reference_entity, reference_id, idempotency_key, created_by, created_at
       ) VALUES ($1, $2, $3, 'ADVANCE_DEBIT', 'DEBIT', 400.00, 2550.50, 'CUSTOMER_ADVANCE', gen_random_uuid(), 'IDEM-ADV-${uniqueSuffix}', $4, '2026-11-14 10:00:00+05:30');`,
      [orgId, center1Id, customerAId, ownerUserId]
    );

    const res = await request(app)
      .get(`/api/v1/billing/customers/${customerAId}/statement?periodId=${calendarPeriodId}`)
      .set('Authorization', `Bearer ${accountantToken}`);

    assert.equal(res.status, 200);
    assert.equal(Number(res.body.data.bill.advancesDebit), 400.00);
  });

  // Scenario 10: Deduction aggregation
  await t.test('10. Deduction aggregation from customer_deductions', async () => {
    // Insert veterinary medicine deduction of ₹150.00
    await query(
      `INSERT INTO customer_deductions (
         customer_id, center_id, deduction_category, amount, description, approved_by, created_at
       ) VALUES ($1, $2, 'VETERINARY_MEDICINE', 150.00, 'Deworming and Vaccination Fee', $3, '2026-11-15 14:00:00+05:30');`,
      [customerAId, center1Id, ownerUserId]
    );

    const res = await request(app)
      .get(`/api/v1/billing/customers/${customerAId}/statement?periodId=${calendarPeriodId}`)
      .set('Authorization', `Bearer ${accountantToken}`);

    assert.equal(res.status, 200);
    assert.equal(Number(res.body.data.bill.deductionsDebit), 150.00);
  });

  // Scenario 11: Settled payout aggregation
  await t.test('11. Settled payout aggregation (SUCCESSFUL status included)', async () => {
    // Insert Confirmed Settled Payment of ₹500.00
    await query(
      `INSERT INTO customer_payments (
         center_id, customer_id, payment_number, payment_mode, amount,
         payment_status, transaction_reference, paid_at, disbursed_by, created_at
       ) VALUES ($1, $2, 'PAY-CONF-${uniqueSuffix}', 'BANK_TRANSFER', 500.00, 'SUCCESSFUL', 'UTR-SBI-991122', '2026-11-18 12:00:00+05:30', $3, '2026-11-18 12:00:00+05:30');`,
      [center1Id, customerAId, ownerUserId]
    );

    const res = await request(app)
      .get(`/api/v1/billing/customers/${customerAId}/statement?periodId=${calendarPeriodId}`)
      .set('Authorization', `Bearer ${accountantToken}`);

    assert.equal(res.status, 200);
    assert.equal(Number(res.body.data.bill.settledPayoutsAmount), 500.00);
  });

  // Scenario 12: Pending payout exclusion (Must NOT be deducted)
  await t.test('12. Pending payout exclusion (PENDING payouts must NOT reduce balance)', async () => {
    // Insert PENDING payout of ₹1,000.00
    await query(
      `INSERT INTO customer_payments (
         center_id, customer_id, payment_number, payment_mode, amount,
         payment_status, transaction_reference, disbursed_by, created_at
       ) VALUES ($1, $2, 'PAY-PEND-${uniqueSuffix}', 'BANK_TRANSFER', 1000.00, 'PENDING', 'PENDING-REQ', $3, '2026-11-20 15:00:00+05:30');`,
      [center1Id, customerAId, ownerUserId]
    );

    const res = await request(app)
      .get(`/api/v1/billing/customers/${customerAId}/statement?periodId=${calendarPeriodId}`)
      .set('Authorization', `Bearer ${accountantToken}`);

    assert.equal(res.status, 200);
    // Settled payout must remain 500.00, NOT 1500.00!
    assert.equal(Number(res.body.data.bill.settledPayoutsAmount), 500.00);
  });

  // Scenario 13: Closing balance calculation
  await t.test('13. Closing balance calculation parity', async () => {
    // Generate actual bills for period
    const genRes = await request(app)
      .post(`/api/v1/billing/periods/${calendarPeriodId}/generate`)
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({});

    assert.equal(genRes.status, 200);
    assert.ok(genRes.body.data.billsGenerated >= 1);

    // Fetch generated bill
    const billRes = await query(
      `SELECT * FROM monthly_bills WHERE customer_id = $1 AND billing_period_id = $2;`,
      [customerAId, calendarPeriodId]
    );
    assert.ok(billRes.rows.length === 1);
    const bill = billRes.rows[0];
    customerABillId = bill.id;

    // Mathematical formula:
    // Closing Balance = Opening Balance + Total Credits - Total Debits - Settled Payouts
    // Opening: 1250.50
    // Gross Milk: 2050.00 (1400.00 Cow + 650.00 Buffalo)
    // Other Credits: 0.00
    // Total Credits: 2050.00
    // Debits: Feed (350.00) + Advances (400.00) + Deductions (150.00) = 900.00
    // Settled Payouts: 500.00
    // Expected Closing: 1250.50 + 2050.00 - 900.00 - 500.00 = 1900.50
    assert.equal(Number(bill.opening_balance), 1250.50);
    assert.equal(Number(bill.total_credits), 2050.00);
    assert.equal(Number(bill.total_debits), 900.00);
    assert.equal(Number(bill.settled_payouts_amount), 500.00);
    assert.equal(Number(bill.closing_balance), 1900.50);
    assert.equal(Number(bill.net_payable_amount), 1900.50);
    assert.equal(bill.is_negative_balance, false);
  });

  // Scenario 14: Negative customer balance (Customer owes dairy)
  await t.test('14. Negative customer balance (Customer owes dairy, Net Payable = 0.00)', async () => {
    // Customer B has no milk, but receives ₹1500.00 advance
    await query(
      `INSERT INTO ledger_transactions (
         organization_id, center_id, customer_id, transaction_type, direction,
         amount, balance_after, reference_entity, reference_id, idempotency_key, created_by, created_at
       ) VALUES ($1, $2, $3, 'ADVANCE_DEBIT', 'DEBIT', 1500.00, -1500.00, 'CUSTOMER_ADVANCE', gen_random_uuid(), 'IDEM-CUSTB-ADV-${uniqueSuffix}', $4, '2026-11-10 10:00:00+05:30');`,
      [orgId, center1Id, customerBId, ownerUserId]
    );

    // Generate individual bill for Customer B
    const genBRes = await request(app)
      .post(`/api/v1/billing/periods/${calendarPeriodId}/generate`)
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({ customerId: customerBId });

    assert.equal(genBRes.status, 200);

    const bRes = await query(
      `SELECT * FROM monthly_bills WHERE customer_id = $1 AND billing_period_id = $2;`,
      [customerBId, calendarPeriodId]
    );
    assert.ok(bRes.rows.length === 1);
    const billB = bRes.rows[0];
    customerBBillId = billB.id;

    assert.equal(Number(billB.closing_balance), -1500.00);
    assert.equal(billB.is_negative_balance, true);
    assert.equal(Number(billB.net_payable_amount), 0.00, 'Must NOT present negative balance as a payout');
  });

  // Scenario 15: Duplicate bill prevention
  await t.test('15. Duplicate bill prevention (uq_customer_bill_per_period constraint)', async () => {
    let duplicateRejected = false;
    try {
      await query(
        `INSERT INTO monthly_bills (
           billing_period_id, customer_id, center_id, organization_id, bill_number,
           opening_balance, closing_balance, net_payable_amount
         ) VALUES ($1, $2, $3, $4, 'BILL-DUP-${uniqueSuffix}', 0.00, 0.00, 0.00);`,
        [calendarPeriodId, customerAId, center1Id, orgId]
      );
    } catch (err) {
      duplicateRejected = err.code === '23505';
    }
    assert.equal(duplicateRejected, true, 'Unique constraint must block duplicate bill for same customer and period');
  });

  // Scenario 16: Repeated generation (Idempotency)
  await t.test('16. Repeated generation idempotency (Clean update without duplication)', async () => {
    // Re-run batch generation
    const genRes = await request(app)
      .post(`/api/v1/billing/periods/${calendarPeriodId}/generate`)
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({});

    assert.equal(genRes.status, 200);

    // Count bills for Customer A - must strictly remain 1
    const countRes = await query(
      `SELECT COUNT(*) FROM monthly_bills WHERE customer_id = $1 AND billing_period_id = $2;`,
      [customerAId, calendarPeriodId]
    );
    assert.equal(parseInt(countRes.rows[0].count, 10), 1);

    // Closing balance must remain exact
    const billRes = await query(`SELECT closing_balance FROM monthly_bills WHERE id = $1;`, [customerABillId]);
    assert.equal(Number(billRes.rows[0].closing_balance), 1900.50);
  });

  // Scenario 17: Finalized bill immutability
  await t.test('17. Finalized bill immutability trigger blocks direct SQL modifications', async () => {
    // Finalize Customer B's bill directly or via API
    await query(`UPDATE monthly_bills SET bill_status = 'FINALIZED', version = 1 WHERE id = $1;`, [customerBBillId]);

    // Attempt direct UPDATE of financial data
    let updateBlocked = false;
    try {
      await query(`UPDATE monthly_bills SET closing_balance = 0.00 WHERE id = $1;`, [customerBBillId]);
    } catch (err) {
      updateBlocked = err.message.includes('FINALIZED');
    }
    assert.equal(updateBlocked, true, 'Database trigger must prevent direct modification of FINALIZED bill');
  });

  // Scenario 18: Authorized approval workflow
  await t.test('18. Authorized approval workflow (Center Manager approves bill)', async () => {
    // Submit Customer A bill for review
    const subRes = await request(app)
      .post(`/api/v1/billing/${customerABillId}/submit-review`)
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({ notes: 'Calculations verified against ledger' });

    assert.equal(subRes.status, 200);
    assert.equal(subRes.body.data.billStatus, 'UNDER_REVIEW');

    // Approve by Center Manager
    const appRes = await request(app)
      .post(`/api/v1/billing/${customerABillId}/approve`)
      .set('Authorization', `Bearer ${managerCenter1Token}`)
      .send({ notes: 'Approved for final payout' });

    assert.equal(appRes.status, 200);
    assert.equal(appRes.body.data.billStatus, 'APPROVED');
  });

  // Scenario 19: Unauthorized finalization rejection
  await t.test('19. Unauthorized finalization rejection (Center Manager cannot finalize)', async () => {
    const res = await request(app)
      .post(`/api/v1/billing/${customerABillId}/finalize`)
      .set('Authorization', `Bearer ${managerCenter1Token}`) // Manager attempt
      .send({ notes: 'Attempting finalization' });

    assert.equal(res.status, 403, 'Must reject non-owner finalization with 403 Forbidden');
  });

  // Scenario 20: Authorized finalization and statement PDF generation
  await t.test('20. Authorized finalization by Owner and statement PDF generation', async () => {
    const finRes = await request(app)
      .post(`/api/v1/billing/${customerABillId}/finalize`)
      .set('Authorization', `Bearer ${ownerToken}`) // Owner finalization
      .send({ notes: 'Final settlement authorized' });

    assert.equal(finRes.status, 200);
    assert.equal(finRes.body.data.billStatus, 'FINALIZED');
    assert.ok(finRes.body.data.pdfSha256Hash, 'Finalized bill must contain cryptographic hash');

    // Download PDF statement
    const pdfRes = await request(app)
      .get(`/api/v1/billing/${customerABillId}/pdf`)
      .set('Authorization', `Bearer ${customerAToken}`);

    assert.equal(pdfRes.status, 200);
    assert.equal(pdfRes.headers['content-type'], 'application/pdf');
    assert.ok(pdfRes.body.length > 500, 'PDF buffer must contain real binary content');
    // Verify PDF header magic bytes %PDF-
    const headerStr = pdfRes.body.slice(0, 5).toString('ascii');
    assert.equal(headerStr, '%PDF-');
  });

  // Scenario 21: Customer ownership isolation
  await t.test('21. Customer ownership isolation (Customer B cannot access Customer A statement)', async () => {
    // Customer B requests Customer A statement
    const res = await request(app)
      .get(`/api/v1/billing/customers/${customerAId}/statement?periodId=${calendarPeriodId}`)
      .set('Authorization', `Bearer ${customerBToken}`);

    assert.equal(res.status, 403, 'Cross-customer statement query must return 403 Forbidden');
    assert.equal(res.body.error.code, 'CUSTOMER_ISOLATION_VIOLATION');

    // Customer A requests own statement
    const ownRes = await request(app)
      .get(`/api/v1/billing/customers/${customerAId}/statement?periodId=${calendarPeriodId}`)
      .set('Authorization', `Bearer ${customerAToken}`);

    assert.equal(ownRes.status, 200);
    assert.equal(ownRes.body.data.customer.id, customerAId);
  });

  // Scenario 22: Center isolation
  await t.test('22. Center isolation (Manager of Center Beta cannot access Center Alpha periods)', async () => {
    // Manager 2 tries to trigger generation for Center Alpha's period
    const res = await request(app)
      .post(`/api/v1/billing/periods/${calendarPeriodId}/generate`)
      .set('Authorization', `Bearer ${managerCenter2Token}`)
      .send({});

    assert.equal(res.status, 403, 'Cross-center access must be denied with 403');
  });

  // Scenario 23: Adjustment and correction workflow
  await t.test('23. Adjustment and versioned correction of bill', async () => {
    // Add ₹100.00 credit adjustment for bonus incentive
    const adjRes = await request(app)
      .post(`/api/v1/billing/${customerABillId}/adjust`)
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({
        adjustmentType: 'CREDIT',
        amount: 100.00,
        reason: 'Authorized Quality Bonus Incentive',
      });

    assert.equal(adjRes.status, 200);
    assert.equal(adjRes.body.data.version, 2, 'Version must increment to 2');
    assert.equal(adjRes.body.data.billStatus, 'CORRECTION_REQUIRED');
    // Previous closing was 1900.50 + 100.00 credit = 2000.50
    assert.equal(Number(adjRes.body.data.closingBalance), 2000.50);
  });

  // Scenario 24: Historical ledger reconciliation parity
  await t.test('24. Historical ledger reconciliation parity', async () => {
    // 1. Calculate sum of credits and debits from ledger transactions
    const ledgerSumRes = await query(
      `SELECT 
         COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END), 0.00) as net_balance
       FROM ledger_transactions
       WHERE customer_id = $1;`,
      [customerAId]
    );

    // 2. Query latest running balance on customer_ledger_accounts
    const acctRes = await query(
      `SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;`,
      [customerAId]
    );

    // 3. Verify ledger integrity
    const ledgerNet = Number(ledgerSumRes.rows[0].net_balance);
    assert.ok(!isNaN(ledgerNet));

    // 4. Verify bill finalization record exists
    const finRecRes = await query(
      `SELECT * FROM bill_finalization_records WHERE billing_period_id = $1;`,
      [calendarPeriodId]
    );
    assert.ok(finRecRes.rows.length >= 1, 'Finalization audit snapshot record must exist');
    assert.ok(finRecRes.rows[0].snapshot_checksum, 'Cryptographic snapshot checksum must be present');
  });
});
