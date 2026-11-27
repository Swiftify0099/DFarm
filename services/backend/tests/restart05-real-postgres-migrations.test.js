import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { assertDisposablePg17Cluster } from '../../../scripts/pg17-safety-guard.js';
import { createPoolShutdownManager } from './helpers/pool-lifecycle-helpers.js';
import {
  MigrationRunner,
  MigrationTarget,
  MIGRATION_MANIFEST,
  CONTROL_PLANE_MIGRATIONS,
  TENANT_OPERATIONAL_MIGRATIONS,
  QUARANTINED_MIGRATIONS,
} from '../dist/infrastructure/database/MigrationRunner.js';

const { Pool } = pg;
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

test('RESTART-05 Real PostgreSQL 17.12 Migration Reconciliation, 031/040 Ownership & Atomicity Gate', async (suite) => {
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

  const ctrlUrl = makeDbUrl(TEST_PG_URL, dbNameCtrl);
  const tenantUrl = makeDbUrl(TEST_PG_URL, dbNameTenant);
  const negUrl = makeDbUrl(TEST_PG_URL, dbNameNeg);

  const adminPool = attachPoolErrorGuard(
    new Pool({ connectionString: TEST_PG_URL, connectionTimeoutMillis: 5000, max: 3 }),
    'adminPool'
  );

  let poolCtrl;
  let poolTenant;
  let poolNeg;
  let dbModuleRef = null;
  const createdDatabases = [];
  const tempDirs = [];
  const orgId = crypto.randomUUID();
  let primaryError = null;

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
    await adminPool.query(`CREATE DATABASE ${dbNameCtrl};`);
    createdDatabases.push(dbNameCtrl);
    await adminPool.query(`CREATE DATABASE ${dbNameTenant};`);
    createdDatabases.push(dbNameTenant);
    await adminPool.query(`CREATE DATABASE ${dbNameNeg};`);
    createdDatabases.push(dbNameNeg);

    poolCtrl = attachPoolErrorGuard(new Pool({ connectionString: ctrlUrl, max: 5 }), 'poolCtrl');
    poolTenant = attachPoolErrorGuard(new Pool({ connectionString: tenantUrl, max: 5 }), 'poolTenant');
    poolNeg = attachPoolErrorGuard(new Pool({ connectionString: negUrl, max: 3 }), 'poolNeg');

    await suite.test('1. Control-plane and tenant-operational tracks apply cleanly with exact version isolation', async () => {
      const ctrlRes = await MigrationRunner.runControlPlaneMigrations(poolCtrl);
      const tenantRes = await MigrationRunner.runTenantMigrations(poolTenant, orgId);

      assert.equal(ctrlRes.length, CONTROL_PLANE_MIGRATIONS.length);
      assert.equal(tenantRes.length, TENANT_OPERATIONAL_MIGRATIONS.length);
      assert.ok(ctrlRes.every(r => r.status === 'APPLIED'));
      assert.ok(tenantRes.every(r => r.status === 'APPLIED'));

      // Verify tracking table contents in Control Plane
      const ctrlTracked = await poolCtrl.query(`SELECT version, name, checksum FROM schema_migrations ORDER BY version ASC;`);
      assert.equal(ctrlTracked.rows.length, CONTROL_PLANE_MIGRATIONS.length);
      assert.deepEqual(
        ctrlTracked.rows.map(r => r.version),
        CONTROL_PLANE_MIGRATIONS.map(m => m.version).sort()
      );
      assert.ok(ctrlTracked.rows.every(r => typeof r.checksum === 'string' && r.checksum.length === 64));

      // Verify tracking table contents in Tenant DB
      const tenantTracked = await poolTenant.query(`SELECT version, name, checksum FROM schema_migrations ORDER BY version ASC;`);
      assert.equal(tenantTracked.rows.length, TENANT_OPERATIONAL_MIGRATIONS.length);
      assert.deepEqual(
        tenantTracked.rows.map(r => r.version),
        TENANT_OPERATIONAL_MIGRATIONS.map(m => m.version).sort()
      );
      assert.ok(tenantTracked.rows.every(r => typeof r.checksum === 'string' && r.checksum.length === 64));
    });

    await suite.test('2. Migration 031 and 040 tables & tracking exist ONLY on CONTROL_PLANE and never on TENANT_OPERATIONAL', async () => {
      // 031: dairy_database_mappings
      const ctrl031Tbl = await poolCtrl.query(`SELECT to_regclass('public.dairy_database_mappings') AS reg;`);
      const tenant031Tbl = await poolTenant.query(`SELECT to_regclass('public.dairy_database_mappings') AS reg;`);
      assert.ok(ctrl031Tbl.rows[0].reg, 'dairy_database_mappings (031) must exist on control-plane DB');
      assert.equal(tenant031Tbl.rows[0].reg, null, 'dairy_database_mappings (031) must NOT exist on tenant DB');

      // 040: device_auth_challenges
      const ctrl040Tbl = await poolCtrl.query(`SELECT to_regclass('public.device_auth_challenges') AS reg;`);
      const tenant040Tbl = await poolTenant.query(`SELECT to_regclass('public.device_auth_challenges') AS reg;`);
      assert.ok(ctrl040Tbl.rows[0].reg, 'device_auth_challenges (040) must exist on control-plane DB');
      assert.equal(tenant040Tbl.rows[0].reg, null, 'device_auth_challenges (040) must NOT exist on tenant DB');

      // Other control-plane-only vs tenant-only separation
      assert.ok((await poolCtrl.query(`SELECT to_regclass('public.revoked_tokens') AS reg;`)).rows[0].reg);
      assert.equal((await poolTenant.query(`SELECT to_regclass('public.revoked_tokens') AS reg;`)).rows[0].reg, null);
      assert.ok((await poolTenant.query(`SELECT to_regclass('public.milk_collections') AS reg;`)).rows[0].reg);
      assert.equal((await poolCtrl.query(`SELECT to_regclass('public.milk_collections') AS reg;`)).rows[0].reg, null);

      // Version rows verification
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
      assert.ok(secondCtrl.every(r => r.status === 'SKIPPED_ALREADY_APPLIED' && r.checksumMismatch === false));
      assert.ok(secondTenant.every(r => r.status === 'SKIPPED_ALREADY_APPLIED' && r.checksumMismatch === false));

      const after031 = await poolCtrl.query(`SELECT applied_at, checksum FROM schema_migrations WHERE version = '031';`);
      const after040 = await poolCtrl.query(`SELECT applied_at, checksum FROM schema_migrations WHERE version = '040';`);
      assert.equal(after031.rows[0].checksum, before031.rows[0].checksum);
      assert.equal(after040.rows[0].checksum, before040.rows[0].checksum);
      assert.equal(
        new Date(after031.rows[0].applied_at).getTime(),
        new Date(before031.rows[0].applied_at).getTime()
      );
      assert.equal(
        new Date(after040.rows[0].applied_at).getTime(),
        new Date(before040.rows[0].applied_at).getTime()
      );
    });

    await suite.test('5. Real PG17 DeviceChallengeService against control-plane DB supports atomic single-use replay protection', async () => {
      process.env['NODE_ENV'] = 'test';
      process.env['REQUIRE_REAL_POSTGRES'] = '1';
      process.env['DATABASE_TLS_MODE'] = 'disable';
      process.env['CENTRAL_DATABASE_URL'] = ctrlUrl;
      process.env['DATABASE_URL'] = ctrlUrl;
      process.env['TENANT_POOL_CONNECTION_TIMEOUT_MS'] = '5000';

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

      // Verify persisted directly in control-plane device_auth_challenges
      const insertedRow = await poolCtrl.query(
        `SELECT device_identifier, organization_id, consumed_at FROM device_auth_challenges WHERE challenge = $1;`,
        [challenge]
      );
      assert.equal(insertedRow.rows.length, 1);
      assert.equal(insertedRow.rows[0].device_identifier, deviceId);
      assert.equal(insertedRow.rows[0].consumed_at, null);

      // Concurrent verification across two backend instances: strictly 1 succeeds
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
      assert.equal([r1, r2].filter(r => r.valid).length, 1);
      assert.equal([r1, r2].filter(r => !r.valid).length, 1);

      // Replay rejected after consumption
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

    await suite.test('6. Negative PG17 history safety: checksum mismatch preserved, filename conflict blocked, SQL failure rolls back atomically', async () => {
      // A. Checksum mismatch is visible without overwriting stored checksum on poolCtrl
      const original040 = await poolCtrl.query(`SELECT checksum FROM schema_migrations WHERE version = '040';`);
      const tamperedChecksum = 'f'.repeat(64);
      await poolCtrl.query(`UPDATE schema_migrations SET checksum = $1 WHERE version = '040';`, [tamperedChecksum]);
      try {
        const rerun = await MigrationRunner.runControlPlaneMigrations(poolCtrl);
        const r40 = rerun.find(r => r.version === '040');
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

      // B. Conflicting filename in schema_migrations fails closed without silently replacing or skipping
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

      // C. Atomic rollback & error propagation on real PostgreSQL 17 using isolated disposable poolNeg + temp migration copy
      const tmpMigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dfarm-r05-neg-'));
      tempDirs.push(tmpMigDir);
      const realMigDir = path.join(repoRoot, 'supabase/migrations');
      for (const f of fs.readdirSync(realMigDir)) {
        fs.copyFileSync(path.join(realMigDir, f), path.join(tmpMigDir, f));
      }
      // Overwrite 031 in TEMP copy with partial DDL + deliberate invalid SQL to prove atomic rollback
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

      // Table created before error in 031 MUST be rolled back, and v031 MUST NOT be recorded in schema_migrations
      const rolledBackTbl = await poolNeg.query(`SELECT to_regclass('public.should_rollback_temp_tbl') AS reg;`);
      assert.equal(rolledBackTbl.rows[0].reg, null, 'Failed migration DDL must roll back atomically on PostgreSQL 17');
      const v031Row = await poolNeg.query(`SELECT version FROM schema_migrations WHERE version = '031';`);
      assert.equal(v031Row.rows.length, 0, 'Failed migration must NOT be recorded in schema_migrations');
      const v030Row = await poolNeg.query(`SELECT version FROM schema_migrations WHERE version = '030';`);
      assert.equal(v030Row.rows.length, 1, 'Preceding valid migration 030 must remain committed');

      // D. Fresh unmigrated tenant DB fails closed if queried for table instead of silently skipping
      await assert.rejects(
        () => poolNeg.query(`SELECT * FROM milk_collections LIMIT 1;`),
        /relation "milk_collections" does not exist/i
      );
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
    if (poolCtrl) await safeClose(() => closePoolCleanly(poolCtrl), 'closePoolCleanly(poolCtrl)');
    if (poolTenant) await safeClose(() => closePoolCleanly(poolTenant), 'closePoolCleanly(poolTenant)');
    if (poolNeg) await safeClose(() => closePoolCleanly(poolNeg), 'closePoolCleanly(poolNeg)');

    for (const dbName of createdDatabases) {
      await safeClose(async () => {
        await waitForDbIdle(dbName);
        await adminPool.query(`DROP DATABASE IF EXISTS ${dbName};`);
      }, `drop(${dbName})`);
    }

    await safeClose(() => closePoolCleanly(adminPool), 'closePoolCleanly(adminPool)');

    for (const dir of tempDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {}
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
