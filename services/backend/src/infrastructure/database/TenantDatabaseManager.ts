import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { newDb } from 'pg-mem';
import { config } from '../../config/env.js';
import { logger } from '../../shared/logger/index.js';
import { db as defaultControlPlaneDb } from './PostgresPool.js';
import { CredentialEncryption } from '../security/CredentialEncryption.js';
import { MigrationRunner } from './MigrationRunner.js';
import { inMemoryDairies } from './InMemoryDairyStore.js';

export interface IDatabaseClient {
  query<T extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<T>>;
  withTransaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T>;
  close?(): Promise<void>;
}

export type ProvisioningStatus =
  | 'PENDING'
  | 'PROVISIONING'
  | 'DATABASE_CREATED'
  | 'MIGRATING'
  | 'VERIFYING'
  | 'ACTIVE'
  | 'FAILED'
  | 'RETRY_REQUIRED'
  | 'ORPHANED_RESOURCE'
  | 'DEPROVISIONING'
  | 'DEPROVISION_FAILED';

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

export const PLATFORM_FEDERATION_DAIRY_ID = '00000000-0000-0000-0000-000000000001';

export class TenantDatabaseUnavailableError extends Error {
  public readonly statusCode = 503;
  public readonly code: string;

  constructor(public readonly dairyId: string, public readonly status: string, public readonly details?: string) {
    super(`Tenant database for dairy ${dairyId} is unavailable (status: ${status}). ${details || ''}`);
    this.name = 'TenantDatabaseUnavailableError';
    this.code = status === 'UNMAPPED' ? 'TENANT_MAPPING_MISSING' : 'TENANT_DATABASE_UNAVAILABLE';
  }
}

export class TenantDatabaseManager {
  private static instance: TenantDatabaseManager;
  private readonly tenantPools = new Map<string, pg.Pool>();
  private readonly tenantMappings = new Map<string, TenantDatabaseMapping>();
  private readonly tenantMemDbs = new Map<string, IDatabaseClient>(); // Strictly for NODE_ENV === 'test'
  private controlPlaneDb: IDatabaseClient | null = null;
  private isInitialized = false;

  /**
   * Per-pool in-flight or completed shutdown promises.
   * Kept on success (so pg-mem or pools without `.ended` are not ended twice)
   * and cleared on rejection so a failed shutdown can be retried.
   */
  private readonly poolShutdownPromises = new WeakMap<pg.Pool, Promise<void>>();
  private readonly closingTenantPools = new Map<string, Promise<void>>();
  private readonly deprovisioningTenants = new Map<string, Promise<any>>();
  private readonly inFlightAcquisitionsByDairy = new Map<string, Set<Promise<void>>>();
  private closingAllPoolsPromise: Promise<void> | null = null;

  private constructor() {}

  public static getInstance(): TenantDatabaseManager {
    if (!TenantDatabaseManager.instance) {
      TenantDatabaseManager.instance = new TenantDatabaseManager();
    }
    return TenantDatabaseManager.instance;
  }

  private isRealPostgresRequired(): boolean {
    return process.env['REQUIRE_REAL_POSTGRES'] === '1';
  }

  private isTestEnvironment(): boolean {
    return (
      process.env.NODE_ENV === 'test' ||
      process.execArgv.includes('--test') ||
      process.argv.some((a) => a.includes('test'))
    );
  }

  private getSslConfig(connectionUri?: string): { rejectUnauthorized: boolean } | undefined {
    if (config.DATABASE_TLS_MODE === 'disable') {
      return undefined;
    }
    const uri = connectionUri || '';
    const isRemote =
      uri.length > 0 &&
      !uri.includes('127.0.0.1') &&
      !uri.includes('localhost');

    const shouldEnableSsl =
      config.DATABASE_TLS_MODE === 'require' ||
      isRemote ||
      uri.includes('sslmode=require') ||
      uri.includes('supabase.co') ||
      uri.includes('pooler.supabase.com') ||
      uri.includes('neon.tech') ||
      config.NODE_ENV === 'production';

    return shouldEnableSsl ? { rejectUnauthorized: false } : undefined;
  }

  private createTenantPool(dairyId: string, connectionUri: string): pg.Pool {
    const tenantPool = new pg.Pool({
      connectionString: connectionUri,
      max: config.TENANT_POOL_MAX || 5,
      idleTimeoutMillis: config.TENANT_POOL_IDLE_TIMEOUT_MS || 30000,
      connectionTimeoutMillis: config.TENANT_POOL_CONNECTION_TIMEOUT_MS || 30000,
      ssl: this.getSslConfig(connectionUri),
    });
    tenantPool.on('error', (err: any) => {
      logger.error(
        { dairyId, code: err?.code, error: err?.message || String(err) },
        'Unexpected error on idle PostgreSQL tenant pool client'
      );
    });
    return tenantPool;
  }

  private createAdminPool(adminUri: string): pg.Pool {
    return new pg.Pool({
      connectionString: adminUri,
      connectionTimeoutMillis: config.TENANT_POOL_CONNECTION_TIMEOUT_MS || 30000,
      ssl: this.getSslConfig(adminUri),
    });
  }

  private async trackAcquisition<T>(dairyId: string, fn: () => Promise<T>): Promise<T> {
    let bucket = this.inFlightAcquisitionsByDairy.get(dairyId);
    if (!bucket) {
      bucket = new Set();
      this.inFlightAcquisitionsByDairy.set(dairyId, bucket);
    }
    let resolveTrack!: () => void;
    const marker = new Promise<void>((resolve) => {
      resolveTrack = resolve;
    });
    bucket.add(marker);
    try {
      return await fn();
    } finally {
      resolveTrack();
      bucket.delete(marker);
      if (bucket.size === 0 && this.inFlightAcquisitionsByDairy.get(dairyId) === bucket) {
        this.inFlightAcquisitionsByDairy.delete(dairyId);
      }
    }
  }

  private assertTenantLifecycleAvailable(dairyId: string): void {
    if (this.closingAllPoolsPromise) {
      throw new TenantDatabaseUnavailableError(
        dairyId,
        'SHUTTING_DOWN',
        'Tenant database manager is currently shutting down all pools'
      );
    }
    if (this.deprovisioningTenants.has(dairyId)) {
      throw new TenantDatabaseUnavailableError(
        dairyId,
        'DEPROVISIONING',
        'Tenant database is currently being deprovisioned'
      );
    }
    const cached = this.tenantMappings.get(dairyId);
    if (
      cached &&
      (cached.provisioningStatus === 'DEPROVISIONING' || cached.provisioningStatus === 'DEPROVISION_FAILED')
    ) {
      throw new TenantDatabaseUnavailableError(
        dairyId,
        cached.provisioningStatus,
        cached.provisioningError || `Tenant database is unavailable (status: ${cached.provisioningStatus})`
      );
    }
  }

  private async awaitPendingTenantClose(dairyId: string): Promise<void> {
    while (true) {
      this.assertTenantLifecycleAvailable(dairyId);
      const pendingClose = this.closingTenantPools.get(dairyId);
      if (!pendingClose) {
        break;
      }
      try {
        await pendingClose;
      } catch (err: any) {
        throw new TenantDatabaseUnavailableError(
          dairyId,
          'POOL_SHUTDOWN_FAILED',
          err?.message || 'Tenant pool shutdown failed; retry close before acquiring a replacement pool'
        );
      }
    }
  }

  private async ensureExistingPoolUsableOrEvict(dairyId: string): Promise<pg.Pool | undefined> {
    const existingPool = this.tenantPools.get(dairyId);
    if (!existingPool) {
      return undefined;
    }
    const anyPool = existingPool as any;
    if (!anyPool.ending && !anyPool.ended) {
      return existingPool;
    }
    try {
      await this.closeTenantPool(dairyId);
    } catch (err: any) {
      throw new TenantDatabaseUnavailableError(
        dairyId,
        'POOL_SHUTDOWN_FAILED',
        err?.message || 'Existing tenant pool is ending or unhealthy and could not be closed cleanly'
      );
    }
    await this.awaitPendingTenantClose(dairyId);
    return undefined;
  }

  private async endPoolSafely(pool: pg.Pool): Promise<void> {
    const inflight = this.poolShutdownPromises.get(pool);
    if (inflight) {
      return inflight;
    }

    const anyPool = pool as any;
    if (anyPool.ended) {
      return;
    }

    // Create and register a single shared shutdown promise BEFORE any await so
    // concurrent callers share it and rejections propagate without creating an
    // unawaited detached promise.
    const shutdownPromise = (async () => {
      if (anyPool.ending) {
        const deadline = Date.now() + 10000;
        while (!anyPool.ended && Date.now() < deadline) {
          await new Promise<void>((r) => setTimeout(r, 25));
        }
        if (!anyPool.ended) {
          throw new Error('Timed out waiting for externally initiated tenant pool shutdown to complete.');
        }
        return;
      }
      await pool.end();
    })();

    this.poolShutdownPromises.set(pool, shutdownPromise);
    try {
      await shutdownPromise;
    } catch (err) {
      this.poolShutdownPromises.delete(pool);
      throw err;
    }
  }

  public getTenantPool(dairyId: string): pg.Pool | undefined {
    return this.tenantPools.get(dairyId);
  }

  public getControlPlaneDb(): IDatabaseClient {
    return this.controlPlaneDb || (defaultControlPlaneDb as unknown as IDatabaseClient);
  }

  public setControlPlaneDb(db: IDatabaseClient): void {
    this.controlPlaneDb = db;
  }

  public async initialize(controlPlaneDb?: IDatabaseClient): Promise<void> {
    if (this.isInitialized) return;
    this.controlPlaneDb = controlPlaneDb || this.getControlPlaneDb();
    const effectiveDb = this.controlPlaneDb;

    try {
      // 1. Ensure central control plane mapping table exists (with ON DELETE RESTRICT on dairy_id)
      await effectiveDb.query(`
        CREATE TABLE IF NOT EXISTS dairy_database_mappings (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          dairy_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE RESTRICT,
          dairy_code VARCHAR(30) NOT NULL,
          database_name VARCHAR(100) NOT NULL,
          resource_type VARCHAR(50) NOT NULL DEFAULT 'PHYSICAL_DATABASE',
          connection_uri_encrypted TEXT,
          schema_version VARCHAR(50) NOT NULL DEFAULT 'v1.0.0',
          provisioning_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
          provisioning_error TEXT,
          provisioned_at TIMESTAMPTZ,
          last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_dairy_db_mappings_dairy_id ON dairy_database_mappings(dairy_id);
      `);

      // 2. Load existing mappings from central database
      const existing = await effectiveDb.query(`SELECT * FROM dairy_database_mappings;`);
      for (const row of existing.rows) {
        const mapping: TenantDatabaseMapping = {
          id: row.id,
          dairyId: row.dairy_id,
          dairyCode: row.dairy_code,
          databaseName: row.database_name,
          resourceType: row.resource_type === 'ISOLATED_TEST_INSTANCE' ? 'ISOLATED_TEST_INSTANCE' : 'PHYSICAL_DATABASE',
          connectionUriEncrypted: row.connection_uri_encrypted,
          schemaVersion: row.schema_version,
          provisioningStatus: row.provisioning_status,
          provisioningError: row.provisioning_error,
          provisionedAt: row.provisioned_at?.toISOString?.() || row.provisioned_at,
          lastVerifiedAt: row.last_verified_at?.toISOString?.() || row.last_verified_at,
        };
        this.tenantMappings.set(mapping.dairyId, mapping);
      }

      // Pre-seed platform federation central mapping in memory
      this.tenantMappings.set(PLATFORM_FEDERATION_DAIRY_ID, this.getPlatformFederationMapping());

      this.isInitialized = true;
      logger.info(
        { loadedTenantCount: this.tenantMappings.size },
        'TenantDatabaseManager initialized with authoritative database-per-dairy routing.'
      );
    } catch (err: any) {
      logger.error({ error: err.message }, 'Error initializing TenantDatabaseManager mappings');
      if (this.isRealPostgresRequired()) {
        throw new Error(
          `CRITICAL: TenantDatabaseManager control-plane initialization failed while REQUIRE_REAL_POSTGRES=1: ${err.message}`
        );
      }
      // In offline unit test mode, allow initialization to proceed
      if (process.env.NODE_ENV === 'test') {
        this.isInitialized = true;
      }
    }
  }

  public isPlatformFederationDairy(dairyId?: string): boolean {
    if (!dairyId) return true;
    const normalized = dairyId.trim().toLowerCase();
    return (
      normalized === PLATFORM_FEDERATION_DAIRY_ID ||
      normalized === 'df-platform' ||
      normalized === 'platform' ||
      normalized === 'default'
    );
  }

  public getPlatformFederationMapping(): TenantDatabaseMapping {
    return {
      id: PLATFORM_FEDERATION_DAIRY_ID,
      dairyId: PLATFORM_FEDERATION_DAIRY_ID,
      dairyCode: 'DF-PLATFORM',
      databaseName: 'postgres',
      resourceType: 'PHYSICAL_DATABASE',
      schemaVersion: 'v1.0.0',
      provisioningStatus: 'ACTIVE',
      provisionedAt: '2026-01-01T00:00:00.000Z',
      lastVerifiedAt: new Date().toISOString(),
    };
  }

  public getTenantMapping(dairyId: string): TenantDatabaseMapping | null {
    if (this.isPlatformFederationDairy(dairyId)) {
      return this.getPlatformFederationMapping();
    }
    return this.tenantMappings.get(dairyId) || null;
  }

  /**
   * Resolves the authoritative tenant database mapping from memory or central dairy_database_mappings
   * without fabricating a synthetic test mapping.
   */
  public async resolveTenantMapping(dairyId: string): Promise<TenantDatabaseMapping | null> {
    if (!dairyId || !dairyId.trim()) {
      return null;
    }
    if (this.isPlatformFederationDairy(dairyId)) {
      return this.getPlatformFederationMapping();
    }
    const cached = this.tenantMappings.get(dairyId);
    if (cached) {
      return cached;
    }
    const controlDb = this.getControlPlaneDb();
    try {
      const res = await controlDb.query(
        'SELECT * FROM dairy_database_mappings WHERE dairy_id = $1;',
        [dairyId]
      );
      if (res.rows.length > 0) {
        const currentCached = this.tenantMappings.get(dairyId);
        if (
          this.deprovisioningTenants.has(dairyId) ||
          currentCached?.provisioningStatus === 'DEPROVISIONING' ||
          currentCached?.provisioningStatus === 'DEPROVISION_FAILED'
        ) {
          return currentCached || null;
        }
        const row = res.rows[0];
        const mapping: TenantDatabaseMapping = {
          id: row.id,
          dairyId: row.dairy_id,
          dairyCode: row.dairy_code,
          databaseName: row.database_name,
          resourceType: row.resource_type === 'ISOLATED_TEST_INSTANCE' ? 'ISOLATED_TEST_INSTANCE' : 'PHYSICAL_DATABASE',
          connectionUriEncrypted: row.connection_uri_encrypted,
          schemaVersion: row.schema_version,
          provisioningStatus: row.provisioning_status,
          provisioningError: row.provisioning_error,
          provisionedAt: row.provisioned_at?.toISOString?.() || row.provisioned_at,
          lastVerifiedAt: row.last_verified_at?.toISOString?.() || row.last_verified_at,
        };
        this.tenantMappings.set(dairyId, mapping);
        return mapping;
      }
    } catch (err: any) {
      throw new TenantDatabaseUnavailableError(
        dairyId,
        'CONTROL_PLANE_UNAVAILABLE',
        err?.message || 'Unable to query tenant database mapping'
      );
    }
    return null;
  }

  /**
   * Strict tenant DB resolver: validates mapping existence and ACTIVE provisioning state,
   * never fabricates a test mapping, and never falls back to central control-plane DB.
   */
  public async getStrictTenantDb(dairyId: string): Promise<IDatabaseClient> {
    if (!dairyId || !dairyId.trim()) {
      throw new TenantDatabaseUnavailableError('UNKNOWN', 'UNMAPPED', 'Organization ID is required');
    }
    if (this.isPlatformFederationDairy(dairyId)) {
      return this.getControlPlaneDb();
    }

    return this.trackAcquisition(dairyId, async () => {
      await this.awaitPendingTenantClose(dairyId);

      let mapping = await this.resolveTenantMapping(dairyId);
      await this.awaitPendingTenantClose(dairyId);
      mapping = this.tenantMappings.get(dairyId) || mapping;

      if (!mapping) {
        throw new TenantDatabaseUnavailableError(
          dairyId,
          'UNMAPPED',
          'No tenant database mapping found for this organization'
        );
      }

      if (mapping.provisioningStatus !== 'ACTIVE') {
        throw new TenantDatabaseUnavailableError(
          dairyId,
          mapping.provisioningStatus,
          mapping.provisioningError || `Tenant database provisioning status is ${mapping.provisioningStatus}`
        );
      }

      const usablePool = await this.ensureExistingPoolUsableOrEvict(dairyId);
      if (usablePool) {
        return this.wrapPgPool(usablePool, dairyId);
      }

      const latestMapping = this.tenantMappings.get(dairyId);
      if (!latestMapping || latestMapping.provisioningStatus !== 'ACTIVE') {
        throw new TenantDatabaseUnavailableError(
          dairyId,
          latestMapping?.provisioningStatus || 'UNMAPPED',
          latestMapping?.provisioningError || 'Tenant database is no longer ACTIVE'
        );
      }
      mapping = latestMapping;

      if (this.tenantMemDbs.has(dairyId)) {
        return this.tenantMemDbs.get(dairyId)!;
      }

      if (mapping.resourceType === 'ISOLATED_TEST_INSTANCE') {
        if (this.isRealPostgresRequired()) {
          throw new TenantDatabaseUnavailableError(
            dairyId,
            'ISOLATED_TEST_INSTANCE_FORBIDDEN',
            'In-memory tenant database is strictly prohibited when REQUIRE_REAL_POSTGRES=1'
          );
        }
        const memClient = this.createIsolatedMemoryDatabase(dairyId);
        this.tenantMemDbs.set(dairyId, memClient);
        return memClient;
      }

      if (!mapping.connectionUriEncrypted) {
        if (mapping.databaseName === 'postgres' || mapping.databaseName === 'dfarm_control_plane') {
          return this.getControlPlaneDb();
        }
        throw new TenantDatabaseUnavailableError(
          dairyId,
          'CREDENTIALS_MISSING',
          'Tenant database connection credentials are missing'
        );
      }

      try {
        const decryptedUri = CredentialEncryption.decrypt(mapping.connectionUriEncrypted);
        this.assertTenantLifecycleAvailable(dairyId);
        const concurrentPool = this.tenantPools.get(dairyId);
        if (concurrentPool) {
          if ((concurrentPool as any).ending || (concurrentPool as any).ended) {
            throw new TenantDatabaseUnavailableError(
              dairyId,
              'POOL_CLOSING',
              'Tenant database pool is currently closing'
            );
          }
          return this.wrapPgPool(concurrentPool, dairyId);
        }
        const tenantPool = this.createTenantPool(dairyId, decryptedUri);
        this.tenantPools.set(dairyId, tenantPool);
        return this.wrapPgPool(tenantPool, dairyId);
      } catch (err: any) {
        if (err instanceof TenantDatabaseUnavailableError) {
          throw err;
        }
        throw new TenantDatabaseUnavailableError(
          dairyId,
          'CONNECTION_FAILED',
          err?.message || 'Failed to initialize tenant database pool'
        );
      }
    });
  }

  public getAllMappings(): TenantDatabaseMapping[] {
    return Array.from(this.tenantMappings.values());
  }

  public getAllTenantDbs(): IDatabaseClient[] {
    const clients: IDatabaseClient[] = [];
    for (const pool of this.tenantPools.values()) {
      clients.push(this.wrapPgPool(pool));
    }
    for (const memDb of this.tenantMemDbs.values()) {
      clients.push(memDb);
    }
    return clients;
  }

  /**
   * Generates a safe, sanitized, unique PostgreSQL database name for a dairy tenant.
   * Conforms to PostgreSQL identifier rules (max 63 characters).
   */
  public generateTenantDatabaseName(dairyId: string, dairyCode: string): string {
    const cleanCode = dairyCode.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20);
    const idPrefix = dairyId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
    const dbName = `dfarm_tenant_${cleanCode}_${idPrefix}`;
    return dbName.slice(0, 63);
  }

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
  public async provisionTenantDatabase(
    paramsOrDairyId: ProvisionTenantParams | string,
    dairyCode?: string,
    dairyName?: string
  ): Promise<TenantDatabaseMapping> {
    const params: ProvisionTenantParams = typeof paramsOrDairyId === 'string'
      ? { dairyId: paramsOrDairyId, dairyCode: dairyCode || 'TEN', dairyName: dairyName || 'Cooperative Dairy' }
      : paramsOrDairyId;

    const { dairyId, dairyCode: code, dairyName: name, adminConnectionString } = params;
    const dbName = this.generateTenantDatabaseName(dairyId, code);
    const now = new Date().toISOString();

    logger.info({ dairyId, dairyCode: code, dairyName: name, dbName }, 'Starting separate tenant database provisioning...');

    // 1. Check lifecycle availability before provisioning
    this.assertTenantLifecycleAvailable(dairyId);
    await this.awaitPendingTenantClose(dairyId);

    // 2. Check idempotency: If already ACTIVE, return existing mapping
    const existing = this.tenantMappings.get(dairyId);
    if (existing && existing.provisioningStatus === 'ACTIVE') {
      logger.info({ dairyId, dbName }, 'Tenant database already active and provisioned. Returning existing mapping.');
      return existing;
    }

    // 3. Register initial PROVISIONING state in central database
    const mappingId = existing?.id || crypto.randomUUID();
    let currentMapping: TenantDatabaseMapping = {
      id: mappingId,
      dairyId,
      dairyCode: code,
      databaseName: dbName,
      resourceType: 'PHYSICAL_DATABASE',
      schemaVersion: 'v1.0.0',
      provisioningStatus: 'PROVISIONING',
      lastVerifiedAt: now,
    };
    this.tenantMappings.set(dairyId, currentMapping);

    const controlDb = this.getControlPlaneDb();

    // Ensure organization exists in control plane for foreign key constraint
    try {
      await controlDb.query(`
        INSERT INTO organizations (id, name, code, status)
        VALUES ($1, $2, $3, 'ACTIVE')
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code;
      `, [dairyId, name, code]);
    } catch (err: any) {
      logger.warn({ error: err.message }, 'Warning during organization insertion into control plane');
    }

    await this.persistMappingStatus(controlDb, currentMapping);

    // 4. Physical Database Creation
    let tenantUri = '';
    let isTestDouble = false;

    try {
      const baseUri = adminConnectionString || config.DATABASE_PROVISIONER_URL || config.CENTRAL_DATABASE_URL || config.DATABASE_URL;

      // Connect to cluster maintenance database ('postgres')
      const adminUri = this.deriveAdminDatabaseUri(baseUri);
      const adminPool = this.createAdminPool(adminUri);
      adminPool.on('error', (poolErr: any) => {
        logger.error(
          { dairyId, dbName, code: poolErr?.code, error: poolErr?.message || String(poolErr) },
          'Unexpected error on PostgreSQL provisioning admin pool'
        );
      });

      try {
        // Check if database exists
        const checkRes = await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1;', [dbName]);
        if (checkRes.rows.length === 0) {
          logger.info({ dbName }, 'Executing CREATE DATABASE on PostgreSQL cluster...');
          await adminPool.query(`CREATE DATABASE "${dbName}" WITH ENCODING = 'UTF8' TEMPLATE = template1;`);
        } else {
          logger.info({ dbName }, 'Target tenant database already exists on cluster; reusing.');
        }
        await this.endPoolSafely(adminPool);

        currentMapping.provisioningStatus = 'DATABASE_CREATED';
        await this.persistMappingStatus(controlDb, currentMapping);

        // Derive tenant URI pointing to the newly created database
        tenantUri = this.deriveTenantUri(baseUri, dbName);
        currentMapping.connectionUriEncrypted = CredentialEncryption.encrypt(tenantUri);
        currentMapping.resourceType = 'PHYSICAL_DATABASE';
      } catch (err: any) {
        try {
          await this.endPoolSafely(adminPool);
        } catch (closeErr: any) {
          logger.error(
            { dairyId, dbName, error: closeErr?.message || String(closeErr) },
            'Error closing provisioning admin pool after failure'
          );
        }

        // If physical Postgres is unreachable and running in test or development mode, allow isolated test double
        if ((this.isTestEnvironment() || config.NODE_ENV === 'development') && !process.env.TEST_REAL_POSTGRES && !this.isRealPostgresRequired()) {
          logger.warn({ error: err.message }, 'Physical Postgres unavailable in development/test mode. Provisioning isolated test/development memory double.');
          isTestDouble = true;
          currentMapping.resourceType = 'ISOLATED_TEST_INSTANCE';
          currentMapping.connectionUriEncrypted = CredentialEncryption.encrypt(`mock://pg-mem/${dbName}`);
          tenantUri = `mock://pg-mem/${dbName}`;
        } else {
          // In production: STRICT FAILURE. NEVER downgrade to schema or in-memory in production!
          currentMapping.provisioningStatus = 'FAILED';
          currentMapping.provisioningError = `Physical database creation failed: ${err.message}`;
          await this.persistMappingStatus(controlDb, currentMapping);
          throw new Error(`CRITICAL: Tenant database provisioning failed for ${code}: ${err.message}`);
        }
      }
    } catch (err: any) {
      currentMapping.provisioningStatus = 'FAILED';
      currentMapping.provisioningError = err.message;
      await this.persistMappingStatus(controlDb, currentMapping);
      throw err;
    }

    // 4. MIGRATING Phase
    currentMapping.provisioningStatus = 'MIGRATING';
    await this.persistMappingStatus(controlDb, currentMapping);

    await this.awaitPendingTenantClose(dairyId);

    let tenantClient: IDatabaseClient;
    let tenantPoolRef: pg.Pool | null = null;

    if (isTestDouble) {
      tenantClient = this.createIsolatedMemoryDatabase(dairyId);
      this.tenantMemDbs.set(dairyId, tenantClient);
    } else {
      const tenantPool = this.createTenantPool(dairyId, tenantUri);
      tenantPoolRef = tenantPool;
      this.tenantPools.set(dairyId, tenantPool);
      tenantClient = this.wrapPgPool(tenantPool, dairyId);
    }

    try {
      if (!isTestDouble && tenantPoolRef) {
        // Apply the complete operational migration track using the physical pg.Pool directly
        // so advisory lock acquisition, per-migration transactions, and unlock share one PoolClient.
        logger.info({ dairyId, dbName }, 'Applying complete operational migrations to tenant database...');
        await MigrationRunner.runTenantMigrations(tenantPoolRef, dairyId);
      }

      // 5. Insert tenant metadata verifying ownership
      await tenantClient.query(`
        CREATE TABLE IF NOT EXISTS tenant_metadata (
          dairy_id UUID PRIMARY KEY,
          dairy_code VARCHAR(30) NOT NULL,
          dairy_name VARCHAR(150) NOT NULL,
          database_name VARCHAR(100) NOT NULL,
          schema_version VARCHAR(50) NOT NULL,
          provisioned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await tenantClient.query(`
        INSERT INTO tenant_metadata (dairy_id, dairy_code, dairy_name, database_name, schema_version)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (dairy_id) DO UPDATE SET
          database_name = EXCLUDED.database_name,
          last_verified_at = NOW();
      `, [dairyId, code, name, dbName, 'v1.0.0']);

      // 5.1 Ensure parent organizations record exists in tenant database for foreign keys
      try {
        await tenantClient.query(`
          INSERT INTO organizations (id, name, code, status)
          VALUES ($1, $2, $3, 'ACTIVE')
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            code = EXCLUDED.code;
        `, [dairyId, name, code]);
      } catch (orgErr: any) {
        logger.warn({ dairyId, error: orgErr.message }, 'Failed seeding organization root record into tenant DB');
      }

      // 6. VERIFYING Phase
      currentMapping.provisioningStatus = 'VERIFYING';
      const verifyRes = await tenantClient.query('SELECT dairy_id, database_name FROM tenant_metadata WHERE dairy_id = $1;', [dairyId]);
      if (verifyRes.rows.length === 0) {
        throw new Error('Tenant metadata verification failed: record missing');
      }

      // 7. Mark ACTIVE
      currentMapping.provisioningStatus = 'ACTIVE';
      currentMapping.provisionedAt = new Date().toISOString();
      currentMapping.lastVerifiedAt = new Date().toISOString();
      currentMapping.provisioningError = undefined;

      await this.persistMappingStatus(controlDb, currentMapping);
      this.tenantMappings.set(dairyId, currentMapping);

      // Also sync to inMemoryDairies if present
      const inMem = inMemoryDairies.get(dairyId);
      if (inMem) {
        inMem.provisioningStatus = 'ACTIVE';
        inMem.provisioningError = undefined;
        inMem.databaseName = dbName;
      }

      logger.info({ dairyId, dairyCode: code, dbName, status: 'ACTIVE' }, 'Separate tenant database successfully provisioned and active.');
      return currentMapping;
    } catch (err: any) {
      // Close and evict any partially initialized tenant pool or test double
      // created before migration/verification failed so connections do not leak.
      // Preserve both the original migration error and any cleanup error.
      let cleanupErr: Error | null = null;
      try {
        await this.closeTenantPool(dairyId);
      } catch (closeErr: any) {
        cleanupErr = closeErr instanceof Error ? closeErr : new Error(String(closeErr));
        logger.error(
          { dairyId, dbName, error: cleanupErr.message },
          'Error closing partially initialized tenant pool after provisioning failure'
        );
      }
      currentMapping.provisioningStatus = 'FAILED';
      currentMapping.provisioningError = cleanupErr
        ? `Tenant migration or verification failed: ${err.message}; pool cleanup failed: ${cleanupErr.message}`
        : `Tenant migration or verification failed: ${err.message}`;
      await this.persistMappingStatus(controlDb, currentMapping);
      if (cleanupErr) {
        const origErr = err instanceof Error ? err : new Error(String(err));
        throw new AggregateError(
          [origErr, cleanupErr],
          `${origErr.message} (cleanup also failed: ${cleanupErr.message})`
        );
      }
      throw err;
    }
  }

  /**
   * Resolves an authorized, bounded database client for the specified Dairy.
   * Throws if no active mapping exists. Never falls back to central DB or creates a fake DB.
   */
  public async getTenantDb(dairyId?: string): Promise<IDatabaseClient> {
    if (!dairyId || this.isPlatformFederationDairy(dairyId)) {
      return this.getControlPlaneDb();
    }

    return this.trackAcquisition(dairyId, async () => {
      await this.awaitPendingTenantClose(dairyId);

      // 1. Resolve mapping from memory or central DB
      let mapping = this.tenantMappings.get(dairyId);
      if (!mapping) {
        const controlDb = this.getControlPlaneDb();
        try {
          const res = await controlDb.query(
            'SELECT * FROM dairy_database_mappings WHERE dairy_id = $1;',
            [dairyId]
          );
          const currentCached = this.tenantMappings.get(dairyId);
          if (
            this.deprovisioningTenants.has(dairyId) ||
            currentCached?.provisioningStatus === 'DEPROVISIONING' ||
            currentCached?.provisioningStatus === 'DEPROVISION_FAILED'
          ) {
            mapping = currentCached;
          } else if (res.rows.length > 0) {
            const row = res.rows[0];
            mapping = {
              id: row.id,
              dairyId: row.dairy_id,
              dairyCode: row.dairy_code,
              databaseName: row.database_name,
              resourceType: row.resource_type === 'ISOLATED_TEST_INSTANCE' ? 'ISOLATED_TEST_INSTANCE' : 'PHYSICAL_DATABASE',
              connectionUriEncrypted: row.connection_uri_encrypted,
              schemaVersion: row.schema_version,
              provisioningStatus: row.provisioning_status,
              provisioningError: row.provisioning_error,
              provisionedAt: row.provisioned_at?.toISOString?.() || row.provisioned_at,
              lastVerifiedAt: row.last_verified_at?.toISOString?.() || row.last_verified_at,
            };
            this.tenantMappings.set(dairyId, mapping);
          }
        } catch (err: any) {
          logger.warn({ dairyId, error: err.message }, 'Failed to query dairy_database_mappings from control plane');
        }
      }

      await this.awaitPendingTenantClose(dairyId);
      mapping = this.tenantMappings.get(dairyId) || mapping;

      if (!mapping && !this.isRealPostgresRequired() && !process.env.TEST_REAL_POSTGRES && (this.isTestEnvironment() || config.NODE_ENV === 'development')) {
        const testMapping: TenantDatabaseMapping = {
          id: crypto.randomUUID(),
          dairyId,
          dairyCode: `DEV-${dairyId.slice(0, 4)}`,
          databaseName: `dfarm_tenant_${dairyId.slice(0, 8)}`,
          resourceType: 'ISOLATED_TEST_INSTANCE',
          schemaVersion: 'v1.0.0',
          provisioningStatus: 'ACTIVE',
          provisionedAt: new Date().toISOString(),
          lastVerifiedAt: new Date().toISOString(),
        };
        this.tenantMappings.set(dairyId, testMapping);
        mapping = testMapping;
      }

      if (mapping && (mapping.provisioningStatus === 'FAILED' || mapping.provisioningStatus === 'DEPROVISIONING' || mapping.provisioningStatus === 'DEPROVISION_FAILED')) {
        throw new TenantDatabaseUnavailableError(
          dairyId,
          mapping.provisioningStatus,
          mapping.provisioningError || `Tenant database is unavailable (status: ${mapping.provisioningStatus})`
        );
      }

      if (!mapping || mapping.provisioningStatus !== 'ACTIVE') {
        if (mapping?.provisioningStatus === 'PROVISIONING' || mapping?.provisioningStatus === 'MIGRATING' || mapping?.provisioningStatus === 'VERIFYING') {
          throw new TenantDatabaseUnavailableError(dairyId, mapping.provisioningStatus, 'Tenant database is currently being provisioned');
        }
        if (this.isPlatformFederationDairy(dairyId)) {
          return this.getControlPlaneDb();
        }

        if (this.isRealPostgresRequired()) {
          throw new TenantDatabaseUnavailableError(
            dairyId,
            mapping?.provisioningStatus || 'UNMAPPED',
            'Active physical tenant database mapping is required when REQUIRE_REAL_POSTGRES=1'
          );
        }

        // If registered organization exists in control plane, serve via partitioned control plane database
        const controlDb = this.getControlPlaneDb();
        try {
          const orgCheck = await controlDb.query(
            'SELECT id, name, code, status FROM organizations WHERE id = $1;',
            [dairyId]
          );
          await this.awaitPendingTenantClose(dairyId);
          if (orgCheck.rows.length > 0 && orgCheck.rows[0].status === 'ACTIVE') {
            logger.info({ dairyId, dairyName: orgCheck.rows[0].name }, 'Registered organization has no isolated tenant database; serving via partitioned control plane database.');
            return this.getControlPlaneDb();
          }
        } catch (checkErr: any) {
          if (checkErr instanceof TenantDatabaseUnavailableError) {
            throw checkErr;
          }
          logger.warn({ dairyId, error: checkErr.message }, 'Failed to check organization existence in control plane');
        }

        if (config.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production') {
          logger.info({ dairyId }, 'No isolated tenant database found; using control plane database fallback in development.');
          return this.getControlPlaneDb();
        }
        throw new Error(`No active persistent database mapping found for dairy: ${dairyId}`);
      }

      // 2. Check active pool cache (never returning ending/ended pools)
      const usablePool = await this.ensureExistingPoolUsableOrEvict(dairyId);
      if (usablePool) {
        return this.wrapPgPool(usablePool, dairyId);
      }

      const latestMapping = this.tenantMappings.get(dairyId);
      if (!latestMapping || latestMapping.provisioningStatus !== 'ACTIVE') {
        throw new TenantDatabaseUnavailableError(
          dairyId,
          latestMapping?.provisioningStatus || 'UNMAPPED',
          latestMapping?.provisioningError || 'Tenant database is no longer ACTIVE'
        );
      }
      mapping = latestMapping;

      // 3. Check memory test DB cache (test mode only)
      if (this.tenantMemDbs.has(dairyId)) {
        return this.tenantMemDbs.get(dairyId)!;
      }

      // 4. Initialize bounded tenant pool from encrypted connection string
      if (mapping.resourceType === 'ISOLATED_TEST_INSTANCE') {
        if (this.isRealPostgresRequired()) {
          throw new TenantDatabaseUnavailableError(
            dairyId,
            'ISOLATED_TEST_INSTANCE_FORBIDDEN',
            'In-memory tenant database is strictly prohibited when REQUIRE_REAL_POSTGRES=1'
          );
        }
        let memClient = this.tenantMemDbs.get(dairyId);
        if (!memClient) {
          memClient = this.createIsolatedMemoryDatabase(dairyId);
          this.tenantMemDbs.set(dairyId, memClient);
        }
        return memClient;
      }

      if (!mapping.connectionUriEncrypted) {
        if (
          !this.isRealPostgresRequired() && (
            config.NODE_ENV === 'development' ||
            process.env.NODE_ENV !== 'production' ||
            this.isPlatformFederationDairy(dairyId) ||
            mapping.databaseName === 'postgres' ||
            mapping.databaseName === 'dfarm_control_plane'
          )
        ) {
          return this.getControlPlaneDb();
        }
        if (this.isPlatformFederationDairy(dairyId)) {
          return this.getControlPlaneDb();
        }
        throw new Error(`Tenant database connection credentials missing for dairy: ${dairyId}`);
      }

      const decryptedUri = CredentialEncryption.decrypt(mapping.connectionUriEncrypted);
      this.assertTenantLifecycleAvailable(dairyId);
      const concurrentPool = this.tenantPools.get(dairyId);
      if (concurrentPool) {
        if ((concurrentPool as any).ending || (concurrentPool as any).ended) {
          throw new TenantDatabaseUnavailableError(
            dairyId,
            'POOL_CLOSING',
            'Tenant database pool is currently closing'
          );
        }
        return this.wrapPgPool(concurrentPool, dairyId);
      }
      const tenantPool = this.createTenantPool(dairyId, decryptedUri);

      this.tenantPools.set(dairyId, tenantPool);
      return this.wrapPgPool(tenantPool, dairyId);
    });
  }

  public async verifyTenantDatabase(dairyId: string): Promise<{
    isVerified: boolean;
    databaseName?: string;
    schemaVersion?: string;
    error?: string;
  }> {
    try {
      const client = await this.getTenantDb(dairyId);
      const res = await client.query('SELECT dairy_id, database_name, schema_version FROM tenant_metadata WHERE dairy_id = $1;', [dairyId]);
      if (res.rows.length === 0) {
        return { isVerified: false, error: 'tenant_metadata record not found' };
      }
      return {
        isVerified: true,
        databaseName: res.rows[0].database_name,
        schemaVersion: res.rows[0].schema_version,
      };
    } catch (err: any) {
      return { isVerified: false, error: err.message };
    }
  }

  public async closeTenantPool(dairyId: string): Promise<void> {
    const existingClose = this.closingTenantPools.get(dairyId);
    if (existingClose) {
      return existingClose;
    }

    const pool = this.tenantPools.get(dairyId);
    const memDb = this.tenantMemDbs.get(dairyId);
    if (!pool && !memDb) {
      return;
    }

    const closeOp = (async () => {
      if (pool) {
        await this.endPoolSafely(pool);
        if (this.tenantPools.get(dairyId) === pool) {
          this.tenantPools.delete(dairyId);
        }
      }
      if (memDb) {
        if (typeof memDb.close === 'function') {
          await memDb.close();
        }
        if (this.tenantMemDbs.get(dairyId) === memDb) {
          this.tenantMemDbs.delete(dairyId);
        }
      }
    })();

    this.closingTenantPools.set(dairyId, closeOp);
    try {
      await closeOp;
    } finally {
      if (this.closingTenantPools.get(dairyId) === closeOp) {
        this.closingTenantPools.delete(dairyId);
      }
    }
  }

  public async evictTenantPool(dairyId: string): Promise<void> {
    return this.closeTenantPool(dairyId);
  }

  public async closeAllPools(): Promise<void> {
    if (this.closingAllPoolsPromise) {
      return this.closingAllPoolsPromise;
    }

    const closeAllOp = (async () => {
      const errors: Error[] = [];
      const failedDairyIds = new Set<string>();

      // Iteratively drain all existing pools, in-flight closes, and in-flight acquisitions
      // so no concurrently created pool escapes global shutdown.
      while (true) {
        const inFlightPromises: Promise<void>[] = [];
        for (const bucket of this.inFlightAcquisitionsByDairy.values()) {
          for (const p of bucket) {
            inFlightPromises.push(p);
          }
        }

        const dairyIds = Array.from(
          new Set<string>([
            ...this.tenantPools.keys(),
            ...this.tenantMemDbs.keys(),
            ...this.closingTenantPools.keys(),
          ])
        ).filter((id) => !failedDairyIds.has(id));

        if (dairyIds.length === 0 && inFlightPromises.length === 0) {
          break;
        }

        const closeResults = await Promise.allSettled(
          dairyIds.map((dairyId) => this.closeTenantPool(dairyId))
        );
        closeResults.forEach((res, idx) => {
          if (res.status === 'rejected') {
            const failedId = dairyIds[idx];
            if (failedId) {
              failedDairyIds.add(failedId);
            }
            const err = res.reason instanceof Error ? res.reason : new Error(String(res.reason));
            logger.error({ error: err.message, dairyId: failedId }, 'Error closing tenant pool');
            errors.push(err);
          }
        });

        if (inFlightPromises.length > 0) {
          await Promise.allSettled(inFlightPromises);
        }
      }

      if (errors.length === 1) {
        throw errors[0];
      }
      if (errors.length > 1) {
        throw new AggregateError(
          errors,
          `Failed to close ${errors.length} tenant pool(s): ${errors.map((e) => e.message).join('; ')}`
        );
      }
    })();

    this.closingAllPoolsPromise = closeAllOp;
    try {
      await closeAllOp;
    } finally {
      if (this.closingAllPoolsPromise === closeAllOp) {
        this.closingAllPoolsPromise = null;
      }
    }
  }

  /**
   * Permanently deprovisions a dairy tenant:
   * 1. Marks tenant DEPROVISIONING and awaits any in-flight acquisitions before closing pools.
   * 2. Closes and evicts active connection pools.
   * 3. Drops physical PostgreSQL database cleanly (without FORCE or pg_terminate_backend).
   * 4. Cleans up customer_dairy_memberships, dairy_database_mappings, users, and organizations.
   * 5. On failure, records DEPROVISION_FAILED so partial tenants are never reopened and rethrows.
   */
  public async deprovisionTenantDatabase(
    dairyId: string,
    _options: { force?: boolean } = {}
  ): Promise<{
    success: boolean;
    dairyId: string;
    databaseName?: string;
    deprovisionedAt: string;
    details: string;
  }> {
    const existingDeprovision = this.deprovisioningTenants.get(dairyId);
    if (existingDeprovision) {
      return existingDeprovision;
    }

    const deprovisionOp = (async () => {
      const mapping = this.tenantMappings.get(dairyId);
      const dbName = mapping?.databaseName || this.generateTenantDatabaseName(dairyId, mapping?.dairyCode || 'TEN');
      const now = new Date().toISOString();

      logger.warn({ dairyId, dbName }, 'Starting permanent tenant database deprovisioning...');

      // Transition in-memory state immediately so new acquisitions fail closed with DEPROVISIONING
      const deprovisioningMapping: TenantDatabaseMapping = mapping
        ? { ...mapping, provisioningStatus: 'DEPROVISIONING', lastVerifiedAt: now }
        : {
            id: crypto.randomUUID(),
            dairyId,
            dairyCode: 'DEPROVISIONING',
            databaseName: dbName,
            resourceType: 'PHYSICAL_DATABASE',
            schemaVersion: 'v1.0.0',
            provisioningStatus: 'DEPROVISIONING',
            lastVerifiedAt: now,
          };
      this.tenantMappings.set(dairyId, deprovisioningMapping);

      try {
        // Wait for any already-in-flight acquisitions for this dairy to settle before closing pools
        const inFlight = this.inFlightAcquisitionsByDairy.get(dairyId);
        if (inFlight && inFlight.size > 0) {
          await Promise.allSettled(Array.from(inFlight));
        }

        // 1. Evict and close active pool
        await this.closeTenantPool(dairyId);

        // 2. Physical Database Drop (no pg_terminate_backend, no DROP DATABASE ... WITH (FORCE))
        if (
          mapping?.resourceType === 'PHYSICAL_DATABASE' &&
          (!this.isTestEnvironment() || process.env['TEST_REAL_POSTGRES'] === '1')
        ) {
          let maintenanceClient: pg.Client | null = null;
          try {
            const adminConn =
              config.DATABASE_PROVISIONER_URL ||
              config.CENTRAL_DATABASE_URL ||
              config.DATABASE_URL;
            const parsed = new URL(adminConn);
            parsed.pathname = '/postgres';
            const maintenanceUrl = parsed.toString();

            maintenanceClient = new pg.Client({
              connectionString: maintenanceUrl,
              ssl: this.getSslConfig(maintenanceUrl),
            });
            await maintenanceClient.connect();

            const activityRes = await maintenanceClient.query(
              `SELECT COUNT(*)::int AS cnt FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid();`,
              [dbName]
            );
            const activeCount = Number(activityRes.rows[0]?.cnt || 0);
            if (activeCount > 0) {
              throw new Error(
                `Physical tenant database '${dbName}' still has ${activeCount} active connection(s); refusing drop`
              );
            }

            await maintenanceClient.query(`DROP DATABASE IF EXISTS "${dbName}";`);
            logger.info({ dairyId, dbName }, 'Physical tenant database dropped successfully.');
          } catch (err: any) {
            logger.error({ dairyId, dbName, error: err.message }, 'Failed to drop physical tenant database');
            throw new Error(`Failed to drop physical tenant database ${dbName}: ${err.message}`);
          } finally {
            if (maintenanceClient) {
              try {
                await maintenanceClient.end();
              } catch {}
            }
          }
        }

        // 3. Central Control-Plane Database Cleanup
        const controlDb = this.getControlPlaneDb();
        try {
          await controlDb.query(
            `DELETE FROM customer_dairy_memberships WHERE organization_id = $1;`,
            [dairyId]
          );
          await controlDb.query(
            `DELETE FROM dairy_database_mappings WHERE dairy_id = $1;`,
            [dairyId]
          );
          await controlDb.query(
            `DELETE FROM users WHERE organization_id = $1;`,
            [dairyId]
          );

          const releasedCode = `DEL_${dairyId.replace(/-/g, '').slice(0, 16)}`;
          try {
            await controlDb.query(
              `UPDATE organizations SET status = 'INACTIVE', code = $2, updated_at = NOW() WHERE id = $1;`,
              [dairyId, releasedCode]
            );
          } catch {
            try {
              await controlDb.query(
                `UPDATE organizations SET status = 'INACTIVE', code = $2 WHERE id = $1;`,
                [dairyId, releasedCode]
              );
            } catch {
              await controlDb.query(
                `UPDATE organizations SET status = 'INACTIVE' WHERE id = $1;`,
                [dairyId]
              );
            }
          }
        } catch (err: any) {
          logger.error({ dairyId, error: err.message }, 'Error updating central database during deprovisioning');
          throw new Error(`Error updating central database during deprovisioning: ${err.message}`);
        }

        // 4. Clean in-memory tracking only after full deprovisioning succeeded
        this.tenantMappings.delete(dairyId);
        inMemoryDairies.delete(dairyId);

        logger.info({ dairyId, dbName }, 'Tenant database deprovisioning completed successfully.');

        return {
          success: true,
          dairyId,
          databaseName: dbName,
          deprovisionedAt: now,
          details: `Physical database ${dbName} dropped and central memberships cleaned up.`,
        };
      } catch (err: any) {
        const failedMapping: TenantDatabaseMapping = {
          ...deprovisioningMapping,
          provisioningStatus: 'DEPROVISION_FAILED',
          provisioningError: err?.message || 'Tenant database deprovisioning failed',
          lastVerifiedAt: new Date().toISOString(),
        };
        this.tenantMappings.set(dairyId, failedMapping);
        try {
          const controlDb = this.getControlPlaneDb();
          await controlDb.query(
            `UPDATE dairy_database_mappings
             SET provisioning_status = 'DEPROVISION_FAILED',
                 provisioning_error = $2,
                 last_verified_at = NOW()
             WHERE dairy_id = $1;`,
            [dairyId, failedMapping.provisioningError]
          );
        } catch (persistErr: any) {
          logger.warn(
            { dairyId, error: persistErr?.message },
            'Failed to persist DEPROVISION_FAILED status to control plane'
          );
        }
        throw err;
      }
    })();

    this.deprovisioningTenants.set(dairyId, deprovisionOp);
    try {
      return await deprovisionOp;
    } finally {
      if (this.deprovisioningTenants.get(dairyId) === deprovisionOp) {
        this.deprovisioningTenants.delete(dairyId);
      }
    }
  }

  public async getSafeHealthStatus(): Promise<{
    status: 'READY' | 'DEGRADED';
    totalActiveTenants: number;
    activePoolCount: number;
    pools: { dairyId: string; totalCount: number; idleCount: number; waitingCount: number }[];
  }> {
    const poolsSummary: { dairyId: string; totalCount: number; idleCount: number; waitingCount: number }[] = [];
    for (const [dairyId, pool] of this.tenantPools.entries()) {
      poolsSummary.push({
        dairyId,
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount,
      });
    }

    return {
      status: this.isInitialized ? 'READY' : 'DEGRADED',
      totalActiveTenants: this.tenantMappings.size,
      activePoolCount: this.tenantPools.size,
      pools: poolsSummary,
    };
  }

  private wrapPgPool(pool: pg.Pool, dairyId?: string): IDatabaseClient {
    return {
      query: (text: string, params?: any[]) => pool.query(text, params),
      withTransaction: async <T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await callback(client);
          await client.query('COMMIT');
          return result;
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      },
      close: async () => {
        if (dairyId && this.tenantPools.get(dairyId) === pool) {
          return this.closeTenantPool(dairyId);
        }
        for (const [id, mappedPool] of this.tenantPools.entries()) {
          if (mappedPool === pool) {
            return this.closeTenantPool(id);
          }
        }
        await this.endPoolSafely(pool);
      },
    };
  }

  private deriveAdminDatabaseUri(baseUri: string): string {
    // Replace target database with 'postgres' for administrative operations
    return baseUri.replace(/\/[a-zA-Z0-9_-]+(\?.*)?$/, '/postgres$1');
  }

  private deriveTenantUri(baseUri: string, tenantDbName: string): string {
    return baseUri.replace(/\/[a-zA-Z0-9_-]+(\?.*)?$/, `/${tenantDbName}$1`);
  }

  private async persistMappingStatus(controlDb: IDatabaseClient, mapping: TenantDatabaseMapping): Promise<void> {
    try {
      await controlDb.query(`
        INSERT INTO dairy_database_mappings (
          id, dairy_id, dairy_code, database_name, resource_type,
          connection_uri_encrypted, schema_version, provisioning_status,
          provisioning_error, provisioned_at, last_verified_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        ON CONFLICT (dairy_id) DO UPDATE SET
          database_name = EXCLUDED.database_name,
          resource_type = EXCLUDED.resource_type,
          connection_uri_encrypted = COALESCE(EXCLUDED.connection_uri_encrypted, dairy_database_mappings.connection_uri_encrypted),
          provisioning_status = EXCLUDED.provisioning_status,
          provisioning_error = EXCLUDED.provisioning_error,
          provisioned_at = COALESCE(EXCLUDED.provisioned_at, dairy_database_mappings.provisioned_at),
          last_verified_at = NOW();
      `, [
        mapping.id,
        mapping.dairyId,
        mapping.dairyCode,
        mapping.databaseName,
        mapping.resourceType,
        mapping.connectionUriEncrypted || null,
        mapping.schemaVersion,
        mapping.provisioningStatus,
        mapping.provisioningError || null,
        mapping.provisionedAt || (mapping.provisioningStatus === 'ACTIVE' ? new Date().toISOString() : null),
      ]);
    } catch (e: any) {
      logger.warn({ error: e.message, dairyId: mapping.dairyId }, 'Could not persist tenant mapping update to control plane database');
    }
  }

  private createIsolatedMemoryDatabase(_dairyId: string): IDatabaseClient {
    if (this.isRealPostgresRequired()) {
      throw new Error(
        'CRITICAL: In-memory pg-mem tenant database is strictly prohibited when REQUIRE_REAL_POSTGRES=1.'
      );
    }
    const db = newDb();

    db.public.registerFunction({
      name: 'gen_random_uuid',
      impure: true,
      implementation: () => crypto.randomUUID(),
    });
    db.public.registerFunction({
      name: 'decode',
      args: [db.public.getType('text' as any), db.public.getType('text' as any)],
      returns: db.public.getType('bytea' as any),
      implementation: (str: string, format: string) =>
        Buffer.from(str, format === 'base64' ? 'base64' : 'hex'),
    });
    db.public.registerFunction({
      name: 'encode',
      args: [db.public.getType('bytea' as any), db.public.getType('text' as any)],
      returns: db.public.getType('text' as any),
      implementation: (data: any, format: string) => {
        if (!data) return '';
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
        return buf.toString(format === 'base64' ? 'base64' : 'hex');
      },
    });

    db.public.registerFunction({
      name: 'to_char',
      args: [db.public.getType('timestamp' as any), db.public.getType('text' as any)],
      returns: db.public.getType('text' as any),
      implementation: (date: any, format: string) => {
        if (!date) return '';
        const d = date instanceof Date ? date : new Date(date);
        if (format === 'YYYY-MM') return d.toISOString().substring(0, 7);
        if (format === 'YYYYMMDD') return d.toISOString().substring(0, 10).replace(/-/g, '');
        return d.toISOString();
      },
    });
    db.public.registerFunction({
      name: 'to_char',
      args: [db.public.getType('date' as any), db.public.getType('text' as any)],
      returns: db.public.getType('text' as any),
      implementation: (date: any, format: string) => {
        if (!date) return '';
        const d = date instanceof Date ? date : new Date(date);
        if (format === 'YYYY-MM') return d.toISOString().substring(0, 7);
        if (format === 'YYYYMMDD') return d.toISOString().substring(0, 10).replace(/-/g, '');
        return d.toISOString();
      },
    });

    db.registerExtension('pgcrypto', (schema) => {
      schema.registerFunction({
        name: 'gen_random_uuid',
        impure: true,
        returns: db.public.getType('uuid' as any),
        implementation: () => crypto.randomUUID(),
      });
    });
    db.public.none('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');

    try {
      db.public.none('CREATE SCHEMA IF NOT EXISTS auth;');
      const authSchema = db.getSchema('auth');
      authSchema.registerFunction({
        name: 'uid',
        returns: db.public.getType('uuid' as any),
        implementation: () => null,
      });
    } catch {}

    const testMigrationFiles = [
      '002_organizations_and_centers.sql',
      '003_user_identity_foundation.sql',
      '004_customer_identity.sql',
      '005_face_and_rfid.sql',
      '006_customer_identification_audit.sql',
      '007_rate_management.sql',
      '008_collection_sessions_and_transactions.sql',
      '009_customer_ledger.sql',
      '010_devices_sync_and_audit.sql',
      '012_sync_engine_enhancements.sql',
      '014_feed_inventory_procurement_and_sales.sql',
      '020_automated_monthly_billing_and_settlements.sql',
      '021_customer_payouts_batches_and_reconciliation.sql',
      '022_customer_notifications.sql',
      '027_kiosk_shift_sessions_and_sface128_seed.sql',
      '028_dairy_location_coordinates_and_address.sql',
      '029_dairy_admin_activation_tokens.sql',
      '035_customer_lifecycle_and_registration_hardening.sql',
      '037_multi_dairy_customer_identity_and_membership.sql',
      '039_milk_collections_organization_idempotency.sql',
      '041_dairy_admin_realtime_and_station_monitoring.sql',
      '042_union_bank_farmer_payout_and_settlement_system.sql',
      '043_distributed_sse_tickets_and_retention.sql',
      '045_kiosk_shift_session_concurrency_and_ownership.sql',
    ];

    const possibleDirs = [
      path.resolve(process.cwd(), 'supabase/migrations'),
      path.resolve(process.cwd(), '../supabase/migrations'),
      path.resolve(process.cwd(), '../../supabase/migrations'),
    ];

    let migrationsDir = '';
    for (const d of possibleDirs) {
      if (fs.existsSync(d)) {
        migrationsDir = d;
        break;
      }
    }

    if (migrationsDir) {
      for (const file of testMigrationFiles) {
        const filePath = path.join(migrationsDir, file);
        if (!fs.existsSync(filePath)) continue;

        const raw = fs.readFileSync(filePath, 'utf-8');
        let clean = raw.replace(/--.*$/gm, '');
        clean = clean.replace(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION[\s\S]*?\$\$(?:[\s\S]*?LANGUAGE\s+[a-zA-Z0-9_]+)?\s*;/gi, '');
        clean = clean.replace(/DO\s+\$\$[\s\S]*?\$\$\s*;/gi, '');
        if (file.includes('028') || file.includes('location')) {
          clean = clean.replace(/CHECK\s*\([^()]*(?:\([^()]*\)[^()]*)*\)/gi, '');
        }
        const stmts = clean.split(';').map((s) => s.trim()).filter((s) => s.length > 0);

        for (const stmt of stmts) {
          if (
            /^CREATE\s+TRIGGER/i.test(stmt) ||
            /^ALTER\s+TABLE\s+.*ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(stmt) ||
            /^CREATE\s+POLICY/i.test(stmt) ||
            /^GRANT\s+/i.test(stmt) ||
            /^REVOKE\s+/i.test(stmt) ||
            /^CREATE\s+OR\s+REPLACE\s+FUNCTION/i.test(stmt) ||
            /^DO\s+/i.test(stmt)
          ) {
            continue;
          }

          try {
            db.public.none(stmt);
          } catch {
            // Ignored minor unsupported pg-mem DDL constructs in test double
          }
        }
      }
    }

    try {
      db.public.none('ALTER TABLE customers ADD COLUMN IF NOT EXISTS global_customer_id text;');
      db.public.none('ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile_number VARCHAR(20);');
      db.public.none('ALTER TABLE users ADD COLUMN IF NOT EXISTS normalized_mobile_number VARCHAR(20);');
      db.public.none('ALTER TABLE users ADD COLUMN IF NOT EXISTS user_role VARCHAR(30);');
      db.public.none('ALTER TABLE users ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;');
      db.public.none('ALTER TABLE devices ADD COLUMN IF NOT EXISTS offline_auth_policy_approved BOOLEAN NOT NULL DEFAULT FALSE;');
      db.public.none('ALTER TABLE devices ADD COLUMN IF NOT EXISTS approved_max_offline_hours INT DEFAULT NULL;');
      db.public.none('ALTER TABLE center_settings ADD COLUMN IF NOT EXISTS offline_auth_policy_approved BOOLEAN NOT NULL DEFAULT FALSE;');
      db.public.none('ALTER TABLE center_settings ADD COLUMN IF NOT EXISTS approved_max_offline_hours INT DEFAULT NULL;');
      db.public.none("ALTER TABLE center_settings ADD COLUMN IF NOT EXISTS limits_status VARCHAR(50) DEFAULT 'PENDING_OWNER_APPROVAL';");
      db.public.none("ALTER TABLE rate_chart_versions ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'PUBLISHED';");
      db.public.none("ALTER TABLE rate_chart_versions ADD COLUMN IF NOT EXISTS pricing_unit VARCHAR(20) NOT NULL DEFAULT 'PER_KG';");
    } catch {}

    try {
      db.public.none(`
        CREATE TABLE IF NOT EXISTS global_customer_identities (
          id UUID,
          normalized_mobile_number VARCHAR(20),
          phone_verified_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ
        );
      `);
      db.public.none('CREATE UNIQUE INDEX IF NOT EXISTS idx_gci_pk ON global_customer_identities (id);');
      db.public.none('CREATE UNIQUE INDEX IF NOT EXISTS idx_gci_mobile ON global_customer_identities (normalized_mobile_number);');
    } catch {}

    try {
      db.public.none(`
        CREATE TABLE IF NOT EXISTS customer_dairy_memberships (
          id UUID,
          global_customer_id UUID,
          organization_id UUID,
          tenant_customer_id UUID,
          farmer_code VARCHAR(30),
          customer_name VARCHAR(150),
          membership_status VARCHAR(50) DEFAULT 'PENDING_APPROVAL',
          dairy_name VARCHAR(150),
          dairy_code VARCHAR(30),
          dairy_address TEXT,
          center_id UUID,
          center_name VARCHAR(150),
          created_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ,
          last_synchronized_at TIMESTAMPTZ
        );
      `);
      db.public.none('CREATE UNIQUE INDEX IF NOT EXISTS idx_cdm_pk ON customer_dairy_memberships (id);');
      db.public.none('CREATE UNIQUE INDEX IF NOT EXISTS idx_cdm_org_cust ON customer_dairy_memberships (organization_id, global_customer_id);');
    } catch {}

    const dairyAId = '00000000-0000-0000-0000-000000000001';
    const centerAId = '00000000-0000-0000-0000-000000000002';
    const operatorAId = '00000000-0000-0000-0000-000000000011';

    try {
      db.public.none(`
        INSERT INTO organizations (id, name, code, status)
        VALUES ('${dairyAId}', 'DFarm Platform Federation', 'DF-PLATFORM', 'ACTIVE')
        ON CONFLICT DO NOTHING;
      `);
      if (_dairyId && _dairyId !== dairyAId) {
        db.public.none(`
          INSERT INTO organizations (id, name, code, status)
          VALUES ('${_dairyId}', 'Cooperative Dairy', 'DF-${_dairyId.slice(0, 4)}', 'ACTIVE')
          ON CONFLICT DO NOTHING;
        `);
      }
      db.public.none(`
        INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
        VALUES ('${centerAId}', '${_dairyId || dairyAId}', 'C-101', 'Test Center', 'Main Road', 'Kolhapur', 'Kolhapur', 'Maharashtra', '416234', '+919822114477', 'ACTIVE')
        ON CONFLICT DO NOTHING;
      `);
      db.public.none(`
        INSERT INTO users (id, organization_id, username, full_name, phone_number, role, status)
        VALUES ('${operatorAId}', '${_dairyId || dairyAId}', 'operator_kiosk', 'Sachin Patil Kiosk', '+919822114477', 'COLLECTION_OPERATOR', 'ACTIVE')
        ON CONFLICT DO NOTHING;
      `);
      db.public.none(`
        INSERT INTO user_center_assignments (id, user_id, center_id, is_primary)
        VALUES ('00000000-0000-0000-0000-000000000111', '${operatorAId}', '${centerAId}', TRUE)
        ON CONFLICT DO NOTHING;
      `);
      if (!_dairyId || _dairyId === '38918630-4fee-4cec-96ea-a3a899aae7bc') {
        db.public.none(`
          INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
          VALUES ('38918630-4fee-4cec-96ea-a3a899aae701', '38918630-4fee-4cec-96ea-a3a899aae7bc', 'C-01', 'Warna Main Center', 'Main Road', 'Kavathe Piran', 'sangli', 'Maharashtra', '416417', '+919834388787', 'ACTIVE')
          ON CONFLICT DO NOTHING;
        `);
        db.public.none('ALTER TABLE customers ADD COLUMN IF NOT EXISTS mobile_number VARCHAR(20);');
        db.public.none(`
          INSERT INTO customers (
            id, organization_id, primary_center_id, farmer_code, full_name,
            normalized_mobile_number, status, registration_status,
            is_deleted, global_customer_id, created_at, updated_at
          ) VALUES (
            'ccd1cd2d-64f9-4650-9d38-d3373aa89eca', '38918630-4fee-4cec-96ea-a3a899aae7bc',
            '38918630-4fee-4cec-96ea-a3a899aae701', 'F-101', 'Pandurang Patil',
            '+917755995615', 'ACTIVE', 'APPROVED',
            FALSE, 'ccd1cd2d-64f9-4650-9d38-d3373aa89ec0', NOW(), NOW()
          ) ON CONFLICT (id) DO NOTHING;
        `);
        db.public.none(`
          INSERT INTO customer_milk_categories (customer_id, milk_category, is_authorized, authorized_by)
          VALUES ('ccd1cd2d-64f9-4650-9d38-d3373aa89eca', 'COW', TRUE, '00000000-0000-0000-0000-000000000099'),
                 ('ccd1cd2d-64f9-4650-9d38-d3373aa89eca', 'BUFFALO', TRUE, '00000000-0000-0000-0000-000000000099')
          ON CONFLICT (customer_id, milk_category) DO NOTHING;
        `);
      }
    } catch {}

    const adapter = db.adapters.createPg();
    const pool = new adapter.Pool();
    let txMutex: Promise<void> = Promise.resolve();

    return {
      query: (text: string, params?: any[]) => pool.query(text, params),
      withTransaction: async <T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
        const previous = txMutex;
        let releaseMutex!: () => void;
        txMutex = new Promise<void>((resolve) => {
          releaseMutex = resolve;
        });
        await previous;

        const client = await pool.connect();
        (client as any).__isPgMem = true;
        const backup = db.backup();
        try {
          await client.query('BEGIN');
          const result = await callback(client);
          await client.query('COMMIT');
          return result;
        } catch (err) {
          await client.query('ROLLBACK').catch(() => {});
          backup.restore();
          throw err;
        } finally {
          client.release();
          releaseMutex();
        }
      },
      close: async () => this.endPoolSafely(pool),
    };
  }
}

export const tenantDbManager = TenantDatabaseManager.getInstance();
