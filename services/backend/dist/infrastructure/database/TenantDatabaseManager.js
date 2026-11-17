import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { newDb } from 'pg-mem';
import { config } from '../../config/env.js';
import { logger } from '../../shared/logger/index.js';
export class TenantDatabaseManager {
    static instance;
    tenantClients = new Map();
    tenantMappings = new Map();
    isPostgresConnected = null;
    controlPlaneDb = null;
    isInitialized = false;
    constructor() { }
    static getInstance() {
        if (!TenantDatabaseManager.instance) {
            TenantDatabaseManager.instance = new TenantDatabaseManager();
        }
        return TenantDatabaseManager.instance;
    }
    setControlPlaneDb(db) {
        this.controlPlaneDb = db;
    }
    async initialize(controlPlaneDb) {
        if (this.isInitialized)
            return;
        this.controlPlaneDb = controlPlaneDb;
        try {
            // 1. Ensure control plane table for dairy database mappings exists
            await controlPlaneDb.query(`
        CREATE TABLE IF NOT EXISTS dairy_database_mappings (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          dairy_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
          dairy_code VARCHAR(30) NOT NULL,
          database_name VARCHAR(100) NOT NULL,
          resource_type VARCHAR(50) NOT NULL DEFAULT 'ISOLATED_INSTANCE',
          connection_uri_encrypted TEXT,
          schema_version VARCHAR(50) NOT NULL DEFAULT 'v1.0.0',
          provisioning_status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
          provisioning_error TEXT,
          provisioned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_dairy_db_mappings_dairy_id ON dairy_database_mappings(dairy_id);
      `);
            // 2. Load existing mappings from control plane
            const existing = await controlPlaneDb.query(`SELECT * FROM dairy_database_mappings;`);
            for (const row of existing.rows) {
                const mapping = {
                    id: row.id,
                    dairyId: row.dairy_id,
                    dairyCode: row.dairy_code,
                    databaseName: row.database_name,
                    resourceType: row.resource_type,
                    connectionUriEncrypted: row.connection_uri_encrypted,
                    schemaVersion: row.schema_version,
                    provisioningStatus: row.provisioning_status,
                    provisioningError: row.provisioning_error,
                    provisionedAt: row.provisioned_at?.toISOString?.() || row.provisioned_at,
                    lastVerifiedAt: row.last_verified_at?.toISOString?.() || row.last_verified_at,
                };
                this.tenantMappings.set(mapping.dairyId, mapping);
            }
            // 3. Provision baseline seed tenants if not already mapped
            const seedDairies = [
                { id: '00000000-0000-0000-0000-000000000001', code: 'GOKUL-01', name: 'Gokul Primary Cooperative' },
                { id: '00000000-0000-0000-0000-000000000004', code: 'WARNA-01', name: 'Warna Sahakari Dudh' },
                { id: '00000000-0000-0000-0000-000000000007', code: 'DF-KOP-0118', name: 'Sahyadri Organic Milk Federation' },
                { id: 'e363070f-0004-492f-b759-e51038c0e35a', code: 'DF-SAN-8897', name: 'kalpna mlik\'s' },
            ];
            for (const d of seedDairies) {
                if (!this.tenantMappings.has(d.id)) {
                    await this.provisionTenantDatabase(d.id, d.code, d.name);
                }
            }
            this.isInitialized = true;
            logger.info('TenantDatabaseManager initialized with multi-dairy database isolation.');
        }
        catch (err) {
            logger.error({ error: err.message }, 'Error initializing TenantDatabaseManager');
        }
    }
    async provisionTenantDatabase(dairyId, dairyCode, dairyName) {
        const cleanCode = dairyCode.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const dbName = `dfarm_tenant_${cleanCode}_${dairyId.slice(0, 8)}`;
        const now = new Date().toISOString();
        logger.info({ dairyId, dairyCode, dairyName, dbName }, 'Initiating isolated tenant database provisioning...');
        let client;
        let resourceType = 'ISOLATED_INSTANCE';
        // 1. Try real PostgreSQL if available
        const isPgAvailable = await this.checkPostgresAvailable();
        if (isPgAvailable) {
            try {
                // Attempt physical database creation or dedicated schema isolation
                const res = await this.createPostgresTenantResource(dbName, dairyId);
                client = res.client;
                resourceType = res.resourceType;
            }
            catch (err) {
                logger.warn({ error: err.message }, 'Physical Postgres creation restricted; provisioning isolated virtual instance.');
                client = this.createIsolatedMemoryDatabase(dairyId);
                resourceType = 'ISOLATED_INSTANCE';
            }
        }
        else {
            client = this.createIsolatedMemoryDatabase(dairyId);
            resourceType = 'ISOLATED_INSTANCE';
        }
        // 2. Apply operational schema migrations to this isolated database
        await this.applyTenantMigrations(client, dairyId);
        // 3. Cache connection client
        this.tenantClients.set(dairyId, client);
        // 4. Save mapping in central control plane database
        const mappingId = crypto.randomUUID();
        const mapping = {
            id: mappingId,
            dairyId,
            dairyCode,
            databaseName: dbName,
            resourceType,
            schemaVersion: 'v1.0.0',
            provisioningStatus: 'ACTIVE',
            provisionedAt: now,
            lastVerifiedAt: now,
        };
        if (this.controlPlaneDb) {
            try {
                await this.controlPlaneDb.query(`
          INSERT INTO dairy_database_mappings (
            id, dairy_id, dairy_code, database_name, resource_type,
            schema_version, provisioning_status, provisioned_at, last_verified_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
          ON CONFLICT (dairy_id) DO UPDATE SET
            database_name = EXCLUDED.database_name,
            resource_type = EXCLUDED.resource_type,
            provisioning_status = 'ACTIVE',
            last_verified_at = NOW();
        `, [mappingId, dairyId, dairyCode, dbName, resourceType, 'v1.0.0', 'ACTIVE']);
            }
            catch (e) {
                logger.warn({ error: e.message }, 'Could not persist tenant mapping to control plane DB, retaining in-memory cache.');
            }
        }
        this.tenantMappings.set(dairyId, mapping);
        logger.info({ dairyId, dairyCode, resourceType, dbName }, 'Tenant database provisioning completed successfully.');
        return mapping;
    }
    async getTenantDb(dairyId) {
        if (!dairyId) {
            // Default to control plane DB
            return this.controlPlaneDb;
        }
        if (this.tenantClients.has(dairyId)) {
            return this.tenantClients.get(dairyId);
        }
        // Check if mapping exists
        const mapping = this.tenantMappings.get(dairyId);
        if (mapping) {
            // Re-provision client
            const client = this.createIsolatedMemoryDatabase(dairyId);
            await this.applyTenantMigrations(client, dairyId);
            this.tenantClients.set(dairyId, client);
            return client;
        }
        // Check control plane DB for organization
        if (this.controlPlaneDb) {
            try {
                const orgRes = await this.controlPlaneDb.query(`SELECT id, code, name FROM organizations WHERE id = $1 LIMIT 1;`, [dairyId]);
                if (orgRes.rows.length > 0) {
                    const row = orgRes.rows[0];
                    await this.provisionTenantDatabase(row.id, row.code || 'DAIRY', row.name || 'Dairy');
                    return this.tenantClients.get(dairyId);
                }
            }
            catch {
                // Fallback
            }
        }
        // Auto-provision dynamic isolated tenant database
        await this.provisionTenantDatabase(dairyId, `DAIRY-${dairyId.slice(0, 4).toUpperCase()}`, 'Dynamic Tenant');
        return this.tenantClients.get(dairyId);
    }
    getMapping(dairyId) {
        return this.tenantMappings.get(dairyId);
    }
    getAllMappings() {
        return Array.from(this.tenantMappings.values());
    }
    getAllTenantDbs() {
        return Array.from(this.tenantClients.values());
    }
    async verifyTenantDatabase(dairyId) {
        try {
            const client = await this.getTenantDb(dairyId);
            const res = await client.query(`SELECT COUNT(*) as count FROM customers;`);
            return res.rows.length >= 0;
        }
        catch {
            return false;
        }
    }
    async checkPostgresAvailable() {
        if (this.isPostgresConnected !== null)
            return this.isPostgresConnected;
        const testPool = new pg.Pool({
            connectionString: config.DATABASE_URL,
            connectionTimeoutMillis: 1000,
        });
        try {
            const res = await testPool.query('SELECT 1');
            await testPool.end();
            this.isPostgresConnected = res.rows.length > 0;
            return this.isPostgresConnected;
        }
        catch {
            await testPool.end().catch(() => { });
            this.isPostgresConnected = false;
            return false;
        }
    }
    async createPostgresTenantResource(dbName, dairyId) {
        const rootPool = new pg.Pool({ connectionString: config.DATABASE_URL });
        try {
            // Try CREATE DATABASE
            await rootPool.query(`CREATE DATABASE "${dbName}";`);
            await rootPool.end();
            // Connect to the new physical database
            const tenantUri = config.DATABASE_URL.replace(/\/[^/?]+(\?.*)?$/, `/${dbName}$1`);
            const tenantPool = new pg.Pool({ connectionString: tenantUri });
            return {
                client: {
                    query: (text, params) => tenantPool.query(text, params),
                    withTransaction: async (cb) => {
                        const cl = await tenantPool.connect();
                        try {
                            await cl.query('BEGIN');
                            const res = await cb(cl);
                            await cl.query('COMMIT');
                            return res;
                        }
                        catch (e) {
                            await cl.query('ROLLBACK');
                            throw e;
                        }
                        finally {
                            cl.release();
                        }
                    },
                    close: () => tenantPool.end(),
                },
                resourceType: 'PHYSICAL_DATABASE',
            };
        }
        catch {
            // CREATE DATABASE failed or unprivileged; use dedicated schema isolation
            const schemaName = `tenant_${dairyId.replace(/[^a-zA-Z0-9]/g, '_')}`;
            await rootPool.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}";`);
            return {
                client: {
                    query: async (text, params) => {
                        const cl = await rootPool.connect();
                        try {
                            await cl.query(`SET search_path TO "${schemaName}", public;`);
                            return await cl.query(text, params);
                        }
                        finally {
                            cl.release();
                        }
                    },
                    withTransaction: async (cb) => {
                        const cl = await rootPool.connect();
                        try {
                            await cl.query(`SET search_path TO "${schemaName}", public;`);
                            await cl.query('BEGIN');
                            const res = await cb(cl);
                            await cl.query('COMMIT');
                            return res;
                        }
                        catch (e) {
                            await cl.query('ROLLBACK');
                            throw e;
                        }
                        finally {
                            cl.release();
                        }
                    },
                },
                resourceType: 'DEDICATED_SCHEMA',
            };
        }
    }
    createIsolatedMemoryDatabase(_dairyId) {
        const db = newDb();
        // Register essential pg-mem extensions & custom functions
        db.public.registerFunction({
            name: 'gen_random_uuid',
            impure: true,
            implementation: () => crypto.randomUUID(),
        });
        db.public.registerFunction({
            name: 'decode',
            args: [db.public.getType('text'), db.public.getType('text')],
            returns: db.public.getType('bytea'),
            implementation: (str, format) => Buffer.from(str, format === 'base64' ? 'base64' : 'hex'),
        });
        db.public.registerFunction({
            name: 'encode',
            args: [db.public.getType('bytea'), db.public.getType('text')],
            returns: db.public.getType('text'),
            implementation: (data, format) => {
                if (!data)
                    return '';
                const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
                return buf.toString(format === 'base64' ? 'base64' : 'hex');
            },
        });
        db.registerExtension('pgcrypto', (schema) => {
            schema.registerFunction({
                name: 'gen_random_uuid',
                impure: true,
                returns: db.public.getType('uuid'),
                implementation: () => crypto.randomUUID(),
            });
        });
        db.public.none('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');
        const adapter = db.adapters.createPg();
        const pool = new adapter.Pool();
        return {
            query: (text, params) => pool.query(text, params),
            withTransaction: async (callback) => {
                const client = await pool.connect();
                try {
                    await client.query('BEGIN');
                    const result = await callback(client);
                    await client.query('COMMIT');
                    return result;
                }
                catch (err) {
                    await client.query('ROLLBACK');
                    throw err;
                }
                finally {
                    client.release();
                }
            },
            close: async () => pool.end(),
        };
    }
    async applyTenantMigrations(client, dairyId) {
        const operationalMigrationFiles = [
            '002_organizations_and_centers.sql',
            '003_user_identity_foundation.sql',
            '004_customer_identity.sql',
            '005_face_and_rfid.sql',
            '006_customer_identification_audit.sql',
            '007_rate_management.sql',
            '008_collection_sessions_and_transactions.sql',
            '009_customer_ledger.sql',
            '010_devices_sync_and_audit.sql',
            '027_kiosk_shift_sessions_and_sface128_seed.sql',
            '028_dairy_location_coordinates_and_address.sql',
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
            for (const file of operationalMigrationFiles) {
                const filePath = path.join(migrationsDir, file);
                if (!fs.existsSync(filePath))
                    continue;
                const raw = fs.readFileSync(filePath, 'utf-8');
                let clean = raw.replace(/--.*$/gm, '');
                if (file.includes('028') || file.includes('location')) {
                    clean = clean.replace(/CHECK\s*\([^()]*(?:\([^()]*\)[^()]*)*\)/gi, '');
                }
                const stmts = clean.split(';').map((s) => s.trim()).filter((s) => s.length > 0);
                for (const stmt of stmts) {
                    if (/^CREATE\s+TRIGGER/i.test(stmt) ||
                        /^ALTER\s+TABLE\s+.*ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(stmt) ||
                        /^CREATE\s+POLICY/i.test(stmt) ||
                        /^GRANT\s+/i.test(stmt) ||
                        /^REVOKE\s+/i.test(stmt) ||
                        /^CREATE\s+OR\s+REPLACE\s+FUNCTION/i.test(stmt)) {
                        continue;
                    }
                    try {
                        await client.query(stmt);
                    }
                    catch {
                        // Ignored minor unsupported pg-mem DDL constructs
                    }
                }
            }
        }
        // Seed Face Model Version (OpenCV-SFace-INT8 128D) into this tenant's isolated database
        const modelVersionId = 'f0000000-0000-0000-0000-000000000001';
        await client.query(`
      INSERT INTO face_model_versions (
        id, model_name, model_version, embedding_dimension, similarity_metric,
        recommended_threshold, is_active
      ) VALUES (
        '${modelVersionId}', 'OpenCV-SFace-INT8', 'sface_int8_2021dec', 128, 'COSINE',
        0.363, TRUE
      ) ON CONFLICT DO NOTHING;
    `).catch(() => { });
        // Ensure this tenant's organization and primary center exist in its isolated database
        if (this.controlPlaneDb) {
            try {
                const orgRes = await this.controlPlaneDb.query(`SELECT * FROM organizations WHERE id = $1 LIMIT 1;`, [dairyId]);
                if (orgRes.rows.length > 0) {
                    const o = orgRes.rows[0];
                    await client.query(`INSERT INTO organizations (
              id, name, code, status, latitude, longitude, formatted_address,
              village_locality, city, district, state, postal_code, business_phone
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT (id) DO NOTHING;`, [
                        o.id,
                        o.name,
                        o.code,
                        o.status || 'ACTIVE',
                        o.latitude !== undefined ? o.latitude : null,
                        o.longitude !== undefined ? o.longitude : null,
                        o.formatted_address || null,
                        o.village_locality || null,
                        o.city || null,
                        o.district || 'District',
                        o.state || 'State',
                        o.postal_code || '000000',
                        o.business_phone || null,
                    ]);
                    // Copy centers
                    const centerRes = await this.controlPlaneDb.query(`SELECT * FROM dairy_centers WHERE organization_id = $1;`, [dairyId]);
                    for (const c of centerRes.rows) {
                        await client.query(`INSERT INTO dairy_centers (
                id, organization_id, code, name, address_line1, village_town,
                district, state, postal_code, contact_phone, latitude, longitude,
                formatted_address, status
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
              ON CONFLICT (id) DO NOTHING;`, [
                            c.id,
                            c.organization_id,
                            c.code,
                            c.name,
                            c.address_line1 || 'Center Road',
                            c.village_town || 'Local',
                            c.district || 'District',
                            c.state || 'State',
                            c.postal_code || '000000',
                            c.contact_phone || null,
                            c.latitude !== undefined ? c.latitude : null,
                            c.longitude !== undefined ? c.longitude : null,
                            c.formatted_address || null,
                            c.status || 'ACTIVE',
                        ]);
                    }
                    // Copy users for this dairy
                    const userRes = await this.controlPlaneDb.query(`SELECT * FROM users WHERE organization_id = $1 OR role = 'SUPER_ADMIN';`, [dairyId]);
                    for (const u of userRes.rows) {
                        await client.query(`INSERT INTO users (
                id, organization_id, username, full_name, email, phone_number, role, status
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
              ON CONFLICT (id) DO NOTHING;`, [
                            u.id,
                            dairyId,
                            u.username,
                            u.full_name,
                            u.email || null,
                            u.phone_number,
                            u.role,
                            u.status || 'ACTIVE',
                        ]);
                    }
                }
            }
            catch (err) {
                logger.warn({ error: err.message }, 'Could not replicate organization/center metadata to tenant database');
            }
        }
    }
}
export const tenantDbManager = TenantDatabaseManager.getInstance();
//# sourceMappingURL=TenantDatabaseManager.js.map