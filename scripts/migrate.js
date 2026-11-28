import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns';
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
  executeMigrationTrackCore,
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

function isPlaceholderValue(val) {
  const trimmed = String(val || '').trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  if (
    lower.includes('your_password_here') ||
    lower.includes('your-password') ||
    lower.includes('your-project-ref') ||
    lower.includes('your-ref')
  ) {
    return true;
  }
  if (process.env.NODE_ENV !== 'test' && lower.includes('placeholder_')) {
    return true;
  }
  return false;
}

function parseValidatedPostgresUrl(raw, varName) {
  const trimmed = String(raw || '').trim();
  if (!trimmed || isPlaceholderValue(trimmed)) {
    throw new Error(`${varName} contains an empty or placeholder connection string.`);
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`${varName} is not a valid PostgreSQL connection URL.`);
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error(`${varName} must use postgres:// or postgresql:// protocol (got '${parsed.protocol}').`);
  }
  const dbName = parsed.pathname.replace(/^\//, '');
  if (!dbName) {
    throw new Error(`${varName} must explicitly specify a target database name in its path.`);
  }
  return { url: trimmed, parsed, dbName };
}

function extractTargetIdentity(parsed) {
  const host = parsed.hostname.toLowerCase();
  const port = parsed.port || '5432';
  const dbName = parsed.pathname.replace(/^\//, '');
  const username = decodeURIComponent(parsed.username || '');

  let supabaseRef = null;
  const dbHostMatch = /^db\.([a-z0-9-]+)\.supabase\.co$/i.exec(host);
  if (dbHostMatch) {
    supabaseRef = dbHostMatch[1].toLowerCase();
  } else if (host.endsWith('.pooler.supabase.com')) {
    const userMatch = /^[^.]+\.([a-z0-9-]+)$/i.exec(username);
    if (userMatch) {
      supabaseRef = userMatch[1].toLowerCase();
    }
  }

  return { host, port, dbName, supabaseRef };
}

function areSameTarget(a, b) {
  const idA = extractTargetIdentity(a.parsed);
  const idB = extractTargetIdentity(b.parsed);
  return idA.host === idB.host && idA.port === idB.port && idA.dbName === idB.dbName;
}

function areCompatibleCentralTargets(a, b) {
  if (areSameTarget(a, b)) return true;
  const idA = extractTargetIdentity(a.parsed);
  const idB = extractTargetIdentity(b.parsed);
  // Allow pairing Supabase session DIRECT_URL (db.<ref>.supabase.co:5432) and pooler CENTRAL/DATABASE_URL (postgres.<ref>@...pooler.supabase.com) for the same project & DB
  return Boolean(
    idA.supabaseRef &&
    idB.supabaseRef &&
    idA.supabaseRef === idB.supabaseRef &&
    idA.dbName === idB.dbName
  );
}

// Auto load .env if present (invoked only after CLI track authorization succeeds).
// Explicit process environment variables ALWAYS take precedence over .env entries,
// and if the track's explicit primary target URL is already set in process.env,
// database URLs from .env are never injected.
function loadEnv(track) {
  const explicitTargetAlreadySet =
    (track === 'tenant' && Boolean(process.env.TENANT_DATABASE_URL)) ||
    (track === 'control-plane' && Boolean(process.env.CENTRAL_DATABASE_URL));
  if (explicitTargetAlreadySet) {
    return;
  }

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
            if (!process.env[k] && !isPlaceholderValue(v)) {
              process.env[k] = v;
            }
          }
        }
      }
    }
  }
}

/**
 * Resolves a single unambiguous PostgreSQL target URL for the requested track.
 * - Tenant track: requires TENANT_DATABASE_URL explicitly; never falls back to central URLs.
 * - Control-plane track: requires CENTRAL_DATABASE_URL or unambiguous DIRECT_URL / DATABASE_URL
 *   (compatible Supabase direct/pooler pairs are allowed, while conflicting databases/hosts fail closed).
 * - Never falls back to any hardcoded localhost default.
 */
export function getConnectionCandidates(track, env = process.env) {
  if (track === 'tenant') {
    const rawTenant = env.TENANT_DATABASE_URL;
    if (!rawTenant || isPlaceholderValue(rawTenant)) {
      throw new Error(
        'TENANT_DATABASE_URL must be explicitly set for CLI --track=tenant execution (refusing to fall back to central CENTRAL_DATABASE_URL/DIRECT_URL/DATABASE_URL or any default).'
      );
    }
    const tenantTarget = parseValidatedPostgresUrl(rawTenant, 'TENANT_DATABASE_URL');

    for (const centralKey of ['CENTRAL_DATABASE_URL', 'DIRECT_URL', 'DATABASE_URL']) {
      const rawCentral = env[centralKey];
      if (rawCentral && !isPlaceholderValue(rawCentral)) {
        const centralTarget = parseValidatedPostgresUrl(rawCentral, centralKey);
        if (areSameTarget(tenantTarget, centralTarget)) {
          throw new Error(
            `Refusing --track=tenant execution: TENANT_DATABASE_URL points to the same database target as ${centralKey}. Tenant migrations must target an isolated tenant database.`
          );
        }
      }
    }

    return [tenantTarget.url];
  }

  if (track !== 'control-plane') {
    throw new Error(`Unsupported migration track '${track}' for target resolution.`);
  }

  const configured = [];
  for (const key of ['CENTRAL_DATABASE_URL', 'DIRECT_URL', 'DATABASE_URL']) {
    const raw = env[key];
    if (raw !== undefined && String(raw).trim() !== '') {
      configured.push({ key, ...parseValidatedPostgresUrl(raw, key) });
    }
  }

  if (configured.length === 0) {
    throw new Error(
      'Refusing --track=control-plane execution: explicit CENTRAL_DATABASE_URL (or unambiguous central DIRECT_URL/DATABASE_URL) must be configured; no hardcoded default database fallback is allowed.'
    );
  }

  // Fail closed if configured control-plane variables point to incompatible hosts or databases
  for (let i = 1; i < configured.length; i++) {
    if (!areCompatibleCentralTargets(configured[0], configured[i])) {
      throw new Error(
        `Ambiguous control-plane database target: ${configured[0].key} (${configured[0].parsed.hostname}/${configured[0].dbName}) disagrees with ${configured[i].key} (${configured[i].parsed.hostname}/${configured[i].dbName}). Configure a single unambiguous target.`
      );
    }
  }

  const selected = configured[0];
  if (selected.dbName.toLowerCase().startsWith('dfarm_tenant_')) {
    throw new Error(
      `Refusing --track=control-plane execution against tenant-named database '${selected.dbName}'.`
    );
  }

  if (env.TENANT_DATABASE_URL && !isPlaceholderValue(env.TENANT_DATABASE_URL)) {
    const tenantTarget = parseValidatedPostgresUrl(env.TENANT_DATABASE_URL, 'TENANT_DATABASE_URL');
    if (areSameTarget(selected, tenantTarget)) {
      throw new Error(
        `Ambiguous database target: control-plane ${selected.key} points to the same database as TENANT_DATABASE_URL.`
      );
    }
  }

  return [selected.url];
}

async function createConnectedClient(connectionCandidates) {
  if (!Array.isArray(connectionCandidates) || connectionCandidates.length !== 1) {
    throw new Error('Expected exactly one unambiguous PostgreSQL connection target.');
  }
  const uri = connectionCandidates[0];
  const ssl = getSslConfig(uri);
  const parsed = new URL(uri);
  const maskedTarget = `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname}`;
  console.log('------------------------------------------------------------');
  console.log('DFARM DATABASE MIGRATION ENGINE');
  console.log('Target Host/DB:', maskedTarget);
  console.log('SSL Mode Enabled:', Boolean(ssl));
  console.log('------------------------------------------------------------');

  const client = new Client({
    connectionString: uri,
    ssl,
    connectionTimeoutMillis: 30000,
  });

  await client.connect();
  console.log('Connected to PostgreSQL successfully.\n');
  return client;
}

/**
 * Executes a validated CLI migration plan against a connected pg.Client (or test double)
 * using the exact shared @dfarm/database fail-closed execution engine.
 * Never creates or modifies auth.uid().
 */
export async function executeCliMigrationPlan(client, plan, executionOptions = {}) {
  if (!plan || plan.mode !== 'execute') {
    throw new Error('executeCliMigrationPlan requires an executable CLI migration plan.');
  }
  const isControlPlane = plan.track === 'control-plane';
  const canonicalTrack = isControlPlane ? CONTROL_PLANE_MIGRATIONS : TENANT_OPERATIONAL_MIGRATIONS;
  const trackName = isControlPlane
    ? 'control_plane'
    : `tenant_${String(plan.dairyId || '').trim().toLowerCase()}`;

  const cliLogger = executionOptions.logger || {
    info: (meta, message) => {
      if (meta?.filename) {
        console.log(`[MIGRATE] ${message} (${meta.filename})`);
      } else if (meta?.version) {
        console.log(`[MIGRATE] v${meta.version} ${message} (${meta.durationMs ?? 0}ms)`);
      }
    },
    warn: (meta, message) => {
      console.warn(`[WARN] ${message}`, meta?.filename ? `(${meta.filename})` : '');
    },
    error: (meta, message) => {
      console.error(`[CRITICAL] ${message}`, meta?.filename ? `(${meta.filename})` : '', meta?.error || '');
    },
  };

  return executeMigrationTrackCore(client, canonicalTrack, trackName, {
    ...executionOptions,
    migrationsDir: plan.migrationsDir,
    logger: cliLogger,
  });
}

async function run() {
  let client = null;
  let primaryError = null;
  let closeError = null;

  try {
    // 1. Validate track & canonical manifest BEFORE loading .env or opening any DB connection
    const plan = resolveCliMigrationPlan(process.argv.slice(2));
    if (plan.mode === 'validate-only') {
      console.log('Canonical migration catalog validation PASSED:', plan.catalogSummary);
      return;
    }

    loadEnv(plan.track);
    const candidates = getConnectionCandidates(plan.track);
    client = await createConnectedClient(candidates);

    console.log(`Executing ${plan.entries.length} canonical ${plan.track} migrations.\n`);
    const results = await executeCliMigrationPlan(client, plan);
    const appliedCount = results.filter((r) => r.status === 'APPLIED').length;
    const skippedCount = results.filter((r) => r.status === 'SKIPPED_ALREADY_APPLIED').length;

    console.log('\n------------------------------------------------------------');
    console.log(`Migration Run Completed (${plan.track}): ${appliedCount} applied, ${skippedCount} already up to date.`);
    console.log('------------------------------------------------------------\n');
  } catch (err) {
    primaryError = err instanceof Error ? err : new Error(String(err));
  } finally {
    if (client) {
      try {
        await client.end();
      } catch (endErr) {
        closeError = endErr instanceof Error ? endErr : new Error(String(endErr));
      }
    }
  }

  if (primaryError && closeError) {
    console.error('\nDatabase migration failed:', primaryError.message, '; client close failed:', closeError.message);
    process.exit(1);
  }
  if (primaryError) {
    console.error('\nDatabase migration failed:', primaryError.message);
    process.exit(1);
  }
  if (closeError) {
    console.error('\nDatabase connection cleanup failed:', closeError.message);
    process.exit(1);
  }
}

const isMainModule =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  run();
}
