import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Ensure isolated offline mode for importing compiled backend classes without live PG
if (!process.env.TEST_POSTGRES_URL) {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:59999/offline_test';
  process.env.CENTRAL_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:59999/offline_test';
  process.env.DATABASE_PROVISIONER_URL = 'postgresql://postgres:postgres@127.0.0.1:59999/offline_test';
  process.env.TENANT_POOL_CONNECTION_TIMEOUT_MS = '500';
}

const { PostgresDatabase } = await import('../dist/infrastructure/database/PostgresPool.js');
const { TenantDatabaseManager } = await import('../dist/infrastructure/database/TenantDatabaseManager.js');
const { MigrationRunner } = await import('../dist/infrastructure/database/MigrationRunner.js');

class FakePool extends EventEmitter {
  constructor({ delayMs = 20, endError = null, externalEnding = false, totalCount = 0 } = {}) {
    super();
    this.delayMs = delayMs;
    this.endError = endError;
    this.ending = externalEnding;
    this.ended = false;
    this.endCallCount = 0;
    this.totalCount = totalCount;
    this.idleCount = totalCount;
    this.waitingCount = 0;
  }

  async end() {
    this.endCallCount += 1;
    if (this.ending) {
      throw new Error('Called end on pool more than once');
    }
    this.ending = true;
    await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.endError) {
      throw this.endError;
    }
    for (let i = 0; i < this.totalCount; i += 1) {
      this.emit('remove', {});
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

test('RESTART-03.7 Pool & Shutdown Lifecycle Regression Suite', async (suite) => {
  await suite.test('1. PostgresDatabase.close(): concurrent callers await single in-flight shutdown and end() runs once', async () => {
    const fakePool = new FakePool({ delayMs: 40 });
    const dbInst = makeFakePostgresDb(fakePool);

    let firstDone = false;
    let secondDone = false;
    const p1 = dbInst.close().then(() => {
      firstDone = true;
    });
    const p2 = dbInst.close().then(() => {
      secondDone = true;
    });

    assert.strictEqual(firstDone, false);
    assert.strictEqual(secondDone, false);

    await Promise.all([p1, p2]);
    assert.strictEqual(fakePool.endCallCount, 1);
    assert.strictEqual(fakePool.ended, true);

    // Repeated sequential close() after completion does not call end() again.
    await dbInst.close();
    assert.strictEqual(fakePool.endCallCount, 1);
  });

  await suite.test('2. PostgresDatabase.close(): rejected close promise remains observable to concurrent & later callers', async () => {
    const expectedErr = new Error('Simulated central pool shutdown failure');
    const fakePool = new FakePool({ delayMs: 15, endError: expectedErr });
    const dbInst = makeFakePostgresDb(fakePool);

    const [r1, r2] = await Promise.allSettled([dbInst.close(), dbInst.close()]);
    assert.strictEqual(r1.status, 'rejected');
    assert.strictEqual(r2.status, 'rejected');
    assert.strictEqual(r1.reason, expectedErr);
    assert.strictEqual(r2.reason, expectedErr);

    // Later call must still observe the rejection rather than silently succeeding.
    await assert.rejects(() => dbInst.close(), (err) => err === expectedErr);
  });

  await suite.test('3. PostgresDatabase.close(): does not report complete while independently started pool.ending is in progress', async () => {
    const fakePool = new FakePool({ externalEnding: true });
    const dbInst = makeFakePostgresDb(fakePool);

    let resolvedEarly = false;
    const closePromise = dbInst.close().then(() => {
      resolvedEarly = true;
    });

    await new Promise((r) => setTimeout(r, 60));
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
    const poolA = new FakePool({ delayMs: 50 });
    const poolB = new FakePool({ delayMs: 50 });
    mgr.tenantPools.set(orgA, poolA);
    mgr.tenantPools.set(orgB, poolB);

    let allResolvedEarly = false;
    const closeA1 = mgr.closeTenantPool(orgA);
    const closeA2 = mgr.closeTenantPool(orgA);
    const closeAll = mgr.closeAllPools().then(() => {
      allResolvedEarly = true;
    });

    // Neither closeAllPools nor closeTenantPool should settle before poolA/poolB finish ending.
    await new Promise((r) => setTimeout(r, 15));
    assert.strictEqual(allResolvedEarly, false, 'closeAllPools() must wait for concurrent closeTenantPool()');

    await Promise.all([closeA1, closeA2, closeAll]);
    assert.strictEqual(poolA.endCallCount, 1);
    assert.strictEqual(poolB.endCallCount, 1);
    assert.strictEqual(poolA.ended, true);
    assert.strictEqual(poolB.ended, true);
    assert.strictEqual(mgr.tenantPools.size, 0);

    // Repeated calls after shutdown are idempotent.
    await mgr.closeTenantPool(orgA);
    await mgr.closeAllPools();
    assert.strictEqual(poolA.endCallCount, 1);
    assert.strictEqual(poolB.endCallCount, 1);
  });

  await suite.test('5. TenantDatabaseManager: wrapPgPool().close() interacts safely with closeTenantPool() & closeAllPools()', async () => {
    const mgr = makeFreshTenantManager();
    const orgId = crypto.randomUUID();
    const pool = new FakePool({ delayMs: 40 });
    mgr.tenantPools.set(orgId, pool);

    const wrapped = mgr.wrapPgPool(pool, orgId);
    const results = await Promise.allSettled([
      wrapped.close(),
      mgr.closeTenantPool(orgId),
      mgr.closeAllPools(),
    ]);

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
    const pool = new FakePool({ delayMs: 25, endError: shutdownErr });
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

    // Failed close must NOT silently drop the unclosed pool from tenantPools.
    assert.strictEqual(mgr.getTenantPool(orgId), pool);
  });

  await suite.test('7. TenantDatabaseManager: partial setup failure during provisioning closes and evicts created pool', async () => {
    const mgr = makeFreshTenantManager();
    const orgId = crypto.randomUUID();
    const createdPool = new FakePool({ delayMs: 10 });
    let endCalled = false;
    const origEnd = createdPool.end.bind(createdPool);
    createdPool.end = async () => {
      endCalled = true;
      return origEnd();
    };

    // Mock control plane & provisioning internals to reach migration phase cleanly then fail.
    mgr.setControlPlaneDb({
      query: async () => ({ rows: [] }),
      withTransaction: async (cb) => cb({ query: async () => ({ rows: [] }) }),
    });
    mgr.createTenantPool = () => createdPool;
    mgr.persistMappingStatus = async () => {};

    // Force physical DB creation path via stubbed provisionTenantDatabase dependencies:
    // Use an unreachable local adminConnectionString with TEST_REAL_POSTGRES unset -> pg-mem path,
    // OR test physical pool path by temporarily monkeypatching MigrationRunner.runTenantMigrations.
    const prevRunTenantMigs = MigrationRunner.runTenantMigrations;
    const prevTestRealPg = process.env.TEST_REAL_POSTGRES;
    const prevReqRealPg = process.env.REQUIRE_REAL_POSTGRES;

    // Simulate physical pool creation by mocking createIsolatedMemoryDatabase to throw after registering,
    // AND also verify physical pool path when createTenantPool is invoked.
    mgr.createIsolatedMemoryDatabase = () => {
      // Simulate a physical pool being registered in tenantPools before migration fails.
      mgr.tenantPools.set(orgId, createdPool);
      return {
        query: async () => {
          throw new Error('Simulated partial migration failure');
        },
        withTransaction: async () => {
          throw new Error('Simulated partial migration failure');
        },
        close: async () => {},
      };
    };

    try {
      delete process.env.TEST_REAL_POSTGRES;
      delete process.env.REQUIRE_REAL_POSTGRES;
      await assert.rejects(
        () =>
          mgr.provisionTenantDatabase({
            dairyId: orgId,
            dairyCode: 'PARTIAL-FAIL',
            dairyName: 'Partial Fail Dairy',
            adminConnectionString: 'postgresql://postgres:postgres@127.0.0.1:59997/postgres',
          }),
        /Simulated partial migration failure/
      );

      assert.strictEqual(endCalled, true, 'Partially created pool must be closed on provisioning failure');
      assert.strictEqual(mgr.getTenantPool(orgId), undefined, 'Partially created pool must be evicted');
      assert.strictEqual(mgr.tenantMemDbs.has(orgId), false, 'Partially created memDb must be evicted');
    } finally {
      MigrationRunner.runTenantMigrations = prevRunTenantMigs;
      if (prevTestRealPg === undefined) delete process.env.TEST_REAL_POSTGRES;
      else process.env.TEST_REAL_POSTGRES = prevTestRealPg;
      if (prevReqRealPg === undefined) delete process.env.REQUIRE_REAL_POSTGRES;
      else process.env.REQUIRE_REAL_POSTGRES = prevReqRealPg;
    }
  });

  await suite.test('8. concurrent-idempotency-financial.test.js source contains no silent probe suppression or premature closedPools mark', async () => {
    const testSourcePath = path.resolve(process.cwd(), 'tests/concurrent-idempotency-financial.test.js');
    const rawSrc = fs.readFileSync(testSourcePath, 'utf8');
    // Strip single-line comments so explanatory notes don't trigger code-pattern checks
    const src = rawSrc.replace(/\/\/.*$/gm, '');

    assert.equal(/probe\.on\(\s*['"]error['"]\s*,\s*\(\)\s*=>\s*\{\s*\}\s*\)/.test(src), false,
      'Silent probe.on("error", () => {}) must not exist');
    assert.equal(/probe\.end\(\)\.catch\(\s*\(\)\s*=>\s*\{\s*\}\s*\)/.test(src), false,
      'Silent probe.end().catch(() => {}) must not exist');
    assert.equal(/DROP\s+DATABASE[\s\S]*WITH\s*\(\s*FORCE\s*\)/i.test(src), false,
      'DROP DATABASE ... WITH (FORCE) must not be used');
    assert.equal(/pg_terminate_backend/i.test(src), false,
      'pg_terminate_backend() must not be used');

    // Verify closedPools.add(pool) appears strictly AFTER checked-out client check and pool shutdown
    const addIdx = src.indexOf('closedPools.add(pool)');
    const checkedOutIdx = src.indexOf('still had checked-out or waiting clients');
    const endIdx = src.indexOf('await pool.end()');
    assert.ok(checkedOutIdx > 0 && endIdx > checkedOutIdx && addIdx > endIdx,
      'closedPools.add(pool) must occur only after checked-out client verification and pool.end()');
  });

  await suite.test('9. closePoolCleanly contract: checked-out client blocks close without marking closedPools, allowing retry after release', async () => {
    // Replicate the exact closePoolCleanly state machine under unit test with short deadline
    const closedPools = new WeakSet();
    const poolShutdownPromises = new WeakMap();

    const closePoolCleanly = async (pool, label) => {
      if (!pool) return;
      const inflight = poolShutdownPromises.get(pool);
      if (inflight) return inflight;
      if (closedPools.has(pool)) return;

      const shutdownPromise = (async () => {
        if (pool.totalCount !== pool.idleCount || pool.waitingCount > 0) {
          throw new Error(`Pool '${label}' still had checked-out clients`);
        }
        const expectedRemovals = Number(pool.totalCount || 0);
        let removedCount = 0;
        const onRemove = () => {
          removedCount += 1;
        };
        if (expectedRemovals > 0) pool.on('remove', onRemove);
        try {
          await pool.end();
          if (removedCount < expectedRemovals) {
            throw new Error(`Pool '${label}' did not remove all clients`);
          }
          closedPools.add(pool);
        } finally {
          if (expectedRemovals > 0) pool.off('remove', onRemove);
        }
      })();

      poolShutdownPromises.set(pool, shutdownPromise);
      try {
        await shutdownPromise;
      } finally {
        if (poolShutdownPromises.get(pool) === shutdownPromise) {
          poolShutdownPromises.delete(pool);
        }
      }
    };

    const pool = new FakePool({ delayMs: 5, totalCount: 2 });
    pool.idleCount = 1; // 1 client checked out

    // Step 1-3: Attempt close with checked-out client -> throws, does NOT add to closedPools
    await assert.rejects(() => closePoolCleanly(pool, 'checkedOutPool'), /still had checked-out clients/);
    assert.strictEqual(closedPools.has(pool), false, 'Failed close must NOT mark pool in closedPools');
    assert.strictEqual(pool.endCallCount, 0);

    // Step 4: Release client, retry cleanup -> succeeds and removes all clients
    pool.idleCount = 2;
    await closePoolCleanly(pool, 'checkedOutPool');
    assert.strictEqual(closedPools.has(pool), true, 'Successful retry must mark pool closed');
    assert.strictEqual(pool.ended, true);
    assert.strictEqual(pool.endCallCount, 1);

    // Step 5: Subsequent cleanup call skips cleanly
    await closePoolCleanly(pool, 'checkedOutPool');
    assert.strictEqual(pool.endCallCount, 1);
  });
});
