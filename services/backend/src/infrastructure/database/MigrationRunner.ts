import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  MigrationTarget,
  type MigrationManifestEntry,
  MIGRATION_MANIFEST,
  MIGRATION_FILES,
  CONTROL_PLANE_MIGRATIONS,
  TENANT_OPERATIONAL_MIGRATIONS,
  QUARANTINED_MIGRATIONS,
  QUARANTINED_MIGRATION_FILENAMES,
  QUARANTINED_MIGRATION_VERSIONS,
  resolveMigrationsDir,
  validateMigrationCatalog,
  validateMigrationsDirectory,
} from '@dfarm/database';
import { logger } from '../../shared/logger/index.js';

export {
  MigrationTarget,
  type MigrationManifestEntry,
  MIGRATION_MANIFEST,
  MIGRATION_FILES,
  CONTROL_PLANE_MIGRATIONS,
  TENANT_OPERATIONAL_MIGRATIONS,
  QUARANTINED_MIGRATIONS,
  QUARANTINED_MIGRATION_FILENAMES,
  QUARANTINED_MIGRATION_VERSIONS,
};

export interface MigrationExecutionResult {
  version: string;
  filename: string;
  checksum: string;
  storedChecksum?: string;
  checksumMismatch?: boolean;
  status: 'APPLIED' | 'SKIPPED_ALREADY_APPLIED' | 'FAILED';
  durationMs: number;
  error?: string;
}

export interface MigrationExecutionOptions {
  migrationsDir?: string;
  skipDiskCatalogValidation?: boolean;
}

interface QueryableClient {
  query: (text: string, params?: any[]) => Promise<any>;
  connect?: () => Promise<any>;
  withTransaction?: <T>(callback: (client: any) => Promise<T>) => Promise<T>;
  totalCount?: number;
  __isPgMem?: boolean;
}

export class MigrationRunner {
  private static findMigrationsDir(): string {
    return resolveMigrationsDir(process.cwd());
  }

  private static isPgPool(clientOrPool: QueryableClient): boolean {
    return (
      typeof clientOrPool.connect === 'function' &&
      'totalCount' in clientOrPool &&
      typeof (clientOrPool as any).release !== 'function'
    );
  }

  private static async validateTrackInputs(
    track: MigrationManifestEntry[],
    migrationsDir: string,
    options?: MigrationExecutionOptions
  ): Promise<void> {
    if (!options?.skipDiskCatalogValidation) {
      validateMigrationsDirectory(migrationsDir, MIGRATION_MANIFEST);
    } else {
      validateMigrationCatalog({ manifest: MIGRATION_MANIFEST });
    }

    const seenTrackVersions = new Set<string>();
    const seenTrackFilenames = new Set<string>();
    for (const entry of track) {
      if (seenTrackFilenames.has(entry.filename)) {
        throw new Error(`Duplicate filename '${entry.filename}' in execution track`);
      }
      seenTrackFilenames.add(entry.filename);

      if (
        entry.target === MigrationTarget.MANUAL_REVIEW_REQUIRED ||
        QUARANTINED_MIGRATION_FILENAMES.has(entry.filename) ||
        QUARANTINED_MIGRATION_VERSIONS.has(entry.version)
      ) {
        continue;
      }

      if (seenTrackVersions.has(entry.version)) {
        throw new Error(`Duplicate active migration version '${entry.version}' in execution track`);
      }
      seenTrackVersions.add(entry.version);
    }
  }

  public static async ensureSchemaMigrationsTable(client: { query: (text: string, params?: any[]) => Promise<any> }): Promise<void> {
    try {
      await client.query(`
        CREATE SCHEMA IF NOT EXISTS auth;
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$ BEGIN RETURN NULL; END; $$ LANGUAGE plpgsql STABLE;
        CREATE SCHEMA IF NOT EXISTS supabase_migrations;
        CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
          version VARCHAR(50) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          statements TEXT[],
          inserted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
    } catch {
      // In case of restricted database privileges or memory double
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

    // Synchronize historical non-quarantined records from supabase_migrations.schema_migrations if present.
    // Never import quarantined filenames or quarantined versions as active applied migrations.
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
      // In case supabase_migrations table is absent or restricted
    }
  }

  public static computeChecksum(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  private static async executeSingleMigrationAtomically(
    execClient: QueryableClient,
    entry: MigrationManifestEntry,
    rawContent: string,
    checksum: string
  ): Promise<number> {
    const startTime = Date.now();

    const applyInClient = async (txClient: QueryableClient): Promise<number> => {
      await txClient.query(rawContent);
      const durationMs = Date.now() - startTime;
      await txClient.query(
        `INSERT INTO schema_migrations (version, name, checksum, applied_at, execution_time_ms)
         VALUES ($1, $2, $3, NOW(), $4)
         ON CONFLICT (version) DO NOTHING;`,
        [entry.version, entry.filename, checksum, durationMs]
      );

      if (!txClient.__isPgMem) {
        try {
          await txClient.query('SAVEPOINT dfarm_supabase_hist_sync;');
          await txClient.query(
            `INSERT INTO supabase_migrations.schema_migrations (version, name, inserted_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (version) DO NOTHING;`,
            [entry.version, entry.filename]
          );
          await txClient.query('RELEASE SAVEPOINT dfarm_supabase_hist_sync;');
        } catch {
          await txClient.query('ROLLBACK TO SAVEPOINT dfarm_supabase_hist_sync;').catch(() => {});
          await txClient.query('RELEASE SAVEPOINT dfarm_supabase_hist_sync;').catch(() => {});
        }
      }

      return durationMs;
    };

    if (typeof execClient.withTransaction === 'function') {
      return await execClient.withTransaction(async (txClient) => applyInClient(txClient));
    }

    let txStarted = false;
    try {
      await execClient.query('BEGIN;');
      txStarted = true;
    } catch {
      txStarted = false;
    }

    try {
      const durationMs = await applyInClient(execClient);
      if (txStarted) {
        await execClient.query('COMMIT;');
      }
      return durationMs;
    } catch (err) {
      if (txStarted) {
        await execClient.query('ROLLBACK;').catch(() => {});
      }
      throw err;
    }
  }

  public static async executeMigrationTrack(
    clientOrPool: QueryableClient,
    track: MigrationManifestEntry[],
    trackName: string,
    options?: MigrationExecutionOptions
  ): Promise<MigrationExecutionResult[]> {
    const migrationsDir = options?.migrationsDir || this.findMigrationsDir();
    await this.validateTrackInputs(track, migrationsDir, options);

    const results: MigrationExecutionResult[] = [];
    const acquiredPoolClient = this.isPgPool(clientOrPool) ? await clientOrPool.connect!() : null;
    const execClient: QueryableClient = acquiredPoolClient || clientOrPool;

    try {
      // 1. Ensure tracking table exists
      await this.ensureSchemaMigrationsTable(execClient);

      // 2. Try acquiring session advisory lock on the single execution connection
      let lockAcquired = false;
      try {
        await execClient.query(`SELECT pg_advisory_lock(hashtext('dfarm_migration_lock_${trackName}'));`);
        lockAcquired = true;
      } catch {
        // Advisory locks not supported (e.g. pg-mem / mock client), proceed safely
      }

      try {
        // 3. Detect quarantined collision inside historical supabase_migrations.schema_migrations
        try {
          const quarantinedHistRes = await execClient.query(
            `SELECT version, name FROM supabase_migrations.schema_migrations WHERE name = ANY($1::text[]);`,
            [Array.from(QUARANTINED_MIGRATION_FILENAMES)]
          );
          if (quarantinedHistRes?.rows?.length > 0) {
            const row = quarantinedHistRes.rows[0];
            if (track.some(e => e.version === row.version && e.filename !== row.name)) {
              throw new Error(
                `Migration history conflict: supabase_migrations.schema_migrations records quarantined script '${row.name}' under active version '${row.version}'`
              );
            }
          }
        } catch (histErr: any) {
          if (histErr?.message?.startsWith('Migration history conflict:')) {
            throw histErr;
          }
          // Ignore absent supabase_migrations table in stripped test doubles
        }

        // 4. Fetch already applied versions with recorded filename and checksum
        const appliedRes = await execClient.query(`SELECT version, name, checksum FROM schema_migrations;`);
        const appliedMap = new Map<string, { name?: string; checksum?: string }>();
        for (const row of appliedRes.rows || []) {
          appliedMap.set(row.version, {
            name: typeof row.name === 'string' ? row.name : undefined,
            checksum: typeof row.checksum === 'string' ? row.checksum : undefined,
          });
        }

        // 5. Execute pending migrations in strict order
        for (const entry of track) {
          if (
            entry.target === MigrationTarget.MANUAL_REVIEW_REQUIRED ||
            QUARANTINED_MIGRATION_FILENAMES.has(entry.filename) ||
            QUARANTINED_MIGRATION_VERSIONS.has(entry.version)
          ) {
            logger.warn({ filename: entry.filename }, 'Skipping quarantined manual-review-only script');
            continue;
          }

          const filePath = path.join(migrationsDir, entry.filename);
          if (!fs.existsSync(filePath)) {
            throw new Error(`Migration file not found: ${filePath}`);
          }

          const rawContent = fs.readFileSync(filePath, 'utf8');
          const checksum = this.computeChecksum(rawContent);

          if (appliedMap.has(entry.version)) {
            const existing = appliedMap.get(entry.version)!;
            if (
              existing.name &&
              (QUARANTINED_MIGRATION_FILENAMES.has(existing.name) ||
                (existing.name.endsWith('.sql') && existing.name !== entry.filename))
            ) {
              throw new Error(
                `Migration version conflict for v${entry.version}: database recorded '${existing.name}', manifest expects '${entry.filename}'. Existing version record preserved without replacement.`
              );
            }

            const isHistoricalSentinel = existing.checksum === 'HISTORICAL_SUPABASE_RECORD';
            const checksumMismatch = Boolean(
              existing.checksum && !isHistoricalSentinel && existing.checksum !== checksum
            );
            if (checksumMismatch) {
              logger.warn(
                {
                  version: entry.version,
                  filename: entry.filename,
                  storedChecksum: existing.checksum,
                  actualChecksum: checksum,
                },
                'Migration checksum mismatch: file was modified after being applied to this database'
              );
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
          logger.info({ version: entry.version, filename: entry.filename, track: trackName }, 'Applying migration...');

          try {
            const durationMs = await this.executeSingleMigrationAtomically(
              execClient,
              entry,
              rawContent,
              checksum
            );

            results.push({
              version: entry.version,
              filename: entry.filename,
              checksum,
              checksumMismatch: false,
              status: 'APPLIED',
              durationMs,
            });
            logger.info({ version: entry.version, durationMs }, 'Migration applied successfully');
          } catch (err: any) {
            const durationMs = Date.now() - startTime;
            logger.error({ version: entry.version, filename: entry.filename, error: err.message }, 'Migration failed');
            results.push({
              version: entry.version,
              filename: entry.filename,
              checksum,
              status: 'FAILED',
              durationMs,
              error: err.message,
            });
            throw new Error(`Migration ${entry.filename} (v${entry.version}) failed: ${err.message}`);
          }
        }
      } finally {
        if (lockAcquired) {
          try {
            await execClient.query(`SELECT pg_advisory_unlock(hashtext('dfarm_migration_lock_${trackName}'));`);
          } catch {
            // Ignore unlock failure on closed connection
          }
        }
      }
    } finally {
      if (acquiredPoolClient && typeof acquiredPoolClient.release === 'function') {
        acquiredPoolClient.release();
      }
    }

    return results;
  }

  public static async runControlPlaneMigrations(
    clientOrPool: any,
    options?: MigrationExecutionOptions
  ): Promise<MigrationExecutionResult[]> {
    return this.executeMigrationTrack(clientOrPool, CONTROL_PLANE_MIGRATIONS, 'control_plane', options);
  }

  public static async runTenantMigrations(
    clientOrPool: any,
    dairyId: string,
    options?: MigrationExecutionOptions
  ): Promise<MigrationExecutionResult[]> {
    return this.executeMigrationTrack(clientOrPool, TENANT_OPERATIONAL_MIGRATIONS, `tenant_${dairyId.slice(0, 8)}`, options);
  }
}
