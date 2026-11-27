import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';

process.env.NODE_ENV = 'test';
if (!process.env.TENANT_POOL_CONNECTION_TIMEOUT_MS) {
  process.env.TENANT_POOL_CONNECTION_TIMEOUT_MS = '500';
}

const { createApp } = await import('../dist/app.js');
const { db } = await import('../dist/infrastructure/database/PostgresPool.js');
const { tenantDbManager } = await import('../dist/infrastructure/database/TenantDatabaseManager.js');
const {
  PostgresCollectionTransactionRepository,
  PostgresLedgerRepository,
  PostgresShiftSessionRepository,
  PostgresCustomerMembershipRepository,
} = await import('../dist/infrastructure/index.js');
const {
  GetCustomerMembershipsUseCase,
  ReconcileCustomerMembershipsUseCase,
  OpenShiftSessionUseCase,
} = await import('../dist/application/use-cases/index.js');
const { MilkCollectionTransaction } = await import('../dist/domain/entities/MilkCollectionTransaction.js');
const { CustomerLedgerAccount } = await import('../dist/domain/entities/CustomerLedgerAccount.js');
const { HmacJwtTokenService } = await import('../dist/infrastructure/security/HmacJwtTokenService.js');
const { doveOtpService } = await import('../dist/infrastructure/otp/DoveOtpService.js');

const app = createApp();
const tokenService = new HmacJwtTokenService();

test('RESTART-03.2: Operational Repositories, Multi-Dairy Discovery & Dairy Admin Isolation Suite', async (suite) => {
  const orgA = crypto.randomUUID();
  const orgB = crypto.randomUUID();
  const orgUnmapped = crypto.randomUUID();

  const centerA = crypto.randomUUID();
  const centerB = crypto.randomUUID();
  const fakeCenter = crypto.randomUUID();

  const opA = crypto.randomUUID();
  const adminA = crypto.randomUUID();
  const opB = crypto.randomUUID();
  const adminB = crypto.randomUUID();
  const adminUnmapped = crypto.randomUUID();
  const superAdminNoOrg = crypto.randomUUID();
  const fakeOperator = crypto.randomUUID();
  const customerStaffRoleCheck = crypto.randomUUID();

  await db.query(
    `INSERT INTO organizations (id, name, code, status) VALUES
      ($1, 'R032 Dairy Alpha', 'R32-ALP', 'ACTIVE'),
      ($2, 'R032 Dairy Beta', 'R32-BET', 'ACTIVE'),
      ($3, 'R032 Dairy Unmapped', 'R32-UNM', 'ACTIVE')
     ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE';`,
    [orgA, orgB, orgUnmapped]
  );

  await tenantDbManager.provisionTenantDatabase({ dairyId: orgA, dairyCode: 'R32-ALP', dairyName: 'R032 Dairy Alpha' });
  await tenantDbManager.provisionTenantDatabase({ dairyId: orgB, dairyCode: 'R32-BET', dairyName: 'R032 Dairy Beta' });

  const tenantDbA = await tenantDbManager.getStrictTenantDb(orgA);
  const tenantDbB = await tenantDbManager.getStrictTenantDb(orgB);

  for (const tdb of [tenantDbA, tenantDbB]) {
    await tdb.query(`DELETE FROM customers;`).catch(() => {});
    await tdb.query(`DELETE FROM user_center_assignments;`).catch(() => {});
    await tdb.query(`DELETE FROM dairy_centers;`).catch(() => {});
  }

  await db.query(
    `INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status) VALUES
      ($1, $3, 'R32-CA', 'Alpha Primary', 'Road A', 'Village A', 'Pune', 'MH', '411001', '+919800001001', 'ACTIVE'),
      ($2, $4, 'R32-CB', 'Beta Primary', 'Road B', 'Village B', 'Pune', 'MH', '411002', '+919800001002', 'ACTIVE')
     ON CONFLICT (id) DO NOTHING;`,
    [centerA, centerB, orgA, orgB]
  );

  await tenantDbA.query(
    `INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status) VALUES
      ($1, $2, 'R32-CA', 'Alpha Primary', 'Road A', 'Village A', 'Pune', 'MH', '411001', '+919800001001', 'ACTIVE')
     ON CONFLICT (id) DO NOTHING;`,
    [centerA, orgA]
  );
  await tenantDbB.query(
    `INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status) VALUES
      ($1, $2, 'R32-CB', 'Beta Primary', 'Road B', 'Village B', 'Pune', 'MH', '411002', '+919800001002', 'ACTIVE')
     ON CONFLICT (id) DO NOTHING;`,
    [centerB, orgB]
  );

  await db.query(
    `INSERT INTO users (id, organization_id, username, full_name, phone_number, role, user_role, status) VALUES
      ($1, $7, 'r32_op_a', 'R32 Op A', '+919800200001', 'COLLECTION_OPERATOR', 'COLLECTION_OPERATOR', 'ACTIVE'),
      ($2, $7, 'r32_adm_a', 'R32 Adm A', '+919800200002', 'DAIRY_ADMIN', 'PRIMARY_DAIRY_ADMIN', 'ACTIVE'),
      ($3, $8, 'r32_op_b', 'R32 Op B', '+919800200003', 'COLLECTION_OPERATOR', 'COLLECTION_OPERATOR', 'ACTIVE'),
      ($4, $8, 'r32_adm_b', 'R32 Adm B', '+919800200004', 'DAIRY_ADMIN', 'PRIMARY_DAIRY_ADMIN', 'ACTIVE'),
      ($5, $9, 'r32_adm_unm', 'R32 Adm Unm', '+919800200006', 'DAIRY_ADMIN', 'PRIMARY_DAIRY_ADMIN', 'ACTIVE'),
      ($6, $7, 'r32_sa_org_a', 'R32 SuperAdmin', '+919800200007', 'SUPER_ADMIN', 'SUPER_ADMIN', 'ACTIVE')
     ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', organization_id = EXCLUDED.organization_id;`,
    [opA, adminA, opB, adminB, adminUnmapped, superAdminNoOrg, orgA, orgB, orgUnmapped]
  );

  await tenantDbA.query(
    `INSERT INTO users (id, organization_id, username, full_name, phone_number, role, user_role, status) VALUES
      ($1, $4, 'r32_op_a', 'R32 Op A', '+919800200001', 'COLLECTION_OPERATOR', 'COLLECTION_OPERATOR', 'ACTIVE'),
      ($2, $4, 'r32_adm_a', 'R32 Adm A', '+919800200002', 'DAIRY_ADMIN', 'PRIMARY_DAIRY_ADMIN', 'ACTIVE'),
      ($3, $4, 'r32_cust_role', 'R32 Cust Role', '+919800200005', 'FARMER_CUSTOMER', 'FARMER_CUSTOMER', 'ACTIVE')
     ON CONFLICT (id) DO NOTHING;`,
    [opA, adminA, customerStaffRoleCheck, orgA]
  );
  await tenantDbB.query(
    `INSERT INTO users (id, organization_id, username, full_name, phone_number, role, user_role, status) VALUES
      ($1, $3, 'r32_op_b', 'R32 Op B', '+919800200003', 'COLLECTION_OPERATOR', 'COLLECTION_OPERATOR', 'ACTIVE'),
      ($2, $3, 'r32_adm_b', 'R32 Adm B', '+919800200004', 'DAIRY_ADMIN', 'PRIMARY_DAIRY_ADMIN', 'ACTIVE')
     ON CONFLICT (id) DO NOTHING;`,
    [opB, adminB, orgB]
  );

  const opAToken = tokenService.signToken({ userId: opA, organizationId: orgA, centerId: centerA, role: 'COLLECTION_OPERATOR', actorType: 'STAFF', fullName: 'R32 Op A' });
  const adminAToken = tokenService.signToken({ userId: adminA, organizationId: orgA, centerId: centerA, role: 'PRIMARY_DAIRY_ADMIN', actorType: 'STAFF', fullName: 'R32 Adm A' });
  const opBToken = tokenService.signToken({ userId: opB, organizationId: orgB, centerId: centerB, role: 'COLLECTION_OPERATOR', actorType: 'STAFF', fullName: 'R32 Op B' });
  const adminUnmappedToken = tokenService.signToken({ userId: adminUnmapped, organizationId: orgUnmapped, role: 'PRIMARY_DAIRY_ADMIN', actorType: 'STAFF', fullName: 'Unmapped Adm' });

  // Register multi-dairy farmer (approved in both A and B) + Dairy-A-only farmer
  const helperRegisterAndApprove = async (mobile10, orgId, centerId, adminTok, code, fullName) => {
    const e164 = `+91${mobile10}`;
    doveOtpService.resetCooldown(e164);
    const otpReq = await request(app).post('/api/v1/auth/request-otp').send({ mobileNumber: mobile10 });
    assert.equal(otpReq.status, 200);
    const ver = await request(app).post('/api/v1/auth/verify-otp').send({ mobileNumber: mobile10, otp: otpReq.body.previewOtp });
    assert.equal(ver.status, 200);
    const reg = await request(app)
      .post('/api/v1/customers/register')
      .set('Authorization', `Bearer ${ver.body.accessToken}`)
      .send({ fullName, mobileNumber: mobile10, organizationId: orgId, centerId, categories: ['COW', 'BUFFALO'] });
    assert.equal(reg.status, 201);
    const custId = reg.body.customerUuid;
    const appRes = await request(app)
      .post(`/api/v1/customers/${custId}/approve`)
      .set('Authorization', `Bearer ${adminTok}`)
      .set('x-dairy-id', orgId)
      .send({ customerCode: code });
    assert.equal(appRes.status, 200);
    return { custId, globalCustomerId: ver.body.globalCustomerId };
  };

  const multiMobile10 = '9830001001';
  const multiA = await helperRegisterAndApprove(multiMobile10, orgA, centerA, adminAToken, 'FA-3201', 'Multi Dairy Farmer');
  const adminBToken = tokenService.signToken({ userId: adminB, organizationId: orgB, centerId: centerB, role: 'PRIMARY_DAIRY_ADMIN', actorType: 'STAFF', fullName: 'R32 Adm B' });
  const multiB = await helperRegisterAndApprove(multiMobile10, orgB, centerB, adminBToken, 'FB-3201', 'Multi Dairy Farmer');
  const otherCustomer = await helperRegisterAndApprove('9830001002', orgA, centerA, adminAToken, 'FA-3202', 'Other Alpha Farmer');

  // Open sessions in Dairy A and Dairy B
  const sessionRepo = new PostgresShiftSessionRepository();
  const openSessionUseCase = new OpenShiftSessionUseCase(sessionRepo);
  const sessionA = await openSessionUseCase.execute({
    centerId: centerA, organizationId: orgA, operatorId: opA, operatorName: 'R32 Op A',
    deviceIdentifier: 'KIOSK-R32-A', businessDate: '2026-11-27', shift: 'MORNING',
  });
  const sessionB = await openSessionUseCase.execute({
    centerId: centerB, organizationId: orgB, operatorId: opB, operatorName: 'R32 Op B',
    deviceIdentifier: 'KIOSK-R32-B', businessDate: '2026-11-27', shift: 'MORNING',
  });

  const collectionRepo = new PostgresCollectionTransactionRepository();
  const ledgerRepo = new PostgresLedgerRepository();
  const membershipRepo = new PostgresCustomerMembershipRepository();

  // ============================================================================
  // 1. COLLECTION TRANSACTION REPOSITORY STRICT ISOLATION
  // ============================================================================
  const txnAId = crypto.randomUUID();
  const txnBId = crypto.randomUUID();
  const txnAKey = `R32-KEY-A-${Date.now()}`;
  const txnBKey = `R32-KEY-B-${Date.now()}`;

  await suite.test('1. PostgresCollectionTransactionRepository: strict tenant isolation, zero fallback, zero fake entities', async (t) => {
    await t.test('1.1 Missing/invalid organizationId fails closed; getAllTenantDbs and central db are never used', async () => {
      const origGetAll = tenantDbManager.getAllTenantDbs.bind(tenantDbManager);
      const origCentralQuery = db.query.bind(db);
      tenantDbManager.getAllTenantDbs = () => { throw new Error('FORBIDDEN_GLOBAL_SCAN'); };
      db.query = async () => { throw new Error('FORBIDDEN_CENTRAL_FALLBACK'); };

      try {
        for (const badOrg of ['', '   ', 'not-a-uuid', undefined]) {
          await assert.rejects(() => collectionRepo.findById(txnAId, badOrg), (e) => e.name === 'DomainValidationError');
          await assert.rejects(() => collectionRepo.findByIdempotencyKey(txnAKey, badOrg), (e) => e.name === 'DomainValidationError');
          await assert.rejects(() => collectionRepo.listRecentBySession(sessionA.id, 10, badOrg), (e) => e.name === 'DomainValidationError');
          await assert.rejects(() => collectionRepo.listByCustomer(multiA.custId, 10, 0, badOrg), (e) => e.name === 'DomainValidationError');
          await assert.rejects(() => collectionRepo.getMonthlySummary(multiA.custId, '2026-11', badOrg), (e) => e.name === 'DomainValidationError');
        }
      } finally {
        tenantDbManager.getAllTenantDbs = origGetAll;
        db.query = origCentralQuery;
      }
    });

    await t.test('1.2 save() and saveAtomicIntake() isolate writes, fix param shift, and reject fake center/operator/customer', async () => {
      const txnA = new MilkCollectionTransaction({
        id: txnAId,
        transactionCode: `TXN-${txnAId.slice(0, 8)}`,
        sessionId: sessionA.id,
        dairyId: orgA,
        centerId: centerA,
        customerId: multiA.custId,
        customerCode: 'FA-3201',
        customerName: 'Multi Dairy Farmer',
        timestamp: new Date().toISOString(),
        date: '2026-11-27',
        shift: 'MORNING',
        milkCategory: 'COW',
        weightLiters: 10.5,
        fatPercentage: 4.2,
        snfPercentage: 8.5,
        clrDensity: 28.5,
        appliedRatePerLiter: 40,
        rateChartVersion: 1,
        totalAmount: 420,
        identificationMethod: 'MANUAL_SEARCH',
        syncStatus: 'SYNCED_CLOUD',
        deviceId: 'KIOSK-R32-A',
        operatorName: 'R32 Op A',
        idempotencyKey: txnAKey,
      });

      const origCentralQuery = db.query.bind(db);
      const origCentralTx = db.withTransaction.bind(db);
      db.query = async () => { throw new Error('FORBIDDEN_CENTRAL_DUAL_WRITE'); };
      db.withTransaction = async () => { throw new Error('FORBIDDEN_CENTRAL_DUAL_WRITE'); };
      try {
        await collectionRepo.save(txnA);
      } finally {
        db.query = origCentralQuery;
        db.withTransaction = origCentralTx;
      }

      // Cross-tenant & not-found reads
      const foundInA = await collectionRepo.findById(txnAId, orgA);
      assert.equal(foundInA?.id, txnAId);
      assert.equal(foundInA?.weightLiters, 10.5);
      assert.equal(await collectionRepo.findById(txnAId, orgB), null);
      assert.equal(await collectionRepo.findByIdempotencyKey(txnAKey, orgB), null);
      assert.equal((await collectionRepo.listRecentBySession(sessionA.id, 20, orgB)).length, 0);
      assert.equal((await collectionRepo.listByCustomer(multiA.custId, 20, 0, orgB)).length, 0);

      // Zero central duplicate row written
      const ctrlCount = await db.query(`SELECT COUNT(*)::int AS c FROM milk_collections WHERE id = $1;`, [txnAId]);
      assert.equal(Number(ctrlCount.rows[0].c), 0);

      // Save atomic intake in Dairy B for same farmer's Dairy B membership
      const txnB = new MilkCollectionTransaction({
        id: txnBId,
        transactionCode: `TXN-${txnBId.slice(0, 8)}`,
        sessionId: sessionB.id,
        dairyId: orgB,
        centerId: centerB,
        customerId: multiB.custId,
        customerCode: 'FB-3201',
        customerName: 'Multi Dairy Farmer',
        timestamp: new Date().toISOString(),
        date: '2026-11-27',
        shift: 'MORNING',
        milkCategory: 'BUFFALO',
        weightLiters: 5,
        fatPercentage: 6.5,
        snfPercentage: 9.0,
        clrDensity: 29.0,
        appliedRatePerLiter: 60,
        rateChartVersion: 1,
        totalAmount: 300,
        identificationMethod: 'MANUAL_SEARCH',
        syncStatus: 'SYNCED_CLOUD',
        deviceId: 'KIOSK-R32-B',
        operatorName: 'R32 Op B',
        idempotencyKey: txnBKey,
      });

      const atomicResB = await collectionRepo.saveAtomicIntake({
        transaction: txnB,
        session: sessionB,
        totalAmount: 300,
        weightLiters: 5,
        fatPercentage: 6.5,
        snfPercentage: 9.0,
        milkCategory: 'BUFFALO',
        customerId: multiB.custId,
        organizationId: orgB,
        centerId: centerB,
        operatorId: opB,
        operatorName: 'R32 Op B',
        appliedRate: 60,
      });
      assert.equal(atomicResB.isIdempotentReplay, false);
      assert.equal(atomicResB.customerBalanceAfter, 300);

      // Replay same idempotency key in Dairy B -> idempotent, balance unchanged
      const replayB = await collectionRepo.saveAtomicIntake({
        transaction: txnB,
        session: sessionB,
        totalAmount: 300,
        weightLiters: 5,
        fatPercentage: 6.5,
        snfPercentage: 9.0,
        milkCategory: 'BUFFALO',
        customerId: multiB.custId,
        organizationId: orgB,
        centerId: centerB,
        operatorId: opB,
        operatorName: 'R32 Op B',
        appliedRate: 60,
      });
      assert.equal(replayB.isIdempotentReplay, true);
      assert.equal(replayB.customerBalanceAfter, 300);

      // Reject fake center, cross-tenant customer, missing/invalid operator without inserting fake entities
      const usersBefore = Number((await tenantDbA.query(`SELECT COUNT(*)::int AS c FROM users;`)).rows[0].c);
      const centersBefore = Number((await tenantDbA.query(`SELECT COUNT(*)::int AS c FROM dairy_centers;`)).rows[0].c);

      await assert.rejects(
        () => collectionRepo.saveAtomicIntake({
          transaction: new MilkCollectionTransaction({ ...txnA.toJSON(), id: crypto.randomUUID(), centerId: fakeCenter, idempotencyKey: `FAKE-C-${Date.now()}` }),
          session: sessionA, totalAmount: 100, weightLiters: 2, fatPercentage: 4, snfPercentage: 8.5, milkCategory: 'COW',
          customerId: multiA.custId, organizationId: orgA, centerId: fakeCenter, operatorId: opA, operatorName: 'Op A', appliedRate: 50,
        }),
        (e) => e.name === 'DomainValidationError' && e.code === 'INVALID_CENTER'
      );

      await assert.rejects(
        () => collectionRepo.saveAtomicIntake({
          transaction: new MilkCollectionTransaction({ ...txnA.toJSON(), id: crypto.randomUUID(), idempotencyKey: `FAKE-OP-${Date.now()}` }),
          session: sessionA, totalAmount: 100, weightLiters: 2, fatPercentage: 4, snfPercentage: 8.5, milkCategory: 'COW',
          customerId: multiA.custId, organizationId: orgA, centerId: centerA, operatorId: fakeOperator, operatorName: 'Fake', appliedRate: 50,
        }),
        (e) => e.name === 'DomainValidationError' && e.code === 'INVALID_OPERATOR'
      );

      await assert.rejects(
        () => collectionRepo.saveAtomicIntake({
          transaction: new MilkCollectionTransaction({ ...txnA.toJSON(), id: crypto.randomUUID(), customerId: multiB.custId, idempotencyKey: `CROSS-CUST-${Date.now()}` }),
          session: sessionA, totalAmount: 100, weightLiters: 2, fatPercentage: 4, snfPercentage: 8.5, milkCategory: 'COW',
          customerId: multiB.custId, organizationId: orgA, centerId: centerA, operatorId: opA, operatorName: 'Op A', appliedRate: 50,
        }),
        (e) => e.name === 'DomainValidationError' && e.code === 'INVALID_CUSTOMER'
      );

      assert.equal(Number((await tenantDbA.query(`SELECT COUNT(*)::int AS c FROM users;`)).rows[0].c), usersBefore);
      assert.equal(Number((await tenantDbA.query(`SELECT COUNT(*)::int AS c FROM dairy_centers;`)).rows[0].c), centersBefore);
    });

    await t.test('1.3 Outage & unmapped DB propagate 503 instead of empty fallback; monthly summary is tenant-scoped', async () => {
      await assert.rejects(
        () => collectionRepo.listByCustomer(multiA.custId, 20, 0, orgUnmapped),
        (e) => e.statusCode === 503 && e.code === 'TENANT_MAPPING_MISSING'
      );

      const origQ = tenantDbA.query.bind(tenantDbA);
      tenantDbA.query = async () => { throw new Error('Simulated PG outage'); };
      try {
        await assert.rejects(() => collectionRepo.listByCustomer(multiA.custId, 20, 0, orgA), (e) => e.statusCode === 503);
        await assert.rejects(() => collectionRepo.getMonthlySummary(multiA.custId, '2026-11', orgA), (e) => e.statusCode === 503);
        await assert.rejects(() => collectionRepo.findByIdempotencyKey(txnAKey, orgA), (e) => e.statusCode === 503);
      } finally {
        tenantDbA.query = origQ;
      }

      const sumA = await collectionRepo.getMonthlySummary(multiA.custId, '2026-11', orgA);
      const sumB = await collectionRepo.getMonthlySummary(multiB.custId, '2026-11', orgB);
      assert.equal(sumA.totalLiters, 10.5);
      assert.equal(sumB.totalLiters, 5);
    });
  });

  // ============================================================================
  // 2. LEDGER REPOSITORY STRICT OWNERSHIP
  // ============================================================================
  await suite.test('2. PostgresLedgerRepository: strict ownership, zero fake entities, atomic rollback, zero central dual-write', async (t) => {
    await t.test('2.1 Missing/invalid org fails closed; cross-tenant customer/center/operator rejected; zero central dual-write', async () => {
      await assert.rejects(() => ledgerRepo.findByCustomer(multiA.custId, ''), (e) => e.name === 'DomainValidationError');
      await assert.rejects(() => ledgerRepo.listEntries(multiA.custId, 10, 0, 'bad-org'), (e) => e.name === 'DomainValidationError');

      // Cross-tenant read returns null / empty
      assert.equal(await ledgerRepo.findByCustomer(multiA.custId, orgB), null);
      assert.equal((await ledgerRepo.listEntries(multiA.custId, 10, 0, orgB)).length, 0);

      // Append entry in Dairy A with authenticated operator & org
      const origCentralQ = db.query.bind(db);
      db.query = async () => { throw new Error('FORBIDDEN_CENTRAL_LEDGER_DUAL_WRITE'); };
      try {
        const res = await ledgerRepo.appendEntry({
          organizationId: orgA,
          customerId: multiA.custId,
          operatorId: adminA,
          entryType: 'CREDIT',
          amount: 420,
          description: 'Milk collection credit R32',
          idempotencyKey: `LEDGER-R32-A-${Date.now()}`,
        });
        assert.equal(res.balanceAfter, 420);
        assert.equal(res.isIdempotentReplay, false);
      } finally {
        db.query = origCentralQ;
      }

      // Verify central DB has zero ledger_transactions for multiA
      const ctrlLedger = await db.query(`SELECT COUNT(*)::int AS c FROM ledger_transactions WHERE customer_id = $1;`, [multiA.custId]);
      assert.equal(Number(ctrlLedger.rows[0].c), 0);

      // Reject missing/invalid/customer-role/cross-tenant operator without inserting fake users
      const usersBefore = Number((await tenantDbA.query(`SELECT COUNT(*)::int AS c FROM users;`)).rows[0].c);
      await assert.rejects(
        () => ledgerRepo.appendEntry({ organizationId: orgA, customerId: multiA.custId, operatorId: '', entryType: 'CREDIT', amount: 10, description: 'No op' }),
        (e) => e.name === 'DomainValidationError' && e.code === 'INVALID_OPERATOR'
      );
      await assert.rejects(
        () => ledgerRepo.appendEntry({ organizationId: orgA, customerId: multiA.custId, operatorId: fakeOperator, entryType: 'CREDIT', amount: 10, description: 'Fake op' }),
        (e) => e.name === 'DomainValidationError' && e.code === 'INVALID_OPERATOR'
      );
      await assert.rejects(
        () => ledgerRepo.appendEntry({ organizationId: orgA, customerId: multiA.custId, operatorId: customerStaffRoleCheck, entryType: 'CREDIT', amount: 10, description: 'Cust op' }),
        (e) => e.name === 'ForbiddenError' && e.code === 'UNAUTHORIZED_OPERATOR'
      );
      await assert.rejects(
        () => ledgerRepo.appendEntry({ organizationId: orgA, customerId: multiB.custId, operatorId: adminA, entryType: 'CREDIT', amount: 10, description: 'Cross cust' }),
        (e) => e.name === 'CustomerNotFoundError'
      );
      assert.equal(Number((await tenantDbA.query(`SELECT COUNT(*)::int AS c FROM users;`)).rows[0].c), usersBefore);
    });

    await t.test('2.2 Atomic rollback on ledger failure & concurrent appendEntry preserves all updates', async () => {
      const balBefore = (await ledgerRepo.findByCustomer(multiA.custId, orgA)).currentBalance;
      const entriesBefore = (await ledgerRepo.listEntries(multiA.custId, 50, 0, orgA)).length;

      // Simulate mid-transaction failure on ledger_entries insert
      const origTx = tenantDbA.withTransaction.bind(tenantDbA);
      tenantDbA.withTransaction = async (cb) => origTx(async (client) => {
        const origClientQ = client.query.bind(client);
        client.query = async (sql, params) => {
          if (typeof sql === 'string' && sql.includes('INSERT INTO ledger_entries')) {
            throw new Error('Simulated ledger_entries constraint failure');
          }
          return origClientQ(sql, params);
        };
        try {
          return await cb(client);
        } finally {
          client.query = origClientQ;
        }
      });

      try {
        await assert.rejects(
          () => ledgerRepo.appendEntry({
            organizationId: orgA, customerId: multiA.custId, operatorId: adminA,
            entryType: 'DEBIT', amount: 50, description: 'Should rollback',
          }),
          (e) => e.statusCode === 503
        );
      } finally {
        tenantDbA.withTransaction = origTx;
      }

      const balAfterRollback = (await ledgerRepo.findByCustomer(multiA.custId, orgA)).currentBalance;
      const entriesAfterRollback = (await ledgerRepo.listEntries(multiA.custId, 50, 0, orgA)).length;
      assert.equal(balAfterRollback, balBefore, 'Balance must roll back atomically');
      assert.equal(entriesAfterRollback, entriesBefore, 'Ledger entries must roll back atomically');

      // Concurrent credits
      await Promise.all([
        ledgerRepo.appendEntry({ organizationId: orgA, customerId: multiA.custId, operatorId: adminA, entryType: 'CREDIT', amount: 25, description: 'Conc 1' }),
        ledgerRepo.appendEntry({ organizationId: orgA, customerId: multiA.custId, operatorId: adminA, entryType: 'CREDIT', amount: 35, description: 'Conc 2' }),
      ]);
      const finalBal = (await ledgerRepo.findByCustomer(multiA.custId, orgA)).currentBalance;
      assert.equal(finalBal, balBefore + 60);
    });

    await t.test('2.3 Ledger HTTP routes block cross-dairy requests, require org context & propagate outage 503', async () => {
      const crossDairyRes = await request(app)
        .get(`/api/v1/ledger/entries?organizationId=${orgB}`)
        .set('Authorization', `Bearer ${adminAToken}`);
      assert.equal(crossDairyRes.status, 403);
      await assert.rejects(() => ledgerRepo.findByCustomer(multiA.custId, ''), (e) => e?.statusCode === 400);

      const unmappedRes = await request(app)
        .get(`/api/v1/ledger/entries?organizationId=${orgUnmapped}`)
        .set('Authorization', `Bearer ${adminUnmappedToken}`);
      assert.equal(unmappedRes.status, 503);

      const superAdminToken = tokenService.signToken({
        userId: superAdminNoOrg,
        organizationId: orgA,
        role: 'SUPER_ADMIN',
        actorType: 'STAFF',
        fullName: 'SA',
      });
      const superUnmappedRes = await request(app)
        .get(`/api/v1/ledger/entries?organizationId=${orgUnmapped}`)
        .set('Authorization', `Bearer ${superAdminToken}`);
      assert.equal(superUnmappedRes.status, 503);
    });
  });

  // ============================================================================
  // 3. MULTI-DAIRY MEMBERSHIP DISCOVERY & CONSOLIDATED HISTORY
  // ============================================================================
  await suite.test('3. Multi-Dairy Membership Discovery, Anti-IDOR, Consolidated History & Reconciliation', async (t) => {
    const getMembershipsUC = new GetCustomerMembershipsUseCase(membershipRepo);
    const reconcileUC = new ReconcileCustomerMembershipsUseCase(membershipRepo);

    // Switch tokens for multi-dairy customer
    const switchA = await request(app)
      .post('/api/v1/customers/switch-dairy')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ dairyId: orgA, globalCustomerId: multiA.globalCustomerId });
    assert.equal(switchA.status, 200);
    const multiTokenA = switchA.body.accessToken;

    const otherSwitch = await request(app)
      .post('/api/v1/customers/switch-dairy')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ dairyId: orgA, globalCustomerId: otherCustomer.globalCustomerId });
    assert.equal(otherSwitch.status, 200);
    const otherTokenA = otherSwitch.body.accessToken;

    await t.test('3.1 Request-path GetCustomerMembershipsUseCase NEVER calls getAllTenantDbs()', async () => {
      const origGetAll = tenantDbManager.getAllTenantDbs.bind(tenantDbManager);
      tenantDbManager.getAllTenantDbs = () => { throw new Error('FORBIDDEN_GLOBAL_SCAN'); };
      try {
        const res = await getMembershipsUC.execute({ globalCustomerId: multiA.globalCustomerId });
        assert.equal(res.memberships.length, 2);

        // Missing central index returns [] cleanly without scanning tenant DBs
        const unknownRes = await getMembershipsUC.execute({ phone: '+919899998888' });
        assert.equal(unknownRes.memberships.length, 0);
      } finally {
        tenantDbManager.getAllTenantDbs = origGetAll;
      }
    });

    await t.test('3.2 Customer cannot discover another customer memberships by changing phone or globalCustomerId', async () => {
      const spoofPhone = await request(app)
        .get(`/api/v1/customers/memberships?phone=${multiMobile10}`)
        .set('Authorization', `Bearer ${otherTokenA}`);
      assert.equal(spoofPhone.status, 403);

      const spoofGlobal = await request(app)
        .get(`/api/v1/customers/memberships?globalCustomerId=${multiA.globalCustomerId}`)
        .set('Authorization', `Bearer ${otherTokenA}`);
      assert.equal(spoofGlobal.status, 403);

      const spoofSwitch = await request(app)
        .post('/api/v1/customers/switch-dairy')
        .set('Authorization', `Bearer ${otherTokenA}`)
        .send({ dairyId: orgB, globalCustomerId: multiA.globalCustomerId });
      assert.equal(spoofSwitch.status, 403);
    });

    await t.test('3.3 Consolidated multi-dairy history queries only authorized DBs and reports partial outage truthfully', async () => {
      const origGetAll = tenantDbManager.getAllTenantDbs.bind(tenantDbManager);
      tenantDbManager.getAllTenantDbs = () => { throw new Error('FORBIDDEN_GLOBAL_SCAN'); };
      try {
        const fullHist = await request(app)
          .get('/api/v1/collection/history?scope=consolidated')
          .set('Authorization', `Bearer ${multiTokenA}`);
        assert.equal(fullHist.status, 200);
        assert.equal(fullHist.body.partial, false);
        assert.equal(fullHist.body.unavailableDairies.length, 0);
        assert.equal(fullHist.body.data.length, 2);
        const orgs = fullHist.body.data.map((d) => d.dairyId).sort();
        assert.deepEqual(orgs, [orgA, orgB].sort());

        // Simulate Dairy B outage -> partial: true with unavailableDairies disclosed
        const origMappingB = tenantDbManager.tenantMappings.get(orgB);
        tenantDbManager.tenantMappings.set(orgB, { ...origMappingB, provisioningStatus: 'FAILED', provisioningError: 'Outage' });
        try {
          const partialHist = await request(app)
            .get('/api/v1/collection/history?scope=consolidated')
            .set('Authorization', `Bearer ${multiTokenA}`);
          assert.equal(partialHist.status, 200);
          assert.equal(partialHist.body.partial, true);
          assert.equal(partialHist.body.unavailableDairies.length, 1);
          assert.equal(partialHist.body.unavailableDairies[0].organizationId, orgB);
          assert.equal(partialHist.body.data.length, 1);
          assert.equal(partialHist.body.data[0].dairyId, orgA);
        } finally {
          tenantDbManager.tenantMappings.set(orgB, origMappingB);
        }
      } finally {
        tenantDbManager.getAllTenantDbs = origGetAll;
      }
    });

    await t.test('3.4 Bounded ReconcileCustomerMembershipsUseCase is org-scoped and idempotent', async () => {
      await assert.rejects(() => reconcileUC.execute({ organizationId: '' }), (e) => e.name === 'DomainValidationError');

      // Delete central membership row for Dairy B to simulate historical unindexed record, then reconcile Dairy B only
      const ctrlDb = tenantDbManager.getControlPlaneDb();
      await ctrlDb.query(`DELETE FROM customer_dairy_memberships WHERE organization_id = $1 AND global_customer_id = $2;`, [orgB, multiA.globalCustomerId]);
      await tenantDbB.query(`UPDATE customers SET global_customer_id = NULL WHERE id = $1;`, [multiB.custId]);

      const firstRun = await reconcileUC.execute({ organizationId: orgB, tenantCustomerId: multiB.custId });
      assert.equal(firstRun.createdCount, 1);
      assert.equal(firstRun.linkedCount, 1);

      const secondRun = await reconcileUC.execute({ organizationId: orgB, tenantCustomerId: multiB.custId });
      assert.equal(secondRun.createdCount, 0);
      assert.equal(secondRun.linkedCount, 0);
    });
  });

  // ============================================================================
  // 4. DAIRY ADMIN TENANT RESOLUTION
  // ============================================================================
  await suite.test('4. Dairy Admin routes fail closed 503 without central DB fallback', async () => {
    const origCentralQ = db.query.bind(db);
    // For unmapped tenant -> 503 immediately, never querying central milk_collections
    const unmappedMetrics = await request(app)
      .get('/api/v1/dairy-admin/metrics')
      .set('Authorization', `Bearer ${adminUnmappedToken}`);
    assert.equal(unmappedMetrics.status, 503);
    assert.equal(unmappedMetrics.body.errorCode, 'TENANT_MAPPING_MISSING');

    // Cross-tenant header blocked 403
    const crossMetrics = await request(app)
      .get('/api/v1/dairy-admin/metrics')
      .set('Authorization', `Bearer ${adminAToken}`)
      .set('x-dairy-tenant-id', orgB);
    assert.equal(crossMetrics.status, 403);

    // Valid tenant DB succeeds and does not hit central milk_collections
    db.query = async (sql, params) => {
      if (typeof sql === 'string' && sql.includes('milk_collections')) {
        throw new Error('FORBIDDEN_CENTRAL_FALLBACK_IN_DAIRY_ADMIN');
      }
      return origCentralQ(sql, params);
    };
    try {
      const okMetrics = await request(app)
        .get('/api/v1/dairy-admin/metrics')
        .set('Authorization', `Bearer ${adminAToken}`);
      assert.equal(okMetrics.status, 200);
      assert.equal(okMetrics.body.success, true);
    } finally {
      db.query = origCentralQ;
    }
  });
});
