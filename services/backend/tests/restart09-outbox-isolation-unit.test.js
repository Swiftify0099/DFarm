import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { newDb } from 'pg-mem';

process.env.NODE_ENV = 'test';
delete process.env.REQUIRE_REAL_POSTGRES;
process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:59999/offline_test';
process.env.CENTRAL_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:59999/offline_test';
process.env.DATABASE_PROVISIONER_URL = 'postgresql://postgres:postgres@127.0.0.1:59999/offline_test';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'supabase/migrations');

function loadMigrationSql(filename) {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8');
}

function createOutboxMemDb(orgId) {
  const mem = newDb({ autoCreateForeignKeyIndices: true });
  mem.public.registerFunction({
    name: 'gen_random_uuid',
    returns: 'uuid',
    implementation: () => crypto.randomUUID(),
    impure: true,
  });

  mem.public.none(`
    CREATE TABLE organizations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(150) NOT NULL,
      code VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    );
    CREATE TABLE dairy_centers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      code VARCHAR(20) NOT NULL,
      name VARCHAR(150) NOT NULL
    );
    CREATE TABLE dashboard_events_outbox (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id VARCHAR(100) NOT NULL UNIQUE,
      event_type VARCHAR(50) NOT NULL,
      schema_version INT NOT NULL DEFAULT 1,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      center_id UUID REFERENCES dairy_centers(id) ON DELETE SET NULL,
      entity_id VARCHAR(100) NOT NULL,
      aggregate_version BIGINT NOT NULL DEFAULT 1,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      published_at TIMESTAMPTZ,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  mem.public.none(`
    INSERT INTO organizations (id, name, code, status)
    VALUES ('${orgId}', 'Dairy ${orgId.slice(0, 6)}', '${orgId.slice(0, 8)}', 'ACTIVE');
  `);

  const adapter = mem.adapters.createPg();
  const pool = new adapter.Pool();
  const queries = [];
  let txMutex = Promise.resolve();

  const acquireMutex = async () => {
    const prev = txMutex;
    let release;
    txMutex = new Promise((resolve) => {
      release = resolve;
    });
    await prev;
    return release;
  };

  const runMemQuery = async (exec, text, params = []) => {
    queries.push({ text, params });
    let sql = String(text || '');
    const args = Array.isArray(params) ? [...params] : [];

    if (/WITH\s+candidate_rows\s+AS\s*\(/i.test(sql) && /DELETE\s+FROM\s+dashboard_events_outbox/i.test(sql)) {
      const innerMatch = sql.match(/WITH\s+candidate_rows\s+AS\s*\(([\s\S]*?)\)\s*DELETE\s+FROM\s+dashboard_events_outbox/i);
      if (innerMatch && innerMatch[1]) {
        const selectSql = innerMatch[1].replace(/\s+FOR\s+UPDATE(?:\s+SKIP\s+LOCKED)?/gi, '');
        const candRes = await exec(selectSql, args);
        const ids = (candRes.rows || []).map((r) => r.id).filter(Boolean);
        if (ids.length === 0) {
          return { rows: [], rowCount: 0 };
        }
        const placeholders = ids.map((_, idx) => `$${idx + 2}`).join(', ');
        return exec(
          `DELETE FROM dashboard_events_outbox WHERE organization_id = $1 AND id IN (${placeholders}) RETURNING id;`,
          [args[0], ...ids]
        );
      }
    }

    if (/\bFOR\s+UPDATE\b/i.test(sql)) {
      sql = sql.replace(/\s+FOR\s+UPDATE(?:\s+SKIP\s+LOCKED)?/gi, '');
    }

    const anyMatch = sql.match(/(\bid\s*=\s*ANY\s*\(\s*\$(\d+)(?:::uuid\[\])?\s*\))/i);
    if (anyMatch && anyMatch[2]) {
      const paramIdx = Number(anyMatch[2]) - 1;
      const arr = args[paramIdx];
      if (Array.isArray(arr)) {
        if (arr.length === 0) {
          sql = sql.replace(anyMatch[1], '1 = 0');
        } else {
          const extraPlaceholders = arr.map((_, idx) => `$${args.length + idx + 1}`).join(', ');
          args.push(...arr);
          sql = sql.replace(anyMatch[1], `id IN (${extraPlaceholders})`);
        }
      }
    }

    return exec(sql, args);
  };

  const clientWrapper = {
    queries,
    async query(text, params = []) {
      const release = await acquireMutex();
      try {
        return await runMemQuery((s, p) => pool.query(s, p), text, params);
      } finally {
        release();
      }
    },
    async withTransaction(callback) {
      const release = await acquireMutex();
      const client = await pool.connect();
      client.__isPgMem = true;
      const origClientQuery = client.query.bind(client);
      client.query = async (text, params = []) => runMemQuery(origClientQuery, text, params);
      const backup = mem.backup();
      try {
        await origClientQuery('BEGIN');
        const res = await callback(client);
        await origClientQuery('COMMIT');
        return res;
      } catch (err) {
        await origClientQuery('ROLLBACK').catch(() => {});
        backup.restore();
        throw err;
      } finally {
        client.release();
        release();
      }
    },
    async close() {
      await pool.end();
    },
  };

  return { mem, pool, clientWrapper, queries };
}

function createControlPlaneFakeDb(tenants) {
  const controlQueries = [];
  return {
    controlQueries,
    async query(text, params = []) {
      controlQueries.push({ text, params });
      if (/FROM\s+dashboard_events_outbox/i.test(text) || /INTO\s+dashboard_events_outbox/i.test(text) || /UPDATE\s+dashboard_events_outbox/i.test(text)) {
        throw new Error(`FORBIDDEN_CONTROL_PLANE_OUTBOX_QUERY: ${text}`);
      }

      if (/SELECT\s+m\.dairy_id/i.test(text) && /dairy_database_mappings/i.test(text)) {
        const afterId = params.length === 3 ? params[1] : null;
        const limit = params.length === 3 ? Number(params[2]) : Number(params[1]);
        const activeRows = Array.from(tenants.values())
          .filter(
            (t) =>
              t.provisioningStatus === 'ACTIVE' &&
              t.organizationStatus === 'ACTIVE' &&
              t.dairyId !== '00000000-0000-0000-0000-000000000001' &&
              t.databaseName !== 'postgres' &&
              t.databaseName !== 'dfarm_control_plane' &&
              (!afterId || t.dairyId > afterId)
          )
          .sort((a, b) => a.dairyId.localeCompare(b.dairyId))
          .slice(0, limit)
          .map((t) => ({ dairy_id: t.dairyId }));
        return { rows: activeRows, rowCount: activeRows.length };
      }

      if (/FROM\s+dairy_database_mappings/i.test(text) && /WHERE\s+m\.dairy_id\s*=\s*\$1/i.test(text)) {
        const dairyId = params[0];
        const row = tenants.get(dairyId);
        if (!row) {
          return { rows: [], rowCount: 0 };
        }
        return {
          rows: [
            {
              id: row.dairyId,
              dairy_id: row.dairyId,
              dairy_code: row.dairyCode,
              database_name: row.databaseName,
              resource_type: 'PHYSICAL_DATABASE',
              connection_uri_encrypted: row.connectionUriEncrypted,
              schema_version: 'v1.0.0',
              provisioning_status: row.provisioningStatus,
              provisioning_error: row.provisioningError || null,
              organization_status: row.organizationStatus,
              provisioned_at: new Date(),
              last_verified_at: new Date(),
            },
          ],
          rowCount: 1,
        };
      }

      return { rows: [], rowCount: 0 };
    },
    async withTransaction(cb) {
      return cb({ query: this.query.bind(this) });
    },
  };
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
  const combined = chunks.join('');
  return combined
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

test('RESTART-09 Unit Suite: Tenant-Scoped Realtime Outbox, Cursors, Failure Propagation & Observability', async (t) => {
  const { db: centralPoolDb } = await import('../dist/infrastructure/database/PostgresPool.js');
  const {
    tenantDbManager,
    TenantDatabaseUnavailableError,
    PLATFORM_FEDERATION_DAIRY_ID,
  } = await import('../dist/infrastructure/database/TenantDatabaseManager.js');
  const {
    RealtimeEventPublisher,
    realtimePublisher,
  } = await import('../dist/infrastructure/realtime/RealtimeEventPublisher.js');
  const { PostgresCollectionTransactionRepository } = await import(
    '../dist/infrastructure/repositories/PostgresCollectionTransactionRepository.js'
  );
  const { MilkCollectionTransaction } = await import('../dist/domain/entities/MilkCollectionTransaction.js');
  const { KioskShiftSession } = await import('../dist/domain/entities/KioskShiftSession.js');

  await realtimePublisher.destroy();

  // Spy on central default PostgresPool.db to verify ZERO outbox queries ever touch centralPoolDb
  const origCentralQuery = centralPoolDb.query.bind(centralPoolDb);
  const centralOutboxQueries = [];
  centralPoolDb.query = async (text, params) => {
    const sql = String(text || '');
    if (sql.includes('dashboard_events_outbox')) {
      centralOutboxQueries.push(sql);
      throw new Error(`SPLIT_BRAIN_VIOLATION: Central default db queried dashboard_events_outbox: ${sql}`);
    }
    return origCentralQuery(text, params);
  };

  const origControlDb = tenantDbManager.getControlPlaneDb();
  const origGetStrictTenantDb = tenantDbManager.getStrictTenantDb.bind(tenantDbManager);
  const origGetAllTenantDbs = tenantDbManager.getAllTenantDbs.bind(tenantDbManager);

  const orgA = crypto.randomUUID();
  const orgB = crypto.randomUUID();
  const orgInactive = crypto.randomUUID();
  const orgDeprov = crypto.randomUUID();
  const orgUnmapped = crypto.randomUUID();
  const orgUnavailable = crypto.randomUUID();

  const dbA = createOutboxMemDb(orgA);
  const dbB = createOutboxMemDb(orgB);

  const centerA1 = crypto.randomUUID();
  const centerA2 = crypto.randomUUID();
  await dbA.clientWrapper.query(
    `INSERT INTO dairy_centers (id, organization_id, code, name) VALUES
     ($1, $3, 'C-A1', 'Center A1'),
     ($2, $3, 'C-A2', 'Center A2');`,
    [centerA1, centerA2, orgA]
  );

  const tenantRegistry = new Map([
    [
      orgA,
      {
        dairyId: orgA,
        dairyCode: 'DAIRY-A',
        databaseName: 'dfarm_tenant_a',
        provisioningStatus: 'ACTIVE',
        organizationStatus: 'ACTIVE',
        connectionUriEncrypted: 'enc-a',
      },
    ],
    [
      orgB,
      {
        dairyId: orgB,
        dairyCode: 'DAIRY-B',
        databaseName: 'dfarm_tenant_b',
        provisioningStatus: 'ACTIVE',
        organizationStatus: 'ACTIVE',
        connectionUriEncrypted: 'enc-b',
      },
    ],
    [
      orgInactive,
      {
        dairyId: orgInactive,
        dairyCode: 'DAIRY-INACT',
        databaseName: 'dfarm_tenant_inact',
        provisioningStatus: 'ACTIVE',
        organizationStatus: 'INACTIVE',
        connectionUriEncrypted: 'enc-inact',
      },
    ],
    [
      orgDeprov,
      {
        dairyId: orgDeprov,
        dairyCode: 'DAIRY-DEPROV',
        databaseName: 'dfarm_tenant_deprov',
        provisioningStatus: 'DEPROVISIONING',
        organizationStatus: 'ACTIVE',
        connectionUriEncrypted: 'enc-deprov',
      },
    ],
    [
      orgUnavailable,
      {
        dairyId: orgUnavailable,
        dairyCode: 'DAIRY-DOWN',
        databaseName: 'dfarm_tenant_down',
        provisioningStatus: 'ACTIVE',
        organizationStatus: 'ACTIVE',
        connectionUriEncrypted: 'enc-down',
      },
    ],
  ]);

  const fakeControlDb = createControlPlaneFakeDb(tenantRegistry);
  tenantDbManager.setControlPlaneDb(fakeControlDb);

  // Never allow getAllTenantDbs() to be called by RealtimeEventPublisher
  tenantDbManager.getAllTenantDbs = () => {
    throw new Error('FORBIDDEN_GET_ALL_TENANT_DBS_SCAN');
  };

  let strictDbCallLog = [];
  tenantDbManager.getStrictTenantDb = async (dairyId, options) => {
    strictDbCallLog.push({ dairyId, options });
    if (dairyId === PLATFORM_FEDERATION_DAIRY_ID || dairyId === 'platform' || dairyId === 'default') {
      if (options?.strictOperational) {
        throw new TenantDatabaseUnavailableError(
          dairyId,
          'CONTROL_PLANE_TARGET_FORBIDDEN',
          'Operational outbox cannot target control plane'
        );
      }
      return fakeControlDb;
    }
    const mapping = tenantRegistry.get(dairyId);
    if (!mapping) {
      throw new TenantDatabaseUnavailableError(dairyId, 'UNMAPPED', 'Tenant unmapped');
    }
    if (mapping.organizationStatus !== 'ACTIVE') {
      throw new TenantDatabaseUnavailableError(dairyId, 'ORGANIZATION_INACTIVE', 'Organization inactive');
    }
    if (mapping.provisioningStatus !== 'ACTIVE') {
      throw new TenantDatabaseUnavailableError(dairyId, mapping.provisioningStatus, 'Not active');
    }
    if (dairyId === orgA) return dbA.clientWrapper;
    if (dairyId === orgB) return dbB.clientWrapper;
    if (dairyId === orgUnavailable) {
      throw new TenantDatabaseUnavailableError(orgUnavailable, 'CONNECTION_FAILED', 'Simulated PG connection timeout');
    }
    throw new TenantDatabaseUnavailableError(dairyId, 'UNMAPPED', 'Unknown tenant');
  };

  try {
    await t.test('1. Pending worker & dispatch isolation: processes Tenant A and Tenant B in own DBs without central queries or getAllTenantDbs', async () => {
      const publisher = new RealtimeEventPublisher();
      const sseA = createFakeSseRes();
      const sseB = createFakeSseRes();

      try {
        publisher.registerClient({ organizationId: orgA, res: sseA.res });
        publisher.registerClient({ organizationId: orgB, res: sseB.res });

        await dbA.clientWrapper.withTransaction(async (tx) => {
          await publisher.publishWithTransaction(tx, {
            eventId: 'EVT-A-1',
            eventType: 'COLLECTION_ACCEPTED',
            organizationId: orgA,
            centerId: centerA1,
            entityId: crypto.randomUUID(),
            payload: { amount: 420, mobileNumber: '9876543210', bankAccountNumber: '123456789' },
          });
        });

        await dbB.clientWrapper.withTransaction(async (tx) => {
          await publisher.publishWithTransaction(tx, {
            eventId: 'EVT-B-1',
            eventType: 'COLLECTION_ACCEPTED',
            organizationId: orgB,
            entityId: crypto.randomUUID(),
            payload: { amount: 999, ifscCode: 'UBIN0123456' },
          });
        });

        // Temporary unavailability of orgUnavailable must be recorded without halting orgA or orgB!
        const summary = await publisher.processOutboxBatchDetailed();
        assert.strictEqual(summary.controlPlaneDiscoveryFailed, false);
        assert.strictEqual(summary.tenantsAttempted, 3, 'Should attempt ACTIVE orgA, orgB, orgUnavailable only (skip INACTIVE & DEPROVISIONING)');
        assert.strictEqual(summary.tenantsSucceeded, 2);
        assert.strictEqual(summary.tenantsFailed, 1);
        assert.strictEqual(summary.pendingProcessed, 2);
        assert.strictEqual(summary.failures[0].organizationId, orgUnavailable);
        assert.strictEqual(summary.failures[0].errorCategory, 'TRANSIENT_UNAVAILABLE');

        const framesA = parseSseFrames(sseA.frames).filter((f) => f.event !== 'CONNECTED');
        const framesB = parseSseFrames(sseB.frames).filter((f) => f.event !== 'CONNECTED');
        assert.strictEqual(framesA.length, 1);
        assert.strictEqual(framesA[0].id, 'EVT-A-1');
        assert.strictEqual(framesA[0].data.payload.mobileNumber, undefined, 'PII must remain redacted');
        assert.strictEqual(framesA[0].data.payload.bankAccountNumber, undefined);

        assert.strictEqual(framesB.length, 1);
        assert.strictEqual(framesB[0].id, 'EVT-B-1');
        assert.strictEqual(framesB[0].data.payload.ifscCode, undefined);

        const statusA = await dbA.clientWrapper.query(`SELECT status, published_at FROM dashboard_events_outbox WHERE event_id = 'EVT-A-1';`);
        assert.strictEqual(statusA.rows[0].status, 'PUBLISHED');
        assert.ok(statusA.rows[0].published_at);

        assert.strictEqual(centralOutboxQueries.length, 0);
      } finally {
        await publisher.destroy();
      }
    });

    await t.test('2. Last-Event-ID durable DB replay tie-breaks equal created_at timestamps, filters center, and rejects foreign tenant cursors', async () => {
      const publisher = new RealtimeEventPublisher();
      try {
        const sameTs = new Date(Date.now() + 60_000);
        const id1 = '00000000-0000-0000-0000-000000000010';
        const id2 = '00000000-0000-0000-0000-000000000020';
        const id3 = '00000000-0000-0000-0000-000000000030';

        await dbA.clientWrapper.query(
          `INSERT INTO dashboard_events_outbox
            (id, event_id, event_type, organization_id, center_id, entity_id, status, published_at, created_at, payload)
           VALUES
            ($1, 'EVT-REPLAY-1', 'COLLECTION_ACCEPTED', $4, $5, 'e1', 'PUBLISHED', $7, $7, '{"seq":1}'::jsonb),
            ($2, 'EVT-REPLAY-2', 'COLLECTION_ACCEPTED', $4, $6, 'e2', 'PUBLISHED', $7, $7, '{"seq":2}'::jsonb),
            ($3, 'EVT-REPLAY-3', 'COLLECTION_ACCEPTED', $4, $5, 'e3', 'PUBLISHED', $7, $7, '{"seq":3,"token":"secret-tok"}'::jsonb);`,
          [id1, id2, id3, orgA, centerA1, centerA2, sameTs]
        );

        // Client filtered to centerA1 reconnecting after EVT-REPLAY-1 should skip centerA2's EVT-REPLAY-2
        // and MUST still replay EVT-REPLAY-3 even though all 3 share exact identical created_at!
        const sseFiltered = createFakeSseRes();
        publisher.registerClient({
          organizationId: orgA,
          centerId: centerA1,
          res: sseFiltered.res,
          lastEventId: 'EVT-REPLAY-1',
        });

        await new Promise((r) => setTimeout(r, 80));
        const filteredFrames = parseSseFrames(sseFiltered.frames).filter((f) => f.event !== 'CONNECTED');
        assert.strictEqual(filteredFrames.length, 1);
        assert.strictEqual(filteredFrames[0].id, 'EVT-REPLAY-3');
        assert.strictEqual(filteredFrames[0].data.payload.token, undefined, 'Replay must sanitize payload secrets');

        // Client for Tenant A supplying Tenant B's Last-Event-ID must get RESYNC_REQUIRED, never Tenant B's event
        const sseCrossTenant = createFakeSseRes();
        publisher.registerClient({
          organizationId: orgA,
          res: sseCrossTenant.res,
          lastEventId: 'EVT-B-1',
        });
        await new Promise((r) => setTimeout(r, 80));
        const crossFrames = parseSseFrames(sseCrossTenant.frames).filter((f) => f.event !== 'CONNECTED');
        assert.strictEqual(crossFrames.length, 1);
        assert.strictEqual(crossFrames[0].event, 'RESYNC_REQUIRED');
        assert.strictEqual(crossFrames[0].data.reason, 'CURSOR_EXPIRED');
      } finally {
        await publisher.destroy();
      }
    });

    await t.test('3. Cross-instance per-tenant cursor isolation: Tenant A future timestamp never skips Tenant B older event', async () => {
      const publisher1 = new RealtimeEventPublisher();
      const publisher2 = new RealtimeEventPublisher();
      const sseA2 = createFakeSseRes();
      const sseB2 = createFakeSseRes();

      try {
        // Publisher 2 has active clients for BOTH orgA and orgB
        publisher2.registerClient({ organizationId: orgA, res: sseA2.res });
        publisher2.registerClient({ organizationId: orgB, res: sseB2.res });

        // Simulate Tenant A receiving an event published at NOW + 10 minutes
        const futureTs = new Date(Date.now() + 10 * 60 * 1000);
        await dbA.clientWrapper.query(
          `INSERT INTO dashboard_events_outbox
            (event_id, event_type, organization_id, entity_id, status, published_at, created_at, payload)
           VALUES ('EVT-A-FUTURE', 'SESSION_OPENED', $1, 'sess-a-future', 'PUBLISHED', $2, $2, '{"sessionCode":"S-FUTURE"}'::jsonb);`,
          [orgA, futureTs]
        );

        // Tenant B publishes two events sharing exact same timestamp 10 seconds ago (behind Tenant A cursor!)
        const pastTs = new Date(Date.now() - 10 * 1000);
        await dbB.clientWrapper.query(
          `INSERT INTO dashboard_events_outbox
            (id, event_id, event_type, organization_id, entity_id, status, published_at, created_at, payload)
           VALUES
            ('00000000-0000-0000-0000-000000000101', 'EVT-B-SYNC-1', 'SESSION_OPENED', $1, 'sess-b1', 'PUBLISHED', $2, $2, '{"n":1}'::jsonb),
            ('00000000-0000-0000-0000-000000000102', 'EVT-B-SYNC-2', 'SESSION_CLOSED', $1, 'sess-b2', 'PUBLISHED', $2, $2, '{"n":2}'::jsonb);`,
          [orgB, pastTs]
        );

        await publisher2.processOutboxBatchDetailed();

        const aEvents = parseSseFrames(sseA2.frames).filter((f) => f.event !== 'CONNECTED');
        const bEvents = parseSseFrames(sseB2.frames).filter((f) => f.event !== 'CONNECTED');
        assert.ok(aEvents.some((e) => e.id === 'EVT-A-FUTURE'));
        assert.ok(bEvents.some((e) => e.id === 'EVT-B-SYNC-1'), 'Tenant B older event must not be masked by Tenant A cursor');
        assert.ok(bEvents.some((e) => e.id === 'EVT-B-SYNC-2'), 'Same published_at tie-breaker must deliver second event');

        // Re-running must not duplicate delivery
        const secondSummary = await publisher2.processOutboxBatchDetailed();
        assert.strictEqual(secondSummary.crossInstanceDispatched, 0);
      } finally {
        await publisher1.destroy();
        await publisher2.destroy();
      }
    });

    await t.test('4. Worker dispatch failure before UPDATE rolls back cleanly, stays PENDING, and succeeds on next worker tick', async () => {
      const publisher = new RealtimeEventPublisher();
      const sseA = createFakeSseRes();
      try {
        publisher.registerClient({ organizationId: orgA, res: sseA.res });
        await dbA.clientWrapper.withTransaction(async (tx) => {
          await publisher.publishWithTransaction(tx, {
            eventId: 'EVT-A-FAIL-ONCE',
            eventType: 'DEVICE_BLOCKED',
            organizationId: orgA,
            entityId: 'dev-1',
            payload: { stationCode: 'ST-01' },
          });
        });

        const origDispatch = publisher.dispatchToClients.bind(publisher);
        publisher.dispatchToClients = () => {
          throw new Error('SIMULATED_DISPATCH_CRASH');
        };

        const failedRun = await publisher.processTenantOutboxBatch(orgA);
        assert.strictEqual(failedRun.ok, false);
        assert.strictEqual(failedRun.errorCategory, 'EXECUTION_ERROR');

        // Row MUST still be PENDING after rollback!
        const rowBeforeRecovery = await dbA.clientWrapper.query(
          `SELECT status, published_at FROM dashboard_events_outbox WHERE event_id = 'EVT-A-FAIL-ONCE';`
        );
        assert.strictEqual(rowBeforeRecovery.rows[0].status, 'PENDING');
        assert.strictEqual(rowBeforeRecovery.rows[0].published_at, null);

        // Restore dispatcher and re-run -> now delivers and marks PUBLISHED
        publisher.dispatchToClients = origDispatch;
        const recoveryRun = await publisher.processTenantOutboxBatch(orgA);
        assert.strictEqual(recoveryRun.ok, true);
        assert.strictEqual(recoveryRun.pendingProcessed, 1);

        const rowAfterRecovery = await dbA.clientWrapper.query(
          `SELECT status, published_at FROM dashboard_events_outbox WHERE event_id = 'EVT-A-FAIL-ONCE';`
        );
        assert.strictEqual(rowAfterRecovery.rows[0].status, 'PUBLISHED');
        assert.ok(rowAfterRecovery.rows[0].published_at);
      } finally {
        await publisher.destroy();
      }
    });

    await t.test('5. Direct persistence preserves original transactional payload on conflict & surfaces failures visibly', async () => {
      const publisher = new RealtimeEventPublisher();
      try {
        await dbA.clientWrapper.withTransaction(async (tx) => {
          await publisher.publishWithTransaction(tx, {
            eventId: 'EVT-CONFLICT-1',
            eventType: 'COLLECTION_ACCEPTED',
            organizationId: orgA,
            entityId: 'coll-1',
            payload: { canonicalAmount: 555, origin: 'transactional' },
          });
        });

        await publisher.persistOutboxEvent({
          eventId: 'EVT-CONFLICT-1',
          eventType: 'COLLECTION_SYNCED',
          schemaVersion: 1,
          organizationId: orgA,
          entityId: 'coll-1-changed',
          aggregateVersion: 99,
          occurredAt: new Date().toISOString(),
          publishedAt: new Date().toISOString(),
          payload: { canonicalAmount: 0, origin: 'overwrite-attempt' },
        });

        const persisted = await dbA.clientWrapper.query(
          `SELECT event_type, entity_id, status, payload FROM dashboard_events_outbox WHERE event_id = 'EVT-CONFLICT-1';`
        );
        assert.strictEqual(persisted.rows[0].status, 'PUBLISHED');
        assert.strictEqual(persisted.rows[0].event_type, 'COLLECTION_ACCEPTED', 'Original event_type must be preserved');
        assert.strictEqual(persisted.rows[0].entity_id, 'coll-1', 'Original entity_id must be preserved');
        assert.strictEqual(persisted.rows[0].payload.origin, 'transactional', 'Original payload must be preserved');

        // Persistence for unmapped / platform / deprovisioning / unavailable org must fail visibly
        await assert.rejects(
          () =>
            publisher.persistOutboxEvent({
              eventId: 'EVT-UNMAPPED-1',
              eventType: 'STATION_HEARTBEAT',
              schemaVersion: 1,
              organizationId: orgUnmapped,
              entityId: 'st-x',
              aggregateVersion: 1,
              occurredAt: new Date().toISOString(),
              publishedAt: new Date().toISOString(),
              payload: {},
            }),
          (err) => err instanceof TenantDatabaseUnavailableError && err.status === 'UNMAPPED'
        );

        await assert.rejects(
          () =>
            publisher.persistOutboxEvent({
              eventId: 'EVT-PLAT-1',
              eventType: 'STATION_HEARTBEAT',
              schemaVersion: 1,
              organizationId: PLATFORM_FEDERATION_DAIRY_ID,
              entityId: 'st-p',
              aggregateVersion: 1,
              occurredAt: new Date().toISOString(),
              publishedAt: new Date().toISOString(),
              payload: {},
            }),
          (err) => err instanceof TenantDatabaseUnavailableError && err.status === 'INVALID_ORGANIZATION'
        );

        const obs = publisher.getObservabilitySnapshot();
        assert.ok(obs.totalPersistenceFailures >= 2);
      } finally {
        await publisher.destroy();
      }
    });

    await t.test('6. Retention cleanup deletes only expired PUBLISHED events per tenant and preserves PENDING/FAILED', async () => {
      const publisher = new RealtimeEventPublisher();
      try {
        const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
        const recentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

        await dbA.clientWrapper.query(
          `INSERT INTO dashboard_events_outbox
            (event_id, event_type, organization_id, entity_id, status, published_at, created_at, payload)
           VALUES
            ('EVT-OLD-PUB-A', 'STATION_HEARTBEAT', $1, 's1', 'PUBLISHED', $3, $3, '{}'::jsonb),
            ('EVT-RECENT-PUB-A', 'STATION_HEARTBEAT', $1, 's2', 'PUBLISHED', $4, $4, '{}'::jsonb),
            ('EVT-OLD-PENDING-A', 'COLLECTION_ACCEPTED', $1, 's3', 'PENDING', NULL, $3, '{}'::jsonb),
            ('EVT-OLD-FAILED-A', 'COLLECTION_ACCEPTED', $1, 's4', 'FAILED', $3, $3, '{}'::jsonb);`,
          [orgA, orgB, oldDate, recentDate]
        );

        await dbB.clientWrapper.query(
          `INSERT INTO dashboard_events_outbox
            (event_id, event_type, organization_id, entity_id, status, published_at, created_at, payload)
           VALUES
            ('EVT-OLD-PUB-B', 'STATION_HEARTBEAT', $1, 'sb1', 'PUBLISHED', $2, $2, '{}'::jsonb);`,
          [orgB, oldDate]
        );

        const purgeSummary = await publisher.purgeOldOutboxEventsDetailed(7, 500);
        assert.strictEqual(purgeSummary.totalPurged, 2);
        assert.strictEqual(purgeSummary.tenantsSucceeded, 2);
        assert.strictEqual(purgeSummary.tenantsFailed, 1);

        const remA = await dbA.clientWrapper.query(
          `SELECT event_id FROM dashboard_events_outbox WHERE event_id IN ('EVT-OLD-PUB-A','EVT-RECENT-PUB-A','EVT-OLD-PENDING-A','EVT-OLD-FAILED-A');`
        );
        const idsA = remA.rows.map((r) => r.event_id).sort();
        assert.deepEqual(idsA, ['EVT-OLD-FAILED-A', 'EVT-OLD-PENDING-A', 'EVT-RECENT-PUB-A']);

        const remB = await dbB.clientWrapper.query(
          `SELECT event_id FROM dashboard_events_outbox WHERE event_id = 'EVT-OLD-PUB-B';`
        );
        assert.strictEqual(remB.rows.length, 0);
      } finally {
        await publisher.destroy();
      }
    });

    await t.test('7. PostgresCollectionTransactionRepository.saveAtomicIntake propagates outbox write failures (no silent catch)', async () => {
      // Load full migration SQL up to 046 in a clean pg-mem tenant DB, then DROP dashboard_events_outbox to prove
      // saveAtomicIntake fails and rolls back collections/ledger instead of silently swallowing outbox loss!
      const brokenOutboxDb = createOutboxMemDb(orgA);
      // Add minimal operational tables that saveAtomicIntake touches BEFORE outbox insert (step 12)
      brokenOutboxDb.mem.public.none(`
        CREATE TABLE users (
          id UUID PRIMARY KEY,
          organization_id UUID NOT NULL,
          full_name VARCHAR(150) NOT NULL,
          role VARCHAR(30) NOT NULL,
          status VARCHAR(20) NOT NULL
        );
        CREATE TABLE collection_shifts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          center_id UUID NOT NULL,
          shift_type VARCHAR(10) NOT NULL,
          start_time TIME NOT NULL,
          end_time TIME NOT NULL,
          grace_period_minutes INT NOT NULL DEFAULT 30,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          UNIQUE (center_id, shift_type)
        );
        CREATE TABLE customers (
          id UUID PRIMARY KEY,
          organization_id UUID NOT NULL,
          primary_center_id UUID NOT NULL,
          farmer_code VARCHAR(30) NOT NULL,
          full_name VARCHAR(150) NOT NULL,
          status VARCHAR(30) NOT NULL,
          is_deleted BOOLEAN NOT NULL DEFAULT FALSE
        );
        CREATE TABLE customer_ledger_accounts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          customer_id UUID NOT NULL UNIQUE,
          organization_id UUID NOT NULL,
          current_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
          last_transaction_at TIMESTAMPTZ
        );
        CREATE TABLE collection_sessions (
          id UUID PRIMARY KEY,
          center_id UUID NOT NULL,
          customer_id UUID NOT NULL,
          business_date DATE NOT NULL,
          shift_id UUID NOT NULL,
          shift_type VARCHAR(10) NOT NULL,
          selected_milk_category VARCHAR(20) NOT NULL,
          identification_method VARCHAR(30) NOT NULL,
          session_state VARCHAR(20) NOT NULL,
          intake_sequence_uuid UUID NOT NULL,
          operator_id UUID NOT NULL,
          device_id VARCHAR(100) NOT NULL
        );
        CREATE TABLE kiosk_shift_sessions (
          id UUID PRIMARY KEY,
          session_code VARCHAR(50) NOT NULL,
          organization_id UUID NOT NULL,
          center_id UUID NOT NULL,
          business_date DATE NOT NULL,
          shift VARCHAR(20) NOT NULL,
          status VARCHAR(20) NOT NULL,
          opened_at TIMESTAMPTZ NOT NULL,
          opening_operator_id UUID NOT NULL,
          opening_operator_name VARCHAR(150) NOT NULL,
          device_identifier VARCHAR(100) NOT NULL,
          device_name VARCHAR(100) NOT NULL,
          total_liters NUMERIC(12,2) NOT NULL DEFAULT 0,
          cow_liters NUMERIC(12,2) NOT NULL DEFAULT 0,
          buffalo_liters NUMERIC(12,2) NOT NULL DEFAULT 0,
          transaction_count INT NOT NULL DEFAULT 0,
          total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
          average_fat NUMERIC(5,2) NOT NULL DEFAULT 0,
          average_snf NUMERIC(5,2) NOT NULL DEFAULT 0
        );
        CREATE TABLE rate_charts (
          id UUID PRIMARY KEY,
          organization_id UUID NOT NULL,
          milk_category VARCHAR(20) NOT NULL,
          is_active BOOLEAN NOT NULL
        );
        CREATE TABLE rate_chart_versions (
          id UUID PRIMARY KEY,
          rate_chart_id UUID NOT NULL,
          version_number INT NOT NULL,
          effective_from TIMESTAMPTZ NOT NULL,
          is_approved BOOLEAN NOT NULL
        );
        CREATE TABLE milk_collections (
          id UUID PRIMARY KEY,
          organization_id UUID NOT NULL,
          session_id UUID NOT NULL,
          kiosk_session_id UUID,
          center_id UUID NOT NULL,
          customer_id UUID NOT NULL,
          business_date DATE NOT NULL,
          shift_type VARCHAR(10) NOT NULL,
          milk_category VARCHAR(20) NOT NULL,
          net_weight NUMERIC(6,2) NOT NULL,
          measurement_unit VARCHAR(10) NOT NULL,
          fat_percentage NUMERIC(3,1) NOT NULL,
          snf_percentage NUMERIC(3,1) NOT NULL,
          rate_chart_version_id UUID NOT NULL,
          applied_rate_per_unit NUMERIC(6,2) NOT NULL,
          total_amount NUMERIC(10,2) NOT NULL,
          transaction_status VARCHAR(50) NOT NULL,
          client_intake_uuid UUID NOT NULL,
          idempotency_key VARCHAR(128) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE ledger_transactions (
          id UUID PRIMARY KEY,
          organization_id UUID NOT NULL,
          center_id UUID NOT NULL,
          customer_id UUID NOT NULL,
          transaction_type VARCHAR(40) NOT NULL,
          direction VARCHAR(10) NOT NULL,
          amount NUMERIC(10,2) NOT NULL,
          balance_after NUMERIC(12,2) NOT NULL,
          reference_entity VARCHAR(30) NOT NULL,
          reference_id UUID NOT NULL,
          description TEXT,
          idempotency_key VARCHAR(128) NOT NULL,
          created_by UUID NOT NULL
        );
        CREATE TABLE ledger_entries (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          transaction_id UUID NOT NULL,
          account_id UUID NOT NULL,
          account_type VARCHAR(30) NOT NULL,
          entry_type VARCHAR(10) NOT NULL,
          amount NUMERIC(10,2) NOT NULL
        );
      `);
      // Drop outbox table intentionally so step 12 fails!
      brokenOutboxDb.mem.public.none(`DROP TABLE dashboard_events_outbox;`);

      const cId = crypto.randomUUID();
      const opId = crypto.randomUUID();
      const custId = crypto.randomUUID();
      const kioskSessId = crypto.randomUUID();
      const rcId = crypto.randomUUID();
      const rcvId = crypto.randomUUID();

      await brokenOutboxDb.clientWrapper.query(
        `INSERT INTO dairy_centers (id, organization_id, code, name) VALUES ($1, $2, 'C-BRK', 'Broken Outbox Center');`,
        [cId, orgA]
      );
      await brokenOutboxDb.clientWrapper.query(
        `INSERT INTO users (id, organization_id, full_name, role, status) VALUES ($1, $2, 'Op', 'COLLECTION_OPERATOR', 'ACTIVE');`,
        [opId, orgA]
      );
      await brokenOutboxDb.clientWrapper.query(
        `INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, status) VALUES ($1, $2, $3, 'F-001', 'Farmer One', 'ACTIVE');`,
        [custId, orgA, cId]
      );
      await brokenOutboxDb.clientWrapper.query(
        `INSERT INTO customer_ledger_accounts (customer_id, organization_id, current_balance) VALUES ($1, $2, 100.00);`,
        [custId, orgA]
      );
      await brokenOutboxDb.clientWrapper.query(
        `INSERT INTO kiosk_shift_sessions (id, session_code, organization_id, center_id, business_date, shift, status, opened_at, opening_operator_id, opening_operator_name, device_identifier, device_name) VALUES ($1, 'S-01', $2, $3, '2026-11-28', 'MORNING', 'OPEN', NOW(), $4, 'Op', 'DEV-1', 'Kiosk 1');`,
        [kioskSessId, orgA, cId, opId]
      );
      await brokenOutboxDb.clientWrapper.query(
        `INSERT INTO rate_charts (id, organization_id, milk_category, is_active) VALUES ($1, $2, 'COW', TRUE);`,
        [rcId, orgA]
      );
      await brokenOutboxDb.clientWrapper.query(
        `INSERT INTO rate_chart_versions (id, rate_chart_id, version_number, effective_from, is_approved) VALUES ($1, $2, 1, NOW(), TRUE);`,
        [rcvId, rcId]
      );

      const prevStrict = tenantDbManager.getStrictTenantDb;
      tenantDbManager.getStrictTenantDb = async (dairyId) => {
        if (dairyId === orgA) return brokenOutboxDb.clientWrapper;
        throw new TenantDatabaseUnavailableError(dairyId, 'UNMAPPED', 'Unexpected');
      };

      try {
        const repo = new PostgresCollectionTransactionRepository();
        const txn = new MilkCollectionTransaction({
          id: crypto.randomUUID(),
          transactionCode: 'TXN-FAILOUT',
          sessionId: kioskSessId,
          dairyId: orgA,
          centerId: cId,
          customerId: custId,
          customerCode: 'F-001',
          customerName: 'Farmer One',
          timestamp: new Date().toISOString(),
          date: '2026-11-28',
          shift: 'MORNING',
          milkCategory: 'COW',
          weightLiters: 10,
          fatPercentage: 4.5,
          snfPercentage: 8.5,
          clrDensity: 28,
          appliedRatePerLiter: 42,
          rateChartVersion: 1,
          totalAmount: 420,
          identificationMethod: 'MANUAL_SEARCH',
          syncStatus: 'SYNCED_CLOUD',
          deviceId: 'DEV-1',
          operatorName: 'Op',
          idempotencyKey: 'idem-fail-outbox-1',
        });
        const session = new KioskShiftSession({
          id: kioskSessId,
          sessionCode: 'S-01',
          organizationId: orgA,
          centerId: cId,
          businessDate: '2026-11-28',
          shift: 'MORNING',
          status: 'OPEN',
          openedAt: new Date().toISOString(),
          openingOperatorId: opId,
          openingOperatorName: 'Op',
          deviceIdentifier: 'DEV-1',
          deviceName: 'Kiosk 1',
        });

        await assert.rejects(
          () =>
            repo.saveAtomicIntake({
              transaction: txn,
              session,
              totalAmount: 420,
              weightLiters: 10,
              fatPercentage: 4.5,
              snfPercentage: 8.5,
              milkCategory: 'COW',
              customerId: custId,
              organizationId: orgA,
              centerId: cId,
              operatorId: opId,
              operatorName: 'Op',
              appliedRate: 42,
            }),
          /Tenant collection database query failed|dashboard_events_outbox/i
        );

        // Verify rollback left zero partial collection or ledger rows!
        const collRes = await brokenOutboxDb.clientWrapper.query('SELECT COUNT(*)::int AS cnt FROM milk_collections;');
        const ledgerRes = await brokenOutboxDb.clientWrapper.query('SELECT COUNT(*)::int AS cnt FROM ledger_transactions;');
        const acctRes = await brokenOutboxDb.clientWrapper.query('SELECT current_balance AS bal FROM customer_ledger_accounts WHERE customer_id = $1;', [custId]);
        assert.strictEqual(collRes.rows[0].cnt, 0);
        assert.strictEqual(ledgerRes.rows[0].cnt, 0);
        assert.strictEqual(Number(acctRes.rows[0].bal), 100);
      } finally {
        tenantDbManager.getStrictTenantDb = prevStrict;
        await brokenOutboxDb.clientWrapper.close();
      }
    });
  } finally {
    await dbA.clientWrapper.close().catch(() => {});
    await dbB.clientWrapper.close().catch(() => {});
    tenantDbManager.setControlPlaneDb(origControlDb);
    tenantDbManager.getStrictTenantDb = origGetStrictTenantDb;
    tenantDbManager.getAllTenantDbs = origGetAllTenantDbs;
    centralPoolDb.query = origCentralQuery;
    // Also clean up migrations directory helper unused warning prevention
    assert.ok(loadMigrationSql('041_dairy_admin_realtime_and_station_monitoring.sql').includes('dashboard_events_outbox'));
  }
});
