import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { newDb } from 'pg-mem';
import { config } from '../../config/env.js';
import { logger } from '../../shared/logger/index.js';

const { Pool } = pg;

// Ensure PostgreSQL DATE (type OID 1082) is parsed as string 'YYYY-MM-DD' without local timezone skew
pg.types.setTypeParser(1082, (val: string) => val);

export class PostgresDatabase {
  private static instance: PostgresDatabase;
  public readonly pool: pg.Pool;
  private memDbAdapter: any = null;
  private isPostgresConnected: boolean | null = null;

  private constructor() {
    const connectionString = config.CENTRAL_DATABASE_URL || config.DATABASE_URL;
    const conn = connectionString || '';

    const isRemote =
      conn.length > 0 &&
      !conn.includes('127.0.0.1') &&
      !conn.includes('localhost');

    const shouldEnableSsl =
      config.DATABASE_TLS_MODE === 'disable'
        ? false
        : config.DATABASE_TLS_MODE === 'require' ||
          isRemote ||
          conn.includes('sslmode=require') ||
          conn.includes('supabase.co') ||
          conn.includes('pooler.supabase.com') ||
          conn.includes('neon.tech') ||
          config.NODE_ENV === 'production';

    this.pool = new Pool({
      connectionString,
      max: 15,
      idleTimeoutMillis: config.TENANT_POOL_IDLE_TIMEOUT_MS || 30000,
      connectionTimeoutMillis: config.TENANT_POOL_CONNECTION_TIMEOUT_MS || 30000,
      ssl: shouldEnableSsl ? { rejectUnauthorized: false } : undefined,
    });

    this.pool.on('error', (err) => {
      logger.error({ error: err.message }, 'Unexpected error on idle PostgreSQL central pool client');
    });
  }

  public static getInstance(): PostgresDatabase {
    if (!PostgresDatabase.instance) {
      PostgresDatabase.instance = new PostgresDatabase();
    }
    return PostgresDatabase.instance;
  }

  private async withTimeout<R>(promise: Promise<R>, ms: number = 15000, label: string = 'Operation'): Promise<R> {
    let timer: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timer!);
    }
  }

  public async checkConnection(): Promise<boolean> {
    try {
      const client = await this.withTimeout(this.pool.connect(), 15000, 'PostgreSQL checkConnection');
      try {
        const res = await client.query('SELECT 1 as alive;');
        this.isPostgresConnected = res.rows.length > 0;
        return this.isPostgresConnected;
      } finally {
        client.release();
      }
    } catch (err: any) {
      this.isPostgresConnected = false;
      return false;
    }
  }

  public getHealth(): {
    status: 'CONNECTED' | 'DISCONNECTED';
    databaseMode: 'PHYSICAL_POSTGRES' | 'TEST_ISOLATED_MEM_DB';
    poolSize: number;
    idleCount: number;
    waitingCount: number;
  } {
    const isConnected = this.isPostgresConnected === true;
    return {
      status: isConnected ? 'CONNECTED' : 'DISCONNECTED',
      databaseMode: isConnected
        ? 'PHYSICAL_POSTGRES'
        : (this.isTestEnvironment() ? 'TEST_ISOLATED_MEM_DB' : 'PHYSICAL_POSTGRES'),
      poolSize: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }

  private isTestEnvironment(): boolean {
    return (
      process.env.NODE_ENV === 'test' ||
      process.execArgv.includes('--test') ||
      process.argv.some((a) => a.includes('test'))
    );
  }

  /**
   * Explicit In-Memory Test Double: Allowed in unit tests and development fallback
   * when physical PostgreSQL cluster is unreachable.
   * STRICTLY prohibited in production server runtime.
   */
  private getOrCreateTestMemDb(): any {
    if (!this.isTestEnvironment() && config.NODE_ENV !== 'development') {
      throw new Error(
        'CRITICAL: In-memory pg-mem database is strictly prohibited in production runtime environments. Real PostgreSQL cluster connection required.'
      );
    }

    if (this.memDbAdapter) return this.memDbAdapter;

    logger.warn('Initializing isolated in-memory test double for unit test execution...');
    const db = newDb();
    const floatType = db.public.getType('float' as any);
    const intType = db.public.getType('integer' as any);

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

    db.public.registerFunction({
      name: 'length',
      args: [db.public.getType('text' as any)],
      returns: intType,
      implementation: (str: string) => (str ? String(str).length : 0),
    });

    db.public.registerFunction({
      name: 'radians',
      args: [floatType],
      returns: floatType,
      implementation: (v: number) => (Number(v) * Math.PI) / 180,
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

    db.public.registerFunction({
      name: 'length',
      args: [db.public.getType('text' as any)],
      returns: intType,
      implementation: (str: string) => (str ? String(str).length : 0),
    });

    db.public.registerFunction({
      name: 'radians',
      args: [intType],
      returns: floatType,
      implementation: (v: number) => (Number(v) * Math.PI) / 180,
    });
    db.public.registerFunction({
      name: 'sin',
      args: [floatType],
      returns: floatType,
      implementation: (v: number) => Math.sin(Number(v)),
    });
    db.public.registerFunction({
      name: 'sin',
      args: [intType],
      returns: floatType,
      implementation: (v: number) => Math.sin(Number(v)),
    });
    db.public.registerFunction({
      name: 'cos',
      args: [floatType],
      returns: floatType,
      implementation: (v: number) => Math.cos(Number(v)),
    });
    db.public.registerFunction({
      name: 'cos',
      args: [intType],
      returns: floatType,
      implementation: (v: number) => Math.cos(Number(v)),
    });
    db.public.registerFunction({
      name: 'asin',
      args: [floatType],
      returns: floatType,
      implementation: (v: number) => Math.asin(Number(v)),
    });
    db.public.registerFunction({
      name: 'acos',
      args: [floatType],
      returns: floatType,
      implementation: (v: number) => Math.acos(Math.max(-1, Math.min(1, Number(v)))),
    });
    db.public.registerFunction({
      name: 'sqrt',
      args: [floatType],
      returns: floatType,
      implementation: (v: number) => Math.sqrt(Number(v)),
    });
    db.public.registerFunction({
      name: 'power',
      args: [floatType, floatType],
      returns: floatType,
      implementation: (v: number, exp: number) => Math.pow(Number(v), Number(exp)),
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

    // Run core schema files for isolated unit tests
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
      '027_kiosk_shift_sessions_and_sface128_seed.sql',
      '028_dairy_location_coordinates_and_address.sql',
      '029_dairy_admin_activation_tokens.sql',
      '031_dairy_database_mappings.sql',
      '032_central_super_admin_features.sql',
      '033_central_platform_policies_and_support.sql',
      '037_multi_dairy_customer_identity_and_membership.sql',
      '038_platform_federation_database_mapping.sql',
      '039_milk_collections_organization_idempotency.sql',
      '040_device_auth_challenges.sql',
      '041_dairy_admin_realtime_and_station_monitoring.sql',
      '042_union_bank_farmer_payout_and_settlement_system.sql',
      '043_distributed_sse_tickets_and_retention.sql',
      '044_revoked_tokens_durable_revocation.sql',
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
            // Ignored minor unsupported pg-mem DDL constructs in unit tests
          }
        }
      }
    }

    // Test seed fixtures strictly for isolated automated test runner
    const dairyAId = '00000000-0000-0000-0000-000000000001';
    const centerAId = '00000000-0000-0000-0000-000000000002';
    const operatorAId = '00000000-0000-0000-0000-000000000011';

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
    } catch (err: any) {
      logger.warn({ err: err.message }, 'Failed to create global_customer_identities in test double');
    }

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
    } catch (err: any) {
      logger.warn({ err: err.message }, 'Failed to create customer_dairy_memberships in test double');
    }

    try {
      db.public.none(`
        INSERT INTO organizations (id, name, code, status)
        VALUES ('${dairyAId}', 'DFarm Platform Federation', 'DF-PLATFORM', 'ACTIVE')
        ON CONFLICT DO NOTHING;
      `);
      db.public.none(`
        INSERT INTO organizations (id, name, code, status, business_phone, business_email, address_line1, district, state, postal_code)
        VALUES ('38918630-4fee-4cec-96ea-a3a899aae7bc', 'Warna Milk''s', 'DF-SAN-2395', 'ACTIVE', '9834388787', 'pankajye5656@gmail.com', 'Kavathe Piran', 'sangli', 'Maharashtra', '416417')
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code;
      `);
      db.public.none(`
        INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
        VALUES ('38918630-4fee-4cec-96ea-a3a899aae701', '38918630-4fee-4cec-96ea-a3a899aae7bc', 'C-01', 'Warna Main Center', 'Main Road', 'Kavathe Piran', 'sangli', 'Maharashtra', '416417', '+919834388787', 'ACTIVE')
        ON CONFLICT DO NOTHING;
      `);
      db.public.none(`
        INSERT INTO users (id, organization_id, username, full_name, email, phone_number, mobile_number, normalized_mobile_number, role, user_role, status, activated_at)
        VALUES ('37b8de06-0023-4935-b1bb-3d7152065e6e', '38918630-4fee-4cec-96ea-a3a899aae7bc', 'admin_9834388787', 'popat yewale', 'pankajye5656@gmail.com', '+919834388787', '+919834388787', '+919834388787', 'DAIRY_ADMIN', 'PRIMARY_DAIRY_ADMIN', 'ACTIVE', NOW())
        ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id, status = 'ACTIVE';
      `);
      db.public.none(`
        INSERT INTO user_center_assignments (id, user_id, center_id, is_primary)
        VALUES ('38918630-4fee-4cec-96ea-a3a899aae702', '37b8de06-0023-4935-b1bb-3d7152065e6e', '38918630-4fee-4cec-96ea-a3a899aae701', TRUE)
        ON CONFLICT DO NOTHING;
      `);
      db.public.none('ALTER TABLE customers ADD COLUMN IF NOT EXISTS mobile_number VARCHAR(20);');
      db.public.none(`
        INSERT INTO global_customer_identities (id, normalized_mobile_number, phone_verified_at, created_at, updated_at)
        VALUES ('ccd1cd2d-64f9-4650-9d38-d3373aa89ec0', '+917755995615', NOW(), NOW(), NOW())
        ON CONFLICT (id) DO NOTHING;
      `);
      db.public.none(`
        INSERT INTO customer_dairy_memberships (
          id, global_customer_id, organization_id, tenant_customer_id, farmer_code,
          membership_status, dairy_name, dairy_code, dairy_address, center_id, center_name,
          created_at, updated_at
        ) VALUES (
          'ccd1cd2d-64f9-4650-9d38-d3373aa89ec1', 'ccd1cd2d-64f9-4650-9d38-d3373aa89ec0',
          '38918630-4fee-4cec-96ea-a3a899aae7bc', 'ccd1cd2d-64f9-4650-9d38-d3373aa89eca',
          'F-101', 'APPROVED', 'Warna Milk''s', 'DF-SAN-2395', 'Kavathe Piran',
          '38918630-4fee-4cec-96ea-a3a899aae701', 'Warna Main Center', NOW(), NOW()
        ) ON CONFLICT (id) DO NOTHING;
      `);
      db.public.none(`
        CREATE TABLE IF NOT EXISTS customer_tenant_lookup (
          customer_id UUID PRIMARY KEY,
          organization_id UUID NOT NULL,
          normalized_mobile_number VARCHAR(30),
          registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      db.public.none(`
        INSERT INTO customer_tenant_lookup (customer_id, organization_id, normalized_mobile_number)
        VALUES (
          'ccd1cd2d-64f9-4650-9d38-d3373aa89eca', '38918630-4fee-4cec-96ea-a3a899aae7bc', '+917755995615'
        ) ON CONFLICT (customer_id) DO NOTHING;
      `);
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
    } catch {}

    try {
      db.public.none(`
        INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
        VALUES ('${centerAId}', '${dairyAId}', 'C-101', 'Test Center', 'Main Road', 'Kolhapur', 'Kolhapur', 'Maharashtra', '416234', '+919822114477', 'ACTIVE')
        ON CONFLICT DO NOTHING;
      `);
    } catch {}

    try {
      db.public.none(`
        INSERT INTO users (id, organization_id, username, full_name, phone_number, role, status)
        VALUES ('${operatorAId}', '${dairyAId}', 'operator_kiosk', 'Sachin Patil Kiosk', '+919822114477', 'COLLECTION_OPERATOR', 'ACTIVE')
        ON CONFLICT DO NOTHING;
      `);
      db.public.none(`
        INSERT INTO user_center_assignments (id, user_id, center_id, is_primary)
        VALUES ('00000000-0000-0000-0000-000000000012', '${operatorAId}', '${centerAId}', TRUE)
        ON CONFLICT DO NOTHING;
      `);
    } catch {}

    try {
      db.public.none(`
        INSERT INTO users (id, organization_id, username, full_name, phone_number, role, status)
        VALUES ('00000000-0000-0000-0000-000000000099', '${dairyAId}', 'pankaj.yewale', 'Pankaj Popat Yewale', '+917755995615', 'SUPER_ADMIN', 'ACTIVE')
        ON CONFLICT DO NOTHING;
      `);
      db.public.none(`
        INSERT INTO user_center_assignments (id, user_id, center_id, is_primary)
        VALUES ('00000000-0000-0000-0000-000000000098', '00000000-0000-0000-0000-000000000099', '${centerAId}', TRUE)
        ON CONFLICT DO NOTHING;
      `);
    } catch {}

    this.memDbAdapter = db.adapters.createPg();
    return this.memDbAdapter;
  }

  public async query<T extends pg.QueryResultRow = any>(
    text: string,
    params?: any[]
  ): Promise<pg.QueryResult<T>> {
    // 1. Try real PostgreSQL pool
    if (this.isPostgresConnected !== false) {
      try {
        const timeoutMs = config.TENANT_POOL_CONNECTION_TIMEOUT_MS || 15000;
        const res = await this.withTimeout(this.pool.query<T>(text, params), timeoutMs, 'PostgreSQL query');
        this.isPostgresConnected = true;
        return res;
      } catch (err: any) {
        const isConnErr =
          err.code === 'ECONNREFUSED' ||
          err.code === 'ENOTFOUND' ||
          err.code === '28P01' ||
          err.code === 'ECONNRESET' ||
          err.code === '57P01' ||
          err.message?.includes('Connection terminated') ||
          err.message?.includes('timeout') ||
          err.message?.includes('timed out') ||
          err.message?.includes('socket hang up');

        if (isConnErr && (this.isTestEnvironment() || config.NODE_ENV === 'development')) {
          if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.message?.includes('timeout') || err.message?.includes('timed out')) {
            this.isPostgresConnected = false;
          }
          logger.warn({ error: err.message }, 'Physical PostgreSQL disconnected. Using in-memory database fallback for development.');
          const adapter = this.getOrCreateTestMemDb();
          const pool = new adapter.Pool();
          return await pool.query(text, params);
        }

        throw err;
      }
    }

    // 2. Fallback to isolated test double in unit test mode or development
    if (this.isTestEnvironment() || config.NODE_ENV === 'development') {
      const adapter = this.getOrCreateTestMemDb();
      const pool = new adapter.Pool();
      return await pool.query(text, params);
    }

    throw new Error('PostgreSQL central database connection is currently unavailable.');
  }

  public async getClient(): Promise<any> {
    if (this.isPostgresConnected !== false) {
      try {
        const timeoutMs = config.TENANT_POOL_CONNECTION_TIMEOUT_MS || 15000;
        const client = await this.withTimeout(this.pool.connect(), timeoutMs, 'PostgreSQL connect');
        this.isPostgresConnected = true;
        return client;
      } catch (err: any) {
        const isConnErr =
          err.code === 'ECONNREFUSED' ||
          err.code === 'ENOTFOUND' ||
          err.code === '28P01' ||
          err.code === 'ECONNRESET' ||
          err.code === '57P01' ||
          err.message?.includes('Connection terminated') ||
          err.message?.includes('timeout') ||
          err.message?.includes('timed out') ||
          err.message?.includes('socket hang up');

        if (isConnErr) {
          if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.message?.includes('timeout') || err.message?.includes('timed out')) {
            this.isPostgresConnected = false;
          }
          if (!this.isTestEnvironment() && config.NODE_ENV !== 'development') {
            throw err;
          }
        } else {
          throw err;
        }
      }
    }

    if (this.isTestEnvironment() || config.NODE_ENV === 'development') {
      const adapter = this.getOrCreateTestMemDb();
      const memPool = new adapter.Pool();
      return await memPool.connect();
    }

    throw new Error('PostgreSQL central database connection is currently unavailable.');
  }

  public async withTransaction<T>(
    callback: (client: pg.PoolClient) => Promise<T>
  ): Promise<T> {
    if (this.isPostgresConnected !== false) {
      try {
        const timeoutMs = config.TENANT_POOL_CONNECTION_TIMEOUT_MS || 15000;
        const client = await this.withTimeout(this.pool.connect(), timeoutMs, 'PostgreSQL transaction connect');
        try {
          await client.query('BEGIN');
          const result = await callback(client);
          await client.query('COMMIT');
          this.isPostgresConnected = true;
          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      } catch (err: any) {
        if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.message?.includes('timeout') || err.message?.includes('timed out')) {
          this.isPostgresConnected = false;
          if (!this.isTestEnvironment() && config.NODE_ENV !== 'development') {
            throw err;
          }
        } else {
          throw err;
        }
      }
    }

    if (this.isTestEnvironment() || config.NODE_ENV === 'development') {
      const adapter = this.getOrCreateTestMemDb();
      const pool = new adapter.Pool();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    throw new Error('PostgreSQL central database connection is currently unavailable.');
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}

export const db = PostgresDatabase.getInstance();
