import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Enforce strict isolated offline defaults BEFORE dynamically importing backend modules
// so local .env files are never consulted during offline execution.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:59999/offline_test';
process.env.CENTRAL_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:59999/offline_test';
process.env.DATABASE_PROVISIONER_URL = 'postgresql://postgres:postgres@127.0.0.1:59999/offline_test';
process.env.DIRECT_URL = 'postgresql://postgres:postgres@127.0.0.1:59999/offline_test';
process.env.SUPABASE_URL = 'http://127.0.0.1:59998';
process.env.TENANT_POOL_CONNECTION_TIMEOUT_MS = '500';

const dbPackage = await import('../../../packages/database/dist/index.js');
const {
  MigrationRunner,
  MigrationTarget,
  MIGRATION_MANIFEST,
  MIGRATION_FILES,
  CONTROL_PLANE_MIGRATIONS,
  TENANT_OPERATIONAL_MIGRATIONS,
  QUARANTINED_MIGRATIONS,
} = await import('../dist/infrastructure/database/MigrationRunner.js');
const { tenantDbControlService } = await import('../dist/infrastructure/database/TenantDatabaseControlService.js');
const { DeviceChallengeService } = await import('../dist/infrastructure/security/DeviceChallengeService.js');
const { resolveCliMigrationPlan } = await import('../../../scripts/migrate.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');
const migrationsDir = path.join(repoRoot, 'supabase/migrations');

/**
 * Isolated in-memory SQL execution spy simulating PostgreSQL schema_migrations
 * and supabase_migrations.schema_migrations behavior with zero external DB calls.
 */
function createMockMigrationClient(options = {}) {
  const schemaMigrations = new Map(options.initialSchemaMigrations || []);
  const supabaseHistory = new Map(options.initialSupabaseHistory || []);
  const executedSql = [];
  const allQueries = [];
  const txLog = [];
  let pendingRollbacks = [];

  return {
    __isMockClient: true,
    executedSql,
    allQueries,
    txLog,
    schemaMigrations,
    supabaseHistory,
    async query(text, params = []) {
      const sql = String(text).trim();
      allQueries.push(sql);

      if (
        sql.includes('CREATE SCHEMA IF NOT EXISTS auth') ||
        /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+auth\.uid\s*\(/i.test(sql)
      ) {
        throw new Error('FORBIDDEN: MigrationRunner must never create auth schema or overwrite auth.uid()');
      }

      if (sql === 'BEGIN;') {
        txLog.push('BEGIN');
        pendingRollbacks = [];
        return { rows: [], rowCount: 0 };
      }
      if (sql === 'COMMIT;') {
        txLog.push('COMMIT');
        pendingRollbacks = [];
        return { rows: [], rowCount: 0 };
      }
      if (sql === 'ROLLBACK;') {
        txLog.push('ROLLBACK');
        for (const undo of pendingRollbacks.reverse()) {
          undo();
        }
        pendingRollbacks = [];
        return { rows: [], rowCount: 0 };
      }
      if (sql.startsWith('SAVEPOINT') || sql.startsWith('RELEASE SAVEPOINT') || sql.startsWith('ROLLBACK TO SAVEPOINT')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.startsWith('SELECT pg_advisory_lock') || sql.startsWith('SELECT pg_advisory_unlock')) {
        return { rows: [{ pg_advisory_lock: '' }], rowCount: 1 };
      }
      if (
        sql.includes('CREATE SCHEMA IF NOT EXISTS supabase_migrations') ||
        sql.includes('CREATE TABLE IF NOT EXISTS schema_migrations')
      ) {
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
              applied_at: row.inserted_at || new Date().toISOString(),
            });
          }
        }
        return { rows: [], rowCount: 0 };
      }
      if (sql.startsWith('SELECT version, name FROM supabase_migrations.schema_migrations WHERE name = ANY')) {
        const targetNames = new Set(params[0] || []);
        const matches = Array.from(supabaseHistory.values()).filter(r => targetNames.has(r.name));
        return { rows: matches, rowCount: matches.length };
      }
      if (sql === 'SELECT version, name FROM schema_migrations;') {
        const rows = Array.from(schemaMigrations.values()).map(r => ({ version: r.version, name: r.name }));
        return { rows, rowCount: rows.length };
      }
      if (sql === 'SELECT version, name, checksum FROM schema_migrations;') {
        const rows = Array.from(schemaMigrations.values());
        return { rows, rowCount: rows.length };
      }
      if (sql.startsWith('INSERT INTO schema_migrations (version, name, checksum')) {
        const [version, name, checksum] = params;
        if (!schemaMigrations.has(version)) {
          schemaMigrations.set(version, { version, name, checksum, applied_at: new Date().toISOString() });
          pendingRollbacks.push(() => schemaMigrations.delete(version));
        }
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith('INSERT INTO supabase_migrations.schema_migrations')) {
        const [version, name] = params;
        if (!supabaseHistory.has(version)) {
          supabaseHistory.set(version, { version, name, inserted_at: new Date().toISOString() });
          pendingRollbacks.push(() => supabaseHistory.delete(version));
        }
        return { rows: [], rowCount: 1 };
      }

      if (options.failOnSqlSubstring && sql.includes(options.failOnSqlSubstring)) {
        throw new Error(`Simulated PostgreSQL syntax/constraint failure on ${options.failOnSqlSubstring}`);
      }

      executedSql.push(sql);
      return { rows: [], rowCount: 0 };
    },
  };
}

describe('RESTART-05 Migration Manifest Parity, 031/040 Ownership & Runner Safety Suite (Offline)', () => {
  it('1. @dfarm/database and MigrationRunner expose identical canonical manifests and track splits', () => {
    assert.deepEqual(MIGRATION_MANIFEST, dbPackage.MIGRATION_MANIFEST);
    assert.deepEqual(MIGRATION_FILES, dbPackage.MIGRATION_FILES);
    assert.deepEqual(CONTROL_PLANE_MIGRATIONS, dbPackage.CONTROL_PLANE_MIGRATIONS);
    assert.deepEqual(TENANT_OPERATIONAL_MIGRATIONS, dbPackage.TENANT_OPERATIONAL_MIGRATIONS);
    assert.deepEqual(QUARANTINED_MIGRATIONS, dbPackage.QUARANTINED_MIGRATIONS);
  });

  it('2. Migration 040 is CONTROL_PLANE in both manifests, TenantDatabaseControlService, and DeviceChallengeService', () => {
    const entry040Db = dbPackage.MIGRATION_MANIFEST.find(m => m.version === '040');
    const entry040Runner = MIGRATION_MANIFEST.find(m => m.version === '040');
    assert.equal(entry040Db?.target, MigrationTarget.CONTROL_PLANE);
    assert.equal(entry040Runner?.target, MigrationTarget.CONTROL_PLANE);
    assert.equal(
      TENANT_OPERATIONAL_MIGRATIONS.some(m => m.version === '040' || m.filename === '040_device_auth_challenges.sql'),
      false
    );
    assert.ok(CONTROL_PLANE_MIGRATIONS.some(m => m.version === '040' && m.filename === '040_device_auth_challenges.sql'));

    // Verify TenantDatabaseManager isolated memory DB list no longer loads 040 onto tenant test doubles
    const tenantDbMgrSource = fs.readFileSync(
      path.join(repoRoot, 'services/backend/src/infrastructure/database/TenantDatabaseManager.ts'),
      'utf8'
    );
    assert.equal(
      tenantDbMgrSource.includes("'040_device_auth_challenges.sql'"),
      false,
      'TenantDatabaseManager isolated tenant test double must not include control-plane migration 040'
    );

    // Verify DeviceChallengeService strictly routes through central control-plane PostgresPool (never tenantDbManager)
    const dcsSource = fs.readFileSync(
      path.join(repoRoot, 'services/backend/src/infrastructure/security/DeviceChallengeService.ts'),
      'utf8'
    );
    assert.ok(dcsSource.includes("from '../database/PostgresPool.js'"));
    assert.equal(dcsSource.includes('tenantDbManager'), false);
  });

  it('3. DeviceChallengeService preserves cryptographic proof-of-possession and atomic single-use replay protection', async () => {
    const svc = new DeviceChallengeService();
    const rawToken = 'kiosk-device-token-restart05-test-256bit!';
    const derivedKey = DeviceChallengeService.deriveProofKey(rawToken);
    const deviceId = 'KIOSK_R05_01';
    const orgId = '00000000-0000-0000-0000-000000000001';

    const { challenge } = await svc.createChallenge(deviceId, orgId, 60000);
    const proof = DeviceChallengeService.computeProof(challenge, derivedKey, deviceId);
    assert.equal(DeviceChallengeService.verifyProof(challenge, derivedKey, deviceId, proof), true);

    // Wrong device cannot consume Station A's challenge
    const wrongDevice = await svc.verifyAndConsumeProof({
      challenge,
      deviceIdentifier: 'KIOSK_OTHER',
      organizationId: orgId,
      candidateProof: proof,
      proofKeyOrToken: derivedKey,
    });
    assert.equal(wrongDevice.valid, false);

    // Valid device consumes atomically once
    const firstConsume = await svc.verifyAndConsumeProof({
      challenge,
      deviceIdentifier: deviceId,
      organizationId: orgId,
      candidateProof: proof,
      proofKeyOrToken: derivedKey,
    });
    assert.equal(firstConsume.valid, true);

    // Replay is rejected
    const replay = await svc.verifyAndConsumeProof({
      challenge,
      deviceIdentifier: deviceId,
      organizationId: orgId,
      candidateProof: proof,
      proofKeyOrToken: derivedKey,
    });
    assert.equal(replay.valid, false);
    assert.match(replay.reason || '', /replay|already been consumed/i);

    svc.clear();
  });

  it('4. TenantDatabaseControlService schema validation and history reflect updated TENANT_OPERATIONAL_MIGRATIONS count', async () => {
    const origGetTenantContext = tenantDbControlService.getTenantContext.bind(tenantDbControlService);
    const origListTables = tenantDbControlService.listTables.bind(tenantDbControlService);
    tenantDbControlService.getTenantContext = async () => ({ client: null, mapping: null });
    tenantDbControlService.listTables = async () => [{ tableName: 'customers', isView: false }];
    try {
      const history = await tenantDbControlService.getMigrationHistory('00000000-0000-0000-0000-000000000001');
      assert.equal(history.totalManifest, TENANT_OPERATIONAL_MIGRATIONS.length);
      assert.equal(history.tenantOperationalTrack.some(m => m.version === '040'), false);
      assert.equal(history.tenantOperationalTrack.some(m => m.version === '031'), false);
    } finally {
      tenantDbControlService.getTenantContext = origGetTenantContext;
      tenantDbControlService.listTables = origListTables;
    }
  });

  it('5. MigrationRunner skips quarantined 031 even if passed explicitly or spoofed, and never records it', async () => {
    const mockClient = createMockMigrationClient();
    const active031 = MIGRATION_MANIFEST.find(m => m.filename === '031_dairy_database_mappings.sql');
    const spoofedQuarantine = {
      version: '031',
      filename: '031_remove_dairy_admin_7507495615.sql',
      target: MigrationTarget.CONTROL_PLANE, // Spoofed target!
      description: 'Spoofed test',
    };

    const results = await MigrationRunner.executeMigrationTrack(
      mockClient,
      [spoofedQuarantine, active031],
      'test_quarantine_guard',
      { allowCustomTrackForTesting: true, clientCapabilities: { mode: 'mock' } }
    );

    assert.equal(results.length, 1);
    assert.equal(results[0].filename, '031_dairy_database_mappings.sql');
    assert.equal(results[0].status, 'APPLIED');
    assert.equal(
      mockClient.executedSql.some(s => s.includes('031_remove_dairy_admin_7507495615')),
      false
    );
    assert.equal(
      Array.from(mockClient.schemaMigrations.values()).some(r => r.name.includes('remove_dairy_admin')),
      false
    );
  });

  it('6. MigrationRunner preserves existing history, flags checksum mismatch visibly, and never overwrites checksum', async () => {
    const active031 = MIGRATION_MANIFEST.find(m => m.filename === '031_dairy_database_mappings.sql');
    const originalChecksum = 'deadbeef'.repeat(8);
    const mockClient = createMockMigrationClient({
      initialSchemaMigrations: [
        [
          '031',
          {
            version: '031',
            name: '031_dairy_database_mappings.sql',
            checksum: originalChecksum,
            applied_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      ],
    });

    const results = await MigrationRunner.executeMigrationTrack(
      mockClient,
      [active031],
      'test_checksum_mismatch',
      { allowCustomTrackForTesting: true, clientCapabilities: { mode: 'mock' } }
    );

    assert.equal(results.length, 1);
    assert.equal(results[0].status, 'SKIPPED_ALREADY_APPLIED');
    assert.equal(results[0].checksumMismatch, true);
    assert.equal(results[0].storedChecksum, originalChecksum);
    assert.equal(mockClient.executedSql.length, 0, 'Already-applied migration must not be re-executed');
    assert.equal(
      mockClient.schemaMigrations.get('031').checksum,
      originalChecksum,
      'Stored checksum in schema_migrations must NOT be silently overwritten'
    );
  });

  it('7. MigrationRunner fails closed on version filename conflict without replacing or skipping silently', async () => {
    const active031 = MIGRATION_MANIFEST.find(m => m.filename === '031_dairy_database_mappings.sql');
    const mockClient = createMockMigrationClient({
      initialSchemaMigrations: [
        [
          '031',
          {
            version: '031',
            name: '031_some_other_migration.sql',
            checksum: 'a'.repeat(64),
          },
        ],
      ],
    });

    await assert.rejects(
      () =>
        MigrationRunner.executeMigrationTrack(
          mockClient,
          [active031],
          'test_filename_conflict',
          { allowCustomTrackForTesting: true, clientCapabilities: { mode: 'mock' } }
        ),
      /Migration version conflict for v031/i
    );
    assert.equal(mockClient.schemaMigrations.get('031').name, '031_some_other_migration.sql');
    assert.equal(mockClient.executedSql.length, 0);
  });

  it('8. MigrationRunner blocks historical quarantined record occupying active version 031 in supabase_migrations', async () => {
    const active031 = MIGRATION_MANIFEST.find(m => m.filename === '031_dairy_database_mappings.sql');
    const mockClient = createMockMigrationClient({
      initialSupabaseHistory: [
        ['031', { version: '031', name: '031_remove_dairy_admin_7507495615.sql' }],
      ],
    });

    await assert.rejects(
      () =>
        MigrationRunner.executeMigrationTrack(
          mockClient,
          [active031],
          'test_supabase_hist_collision',
          { allowCustomTrackForTesting: true, clientCapabilities: { mode: 'mock' } }
        ),
      /Migration history conflict.*031_remove_dairy_admin_7507495615\.sql/i
    );
    assert.equal(mockClient.schemaMigrations.has('031'), false);
  });

  it('9. MigrationRunner rolls back and propagates SQL errors without recording failed migration', async () => {
    const entry031 = MIGRATION_MANIFEST.find(m => m.version === '031');
    const entry040 = MIGRATION_MANIFEST.find(m => m.version === '040');
    const mockClient = createMockMigrationClient({
      failOnSqlSubstring: 'device_auth_challenges',
    });

    await assert.rejects(
      () =>
        MigrationRunner.executeMigrationTrack(
          mockClient,
          [entry031, entry040],
          'test_failure_propagation',
          { allowCustomTrackForTesting: true, clientCapabilities: { mode: 'mock' } }
        ),
      /Migration 040_device_auth_challenges\.sql \(v040\) failed/i
    );

    assert.equal(mockClient.schemaMigrations.has('031'), true);
    assert.equal(mockClient.schemaMigrations.has('040'), false);
    assert.ok(mockClient.txLog.includes('ROLLBACK'));
  });

  it('10. scripts/migrate.js enforces canonical track ownership and fails closed without explicit --track', () => {
    // CLI fail-closed tests via subprocess (never connects to any DB!)
    const noArgs = spawnSync(process.execPath, ['scripts/migrate.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.notEqual(noArgs.status, 0);
    assert.match(noArgs.stderr + noArgs.stdout, /explicit --track=control-plane or --track=tenant/i);

    const tenantNoId = spawnSync(process.execPath, ['scripts/migrate.js', '--track=tenant'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert.notEqual(tenantNoId.status, 0);
    assert.match(tenantNoId.stderr + tenantNoId.stdout, /Valid --dairy-id=<uuid> is required/i);

    const invalidTrack = spawnSync(process.execPath, ['scripts/migrate.js', '--track=bogus'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert.notEqual(invalidTrack.status, 0);
    assert.match(invalidTrack.stderr + invalidTrack.stdout, /Invalid --track value/i);

    const validateOnly = spawnSync(process.execPath, ['scripts/migrate.js', '--validate-only'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert.equal(validateOnly.status, 0, `validate-only failed: ${validateOnly.stderr}`);
    assert.match(validateOnly.stdout, /Canonical migration catalog validation PASSED/i);

    // Track resolution verification
    const cpPlan = resolveCliMigrationPlan(['--track=control-plane'], migrationsDir);
    assert.equal(cpPlan.track, 'control-plane');
    assert.ok(cpPlan.entries.some(e => e.version === '031' && e.filename === '031_dairy_database_mappings.sql'));
    assert.ok(cpPlan.entries.some(e => e.version === '040' && e.filename === '040_device_auth_challenges.sql'));
    assert.equal(cpPlan.entries.some(e => e.filename.includes('remove_dairy_admin')), false);
    assert.equal(cpPlan.entries.some(e => e.version === '045'), false);

    const tenantPlan = resolveCliMigrationPlan(
      ['--track=tenant', `--dairy-id=${crypto.randomUUID()}`],
      migrationsDir
    );
    assert.equal(tenantPlan.track, 'tenant');
    assert.equal(tenantPlan.entries.some(e => e.version === '031'), false);
    assert.equal(tenantPlan.entries.some(e => e.version === '040'), false);
    assert.equal(tenantPlan.entries.some(e => e.filename.includes('remove_dairy_admin')), false);
    assert.ok(tenantPlan.entries.some(e => e.version === '045'));
  });
});
