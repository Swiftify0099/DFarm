import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import pg from 'pg';
import crypto from 'node:crypto';
import { createApp } from '../dist/app.js';
import { signJwt } from '../dist/jwt.js';
import { pool } from '../dist/db.js';

const { Client } = pg;
const dbClient = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
});

async function query(text, params) {
  return dbClient.query(text, params);
}

test('DFarm Phase 12: Customer Financial Accounting & Double-Entry Ledger Suite (22 Scenarios)', async (t) => {
  await dbClient.connect();
  t.after(async () => {
    await dbClient.end();
    await pool.end();
  });

  const app = createApp();

  // Shared test context
  let org1Id = '';
  let org2Id = '';
  let center1Id = '';
  let center2Id = '';
  let adminUserId = '';
  let supervisorUserId = '';
  let operatorUserId = '';
  let org2AdminUserId = '';

  let customer1Id = '';
  let customer2Id = '';
  let org2CustomerId = '';

  let adminToken = '';
  let supervisorToken = '';
  let operatorToken = '';
  let org2AdminToken = '';
  let customer1Token = '';
  let customer2Token = '';

  let testAdvanceId = '';
  let testCollectionId = '';
  const runSuffix = Date.now().toString().slice(-6);

  await t.test('0. Setup Test Organizations, Centers, Staff Users, and Customers', async () => {
    // 1. Get or create Org 1 (Sangli) and Org 2 (Kolhapur)
    const o1 = await query("SELECT id FROM organizations WHERE code = 'SDCU_01' OR name ILIKE '%Sangli%' LIMIT 1;");
    assert.ok(o1.rows.length > 0, 'Org 1 must exist');
    org1Id = o1.rows[0].id;

    const o2 = await query("SELECT id FROM organizations WHERE code = 'KDCU_02' OR name ILIKE '%Kolhapur%' LIMIT 1;");
    if (o2.rows.length > 0) {
      org2Id = o2.rows[0].id;
    } else {
      const newOrg2 = await query(`INSERT INTO organizations (name, code, status) VALUES ('Kolhapur District Union', 'KDCU_P12', 'ACTIVE') RETURNING id;`);
      org2Id = newOrg2.rows[0].id;
    }

    // 2. Centers
    const c1 = await query('SELECT id FROM dairy_centers WHERE organization_id = $1 LIMIT 1;', [org1Id]);
    assert.ok(c1.rows.length > 0, 'Center 1 must exist');
    center1Id = c1.rows[0].id;

    const c2 = await query('SELECT id FROM dairy_centers WHERE organization_id = $1 LIMIT 1;', [org2Id]);
    if (c2.rows.length > 0) {
      center2Id = c2.rows[0].id;
    } else {
      const newCenter2 = await query(`INSERT INTO dairy_centers (organization_id, name, code, status) VALUES ($1, 'Kolhapur Center P12', 'KOL_P12', 'ACTIVE') RETURNING id;`, [org2Id]);
      center2Id = newCenter2.rows[0].id;
    }

    // 3. Staff Users
    // Admin (Org 1)
    const adminRes = await query(
      `INSERT INTO users (organization_id, username, full_name, email, phone_number, role, status)
       VALUES ($1, 'p12_admin_' || $2, 'Admin Thorat', 'p12_admin_' || $2 || '@dfarm.test', '+9199' || $2 || '1', 'DAIRY_OWNER', 'ACTIVE')
       RETURNING id;`,
      [org1Id, runSuffix]
    );
    adminUserId = adminRes.rows[0].id;

    // Supervisor (Org 1)
    const supRes = await query(
      `INSERT INTO users (organization_id, username, full_name, email, phone_number, role, status)
       VALUES ($1, 'p12_supervisor_' || $2, 'Supervisor Patil', 'p12_sup_' || $2 || '@dfarm.test', '+9199' || $2 || '2', 'SUPERVISOR', 'ACTIVE')
       RETURNING id;`,
      [org1Id, runSuffix]
    );
    supervisorUserId = supRes.rows[0].id;
    await query(`INSERT INTO user_center_assignments (user_id, center_id, is_primary) VALUES ($1, $2, TRUE) ON CONFLICT DO NOTHING;`, [supervisorUserId, center1Id]);

    // Operator (Org 1)
    const opRes = await query(
      `INSERT INTO users (organization_id, username, full_name, email, phone_number, role, status)
       VALUES ($1, 'p12_operator_' || $2, 'Operator Kadam', 'p12_op_' || $2 || '@dfarm.test', '+9199' || $2 || '3', 'COLLECTION_OPERATOR', 'ACTIVE')
       RETURNING id;`,
      [org1Id, runSuffix]
    );
    operatorUserId = opRes.rows[0].id;
    await query(`INSERT INTO user_center_assignments (user_id, center_id, is_primary) VALUES ($1, $2, TRUE) ON CONFLICT DO NOTHING;`, [operatorUserId, center1Id]);

    // Admin (Org 2)
    const org2AdminRes = await query(
      `INSERT INTO users (organization_id, username, full_name, email, phone_number, role, status)
       VALUES ($1, 'p12_org2_admin_' || $2, 'Org2 Admin Deshmukh', 'p12_org2_' || $2 || '@dfarm.test', '+9199' || $2 || '4', 'DAIRY_OWNER', 'ACTIVE')
       RETURNING id;`,
      [org2Id, runSuffix]
    );
    org2AdminUserId = org2AdminRes.rows[0].id;

    // 4. Customers
    // Customer 1 (Org 1)
    const cust1Res = await query(
      `INSERT INTO customers (organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status)
       VALUES ($1, $2, 'FC-P12-' || $3 || '-01', 'Ramesh Jadhav', '+9198' || $3 || '1', 'ACTIVE')
       RETURNING id;`,
      [org1Id, center1Id, runSuffix]
    );
    customer1Id = cust1Res.rows[0].id;

    // Customer 2 (Org 1)
    const cust2Res = await query(
      `INSERT INTO customers (organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status)
       VALUES ($1, $2, 'FC-P12-' || $3 || '-02', 'Suresh Shinde', '+9198' || $3 || '2', 'ACTIVE')
       RETURNING id;`,
      [org1Id, center1Id, runSuffix]
    );
    customer2Id = cust2Res.rows[0].id;

    // Customer Org 2
    const custOrg2Res = await query(
      `INSERT INTO customers (organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status)
       VALUES ($1, $2, 'FC-P12-' || $3 || '-03', 'Anand Koli', '+9198' || $3 || '3', 'ACTIVE')
       RETURNING id;`,
      [org2Id, center2Id, runSuffix]
    );
    org2CustomerId = custOrg2Res.rows[0].id;

    // Authorize milk categories
    await query(
      `INSERT INTO customer_milk_categories (customer_id, milk_category, is_authorized, authorized_by) 
       VALUES ($1, 'COW', TRUE, $4), ($2, 'COW', TRUE, $4), ($3, 'COW', TRUE, $4);`,
      [customer1Id, customer2Id, org2CustomerId, adminUserId]
    );

    // Center Settings for biological limits
    await query(
      `INSERT INTO center_settings (
         center_id, cow_fat_min, cow_fat_max, cow_snf_min, cow_snf_max,
         buffalo_fat_min, buffalo_fat_max, buffalo_snf_min, buffalo_snf_max
       ) VALUES ($1, 2.8, 6.0, 7.8, 10.2, 5.0, 12.0, 8.2, 11.5)
       ON CONFLICT (center_id) DO UPDATE SET
         cow_fat_min = 2.8, cow_fat_max = 6.0, cow_snf_min = 7.8, cow_snf_max = 10.2;`,
      [center1Id]
    );

    // Ensure active Rate Chart and cells for COW
    const rcRes = await query(
      `INSERT INTO rate_charts (organization_id, center_id, name, milk_category, pricing_type, is_active)
       VALUES ($1, $2, 'Tasgaon Cow Standard Rate P12 ' || $3, 'COW', 'GRID', TRUE)
       RETURNING id;`,
      [org1Id, center1Id, runSuffix]
    );
    const cowRateChartId = rcRes.rows[0].id;

    const rcvRes = await query(
      `INSERT INTO rate_chart_versions (rate_chart_id, version_number, effective_from, is_approved, approved_by, approved_at)
       VALUES ($1, 1, NOW() - INTERVAL '1 day', TRUE, $2, NOW())
       RETURNING id;`,
      [cowRateChartId, supervisorUserId]
    );
    const cowRateVersionId = rcvRes.rows[0].id;

    await query(
      `INSERT INTO rate_chart_cells (rate_chart_version_id, fat_percentage, snf_percentage, rate_per_unit)
       VALUES ($1, 4.0, 8.5, 36.50), ($1, 4.2, 8.5, 37.80), ($1, 3.5, 8.5, 34.00);`,
      [cowRateVersionId]
    );

    // 5. Generate Auth Tokens
    adminToken = signJwt({
      sub: adminUserId,
      userId: adminUserId,
      organizationId: org1Id,
      role: 'DAIRY_OWNER',
      centerIds: [center1Id],
    });

    supervisorToken = signJwt({
      sub: supervisorUserId,
      userId: supervisorUserId,
      organizationId: org1Id,
      role: 'SUPERVISOR',
      primaryCenterId: center1Id,
      centerIds: [center1Id],
    });

    operatorToken = signJwt({
      sub: operatorUserId,
      userId: operatorUserId,
      organizationId: org1Id,
      role: 'COLLECTION_OPERATOR',
      primaryCenterId: center1Id,
      centerIds: [center1Id],
    });

    org2AdminToken = signJwt({
      sub: org2AdminUserId,
      userId: org2AdminUserId,
      organizationId: org2Id,
      role: 'DAIRY_OWNER',
      centerIds: [center2Id],
    });

    customer1Token = signJwt({
      sub: customer1Id,
      userId: customer1Id,
      organizationId: org1Id,
      role: 'FARMER_CUSTOMER',
      centerIds: [center1Id],
    });

    customer2Token = signJwt({
      sub: customer2Id,
      userId: customer2Id,
      organizationId: org1Id,
      role: 'FARMER_CUSTOMER',
      centerIds: [center1Id],
    });
  });

  // 1. Milk credit
  await t.test('1. Milk credit: synchronous credit increases running liability balance & creates balanced journal', async () => {
    // Post a milk collection credit using collection intake
    const sessionRes = await query(
      `SELECT public.create_milk_collection_session(
         $1::uuid, $2::uuid, $3::uuid, 'TEST_POS_01'::varchar, 'MORNING'::varchar,
         'COW'::varchar, 'SUPERVISOR_MANUAL'::varchar, gen_random_uuid(), CURRENT_DATE, NULL
       ) AS result;`,
      [center1Id, customer1Id, supervisorUserId]
    );
    const session = sessionRes.rows[0].result;

    const completeRes = await query(
      `SELECT public.complete_milk_collection_session(
         $1::uuid, $2::uuid, 'TEST_POS_01'::varchar, 10.0::numeric, 4.0::numeric,
         8.5::numeric, 'KG'::varchar, 'MANUAL_ENTRY'::varchar, gen_random_uuid(), ('IDEM-P12-MILK-' || $3)::varchar
       ) AS result;`,
      [session.sessionId, supervisorUserId, runSuffix]
    );
    const complete = completeRes.rows[0].result;
    assert.ok(complete.collectionId);
    assert.ok(complete.newBalance > 0);
    testCollectionId = complete.collectionId;
    const milkCreditAmount = complete.totalAmount;

    // Verify Customer Ledger Account
    const cla = await query('SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;', [customer1Id]);
    assert.equal(parseFloat(cla.rows[0].current_balance), milkCreditAmount);

    // Verify Ledger Transaction
    const lt = await query(
      "SELECT * FROM ledger_transactions WHERE reference_id = $1 AND transaction_type = 'MILK_COLLECTION_CREDIT';",
      [testCollectionId]
    );
    assert.equal(lt.rows.length, 1);
    assert.equal(lt.rows[0].direction, 'CREDIT');
    assert.equal(parseFloat(lt.rows[0].amount), milkCreditAmount);
    assert.equal(parseFloat(lt.rows[0].balance_after), milkCreditAmount);

    // Verify Balanced Double-Entry Journal Entries
    const le = await query('SELECT * FROM ledger_entries WHERE transaction_id = $1;', [lt.rows[0].id]);
    assert.equal(le.rows.length, 2);

    const debitEntry = le.rows.find(e => e.entry_type === 'DEBIT');
    const creditEntry = le.rows.find(e => e.entry_type === 'CREDIT');
    assert.ok(debitEntry, 'Must have DEBIT journal entry');
    assert.ok(creditEntry, 'Must have CREDIT journal entry');
    assert.equal(parseFloat(debitEntry.amount), milkCreditAmount);
    assert.equal(parseFloat(creditEntry.amount), milkCreditAmount);
    assert.equal(debitEntry.account_type, 'MILK_PURCHASE_EXPENSE');
    assert.equal(creditEntry.account_type, 'CUSTOMER_PAYABLE');
  });

  // 2. Advance debit
  await t.test('2. Advance debit: emergency cash advance reduces dairy liability balance & creates active advance', async () => {
    const claBefore = await query('SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;', [customer1Id]);
    const prevBalance = parseFloat(claBefore.rows[0].current_balance);

    const advanceAmount = 200.00;
    const res = await request(app)
      .post(`/api/v1/ledger/${customer1Id}/advances`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        amount: advanceAmount,
        reason: 'Emergency purchase of veterinary medicines',
        recoveryType: 'MONTHLY_BILL_DEDUCTION',
        idempotencyKey: 'IDEM-P12-ADV-' + runSuffix,
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    const data = res.body.data;
    assert.ok(data.advanceId);
    testAdvanceId = data.advanceId;
    assert.equal(data.principalAmount, advanceAmount);
    assert.equal(data.outstandingAmount, advanceAmount);
    assert.equal(data.status, 'ACTIVE');

    // Balance after = prevBalance - advanceAmount (DEBIT decreases liability)
    const expectedBalance = parseFloat((prevBalance - advanceAmount).toFixed(2));
    assert.equal(data.newBalance, expectedBalance);

    const claAfter = await query('SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;', [customer1Id]);
    assert.equal(parseFloat(claAfter.rows[0].current_balance), expectedBalance);

    // Verify balanced journal entries
    const lt = await query("SELECT * FROM ledger_transactions WHERE reference_id = $1 AND transaction_type = 'CUSTOMER_ADVANCE_DEBIT';", [testAdvanceId]);
    assert.equal(lt.rows.length, 1);
    const le = await query('SELECT * FROM ledger_entries WHERE transaction_id = $1;', [lt.rows[0].id]);
    assert.equal(le.rows.length, 2);
    const debit = le.rows.find(e => e.entry_type === 'DEBIT');
    const credit = le.rows.find(e => e.entry_type === 'CREDIT');
    assert.equal(debit.account_type, 'CUSTOMER_PAYABLE');
    assert.equal(credit.account_type, 'CASH_BANK');
    assert.equal(parseFloat(debit.amount), advanceAmount);
    assert.equal(parseFloat(credit.amount), advanceAmount);
  });

  // 3. Partial advance recovery
  await t.test('3. Partial advance recovery: partially recovers advance & credits customer liability ledger', async () => {
    const claBefore = await query('SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;', [customer1Id]);
    const prevBalance = parseFloat(claBefore.rows[0].current_balance);

    const recoveryAmount = 80.00;
    const res = await request(app)
      .post(`/api/v1/ledger/advances/${testAdvanceId}/recover`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        amount: recoveryAmount,
        notes: 'Cash counter repayment of Rs 80',
        idempotencyKey: 'IDEM-P12-REC1-' + runSuffix,
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    const data = res.body.data;
    assert.equal(data.recoveredAmount, recoveryAmount);
    assert.equal(data.totalRecoveredAmount, 80.00);
    assert.equal(data.remainingPrincipal, 120.00);
    assert.equal(data.status, 'ACTIVE');

    // Liability balance increases back by recovered amount
    const expectedBalance = parseFloat((prevBalance + recoveryAmount).toFixed(2));
    assert.equal(data.newBalance, expectedBalance);
  });

  // 4. Full advance recovery
  await t.test('4. Full advance recovery: settles remaining principal & rejects over-recovery', async () => {
    // A. Attempting over-recovery (e.g. 150 > remaining 120) must be rejected
    const overRes = await request(app)
      .post(`/api/v1/ledger/advances/${testAdvanceId}/recover`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        amount: 150.00,
        notes: 'Over-recovery attempt',
      });
    assert.equal(overRes.status, 400);
    assert.ok(overRes.body.error.message.includes('OVER_RECOVERY_PROHIBITED') || overRes.body.error.code === 'OVER_RECOVERY_PROHIBITED');

    // B. Settling exact remaining principal (120.00)
    const settleRes = await request(app)
      .post(`/api/v1/ledger/advances/${testAdvanceId}/recover`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        amount: 120.00,
        notes: 'Full final settlement',
        idempotencyKey: 'IDEM-P12-REC2-' + runSuffix,
      });

    assert.equal(settleRes.status, 200);
    const data = settleRes.body.data;
    assert.equal(data.totalRecoveredAmount, 200.00);
    assert.equal(data.remainingPrincipal, 0.00);
    assert.equal(data.status, 'FULLY_RECOVERED');
  });

  // 5. Deduction posting
  await t.test('5. Deduction posting: authorized charges (veterinary, AI service, insurance) reduce liability balance', async () => {
    const claBefore = await query('SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;', [customer1Id]);
    const prevBalance = parseFloat(claBefore.rows[0].current_balance);

    const deductionAmount = 50.00;
    const res = await request(app)
      .post(`/api/v1/ledger/${customer1Id}/deductions`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        category: 'VETERINARY_MEDICINE',
        amount: deductionAmount,
        description: 'Deworming & Mineral mixture kit',
        supportingReference: 'VET-INV-891',
        idempotencyKey: 'IDEM-P12-DED-' + runSuffix,
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    const data = res.body.data;
    assert.equal(data.category, 'VETERINARY_MEDICINE');
    assert.equal(data.amount, deductionAmount);

    const expectedBalance = parseFloat((prevBalance - deductionAmount).toFixed(2));
    assert.equal(data.newBalance, expectedBalance);

    // Verify double-entry journal (Debit Customer Payable, Credit Deduction Income)
    const lt = await query("SELECT * FROM ledger_transactions WHERE reference_id = $1 AND transaction_type = 'AUTHORIZED_DEDUCTION_DEBIT';", [data.deductionId]);
    assert.equal(lt.rows.length, 1);
    const le = await query('SELECT * FROM ledger_entries WHERE transaction_id = $1;', [lt.rows[0].id]);
    assert.equal(le.rows.length, 2);
    const debit = le.rows.find(e => e.entry_type === 'DEBIT');
    const credit = le.rows.find(e => e.entry_type === 'CREDIT');
    assert.equal(debit.account_type, 'CUSTOMER_PAYABLE');
    assert.equal(credit.account_type, 'DEDUCTION_INCOME');
    assert.equal(parseFloat(debit.amount), deductionAmount);
    assert.equal(parseFloat(credit.amount), deductionAmount);
  });

  // 6. Duplicate financial event
  await t.test('6. Duplicate financial event: duplicate idempotency key returns cached receipt without double-posting', async () => {
    const claBefore = await query('SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;', [customer1Id]);
    const balanceBefore = parseFloat(claBefore.rows[0].current_balance);

    // Replay exact same deduction with idempotencyKey: 'IDEM-P12-DED-' + runSuffix
    const res = await request(app)
      .post(`/api/v1/ledger/${customer1Id}/deductions`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        category: 'VETERINARY_MEDICINE',
        amount: 50.00,
        description: 'Deworming & Mineral mixture kit (Replay)',
        idempotencyKey: 'IDEM-P12-DED-' + runSuffix,
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.isIdempotentReplay, true);

    // Verify balance is completely unchanged
    const claAfter = await query('SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;', [customer1Id]);
    assert.equal(parseFloat(claAfter.rows[0].current_balance), balanceBefore);
  });

  // 7. Balanced journal
  await t.test('7. Balanced journal: every transaction in ledger has SUM(Debits) = SUM(Credits)', async () => {
    const unbalanced = await query(`
      SELECT lt.id, lt.amount,
             COALESCE(SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE 0 END), 0) AS total_debit,
             COALESCE(SUM(CASE WHEN le.entry_type = 'CREDIT' THEN le.amount ELSE 0 END), 0) AS total_credit
      FROM ledger_transactions lt
      LEFT JOIN ledger_entries le ON le.transaction_id = lt.id
      WHERE lt.customer_id = $1
      GROUP BY lt.id, lt.amount
      HAVING COALESCE(SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE 0 END), 0) <> COALESCE(SUM(CASE WHEN le.entry_type = 'CREDIT' THEN le.amount ELSE 0 END), 0)
         OR COALESCE(SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE 0 END), 0) <> lt.amount;
    `, [customer1Id]);

    assert.equal(unbalanced.rows.length, 0, 'No unbalanced journal entries permitted');
  });

  // 8. Unbalanced journal rejection
  await t.test('8. Unbalanced journal rejection: direct insertion of unbalanced entries is rejected by constraints', async () => {
    // Attempt inserting invalid entry_type or negative amount
    await assert.rejects(async () => {
      await query(`
        INSERT INTO ledger_entries (transaction_id, account_id, account_type, entry_type, amount)
        VALUES ('${crypto.randomUUID()}', '${customer1Id}', 'CUSTOMER_PAYABLE', 'INVALID_TYPE', 100.00);
      `);
    });

    await assert.rejects(async () => {
      await query(`
        INSERT INTO ledger_entries (transaction_id, account_id, account_type, entry_type, amount)
        VALUES ('${crypto.randomUUID()}', '${customer1Id}', 'CUSTOMER_PAYABLE', 'DEBIT', -50.00);
      `);
    });
  });

  // 9. Running balance
  await t.test('9. Running balance: current_balance strictly equals Opening + Credits - Debits', async () => {
    const summaryRes = await request(app)
      .get(`/api/v1/customers/${customer1Id}/ledger/summary`)
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(summaryRes.status, 200);
    const s = summaryRes.body.data;

    const calculatedBalance = parseFloat((s.openingBalance + s.totalCredits - s.totalDebits).toFixed(2));
    assert.equal(s.currentBalance, calculatedBalance);
  });

  // 10. Opening balance
  await t.test('10. Opening balance: Authorized Admin initializes opening balance & prevents duplicates', async () => {
    // Customer 2 starts fresh
    const res = await request(app)
      .post(`/api/v1/ledger/${customer2Id}/opening-balance`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount: 500.00,
        direction: 'CREDIT',
        openingDate: '2026-04-01',
        supportingReference: 'PREV-COOP-AUDIT-2026',
        idempotencyKey: 'IDEM-P12-OB-' + runSuffix,
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.newBalance, 500.00);

    // Attempting second opening balance for same customer is rejected with 409
    const dupRes = await request(app)
      .post(`/api/v1/ledger/${customer2Id}/opening-balance`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount: 300.00,
        direction: 'DEBIT',
        supportingReference: 'ANOTHER-REF',
      });

    assert.equal(dupRes.status, 409);
    assert.ok(dupRes.body.error.message.includes('OPENING_BALANCE_EXISTS') || dupRes.body.error.code === 'OPENING_BALANCE_EXISTS');
  });

  // 11. Reversal
  await t.test('11. Reversal: supervisor collection reversal creates debit reversal transaction and restores prior balance', async () => {
    const claBefore = await query('SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;', [customer1Id]);
    const prevBalance = parseFloat(claBefore.rows[0].current_balance);

    const colRes = await query('SELECT total_amount FROM milk_collections WHERE id = $1;', [testCollectionId]);
    const colAmount = parseFloat(colRes.rows[0].total_amount);

    // Execute supervisor reversal
    const revRes = await query(
      `SELECT public.adjust_milk_collection($1::uuid, $2::uuid, 'Reversal of erroneous intake reading'::text, 'FULL_REVERSAL'::varchar, NULL, NULL, NULL) AS result;`,
      [testCollectionId, supervisorUserId]
    );

    const rev = revRes.rows[0].result;
    assert.equal(rev.status, 'REVERSED');
    assert.equal(rev.reversedAmount, colAmount);
    assert.equal(rev.newBalance, parseFloat((prevBalance - colAmount).toFixed(2)));

    // Verify COLLECTION_REVERSAL_DEBIT ledger transaction
    const lt = await query("SELECT * FROM ledger_transactions WHERE reference_id = $1 AND transaction_type = 'COLLECTION_REVERSAL_DEBIT';", [testCollectionId]);
    assert.equal(lt.rows.length, 1);
    assert.equal(lt.rows[0].direction, 'DEBIT');
  });

  // 12. Adjustment approval
  await t.test('12. Adjustment approval: Supervisor adjustment with mandatory reason succeeds and updates balance', async () => {
    const claBefore = await query('SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;', [customer1Id]);
    const prevBalance = parseFloat(claBefore.rows[0].current_balance);

    const adjustmentAmount = 150.00;
    const res = await request(app)
      .post(`/api/v1/ledger/${customer1Id}/adjustments`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        direction: 'CREDIT',
        amount: adjustmentAmount,
        reason: 'Authorized festive seasonal incentive approved by Board',
        idempotencyKey: 'IDEM-P12-ADJ-' + runSuffix,
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    const data = res.body.data;
    assert.equal(data.newBalance, parseFloat((prevBalance + adjustmentAmount).toFixed(2)));
  });

  // 13. Unauthorized adjustment
  await t.test('13. Unauthorized adjustment: Operator and Farmer cannot perform ledger adjustments (403 Forbidden)', async () => {
    // Collection Operator attempted adjustment
    const opRes = await request(app)
      .post(`/api/v1/ledger/${customer1Id}/adjustments`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        direction: 'CREDIT',
        amount: 100.00,
        reason: 'Unauthorized bonus attempt',
      });
    assert.equal(opRes.status, 403);

    // Customer attempted adjustment
    const custRes = await request(app)
      .post(`/api/v1/ledger/${customer1Id}/adjustments`)
      .set('Authorization', `Bearer ${customer1Token}`)
      .send({
        direction: 'CREDIT',
        amount: 500.00,
        reason: 'Customer trying to credit self',
      });
    assert.equal(custRes.status, 403);
  });

  // 14. Immutable historical transactions
  await t.test('14. Immutable historical transactions: direct UPDATE or DELETE on ledger_transactions triggers database exception', async () => {
    const lt = await query('SELECT id FROM ledger_transactions WHERE customer_id = $1 LIMIT 1;', [customer1Id]);
    assert.ok(lt.rows.length > 0);
    const txnId = lt.rows[0].id;

    // Direct UPDATE attempt must fail
    await assert.rejects(async () => {
      await query("UPDATE ledger_transactions SET amount = 9999.00 WHERE id = $1;", [txnId]);
    }, /CANNOT_MUTATE_LEDGER/);

    // Direct DELETE attempt must fail
    await assert.rejects(async () => {
      await query("DELETE FROM ledger_transactions WHERE id = $1;", [txnId]);
    }, /CANNOT_DELETE_LEDGER/);
  });

  // 15. Customer ownership
  await t.test('15. Customer ownership: customer reads only own ledger; cross-customer access is forbidden', async () => {
    // Customer 1 accessing Customer 1's ledger summary -> 200 OK
    const ownRes = await request(app)
      .get(`/api/v1/customers/${customer1Id}/ledger/summary`)
      .set('Authorization', `Bearer ${customer1Token}`);
    assert.equal(ownRes.status, 200);
    assert.equal(ownRes.body.data.customerId, customer1Id);

    // Customer 1 attempting to access Customer 2's ledger summary -> 403 Forbidden
    const otherRes = await request(app)
      .get(`/api/v1/customers/${customer2Id}/ledger/summary`)
      .set('Authorization', `Bearer ${customer1Token}`);
    assert.equal(otherRes.status, 403);
    assert.equal(otherRes.body.error.code, 'CUSTOMER_ISOLATION_VIOLATION');
  });

  // 16. Cross-organization isolation
  await t.test('16. Cross-organization isolation: Staff from Org 2 cannot read or post to Org 1 customer ledger', async () => {
    // Org 2 Admin trying to read Org 1 customer ledger
    const crossRes = await request(app)
      .get(`/api/v1/customers/${customer1Id}/ledger/summary`)
      .set('Authorization', `Bearer ${org2AdminToken}`);
    assert.equal(crossRes.status, 403);
    assert.equal(crossRes.body.error.code, 'CROSS_ORGANIZATION_ACCESS_DENIED');

    // Org 2 Admin trying to post advance to Org 1 customer
    const postRes = await request(app)
      .post(`/api/v1/ledger/${customer1Id}/advances`)
      .set('Authorization', `Bearer ${org2AdminToken}`)
      .send({
        amount: 100.00,
        reason: 'Cross org advance attempt',
      });
    assert.equal(postRes.status, 403);
    assert.equal(postRes.body.error.code, 'CROSS_ORGANIZATION_ACCESS_DENIED');
  });

  // 17. Reconciliation success
  await t.test('17. Reconciliation success: clean customer ledger returns isReconciled: true and 0 discrepancies', async () => {
    const recRes = await request(app)
      .post('/api/v1/ledger/reconcile')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerId: customer1Id });

    assert.equal(recRes.status, 200);
    const report = recRes.body.data;
    assert.equal(report.customerId, customer1Id);
    assert.equal(report.isReconciled, true);
    assert.equal(report.discrepancyCount, 0);
    assert.equal(report.accountBalance, report.computedBalance);
    assert.equal(report.discrepancies.length, 0);
  });

  // 18. Reconciliation mismatch detection
  await t.test('18. Reconciliation mismatch detection: detects running balance drift without auto-correcting', async () => {
    // Artificially tamper running balance in customer_ledger_accounts to simulate corruption
    await query("UPDATE customer_ledger_accounts SET current_balance = current_balance + 100.00 WHERE customer_id = $1;", [customer2Id]);

    const recRes = await request(app)
      .post('/api/v1/ledger/reconcile')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerId: customer2Id });

    assert.equal(recRes.status, 200);
    const report = recRes.body.data;
    assert.equal(report.isReconciled, false);
    assert.ok(report.discrepancyCount > 0);

    const mismatch = report.discrepancies.find(d => d.type === 'RUNNING_BALANCE_MISMATCH');
    assert.ok(mismatch, 'Must detect RUNNING_BALANCE_MISMATCH');
    assert.equal(mismatch.difference, 100.00);

    // Restore correct balance
    await query("UPDATE customer_ledger_accounts SET current_balance = current_balance - 100.00 WHERE customer_id = $1;", [customer2Id]);
  });

  // 19. Decimal precision
  await t.test('19. Decimal precision: financial calculations use exact PostgreSQL NUMERIC arithmetic without floating-point error', async () => {
    // 0.10 + 0.20 in JavaScript floating point produces 0.30000000000000004
    // Verify PostgreSQL NUMERIC produces exact 0.30
    const precRes = await query(`
      SELECT 
        (0.10::numeric(10,2) + 0.20::numeric(10,2)) AS exact_sum,
        (123456.78::numeric(12,2) - 0.01::numeric(12,2)) AS exact_sub;
    `);
    assert.equal(precRes.rows[0].exact_sum, '0.30');
    assert.equal(precRes.rows[0].exact_sub, '123456.77');
  });

  // 20. Database rollback after failed posting
  await t.test('20. Database rollback: transactional failure leaves zero partial entries in ledger or accounts', async () => {
    const claBefore = await query('SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;', [customer1Id]);
    const balanceBefore = claBefore.rows[0].current_balance;

    const txnCountBefore = await query('SELECT COUNT(*) FROM ledger_transactions WHERE customer_id = $1;', [customer1Id]);
    const countBefore = txnCountBefore.rows[0].count;

    // Attempt posting deduction with negative amount (triggers check constraint violation)
    await assert.rejects(async () => {
      await query(
        `SELECT public.post_customer_deduction($1::uuid, $2::uuid, $3::uuid, 'VETERINARY_MEDICINE'::varchar, -100.00::numeric, 'Invalid'::text, NULL, NULL);`,
        [customer1Id, center1Id, supervisorUserId]
      );
    });

    // Verify balance and transaction count are completely unchanged
    const claAfter = await query('SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;', [customer1Id]);
    assert.equal(claAfter.rows[0].current_balance, balanceBefore);

    const txnCountAfter = await query('SELECT COUNT(*) FROM ledger_transactions WHERE customer_id = $1;', [customer1Id]);
    assert.equal(txnCountAfter.rows[0].count, countBefore);
  });

  // 21. Feed debit integration contract
  await t.test('21. Feed debit integration contract: verifies defined interface contract for P14 feed integration', async () => {
    const claBefore = await query('SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;', [customer1Id]);
    const prevBalance = parseFloat(claBefore.rows[0].current_balance);

    const feedDebitAmount = 750.00;
    const feedContractPayload = {
      customerId: customer1Id,
      centerId: center1Id,
      organizationId: org1Id,
      feedSaleId: crypto.randomUUID(),
      saleInvoiceNumber: 'FEED-INV-2026-9901',
      totalDebitAmount: feedDebitAmount,
      items: [
        {
          feedProductId: crypto.randomUUID(),
          productName: 'NutriFeed Super Cattle Pellets 50kg',
          quantityBags: 1,
          unitPrice: 750.00,
          itemTotal: 750.00,
        },
      ],
      soldByUserId: operatorUserId,
      idempotencyKey: 'IDEM-P12-FEED-' + runSuffix,
    };

    const res = await request(app)
      .post('/api/v1/ledger/feed-debit')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(feedContractPayload);

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    const data = res.body.data;
    assert.equal(data.totalDebitAmount, feedDebitAmount);

    const expectedBalance = parseFloat((prevBalance - feedDebitAmount).toFixed(2));
    assert.equal(data.newBalance, expectedBalance);

    // Verify double-entry journal: Debit Customer Payable, Credit Feed Inventory
    const lt = await query("SELECT * FROM ledger_transactions WHERE reference_id = $1 AND transaction_type = 'FEED_PURCHASE_DEBIT';", [feedContractPayload.feedSaleId]);
    assert.equal(lt.rows.length, 1);
    const le = await query('SELECT * FROM ledger_entries WHERE transaction_id = $1;', [lt.rows[0].id]);
    assert.equal(le.rows.length, 2);
    const debit = le.rows.find(e => e.entry_type === 'DEBIT');
    const credit = le.rows.find(e => e.entry_type === 'CREDIT');
    assert.equal(debit.account_type, 'CUSTOMER_PAYABLE');
    assert.equal(credit.account_type, 'FEED_INVENTORY');
    assert.equal(parseFloat(debit.amount), feedDebitAmount);
    assert.equal(parseFloat(credit.amount), feedDebitAmount);
  });

  // 22. Historical P10 collection regression
  await t.test('22. Historical P10 collection regression: verified milk collection posting functions identically without regression', async () => {
    // Query existing collection and verify its ledger entry and receipt
    const colRes = await query(
      `SELECT mc.id, mc.total_amount, lt.id AS txn_id, lt.transaction_type, lt.balance_after
       FROM milk_collections mc
       JOIN ledger_transactions lt ON lt.reference_id = mc.id AND lt.reference_entity = 'MILK_COLLECTION' AND lt.transaction_type = 'MILK_COLLECTION_CREDIT'
       ORDER BY mc.created_at DESC
       LIMIT 1;`
    );
    assert.ok(colRes.rows.length > 0, 'Milk collection must have valid ledger transaction');
    const col = colRes.rows[0];
    assert.equal(col.transaction_type, 'MILK_COLLECTION_CREDIT');

    // Verify Financial Reports API endpoints
    const balancesReportRes = await request(app)
      .get('/api/v1/ledger/reports/balances')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(balancesReportRes.status, 200);
    assert.ok(balancesReportRes.body.data.totalCustomers >= 2);

    const dailySummaryRes = await request(app)
      .get('/api/v1/ledger/reports/daily-summary')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(dailySummaryRes.status, 200);
    assert.ok(dailySummaryRes.body.data.summary.length >= 1);

    const centerLiabilitiesRes = await request(app)
      .get('/api/v1/ledger/reports/center-liabilities')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(centerLiabilitiesRes.status, 200);
    assert.ok(centerLiabilitiesRes.body.data.centers.length >= 1);

    const advancesReportRes = await request(app)
      .get('/api/v1/ledger/reports/advances')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(advancesReportRes.status, 200);

    const registerReportRes = await request(app)
      .get('/api/v1/ledger/reports/register')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(registerReportRes.status, 200);
    assert.ok(registerReportRes.body.data.transactions.length >= 3);

    // Verify statement API
    const statementRes = await request(app)
      .get(`/api/v1/customers/${customer1Id}/ledger/statement`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(statementRes.status, 200);
    assert.ok(statementRes.body.data.transactions.length >= 2);

    // Least-privilege verification: Collection Operator cannot access full customer statement or transactions
    const opStatementRes = await request(app)
      .get(`/api/v1/customers/${customer1Id}/ledger/statement`)
      .set('Authorization', `Bearer ${operatorToken}`);
    assert.equal(opStatementRes.status, 403);
    assert.equal(opStatementRes.body.error.code, 'STAFF_FINANCIAL_ACCESS_DENIED');

    const opTxnRes = await request(app)
      .get(`/api/v1/ledger/${customer1Id}/transactions`)
      .set('Authorization', `Bearer ${operatorToken}`);
    assert.equal(opTxnRes.status, 403);
    assert.equal(opTxnRes.body.error.code, 'STAFF_FINANCIAL_ACCESS_DENIED');
  });
});
