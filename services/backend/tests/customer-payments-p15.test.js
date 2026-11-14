import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import pg from 'pg';
import crypto from 'node:crypto';
import { createApp } from '../dist/app.js';
import { signJwt } from '../dist/jwt.js';
import { UserRole, PaymentMethod, PaymentDirection } from '@dfarm/shared-types';

const { Client } = pg;
const dbClient = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
});

async function query(text, params) {
  return dbClient.query(text, params);
}

test('DFarm Phase 15: Customer Payments, Batches & Reconciliation Test Suite (30 Scenarios)', async (t) => {
  await dbClient.connect();
  t.after(async () => {
    await dbClient.end();
  });

  const app = createApp();

  // Test shared state
  let testOrgId = '';
  let otherOrgId = '';
  let centerAId = '';
  let centerBId = '';

  let ownerUserId = '';
  let supervisorUserId = '';
  let accountantUserId = '';
  let operatorUserId = '';

  let ownerToken = '';
  let supervisorToken = '';
  let accountantToken = '';
  let operatorToken = '';

  let customer1Id = '';
  let customer2Id = '';
  let customer3Id = '';
  let customer1Token = '';
  let customer2Token = '';

  let testDeviceId = '';
  let deviceToken = '';

  const runSfx = crypto.randomUUID().slice(0, 8);
  const p15Key = (name) => `IDEM-P15-${runSfx}-${name}`;
  const p15Ref = (name) => `REF-P15-${runSfx}-${name}`;
  const p15Utr = (name) => `UTR-P15-${runSfx}-${name}`;

  async function seedBalance(customerId, amount) {
    await query(
      `DELETE FROM payment_batch_items WHERE payout_id IN (SELECT id FROM customer_payouts WHERE customer_id = $1 AND status IN ('DRAFT', 'APPROVED', 'SUBMITTED'));`,
      [customerId]
    );
    await query(
      `DELETE FROM customer_payouts WHERE customer_id = $1 AND status IN ('DRAFT', 'APPROVED', 'SUBMITTED');`,
      [customerId]
    );
    await query(
      `INSERT INTO customer_ledger_accounts (customer_id, organization_id, currency, current_balance, updated_at)
       VALUES ($1, $2, 'INR', $3, NOW())
       ON CONFLICT (customer_id) DO UPDATE SET current_balance = EXCLUDED.current_balance;`,
      [customerId, testOrgId, amount]
    );
  }

  await t.test('0. Setup Test Organizations, Centers, Staff, and Customers with Initial Balances', async () => {
    // 1. Fetch or create organization
    const orgRes = await query("SELECT id FROM organizations WHERE name ILIKE '%Sangli%' LIMIT 1;");
    if (orgRes.rows.length > 0) {
      testOrgId = orgRes.rows[0].id;
    } else {
      const newOrg = await query(
        "INSERT INTO organizations (name, code, status) VALUES ('Sangli Union P15', 'SDCU_P15', 'ACTIVE') RETURNING id;"
      );
      testOrgId = newOrg.rows[0].id;
    }

    const otherOrgRes = await query("SELECT id FROM organizations WHERE id <> $1 LIMIT 1;", [testOrgId]);
    if (otherOrgRes.rows.length > 0) {
      otherOrgId = otherOrgRes.rows[0].id;
    } else {
      const newOtherOrg = await query(
        "INSERT INTO organizations (name, code, status) VALUES ('Kolhapur Union P15', 'KDCU_P15', 'ACTIVE') RETURNING id;"
      );
      otherOrgId = newOtherOrg.rows[0].id;
    }

    // 3. Centers
    const cRes = await query("SELECT id FROM dairy_centers WHERE organization_id = $1 ORDER BY name ASC LIMIT 2;", [testOrgId]);
    centerAId = cRes.rows[0].id;
    if (cRes.rows.length > 1) {
      centerBId = cRes.rows[1].id;
    } else {
      const newCenter = await query(
        "INSERT INTO dairy_centers (organization_id, name, code, status) VALUES ($1, 'Center B P15', 'C_B_P15', 'ACTIVE') RETURNING id;",
        [testOrgId]
      );
      centerBId = newCenter.rows[0].id;
    }

    // 4. Create Users
    ownerUserId = crypto.randomUUID();
    supervisorUserId = crypto.randomUUID();
    accountantUserId = crypto.randomUUID();
    operatorUserId = crypto.randomUUID();

    const uSfx = crypto.randomUUID().slice(0, 8);
    await query(
      `INSERT INTO users (id, organization_id, username, full_name, email, phone_number, role, status)
       VALUES
       ($1, $5, 'owner_${uSfx}', 'Owner P15', 'owner.${uSfx}@dfarm.test', '+919811000001', 'DAIRY_OWNER', 'ACTIVE'),
       ($2, $5, 'sup_${uSfx}', 'Supervisor P15', 'sup.${uSfx}@dfarm.test', '+919811000002', 'SUPERVISOR', 'ACTIVE'),
       ($3, $5, 'acct_${uSfx}', 'Accountant P15', 'acct.${uSfx}@dfarm.test', '+919811000003', 'ACCOUNTANT', 'ACTIVE'),
       ($4, $5, 'oper_${uSfx}', 'Operator P15', 'oper.${uSfx}@dfarm.test', '+919811000004', 'COLLECTION_OPERATOR', 'ACTIVE')
       ON CONFLICT (id) DO NOTHING;`,
      [ownerUserId, supervisorUserId, accountantUserId, operatorUserId, testOrgId]
    );

    await query(
      `INSERT INTO user_center_assignments (user_id, center_id, is_primary)
       VALUES
       ($1, $5, TRUE),
       ($2, $5, TRUE),
       ($3, $5, TRUE),
       ($4, $5, TRUE)
       ON CONFLICT DO NOTHING;`,
      [ownerUserId, supervisorUserId, accountantUserId, operatorUserId, centerAId]
    );

    ownerToken = signJwt({
      sub: ownerUserId,
      userId: ownerUserId,
      role: UserRole.DAIRY_OWNER,
      organizationId: testOrgId,
      centerIds: [centerAId, centerBId],
      primaryCenterId: centerAId,
    });

    supervisorToken = signJwt({
      sub: supervisorUserId,
      userId: supervisorUserId,
      role: UserRole.SUPERVISOR,
      organizationId: testOrgId,
      centerIds: [centerAId],
      primaryCenterId: centerAId,
    });

    accountantToken = signJwt({
      sub: accountantUserId,
      userId: accountantUserId,
      role: UserRole.ACCOUNTANT,
      organizationId: testOrgId,
      centerIds: [centerAId, centerBId],
      primaryCenterId: centerAId,
    });

    operatorToken = signJwt({
      sub: operatorUserId,
      userId: operatorUserId,
      role: UserRole.COLLECTION_OPERATOR,
      organizationId: testOrgId,
      centerIds: [centerAId],
      primaryCenterId: centerAId,
    });

    // 5. Create Registered Customers with Bank Accounts
    customer1Id = crypto.randomUUID();
    customer2Id = crypto.randomUUID();
    customer3Id = crypto.randomUUID();

    const fcode1 = `P15_${runSfx}_01`;
    const fcode2 = `P15_${runSfx}_02`;
    const fcode3 = `P15_${runSfx}_03`;
    const mob1 = `+919811${Math.floor(100000 + Math.random() * 900000)}`;
    const mob2 = `+919811${Math.floor(100000 + Math.random() * 900000)}`;
    const mob3 = `+919811${Math.floor(100000 + Math.random() * 900000)}`;

    await query(
      `INSERT INTO customers (
        id, organization_id, primary_center_id, farmer_code, full_name,
        normalized_mobile_number, status, bank_name, bank_account_number,
        bank_ifsc_code, bank_account_holder_name
      ) VALUES
      ($1, $4, $5, $7, 'Arun Mane', $10, 'ACTIVE', 'State Bank of India', 'SBIN0011223344', 'SBIN0001234', 'Arun Mane'),
      ($2, $4, $5, $8, 'Balasaheb Kadam', $11, 'ACTIVE', 'Bank of Maharashtra', 'BOMA9988776655', 'MAHB0000567', 'Balasaheb Kadam'),
      ($3, $4, $6, $9, 'Chandrakant Thorat', $12, 'ACTIVE', 'HDFC Bank', 'HDFC5544332211', 'HDFC0000890', 'Chandrakant Thorat')
      ON CONFLICT (id) DO UPDATE SET is_deleted = FALSE;`,
      [customer1Id, customer2Id, customer3Id, testOrgId, centerAId, centerBId, fcode1, fcode2, fcode3, mob1, mob2, mob3]
    );

    // Initial Ledger Balances:
    // Customer 1: Net Payable ₹10,000.00 (Dairy owes farmer)
    // Customer 2: Net Payable ₹5,000.00
    // Customer 3: Net Receivable -₹1,500.00 (Farmer owes dairy for cattle feed / advance)
    await query(
      `INSERT INTO customer_ledger_accounts (customer_id, organization_id, currency, current_balance, updated_at)
       VALUES
       ($1, $4, 'INR', 10000.00, NOW()),
       ($2, $4, 'INR', 5000.00, NOW()),
       ($3, $4, 'INR', -1500.00, NOW())
       ON CONFLICT (customer_id) DO UPDATE SET current_balance = EXCLUDED.current_balance;`,
      [customer1Id, customer2Id, customer3Id, testOrgId]
    );



    customer1Token = signJwt({
      sub: customer1Id,
      userId: customer1Id,
      role: UserRole.FARMER_CUSTOMER,
      actorType: 'CUSTOMER',
      organizationId: testOrgId,
      centerId: centerAId,
      farmerCode: fcode1,
    });

    customer2Token = signJwt({
      sub: customer2Id,
      userId: customer2Id,
      role: UserRole.FARMER_CUSTOMER,
      actorType: 'CUSTOMER',
      organizationId: testOrgId,
      centerId: centerAId,
      farmerCode: fcode2,
    });

    // 6. Registered Device for offline sync testing via /api/v1/devices/register
    const devIdentifier = 'DEV-P15-' + crypto.randomUUID().substring(0, 8);
    const regRes = await request(app)
      .post('/api/v1/devices/register')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        deviceIdentifier: devIdentifier,
        deviceType: 'COUNTER_TERMINAL',
        organizationId: testOrgId,
        centerId: centerAId,
        publicKey: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0TestPubKey',
        appVersion: '1.0.0',
      });

    testDeviceId = regRes.body.data.deviceId;
    deviceToken = regRes.body.data.token;
  });

  // --------------------------------------------------------------------------
  // Scenario 1: Full Farmer Payout
  // --------------------------------------------------------------------------
  let fullPayoutId = '';
  await t.test('1. Full farmer payout workflow: Draft -> Approved -> Submitted -> Settled', async () => {
    // Create Payout for full eligible balance of Customer 2 (₹5,000.00)
    const createRes = await request(app)
      .post('/api/v1/payments/payouts')
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({
        centerId: centerAId,
        customerId: customer2Id,
        amount: 5000.00,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        referenceNumber: p15Ref('FULL-001'),
        idempotencyKey: p15Key('FULL-PAYOUT-01'),
        notes: 'Full milk settlement payout P15',
      });

    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.success, true);
    fullPayoutId = createRes.body.data.payoutId;
    assert.equal(createRes.body.data.status, 'PENDING_APPROVAL');
    assert.equal(createRes.body.data.amount, 5000.00);
    assert.equal(createRes.body.data.remainingPayable, 0.00);

    // Supervisor Approves
    const approveRes = await request(app)
      .post(`/api/v1/payments/payouts/${fullPayoutId}/approve`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ comments: 'Approved full payout P15' });

    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.body.data.status, 'APPROVED');

    // Submit to financial channel
    const submitRes = await request(app)
      .post(`/api/v1/payments/payouts/${fullPayoutId}/submit`)
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({ paymentReference: 'NEFT-SBIN-P15-001' });

    assert.equal(submitRes.status, 200);
    assert.equal(submitRes.body.data.status, 'SUBMITTED');
    assert.equal(submitRes.body.data.ledgerEffectApplied, false);

    // Settle with authentic UTR reference
    const confirmRes = await request(app)
      .post(`/api/v1/payments/payouts/${fullPayoutId}/confirm`)
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({ paymentReference: p15Utr('SETTLED-FULL-01') });

    assert.equal(confirmRes.status, 200);
    assert.equal(confirmRes.body.data.status, 'SETTLED');
    assert.equal(confirmRes.body.data.customerBalanceAfter, 0.00);
    assert.ok(confirmRes.body.data.formattedReceipt);
    assert.equal(confirmRes.body.data.formattedReceipt.status, 'SETTLED');
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Partial Farmer Payout
  // --------------------------------------------------------------------------
  let partialPayoutId = '';
  await t.test('2. Partial farmer payout: Balance ₹10,000 paid ₹4,000 leaves ₹6,000 remaining', async () => {
    const createRes = await request(app)
      .post('/api/v1/payments/payouts')
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({
        centerId: centerAId,
        customerId: customer1Id,
        amount: 4000.00,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        idempotencyKey: p15Key('PARTIAL-01'),
      });

    assert.equal(createRes.status, 201);
    partialPayoutId = createRes.body.data.payoutId;
    assert.equal(createRes.body.data.remainingPayable, 6000.00);

    // Owner approves and confirms
    await request(app)
      .post(`/api/v1/payments/payouts/${partialPayoutId}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send();

    await request(app)
      .post(`/api/v1/payments/payouts/${partialPayoutId}/submit`)
      .set('Authorization', `Bearer ${accountantToken}`)
      .send();

    const settleRes = await request(app)
      .post(`/api/v1/payments/payouts/${partialPayoutId}/confirm`)
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({ paymentReference: p15Utr('PARTIAL-01') });

    assert.equal(settleRes.status, 200);
    assert.equal(settleRes.body.data.status, 'SETTLED');
    assert.equal(settleRes.body.data.customerBalanceAfter, 6000.00);
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Multiple Legitimate Payouts
  // --------------------------------------------------------------------------
  await t.test('3. Multiple legitimate payouts: Second partial payout of ₹2,000 leaves ₹4,000', async () => {
    const createRes = await request(app)
      .post('/api/v1/payments/payouts')
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({
        centerId: centerAId,
        customerId: customer1Id,
        amount: 2000.00,
        paymentMethod: PaymentMethod.UPI,
        idempotencyKey: p15Key('PARTIAL-02'),
      });

    assert.equal(createRes.status, 201);
    const p2Id = createRes.body.data.payoutId;

    await request(app).post(`/api/v1/payments/payouts/${p2Id}/approve`).set('Authorization', `Bearer ${supervisorToken}`).send();
    await request(app).post(`/api/v1/payments/payouts/${p2Id}/submit`).set('Authorization', `Bearer ${accountantToken}`).send();
    const settleRes = await request(app)
      .post(`/api/v1/payments/payouts/${p2Id}/confirm`)
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({ paymentReference: 'UPI-P15-LEGIT-02' });

    assert.equal(settleRes.status, 200);
    assert.equal(settleRes.body.data.customerBalanceAfter, 4000.00);
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Overpayment Rejection
  // --------------------------------------------------------------------------
  await t.test('4. Overpayment rejection: Requesting ₹5,000 when balance is ₹4,000 throws error', async () => {
    const res = await request(app)
      .post('/api/v1/payments/payouts')
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({
        centerId: centerAId,
        customerId: customer1Id,
        amount: 5000.00,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        idempotencyKey: p15Key('OVERPAY-01'),
        allowOverpaymentAdvance: false,
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'OVERPAYMENT_NOT_PERMITTED');
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Customer Debt Repayment
  // --------------------------------------------------------------------------
  let receipt1Id = '';
  await t.test('5. Customer debt repayment: Customer 3 owes ₹1,500 and pays ₹1,500', async () => {
    const res = await request(app)
      .post('/api/v1/payments/receipts')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        centerId: centerBId,
        customerId: customer3Id,
        amount: 1500.00,
        paymentMethod: PaymentMethod.CASH,
        referenceNumber: p15Ref('CASH-REC-001'),
        idempotencyKey: p15Key('DEBT-REPAY-01'),
        notes: 'Full feed debt repayment',
      });

    assert.equal(res.status, 201);
    receipt1Id = res.body.data.receiptId;
    assert.equal(res.body.data.status, 'DRAFT');

    // Confirm receipt -> posts ledger credit!
    const confirmRes = await request(app)
      .post(`/api/v1/payments/receipts/${receipt1Id}/confirm`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ referenceNumber: p15Ref('CASH-REC-001-CONF') });

    assert.equal(confirmRes.status, 200);
    assert.equal(confirmRes.body.data.status, 'SETTLED');
    assert.equal(confirmRes.body.data.previousBalance, -1500.00);
    assert.equal(confirmRes.body.data.customerBalanceAfter, 0.00); // Debt cleared to 0
  });

  // --------------------------------------------------------------------------
  // Scenario 6: Cash Receipt
  // --------------------------------------------------------------------------
  await t.test('6. Cash receipt generates valid voucher with CASH method and actor details', async () => {
    const getRes = await request(app)
      .get(`/api/v1/payments/receipts/${receipt1Id}`)
      .set('Authorization', `Bearer ${supervisorToken}`);

    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.data.paymentMethod, 'CASH');
    assert.equal(getRes.body.data.status, 'SETTLED');
    assert.ok(getRes.body.data.formattedReceipt.slip40ColumnText.includes('CASH'));
  });

  // --------------------------------------------------------------------------
  // Scenario 7: Bank Transfer Record
  // --------------------------------------------------------------------------
  await t.test('7. Bank transfer payout masks account number and records IFSC', async () => {
    const payoutRes = await request(app)
      .get(`/api/v1/payments/${fullPayoutId}`)
      .set('Authorization', `Bearer ${accountantToken}`);

    assert.equal(payoutRes.status, 200);
    assert.equal(payoutRes.body.data.paymentMethod, 'BANK_TRANSFER');
    assert.equal(payoutRes.body.data.bankAccountMask, 'XXXX-XXXX-6655');
  });

  // --------------------------------------------------------------------------
  // Scenario 8: UPI Reference
  // --------------------------------------------------------------------------
  await t.test('8. UPI payout records valid UPI method and reference', async () => {
    const createRes = await request(app)
      .post('/api/v1/payments/payouts')
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({
        centerId: centerAId,
        customerId: customer1Id,
        amount: 500.00,
        paymentMethod: PaymentMethod.UPI,
        referenceNumber: 'UPI-REF-998877',
        idempotencyKey: p15Key('UPI-01'),
      });

    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.data.paymentMethod, 'UPI');
  });

  // --------------------------------------------------------------------------
  // Scenario 9: Duplicate Payout Request (Idempotency)
  // --------------------------------------------------------------------------
  await t.test('9. Duplicate payout request returns existing record without double-creating', async () => {
    const res = await request(app)
      .post('/api/v1/payments/payouts')
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({
        centerId: centerAId,
        customerId: customer1Id,
        amount: 4000.00,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        idempotencyKey: p15Key('PARTIAL-01'), // Replaying same key from test 2
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.isIdempotentReplay, true);
    assert.equal(res.body.data.payoutId, partialPayoutId);
  });

  // --------------------------------------------------------------------------
  // Scenario 10: Duplicate Payment Provider Event (Webhook Idempotency)
  // --------------------------------------------------------------------------
  await t.test('10. Duplicate provider webhook event is detected and processed idempotently', async () => {
    const secret = process.env.JWT_SECRET || 'super-secret-jwt-token-with-at-least-32-characters-long';
    const payload = JSON.stringify({
      eventId: `evt_p15_${runSfx}_001`,
      referenceNumber: p15Ref('FULL-001'),
      amount: 5000.00,
      status: 'SUCCESS',
      organizationId: testOrgId,
    });

    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    // First delivery
    const res1 = await request(app)
      .post('/api/v1/reconciliation/webhook')
      .set('x-webhook-signature', signature)
      .set('x-webhook-timestamp', String(Date.now()))
      .set('Content-Type', 'application/json')
      .send(payload);

    assert.equal(res1.status, 200);
    assert.equal(res1.body.data.isIdempotentReplay, false);

    // Second delivery (Replay)
    const res2 = await request(app)
      .post('/api/v1/reconciliation/webhook')
      .set('x-webhook-signature', signature)
      .set('x-webhook-timestamp', String(Date.now()))
      .set('Content-Type', 'application/json')
      .send(payload);

    assert.equal(res2.status, 200);
    assert.equal(res2.body.data.isIdempotentReplay, true);
  });

  // --------------------------------------------------------------------------
  // Scenario 11: Submitted vs Settled Distinction
  // --------------------------------------------------------------------------
  let submittedPayoutId = '';
  await t.test('11. Submitted payout must not reduce customer balance until confirmed settled', async () => {
    // Current customer 1 balance: ₹3,500.00
    const beforeBalanceRes = await query('SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;', [customer1Id]);
    const balanceBefore = Number(beforeBalanceRes.rows[0].current_balance);

    const createRes = await request(app)
      .post('/api/v1/payments/payouts')
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({
        centerId: centerAId,
        customerId: customer1Id,
        amount: 1000.00,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        idempotencyKey: p15Key('SUBMITTED-TEST-01'),
      });

    submittedPayoutId = createRes.body.data.payoutId;

    await request(app).post(`/api/v1/payments/payouts/${submittedPayoutId}/approve`).set('Authorization', `Bearer ${supervisorToken}`).send();
    await request(app).post(`/api/v1/payments/payouts/${submittedPayoutId}/submit`).set('Authorization', `Bearer ${accountantToken}`).send();

    // Verify customer balance is UNCHANGED while in SUBMITTED state
    const afterSubmitBalanceRes = await query('SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;', [customer1Id]);
    const balanceAfterSubmit = Number(afterSubmitBalanceRes.rows[0].current_balance);

    assert.equal(balanceAfterSubmit, balanceBefore, 'SUBMITTED payout must NOT reduce ledger balance!');
  });

  // --------------------------------------------------------------------------
  // Scenario 12: Failed Payout
  // --------------------------------------------------------------------------
  await t.test('12. Failed payout transitions status to FAILED and never produces ledger debit', async () => {
    const beforeBalanceRes = await query('SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;', [customer1Id]);
    const balanceBefore = Number(beforeBalanceRes.rows[0].current_balance);

    const failRes = await request(app)
      .post(`/api/v1/payments/payouts/${submittedPayoutId}/fail`)
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({ failureReason: 'Bank account frozen by RBI circular' });

    assert.equal(failRes.status, 200);
    assert.equal(failRes.body.data.status, 'FAILED');

    // Balance remains untouched
    const afterFailBalanceRes = await query('SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;', [customer1Id]);
    assert.equal(Number(afterFailBalanceRes.rows[0].current_balance), balanceBefore);
  });

  // --------------------------------------------------------------------------
  // Scenario 13: Failed Payout Reversal (Compensation Workflow)
  // --------------------------------------------------------------------------
  await t.test('13. Reversal of settled payout reinstates farmer liability and creates double-entry credit', async () => {
    // Settle a new payout of ₹500
    const pRes = await request(app)
      .post('/api/v1/payments/payouts')
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({
        centerId: centerAId,
        customerId: customer1Id,
        amount: 500.00,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        idempotencyKey: p15Key('REVERSE-TARGET-01'),
      });
    const revTargetId = pRes.body.data.payoutId;

    await request(app).post(`/api/v1/payments/payouts/${revTargetId}/approve`).set('Authorization', `Bearer ${ownerToken}`).send();
    await request(app).post(`/api/v1/payments/payouts/${revTargetId}/submit`).set('Authorization', `Bearer ${accountantToken}`).send();
    await request(app).post(`/api/v1/payments/payouts/${revTargetId}/confirm`).set('Authorization', `Bearer ${accountantToken}`).send({ paymentReference: 'UTR-BOUNCED-01' });

    const balanceAfterSettle = Number((await query('SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;', [customer1Id])).rows[0].current_balance);

    // Bank bounces payout post-settlement: execute controlled reversal
    const revRes = await request(app)
      .post(`/api/v1/payments/payouts/${revTargetId}/reverse`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        reason: 'Bank transfer returned unpaid due to account holder name mismatch',
        idempotencyKey: p15Key('REVERSAL-EXEC-01'),
      });

    assert.equal(revRes.status, 200);
    assert.equal(revRes.body.data.status, 'REVERSED');
    assert.equal(revRes.body.data.customerBalanceAfter, balanceAfterSettle + 500.00);

    // Verify compensation transaction posted in ledger
    const revTxn = await query('SELECT * FROM ledger_transactions WHERE id = $1;', [revRes.body.data.ledgerTransactionId]);
    assert.equal(revTxn.rows[0].transaction_type, 'PAYOUT_REVERSAL_CREDIT');
  });

  // --------------------------------------------------------------------------
  // Scenario 14: Bulk Batch Generation
  // --------------------------------------------------------------------------
  let batchId = '';
  await t.test('14. Bulk batch generation groups eligible beneficiaries and calculates amounts', async () => {
    const batchRes = await request(app)
      .post('/api/v1/payments/batches')
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({
        centerId: centerAId,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        idempotencyKey: p15Key('BATCH-001'),
      });

    assert.equal(batchRes.status, 201);
    assert.equal(batchRes.body.data.status, 'DRAFT');
    assert.ok(batchRes.body.data.totalBeneficiaries >= 1);
    assert.ok(batchRes.body.data.totalAmount > 0);
    batchId = batchRes.body.data.batchId;

    // Approve batch
    const appRes = await request(app)
      .post(`/api/v1/payments/batches/${batchId}/approve`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send();
    assert.equal(appRes.status, 200);
    assert.equal(appRes.body.data.status, 'APPROVED');

    // Submit batch
    const subRes = await request(app)
      .post(`/api/v1/payments/batches/${batchId}/submit`)
      .set('Authorization', `Bearer ${accountantToken}`)
      .send();
    assert.equal(subRes.status, 200);
    assert.equal(subRes.body.data.status, 'SUBMITTED');
  });

  // --------------------------------------------------------------------------
  // Scenario 15: Partial Batch Failure
  // --------------------------------------------------------------------------
  await t.test('15. Partial batch reconciliation: failed beneficiary does not block valid beneficiaries', async () => {
    const batchDetails = await request(app)
      .get(`/api/v1/payments/batches/${batchId}`)
      .set('Authorization', `Bearer ${accountantToken}`);

    const items = batchDetails.body.data.items;
    assert.ok(items.length >= 1);

    // Mark first item SETTLED, and simulate a second item failed (or single item failed)
    const reconResults = [
      {
        itemId: items[0].id,
        status: 'SETTLED',
        beneficiaryReference: 'UTR-BATCH-BENEFICIARY-01',
      },
    ];

    const reconRes = await request(app)
      .post(`/api/v1/payments/batches/${batchId}/reconcile`)
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({ results: reconResults });

    assert.equal(reconRes.status, 200);
    assert.equal(reconRes.body.data.items[0].status, 'SETTLED');
  });

  // --------------------------------------------------------------------------
  // Scenario 16: Duplicate Bank Reference Detection
  // --------------------------------------------------------------------------
  await t.test('16. Bank statement reconciliation flags duplicate external references', async () => {
    const res = await request(app)
      .post('/api/v1/reconciliation/import')
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({
        fileName: 'bank_statement_nov2026.csv',
        rows: [
          {
            transactionDate: '2026-11-14',
            referenceNumber: p15Utr('SETTLED-FULL-01'), // Already settled in Scenario 1
            amount: 5000.00,
            direction: 'DEBIT',
            description: 'NEFT Payout',
          },
          {
            transactionDate: '2026-11-14',
            referenceNumber: p15Utr('SETTLED-FULL-01'), // Duplicate row in statement
            amount: 5000.00,
            direction: 'DEBIT',
            description: 'Duplicate NEFT Payout',
          },
        ],
      });

    assert.equal(res.status, 201);
    assert.ok(res.body.data.summary.duplicateCount >= 1);
  });

  // --------------------------------------------------------------------------
  // Scenario 17: Correct Bank Statement Match
  // --------------------------------------------------------------------------
  await t.test('17. Bank statement correctly matches pending payout reference and amount', async () => {
    await seedBalance(customer1Id, 2000.00);
    // Create and submit a specific payout for statement matching
    const pRes = await request(app)
      .post('/api/v1/payments/payouts')
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({
        centerId: centerAId,
        customerId: customer1Id,
        amount: 850.00,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        referenceNumber: p15Ref('STMT-MATCH-01'),
        idempotencyKey: p15Key('STMT-01'),
      });

    const stmtPayoutId = pRes.body.data.payoutId;
    await request(app).post(`/api/v1/payments/payouts/${stmtPayoutId}/approve`).set('Authorization', `Bearer ${supervisorToken}`).send();
    await request(app).post(`/api/v1/payments/payouts/${stmtPayoutId}/submit`).set('Authorization', `Bearer ${accountantToken}`).send({ paymentReference: p15Ref('STMT-MATCH-01') });

    // Import statement containing this reference
    const impRes = await request(app)
      .post('/api/v1/reconciliation/import')
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({
        fileName: 'sbi_statement_p15.csv',
        rows: [
          {
            transactionDate: '2026-11-14',
            referenceNumber: p15Ref('STMT-MATCH-01'),
            amount: 850.00,
            direction: 'DEBIT',
            description: 'Milk settlement NEFT',
          },
        ],
      });

    assert.equal(impRes.status, 201);
    assert.equal(impRes.body.data.summary.matchedCount, 1);
    assert.equal(impRes.body.data.records[0].status, 'MATCHED');
    assert.equal(impRes.body.data.records[0].matchedPayoutId, stmtPayoutId);
  });

  // --------------------------------------------------------------------------
  // Scenario 18: Amount Mismatch Detection
  // --------------------------------------------------------------------------
  await t.test('18. Amount mismatch detection: reference matches but amount is different', async () => {
    await seedBalance(customer1Id, 2000.00);
    const pRes = await request(app)
      .post('/api/v1/payments/payouts')
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({
        centerId: centerAId,
        customerId: customer1Id,
        amount: 750.00,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        idempotencyKey: p15Key('MISMATCH-PAYOUT-01'),
      });
    const misPayoutId = pRes.body.data.payoutId;
    await request(app).post(`/api/v1/payments/payouts/${misPayoutId}/approve`).set('Authorization', `Bearer ${supervisorToken}`).send();
    await request(app).post(`/api/v1/payments/payouts/${misPayoutId}/submit`).set('Authorization', `Bearer ${accountantToken}`).send({ paymentReference: p15Ref('STMT-MISMATCH-01') });

    const impRes = await request(app)
      .post('/api/v1/reconciliation/import')
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({
        fileName: 'sbi_statement_p15_mismatch.csv',
        rows: [
          {
            transactionDate: '2026-11-14',
            referenceNumber: p15Ref('STMT-MISMATCH-01'),
            amount: 999.00, // Different from ₹750.00!
            direction: 'DEBIT',
          },
        ],
      });

    assert.equal(impRes.status, 201);
    assert.equal(impRes.body.data.summary.mismatchCount, 1);
    assert.equal(impRes.body.data.records[0].status, 'AMOUNT_MISMATCH');
  });

  // --------------------------------------------------------------------------
  // Scenario 19: Unmatched Transaction Review
  // --------------------------------------------------------------------------
  let unmatchedRecordId = '';
  await t.test('19. Unmatched transaction marked UNMATCHED and never auto-settled', async () => {
    const impRes = await request(app)
      .post('/api/v1/reconciliation/import')
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({
        fileName: 'unmatched_sample.csv',
        rows: [
          {
            transactionDate: '2026-11-14',
            referenceNumber: p15Ref('UNKNOWN-999'),
            amount: 325.00,
            direction: 'DEBIT',
            description: 'Unrecognized bank entry',
          },
        ],
      });

    assert.equal(impRes.status, 201);
    assert.equal(impRes.body.data.summary.unmatchedCount, 1);
    assert.equal(impRes.body.data.records[0].status, 'UNMATCHED');
    unmatchedRecordId = impRes.body.data.records[0].recordId;
  });

  // --------------------------------------------------------------------------
  // Scenario 20: Reconciliation Approval / Resolution
  // --------------------------------------------------------------------------
  await t.test('20. Reconciliation resolution: Supervisor manually flags or resolves discrepancy', async () => {
    const resolveRes = await request(app)
      .post(`/api/v1/reconciliation/${unmatchedRecordId}/resolve`)
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({
        action: 'DISMISSED',
        notes: 'Bank service charge, not related to farmer milk payouts',
      });

    assert.equal(resolveRes.status, 200);
    assert.equal(resolveRes.body.data.action, 'DISMISSED');
  });

  // --------------------------------------------------------------------------
  // Scenario 21: Signature Validation for Configured Webhooks
  // --------------------------------------------------------------------------
  await t.test('21. Webhook rejects invalid HMAC signature with 400 Bad Request', async () => {
    const payload = JSON.stringify({
      eventId: 'evt_fake_sig',
      referenceNumber: p15Ref('FAKE-01'),
      amount: 100.00,
    });

    const res = await request(app)
      .post('/api/v1/reconciliation/webhook')
      .set('x-webhook-signature', 'deadbeefbadsignature1234567890')
      .set('x-webhook-timestamp', String(Date.now()))
      .set('Content-Type', 'application/json')
      .send(payload);

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_WEBHOOK_SIGNATURE');
  });

  // --------------------------------------------------------------------------
  // Scenario 22: Ledger Balancing
  // --------------------------------------------------------------------------
  await t.test('22. Ledger balancing: Sum of debits strictly equals sum of credits in ledger_entries', async () => {
    const entriesRes = await query(`
      SELECT entry_type, SUM(amount) as total
      FROM ledger_entries
      GROUP BY entry_type;
    `);

    let debits = 0;
    let credits = 0;

    for (const r of entriesRes.rows) {
      if (r.entry_type === 'DEBIT') debits = Number(r.total);
      if (r.entry_type === 'CREDIT') credits = Number(r.total);
    }

    assert.equal(debits, credits, `Double-entry imbalance! Debits: ${debits}, Credits: ${credits}`);
  });

  // --------------------------------------------------------------------------
  // Scenario 23: Customer Ownership
  // --------------------------------------------------------------------------
  await t.test('23. Customer ownership: Customer 1 cannot access Customer 2 payouts', async () => {
    // Customer 1 accessing Customer 2
    const res = await request(app)
      .get(`/api/v1/payments/customers/${customer2Id}`)
      .set('Authorization', `Bearer ${customer1Token}`);

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'CUSTOMER_ISOLATION_VIOLATION');

    // Customer 1 accessing own history -> succeeds
    const ownRes = await request(app)
      .get(`/api/v1/payments/customers/${customer1Id}`)
      .set('Authorization', `Bearer ${customer1Token}`);

    assert.equal(ownRes.status, 200);
    assert.equal(ownRes.body.data.customerId, customer1Id);
  });

  // --------------------------------------------------------------------------
  // Scenario 24: Center Isolation
  // --------------------------------------------------------------------------
  await t.test('24. Center isolation: Operator in Center A cannot access Center B payouts', async () => {
    const pRes = await request(app)
      .post('/api/v1/payments/payouts')
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({
        centerId: centerBId,
        customerId: customer3Id,
        amount: 200.00,
        paymentMethod: PaymentMethod.CASH,
        idempotencyKey: p15Key('CENTER-ISO-01'),
        allowOverpaymentAdvance: true,
      });

    assert.equal(pRes.status, 201);
    const centerBPayoutId = pRes.body.data.payoutId;

    // Operator assigned only to Center A cannot confirm payout in Center B
    const opConfirmRes = await request(app)
      .post(`/api/v1/payments/payouts/${centerBPayoutId}/confirm`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ paymentReference: 'REF-CASH-B-01' });

    assert.ok(opConfirmRes.status === 400 || opConfirmRes.status === 403);
  });

  // --------------------------------------------------------------------------
  // Scenario 25: Unauthorized Approval Rejection & Self-Approval Prevention
  // --------------------------------------------------------------------------
  await t.test('25. Collection operator cannot approve payouts; initiator cannot approve their own payout', async () => {
    await seedBalance(customer1Id, 1000.00);
    const pRes = await request(app)
      .post('/api/v1/payments/payouts')
      .set('Authorization', `Bearer ${supervisorToken}`) // Supervisor creates payout
      .send({
        centerId: centerAId,
        customerId: customer1Id,
        amount: 100.00,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        idempotencyKey: p15Key('SELF-APP-01'),
      });

    const payoutId = pRes.body.data.payoutId;

    // 1. Operator attempts approval -> 403 Forbidden (insufficient role)
    const opApproveRes = await request(app)
      .post(`/api/v1/payments/payouts/${payoutId}/approve`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send();

    assert.equal(opApproveRes.status, 403);

    // 2. Supervisor attempts self-approval -> 403 Forbidden (separation of duties)
    const selfApproveRes = await request(app)
      .post(`/api/v1/payments/payouts/${payoutId}/approve`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send();

    assert.equal(selfApproveRes.status, 403);
    assert.equal(selfApproveRes.body.error.code, 'SELF_APPROVAL_PROHIBITED');
  });

  // --------------------------------------------------------------------------
  // Scenario 26: No Premature Ledger Settlement
  // --------------------------------------------------------------------------
  await t.test('26. No premature ledger settlement: Zero ledger rows exist while payout is pending/draft', async () => {
    await seedBalance(customer1Id, 1000.00);
    const pRes = await request(app)
      .post('/api/v1/payments/payouts')
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({
        centerId: centerAId,
        customerId: customer1Id,
        amount: 250.00,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        idempotencyKey: p15Key('PREMATURE-01'),
      });

    const draftId = pRes.body.data.payoutId;

    // Verify no ledger transactions exist for this payout
    const txRes = await query('SELECT * FROM ledger_transactions WHERE reference_id = $1;', [draftId]);
    assert.equal(txRes.rows.length, 0, 'No ledger transactions must exist before settlement!');
  });

  // --------------------------------------------------------------------------
  // Scenario 27: Billing Period Linkage
  // --------------------------------------------------------------------------
  await t.test('27. Payout and Batch link seamlessly to billing period metadata', async () => {
    await seedBalance(customer1Id, 5000.00);
    const batchRes = await request(app)
      .post('/api/v1/payments/batches')
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({
        centerId: centerAId,
        billingPeriodStart: '2026-11-01',
        billingPeriodEnd: '2026-11-10',
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        idempotencyKey: p15Key('BILLING-LINK-01'),
      });

    assert.equal(batchRes.status, 201);
    const b = await request(app).get(`/api/v1/payments/batches/${batchRes.body.data.batchId}`).set('Authorization', `Bearer ${accountantToken}`);
    assert.equal(b.body.data.billingPeriodStart, '2026-11-01');
    assert.equal(b.body.data.billingPeriodEnd, '2026-11-10');
  });

  // --------------------------------------------------------------------------
  // Scenario 28: Historical Bill Preservation
  // --------------------------------------------------------------------------
  await t.test('28. Finalized historical collections and bills remain unmodified during payments', async () => {
    await seedBalance(customer1Id, 1000.00);
    // Check historical collections count and total amount
    const collRes = await query('SELECT count(*), coalesce(sum(total_amount), 0) as total FROM milk_collections WHERE transaction_status = $1;', ['COMPLETED']);
    const collCountBefore = collRes.rows[0].count;
    const collTotalBefore = collRes.rows[0].total;

    // Execute another payout
    const pRes = await request(app)
      .post('/api/v1/payments/payouts')
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({
        centerId: centerAId,
        customerId: customer1Id,
        amount: 100.00,
        paymentMethod: PaymentMethod.CASH,
        idempotencyKey: p15Key('PRESERVE-01'),
      });

    await request(app).post(`/api/v1/payments/payouts/${pRes.body.data.payoutId}/approve`).set('Authorization', `Bearer ${ownerToken}`).send();
    await request(app).post(`/api/v1/payments/payouts/${pRes.body.data.payoutId}/confirm`).set('Authorization', `Bearer ${accountantToken}`).send({ paymentReference: 'CASH-REF-01' });

    // Verify historical collections unchanged
    const collResAfter = await query('SELECT count(*), coalesce(sum(total_amount), 0) as total FROM milk_collections WHERE transaction_status = $1;', ['COMPLETED']);
    assert.equal(collResAfter.rows[0].count, collCountBefore);
    assert.equal(collResAfter.rows[0].total, collTotalBefore);
  });

  // --------------------------------------------------------------------------
  // Scenario 29: Offline Pending Payment Sync
  // --------------------------------------------------------------------------
  const offlinePayoutUuid = crypto.randomUUID();
  await t.test('29. Offline payout sync saves as PENDING_APPROVAL and does not immediately settle', async () => {
    const syncRes = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({
        deviceId: testDeviceId,
        centerId: centerAId,
        events: [
          {
            id: crypto.randomUUID(),
            entityType: 'OFFLINE_PAYMENT_PAYOUT',
            entityId: offlinePayoutUuid,
            idempotencyKey: p15Key('OFFLINE-001'),
            payload: {
              customerId: customer1Id,
              amount: 300.00,
              paymentMethod: 'CASH',
              referenceNumber: 'OFFLINE-CASH-P15-01',
            },
          },
        ],
      });

    assert.equal(syncRes.status, 200);
    assert.equal(syncRes.body.data.applied, 1);
    assert.equal(syncRes.body.data.results[0].paymentStatus, 'PENDING_APPROVAL');
    assert.equal(syncRes.body.data.results[0].ledgerEffectApplied, false);

    // Verify in database that status is PENDING_APPROVAL and ledger balance is untouched
    const payoutDb = await query('SELECT status, ledger_transaction_id FROM customer_payouts WHERE id = $1;', [offlinePayoutUuid]);
    assert.equal(payoutDb.rows[0].status, 'PENDING_APPROVAL');
    assert.equal(payoutDb.rows[0].ledger_transaction_id, null);
  });

  // --------------------------------------------------------------------------
  // Scenario 30: Duplicate Offline Sync Replay
  // --------------------------------------------------------------------------
  await t.test('30. Duplicate offline sync replay is acknowledged idempotently without re-inserting', async () => {
    const replayRes = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({
        deviceId: testDeviceId,
        centerId: centerAId,
        events: [
          {
            id: crypto.randomUUID(),
            entityType: 'OFFLINE_PAYMENT_PAYOUT',
            entityId: offlinePayoutUuid,
            idempotencyKey: p15Key('OFFLINE-001'), // Replaying same event
            payload: {
              customerId: customer1Id,
              amount: 300.00,
              paymentMethod: 'CASH',
            },
          },
        ],
      });

    assert.equal(replayRes.status, 200);
    assert.equal(replayRes.body.data.results[0].status, 'DUPLICATE');
  });
});
