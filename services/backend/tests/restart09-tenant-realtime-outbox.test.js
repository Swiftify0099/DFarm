import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import { assertDisposablePg17Cluster } from '../../../scripts/pg17-safety-guard.js';
import { createPoolShutdownManager } from './helpers/pool-lifecycle-helpers.js';

const { Pool } = pg;

const TEST_PG_URL = process.env['TEST_POSTGRES_URL'] || '';
const REQUIRE_REAL_PG = process.env['REQUIRE_REAL_POSTGRES'] === '1';

async function canConnectRealPostgres(url) {
  if (!url) return false;
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 2500 });
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => {});
  }
}

function makeDbUrl(baseUrl, dbName) {
  const url = new URL(baseUrl);
  url.pathname = `/${dbName}`;
  return url.toString();
}

async function waitForDbIdle(adminPool, dbName, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await adminPool.query(
      `SELECT COUNT(*)::int AS active_count
       FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid();`,
      [dbName]
    );
    if ((res.rows[0]?.active_count ?? 0) === 0) {
      return;
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  const finalRes = await adminPool.query(
    `SELECT COUNT(*)::int AS active_count
     FROM pg_stat_activity
     WHERE datname = $1 AND pid <> pg_backend_pid();`,
    [dbName]
  );
  const remaining = Number(finalRes.rows[0]?.active_count || 0);
  if (remaining > 0) {
    throw new Error(
      `Disposable database '${dbName}' still had ${remaining} active/idle connection(s) before DROP DATABASE.`
    );
  }
}

async function waitForPublisherIdle(publisher, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (publisher.getInFlightBackgroundWorkCount() === 0) {
      return;
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(
    `RealtimeEventPublisher still had ${publisher.getInFlightBackgroundWorkCount()} background task(s) in flight after ${timeoutMs}ms.`
  );
}

function createFakeSseRes() {
  const frames = [];
  const res = {
    writableEnded: false,
    destroyed: false,
    write(chunk) {
      frames.push(String(chunk));
      return true;
    },
    destroy() {
      res.destroyed = true;
    },
  };
  return { res, frames };
}

function parseSseFrames(chunks) {
  return chunks
    .join('')
    .split('\n\n')
    .filter((block) => block.trim() && !block.startsWith(':'))
    .map((block) => {
      const lines = block.split('\n');
      const idLine = lines.find((l) => l.startsWith('id: '));
      const eventLine = lines.find((l) => l.startsWith('event: '));
      const dataLine = lines.find((l) => l.startsWith('data: '));
      return {
        id: idLine ? idLine.slice(4) : null,
        event: eventLine ? eventLine.slice(7) : null,
        data: dataLine ? JSON.parse(dataLine.slice(6)) : null,
      };
    });
}

const pgAvailable = await canConnectRealPostgres(TEST_PG_URL);

if (!pgAvailable) {
  const msg =
    'Real PostgreSQL 17 server unavailable (TEST_POSTGRES_URL unset or unreachable); boot docker-compose.pg17-verify.yml and set TEST_POSTGRES_URL.';
  if (REQUIRE_REAL_PG) {
    test('RESTART-09 PostgreSQL 17 Real-Database Realtime Outbox Gate (FAIL-CLOSED)', () => {
      assert.fail(`REQUIRE_REAL_POSTGRES=1 gate failed: ${msg}`);
    });
  } else {
    test('RESTART-09 PostgreSQL 17 Real-Database Realtime Outbox Gate (SKIPPED: no PG17)', { skip: msg }, () => {});
  }
} else {
  await assertDisposablePg17Cluster({ connectionString: TEST_PG_URL });

  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  const dbNameCtrl = `dfarm_r09_ctrl_${suffix}`;
  const dbNameA = `dfarm_r09_a_${suffix}`;
  const dbNameB = `dfarm_r09_b_${suffix}`;
  const urlCtrl = makeDbUrl(TEST_PG_URL, dbNameCtrl);
  const urlA = makeDbUrl(TEST_PG_URL, dbNameA);
  const urlB = makeDbUrl(TEST_PG_URL, dbNameB);

  const orgA = crypto.randomUUID();
  const orgB = crypto.randomUUID();
  const orgDown = crypto.randomUUID();

  let adminPool;
  let poolCtrl;
  let poolA;
  let poolB;
  const poolErrors = [];
  const guardedPools = new WeakSet();
  const { closePoolCleanly } = createPoolShutdownManager();

  function attachPoolErrorGuard(pool, label) {
    if (!pool || guardedPools.has(pool)) return pool;
    guardedPools.add(pool);
    pool.on('error', (err) => {
      poolErrors.push({ label, code: err?.code, message: err?.message || String(err) });
    });
    return pool;
  }

  test('RESTART-09 PostgreSQL 17 Real-Database Multi-Tenant Outbox & SSE Gate', async (t) => {
    adminPool = attachPoolErrorGuard(new Pool({ connectionString: TEST_PG_URL }), 'adminPool');

    await adminPool.query(`CREATE DATABASE ${dbNameCtrl};`);
    await adminPool.query(`CREATE DATABASE ${dbNameA};`);
    await adminPool.query(`CREATE DATABASE ${dbNameB};`);

    poolCtrl = attachPoolErrorGuard(new Pool({ connectionString: urlCtrl }), 'poolCtrl');
    poolA = attachPoolErrorGuard(new Pool({ connectionString: urlA }), 'poolA');
    poolB = attachPoolErrorGuard(new Pool({ connectionString: urlB }), 'poolB');

    // Point backend config/singletons to disposable control-plane DB BEFORE importing dist modules
    process.env['NODE_ENV'] = 'test';
    process.env['REQUIRE_REAL_POSTGRES'] = '1';
    process.env['TEST_REAL_POSTGRES'] = '1';
    process.env['DATABASE_TLS_MODE'] = 'disable';
    process.env['CENTRAL_DATABASE_URL'] = urlCtrl;
    process.env['DATABASE_URL'] = urlCtrl;
    process.env['DATABASE_PROVISIONER_URL'] = urlCtrl;
    process.env['TENANT_POOL_CONNECTION_TIMEOUT_MS'] = '5000';

    const { db } = await import('../dist/infrastructure/database/PostgresPool.js');
    attachPoolErrorGuard(db.pool, 'globalDbPool');
    const { MigrationRunner } = await import('../dist/infrastructure/database/MigrationRunner.js');
    const { CredentialEncryption } = await import('../dist/infrastructure/security/CredentialEncryption.js');
    const { tenantDbManager, PLATFORM_FEDERATION_DAIRY_ID } = await import(
      '../dist/infrastructure/database/TenantDatabaseManager.js'
    );
    const { RealtimeEventPublisher, realtimePublisher } = await import(
      '../dist/infrastructure/realtime/RealtimeEventPublisher.js'
    );
    const { PostgresCollectionTransactionRepository } = await import(
      '../dist/infrastructure/repositories/PostgresCollectionTransactionRepository.js'
    );
    const { MilkCollectionTransaction } = await import('../dist/domain/entities/MilkCollectionTransaction.js');
    const { KioskShiftSession } = await import('../dist/domain/entities/KioskShiftSession.js');

    await realtimePublisher.destroy();

    await MigrationRunner.runControlPlaneMigrations(poolCtrl);
    await MigrationRunner.runTenantMigrations(poolA, orgA);
    await MigrationRunner.runTenantMigrations(poolB, orgB);

    // Seed active orgs + dairy_database_mappings in central control plane ONLY
    await poolCtrl.query(
      `INSERT INTO organizations (id, name, code, status) VALUES
       ($1, 'Dairy Alpha', $4, 'ACTIVE'),
       ($2, 'Dairy Beta', $5, 'ACTIVE'),
       ($3, 'Dairy Down', $6, 'ACTIVE');`,
      [orgA, orgB, orgDown, `ALPHA_${suffix}`, `BETA_${suffix}`, `DOWN_${suffix}`]
    );

    const encA = CredentialEncryption.encrypt(urlA);
    const encB = CredentialEncryption.encrypt(urlB);
    const unreachableUrl = urlB.replace(dbNameB, `dfarm_nonexistent_${suffix}`);
    const encDown = CredentialEncryption.encrypt(unreachableUrl);

    await poolCtrl.query(
      `INSERT INTO dairy_database_mappings
        (id, dairy_id, dairy_code, database_name, resource_type, connection_uri_encrypted, schema_version, provisioning_status)
       VALUES
        ($1, $2, $3, $4, 'PHYSICAL_DATABASE', $5, 'v1.0.0', 'ACTIVE'),
        ($6, $7, $8, $9, 'PHYSICAL_DATABASE', $10, 'v1.0.0', 'ACTIVE'),
        ($11, $12, $13, $14, 'PHYSICAL_DATABASE', $15, 'v1.0.0', 'ACTIVE');`,
      [
        crypto.randomUUID(), orgA, `A_${suffix}`, dbNameA, encA,
        crypto.randomUUID(), orgB, `B_${suffix}`, dbNameB, encB,
        crypto.randomUUID(), orgDown, `D_${suffix}`, `dfarm_nonexistent_${suffix}`, encDown,
      ]
    );

    // Point TenantDatabaseManager control plane at poolCtrl and spy on central queries + getAllTenantDbs
    const centralOutboxQueries = [];
    const controlPlaneAdapter = {
      query: async (text, params = []) => {
        if (String(text).includes('dashboard_events_outbox')) {
          centralOutboxQueries.push(String(text));
          throw new Error(`SPLIT_BRAIN_FORBIDDEN_CONTROL_PLANE_OUTBOX_QUERY: ${text}`);
        }
        return poolCtrl.query(text, params);
      },
      withTransaction: async (cb) => {
        const client = await poolCtrl.connect();
        try {
          await client.query('BEGIN');
          const res = await cb(client);
          await client.query('COMMIT');
          return res;
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      },
    };
    const origCtrlDb = tenantDbManager.getControlPlaneDb();
    const origGetAllTenantDbs = tenantDbManager.getAllTenantDbs.bind(tenantDbManager);
    tenantDbManager.setControlPlaneDb(controlPlaneAdapter);
    tenantDbManager.getAllTenantDbs = () => {
      throw new Error('FORBIDDEN_GET_ALL_TENANT_DBS');
    };

    // Seed tenant entities in poolA & poolB for atomic collection intake and outbox FK references
    const centerA1 = crypto.randomUUID();
    const centerA2 = crypto.randomUUID();
    const opA = crypto.randomUUID();
    const custA = crypto.randomUUID();
    const kioskSessA = crypto.randomUUID();
    const rateChartA = crypto.randomUUID();
    const rateVerA = crypto.randomUUID();

    await poolA.query(
      `INSERT INTO organizations (id, name, code, status) VALUES ($1, 'Dairy Alpha', $2, 'ACTIVE') ON CONFLICT DO NOTHING;`,
      [orgA, `ALPHA_${suffix}`]
    );
    await poolA.query(
      `INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status) VALUES
       ($1, $3, 'C-A1', 'Center A1', 'Addr 1', 'Vil', 'Dist', 'MH', '416001', '9000000001', 'ACTIVE'),
       ($2, $3, 'C-A2', 'Center A2', 'Addr 2', 'Vil', 'Dist', 'MH', '416002', '9000000002', 'ACTIVE');`,
      [centerA1, centerA2, orgA]
    );
    await poolA.query(
      `INSERT INTO users (id, organization_id, username, full_name, phone_number, role, status)
       VALUES ($1, $2, $3, 'Op Alpha', '9000000010', 'COLLECTION_OPERATOR', 'ACTIVE');`,
      [opA, orgA, `op_a_${suffix}`]
    );
    await poolA.query(
      `INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status)
       VALUES ($1, $2, $3, 'F-A1', 'Farmer Alpha', '919000000011', 'ACTIVE', 'APPROVED');`,
      [custA, orgA, centerA1]
    );
    await poolA.query(
      `INSERT INTO customer_milk_categories (customer_id, milk_category, is_authorized, authorized_by)
       VALUES ($1, 'COW', TRUE, $2);`,
      [custA, opA]
    );
    await poolA.query(
      `INSERT INTO customer_ledger_accounts (customer_id, organization_id, current_balance)
       VALUES ($1, $2, 0.00);`,
      [custA, orgA]
    );
    await poolA.query(
      `INSERT INTO kiosk_shift_sessions (
        id, session_code, organization_id, center_id, business_date, shift, status,
        opened_at, opening_operator_id, device_identifier, device_name
       ) VALUES ($1, $2, $3, $4, '2026-11-28', 'MORNING', 'OPEN', NOW(), $5, 'KIOSK-A1', 'Kiosk Alpha 1');`,
      [kioskSessA, `S-A-${suffix}`, orgA, centerA1, opA]
    );
    await poolA.query(
      `INSERT INTO rate_charts (id, organization_id, center_id, name, milk_category, is_active)
       VALUES ($1, $2, $3, 'Cow Rate A', 'COW', TRUE);`,
      [rateChartA, orgA, centerA1]
    );
    await poolA.query(
      `INSERT INTO rate_chart_versions (id, rate_chart_id, version_number, effective_from, base_fat, base_snf, base_rate, is_approved)
       VALUES ($1, $2, 1, NOW() - INTERVAL '1 day', 4.5, 8.5, 42.00, TRUE);`,
      [rateVerA, rateChartA]
    );

    const centerB1 = crypto.randomUUID();
    await poolB.query(
      `INSERT INTO organizations (id, name, code, status) VALUES ($1, 'Dairy Beta', $2, 'ACTIVE') ON CONFLICT DO NOTHING;`,
      [orgB, `BETA_${suffix}`]
    );
    await poolB.query(
      `INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
       VALUES ($1, $2, 'C-B1', 'Center B1', 'Addr B', 'Vil', 'Dist', 'MH', '416003', '9000000099', 'ACTIVE');`,
      [centerB1, orgB]
    );

    let primaryError = null;
    try {
      await t.test('Test A & B & E: Collection intake persists PENDING event to Tenant A DB, worker delivers cleanly while isolating unhealthy orgDown', async () => {
        const publisher = new RealtimeEventPublisher();
        const sseA = createFakeSseRes();
        const sseB = createFakeSseRes();

        try {
          publisher.registerClient({ organizationId: orgA, res: sseA.res });
          publisher.registerClient({ organizationId: orgB, res: sseB.res });

          const repo = new PostgresCollectionTransactionRepository();
          const txnId = crypto.randomUUID();
          const intakeTxn = new MilkCollectionTransaction({
            id: txnId,
            transactionCode: `TXN-${txnId.slice(0, 8)}`,
            sessionId: kioskSessA,
            dairyId: orgA,
            centerId: centerA1,
            customerId: custA,
            customerCode: 'F-A1',
            customerName: 'Farmer Alpha',
            timestamp: new Date().toISOString(),
            date: '2026-11-28',
            shift: 'MORNING',
            milkCategory: 'COW',
            weightLiters: 12.5,
            fatPercentage: 4.5,
            snfPercentage: 8.5,
            clrDensity: 28.0,
            appliedRatePerLiter: 42.0,
            rateChartVersion: 1,
            totalAmount: 525.0,
            identificationMethod: 'MANUAL_SEARCH',
            syncStatus: 'SYNCED_CLOUD',
            deviceId: 'KIOSK-A1',
            operatorName: 'Op Alpha',
            idempotencyKey: `idem-r09-${suffix}`,
          });
          const shiftSess = new KioskShiftSession({
            id: kioskSessA,
            sessionCode: `S-A-${suffix}`,
            organizationId: orgA,
            centerId: centerA1,
            businessDate: '2026-11-28',
            shift: 'MORNING',
            status: 'OPEN',
            openedAt: new Date().toISOString(),
            openingOperatorId: opA,
            openingOperatorName: 'Op Alpha',
            deviceIdentifier: 'KIOSK-A1',
            deviceName: 'Kiosk Alpha 1',
          });

          await repo.saveAtomicIntake({
            transaction: intakeTxn,
            session: shiftSess,
            totalAmount: 525.0,
            weightLiters: 12.5,
            fatPercentage: 4.5,
            snfPercentage: 8.5,
            milkCategory: 'COW',
            customerId: custA,
            organizationId: orgA,
            centerId: centerA1,
            operatorId: opA,
            operatorName: 'Op Alpha',
            appliedRate: 42.0,
          });

          // Event MUST be PENDING in poolA immediately after atomic commit
          const beforeWorker = await poolA.query(
            `SELECT event_id, status, organization_id FROM dashboard_events_outbox WHERE event_id = $1;`,
            [`EVT-COLL-${txnId}`]
          );
          assert.strictEqual(beforeWorker.rows.length, 1);
          assert.strictEqual(beforeWorker.rows[0].status, 'PENDING');

          // Also insert a PENDING event directly into Tenant B DB
          await poolB.query(
            `INSERT INTO dashboard_events_outbox (event_id, event_type, organization_id, center_id, entity_id, status, payload)
             VALUES ('EVT-B-PG-1', 'SESSION_OPENED', $1, $2, 'sess-b-1', 'PENDING', '{"sessionCode":"SB-1"}'::jsonb);`,
            [orgB, centerB1]
          );

          const summary = await publisher.processOutboxBatchDetailed();
          assert.strictEqual(summary.tenantsSucceeded, 2, 'Healthy orgA & orgB must succeed despite orgDown being unreachable');
          assert.strictEqual(summary.tenantsFailed, 1);
          assert.strictEqual(summary.failures[0].organizationId, orgDown);
          assert.strictEqual(summary.pendingProcessed, 2);

          const afterWorker = await poolA.query(
            `SELECT status, published_at FROM dashboard_events_outbox WHERE event_id = $1;`,
            [`EVT-COLL-${txnId}`]
          );
          assert.strictEqual(afterWorker.rows[0].status, 'PUBLISHED');
          assert.ok(afterWorker.rows[0].published_at);

          const framesA = parseSseFrames(sseA.frames).filter((f) => f.event !== 'CONNECTED');
          const framesB = parseSseFrames(sseB.frames).filter((f) => f.event !== 'CONNECTED');
          assert.deepEqual(framesA.map((f) => f.id), [`EVT-COLL-${txnId}`]);
          assert.deepEqual(framesB.map((f) => f.id), ['EVT-B-PG-1']);
          assert.strictEqual(centralOutboxQueries.length, 0);
        } finally {
          await publisher.destroy();
        }
      });

      await t.test('Test C: Durable Last-Event-ID replay tie-breaks identical created_at timestamps and enforces tenant/center isolation', async () => {
        const publisher = new RealtimeEventPublisher();
        try {
          const sameTs = new Date(Date.now() + 60_000).toISOString();
          await poolA.query(
            `INSERT INTO dashboard_events_outbox
              (id, event_id, event_type, organization_id, center_id, entity_id, status, published_at, created_at, payload)
             VALUES
              ('00000000-0000-0000-0000-000000001001', 'EVT-A-TIE-1', 'COLLECTION_ACCEPTED', $1, $2, 'e1', 'PUBLISHED', $4, $4, '{"k":1}'::jsonb),
              ('00000000-0000-0000-0000-000000001002', 'EVT-A-TIE-2', 'COLLECTION_ACCEPTED', $1, $3, 'e2', 'PUBLISHED', $4, $4, '{"k":2}'::jsonb),
              ('00000000-0000-0000-0000-000000001003', 'EVT-A-TIE-3', 'COLLECTION_ACCEPTED', $1, $2, 'e3', 'PUBLISHED', $4, $4, '{"k":3,"mobileNumber":"9876543210"}'::jsonb);`,
            [orgA, centerA1, centerA2, sameTs]
          );

          const sseA1 = createFakeSseRes();
          publisher.registerClient({
            organizationId: orgA,
            centerId: centerA1,
            res: sseA1.res,
            lastEventId: 'EVT-A-TIE-1',
          });
          await waitForPublisherIdle(publisher);

          const frames = parseSseFrames(sseA1.frames).filter((f) => f.event !== 'CONNECTED');
          assert.strictEqual(frames.length, 1);
          assert.strictEqual(frames[0].id, 'EVT-A-TIE-3');
          assert.strictEqual(frames[0].data.payload.mobileNumber, undefined);

          // Cross-tenant Last-Event-ID probe -> RESYNC_REQUIRED
          const sseCross = createFakeSseRes();
          publisher.registerClient({
            organizationId: orgA,
            res: sseCross.res,
            lastEventId: 'EVT-B-PG-1',
          });
          await waitForPublisherIdle(publisher);
          const crossFrames = parseSseFrames(sseCross.frames).filter((f) => f.event !== 'CONNECTED');
          assert.strictEqual(crossFrames[0].event, 'RESYNC_REQUIRED');
        } finally {
          await publisher.destroy();
        }
      });

      await t.test('Test D: Concurrent multi-instance workers use FOR UPDATE SKIP LOCKED safely + cross-instance cursor sync isolates tenants', async () => {
        const pub1 = new RealtimeEventPublisher();
        const pub2 = new RealtimeEventPublisher();
        const sseA1 = createFakeSseRes();
        const sseA2 = createFakeSseRes();
        const sseB2 = createFakeSseRes();

        try {
          pub1.registerClient({ organizationId: orgA, res: sseA1.res });
          pub2.registerClient({ organizationId: orgA, res: sseA2.res });
          pub2.registerClient({ organizationId: orgB, res: sseB2.res });

          // Hold a row-level lock on row 1 in a separate PG17 transaction while pub1 processesTenantOutboxBatch
          const lockClient = await poolA.connect();
          const row1Id = crypto.randomUUID();
          const row2Id = crypto.randomUUID();
          await poolA.query(
            `INSERT INTO dashboard_events_outbox
              (id, event_id, event_type, organization_id, entity_id, status, created_at, payload)
             VALUES
              ($1, 'EVT-LOCKED-1', 'COLLECTION_ACCEPTED', $3, 'ent-l1', 'PENDING', NOW() - INTERVAL '2 seconds', '{"seq":1}'::jsonb),
              ($2, 'EVT-UNLOCKED-2', 'COLLECTION_ACCEPTED', $3, 'ent-l2', 'PENDING', NOW() - INTERVAL '1 second', '{"seq":2}'::jsonb);`,
            [row1Id, row2Id, orgA]
          );

          await lockClient.query('BEGIN');
          await lockClient.query(`SELECT id FROM dashboard_events_outbox WHERE id = $1 FOR UPDATE;`, [row1Id]);

          // Worker 1 must skip locked row1 and claim ONLY unlocked row2!
          const res1 = await pub1.processTenantOutboxBatch(orgA);
          assert.strictEqual(res1.pendingProcessed, 1);

          await lockClient.query('COMMIT');
          lockClient.release();

          // Parallel concurrent workers racing for remaining EVT-LOCKED-1 -> exactly 1 wins!
          const [race1, race2] = await Promise.all([
            pub1.processTenantOutboxBatch(orgA),
            pub2.processTenantOutboxBatch(orgA),
          ]);
          assert.strictEqual(race1.pendingProcessed + race2.pendingProcessed, 1);

          // Cross-instance cursor skew check: orgA far future published_at vs orgB earlier published_at
          await poolA.query(
            `INSERT INTO dashboard_events_outbox (event_id, event_type, organization_id, entity_id, status, published_at, payload)
             VALUES ('EVT-A-FAR-FUTURE', 'SESSION_OPENED', $1, 's-fut', 'PUBLISHED', NOW() + INTERVAL '30 minutes', '{}'::jsonb);`,
            [orgA]
          );
          await poolB.query(
            `INSERT INTO dashboard_events_outbox (event_id, event_type, organization_id, entity_id, status, published_at, payload)
             VALUES ('EVT-B-RECENT', 'SESSION_OPENED', $1, 's-rec', 'PUBLISHED', NOW() - INTERVAL '5 seconds', '{}'::jsonb);`,
            [orgB]
          );

          // Advance orgA cursor to NOW()+30m first, then run full batch to prove orgB cursor stays independent
          await pub2.processTenantOutboxBatch(orgA);
          const aFrames = parseSseFrames(sseA2.frames);
          assert.ok(aFrames.some((f) => f.id === 'EVT-A-FAR-FUTURE'));

          await pub2.processOutboxBatchDetailed();
          const bFrames = parseSseFrames(sseB2.frames);
          assert.ok(bFrames.some((f) => f.id === 'EVT-B-RECENT'));
        } finally {
          await pub1.destroy();
          await pub2.destroy();
        }
      });

      await t.test('Test F, G, H & RLS: Retention cleanup, conflict-safe direct persist, dispatch crash rollback & non-bypassrls RLS + pool reuse verification', async () => {
        const publisher = new RealtimeEventPublisher();
        try {
          // Test G: ON CONFLICT preserves original payload and does not target central DB
          await poolA.query(
            `INSERT INTO dashboard_events_outbox (event_id, event_type, organization_id, entity_id, status, payload)
             VALUES ('EVT-A-CONFLICT-PG', 'COLLECTION_ACCEPTED', $1, 'c-pg-1', 'PENDING', '{"canonical":true}'::jsonb);`,
            [orgA]
          );
          await publisher.persistOutboxEvent({
            eventId: 'EVT-A-CONFLICT-PG',
            eventType: 'COLLECTION_SYNCED',
            schemaVersion: 1,
            organizationId: orgA,
            entityId: 'mutated',
            aggregateVersion: 5,
            occurredAt: new Date().toISOString(),
            publishedAt: new Date().toISOString(),
            payload: { canonical: false, mobileNumber: '9876543210' },
          });
          const conflictRes = await poolA.query(
            `SELECT event_type, status, payload FROM dashboard_events_outbox WHERE event_id = 'EVT-A-CONFLICT-PG';`
          );
          assert.strictEqual(conflictRes.rows[0].status, 'PUBLISHED');
          assert.strictEqual(conflictRes.rows[0].event_type, 'COLLECTION_ACCEPTED');
          assert.strictEqual(conflictRes.rows[0].payload.canonical, true);

          await assert.rejects(
            () =>
              publisher.persistOutboxEvent({
                eventId: 'EVT-FAIL-PLAT',
                eventType: 'STATION_HEARTBEAT',
                schemaVersion: 1,
                organizationId: PLATFORM_FEDERATION_DAIRY_ID,
                entityId: 'st-p',
                aggregateVersion: 1,
                occurredAt: new Date().toISOString(),
                publishedAt: new Date().toISOString(),
                payload: {},
              }),
            /CONTROL_PLANE_TARGET_FORBIDDEN|INVALID_ORGANIZATION/
          );

          // Test H: Dispatch failure rolls back tx cleanly and stays PENDING for retry
          await poolA.query(
            `INSERT INTO dashboard_events_outbox (event_id, event_type, organization_id, entity_id, status, payload)
             VALUES ('EVT-A-CRASH-PG', 'DEVICE_REVOKED', $1, 'd-1', 'PENDING', '{}'::jsonb);`,
            [orgA]
          );
          const origDispatch = publisher.dispatchToClients.bind(publisher);
          publisher.dispatchToClients = () => {
            throw new Error('PG17_DISPATCH_ABORT');
          };
          const crashRun = await publisher.processTenantOutboxBatch(orgA);
          assert.strictEqual(crashRun.ok, false);
          const pendingCheck = await poolA.query(
            `SELECT status FROM dashboard_events_outbox WHERE event_id = 'EVT-A-CRASH-PG';`
          );
          assert.strictEqual(pendingCheck.rows[0].status, 'PENDING');
          publisher.dispatchToClients = origDispatch;
          const recoverRun = await publisher.processTenantOutboxBatch(orgA);
          assert.strictEqual(recoverRun.ok, true);
          const publishedCheck = await poolA.query(
            `SELECT status, published_at FROM dashboard_events_outbox WHERE event_id = 'EVT-A-CRASH-PG';`
          );
          assert.strictEqual(publishedCheck.rows[0].status, 'PUBLISHED');
          assert.ok(publishedCheck.rows[0].published_at);

          // Test F: Retention deletes only expired PUBLISHED (>7d) and keeps recent PUBLISHED / PENDING / FAILED
          await poolA.query(
            `INSERT INTO dashboard_events_outbox (event_id, event_type, organization_id, entity_id, status, published_at, created_at, payload)
             VALUES
              ('EVT-PG-OLD-PUB', 'STATION_HEARTBEAT', $1, 'p1', 'PUBLISHED', NOW() - INTERVAL '14 days', NOW() - INTERVAL '14 days', '{}'::jsonb),
              ('EVT-PG-OLD-FAIL', 'COLLECTION_ACCEPTED', $1, 'p2', 'FAILED', NOW() - INTERVAL '14 days', NOW() - INTERVAL '14 days', '{}'::jsonb),
              ('EVT-PG-OLD-PEND', 'COLLECTION_ACCEPTED', $1, 'p3', 'PENDING', NULL, NOW() - INTERVAL '14 days', '{}'::jsonb);`,
            [orgA]
          );
          const purgeSummary = await publisher.purgeOldOutboxEventsDetailed(7, 500);
          assert.ok(purgeSummary.totalPurged >= 1);
          assert.strictEqual(purgeSummary.tenantsFailed, 1, 'orgDown unreachable error remains visible in purge summary');
          const keptRows = await poolA.query(
            `SELECT event_id FROM dashboard_events_outbox WHERE event_id IN ('EVT-PG-OLD-PUB', 'EVT-PG-OLD-FAIL', 'EVT-PG-OLD-PEND');`
          );
          assert.deepEqual(
            keptRows.rows.map((r) => r.event_id).sort(),
            ['EVT-PG-OLD-FAIL', 'EVT-PG-OLD-PEND']
          );

          // RLS Enforcement with dedicated non-superuser NOBYPASSRLS role + pooled connection reuse leak verification
          await poolA.query(`
            DO $$
            BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'restart09_rls_user') THEN
                CREATE ROLE restart09_rls_user NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
              END IF;
            END $$;
            GRANT USAGE ON SCHEMA public TO restart09_rls_user;
            GRANT SELECT, INSERT, UPDATE, DELETE ON dashboard_events_outbox TO restart09_rls_user;
          `);

          const strictTenantDbA = await tenantDbManager.getStrictTenantDb(orgA, { bypassCache: true, strictOperational: true });
          await strictTenantDbA.withTransaction(async (txClient) => {
            // TenantTransactionContext already set app.current_organization_id = orgA locally
            await txClient.query(`SET LOCAL ROLE restart09_rls_user;`);
            const visibleA = await txClient.query(`SELECT COUNT(*)::int AS cnt FROM dashboard_events_outbox;`);
            assert.ok(visibleA.rows[0].cnt > 0, 'RLS must permit rows matching app.current_organization_id');

            // Switching app.current_organization_id to orgB inside poolA hides orgA rows and rejects orgA INSERT
            await txClient.query(`SELECT set_config('app.current_organization_id', $1, true);`, [orgB]);
            const hiddenA = await txClient.query(`SELECT COUNT(*)::int AS cnt FROM dashboard_events_outbox;`);
            assert.strictEqual(hiddenA.rows[0].cnt, 0, 'Wrong org context must see 0 rows under RLS');

            await assert.rejects(
              () =>
                txClient.query(
                  `INSERT INTO dashboard_events_outbox (event_id, event_type, organization_id, entity_id, payload)
                   VALUES ('EVT-RLS-DENY', 'STATION_HEARTBEAT', $1, 'rls-1', '{}'::jsonb);`,
                  [orgA]
                ),
              /42501|row-level security/i
            );
          });

          // Pooled connection context MUST reset automatically after COMMIT (no session GUC leak!)
          const verifyPool = tenantDbManager.getTenantPool(orgA);
          assert.ok(verifyPool);
          const pooledClient = await verifyPool.connect();
          try {
            const gucCheck = await pooledClient.query(`SELECT NULLIF(current_setting('app.current_organization_id', true), '') AS org_ctx;`);
            assert.strictEqual(gucCheck.rows[0].org_ctx, null, 'Transaction-local app.current_organization_id must reset cleanly after COMMIT');
          } finally {
            pooledClient.release();
          }

          assert.strictEqual(centralOutboxQueries.length, 0);
        } finally {
          await publisher.destroy();
        }
      });
    } catch (err) {
      primaryError = err;
      throw err;
    } finally {
      const cleanupErrors = [];
      const runStep = async (fn) => {
        try {
          await fn();
        } catch (err) {
          cleanupErrors.push(err instanceof Error ? err : new Error(String(err)));
        }
      };

      tenantDbManager.setControlPlaneDb(origCtrlDb);
      tenantDbManager.getAllTenantDbs = origGetAllTenantDbs;

      for (const dairyId of [orgA, orgB, orgDown]) {
        await runStep(async () => {
          const tenantPool = tenantDbManager.getTenantPool?.(dairyId);
          if (tenantPool) {
            const label = `tenantPool_${dairyId.slice(0, 8)}`;
            attachPoolErrorGuard(tenantPool, label);
            await closePoolCleanly(tenantPool, label, () => tenantDbManager.closeTenantPool(dairyId));
            assert.strictEqual(tenantPool.ended, true, `Tenant pool '${label}' must reach ended=true`);
          }
        });
      }
      await runStep(() => tenantDbManager.closeAllPools());
      await runStep(async () => {
        await closePoolCleanly(db.pool, 'globalDbPool', () => db.close());
        assert.strictEqual(db.pool.ended, true, 'globalDbPool must reach ended=true');
      });

      for (const [pool, label] of [
        [poolCtrl, 'poolCtrl'],
        [poolA, 'poolA'],
        [poolB, 'poolB'],
      ]) {
        if (pool) {
          await runStep(async () => {
            await closePoolCleanly(pool, label);
            assert.strictEqual(pool.ended, true, `Pool '${label}' must reach ended=true`);
          });
        }
      }

      if (adminPool) {
        for (const dbName of [dbNameA, dbNameB, dbNameCtrl]) {
          await runStep(async () => {
            await waitForDbIdle(adminPool, dbName);
            await adminPool.query(`DROP DATABASE IF EXISTS ${dbName};`);
          });
        }
        await runStep(async () => {
          await adminPool.query(`DROP ROLE IF EXISTS restart09_rls_user;`);
        });
        await runStep(async () => {
          await closePoolCleanly(adminPool, 'adminPool');
          assert.strictEqual(adminPool.ended, true, 'adminPool must reach ended=true');
        });
      }

      await runStep(async () => {
        assert.deepEqual(poolErrors, [], `Unexpected pool errors during cleanup: ${JSON.stringify(poolErrors)}`);
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
}
