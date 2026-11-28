/**
 * RESTART-10 (DF-022): Union Bank Reverse MIS Reconciliation Split-Brain &
 * Tenant Financial Isolation — Real PostgreSQL 17 Two-Tenant Integration Gate.
 *
 * Fail-closed:
 * - When REQUIRE_REAL_POSTGRES=1 (CI / PG17 gate), missing or unreachable PG17 fails loudly.
 * - Never falls back to `pg-mem` or central database.
 * - Uses REAL `MigrationRunner` migrations (including 048), REAL `TenantDatabaseManager`,
 *   REAL `UnionBankReconciliationService`, and REAL `PayoutService`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import { assertDisposablePg17Cluster } from '../../../scripts/pg17-safety-guard.js';
import { createPoolShutdownManager } from './helpers/pool-lifecycle-helpers.js';

const { Pool } = pg;

const TEST_PG_URL = process.env['TEST_POSTGRES_URL'] || '';
const REQUIRE_REAL_PG = process.env['REQUIRE_REAL_POSTGRES'] === '1';

function buildDbUrl(baseUrl, dbName, creds) {
  const u = new URL(baseUrl);
  u.pathname = `/${dbName}`;
  if (creds?.username) u.username = creds.username;
  if (creds?.password) u.password = creds.password;
  return u.toString();
}

async function seedTenantDairy({
  pool,
  orgId,
  orgCode,
  orgName,
  centerId,
  userId,
  farmers,
  batchId,
  batchNumber,
}) {
  await pool.query(
    `INSERT INTO organizations (id, name, code, status)
     VALUES ($1, $2, $3, 'ACTIVE')
     ON CONFLICT (id) DO NOTHING;`,
    [orgId, orgName, orgCode]
  );

  await pool.query(
    `INSERT INTO dairy_centers (
       id, organization_id, code, name, address_line1, village_town,
       district, state, postal_code, contact_phone, status
     ) VALUES (
       $1, $2, $3, $4, 'Main Road 1', 'Anand', 'Anand', 'Gujarat', '388001', '9800000001', 'ACTIVE'
     ) ON CONFLICT (id) DO NOTHING;`,
    [centerId, orgId, `CTR_${orgCode}`, `${orgName} Center`]
  );

  await pool.query(
    `INSERT INTO users (
       id, organization_id, username, full_name, phone_number, role, status
     ) VALUES (
       $1, $2, $3, $4, $5, 'DAIRY_OWNER', 'ACTIVE'
     ) ON CONFLICT (id) DO NOTHING;`,
    [userId, orgId, `owner_${orgCode.toLowerCase()}`, `${orgName} Owner`, `99${orgCode.replace(/[^0-9]/g, '').padStart(8, '0').slice(0, 8)}`]
  );

  let totalAmount = 0;
  for (const f of farmers) {
    totalAmount += Number(f.amount);
    await pool.query(
      `INSERT INTO customers (
         id, organization_id, primary_center_id, farmer_code, full_name,
         normalized_mobile_number, bank_ifsc_code,
         status, registration_status
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, 'UBIN0530789',
         'ACTIVE', 'APPROVED'
       );`,
      [
        f.customerId,
        orgId,
        centerId,
        f.farmerCode,
        f.customerName,
        f.mobile,
      ]
    );

    await pool.query(
      `INSERT INTO customer_ledger_accounts (customer_id, organization_id, current_balance)
       VALUES ($1, $2, $3);`,
      [f.customerId, orgId, f.initialBalance]
    );
  }

  await pool.query(
    `INSERT INTO payment_batches (
       id, organization_id, center_id, batch_number, payment_method, status,
       total_beneficiaries, total_amount, pending_count, pending_amount,
       bank_name, bank_channel, bank_batch_reference, idempotency_key, created_by
     ) VALUES (
       $1, $2, $3, $4, 'BANK_TRANSFER', 'SUBMITTED',
       $5, $6, $5, $6,
       'Union Bank of India', 'UNION_BANK_BULK_NEFT', $7, $8, $9
     );`,
    [
      batchId,
      orgId,
      centerId,
      batchNumber,
      farmers.length,
      totalAmount.toFixed(2),
      `UBI-${batchNumber}`,
      `batch-idem-${batchId}`,
      userId,
    ]
  );

  for (const f of farmers) {
    await pool.query(
      `INSERT INTO customer_payouts (
         id, organization_id, center_id, customer_id, batch_id, direction,
         amount, currency, payment_method, status, source_transaction_type,
         idempotency_key, bank_account_mask, bank_ifsc, recipient_name, created_by
       ) VALUES (
         $1, $2, $3, $4, $5, 'DAIRY_PAYS_CUSTOMER',
         $6, 'INR', 'BANK_TRANSFER', $7, 'BATCH_DISBURSEMENT',
         $8, $9, 'UBIN0530789', $10, $11
       );`,
      [
        f.payoutId,
        orgId,
        centerId,
        f.customerId,
        batchId,
        Number(f.amount).toFixed(2),
        f.payoutStatus || 'SUBMITTED',
        `payout-idem-${f.payoutId}`,
        f.accountMask || 'XXXX9001',
        f.customerName,
        userId,
      ]
    );

    await pool.query(
      `INSERT INTO payment_batch_items (
         id, batch_id, payout_id, customer_id, amount, currency,
         bank_account_mask, bank_ifsc, status, beneficiary_reference
       ) VALUES (
         $1, $2, $3, $4, $5, 'INR',
         $6, 'UBIN0530789', $7, $8
       );`,
      [
        f.itemId,
        batchId,
        f.payoutId,
        f.customerId,
        Number(f.amount).toFixed(2),
        f.accountMask || 'XXXX9001',
        f.itemStatus || 'SUBMITTED',
        f.beneficiaryRef,
      ]
    );
  }
}

test('RESTART-10 PG17 Gate: Union Bank Reverse MIS Reconciliation Two-Tenant Financial Isolation, Atomicity, Reversals & RLS', async (t) => {
  if (!TEST_PG_URL) {
    const msg = 'TEST_POSTGRES_URL is unset. Refusing to run RESTART-10 two-tenant integration test without real PostgreSQL 17.';
    if (REQUIRE_REAL_PG) {
      assert.fail(`REQUIRE_REAL_POSTGRES=1 gate failed: ${msg}`);
    }
    assert.fail(msg);
  }

  let preflight;
  try {
    preflight = await assertDisposablePg17Cluster({ connectionString: TEST_PG_URL });
  } catch (err) {
    assert.fail(`Real PostgreSQL 17 preflight failed (no pg-mem fallback permitted): ${err?.message || err}`);
  }
  assert.ok(preflight.serverVersionNum >= 170000, `Expected PG >= 17, got ${preflight.serverVersion}`);

  const suffix = crypto.randomBytes(4).toString('hex');
  const dbCtrlName = `dfarm_r10_ctrl_${suffix}`;
  const dbAName = `dfarm_r10_tenant_a_${suffix}`;
  const dbBName = `dfarm_r10_tenant_b_${suffix}`;
  const rlsRoleName = `dfarm_r10_app_${suffix}`;
  const rlsRolePassword = `r10_pw_${suffix}`;

  const adminUrl = buildDbUrl(TEST_PG_URL, 'postgres');
  const urlCtrl = buildDbUrl(TEST_PG_URL, dbCtrlName);
  const urlA = buildDbUrl(TEST_PG_URL, dbAName);
  const urlB = buildDbUrl(TEST_PG_URL, dbBName);

  const { closePoolCleanly } = createPoolShutdownManager({
    checkedOutTimeoutMs: 8000,
    removeTimeoutMs: 3000,
  });

  const poolErrors = [];
  const guardedPools = new WeakSet();
  function attachPoolErrorGuard(pool, label) {
    if (!pool || guardedPools.has(pool)) return pool;
    guardedPools.add(pool);
    pool.on('error', (err) => {
      poolErrors.push({ label, code: err?.code, message: err?.message || String(err) });
    });
    return pool;
  }

  async function waitForDbIdle(pool, dbName, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const res = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid();`,
        [dbName]
      );
      if (Number(res.rows[0]?.cnt || 0) === 0) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    const finalRes = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid();`,
      [dbName]
    );
    const remaining = Number(finalRes.rows[0]?.cnt || 0);
    if (remaining > 0) {
      throw new Error(`Disposable database '${dbName}' still had ${remaining} active connection(s) before DROP DATABASE.`);
    }
  }

  const adminPool = attachPoolErrorGuard(new Pool({ connectionString: adminUrl, max: 3 }), 'adminPool');
  const createdDatabases = [];
  let rlsRoleAttempted = false;
  let rlsRoleCreated = false;
  let faultTriggerCreated = false;
  let poolCtrl;
  let poolA;
  let poolB;
  let rlsPool;
  let rlsRestrictedPool;

  // Deterministic env setup BEFORE loading compiled backend config/singletons
  process.env['NODE_ENV'] = 'test';
  process.env['REQUIRE_REAL_POSTGRES'] = '1';
  process.env['TEST_REAL_POSTGRES'] = '1';
  process.env['DATABASE_TLS_MODE'] = 'disable';
  process.env['CENTRAL_DATABASE_URL'] = urlCtrl;
  process.env['DATABASE_URL'] = urlCtrl;
  process.env['DATABASE_PROVISIONER_URL'] = urlCtrl;
  process.env['TENANT_POOL_CONNECTION_TIMEOUT_MS'] = '5000';
  process.env['JWT_SECRET'] = process.env['JWT_SECRET'] || 'restart10_pg17_jwt_secret_minimum_32_characters';
  process.env['CREDENTIAL_ENCRYPTION_KEY'] =
    process.env['CREDENTIAL_ENCRYPTION_KEY'] ||
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  const { db } = await import('../dist/infrastructure/database/PostgresPool.js');
  attachPoolErrorGuard(db.pool, 'globalDbPool');
  const { MigrationRunner } = await import('../dist/infrastructure/database/MigrationRunner.js');
  const { CredentialEncryption } = await import('../dist/infrastructure/security/CredentialEncryption.js');
  const { tenantDbManager, PLATFORM_FEDERATION_DAIRY_ID, TenantDatabaseUnavailableError } = await import(
    '../dist/infrastructure/database/TenantDatabaseManager.js'
  );
  const { UnionBankReconciliationService } = await import(
    '../dist/integrations/banking/union-bank/UnionBankReconciliationService.js'
  );
  const { UnionBankSubmissionService } = await import(
    '../dist/integrations/banking/union-bank/UnionBankSubmissionService.js'
  );
  const { UnionBankStatusInquiryService } = await import(
    '../dist/integrations/banking/union-bank/UnionBankStatusInquiryService.js'
  );
  const { PayoutService } = await import('../dist/modules/payments/payout.service.js');
  const { ReconciliationService } = await import('../dist/modules/payments/reconciliation.service.js');
  const { batchService } = await import('../dist/modules/payments/batch.service.js');
  const { SettlementCalculationService } = await import(
    '../dist/modules/payments/settlement-calculation.service.js'
  );
  const { BankFileService } = await import(
    '../dist/modules/payments/serializers/BankFileService.js'
  );
  const { NotificationService } = await import('../dist/modules/notifications/services/notification.service.js');

  const orgA = crypto.randomUUID();
  const orgB = crypto.randomUUID();
  const orgDisabled = crypto.randomUUID();
  const centerA = crypto.randomUUID();
  const centerB = crypto.randomUUID();
  const userA = crypto.randomUUID();
  const userB = crypto.randomUUID();
  const superAdminId = crypto.randomUUID();

  // Tenant A farmers & batches
  const batchA1 = crypto.randomUUID();
  const batchA2Rollback = crypto.randomUUID();
  const batchA3Edges = crypto.randomUUID();
  const batchA4Concurrent = crypto.randomUUID();
  const fA1 = {
    customerId: crypto.randomUUID(),
    payoutId: crypto.randomUUID(),
    itemId: crypto.randomUUID(),
    farmerCode: 'FA-001',
    customerName: 'Aarav Patel',
    mobile: '9876500101',
    beneficiaryRef: 'BEN-A-001',
    amount: 1200.5,
    initialBalance: 2000.5,
  };
  const fA2 = {
    customerId: crypto.randomUUID(),
    payoutId: crypto.randomUUID(),
    itemId: crypto.randomUUID(),
    farmerCode: 'FA-002',
    customerName: 'Bhavna Desai',
    mobile: '9876500102',
    beneficiaryRef: 'BEN-A-002',
    amount: 800,
    initialBalance: 1500,
  };
  const fA3Rb1 = {
    customerId: crypto.randomUUID(),
    payoutId: crypto.randomUUID(),
    itemId: crypto.randomUUID(),
    farmerCode: 'FA-RB1',
    customerName: 'Chetan Shah',
    mobile: '9876500103',
    beneficiaryRef: 'BEN-RB-001',
    amount: 600,
    initialBalance: 1000,
  };
  const fA4Rb2 = {
    customerId: crypto.randomUUID(),
    payoutId: crypto.randomUUID(),
    itemId: crypto.randomUUID(),
    farmerCode: 'FA-RB2',
    customerName: 'Devika Mehta',
    mobile: '9876500104',
    beneficiaryRef: 'BEN-RB-002',
    amount: 400,
    initialBalance: 1000,
  };

  // Edge batch farmers (Failed / Unsettled-Fail / Ambiguous / Unknown)
  const fA5Fail = {
    customerId: crypto.randomUUID(),
    payoutId: crypto.randomUUID(),
    itemId: crypto.randomUUID(),
    farmerCode: 'FA-FAIL',
    customerName: 'Eshan Joshi',
    mobile: '9876500105',
    beneficiaryRef: 'BEN-FAIL-001',
    amount: 350,
    initialBalance: 900,
  };
  const fA6Unknown = {
    customerId: crypto.randomUUID(),
    payoutId: crypto.randomUUID(),
    itemId: crypto.randomUUID(),
    farmerCode: 'FA-UNK',
    customerName: 'Farida Khan',
    mobile: '9876500106',
    beneficiaryRef: 'BEN-UNK-001',
    amount: 450,
    initialBalance: 900,
  };
  const fA7Ambig1 = {
    customerId: crypto.randomUUID(),
    payoutId: crypto.randomUUID(),
    itemId: crypto.randomUUID(),
    farmerCode: 'FA-AMB1',
    customerName: 'Gopal Rao',
    mobile: '9876500107',
    beneficiaryRef: 'DUP-REF-999',
    amount: 200,
    initialBalance: 500,
  };
  const fA8Ambig2 = {
    customerId: crypto.randomUUID(),
    payoutId: crypto.randomUUID(),
    itemId: crypto.randomUUID(),
    farmerCode: 'FA-AMB2',
    customerName: 'Harish Nair',
    mobile: '9876500108',
    beneficiaryRef: 'DUP-REF-999',
    amount: 200,
    initialBalance: 500,
  };
  const fA9Conc = {
    customerId: crypto.randomUUID(),
    payoutId: crypto.randomUUID(),
    itemId: crypto.randomUUID(),
    farmerCode: 'FA-CONC',
    customerName: 'Indira Menon',
    mobile: '9876500109',
    beneficiaryRef: 'BEN-CONC-001',
    amount: 700,
    initialBalance: 1400,
  };

  // Tenant B farmer & batch
  const batchB1 = crypto.randomUUID();
  const fB1 = {
    customerId: crypto.randomUUID(),
    payoutId: crypto.randomUUID(),
    itemId: crypto.randomUUID(),
    farmerCode: 'FB-001',
    customerName: 'Vikram Singh',
    mobile: '9876500201',
    beneficiaryRef: 'BEN-B-001',
    amount: 1500,
    initialBalance: 2500,
  };

  const authA = {
    userId: userA,
    organizationId: orgA,
    role: 'DAIRY_OWNER',
    centerId: centerA,
    authUser: { id: userA, email: 'owner-a@dfarm.test' },
  };
  const authB = {
    userId: userB,
    organizationId: orgB,
    role: 'DAIRY_OWNER',
    centerId: centerB,
    authUser: { id: userB, email: 'owner-b@dfarm.test' },
  };
  const authPlatformSuper = {
    userId: superAdminId,
    organizationId: PLATFORM_FEDERATION_DAIRY_ID,
    role: 'SUPER_ADMIN',
    authUser: { id: superAdminId, email: 'superadmin@dfarm.test' },
  };

  const origCtrlDb = tenantDbManager.getControlPlaneDb();
  const origGetAllTenantDbs = tenantDbManager.getAllTenantDbs.bind(tenantDbManager);
  const origGetTenantDb = tenantDbManager.getTenantDb.bind(tenantDbManager);
  const origNotify = NotificationService.enqueueNotification;

  const centralQueries = [];
  let getAllTenantDbsCalled = false;
  let permissiveGetTenantDbCalled = false;
  let capturedNotifications = [];
  let forceNotifyFailure = false;

  let primaryError = null;
  try {
    // -------------------------------------------------------------------------
    // Setup disposable Control Plane DB + Two Physical Tenant DBs + Real Migrations
    // -------------------------------------------------------------------------
    await adminPool.query(`CREATE DATABASE "${dbCtrlName}";`);
    createdDatabases.push(dbCtrlName);
    await adminPool.query(`CREATE DATABASE "${dbAName}";`);
    createdDatabases.push(dbAName);
    await adminPool.query(`CREATE DATABASE "${dbBName}";`);
    createdDatabases.push(dbBName);

    poolCtrl = attachPoolErrorGuard(new Pool({ connectionString: urlCtrl, max: 5 }), 'poolCtrl');
    poolA = attachPoolErrorGuard(new Pool({ connectionString: urlA, max: 8 }), 'poolA');
    poolB = attachPoolErrorGuard(new Pool({ connectionString: urlB, max: 5 }), 'poolB');

  await MigrationRunner.runControlPlaneMigrations(poolCtrl);
  await MigrationRunner.runTenantMigrations(poolA, orgA);
  await MigrationRunner.runTenantMigrations(poolB, orgB);

  const encA = CredentialEncryption.encrypt(urlA);
  const encB = CredentialEncryption.encrypt(urlB);
  const encDisabled = CredentialEncryption.encrypt(buildDbUrl(TEST_PG_URL, `dfarm_nonexistent_${suffix}`));

  await poolCtrl.query(
    `INSERT INTO organizations (id, name, code, status)
     VALUES ($1, 'Dairy Alpha', $2, 'ACTIVE'),
            ($3, 'Dairy Beta', $4, 'ACTIVE'),
            ($5, 'Dairy Disabled', $6, 'SUSPENDED');`,
    [orgA, `DA_${suffix}`, orgB, `DB_${suffix}`, orgDisabled, `DD_${suffix}`]
  );

  await poolCtrl.query(
    `INSERT INTO dairy_database_mappings (
       id, dairy_id, dairy_code, database_name, resource_type,
       connection_uri_encrypted, schema_version, provisioning_status
     ) VALUES
       ($1, $2, $3, $4, 'PHYSICAL_DATABASE', $5, 'v1.0.0', 'ACTIVE'),
       ($6, $7, $8, $9, 'PHYSICAL_DATABASE', $10, 'v1.0.0', 'ACTIVE'),
       ($11, $12, $13, $14, 'PHYSICAL_DATABASE', $15, 'v1.0.0', 'FAILED');`,
    [
      crypto.randomUUID(), orgA, `DA_${suffix}`, dbAName, encA,
      crypto.randomUUID(), orgB, `DB_${suffix}`, dbBName, encB,
      crypto.randomUUID(), orgDisabled, `DD_${suffix}`, `dfarm_nonexistent_${suffix}`, encDisabled,
    ]
  );

  // Seed physical Tenant A DB
  await seedTenantDairy({
    pool: poolA,
    orgId: orgA,
    orgCode: `DA_${suffix}`,
    orgName: 'Dairy Alpha',
    centerId: centerA,
    userId: userA,
    farmers: [fA1, fA2],
    batchId: batchA1,
    batchNumber: `B-A1-${suffix}`,
  });

  // Additional batches in Tenant A (Rollback test, Edge cases, Concurrency)
  await seedTenantDairy({
    pool: poolA,
    orgId: orgA,
    orgCode: `DA_${suffix}`,
    orgName: 'Dairy Alpha',
    centerId: centerA,
    userId: userA,
    farmers: [fA3Rb1, fA4Rb2],
    batchId: batchA2Rollback,
    batchNumber: `B-A2-${suffix}`,
  });
  await seedTenantDairy({
    pool: poolA,
    orgId: orgA,
    orgCode: `DA_${suffix}`,
    orgName: 'Dairy Alpha',
    centerId: centerA,
    userId: userA,
    farmers: [fA5Fail, fA6Unknown, fA7Ambig1, fA8Ambig2],
    batchId: batchA3Edges,
    batchNumber: `B-A3-${suffix}`,
  });
  await seedTenantDairy({
    pool: poolA,
    orgId: orgA,
    orgCode: `DA_${suffix}`,
    orgName: 'Dairy Alpha',
    centerId: centerA,
    userId: userA,
    farmers: [fA9Conc],
    batchId: batchA4Concurrent,
    batchNumber: `B-A4-${suffix}`,
  });

  // Seed physical Tenant B DB
  await seedTenantDairy({
    pool: poolB,
    orgId: orgB,
    orgCode: `DB_${suffix}`,
    orgName: 'Dairy Beta',
    centerId: centerB,
    userId: userB,
    farmers: [fB1],
    batchId: batchB1,
    batchNumber: `B-B1-${suffix}`,
  });

  // Spy control-plane adapter: asserts zero financial table queries ever touch control plane
  const controlPlaneAdapter = {
    async query(sql, params) {
      centralQueries.push(sql);
      return poolCtrl.query(sql, params);
    },
    async withTransaction(fn) {
      const client = await poolCtrl.connect();
      try {
        await client.query('BEGIN');
        const out = await fn({
          query: (sql, params) => {
            centralQueries.push(sql);
            return client.query(sql, params);
          },
        });
        await client.query('COMMIT');
        return out;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
  };

  tenantDbManager.setControlPlaneDb(controlPlaneAdapter);
  tenantDbManager.getAllTenantDbs = () => {
    getAllTenantDbsCalled = true;
    throw new Error('FORBIDDEN: getAllTenantDbs() must never be called during reconciliation');
  };
  tenantDbManager.getTenantDb = async () => {
    permissiveGetTenantDbCalled = true;
    throw new Error('FORBIDDEN: permissive getTenantDb() must never be called during reconciliation');
  };

  NotificationService.enqueueNotification = async (payload) => {
    capturedNotifications.push({ ...payload, capturedAt: Date.now() });
    if (forceNotifyFailure) {
      throw new Error('Simulated FCM/WhatsApp queue outage after commit');
    }
    return { queued: true };
  };

  await t.test('Group A & B: Two-tenant physical routing, SUPER_ADMIN target enforcement & zero control-plane financial queries', async () => {
    // 1. Cross-tenant access blocked without foreign leak: Tenant B staff trying Tenant A batch
    await assert.rejects(
      () => UnionBankReconciliationService.reconcileBatchWithBankData(batchA1, [], authB),
      (err) => err.statusCode === 404 && err.code === 'BATCH_NOT_FOUND'
    );

    // 2. Contradicting body/target org rejected for normal staff (even with valid batchA1)
    await assert.rejects(
      () => UnionBankReconciliationService.reconcileBatchWithBankData(batchA1, [], authA, orgB),
      (err) => err.statusCode === 403 && err.code === 'CROSS_ORG_RECONCILIATION_DENIED'
    );

    // 3. SUPER_ADMIN from platform context without targetOrganizationId fails closed
    await assert.rejects(
      () => UnionBankReconciliationService.reconcileBatchWithBankData(batchA1, [], authPlatformSuper),
      (err) => err.statusCode === 400 && err.code === 'SUPER_ADMIN_TARGET_ORG_REQUIRED'
    );

    // 4. SUPER_ADMIN targeting platform DB fails closed
    await assert.rejects(
      () => UnionBankReconciliationService.reconcileBatchWithBankData(
        batchA1,
        [],
        authPlatformSuper,
        PLATFORM_FEDERATION_DAIRY_ID
      ),
      (err) => err.statusCode === 403 && err.code === 'CONTROL_PLANE_TARGET_FORBIDDEN'
    );

    // 5. Disabled / FAILED mapping fails closed via strict resolver
    await assert.rejects(
      () => UnionBankReconciliationService.reconcileBatchWithBankData(
        batchA1,
        [],
        { ...authA, organizationId: orgDisabled }
      ),
      (err) => err instanceof TenantDatabaseUnavailableError
    );

    // 6. Control plane was ONLY used for mapping lookups, zero financial queries or tenant scans
    assert.equal(getAllTenantDbsCalled, false);
    assert.equal(permissiveGetTenantDbCalled, false);
    const financialCtrlQueries = centralQueries.filter((q) =>
      /\b(payment_batches|payment_batch_items|customer_payouts|customer_ledger_accounts|ledger_transactions|ledger_entries|payment_reconciliation_records|payment_adjustments)\b/i.test(q)
    );
    assert.equal(financialCtrlQueries.length, 0, 'Control plane must never execute operational financial SQL');
  });

  await t.test('Group C1: Single-DB atomic PAID settlement on Tenant A & separate SUPER_ADMIN reconciliation on Tenant B', async () => {
    capturedNotifications = [];

    const csvA = [
      'CustomerRef,BankUTR,Amount,Status,Reason,ValueDate',
      `${fA1.beneficiaryRef},UTR-A1-001,${fA1.amount},PAID,,2026-11-28`,
      `${fA2.beneficiaryRef},UTR-A2-001,${fA2.amount},PAID,,2026-11-28`,
    ].join('\n');

    const resA = await UnionBankReconciliationService.reconcileBatchWithBankData(batchA1, csvA, authA);
    assert.equal(resA.batchStatus, 'PAID');
    assert.equal(resA.reconciliationStatus, 'FULLY_RECONCILED');
    assert.equal(resA.paidCount, 2);
    assert.equal(resA.exceptions.length, 0);

    // Verify Tenant A DB state
    const balA1 = await poolA.query(`SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;`, [fA1.customerId]);
    const balA2 = await poolA.query(`SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;`, [fA2.customerId]);
    assert.equal(Number(balA1.rows[0].current_balance), 800);
    assert.equal(Number(balA2.rows[0].current_balance), 700);

    const itemRowsA = await poolA.query(
      `SELECT id, status, bank_utr, beneficiary_reference FROM payment_batch_items WHERE batch_id = $1 ORDER BY beneficiary_reference;`,
      [batchA1]
    );
    assert.deepEqual(
      itemRowsA.rows.map((r) => ({ status: r.status, utr: r.bank_utr, ref: r.beneficiary_reference })),
      [
        { status: 'PAID', utr: 'UTR-A1-001', ref: 'BEN-A-001' },
        { status: 'PAID', utr: 'UTR-A2-001', ref: 'BEN-A-002' },
      ]
    );

    const journalA = await poolA.query(
      `SELECT lt.transaction_type,
              SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE 0 END)::numeric(12,2) AS debits,
              SUM(CASE WHEN le.entry_type = 'CREDIT' THEN le.amount ELSE 0 END)::numeric(12,2) AS credits
       FROM ledger_transactions lt
       JOIN ledger_entries le ON le.transaction_id = lt.id
       WHERE lt.reference_id = ANY($1::uuid[])
       GROUP BY lt.id, lt.transaction_type;`,
      [[fA1.payoutId, fA2.payoutId]]
    );
    assert.equal(journalA.rows.length, 2);
    for (const row of journalA.rows) {
      assert.equal(row.transaction_type, 'PAYMENT_PAYOUT_DEBIT');
      assert.equal(row.debits, row.credits, 'Double-entry journal must balance');
    }

    const batchRowA = await poolA.query(
      `SELECT status, reconciliation_status, successful_count, successful_amount, failed_count, pending_count
       FROM payment_batches WHERE id = $1;`,
      [batchA1]
    );
    assert.equal(batchRowA.rows[0].status, 'PAID');
    assert.equal(batchRowA.rows[0].successful_count, 2);
    assert.equal(Number(batchRowA.rows[0].successful_amount), 2000.5);
    assert.equal(batchRowA.rows[0].failed_count, 0);
    assert.equal(batchRowA.rows[0].pending_count, 0);

    // Tenant B balance untouched until Tenant B is explicitly reconciled
    const balBBefore = await poolB.query(`SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;`, [fB1.customerId]);
    assert.equal(Number(balBBefore.rows[0].current_balance), 2500);

    // Post-commit notifications queued for Tenant A (2 farmers)
    assert.equal(capturedNotifications.length, 2);

    // Now reconcile Tenant B via platform SUPER_ADMIN + explicit targetOrganizationId
    // Simulate post-commit notification outage — financial state in DB B MUST still commit!
    capturedNotifications = [];
    forceNotifyFailure = true;
    const resB = await UnionBankReconciliationService.reconcileBatchWithBankData(
      batchB1,
      [{ customerReference: fB1.beneficiaryRef, bankUtr: 'UTR-B1-001', amount: fB1.amount, status: 'PAID' }],
      authPlatformSuper,
      orgB
    );
    forceNotifyFailure = false;
    assert.equal(resB.paidCount, 1);
    assert.equal(resB.batchStatus, 'PAID');

    const balBAfter = await poolB.query(`SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;`, [fB1.customerId]);
    assert.equal(Number(balBAfter.rows[0].current_balance), 1000);
    assert.equal(capturedNotifications.length, 1);

    // Tenant A balances untouched by Tenant B run
    const balA1AfterB = await poolA.query(`SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;`, [fA1.customerId]);
    assert.equal(Number(balA1AfterB.rows[0].current_balance), 800);
  });

  await t.test('Group C2: Injected mid-transaction PostgreSQL failure rolls back ENTIRE batch atomically & emits ZERO notifications', async () => {
    capturedNotifications = [];

    // Inject trigger in DB A that raises an unexpected PG XX000 failure when settling farmer fA4Rb2
    faultTriggerCreated = true;
    await poolA.query(`
      CREATE OR REPLACE FUNCTION public.fn_r10_fault_inject()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.id = '${fA4Rb2.payoutId}'::uuid AND NEW.status = 'SETTLED' THEN
          RAISE EXCEPTION 'INJECTED_PG_STORAGE_FAILURE' USING ERRCODE = 'XX000';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER trg_r10_fault_inject
      BEFORE UPDATE ON customer_payouts
      FOR EACH ROW EXECUTE FUNCTION public.fn_r10_fault_inject();
    `);

    try {
      await assert.rejects(
        () => UnionBankReconciliationService.reconcileBatchWithBankData(
          batchA2Rollback,
          [
            { customerReference: fA3Rb1.beneficiaryRef, bankUtr: 'UTR-RB-1', amount: fA3Rb1.amount, status: 'PAID' },
            { customerReference: fA4Rb2.beneficiaryRef, bankUtr: 'UTR-RB-2', amount: fA4Rb2.amount, status: 'PAID' },
          ],
          authA
        ),
        (err) => err.code === 'XX000' || String(err.message).includes('INJECTED_PG_STORAGE_FAILURE')
      );
    } finally {
      await poolA.query(`DROP TRIGGER IF EXISTS trg_r10_fault_inject ON customer_payouts;`);
      await poolA.query(`DROP FUNCTION IF EXISTS public.fn_r10_fault_inject();`);
      faultTriggerCreated = false;
    }

    // Farmer 1 (who succeeded BEFORE failure) MUST be completely rolled back!
    const rbCheck = await poolA.query(
      `SELECT cp.status AS payout_status, pbi.status AS item_status, cla.current_balance
       FROM customer_payouts cp
       JOIN payment_batch_items pbi ON pbi.payout_id = cp.id
       JOIN customer_ledger_accounts cla ON cla.customer_id = cp.customer_id
       WHERE cp.id = $1;`,
      [fA3Rb1.payoutId]
    );
    assert.equal(rbCheck.rows[0].payout_status, 'SUBMITTED');
    assert.equal(rbCheck.rows[0].item_status, 'SUBMITTED');
    assert.equal(Number(rbCheck.rows[0].current_balance), 1000);

    const txnCnt = await poolA.query(
      `SELECT COUNT(*)::int AS cnt FROM ledger_transactions WHERE reference_id = ANY($1::uuid[]);`,
      [[fA3Rb1.payoutId, fA4Rb2.payoutId]]
    );
    assert.equal(txnCnt.rows[0].cnt, 0);

    const reconCnt = await poolA.query(
      `SELECT COUNT(*)::int AS cnt FROM payment_reconciliation_records WHERE matched_batch_id = $1;`,
      [batchA2Rollback]
    );
    assert.equal(reconCnt.rows[0].cnt, 0);

    const batchState = await poolA.query(
      `SELECT status, successful_count, failed_count FROM payment_batches WHERE id = $1;`,
      [batchA2Rollback]
    );
    assert.equal(batchState.rows[0].status, 'SUBMITTED');
    assert.equal(batchState.rows[0].successful_count, 0);
    assert.equal(capturedNotifications.length, 0, 'Zero notifications permitted after batch rollback');
  });

  await t.test('Group D: FAILED, FAILED replay idempotency, AMOUNT_MISMATCH (0 & bad paise), UNKNOWN & AMBIGUOUS_REFERENCE', async () => {
    capturedNotifications = [];

    // Reconcile edge batch: fA5Fail FAILED, fA6Unknown UNKNOWN (with 0-amount mismatch vs normal unknown), ambiguous DUP-REF-999
    const res1 = await UnionBankReconciliationService.reconcileBatchWithBankData(
      batchA3Edges,
      [
        { customerReference: fA5Fail.beneficiaryRef, amount: fA5Fail.amount, status: 'FAILED', failureReason: 'IFSC invalid' },
        { customerReference: fA6Unknown.beneficiaryRef, amount: fA6Unknown.amount, status: 'UNKNOWN', failureReason: 'NPCI timeout' },
        { customerReference: 'DUP-REF-999', bankUtr: 'UTR-AMB-1', amount: 200, status: 'PAID' },
      ],
      authA
    );
    assert.equal(res1.failedCount, 1);
    assert.equal(res1.unknownCount, 1);
    assert.equal(res1.batchStatus, 'UNKNOWN');
    assert.equal(res1.exceptions.length, 1);
    assert.match(res1.exceptions[0].reason, /AMBIGUOUS_REFERENCE/);

    // Zero debit on FAILED, UNKNOWN, and AMBIGUOUS
    const balances = await poolA.query(
      `SELECT customer_id, current_balance FROM customer_ledger_accounts WHERE customer_id = ANY($1::uuid[]);`,
      [[fA5Fail.customerId, fA6Unknown.customerId, fA7Ambig1.customerId, fA8Ambig2.customerId]]
    );
    for (const r of balances.rows) {
      const expected = [fA5Fail.customerId, fA6Unknown.customerId].includes(r.customer_id) ? 900 : 500;
      assert.equal(Number(r.current_balance), expected);
    }

    // Replay FAILED idempotently -> batch failed_count MUST stay 1 (never increment twice!)
    await UnionBankReconciliationService.reconcileBatchWithBankData(
      batchA3Edges,
      [{ customerReference: fA5Fail.beneficiaryRef, amount: fA5Fail.amount, status: 'FAILED', failureReason: 'IFSC invalid' }],
      authA
    );
    const batchAfterReplay = await poolA.query(`SELECT failed_count, failed_amount FROM payment_batches WHERE id = $1;`, [batchA3Edges]);
    assert.equal(batchAfterReplay.rows[0].failed_count, 1);
    assert.equal(Number(batchAfterReplay.rows[0].failed_amount), 350);

    // Zero bank amount on PAID must fail cleanly as AMOUNT_MISMATCH
    const zeroAmtRes = await UnionBankReconciliationService.reconcileBatchWithBankData(
      batchA2Rollback,
      [{ customerReference: fA3Rb1.beneficiaryRef, bankUtr: 'UTR-ZERO', amount: 0, status: 'PAID' }],
      authA
    );
    assert.equal(zeroAmtRes.paidCount, 0);
    assert.equal(zeroAmtRes.exceptions.length, 1);
    assert.match(zeroAmtRes.exceptions[0].reason, /AMOUNT_MISMATCH/);

    // Verify 0-amount PAID left balance and payout untouched
    const balZeroCheck = await poolA.query(`SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;`, [fA3Rb1.customerId]);
    assert.equal(Number(balZeroCheck.rows[0].current_balance), 1000);
  });

  await t.test('Group E & F: REVERSED payout credits once, replays idempotently, rejects conflicting keys & rejects reversing FAILED; PAID replays & blocks conflicting UTR', async () => {
    // 1. Reversing a FAILED payout must reject and NEVER give credit!
    const revOnFailed = await UnionBankReconciliationService.reconcileBatchWithBankData(
      batchA3Edges,
      [{ customerReference: fA5Fail.beneficiaryRef, bankUtr: 'UTR-REV-FAIL', amount: fA5Fail.amount, status: 'REVERSED', failureReason: 'Invalid reversal attempt' }],
      authA
    );
    assert.equal(revOnFailed.exceptions.length, 1);
    assert.match(revOnFailed.exceptions[0].reason, /CANNOT_REVERSE_NON_SETTLED|SETTLED/i);
    const failBal = await poolA.query(`SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;`, [fA5Fail.customerId]);
    assert.equal(Number(failBal.rows[0].current_balance), 900);

    // 2. Marking a SETTLED payout as FAILED must reject inside savepoint without changing SETTLED payout
    const failOnSettled = await UnionBankReconciliationService.reconcileBatchWithBankData(
      batchA1,
      [{ customerReference: fA1.beneficiaryRef, amount: fA1.amount, status: 'FAILED', failureReason: 'Late fail' }],
      authA
    );
    assert.equal(failOnSettled.exceptions.length, 1);
    assert.match(failOnSettled.exceptions[0].reason, /CANNOT_FAIL_SETTLED|SETTLED/i);

    // 3. Conflicting UTR for SETTLED payout must reject and never overwrite UTR-A1-001 or debit twice
    const conflictUtrRes = await UnionBankReconciliationService.reconcileBatchWithBankData(
      batchA1,
      [{ customerReference: fA1.beneficiaryRef, bankUtr: 'UTR-A1-FORGED', amount: fA1.amount, status: 'PAID' }],
      authA
    );
    assert.equal(conflictUtrRes.exceptions.length, 1);
    assert.match(conflictUtrRes.exceptions[0].reason, /CONFLICTING_UTR|already SETTLED/i);
    const balAfterConflictUtr = await poolA.query(`SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;`, [fA1.customerId]);
    assert.equal(Number(balAfterConflictUtr.rows[0].current_balance), 800);

    // 4. Same-UTR idempotent PAID replay succeeds cleanly without second debit or duplicate recon record
    capturedNotifications = [];
    const paidReplay = await UnionBankReconciliationService.reconcileBatchWithBankData(
      batchA1,
      [{ customerReference: fA1.beneficiaryRef, bankUtr: 'UTR-A1-001', amount: fA1.amount, status: 'PAID' }],
      authA
    );
    assert.equal(paidReplay.exceptions.length, 0);
    assert.equal(paidReplay.processedItems[0].isIdempotentReplay, true);
    assert.equal(capturedNotifications.length, 0, 'Replay must not re-enqueue notifications');

    // 5. Genuine REVERSED item on SETTLED payout fA1 (UTR-A1-001) restores balance once
    const revRes1 = await UnionBankReconciliationService.reconcileBatchWithBankData(
      batchA1,
      [{ customerReference: fA1.beneficiaryRef, bankUtr: 'UTR-A1-001', amount: fA1.amount, status: 'REVERSED', failureReason: 'Account frozen R01' }],
      authA
    );
    assert.equal(revRes1.exceptions.length, 0);
    assert.equal(revRes1.reversedCount, 1);
    assert.equal(revRes1.processedItems[0].isIdempotentReplay, false);

    const balAfterRev = await poolA.query(`SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;`, [fA1.customerId]);
    assert.equal(Number(balAfterRev.rows[0].current_balance), 2000.5, 'Farmer balance must be restored to 2000.50');

    const pbiRev = await poolA.query(`SELECT status FROM payment_batch_items WHERE id = $1;`, [fA1.itemId]);
    assert.equal(pbiRev.rows[0].status, 'REVERSED');

    // 6. Replay SAME REVERSED item -> idempotent, zero extra credit, zero extra adjustment
    const revReplay = await UnionBankReconciliationService.reconcileBatchWithBankData(
      batchA1,
      [{ customerReference: fA1.beneficiaryRef, bankUtr: 'UTR-A1-001', amount: fA1.amount, status: 'REVERSED', failureReason: 'Account frozen R01' }],
      authA
    );
    assert.equal(revReplay.exceptions.length, 0);
    assert.equal(revReplay.processedItems[0].isIdempotentReplay, true);

    const balAfterRevReplay = await poolA.query(`SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;`, [fA1.customerId]);
    assert.equal(Number(balAfterRevReplay.rows[0].current_balance), 2000.5);

    const adjCount = await poolA.query(`SELECT COUNT(*)::int AS cnt FROM payment_adjustments WHERE payout_id = $1;`, [fA1.payoutId]);
    assert.equal(adjCount.rows[0].cnt, 1, 'Only ONE reversal adjustment row may exist');

    // 7. Conflicting REVERSED reference on already-REVERSED payout fails closed
    const revConflict = await UnionBankReconciliationService.reconcileBatchWithBankData(
      batchA1,
      [{ customerReference: fA1.beneficiaryRef, bankUtr: 'UTR-A1-DIFF-REV', amount: fA1.amount, status: 'REVERSED', failureReason: 'Different reversal UTR' }],
      authA
    );
    assert.equal(revConflict.exceptions.length, 1);
    assert.match(revConflict.exceptions[0].reason, /CONFLICTING_REVERSAL_REFERENCE|conflicting/i);

    const balAfterRevConflict = await poolA.query(`SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;`, [fA1.customerId]);
    assert.equal(Number(balAfterRevConflict.rows[0].current_balance), 2000.5);

    // 8. Also test direct PayoutService.reversePayoutInTransaction SQL hardening directly on PG17 RPC
    const payoutSvc = new PayoutService();
    const tenantDbA = await tenantDbManager.getStrictTenantDb(orgA, { bypassCache: true, strictOperational: true });
    await tenantDbA.withTransaction(async (client) => {
      const sqlReplay = await payoutSvc.reversePayoutInTransaction(
        client,
        fA1.payoutId,
        authA,
        orgA,
        'Replay check',
        `REV-${orgA}-${fA1.payoutId}-UTR-A1-001`
      );
      assert.equal(sqlReplay.isIdempotentReplay, true);
    });
  });

  await t.test('Group G: Concurrent reconciliation calls on same batch settle & debit exactly once without deadlock', async () => {
    const payload = [{ customerReference: fA9Conc.beneficiaryRef, bankUtr: 'UTR-CONC-001', amount: fA9Conc.amount, status: 'PAID' }];

    const [c1, c2] = await Promise.all([
      UnionBankReconciliationService.reconcileBatchWithBankData(batchA4Concurrent, payload, authA),
      UnionBankReconciliationService.reconcileBatchWithBankData(batchA4Concurrent, payload, authA),
    ]);

    assert.equal(c1.exceptions.length, 0);
    assert.equal(c2.exceptions.length, 0);
    const replayFlags = [c1.processedItems[0].isIdempotentReplay, c2.processedItems[0].isIdempotentReplay].sort();
    assert.deepEqual(replayFlags, [false, true], 'Exactly one concurrent caller settles and the serialized second caller replays idempotently');

    const balConc = await poolA.query(`SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;`, [fA9Conc.customerId]);
    assert.equal(Number(balConc.rows[0].current_balance), 700, 'Balance must be debited exactly once (1400 -> 700)');

    const debitsConc = await poolA.query(
      `SELECT COUNT(*)::int AS cnt FROM ledger_transactions WHERE reference_id = $1 AND transaction_type = 'PAYMENT_PAYOUT_DEBIT';`,
      [fA9Conc.payoutId]
    );
    assert.equal(debitsConc.rows[0].cnt, 1);

    const reconConc = await poolA.query(
      `SELECT COUNT(*)::int AS cnt FROM payment_reconciliation_records WHERE matched_payout_id = $1 AND resolution_action = 'UNION_BANK_PAID';`,
      [fA9Conc.payoutId]
    );
    assert.equal(reconConc.rows[0].cnt, 1);
  });

  await t.test('Group H: Real PostgreSQL RLS (NOSUPERUSER NOBYPASSRLS) enforces app.current_organization_id & runs production reconciliation end-to-end', async () => {
    // Create non-superuser role in cluster and grant object permissions on DB A
    rlsRoleAttempted = true;
    await adminPool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${rlsRoleName}') THEN
          CREATE ROLE "${rlsRoleName}" LOGIN PASSWORD '${rlsRolePassword}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
        END IF;
      END $$;
    `);
    rlsRoleCreated = true;
    await poolA.query(`GRANT USAGE ON SCHEMA public TO "${rlsRoleName}";`);
    await poolA.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${rlsRoleName}";`);
    await poolA.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${rlsRoleName}";`);
    await poolA.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO "${rlsRoleName}";`);

    // Seed a foreign orgB organization & batch inside DB A as superuser to verify row-level isolation
    const foreignBatchId = crypto.randomUUID();
    await poolA.query(`INSERT INTO organizations (id, name, code, status) VALUES ($1, 'Foreign In Same DB', $2, 'ACTIVE') ON CONFLICT DO NOTHING;`, [orgB, `FR_${suffix}`]);
    await poolA.query(`INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status) VALUES ($1, $2, $3, 'Foreign Ctr', 'Addr', 'City', 'Dist', 'GJ', '388001', '9800000999', 'ACTIVE') ON CONFLICT DO NOTHING;`, [centerB, orgB, `FC_${suffix}`]);
    await poolA.query(`INSERT INTO users (id, organization_id, username, full_name, phone_number, role, status) VALUES ($1, $2, $3, 'Foreign User', '9800000998', 'DAIRY_OWNER', 'ACTIVE') ON CONFLICT DO NOTHING;`, [userB, orgB, `fu_${suffix}`]);
    await poolA.query(
      `INSERT INTO payment_batches (id, organization_id, center_id, batch_number, payment_method, status, total_beneficiaries, total_amount, pending_count, pending_amount, idempotency_key, created_by)
       VALUES ($1, $2, $3, $4, 'BANK_TRANSFER', 'SUBMITTED', 0, 0.00, 0, 0.00, $5, $6);`,
      [foreignBatchId, orgB, centerB, `FOREIGN-${suffix}`, `f-idem-${foreignBatchId}`, userB]
    );

    const urlRlsA = buildDbUrl(TEST_PG_URL, dbAName, { username: rlsRoleName, password: rlsRolePassword });
    rlsRestrictedPool = attachPoolErrorGuard(new Pool({ connectionString: urlRlsA, max: 3 }), 'rlsRestrictedPool');

    // Confirm role really has NOSUPERUSER NOBYPASSRLS
    const roleFlags = await rlsRestrictedPool.query(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;`
    );
    assert.equal(roleFlags.rows[0].rolsuper, false);
    assert.equal(roleFlags.rows[0].rolbypassrls, false);

    // 1. Without app.current_organization_id, non-superuser sees 0 rows and cannot insert
    const unsetRead = await rlsRestrictedPool.query(`SELECT COUNT(*)::int AS cnt FROM payment_batches;`);
    assert.equal(unsetRead.rows[0].cnt, 0, 'Unset tenant context must return 0 rows under RLS');

    // 2. Inside transaction with app.current_organization_id = orgA: only orgA visible; orgB blocked!
    const rlsClient = await rlsRestrictedPool.connect();
    try {
      await rlsClient.query('BEGIN');
      await rlsClient.query(`SELECT set_config('app.current_organization_id', $1, true);`, [orgA]);

      const ownBatches = await rlsClient.query(`SELECT COUNT(*)::int AS cnt FROM payment_batches WHERE organization_id = $1;`, [orgA]);
      assert.ok(ownBatches.rows[0].cnt >= 1);

      const crossRead = await rlsClient.query(`SELECT COUNT(*)::int AS cnt FROM payment_batches WHERE organization_id = $1;`, [orgB]);
      assert.equal(crossRead.rows[0].cnt, 0, 'Cross-tenant SELECT under RLS must return 0 rows');

      await assert.rejects(
        () => rlsClient.query(
          `INSERT INTO payment_reconciliation_records (organization_id, source, external_reference, transaction_date, amount, direction, reconciliation_status)
           VALUES ($1, 'BANK_STATEMENT_CSV', 'CROSS-ORG-TEST', '2026-11-28', 100, 'DEBIT', 'UNMATCHED');`,
          [orgB]
        ),
        (err) => err.code === '42501'
      );
      await rlsClient.query('ROLLBACK');
    } finally {
      rlsClient.release();
    }

    // 3. Re-point Tenant A encrypted mapping to the NON-SUPERUSER role connection and run
    //    real UnionBankReconciliationService settlement end-to-end under strict RLS!
    await poolCtrl.query(
      `UPDATE dairy_database_mappings SET connection_uri_encrypted = $1 WHERE dairy_id = $2;`,
      [CredentialEncryption.encrypt(urlRlsA), orgA]
    );
    await tenantDbManager.closeTenantPool(orgA);

    const rlsReconRes = await UnionBankReconciliationService.reconcileBatchWithBankData(
      batchA2Rollback,
      [{ customerReference: fA3Rb1.beneficiaryRef, bankUtr: 'UTR-RLS-OK-1', amount: fA3Rb1.amount, status: 'PAID' }],
      authA
    );
    assert.equal(rlsReconRes.exceptions.length, 0);
    assert.equal(rlsReconRes.paidCount, 1);

    const rbSettled = await poolA.query(`SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;`, [fA3Rb1.customerId]);
    assert.equal(Number(rbSettled.rows[0].current_balance), 400);
  });

  await t.test('Group I: Required SQL functions, tables, and RLS policies exist in BOTH Tenant A and Tenant B databases', async () => {
    for (const [label, tPool] of [['Tenant A', poolA], ['Tenant B', poolB]]) {
      const fnRes = await tPool.query(
        `SELECT proname
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND proname = ANY($1::text[]);`,
        [['settle_customer_payout', 'fail_customer_payout', 'reverse_customer_payout', 'current_app_org_id']]
      );
      const foundFns = new Set(fnRes.rows.map((r) => r.proname));
      for (const reqFn of ['settle_customer_payout', 'fail_customer_payout', 'reverse_customer_payout', 'current_app_org_id']) {
        assert.equal(foundFns.has(reqFn), true, `${label} missing required SQL routine '${reqFn}'`);
      }

      const tblRes = await tPool.query(
        `SELECT tablename
         FROM pg_tables
         WHERE schemaname = 'public'
           AND tablename = ANY($1::text[]);`,
        [['payment_batches', 'payment_batch_items', 'customer_payouts', 'bank_submissions', 'payment_reconciliation_records', 'payment_adjustments']]
      );
      assert.equal(tblRes.rows.length, 6, `${label} missing required payment/reconciliation tables`);
    }
  });

  await t.test('Group J: UnionBankSubmissionService two-phase, DF-024 fail-closed & UnionBankStatusInquiryService end-to-end on PG17', async () => {
    // Re-point Tenant A back to owner pool for DDL/multi-role submission seeding & verify submission lifecycle
    await poolCtrl.query(
      `UPDATE dairy_database_mappings SET connection_uri_encrypted = $1 WHERE dairy_id = $2;`,
      [CredentialEncryption.encrypt(urlA), orgA]
    );
    await tenantDbManager.closeTenantPool(orgA);

    const subCustId = crypto.randomUUID();
    const subMakerId = crypto.randomUUID();
    const subBatchId = crypto.randomUUID();
    const subPayoutId = crypto.randomUUID();
    const subItemId = crypto.randomUUID();

    await poolA.query(
      `INSERT INTO users (id, organization_id, username, full_name, phone_number, role, status)
       VALUES ($1, $2, $3, 'Maker A', $4, 'ACCOUNTANT', 'ACTIVE')
       ON CONFLICT DO NOTHING;`,
      [subMakerId, orgA, `maker_a_${suffix}`, `9700${suffix.replace(/[^0-9]/g, '').padStart(6, '0').slice(0, 6)}`]
    );
    await poolA.query(
      `INSERT INTO customers (
         id, organization_id, primary_center_id, farmer_code, full_name,
         normalized_mobile_number, bank_account_number, bank_ifsc_code,
         beneficiary_status, bank_verification_status, status, registration_status
       ) VALUES (
         $1, $2, $3, 'FA-SUB-01', 'Submission Farmer',
         $4, '112233445566', 'UBIN0530789',
         'ACTIVE', 'VERIFIED', 'ACTIVE', 'APPROVED'
       );`,
      [subCustId, orgA, centerA, `9600${suffix.replace(/[^0-9]/g, '').padStart(6, '0').slice(0, 6)}`]
    );
    await poolA.query(
      `INSERT INTO customer_ledger_accounts (customer_id, organization_id, current_balance)
       VALUES ($1, $2, 1000.00);`,
      [subCustId, orgA]
    );
    await poolA.query(
      `INSERT INTO payment_batches (
         id, organization_id, center_id, batch_number, payment_method, status,
         total_beneficiaries, total_amount, pending_count, pending_amount,
         bank_name, bank_channel, idempotency_key, created_by, approved_by, approved_at
       ) VALUES (
         $1, $2, $3, $4, 'BANK_TRANSFER', 'APPROVED',
         1, 400.00, 1, 400.00,
         'Union Bank of India', 'UNION_BANK_BULK_NEFT', $5, $6, $7, NOW()
       );`,
      [subBatchId, orgA, centerA, `BATCH-SUB-${suffix}`, `idem-sub-batch-${suffix}`, subMakerId, userA]
    );
    await poolA.query(
      `INSERT INTO customer_payouts (
         id, organization_id, center_id, customer_id, batch_id, direction,
         amount, currency, payment_method, status, reference_number, source_transaction_type,
         idempotency_key, bank_account_mask, bank_ifsc, recipient_name, created_by, approved_by, approved_at
       ) VALUES (
         $1, $2, $3, $4, $5, 'DAIRY_PAYS_CUSTOMER',
         400.00, 'INR', 'BANK_TRANSFER', 'APPROVED', $6, 'BATCH_DISBURSEMENT',
         $7, 'XXXX-XXXX-5566', 'UBIN0530789', 'Submission Farmer', $8, $9, NOW()
       );`,
      [subPayoutId, orgA, centerA, subCustId, subBatchId, `REF-SUB-${suffix}`, `idem-sub-pay-${suffix}`, subMakerId, userA]
    );
    await poolA.query(
      `INSERT INTO payment_batch_items (
         id, batch_id, payout_id, customer_id, amount, currency,
         bank_account_mask, bank_ifsc, status, beneficiary_reference
       ) VALUES (
         $1, $2, $3, $4, 400.00, 'INR',
         'XXXX-XXXX-5566', 'UBIN0530789', 'APPROVED', $5
       );`,
      [subItemId, subBatchId, subPayoutId, subCustId, `REF-SUB-${suffix}`]
    );

    // DF-024: reject missing / all-zero debit account before creating bank submission
    await assert.rejects(
      () => UnionBankSubmissionService.submitBatch({ batchId: subBatchId, submissionType: 'BULK_FILE_EXPORT' }, authA),
      (err) => err.code === 'DAIRY_DEBIT_ACCOUNT_NOT_CONFIGURED'
    );
    await assert.rejects(
      () => UnionBankSubmissionService.submitBatch({
        batchId: subBatchId,
        submissionType: 'BULK_FILE_EXPORT',
        debitAccountNumber: '00000000000000',
      }, authA),
      (err) => err.code === 'INVALID_BANK_ACCOUNT'
    );

    // Timeout simulation on HOST_TO_HOST_API leaves recoverable TIMEOUT_UNKNOWN / UNKNOWN state
    const origApiSubmit = UnionBankSubmissionService['apiClient'].submitBatch;
    UnionBankSubmissionService['apiClient'].submitBatch = async () => {
      throw new Error('Simulated Union Bank API gateway timeout');
    };
    try {
      await assert.rejects(
        () => UnionBankSubmissionService.submitBatch({
          batchId: subBatchId,
          submissionType: 'HOST_TO_HOST_API',
          debitAccountNumber: '053211010009999',
          idempotencyKey: `idem-h2h-${suffix}`,
        }, authA),
        (err) => err.code === 'UNION_BANK_TIMEOUT_UNKNOWN' && err.statusCode === 504
      );
    } finally {
      UnionBankSubmissionService['apiClient'].submitBatch = origApiSubmit;
    }

    const subRow = await poolA.query(`SELECT status FROM bank_submissions WHERE batch_id = $1;`, [subBatchId]);
    assert.equal(subRow.rows[0].status, 'TIMEOUT_UNKNOWN');
    const balDuringUnknown = await poolA.query(`SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;`, [subCustId]);
    assert.equal(Number(balDuringUnknown.rows[0].current_balance), 1000, 'Timeout must never debit ledger');

    // Tenant B cannot run Status Inquiry against Tenant A's item
    await assert.rejects(
      () => UnionBankStatusInquiryService.queryItemStatus(subItemId, authB),
      (err) => err.code === 'ITEM_NOT_FOUND' && err.statusCode === 404
    );

    // Status Inquiry resolving PAID settles once & debits Tenant A once (outside TX HTTP)
    const origQueryStatus = UnionBankStatusInquiryService['apiClient'].queryPaymentStatus;
    UnionBankStatusInquiryService['apiClient'].queryPaymentStatus = async (ref) => ({
      customerReference: ref,
      bankUtr: `UTR-INQ-${suffix}`,
      amount: 400,
      status: 'PAID',
      transactionDate: '2026-11-28',
    });
    try {
      const inqPaid = await UnionBankStatusInquiryService.queryItemStatus(subItemId, authA);
      assert.equal(inqPaid.currentStatus, 'PAID');
      assert.equal(inqPaid.isIdempotentReplay, false);

      // Replay must not double-debit
      const inqReplay = await UnionBankStatusInquiryService.queryItemStatus(subItemId, authA);
      assert.equal(inqReplay.currentStatus, 'PAID');
      assert.equal(inqReplay.isIdempotentReplay, true);
    } finally {
      UnionBankStatusInquiryService['apiClient'].queryPaymentStatus = origQueryStatus;
    }

    const balAfterInq = await poolA.query(`SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;`, [subCustId]);
    assert.equal(Number(balAfterInq.rows[0].current_balance), 600, 'Inquiry PAID must debit once (1000 -> 600)');
  });

  await t.test('Group K: Generic ReconciliationService, signed Webhook, manual resolveRecord & PayoutService/BatchService tenant isolation', async () => {
    const reconSvc = new ReconciliationService();
    const payoutSvc = new PayoutService();

    // CSV import & manual resolve in Tenant A without touching Control Plane or Tenant B
    const csvRes = await reconSvc.importBankStatementCsv({
      fileName: 'stmt-a.csv',
      rows: [{
        transactionDate: '2026-11-28',
        referenceNumber: `MAN-REF-${suffix}`,
        amount: 250,
        direction: 'DEBIT',
      }],
    }, authA);
    assert.equal(csvRes.summary.unmatchedCount, 1);
    const manualRecId = csvRes.records[0].recordId;

    const reconInCtrl = await poolCtrl.query(`SELECT COUNT(*)::int AS cnt FROM payment_reconciliation_records WHERE id = $1;`, [manualRecId]);
    assert.equal(reconInCtrl.rows[0].cnt, 0, 'Control plane DB must never receive reconciliation rows');

    // Create & approve payout in Tenant A via PayoutService (strict tenant DB)
    const manPayout = await payoutSvc.createPayout({
      centerId: centerA,
      customerId: fA1.customerId,
      amount: 250,
      paymentMethod: 'BANK_TRANSFER',
      referenceNumber: `MAN-REF-${suffix}`,
      idempotencyKey: `man-payout-${suffix}`,
      allowOverpaymentAdvance: true,
    }, authA);
    await payoutSvc.approvePayout(manPayout.payoutId, authA, 'Approve manual settle');

    const resolvedMan = await reconSvc.resolveRecord(
      manualRecId,
      'CONFIRMED_SETTLED',
      'Confirmed via manual UTR check',
      authA,
      manPayout.payoutId
    );
    assert.equal(resolvedMan.action, 'CONFIRMED_SETTLED');
    const manPayoutRow = await payoutSvc.getPayoutById(manPayout.payoutId, authA);
    assert.equal(manPayoutRow.status, 'SETTLED');

    // Signed webhook routes exclusively to Tenant B DB
    const whSecret = process.env['PAYMENT_WEBHOOK_SECRET'] || process.env['JWT_SECRET'];
    const whPayload = JSON.stringify({
      eventId: `evt-b-${suffix}`,
      referenceNumber: fB1.beneficiaryRef,
      amount: fB1.amount,
      organizationId: orgB,
    });
    const whSig = crypto.createHmac('sha256', whSecret).update(whPayload).digest('hex');
    const whRes = await reconSvc.processWebhook(whPayload, whSig, String(Date.now()));
    assert.equal(whRes.isIdempotentReplay, false);
    const inB = await poolB.query(`SELECT COUNT(*)::int AS cnt FROM payment_reconciliation_records WHERE external_event_id = $1;`, [`evt-b-${suffix}`]);
    const inA = await poolA.query(`SELECT COUNT(*)::int AS cnt FROM payment_reconciliation_records WHERE external_event_id = $1;`, [`evt-b-${suffix}`]);
    assert.equal(inB.rows[0].cnt, 1);
    assert.equal(inA.rows[0].cnt, 0);

    // Tenant B can list its batch via BatchService while Tenant A is rejected
    const bBatch = await batchService.getBatchById(batchB1, authB);
    assert.equal(bBatch.organizationId, orgB);
    await assert.rejects(() => batchService.getBatchById(batchB1, authA), (err) => err.code === 'BATCH_NOT_FOUND');

    // Platform ID fails closed
    await assert.rejects(
      () => payoutSvc.getPayoutById(manPayout.payoutId, { ...authA, organizationId: PLATFORM_FEDERATION_DAIRY_ID }),
      (err) => err.code === 'CONTROL_PLANE_TARGET_FORBIDDEN'
    );
  });

  await t.test('Group L: Pooled connection resets app.current_organization_id after both COMMIT and ROLLBACK', async () => {
    const tDbA = await tenantDbManager.getStrictTenantDb(orgA, { bypassCache: true, strictOperational: true });
    let capturedSettingAfterCommit = null;
    await tDbA.withTransaction(async (client) => {
      const during = await client.query(`SELECT current_setting('app.current_organization_id', true) AS v;`);
      assert.equal(during.rows[0].v, orgA);
    });
    const afterCommit = await poolA.query(`SELECT current_setting('app.current_organization_id', true) AS v;`);
    capturedSettingAfterCommit = afterCommit.rows[0].v || '';
    assert.equal(capturedSettingAfterCommit, '', 'Local GUC app.current_organization_id must reset after COMMIT');

    await assert.rejects(
      () => tDbA.withTransaction(async (client) => {
        const during = await client.query(`SELECT current_setting('app.current_organization_id', true) AS v;`);
        assert.equal(during.rows[0].v, orgA);
        throw new Error('Force rollback reset check');
      }),
      /Force rollback reset check/
    );
    const afterRollback = await poolA.query(`SELECT current_setting('app.current_organization_id', true) AS v;`);
    assert.equal(afterRollback.rows[0].v || '', '', 'Local GUC app.current_organization_id must reset after ROLLBACK');

    const groupLCentralFinancialQueries = centralQueries.filter((q) =>
      /\b(payment_batches|payment_batch_items|customer_payouts|customer_ledger_accounts|ledger_transactions|ledger_entries|payment_reconciliation_records|payment_adjustments)\b/i.test(q)
    );

    assert.equal(
      groupLCentralFinancialQueries.length,
      0,
      'Central control plane must never execute operational financial SQL'
    );
    assert.equal(getAllTenantDbsCalled, false, 'getAllTenantDbs must never be called');
    assert.equal(permissiveGetTenantDbCalled, false, 'Permissive getTenantDb must never be called');
  });

  await t.test('Group M: RESTART-10.4 migration 049, encrypted customer bank storage, fail-closed crypto, settlement, bank export, reconciliation & create_customer_payout SQL mask', async () => {
    // A & B: Verify migration 049 applied cleanly to tenant DB (TEXT bank_account_number + VARCHAR(30) bank_account_mask)
    // and skipped on control-plane DB
    const colInfo = await poolA.query(
      `SELECT column_name, data_type, character_maximum_length
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'customers'
         AND column_name IN ('bank_account_number', 'bank_account_mask')
       ORDER BY column_name ASC;`
    );
    assert.deepEqual(
      colInfo.rows,
      [
        { column_name: 'bank_account_mask', data_type: 'character varying', character_maximum_length: 30 },
        { column_name: 'bank_account_number', data_type: 'text', character_maximum_length: null },
      ]
    );
    const migA = await poolA.query(`SELECT version FROM schema_migrations WHERE version = '049';`);
    const migCtrl = await poolCtrl.query(`SELECT version FROM schema_migrations WHERE version = '049';`);
    assert.equal(migA.rows.length, 1, 'Migration 049 must be applied to TENANT_OPERATIONAL');
    assert.equal(migCtrl.rows.length, 0, 'Migration 049 must NOT be applied to CONTROL_PLANE');

    // Seed synthetic customers in Tenant A for end-to-end encrypted, legacy, and tampered scenarios
    const cEncId = crypto.randomUUID();
    const cLegacyId = crypto.randomUUID();
    const cTamperedId = crypto.randomUUID();
    const checkerA = crypto.randomUUID();
    const todayStr = new Date().toISOString().slice(0, 10);

    await poolA.query(
      `INSERT INTO users (id, organization_id, username, full_name, phone_number, role, status)
       VALUES ($1, $2, $3, 'Checker Owner', $4, 'ACCOUNTANT', 'ACTIVE')
       ON CONFLICT (id) DO NOTHING;`,
      [checkerA, orgA, `chk_${suffix}`, `9700${suffix.replace(/[^0-9]/g, '').padStart(6, '0').slice(0, 6)}`]
    );

    const encTamperBase = CredentialEncryption.encrypt('554433221100');
    const tamperedCipher =
      encTamperBase.slice(0, -1) + (encTamperBase.slice(-1) === '0' ? '1' : '0');

    await poolA.query(
      `INSERT INTO customers (
         id, organization_id, primary_center_id, farmer_code, full_name,
         normalized_mobile_number, bank_name, bank_account_number, bank_account_mask, bank_ifsc_code,
         bank_account_holder_name, status, bank_verification_status, beneficiary_status, registration_status
       ) VALUES
         ($1, $2, $3, 'FA-R104-ENC', 'Encrypted Farmer', $4, 'Union Bank of India', '101010101010', 'XXXX-XXXX-1010', 'UBIN0530789', 'Encrypted Farmer', 'ACTIVE', 'VERIFIED', 'ACTIVE', 'APPROVED'),
         ($5, $2, $3, 'FA-R104-LEG', 'Legacy Farmer', $6, 'State Bank of India', '234567890123', NULL, 'SBIN0001234', 'Legacy Farmer', 'ACTIVE', 'VERIFIED', 'ACTIVE', 'APPROVED'),
         ($7, $2, $3, 'FA-R104-BAD', 'Tampered Farmer', $8, 'Union Bank of India', $9, 'XXXX-XXXX-1100', 'UBIN0530789', 'Tampered Farmer', 'ACTIVE', 'VERIFIED', 'ACTIVE', 'APPROVED');`,
      [
        cEncId, orgA, centerA, `9510${suffix.replace(/[^0-9]/g, '').padStart(6, '0').slice(0, 6)}`,
        cLegacyId, `9520${suffix.replace(/[^0-9]/g, '').padStart(6, '0').slice(0, 6)}`,
        cTamperedId, `9530${suffix.replace(/[^0-9]/g, '').padStart(6, '0').slice(0, 6)}`, tamperedCipher,
      ]
    );

    for (const [idx, cid, bal] of [
      [1, cEncId, 1500.0],
      [2, cLegacyId, 800.0],
      [3, cTamperedId, 600.0],
    ]) {
      await poolA.query(
        `INSERT INTO customer_ledger_accounts (customer_id, organization_id, current_balance)
         VALUES ($1, $2, $3);`,
        [cid, orgA, bal]
      );
      await poolA.query(
        `INSERT INTO ledger_transactions (
           organization_id, center_id, customer_id, transaction_type, direction,
           amount, balance_after, reference_entity, reference_id, description, idempotency_key, created_by
         ) VALUES (
           $1, $2, $3, 'MILK_COLLECTION_CREDIT', 'CREDIT',
           $4, $4, 'MILK_COLLECTION', $5, 'RESTART-10.4 settlement credit', $6, $7
         );`,
        [orgA, centerA, cid, bal, crypto.randomUUID(), `idem-r104-lt-${idx}-${suffix}`, userA]
      );
    }

    // C & N: Update beneficiary bank details -> encrypted (>50 chars) & audit log contains only masks
    const synthUpdatedAcct = '987654321098';
    const updRes = await batchService.updateBeneficiaryBankDetails(
      cEncId,
      {
        bankName: 'Union Bank of India',
        bankAccountNumber: synthUpdatedAcct,
        bankIfscCode: 'UBIN0530789',
        bankAccountHolderName: 'Encrypted Farmer',
      },
      authA
    );
    assert.equal(updRes.bankAccountNumberMask, 'XXXX-XXXX-1098');
    assert.equal(JSON.stringify(updRes).includes(synthUpdatedAcct), false);

    const encRow = await poolA.query(
      `SELECT bank_account_number, bank_account_mask FROM customers WHERE id = $1;`,
      [cEncId]
    );
    assert.ok(encRow.rows[0].bank_account_number.length > 50, 'Full AES-256-GCM envelope stored without VARCHAR(50) truncation');
    assert.notEqual(encRow.rows[0].bank_account_number, synthUpdatedAcct);
    assert.equal(CredentialEncryption.decrypt(encRow.rows[0].bank_account_number), synthUpdatedAcct);
    assert.equal(encRow.rows[0].bank_account_mask, 'XXXX-XXXX-1098');

    const auditRows = await poolA.query(
      `SELECT previous_account_mask, new_account_mask FROM beneficiary_audit_logs WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 1;`,
      [cEncId]
    );
    assert.equal(auditRows.rows[0].previous_account_mask, 'XXXX-XXXX-1010');
    assert.equal(auditRows.rows[0].new_account_mask, 'XXXX-XXXX-1098');

    // D: Encryption failure must fail closed without storing plaintext
    const origEncFn = CredentialEncryption.encrypt;
    CredentialEncryption.encrypt = () => {
      throw new Error('Simulated production key outage');
    };
    try {
      await assert.rejects(
        () => batchService.updateBeneficiaryBankDetails(
          cEncId,
          {
            bankName: 'Union Bank of India',
            bankAccountNumber: '777766665555',
            bankIfscCode: 'UBIN0530789',
            bankAccountHolderName: 'Encrypted Farmer',
          },
          authA
        ),
        (err) => err.code === 'BENEFICIARY_BANK_ENCRYPTION_FAILED'
      );
      const afterFailRow = await poolA.query(
        `SELECT bank_account_number FROM customers WHERE id = $1;`,
        [cEncId]
      );
      assert.equal(CredentialEncryption.decrypt(afterFailRow.rows[0].bank_account_number), synthUpdatedAcct);
    } finally {
      CredentialEncryption.encrypt = origEncFn;
    }

    // M: Tenant B cannot read or modify Tenant A customer bank details
    await assert.rejects(
      () => batchService.getBeneficiaryAuditHistory(cEncId, authB),
      (err) => err.code === 'CUSTOMER_NOT_FOUND'
    );
    await assert.rejects(
      () => batchService.updateBeneficiaryBankDetails(
        cEncId,
        {
          bankName: 'Union Bank of India',
          bankAccountNumber: '665544332211',
          bankIfscCode: 'UBIN0530789',
          bankAccountHolderName: 'Cross Tenant Attack',
        },
        { ...authB },
        orgA
      ),
      (err) => err.code === 'CROSS_ORG_ACCESS_DENIED'
    );

    // L: SQL public.create_customer_payout() consumes customers.bank_account_mask, not RIGHT(ciphertext, 4)
    const encTailFour = encRow.rows[0].bank_account_number.slice(-4);
    const directPayout = await poolA.query(
      `SELECT public.create_customer_payout(
         $1, $2, $3, 250.00, 'BANK_TRANSFER', $4, 'MANUAL_PAYOUT', NULL, $5, FALSE, 'RESTART-10.4 SQL mask test', $6
       ) AS payout;`,
      [orgA, centerA, cEncId, `REF-SQLM-${suffix}`, `idem-sqlm-${suffix}`, userA]
    );
    const sqlPayoutJson = directPayout.rows[0].payout;
    assert.equal(sqlPayoutJson.bankAccountMask, 'XXXX-XXXX-1098');
    if (encTailFour !== '1098') {
      assert.notEqual(sqlPayoutJson.bankAccountMask, `XXXX-XXXX-${encTailFour}`);
    }
    const storedSqlPayout = await poolA.query(
      `SELECT bank_account_mask FROM customer_payouts WHERE id = $1;`,
      [sqlPayoutJson.payoutId]
    );
    assert.equal(storedSqlPayout.rows[0].bank_account_mask, 'XXXX-XXXX-1098');
    // Cleanly cancel the standalone DRAFT/PENDING_APPROVAL test payout so it doesn't reserve full balance
    await poolA.query(
      `UPDATE customer_payouts SET status = 'FAILED', failure_reason = 'RESTART-10.4 mask test cleanup' WHERE id = $1;`,
      [sqlPayoutJson.payoutId]
    );

    // H, G, F: SettlementCalculationService validates decrypted + legacy accounts, flags tampered ciphertext, preserves stored masks
    const previewRes = await batchService.calculateSettlementPreview(
      {
        organizationId: orgA,
        periodStart: todayStr,
        periodEnd: todayStr,
        customerIds: [cEncId, cLegacyId, cTamperedId],
      },
      authA
    );
    const previewJson = JSON.stringify(previewRes);
    assert.equal(previewJson.includes(synthUpdatedAcct), false, 'Preview must never leak decrypted plaintext');
    assert.equal(previewJson.includes(encRow.rows[0].bank_account_number), false, 'Preview must never leak AES ciphertext');

    const prevEnc = previewRes.farmers.find((f) => f.customerId === cEncId);
    const prevLeg = previewRes.farmers.find((f) => f.customerId === cLegacyId);
    const prevTam = previewRes.farmers.find((f) => f.customerId === cTamperedId);
    assert.equal(prevEnc.isBankValid, true);
    assert.equal(prevEnc.bankAccountNumberMask, 'XXXX-XXXX-1098');
    assert.equal(prevLeg.isBankValid, true);
    assert.equal(prevLeg.bankAccountNumberMask, 'XXXX-XXXX-0123');
    assert.equal(prevTam.isBankValid, false);
    assert.equal(prevTam.hasMalformedCiphertext, true);
    assert.equal(prevTam.bankAccountNumberMask, 'XXXX-XXXX-1100');

    // I: Batch creation excludes tampered-ciphertext farmer & persists masks to customer_payouts + payment_batch_items
    const batchRes = await batchService.createBatch(
      {
        billingPeriodStart: todayStr,
        billingPeriodEnd: todayStr,
        customerIds: [cEncId, cLegacyId, cTamperedId],
        idempotencyKey: `idem-r104-batch-${suffix}`,
        paymentMethod: 'BANK_TRANSFER',
      },
      authA
    );
    assert.equal(batchRes.totalBeneficiaries, 2);
    const r104PayoutMasks = await poolA.query(
      `SELECT customer_id, bank_account_mask FROM customer_payouts WHERE batch_id = $1 ORDER BY bank_account_mask ASC;`,
      [batchRes.batchId]
    );
    const r104ItemMasks = await poolA.query(
      `SELECT customer_id, bank_account_mask FROM payment_batch_items WHERE batch_id = $1 ORDER BY bank_account_mask ASC;`,
      [batchRes.batchId]
    );
    assert.deepEqual(
      r104PayoutMasks.rows.map((r) => r.bank_account_mask),
      ['XXXX-XXXX-0123', 'XXXX-XXXX-1098']
    );
    assert.deepEqual(
      r104ItemMasks.rows.map((r) => r.bank_account_mask),
      ['XXXX-XXXX-0123', 'XXXX-XXXX-1098']
    );

    // K: Approve batch with checkerA & verify BankFileService + UnionBankSubmissionService decrypt & reject tampered ciphertext
    await batchService.submitForReview(batchRes.batchId, authA);
    await batchService.approveBatch(batchRes.batchId, { ...authA, userId: checkerA });

    const expRes = await BankFileService.exportBatch(
      batchRes.batchId,
      'UNION_BANK_BULK_NEFT_CSV',
      authA,
      { debitAccountNumber: '053211010009999' }
    );
    const expFile = BankFileService.getExportByToken(expRes.downloadToken);
    assert.ok(expFile.content.includes(synthUpdatedAcct), 'Bank file export must include decrypted AES account');
    assert.ok(expFile.content.includes('234567890123'), 'Bank file export must include valid legacy numeric account');
    assert.equal(expFile.content.includes('554433221100'), false, 'Excluded tampered customer must not appear in bank file');

    // J: UnionBankReconciliationService settles batch reading canonical historical mask without schema error
    const itemRefsRes = await poolA.query(
      `SELECT beneficiary_reference, amount FROM payment_batch_items WHERE batch_id = $1 ORDER BY created_at ASC;`,
      [batchRes.batchId]
    );
    const reconSummary = await UnionBankReconciliationService.reconcileBatchWithBankData(
      batchRes.batchId,
      itemRefsRes.rows.map((r, idx) => ({
        customerReference: r.beneficiary_reference,
        bankUtr: `UTR-R104-${idx}-${suffix}`,
        amount: Number(r.amount),
        status: 'PAID',
      })),
      authA
    );
    assert.equal(reconSummary.paidCount, 2);

    // Non-period batch creation with encrypted customer submits cleanly via UnionBankSubmissionService
    await poolA.query(
      `UPDATE customer_ledger_accounts SET current_balance = 500.00 WHERE customer_id = $1;`,
      [cEncId]
    );
    const subBatchRes = await batchService.createBatch(
      {
        customerIds: [cEncId],
        idempotencyKey: `idem-r104-sub-np-${suffix}`,
        paymentMethod: 'BANK_TRANSFER',
      },
      authA
    );
    await batchService.submitForReview(subBatchRes.batchId, authA);
    await batchService.approveBatch(subBatchRes.batchId, { ...authA, userId: checkerA });
    const h2hBulk = await UnionBankSubmissionService.submitBatch(
      {
        batchId: subBatchRes.batchId,
        submissionType: 'BULK_FILE_EXPORT',
        fileFormat: 'UNION_BANK_BULK_NEFT_CSV',
        debitAccountNumber: '053211010009999',
        idempotencyKey: `idem-r104-ubsub-${suffix}`,
      },
      authA
    );
    assert.ok(h2hBulk.fileContent.includes(synthUpdatedAcct));
  });
  } catch (err) {
    primaryError = err;
    throw err;
  } finally {
    const cleanupErrors = [];
    const runCleanupStep = async (fn) => {
      try {
        await fn();
      } catch (err) {
        cleanupErrors.push(err instanceof Error ? err : new Error(String(err)));
      }
    };

    tenantDbManager.setControlPlaneDb(origCtrlDb);
    tenantDbManager.getAllTenantDbs = origGetAllTenantDbs;
    tenantDbManager.getTenantDb = origGetTenantDb;
    NotificationService.enqueueNotification = origNotify;

    let rlsRoleExists = rlsRoleCreated;
    if (adminPool && rlsRoleAttempted && !rlsRoleExists) {
      await runCleanupStep(async () => {
        const roleRes = await adminPool.query(
          `SELECT 1 FROM pg_roles WHERE rolname = $1;`,
          [rlsRoleName]
        );
        rlsRoleExists = roleRes.rows.length > 0;
      });
    }

    if (poolA) {
      if (faultTriggerCreated) {
        await runCleanupStep(async () => {
          await poolA.query(`DROP TRIGGER IF EXISTS trg_r10_fault_inject ON customer_payouts;`);
          await poolA.query(`DROP FUNCTION IF EXISTS public.fn_r10_fault_inject();`);
        });
      }
      if (rlsRoleExists) {
        await runCleanupStep(async () => {
          await poolA.query(`REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM "${rlsRoleName}";`);
          await poolA.query(`REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM "${rlsRoleName}";`);
          await poolA.query(`REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM "${rlsRoleName}";`);
          await poolA.query(`REVOKE ALL ON SCHEMA public FROM "${rlsRoleName}";`);
        });
      }
    }

    for (const id of [orgA, orgB, orgDisabled]) {
      await runCleanupStep(async () => {
        const tp = tenantDbManager.getTenantPool?.(id);
        if (tp) {
          attachPoolErrorGuard(tp, `tenant-${id}`);
          await closePoolCleanly(tp, `tenant-${id}`, () => tenantDbManager.closeTenantPool(id));
        }
      });
    }
    await runCleanupStep(() => tenantDbManager.closeAllPools());
    await runCleanupStep(() => closePoolCleanly(db.pool, 'globalDbPool', () => db.close()));

    for (const [pool, label] of [
      [rlsPool, 'rlsPool'],
      [rlsRestrictedPool, 'rlsRestrictedPool'],
      [poolA, 'poolA'],
      [poolB, 'poolB'],
      [poolCtrl, 'poolCtrl'],
    ]) {
      if (pool) {
        await runCleanupStep(() => closePoolCleanly(pool, label));
      }
    }

    for (const dbName of [...createdDatabases].reverse()) {
      await runCleanupStep(async () => {
        await waitForDbIdle(adminPool, dbName);
        await adminPool.query(`DROP DATABASE IF EXISTS "${dbName}";`);
      });
    }

    if (rlsRoleExists) {
      await runCleanupStep(async () => {
        await adminPool.query(`DROP ROLE IF EXISTS "${rlsRoleName}";`);
      });
    }

    await runCleanupStep(() => closePoolCleanly(adminPool, 'adminPool'));
    await runCleanupStep(async () => {
      assert.deepEqual(poolErrors, [], `Unexpected async PostgreSQL pool errors: ${JSON.stringify(poolErrors)}`);
    });

    if (cleanupErrors.length > 0) {
      const cleanErr =
        cleanupErrors.length === 1
          ? cleanupErrors[0]
          : new AggregateError(
              cleanupErrors,
              `Cleanup failed with ${cleanupErrors.length} errors: ${cleanupErrors.map((e) => e.message).join('; ')}`
            );
      if (primaryError) {
        const orig = primaryError instanceof Error ? primaryError : new Error(String(primaryError));
        throw new AggregateError([orig, cleanErr], `${orig.message} (cleanup also failed: ${cleanErr.message})`);
      }
      throw cleanErr;
    }
  }
});
