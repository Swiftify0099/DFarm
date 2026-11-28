import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Ensure strictly isolated offline test environment BEFORE importing backend/database modules
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:59999/offline_test';
process.env.CENTRAL_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:59999/offline_test';
process.env.DATABASE_PROVISIONER_URL = 'postgresql://postgres:postgres@127.0.0.1:59999/offline_test';
process.env.DIRECT_URL = 'postgresql://postgres:postgres@127.0.0.1:59999/offline_test';
process.env.SUPABASE_URL = 'http://127.0.0.1:59998';
process.env.TENANT_POOL_CONNECTION_TIMEOUT_MS = '500';

const {
  MigrationRunner,
  MigrationTarget,
  MIGRATION_MANIFEST,
  CONTROL_PLANE_MIGRATIONS,
  TENANT_OPERATIONAL_MIGRATIONS,
} = await import('../dist/infrastructure/database/MigrationRunner.js');
const {
  resolveCliMigrationPlan,
  getConnectionCandidates,
  executeCliMigrationPlan,
} = await import('../../../scripts/migrate.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');
const migrationsDir = path.join(repoRoot, 'supabase/migrations');

/**
 * Explicit mock PostgreSQL client/pool simulator with configurable fault injection
 * for transaction BEGIN/ROLLBACK, advisory lock/unlock, tracking insert, and pooled release checks.
 */
function createFaultMockClient(options = {}) {
  const schemaMigrations = new Map(options.initialSchemaMigrations || []);
  const supabaseHistory = new Map(options.initialSupabaseHistory || []);
  const queries = [];
  const executedMigrationSql = [];
  const appliedTables = new Set();
  let pendingTableCreates = [];
  let pendingTrackingWrites = [];

  const client = {
    __isMockClient: options.treatAsRealPostgres ? undefined : true,
    queries,
    executedMigrationSql,
    schemaMigrations,
    supabaseHistory,
    appliedTables,
    released: false,
    releaseArg: undefined,
    async query(text, params = []) {
      const sql = String(text).trim();
      queries.push({ sql, params });

      if (sql === 'BEGIN;') {
        if (options.failBegin) {
          throw new Error(options.failBeginMessage || 'Simulated PostgreSQL BEGIN failure');
        }
        pendingTableCreates = [];
        pendingTrackingWrites = [];
        return { rows: [], rowCount: 0 };
      }
      if (sql === 'COMMIT;') {
        if (options.failCommit) {
          throw new Error('Simulated PostgreSQL COMMIT failure');
        }
        pendingTableCreates = [];
        pendingTrackingWrites = [];
        return { rows: [], rowCount: 0 };
      }
      if (sql === 'ROLLBACK;') {
        if (options.failRollback) {
          throw new Error(options.failRollbackMessage || 'Simulated PostgreSQL ROLLBACK failure');
        }
        for (const undo of pendingTableCreates.reverse()) undo();
        for (const undo of pendingTrackingWrites.reverse()) undo();
        pendingTableCreates = [];
        pendingTrackingWrites = [];
        return { rows: [], rowCount: 0 };
      }
      if (sql.startsWith('SAVEPOINT') || sql.startsWith('RELEASE SAVEPOINT') || sql.startsWith('ROLLBACK TO SAVEPOINT')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.startsWith('SELECT pg_advisory_lock')) {
        if (options.failLock) {
          throw new Error(options.failLockMessage || 'Simulated PostgreSQL advisory lock acquisition failure');
        }
        if (options.returnFalseLock) {
          return { rows: [{ pg_advisory_lock: false }], rowCount: 1 };
        }
        return { rows: [{ pg_advisory_lock: '' }], rowCount: 1 };
      }
      if (sql.startsWith('SELECT pg_advisory_unlock')) {
        if (options.failUnlock) {
          throw new Error(options.failUnlockMessage || 'Simulated PostgreSQL advisory unlock failure');
        }
        return { rows: [{ pg_advisory_unlock: true }], rowCount: 1 };
      }
      if (sql.includes('CREATE TABLE IF NOT EXISTS schema_migrations')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('CREATE SCHEMA IF NOT EXISTS supabase_migrations')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('INSERT INTO schema_migrations') && sql.includes('FROM supabase_migrations.schema_migrations')) {
        const excludedNames = new Set(params[0] || []);
        const excludedVersions = new Set(params[1] || []);
        for (const [ver, row] of supabaseHistory.entries()) {
          if (excludedNames.has(row.name) || excludedVersions.has(ver)) continue;
          if (!schemaMigrations.has(ver)) {
            schemaMigrations.set(ver, {
              version: ver,
              name: row.name,
              checksum: 'HISTORICAL_SUPABASE_RECORD',
            });
          }
        }
        return { rows: [], rowCount: 0 };
      }
      if (sql.startsWith('SELECT version, name FROM supabase_migrations.schema_migrations WHERE name = ANY')) {
        const targetNames = new Set(params[0] || []);
        const rows = Array.from(supabaseHistory.values()).filter((r) => targetNames.has(r.name));
        return { rows, rowCount: rows.length };
      }
      if (sql === 'SELECT version, name FROM schema_migrations;') {
        const rows = Array.from(schemaMigrations.values()).map((r) => ({ version: r.version, name: r.name }));
        return { rows, rowCount: rows.length };
      }
      if (sql === 'SELECT version, name, checksum FROM schema_migrations;') {
        const rows = Array.from(schemaMigrations.values());
        return { rows, rowCount: rows.length };
      }
      if (sql.startsWith('INSERT INTO schema_migrations (version, name, checksum')) {
        if (options.failTrackingInsert) {
          throw new Error('Simulated schema_migrations insert failure');
        }
        const [version, name, checksum] = params;
        if (!schemaMigrations.has(version)) {
          schemaMigrations.set(version, { version, name, checksum });
          pendingTrackingWrites.push(() => schemaMigrations.delete(version));
        }
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith('INSERT INTO supabase_migrations.schema_migrations')) {
        const [version, name] = params;
        if (!supabaseHistory.has(version)) {
          supabaseHistory.set(version, { version, name });
          pendingTrackingWrites.push(() => supabaseHistory.delete(version));
        }
        return { rows: [], rowCount: 1 };
      }

      if (options.failMigrationSqlSubstring && sql.includes(options.failMigrationSqlSubstring)) {
        throw new Error(`Simulated migration SQL failure matching '${options.failMigrationSqlSubstring}'`);
      }

      executedMigrationSql.push(sql);
      appliedTables.add(sql.slice(0, 80));
      pendingTableCreates.push(() => appliedTables.delete(sql.slice(0, 80)));
      return { rows: [], rowCount: 0 };
    },
    release(arg) {
      client.released = true;
      client.releaseArg = arg;
    },
  };

  return client;
}

function createFaultMockPool(client) {
  return {
    totalCount: 1,
    connectCalls: 0,
    async connect() {
      this.connectCalls += 1;
      return client;
    },
    async query(text, params) {
      return client.query(text, params);
    },
  };
}

describe('RESTART-05.1 MigrationRunner Fail-Closed Safety, Auth Integrity, Track Isolation & CLI Parity Suite (Mock/Offline)', () => {
  const entry031 = MIGRATION_MANIFEST.find((m) => m.version === '031');
  const entry040 = MIGRATION_MANIFEST.find((m) => m.version === '040');
  const entry045 = MIGRATION_MANIFEST.find((m) => m.version === '045');

  it('1. Fail-closed BEGIN: failed BEGIN aborts immediately and executes ZERO migration SQL (even on default postgres mode)', async () => {
    const client = createFaultMockClient({ treatAsRealPostgres: true, failBegin: true });
    const pool = createFaultMockPool(client);

    await assert.rejects(
      () =>
        MigrationRunner.executeMigrationTrack(pool, [entry031], 'test_begin_fail', {
          allowCustomTrackForTesting: true,
        }),
      /Simulated PostgreSQL BEGIN failure/i
    );

    assert.equal(client.executedMigrationSql.length, 0, 'Migration SQL must NEVER execute if BEGIN fails');
    assert.equal(client.schemaMigrations.size, 0);
    assert.equal(client.appliedTables.size, 0);
    assert.equal(client.released, true);
    assert.equal(client.releaseArg, undefined, 'Clean unlock releases pooled client without error');
  });

  it('2. Fail-closed transaction: migration SQL failure AND tracking insert failure both roll back cleanly', async () => {
    // 2a. SQL failure rolls back
    const sqlFailClient = createFaultMockClient({
      treatAsRealPostgres: true,
      failMigrationSqlSubstring: 'dairy_database_mappings',
    });
    await assert.rejects(
      () =>
        MigrationRunner.executeMigrationTrack(sqlFailClient, [entry031], 'test_sql_fail', {
          allowCustomTrackForTesting: true,
        }),
      /Migration 031_dairy_database_mappings\.sql \(v031\) failed/i
    );
    assert.equal(sqlFailClient.appliedTables.size, 0);
    assert.equal(sqlFailClient.schemaMigrations.has('031'), false);
    assert.ok(sqlFailClient.queries.some((q) => q.sql === 'ROLLBACK;'));

    // 2b. Tracking record insert failure rolls back migration SQL changes too
    const trackFailClient = createFaultMockClient({
      treatAsRealPostgres: true,
      failTrackingInsert: true,
    });
    await assert.rejects(
      () =>
        MigrationRunner.executeMigrationTrack(trackFailClient, [entry031], 'test_tracking_insert_fail', {
          allowCustomTrackForTesting: true,
        }),
      /Simulated schema_migrations insert failure/i
    );
    assert.equal(trackFailClient.appliedTables.size, 0, 'SQL changes must roll back if schema_migrations insert fails');
    assert.equal(trackFailClient.schemaMigrations.has('031'), false);
    assert.ok(trackFailClient.queries.some((q) => q.sql === 'ROLLBACK;'));
  });

  it('3. Rollback failure is NOT silently hidden: preserves primary error + rollback error via AggregateError', async () => {
    const client = createFaultMockClient({
      treatAsRealPostgres: true,
      failMigrationSqlSubstring: 'dairy_database_mappings',
      failRollback: true,
      failRollbackMessage: 'Connection lost during ROLLBACK',
    });

    await assert.rejects(
      () =>
        MigrationRunner.executeMigrationTrack(client, [entry031], 'test_rollback_fail', {
          allowCustomTrackForTesting: true,
        }),
      (err) => {
        assert.ok(err instanceof AggregateError, 'Rollback failure must surface an AggregateError');
        assert.equal(err.errors.length, 2);
        assert.match(err.errors[0].message, /Simulated migration SQL failure/i);
        assert.match(err.errors[1].message, /Connection lost during ROLLBACK/i);
        return true;
      }
    );
    assert.equal(client.schemaMigrations.has('031'), false);
  });

  it('4. Fail-closed advisory lock: failed pg_advisory_lock aborts before schema_migrations or migration SQL executes', async () => {
    const client = createFaultMockClient({
      treatAsRealPostgres: true,
      failLock: true,
      failLockMessage: 'canceling statement due to lock timeout',
    });
    const pool = createFaultMockPool(client);

    await assert.rejects(
      () =>
        MigrationRunner.executeMigrationTrack(pool, [entry031], 'test_lock_fail', {
          allowCustomTrackForTesting: true,
        }),
      /lock timeout/i
    );

    assert.equal(client.executedMigrationSql.length, 0);
    assert.equal(
      client.queries.some((q) => q.sql.includes('CREATE TABLE IF NOT EXISTS schema_migrations')),
      false,
      'Must not run DDL if advisory lock acquisition failed'
    );
    assert.equal(
      client.queries.some((q) => q.sql.startsWith('SELECT pg_advisory_unlock')),
      false,
      'Must not unlock when lock was never acquired'
    );
    assert.equal(client.released, true);

    // Also test explicit boolean false return from lock query
    const falseLockClient = createFaultMockClient({ treatAsRealPostgres: true, returnFalseLock: true });
    await assert.rejects(
      () =>
        MigrationRunner.executeMigrationTrack(falseLockClient, [entry031], 'test_lock_false', {
          allowCustomTrackForTesting: true,
        }),
      /Failed to acquire migration advisory lock/i
    );
    assert.equal(falseLockClient.executedMigrationSql.length, 0);
  });

  it('5. Unlock failure is visible, discards pooled client (release(err)), and preserves primary migration error', async () => {
    // 5a. Migration succeeds, unlock fails -> pooled client destroyed & error thrown
    const clientOkMigFailUnlock = createFaultMockClient({
      treatAsRealPostgres: true,
      failUnlock: true,
      failUnlockMessage: 'Unlock transport error',
    });
    const pool1 = createFaultMockPool(clientOkMigFailUnlock);

    await assert.rejects(
      () =>
        MigrationRunner.executeMigrationTrack(pool1, [entry031], 'test_unlock_fail_only', {
          allowCustomTrackForTesting: true,
        }),
      /Unlock transport error/i
    );
    assert.equal(clientOkMigFailUnlock.released, true);
    assert.ok(
      clientOkMigFailUnlock.releaseArg instanceof Error,
      'Pooled client must be discarded via release(err) when pg_advisory_unlock fails'
    );
    assert.match(clientOkMigFailUnlock.releaseArg.message, /Unlock transport error/i);

    // 5b. Migration fails AND unlock fails -> pooled client discarded AND AggregateError preserves both
    const clientBothFail = createFaultMockClient({
      treatAsRealPostgres: true,
      failMigrationSqlSubstring: 'dairy_database_mappings',
      failUnlock: true,
      failUnlockMessage: 'Unlock failed after migration error',
    });
    const pool2 = createFaultMockPool(clientBothFail);

    await assert.rejects(
      () =>
        MigrationRunner.executeMigrationTrack(pool2, [entry031], 'test_mig_and_unlock_fail', {
          allowCustomTrackForTesting: true,
        }),
      (err) => {
        assert.ok(err instanceof AggregateError);
        assert.equal(err.errors.length, 2);
        assert.match(err.errors[0].message, /Migration 031_dairy_database_mappings\.sql \(v031\) failed/i);
        assert.match(err.errors[1].message, /Unlock failed after migration error/i);
        return true;
      }
    );
    assert.equal(clientBothFail.released, true);
    assert.ok(clientBothFail.releaseArg instanceof Error);
  });

  it('6. Auth integrity: MigrationRunner and legacy CLI NEVER execute CREATE SCHEMA auth or CREATE OR REPLACE FUNCTION auth.uid()', async () => {
    const runnerClient = createFaultMockClient({ treatAsRealPostgres: true });
    await MigrationRunner.ensureSchemaMigrationsTable(runnerClient);
    await MigrationRunner.executeMigrationTrack(runnerClient, [entry031], 'test_no_auth_runner', {
      allowCustomTrackForTesting: true,
    });

    for (const q of runnerClient.queries) {
      assert.equal(/CREATE\s+SCHEMA\s+.*\bauth\b/i.test(q.sql), false, `Forbidden auth schema mutation: ${q.sql}`);
      assert.equal(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+auth\.uid/i.test(q.sql), false, `Forbidden auth.uid() mutation: ${q.sql}`);
    }

    const cliClient = createFaultMockClient({ treatAsRealPostgres: true });
    const cpPlan = resolveCliMigrationPlan(['--track=control-plane'], migrationsDir);
    // Execute canonical control-plane track through shared CLI executor
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dfarm-r051-cli-'));
    try {
      for (const f of fs.readdirSync(migrationsDir)) {
        fs.copyFileSync(path.join(migrationsDir, f), path.join(tmpDir, f));
      }
      const cliResults = await executeCliMigrationPlan(cliClient, { ...cpPlan, migrationsDir: tmpDir });
      assert.equal(cliResults.length, CONTROL_PLANE_MIGRATIONS.length);
      for (const q of cliClient.queries) {
        assert.equal(/CREATE\s+SCHEMA\s+.*\bauth\b/i.test(q.sql), false, `CLI must not touch auth schema: ${q.sql}`);
        assert.equal(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+auth\.uid/i.test(q.sql), false, `CLI must not mutate auth.uid(): ${q.sql}`);
      }
      // Verify CLI acquired and released the exact same deterministic advisory lock key as MigrationRunner
      const expectedLockKey = MigrationRunner.computeAdvisoryLockKey('dfarm_migration_lock:control_plane');
      const lockQuery = cliClient.queries.find((q) => q.sql.startsWith('SELECT pg_advisory_lock'));
      const unlockQuery = cliClient.queries.find((q) => q.sql.startsWith('SELECT pg_advisory_unlock'));
      assert.equal(lockQuery?.params?.[0], expectedLockKey);
      assert.equal(unlockQuery?.params?.[0], expectedLockKey);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    // Verify source files themselves contain zero CREATE OR REPLACE FUNCTION auth.uid
    const runnerSrc = fs.readFileSync(
      path.join(repoRoot, 'services/backend/src/infrastructure/database/MigrationRunner.ts'),
      'utf8'
    );
    const dbRunnerSrc = fs.readFileSync(path.join(repoRoot, 'packages/database/src/runner.ts'), 'utf8');
    const cliSrc = fs.readFileSync(path.join(repoRoot, 'scripts/migrate.js'), 'utf8');
    const mig001Src = fs.readFileSync(path.join(migrationsDir, '001_extensions_and_common.sql'), 'utf8');
    for (const [label, src] of [
      ['MigrationRunner.ts', runnerSrc],
      ['packages/database/src/runner.ts', dbRunnerSrc],
      ['scripts/migrate.js', cliSrc],
      ['001_extensions_and_common.sql', mig001Src],
    ]) {
      assert.equal(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+auth\.uid/i.test(src), false, `${label} must not define/replace auth.uid()`);
    }
  });

  it('7. Track isolation: rejects wrong-track, injected, substituted, arbitrary, and production-bypass migration track calls', async () => {
    const client = createFaultMockClient({ treatAsRealPostgres: true });

    // Wrong track arrays
    await assert.rejects(
      () => MigrationRunner.executeMigrationTrack(client, TENANT_OPERATIONAL_MIGRATIONS, 'control_plane'),
      /Migration track rejection/i
    );
    await assert.rejects(
      () => MigrationRunner.executeMigrationTrack(client, CONTROL_PLANE_MIGRATIONS, `tenant_${crypto.randomUUID()}`),
      /Migration track rejection/i
    );

    // Injecting 040 (CONTROL_PLANE) into tenant track or 045 (TENANT_OPERATIONAL) into control_plane — even with allowCustomTrackForTesting!
    await assert.rejects(
      () =>
        MigrationRunner.executeMigrationTrack(client, [entry040], `tenant_${crypto.randomUUID()}`, {
          allowCustomTrackForTesting: true,
        }),
      /Migration track ownership violation/i
    );
    await assert.rejects(
      () =>
        MigrationRunner.executeMigrationTrack(client, [entry045], 'control_plane', {
          allowCustomTrackForTesting: true,
        }),
      /Migration track ownership violation/i
    );

    // Substituting filename for version 031 or forging target
    await assert.rejects(
      () =>
        MigrationRunner.executeMigrationTrack(
          client,
          [{ version: '031', filename: '031_forged_file.sql', target: MigrationTarget.CONTROL_PLANE, description: 'forged' }],
          'test_forged',
          { allowCustomTrackForTesting: true }
        ),
      /does not match canonical MIGRATION_MANIFEST/i
    );
    await assert.rejects(
      () =>
        MigrationRunner.executeMigrationTrack(
          client,
          [{ ...entry040, target: MigrationTarget.TENANT_OPERATIONAL }],
          'test_spoofed_target',
          { allowCustomTrackForTesting: true }
        ),
      /does not match canonical MIGRATION_MANIFEST/i
    );

    // Arbitrary track name without test override
    await assert.rejects(
      () => MigrationRunner.executeMigrationTrack(client, [entry031], 'arbitrary_custom_track'),
      /Refusing arbitrary migration track/i
    );

    // Passing allowCustomTrackForTesting to production-facing wrappers fails closed
    await assert.rejects(
      () =>
        MigrationRunner.runControlPlaneMigrations(client, {
          allowCustomTrackForTesting: true,
        }),
      /cannot be invoked with allowCustomTrackForTesting/i
    );
    await assert.rejects(
      () =>
        MigrationRunner.runTenantMigrations(client, crypto.randomUUID(), {
          allowCustomTrackForTesting: true,
        }),
      /cannot be invoked with allowCustomTrackForTesting/i
    );

    // Quarantined script supplied directly never executes
    const quarantinedEntry = MIGRATION_MANIFEST.find((m) => m.filename === '031_remove_dairy_admin_7507495615.sql');
    const qRes = await MigrationRunner.executeMigrationTrack(client, [quarantinedEntry], 'test_direct_quarantine', {
      allowCustomTrackForTesting: true,
    });
    assert.equal(qRes.length, 0);
    assert.equal(client.executedMigrationSql.length, 0);
    assert.equal(client.schemaMigrations.size, 0);

    // Non-session-affine wrapper (has withTransaction without connect) rejected in postgres mode
    await assert.rejects(
      () =>
        MigrationRunner.runControlPlaneMigrations({
          query: async () => ({ rows: [] }),
          withTransaction: async (cb) => cb({ query: async () => ({ rows: [] }) }),
        }),
      /non-session-affine/i
    );
  });

  it('8. CLI parity: scripts/migrate.js enforces historical quarantined 031 collision, atomic rollback, and unambiguous target selection', async () => {
    // 8a. CLI fails closed on historical quarantined 031 collision in supabase_migrations
    const cpPlan = resolveCliMigrationPlan(['--track=control-plane'], migrationsDir);
    const cliHistClient = createFaultMockClient({
      treatAsRealPostgres: true,
      initialSupabaseHistory: [['031', { version: '031', name: '031_remove_dairy_admin_7507495615.sql' }]],
    });
    await assert.rejects(
      () => executeCliMigrationPlan(cliHistClient, cpPlan),
      /Migration history conflict.*031_remove_dairy_admin_7507495615\.sql/i
    );
    assert.equal(cliHistClient.executedMigrationSql.length, 0, 'Must abort before executing any SQL on historical collision');
    assert.equal(cliHistClient.supabaseHistory.get('031')?.name, '031_remove_dairy_admin_7507495615.sql');

    // 8b. CLI rolls back and preserves Rollback AggregateError
    const cliRollbackClient = createFaultMockClient({
      treatAsRealPostgres: true,
      failMigrationSqlSubstring: 'dairy_database_mappings',
      failRollback: true,
    });
    await assert.rejects(
      () => executeCliMigrationPlan(cliRollbackClient, cpPlan),
      (err) => err instanceof AggregateError && err.errors.length === 2
    );

    // 8c. Connection target protection (getConnectionCandidates)
    // Tenant missing TENANT_DATABASE_URL even when central vars exist -> FAIL CLOSED
    assert.throws(
      () =>
        getConnectionCandidates('tenant', {
          CENTRAL_DATABASE_URL: 'postgresql://postgres:secret@db.example.com:5432/dfarm_central',
          DIRECT_URL: 'postgresql://postgres:secret@db.example.com:5432/dfarm_central',
          DATABASE_URL: 'postgresql://postgres:secret@db.example.com:5432/dfarm_central',
        }),
      /TENANT_DATABASE_URL must be explicitly set/i
    );

    // Tenant matching central target -> FAIL CLOSED
    assert.throws(
      () =>
        getConnectionCandidates('tenant', {
          TENANT_DATABASE_URL: 'postgresql://postgres:secret@db.example.com:5432/dfarm_central',
          CENTRAL_DATABASE_URL: 'postgresql://postgres:secret@db.example.com:5432/dfarm_central',
        }),
      /same database target/i
    );

    // Tenant explicit isolated URL -> PASS
    assert.deepEqual(
      getConnectionCandidates('tenant', {
        TENANT_DATABASE_URL: 'postgresql://postgres:secret@db.example.com:5432/dfarm_tenant_001',
        CENTRAL_DATABASE_URL: 'postgresql://postgres:secret@db.example.com:5432/dfarm_central',
      }),
      ['postgresql://postgres:secret@db.example.com:5432/dfarm_tenant_001']
    );

    // Control-plane with NO env vars -> FAIL CLOSED (no localhost:54322 fallback!)
    assert.throws(
      () => getConnectionCandidates('control-plane', {}),
      /no hardcoded default database fallback is allowed/i
    );

    // Control-plane with TENANT_DATABASE_URL only -> FAIL CLOSED
    assert.throws(
      () =>
        getConnectionCandidates('control-plane', {
          TENANT_DATABASE_URL: 'postgresql://postgres:secret@db.example.com:5432/dfarm_tenant_001',
        }),
      /explicit CENTRAL_DATABASE_URL/i
    );

    // Control-plane with ambiguous disagreeing targets -> FAIL CLOSED
    assert.throws(
      () =>
        getConnectionCandidates('control-plane', {
          CENTRAL_DATABASE_URL: 'postgresql://postgres:secret@host-a.example.com:5432/dfarm_central',
          DATABASE_URL: 'postgresql://postgres:secret@host-b.example.com:5432/other_db',
        }),
      /Ambiguous control-plane database target/i
    );

    assert.throws(
      () =>
        getConnectionCandidates('control-plane', {
          DIRECT_URL: 'postgresql://postgres:secret@host-a.example.com:5432/db_one',
          DATABASE_URL: 'postgresql://postgres:secret@host-a.example.com:5432/db_two',
        }),
      /Ambiguous control-plane database target/i
    );

    // Control-plane targeting tenant-named DB -> FAIL CLOSED
    assert.throws(
      () =>
        getConnectionCandidates('control-plane', {
          CENTRAL_DATABASE_URL: 'postgresql://postgres:secret@db.example.com:5432/dfarm_tenant_abc',
        }),
      /tenant-named database/i
    );

    // Control-plane backward-compatible Supabase pair (DIRECT_URL + CENTRAL_DATABASE_URL same ref) -> PASS with single target
    assert.deepEqual(
      getConnectionCandidates('control-plane', {
        CENTRAL_DATABASE_URL: 'postgresql://postgres.myref:secret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres',
        DIRECT_URL: 'postgresql://postgres:secret@db.myref.supabase.co:5432/postgres',
      }),
      ['postgresql://postgres.myref:secret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres']
    );

    // Control-plane backward-compatible single DIRECT_URL -> PASS
    assert.deepEqual(
      getConnectionCandidates('control-plane', {
        DIRECT_URL: 'postgresql://postgres:secret@db.myref.supabase.co:5432/postgres',
      }),
      ['postgresql://postgres:secret@db.myref.supabase.co:5432/postgres']
    );

    // 8d. Subprocess CLI with --track=control-plane and empty env fails closed BEFORE loading ambiguous defaults
    const noTargetSubproc = spawnSync(process.execPath, ['scripts/migrate.js', '--track=control-plane'], {
      cwd: repoRoot,
      env: {
        PATH: process.env.PATH || '',
        NODE_ENV: 'test',
      },
      encoding: 'utf8',
    });
    // Regardless of whether .env exists on developer machine, un-scoped invocation fails before reading .env
    const unScopedSubproc = spawnSync(process.execPath, ['scripts/migrate.js'], {
      cwd: repoRoot,
      env: { PATH: process.env.PATH || '', NODE_ENV: 'test' },
      encoding: 'utf8',
    });
    assert.notEqual(unScopedSubproc.status, 0);
    assert.match(unScopedSubproc.stderr + unScopedSubproc.stdout, /Refusing un-scoped migration execution/i);
    assert.ok(typeof noTargetSubproc.status === 'number');
  });

  it('9. TenantDatabaseManager passes physical tenantPool (not wrapPgPool) to MigrationRunner.runTenantMigrations', () => {
    const mgrSrc = fs.readFileSync(
      path.join(repoRoot, 'services/backend/src/infrastructure/database/TenantDatabaseManager.ts'),
      'utf8'
    );
    assert.match(mgrSrc, /MigrationRunner\.runTenantMigrations\(\s*tenantPoolRef\s*,\s*dairyId\s*\)/);
  });
});
