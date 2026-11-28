export declare const MIGRATION_PATH = "../../supabase/migrations";
export declare enum MigrationTarget {
    CONTROL_PLANE = "CONTROL_PLANE",
    TENANT_OPERATIONAL = "TENANT_OPERATIONAL",
    SHARED = "SHARED",
    MANUAL_REVIEW_REQUIRED = "MANUAL_REVIEW_REQUIRED"
}
export interface MigrationManifestEntry {
    version: string;
    filename: string;
    target: MigrationTarget;
    description: string;
}
export declare const MIGRATION_MANIFEST: MigrationManifestEntry[];
export declare const MIGRATION_FILES: string[];
export declare const CONTROL_PLANE_MIGRATIONS: MigrationManifestEntry[];
export declare const TENANT_OPERATIONAL_MIGRATIONS: MigrationManifestEntry[];
export declare const QUARANTINED_MIGRATIONS: MigrationManifestEntry[];
export declare const QUARANTINED_MIGRATION_FILENAMES: ReadonlySet<string>;
export declare const QUARANTINED_MIGRATION_VERSIONS: ReadonlySet<string>;
export interface MigrationCatalogValidationResult {
    totalEntries: number;
    activeEntries: number;
    quarantinedEntries: number;
    controlPlaneCount: number;
    tenantOperationalCount: number;
    diskSqlFilesChecked: number;
}
/**
 * Validates canonical migration catalog invariants and optional on-disk SQL file reconciliation.
 * Fails closed on duplicate active versions, unregistered SQL files, missing files,
 * non-monotonic ordering, or unauthorized duplicate numeric prefixes.
 */
export declare function validateMigrationCatalog(options?: {
    manifest?: readonly MigrationManifestEntry[];
    diskFilenames?: readonly string[];
}): MigrationCatalogValidationResult;
/**
 * Validates MIGRATION_MANIFEST against actual files in a migrations directory on disk.
 */
export declare function validateMigrationsDirectory(migrationsDir: string, manifest?: readonly MigrationManifestEntry[]): MigrationCatalogValidationResult;
/**
 * Resolves a migration directory containing supabase/migrations SQL files.
 */
export declare function resolveMigrationsDir(startDir?: string): string;
//# sourceMappingURL=catalog.d.ts.map