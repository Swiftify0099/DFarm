import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPoolShutdownManager } from './helpers/pool-lifecycle-helpers.js';

// Always force isolated offline test mode for this unit suite even if run in a
// workflow environment where TEST_POSTGRES_URL or REQUIRE_REAL_POSTGRES is set.
process.env.NODE_ENV = 'test';
delete process.env.TEST_POSTGRES_URL;
delete process.env.TEST_REAL_POSTGRES;
delete process.env.REQUIRE_REAL_POSTGRES;
process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:59999/offline_test';
process.env.CENTRAL_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:59999/offline_test';
process.env.DATABASE_PROVISIONER_URL = 'postgresql://postgres:postgres@127.0.0.1:59999/offline_test';
process.env.TENANT_POOL_CONNECTION_TIMEOUT_MS = '500';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { PostgresDatabase } = await import('../dist/infrastructure/database/PostgresPool.js');
const { TenantDatabaseManager, TenantDatabaseUnavailableError } = await import('../dist/infrastructure/database/TenantDatabaseManager.js');
const { MigrationRunner } = await import('../dist/infrastructure/database/MigrationRunner.js');
const { CredentialEncryption } = await import('../dist/infrastructure/security/CredentialEncryption.js');

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

class FakePool extends EventEmitter {
  constructor({
    delayMs = 20,
    endError = null,
    externalEnding = false,
    totalCount = 0,
    endGate = null,
    suppressRemoveEvents = false,
    resetEndingOnError = false,
    failFirstEndWith = null,
  } = {}) {
    super();
    this.delayMs = delayMs;
    this.endError = endError;
    this.ending = externalEnding;
    this.ended = false;
    this.endCallCount = 0;
    this.totalCount = totalCount;
    this.idleCount = totalCount;
    this.waitingCount = 0;
    this.endGate = endGate;
    this.suppressRemoveEvents = suppressRemoveEvents;
    this.resetEndingOnError = resetEndingOnError;
    this.failFirstEndWith = failFirstEndWith;
    this.queryCalls = [];
  }

  async query(sql, params) {
    this.queryCalls.push({ sql, params });
    return { rows: [{ ok: 1 }], rowCount: 1 };
  }

  async connect() {
    return {
      query: async (sql, params) => this.query(sql, params),
      release: () => {},
    };
  }

  async end() {
    this.endCallCount += 1;
    if (this.ending) {
      throw new Error('Called end on pool more than once');
    }
    this.ending = true;
    if (this.endGate) {
      await this.endGate.promise;
    } else if (this.delayMs > 0) {
      await new Promise((r) => setTimeout(r, this.delayMs));
    }
    if (this.failFirstEndWith && this.endCallCount === 1) {
      if (this.resetEndingOnError) {
        this.ending = false;
      }
      throw this.failFirstEndWith;
    }
    if (this.endError) {
      if (this.resetEndingOnError) {
        this.ending = false;
      }
      throw this.endError;
    }
    if (!this.suppressRemoveEvents) {
      for (let i = 0; i < this.totalCount; i += 1) {
        this.emit('remove', {});
      }
    }
    this.totalCount = 0;
    this.idleCount = 0;
    this.ended = true;
  }
}

function makeFreshTenantManager() {
  const mgr = Object.create(TenantDatabaseManager.prototype);
  mgr.tenantPools = new Map();
  mgr.tenantMappings = new Map();
  mgr.tenantMemDbs = new Map();
  mgr.controlPlaneDb = null;
  mgr.isInitialized = false;
  mgr.poolShutdownPromises = new WeakMap();
  mgr.closingTenantPools = new Map();
  mgr.deprovisioningTenants = new Map();
  mgr.inFlightAcquisitionsByDairy = new Map();
  mgr.closingAllPoolsPromise = null;
  return mgr;
}

function makeFakePostgresDb(fakePool) {
  const instance = Object.create(PostgresDatabase.prototype);
  instance.pool = fakePool;
  instance.memDbAdapter = null;
  instance.isPostgresConnected = null;
  instance.closePromise = null;
  return instance;
}

function makeActiveMapping(dairyId, dairyCode = 'TEST') {
  const encrypted = CredentialEncryption.encrypt(`postgresql://postgres:postgres@127.0.0.1:59999/dfarm_${dairyCode.toLowerCase()}`);
  return {
    id: crypto.randomUUID(),
    dairyId,
    dairyCode,
    databaseName: `dfarm_${dairyCode.toLowerCase()}`,
    resourceType: 'PHYSICAL_DATABASE',
    connectionUriEncrypted: encrypted,
    schemaVersion: 'v1.0.0',
    provisioningStatus: 'ACTIVE',
    lastVerifiedAt: new Date().toISOString(),
  };
}

function makeMappingRow(mapping) {
  return {
    id: mapping.id,
    dairy_id: mapping.dairyId,
    dairy_code: mapping.dairyCode,
    database_name: mapping.databaseName,
    resource_type: mapping.resourceType,
    connection_uri_encrypted: mapping.connectionUriEncrypted,
    schema_version: mapping.schemaVersion,
    provisioning_status: mapping.provisioningStatus,
    provisioning_error: mapping.provisioningError || null,
    provisioned_at: new Date().toISOString(),
    last_verified_at: new Date().toISOString(),
  };
}

test('RESTART-03.8 Pool & Shutdown Lifecycle Regression Suite', async (suite) => {
  await suite.test('1. PostgresDatabase.close(): concurrent callers await single in-flight shutdown and end() runs once', async () => {
    const endGate = createDeferred();
    const fakePool = new FakePool({ endGate });
    const dbInst = makeFakePostgresDb(fakePool);

    let firstDone = false;
    let secondDone = false;
    const p1 = dbInst.close().then(() => {
      firstDone = true;
    });
    const p2 = dbInst.close().then(() => {
      secondDone = true;
    });

    await flushMicrotasks();
    assert.strictEqual(firstDone, false);
    assert.strictEqual(secondDone, false);

    endGate.resolve();
    await Promise.all([p1, p2]);
    assert.strictEqual(fakePool.endCallCount, 1);
    assert.strictEqual(fakePool.ended, true);

    await dbInst.close();
    assert.strictEqual(fakePool.endCallCount, 1);
  });

  await suite.test('2. PostgresDatabase.close(): rejected close promise remains observable to concurrent & later callers', async () => {
    const expectedErr = new Error('Simulated central pool shutdown failure');
    const fakePool = new FakePool({ delayMs: 5, endError: expectedErr });
    const dbInst = makeFakePostgresDb(fakePool);

    const [r1, r2] = await Promise.allSettled([dbInst.close(), dbInst.close()]);
    assert.strictEqual(r1.status, 'rejected');
    assert.strictEqual(r2.status, 'rejected');
    assert.strictEqual(r1.reason, expectedErr);
    assert.strictEqual(r2.reason, expectedErr);

    await assert.rejects(() => dbInst.close(), (err) => err === expectedErr);
  });

  await suite.test('3. PostgresDatabase.close(): does not report complete while independently started pool.ending is in progress', async () => {
    const fakePool = new FakePool({ externalEnding: true });
    const dbInst = makeFakePostgresDb(fakePool);

    let resolvedEarly = false;
    const closePromise = dbInst.close().then(() => {
      resolvedEarly = true;
    });

    await new Promise((r) => setTimeout(r, 40));
    assert.strictEqual(resolvedEarly, false, 'close() must wait while pool.ending is true and pool.ended is false');
    assert.strictEqual(fakePool.endCallCount, 0, 'Must not invoke pool.end() again when pool.ending is already true');

    fakePool.ended = true;
    await closePromise;
    assert.strictEqual(resolvedEarly, true);
  });

  await suite.test('4. TenantDatabaseManager: repeated & concurrent closeTenantPool() and closeAllPools() share in-flight shutdown', async () => {
    const mgr = makeFreshTenantManager();
    const orgA = crypto.randomUUID();
    const orgB = crypto.randomUUID();
    const gateA = createDeferred();
    const gateB = createDeferred();
    const poolA = new FakePool({ endGate: gateA });
    const poolB = new FakePool({ endGate: gateB });
    mgr.tenantPools.set(orgA, poolA);
    mgr.tenantPools.set(orgB, poolB);

    let allResolvedEarly = false;
    const closeA1 = mgr.closeTenantPool(orgA);
    const closeA2 = mgr.closeTenantPool(orgA);
    const closeAll = mgr.closeAllPools().then(() => {
      allResolvedEarly = true;
    });

    await flushMicrotasks();
    assert.strictEqual(allResolvedEarly, false, 'closeAllPools() must wait for concurrent closeTenantPool()');

    gateA.resolve();
    await flushMicrotasks();
    assert.strictEqual(allResolvedEarly, false, 'closeAllPools() must wait until poolB finishes too');

    gateB.resolve();
    await Promise.all([closeA1, closeA2, closeAll]);
    assert.strictEqual(poolA.endCallCount, 1);
    assert.strictEqual(poolB.endCallCount, 1);
    assert.strictEqual(poolA.ended, true);
    assert.strictEqual(poolB.ended, true);
    assert.strictEqual(mgr.tenantPools.size, 0);

    await mgr.closeTenantPool(orgA);
    await mgr.closeAllPools();
    assert.strictEqual(poolA.endCallCount, 1);
    assert.strictEqual(poolB.endCallCount, 1);
  });

  await suite.test('5. TenantDatabaseManager: wrapPgPool().close() interacts safely with closeTenantPool() & closeAllPools()', async () => {
    const mgr = makeFreshTenantManager();
    const orgId = crypto.randomUUID();
    const endGate = createDeferred();
    const pool = new FakePool({ endGate });
    mgr.tenantPools.set(orgId, pool);

    const wrapped = mgr.wrapPgPool(pool, orgId);
    const resultsPromise = Promise.allSettled([
      wrapped.close(),
      mgr.closeTenantPool(orgId),
      mgr.closeAllPools(),
    ]);

    await flushMicrotasks();
    endGate.resolve();
    const results = await resultsPromise;

    for (const r of results) {
      assert.strictEqual(r.status, 'fulfilled', `Unexpected rejection: ${r.reason?.message}`);
    }
    assert.strictEqual(pool.endCallCount, 1);
    assert.strictEqual(pool.ended, true);
    assert.strictEqual(mgr.getTenantPool(orgId), undefined);
  });

  await suite.test('6. TenantDatabaseManager: shutdown rejection propagates to all concurrent callers and retains unclosed pool', async () => {
    const mgr = makeFreshTenantManager();
    const orgId = crypto.randomUUID();
    const shutdownErr = new Error('Pool end I/O error');
    const pool = new FakePool({ delayMs: 5, endError: shutdownErr });
    mgr.tenantPools.set(orgId, pool);

    const wrapped = mgr.wrapPgPool(pool, orgId);
    const [rWrap, rTenant, rAll] = await Promise.allSettled([
      wrapped.close(),
      mgr.closeTenantPool(orgId),
      mgr.closeAllPools(),
    ]);

    assert.strictEqual(rWrap.status, 'rejected');
    assert.strictEqual(rTenant.status, 'rejected');
    assert.strictEqual(rAll.status, 'rejected');
    assert.strictEqual(rWrap.reason, shutdownErr);
    assert.strictEqual(rTenant.reason, shutdownErr);
    assert.strictEqual(rAll.reason, shutdownErr);

    assert.strictEqual(mgr.getTenantPool(orgId), pool);
  });

  await suite.test('7. TenantDatabaseManager: physical provisioning migration failure closes & evicts real pool path and preserves cleanup errors', async () => {
    const prevRunTenantMigs = MigrationRunner.runTenantMigrations;
    try {
      // 7a. Real physical provisioning branch with clean pool closure on migration failure
      const mgr = makeFreshTenantManager();
      const orgId = crypto.randomUUID();
      const createdPool = new FakePool({ delayMs: 5 });
      let poolPresentWhenEndCalled = false;

      const origEnd = createdPool.end.bind(createdPool);
      createdPool.end = async () => {
        poolPresentWhenEndCalled = mgr.getTenantPool(orgId) === createdPool;
        return origEnd();
      };

      mgr.setControlPlaneDb({
        query: async () => ({ rows: [] }),
        withTransaction: async (cb) => cb({ query: async () => ({ rows: [] }) }),
      });
      mgr.createAdminPool = () => ({
        on: () => {},
        query: async () => ({ rows: [] }),
        end: async () => {},
      });
      mgr.createTenantPool = () => createdPool;
      mgr.persistMappingStatus = async () => {};

      MigrationRunner.runTenantMigrations = async (_client, dairyId) => {
        assert.strictEqual(dairyId, orgId);
        assert.strictEqual(mgr.getTenantPool(orgId), createdPool);
        throw new Error('Simulated physical migration failure');
      };

      await assert.rejects(
        () =>
          mgr.provisionTenantDatabase({
            dairyId: orgId,
            dairyCode: 'PHYSFAIL',
            dairyName: 'Physical Fail Dairy',
            adminConnectionString: 'postgresql://postgres:postgres@127.0.0.1:59997/postgres',
          }),
        /Simulated physical migration failure/
      );

      assert.strictEqual(createdPool.endCallCount, 1);
      assert.strictEqual(poolPresentWhenEndCalled, true);
      assert.strictEqual(createdPool.ended, true);
      assert.strictEqual(mgr.getTenantPool(orgId), undefined);
      assert.strictEqual(mgr.getTenantMapping(orgId)?.provisioningStatus, 'FAILED');

      // 7b. Preserves both original migration error AND cleanup error without discarding either
      const mgr2 = makeFreshTenantManager();
      const orgId2 = crypto.randomUUID();
      const failingClosePool = new FakePool({
        delayMs: 5,
        endError: new Error('Cleanup pool.end() failed'),
      });
      mgr2.setControlPlaneDb({
        query: async () => ({ rows: [] }),
        withTransaction: async (cb) => cb({ query: async () => ({ rows: [] }) }),
      });
      mgr2.createAdminPool = () => ({
        on: () => {},
        query: async () => ({ rows: [] }),
        end: async () => {},
      });
      mgr2.createTenantPool = () => failingClosePool;
      mgr2.persistMappingStatus = async () => {};

      MigrationRunner.runTenantMigrations = async () => {
        throw new Error('Primary migration boom');
      };

      await assert.rejects(
        () =>
          mgr2.provisionTenantDatabase({
            dairyId: orgId2,
            dairyCode: 'BOTHFAIL',
            dairyName: 'Both Fail Dairy',
            adminConnectionString: 'postgresql://postgres:postgres@127.0.0.1:59997/postgres',
          }),
        (err) =>
          err instanceof AggregateError &&
          err.errors.length === 2 &&
          /Primary migration boom/.test(err.message) &&
          /Cleanup pool\.end\(\) failed/.test(err.message)
      );
      // Pool must NOT be evicted when closure failed
      assert.strictEqual(mgr2.getTenantPool(orgId2), failingClosePool);
    } finally {
      MigrationRunner.runTenantMigrations = prevRunTenantMigs;
    }
  });

  await suite.test('8. Source guards (resolved via import.meta.url): no silent probe suppression, no FORCE/pg_terminate_backend, and closedPools marked after pool.end()', async () => {
    const concTestPath = path.resolve(__dirname, 'concurrent-idempotency-financial.test.js');
    const helperPath = path.resolve(__dirname, 'helpers/pool-lifecycle-helpers.js');
    const tenantMgrPath = path.resolve(__dirname, '../src/infrastructure/database/TenantDatabaseManager.ts');

    const stripComments = (raw) =>
      raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const concSrc = stripComments(fs.readFileSync(concTestPath, 'utf8'));
    const helperSrc = stripComments(fs.readFileSync(helperPath, 'utf8'));
    const mgrSrc = stripComments(fs.readFileSync(tenantMgrPath, 'utf8'));

    assert.equal(/probe\.on\(\s*['"]error['"]\s*,\s*\(\)\s*=>\s*\{\s*\}\s*\)/.test(concSrc), false,
      'Silent probe.on("error", () => {}) must not exist');
    assert.equal(/probe\.end\(\)\.catch\(\s*\(\)\s*=>\s*\{\s*\}\s*\)/.test(concSrc), false,
      'Silent probe.end().catch(() => {}) must not exist');
    assert.equal(/DROP\s+DATABASE[\s\S]*WITH\s*\(\s*FORCE\s*\)/i.test(concSrc), false,
      'DROP DATABASE ... WITH (FORCE) must not be used in test suite');
    assert.equal(/pg_terminate_backend/i.test(concSrc), false,
      'pg_terminate_backend() must not be used in test suite');
    assert.equal(/DROP\s+DATABASE[\s\S]*WITH\s*\(\s*FORCE\s*\)/i.test(mgrSrc), false,
      'DROP DATABASE ... WITH (FORCE) must not be used in TenantDatabaseManager');
    assert.equal(/pg_terminate_backend/i.test(mgrSrc), false,
      'pg_terminate_backend() must not be used in TenantDatabaseManager');

    const addIdx = helperSrc.indexOf('closedPools.add(pool)');
    const checkedOutIdx = helperSrc.indexOf('still had checked-out or waiting clients');
    const endIdx = helperSrc.indexOf('await pool.end()');
    assert.ok(checkedOutIdx > 0 && endIdx > checkedOutIdx && addIdx > endIdx,
      'closedPools.add(pool) in shared helper must occur only after checked-out client verification and pool.end()');
  });

  await suite.test('9. Actual shared closePoolCleanly() helper contract: checked-out blocking, retry, concurrency, removal timeout, idempotency, and real failure observability', async () => {
    const { closePoolCleanly, closedPools } = createPoolShutdownManager({
      checkedOutTimeoutMs: 25,
      removeTimeoutMs: 30,
      externalEndTimeoutMs: 40,
      pollIntervalMs: 5,
    });

    // 9a. Checked-out clients block closure without marking closedPools; retry after release succeeds
    const pool = new FakePool({ delayMs: 5, totalCount: 2 });
    pool.idleCount = 1;
    await assert.rejects(() => closePoolCleanly(pool, 'checkedOutPool'), /still had checked-out or waiting clients/);
    assert.strictEqual(closedPools.has(pool), false);
    assert.strictEqual(pool.endCallCount, 0);

    pool.idleCount = 2;
    await closePoolCleanly(pool, 'checkedOutPool');
    assert.strictEqual(closedPools.has(pool), true);
    assert.strictEqual(pool.ended, true);
    assert.strictEqual(pool.endCallCount, 1);

    // 9b. Successful close is not repeated
    await closePoolCleanly(pool, 'checkedOutPool');
    assert.strictEqual(pool.endCallCount, 1);

    // 9c. Concurrent callers share the exact same in-flight operation
    const gate = createDeferred();
    const concPool = new FakePool({ endGate: gate, totalCount: 1 });
    const c1 = closePoolCleanly(concPool, 'concPool');
    const c2 = closePoolCleanly(concPool, 'concPool');
    await flushMicrotasks();
    assert.strictEqual(concPool.endCallCount, 1);
    gate.resolve();
    await Promise.all([c1, c2]);
    assert.strictEqual(concPool.endCallCount, 1);
    assert.strictEqual(closedPools.has(concPool), true);

    // 9d. Removal timeout is surfaced and does not mark closedPools
    const noRemovePool = new FakePool({ delayMs: 5, totalCount: 2, suppressRemoveEvents: true });
    await assert.rejects(
      () => closePoolCleanly(noRemovePool, 'noRemovePool'),
      /did not remove all expected clients/
    );
    assert.strictEqual(closedPools.has(noRemovePool), false);

    // 9e. Real shutdown failure remains observable and does not mark closedPools
    const failingPool = new FakePool({
      delayMs: 5,
      failFirstEndWith: new Error('Real socket failure during end'),
      resetEndingOnError: true,
    });
    const [f1, f2] = await Promise.allSettled([
      closePoolCleanly(failingPool, 'failingPool'),
      closePoolCleanly(failingPool, 'failingPool'),
    ]);
    assert.strictEqual(f1.status, 'rejected');
    assert.strictEqual(f2.status, 'rejected');
    assert.match(f1.reason.message, /Real socket failure during end/);
    assert.strictEqual(closedPools.has(failingPool), false);

    // Retry succeeds after transient failure clears
    await closePoolCleanly(failingPool, 'failingPool');
    assert.strictEqual(closedPools.has(failingPool), true);
    assert.strictEqual(failingPool.endCallCount, 2);
  });

  // ─── PHASE 2: Deterministic Acquisition / Shutdown / Deprovisioning Race Tests ───

  await suite.test('10. Race: getStrictTenantDb() waits for unresolved closeTenantPool() and does not return ending pool or create duplicate pool', async () => {
    const mgr = makeFreshTenantManager();
    const orgId = crypto.randomUUID();
    const mapping = makeActiveMapping(orgId, 'R1');
    mgr.tenantMappings.set(orgId, mapping);

    const closeGate = createDeferred();
    const pool1 = new FakePool({ endGate: closeGate });
    const pool2 = new FakePool({ delayMs: 5 });
    mgr.tenantPools.set(orgId, pool1);

    let createCalls = 0;
    mgr.createTenantPool = () => {
      createCalls += 1;
      return pool2;
    };

    const closePromise = mgr.closeTenantPool(orgId);
    await flushMicrotasks();
    assert.strictEqual(mgr.closingTenantPools.has(orgId), true);
    assert.strictEqual(pool1.ending, true);

    let acqSettled = false;
    const acqPromise = mgr.getStrictTenantDb(orgId).then((client) => {
      acqSettled = true;
      return client;
    });

    await flushMicrotasks();
    assert.strictEqual(acqSettled, false, 'Acquisition must wait while closeTenantPool() is unresolved');
    assert.strictEqual(createCalls, 0, 'Replacement pool must not be created before old close completes');
    assert.strictEqual(mgr.getTenantPool(orgId), pool1, 'Old pool must remain installed until close completes');

    closeGate.resolve();
    const [, client] = await Promise.all([closePromise, acqPromise]);

    assert.strictEqual(pool1.ended, true);
    assert.strictEqual(pool1.endCallCount, 1);
    assert.strictEqual(createCalls, 1);
    assert.strictEqual(mgr.getTenantPool(orgId), pool2);
    assert.strictEqual(mgr.closingTenantPools.size, 0);

    await client.query('SELECT 1;');
    assert.strictEqual(pool1.queryCalls.length, 0, 'Must never execute queries on ended pool1');
    assert.strictEqual(pool2.queryCalls.length, 1, 'Must execute queries on replacement pool2');
  });

  await suite.test('11. Race: getTenantDb() waits for unresolved closeTenantPool() and installs single replacement pool after completion', async () => {
    const mgr = makeFreshTenantManager();
    const orgId = crypto.randomUUID();
    const mapping = makeActiveMapping(orgId, 'R2');
    mgr.tenantMappings.set(orgId, mapping);

    const closeGate = createDeferred();
    const pool1 = new FakePool({ endGate: closeGate });
    const pool2 = new FakePool({ delayMs: 5 });
    mgr.tenantPools.set(orgId, pool1);

    let createCalls = 0;
    mgr.createTenantPool = () => {
      createCalls += 1;
      return pool2;
    };

    const closePromise = mgr.closeTenantPool(orgId);
    await flushMicrotasks();

    let acqSettled = false;
    const acqPromise = mgr.getTenantDb(orgId).then((client) => {
      acqSettled = true;
      return client;
    });

    await flushMicrotasks();
    assert.strictEqual(acqSettled, false);
    assert.strictEqual(createCalls, 0);

    closeGate.resolve();
    const [, client] = await Promise.all([closePromise, acqPromise]);

    assert.strictEqual(pool1.ended, true);
    assert.strictEqual(createCalls, 1);
    assert.strictEqual(mgr.getTenantPool(orgId), pool2);
    await client.query('SELECT 1;');
    assert.strictEqual(pool1.queryCalls.length, 0);
    assert.strictEqual(pool2.queryCalls.length, 1);
  });

  await suite.test('12. Race: concurrent acquisition fails closed with SHUTTING_DOWN during closeAllPools() without escaping shutdown', async () => {
    const mgr = makeFreshTenantManager();
    const orgA = crypto.randomUUID();
    const orgB = crypto.randomUUID();
    mgr.tenantMappings.set(orgA, makeActiveMapping(orgA, 'CA'));
    mgr.tenantMappings.set(orgB, makeActiveMapping(orgB, 'CB'));

    const closeAllGate = createDeferred();
    const poolA = new FakePool({ endGate: closeAllGate });
    mgr.tenantPools.set(orgA, poolA);

    let createCalls = 0;
    mgr.createTenantPool = () => {
      createCalls += 1;
      return new FakePool();
    };

    const closeAllPromise = mgr.closeAllPools();
    await flushMicrotasks();

    await assert.rejects(
      () => mgr.getStrictTenantDb(orgA),
      (err) => err instanceof TenantDatabaseUnavailableError && err.status === 'SHUTTING_DOWN'
    );
    await assert.rejects(
      () => mgr.getTenantDb(orgB),
      (err) => err instanceof TenantDatabaseUnavailableError && err.status === 'SHUTTING_DOWN'
    );
    assert.strictEqual(createCalls, 0);

    closeAllGate.resolve();
    await closeAllPromise;
    assert.strictEqual(poolA.ended, true);
    assert.strictEqual(mgr.tenantPools.size, 0);
    assert.strictEqual(mgr.closingAllPoolsPromise, null);
  });

  await suite.test('13. Race: two concurrent acquisitions during an ending pool create at most one replacement pool', async () => {
    const mgr = makeFreshTenantManager();
    const orgId = crypto.randomUUID();
    mgr.tenantMappings.set(orgId, makeActiveMapping(orgId, 'TWO'));

    const closeGate = createDeferred();
    const pool1 = new FakePool({ endGate: closeGate });
    const pool2 = new FakePool({ delayMs: 5 });
    mgr.tenantPools.set(orgId, pool1);

    let createCalls = 0;
    mgr.createTenantPool = () => {
      createCalls += 1;
      return pool2;
    };

    const closePromise = mgr.closeTenantPool(orgId);
    await flushMicrotasks();

    const acqStrict = mgr.getStrictTenantDb(orgId);
    const acqNormal = mgr.getTenantDb(orgId);
    await flushMicrotasks();
    assert.strictEqual(createCalls, 0);

    closeGate.resolve();
    const [, cStrict, cNormal] = await Promise.all([closePromise, acqStrict, acqNormal]);

    assert.strictEqual(pool1.ended, true);
    assert.strictEqual(createCalls, 1, 'Two concurrent acquisitions must coalesce onto a single replacement pool');
    assert.strictEqual(mgr.getTenantPool(orgId), pool2);

    await cStrict.query('SELECT 1;');
    await cNormal.query('SELECT 2;');
    assert.strictEqual(pool1.queryCalls.length, 0);
    assert.strictEqual(pool2.queryCalls.length, 2);
  });

  await suite.test('14. Lifecycle: failed close retains pool, blocks replacement acquisition, and succeeds on retry', async () => {
    const mgr = makeFreshTenantManager();
    const orgId = crypto.randomUUID();
    mgr.tenantMappings.set(orgId, makeActiveMapping(orgId, 'RETRY'));

    const transientErr = new Error('Transient pool close error');
    const endGate = createDeferred();
    const pool1 = new FakePool({
      endGate,
      failFirstEndWith: transientErr,
      resetEndingOnError: true,
    });
    const pool2 = new FakePool({ delayMs: 5 });
    mgr.tenantPools.set(orgId, pool1);

    let createCalls = 0;
    mgr.createTenantPool = () => {
      createCalls += 1;
      return pool2;
    };

    const firstClose = mgr.closeTenantPool(orgId);
    await flushMicrotasks();
    const concurrentAcq = mgr.getStrictTenantDb(orgId);

    endGate.resolve();
    const [closeRes, acqRes] = await Promise.allSettled([firstClose, concurrentAcq]);

    assert.strictEqual(closeRes.status, 'rejected');
    assert.strictEqual(closeRes.reason, transientErr);
    assert.strictEqual(acqRes.status, 'rejected');
    assert.strictEqual(acqRes.reason.status, 'POOL_SHUTDOWN_FAILED');
    assert.strictEqual(createCalls, 0, 'Must not install replacement pool when close failed');
    assert.strictEqual(mgr.getTenantPool(orgId), pool1, 'Failed close must retain pool1 for retry');
    assert.strictEqual(mgr.closingTenantPools.size, 0);

    // Retry close -> succeeds and evicts pool1
    pool1.endGate = null;
    await mgr.closeTenantPool(orgId);
    assert.strictEqual(pool1.ended, true);
    assert.strictEqual(pool1.endCallCount, 2);
    assert.strictEqual(mgr.getTenantPool(orgId), undefined);

    // Subsequent acquisition opens pool2 cleanly
    const client = await mgr.getStrictTenantDb(orgId);
    assert.strictEqual(createCalls, 1);
    assert.strictEqual(mgr.getTenantPool(orgId), pool2);
    await client.query('SELECT 1;');
    assert.strictEqual(pool2.queryCalls.length, 1);
  });

  await suite.test('15. Race: closeAllPools() waits while a new tenant mapping is being resolved and leaves zero untracked pools', async () => {
    const mgr = makeFreshTenantManager();
    const orgNew = crypto.randomUUID();
    const mapping = makeActiveMapping(orgNew, 'RES');
    const mappingEntered = createDeferred();
    const mappingGate = createDeferred();

    mgr.setControlPlaneDb({
      query: async (sql) => {
        if (sql.includes('dairy_database_mappings')) {
          mappingEntered.resolve();
          await mappingGate.promise;
          return { rows: [makeMappingRow(mapping)] };
        }
        return { rows: [] };
      },
      withTransaction: async (cb) => cb({ query: async () => ({ rows: [] }) }),
    });

    let createCalls = 0;
    mgr.createTenantPool = () => {
      createCalls += 1;
      return new FakePool();
    };

    const acqPromise = mgr.getStrictTenantDb(orgNew);
    await mappingEntered.promise;

    let closeAllDone = false;
    const closeAllPromise = mgr.closeAllPools().then(() => {
      closeAllDone = true;
    });

    await flushMicrotasks();
    assert.strictEqual(closeAllDone, false, 'closeAllPools() must not resolve while in-flight mapping acquisition is unresolved');

    mappingGate.resolve();
    const [acqRes, closeAllRes] = await Promise.allSettled([acqPromise, closeAllPromise]);

    assert.strictEqual(closeAllRes.status, 'fulfilled');
    assert.strictEqual(acqRes.status, 'rejected');
    assert.strictEqual(acqRes.reason.status, 'SHUTTING_DOWN');
    assert.strictEqual(createCalls, 0);
    assert.strictEqual(mgr.tenantPools.size, 0);
    assert.strictEqual(mgr.inFlightAcquisitionsByDairy.size, 0);
  });

  await suite.test('16. Race & Recovery: acquisition fails closed during deprovisioning and after failed deprovisioning', async () => {
    // 16a. Concurrent acquisition during active deprovisioning
    const mgr = makeFreshTenantManager();
    const orgId = crypto.randomUUID();
    mgr.tenantMappings.set(orgId, makeActiveMapping(orgId, 'DEPROV'));
    const deprovGate = createDeferred();
    const pool1 = new FakePool({ endGate: deprovGate });
    mgr.tenantPools.set(orgId, pool1);

    let createCalls = 0;
    mgr.createTenantPool = () => {
      createCalls += 1;
      return new FakePool();
    };
    mgr.setControlPlaneDb({
      query: async () => ({ rows: [] }),
      withTransaction: async (cb) => cb({ query: async () => ({ rows: [] }) }),
    });

    const deprovPromise = mgr.deprovisionTenantDatabase(orgId);
    await flushMicrotasks();

    assert.strictEqual(mgr.deprovisioningTenants.has(orgId), true);
    assert.strictEqual(mgr.getTenantMapping(orgId)?.provisioningStatus, 'DEPROVISIONING');

    await assert.rejects(
      () => mgr.getStrictTenantDb(orgId),
      (err) => err instanceof TenantDatabaseUnavailableError && err.status === 'DEPROVISIONING'
    );
    await assert.rejects(
      () => mgr.getTenantDb(orgId),
      (err) => err instanceof TenantDatabaseUnavailableError && err.status === 'DEPROVISIONING'
    );
    assert.strictEqual(createCalls, 0);

    deprovGate.resolve();
    const deprovResult = await deprovPromise;
    assert.strictEqual(deprovResult.success, true);
    assert.strictEqual(pool1.ended, true);
    assert.strictEqual(mgr.getTenantPool(orgId), undefined);
    assert.strictEqual(mgr.getTenantMapping(orgId), null);
    assert.strictEqual(mgr.deprovisioningTenants.size, 0);

    // 16b. Failed deprovisioning must NOT convert failure into success (even with force: true) and must block subsequent acquisitions
    const mgrFail = makeFreshTenantManager();
    const orgFail = crypto.randomUUID();
    mgrFail.tenantMappings.set(orgFail, makeActiveMapping(orgFail, 'DFAIL'));
    const poolFail = new FakePool({ delayMs: 5 });
    mgrFail.tenantPools.set(orgFail, poolFail);
    mgrFail.createTenantPool = () => {
      throw new Error('Must never create pool for DEPROVISION_FAILED tenant');
    };
    mgrFail.setControlPlaneDb({
      query: async (sql) => {
        if (sql.includes('DELETE FROM dairy_database_mappings')) {
          throw new Error('Control plane delete failure');
        }
        return { rows: [] };
      },
      withTransaction: async (cb) => cb({ query: async () => ({ rows: [] }) }),
    });

    await assert.rejects(
      () => mgrFail.deprovisionTenantDatabase(orgFail, { force: true }),
      /Control plane delete failure/
    );
    assert.strictEqual(mgrFail.getTenantMapping(orgFail)?.provisioningStatus, 'DEPROVISION_FAILED');
    await assert.rejects(
      () => mgrFail.getStrictTenantDb(orgFail),
      (err) => err instanceof TenantDatabaseUnavailableError && err.status === 'DEPROVISION_FAILED'
    );
    await assert.rejects(
      () => mgrFail.getTenantDb(orgFail),
      (err) => err instanceof TenantDatabaseUnavailableError && err.status === 'DEPROVISION_FAILED'
    );
  });

  await suite.test('17. Lifecycle: reopening a valid ACTIVE tenant after ordinary closeTenantPool() and closeAllPools() creates fresh pools cleanly', async () => {
    const mgr = makeFreshTenantManager();
    const orgId = crypto.randomUUID();
    mgr.tenantMappings.set(orgId, makeActiveMapping(orgId, 'REOPEN'));

    const created = [];
    mgr.createTenantPool = () => {
      const p = new FakePool({ delayMs: 5 });
      created.push(p);
      return p;
    };

    const c1 = await mgr.getStrictTenantDb(orgId);
    assert.strictEqual(created.length, 1);
    assert.strictEqual(mgr.getTenantPool(orgId), created[0]);

    await mgr.closeTenantPool(orgId);
    assert.strictEqual(created[0].ended, true);
    assert.strictEqual(mgr.getTenantPool(orgId), undefined);

    const c2 = await mgr.getStrictTenantDb(orgId);
    assert.strictEqual(created.length, 2);
    assert.notStrictEqual(created[1], created[0]);
    assert.strictEqual(mgr.getTenantPool(orgId), created[1]);

    // Subsequent getTenantDb() reuses active pool2
    const c2Reuse = await mgr.getTenantDb(orgId);
    assert.strictEqual(created.length, 2);
    await c2Reuse.query('SELECT 1;');
    assert.strictEqual(created[1].queryCalls.length, 1);

    // After non-permanent closeAllPools(), reopening creates pool3
    await mgr.closeAllPools();
    assert.strictEqual(created[1].ended, true);
    assert.strictEqual(mgr.tenantPools.size, 0);

    const c3 = await mgr.getTenantDb(orgId);
    assert.strictEqual(created.length, 3);
    await c3.query('SELECT 2;');
    assert.strictEqual(created[2].queryCalls.length, 1);
    assert.strictEqual(created[0].queryCalls.length, 0);
    await c1.close?.().catch(() => {});
  });

  await suite.test('18. Concurrency: simultaneous acquisitions for one dairy never create duplicate physical pools', async () => {
    const mgr = makeFreshTenantManager();
    const orgId = crypto.randomUUID();
    const mapping = makeActiveMapping(orgId, 'NODUP');
    const mappingGate = createDeferred();

    mgr.setControlPlaneDb({
      query: async (sql) => {
        if (sql.includes('dairy_database_mappings')) {
          await mappingGate.promise;
          return { rows: [makeMappingRow(mapping)] };
        }
        return { rows: [] };
      },
      withTransaction: async (cb) => cb({ query: async () => ({ rows: [] }) }),
    });

    const created = [];
    mgr.createTenantPool = () => {
      const p = new FakePool({ delayMs: 5 });
      created.push(p);
      return p;
    };

    const pending = [
      mgr.getStrictTenantDb(orgId),
      mgr.getTenantDb(orgId),
      mgr.getStrictTenantDb(orgId),
      mgr.getTenantDb(orgId),
      mgr.getStrictTenantDb(orgId),
    ];

    await flushMicrotasks();
    mappingGate.resolve();

    const clients = await Promise.all(pending);
    assert.strictEqual(created.length, 1, 'Exactly one physical pool must be created across all concurrent acquisitions');
    assert.strictEqual(mgr.tenantPools.size, 1);
    assert.strictEqual(mgr.getTenantPool(orgId), created[0]);

    await Promise.all(clients.map((c) => c.query('SELECT 1;')));
    assert.strictEqual(created[0].queryCalls.length, 5);
  });

  await suite.test('19. Global shutdown invariant: zero active, ending, or untracked pools remain after closeAllPools()', async () => {
    const mgr = makeFreshTenantManager();
    const orgA = crypto.randomUUID();
    const orgB = crypto.randomUUID();
    const orgC = crypto.randomUUID();

    mgr.tenantMappings.set(orgA, makeActiveMapping(orgA, 'GA'));
    mgr.tenantMappings.set(orgB, makeActiveMapping(orgB, 'GB'));
    const mappingC = makeActiveMapping(orgC, 'GC');

    const closeBGate = createDeferred();
    const mappingCGate = createDeferred();
    const mappingCEntered = createDeferred();

    const poolA = new FakePool({ delayMs: 5 });
    const poolB = new FakePool({ endGate: closeBGate });
    mgr.tenantPools.set(orgA, poolA);
    mgr.tenantPools.set(orgB, poolB);

    mgr.setControlPlaneDb({
      query: async (sql) => {
        if (sql.includes('dairy_database_mappings')) {
          mappingCEntered.resolve();
          await mappingCGate.promise;
          return { rows: [makeMappingRow(mappingC)] };
        }
        return { rows: [] };
      },
      withTransaction: async (cb) => cb({ query: async () => ({ rows: [] }) }),
    });

    let extraPoolCreated = 0;
    mgr.createTenantPool = () => {
      extraPoolCreated += 1;
      return new FakePool();
    };

    const closeBPromise = mgr.closeTenantPool(orgB);
    const acqCPromise = mgr.getStrictTenantDb(orgC);
    await mappingCEntered.promise;

    const closeAllPromise = mgr.closeAllPools();
    await flushMicrotasks();

    closeBGate.resolve();
    mappingCGate.resolve();

    const [rCloseB, rAcqC, rCloseAll] = await Promise.allSettled([
      closeBPromise,
      acqCPromise,
      closeAllPromise,
    ]);

    assert.strictEqual(rCloseB.status, 'fulfilled');
    assert.strictEqual(rCloseAll.status, 'fulfilled');
    assert.strictEqual(rAcqC.status, 'rejected');
    assert.strictEqual(rAcqC.reason.status, 'SHUTTING_DOWN');

    assert.strictEqual(extraPoolCreated, 0);
    assert.strictEqual(poolA.ended, true);
    assert.strictEqual(poolB.ended, true);
    assert.strictEqual(mgr.tenantPools.size, 0);
    assert.strictEqual(mgr.tenantMemDbs.size, 0);
    assert.strictEqual(mgr.closingTenantPools.size, 0);
    assert.strictEqual(mgr.inFlightAcquisitionsByDairy.size, 0);
    assert.strictEqual(mgr.closingAllPoolsPromise, null);
  });
});
