import pg from 'pg';
export interface IDatabaseClient {
    query<T extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<T>>;
    withTransaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T>;
    close?(): Promise<void>;
}
export type ProvisioningStatus = 'PENDING' | 'PROVISIONING' | 'DATABASE_CREATED' | 'MIGRATING' | 'VERIFYING' | 'ACTIVE' | 'FAILED' | 'RETRY_REQUIRED' | 'ORPHANED_RESOURCE' | 'DEPROVISIONING' | 'DEPROVISION_FAILED';
export interface TenantDatabaseMapping {
    id: string;
    dairyId: string;
    dairyCode: string;
    databaseName: string;
    resourceType: 'PHYSICAL_DATABASE' | 'ISOLATED_TEST_INSTANCE';
    connectionUriEncrypted?: string;
    schemaVersion: string;
    provisioningStatus: ProvisioningStatus;
    provisioningError?: string;
    provisionedAt?: string;
    lastVerifiedAt: string;
}
export interface ProvisionTenantParams {
    dairyId: string;
    dairyCode: string;
    dairyName: string;
    adminConnectionString?: string;
}
export declare const PLATFORM_FEDERATION_DAIRY_ID = "00000000-0000-0000-0000-000000000001";
export declare class TenantDatabaseUnavailableError extends Error {
    readonly dairyId: string;
    readonly status: string;
    readonly details?: string | undefined;
    readonly statusCode = 503;
    readonly code: string;
    constructor(dairyId: string, status: string, details?: string | undefined);
}
export declare class TenantDatabaseManager {
    private static instance;
    private readonly tenantPools;
    private readonly tenantMappings;
    private readonly tenantMemDbs;
    private controlPlaneDb;
    private isInitialized;
    /**
     * Per-pool in-flight or completed shutdown promises.
     * Kept on success (so pg-mem or pools without `.ended` are not ended twice)
     * and cleared on rejection so a failed shutdown can be retried.
     */
    private readonly poolShutdownPromises;
    private readonly closingTenantPools;
    private readonly deprovisioningTenants;
    private readonly inFlightAcquisitionsByDairy;
    private closingAllPoolsPromise;
    private constructor();
    static getInstance(): TenantDatabaseManager;
    private isRealPostgresRequired;
    private isTestEnvironment;
    private getSslConfig;
    private createTenantPool;
    private createAdminPool;
    private trackAcquisition;
    private assertTenantLifecycleAvailable;
    private awaitPendingTenantClose;
    private ensureExistingPoolUsableOrEvict;
    private endPoolSafely;
    getTenantPool(dairyId: string): pg.Pool | undefined;
    getControlPlaneDb(): IDatabaseClient;
    setControlPlaneDb(db: IDatabaseClient): void;
    initialize(controlPlaneDb?: IDatabaseClient): Promise<void>;
    isPlatformFederationDairy(dairyId?: string): boolean;
    getPlatformFederationMapping(): TenantDatabaseMapping;
    getTenantMapping(dairyId: string): TenantDatabaseMapping | null;
    /**
     * Resolves the authoritative tenant database mapping from memory or central dairy_database_mappings
     * without fabricating a synthetic test mapping.
     */
    resolveTenantMapping(dairyId: string): Promise<TenantDatabaseMapping | null>;
    /**
     * Strict tenant DB resolver: validates mapping existence and ACTIVE provisioning state,
     * never fabricates a test mapping, and never falls back to central control-plane DB.
     */
    getStrictTenantDb(dairyId: string): Promise<IDatabaseClient>;
    getAllMappings(): TenantDatabaseMapping[];
    getAllTenantDbs(): IDatabaseClient[];
    /**
     * Generates a safe, sanitized, unique PostgreSQL database name for a dairy tenant.
     * Conforms to PostgreSQL identifier rules (max 63 characters).
     */
    generateTenantDatabaseName(dairyId: string, dairyCode: string): string;
    /**
     * Provisions a separate PostgreSQL database for a Dairy Tenant.
     *
     * State Machine:
     * PENDING -> PROVISIONING -> DATABASE_CREATED -> MIGRATING -> VERIFYING -> ACTIVE
     *
     * Invariants:
     * - Must create a REAL, separate PostgreSQL database in the cluster (or isolated test double in NODE_ENV=test).
     * - NEVER falls back to schema-per-tenant.
     * - Applies full operational migration track (001 through 027).
     * - Enforces tenant_metadata table containing the central Dairy UUID.
     * - Encrypts connection credentials at rest with AES-256-GCM.
     */
    provisionTenantDatabase(paramsOrDairyId: ProvisionTenantParams | string, dairyCode?: string, dairyName?: string): Promise<TenantDatabaseMapping>;
    /**
     * Resolves an authorized, bounded database client for the specified Dairy.
     * Throws if no active mapping exists. Never falls back to central DB or creates a fake DB.
     */
    getTenantDb(dairyId?: string): Promise<IDatabaseClient>;
    verifyTenantDatabase(dairyId: string): Promise<{
        isVerified: boolean;
        databaseName?: string;
        schemaVersion?: string;
        error?: string;
    }>;
    closeTenantPool(dairyId: string): Promise<void>;
    evictTenantPool(dairyId: string): Promise<void>;
    closeAllPools(): Promise<void>;
    /**
     * Permanently deprovisions a dairy tenant:
     * 1. Marks tenant DEPROVISIONING and awaits any in-flight acquisitions before closing pools.
     * 2. Closes and evicts active connection pools.
     * 3. Drops physical PostgreSQL database cleanly (without FORCE or pg_terminate_backend).
     * 4. Cleans up customer_dairy_memberships, dairy_database_mappings, users, and organizations.
     * 5. On failure, records DEPROVISION_FAILED so partial tenants are never reopened and rethrows.
     */
    deprovisionTenantDatabase(dairyId: string, _options?: {
        force?: boolean;
    }): Promise<{
        success: boolean;
        dairyId: string;
        databaseName?: string;
        deprovisionedAt: string;
        details: string;
    }>;
    getSafeHealthStatus(): Promise<{
        status: 'READY' | 'DEGRADED';
        totalActiveTenants: number;
        activePoolCount: number;
        pools: {
            dairyId: string;
            totalCount: number;
            idleCount: number;
            waitingCount: number;
        }[];
    }>;
    private wrapPgPool;
    private deriveAdminDatabaseUri;
    private deriveTenantUri;
    private persistMappingStatus;
    private createIsolatedMemoryDatabase;
}
export declare const tenantDbManager: TenantDatabaseManager;
//# sourceMappingURL=TenantDatabaseManager.d.ts.map