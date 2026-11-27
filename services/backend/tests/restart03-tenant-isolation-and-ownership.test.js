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
const { PostgresShiftSessionRepository } = await import('../dist/infrastructure/repositories/PostgresShiftSessionRepository.js');
const { KioskShiftSession } = await import('../dist/domain/entities/KioskShiftSession.js');
const {
  OpenShiftSessionUseCase,
  CloseShiftSessionUseCase,
  ReopenShiftSessionUseCase,
} = await import('../dist/application/use-cases/sessions/ShiftSessionUseCases.js');
const {
  ProcessMilkIntakeUseCase,
  ProcessOfflineSyncBatchUseCase,
} = await import('../dist/application/use-cases/index.js');
const {
  PostgresCustomerRepository,
  PostgresCollectionTransactionRepository,
  PostgresRateChartRepository,
  PostgresLedgerRepository,
} = await import('../dist/infrastructure/index.js');
const { HmacJwtTokenService } = await import('../dist/infrastructure/security/HmacJwtTokenService.js');
const { doveOtpService } = await import('../dist/infrastructure/otp/DoveOtpService.js');

const app = createApp();
const tokenService = new HmacJwtTokenService();

function unitVec(seed = 1) {
  const vec = [];
  let sumSq = 0;
  for (let i = 0; i < 128; i++) {
    const val = Math.sin((i + 1) * seed) * Math.cos((i + 2) * 0.35);
    vec.push(val);
    sumSq += val * val;
  }
  const norm = Math.sqrt(sumSq);
  return vec.map((v) => v / norm);
}

test('RESTART-03: Multi-Tenant Database Isolation, Shift Session Integrity, Customer Ownership & Sync Context Suite', async (suite) => {
  // Fresh isolated Dairy A, Dairy B, Suspended Dairy C, Unmapped Dairy D
  const orgA = crypto.randomUUID();
  const orgB = crypto.randomUUID();
  const orgSusp = crypto.randomUUID();
  const orgUnmapped = crypto.randomUUID();
  const orgNoCenter = crypto.randomUUID();

  const centerA = crypto.randomUUID();
  const centerAInactive = crypto.randomUUID();
  const centerB = crypto.randomUUID();
  const centralOnlyCenter = crypto.randomUUID();
  const nonexistentCenter = crypto.randomUUID();

  const opA = crypto.randomUUID();
  const adminA = crypto.randomUUID();
  const opB = crypto.randomUUID();
  const customerUserInA = crypto.randomUUID();
  const fakeOperator = crypto.randomUUID();

  const deviceIdA = 'KIOSK-R03-A1';
  const deviceIdB = 'KIOSK-R03-B1';
  const deviceRevoked = 'KIOSK-R03-REV';

  await db.query(
    `INSERT INTO organizations (id, name, code, status) VALUES
      ($1, 'Restart03 Dairy Alpha', 'R03-ALP', 'ACTIVE'),
      ($2, 'Restart03 Dairy Beta', 'R03-BET', 'ACTIVE'),
      ($3, 'Restart03 Suspended Dairy', 'R03-SUS', 'SUSPENDED'),
      ($4, 'Restart03 Unmapped Dairy', 'R03-UNM', 'ACTIVE'),
      ($5, 'Restart03 NoCenter Dairy', 'R03-NOC', 'ACTIVE')
     ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;`,
    [orgA, orgB, orgSusp, orgUnmapped, orgNoCenter]
  );

  await tenantDbManager.provisionTenantDatabase({ dairyId: orgA, dairyCode: 'R03-ALP', dairyName: 'Restart03 Dairy Alpha' });
  await tenantDbManager.provisionTenantDatabase({ dairyId: orgB, dairyCode: 'R03-BET', dairyName: 'Restart03 Dairy Beta' });
  await tenantDbManager.provisionTenantDatabase({ dairyId: orgSusp, dairyCode: 'R03-SUS', dairyName: 'Restart03 Suspended Dairy' });
  await tenantDbManager.provisionTenantDatabase({ dairyId: orgNoCenter, dairyCode: 'R03-NOC', dairyName: 'Restart03 NoCenter Dairy' });
  // Note: orgUnmapped is intentionally NOT provisioned in tenantDbManager!

  const tenantDbA = await tenantDbManager.getStrictTenantDb(orgA);
  const tenantDbB = await tenantDbManager.getStrictTenantDb(orgB);
  const tenantDbNoCenter = await tenantDbManager.getStrictTenantDb(orgNoCenter);

  // Clear pg-mem boilerplate centers/customers from test tenant DBs so counts are exact
  await tenantDbA.query(`DELETE FROM customers;`).catch(() => {});
  await tenantDbA.query(`DELETE FROM user_center_assignments;`).catch(() => {});
  await tenantDbA.query(`DELETE FROM dairy_centers;`).catch(() => {});
  await tenantDbB.query(`DELETE FROM customers;`).catch(() => {});
  await tenantDbB.query(`DELETE FROM user_center_assignments;`).catch(() => {});
  await tenantDbB.query(`DELETE FROM dairy_centers;`).catch(() => {});
  await tenantDbNoCenter.query(`DELETE FROM customers;`).catch(() => {});
  await tenantDbNoCenter.query(`DELETE FROM user_center_assignments;`).catch(() => {});
  await tenantDbNoCenter.query(`DELETE FROM dairy_centers;`).catch(() => {});

  // Seed centers in central vs respective tenant DBs
  await db.query(
    `INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status) VALUES
      ($1, $5, 'CA-01', 'Alpha Primary Center', 'Road A', 'Village A', 'Pune', 'Maharashtra', '411001', '+919800000101', 'ACTIVE'),
      ($2, $6, 'CB-01', 'Beta Primary Center', 'Road B', 'Village B', 'Pune', 'Maharashtra', '411002', '+919800000102', 'ACTIVE'),
      ($3, $5, 'CA-CTRL-ONLY', 'Central-Only Unsynced Center', 'Road C', 'Village C', 'Pune', 'Maharashtra', '411003', '+919800000103', 'ACTIVE'),
      ($4, $7, 'CNC-CTRL', 'NoCenter Central-Only Center', 'Road D', 'Village D', 'Pune', 'Maharashtra', '411004', '+919800000104', 'ACTIVE')
     ON CONFLICT (id) DO NOTHING;`,
    [centerA, centerB, centralOnlyCenter, nonexistentCenter, orgA, orgB, orgNoCenter]
  );

  await tenantDbA.query(
    `INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status) VALUES
      ($1, $3, 'CA-01', 'Alpha Primary Center', 'Road A', 'Village A', 'Pune', 'Maharashtra', '411001', '+919800000101', 'ACTIVE'),
      ($2, $3, 'CA-INACT', 'Alpha Inactive Center', 'Road A2', 'Village A2', 'Pune', 'Maharashtra', '411001', '+919800000109', 'INACTIVE')
     ON CONFLICT (id) DO NOTHING;`,
    [centerA, centerAInactive, orgA]
  );

  await tenantDbB.query(
    `INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status) VALUES
      ($1, $2, 'CB-01', 'Beta Primary Center', 'Road B', 'Village B', 'Pune', 'Maharashtra', '411002', '+919800000102', 'ACTIVE')
     ON CONFLICT (id) DO NOTHING;`,
    [centerB, orgB]
  );

  // Seed active staff and customer accounts across central + tenant DBs
  const seedUsersSql = `
    INSERT INTO users (id, organization_id, username, full_name, phone_number, role, user_role, status) VALUES
      ($1, $5, 'r03_op_a', 'Alpha Operator', '+919800100001', 'COLLECTION_OPERATOR', 'COLLECTION_OPERATOR', 'ACTIVE'),
      ($2, $5, 'r03_admin_a', 'Alpha Admin', '+919800100002', 'DAIRY_ADMIN', 'PRIMARY_DAIRY_ADMIN', 'ACTIVE'),
      ($3, $6, 'r03_op_b', 'Beta Operator', '+919800100003', 'COLLECTION_OPERATOR', 'COLLECTION_OPERATOR', 'ACTIVE'),
      ($4, $5, 'r03_cust_u', 'Customer User', '+919800100004', 'FARMER_CUSTOMER', 'FARMER_CUSTOMER', 'ACTIVE')
    ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', organization_id = EXCLUDED.organization_id, role = EXCLUDED.role, user_role = EXCLUDED.user_role;
  `;
  await db.query(seedUsersSql, [opA, adminA, opB, customerUserInA, orgA, orgB]);

  await tenantDbA.query(
    `INSERT INTO users (id, organization_id, username, full_name, phone_number, role, user_role, status) VALUES
      ($1, $4, 'r03_op_a', 'Alpha Operator', '+919800100001', 'COLLECTION_OPERATOR', 'COLLECTION_OPERATOR', 'ACTIVE'),
      ($2, $4, 'r03_admin_a', 'Alpha Admin', '+919800100002', 'DAIRY_ADMIN', 'PRIMARY_DAIRY_ADMIN', 'ACTIVE'),
      ($3, $4, 'r03_cust_u', 'Customer User', '+919800100004', 'FARMER_CUSTOMER', 'FARMER_CUSTOMER', 'ACTIVE')
     ON CONFLICT (id) DO NOTHING;`,
    [opA, adminA, customerUserInA, orgA]
  );

  await tenantDbB.query(
    `INSERT INTO users (id, organization_id, username, full_name, phone_number, role, user_role, status) VALUES
      ($1, $2, 'r03_op_b', 'Beta Operator', '+919800100003', 'COLLECTION_OPERATOR', 'COLLECTION_OPERATOR', 'ACTIVE')
     ON CONFLICT (id) DO NOTHING;`,
    [opB, orgB]
  );

  // Seed devices for device ownership & status enforcement checks
  await tenantDbA.query(
    `INSERT INTO devices (id, organization_id, center_id, device_identifier, device_type, status) VALUES
      ($1, $3, $4, $5, 'COUNTER_TERMINAL', 'ACTIVE'),
      ($2, $3, $4, $6, 'COUNTER_TERMINAL', 'BLOCKED')
     ON CONFLICT (device_identifier) DO NOTHING;`,
    [crypto.randomUUID(), crypto.randomUUID(), orgA, centerA, deviceIdA, deviceRevoked]
  );
  await tenantDbB.query(
    `INSERT INTO devices (id, organization_id, center_id, device_identifier, device_type, status) VALUES
      ($1, $2, $3, $4, 'COUNTER_TERMINAL', 'ACTIVE')
     ON CONFLICT (device_identifier) DO NOTHING;`,
    [crypto.randomUUID(), orgB, centerB, deviceIdB]
  );

  // Ensure central customer tables know global/tenant tokens properly
  const opAToken = tokenService.signToken({ userId: opA, organizationId: orgA, centerId: centerA, role: 'COLLECTION_OPERATOR', actorType: 'STAFF', fullName: 'Alpha Operator' });
  const adminAToken = tokenService.signToken({ userId: adminA, organizationId: orgA, centerId: centerA, role: 'PRIMARY_DAIRY_ADMIN', actorType: 'STAFF', fullName: 'Alpha Admin' });
  const opBToken = tokenService.signToken({ userId: opB, organizationId: orgB, centerId: centerB, role: 'COLLECTION_OPERATOR', actorType: 'STAFF', fullName: 'Beta Operator' });

  const sessionRepo = new PostgresShiftSessionRepository();
  const openSessionUseCase = new OpenShiftSessionUseCase(sessionRepo);
  const closeSessionUseCase = new CloseShiftSessionUseCase(sessionRepo);
  const reopenSessionUseCase = new ReopenShiftSessionUseCase(sessionRepo);

  // ============================================================================
  // GROUP 6A: SHIFT SESSION TENANT ISOLATION & PERSISTENCE INTEGRITY (17 CHECKS)
  // ============================================================================
  let sessionIdA = '';
  let sessionCodeA = '';

  await suite.test('6A. Shift Session Tenant Isolation & Persistence Integrity', async (t) => {
    await t.test('1-4. Dairy A open session writes ONLY to Dairy A DB; Dairy B cannot read via findActiveSession/findByCode/findById', async () => {
      const opened = await openSessionUseCase.execute({
        centerId: centerA,
        organizationId: orgA,
        operatorId: opA,
        operatorName: 'Alpha Operator',
        deviceIdentifier: deviceIdA,
        shift: 'MORNING',
        businessDate: '2026-11-26',
      });
      sessionIdA = opened.id;
      sessionCodeA = opened.sessionCode;
      assert.equal(opened.organizationId, orgA);
      assert.equal(opened.status, 'OPEN');

      // Must exist in Tenant DB A
      const rowsA = await tenantDbA.query(`SELECT COUNT(*)::int AS c FROM kiosk_shift_sessions WHERE id = $1;`, [sessionIdA]);
      assert.equal(Number(rowsA.rows[0].c), 1);

      // Must NOT exist in Tenant DB B or Central DB (Rule 1 & Rule 10)
      const rowsB = await tenantDbB.query(`SELECT COUNT(*)::int AS c FROM kiosk_shift_sessions WHERE id = $1;`, [sessionIdA]);
      assert.equal(Number(rowsB.rows[0].c), 0);
      const rowsCtrl = await db.query(`SELECT COUNT(*)::int AS c FROM kiosk_shift_sessions WHERE id = $1;`, [sessionIdA]);
      assert.equal(Number(rowsCtrl.rows[0].c), 0);

      // Dairy B reads via findActiveSession / findByCode / findById return null
      assert.equal(await sessionRepo.findActiveSession(centerA, deviceIdA, orgB), null);
      assert.equal(await sessionRepo.findByCode(sessionCodeA, orgB), null);
      assert.equal(await sessionRepo.findById(sessionIdA, orgB), null);

      // Valid not-found in Dairy A returns null cleanly (Rule 9)
      assert.equal(await sessionRepo.findByCode('SH-NONEXISTENT-99', orgA), null);
      assert.equal(await sessionRepo.findById(crypto.randomUUID(), orgA), null);
      assert.equal(await sessionRepo.findById('not-a-uuid', orgA), null);
    });

    await t.test('5. Dairy B cannot close or reopen Dairy A session (use-case and HTTP)', async () => {
      await assert.rejects(
        () => closeSessionUseCase.execute({ sessionCode: sessionCodeA, operatorId: opB, operatorName: 'Beta Op', organizationId: orgB }),
        /not found/i
      );
      await assert.rejects(
        () => reopenSessionUseCase.execute({ sessionCode: sessionCodeA, operatorId: opB, operatorName: 'Beta Op', organizationId: orgB }),
        /not found/i
      );

      const closeHttp = await request(app)
        .post(`/api/v1/collections/sessions/${sessionCodeA}/close`)
        .set('Authorization', `Bearer ${opBToken}`)
        .send({ organizationId: orgB });
      assert.ok([400, 403, 404].includes(closeHttp.status));
      assert.equal(closeHttp.body.success, false);

      // Cross-dairy header/body mismatch blocked 403
      const crossHttp = await request(app)
        .post(`/api/v1/collections/sessions/${sessionCodeA}/close`)
        .set('Authorization', `Bearer ${opBToken}`)
        .send({ organizationId: orgA });
      assert.equal(crossHttp.status, 403);
    });

    await t.test('6-7. Missing/invalid organizationId fails closed upfront and getAllTenantDbs() is NEVER invoked', async () => {
      const origGetAll = tenantDbManager.getAllTenantDbs.bind(tenantDbManager);
      tenantDbManager.getAllTenantDbs = async () => {
        throw new Error('FORBIDDEN_GLOBAL_SCAN_DETECTED');
      };
      try {
        for (const badOrg of ['', '   ', 'invalid-uuid', undefined]) {
          await assert.rejects(() => sessionRepo.findActiveSession(centerA, deviceIdA, badOrg), (e) => e.name === 'DomainValidationError');
          await assert.rejects(() => sessionRepo.findByCode(sessionCodeA, badOrg), (e) => e.name === 'DomainValidationError');
          await assert.rejects(() => sessionRepo.findById(sessionIdA, badOrg), (e) => e.name === 'DomainValidationError');
        }
        // Legitimate scoped calls also must never invoke getAllTenantDbs
        const okActive = await sessionRepo.findActiveSession(centerA, deviceIdA, orgA);
        assert.equal(okActive?.id, sessionIdA);
      } finally {
        tenantDbManager.getAllTenantDbs = origGetAll;
      }
    });

    await t.test('8-9. Tenant DB outage/unmapped/query-failure returns 503 without falling back to Dairy B or central', async () => {
      // Unmapped dairy
      await assert.rejects(
        () => sessionRepo.findByCode(sessionCodeA, orgUnmapped),
        (err) => err.statusCode === 503 && err.code === 'TENANT_MAPPING_MISSING'
      );

      // Provisioning FAILED status
      const origMapping = tenantDbManager.tenantMappings.get(orgA);
      tenantDbManager.tenantMappings.set(orgA, { ...origMapping, provisioningStatus: 'FAILED', provisioningError: 'Disk outage' });
      try {
        await assert.rejects(
          () => sessionRepo.findActiveSession(centerA, deviceIdA, orgA),
          (err) => err.statusCode === 503 && err.code === 'TENANT_DATABASE_UNAVAILABLE'
        );
      } finally {
        tenantDbManager.tenantMappings.set(orgA, origMapping);
      }

      // Query failure inside tenantDb propagates as 503 QUERY_FAILED (not null!)
      const origQuery = tenantDbA.query.bind(tenantDbA);
      tenantDbA.query = async () => {
        throw new Error('ECONNREFUSED simulated tenant outage');
      };
      try {
        await assert.rejects(
          () => sessionRepo.findById(sessionIdA, orgA),
          (err) => err.statusCode === 503 && err.code === 'TENANT_DATABASE_UNAVAILABLE'
        );
      } finally {
        tenantDbA.query = origQuery;
      }
    });

    await t.test('11-15. save() never fabricates orgs, centers, operators, or devices; rejects invalid/cross-tenant/customer FKs', async () => {
      const countsBefore = async () => ({
        orgs: Number((await tenantDbA.query(`SELECT COUNT(*)::int AS c FROM organizations;`)).rows[0].c),
        centers: Number((await tenantDbA.query(`SELECT COUNT(*)::int AS c FROM dairy_centers;`)).rows[0].c),
        users: Number((await tenantDbA.query(`SELECT COUNT(*)::int AS c FROM users;`)).rows[0].c),
        sessions: Number((await tenantDbA.query(`SELECT COUNT(*)::int AS c FROM kiosk_shift_sessions;`)).rows[0].c),
      });
      const before = await countsBefore();

      const makeSession = (overrides = {}) => new KioskShiftSession({
        id: crypto.randomUUID(),
        sessionCode: `SH-TEST-${crypto.randomUUID().slice(0, 6)}`,
        organizationId: orgA,
        centerId: centerA,
        businessDate: '2026-11-27',
        shift: 'EVENING',
        status: 'OPEN',
        openedAt: new Date().toISOString(),
        openingOperatorId: opA,
        openingOperatorName: 'Alpha Operator',
        deviceIdentifier: 'KIOSK-NEW-DEV',
        deviceName: 'Test Kiosk',
        totalLiters: 0,
        cowLiters: 0,
        buffaloLiters: 0,
        transactionCount: 0,
        totalAmount: 0,
        averageFat: 0,
        averageSnf: 0,
        ...overrides,
      });

      // Missing org in control plane
      await assert.rejects(() => sessionRepo.save(makeSession({ organizationId: crypto.randomUUID() })), (e) => e.name === 'DomainValidationError' && e.code === 'INVALID_ORGANIZATION');
      // Missing center (must not auto-create C-01)
      await assert.rejects(() => sessionRepo.save(makeSession({ centerId: nonexistentCenter })), (e) => e.name === 'DomainValidationError');
      // Inactive center
      await assert.rejects(() => sessionRepo.save(makeSession({ centerId: centerAInactive })), (e) => e.name === 'DomainValidationError');
      // Cross-tenant center placed inside Dairy A tenant DB (if row exists with orgB)
      await tenantDbA.query(
        `INSERT INTO organizations (id, name, code, status) VALUES ($1, 'Cross Org B', 'X-ORGB', 'ACTIVE') ON CONFLICT (id) DO NOTHING;`,
        [orgB]
      );
      await tenantDbA.query(
        `INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
         VALUES ($1, $2, 'X-CB', 'Cross Center', 'R', 'V', 'D', 'S', '411001', '+919800000000', 'ACTIVE') ON CONFLICT DO NOTHING;`,
        [centerB, orgB]
      );
      await assert.rejects(() => sessionRepo.save(makeSession({ centerId: centerB })), (e) => e.name === 'ForbiddenTenantError');
      await tenantDbA.query(`DELETE FROM dairy_centers WHERE id = $1;`, [centerB]);

      // Missing operator (no synthetic user +919822114477 insert!)
      await assert.rejects(() => sessionRepo.save(makeSession({ openingOperatorId: fakeOperator })), (e) => e.name === 'DomainValidationError');
      // Customer user attempting to open shift as operator
      await assert.rejects(() => sessionRepo.save(makeSession({ openingOperatorId: customerUserInA })), (e) => e.name === 'ForbiddenError');
      // Cross-tenant operator (opB from orgB)
      await assert.rejects(() => sessionRepo.save(makeSession({ openingOperatorId: opB })), (e) => e.name === 'DomainValidationError' || e.name === 'ForbiddenTenantError');
      // Revoked/Blocked device rejected with ForbiddenError (DEVICE_BLOCKED)
      await assert.rejects(() => sessionRepo.save(makeSession({ deviceIdentifier: deviceRevoked })), (e) => e.name === 'ForbiddenError' && e.code === 'DEVICE_BLOCKED');
      // Cross-tenant device registered to orgB inside tenantDbA rejected
      await tenantDbA.query(
        `INSERT INTO devices (id, organization_id, center_id, device_identifier, device_type, status)
         VALUES ($1, $2, $3, $4, 'COUNTER_TERMINAL', 'ACTIVE') ON CONFLICT DO NOTHING;`,
        [crypto.randomUUID(), orgB, centerA, 'KIOSK-CROSS-DEV']
      );
      await assert.rejects(() => sessionRepo.save(makeSession({ deviceIdentifier: 'KIOSK-CROSS-DEV' })), (e) => e.name === 'ForbiddenTenantError');
      await tenantDbA.query(`DELETE FROM devices WHERE device_identifier = 'KIOSK-CROSS-DEV';`);
      await tenantDbA.query(`DELETE FROM organizations WHERE id = $1;`, [orgB]);

      const after = await countsBefore();
      assert.deepEqual(after, before, 'No synthetic organizations, centers, operators, or sessions may be inserted on rejected saves');
    });

    await t.test('16-17. Concurrent open sessions enforce single active OPEN row & DB save errors never swallowed', async () => {
      const concurrentDev = 'KIOSK-CONC-01';
      await tenantDbA.query(
        `INSERT INTO devices (id, organization_id, center_id, device_identifier, device_type, status)
         VALUES ($1, $2, $3, $4, 'COUNTER_TERMINAL', 'ACTIVE') ON CONFLICT DO NOTHING;`,
        [crypto.randomUUID(), orgA, centerA, concurrentDev]
      );

      // Direct repo save rejects second OPEN session on same (org, center, device) with SessionConflictError (409)
      const s1 = new KioskShiftSession({
        id: crypto.randomUUID(),
        sessionCode: `SH-CONC-1-${Date.now()}`,
        organizationId: orgA,
        centerId: centerA,
        businessDate: '2026-11-26',
        shift: 'MORNING',
        status: 'OPEN',
        openedAt: new Date().toISOString(),
        openingOperatorId: opA,
        openingOperatorName: 'Alpha Operator',
        deviceIdentifier: concurrentDev,
        deviceName: 'Concurrent Kiosk',
        totalLiters: 0, cowLiters: 0, buffaloLiters: 0, transactionCount: 0, totalAmount: 0, averageFat: 0, averageSnf: 0,
      });
      await sessionRepo.save(s1);

      const s2 = new KioskShiftSession({
        id: crypto.randomUUID(),
        sessionCode: `SH-CONC-2-${Date.now()}`,
        organizationId: orgA,
        centerId: centerA,
        businessDate: '2026-11-26',
        shift: 'MORNING',
        status: 'OPEN',
        openedAt: new Date().toISOString(),
        openingOperatorId: opA,
        openingOperatorName: 'Alpha Operator',
        deviceIdentifier: concurrentDev,
        deviceName: 'Concurrent Kiosk',
        totalLiters: 0, cowLiters: 0, buffaloLiters: 0, transactionCount: 0, totalAmount: 0, averageFat: 0, averageSnf: 0,
      });
      await assert.rejects(() => sessionRepo.save(s2), (e) => e.name === 'SessionConflictError' && e.statusCode === 409);

      // Use-case concurrent race returns strictly single active session row in DB
      const raceDev = 'KIOSK-RACE-01';
      const results = await Promise.all([
        openSessionUseCase.execute({ centerId: centerA, organizationId: orgA, operatorId: opA, operatorName: 'Alpha Operator', deviceIdentifier: raceDev, businessDate: '2026-11-26', shift: 'EVENING' }),
        openSessionUseCase.execute({ centerId: centerA, organizationId: orgA, operatorId: opA, operatorName: 'Alpha Operator', deviceIdentifier: raceDev, businessDate: '2026-11-26', shift: 'EVENING' }),
      ]);
      assert.equal(results[0].id, results[1].id);
      const raceCount = await tenantDbA.query(
        `SELECT COUNT(*)::int AS c FROM kiosk_shift_sessions WHERE organization_id = $1 AND center_id = $2 AND device_identifier = $3 AND status = 'OPEN';`,
        [orgA, centerA, raceDev]
      );
      assert.equal(Number(raceCount.rows[0].c), 1);

      // Save error propagation: close fails loudly when DB write errors
      const origSaveQuery = tenantDbA.query.bind(tenantDbA);
      tenantDbA.query = async (sql, params) => {
        if (typeof sql === 'string' && sql.includes('INSERT INTO kiosk_shift_sessions')) {
          throw new Error('EIO disk write failed');
        }
        return origSaveQuery(sql, params);
      };
      try {
        await assert.rejects(
          () => closeSessionUseCase.execute({ sessionCode: sessionCodeA, operatorId: opA, operatorName: 'Alpha Op', organizationId: orgA }),
          (e) => e.statusCode === 503 && e.code === 'TENANT_DATABASE_UNAVAILABLE'
        );
      } finally {
        tenantDbA.query = origSaveQuery;
      }

      // Close & Reopen succeed when DB healthy
      const closed = await closeSessionUseCase.execute({ sessionCode: sessionCodeA, operatorId: opA, operatorName: 'Alpha Op', organizationId: orgA });
      assert.equal(closed.status, 'CLOSED');
      const reopened = await reopenSessionUseCase.execute({ sessionCode: sessionCodeA, operatorId: adminA, operatorName: 'Alpha Admin', organizationId: orgA });
      assert.equal(reopened.status, 'OPEN');
    });
  });

  // ============================================================================
  // GROUP 6B: CUSTOMER REGISTRATION DATABASE OWNERSHIP (14 CHECKS)
  // ============================================================================
  await suite.test('6B. Customer Registration Authoritative Center & Ownership', async (t) => {
    const helperIssueGuestToken = async (mobile10) => {
      const e164 = `+91${mobile10}`;
      doveOtpService.resetCooldown(e164);
      const reqOtp = await request(app).post('/api/v1/auth/request-otp').send({ mobileNumber: mobile10 });
      assert.equal(reqOtp.status, 200);
      const ver = await request(app).post('/api/v1/auth/verify-otp').send({ mobileNumber: mobile10, otp: reqOtp.body.previewOtp });
      assert.equal(ver.status, 200);
      return { token: ver.body.accessToken, otp: reqOtp.body.previewOtp, e164 };
    };

    await t.test('1-3. Explicit tenant center succeeds ONLY in Dairy A; central-only & cross-dairy centers rejected', async () => {
      const { token } = await helperIssueGuestToken('9820001001');

      // Central-only center (NOT in tenantDbA) -> rejected 400 INVALID_CENTER
      const centralOnlyRes = await request(app)
        .post('/api/v1/customers/register')
        .set('Authorization', `Bearer ${token}`)
        .send({ fullName: 'Central Only Attempt', mobileNumber: '9820001001', organizationId: orgA, centerId: centralOnlyCenter });
      assert.equal(centralOnlyRes.status, 400);
      assert.equal(centralOnlyRes.body.code, 'INVALID_CENTER');

      // Cross-dairy center (centerB belongs to orgB in central & tenantDbB) -> 403 CROSS_TENANT_CENTER
      const crossCenterRes = await request(app)
        .post('/api/v1/customers/register')
        .set('Authorization', `Bearer ${token}`)
        .send({ fullName: 'Cross Center Attempt', mobileNumber: '9820001001', organizationId: orgA, centerId: centerB });
      assert.equal(crossCenterRes.status, 403);
      assert.equal(crossCenterRes.body.code, 'CROSS_TENANT_CENTER');

      // Authoritative tenant center -> 201 PENDING_APPROVAL in tenantDbA ONLY
      const okRes = await request(app)
        .post('/api/v1/customers/register')
        .set('Authorization', `Bearer ${token}`)
        .send({ fullName: 'Valid Alpha Farmer', mobileNumber: '9820001001', organizationId: orgA, centerId: centerA, village: 'Shirgaon' });
      assert.equal(okRes.status, 201);
      assert.equal(okRes.body.status, 'PENDING_APPROVAL');
      assert.equal(okRes.body.data.centerId, centerA);

      const inA = await tenantDbA.query(`SELECT status, registration_status FROM customers WHERE id = $1;`, [okRes.body.customerUuid]);
      assert.equal(inA.rows.length, 1);
      assert.equal(inA.rows[0].status, 'INACTIVE');
      assert.equal(inA.rows[0].registration_status, 'PENDING_APPROVAL');
      const inB = await tenantDbB.query(`SELECT COUNT(*)::int AS c FROM customers WHERE id = $1;`, [okRes.body.customerUuid]);
      assert.equal(Number(inB.rows[0].c), 0);
    });

    await t.test('4-9. Suspended org, inactive center, omitted center resolution, NO_ACTIVE_CENTER & tenant outage 503', async () => {
      const { token } = await helperIssueGuestToken('9820001002');

      // Suspended org -> 403 ORGANIZATION_INACTIVE
      const suspRes = await request(app)
        .post('/api/v1/customers/register')
        .set('Authorization', `Bearer ${token}`)
        .send({ fullName: 'Susp Farmer', mobileNumber: '9820001002', organizationId: orgSusp });
      assert.equal(suspRes.status, 403);
      assert.equal(suspRes.body.code, 'ORGANIZATION_INACTIVE');

      // Inactive center -> 400 INACTIVE_CENTER
      const inactRes = await request(app)
        .post('/api/v1/customers/register')
        .set('Authorization', `Bearer ${token}`)
        .send({ fullName: 'Inactive Center Farmer', mobileNumber: '9820001002', organizationId: orgA, centerId: centerAInactive });
      assert.equal(inactRes.status, 400);
      assert.equal(inactRes.body.code, 'INACTIVE_CENTER');

      // Omitted centerId on dairy with zero tenant centers (despite central DB center!) -> 400 NO_ACTIVE_CENTER
      const noCenterRes = await request(app)
        .post('/api/v1/customers/register')
        .set('Authorization', `Bearer ${token}`)
        .send({ fullName: 'No Center Farmer', mobileNumber: '9820001002', organizationId: orgNoCenter });
      assert.equal(noCenterRes.status, 400);
      assert.equal(noCenterRes.body.code, 'NO_ACTIVE_CENTER');

      // Unmapped dairy -> 503 TENANT_MAPPING_MISSING
      const unmappedRes = await request(app)
        .post('/api/v1/customers/register')
        .set('Authorization', `Bearer ${token}`)
        .send({ fullName: 'Unmapped Farmer', mobileNumber: '9820001002', organizationId: orgUnmapped });
      assert.equal(unmappedRes.status, 503);
      assert.equal(unmappedRes.body.code, 'TENANT_MAPPING_MISSING');

      // Omitted centerId when tenantDbA HAS active center -> resolves centerA cleanly
      const autoCenterRes = await request(app)
        .post('/api/v1/customers/register')
        .set('Authorization', `Bearer ${token}`)
        .send({ fullName: 'Auto Center Farmer', mobileNumber: '9820001002', organizationId: orgA });
      assert.equal(autoCenterRes.status, 201);
      assert.equal(autoCenterRes.body.data.centerId, centerA);
    });

    await t.test('10-14. OTP proof, phone mismatch, cross-dairy staff, consent gate, and biometric partial failure retry', async () => {
      // Unauthenticated without proof -> 401
      const noProof = await request(app).post('/api/v1/customers/register').send({ fullName: 'No Proof', mobileNumber: '9820001003', organizationId: orgA });
      assert.equal(noProof.status, 401);
      assert.equal(noProof.body.code, 'REGISTRATION_PROOF_REQUIRED');

      // Invalid / replayed OTP -> 401
      const badOtp = await request(app).post('/api/v1/customers/register').send({ fullName: 'Bad Otp', mobileNumber: '9820001003', otp: '000000', organizationId: orgA });
      assert.equal(badOtp.status, 401);

      const { token } = await helperIssueGuestToken('9820001003');

      // Phone mismatch -> 403 PHONE_MISMATCH
      const mismatchRes = await request(app)
        .post('/api/v1/customers/register')
        .set('Authorization', `Bearer ${token}`)
        .send({ fullName: 'Mismatch', mobileNumber: '9820001099', organizationId: orgA });
      assert.equal(mismatchRes.status, 403);
      assert.equal(mismatchRes.body.code, 'PHONE_MISMATCH');

      // Staff cross-dairy registration -> 403
      const staffCross = await request(app)
        .post('/api/v1/customers/register')
        .set('Authorization', `Bearer ${adminAToken}`)
        .send({ fullName: 'Staff Cross', mobileNumber: '9820001003', organizationId: orgB, centerId: centerB });
      assert.equal(staffCross.status, 403);

      // Face template without biometricConsent -> 400 BIOMETRIC_CONSENT_REQUIRED
      const noConsent = await request(app)
        .post('/api/v1/customers/register')
        .set('Authorization', `Bearer ${token}`)
        .send({
          fullName: 'Consent Missing',
          mobileNumber: '9820001003',
          organizationId: orgA,
          biometricConsent: false,
          faceTemplate: { modelVersion: 'sface_int8_2021dec', embedding: unitVec(7), confidence: 0.95 },
        });
      assert.equal(noConsent.status, 400);
      assert.equal(noConsent.body.code, 'BIOMETRIC_CONSENT_REQUIRED');

      // Biometric failure after pending customer creation -> partialSuccess: true (201) + idempotent retry completes without duplicate row!
      const origBioQuery = tenantDbA.query.bind(tenantDbA);
      const origBioTx = tenantDbA.withTransaction.bind(tenantDbA);
      const wrapFailFace = (fn) => async (sql, params) => {
        if (typeof sql === 'string' && sql.includes('face_enrollments') && /INSERT|UPDATE/i.test(sql)) {
          throw new Error('Simulated biometric write failure');
        }
        return fn(sql, params);
      };
      tenantDbA.query = wrapFailFace(origBioQuery);
      tenantDbA.withTransaction = async (cb) => origBioTx(async (client) => {
        const clientOrig = client.query.bind(client);
        client.query = wrapFailFace(clientOrig);
        try {
          return await cb(client);
        } finally {
          client.query = clientOrig;
        }
      });
      let createdId = '';
      try {
        const partialRes = await request(app)
          .post('/api/v1/customers/register')
          .set('Authorization', `Bearer ${token}`)
          .send({
            fullName: 'Partial Bio Farmer',
            mobileNumber: '9820001003',
            organizationId: orgA,
            centerId: centerA,
            biometricConsent: true,
            faceTemplate: { modelVersion: 'sface_int8_2021dec', embedding: unitVec(8), confidence: 0.95 },
          });
        assert.equal(partialRes.status, 201);
        assert.equal(partialRes.body.partialSuccess, true);
        assert.equal(partialRes.body.customerCreated, true);
        assert.equal(partialRes.body.biometricEnrolled, false);
        assert.equal(partialRes.body.code, 'BIOMETRIC_ENROLLMENT_PARTIAL_FAILURE');
        createdId = partialRes.body.customerUuid;
      } finally {
        tenantDbA.query = origBioQuery;
        tenantDbA.withTransaction = origBioTx;
      }

      // Retry registration after transient biometric failure -> idempotent update + face enrolled, still single customer row
      const retryRes = await request(app)
        .post('/api/v1/customers/register')
        .set('Authorization', `Bearer ${token}`)
        .send({
          fullName: 'Partial Bio Farmer',
          mobileNumber: '9820001003',
          organizationId: orgA,
          centerId: centerA,
          biometricConsent: true,
          faceTemplate: { modelVersion: 'sface_int8_2021dec', embedding: unitVec(8), confidence: 0.95 },
        });
      assert.equal(retryRes.status, 201);
      assert.equal(retryRes.body.biometricEnrolled, undefined);
      assert.equal(retryRes.body.customerUuid, createdId);

      const dupCount = await tenantDbA.query(
        `SELECT COUNT(*)::int AS c FROM customers WHERE organization_id = $1 AND normalized_mobile_number = '+919820001003';`,
        [orgA]
      );
      assert.equal(Number(dupCount.rows[0].c), 1);
    });
  });

  // ============================================================================
  // GROUP 6C: COLLECTION & SYNC TENANT CONTEXT PROPAGATION (DF-007 PARTIAL)
  // ============================================================================
  await suite.test('6C. Collection & Offline Sync Tenant Context Propagation', async (t) => {
    // Register & approve farmer in Dairy A and Dairy B cleanly
    const { token: tokFarmerA } = await (async () => {
      doveOtpService.resetCooldown('+919820002001');
      const r = await request(app).post('/api/v1/auth/request-otp').send({ mobileNumber: '9820002001' });
      const v = await request(app).post('/api/v1/auth/verify-otp').send({ mobileNumber: '9820002001', otp: r.body.previewOtp });
      return { token: v.body.accessToken };
    })();
    const regA = await request(app)
      .post('/api/v1/customers/register')
      .set('Authorization', `Bearer ${tokFarmerA}`)
      .send({ fullName: 'Sync Farmer Alpha', mobileNumber: '9820002001', organizationId: orgA, centerId: centerA, categories: ['COW'] });
    assert.equal(regA.status, 201);
    const farmerA = regA.body.customerUuid;
    const appA = await request(app).post(`/api/v1/customers/${farmerA}/approve`).set('Authorization', `Bearer ${adminAToken}`).send({ customerCode: 'FA-SYNC-1' });
    assert.equal(appA.status, 200);

    const farmerB = crypto.randomUUID();
    await tenantDbB.query(
      `INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status, is_deleted)
       VALUES ($1, $2, $3, 'FB-SYNC-1', 'Sync Farmer Beta', '+919820002002', 'ACTIVE', 'APPROVED', FALSE) ON CONFLICT (id) DO NOTHING;`,
      [farmerB, orgB, centerB]
    );
    await tenantDbB.query(
      `INSERT INTO customer_ledger_accounts (customer_id, organization_id, currency, current_balance) VALUES ($1, $2, 'INR', 0.00) ON CONFLICT DO NOTHING;`,
      [farmerB, orgB]
    );

    await t.test('1-2. Intake and sync endpoints reject spoofed dairyId/header; syncUseCase requires authenticated orgId', async () => {
      const intakeCross = await request(app)
        .post('/api/v1/collections/intake')
        .set('Authorization', `Bearer ${opAToken}`)
        .set('x-dairy-id', orgB)
        .send({ sessionCode: sessionCodeA, customerId: farmerA, milkCategory: 'COW', weightLiters: 5, fatPercentage: 4.0, snfPercentage: 8.5, deviceId: deviceIdA });
      assert.equal(intakeCross.status, 403);

      const syncBulkCross = await request(app)
        .post('/api/v1/sync/bulk')
        .set('Authorization', `Bearer ${opAToken}`)
        .set('x-dairy-id', orgB)
        .send({ batchId: `b-${Date.now()}`, deviceId: deviceIdA, transactions: [] });
      assert.equal(syncBulkCross.status, 403);

      const syncTxCross = await request(app)
        .post('/api/v1/sync/transactions')
        .set('Authorization', `Bearer ${opAToken}`)
        .send({ organizationId: orgB, deviceId: deviceIdA, transactions: [] });
      assert.equal(syncTxCross.status, 403);

      const directSyncUseCase = new ProcessOfflineSyncBatchUseCase(
        new ProcessMilkIntakeUseCase(
          new PostgresCustomerRepository(),
          sessionRepo,
          new PostgresCollectionTransactionRepository(),
          new PostgresRateChartRepository(),
          new PostgresLedgerRepository()
        )
      );
      await assert.rejects(
        () => directSyncUseCase.execute({ deviceId: deviceIdA, operatorId: opA, operatorName: 'Op A', organizationId: '', transactions: [] }),
        (e) => e.name === 'DomainValidationError' && e.code === 'MISSING_ORGANIZATION_ID'
      );
    });

    await t.test('3-5. sync/transactions forwards organizationId, blocks cross-tenant items/customers, and keeps retry idempotent', async () => {
      const validUuid = `offline-${crypto.randomUUID()}`;
      const poisonedUuid = `offline-poison-${crypto.randomUUID()}`;

      const res = await request(app)
        .post('/api/v1/sync/transactions')
        .set('Authorization', `Bearer ${opAToken}`)
        .send({
          deviceId: deviceIdA,
          transactions: [
            {
              clientIntakeUuid: poisonedUuid,
              sessionCode: sessionCodeA,
              customerId: farmerA,
              organizationId: orgB, // spoofed item org!
              milkCategory: 'COW',
              weightLiters: 10,
              fatPercentage: 4.0,
              snfPercentage: 8.5,
              identificationMethod: 'MANUAL_SEARCH',
            },
            {
              clientIntakeUuid: `offline-cross-cust-${crypto.randomUUID()}`,
              sessionCode: sessionCodeA,
              customerId: farmerB, // Dairy B farmer!
              milkCategory: 'COW',
              weightLiters: 10,
              fatPercentage: 4.0,
              snfPercentage: 8.5,
              identificationMethod: 'MANUAL_SEARCH',
            },
            {
              clientIntakeUuid: validUuid,
              sessionCode: sessionCodeA,
              customerId: farmerA,
              milkCategory: 'COW',
              weightLiters: 12.5,
              fatPercentage: 4.2,
              snfPercentage: 8.6,
              identificationMethod: 'MANUAL_SEARCH',
            },
          ],
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      const items = res.body.data?.items || res.body.data?.details || [];
      const rPoison = items.find((x) => x.clientIntakeUuid === poisonedUuid);
      assert.equal(rPoison.success, false);
      assert.equal(rPoison.errorCode, 'CROSS_TENANT_ITEM_BLOCKED');

      const rCrossCust = items.find((x) => x.clientIntakeUuid.startsWith('offline-cross-cust-'));
      assert.equal(rCrossCust.success, false);

      const rValid = items.find((x) => x.clientIntakeUuid === validUuid);
      assert.equal(rValid.success, true);

      // Ensure zero transactions/ledger entries in Dairy B and exactly 1 in Dairy A
      const txB = await tenantDbB.query(`SELECT COUNT(*)::int AS c FROM milk_collections;`);
      assert.equal(Number(txB.rows[0].c), 0);
      const txA = await tenantDbA.query(`SELECT COUNT(*)::int AS c FROM milk_collections WHERE customer_id = $1;`, [farmerA]);
      assert.equal(Number(txA.rows[0].c), 1);

      // Idempotent replay produces zero duplicate records
      const replay = await request(app)
        .post('/api/v1/sync/transactions')
        .set('Authorization', `Bearer ${opAToken}`)
        .send({
          deviceId: deviceIdA,
          transactions: [
            {
              clientIntakeUuid: validUuid,
              sessionCode: sessionCodeA,
              customerId: farmerA,
              milkCategory: 'COW',
              weightLiters: 12.5,
              fatPercentage: 4.2,
              snfPercentage: 8.6,
              identificationMethod: 'MANUAL_SEARCH',
            },
          ],
        });
      assert.equal(replay.status, 200);
      assert.equal(replay.body.data.items[0].isIdempotentReplay, true);
      const txAAfter = await tenantDbA.query(`SELECT COUNT(*)::int AS c FROM milk_collections WHERE customer_id = $1;`, [farmerA]);
      assert.equal(Number(txAAfter.rows[0].c), 1);
    });

    await t.test('3-6. CustomerRepository RFID assignment and lookups fail closed without tenant context or active mapping', async () => {
      const cRepo = new PostgresCustomerRepository();
      await assert.rejects(
        () => cRepo.assignRfidCard(farmerA, 'RFID-UNSCOPED-01'),
        (e) => e.name === 'DomainValidationError' && e.code === 'TENANT_CONTEXT_REQUIRED'
      );
      await assert.rejects(
        () => cRepo.findByFarmerCode('F-404', orgUnmapped),
        /No active persistent database|not provisioned|Tenant database/i
      );
      await assert.rejects(
        () => cRepo.findByRfid('RFID-404', orgUnmapped),
        /No active persistent database|not provisioned|Tenant database/i
      );
      await assert.rejects(
        () => cRepo.listCustomers({ organizationId: orgUnmapped }),
        /No active persistent database|not provisioned|Tenant database/i
      );
      await assert.rejects(
        () => cRepo.listPendingRegistrations(orgUnmapped),
        /No active persistent database|not provisioned|Tenant database/i
      );
    });

    await t.test('3-7. updateFaceEnrollment enforces organization_id operator scoping (no unscoped users fallback)', async () => {
      const cRepo = new PostgresCustomerRepository();
      // Provision isolated org with another org's active operator inside the same DB to ensure org_id filter holds
      const emptyOpOrg = crypto.randomUUID();
      await db.query(
        `INSERT INTO organizations (id, name, code, status) VALUES ($1, 'Empty Op Dairy', 'R03-EOP', 'ACTIVE') ON CONFLICT (id) DO NOTHING;`,
        [emptyOpOrg]
      );
      await tenantDbManager.provisionTenantDatabase({ dairyId: emptyOpOrg, dairyCode: 'R03-EOP', dairyName: 'Empty Op Dairy' });
      const tenantEmptyOpDb = await tenantDbManager.getStrictTenantDb(emptyOpOrg);
      await tenantEmptyOpDb.query(`DELETE FROM user_center_assignments;`).catch(() => {});
      await tenantEmptyOpDb.query(`DELETE FROM users;`).catch(() => {});
      await tenantEmptyOpDb.query(
        `INSERT INTO organizations (id, name, code, status) VALUES ($1, 'Other Org Shadow', 'R03-OTH', 'ACTIVE') ON CONFLICT (id) DO NOTHING;`,
        [orgB]
      );
      await tenantEmptyOpDb.query(
        `INSERT INTO users (id, organization_id, username, full_name, phone_number, role, status)
         VALUES ($1, $2, 'other_org_op', 'Other Org Op', '+919800008899', 'COLLECTION_OPERATOR', 'ACTIVE')
         ON CONFLICT (id) DO NOTHING;`,
        [crypto.randomUUID(), orgB]
      );
      await assert.rejects(
        () =>
          cRepo.updateFaceEnrollment(
            crypto.randomUUID(),
            'sface_int8_2021dec',
            JSON.stringify({ ciphertext: 'aa', iv: 'bb', authTag: 'cc' }),
            emptyOpOrg
          ),
        (e) => e.name === 'DomainValidationError' && e.code === 'NO_ACTIVE_OPERATOR'
      );
    });

    await t.test('3-8. retry-provisioning mirrors control-plane primary center and admin user into recovered tenant DB', async () => {
      const recOrgId = crypto.randomUUID();
      const recCenterId = crypto.randomUUID();
      const recAdminId = crypto.randomUUID();
      const superId = crypto.randomUUID();
      const recCode = 'R03-REC-' + crypto.randomUUID().slice(0, 4).toUpperCase();

      await db.query(
        `INSERT INTO organizations (id, name, code, status) VALUES ($1, 'Recovered Dairy', $2, 'ACTIVE') ON CONFLICT (id) DO NOTHING;`,
        [recOrgId, recCode]
      );
      await db.query(
        `INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
         VALUES ($1, $2, 'C-01', 'Recovered Main Center', 'Main St', 'Village', 'Pune', 'MH', '411001', '+919800007777', 'ACTIVE')
         ON CONFLICT (id) DO NOTHING;`,
        [recCenterId, recOrgId]
      );
      await db.query(
        `INSERT INTO users (id, organization_id, username, full_name, email, phone_number, role, user_role, status)
         VALUES ($1, $2, $3, 'Recovered Admin', $4, '9800007777', 'DAIRY_ADMIN', 'PRIMARY_DAIRY_ADMIN', 'ACTIVE')
         ON CONFLICT (id) DO NOTHING;`,
        [recAdminId, recOrgId, `rec_admin_${recCode}`, `rec_${recCode}@dfarm.in`]
      );
      await db.query(
        `INSERT INTO users (id, organization_id, username, full_name, phone_number, role, user_role, status)
         VALUES ($1, $2, $3, 'Restart03 Super Admin', '+919800006666', 'SUPER_ADMIN', 'SUPER_ADMIN', 'ACTIVE')
         ON CONFLICT (id) DO NOTHING;`,
        [superId, orgA, `super_${superId.slice(0, 8)}`]
      );

      const superToken = tokenService.signToken({
        userId: superId,
        organizationId: orgA,
        role: 'SUPER_ADMIN',
        actorType: 'STAFF',
      });

      const retryRes = await request(app)
        .post(`/api/v1/dairies/${recOrgId}/retry-provisioning`)
        .set('Authorization', `Bearer ${superToken}`);
      assert.equal(retryRes.status, 200);
      assert.equal(retryRes.body.success, true);

      const recTenantDb = await tenantDbManager.getStrictTenantDb(recOrgId);
      const cCheck = await recTenantDb.query(`SELECT id, name FROM dairy_centers WHERE id = $1 AND organization_id = $2;`, [recCenterId, recOrgId]);
      assert.equal(cCheck.rows.length, 1);
      assert.equal(cCheck.rows[0].name, 'Recovered Main Center');
      const uCheck = await recTenantDb.query(`SELECT id, role FROM users WHERE id = $1 AND organization_id = $2;`, [recAdminId, recOrgId]);
      assert.equal(uCheck.rows.length, 1);
    });
  });
});
