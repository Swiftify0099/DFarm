import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import {
  MigrationTarget,
  CONTROL_PLANE_MIGRATIONS,
  TENANT_OPERATIONAL_MIGRATIONS,
  QUARANTINED_MIGRATION_FILENAMES,
  QUARANTINED_MIGRATION_VERSIONS,
  resolveMigrationsDir,
  validateMigrationsDirectory,
} from '@dfarm/database';

// Force IPv4 first to avoid IPv6 timeout on Windows / ISP networks
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const { Client } = pg;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseMigrateArgs(argv) {
  let track = '';
  let dairyId = '';
  let validateOnly = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--validate-only') {
      validateOnly = true;
    } else if (arg.startsWith('--track=')) {
      track = arg.slice('--track='.length).trim();
    } else if (arg === '--track') {
      track = (argv[++i] || '').trim();
    } else if (arg.startsWith('--dairy-id=')) {
      dairyId = arg.slice('--dairy-id='.length).trim();
    } else if (arg === '--dairy-id') {
      dairyId = (argv[++i] || '').trim();
    } else {
      throw new Error(`Unsupported argument '${arg}'. Expected --track=<control-plane|tenant> [--dairy-id=<uuid>] or --validate-only.`);
    }
  }

  return { track, dairyId, validateOnly };
}

/**
 * Resolves and validates the migration execution plan strictly from the canonical
 * @dfarm/database manifest. Fails closed unless an explicit track (or --validate-only) is chosen.
 */
export function resolveCliMigrationPlan(argv, customMigrationsDir) {
  const { track, dairyId, validateOnly } = parseMigrateArgs(argv);
  const migrationsDir = customMigrationsDir || resolveMigrationsDir(process.cwd());
  const catalogSummary = validateMigrationsDirectory(migrationsDir);

  if (validateOnly) {
    return {
      mode: 'validate-only',
      track: null,
      dairyId: null,
      entries: [],
      migrationsDir,
      catalogSummary,
    };
  }

  if (!track) {
    throw new Error(
      'Refusing un-scoped migration execution: explicit --track=control-plane or --track=tenant --dairy-id=<uuid> is required. Use --validate-only to validate the catalog without connecting.'
    );
  }

  const normalizedTrack = track.toLowerCase();
  if (normalizedTrack === 'control-plane' || normalizedTrack === 'control_plane') {
    if (dairyId) {
      throw new Error('Invalid option --dairy-id with --track=control-plane.');
    }
    const entries = CONTROL_PLANE_MIGRATIONS.filter(
      (entry) =>
        entry.target !== MigrationTarget.MANUAL_REVIEW_REQUIRED &&
        !QUARANTINED_MIGRATION_FILENAMES.has(entry.filename) &&
        !QUARANTINED_MIGRATION_VERSIONS.has(entry.version)
    );
    return {
      mode: 'execute',
      track: 'control-plane',
      dairyId: null,
      entries,
      migrationsDir,
      catalogSummary,
    };
  }

  if (normalizedTrack === 'tenant' || normalizedTrack === 'tenant-operational' || normalizedTrack === 'tenant_operational') {
    if (!dairyId || !UUID_REGEX.test(dairyId)) {
      throw new Error('Valid --dairy-id=<uuid> is required when running --track=tenant migrations.');
    }
    const entries = TENANT_OPERATIONAL_MIGRATIONS.filter(
      (entry) =>
        entry.target !== MigrationTarget.MANUAL_REVIEW_REQUIRED &&
        !QUARANTINED_MIGRATION_FILENAMES.has(entry.filename) &&
        !QUARANTINED_MIGRATION_VERSIONS.has(entry.version)
    );
    return {
      mode: 'execute',
      track: 'tenant',
      dairyId,
      entries,
      migrationsDir,
      catalogSummary,
    };
  }

  throw new Error(
    `Invalid --track value '${track}'. Allowed values: control-plane, tenant.`
  );
}

// Helper to determine SSL settings for remote hosts (e.g. Supabase, Neon, Render)
function getSslConfig(connectionString) {
  if (process.env.DATABASE_TLS_MODE === 'disable') {
    return false;
  }
  if (process.env.DATABASE_TLS_MODE === 'require') {
    return { rejectUnauthorized: false };
  }
  if (
    connectionString &&
    !connectionString.includes('127.0.0.1') &&
    !connectionString.includes('localhost')
  ) {
    return { rejectUnauthorized: false };
  }
  return false;
}

// Auto load .env if present (invoked only after CLI track authorization succeeds)
function loadEnv() {
  const envCandidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'services/backend/.env'),
  ];

  for (const envPath of envCandidates) {
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const k = trimmed.slice(0, eqIdx).trim();
            let v = trimmed.slice(eqIdx + 1).trim();
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
              v = v.slice(1, -1);
            }
            if (!v.includes('YOUR_PASSWORD_HERE')) {
              process.env[k] = v;
            } else if (!process.env[k]) {
              process.env[k] = v;
            }
          }
        }
      }
    }
  }
}

function getConnectionCandidates(track) {
  if (track === 'tenant') {
    const tenantUrl = process.env.TENANT_DATABASE_URL && !process.env.TENANT_DATABASE_URL.includes('YOUR_PASSWORD_HERE')
      ? process.env.TENANT_DATABASE_URL
      : null;
    if (!tenantUrl) {
      throw new Error(
        'TENANT_DATABASE_URL must be explicitly set for CLI --track=tenant execution (refusing to fall back to control-plane DIRECT_URL/DATABASE_URL).'
      );
    }
    return [tenantUrl];
  }

  return [
    process.env.CENTRAL_DATABASE_URL && !process.env.CENTRAL_DATABASE_URL.includes('YOUR_PASSWORD_HERE') ? process.env.CENTRAL_DATABASE_URL : null,
    process.env.DIRECT_URL && !process.env.DIRECT_URL.includes('YOUR_PASSWORD_HERE') ? process.env.DIRECT_URL : null,
    process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('YOUR_PASSWORD_HERE') ? process.env.DATABASE_URL : null,
    'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  ].filter(Boolean);
}

async function createConnectedClient(connectionCandidates) {
  for (const uri of connectionCandidates) {
    const ssl = getSslConfig(uri);
    const parsed = new URL(uri);
    const maskedTarget = `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname}`;
    console.log('------------------------------------------------------------');
    console.log('DFARM DATABASE MIGRATION ENGINE');
    console.log('Target Host/DB:', maskedTarget);
    console.log('SSL Mode Enabled:', Boolean(ssl));
    console.log('------------------------------------------------------------');

    const testClient = new Client({
      connectionString: uri,
      ssl,
      connectionTimeoutMillis: 30000,
    });

    try {
      await testClient.connect();
      console.log('Connected to PostgreSQL successfully.\n');
      return testClient;
    } catch (err) {
      console.warn(`Connection attempt to ${maskedTarget} failed: ${err.message}`);
      await testClient.end().catch(() => {});
    }
  }
  throw new Error('All connection attempts timed out. Please check your network or run via Supabase SQL Editor.');
}

async function run() {
  let client = null;
  try {
    // 1. Validate track & canonical manifest BEFORE loading .env or opening any DB connection
    const plan = resolveCliMigrationPlan(process.argv.slice(2));
    if (plan.mode === 'validate-only') {
      console.log('Canonical migration catalog validation PASSED:', plan.catalogSummary);
      return;
    }

    loadEnv();
    const candidates = getConnectionCandidates(plan.track);
    client = await createConnectedClient(candidates);

    // 2. Safely ensure auth helper & canonical migration tracking tables
    try {
      await client.query(`
        CREATE SCHEMA IF NOT EXISTS auth;
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$ BEGIN RETURN NULL; END; $$ LANGUAGE plpgsql STABLE;
      `);
    } catch {
      // In Supabase Cloud, auth schema and auth.uid() are natively managed by supabase_admin
    }

    try {
      await client.query(`
        CREATE SCHEMA IF NOT EXISTS supabase_migrations;
        CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
          version VARCHAR(50) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          statements TEXT[],
          inserted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
    } catch {
      // Restricted Supabase permissions on supabase_migrations schema
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        checksum VARCHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        execution_time_ms INTEGER NOT NULL
      );
    `);

    try {
      await client.query(
        `INSERT INTO schema_migrations (version, name, checksum, applied_at, execution_time_ms)
         SELECT version, name, 'HISTORICAL_SUPABASE_RECORD', inserted_at, 0
         FROM supabase_migrations.schema_migrations
         WHERE name <> ALL($1::text[])
           AND version <> ALL($2::text[])
         ON CONFLICT (version) DO NOTHING;`,
        [
          Array.from(QUARANTINED_MIGRATION_FILENAMES),
          Array.from(QUARANTINED_MIGRATION_VERSIONS),
        ]
      );
    } catch {
      // Ignore if supabase_migrations is absent or restricted
    }

    console.log(`Executing ${plan.entries.length} canonical ${plan.track} migrations.\n`);

    const appliedRes = await client.query(`SELECT version, name, checksum FROM schema_migrations;`);
    const appliedMap = new Map();
    for (const row of appliedRes.rows) {
      appliedMap.set(row.version, { name: row.name, checksum: row.checksum });
    }

    let appliedCount = 0;
    let skippedCount = 0;

    for (const entry of plan.entries) {
      if (
        entry.target === MigrationTarget.MANUAL_REVIEW_REQUIRED ||
        QUARANTINED_MIGRATION_FILENAMES.has(entry.filename)
      ) {
        continue;
      }

      const filePath = path.join(plan.migrationsDir, entry.filename);
      const sql = fs.readFileSync(filePath, 'utf8');
      const checksum = crypto.createHash('sha256').update(sql, 'utf8').digest('hex');

      if (appliedMap.has(entry.version)) {
        const existing = appliedMap.get(entry.version);
        if (
          existing?.name &&
          (QUARANTINED_MIGRATION_FILENAMES.has(existing.name) ||
            (existing.name.endsWith('.sql') && existing.name !== entry.filename))
        ) {
          throw new Error(
            `Migration version conflict for v${entry.version}: database recorded '${existing.name}', manifest expects '${entry.filename}'.`
          );
        }
        if (existing?.checksum && existing.checksum !== 'HISTORICAL_SUPABASE_RECORD' && existing.checksum !== checksum) {
          console.warn(
            `[WARN] Checksum mismatch on v${entry.version} (${entry.filename}); preserving existing database record.`
          );
        }
        skippedCount++;
        continue;
      }

      process.stdout.write(`Executing migration ${entry.filename}... `);
      const start = Date.now();
      try {
        await client.query('BEGIN;');
        await client.query(sql);
        const durationMs = Date.now() - start;
        await client.query(
          `INSERT INTO schema_migrations (version, name, checksum, applied_at, execution_time_ms)
           VALUES ($1, $2, $3, NOW(), $4)
           ON CONFLICT (version) DO NOTHING;`,
          [entry.version, entry.filename, checksum, durationMs]
        );
        try {
          await client.query('SAVEPOINT sp_supabase_hist;');
          await client.query(
            `INSERT INTO supabase_migrations.schema_migrations (version, name, inserted_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (version) DO NOTHING;`,
            [entry.version, entry.filename]
          );
          await client.query('RELEASE SAVEPOINT sp_supabase_hist;');
        } catch {
          await client.query('ROLLBACK TO SAVEPOINT sp_supabase_hist;').catch(() => {});
          await client.query('RELEASE SAVEPOINT sp_supabase_hist;').catch(() => {});
        }
        await client.query('COMMIT;');
        console.log(`DONE (${durationMs}ms)`);
        appliedCount++;
      } catch (migrationErr) {
        await client.query('ROLLBACK;').catch(() => {});
        console.log('FAILED');
        console.error(`\n[CRITICAL] Migration ${entry.filename} failed:`, migrationErr.message);
        throw migrationErr;
      }
    }

    console.log('\n------------------------------------------------------------');
    console.log(`Migration Run Completed (${plan.track}): ${appliedCount} applied, ${skippedCount} already up to date.`);
    console.log('------------------------------------------------------------\n');
  } catch (err) {
    console.error('\nDatabase migration failed:', err.message);
    process.exit(1);
  } finally {
    if (client) {
      await client.end().catch(() => {});
    }
  }
}

const isMainModule =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  run();
}
