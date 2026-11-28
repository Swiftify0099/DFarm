import { type MigrationManifestEntry } from './catalog.js';
export type MigrationClientMode = 'postgres' | 'pg-mem' | 'mock';
export interface MigrationClientCapabilities {
    mode?: MigrationClientMode;
    supportsTransactions?: boolean;
    supportsAdvisoryLocks?: boolean;
    supportsSavepoints?: boolean;
    supportsSupabaseMigrationsSync?: boolean;
}
export interface ResolvedMigrationCapabilities {
    mode: MigrationClientMode;
    supportsTransactions: boolean;
    supportsAdvisoryLocks: boolean;
    supportsSavepoints: boolean;
    supportsSupabaseMigrationsSync: boolean;
}
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
export interface MigrationLogger {
    info?: (meta: Record<string, any>, message: string) => void;
    warn?: (meta: Record<string, any>, message: string) => void;
    error?: (meta: Record<string, any>, message: string) => void;
}
export interface MigrationExecutionOptions {
    migrationsDir?: string;
    skipDiskCatalogValidation?: boolean;
    clientCapabilities?: MigrationClientCapabilities;
    allowCustomTrackForTesting?: boolean;
    lockTimeoutMs?: number;
    logger?: MigrationLogger;
}
export interface QueryableClient {
    query: (text: string, params?: any[]) => Promise<any>;
    connect?: () => Promise<any>;
    withTransaction?: <T>(callback: (client: any) => Promise<T>) => Promise<T>;
    release?: (err?: Error | boolean) => void;
    totalCount?: number;
    __isPgMem?: boolean;
    __isMockClient?: boolean;
    __migrationCapabilities?: MigrationClientCapabilities;
}
/**
 * Computes a deterministic signed 64-bit PostgreSQL advisory lock key from a canonical lock scope.
 */
export declare function computeMigrationLockKey(lockScope: string): string;
export declare function computeMigrationChecksum(content: string): string;
export declare function isPgPoolClientLike(clientOrPool: QueryableClient): boolean;
/**
 * Resolves transaction/lock capabilities strictly from explicit test double metadata.
 * Production mode (NODE_ENV !== 'test') ALWAYS enforces full PostgreSQL guarantees.
 */
export declare function resolveMigrationClientCapabilities(client: QueryableClient, options?: MigrationExecutionOptions): ResolvedMigrationCapabilities;
export declare function validateMigrationTrackInputs(track: readonly MigrationManifestEntry[], trackName: string, migrationsDir: string, options?: MigrationExecutionOptions): void;
/**
 * Ensures canonical schema_migrations tracking table exists.
 * NEVER creates, mutates, or replaces Supabase's native auth schema or auth.uid() function.
 */
export declare function ensureMigrationTrackingTables(client: QueryableClient, options?: MigrationExecutionOptions): Promise<void>;
export declare function executeMigrationTrackCore(clientOrPool: QueryableClient, track: readonly MigrationManifestEntry[], trackName: string, options?: MigrationExecutionOptions): Promise<MigrationExecutionResult[]>;
//# sourceMappingURL=runner.d.ts.map