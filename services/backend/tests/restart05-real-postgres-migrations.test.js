import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { assertDisposablePg17Cluster } from '../../../scripts/pg17-safety-guard.js';
import { ensureDisposableTestAuthUid } from '../../../scripts/pg17-test-auth-bootstrap.js';
import { createPoolShutdownManager } from './helpers/pool-lifecycle-helpers.js';

const { Pool, Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');
const TEST_PG_URL = process.env['TEST_POSTGRES_URL'] || '';

async function canConnectRealPostgres(url) {
  if (!url) return false;
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 2000 });
  try {
    const res = await pool.query('SELECT version() AS v;');
    return Boolean(res.rows[0]?.v);
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => {});
  }
}

function makeDbUrl(baseUrl, dbName) {
  const u = new URL(baseUrl);
  u.pathname = `/${dbName}`;
  return u.toString();
}

test('RESTART-05 Real PostgreSQL 17.12 Migration Reconciliation, Lock/Tx Safety, Auth Integrity & CLI Parity Gate', async (suite) => {
  const reachable = await canConnectRealPostgres(TEST_PG_URL);
  if (!reachable) {
    const msg = 'Real PostgreSQL 17 server unavailable (TEST_POSTGRES_URL unset or unreachable).';
    if (process.env['REQUIRE_REAL_POSTGRES'] === '1') {
      assert.fail(`REQUIRE_REAL_POSTGRES=1 gate failed: ${msg}`);
    }
    console.log(`[RESTART-05 REAL PG] ${msg} Marked as SKIP / NOT RUN (no pg-mem fallback).`);
    suite.skip(msg);
    return;
  }

  const preflight = await assertDisposablePg17Cluster({ connectionString: TEST_PG_URL });
  assert.ok(preflight.serverVersionNum >= 170000 && preflight.serverVersionNum < 180000);

  const poolErrors = [];
  const guardedPools = new WeakSet();
  const attachPoolErrorGuard = (pool, label) => {
    if (!pool || guardedPools.has(pool)) return pool;
    guardedPools.add(pool);
    pool.on('error', (err) => {
      poolErrors.push({ label, code: err?.code, message: err?.message || String(err) });
    });
    return pool;
  };

  const { closePoolCleanly } = createPoolShutdownManager();
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  const dbNameCtrl = `dfarm_r05_ctrl_${suffix}`;
  const dbNameTenant = `dfarm_r05_ten_${suffix}`;
  const dbNameNeg = `dfarm_r05_neg_${suffix}`;
  const dbNameLock = `dfarm_r05_lck_${suffix}`;
  const dbNameBlank = `dfarm_r05_blk_${suffix}`;
  const dbNameNativeAuth = `dfarm_r05_nat_${suffix}`;
  const dbNameCliCtrl = `dfarm_r05_clic_${suffix}`;
  const dbNameCliTenant = `dfarm_r05_clit_${suffix}`;
  const dbNameCliHist = `dfarm_r05_clih_${suffix}`;

  const ctrlUrl = makeDbUrl(TEST_PG_URL, dbNameCtrl);
  const tenantUrl = makeDbUrl(TEST_PG_URL, dbNameTenant);
  const negUrl = makeDbUrl(TEST_PG_URL, dbNameNeg);
  const lockUrl = makeDbUrl(TEST_PG_URL, dbNameLock);
  const blankUrl = makeDbUrl(TEST_PG_URL, dbNameBlank);
  const nativeAuthUrl = makeDbUrl(TEST_PG_URL, dbNameNativeAuth);
  const cliCtrlUrl = makeDbUrl(TEST_PG_URL, dbNameCliCtrl);
  const cliTenantUrl = makeDbUrl(TEST_PG_URL, dbNameCliTenant);
  const cliHistUrl = makeDbUrl(TEST_PG_URL, dbNameCliHist);

  // Set isolated disposable env vars BEFORE dynamically importing any backend module (prevents config/env.js from caching stale defaults or reading .env)
  process.env['NODE_ENV'] = 'test';
  process.env['REQUIRE_REAL_POSTGRES'] = '1';
  process.env['TEST_REAL_POSTGRES'] = '1';
  process.env['DATABASE_TLS_MODE'] = 'disable';
  process.env['CENTRAL_DATABASE_URL'] = ctrlUrl;
  process.env['DATABASE_URL'] = ctrlUrl;
  process.env['DATABASE_PROVISIONER_URL'] = ctrlUrl;
  process.env['SUPABASE_URL'] = 'http://127.0.0.1:59998';
  process.env['SUPABASE_ANON_KEY'] = 'placeholder_supabase_anon_key_for_test';
  process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'placeholder_supabase_service_role_key_for_test';
  process.env['TENANT_POOL_CONNECTION_TIMEOUT_MS'] = '5000';

  const {
    MigrationRunner,
    MigrationTarget,
    CONTROL_PLANE_MIGRATIONS,
    TENANT_OPERATIONAL_MIGRATIONS,
    QUARANTINED_MIGRATIONS,
  } = await import('../dist/infrastructure/database/MigrationRunner.js');
  const { executeCliMigrationPlan, resolveCliMigrationPlan } = await import('../../../scripts/migrate.js');

  const adminPool = attachPoolErrorGuard(
    new Pool({ connectionString: TEST_PG_URL, connectionTimeoutMillis: 5000, max: 3 }),
    'adminPool'
  );

  const trackedPools = [];
  const createdDatabases = [];
  const tempDirs = [];
  const orgId = crypto.randomUUID();
  let dbModuleRef = null;
  let primaryError = null;

  const registerPool = (url, label, max = 5) => {
    const pool = attachPoolErrorGuard(new Pool({ connectionString: url, max }), label);
    trackedPools.push({ pool, label });
    return pool;
  };

  const waitForDbIdle = async (dbName) => {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const res = await adminPool.query(
        `SELECT COUNT(*)::int AS cnt FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid();`,
        [dbName]
      );
      if (Number(res.rows[0]?.cnt || 0) === 0) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const finalRes = await adminPool.query(
      `SELECT COUNT(*)::int AS cnt FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid();`,
      [dbName]
    );
    const remaining = Number(finalRes.rows[0]?.cnt || 0);
    if (remaining > 0) {
      throw new Error(`Disposable database '${dbName}' still has ${remaining} active connection(s) before DROP DATABASE.`);
    }
  };

  try {
    for (const dbName of [dbNameCtrl, dbNameTenant, dbNameNeg, dbNameLock, dbNameCliCtrl, dbNameCliTenant, dbNameCliHist]) {
      await adminPool.query(`CREATE DATABASE ${dbName};`);
      createdDatabases.push(dbName);
    }
    // Create blank & native-auth DBs from template0 so template1's test auth.uid() is NOT pre-installed
    for (const dbName of [dbNameBlank, dbNameNativeAuth]) {
      await adminPool.query(`CREATE DATABASE ${dbName} TEMPLATE template0;`);
      createdDatabases.push(dbName);
    }

    const poolCtrl = registerPool(ctrlUrl, 'poolCtrl', 5);
    const poolTenant = registerPool(tenantUrl, 'poolTenant', 5);
    const poolNeg = registerPool(negUrl, 'poolNeg', 3);
    const poolLock = registerPool(lockUrl, 'poolLock', 4);
    const poolBlank = registerPool(blankUrl, 'poolBlank', 3);
    const poolNativeAuth = registerPool(nativeAuthUrl, 'poolNativeAuth', 3);
    const poolCliCtrl = registerPool(cliCtrlUrl, 'poolCliCtrl', 3);
    const poolCliTenant = registerPool(cliTenantUrl, 'poolCliTenant', 3);
    const poolCliHist = registerPool(cliHistUrl, 'poolCliHist', 3);

    await suite.test('1. Control-plane and tenant-operational tracks apply cleanly with exact version isolation', async () => {
      const ctrlRes = await MigrationRunner.runControlPlaneMigrations(poolCtrl);
      const tenantRes = await MigrationRunner.runTenantMigrations(poolTenant, orgId);

      assert.equal(ctrlRes.length, CONTROL_PLANE_MIGRATIONS.length);
      assert.equal(tenantRes.length, TENANT_OPERATIONAL_MIGRATIONS.length);
      assert.ok(ctrlRes.every((r) => r.status === 'APPLIED'));
      assert.ok(tenantRes.every((r) => r.status === 'APPLIED'));

      const ctrlTracked = await poolCtrl.query(`SELECT version, name, checksum FROM schema_migrations ORDER BY version ASC;`);
      assert.equal(ctrlTracked.rows.length, CONTROL_PLANE_MIGRATIONS.length);
      assert.deepEqual(
        ctrlTracked.rows.map((r) => r.version),
        CONTROL_PLANE_MIGRATIONS.map((m) => m.version).sort()
      );
      assert.ok(ctrlTracked.rows.every((r) => typeof r.checksum === 'string' && r.checksum.length === 64));

      const tenantTracked = await poolTenant.query(`SELECT version, name, checksum FROM schema_migrations ORDER BY version ASC;`);
      assert.equal(tenantTracked.rows.length, TENANT_OPERATIONAL_MIGRATIONS.length);
      assert.deepEqual(
        tenantTracked.rows.map((r) => r.version),
        TENANT_OPERATIONAL_MIGRATIONS.map((m) => m.version).sort()
      );
      assert.ok(tenantTracked.rows.every((r) => typeof r.checksum === 'string' && r.checksum.length === 64));
    });

    await suite.test('2. Migration 031 and 040 tables & tracking exist ONLY on CONTROL_PLANE and never on TENANT_OPERATIONAL', async () => {
      const ctrl031Tbl = await poolCtrl.query(`SELECT to_regclass('public.dairy_database_mappings') AS reg;`);
      const tenant031Tbl = await poolTenant.query(`SELECT to_regclass('public.dairy_database_mappings') AS reg;`);
      assert.ok(ctrl031Tbl.rows[0].reg);
      assert.equal(tenant031Tbl.rows[0].reg, null);

      const ctrl040Tbl = await poolCtrl.query(`SELECT to_regclass('public.device_auth_challenges') AS reg;`);
      const tenant040Tbl = await poolTenant.query(`SELECT to_regclass('public.device_auth_challenges') AS reg;`);
      assert.ok(ctrl040Tbl.rows[0].reg);
      assert.equal(tenant040Tbl.rows[0].reg, null);

      assert.ok((await poolCtrl.query(`SELECT to_regclass('public.revoked_tokens') AS reg;`)).rows[0].reg);
      assert.equal((await poolTenant.query(`SELECT to_regclass('public.revoked_tokens') AS reg;`)).rows[0].reg, null);
      assert.ok((await poolTenant.query(`SELECT to_regclass('public.milk_collections') AS reg;`)).rows[0].reg);
      assert.equal((await poolCtrl.query(`SELECT to_regclass('public.milk_collections') AS reg;`)).rows[0].reg, null);

      assert.equal((await poolCtrl.query(`SELECT COUNT(*)::int AS c FROM schema_migrations WHERE version IN ('031', '040');`)).rows[0].c, 2);
      assert.equal((await poolTenant.query(`SELECT COUNT(*)::int AS c FROM schema_migrations WHERE version IN ('031', '040');`)).rows[0].c, 0);
    });

    await suite.test('3. Quarantined migration 031_remove_dairy_admin_7507495615.sql was NEVER executed or recorded', async () => {
      assert.equal(QUARANTINED_MIGRATIONS.length, 1);
      assert.equal(QUARANTINED_MIGRATIONS[0].filename, '031_remove_dairy_admin_7507495615.sql');
      assert.equal(QUARANTINED_MIGRATIONS[0].target, MigrationTarget.MANUAL_REVIEW_REQUIRED);

      for (const [label, pool] of [['CONTROL_PLANE', poolCtrl], ['TENANT', poolTenant]]) {
        const smRes = await pool.query(
          `SELECT COUNT(*)::int AS c FROM schema_migrations WHERE name LIKE '%remove_dairy_admin%' OR version LIKE '%quarantine%';`
        );
        assert.equal(smRes.rows[0].c, 0, `${label}: quarantined migration must never appear in schema_migrations`);

        const supaRes = await pool.query(
          `SELECT COUNT(*)::int AS c FROM supabase_migrations.schema_migrations WHERE name LIKE '%remove_dairy_admin%' OR version LIKE '%quarantine%';`
        );
        assert.equal(supaRes.rows[0].c, 0, `${label}: quarantined migration must never appear in supabase_migrations.schema_migrations`);
      }
    });

    await suite.test('4. Second execution skips all already-applied migrations safely and preserves history', async () => {
      const before031 = await poolCtrl.query(`SELECT applied_at, checksum FROM schema_migrations WHERE version = '031';`);
      const before040 = await poolCtrl.query(`SELECT applied_at, checksum FROM schema_migrations WHERE version = '040';`);

      const secondCtrl = await MigrationRunner.runControlPlaneMigrations(poolCtrl);
      const secondTenant = await MigrationRunner.runTenantMigrations(poolTenant, orgId);

      assert.equal(secondCtrl.length, CONTROL_PLANE_MIGRATIONS.length);
      assert.equal(secondTenant.length, TENANT_OPERATIONAL_MIGRATIONS.length);
      assert.ok(secondCtrl.every((r) => r.status === 'SKIPPED_ALREADY_APPLIED' && r.checksumMismatch === false));
      assert.ok(secondTenant.every((r) => r.status === 'SKIPPED_ALREADY_APPLIED' && r.checksumMismatch === false));

      const after031 = await poolCtrl.query(`SELECT applied_at, checksum FROM schema_migrations WHERE version = '031';`);
      const after040 = await poolCtrl.query(`SELECT applied_at, checksum FROM schema_migrations WHERE version = '040';`);
      assert.equal(after031.rows[0].checksum, before031.rows[0].checksum);
      assert.equal(after040.rows[0].checksum, before040.rows[0].checksum);
      assert.equal(new Date(after031.rows[0].applied_at).getTime(), new Date(before031.rows[0].applied_at).getTime());
      assert.equal(new Date(after040.rows[0].applied_at).getTime(), new Date(before040.rows[0].applied_at).getTime());
    });

    await suite.test('5. Real PG17 DeviceChallengeService against control-plane DB supports atomic single-use replay protection', async () => {
      const { db } = await import('../dist/infrastructure/database/PostgresPool.js');
      dbModuleRef = db;
      attachPoolErrorGuard(db.pool, 'globalDbPool');

      const { DeviceChallengeService } = await import('../dist/infrastructure/security/DeviceChallengeService.js');
      await poolCtrl.query(
        `INSERT INTO organizations (id, name, code, status)
         VALUES ($1, 'R05 PG17 Dairy', $2, 'ACTIVE')
         ON CONFLICT (id) DO NOTHING;`,
        [orgId, `R05_${suffix}`]
      );

      const svcA = new DeviceChallengeService();
      const svcB = new DeviceChallengeService();
      const deviceId = `PG17_KIOSK_${suffix}`;
      const rawToken = 'pg17-kiosk-provisioning-secret-token-256bit!';
      const proofKey = DeviceChallengeService.deriveProofKey(rawToken);

      const { challenge } = await svcA.createChallenge(deviceId, orgId, 60000);
      const proof = DeviceChallengeService.computeProof(challenge, proofKey, deviceId);

      const insertedRow = await poolCtrl.query(
        `SELECT device_identifier, organization_id, consumed_at FROM device_auth_challenges WHERE challenge = $1;`,
        [challenge]
      );
      assert.equal(insertedRow.rows.length, 1);
      assert.equal(insertedRow.rows[0].device_identifier, deviceId);
      assert.equal(insertedRow.rows[0].consumed_at, null);

      const [r1, r2] = await Promise.all([
        svcA.verifyAndConsumeProof({
          challenge,
          deviceIdentifier: deviceId,
          organizationId: orgId,
          candidateProof: proof,
          proofKeyOrToken: proofKey,
        }),
        svcB.verifyAndConsumeProof({
          challenge,
          deviceIdentifier: deviceId,
          organizationId: orgId,
          candidateProof: proof,
          proofKeyOrToken: proofKey,
        }),
      ]);
      assert.equal([r1, r2].filter((r) => r.valid).length, 1);
      assert.equal([r1, r2].filter((r) => !r.valid).length, 1);

      const replay = await svcB.verifyAndConsumeProof({
        challenge,
        deviceIdentifier: deviceId,
        organizationId: orgId,
        candidateProof: proof,
        proofKeyOrToken: proofKey,
      });
      assert.equal(replay.valid, false);
      assert.match(replay.reason || '', /already been consumed|replay/i);

      svcA.clear();
      svcB.clear();
    });

    await suite.test('6. Negative PG17 history & transaction safety: checksum mismatch, filename conflict, BEGIN/SQL/tracking/rollback failure', async () => {
      // A. Checksum mismatch preserved without overwriting stored checksum
      const original040 = await poolCtrl.query(`SELECT checksum FROM schema_migrations WHERE version = '040';`);
      const tamperedChecksum = 'f'.repeat(64);
      await poolCtrl.query(`UPDATE schema_migrations SET checksum = $1 WHERE version = '040';`, [tamperedChecksum]);
      try {
        const rerun = await MigrationRunner.runControlPlaneMigrations(poolCtrl);
        const r40 = rerun.find((r) => r.version === '040');
        assert.equal(r40?.status, 'SKIPPED_ALREADY_APPLIED');
        assert.equal(r40?.checksumMismatch, true);
        assert.equal(r40?.storedChecksum, tamperedChecksum);
        const afterTamperCheck = await poolCtrl.query(`SELECT checksum FROM schema_migrations WHERE version = '040';`);
        assert.equal(afterTamperCheck.rows[0].checksum, tamperedChecksum);
      } finally {
        await poolCtrl.query(`UPDATE schema_migrations SET checksum = $1 WHERE version = '040';`, [
          original040.rows[0].checksum,
        ]);
      }

      // B. Conflicting filename in schema_migrations fails closed
      const originalName = await poolCtrl.query(`SELECT name FROM schema_migrations WHERE version = '031';`);
      await poolCtrl.query(`UPDATE schema_migrations SET name = '031_conflicting_file.sql' WHERE version = '031';`);
      try {
        await assert.rejects(
          () => MigrationRunner.runControlPlaneMigrations(poolCtrl),
          /Migration version conflict for v031/i
        );
      } finally {
        await poolCtrl.query(`UPDATE schema_migrations SET name = $1 WHERE version = '031';`, [
          originalName.rows[0].name,
        ]);
      }

      // C. Failed BEGIN on real PG17 client aborts immediately without executing migration SQL
      const realClientForBegin = await poolNeg.connect();
      try {
        const beginQueries = [];
        const beginFailWrapper = {
          __migrationCapabilities: {
            mode: 'postgres',
            supportsTransactions: true,
            supportsAdvisoryLocks: true,
            supportsSavepoints: true,
            supportsSupabaseMigrationsSync: true,
          },
          async query(sql, params) {
            const trimmed = String(sql).trim();
            beginQueries.push(trimmed);
            if (trimmed === 'BEGIN;') {
              throw new Error('Injected real-PG BEGIN failure');
            }
            return realClientForBegin.query(sql, params);
          },
        };
        await assert.rejects(
          () => MigrationRunner.runControlPlaneMigrations(beginFailWrapper),
          /Injected real-PG BEGIN failure/i
        );
        assert.ok(beginQueries.some((q) => q.startsWith('SELECT pg_advisory_lock')));
        assert.ok(beginQueries.includes('BEGIN;'));
        assert.ok(beginQueries.some((q) => q.startsWith('SELECT pg_advisory_unlock')));
        const smCheck = await poolNeg.query(`SELECT COUNT(*)::int AS c FROM schema_migrations;`);
        assert.equal(smCheck.rows[0].c, 0, 'No migrations may be applied when BEGIN fails');
        const orgReg = await poolNeg.query(`SELECT to_regclass('public.organizations') AS reg;`);
        assert.equal(orgReg.rows[0].reg, null, 'No DDL may run when BEGIN fails');
      } finally {
        realClientForBegin.release();
      }

      // D. Atomic SQL rollback & tracking-insert rollback + AggregateError rollback failure on real PG17
      const tmpMigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dfarm-r05-neg-'));
      tempDirs.push(tmpMigDir);
      const realMigDir = path.join(repoRoot, 'supabase/migrations');
      for (const f of fs.readdirSync(realMigDir)) {
        fs.copyFileSync(path.join(realMigDir, f), path.join(tmpMigDir, f));
      }
      fs.writeFileSync(
        path.join(tmpMigDir, '031_dairy_database_mappings.sql'),
        `CREATE TABLE IF NOT EXISTS should_rollback_temp_tbl (id INT PRIMARY KEY);\nINVALID SQL STATEMENT TO FORCE ROLLBACK;\n`,
        'utf8'
      );

      await assert.rejects(
        () =>
          MigrationRunner.runControlPlaneMigrations(poolNeg, {
            migrationsDir: tmpMigDir,
          }),
        /Migration 031_dairy_database_mappings\.sql \(v031\) failed/i
      );

      assert.equal((await poolNeg.query(`SELECT to_regclass('public.should_rollback_temp_tbl') AS reg;`)).rows[0].reg, null);
      assert.equal((await poolNeg.query(`SELECT version FROM schema_migrations WHERE version = '031';`)).rows.length, 0);
      assert.equal((await poolNeg.query(`SELECT version FROM schema_migrations WHERE version = '030';`)).rows.length, 1);

      const isPerMigrationTrackingInsert = (sql) => {
        const normalized = String(sql).replace(/\s+/g, ' ').trim();
        return (
          normalized.startsWith('INSERT INTO schema_migrations (version, name, checksum') &&
          /\bVALUES\s*\(/i.test(normalized)
        );
      };

      const createFaultInjectingSessionClient = (realClient, faultOpts) => {
        const observedQueries = [];
        const observedPids = new Set();
        let inTxTableReg = null;
        let inTxPid = null;
        let rollbackExecutedOnRealPg = false;

        return {
          observedQueries,
          observedPids,
          getInTxState: () => ({ inTxTableReg, inTxPid, rollbackExecutedOnRealPg }),
          clientWrapper: {
            __migrationCapabilities: {
              mode: 'postgres',
              supportsTransactions: true,
              supportsAdvisoryLocks: true,
              supportsSavepoints: true,
              supportsSupabaseMigrationsSync: true,
            },
            async query(sql, params) {
              const trimmed = String(sql).trim();
              observedQueries.push(trimmed);

              if (isPerMigrationTrackingInsert(trimmed)) {
                const probe = await realClient.query(
                  `SELECT to_regclass('public.dairy_database_mappings') AS reg, pg_backend_pid() AS pid;`
                );
                inTxTableReg = probe.rows[0]?.reg || null;
                inTxPid = Number(probe.rows[0]?.pid || 0);
                observedPids.add(inTxPid);
                throw new Error(faultOpts.trackingErrorMessage);
              }

              if (trimmed === 'ROLLBACK;') {
                await realClient.query('ROLLBACK;');
                const afterRb = await realClient.query(`SELECT pg_backend_pid() AS pid;`);
                observedPids.add(Number(afterRb.rows[0]?.pid || 0));
                rollbackExecutedOnRealPg = true;
                if (faultOpts.rollbackErrorMessage) {
                  throw new Error(faultOpts.rollbackErrorMessage);
                }
                return { rows: [], rowCount: 0 };
              }

              const res = await realClient.query(sql, params);
              if (trimmed === 'BEGIN;') {
                const beginPidRes = await realClient.query(`SELECT pg_backend_pid() AS pid;`);
                observedPids.add(Number(beginPidRes.rows[0]?.pid || 0));
              }
              return res;
            },
          },
        };
      };

      // E. Tracking insert failure rolls back valid DDL on real PG17 (same PostgreSQL session)
      const valid031Sql = fs.readFileSync(path.join(realMigDir, '031_dairy_database_mappings.sql'), 'utf8');
      fs.writeFileSync(path.join(tmpMigDir, '031_dairy_database_mappings.sql'), valid031Sql, 'utf8');
      const trackClient = await poolNeg.connect();
      try {
        const expectedPid = Number((await trackClient.query(`SELECT pg_backend_pid() AS pid;`)).rows[0].pid);
        const harness = createFaultInjectingSessionClient(trackClient, {
          trackingErrorMessage: 'Simulated tracking insert failure on PG17',
        });

        await assert.rejects(
          () => MigrationRunner.runControlPlaneMigrations(harness.clientWrapper, { migrationsDir: tmpMigDir }),
          /Simulated tracking insert failure on PG17/i
        );

        const state = harness.getInTxState();
        assert.ok(harness.observedQueries.includes('BEGIN;'), 'Migration transaction must begin');
        assert.ok(
          harness.observedQueries.some((q) => q.includes('CREATE TABLE IF NOT EXISTS dairy_database_mappings')),
          'Migration 031 SQL must execute before tracking insert failure'
        );
        assert.match(String(state.inTxTableReg || ''), /dairy_database_mappings/, 'Migration 031 DDL must be visible inside uncommitted transaction');
        assert.equal(state.inTxPid, expectedPid, 'Tracking insert must execute on the same PostgreSQL session as BEGIN');
        assert.equal(state.rollbackExecutedOnRealPg, true, 'Tracking insert failure must trigger ROLLBACK;');
        assert.deepEqual(Array.from(harness.observedPids), [expectedPid], 'BEGIN, DDL/tracking insert, and ROLLBACK must share one PG session');
        assert.equal((await poolNeg.query(`SELECT to_regclass('public.dairy_database_mappings') AS reg;`)).rows[0].reg, null);
        assert.equal((await poolNeg.query(`SELECT version FROM schema_migrations WHERE version = '031';`)).rows.length, 0);
      } finally {
        trackClient.release();
      }

      // F. Rollback failure also preserved via AggregateError on real PG17
      const rbClient = await poolNeg.connect();
      let rbDiscardClient = false;
      try {
        const expectedPid = Number((await rbClient.query(`SELECT pg_backend_pid() AS pid;`)).rows[0].pid);
        const harness = createFaultInjectingSessionClient(rbClient, {
          trackingErrorMessage: 'Primary tracking insert failure',
          rollbackErrorMessage: 'Simulated ROLLBACK transport error',
        });

        await assert.rejects(
          () => MigrationRunner.runControlPlaneMigrations(harness.clientWrapper, { migrationsDir: tmpMigDir }),
          (err) =>
            err instanceof AggregateError &&
            err.errors.length === 2 &&
            /Primary tracking insert failure/.test(err.errors[0].message) &&
            /Simulated ROLLBACK transport error/.test(err.errors[1].message)
        );

        const state = harness.getInTxState();
        assert.ok(harness.observedQueries.includes('BEGIN;'), 'Migration transaction must begin');
        assert.ok(
          harness.observedQueries.some((q) => q.includes('CREATE TABLE IF NOT EXISTS dairy_database_mappings')),
          'Migration 031 SQL must execute before tracking insert failure'
        );
        assert.match(String(state.inTxTableReg || ''), /dairy_database_mappings/, 'Migration 031 DDL must have run on the session before tracking failure');
        assert.equal(state.inTxPid, expectedPid, 'Tracking insert must run on the exact same PostgreSQL session');
        assert.equal(state.rollbackExecutedOnRealPg, true, 'Tracking insert failure must trigger ROLLBACK;');
        assert.deepEqual(Array.from(harness.observedPids), [expectedPid], 'BEGIN, tracking insert, and ROLLBACK must execute on the same PG session');
        assert.equal((await poolNeg.query(`SELECT to_regclass('public.dairy_database_mappings') AS reg;`)).rows[0].reg, null);
        assert.equal((await poolNeg.query(`SELECT version FROM schema_migrations WHERE version = '031';`)).rows.length, 0);
        rbDiscardClient = true;
      } finally {
        rbClient.release(rbDiscardClient ? new Error('Simulated ROLLBACK transport error cleanup') : undefined);
      }
    });

    await suite.test('7. Real PG17 advisory lock affinity, contention blocking, independent track locks & unlock-failure client destruction', async () => {
      const cpLockKey = MigrationRunner.computeAdvisoryLockKey('dfarm_migration_lock:control_plane');
      const tenantLockKey = MigrationRunner.computeAdvisoryLockKey(`dfarm_migration_lock:tenant_${orgId}`);
      assert.notEqual(cpLockKey, tenantLockKey);

      const holderClient = new Client({ connectionString: lockUrl });
      const contenderClient = new Client({ connectionString: lockUrl });
      await holderClient.connect();
      await contenderClient.connect();
      try {
        // 7a. Holder acquires control-plane lock; second session cannot acquire same lock
        await holderClient.query(`SELECT pg_advisory_lock($1::bigint);`, [cpLockKey]);
        const trySame = await contenderClient.query(`SELECT pg_try_advisory_lock($1::bigint) AS acquired;`, [cpLockKey]);
        assert.equal(trySame.rows[0].acquired, false, 'Second session must NOT acquire held control-plane lock');

        // 7b. Different track (tenant) CAN acquire its own independent lock concurrently
        const tryTenant = await contenderClient.query(`SELECT pg_try_advisory_lock($1::bigint) AS acquired;`, [tenantLockKey]);
        assert.equal(tryTenant.rows[0].acquired, true, 'Independent tenant track lock must succeed while control-plane lock is held');
        await contenderClient.query(`SELECT pg_advisory_unlock($1::bigint);`, [tenantLockKey]);

        // 7c. Runner with lockTimeoutMs fails closed before creating schema_migrations or executing SQL
        await assert.rejects(
          () => MigrationRunner.runControlPlaneMigrations(poolLock, { lockTimeoutMs: 100 }),
          /lock timeout|canceling statement/i
        );
        assert.equal((await poolLock.query(`SELECT to_regclass('public.schema_migrations') AS reg;`)).rows[0].reg, null);
        assert.equal((await poolLock.query(`SELECT to_regclass('public.organizations') AS reg;`)).rows[0].reg, null);

        // 7d. Release holder lock -> contender can now acquire and run migrations
        await holderClient.query(`SELECT pg_advisory_unlock($1::bigint);`, [cpLockKey]);
        const afterUnlock = await MigrationRunner.runControlPlaneMigrations(poolLock);
        assert.equal(afterUnlock.length, CONTROL_PLANE_MIGRATIONS.length);
      } finally {
        await holderClient.end();
        await contenderClient.end();
      }

      // 7e. Unlock failure discards pooled client instead of returning potentially session-locked connection to pool
      const unlockPool = attachPoolErrorGuard(new Pool({ connectionString: ctrlUrl, max: 2 }), 'unlockTestPool');
      const removedClients = [];
      const releasedEvents = [];
      let checkedOutRealClient = null;
      let failedBackendPid = null;
      let resolveRemoved;
      const removedPromise = new Promise((resolve) => {
        resolveRemoved = resolve;
      });
      const onRemove = (client) => {
        removedClients.push(client);
        resolveRemoved(client);
      };
      const onRelease = (err, client) => {
        releasedEvents.push({ err, client });
      };
      unlockPool.on('remove', onRemove);
      unlockPool.on('release', onRelease);

      const origConnect = unlockPool.connect.bind(unlockPool);
      const unlockFailPoolWrapper = {
        __migrationCapabilities: {
          mode: 'postgres',
          supportsTransactions: true,
          supportsAdvisoryLocks: true,
          supportsSavepoints: true,
          supportsSupabaseMigrationsSync: true,
        },
        get totalCount() {
          return unlockPool.totalCount;
        },
        async connect() {
          const realClient = await origConnect();
          checkedOutRealClient = realClient;
          const pidRes = await realClient.query(`SELECT pg_backend_pid() AS pid;`);
          failedBackendPid = Number(pidRes.rows[0].pid);
          return {
            __migrationCapabilities: {
              mode: 'postgres',
              supportsTransactions: true,
              supportsAdvisoryLocks: true,
              supportsSavepoints: true,
              supportsSupabaseMigrationsSync: true,
            },
            async query(sql, params) {
              if (String(sql).trim().startsWith('SELECT pg_advisory_unlock')) {
                throw new Error('Injected real-PG unlock failure');
              }
              return realClient.query(sql, params);
            },
            release(err) {
              return realClient.release(err);
            },
          };
        },
        query(sql, params) {
          return unlockPool.query(sql, params);
        },
      };

      let removeTimer;
      try {
        await assert.rejects(
          () => MigrationRunner.runControlPlaneMigrations(unlockFailPoolWrapper),
          /Injected real-PG unlock failure/i
        );

        // pg-pool removes the client from _clients synchronously on release(err), then ends the TCP
        // socket asynchronously and emits 'remove' inside client.end()'s callback.
        assert.equal(unlockPool.totalCount, 0, 'Failed unlock must immediately remove client from pool totalCount');
        assert.equal(unlockPool.idleCount, 0, 'Failed unlock must never return the client to the idle pool');
        assert.equal(unlockPool.waitingCount, 0);
        assert.equal(releasedEvents.length, 1);
        assert.ok(releasedEvents[0].err instanceof Error);
        assert.match(releasedEvents[0].err.message, /Injected real-PG unlock failure/i);
        assert.equal(releasedEvents[0].client, checkedOutRealClient);

        if (removedClients.length === 0) {
          await Promise.race([
            removedPromise,
            new Promise((resolve) => {
              removeTimer = setTimeout(resolve, 5000);
            }),
          ]);
        }

        assert.equal(removedClients.length, 1, 'Failed unlock must destroy/remove pooled client instead of returning it idle');
        assert.equal(removedClients[0], checkedOutRealClient);

        // Wait briefly if PostgreSQL backend process is still tearing down after socket close
        const procDeadline = Date.now() + 3000;
        while (Date.now() < procDeadline) {
          const actRes = await adminPool.query(
            `SELECT COUNT(*)::int AS cnt FROM pg_stat_activity WHERE pid = $1;`,
            [failedBackendPid]
          );
          if (Number(actRes.rows[0]?.cnt || 0) === 0) break;
          await new Promise((resolve) => setTimeout(resolve, 25));
        }

        // Subsequent connection must receive a fresh, healthy PostgreSQL session with no stale advisory lock held
        const healthyClient = await unlockPool.connect();
        try {
          const healthRes = await healthyClient.query(`SELECT pg_backend_pid() AS pid, 1 AS ok;`);
          assert.equal(healthRes.rows[0].ok, 1);
          const healthyPid = Number(healthRes.rows[0].pid);
          assert.notEqual(
            healthyPid,
            failedBackendPid,
            'Subsequent pool connection must use a fresh healthy session, never the discarded session'
          );

          const lockCheck = await healthyClient.query(
            `SELECT pg_try_advisory_lock($1::bigint) AS acquired;`,
            [cpLockKey]
          );
          assert.equal(
            lockCheck.rows[0].acquired,
            true,
            'Discarded session termination must release the session advisory lock cleanly'
          );
          await healthyClient.query(`SELECT pg_advisory_unlock($1::bigint);`, [cpLockKey]);
        } finally {
          healthyClient.release();
        }

        assert.equal(unlockPool.totalCount, 1);
        assert.equal(unlockPool.idleCount, 1);
        assert.equal(unlockPool.waitingCount, 0);
      } finally {
        if (removeTimer) clearTimeout(removeTimer);
        unlockPool.off('remove', onRemove);
        unlockPool.off('release', onRelease);
        await closePoolCleanly(unlockPool, 'unlockTestPool');
      }
    });

    await suite.test('8. Real PG17 auth.uid() integrity: runner never creates or overwrites native auth.uid(), and isolated test bootstrap works', async () => {
      // 8a. Blank template0 DB: MigrationRunner runs control-plane without creating auth schema;
      // isolated test bootstrap creates auth.uid() only when absent
      const cpBlankRes = await MigrationRunner.runControlPlaneMigrations(poolBlank);
      assert.equal(cpBlankRes.length, CONTROL_PLANE_MIGRATIONS.length);
      const authSchemaRes = await poolBlank.query(`SELECT nspname FROM pg_namespace WHERE nspname = 'auth';`);
      assert.equal(authSchemaRes.rows.length, 0, 'MigrationRunner must NEVER create auth schema in production/blank DB');
      const blankBoot = await ensureDisposableTestAuthUid(poolBlank, { connectionString: blankUrl });
      assert.equal(blankBoot.created, true);
      assert.equal(blankBoot.preservedExisting, false);
      assert.equal((await poolBlank.query(`SELECT auth.uid() AS uid;`)).rows[0].uid, null);

      // 8b. Native auth.uid() simulation: create custom auth.uid() returning fixed sentinel UUID; neither MigrationRunner nor CLI overwrites it
      const sentinelUuid = '11111111-1111-1111-1111-111111111111';
      await poolNativeAuth.query(`CREATE SCHEMA auth;`);
      await poolNativeAuth.query(`
        CREATE FUNCTION auth.uid() RETURNS uuid AS $$
        BEGIN
          RETURN '${sentinelUuid}'::uuid;
        END;
        $$ LANGUAGE plpgsql STABLE;
      `);

      // Run tenant migrations via MigrationRunner (includes 010, 020, 022, 027 referencing auth.uid())
      const natRes = await MigrationRunner.runTenantMigrations(poolNativeAuth, orgId);
      assert.equal(natRes.length, TENANT_OPERATIONAL_MIGRATIONS.length);

      // Verify native auth.uid() was NEVER overwritten
      const uidAfterRunner = await poolNativeAuth.query(`SELECT auth.uid()::text AS uid;`);
      assert.equal(uidAfterRunner.rows[0].uid, sentinelUuid, 'MigrationRunner must NEVER overwrite native auth.uid()');

      // Verify isolated test bootstrap helper also preserves existing auth.uid()
      const bootstrapRes = await ensureDisposableTestAuthUid(poolNativeAuth, { connectionString: nativeAuthUrl });
      assert.equal(bootstrapRes.created, false);
      assert.equal(bootstrapRes.preservedExisting, true);
      const uidAfterBootstrap = await poolNativeAuth.query(`SELECT auth.uid()::text AS uid;`);
      assert.equal(uidAfterBootstrap.rows[0].uid, sentinelUuid);

      // Verify RLS policies remain enabled and enforce isolation
      const rlsTbl = await poolNativeAuth.query(
        `SELECT relrowsecurity FROM pg_class WHERE relname = 'customers' AND relnamespace = 'public'::regnamespace;`
      );
      assert.equal(rlsTbl.rows[0]?.relrowsecurity, true);

      // Verify CLI shared executor ALSO preserves native auth.uid() on second execution
      const cliTenantPlan = resolveCliMigrationPlan(
        ['--track=tenant', `--dairy-id=${orgId}`],
        path.join(repoRoot, 'supabase/migrations')
      );
      await executeCliMigrationPlan(poolNativeAuth, cliTenantPlan);
      const uidAfterCli = await poolNativeAuth.query(`SELECT auth.uid()::text AS uid;`);
      assert.equal(uidAfterCli.rows[0].uid, sentinelUuid, 'Legacy CLI must NEVER overwrite native auth.uid()');
    });

    await suite.test('9. Real PG17 legacy CLI parity & historical quarantine collision protection', async () => {
      const cleanChildEnv = {
        PATH: process.env['PATH'] || '',
        SYSTEMROOT: process.env['SYSTEMROOT'] || '',
        NODE_ENV: 'test',
        DATABASE_TLS_MODE: 'disable',
      };

      // 9a. Run real scripts/migrate.js --track=control-plane via subprocess against disposable dbNameCliCtrl
      const cpProc = spawnSync(process.execPath, ['scripts/migrate.js', '--track=control-plane'], {
        cwd: repoRoot,
        env: { ...cleanChildEnv, CENTRAL_DATABASE_URL: cliCtrlUrl },
        encoding: 'utf8',
      });
      assert.equal(cpProc.status, 0, `CLI control-plane failed: ${cpProc.stderr}\n${cpProc.stdout}`);
      assert.ok((await poolCliCtrl.query(`SELECT to_regclass('public.dairy_database_mappings') AS r;`)).rows[0].r);
      assert.ok((await poolCliCtrl.query(`SELECT to_regclass('public.device_auth_challenges') AS r;`)).rows[0].r);
      assert.equal((await poolCliCtrl.query(`SELECT to_regclass('public.milk_collections') AS r;`)).rows[0].r, null);

      // 9b. Run real scripts/migrate.js --track=tenant --dairy-id=<uuid> via subprocess against disposable dbNameCliTenant
      const tenProc = spawnSync(
        process.execPath,
        ['scripts/migrate.js', '--track=tenant', `--dairy-id=${orgId}`],
        {
          cwd: repoRoot,
          env: { ...cleanChildEnv, TENANT_DATABASE_URL: cliTenantUrl },
          encoding: 'utf8',
        }
      );
      assert.equal(tenProc.status, 0, `CLI tenant failed: ${tenProc.stderr}\n${tenProc.stdout}`);
      assert.ok((await poolCliTenant.query(`SELECT to_regclass('public.milk_collections') AS r;`)).rows[0].r);
      assert.equal((await poolCliTenant.query(`SELECT to_regclass('public.dairy_database_mappings') AS r;`)).rows[0].r, null);
      assert.equal((await poolCliTenant.query(`SELECT to_regclass('public.device_auth_challenges') AS r;`)).rows[0].r, null);

      // 9c. Historical quarantined 031 collision in supabase_migrations fails closed in CLI without applying 031
      await poolCliHist.query(`
        CREATE SCHEMA IF NOT EXISTS supabase_migrations;
        CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
          version VARCHAR(50) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          statements TEXT[],
          inserted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        INSERT INTO supabase_migrations.schema_migrations (version, name)
        VALUES ('031', '031_remove_dairy_admin_7507495615.sql');
      `);
      const histProc = spawnSync(process.execPath, ['scripts/migrate.js', '--track=control-plane'], {
        cwd: repoRoot,
        env: { ...cleanChildEnv, CENTRAL_DATABASE_URL: cliHistUrl },
        encoding: 'utf8',
      });
      assert.notEqual(histProc.status, 0, 'CLI must fail closed when quarantined 031 occupies version 031 in supabase_migrations');
      assert.match(histProc.stderr + histProc.stdout, /Migration history conflict.*031_remove_dairy_admin_7507495615\.sql/i);
      assert.equal((await poolCliHist.query(`SELECT to_regclass('public.dairy_database_mappings') AS r;`)).rows[0].r, null);
      const preservedRow = await poolCliHist.query(`SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = '031';`);
      assert.equal(preservedRow.rows[0]?.name, '031_remove_dairy_admin_7507495615.sql');
    });
  } catch (err) {
    primaryError = err;
  } finally {
    const cleanupErrors = [];
    const safeClose = async (fn, label) => {
      try {
        await fn();
      } catch (e) {
        cleanupErrors.push(new Error(`${label}: ${e?.message || String(e)}`));
      }
    };

    if (dbModuleRef) {
      await safeClose(() => dbModuleRef.close(), 'db.close');
    }

    for (const { pool, label } of trackedPools) {
      await safeClose(() => closePoolCleanly(pool, label), `closePoolCleanly(${label})`);
    }

    for (const dbName of [...createdDatabases].reverse()) {
      await safeClose(async () => {
        await waitForDbIdle(dbName);
        await adminPool.query(`DROP DATABASE IF EXISTS ${dbName};`);
      }, `drop(${dbName})`);
    }

    await safeClose(() => closePoolCleanly(adminPool, 'adminPool'), 'closePoolCleanly(adminPool)');

    for (const dir of tempDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (e) {
        cleanupErrors.push(new Error(`rmSync(${dir}): ${e?.message || String(e)}`));
      }
    }

    if (poolErrors.length > 0) {
      cleanupErrors.push(new Error(`Unexpected async pool errors: ${JSON.stringify(poolErrors)}`));
    }

    if (primaryError && cleanupErrors.length > 0) {
      throw new AggregateError([primaryError, ...cleanupErrors], `${primaryError.message}; cleanup errors also occurred`);
    }
    if (primaryError) throw primaryError;
    if (cleanupErrors.length === 1) throw cleanupErrors[0];
    if (cleanupErrors.length > 1) {
      throw new AggregateError(cleanupErrors, `Cleanup failed with ${cleanupErrors.length} error(s)`);
    }
  }
});
