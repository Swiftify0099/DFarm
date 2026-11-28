import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { MigrationTarget, MIGRATION_MANIFEST, CONTROL_PLANE_MIGRATIONS, TENANT_OPERATIONAL_MIGRATIONS, QUARANTINED_MIGRATION_FILENAMES, QUARANTINED_MIGRATION_VERSIONS, resolveMigrationsDir, validateMigrationCatalog, validateMigrationsDirectory, } from './catalog.js';
const EXPECTED_SUPABASE_AUX_PG_CODES = new Set([
    '42P01', // undefined_table
    '3F000', // invalid_schema_name
    '42501', // insufficient_privilege
]);
function toError(err) {
    return err instanceof Error ? err : new Error(String(err));
}
function flattenErrors(err) {
    if (err instanceof AggregateError && Array.isArray(err.errors) && err.errors.length > 0) {
        return err.errors.map(toError);
    }
    return [err];
}
function combineErrors(errors, headline) {
    const flat = [];
    for (const e of errors) {
        flat.push(...flattenErrors(e));
    }
    if (flat.length === 1) {
        return flat[0];
    }
    const summary = headline || flat.map((e) => e.message).join('; ');
    return new AggregateError(flat, summary);
}
function isExpectedSupabaseAuxError(err, caps) {
    if (caps.mode !== 'postgres') {
        return true;
    }
    const code = typeof err?.code === 'string' ? err.code : '';
    return EXPECTED_SUPABASE_AUX_PG_CODES.has(code);
}
/**
 * Computes a deterministic signed 64-bit PostgreSQL advisory lock key from a canonical lock scope.
 */
export function computeMigrationLockKey(lockScope) {
    const digest = crypto.createHash('sha256').update(lockScope, 'utf8').digest();
    return digest.readBigInt64BE(0).toString();
}
export function computeMigrationChecksum(content) {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}
export function isPgPoolClientLike(clientOrPool) {
    return (typeof clientOrPool.connect === 'function' &&
        'totalCount' in clientOrPool &&
        typeof clientOrPool.release !== 'function' &&
        !clientOrPool.__isPgMem &&
        !clientOrPool.__isMockClient);
}
/**
 * Resolves transaction/lock capabilities strictly from explicit test double metadata.
 * Production mode (NODE_ENV !== 'test') ALWAYS enforces full PostgreSQL guarantees.
 */
export function resolveMigrationClientCapabilities(client, options) {
    const isTestEnv = process.env['NODE_ENV'] === 'test';
    const explicitCaps = options?.clientCapabilities || client?.__migrationCapabilities;
    if (!isTestEnv) {
        return {
            mode: 'postgres',
            supportsTransactions: true,
            supportsAdvisoryLocks: true,
            supportsSavepoints: true,
            supportsSupabaseMigrationsSync: true,
        };
    }
    if (client?.__isPgMem || explicitCaps?.mode === 'pg-mem') {
        return {
            mode: 'pg-mem',
            supportsTransactions: explicitCaps?.supportsTransactions ?? true,
            supportsAdvisoryLocks: explicitCaps?.supportsAdvisoryLocks ?? false,
            supportsSavepoints: explicitCaps?.supportsSavepoints ?? false,
            supportsSupabaseMigrationsSync: explicitCaps?.supportsSupabaseMigrationsSync ?? false,
        };
    }
    if (client?.__isMockClient || explicitCaps?.mode === 'mock') {
        return {
            mode: 'mock',
            supportsTransactions: explicitCaps?.supportsTransactions ?? true,
            supportsAdvisoryLocks: explicitCaps?.supportsAdvisoryLocks ?? true,
            supportsSavepoints: explicitCaps?.supportsSavepoints ?? true,
            supportsSupabaseMigrationsSync: explicitCaps?.supportsSupabaseMigrationsSync ?? true,
        };
    }
    return {
        mode: 'postgres',
        supportsTransactions: true,
        supportsAdvisoryLocks: true,
        supportsSavepoints: true,
        supportsSupabaseMigrationsSync: true,
    };
}
function assertExactTrackMatch(track, canonicalTrack, trackName) {
    if (track.length !== canonicalTrack.length) {
        throw new Error(`Migration track rejection for '${trackName}': expected exact canonical track (${canonicalTrack.length} entries), received ${track.length}.`);
    }
    for (let i = 0; i < canonicalTrack.length; i++) {
        const actual = track[i];
        const expected = canonicalTrack[i];
        if (!actual ||
            actual.version !== expected.version ||
            actual.filename !== expected.filename ||
            actual.target !== expected.target) {
            throw new Error(`Migration track rejection for '${trackName}': entry at index ${i} (${actual?.version}:${actual?.filename}:${actual?.target}) does not match canonical entry (${expected.version}:${expected.filename}:${expected.target}).`);
        }
    }
}
export function validateMigrationTrackInputs(track, trackName, migrationsDir, options) {
    if (!Array.isArray(track)) {
        throw new Error('Migration track must be an array of manifest entries.');
    }
    if (!trackName || typeof trackName !== 'string' || !trackName.trim()) {
        throw new Error('Migration trackName must be a non-empty string.');
    }
    if (!options?.skipDiskCatalogValidation) {
        validateMigrationsDirectory(migrationsDir, MIGRATION_MANIFEST);
    }
    else {
        validateMigrationCatalog({ manifest: MIGRATION_MANIFEST });
    }
    const seenTrackVersions = new Set();
    const seenTrackFilenames = new Set();
    const canonicalByFilename = new Map(MIGRATION_MANIFEST.map((m) => [m.filename, m]));
    for (const entry of track) {
        if (!entry || !entry.filename || !entry.version) {
            throw new Error(`Invalid migration entry in track '${trackName}': ${JSON.stringify(entry)}`);
        }
        if (seenTrackFilenames.has(entry.filename)) {
            throw new Error(`Duplicate filename '${entry.filename}' in execution track`);
        }
        seenTrackFilenames.add(entry.filename);
        const isQuarantined = entry.target === MigrationTarget.MANUAL_REVIEW_REQUIRED ||
            QUARANTINED_MIGRATION_FILENAMES.has(entry.filename) ||
            QUARANTINED_MIGRATION_VERSIONS.has(entry.version);
        if (isQuarantined) {
            continue;
        }
        if (seenTrackVersions.has(entry.version)) {
            throw new Error(`Duplicate active migration version '${entry.version}' in execution track`);
        }
        seenTrackVersions.add(entry.version);
        const canonical = canonicalByFilename.get(entry.filename);
        if (!canonical ||
            canonical.target === MigrationTarget.MANUAL_REVIEW_REQUIRED ||
            canonical.version !== entry.version ||
            canonical.target !== entry.target) {
            throw new Error(`Migration track rejection for '${trackName}': entry '${entry.filename}' (v${entry.version}, target=${entry.target}) does not match canonical MIGRATION_MANIFEST.`);
        }
    }
    const normalizedTrack = trackName.trim();
    const isControlPlaneTrack = normalizedTrack === 'control_plane' || normalizedTrack === 'control-plane';
    const isTenantTrack = normalizedTrack.startsWith('tenant_');
    if (options?.allowCustomTrackForTesting) {
        if (process.env['NODE_ENV'] !== 'test') {
            throw new Error('allowCustomTrackForTesting is strictly prohibited outside NODE_ENV=test.');
        }
        if (isControlPlaneTrack) {
            for (const entry of track) {
                if (entry.target !== MigrationTarget.MANUAL_REVIEW_REQUIRED &&
                    !QUARANTINED_MIGRATION_FILENAMES.has(entry.filename) &&
                    entry.target !== MigrationTarget.CONTROL_PLANE &&
                    entry.target !== MigrationTarget.SHARED) {
                    throw new Error(`Migration track ownership violation: '${entry.filename}' (${entry.target}) cannot execute on control_plane.`);
                }
            }
        }
        else if (isTenantTrack) {
            for (const entry of track) {
                if (entry.target !== MigrationTarget.MANUAL_REVIEW_REQUIRED &&
                    !QUARANTINED_MIGRATION_FILENAMES.has(entry.filename) &&
                    entry.target !== MigrationTarget.TENANT_OPERATIONAL &&
                    entry.target !== MigrationTarget.SHARED) {
                    throw new Error(`Migration track ownership violation: '${entry.filename}' (${entry.target}) cannot execute on tenant track '${normalizedTrack}'.`);
                }
            }
        }
        return;
    }
    if (isControlPlaneTrack) {
        assertExactTrackMatch(track, CONTROL_PLANE_MIGRATIONS, normalizedTrack);
        return;
    }
    if (isTenantTrack) {
        assertExactTrackMatch(track, TENANT_OPERATIONAL_MIGRATIONS, normalizedTrack);
        return;
    }
    throw new Error(`Refusing arbitrary migration track '${trackName}': only canonical control_plane and tenant_<id> tracks are permitted.`);
}
/**
 * Ensures canonical schema_migrations tracking table exists.
 * NEVER creates, mutates, or replaces Supabase's native auth schema or auth.uid() function.
 */
export async function ensureMigrationTrackingTables(client, options) {
    const caps = resolveMigrationClientCapabilities(client, options);
    // 1. Canonical tracking table is mandatory (fail closed if creation fails)
    await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      execution_time_ms INTEGER NOT NULL
    );
  `);
    if (!caps.supportsSupabaseMigrationsSync) {
        return;
    }
    // 2. Auxiliary Supabase history table setup (only catches expected privilege/schema restrictions)
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
    }
    catch (err) {
        if (!isExpectedSupabaseAuxError(err, caps)) {
            throw err;
        }
    }
    // 3. Synchronize non-quarantined historical Supabase records without overwriting existing rows
    try {
        await client.query(`INSERT INTO schema_migrations (version, name, checksum, applied_at, execution_time_ms)
       SELECT version, name, 'HISTORICAL_SUPABASE_RECORD', inserted_at, 0
       FROM supabase_migrations.schema_migrations
       WHERE name <> ALL($1::text[])
         AND version <> ALL($2::text[])
       ON CONFLICT (version) DO NOTHING;`, [
            Array.from(QUARANTINED_MIGRATION_FILENAMES),
            Array.from(QUARANTINED_MIGRATION_VERSIONS),
        ]);
    }
    catch (err) {
        if (!isExpectedSupabaseAuxError(err, caps)) {
            throw err;
        }
    }
}
async function checkHistoricalMigrationConflicts(execClient, track, caps) {
    const activeByVersion = new Map();
    for (const entry of track) {
        if (entry.target !== MigrationTarget.MANUAL_REVIEW_REQUIRED &&
            !QUARANTINED_MIGRATION_FILENAMES.has(entry.filename) &&
            !QUARANTINED_MIGRATION_VERSIONS.has(entry.version)) {
            activeByVersion.set(entry.version, entry);
        }
    }
    // 1. Check historical supabase_migrations.schema_migrations for quarantined collisions
    if (caps.supportsSupabaseMigrationsSync) {
        try {
            const quarantinedHistRes = await execClient.query(`SELECT version, name FROM supabase_migrations.schema_migrations WHERE name = ANY($1::text[]);`, [Array.from(QUARANTINED_MIGRATION_FILENAMES)]);
            for (const row of quarantinedHistRes?.rows || []) {
                const activeEntry = activeByVersion.get(row.version);
                if (activeEntry && activeEntry.filename !== row.name) {
                    throw new Error(`Migration history conflict: supabase_migrations.schema_migrations records quarantined script '${row.name}' under active version '${row.version}' (expected '${activeEntry.filename}'). Historical rows preserved without modification; manual review required.`);
                }
            }
        }
        catch (histErr) {
            if (histErr?.message?.startsWith('Migration history conflict:')) {
                throw histErr;
            }
            if (!isExpectedSupabaseAuxError(histErr, caps)) {
                throw histErr;
            }
        }
    }
    // 2. Check schema_migrations for any quarantined entry colliding with an active version
    const smConflictRes = await execClient.query(`SELECT version, name FROM schema_migrations;`);
    for (const row of smConflictRes?.rows || []) {
        const activeEntry = activeByVersion.get(row.version);
        if (!activeEntry)
            continue;
        if (typeof row.name === 'string' && QUARANTINED_MIGRATION_FILENAMES.has(row.name)) {
            throw new Error(`Migration version conflict for v${row.version}: schema_migrations records quarantined script '${row.name}', manifest expects '${activeEntry.filename}'. Existing version record preserved without replacement.`);
        }
        if (typeof row.name === 'string' && row.name.endsWith('.sql') && row.name !== activeEntry.filename) {
            throw new Error(`Migration version conflict for v${row.version}: database recorded '${row.name}', manifest expects '${activeEntry.filename}'. Existing version record preserved without replacement.`);
        }
    }
}
async function executeSingleMigrationAtomically(execClient, entry, rawContent, checksum, caps) {
    const startTime = Date.now();
    const applyInClient = async (txClient) => {
        await txClient.query(rawContent);
        const durationMs = Date.now() - startTime;
        await txClient.query(`INSERT INTO schema_migrations (version, name, checksum, applied_at, execution_time_ms)
       VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT (version) DO NOTHING;`, [entry.version, entry.filename, checksum, durationMs]);
        if (caps.supportsSupabaseMigrationsSync && caps.supportsSavepoints) {
            await txClient.query('SAVEPOINT dfarm_supabase_hist_sync;');
            try {
                await txClient.query(`INSERT INTO supabase_migrations.schema_migrations (version, name, inserted_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (version) DO NOTHING;`, [entry.version, entry.filename]);
            }
            catch (syncErr) {
                if (!isExpectedSupabaseAuxError(syncErr, caps)) {
                    await txClient.query('ROLLBACK TO SAVEPOINT dfarm_supabase_hist_sync;');
                    await txClient.query('RELEASE SAVEPOINT dfarm_supabase_hist_sync;');
                    throw syncErr;
                }
                await txClient.query('ROLLBACK TO SAVEPOINT dfarm_supabase_hist_sync;');
            }
            await txClient.query('RELEASE SAVEPOINT dfarm_supabase_hist_sync;');
        }
        return durationMs;
    };
    if (!caps.supportsTransactions) {
        return await applyInClient(execClient);
    }
    // Fail closed if BEGIN fails — never execute migration SQL outside a transaction
    await execClient.query('BEGIN;');
    try {
        const durationMs = await applyInClient(execClient);
        await execClient.query('COMMIT;');
        return durationMs;
    }
    catch (primaryErr) {
        const primary = toError(primaryErr);
        try {
            await execClient.query('ROLLBACK;');
        }
        catch (rollbackErr) {
            const rollback = toError(rollbackErr);
            throw new AggregateError([primary, rollback], `Migration ${entry.filename} (v${entry.version}) failed (${primary.message}) and ROLLBACK also failed (${rollback.message})`);
        }
        throw primary;
    }
}
export async function executeMigrationTrackCore(clientOrPool, track, trackName, options) {
    const migrationsDir = options?.migrationsDir || resolveMigrationsDir(process.cwd());
    validateMigrationTrackInputs(track, trackName, migrationsDir, options);
    const log = options?.logger || {};
    const isPool = isPgPoolClientLike(clientOrPool);
    const rootCaps = resolveMigrationClientCapabilities(clientOrPool, options);
    if (!isPool && typeof clientOrPool.withTransaction === 'function' && rootCaps.mode === 'postgres') {
        throw new Error(`Refusing non-session-affine database wrapper for migration track '${trackName}': pass a pg.Pool, pg.PoolClient, or pg.Client so advisory lock, transactions, and unlock share one PostgreSQL session.`);
    }
    const acquiredPoolClient = isPool ? await clientOrPool.connect() : null;
    const execClient = acquiredPoolClient || clientOrPool;
    const caps = resolveMigrationClientCapabilities(execClient, options);
    const lockScope = `dfarm_migration_lock:${trackName.trim()}`;
    const lockKey = computeMigrationLockKey(lockScope);
    const results = [];
    let lockAcquired = false;
    let lockTimeoutApplied = false;
    let primaryError = null;
    let unlockError = null;
    let releaseError = null;
    try {
        // 1. Mandatory session-affine advisory lock (must succeed BEFORE any DDL or migration SQL)
        if (caps.supportsAdvisoryLocks) {
            if (typeof options?.lockTimeoutMs === 'number' && options.lockTimeoutMs > 0) {
                const timeoutMs = Math.trunc(options.lockTimeoutMs);
                await execClient.query(`SET lock_timeout = '${timeoutMs}ms';`);
                lockTimeoutApplied = true;
            }
            const lockRes = await execClient.query(`SELECT pg_advisory_lock($1::bigint);`, [lockKey]);
            const lockRow = lockRes?.rows?.[0];
            if (lockRow &&
                (lockRow.pg_advisory_lock === false ||
                    lockRow.pg_try_advisory_lock === false ||
                    lockRow.acquired === false)) {
                throw new Error(`Failed to acquire migration advisory lock for track '${trackName}'.`);
            }
            lockAcquired = true;
        }
        // 2. Ensure tracking tables (without touching auth schema or auth.uid())
        await ensureMigrationTrackingTables(execClient, options);
        // 3. Fail closed on historical quarantine or version filename conflicts
        await checkHistoricalMigrationConflicts(execClient, track, caps);
        // 4. Fetch already applied migrations
        const appliedRes = await execClient.query(`SELECT version, name, checksum FROM schema_migrations;`);
        const appliedMap = new Map();
        for (const row of appliedRes?.rows || []) {
            appliedMap.set(row.version, {
                name: typeof row.name === 'string' ? row.name : undefined,
                checksum: typeof row.checksum === 'string' ? row.checksum : undefined,
            });
        }
        // 5. Execute pending migrations in canonical order
        for (const entry of track) {
            if (entry.target === MigrationTarget.MANUAL_REVIEW_REQUIRED ||
                QUARANTINED_MIGRATION_FILENAMES.has(entry.filename) ||
                QUARANTINED_MIGRATION_VERSIONS.has(entry.version)) {
                log.warn?.({ filename: entry.filename }, 'Skipping quarantined manual-review-only script');
                continue;
            }
            const filePath = path.join(migrationsDir, entry.filename);
            if (!fs.existsSync(filePath)) {
                throw new Error(`Migration file not found: ${filePath}`);
            }
            const rawContent = fs.readFileSync(filePath, 'utf8');
            const checksum = computeMigrationChecksum(rawContent);
            if (appliedMap.has(entry.version)) {
                const existing = appliedMap.get(entry.version);
                if (existing.name &&
                    (QUARANTINED_MIGRATION_FILENAMES.has(existing.name) ||
                        (existing.name.endsWith('.sql') && existing.name !== entry.filename))) {
                    throw new Error(`Migration version conflict for v${entry.version}: database recorded '${existing.name}', manifest expects '${entry.filename}'. Existing version record preserved without replacement.`);
                }
                const isHistoricalSentinel = existing.checksum === 'HISTORICAL_SUPABASE_RECORD';
                const checksumMismatch = Boolean(existing.checksum && !isHistoricalSentinel && existing.checksum !== checksum);
                if (checksumMismatch) {
                    log.warn?.({
                        version: entry.version,
                        filename: entry.filename,
                        storedChecksum: existing.checksum,
                        actualChecksum: checksum,
                    }, 'Migration checksum mismatch: file was modified after being applied to this database');
                }
                results.push({
                    version: entry.version,
                    filename: entry.filename,
                    checksum,
                    storedChecksum: existing.checksum,
                    checksumMismatch,
                    status: 'SKIPPED_ALREADY_APPLIED',
                    durationMs: 0,
                });
                continue;
            }
            const startTime = Date.now();
            log.info?.({ version: entry.version, filename: entry.filename, track: trackName }, 'Applying migration...');
            try {
                const durationMs = await executeSingleMigrationAtomically(execClient, entry, rawContent, checksum, caps);
                results.push({
                    version: entry.version,
                    filename: entry.filename,
                    checksum,
                    checksumMismatch: false,
                    status: 'APPLIED',
                    durationMs,
                });
                log.info?.({ version: entry.version, durationMs }, 'Migration applied successfully');
            }
            catch (migErr) {
                const err = toError(migErr);
                const durationMs = Date.now() - startTime;
                log.error?.({ version: entry.version, filename: entry.filename, error: err.message }, 'Migration failed');
                results.push({
                    version: entry.version,
                    filename: entry.filename,
                    checksum,
                    status: 'FAILED',
                    durationMs,
                    error: err.message,
                });
                if (err instanceof AggregateError) {
                    throw new AggregateError(err.errors, `Migration ${entry.filename} (v${entry.version}) failed: ${err.message}`);
                }
                throw new Error(`Migration ${entry.filename} (v${entry.version}) failed: ${err.message}`, {
                    cause: err,
                });
            }
        }
    }
    catch (err) {
        primaryError = toError(err);
    }
    finally {
        if (lockAcquired && caps.supportsAdvisoryLocks) {
            try {
                const unlockRes = await execClient.query(`SELECT pg_advisory_unlock($1::bigint);`, [lockKey]);
                const unlockRow = unlockRes?.rows?.[0];
                if (unlockRow && unlockRow.pg_advisory_unlock === false) {
                    throw new Error(`pg_advisory_unlock returned false for track '${trackName}' (lockKey=${lockKey})`);
                }
            }
            catch (uErr) {
                unlockError = toError(uErr);
                log.error?.({ track: trackName, lockKey, error: unlockError.message }, 'Failed to release migration advisory lock; session client will be discarded');
            }
        }
        if (lockTimeoutApplied && !unlockError && caps.mode === 'postgres') {
            try {
                await execClient.query(`RESET lock_timeout;`);
            }
            catch (resetErr) {
                unlockError = toError(resetErr);
            }
        }
        if (acquiredPoolClient && typeof acquiredPoolClient.release === 'function') {
            try {
                if (unlockError) {
                    // Discard/destroy the pooled client so a potentially session-locked connection never returns to the pool
                    acquiredPoolClient.release(unlockError);
                }
                else {
                    acquiredPoolClient.release();
                }
            }
            catch (rErr) {
                releaseError = toError(rErr);
            }
        }
    }
    const allErrors = [];
    if (primaryError)
        allErrors.push(primaryError);
    if (unlockError)
        allErrors.push(unlockError);
    if (releaseError)
        allErrors.push(releaseError);
    if (allErrors.length > 0) {
        if (primaryError && (unlockError || releaseError)) {
            const cleanupMsg = [unlockError?.message, releaseError?.message].filter(Boolean).join('; ');
            throw combineErrors(allErrors, `${primaryError.message}; cleanup also failed: ${cleanupMsg}`);
        }
        throw combineErrors(allErrors);
    }
    return results;
}
//# sourceMappingURL=runner.js.map