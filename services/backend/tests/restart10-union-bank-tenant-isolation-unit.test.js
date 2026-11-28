/**
 * RESTART-10 (DF-022): Union Bank Reconciliation Split-Brain & Tenant Isolation
 * Unit & Contract Test Suite — Invokes compiled production TypeScript services (`dist/`).
 * Zero hand-rolled test doubles for service behavior; verifies real code paths,
 * strict tenant resolver contracts, transaction boundaries, notification deferral,
 * amount validation, conflict checks, and static config/db isolation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');

// Ensure env defaults allow loading compiled backend modules without external DB
process.env['NODE_ENV'] = process.env['NODE_ENV'] || 'test';
process.env['JWT_SECRET'] = process.env['JWT_SECRET'] || 'restart10-unit-test-secret-key-min-32-chars!!';

const {
  UnionBankReconciliationService,
  resolveReconciliationTargetOrganization,
} = await import('../dist/integrations/banking/union-bank/UnionBankReconciliationService.js');
const { UnionBankSubmissionService } = await import('../dist/integrations/banking/union-bank/UnionBankSubmissionService.js');
const { UnionBankStatusInquiryService } = await import('../dist/integrations/banking/union-bank/UnionBankStatusInquiryService.js');
const { UnionBankApiClient } = await import('../dist/integrations/banking/union-bank/UnionBankApiClient.js');
const { UnionBankValidator } = await import('../dist/integrations/banking/union-bank/UnionBankValidator.js');
const { PayoutService } = await import('../dist/modules/payments/payout.service.js');
const { ReconciliationService } = await import('../dist/modules/payments/reconciliation.service.js');
const { PaymentController } = await import('../dist/modules/payments/payment.controller.js');
const { NotificationService } = await import('../dist/modules/notifications/services/notification.service.js');
const { UnionBankBulkNeftSerializer } = await import('../dist/modules/payments/serializers/UnionBankFileSerializer.js');
const { StandardNeftSerializer } = await import('../dist/modules/payments/serializers/StandardNeftSerializer.js');
const { logger } = await import('../dist/shared/logger/index.js');
const {
  tenantDbManager,
  TenantDatabaseUnavailableError,
  PLATFORM_FEDERATION_DAIRY_ID,
} = await import('../dist/infrastructure/database/TenantDatabaseManager.js');
const { batchService } = await import('../dist/modules/payments/batch.service.js');
const { CredentialEncryption } = await import('../dist/infrastructure/security/CredentialEncryption.js');
const { BankFileService } = await import('../dist/modules/payments/serializers/BankFileService.js');
const { SettlementCalculationService } = await import('../dist/modules/payments/settlement-calculation.service.js');
const { maskAccountNumber } = await import('../dist/modules/payments/tenant-payment-context.js');
const {
  encryptBeneficiaryBankAccount,
  decryptStoredBankAccountFailClosed,
  validateBeneficiaryBankAccountForSettlement,
  resolveBeneficiaryBankMask,
  getLegacyPlaintextDetectionCount,
  resetLegacyPlaintextDetectionCount,
} = await import('../dist/modules/payments/beneficiary-bank-account.js');

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SUPER_USER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CENTER_A = '33333333-3333-4333-8333-333333333333';
const BATCH_A = '44444444-4444-4444-8444-444444444444';
const CUST_1 = '55555555-5555-4555-8555-555555555551';
const CUST_2 = '55555555-5555-4555-8555-555555555552';
const PAYOUT_1 = '66666666-6666-4666-8666-666666666661';
const PAYOUT_2 = '66666666-6666-4666-8666-666666666662';
const ITEM_1 = '77777777-7777-4777-8777-777777777771';
const ITEM_2 = '77777777-7777-4777-8777-777777777772';

function makeAuth(overrides = {}) {
  return {
    userId: USER_A,
    organizationId: ORG_A,
    role: 'DAIRY_OWNER',
    centerId: CENTER_A,
    authUser: { id: USER_A, email: 'owner@dairya.example' },
    ...overrides,
  };
}

/**
 * Creates a fake tenant DB client tracking every SQL call, savepoints,
 * commit/rollback lifecycle, and ensuring tenantDb.query() outside
 * withTransaction() fails loudly.
 */
function createInstrumentedTenantDb({
  batchRow = {
    id: BATCH_A,
    organization_id: ORG_A,
    center_id: CENTER_A,
    batch_number: 'BATCH-2026-001',
    bank_batch_reference: 'UBI-SUB-001',
    status: 'SUBMITTED',
  },
  itemsRows = [],
  onClientQuery,
}) {
  const executedQueries = [];
  const txEvents = [];
  let inTransaction = false;
  let committedCount = 0;
  let rolledBackCount = 0;

  const client = {
    async query(sql, params = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      executedQueries.push({ sql: normalized, params, inTransaction });

      // Ensure broken column bi.center_id is NEVER queried
      assert.equal(
        /\bbi\.center_id\b/i.test(normalized),
        false,
        `Forbidden invalid column bi.center_id in SQL: ${normalized}`
      );

      if (normalized.startsWith('SAVEPOINT ') || normalized.startsWith('RELEASE SAVEPOINT ') || normalized.startsWith('ROLLBACK TO SAVEPOINT ')) {
        txEvents.push(normalized);
        return { rows: [], rowCount: 0 };
      }

      if (onClientQuery) {
        const custom = await onClientQuery(normalized, params);
        if (custom !== undefined) {
          return custom;
        }
      }

      if (normalized.includes('FROM payment_batches') && normalized.includes('FOR UPDATE')) {
        return { rows: batchRow ? [batchRow] : [], rowCount: batchRow ? 1 : 0 };
      }

      if (normalized.includes('FROM payment_batch_items bi') && normalized.includes('FOR UPDATE OF bi, cp')) {
        return { rows: itemsRows.map((r) => ({ ...r })), rowCount: itemsRows.length };
      }

      if (normalized.startsWith('SELECT id, status, organization_id') && normalized.includes('FROM customer_payouts')) {
        const payoutId = params[0];
        const match = itemsRows.find((r) => r.payout_id === payoutId);
        if (!match) return { rows: [], rowCount: 0 };
        return {
          rows: [{
            id: match.payout_id,
            status: match.payout_status,
            organization_id: batchRow.organization_id,
            customer_id: match.customer_id,
            center_id: match.center_id,
            amount: match.amount,
            currency: match.payout_currency || 'INR',
            batch_id: match.batch_id,
            payment_method: match.payout_payment_method || 'BANK_TRANSFER',
            reference_number: match.payout_reference_number || null,
            settled_at: match.settled_at || null,
            failure_reason: match.failure_reason || null,
            failed_at: match.failed_at || null,
            updated_at: new Date().toISOString(),
            ledger_transaction_id: match.ledger_transaction_id || null,
            idempotency_key: `pay-${match.payout_id}`,
          }],
          rowCount: 1,
        };
      }

      if (normalized.startsWith('SELECT public.settle_customer_payout')) {
        const [payoutId, , utr, settledDate] = params;
        const match = itemsRows.find((r) => r.payout_id === payoutId);
        if (match) {
          match.payout_status = 'SETTLED';
          match.payout_reference_number = utr;
        }
        return {
          rows: [{
            receipt: {
              payoutId,
              receiptNumber: `RCP-${payoutId.slice(0, 8)}`,
              organizationName: 'Dairy A Coop',
              centerName: 'Center A',
              customerName: match?.customer_name || 'Farmer One',
              farmerCode: match?.farmer_code || 'F001',
              status: 'SETTLED',
              amount: Number(match?.amount || 0),
              currency: 'INR',
              paymentMethod: 'BANK_TRANSFER',
              referenceNumber: utr,
              settledAt: settledDate,
              previousBalance: 1500,
              customerBalanceAfter: 1500 - Number(match?.amount || 0),
              isIdempotentReplay: false,
            },
          }],
          rowCount: 1,
        };
      }

      if (normalized.startsWith('SELECT public.fail_customer_payout')) {
        const [payoutId, , reason] = params;
        const match = itemsRows.find((r) => r.payout_id === payoutId);
        if (match) {
          match.payout_status = 'FAILED';
          match.failure_reason = reason;
        }
        return {
          rows: [{
            result: {
              payoutId,
              status: 'FAILED',
              failureReason: reason,
              failedAt: new Date().toISOString(),
              isIdempotentReplay: false,
            },
          }],
          rowCount: 1,
        };
      }

      if (normalized.startsWith('SELECT public.reverse_customer_payout')) {
        const [payoutId, , reason] = params;
        const match = itemsRows.find((r) => r.payout_id === payoutId);
        if (match) {
          match.payout_status = 'REVERSED';
        }
        return {
          rows: [{
            result: {
              payoutId,
              status: 'REVERSED',
              reversalReason: reason,
              ledgerTransactionId: '88888888-8888-4888-8888-888888888888',
              customerBalanceAfter: 1500,
              reversedAt: new Date().toISOString(),
              isIdempotentReplay: false,
            },
          }],
          rowCount: 1,
        };
      }

      if (normalized.includes('FROM payment_batch_items') && normalized.includes('AS total')) {
        const total = itemsRows.length;
        const successful = itemsRows.filter((i) => i.item_status === 'PAID' || i.item_status === 'SETTLED');
        const failed = itemsRows.filter((i) => i.item_status === 'FAILED');
        const reversed = itemsRows.filter((i) => i.item_status === 'REVERSED');
        const unknown = itemsRows.filter((i) => i.item_status === 'UNKNOWN');
        const pending = itemsRows.filter((i) => ['PENDING', 'SUBMITTED', 'SUBMITTED_TO_BANK', 'PROCESSING'].includes(i.item_status));
        const sum = (arr) => arr.reduce((acc, r) => acc + Number(r.amount), 0).toFixed(2);
        return {
          rows: [{
            total,
            successful_count: successful.length,
            successful_amount: sum(successful),
            failed_count: failed.length,
            failed_amount: sum(failed),
            reversed_count: reversed.length,
            unknown_count: unknown.length,
            pending_count: pending.length,
            pending_amount: sum(pending),
          }],
          rowCount: 1,
        };
      }

      if (normalized.startsWith('UPDATE payment_batch_items')) {
        // Mirror PAID/FAILED/REVERSED/UNKNOWN/PROCESSING update into mock itemsRows
        const itemId = params[params.length - 2];
        const row = itemsRows.find((r) => r.item_id === itemId);
        if (row) {
          if (normalized.includes("SET status = 'PAID'")) {
            row.item_status = 'PAID';
            row.bank_utr = row.bank_utr || params[1];
          } else if (normalized.includes("SET status = 'FAILED'")) {
            row.item_status = 'FAILED';
          } else if (normalized.includes("SET status = 'REVERSED'")) {
            row.item_status = 'REVERSED';
          } else if (normalized.includes("SET status = 'UNKNOWN'")) {
            row.item_status = 'UNKNOWN';
          } else if (normalized.includes("SET status = 'PROCESSING'")) {
            row.item_status = 'PROCESSING';
          }
        }
        return { rows: [], rowCount: row ? 1 : 0 };
      }

      return { rows: [], rowCount: 0 };
    },
  };

  let withTransactionCalls = 0;
  let directQueryCalls = 0;

  const tenantDb = {
    async query() {
      directQueryCalls += 1;
      throw new Error('UnionBankReconciliationService must execute all queries inside tenantDb.withTransaction(), never via direct tenantDb.query()');
    },
    async withTransaction(fn) {
      withTransactionCalls += 1;
      inTransaction = true;
      txEvents.push('BEGIN');
      try {
        const res = await fn(client);
        txEvents.push('COMMIT');
        committedCount += 1;
        return res;
      } catch (err) {
        txEvents.push('ROLLBACK');
        rolledBackCount += 1;
        throw err;
      } finally {
        inTransaction = false;
      }
    },
    getMetrics: () => ({
      withTransactionCalls,
      directQueryCalls,
      committedCount,
      rolledBackCount,
      executedQueries,
      txEvents,
    }),
  };

  return { tenantDb, itemsRows };
}

test('1. Static source integrity: zero config/db imports, zero pool.connect, zero zero-account fallbacks across ALL payment & banking modules', () => {
  const paymentAndBankingFiles = [
    'services/backend/src/integrations/banking/union-bank/UnionBankReconciliationService.ts',
    'services/backend/src/integrations/banking/union-bank/UnionBankSubmissionService.ts',
    'services/backend/src/integrations/banking/union-bank/UnionBankStatusInquiryService.ts',
    'services/backend/src/integrations/banking/union-bank/UnionBankApiClient.ts',
    'services/backend/src/integrations/banking/union-bank/UnionBankValidator.ts',
    'services/backend/src/modules/payments/tenant-payment-context.ts',
    'services/backend/src/modules/payments/beneficiary-bank-account.ts',
    'services/backend/src/modules/payments/payout.service.ts',
    'services/backend/src/modules/payments/reconciliation.service.ts',
    'services/backend/src/modules/payments/reconciliation.controller.ts',
    'services/backend/src/modules/payments/batch.service.ts',
    'services/backend/src/modules/payments/payment.controller.ts',
    'services/backend/src/modules/payments/receipt.service.ts',
    'services/backend/src/modules/payments/settlement-calculation.service.ts',
    'services/backend/src/modules/payments/serializers/BankFileService.ts',
    'services/backend/src/modules/payments/serializers/UnionBankFileSerializer.ts',
    'services/backend/src/modules/payments/serializers/StandardNeftSerializer.ts',
  ];

  const stripComments = (src) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  for (const relPath of paymentAndBankingFiles) {
    const src = fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
    const code = stripComments(src);
    assert.equal(/\bfrom\s+['"][^'"]*config\/db/.test(code), false, `${relPath} must not import config/db`);
    assert.equal(/\bpool\.connect\b/.test(code), false, `${relPath} must not call pool.connect`);
    assert.equal(/\bgetTenantDb\s*\(/.test(code), false, `${relPath} must not call permissive getTenantDb()`);
    assert.equal(/\bgetAllTenantDbs\s*\(/.test(code), false, `${relPath} must never scan all tenant DBs`);
    assert.equal(/\bresolveDefaultOrgId\b/.test(code), false, `${relPath} must not use resolveDefaultOrgId`);
    assert.equal(/['"]0{10,}['"]/.test(code), false, `${relPath} must not contain all-zero debit account fallback`);
    assert.equal(/process\.env\[['"]UNION_BANK_DEBIT_ACCOUNT['"]\]/.test(code), false, `${relPath} must not use platform-wide UNION_BANK_DEBIT_ACCOUNT env fallback`);
  }

  const uiPaymentRegister = fs.readFileSync(
    path.join(REPO_ROOT, 'apps/dfarm-dairy-admin/src/pages/payments/PaymentRegister.tsx'),
    'utf8'
  );
  assert.equal(/['"]00000000000000['"]/.test(uiPaymentRegister), false, 'UI must not send all-zero debitAccountNumber fallback');

  const reconCode = stripComments(fs.readFileSync(
    path.join(REPO_ROOT, 'services/backend/src/integrations/banking/union-bank/UnionBankReconciliationService.ts'),
    'utf8'
  ));
  const ctxCode = stripComments(fs.readFileSync(
    path.join(REPO_ROOT, 'services/backend/src/modules/payments/tenant-payment-context.ts'),
    'utf8'
  ));
  const payoutCode = stripComments(fs.readFileSync(
    path.join(REPO_ROOT, 'services/backend/src/modules/payments/payout.service.ts'),
    'utf8'
  ));
  const catalogSrc = fs.readFileSync(
    path.join(REPO_ROOT, 'packages/database/src/catalog.ts'),
    'utf8'
  );

  assert.equal(/\bbi\.center_id\b/.test(reconCode), false, 'UnionBankReconciliationService must use cp.center_id, not nonexistent bi.center_id');
  assert.match(ctxCode, /getStrictTenantDb\s*\(/, 'Shared payment context must call strict tenant resolver');
  assert.match(ctxCode, /bypassCache:\s*true/, 'Must pass bypassCache: true');
  assert.match(ctxCode, /strictOperational:\s*true/, 'Must pass strictOperational: true');

  assert.equal(/tenantDbManager/.test(payoutCode), false, 'PayoutService must not perform secondary tenantDbManager dual-write sync');
  assert.equal(/current_balance\s*=\s*GREATEST\s*\(/i.test(payoutCode), false, 'PayoutService must not use GREATEST(0.00, current_balance - ...) workaround');
  assert.equal(/'CUSTOMER_PAYOUT'/.test(payoutCode), false, 'PayoutService must use valid reference_entity CUSTOMER_PAYMENT');

  assert.match(catalogSrc, /048_union_bank_reconciliation_idempotency_hardening\.sql/);
  assert.equal(
    fs.existsSync(path.join(REPO_ROOT, 'supabase/migrations/048_union_bank_reconciliation_idempotency_hardening.sql')),
    true
  );
  assert.match(catalogSrc, /049_customer_beneficiary_bank_encryption_and_mask\.sql/);
  assert.equal(
    fs.existsSync(path.join(REPO_ROOT, 'supabase/migrations/049_customer_beneficiary_bank_encryption_and_mask.sql')),
    true
  );

  // RESTART-10.4 static fail-closed checks across batch/settlement/bank-file/submission/reconciliation
  const batchCode = stripComments(fs.readFileSync(
    path.join(REPO_ROOT, 'services/backend/src/modules/payments/batch.service.ts'),
    'utf8'
  ));
  const bankFileCode = stripComments(fs.readFileSync(
    path.join(REPO_ROOT, 'services/backend/src/modules/payments/serializers/BankFileService.ts'),
    'utf8'
  ));
  const subCode = stripComments(fs.readFileSync(
    path.join(REPO_ROOT, 'services/backend/src/integrations/banking/union-bank/UnionBankSubmissionService.ts'),
    'utf8'
  ));
  assert.equal(/CREDENTIAL_ENCRYPTION_KEY/.test(batchCode), false, 'BatchService must not guard encryption with unused env var or plaintext fallback');
  assert.match(batchCode, /encryptBeneficiaryBankAccount\s*\(/);
  assert.match(reconCode, /COALESCE\(\s*bi\.bank_account_mask\s*,\s*cp\.bank_account_mask\s*,\s*c\.bank_account_mask\s*\)\s+AS\s+bank_account_mask/);
  assert.match(bankFileCode, /decryptStoredBankAccountFailClosed\s*\(/);
  assert.match(subCode, /decryptStoredBankAccountFailClosed\s*\(/);
  assert.equal(/If not AES ciphertext, use raw/.test(bankFileCode), false);
});

test('2. Organization resolution: enforces authenticated tenant for staff, rejects contradicting body/query/header orgs, requires explicit non-platform org for SUPER_ADMIN', async () => {
  // Normal dairy staff: matches auth.organizationId
  assert.equal(resolveReconciliationTargetOrganization(makeAuth()), ORG_A);
  assert.equal(resolveReconciliationTargetOrganization(makeAuth(), ORG_A), ORG_A);

  // Contradicting target organization must fail closed
  assert.throws(
    () => resolveReconciliationTargetOrganization(makeAuth(), ORG_B),
    (err) => err.code === 'CROSS_ORG_RECONCILIATION_DENIED' && err.statusCode === 403
  );

  // Dairy-scoped SUPER_ADMIN also cannot contradict authenticated dairy without platform context
  assert.throws(
    () => resolveReconciliationTargetOrganization(makeAuth({ role: 'SUPER_ADMIN', organizationId: ORG_A }), ORG_B),
    (err) => err.code === 'CROSS_ORG_RECONCILIATION_DENIED' && err.statusCode === 403
  );

  // Platform SUPER_ADMIN without targetOrganizationId fails closed
  assert.throws(
    () => resolveReconciliationTargetOrganization(
      makeAuth({ userId: SUPER_USER, role: 'SUPER_ADMIN', organizationId: PLATFORM_FEDERATION_DAIRY_ID })
    ),
    (err) => err.code === 'SUPER_ADMIN_TARGET_ORG_REQUIRED' && err.statusCode === 400
  );

  // Platform SUPER_ADMIN targeting platform DB fails closed
  assert.throws(
    () => resolveReconciliationTargetOrganization(
      makeAuth({ userId: SUPER_USER, role: 'SUPER_ADMIN', organizationId: PLATFORM_FEDERATION_DAIRY_ID }),
      PLATFORM_FEDERATION_DAIRY_ID
    ),
    (err) => err.code === 'CONTROL_PLANE_TARGET_FORBIDDEN' && err.statusCode === 403
  );

  // Platform SUPER_ADMIN with explicit valid dairy ID succeeds
  assert.equal(
    resolveReconciliationTargetOrganization(
      makeAuth({ userId: SUPER_USER, role: 'SUPER_ADMIN', organizationId: PLATFORM_FEDERATION_DAIRY_ID }),
      ORG_B
    ),
    ORG_B
  );

  // PaymentController forwards explicit targetOrganizationId and rejects conflicting body vs query/header
  const origBatchReconcile = batchService.reconcileBatchWithUnionBank;
  let capturedTarget;
  batchService.reconcileBatchWithUnionBank = async (_batchId, _data, _auth, targetOrg) => {
    capturedTarget = targetOrg;
    return { batchId: BATCH_A };
  };
  try {
    let nextErr = null;
    await PaymentController.reconcileBatchWithUnionBank(
      {
        auth: makeAuth({ userId: SUPER_USER, role: 'SUPER_ADMIN', organizationId: PLATFORM_FEDERATION_DAIRY_ID }),
        params: { batchId: BATCH_A },
        body: { targetOrganizationId: ORG_B, items: [] },
        query: {},
        headers: {},
      },
      { status: () => ({ json: () => ({}) }) },
      (e) => { nextErr = e; }
    );
    assert.equal(nextErr, null);
    assert.equal(capturedTarget, ORG_B);

    let conflictErr = null;
    await PaymentController.reconcileBatchWithUnionBank(
      {
        auth: makeAuth({ role: 'DAIRY_OWNER', organizationId: ORG_A }),
        params: { batchId: BATCH_A },
        body: { organizationId: ORG_A, items: [] },
        query: { organizationId: ORG_B },
        headers: {},
      },
      { status: () => ({ json: () => ({}) }) },
      (e) => { conflictErr = e; }
    );
    assert.ok(conflictErr);
    assert.equal(conflictErr.code, 'CROSS_ORG_RECONCILIATION_DENIED');
  } finally {
    batchService.reconcileBatchWithUnionBank = origBatchReconcile;
  }
});

test('3. Strict tenant resolver & fail-closed behavior: calls getStrictTenantDb with bypassCache + strictOperational and aborts without NotificationService on failure', async () => {
  const origStrict = tenantDbManager.getStrictTenantDb.bind(tenantDbManager);
  const origPermissive = tenantDbManager.getTenantDb.bind(tenantDbManager);
  const origGetAll = tenantDbManager.getAllTenantDbs.bind(tenantDbManager);
  const origNotify = NotificationService.enqueueNotification;

  let strictCalls = [];
  let permissiveCalled = false;
  let getAllCalled = false;
  let notifyCount = 0;

  tenantDbManager.getTenantDb = async () => {
    permissiveCalled = true;
    throw new Error('Permissive getTenantDb must never be called');
  };
  tenantDbManager.getAllTenantDbs = () => {
    getAllCalled = true;
    throw new Error('getAllTenantDbs must never be called');
  };
  tenantDbManager.getStrictTenantDb = async (orgId, opts) => {
    strictCalls.push({ orgId, opts });
    throw new TenantDatabaseUnavailableError(orgId, 'UNMAPPED', 'No tenant mapping found');
  };
  NotificationService.enqueueNotification = async () => {
    notifyCount += 1;
  };

  try {
    await assert.rejects(
      () => UnionBankReconciliationService.reconcileBatchWithBankData(BATCH_A, 'REF,UTR,AMT,STAT\nF1,U1,100,PAID', makeAuth()),
      (err) => err instanceof TenantDatabaseUnavailableError
    );

    assert.equal(permissiveCalled, false);
    assert.equal(getAllCalled, false);
    assert.equal(notifyCount, 0);
    assert.equal(strictCalls.length, 1);
    assert.equal(strictCalls[0].orgId, ORG_A);
    assert.deepEqual(strictCalls[0].opts, { bypassCache: true, strictOperational: true });
  } finally {
    tenantDbManager.getStrictTenantDb = origStrict;
    tenantDbManager.getTenantDb = origPermissive;
    tenantDbManager.getAllTenantDbs = origGetAll;
    NotificationService.enqueueNotification = origNotify;
  }
});

test('4. Single batch transaction, PAID status transition preserving beneficiary_reference, post-commit notification ordering, empty batch guard & zero/float paise precision', async () => {
  const origStrict = tenantDbManager.getStrictTenantDb.bind(tenantDbManager);
  const origNotify = NotificationService.enqueueNotification;

  const { tenantDb } = createInstrumentedTenantDb({
    itemsRows: [
      {
        item_id: ITEM_1,
        batch_id: BATCH_A,
        payout_id: PAYOUT_1,
        customer_id: CUST_1,
        amount: '100.30',
        item_status: 'SUBMITTED',
        beneficiary_reference: 'BEN-REF-001',
        bank_utr: null,
        bank_reference_number: null,
        farmer_code: 'F001',
        customer_name: 'Ramesh',
        bank_account_mask: 'XXXX1234',
        center_id: CENTER_A,
        payout_status: 'SUBMITTED',
        payout_reference_number: null,
        payout_currency: 'INR',
        payout_payment_method: 'BANK_TRANSFER',
      },
      {
        item_id: ITEM_2,
        batch_id: BATCH_A,
        payout_id: PAYOUT_2,
        customer_id: CUST_2,
        amount: '250.00',
        item_status: 'SUBMITTED',
        beneficiary_reference: 'BEN-REF-002',
        bank_utr: null,
        bank_reference_number: null,
        farmer_code: 'F002',
        customer_name: 'Suresh',
        bank_account_mask: 'XXXX5678',
        center_id: CENTER_A,
        payout_status: 'SUBMITTED',
        payout_reference_number: null,
        payout_currency: 'INR',
        payout_payment_method: 'BANK_TRANSFER',
      },
    ],
  });

  const eventsObserved = [];
  NotificationService.enqueueNotification = async (payload) => {
    // Capture live tx metrics when notification fires to verify COMMIT already happened!
    const metrics = tenantDb.getMetrics();
    eventsObserved.push({ payload, committedAtEnqueue: metrics.committedCount });
    return { queued: true };
  };
  tenantDbManager.getStrictTenantDb = async () => tenantDb;

  try {
    const res = await UnionBankReconciliationService.reconcileBatchWithBankData(
      BATCH_A,
      [
        {
          customerReference: 'BEN-REF-001',
          bankUtr: 'UTR-FLOAT-001',
          amount: 100.1 + 0.2, // 100.30000000000001 in JS float -> must match 100.30 in integer paise!
          status: 'PAID',
        },
        {
          customerReference: 'BEN-REF-002',
          bankUtr: 'UTR-ZERO-002',
          amount: 0, // Must NOT skip validation on 0!
          status: 'PAID',
        },
      ],
      makeAuth()
    );

    const metrics = tenantDb.getMetrics();
    assert.equal(metrics.withTransactionCalls, 1, 'Must execute all work inside ONE batch-level transaction');
    assert.equal(metrics.directQueryCalls, 0, 'Must never call direct tenantDb.query outside transaction');
    assert.equal(metrics.committedCount, 1);

    // Item 1 settled as PAID, Item 2 flagged as AMOUNT_MISMATCH
    assert.equal(res.paidCount, 1);
    assert.equal(res.batchStatus, 'PROCESSING');
    assert.equal(res.exceptions.length, 1);
    assert.match(res.exceptions[0].reason, /AMOUNT_MISMATCH/);

    // Ensure payment_batch_items UPDATE set PAID and preserved beneficiary_reference
    const paidUpdate = metrics.executedQueries.find((q) => q.sql.includes("UPDATE payment_batch_items SET status = 'PAID'"));
    assert.ok(paidUpdate, 'Must update payment_batch_items status to PAID after settle_customer_payout');
    assert.equal(paidUpdate.params[0], 'BEN-REF-001', 'Must preserve original beneficiary_reference on batch item');
    assert.equal(paidUpdate.params[1], 'UTR-FLOAT-001');

    // Notification must have fired strictly AFTER tx COMMIT
    assert.equal(eventsObserved.length, 1);
    assert.equal(eventsObserved[0].committedAtEnqueue, 1);

    // Empty batch must NEVER be reported as PAID
    const { tenantDb: emptyDb } = createInstrumentedTenantDb({
      batchRow: { id: BATCH_A, organization_id: ORG_A, center_id: CENTER_A, batch_number: 'EMPTY', bank_batch_reference: null, status: 'DRAFT' },
      itemsRows: [],
    });
    tenantDbManager.getStrictTenantDb = async () => emptyDb;
    const emptyRes = await UnionBankReconciliationService.reconcileBatchWithBankData(BATCH_A, [], makeAuth());
    assert.equal(emptyRes.totalBeneficiaries, 0);
    assert.notEqual(emptyRes.batchStatus, 'PAID', 'Empty batch must never report PAID');
    assert.equal(emptyRes.batchStatus, 'FAILED');
  } finally {
    tenantDbManager.getStrictTenantDb = origStrict;
    NotificationService.enqueueNotification = origNotify;
  }
});

test('5. Ambiguous reference rejection, savepoint domain isolation vs infra error outer rollback & notification suppression', async () => {
  const origStrict = tenantDbManager.getStrictTenantDb.bind(tenantDbManager);
  const origNotify = NotificationService.enqueueNotification;

  let notifyCount = 0;
  NotificationService.enqueueNotification = async () => {
    notifyCount += 1;
  };

  try {
    // Part A: Infrastructure DB error after item 1 succeeds must abort outer tx and suppress ALL notifications
    const { tenantDb: infraDb } = createInstrumentedTenantDb({
      itemsRows: [
        {
          item_id: ITEM_1, batch_id: BATCH_A, payout_id: PAYOUT_1, customer_id: CUST_1,
          amount: '500.00', item_status: 'SUBMITTED', beneficiary_reference: 'REF-1',
          farmer_code: 'F001', center_id: CENTER_A, payout_status: 'SUBMITTED',
        },
        {
          item_id: ITEM_2, batch_id: BATCH_A, payout_id: PAYOUT_2, customer_id: CUST_2,
          amount: '750.00', item_status: 'SUBMITTED', beneficiary_reference: 'REF-2',
          farmer_code: 'F002', center_id: CENTER_A, payout_status: 'SUBMITTED',
        },
      ],
      onClientQuery: async (sql, params) => {
        if (sql.startsWith('SELECT public.settle_customer_payout') && params[0] === PAYOUT_2) {
          const err = new Error('Simulated DB connection drop during second item');
          err.code = '08006';
          throw err;
        }
        return undefined;
      },
    });
    tenantDbManager.getStrictTenantDb = async () => infraDb;

    await assert.rejects(
      () => UnionBankReconciliationService.reconcileBatchWithBankData(
        BATCH_A,
        [
          { customerReference: 'REF-1', bankUtr: 'UTR-1', amount: 500, status: 'PAID' },
          { customerReference: 'REF-2', bankUtr: 'UTR-2', amount: 750, status: 'PAID' },
        ],
        makeAuth()
      ),
      (err) => err.code === '08006'
    );

    const infraMetrics = infraDb.getMetrics();
    assert.equal(infraMetrics.rolledBackCount, 1, 'Outer batch transaction must roll back on DB error');
    assert.equal(infraMetrics.committedCount, 0);
    assert.equal(notifyCount, 0, 'No notifications may fire when batch transaction rolls back');

    // Part B: Ambiguous reference matching two items must NOT settle either
    const { tenantDb: ambigDb } = createInstrumentedTenantDb({
      itemsRows: [
        {
          item_id: ITEM_1, batch_id: BATCH_A, payout_id: PAYOUT_1, customer_id: CUST_1,
          amount: '500.00', item_status: 'SUBMITTED', beneficiary_reference: 'SHARED-REF',
          farmer_code: 'F001', center_id: CENTER_A, payout_status: 'SUBMITTED',
        },
        {
          item_id: ITEM_2, batch_id: BATCH_A, payout_id: PAYOUT_2, customer_id: CUST_2,
          amount: '500.00', item_status: 'SUBMITTED', beneficiary_reference: 'SHARED-REF',
          farmer_code: 'F002', center_id: CENTER_A, payout_status: 'SUBMITTED',
        },
      ],
    });
    tenantDbManager.getStrictTenantDb = async () => ambigDb;
    const ambigRes = await UnionBankReconciliationService.reconcileBatchWithBankData(
      BATCH_A,
      [{ customerReference: 'SHARED-REF', bankUtr: 'UTR-AMB', amount: 500, status: 'PAID' }],
      makeAuth()
    );
    assert.equal(ambigRes.paidCount, 0);
    assert.equal(ambigRes.exceptions.length, 1);
    assert.match(ambigRes.exceptions[0].reason, /AMBIGUOUS_REFERENCE/);
    assert.equal(notifyCount, 0);

    // Part C: Per-item domain error rolls back to savepoint without aborting valid sibling
    const { tenantDb: spDb } = createInstrumentedTenantDb({
      itemsRows: [
        {
          item_id: ITEM_1, batch_id: BATCH_A, payout_id: PAYOUT_1, customer_id: CUST_1,
          amount: '500.00', item_status: 'SUBMITTED', beneficiary_reference: 'REF-OK',
          farmer_code: 'F001', center_id: CENTER_A, payout_status: 'SUBMITTED',
        },
        {
          item_id: ITEM_2, batch_id: BATCH_A, payout_id: PAYOUT_2, customer_id: CUST_2,
          amount: '600.00', item_status: 'PAID', beneficiary_reference: 'REF-BAD-FAIL',
          farmer_code: 'F002', center_id: CENTER_A, payout_status: 'SETTLED', payout_reference_number: 'UTR-ALREADY',
        },
      ],
    });
    tenantDbManager.getStrictTenantDb = async () => spDb;
    const spRes = await UnionBankReconciliationService.reconcileBatchWithBankData(
      BATCH_A,
      [
        { customerReference: 'REF-OK', bankUtr: 'UTR-OK', amount: 500, status: 'PAID' },
        { customerReference: 'REF-BAD-FAIL', bankUtr: 'UTR-NONE', amount: 600, status: 'FAILED', failureReason: 'Cannot fail settled' },
      ],
      makeAuth()
    );
    const spMetrics = spDb.getMetrics();
    assert.equal(spMetrics.committedCount, 1);
    assert.ok(spMetrics.txEvents.includes('ROLLBACK TO SAVEPOINT sp_ub_item_1'));
    assert.equal(spRes.paidCount, 2, 'Item 2 stays PAID and item 1 became PAID');
    assert.equal(spRes.exceptions.length, 1);
    assert.match(spRes.exceptions[0].reason, /CANNOT_FAIL_SETTLED|SETTLED/i);
    assert.equal(notifyCount, 1, 'Only newly settled item 1 emits notification');
  } finally {
    tenantDbManager.getStrictTenantDb = origStrict;
    NotificationService.enqueueNotification = origNotify;
  }
});

test('6. PayoutService *InTransaction contracts: conflicting UTR, FAILED/REVERSED state guards, REVERSED replay vs conflict & fallback SQL schema accuracy', async () => {
  const svc = new PayoutService();
  const auth = makeAuth();

  // Conflicting UTR on already SETTLED payout
  await assert.rejects(
    () => svc.confirmPayoutInTransaction(
      {
        async query() {
          return {
            rows: [{
              id: PAYOUT_1, status: 'SETTLED', organization_id: ORG_A,
              customer_id: CUST_1, center_id: CENTER_A, amount: '500.00',
              reference_number: 'UTR-EXISTING',
            }],
          };
        },
      },
      PAYOUT_1,
      auth,
      ORG_A,
      'UTR-CONFLICTING',
      new Date()
    ),
    (err) => err.code === 'CONFLICTING_UTR_REFERENCE' && err.statusCode === 409
  );

  // REVERSED payout idempotent replay with SAME key succeeds; DIFFERENT key rejects cleanly
  const replayKey = `REV-${ORG_A}-${PAYOUT_1}-UTR1`;
  const reversedMockClient = (storedKey) => ({
    async query(sql) {
      const s = sql.replace(/\s+/g, ' ').trim();
      if (s.includes('FROM customer_payouts')) {
        return {
          rows: [{
            id: PAYOUT_1, status: 'REVERSED', organization_id: ORG_A,
            customer_id: CUST_1, center_id: CENTER_A, amount: '500.00',
            batch_id: BATCH_A, updated_at: new Date().toISOString(),
          }],
        };
      }
      if (s.includes('FROM ledger_transactions')) {
        return { rows: [{ id: 'txn-rev-1', idempotency_key: storedKey, balance_after: '1000.00', created_at: new Date().toISOString() }] };
      }
      if (s.includes('FROM payment_adjustments')) {
        return { rows: [{ id: 'adj-1', idempotency_key: storedKey, reason: 'Returned NEFT', created_at: new Date().toISOString() }] };
      }
      if (s.includes('FROM customer_ledger_accounts')) {
        return { rows: [{ current_balance: '1000.00' }] };
      }
      return { rows: [] };
    },
  });

  const replayRes = await svc.reversePayoutInTransaction(
    reversedMockClient(replayKey),
    PAYOUT_1,
    auth,
    ORG_A,
    'Returned NEFT',
    replayKey
  );
  assert.equal(replayRes.isIdempotentReplay, true);
  assert.equal(replayRes.status, 'REVERSED');
  assert.equal(replayRes.customerBalanceAfter, 1000);

  await assert.rejects(
    () => svc.reversePayoutInTransaction(
      reversedMockClient(replayKey),
      PAYOUT_1,
      auth,
      ORG_A,
      'Returned NEFT again',
      `REV-${ORG_A}-${PAYOUT_1}-UTR2`
    ),
    (err) => err.code === 'CONFLICTING_REVERSAL_REFERENCE' && err.statusCode === 409
  );

  // Reversal of FAILED payout must always reject
  await assert.rejects(
    () => svc.reversePayoutInTransaction(
      {
        async query() {
          return { rows: [{ id: PAYOUT_1, status: 'FAILED', organization_id: ORG_A, customer_id: CUST_1, center_id: CENTER_A, amount: '500.00' }] };
        },
      },
      PAYOUT_1,
      auth,
      ORG_A,
      'Cannot reverse failed',
      replayKey
    ),
    (err) => err.code === 'CANNOT_REVERSE_NON_SETTLED_PAYOUT'
  );

  // failPayoutInTransaction on ALREADY FAILED payout returns idempotent without RPC
  let rpcCalled = false;
  const failReplay = await svc.failPayoutInTransaction(
    {
      async query(sql) {
        if (sql.includes('fail_customer_payout')) {
          rpcCalled = true;
        }
        return { rows: [{ id: PAYOUT_1, status: 'FAILED', organization_id: ORG_A, failure_reason: 'Closed account', failed_at: '2026-01-01T00:00:00Z' }] };
      },
    },
    PAYOUT_1,
    auth,
    ORG_A,
    'Closed account'
  );
  assert.equal(failReplay.isIdempotentReplay, true);
  assert.equal(rpcCalled, false);

  // Reverse RPC-missing (42883) fallback uses CUSTOMER_PAYMENT (not CUSTOMER_PAYOUT) and passes idempotency_key
  const capturedSql = [];
  await svc.reversePayoutInTransaction(
    {
      async query(sql, params = []) {
        const s = sql.replace(/\s+/g, ' ').trim();
        capturedSql.push({ sql: s, params });
        if (s.includes('FROM customer_payouts')) {
          return { rows: [{ id: PAYOUT_1, status: 'SETTLED', organization_id: ORG_A, customer_id: CUST_1, center_id: CENTER_A, amount: '500.00', batch_id: BATCH_A }] };
        }
        if (s.includes('public.reverse_customer_payout')) {
          const e = new Error('function public.reverse_customer_payout does not exist');
          e.code = '42883';
          throw e;
        }
        if (s.includes('FROM customer_ledger_accounts')) {
          return { rows: [{ id: 'cla-1', current_balance: '500.00' }] };
        }
        return { rows: [] };
      },
    },
    PAYOUT_1,
    auth,
    ORG_A,
    'Bank return credit',
    replayKey
  );
  const ledgerInsert = capturedSql.find((q) => q.sql.includes('INSERT INTO ledger_transactions'));
  assert.ok(ledgerInsert);
  assert.equal(ledgerInsert.sql.includes("'CUSTOMER_PAYMENT'"), true);
  assert.equal(ledgerInsert.sql.includes("'CUSTOMER_PAYOUT'"), false);
  const adjInsert = capturedSql.find((q) => q.sql.includes('INSERT INTO payment_adjustments'));
  assert.ok(adjInsert);
  assert.equal(adjInsert.params.includes(replayKey), true);
});

test('7. DF-024 debit account fail-closed, credential masking, production cert blocker, and UnionBankSubmissionService two-phase isolation', async () => {
  const origEnv = process.env['UNION_BANK_ENV'];
  const origDebitEnv = process.env['UNION_BANK_DEBIT_ACCOUNT'];
  const origStrict = tenantDbManager.getStrictTenantDb.bind(tenantDbManager);
  const origApiSubmit = UnionBankSubmissionService['apiClient'].submitBatch;
  const origLoggerInfo = logger.info.bind(logger);
  const capturedLogs = [];

  logger.info = (...args) => {
    capturedLogs.push(JSON.stringify(args));
  };

  try {
    // 7a: UnionBankValidator rejects all-zeros & empty, and masks digits in errors
    assert.equal(UnionBankValidator.isValidAccountNumber('00000000000000'), false);
    assert.throws(
      () => UnionBankValidator.validateAccountNumber('00000000000000', 'Dairy Union Bank Debit Account'),
      (err) => err.code === 'INVALID_BANK_ACCOUNT'
    );
    assert.throws(
      () => UnionBankValidator.validateAccountNumber('12345', 'Beneficiary'),
      (err) => err.code === 'INVALID_BANK_ACCOUNT' && !err.message.includes('12345')
    );

    // 7b: UnionBankApiClient never inherits global UNION_BANK_DEBIT_ACCOUNT or falls back to zeros
    process.env['UNION_BANK_DEBIT_ACCOUNT'] = '9999888877776666';
    const clientNoConfig = new UnionBankApiClient({ environment: 'UAT' });
    assert.throws(
      () => clientNoConfig.getDebitAccountNumber(),
      (err) => err.code === 'DAIRY_DEBIT_ACCOUNT_NOT_CONFIGURED'
    );

    // Serializers also reject unconfigured or all-zero debit accounts
    const ubSer = new UnionBankBulkNeftSerializer();
    const neftSer = new StandardNeftSerializer();
    const sampleDetail = {
      batchId: BATCH_A,
      batchNumber: 'BATCH-S01',
      organizationId: ORG_A,
      totalBeneficiaries: 1,
      totalAmount: 100,
      items: [{
        payoutId: PAYOUT_1,
        itemId: ITEM_1,
        farmerCode: 'F001',
        customerName: 'Ramesh',
        bankAccount: '123456789012',
        bankIfsc: 'UBIN0530789',
        amount: 100,
        referenceNumber: 'REF-1',
      }],
    };
    await assert.rejects(() => ubSer.serialize(sampleDetail), (err) => err.code === 'DAIRY_DEBIT_ACCOUNT_NOT_CONFIGURED');
    await assert.rejects(() => neftSer.serialize(sampleDetail), (err) => err.code === 'DAIRY_DEBIT_ACCOUNT_NOT_CONFIGURED');

    // 7c: Production certification blocker remains intact
    process.env['UNION_BANK_ENV'] = 'PRODUCTION';
    const prodClientUnready = new UnionBankApiClient({ environment: 'PRODUCTION' });
    await assert.rejects(
      () => prodClientUnready.submitBatch({
        batchId: BATCH_A,
        batchNumber: 'BATCH-PROD',
        organizationId: ORG_A,
        debitAccountNumber: '053211010009999',
        valueDate: '2026-11-28',
        items: sampleDetail.items,
      }),
      (err) => err.code === 'UNION_BANK_CREDENTIALS_MISSING'
    );
    const prodClientCertBlocked = new UnionBankApiClient({
      environment: 'PRODUCTION',
      corporateId: 'CORP1',
      clientId: 'CID1',
      clientSecret: 'CSEC1',
      baseUrl: 'https://api.unionbank.example',
      debitAccountNumber: '053211010009999',
    });
    await assert.rejects(
      () => prodClientCertBlocked.submitBatch({
        batchId: BATCH_A,
        batchNumber: 'BATCH-PROD',
        organizationId: ORG_A,
        debitAccountNumber: '053211010009999',
        valueDate: '2026-11-28',
        items: sampleDetail.items,
      }),
      (err) => err.code === 'UNION_BANK_GATEWAY_CERTIFICATION_REQUIRED' && err.statusCode === 502
    );

    // 7d: UnionBankSubmissionService two-phase transaction boundary + masking + unconfigured debit reject
    process.env['UNION_BANK_ENV'] = 'UAT';
    let inTx = false;
    let txPhase = 0;
    const events = [];
    const storedSubs = [];
    let batchStatusState = 'APPROVED';

    const mockSubTenantDb = {
      async query() {
        throw new Error('Submission service must never call tenantDb.query outside withTransaction');
      },
      async withTransaction(fn) {
        txPhase += 1;
        inTx = true;
        events.push(`BEGIN-${txPhase}`);
        const client = {
          async query(sql, params = []) {
            const s = sql.replace(/\s+/g, ' ').trim();
            if (s.startsWith('SELECT * FROM payment_batches')) {
              return {
                rows: [{
                  id: BATCH_A,
                  organization_id: ORG_A,
                  batch_number: 'BATCH-2026-S1',
                  status: batchStatusState,
                  approved_by: 'checker-1',
                  created_by: 'maker-1',
                }],
              };
            }
            if (s.startsWith('SELECT * FROM bank_submissions WHERE organization_id =')) {
              const found = storedSubs.find((x) => x.idempotency_key === params[1]);
              return { rows: found ? [found] : [] };
            }
            if (s.startsWith('SELECT bank_debit_account_encrypted FROM organizations')) {
              return { rows: [{ bank_debit_account_encrypted: null }] };
            }
            if (s.includes('FROM payment_batch_items bi JOIN customers c')) {
              return {
                rows: [{
                  item_id: ITEM_1,
                  payout_id: PAYOUT_1,
                  amount: '450.00',
                  bank_ifsc: 'UBIN0530789',
                  beneficiary_reference: 'REF-1',
                  customer_id: CUST_1,
                  farmer_code: 'F001',
                  full_name: 'Ramesh',
                  bank_account_number: '123456789012',
                  beneficiary_status: 'ACTIVE',
                }],
              };
            }
            if (s.startsWith('INSERT INTO bank_submissions')) {
              storedSubs.push({
                id: params[0],
                organization_id: params[1],
                batch_id: params[2],
                submission_type: params[3],
                file_format: params[4],
                file_name: params[5],
                file_hash_sha256: params[6],
                total_records: params[7],
                total_amount: params[8],
                submission_reference: params[9],
                idempotency_key: params[10],
                status: params[11],
                submitted_at: new Date().toISOString(),
              });
              batchStatusState = params[11] === 'GENERATED' ? 'PROCESSING' : 'SUBMITTED_TO_BANK';
            }
            if (s.startsWith('UPDATE bank_submissions')) {
              const target = storedSubs[storedSubs.length - 1];
              if (target) {
                if (s.includes("SET status = 'PROCESSING'")) {
                  target.status = 'PROCESSING';
                  target.bank_acknowledgement_ref = params[0];
                } else if (s.includes("SET status = 'TIMEOUT_UNKNOWN'")) {
                  target.status = 'TIMEOUT_UNKNOWN';
                }
              }
            }
            return { rows: [], rowCount: 1 };
          },
        };
        try {
          const out = await fn(client);
          events.push(`COMMIT-${txPhase}`);
          return out;
        } catch (err) {
          events.push(`ROLLBACK-${txPhase}`);
          throw err;
        } finally {
          inTx = false;
        }
      },
    };
    tenantDbManager.getStrictTenantDb = async () => mockSubTenantDb;

    // Missing debit account fails closed inside TX1
    await assert.rejects(
      () => UnionBankSubmissionService.submitBatch({
        batchId: BATCH_A,
        submissionType: 'HOST_TO_HOST_API',
      }, makeAuth()),
      (err) => err.code === 'DAIRY_DEBIT_ACCOUNT_NOT_CONFIGURED'
    );

    // Host-to-host two-phase submission: external HTTP runs strictly AFTER COMMIT-1 and BEFORE BEGIN-2
    events.length = 0;
    txPhase = 0;
    let httpCalls = 0;
    let inTxDuringHttp = null;
    UnionBankSubmissionService['apiClient'].submitBatch = async (payload) => {
      httpCalls += 1;
      inTxDuringHttp = inTx;
      events.push('EXTERNAL_HTTP');
      return {
        success: true,
        bankTransmissionReference: 'UBI-TX-TEST',
        acknowledgementNumber: 'ACK-1001',
        submissionTimestamp: new Date().toISOString(),
        environment: 'UAT',
      };
    };

    const subRes = await UnionBankSubmissionService.submitBatch({
      batchId: BATCH_A,
      submissionType: 'HOST_TO_HOST_API',
      debitAccountNumber: '053211010009999',
      idempotencyKey: 'SUB-IDEM-1',
    }, makeAuth());

    assert.equal(inTxDuringHttp, false, 'External Union Bank HTTP call MUST NOT run inside open DB transaction');
    assert.deepEqual(events, ['BEGIN-1', 'COMMIT-1', 'EXTERNAL_HTTP', 'BEGIN-2', 'COMMIT-2']);
    assert.equal(subRes.status, 'PROCESSING');
    assert.equal(subRes.debitAccountMask, 'XXXX-XXXX-9999');
    assert.equal(subRes.bankAcknowledgementRef, 'ACK-1001');

    // Never log raw account numbers
    const allLogs = capturedLogs.join('\n');
    assert.equal(allLogs.includes('053211010009999'), false, 'Logs must never expose raw dairy debit account');
    assert.equal(allLogs.includes('123456789012'), false, 'Logs must never expose raw beneficiary account');

    // Idempotent retry replays without duplicate API call or DB submission row
    const replaySub = await UnionBankSubmissionService.submitBatch({
      batchId: BATCH_A,
      submissionType: 'HOST_TO_HOST_API',
      debitAccountNumber: '053211010009999',
      idempotencyKey: 'SUB-IDEM-1',
    }, makeAuth());
    assert.equal(httpCalls, 1, 'Idempotent retry must not repeat external Union Bank HTTP call');
    assert.equal(replaySub.isIdempotentReplay, true);

    // Timeout on new batch persists TIMEOUT_UNKNOWN and never marks PAID
    batchStatusState = 'APPROVED';
    UnionBankSubmissionService['apiClient'].submitBatch = async () => {
      events.push('EXTERNAL_HTTP_TIMEOUT');
      throw new Error('ETIMEDOUT bank gateway');
    };
    await assert.rejects(
      () => UnionBankSubmissionService.submitBatch({
        batchId: BATCH_A,
        submissionType: 'HOST_TO_HOST_API',
        debitAccountNumber: '053211010009999',
        idempotencyKey: 'SUB-IDEM-TIMEOUT',
      }, makeAuth()),
      (err) => err.code === 'UNION_BANK_TIMEOUT_UNKNOWN' && err.statusCode === 504
    );
    assert.equal(storedSubs[storedSubs.length - 1].status, 'TIMEOUT_UNKNOWN');
  } finally {
    logger.info = origLoggerInfo;
    UnionBankSubmissionService['apiClient'].submitBatch = origApiSubmit;
    tenantDbManager.getStrictTenantDb = origStrict;
    if (origEnv === undefined) delete process.env['UNION_BANK_ENV'];
    else process.env['UNION_BANK_ENV'] = origEnv;
    if (origDebitEnv === undefined) delete process.env['UNION_BANK_DEBIT_ACCOUNT'];
    else process.env['UNION_BANK_DEBIT_ACCOUNT'] = origDebitEnv;
  }
});

test('8. UnionBankStatusInquiryService executes HTTP outside TX, never marks UNKNOWN as FAILED, and uses strict tenant DB', async () => {
  const origStrict = tenantDbManager.getStrictTenantDb.bind(tenantDbManager);
  const origQueryStatus = UnionBankStatusInquiryService['apiClient'].queryPaymentStatus;
  let inTx = false;
  let txSeq = 0;
  let httpInsideTx = null;
  let itemStatus = 'UNKNOWN';

  try {
    tenantDbManager.getStrictTenantDb = async () => ({
      async withTransaction(fn) {
        txSeq += 1;
        inTx = true;
        const client = {
          async query(sql, params = []) {
            const s = sql.replace(/\s+/g, ' ').trim();
            if (s.includes('FROM payment_batch_items bi JOIN payment_batches pb')) {
              return {
                rows: [{
                  item_id: ITEM_1,
                  batch_id: BATCH_A,
                  payout_id: PAYOUT_1,
                  customer_id: CUST_1,
                  amount: '300.00',
                  status: itemStatus,
                  beneficiary_reference: 'REF-INQ-1',
                  bank_utr: null,
                  organization_id: ORG_A,
                  batch_number: 'BATCH-INQ-1',
                  farmer_code: 'F001',
                  center_id: CENTER_A,
                  currency: 'INR',
                  payment_method: 'BANK_TRANSFER',
                  bank_account_mask: 'XXXX9001',
                }],
              };
            }
            if (s.startsWith('SELECT organization_id FROM payment_batches')) {
              return { rows: [{ organization_id: ORG_A }] };
            }
            if (s.startsWith('SELECT status, bank_utr FROM payment_batch_items')) {
              return { rows: [{ status: itemStatus, bank_utr: null }] };
            }
            if (s.startsWith('UPDATE payment_batch_items')) {
              if (s.includes("SET status = 'FAILED'")) itemStatus = 'FAILED';
              if (s.includes("SET status = 'UNKNOWN'")) itemStatus = 'UNKNOWN';
            }
            if (s.startsWith('SELECT COUNT(id)::int AS total')) {
              return {
                rows: [{
                  total: 1,
                  successful_count: 0,
                  successful_amount: '0.00',
                  failed_count: 0,
                  failed_amount: '0.00',
                  reversed_count: 0,
                  unknown_count: 1,
                  pending_count: 0,
                  pending_amount: '0.00',
                }],
              };
            }
            return { rows: [], rowCount: 1 };
          },
        };
        try {
          return await fn(client);
        } finally {
          inTx = false;
        }
      },
    });

    UnionBankStatusInquiryService['apiClient'].queryPaymentStatus = async (ref) => {
      httpInsideTx = inTx;
      return {
        customerReference: ref,
        amount: 0,
        status: 'UNKNOWN',
        failureReason: 'Clearing pending response',
      };
    };

    const res = await UnionBankStatusInquiryService.queryItemStatus(ITEM_1, makeAuth());
    assert.equal(httpInsideTx, false, 'External status inquiry HTTP call must execute outside DB transaction');
    assert.equal(txSeq, 2, 'Status inquiry reads in TX1 and writes result in TX2');
    assert.equal(res.currentStatus, 'UNKNOWN');
    assert.notEqual(res.currentStatus, 'FAILED', 'UNKNOWN status must NEVER become FAILED');
    assert.equal(res.canSafeRetry, false);
  } finally {
    tenantDbManager.getStrictTenantDb = origStrict;
    UnionBankStatusInquiryService['apiClient'].queryPaymentStatus = origQueryStatus;
  }
});

test('9. ReconciliationService: webhook fails closed without org or valid HMAC, resolves records in single strict tenant TX', async () => {
  const cryptoMod = await import('node:crypto');
  const reconSvc = new ReconciliationService();
  const origStrict = tenantDbManager.getStrictTenantDb.bind(tenantDbManager);
  const origNotify = NotificationService.enqueueNotification;
  const webhookSecret = process.env['PAYMENT_WEBHOOK_SECRET'] || process.env['JWT_SECRET'] || 'restart10-unit-test-secret-key-min-32-chars!!';

  try {
    // Signed webhook WITHOUT organizationId must fail closed (never invent/default org)
    const missingOrgPayload = JSON.stringify({
      eventId: 'evt-no-org-1',
      referenceNumber: 'REF-NO-ORG',
      amount: 500,
    });
    const sigMissingOrg = cryptoMod.createHmac('sha256', webhookSecret).update(missingOrgPayload).digest('hex');
    await assert.rejects(
      () => reconSvc.processWebhook(missingOrgPayload, sigMissingOrg, String(Date.now())),
      (err) => err.code === 'WEBHOOK_ORGANIZATION_REQUIRED' && err.statusCode === 400
    );

    // Invalid HMAC fails closed
    await assert.rejects(
      () => reconSvc.processWebhook(missingOrgPayload, 'bad-hmac', String(Date.now())),
      (err) => err.code === 'INVALID_WEBHOOK_SIGNATURE' && err.statusCode === 400
    );

    // Authenticated dairy context contradicting webhook payload organizationId rejects 403
    const mismatchPayload = JSON.stringify({
      eventId: 'evt-cross-org-1',
      referenceNumber: 'REF-CROSS',
      amount: 500,
      organizationId: ORG_B,
    });
    const sigMismatch = cryptoMod.createHmac('sha256', webhookSecret).update(mismatchPayload).digest('hex');
    await assert.rejects(
      () => reconSvc.processWebhook(mismatchPayload, sigMismatch, String(Date.now()), makeAuth({ organizationId: ORG_A })),
      (err) => err.code === 'CROSS_ORG_WEBHOOK_DENIED' && err.statusCode === 403
    );

    // Manual resolveRecord CONFIRMED_SETTLED executes settle_customer_payout inside SAME strict tenant TX and notifies post-commit
    let committed = 0;
    let notifiedAfterCommit = null;
    NotificationService.enqueueNotification = async () => {
      notifiedAfterCommit = committed;
    };
    tenantDbManager.getStrictTenantDb = async (orgId) => {
      assert.equal(orgId, ORG_A);
      return {
        async withTransaction(fn) {
          const queries = [];
          const client = {
            async query(sql, params = []) {
              const s = sql.replace(/\s+/g, ' ').trim();
              queries.push(s);
              if (s.includes('FROM payment_reconciliation_records WHERE id =')) {
                return {
                  rows: [{
                    id: 'rec-1',
                    organization_id: ORG_A,
                    external_reference: 'UTR-MANUAL-01',
                    matched_payout_id: PAYOUT_1,
                    matched_batch_id: BATCH_A,
                    reconciliation_status: 'UNMATCHED',
                  }],
                };
              }
              if (s.includes('FROM customer_payouts WHERE id =') && s.includes('FOR UPDATE')) {
                return {
                  rows: [{
                    id: PAYOUT_1,
                    organization_id: ORG_A,
                    batch_id: BATCH_A,
                    amount: '500.00',
                    customer_id: CUST_1,
                    center_id: CENTER_A,
                    status: 'SUBMITTED',
                    currency: 'INR',
                    payment_method: 'BANK_TRANSFER',
                    bank_account_mask: 'XXXX1111',
                  }],
                };
              }
              if (s.startsWith('SELECT public.settle_customer_payout')) {
                return {
                  rows: [{
                    receipt: {
                      payoutId: PAYOUT_1,
                      status: 'SETTLED',
                      amount: 500,
                      referenceNumber: params[2],
                      settledAt: new Date().toISOString(),
                      isIdempotentReplay: false,
                    },
                  }],
                };
              }
              if (s.startsWith('SELECT COUNT(id)::int AS total')) {
                return {
                  rows: [{
                    total: 1,
                    successful_count: 1,
                    successful_amount: '500.00',
                    failed_count: 0,
                    failed_amount: '0.00',
                    reversed_count: 0,
                    unknown_count: 0,
                    pending_count: 0,
                    pending_amount: '0.00',
                  }],
                };
              }
              return { rows: [], rowCount: 1 };
            },
          };
          const out = await fn(client);
          committed += 1;
          assert.ok(queries.some((q) => q.includes('public.settle_customer_payout')));
          assert.ok(queries.some((q) => q.startsWith('UPDATE payment_reconciliation_records')));
          return out;
        },
      };
    };

    const resResolve = await reconSvc.resolveRecord(
      'rec-1',
      'CONFIRMED_SETTLED',
      'Treasury verified UTR manually',
      makeAuth(),
      PAYOUT_1
    );
    assert.equal(resResolve.action, 'CONFIRMED_SETTLED');
    assert.equal(notifiedAfterCommit, 1, 'Notification must fire only after COMMIT');
  } finally {
    tenantDbManager.getStrictTenantDb = origStrict;
    NotificationService.enqueueNotification = origNotify;
  }
});

test('10. PayoutService non-tx routes, BatchService & PaymentController.getFarmerPaymentOverview enforce strict tenant DB', async () => {
  const payoutSvc = new PayoutService();
  const origStrict = tenantDbManager.getStrictTenantDb.bind(tenantDbManager);
  const strictResolved = [];

  try {
    tenantDbManager.getStrictTenantDb = async (orgId, opts) => {
      strictResolved.push({ orgId, opts });
      return {
        async withTransaction(fn) {
          const client = {
            async query(sql) {
              const s = sql.replace(/\s+/g, ' ').trim();
              if (s.includes('total_payable')) return { rows: [{ total_payable: '1200.00' }] };
              if (s.includes('total_paid')) return { rows: [{ total_paid: '300.00', paid_count: 1 }] };
              if (s.includes('pending_amount')) return { rows: [{ pending_amount: '500.00', pending_count: 1 }] };
              if (s.includes('failed_amount')) return { rows: [{ failed_amount: '0.00', failed_count: 0 }] };
              if (s.includes('unreconciled_amount')) return { rows: [{ unreconciled_amount: '500.00', unreconciled_count: 1 }] };
              if (s.includes('FROM customer_payouts p')) {
                return { rows: [{ id: PAYOUT_1, organization_id: ORG_A, center_id: CENTER_A, customer_id: CUST_1, amount: '500.00', status: 'SUBMITTED' }] };
              }
              if (s.includes('FROM payment_batches WHERE id =')) {
                return { rows: [{ id: BATCH_A, organization_id: ORG_A, status: 'SUBMITTED', total_beneficiaries: 1, total_amount: '500.00', successful_count: 0, successful_amount: '0.00', failed_count: 0, failed_amount: '0.00', pending_count: 1, pending_amount: '500.00' }] };
              }
              return { rows: [], rowCount: 0 };
            },
          };
          return fn(client);
        },
      };
    };

    await payoutSvc.getPayoutById(PAYOUT_1, makeAuth());
    await batchService.getBatchById(BATCH_A, makeAuth());

    let overviewRes = null;
    await PaymentController.getFarmerPaymentOverview(
      { auth: makeAuth(), query: {}, body: {}, headers: {} },
      { status: () => ({ json: (b) => { overviewRes = b; } }) },
      (err) => { if (err) throw err; }
    );
    assert.equal(overviewRes.data.totalPayableAmount, 1200);
    assert.equal(strictResolved.length, 3);
    for (const c of strictResolved) {
      assert.equal(c.orgId, ORG_A);
      assert.deepEqual(c.opts, { bypassCache: true, strictOperational: true });
    }

    // Platform federation ID must fail closed across PayoutService, BatchService, ReceiptService
    await assert.rejects(
      () => payoutSvc.getPayoutById(PAYOUT_1, makeAuth({ role: 'DAIRY_OWNER', organizationId: PLATFORM_FEDERATION_DAIRY_ID })),
      (err) => err.code === 'CONTROL_PLANE_TARGET_FORBIDDEN'
    );
    await assert.rejects(
      () => batchService.getBatchById(BATCH_A, makeAuth({ role: 'DAIRY_OWNER', organizationId: PLATFORM_FEDERATION_DAIRY_ID })),
      (err) => err.code === 'CONTROL_PLANE_TARGET_FORBIDDEN'
    );
  } finally {
    tenantDbManager.getStrictTenantDb = origStrict;
  }
});

test('11. Shared beneficiary bank helpers: AES-256-GCM length/fail-closed encryption, strict decrypt, legacy policy & safe masking', async () => {
  const synthAccount = '987654321098';
  const written = encryptBeneficiaryBankAccount(synthAccount, 'Farmer Alpha');
  assert.ok(written.encryptedAccount.length > 50, 'AES-256-GCM ciphertext must exceed VARCHAR(50)');
  assert.match(written.encryptedAccount, /^[0-9a-f]{24}:[0-9a-f]{32}:(?:[0-9a-f]{2})+$/i);
  assert.equal(written.mask, 'XXXX-XXXX-1098');
  assert.equal(written.cleanAccount, synthAccount);

  // Decryption round-trip
  const decrypted = decryptStoredBankAccountFailClosed(written.encryptedAccount, { contextName: 'Farmer Alpha' });
  assert.equal(decrypted.accountNumber, synthAccount);
  assert.equal(decrypted.source, 'ENCRYPTED');
  assert.equal(decrypted.mask, 'XXXX-XXXX-1098');

  // Safe masking never extracts trailing hex digits from AES ciphertext
  assert.equal(maskAccountNumber(written.encryptedAccount), 'XXXX');
  assert.equal(
    resolveBeneficiaryBankMask({ storedMask: null, storedAccount: written.encryptedAccount, allowDecryptFallback: false }),
    null
  );
  assert.equal(
    resolveBeneficiaryBankMask({ storedMask: null, storedAccount: written.encryptedAccount, allowDecryptFallback: true }),
    'XXXX-XXXX-1098'
  );

  // Tampered authTag / ciphertext & malformed envelopes must fail closed (never return ciphertext)
  const lastChar = written.encryptedAccount.slice(-1);
  const tampered = written.encryptedAccount.slice(0, -1) + (lastChar === '0' ? '1' : '0');
  assert.throws(
    () => decryptStoredBankAccountFailClosed(tampered, { contextName: 'Farmer Alpha' }),
    (err) => err.code === 'INVALID_ENCRYPTED_BANK_ACCOUNT'
  );
  assert.throws(
    () => decryptStoredBankAccountFailClosed('0123:4567:89abcdef123456', { contextName: 'Farmer Alpha' }),
    (err) => err.code === 'INVALID_ENCRYPTED_BANK_ACCOUNT'
  );

  // Fail-closed encryption failure: no plaintext fallback allowed
  const origEncrypt = CredentialEncryption.encrypt;
  try {
    CredentialEncryption.encrypt = () => {
      throw new Error('Simulated KMS/key failure');
    };
    assert.throws(
      () => encryptBeneficiaryBankAccount(synthAccount, 'Farmer Alpha'),
      (err) => err.code === 'BENEFICIARY_BANK_ENCRYPTION_FAILED' && !err.message.includes(synthAccount)
    );
  } finally {
    CredentialEncryption.encrypt = origEncrypt;
  }

  // Strict legacy plaintext compatibility policy: accepts valid 9-18 numeric, counts safely without raw digits, rejects ambiguous
  resetLegacyPlaintextDetectionCount();
  const legacyAcc = '123456789012';
  const origInfo = logger.info;
  const capturedLogs = [];
  logger.info = (...args) => { capturedLogs.push(JSON.stringify(args)); };
  try {
    const legacyOut = decryptStoredBankAccountFailClosed(legacyAcc, { contextName: 'Legacy Farmer' });
    assert.equal(legacyOut.accountNumber, legacyAcc);
    assert.equal(legacyOut.source, 'LEGACY_PLAINTEXT');
    assert.equal(legacyOut.mask, 'XXXX-XXXX-9012');
    assert.equal(getLegacyPlaintextDetectionCount(), 1);
    for (const badLegacy of ['000000000000', '12345678', '1234567890123456789', 'ACCT123456789', 'deadbeef12345678']) {
      assert.throws(
        () => decryptStoredBankAccountFailClosed(badLegacy, { contextName: 'Bad Legacy' }),
        (err) => err.code === 'INVALID_BANK_ACCOUNT'
      );
    }
    const settlementLegacy = validateBeneficiaryBankAccountForSettlement(legacyAcc, { contextName: 'Legacy Farmer' });
    assert.equal(settlementLegacy.isValid, true);
    assert.equal(settlementLegacy.mask, 'XXXX-XXXX-9012');
    for (const logLine of capturedLogs) {
      assert.equal(logLine.includes(legacyAcc), false, 'Raw legacy bank account must never be logged');
    }
  } finally {
    logger.info = origInfo;
  }
});

test('12. BatchService.updateBeneficiaryBankDetails: encrypted write, no plaintext fallback, masked audit log & tenant isolation', async () => {
  const origStrict = tenantDbManager.getStrictTenantDb.bind(tenantDbManager);
  const origEncrypt = CredentialEncryption.encrypt;
  const origInfo = logger.info;
  const infoLogs = [];
  logger.info = (...args) => { infoLogs.push(JSON.stringify(args)); };

  const custState = {
    id: CUST_1,
    organization_id: ORG_A,
    full_name: 'Ramesh Farmer',
    bank_name: 'Old Bank',
    bank_account_number: '111122223333',
    bank_account_mask: 'XXXX-XXXX-3333',
    bank_ifsc_code: 'SBIN0001234',
    bank_account_holder_name: 'Ramesh Farmer',
    bank_verification_status: 'UNVERIFIED',
  };
  const updates = [];
  const auditInserts = [];

  tenantDbManager.getStrictTenantDb = async () => ({
    async withTransaction(fn) {
      const client = {
        async query(sql, params = []) {
          const s = sql.replace(/\s+/g, ' ').trim();
          if (s.startsWith('SELECT * FROM customers WHERE id = $1')) {
            return { rows: params[0] === CUST_1 ? [{ ...custState }] : [] };
          }
          if (s.startsWith('UPDATE customers SET bank_name =')) {
            updates.push(params);
            custState.bank_name = params[0];
            custState.bank_account_number = params[1];
            custState.bank_account_mask = params[2];
            return { rows: [], rowCount: 1 };
          }
          if (s.startsWith('INSERT INTO beneficiary_audit_logs')) {
            auditInserts.push(params);
            return { rows: [], rowCount: 1 };
          }
          if (s.startsWith('SELECT organization_id FROM customers WHERE id =')) {
            return { rows: params[0] === CUST_1 ? [{ organization_id: ORG_A }] : [] };
          }
          if (s.startsWith('SELECT bal.*, u.full_name')) {
            return {
              rows: auditInserts.map((a) => ({
                previous_account_mask: a[4],
                new_account_mask: a[5],
              })),
            };
          }
          return { rows: [], rowCount: 0 };
        },
      };
      return fn(client);
    },
  });

  try {
    const newAcct = '556677889900';
    const res = await batchService.updateBeneficiaryBankDetails(
      CUST_1,
      {
        bankName: 'Union Bank of India',
        bankAccountNumber: newAcct,
        bankIfscCode: 'UBIN0530789',
        bankAccountHolderName: 'Ramesh Farmer',
      },
      makeAuth()
    );

    assert.equal(res.bankAccountNumberMask, 'XXXX-XXXX-9900');
    assert.equal(JSON.stringify(res).includes(newAcct), false, 'Response must not expose plaintext account');
    assert.equal(updates.length, 1);
    assert.ok(updates[0][1].length > 50, 'Stored ciphertext must exceed 50 chars');
    assert.notEqual(updates[0][1], newAcct);
    assert.equal(CredentialEncryption.decrypt(updates[0][1]), newAcct);
    assert.equal(updates[0][2], 'XXXX-XXXX-9900');

    // Audit log contains strictly masked values
    assert.equal(auditInserts.length, 1);
    assert.equal(auditInserts[0][4], 'XXXX-XXXX-3333');
    assert.equal(auditInserts[0][5], 'XXXX-XXXX-9900');
    assert.equal(JSON.stringify(auditInserts[0]).includes(newAcct), false);
    assert.equal(JSON.stringify(infoLogs).includes(newAcct), false);

    // Tenant B cannot read or modify Tenant A customer bank details
    await assert.rejects(
      () => batchService.updateBeneficiaryBankDetails(
        CUST_1,
        {
          bankName: 'Union Bank',
          bankAccountNumber: '998877665544',
          bankIfscCode: 'UBIN0530789',
          bankAccountHolderName: 'Attacker',
        },
        makeAuth({ organizationId: ORG_B })
      ),
      (err) => err.code === 'CROSS_ORG_ACCESS_DENIED'
    );
    await assert.rejects(
      () => batchService.getBeneficiaryAuditHistory(CUST_1, makeAuth({ organizationId: ORG_B })),
      (err) => err.code === 'CROSS_ORG_ACCESS_DENIED'
    );

    // Fail-closed when encryption fails: zero plaintext fallback UPDATE/INSERT
    CredentialEncryption.encrypt = () => {
      throw new Error('Simulated cipher failure');
    };
    const updatesBefore = updates.length;
    await assert.rejects(
      () => batchService.updateBeneficiaryBankDetails(
        CUST_1,
        {
          bankName: 'Union Bank',
          bankAccountNumber: '445566778899',
          bankIfscCode: 'UBIN0530789',
          bankAccountHolderName: 'Ramesh Farmer',
        },
        makeAuth()
      ),
      (err) => err.code === 'BENEFICIARY_BANK_ENCRYPTION_FAILED'
    );
    assert.equal(updates.length, updatesBefore, 'Plaintext fallback write must never occur');
  } finally {
    CredentialEncryption.encrypt = origEncrypt;
    tenantDbManager.getStrictTenantDb = origStrict;
    logger.info = origInfo;
  }
});

test('13. SettlementCalculationService & BatchService.createBatch: decrypt validation, stored masks, tampered exclusion & payout/item mask persistence', async () => {
  const origStrict = tenantDbManager.getStrictTenantDb.bind(tenantDbManager);
  const encValid = CredentialEncryption.encrypt('246813579024');
  const encForTamper = CredentialEncryption.encrypt('112233445566');
  const tampered = encForTamper.slice(0, -1) + (encForTamper.slice(-1) === '0' ? '1' : '0');
  const legacyValid = '369258147036';

  const insertedPayouts = [];
  const insertedBatchItems = [];
  const nonPeriodQueries = [];

  const mockClient = {
    async query(sql, params = []) {
      const s = sql.replace(/\s+/g, ' ').trim();
      if (s.includes('FROM customers c JOIN dairy_centers dc')) {
        return {
          rows: [
            {
              id: CUST_1,
              farmer_code: 'F001',
              full_name: 'Encrypted Valid',
              primary_center_id: CENTER_A,
              center_name: 'Center A',
              center_code: 'CA',
              bank_name: 'Union Bank of India',
              bank_account_number: encValid,
              bank_account_mask: 'XXXX-XXXX-9024',
              bank_ifsc_code: 'UBIN0530789',
              bank_account_holder_name: 'Encrypted Valid',
              bank_verification_status: 'VERIFIED',
              beneficiary_status: 'ACTIVE',
            },
            {
              id: CUST_2,
              farmer_code: 'F002',
              full_name: 'Tampered Cipher',
              primary_center_id: CENTER_A,
              center_name: 'Center A',
              center_code: 'CA',
              bank_name: 'Union Bank of India',
              bank_account_number: tampered,
              bank_account_mask: 'XXXX-XXXX-5566',
              bank_ifsc_code: 'UBIN0530789',
              bank_account_holder_name: 'Tampered Cipher',
              bank_verification_status: 'VERIFIED',
              beneficiary_status: 'ACTIVE',
            },
            {
              id: '55555555-5555-4555-8555-555555555553',
              farmer_code: 'F003',
              full_name: 'Legacy Numeric',
              primary_center_id: CENTER_A,
              center_name: 'Center A',
              center_code: 'CA',
              bank_name: 'SBI',
              bank_account_number: legacyValid,
              bank_account_mask: null,
              bank_ifsc_code: 'SBIN0001234',
              bank_account_holder_name: 'Legacy Numeric',
              bank_verification_status: 'VERIFIED',
              beneficiary_status: 'ACTIVE',
            },
          ],
        };
      }
      if (s.includes('WITH period_collections AS')) {
        return {
          rows: [
            {
              customer_id: CUST_1,
              opening_balance: '0.00',
              gross_milk_amount: '500.00',
              milk_quantity_liters: '10.00',
              collection_count: 1,
              deductions_amount: '0.00',
              adjustments_credit: '0.00',
              adjustments_debit: '0.00',
              already_paid_amount: '0.00',
              pending_reserved_amount: '0.00',
              collection_ids: [],
              txn_ids: [],
            },
            {
              customer_id: CUST_2,
              opening_balance: '0.00',
              gross_milk_amount: '300.00',
              milk_quantity_liters: '6.00',
              collection_count: 1,
              deductions_amount: '0.00',
              adjustments_credit: '0.00',
              adjustments_debit: '0.00',
              already_paid_amount: '0.00',
              pending_reserved_amount: '0.00',
              collection_ids: [],
              txn_ids: [],
            },
            {
              customer_id: '55555555-5555-4555-8555-555555555553',
              opening_balance: '0.00',
              gross_milk_amount: '200.00',
              milk_quantity_liters: '4.00',
              collection_count: 1,
              deductions_amount: '0.00',
              adjustments_credit: '0.00',
              adjustments_debit: '0.00',
              already_paid_amount: '0.00',
              pending_reserved_amount: '0.00',
              collection_ids: [],
              txn_ids: [],
            },
          ],
        };
      }
      if (s.includes('FROM customers c JOIN customer_ledger_accounts cla')) {
        nonPeriodQueries.push(s);
        return {
          rows: [{
            id: CUST_1,
            farmer_code: 'F001',
            full_name: 'Encrypted Valid',
            primary_center_id: CENTER_A,
            bank_name: 'Union Bank of India',
            bank_account_number: encValid,
            bank_account_mask: 'XXXX-XXXX-9024',
            bank_ifsc_code: 'UBIN0530789',
            current_balance: '450.00',
          }],
        };
      }
      if (s.startsWith('INSERT INTO customer_payouts')) {
        insertedPayouts.push(params);
      }
      if (s.startsWith('INSERT INTO payment_batch_items')) {
        insertedBatchItems.push(params);
      }
      return { rows: [], rowCount: 0 };
    },
  };

  tenantDbManager.getStrictTenantDb = async () => ({
    async withTransaction(fn) {
      return fn(mockClient);
    },
  });

  try {
    const preview = await SettlementCalculationService.calculateSettlement(
      {
        organizationId: ORG_A,
        periodStart: '2026-11-01',
        periodEnd: '2026-11-15',
      },
      makeAuth(),
      mockClient
    );

    const previewStr = JSON.stringify(preview);
    assert.equal(previewStr.includes('246813579024'), false, 'Preview must never leak plaintext account');
    assert.equal(previewStr.includes(encValid), false, 'Preview must never leak ciphertext');
    assert.equal(previewStr.includes(tampered), false, 'Preview must never leak tampered ciphertext');

    const p1 = preview.farmers.find((f) => f.customerId === CUST_1);
    const p2 = preview.farmers.find((f) => f.customerId === CUST_2);
    const p3 = preview.farmers.find((f) => f.customerId === '55555555-5555-4555-8555-555555555553');
    assert.equal(p1.isBankValid, true);
    assert.equal(p1.bankAccountNumberMask, 'XXXX-XXXX-9024');
    assert.equal(p2.isBankValid, false);
    assert.equal(p2.hasMalformedCiphertext, true);
    assert.equal(p2.bankAccountNumberMask, 'XXXX-XXXX-5566');
    assert.equal(p3.isBankValid, true);
    assert.equal(p3.bankAccountNumberMask, 'XXXX-XXXX-7036');
    assert.equal(preview.farmersWithInvalidBankCount, 1);
    assert.equal(preview.totalEligibleFarmers, 2);

    // Period batch creation excludes tampered-ciphertext farmer & persists valid masks to both tables
    const batchRes = await batchService.createBatch(
      {
        billingPeriodStart: '2026-11-01',
        billingPeriodEnd: '2026-11-15',
        idempotencyKey: 'unit-r104-period-batch',
      },
      makeAuth()
    );
    assert.equal(batchRes.totalBeneficiaries, 2);
    assert.equal(batchRes.totalAmount, 700);
    assert.deepEqual(insertedPayouts.map((p) => p[10]), ['XXXX-XXXX-9024', 'XXXX-XXXX-7036']);
    assert.deepEqual(insertedBatchItems.map((p) => p[5]), ['XXXX-XXXX-9024', 'XXXX-XXXX-7036']);

    // Non-period batch creation selects c.bank_account_mask & preserves XXXX-XXXX-9024
    insertedPayouts.length = 0;
    insertedBatchItems.length = 0;
    const nonPeriodBatch = await batchService.createBatch(
      { idempotencyKey: 'unit-r104-nonperiod-batch' },
      makeAuth()
    );
    assert.ok(nonPeriodQueries[0].includes('c.bank_account_mask'));
    assert.equal(nonPeriodBatch.beneficiaries[0].bankAccountMask, 'XXXX-XXXX-9024');
    assert.equal(insertedPayouts[0][10], 'XXXX-XXXX-9024');
    assert.equal(insertedBatchItems[0][5], 'XXXX-XXXX-9024');
  } finally {
    tenantDbManager.getStrictTenantDb = origStrict;
  }
});

test('14. BankFileService.exportBatch: decrypts AES beneficiary & debit accounts, fails closed on tampering & invalid IFSC', async () => {
  const origStrict = tenantDbManager.getStrictTenantDb.bind(tenantDbManager);
  const encBeneficiary = CredentialEncryption.encrypt('778899001122');
  const encDebit = CredentialEncryption.encrypt('053211010009999');
  const tamperedBeneficiary = encBeneficiary.slice(0, -1) + (encBeneficiary.slice(-1) === '0' ? '1' : '0');
  const tamperedDebit = encDebit.slice(0, -1) + (encDebit.slice(-1) === '0' ? '1' : '0');

  let itemAccountToReturn = encBeneficiary;
  let orgDebitToReturn = encDebit;
  let itemIfscToReturn = 'UBIN0530789';

  tenantDbManager.getStrictTenantDb = async () => ({
    async withTransaction(fn) {
      const client = {
        async query(sql) {
          const s = sql.replace(/\s+/g, ' ').trim();
          if (s.startsWith('SELECT * FROM payment_batches WHERE id =')) {
            return {
              rows: [{
                id: BATCH_A,
                organization_id: ORG_A,
                batch_number: 'BATCH-EXP-01',
                status: 'APPROVED',
                approved_by: 'checker-1',
                created_by: 'maker-1',
                total_beneficiaries: 1,
                total_amount: '500.00',
              }],
            };
          }
          if (s.startsWith('SELECT name, bank_debit_account_encrypted FROM organizations')) {
            return { rows: [{ name: 'Sahyadri Dairy', bank_debit_account_encrypted: orgDebitToReturn }] };
          }
          if (s.includes('FROM payment_batch_items bi JOIN customers c')) {
            return {
              rows: [{
                item_id: ITEM_1,
                payout_id: PAYOUT_1,
                amount: '500.00',
                bank_ifsc: itemIfscToReturn,
                beneficiary_reference: 'REF-EXP-1',
                farmer_code: 'F001',
                full_name: 'Ramesh',
                bank_account_number: itemAccountToReturn,
                bank_account_mask: 'XXXX-XXXX-1122',
              }],
            };
          }
          return { rows: [], rowCount: 1 };
        },
      };
      return fn(client);
    },
  });

  try {
    // Happy path: encrypted beneficiary & encrypted org debit decrypted cleanly
    const exported = await BankFileService.exportBatch(BATCH_A, 'UNION_BANK_BULK_NEFT_CSV', makeAuth());
    const file = BankFileService.getExportByToken(exported.downloadToken);
    assert.ok(file.content.includes('778899001122'));
    assert.ok(file.content.includes('053211010009999'));

    // Tampered beneficiary ciphertext fails closed
    itemAccountToReturn = tamperedBeneficiary;
    await assert.rejects(
      () => BankFileService.exportBatch(BATCH_A, 'UNION_BANK_BULK_NEFT_CSV', makeAuth()),
      (err) => err.code === 'INVALID_ENCRYPTED_BANK_ACCOUNT'
    );

    // Tampered encrypted debit account fails closed
    itemAccountToReturn = encBeneficiary;
    orgDebitToReturn = tamperedDebit;
    await assert.rejects(
      () => BankFileService.exportBatch(BATCH_A, 'UNION_BANK_BULK_NEFT_CSV', makeAuth()),
      (err) => err.code === 'INVALID_ENCRYPTED_BANK_ACCOUNT'
    );

    // Invalid IFSC rejected
    orgDebitToReturn = encDebit;
    itemIfscToReturn = 'BADIFSC';
    await assert.rejects(
      () => BankFileService.exportBatch(BATCH_A, 'UNION_BANK_BULK_NEFT_CSV', makeAuth()),
      (err) => err.code === 'INVALID_IFSC_CODE'
    );
  } finally {
    tenantDbManager.getStrictTenantDb = origStrict;
  }
});

test('15. UnionBankSubmissionService encrypted debit/beneficiary & fail-closed rejection; UnionBankReconciliationService canonical mask SQL', async () => {
  const origStrict = tenantDbManager.getStrictTenantDb.bind(tenantDbManager);
  const encBen = CredentialEncryption.encrypt('445566778899');
  const encDebit = CredentialEncryption.encrypt('053211010009999');
  const tamperedBen = encBen.slice(0, -1) + (encBen.slice(-1) === '0' ? '1' : '0');

  let benAccount = encBen;
  let debitEnc = encDebit;

  tenantDbManager.getStrictTenantDb = async () => ({
    async withTransaction(fn) {
      const client = {
        async query(sql) {
          const s = sql.replace(/\s+/g, ' ').trim();
          if (s.startsWith('SELECT * FROM payment_batches WHERE id =')) {
            return {
              rows: [{
                id: BATCH_A,
                organization_id: ORG_A,
                batch_number: 'BATCH-SUB-01',
                status: 'APPROVED',
                approved_by: 'checker-1',
                created_by: 'maker-1',
              }],
            };
          }
          if (s.startsWith('SELECT * FROM bank_submissions WHERE organization_id =')) {
            return { rows: [] };
          }
          if (s.startsWith('SELECT bank_debit_account_encrypted FROM organizations')) {
            return { rows: [{ bank_debit_account_encrypted: debitEnc }] };
          }
          if (s.includes('FROM payment_batch_items bi JOIN customers c')) {
            return {
              rows: [{
                item_id: ITEM_1,
                payout_id: PAYOUT_1,
                amount: '600.00',
                bank_ifsc: 'UBIN0530789',
                beneficiary_reference: 'REF-SUB-1',
                customer_id: CUST_1,
                farmer_code: 'F001',
                full_name: 'Ramesh',
                bank_account_number: benAccount,
                beneficiary_status: 'ACTIVE',
              }],
            };
          }
          return { rows: [], rowCount: 1 };
        },
      };
      return fn(client);
    },
  });

  try {
    const subRes = await UnionBankSubmissionService.submitBatch(
      {
        batchId: BATCH_A,
        submissionType: 'BULK_FILE_EXPORT',
        fileFormat: 'UNION_BANK_BULK_NEFT_CSV',
        idempotencyKey: 'unit-r104-enc-sub',
      },
      makeAuth()
    );
    assert.ok(subRes.fileContent.includes('445566778899'));
    assert.ok(subRes.fileContent.includes('053211010009999'));
    assert.equal(subRes.debitAccountMask, 'XXXX-XXXX-9999');

    benAccount = tamperedBen;
    await assert.rejects(
      () => UnionBankSubmissionService.submitBatch(
        {
          batchId: BATCH_A,
          submissionType: 'BULK_FILE_EXPORT',
          fileFormat: 'UNION_BANK_BULK_NEFT_CSV',
          idempotencyKey: 'unit-r104-tampered-sub',
        },
        makeAuth()
      ),
      (err) => err.code === 'INVALID_ENCRYPTED_BANK_ACCOUNT'
    );

    benAccount = 'ACCT99887766';
    await assert.rejects(
      () => UnionBankSubmissionService.submitBatch(
        {
          batchId: BATCH_A,
          submissionType: 'BULK_FILE_EXPORT',
          fileFormat: 'UNION_BANK_BULK_NEFT_CSV',
          idempotencyKey: 'unit-r104-ambiguous-sub',
        },
        makeAuth()
      ),
      (err) => err.code === 'INVALID_BANK_ACCOUNT'
    );

    // Reconciliation service SQL uses COALESCE canonical mask
    const origNotify15 = NotificationService.enqueueNotification;
    NotificationService.enqueueNotification = async () => ({ queued: true });
    const { tenantDb: reconDb } = createInstrumentedTenantDb({
      itemsRows: [{
        item_id: ITEM_1,
        batch_id: BATCH_A,
        payout_id: PAYOUT_1,
        customer_id: CUST_1,
        amount: '600.00',
        item_status: 'SUBMITTED',
        beneficiary_reference: 'REF-SUB-1',
        bank_utr: null,
        bank_reference_number: null,
        farmer_code: 'F001',
        customer_name: 'Ramesh',
        bank_account_mask: 'XXXX-XXXX-8899',
        center_id: CENTER_A,
        payout_status: 'SUBMITTED',
        payout_reference_number: null,
        payout_currency: 'INR',
        payout_payment_method: 'BANK_TRANSFER',
      }],
    });
    tenantDbManager.getStrictTenantDb = async () => reconDb;
    try {
      const reconOut = await UnionBankReconciliationService.reconcileBatchWithBankData(
        BATCH_A,
        [{ customerReference: 'REF-SUB-1', bankUtr: 'UTR-COALESCE-1', amount: 600, status: 'PAID' }],
        makeAuth()
      );
      assert.equal(reconOut.paidCount, 1);
      const selectItemsQuery = reconDb.getMetrics().executedQueries.find((q) => q.sql.includes('FROM payment_batch_items bi'));
      assert.ok(selectItemsQuery);
      assert.match(
        selectItemsQuery.sql,
        /COALESCE\(bi\.bank_account_mask, cp\.bank_account_mask, c\.bank_account_mask\) AS bank_account_mask/
      );
    } finally {
      NotificationService.enqueueNotification = origNotify15;
    }
  } finally {
    tenantDbManager.getStrictTenantDb = origStrict;
  }
});

test('16. Migration 049 SQL integrity: TEXT width, bank_account_mask backfill filter & create_customer_payout mask contract', () => {
  const sql049 = fs.readFileSync(
    path.join(REPO_ROOT, 'supabase/migrations/049_customer_beneficiary_bank_encryption_and_mask.sql'),
    'utf8'
  );
  const sql049Code = sql049.replace(/--.*$/gm, '');
  assert.match(sql049Code, /ALTER TABLE public\.customers[\s\S]*ALTER COLUMN bank_account_number TYPE TEXT;/i);
  assert.match(sql049Code, /ADD COLUMN IF NOT EXISTS bank_account_mask VARCHAR\(30\);/i);
  assert.match(sql049Code, /BTRIM\(bank_account_number\) ~ '\^\[0-9\]\{9,18\}\$'/);
  assert.match(sql049Code, /BTRIM\(bank_account_number\) !~ '\^0\+\$'/);
  assert.equal(/RIGHT\(\s*v_customer\.bank_account_number/i.test(sql049Code), false);
  assert.match(sql049Code, /v_mask := NULLIF\(BTRIM\(v_customer\.bank_account_mask\), ''\);/);
  assert.match(sql049Code, /CREATE OR REPLACE FUNCTION public\.create_customer_payout\(/i);
  assert.match(sql049Code, /SECURITY DEFINER[\s\S]*SET search_path = pg_catalog, public/i);
  assert.match(sql049Code, /'PENDING_APPROVAL'/);
  assert.match(sql049Code, /OVERPAYMENT_NOT_PERMITTED/);
});
