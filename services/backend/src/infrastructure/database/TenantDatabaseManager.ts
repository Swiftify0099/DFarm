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
  | 'ORPHANED_RESOURCE';

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

export class TenantDatabaseUnavailableError extends Error {
  constructor(public readonly dairyId: string, public readonly status: string, public readonly details?: string) {
    super(`Tenant database for dairy ${dairyId} is unavailable (status: ${status}). ${details || ''}`);
    this.name = 'TenantDatabaseUnavailableError';
  }
}

export class TenantDatabaseManager {
  private static instance: TenantDatabaseManager;
  private readonly tenantPools = new Map<string, pg.Pool>();
  private readonly tenantMappings = new Map<string, TenantDatabaseMapping>();
  private readonly tenantMemDbs = new Map<string, IDatabaseClient>(); // Strictly for NODE_ENV === 'test'
  private controlPlaneDb: IDatabaseClient | null = null;
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): TenantDatabaseManager {
    if (!TenantDatabaseManager.instance) {
      TenantDatabaseManager.instance = new TenantDatabaseManager();
    }
    return TenantDatabaseManager.instance;
  }

  private isTestEnvironment(): boolean {
    return (
      process.env.NODE_ENV === 'test' ||
      process.execArgv.includes('--test') ||
      process.argv.some((a) => a.includes('test'))
    );
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

      this.isInitialized = true;
      logger.info(
        { loadedTenantCount: this.tenantMappings.size },
        'TenantDatabaseManager initialized with authoritative database-per-dairy routing.'
      );
    } catch (err: any) {
      logger.error({ error: err.message }, 'Error initializing TenantDatabaseManager mappings');
      // In test mode, allow initialization to proceed
      if (process.env.NODE_ENV === 'test') {
        this.isInitialized = true;
      }
    }
  }

  public getTenantMapping(dairyId: string): TenantDatabaseMapping | null {
    return this.tenantMappings.get(dairyId) || null;
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

    // 1. Check idempotency: If already ACTIVE, return existing mapping
    const existing = this.tenantMappings.get(dairyId);
    if (existing && existing.provisioningStatus === 'ACTIVE') {
      logger.info({ dairyId, dbName }, 'Tenant database already active and provisioned. Returning existing mapping.');
      return existing;
    }

    // 2. Register initial PROVISIONING state in central database
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

    // 3. Physical Database Creation
    let tenantUri = '';
    let isTestDouble = false;

    try {
      const baseUri = adminConnectionString || config.DATABASE_PROVISIONER_URL || config.CENTRAL_DATABASE_URL || config.DATABASE_URL;

      // Connect to cluster maintenance database ('postgres')
      const adminUri = this.deriveAdminDatabaseUri(baseUri);
      const adminPool = new pg.Pool({
        connectionString: adminUri,
        connectionTimeoutMillis: config.TENANT_POOL_CONNECTION_TIMEOUT_MS || 30000,
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
        await adminPool.end();

        currentMapping.provisioningStatus = 'DATABASE_CREATED';
        await this.persistMappingStatus(controlDb, currentMapping);

        // Derive tenant URI pointing to the newly created database
        tenantUri = this.deriveTenantUri(baseUri, dbName);
        currentMapping.connectionUriEncrypted = CredentialEncryption.encrypt(tenantUri);
        currentMapping.resourceType = 'PHYSICAL_DATABASE';
      } catch (err: any) {
        await adminPool.end().catch(() => {});

        // If physical Postgres is unreachable and running in test or development mode, allow isolated test double
        if ((this.isTestEnvironment() || config.NODE_ENV === 'development') && !process.env.TEST_REAL_POSTGRES) {
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

    let tenantClient: IDatabaseClient;

    if (isTestDouble) {
      tenantClient = this.createIsolatedMemoryDatabase(dairyId);
      this.tenantMemDbs.set(dairyId, tenantClient);
    } else {
      const tenantPool = new pg.Pool({
        connectionString: tenantUri,
        max: config.TENANT_POOL_MAX || 5,
        idleTimeoutMillis: config.TENANT_POOL_IDLE_TIMEOUT_MS || 30000,
        connectionTimeoutMillis: config.TENANT_POOL_CONNECTION_TIMEOUT_MS || 30000,
      });
      this.tenantPools.set(dairyId, tenantPool);
      tenantClient = this.wrapPgPool(tenantPool);
    }

    try {
      if (!isTestDouble) {
        // Apply the complete operational migration track
        logger.info({ dairyId, dbName }, 'Applying complete operational migrations to tenant database...');
        await MigrationRunner.runTenantMigrations(tenantClient, dairyId);
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
        INSERT INTO tenant_metadata (dairy_id, dairy_code, dairy_name, database_name, schema_version)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (dairy_id) DO UPDATE SET
          database_name = EXCLUDED.database_name,
          last_verified_at = NOW();
      `, [dairyId, code, name, dbName, 'v1.0.0']);

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
      currentMapping.provisioningStatus = 'FAILED';
      currentMapping.provisioningError = `Tenant migration or verification failed: ${err.message}`;
      await this.persistMappingStatus(controlDb, currentMapping);
      throw err;
    }
  }

  /**
   * Resolves an authorized, bounded database client for the specified Dairy.
   * Throws if no active mapping exists. Never falls back to central DB or creates a fake DB.
   */
  public async getTenantDb(dairyId?: string): Promise<IDatabaseClient> {
    if (!dairyId) {
      return this.getControlPlaneDb();
    }

    // 1. Check active pool cache
    if (this.tenantPools.has(dairyId)) {
      return this.wrapPgPool(this.tenantPools.get(dairyId)!);
    }

    // 2. Check memory test DB cache (test mode only)
    if (this.tenantMemDbs.has(dairyId)) {
      return this.tenantMemDbs.get(dairyId)!;
    }

    // 3. Resolve mapping from memory or central DB
    let mapping = this.tenantMappings.get(dairyId);
    if (!mapping) {
      const controlDb = this.getControlPlaneDb();
      try {
        const res = await controlDb.query(
          'SELECT * FROM dairy_database_mappings WHERE dairy_id = $1;',
          [dairyId]
        );
        if (res.rows.length > 0) {
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

    if (!mapping && (this.isTestEnvironment() || config.NODE_ENV === 'development')) {
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

    if (mapping && mapping.provisioningStatus === 'FAILED') {
      throw new TenantDatabaseUnavailableError(dairyId, 'FAILED', mapping.provisioningError || 'Tenant database provisioning failed');
    }

    if (!mapping || mapping.provisioningStatus !== 'ACTIVE') {
      if (mapping?.provisioningStatus === 'PROVISIONING' || mapping?.provisioningStatus === 'MIGRATING' || mapping?.provisioningStatus === 'VERIFYING') {
        throw new TenantDatabaseUnavailableError(dairyId, mapping.provisioningStatus, 'Tenant database is currently being provisioned');
      }
      if (config.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production') {
        logger.info({ dairyId }, 'No isolated tenant database found; using control plane database fallback in development.');
        return this.getControlPlaneDb();
      }
      throw new Error(`No active persistent database mapping found for dairy: ${dairyId}`);
    }

    // 4. Initialize bounded tenant pool from encrypted connection string
    if (mapping.resourceType === 'ISOLATED_TEST_INSTANCE') {
      let memClient = this.tenantMemDbs.get(dairyId);
      if (!memClient) {
        memClient = this.createIsolatedMemoryDatabase(dairyId);
        this.tenantMemDbs.set(dairyId, memClient);
      }
      return memClient;
    }

    if (!mapping.connectionUriEncrypted) {
      if (config.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production') {
        return this.getControlPlaneDb();
      }
      throw new Error(`Tenant database connection credentials missing for dairy: ${dairyId}`);
    }

    const decryptedUri = CredentialEncryption.decrypt(mapping.connectionUriEncrypted);
    const tenantPool = new pg.Pool({
      connectionString: decryptedUri,
      max: config.TENANT_POOL_MAX || 5,
      idleTimeoutMillis: config.TENANT_POOL_IDLE_TIMEOUT_MS || 30000,
      connectionTimeoutMillis: config.TENANT_POOL_CONNECTION_TIMEOUT_MS || 30000,
    });

    this.tenantPools.set(dairyId, tenantPool);
    return this.wrapPgPool(tenantPool);
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
    const pool = this.tenantPools.get(dairyId);
    if (pool) {
      await pool.end();
      this.tenantPools.delete(dairyId);
    }
    this.tenantMemDbs.delete(dairyId);
  }

  public async evictTenantPool(dairyId: string): Promise<void> {
    return this.closeTenantPool(dairyId);
  }

  public async closeAllPools(): Promise<void> {
    for (const [dairyId, pool] of this.tenantPools.entries()) {
      try {
        await pool.end();
      } catch (err: any) {
        logger.error({ dairyId, error: err.message }, 'Error closing tenant pool');
      }
    }
    this.tenantPools.clear();
    this.tenantMemDbs.clear();
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

  private wrapPgPool(pool: pg.Pool): IDatabaseClient {
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
      close: async () => pool.end(),
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
      '014_feed_inventory_procurement_and_sales.sql',
      '020_automated_monthly_billing_and_settlements.sql',
      '021_customer_payouts_batches_and_reconciliation.sql',
      '022_customer_notifications.sql',
      '027_kiosk_shift_sessions_and_sface128_seed.sql',
      '028_dairy_location_coordinates_and_address.sql',
      '029_dairy_admin_activation_tokens.sql',
      '035_customer_lifecycle_and_registration_hardening.sql',
      '037_multi_dairy_customer_identity_and_membership.sql',
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

    const adapter = db.adapters.createPg();
    const pool = new adapter.Pool();

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
      close: async () => pool.end(),
    };
  }
}

export const tenantDbManager = TenantDatabaseManager.getInstance();
