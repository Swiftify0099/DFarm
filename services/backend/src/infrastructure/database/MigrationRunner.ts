import {
  MigrationTarget,
  type MigrationManifestEntry,
  type MigrationClientMode,
  type MigrationClientCapabilities,
  type MigrationExecutionResult,
  type MigrationExecutionOptions,
  type QueryableClient,
  MIGRATION_MANIFEST,
  MIGRATION_FILES,
  CONTROL_PLANE_MIGRATIONS,
  TENANT_OPERATIONAL_MIGRATIONS,
  QUARANTINED_MIGRATIONS,
  QUARANTINED_MIGRATION_FILENAMES,
  QUARANTINED_MIGRATION_VERSIONS,
  computeMigrationLockKey,
  computeMigrationChecksum,
  ensureMigrationTrackingTables,
  executeMigrationTrackCore,
} from '@dfarm/database';
import { logger } from '../../shared/logger/index.js';

export {
  MigrationTarget,
  type MigrationManifestEntry,
  type MigrationClientMode,
  type MigrationClientCapabilities,
  type MigrationExecutionResult,
  type MigrationExecutionOptions,
  type QueryableClient,
  MIGRATION_MANIFEST,
  MIGRATION_FILES,
  CONTROL_PLANE_MIGRATIONS,
  TENANT_OPERATIONAL_MIGRATIONS,
  QUARANTINED_MIGRATIONS,
  QUARANTINED_MIGRATION_FILENAMES,
  QUARANTINED_MIGRATION_VERSIONS,
};

export class MigrationRunner {
  public static computeAdvisoryLockKey(lockScope: string): string {
    return computeMigrationLockKey(lockScope);
  }

  public static async ensureSchemaMigrationsTable(
    client: QueryableClient,
    options?: MigrationExecutionOptions
  ): Promise<void> {
    await ensureMigrationTrackingTables(client, options);
  }

  public static computeChecksum(content: string): string {
    return computeMigrationChecksum(content);
  }

  public static async executeMigrationTrack(
    clientOrPool: QueryableClient,
    track: MigrationManifestEntry[],
    trackName: string,
    options?: MigrationExecutionOptions
  ): Promise<MigrationExecutionResult[]> {
    return executeMigrationTrackCore(clientOrPool, track, trackName, {
      ...options,
      logger: options?.logger ?? logger,
    });
  }

  public static async runControlPlaneMigrations(
    clientOrPool: QueryableClient,
    options?: Omit<MigrationExecutionOptions, 'allowCustomTrackForTesting'>
  ): Promise<MigrationExecutionResult[]> {
    if (options && (options as MigrationExecutionOptions).allowCustomTrackForTesting) {
      throw new Error('runControlPlaneMigrations cannot be invoked with allowCustomTrackForTesting');
    }
    return this.executeMigrationTrack(
      clientOrPool,
      CONTROL_PLANE_MIGRATIONS,
      'control_plane',
      options
    );
  }

  public static async runTenantMigrations(
    clientOrPool: QueryableClient,
    dairyId: string,
    options?: Omit<MigrationExecutionOptions, 'allowCustomTrackForTesting'>
  ): Promise<MigrationExecutionResult[]> {
    if (!dairyId || typeof dairyId !== 'string' || !dairyId.trim()) {
      throw new Error('runTenantMigrations requires a non-empty dairyId');
    }
    if (options && (options as MigrationExecutionOptions).allowCustomTrackForTesting) {
      throw new Error('runTenantMigrations cannot be invoked with allowCustomTrackForTesting');
    }
    const normalizedDairyId = dairyId.trim().toLowerCase();
    return this.executeMigrationTrack(
      clientOrPool,
      TENANT_OPERATIONAL_MIGRATIONS,
      `tenant_${normalizedDairyId}`,
      options
    );
  }
}
