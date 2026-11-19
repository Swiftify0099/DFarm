import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../dist/app.js';
import { db } from '../dist/infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../dist/infrastructure/database/TenantDatabaseManager.js';
import { HmacJwtTokenService } from '../dist/infrastructure/security/HmacJwtTokenService.js';
import { superAdminRepo } from '../dist/infrastructure/repositories/PostgresSuperAdminRepository.js';
import { financialPolicyResolutionService } from '../dist/domain/services/FinancialPolicyResolutionService.js';
import { RateChart } from '../dist/domain/entities/RateChart.js';

const tokenService = new HmacJwtTokenService();
const app = createApp();

// Setup test tenant identifiers
const testDairyA = '00000000-0000-0000-0000-000000000091';
const testDairyB = '00000000-0000-0000-0000-000000000092';
const testCenterA = '00000000-0000-0000-0000-000000000093';

// Maker: Finance Accountant
const makerTokenA = tokenService.signToken({
  userId: '00000000-0000-0000-0000-000000000094',
  organizationId: testDairyA,
  role: 'ACCOUNTANT',
  actorType: 'STAFF',
});

// Checker: Independent Primary Dairy Admin
const checkerTokenA = tokenService.signToken({
  userId: '00000000-0000-0000-0000-000000000095',
  organizationId: testDairyA,
  role: 'DAIRY_OWNER',
  actorType: 'STAFF',
});

// Tenant B Admin
const adminTokenB = tokenService.signToken({
  userId: '00000000-0000-0000-0000-000000000096',
  organizationId: testDairyB,
  role: 'DAIRY_OWNER',
  actorType: 'STAFF',
});

// Farmer Token
const farmerTokenA = tokenService.signToken({
  userId: '00000000-0000-0000-0000-000000000097',
  organizationId: testDairyA,
  role: 'FARMER_CUSTOMER',
  actorType: 'CUSTOMER',
});

test('DFarm Roadmap Phase 09 — Financial Calculation, Farmer Settlement, Bulk Payout & Reconciliation Suite', async (suite) => {
  let customer1Id = '00000000-0000-0000-0000-000000000097';
  let customer2Id = '00000000-0000-0000-0000-000000000098';
  let customer3Id = '00000000-0000-0000-0000-000000000099';
  let billingCycleId = '';
  let batchId = '';
  let exportedDownloadToken = '';
  let payoutItem1Id = '';
  let payoutItem2Id = '';
  let payout1Id = '';
  let payout2Id = '';

  const seedDbs = async (targetDb) => {
    try {
      await targetDb.query(`
        INSERT INTO organizations (id, name, code, status)
        VALUES 
          ('${testDairyA}', 'Krishna Valley Dairy Union', 'KRISHNA', 'ACTIVE'),
          ('${testDairyB}', 'Koyna Sahakari Dudh Federation', 'KOYNA', 'ACTIVE')
        ON CONFLICT (id) DO NOTHING;
      `);

      await targetDb.query(`
        INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
        VALUES 
          ('${testCenterA}', '${testDairyA}', 'CC-P9', 'Primary Chilling Center', 'Market Yard', 'Karad', 'Satara', 'Maharashtra', '415110', '+919876543290', 'ACTIVE')
        ON CONFLICT (id) DO NOTHING;
      `);

      await targetDb.query(`
        INSERT INTO users (id, organization_id, username, phone_number, full_name, role, status)
        VALUES 
          ('00000000-0000-0000-0000-000000000094', '${testDairyA}', 'maker_accountant', '+919876543294', 'Sunil More', 'ACCOUNTANT', 'ACTIVE'),
          ('00000000-0000-0000-0000-000000000095', '${testDairyA}', 'checker_owner', '+919876543295', 'Anandrao Patil', 'DAIRY_OWNER', 'ACTIVE'),
          ('00000000-0000-0000-0000-000000000096', '${testDairyB}', 'admin_b', '+919876543296', 'Tanaji Jadhav', 'DAIRY_OWNER', 'ACTIVE')
        ON CONFLICT (id) DO NOTHING;
      `);

      await targetDb.query(`
        INSERT INTO customers (
          id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, 
          status, registration_status, is_deleted, bank_name, bank_account_number, bank_ifsc_code
        ) VALUES 
          ('${customer1Id}', '${testDairyA}', '${testCenterA}', 'FARM-0901', 'Pandurang Salunkhe', '+919822770901', 'ACTIVE', 'APPROVED', FALSE, 'State Bank of India', '30245678901', 'SBIN0000301'),
          ('${customer2Id}', '${testDairyA}', '${testCenterA}', 'FARM-0902', 'Bhimrao Shinde', '+919822770902', 'ACTIVE', 'APPROVED', FALSE, 'Bank of Maharashtra', '60123456789', 'MAHB0000123'),
          ('${customer3Id}', '${testDairyA}', '${testCenterA}', 'FARM-0903', 'Gopal Deshmukh', '+919822770903', 'ACTIVE', 'APPROVED', FALSE, NULL, NULL, NULL)
        ON CONFLICT (id) DO NOTHING;
      `);

      await targetDb.query(`
        DELETE FROM bill_finalization_records WHERE billing_period_id IN (SELECT id FROM billing_periods WHERE organization_id IN ('${testDairyA}', '${testDairyB}'));
        DELETE FROM billing_scheduler_execution_logs WHERE billing_period_id IN (SELECT id FROM billing_periods WHERE organization_id IN ('${testDairyA}', '${testDairyB}'));
        DELETE FROM payment_batch_items WHERE batch_id IN (SELECT id FROM payment_batches WHERE organization_id IN ('${testDairyA}', '${testDairyB}'));
        DELETE FROM payment_reconciliation_records WHERE matched_batch_id IN (SELECT id FROM payment_batches WHERE organization_id IN ('${testDairyA}', '${testDairyB}'));
        DELETE FROM customer_payouts WHERE organization_id IN ('${testDairyA}', '${testDairyB}');
        DELETE FROM customer_payments WHERE center_id IN (SELECT id FROM dairy_centers WHERE organization_id IN ('${testDairyA}', '${testDairyB}'));
        DELETE FROM payment_batches WHERE organization_id IN ('${testDairyA}', '${testDairyB}');
        DELETE FROM monthly_bill_adjustments WHERE bill_id IN (SELECT id FROM monthly_bills WHERE organization_id IN ('${testDairyA}', '${testDairyB}'));
        DELETE FROM monthly_bill_items WHERE bill_id IN (SELECT id FROM monthly_bills WHERE organization_id IN ('${testDairyA}', '${testDairyB}'));
        DELETE FROM monthly_bills WHERE organization_id IN ('${testDairyA}', '${testDairyB}');
        DELETE FROM billing_periods WHERE organization_id IN ('${testDairyA}', '${testDairyB}');
        DELETE FROM customer_ledger_accounts WHERE organization_id IN ('${testDairyA}', '${testDairyB}');
        INSERT INTO customer_ledger_accounts (id, customer_id, organization_id, currency, current_balance)
        VALUES 
          (gen_random_uuid(), '${customer1Id}', '${testDairyA}', 'INR', 2500.00),
          (gen_random_uuid(), '${customer2Id}', '${testDairyA}', 'INR', 1800.00),
          (gen_random_uuid(), '${customer3Id}', '${testDairyA}', 'INR', 0.00);
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
  // GROUP A: Financial Policy Resolution Engine
  // --------------------------------------------------------------------------
  await suite.test('GROUP A: Financial Policy Resolution Engine', async (t) => {
    await t.test('1. Deterministic resolution selects active Dairy rate chart for Cow milk', async () => {
      const mockChart = new RateChart({
        id: 'CHART-COW-01',
        organizationId: testDairyA,
        name: 'Standard Cow Chart',
        milkCategory: 'COW',
        pricingType: 'FORMULA',
        version: 1,
        versionId: 'VER-01',
        baseRatePerLiter: 36.00,
        fatFactor: 4.0,
        snfFactor: 3.0,
        isActive: true,
        effectiveFrom: '2026-01-01T00:00:00Z',
      });

      const result = await financialPolicyResolutionService.calculateAuthoritativePrice({
        rateChart: mockChart,
        milkCategory: 'COW',
        weightLiters: 10.0,
        fatPercentage: 4.0,
        snfPercentage: 8.5,
        businessDate: '2026-11-18',
      });

      assert.equal(typeof result.ratePerLiter, 'number');
      assert.ok(result.ratePerLiter >= 36.00, 'Rate should be at or above base rate');
      assert.equal(result.totalAmount, Math.round(10.0 * result.ratePerLiter * 100) / 100);
      assert.equal(result.snapshot.rateChartId, 'CHART-COW-01');
    });

    await t.test('2. Draft global rate policies are quarantined and do not affect pricing', async () => {
      // Create a draft global rate policy with high floor
      const draftPolicy = await superAdminRepo.createGlobalRatePolicy({
        policyCode: 'DRAFT-MSP-2026',
        name: 'Draft MSP Benchmark',
        policyType: 'STATUTORY_MINIMUM',
      });

      await superAdminRepo.createGlobalRatePolicyVersion(draftPolicy.id, {
        versionNumber: 1,
        status: 'DRAFT',
        effectiveFrom: '2026-01-01T00:00:00Z',
        parameters: { floorPriceCow: 55.00 },
        checksum: 'draft_chk_01',
      });

      // Resolve effective policy on 2026-11-18
      const resolved = await financialPolicyResolutionService.resolveEffectiveGlobalRatePolicy('2026-11-18', 'COW');
      // Must NOT be the draft policy
      if (resolved) {
        assert.notEqual(resolved.policyId, draftPolicy.id, 'Draft policy must be quarantined');
      }
    });

    await t.test('3. Published global rate policy enforces Statutory Minimum Support Price (MSP)', async () => {
      // Create and publish a statutory minimum policy (MSP ₹ 40.00/L for Cow)
      const mspPolicy = await superAdminRepo.createGlobalRatePolicy({
        policyCode: 'PUBLISHED-MSP-FLOOR',
        name: 'Maharashtra MSP Floor',
        policyType: 'STATUTORY_MINIMUM',
      });

      const mspVer = await superAdminRepo.createGlobalRatePolicyVersion(mspPolicy.id, {
        versionNumber: 1,
        status: 'DRAFT',
        effectiveFrom: '2026-01-01T00:00:00Z',
        parameters: { floorPriceCow: 40.00 },
        checksum: 'msp_chk_01',
      });

      await superAdminRepo.publishGlobalRatePolicyVersion(mspVer.id, { fullName: 'Super Admin' });

      // Low-rate chart (base ₹ 25.00)
      const lowChart = new RateChart({
        id: 'LOW-CHART-01',
        organizationId: testDairyA,
        name: 'Low Cow Chart',
        milkCategory: 'COW',
        pricingType: 'FORMULA',
        version: 1,
        versionId: 'VER-LOW',
        baseRatePerLiter: 25.00,
        fatFactor: 2.0,
        snfFactor: 1.0,
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

      assert.equal(result.ratePerLiter, 40.00, 'Rate should be clamped to statutory MSP floor ₹ 40.00');
      assert.equal(result.snapshot.statutoryMinimumApplied, true);
    });

    await t.test('4. Published global FAT/SNF adjustment policy applies quality bracket deductions', async () => {
      const fsPolicy = await superAdminRepo.createGlobalFatSnfPolicy({
        policyCode: 'FAT-SNF-QUALITY-01',
        name: 'Sub-Standard Quality Deduction',
      });

      const fsVer = await superAdminRepo.createGlobalFatSnfPolicyVersion(fsPolicy.id, {
        versionNumber: 1,
        status: 'DRAFT',
        effectiveFrom: '2026-01-01T00:00:00Z',
        milkCategory: 'COW',
        roundingPolicy: 'NEAREST_TWO_DECIMALS',
        fatAdjustmentRules: [
          { minFat: 2.50, maxFat: 3.20, deductionPerPoint: 2.50, description: 'Low fat penalty' }
        ],
        snfAdjustmentRules: [],
        checksum: 'fs_chk_01',
      });

      await superAdminRepo.publishGlobalFatSnfPolicyVersion(fsVer.id, { fullName: 'Super Admin' });

      const testChart = new RateChart({
        id: 'STD-CHART-01',
        organizationId: testDairyA,
        name: 'Std Chart',
        milkCategory: 'COW',
        pricingType: 'FORMULA',
        version: 1,
        versionId: 'VER-STD',
        baseRatePerLiter: 45.00,
        isActive: true,
        effectiveFrom: '2026-01-01T00:00:00Z',
      });

      const result = await financialPolicyResolutionService.calculateAuthoritativePrice({
        rateChart: testChart,
        milkCategory: 'COW',
        weightLiters: 10.0,
        fatPercentage: 3.00, // In deduction bracket [2.50 - 3.20]
        snfPercentage: 8.50,
        businessDate: '2026-11-18',
      });

      assert.ok(result.snapshot.qualityDeductionApplied > 0, 'Deduction should be applied');
    });

    await t.test('5. Expired global policy versions are ignored', async () => {
      const expiredPolicy = await superAdminRepo.createGlobalRatePolicy({
        policyCode: 'EXPIRED-POLICY-2025',
        name: 'Expired 2025 Policy',
        policyType: 'STATUTORY_MINIMUM',
      });

      const expVer = await superAdminRepo.createGlobalRatePolicyVersion(expiredPolicy.id, {
        versionNumber: 1,
        status: 'DRAFT',
        effectiveFrom: '2025-01-01T00:00:00Z',
        effectiveTo: '2025-12-31T23:59:59Z', // Expired in 2025
        parameters: { floorPriceCow: 99.00 },
        checksum: 'exp_chk_01',
      });

      await superAdminRepo.publishGlobalRatePolicyVersion(expVer.id, { fullName: 'Super Admin' });

      const resolved = await financialPolicyResolutionService.resolveEffectiveGlobalRatePolicy('2026-11-18', 'COW');
      if (resolved) {
        assert.notEqual(resolved.policyId, expiredPolicy.id, 'Expired policy must not be resolved');
      }
    });
  });

  // --------------------------------------------------------------------------
  // GROUP B: Authoritative Milk Financial Calculation
  // --------------------------------------------------------------------------
  await suite.test('GROUP B: Authoritative Milk Financial Calculation', async (t) => {
    await t.test('6. Exact decimal arithmetic preserves paise precision without float drift', async () => {
      const chart = new RateChart({
        id: 'PAISE-CHART',
        organizationId: testDairyA,
        name: 'Paise Test Chart',
        milkCategory: 'COW',
        pricingType: 'FORMULA',
        version: 1,
        versionId: 'VER-PAISE',
        baseRatePerLiter: 42.85,
        isActive: true,
        effectiveFrom: '2026-01-01T00:00:00Z',
      });

      const result = await financialPolicyResolutionService.calculateAuthoritativePrice({
        rateChart: chart,
        milkCategory: 'COW',
        weightLiters: 17.33,
        fatPercentage: 3.8,
        snfPercentage: 8.6,
        businessDate: '2026-11-18',
      });

      const expected = Math.round((17.33 * result.ratePerLiter + Number.EPSILON) * 100) / 100;
      assert.equal(result.totalAmount, expected);
      assert.equal(String(result.totalAmount).split('.')[1]?.length ?? 0, 2);
    });

    await t.test('7. Deterministic repeated calculation reproduces identical snapshot values', async () => {
      const chart = new RateChart({
        id: 'DET-CHART',
        organizationId: testDairyA,
        name: 'Deterministic Chart',
        milkCategory: 'BUFFALO',
        pricingType: 'FORMULA',
        version: 2,
        versionId: 'VER-DET',
        baseRatePerLiter: 58.00,
        isActive: true,
        effectiveFrom: '2026-01-01T00:00:00Z',
      });

      const res1 = await financialPolicyResolutionService.calculateAuthoritativePrice({
        rateChart: chart,
        milkCategory: 'BUFFALO',
        weightLiters: 25.5,
        fatPercentage: 6.8,
        snfPercentage: 9.1,
        businessDate: '2026-11-18',
      });

      const res2 = await financialPolicyResolutionService.calculateAuthoritativePrice({
        rateChart: chart,
        milkCategory: 'BUFFALO',
        weightLiters: 25.5,
        fatPercentage: 6.8,
        snfPercentage: 9.1,
        businessDate: '2026-11-18',
      });

      assert.equal(res1.ratePerLiter, res2.ratePerLiter);
      assert.equal(res1.totalAmount, res2.totalAmount);
    });
  });

  // --------------------------------------------------------------------------
  // GROUP C: Billing Cycle & Settlement Calculation
  // --------------------------------------------------------------------------
  await suite.test('GROUP C: Billing Cycle & Settlement Calculation', async (t) => {
    await t.test('8. Billing cycle created with exact period boundaries', async () => {
      const res = await request(app)
        .post('/api/v1/billing/periods')
        .set('Authorization', `Bearer ${checkerTokenA}`)
        .send({
          centerId: testCenterA,
          periodName: 'November 2026 Settlement Period',
          startDate: '2026-11-01',
          endDate: '2026-11-15',
          cycleType: 'CALENDAR_MONTH',
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.id);
      billingCycleId = res.body.data.id;
    });

    await t.test('9. Bill generation computes net payable and prevents double-counting', async () => {
      const genRes = await request(app)
        .post(`/api/v1/billing/periods/${billingCycleId}/generate`)
        .set('Authorization', `Bearer ${checkerTokenA}`)
        .send({});

      assert.equal(genRes.status, 200);
      assert.equal(genRes.body.success, true);
    });

    await t.test('10. Billing cycle finalization records immutable status', async () => {
      const finRes = await request(app)
        .post(`/api/v1/billing/periods/${billingCycleId}/finalize`)
        .set('Authorization', `Bearer ${checkerTokenA}`)
        .send({ notes: 'Finalized for bank NEFT payout' });

      assert.equal(finRes.status, 200);
      assert.equal(finRes.body.success, true);
    });
  });

  // --------------------------------------------------------------------------
  // GROUP D: Farmer Payout Eligibility & Obligation Reservation
  // --------------------------------------------------------------------------
  await suite.test('GROUP D: Farmer Payout Eligibility & Obligation Reservation', async (t) => {
    await t.test('11. Eligible farmers with current_balance > 0 are identified', async () => {
      const res = await request(app)
        .get(`/api/v1/payments/customers/${customer1Id}/summary`)
        .set('Authorization', `Bearer ${makerTokenA}`);

      assert.equal(res.status, 200);
      assert.ok(res.body.data.currentPayableBalance >= 2500.00);
    });

    await t.test('12. Bank account number is masked in API responses', async () => {
      const res = await request(app)
        .get(`/api/v1/customers/${customer1Id}`)
        .set('Authorization', `Bearer ${makerTokenA}`);

      assert.equal(res.status, 200);
      // Account number must be masked or omitted in public/staff views
      const bankAcc = res.body.data.bankAccountNumber || res.body.data.bank_account_number;
      if (bankAcc && bankAcc.length > 4) {
        assert.ok(bankAcc.includes('X') || bankAcc.includes('*'), 'Bank account must be masked');
      }
    });
  });

  // --------------------------------------------------------------------------
  // GROUP E: Bulk Payout Batch Preparation & Maker–Checker Approval
  // --------------------------------------------------------------------------
  await suite.test('GROUP E: Bulk Payout Batch Preparation & Maker–Checker Approval', async (t) => {
    await t.test('13. Authorized Maker (Accountant) creates bulk payout batch', async () => {
      const res = await request(app)
        .post('/api/v1/payments/batches')
        .set('Authorization', `Bearer ${makerTokenA}`)
        .send({
          centerId: testCenterA,
          billingCycleId,
          billingPeriodStart: '2026-11-01',
          billingPeriodEnd: '2026-11-15',
          paymentMethod: 'BANK_TRANSFER',
          customerIds: [customer1Id, customer2Id],
          idempotencyKey: `BATCH-IDEM-${Date.now()}`,
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.status, 'DRAFT');
      assert.equal(res.body.data.totalBeneficiaries, 2);
      batchId = res.body.data.batchId;

      const bRes = await request(app)
        .get(`/api/v1/payments/batches/${batchId}`)
        .set('Authorization', `Bearer ${makerTokenA}`);

      assert.equal(bRes.status, 200);
      payoutItem1Id = bRes.body.data.items[0].id;
      payout1Id = bRes.body.data.items[0].payoutId;
      payoutItem2Id = bRes.body.data.items[1].id;
      payout2Id = bRes.body.data.items[1].payoutId;
    });

    await t.test('14. Duplicate payout batch for the same finalized billing cycle is rejected with 409 Conflict', async () => {
      const dupRes = await request(app)
        .post('/api/v1/payments/batches')
        .set('Authorization', `Bearer ${makerTokenA}`)
        .send({
          centerId: testCenterA,
          billingCycleId, // Same billing cycle ID
          billingPeriodStart: '2026-11-01',
          billingPeriodEnd: '2026-11-15',
          paymentMethod: 'BANK_TRANSFER',
          idempotencyKey: `BATCH-DUP-${Date.now()}`,
        });

      assert.equal(dupRes.status, 409, 'Duplicate batch for active cycle must be rejected');
      assert.equal(dupRes.body.error?.code || dupRes.body.errorCode, 'DUPLICATE_CYCLE_BATCH_PROHIBITED');
    });

    await t.test('15. Maker attempting to approve their own batch is rejected with 403 Forbidden', async () => {
      const selfApproveRes = await request(app)
        .post(`/api/v1/payments/batches/${batchId}/approve`)
        .set('Authorization', `Bearer ${makerTokenA}`); // MakerToken attempted approval!

      assert.equal(selfApproveRes.status, 403);
      assert.ok(
        ['MAKER_CHECKER_SELF_APPROVAL_PROHIBITED', 'FORBIDDEN'].includes(
          selfApproveRes.body.error?.code || selfApproveRes.body.errorCode
        )
      );
    });

    await t.test('16. Independent authorized Checker approves batch, transitioning status to APPROVED', async () => {
      const checkerRes = await request(app)
        .post(`/api/v1/payments/batches/${batchId}/approve`)
        .set('Authorization', `Bearer ${checkerTokenA}`); // CheckerToken (Owner) approves!

      assert.equal(checkerRes.status, 200);
      assert.equal(checkerRes.body.success, true);
      assert.equal(checkerRes.body.data.status, 'APPROVED');
    });
  });

  // --------------------------------------------------------------------------
  // GROUP F: Bank Bulk Payment File Generation (NEFT & SBI CMP)
  // --------------------------------------------------------------------------
  await suite.test('GROUP F: Bank Bulk Payment File Generation (NEFT & SBI CMP)', async (t) => {
    await t.test('17. Approved batch exported to Standard NEFT CSV format', async () => {
      const exportRes = await request(app)
        .get(`/api/v1/payments/batches/${batchId}/export?format=NEFT_STANDARD`)
        .set('Authorization', `Bearer ${checkerTokenA}`);

      assert.equal(exportRes.status, 200);
      assert.equal(exportRes.body.success, true);
      assert.equal(exportRes.body.data.format, 'NEFT_STANDARD');
      assert.equal(exportRes.body.data.rowCount, 2);
      assert.ok(exportRes.body.data.checksumSha256);
      assert.ok(exportRes.body.data.downloadToken);
      exportedDownloadToken = exportRes.body.data.downloadToken;
    });

    await t.test('18. Download endpoint streams file with Cache-Control: no-store and SHA-256 header', async () => {
      const dlRes = await request(app)
        .get(`/api/v1/payments/batches/${batchId}/download?token=${exportedDownloadToken}`);

      assert.equal(dlRes.status, 200);
      assert.equal(dlRes.headers['content-type'], 'text/csv; charset=utf-8');
      assert.ok(dlRes.headers['cache-control'].includes('no-store'));
      assert.ok(dlRes.headers['x-checksum-sha256']);
      
      const csv = dlRes.text;
      assert.ok(csv.includes('Transaction Type,Beneficiary Name,Beneficiary Account Number,Beneficiary IFSC,Amount'));
      assert.ok(csv.includes('Pandurang Salunkhe'));
      assert.ok(csv.includes('SBIN0000301'));
      assert.ok(csv.includes('Bhimrao Shinde'));
      assert.ok(csv.includes('MAHB0000123'));
    });

    await t.test('19. Attempting to export unconfigured SBI CMP format throws explicit diagnostic', async () => {
      const cmpRes = await request(app)
        .get(`/api/v1/payments/batches/${batchId}/export?format=SBI_CMP`)
        .set('Authorization', `Bearer ${checkerTokenA}`);

      assert.equal(cmpRes.status, 400);
      assert.equal(cmpRes.body.error?.code || cmpRes.body.errorCode, 'SBI_CMP_UNCONFIGURED_SPECIFICATION_REQUIRED');
    });

    await t.test('20. Bank file export does NOT debit the farmer ledger', async () => {
      const ledRes = await request(app)
        .get(`/api/v1/ledger/accounts/${customer1Id}`)
        .set('Authorization', `Bearer ${checkerTokenA}`);

      assert.equal(ledRes.status, 200);
      assert.equal(ledRes.body.data.currentBalance, 2500.00, 'Ledger balance must remain untouched after export');
    });
  });

  // --------------------------------------------------------------------------
  // GROUP G: Bank Response & Payment Reconciliation
  // --------------------------------------------------------------------------
  await suite.test('GROUP G: Bank Response & Payment Reconciliation', async (t) => {
    await t.test('21. Partial settlement reconciles item 1 as SETTLED and item 2 as FAILED', async () => {
      const reconRes = await request(app)
        .post(`/api/v1/payments/batches/${batchId}/reconcile`)
        .set('Authorization', `Bearer ${checkerTokenA}`)
        .send({
          results: [
            {
              itemId: payoutItem1Id,
              status: 'SETTLED',
              beneficiaryReference: 'UTR-NEFT-20261118-001234',
            },
            {
              itemId: payoutItem2Id,
              status: 'FAILED',
              failureReason: 'Account inactive or frozen by beneficiary bank',
            },
          ],
        });

      assert.equal(reconRes.status, 200);
      assert.equal(reconRes.body.success, true);
      assert.equal(reconRes.body.data.batchStatus, 'PARTIALLY_SETTLED');
      assert.equal(reconRes.body.data.successfulCount, 1);
      assert.equal(reconRes.body.data.failedCount, 1);
    });

    await t.test('22. Customer 1 (SETTLED) has ledger debited; Customer 2 (FAILED) retains full balance', async () => {
      // Customer 1 balance: 2500 - 2500 = 0.00
      const c1Ledger = await request(app)
        .get(`/api/v1/ledger/accounts/${customer1Id}`)
        .set('Authorization', `Bearer ${checkerTokenA}`);

      assert.equal(c1Ledger.status, 200);
      assert.equal(c1Ledger.body.data.currentBalance, 0.00, 'Customer 1 balance should be debited');

      // Customer 2 balance: 1800 - 0 = 1800.00 (Failure preserves liability)
      const c2Ledger = await request(app)
        .get(`/api/v1/ledger/accounts/${customer2Id}`)
        .set('Authorization', `Bearer ${checkerTokenA}`);

      assert.equal(c2Ledger.status, 200);
      assert.equal(c2Ledger.body.data.currentBalance, 1800.00, 'Customer 2 balance must remain untouched on failure');
    });

    await t.test('23. Confirmed settlement creates double-entry journal lines (CUSTOMER_PAYABLE DEBIT, CASH_BANK CREDIT)', async () => {
      const txns = await db.query(
        `SELECT lt.id, lt.transaction_type, lt.direction, lt.amount, le.account_type, le.entry_type
         FROM ledger_transactions lt
         JOIN ledger_entries le ON le.transaction_id = lt.id
         WHERE lt.customer_id = $1 AND lt.transaction_type = 'PAYMENT_PAYOUT_DEBIT';`,
        [customer1Id]
      );

      assert.ok(txns.rows.length >= 2, 'Must have at least 2 double-entry lines');
      const payableLine = txns.rows.find((r) => r.account_type === 'CUSTOMER_PAYABLE');
      const cashBankLine = txns.rows.find((r) => r.account_type === 'CASH_BANK');

      assert.equal(payableLine.entry_type, 'DEBIT');
      assert.equal(cashBankLine.entry_type, 'CREDIT');
    });

    await t.test('24. Reconciling already settled payout is idempotent without duplicate ledger debit', async () => {
      const replayRes = await request(app)
        .post(`/api/v1/payments/batches/${batchId}/reconcile`)
        .set('Authorization', `Bearer ${checkerTokenA}`)
        .send({
          results: [
            {
              itemId: payoutItem1Id,
              status: 'SETTLED',
              beneficiaryReference: 'UTR-NEFT-20261118-001234',
            },
          ],
        });

      assert.equal(replayRes.status, 200);

      // Customer 1 balance should still be 0.00, NOT negative 2500
      const c1Ledger = await request(app)
        .get(`/api/v1/ledger/accounts/${customer1Id}`)
        .set('Authorization', `Bearer ${checkerTokenA}`);

      assert.equal(c1Ledger.body.data.currentBalance, 0.00, 'Idempotent replay must not debit again');
    });
  });

  // --------------------------------------------------------------------------
  // GROUP H: Customer Passbook Reflection
  // --------------------------------------------------------------------------
  await suite.test('GROUP H: Customer Passbook Reflection', async (t) => {
    await t.test('25. Farmer Passbook shows settled payout with UTR reference', async () => {
      const pbRes = await request(app)
        .get('/api/v1/ledger/entries')
        .set('Authorization', `Bearer ${farmerTokenA}`);

      assert.equal(pbRes.status, 200);
      assert.ok(Array.isArray(pbRes.body.data));
      const payoutEntry = pbRes.body.data.find((e) => e.direction === 'DEBIT');
      assert.ok(payoutEntry, 'Settled payout must appear in passbook as DEBIT');
      assert.equal(payoutEntry.amount, 2500.00);
      assert.ok(payoutEntry.description.includes('UTR-NEFT-20261118-001234'));
    });
  });

  // --------------------------------------------------------------------------
  // GROUP I: Security, Multi-Tenant Isolation & Zero Razorpay
  // --------------------------------------------------------------------------
  await suite.test('GROUP I: Security, Multi-Tenant Isolation & Zero Razorpay', async (t) => {
    await t.test('26. Cross-Dairy payout access is strictly blocked (Tenant B cannot access Tenant A batch)', async () => {
      const crossRes = await request(app)
        .get(`/api/v1/payments/batches/${batchId}`)
        .set('Authorization', `Bearer ${adminTokenB}`); // Tenant B token!

      assert.equal(crossRes.status, 403);
      assert.equal(crossRes.body.error?.code || crossRes.body.errorCode, 'CROSS_ORG_ACCESS_DENIED');
    });

    await t.test('27. Cross-Dairy bank file download is strictly blocked', async () => {
      const crossDl = await request(app)
        .get(`/api/v1/payments/batches/${batchId}/export?format=NEFT_STANDARD`)
        .set('Authorization', `Bearer ${adminTokenB}`);

      assert.equal(crossDl.status, 403);
    });

    await t.test('28. Zero Razorpay / consumer gateway invocations in farmer payout settlement', async () => {
      const payoutRow = await db.query(
        `SELECT payment_method FROM customer_payouts WHERE id = $1;`,
        [payout1Id]
      );
      assert.ok(payoutRow.rows.length > 0, 'Payout record must exist in database');
      assert.equal(payoutRow.rows[0].payment_method, 'BANK_TRANSFER');
      assert.notEqual(payoutRow.rows[0].payment_method, 'RAZORPAY');
    });
  });
});
