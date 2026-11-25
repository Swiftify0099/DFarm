import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { db } from '../dist/infrastructure/database/PostgresPool.js';
import { HmacJwtTokenService } from '../dist/infrastructure/security/HmacJwtTokenService.js';
import { createApp } from '../dist/app.js';
import { UnionBankValidator } from '../dist/integrations/banking/union-bank/UnionBankValidator.js';
import { UnionBankFileGenerator } from '../dist/integrations/banking/union-bank/UnionBankFileGenerator.js';
import { UnionBankResponseParser } from '../dist/integrations/banking/union-bank/UnionBankResponseParser.js';

test('PROMPT 7: Farmer Milk Payment, Settlement & Union Bank Payout Management System Suite', async (suite) => {
  let isConnected = await db.checkConnection();
  if (!isConnected) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    isConnected = await db.checkConnection();
  }
  if (!isConnected) {
    console.log('[PROMPT 7 TEST] PostgreSQL connection unavailable. Suite skipped.');
    await db.close();
    suite.skip('PostgreSQL environment unavailable');
    return;
  }

  // Tenant & Center Identifiers
  const orgAlpha = '00000000-0000-0000-0000-000000007a01';
  const orgBeta = '00000000-0000-0000-0000-000000007b02';
  const centerAlpha1 = '00000000-0000-0000-0000-000000007c01';
  const centerAlpha2 = '00000000-0000-0000-0000-000000007c02';
  const centerBeta = '00000000-0000-0000-0000-000000007c03';

  // Users (Maker & Checker Segregation)
  const makerUserId = '00000000-0000-0000-0000-000000007d01';
  const checkerUserId = '00000000-0000-0000-0000-000000007d02';
  const operatorUserId = '00000000-0000-0000-0000-000000007d03';
  const betaAdminId = '00000000-0000-0000-0000-000000007d04';

  // Farmers (Generate clean UUIDs per test execution to ensure immutable ledger isolation)
  const runSuffix = Date.now().toString(36).slice(-4);
  const farmerAlpha1 = crypto.randomUUID(); // Valid bank
  const farmerAlpha2 = crypto.randomUUID(); // Unverified bank
  const farmerAlpha3 = crypto.randomUUID(); // Prior opening balance + deductions
  const farmerBeta1 = crypto.randomUUID();  // Tenant Beta farmer

  const tokenService = new HmacJwtTokenService();

  // Maker Token (Creates batch)
  const makerToken = tokenService.signToken({
    userId: makerUserId,
    organizationId: orgAlpha,
    role: 'PRIMARY_DAIRY_ADMIN',
    actorType: 'STAFF',
    fullName: 'Maker Dairy Admin',
  });

  // Checker Token (Approves batch)
  const checkerToken = tokenService.signToken({
    userId: checkerUserId,
    organizationId: orgAlpha,
    role: 'DAIRY_ADMIN',
    actorType: 'STAFF',
    fullName: 'Checker Dairy Admin',
  });

  // Low-Privilege Operator Token
  const operatorToken = tokenService.signToken({
    userId: operatorUserId,
    organizationId: orgAlpha,
    role: 'COLLECTION_OPERATOR',
    actorType: 'STAFF',
    fullName: 'Collection Operator',
  });

  // Tenant Beta Admin Token
  const betaAdminToken = tokenService.signToken({
    userId: betaAdminId,
    organizationId: orgBeta,
    role: 'PRIMARY_DAIRY_ADMIN',
    actorType: 'STAFF',
    fullName: 'Beta Dairy Admin',
  });

  const periodStart = '2026-11-01';
  const periodEnd = '2026-11-15';

  // Seed PostgreSQL Environment with Clean Fixtures
  const seedEnvironment = async () => {
    // 1. Organizations
    await db.query(`
      INSERT INTO organizations (id, name, code, status)
      VALUES 
        ($1, 'Prompt 7 Dairy Union Alpha', 'P7ALPHA', 'ACTIVE'),
        ($2, 'Prompt 7 Dairy Union Beta', 'P7BETA', 'ACTIVE')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE';
    `, [orgAlpha, orgBeta]);

    // 2. Centers
    await db.query(`
      INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status, timezone)
      VALUES
        ($1, $2, 'C-7A1', 'Alpha Center North', 'North Rd', 'TownA', 'DistA', 'StateA', '416001', '+919876543210', 'ACTIVE', 'Asia/Kolkata'),
        ($3, $2, 'C-7A2', 'Alpha Center South', 'South Rd', 'TownA', 'DistA', 'StateA', '416002', '+919876543211', 'ACTIVE', 'Asia/Kolkata'),
        ($4, $5, 'C-7B1', 'Beta Central', 'Beta Rd', 'TownB', 'DistB', 'StateB', '416003', '+919876543212', 'ACTIVE', 'Asia/Kolkata')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE';
    `, [centerAlpha1, orgAlpha, centerAlpha2, centerBeta, orgBeta]);

    // 3. Users
    await db.query(`
      INSERT INTO users (id, organization_id, username, phone_number, full_name, role, status)
      VALUES 
        ($1, $3, 'maker_p7', '+919876543210', 'Maker Dairy Admin', 'PRIMARY_DAIRY_ADMIN', 'ACTIVE'),
        ($2, $3, 'checker_p7', '+919876543211', 'Checker Dairy Admin', 'DAIRY_ADMIN', 'ACTIVE'),
        ($4, $3, 'operator_p7', '+919876543212', 'Collection Operator', 'COLLECTION_OPERATOR', 'ACTIVE'),
        ($5, $6, 'beta_admin_p7', '+919876543213', 'Beta Dairy Admin', 'PRIMARY_DAIRY_ADMIN', 'ACTIVE')
      ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, status = 'ACTIVE';
    `, [makerUserId, checkerUserId, orgAlpha, operatorUserId, betaAdminId, orgBeta]);

    // 4. Farmers (Customers)
    await db.query(`
      INSERT INTO customers (
        id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number,
        bank_name, bank_account_number, bank_ifsc_code, bank_account_holder_name,
        bank_verification_status, beneficiary_status, status, registration_status
      )
      VALUES
        ($1, $4, $5, 'F-701-' || $10, 'Ramesh Patil', '+9198765' || $10 || '1', 'Union Bank of India', '053210010001234', 'UBIN0532142', 'Ramesh Patil', 'VERIFIED', 'ACTIVE', 'ACTIVE', 'APPROVED'),
        ($2, $4, $5, 'F-702-' || $10, 'Suresh Shinde', '+9198765' || $10 || '2', 'State Bank of India', '30291827364', 'SBIN0001234', 'Suresh Shinde', 'UNVERIFIED', 'ACTIVE', 'ACTIVE', 'APPROVED'),
        ($3, $4, $6, 'F-703-' || $10, 'Anand Kadam', '+9198765' || $10 || '3', 'Union Bank of India', '053210010009876', 'UBIN0532142', 'Anand Kadam', 'VERIFIED', 'ACTIVE', 'ACTIVE', 'APPROVED'),
        ($7, $8, $9, 'F-704-' || $10, 'Beta Farmer', '+9198765' || $10 || '4', 'Union Bank of India', '053210010005555', 'UBIN0532142', 'Beta Farmer', 'VERIFIED', 'ACTIVE', 'ACTIVE', 'APPROVED')
      ON CONFLICT (id) DO UPDATE 
      SET full_name = EXCLUDED.full_name, bank_verification_status = EXCLUDED.bank_verification_status, bank_ifsc_code = EXCLUDED.bank_ifsc_code;
    `, [farmerAlpha1, farmerAlpha2, farmerAlpha3, orgAlpha, centerAlpha1, centerAlpha2, farmerBeta1, orgBeta, centerBeta, runSuffix]);

    // 5. Clean up existing test batches / milk collections for clean idempotency
    await db.query('DELETE FROM payment_batch_items WHERE batch_id IN (SELECT id FROM payment_batches WHERE organization_id IN ($1, $2));', [orgAlpha, orgBeta]);
    await db.query('DELETE FROM bank_submissions WHERE organization_id IN ($1, $2);', [orgAlpha, orgBeta]);
    await db.query('DELETE FROM customer_payouts WHERE organization_id IN ($1, $2);', [orgAlpha, orgBeta]);
    await db.query('DELETE FROM payment_batches WHERE organization_id IN ($1, $2);', [orgAlpha, orgBeta]);
    await db.query('DELETE FROM milk_collections WHERE organization_id IN ($1, $2);', [orgAlpha, orgBeta]);
    await db.query('DELETE FROM collection_sessions WHERE center_id IN ($1, $2);', [centerAlpha1, centerAlpha2]);

    // 6. Seed Shift & Rate Chart for Milk Collections
    const shiftRes = await db.query(`
      INSERT INTO collection_shifts (center_id, shift_type, start_time, end_time)
      VALUES ($1, 'MORNING', '06:00:00', '10:00:00')
      ON CONFLICT (center_id, shift_type) DO UPDATE SET start_time = EXCLUDED.start_time
      RETURNING id;
    `, [centerAlpha1]);
    const shiftId = shiftRes.rows[0].id;

    let rcvId;
    const rcvCheck = await db.query('SELECT id FROM rate_chart_versions LIMIT 1');
    if (rcvCheck.rows.length > 0) {
      rcvId = rcvCheck.rows[0].id;
    } else {
      const chartRes = await db.query(`
        INSERT INTO rate_charts (id, organization_id, center_id, name, milk_category, pricing_type, is_active)
        VALUES (gen_random_uuid(), $1, $2, 'P7 Test Chart', 'COW', 'GRID', true)
        RETURNING id;
      `, [orgAlpha, centerAlpha1]);
      const verRes = await db.query(`
        INSERT INTO rate_chart_versions (id, rate_chart_id, version_number, status, pricing_unit, effective_from, base_fat, base_snf, base_rate, is_approved)
        VALUES (gen_random_uuid(), $1, 1, 'PUBLISHED', 'PER_LITER', NOW(), 3.5, 8.5, 40.0, true)
        RETURNING id;
      `, [chartRes.rows[0].id]);
      rcvId = verRes.rows[0].id;
    }

    // 7. Seed Collection Sessions & Milk Collections in Period (2026-11-01 to 2026-11-15)
    // Farmer 1: 100 Liters @ ₹40.00 = ₹4,000.00
    const session1Id = crypto.randomUUID();
    await db.query(`
      INSERT INTO collection_sessions (
        id, center_id, customer_id, business_date, shift_id, shift_type,
        selected_milk_category, identification_method, session_state,
        intake_sequence_uuid, started_at, completed_at, operator_id, device_id
      ) VALUES (
        $1, $2, $3, '2026-11-05', $4, 'MORNING',
        'COW', 'FACE', 'COMPLETED',
        gen_random_uuid(), NOW(), NOW(), $5, 'DEV-701'
      );
    `, [session1Id, centerAlpha1, farmerAlpha1, shiftId, operatorUserId]);

    await db.query(`
      INSERT INTO milk_collections (
        id, session_id, organization_id, center_id, customer_id, business_date, shift_type,
        milk_category, net_weight, volume_liters, measurement_unit, fat_percentage, snf_percentage,
        rate_chart_version_id, applied_rate_per_unit, total_amount, transaction_status,
        client_intake_uuid, idempotency_key
      )
      VALUES (
        gen_random_uuid(), $1, $2, $3, $4, '2026-11-05', 'MORNING',
        'COW', 100.00, 100.00, 'KG', 4.00, 8.50,
        $5, 40.00, 4000.00, 'COMPLETED',
        gen_random_uuid(), $6
      );
    `, [session1Id, orgAlpha, centerAlpha1, farmerAlpha1, rcvId, 'MC-IDEMP-' + crypto.randomUUID()]);

    // Farmer 3: 50 Liters @ ₹40.00 = ₹2,000.00
    const session3Id = crypto.randomUUID();
    await db.query(`
      INSERT INTO collection_sessions (
        id, center_id, customer_id, business_date, shift_id, shift_type,
        selected_milk_category, identification_method, session_state,
        intake_sequence_uuid, started_at, completed_at, operator_id, device_id
      ) VALUES (
        $1, $2, $3, '2026-11-08', $4, 'MORNING',
        'COW', 'FACE', 'COMPLETED',
        gen_random_uuid(), NOW(), NOW(), $5, 'DEV-701'
      );
    `, [session3Id, centerAlpha2, farmerAlpha3, shiftId, operatorUserId]);

    await db.query(`
      INSERT INTO milk_collections (
        id, session_id, organization_id, center_id, customer_id, business_date, shift_type,
        milk_category, net_weight, volume_liters, measurement_unit, fat_percentage, snf_percentage,
        rate_chart_version_id, applied_rate_per_unit, total_amount, transaction_status,
        client_intake_uuid, idempotency_key
      )
      VALUES (
        gen_random_uuid(), $1, $2, $3, $4, '2026-11-08', 'MORNING',
        'COW', 50.00, 50.00, 'KG', 4.20, 8.60,
        $5, 40.00, 2000.00, 'COMPLETED',
        gen_random_uuid(), $6
      );
    `, [session3Id, orgAlpha, centerAlpha2, farmerAlpha3, rcvId, 'MC-IDEMP-' + crypto.randomUUID()]);

    // 8. Seed Customer Ledger Accounts & Transactions:
    await db.query(`
      INSERT INTO customer_ledger_accounts (id, organization_id, customer_id, current_balance)
      VALUES 
        (gen_random_uuid(), $1, $2, 3500.00),
        (gen_random_uuid(), $1, $3, 0.00),
        (gen_random_uuid(), $1, $4, 2300.00)
      ON CONFLICT (customer_id) DO UPDATE SET current_balance = EXCLUDED.current_balance;
    `, [orgAlpha, farmerAlpha1, farmerAlpha2, farmerAlpha3]);

    // Farmer 1: Feed deduction: DEBIT ₹500.00
    await db.query(`
      INSERT INTO ledger_transactions (
        id, organization_id, center_id, customer_id, transaction_type, direction, amount,
        reference_entity, reference_id, balance_after, description, idempotency_key, created_by, created_at
      )
      VALUES (
        gen_random_uuid(), $1, $2, $3, 'FEED_PURCHASE_DEBIT', 'DEBIT', 500.00,
        'FEED_SALE', gen_random_uuid(), 3500.00, 'Cattle feed purchase debit', $4, $5, '2026-11-10 10:00:00+05:30'
      );
    `, [orgAlpha, centerAlpha1, farmerAlpha1, 'LT-IDEMP-' + crypto.randomUUID(), makerUserId]);

    // Farmer 3: Opening credit from prior period: CREDIT ₹300.00 (created before periodStart)
    await db.query(`
      INSERT INTO ledger_transactions (
        id, organization_id, center_id, customer_id, transaction_type, direction, amount,
        reference_entity, reference_id, balance_after, description, idempotency_key, created_by, created_at
      )
      VALUES (
        gen_random_uuid(), $1, $2, $3, 'LEDGER_ADJUSTMENT_CREDIT', 'CREDIT', 300.00,
        'MANUAL_ADJUSTMENT', gen_random_uuid(), 300.00, 'Prior period milk adjustment credit', $4, $5, '2026-10-25 10:00:00+05:30'
      );
    `, [orgAlpha, centerAlpha2, farmerAlpha3, 'LT-IDEMP-' + crypto.randomUUID(), makerUserId]);
  };

  // HTTP Helper
  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const makeRequest = async (path, options = {}) => {
    return new Promise((resolve, reject) => {
      const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      };

      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method: options.method || 'GET',
          headers,
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            let data = null;
            try {
              data = body ? JSON.parse(body) : null;
            } catch {
              data = body;
            }
            resolve({ status: res.statusCode, headers: res.headers, body: data });
          });
        }
      );

      req.on('error', reject);
      if (options.body) {
        req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
      }
      req.end();
    });
  };

  try {
    await seedEnvironment();

    // =========================================================================
    // TEST 1: Statutory 5 Payment Overview Metrics Endpoint
    // =========================================================================
    await suite.test('1. Payment Overview returns 5 statutory metrics with accurate aggregates', async () => {
      const res = await makeRequest('/api/v1/payments/overview', {
        headers: { Authorization: `Bearer ${makerToken}` },
      });

      assert.equal(res.status, 200, 'Overview endpoint must return 200 OK');
      assert.ok(res.body.success, 'Response success must be true');
      const metrics = res.body.data;
      assert.ok('totalPayableAmount' in metrics, 'Must have totalPayableAmount');
      assert.ok('totalPaidAmount' in metrics, 'Must have totalPaidAmount');
      assert.ok('pendingAmount' in metrics, 'Must have pendingAmount');
      assert.ok('failedAmount' in metrics, 'Must have failedAmount');
      assert.ok('unreconciledAmount' in metrics, 'Must have unreconciledAmount');
      assert.ok(metrics.totalPayableAmount > 0, 'Total payable amount must reflect ledger dues');
    });

    // =========================================================================
    // TEST 2: Authoritative Settlement Preview Calculation (PostgreSQL NUMERIC)
    // =========================================================================
    await suite.test('2. Authoritative Settlement Preview calculates gross, deductions, opening balance and bank status accurately', async () => {
      const res = await makeRequest(`/api/v1/payments/settlement/preview?periodStart=${periodStart}&periodEnd=${periodEnd}`, {
        headers: { Authorization: `Bearer ${makerToken}` },
      });

      assert.equal(res.status, 200, 'Preview calculation must return 200 OK');
      const preview = res.body.data;
      assert.ok(preview.calculationSnapshotHash, 'Must provide SHA-256 calculation snapshot hash');
      assert.equal(typeof preview.calculationSnapshotHash, 'string');
      assert.equal(preview.calculationSnapshotHash.length, 64, 'SHA-256 hash must be 64 hex characters');

      // Farmer 1 check: ₹4,000 gross - ₹500 feed deduction = ₹3,500 net payable
      const f1 = preview.farmers.find((f) => f.customerId === farmerAlpha1);
      assert.ok(f1, 'Farmer 1 must be present in calculation');
      assert.equal(f1.grossMilkAmount, 4000.00, 'Farmer 1 gross milk credit must be 4000.00');
      assert.equal(f1.deductionsAmount, 500.00, 'Farmer 1 deductions must be 500.00');
      assert.equal(f1.netPayableAmount, 3500.00, 'Farmer 1 net payable must be exactly 3500.00');
      assert.equal(f1.bankVerificationStatus, 'VERIFIED', 'Farmer 1 bank status must be VERIFIED');
      assert.equal(f1.hasBankValidationWarning, false, 'Farmer 1 must not have bank warning');

      // Farmer 3 check: ₹2,000 gross + ₹300 opening balance = ₹2,300 net payable
      const f3 = preview.farmers.find((f) => f.customerId === farmerAlpha3);
      assert.ok(f3, 'Farmer 3 must be present in calculation');
      assert.equal(f3.grossMilkAmount, 2000.00, 'Farmer 3 gross milk credit must be 2000.00');
      assert.equal(f3.openingBalance, 300.00, 'Farmer 3 opening balance must be 300.00');
      assert.equal(f3.netPayableAmount, 2300.00, 'Farmer 3 net payable must be exactly 2300.00');

      // Farmer 2 check: Unverified bank details
      const f2 = preview.farmers.find((f) => f.customerId === farmerAlpha2);
      assert.ok(f2, 'Farmer 2 must be present');
      assert.equal(f2.bankVerificationStatus, 'UNVERIFIED', 'Farmer 2 must be marked UNVERIFIED');
      assert.equal(f2.hasBankValidationWarning, true, 'Farmer 2 must have bank warning');
    });

    // =========================================================================
    // TEST 3: Bank Validation Filter (excludeUnverifiedBankDetails)
    // =========================================================================
    await suite.test('3. Settlement Preview excludes unverified bank details when requested', async () => {
      const res = await makeRequest(
        `/api/v1/payments/settlement/preview?periodStart=${periodStart}&periodEnd=${periodEnd}&excludeUnverifiedBankDetails=true`,
        { headers: { Authorization: `Bearer ${makerToken}` } }
      );

      assert.equal(res.status, 200);
      const preview = res.body.data;
      const f2 = preview.farmers.find((f) => f.customerId === farmerAlpha2);
      assert.equal(f2, undefined, 'Farmer 2 with unverified bank details must be excluded when flag is true');
    });

    // =========================================================================
    // TEST 4: Batch Creation with Immutable Snapshot & Reservation
    // =========================================================================
    let createdBatchId = '';
    await suite.test('4. Create Settlement Batch persists immutable calculation snapshot and reserves farmer dues', async () => {
      const idempotencyKey = 'BATCH-TEST-' + crypto.randomUUID();
      const res = await makeRequest('/api/v1/payments/batches', {
        method: 'POST',
        headers: { Authorization: `Bearer ${makerToken}` },
        body: {
          billingPeriodStart: periodStart,
          billingPeriodEnd: periodEnd,
          customerIds: [farmerAlpha1, farmerAlpha2, farmerAlpha3],
          idempotencyKey,
          excludeUnverifiedBankDetails: true,
          paymentMethod: 'BANK_TRANSFER',
          debitAccountNumber: '053211010009999',
        },
      });

      assert.equal(res.status, 201, 'Batch creation must return 201 Created');
      assert.ok(res.body.success, 'Success flag must be true');
      const batchData = res.body.data;
      assert.ok(batchData.batchId, 'Must return batchId');
      assert.equal(batchData.status, 'CALCULATED', 'Batch initial status must be CALCULATED');
      assert.equal(batchData.totalBeneficiaries, 2, 'Must include 2 eligible farmers with verified banks (Farmer 1 and 3)');
      // Total amount = 3500 + 2300 = 5800.00
      assert.equal(batchData.totalAmount, 5800.00, 'Batch total must exactly match 5800.00');

      createdBatchId = batchData.batchId;

      // Verify immutable snapshot stored in PostgreSQL
      const batchRow = await db.query('SELECT * FROM payment_batches WHERE id = $1', [createdBatchId]);
      assert.equal(batchRow.rows.length, 1);
      assert.ok(batchRow.rows[0].calculation_snapshot_hash, 'Calculation snapshot hash must be stored');
      assert.ok(batchRow.rows[0].calculation_snapshot_json, 'Calculation snapshot JSON must be stored');

      // Verify active reservation: second batch creation attempt cannot over-reserve dues
      const previewAfterBatch = await makeRequest(
        `/api/v1/payments/settlement/preview?periodStart=${periodStart}&periodEnd=${periodEnd}&excludeUnverifiedBankDetails=true&customerIds=${farmerAlpha1},${farmerAlpha3}`,
        { headers: { Authorization: `Bearer ${makerToken}` } }
      );
      assert.equal(previewAfterBatch.status, 200);
      const f1After = previewAfterBatch.body.data.farmers.find((f) => f.customerId === farmerAlpha1);
      const f3After = previewAfterBatch.body.data.farmers.find((f) => f.customerId === farmerAlpha3);
      assert.equal(f1After?.netPayableAmount, 0, 'Farmer 1 net payable must be 0 after reservation');
      assert.equal(f3After?.netPayableAmount, 0, 'Farmer 3 net payable must be 0 after reservation');
    });

    // =========================================================================
    // TEST 5: Maker-Checker Segregation of Duties Gate
    // =========================================================================
    await suite.test('5. Maker-Checker Segregation prohibits creator from self-approving batch', async () => {
      // Step 5.1: Move batch to UNDER_REVIEW
      const reviewRes = await makeRequest(`/api/v1/payments/batches/${createdBatchId}/review`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${makerToken}` },
      });
      assert.equal(reviewRes.status, 200, 'Review submission must return 200 OK');
      assert.equal(reviewRes.body.data.status, 'UNDER_REVIEW', 'Batch status must be UNDER_REVIEW');

      // Step 5.2: Maker attempts self-approval -> MUST BE REJECTED WITH 403
      const selfApproveRes = await makeRequest(`/api/v1/payments/batches/${createdBatchId}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${makerToken}` },
      });

      assert.equal(
        selfApproveRes.status,
        403,
        'Creator attempting self-approval must be blocked with HTTP 403 Forbidden'
      );
      const errMsg = typeof selfApproveRes.body?.error === 'string'
        ? selfApproveRes.body.error
        : (selfApproveRes.body?.error?.message || selfApproveRes.body?.message || '');
      assert.ok(
        selfApproveRes.body?.code === 'MAKER_CHECKER_SELF_APPROVAL_PROHIBITED' ||
        errMsg.includes('Maker-Checker') ||
        selfApproveRes.body?.error?.code === 'MAKER_CHECKER_SELF_APPROVAL_PROHIBITED',
        'Error must state Maker-Checker segregation violation'
      );

      // Step 5.3: Distinct Checker approves -> MUST SUCCEED
      const checkerApproveRes = await makeRequest(`/api/v1/payments/batches/${createdBatchId}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${checkerToken}` },
      });

      assert.equal(checkerApproveRes.status, 200, 'Distinct checker approval must return 200 OK');
      assert.equal(checkerApproveRes.body.data.status, 'APPROVED', 'Batch status must be APPROVED');
      assert.equal(checkerApproveRes.body.data.approvedBy, checkerUserId, 'ApprovedBy must record checker ID');
    });

    // =========================================================================
    // TEST 6: Union Bank Integration — File Generation & Security Guards
    // =========================================================================
    await suite.test('6. Union Bank NEFT & CAPS generators produce valid format, SHA-256 checksum, and formula injection sanitization', async () => {
      // 6.1 Formula Injection Protection Test
      const maliciousItems = [
        {
          beneficiaryName: '=CMD|\' /C calc\'!A0', // Excel command injection
          accountNumber: '053210010001234',
          ifscCode: 'UBIN0532142',
          amount: 1500.00,
          farmerCode: 'F-701',
          reference: '@SUM(1+1)', // Formula injection
        },
      ];

      const csvResult = UnionBankFileGenerator.generateBulkNeftCsv({
        batchNumber: 'BATCH-SEC-TEST',
        debitAccountNumber: '053211010009999',
        items: maliciousItems,
      });

      assert.ok(csvResult.content, 'CSV content must be generated');
      assert.ok(csvResult.checksumSha256, 'SHA-256 Checksum must be computed');
      assert.equal(csvResult.checksumSha256.length, 64, 'Checksum must be 64 hex characters');

      // Verify formula sanitization: leading character prefixed with single quote
      assert.ok(
        csvResult.content.includes("'=CMD|"),
        'Formula injection =CMD must be sanitized with leading apostrophe'
      );
      assert.ok(
        csvResult.content.includes("'@SUM"),
        'Formula injection @SUM must be sanitized with leading apostrophe'
      );

      // 6.2 CAPS Pipe-Delimited Generation Test
      const capsResult = UnionBankFileGenerator.generateCapsFile({
        batchNumber: 'BATCH-CAPS-TEST',
        debitAccountNumber: '053211010009999',
        items: [
          {
            beneficiaryName: 'Ramesh Patil',
            accountNumber: '053210010001234',
            ifscCode: 'UBIN0532142',
            amount: 3500.00,
            farmerCode: 'F-701',
            reference: 'MILK-PAY-01',
          },
        ],
      });

      assert.ok(capsResult.content.includes('|Ramesh Patil|UBIN0532142|3500.00|'), 'CAPS file must contain pipe-delimited record');

      // 6.3 Bank Validator Tests
      assert.equal(UnionBankValidator.isValidIfsc('UBIN0532142'), true, 'UBIN0532142 must be valid IFSC');
      assert.equal(UnionBankValidator.isValidIfsc('INVALID_IFSC'), false, 'Bad IFSC must fail validation');
      assert.equal(UnionBankValidator.isValidAccountNumber('053210010001234'), true, '15-digit UBI account must pass');
      assert.equal(UnionBankValidator.isValidAccountNumber('123'), false, 'Too short account must fail');
    });

    // =========================================================================
    // TEST 7: Bank Submission Audit & Processing Workflow
    // =========================================================================
    await suite.test('7. Batch Submission records bank_submissions entry and transitions batch to SUBMITTED_TO_BANK', async () => {
      const submitRes = await makeRequest(`/api/v1/payments/batches/${createdBatchId}/submit-union-bank`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${checkerToken}` },
        body: {
          submissionType: 'BULK_FILE_EXPORT',
          fileFormat: 'UNION_BANK_BULK_NEFT_CSV',
          debitAccountNumber: '053211010009999',
        },
      });

      if (submitRes.status !== 200) {
        console.log('DEBUG submitRes status:', submitRes.status, 'body:', JSON.stringify(submitRes.body));
      }

      assert.equal(submitRes.status, 200, 'Batch submission must return 200 OK');
      assert.ok(submitRes.body.success, 'Success must be true');
      assert.equal(submitRes.body.data.status, 'SUBMITTED_TO_BANK', 'Batch status must update to SUBMITTED_TO_BANK');
      assert.ok(submitRes.body.data.submissionId, 'Must return bank submission ID');

      // Verify bank_submissions audit table
      const subRows = await db.query('SELECT * FROM bank_submissions WHERE id = $1', [submitRes.body.data.submissionId]);
      assert.equal(subRows.rows.length, 1, 'Bank submission record must be created');
      assert.equal(subRows.rows[0].bank_name, 'Union Bank of India');
      assert.equal(subRows.rows[0].submission_type, 'BULK_FILE_EXPORT');
      assert.ok(subRows.rows[0].file_checksum || subRows.rows[0].file_hash_sha256, 'File SHA-256 checksum must be stored in submission record');
    });

    // =========================================================================
    // TEST 8: Reverse MIS Settlement Parsing & Idempotent Reconciliation
    // =========================================================================
    await suite.test('8. Reverse MIS Parser reconciles batch items, updates ledger accounts, and guarantees idempotency', async () => {
      // Fetch batch item details to construct authentic reverse MIS
      const itemsRes = await db.query(
        `SELECT bi.*, c.farmer_code 
         FROM payment_batch_items bi 
         JOIN customers c ON c.id = bi.customer_id
         WHERE bi.batch_id = $1 ORDER BY c.farmer_code ASC`,
        [createdBatchId]
      );
      assert.equal(itemsRes.rows.length, 2, 'Batch must have 2 items');

      const item1 = itemsRes.rows[0]; // Farmer 1: Success
      const item2 = itemsRes.rows[1]; // Farmer 3: Failed / Account Blocked

      // Construct Reverse MIS CSV matching Union Bank format
      const reverseMisCsv = [
        'REF,UTR,AMOUNT,STATUS,REMARKS',
        `${item1.farmer_code},UBIN261125000001,${item1.net_payable},SUCCESS,Credit Successful`,
        `${item2.farmer_code},,${item2.net_payable},FAILED,Beneficiary Account Inactive`,
      ].join('\n');

      // Post Reconciliation to API
      const reconRes = await makeRequest(`/api/v1/payments/batches/${createdBatchId}/reconcile-union-bank`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${checkerToken}` },
        body: {
          fileContent: reverseMisCsv,
          format: 'CSV',
        },
      });

      assert.equal(reconRes.status, 200, 'Reconciliation endpoint must return 200 OK');
      assert.ok(reconRes.body.success, 'Reconciliation must succeed');
      const reconData = reconRes.body.data;
      assert.equal(reconData.paidCount, 1, 'Exactly 1 item must be marked paid');
      assert.equal(reconData.failedCount, 1, 'Exactly 1 item must be marked failed');
      assert.equal(reconData.batchStatus, 'PARTIALLY_PAID', 'Batch status must be PARTIALLY_PAID');

      // Verify Item 1 in DB: Paid with UTR and posted ledger debit
      const dbItem1 = (await db.query('SELECT * FROM payment_batch_items WHERE id = $1', [item1.id])).rows[0];
      assert.equal(dbItem1.status, 'PAID', 'Item 1 status must be PAID');
      assert.equal(dbItem1.bank_utr, 'UBIN261125000001', 'Item 1 UTR must match reverse MIS');

      // Verify Item 2 in DB: Failed with failure reason
      const dbItem2 = (await db.query('SELECT * FROM payment_batch_items WHERE id = $1', [item2.id])).rows[0];
      assert.equal(dbItem2.status, 'FAILED', 'Item 2 status must be FAILED');
      assert.equal(dbItem2.failure_reason, 'Beneficiary Account Inactive');

      // Verify Ledger debit transaction posted for Item 1
      const ledgerDebit = await db.query(
        `SELECT * FROM ledger_transactions 
         WHERE customer_id = $1 AND transaction_type IN ('PAYMENT_PAYOUT_DEBIT', 'PAYOUT_SETTLEMENT_DEBIT')`,
        [item1.customer_id]
      );
      assert.equal(ledgerDebit.rows.length, 1, 'Authoritative ledger debit transaction must be recorded for paid item');
      assert.equal(Number(ledgerDebit.rows[0].amount), 3500.00, 'Ledger debit must match net payable 3500.00');

      // 8.2 IDEMPOTENCY TEST: Re-submitting the same reconciliation report must not double-debit
      const reconReplayRes = await makeRequest(`/api/v1/payments/batches/${createdBatchId}/reconcile-union-bank`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${checkerToken}` },
        body: {
          fileContent: reverseMisCsv,
          format: 'CSV',
        },
      });

      assert.equal(reconReplayRes.status, 200, 'Reconciliation replay must return 200 OK');
      const ledgerDebitAfterReplay = await db.query(
        `SELECT * FROM ledger_transactions 
         WHERE customer_id = $1 AND transaction_type IN ('PAYMENT_PAYOUT_DEBIT', 'PAYOUT_SETTLEMENT_DEBIT')`,
        [item1.customer_id]
      );
      assert.equal(
        ledgerDebitAfterReplay.rows.length,
        1,
        'Idempotent reconciliation must not post duplicate ledger debits'
      );
    });

    // =========================================================================
    // TEST 9: Multi-Tenant & Center Isolation Security Gates
    // =========================================================================
    await suite.test('9. Cross-Tenant isolation blocks Tenant Beta admin from accessing Tenant Alpha payment batches', async () => {
      // Beta admin attempts to access Alpha's batch
      const crossBatchRes = await makeRequest(`/api/v1/payments/batches/${createdBatchId}`, {
        headers: { Authorization: `Bearer ${betaAdminToken}` },
      });

      assert.ok(
        crossBatchRes.status === 403 || crossBatchRes.status === 404,
        'Cross-tenant batch access must be rejected with 403 or 404'
      );

      // Beta admin attempts to preview Alpha's center
      const crossPreviewRes = await makeRequest(
        `/api/v1/payments/settlement/preview?periodStart=${periodStart}&periodEnd=${periodEnd}&centerId=${centerAlpha1}`,
        { headers: { Authorization: `Bearer ${betaAdminToken}` } }
      );

      assert.equal(
        crossPreviewRes.status,
        403,
        'Cross-tenant center settlement calculation must be blocked with HTTP 403 Forbidden'
      );
    });

    // =========================================================================
    // TEST 10: Role-Based Access Control Gate
    // =========================================================================
    await suite.test('10. Unauthorized roles (Collection Operator) cannot create, approve, or submit payment batches', async () => {
      // Operator attempts to create batch
      const opCreateRes = await makeRequest('/api/v1/payments/batches', {
        method: 'POST',
        headers: { Authorization: `Bearer ${operatorToken}` },
        body: {
          billingPeriodStart: periodStart,
          billingPeriodEnd: periodEnd,
          idempotencyKey: 'OP-TEST-' + crypto.randomUUID(),
        },
      });

      assert.equal(
        opCreateRes.status,
        403,
        'COLLECTION_OPERATOR must be prohibited from creating payment batches'
      );

      // Operator attempts to approve batch
      const batchTargetId = createdBatchId || '00000000-0000-0000-0000-000000007999';
      const opApproveRes = await makeRequest(`/api/v1/payments/batches/${batchTargetId}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${operatorToken}` },
      });

      assert.equal(
        opApproveRes.status,
        403,
        'COLLECTION_OPERATOR must be prohibited from approving payment batches'
      );
    });

  } finally {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  }
});
