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
//# sourceMappingURL=index.d.ts.map