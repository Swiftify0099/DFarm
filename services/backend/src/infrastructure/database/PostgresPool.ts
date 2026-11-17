import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { newDb } from 'pg-mem';
import { config } from '../../config/env.js';

const { Pool } = pg;

export class PostgresDatabase {
  private static instance: PostgresDatabase;
  public readonly pool: pg.Pool;
  private memDbAdapter: any = null;
  private isPostgresConnected: boolean | null = null;

  private constructor() {
    this.pool = new Pool({
      connectionString: config.DATABASE_URL,
      max: 15,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL client:', err.message);
    });
  }

  public static getInstance(): PostgresDatabase {
    if (!PostgresDatabase.instance) {
      PostgresDatabase.instance = new PostgresDatabase();
    }
    return PostgresDatabase.instance;
  }

  private getOrCreateMemDb(): any {
    if (this.memDbAdapter) return this.memDbAdapter;

    const db = newDb();
    const floatType = db.public.getType('float' as any);

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
    const intType = db.public.getType('integer' as any);

    db.public.registerFunction({
      name: 'radians',
      args: [floatType],
      returns: floatType,
      implementation: (v: number) => (Number(v) * Math.PI) / 180,
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
      name: 'asin',
      args: [intType],
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
      name: 'acos',
      args: [intType],
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

    const migrationFiles = [
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
      '029_dairy_admin_activation_tokens.sql',
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
      for (const file of migrationFiles) {
        const filePath = path.join(migrationsDir, file);
        if (!fs.existsSync(filePath)) continue;

        const raw = fs.readFileSync(filePath, 'utf-8');
        let clean = raw.replace(/--.*$/gm, '');
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
            /^CREATE\s+OR\s+REPLACE\s+FUNCTION/i.test(stmt)
          ) {
            continue;
          }

          try {
            db.public.none(stmt);
          } catch {
            // Ignored minor unsupported pg-mem DDL constructs
          }
        }
      }
    }

    // Seed Multi-Dairy Logical Isolation Master Records
    const modelVersionId = 'f0000000-0000-0000-0000-000000000001';

    // Model version
    db.public.none(`
      INSERT INTO face_model_versions (
        id, model_name, model_version, embedding_dimension, similarity_metric,
        recommended_threshold, is_active
      ) VALUES (
        '${modelVersionId}', 'OpenCV-SFace-INT8', 'sface_int8_2021dec', 128, 'COSINE',
        0.363, TRUE
      ) ON CONFLICT DO NOTHING;
    `);

    // 1. Dairy A: Gokul Primary Cooperative
    const dairyAId = '00000000-0000-0000-0000-000000000001';
    const centerAId = '00000000-0000-0000-0000-000000000002';
    const operatorAId = '00000000-0000-0000-0000-000000000003';

    db.public.none(`
      INSERT INTO organizations (id, name, code, status, latitude, longitude, formatted_address, village_locality, district, state, postal_code, business_phone)
      VALUES ('${dairyAId}', 'Gokul Primary Cooperative', 'GOKUL-01', 'ACTIVE', 16.6644, 74.2588, 'Gokul Shirgaon, Kolhapur, Maharashtra 416234, India', 'Gokul Shirgaon', 'Kolhapur', 'Maharashtra', '416234', '+919876543210')
      ON CONFLICT DO NOTHING;

      INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, latitude, longitude, formatted_address, status)
      VALUES ('${centerAId}', '${dairyAId}', 'C-101', 'Gokul Shirgaon Center', 'Main Road', 'Gokul Shirgaon', 'Kolhapur', 'Maharashtra', '416234', '+919876543210', 16.6644, 74.2588, 'Gokul Shirgaon Center, Main Road, Kolhapur', 'ACTIVE')
      ON CONFLICT DO NOTHING;

      INSERT INTO users (id, organization_id, username, full_name, phone_number, role, status)
      VALUES ('00000000-0000-0000-0000-000000000099', '${dairyAId}', 'superadmin_7755995615', 'Pankaj Popat Yewale', '+917755995615', 'SUPER_ADMIN', 'ACTIVE')
      ON CONFLICT DO NOTHING;

      INSERT INTO users (id, organization_id, username, full_name, phone_number, role, status)
      VALUES ('${operatorAId}', '${dairyAId}', 'operator_sachin', 'Sachin Ananda Patil', '+919876543210', 'COLLECTION_OPERATOR', 'ACTIVE')
      ON CONFLICT DO NOTHING;

      INSERT INTO users (id, organization_id, username, full_name, phone_number, role, status)
      VALUES ('00000000-0000-0000-0000-000000000011', '${dairyAId}', 'operator_kiosk', 'Sachin Patil Kiosk', '+919822114477', 'COLLECTION_OPERATOR', 'ACTIVE')
      ON CONFLICT DO NOTHING;
    `);

    // 2. Dairy B: Warna Sahakari Dudh (Strict Isolation Test Tenant)
    const dairyBId = '00000000-0000-0000-0000-000000000004';
    const centerBId = '00000000-0000-0000-0000-000000000005';
    const operatorBId = '00000000-0000-0000-0000-000000000006';

    db.public.none(`
      INSERT INTO organizations (id, name, code, status, latitude, longitude, formatted_address, village_locality, district, state, postal_code, business_phone)
      VALUES ('${dairyBId}', 'Warna Sahakari Dudh', 'WARNA-01', 'ACTIVE', 16.8833, 74.1950, 'Kodoli, Panhala, Kolhapur, Maharashtra 416114, India', 'Kodoli', 'Kolhapur', 'Maharashtra', '416114', '+919822987111')
      ON CONFLICT DO NOTHING;

      INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, latitude, longitude, formatted_address, status)
      VALUES ('${centerBId}', '${dairyBId}', 'W-201', 'Warna Kodoli Center', 'Kodoli Chowk', 'Kodoli', 'Kolhapur', 'Maharashtra', '416114', '+919822987111', 16.8833, 74.1950, 'Warna Kodoli Center, Kodoli Chowk, Kolhapur', 'ACTIVE')
      ON CONFLICT DO NOTHING;

      INSERT INTO users (id, organization_id, username, full_name, phone_number, role, status)
      VALUES ('${operatorBId}', '${dairyBId}', 'operator_ramesh', 'Ramesh Vithal Chavan', '+919822987111', 'COLLECTION_OPERATOR', 'ACTIVE')
      ON CONFLICT DO NOTHING;

      INSERT INTO users (id, organization_id, username, full_name, phone_number, role, status)
      VALUES ('00000000-0000-0000-0000-000000000066', '${dairyBId}', 'admin_warna', 'Tanaji Raghunath Patil', '+919822987222', 'DAIRY_ADMIN', 'ACTIVE')
      ON CONFLICT DO NOTHING;

      -- 3. Dairy C: Sahyadri Organic Milk Federation (Tenant Directory)
      INSERT INTO organizations (id, name, code, status, latitude, longitude, formatted_address, village_locality, district, state, postal_code, business_phone)
      VALUES ('00000000-0000-0000-0000-000000000007', 'Sahyadri Organic Milk Federation', 'DF-KOP-0118', 'ACTIVE', 16.7454, 74.2789, 'Gat No. 128, Shiroli MIDC Area, Kolhapur, Maharashtra 416122, India', 'Shiroli', 'Kolhapur', 'Maharashtra', '416122', '02312678901')
      ON CONFLICT DO NOTHING;

      INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, latitude, longitude, formatted_address, status)
      VALUES ('00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000007', 'C-KOP', 'Sahyadri Shiroli Center', 'Shiroli MIDC', 'Shiroli', 'Kolhapur', 'Maharashtra', '416122', '02312678901', 16.7454, 74.2789, 'Gat No. 128, Shiroli MIDC Area, Kolhapur', 'ACTIVE')
      ON CONFLICT DO NOTHING;

      INSERT INTO users (id, organization_id, username, full_name, phone_number, role, status)
      VALUES ('00000000-0000-0000-0000-000000000077', '00000000-0000-0000-0000-000000000007', 'admin_sahyadri', 'Balasaheb Shripad Desai', '+919822987333', 'DAIRY_ADMIN', 'ACTIVE')
      ON CONFLICT DO NOTHING;

      -- 4. Dairy D: kalpna mlik's (Sangli Tenant Directory)
      INSERT INTO organizations (id, name, code, status, latitude, longitude, formatted_address, village_locality, city, district, state, postal_code, business_phone)
      VALUES ('e363070f-0004-492f-b759-e51038c0e35a', 'kalpna mlik''s', 'DF-SAN-8897', 'ACTIVE', 16.8801100, 74.4576870, 'VFH5+M4V, Kavathe Piran, Sheri Kavathe, Maharashtra 416417, India', 'Kavathe Piran', 'Sangli', 'Sangli', 'Maharashtra', '416417', '9834388787')
      ON CONFLICT DO NOTHING;

      INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, latitude, longitude, formatted_address, status)
      VALUES ('70a1e1af-405f-407e-bf0f-43599bb228ab', 'e363070f-0004-492f-b759-e51038c0e35a', 'C-01', 'kalpna mlik''s Main Center', 'VFH5+M4V', 'Kavathe Piran', 'Sangli', 'Maharashtra', '416417', '9834388787', 16.8801100, 74.4576870, 'VFH5+M4V, Kavathe Piran, Sheri Kavathe, Maharashtra 416417, India', 'ACTIVE')
      ON CONFLICT DO NOTHING;

      INSERT INTO users (id, organization_id, username, full_name, phone_number, role, status)
      VALUES ('00000000-0000-0000-0000-000000000088', 'e363070f-0004-492f-b759-e51038c0e35a', 'admin_kalpna', 'Kalpana Popat Yewale', '+919834388787', 'DAIRY_ADMIN', 'ACTIVE')
      ON CONFLICT DO NOTHING;

      -- 5. Dairy E: ShivShakti Milk's (Sangli Tenant Directory)
      INSERT INTO organizations (id, name, code, status, latitude, longitude, formatted_address, village_locality, city, district, state, postal_code, business_phone)
      VALUES ('7ba650e1-e8ef-477e-b2f3-000bb59617f8', 'ShivShakti Milk''s', 'DF-SAN-6962', 'ACTIVE', 16.8954772, 74.4701475, 'Kavathe Piran, Maharashtra, India', 'Kavathe Piran', 'Sangli', 'sangli', 'Maharashtra', '416417', '7507495615')
      ON CONFLICT DO NOTHING;

      INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, latitude, longitude, formatted_address, status)
      VALUES ('9463bbad-c567-4213-8ba6-a870d9abe547', '7ba650e1-e8ef-477e-b2f3-000bb59617f8', 'C-01', 'ShivShakti Milk''s Main Center', 'Kavathe Piran', 'Kavathe Piran', 'sangli', 'Maharashtra', '416417', '7507495615', 16.8954772, 74.4701475, 'Kavathe Piran, Maharashtra, India', 'ACTIVE')
      ON CONFLICT DO NOTHING;

      INSERT INTO users (id, organization_id, username, full_name, phone_number, role, status)
      VALUES ('00000000-0000-0000-0000-000000000089', '7ba650e1-e8ef-477e-b2f3-000bb59617f8', 'admin_shivshakti', 'Popat Yewale', '+917507495615', 'DAIRY_ADMIN', 'ACTIVE')
      ON CONFLICT DO NOTHING;
    `);

    this.memDbAdapter = db.adapters.createPg();
    return this.memDbAdapter;
  }

  public async query<T extends pg.QueryResultRow = any>(
    text: string,
    params?: any[]
  ): Promise<pg.QueryResult<T>> {
    if (this.isPostgresConnected !== false) {
      try {
        const res = await this.pool.query<T>(text, params);
        this.isPostgresConnected = true;
        return res;
      } catch (err: any) {
        if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
          this.isPostgresConnected = false;
        } else {
          throw err;
        }
      }
    }

    const adapter = this.getOrCreateMemDb();
    const pool = new adapter.Pool();
    const res = await pool.query(text, params);
    return res;
  }

  public async withTransaction<T>(
    callback: (client: pg.PoolClient) => Promise<T>
  ): Promise<T> {
    if (this.isPostgresConnected !== false) {
      try {
        const client = await this.pool.connect();
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
      } catch (err: any) {
        if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
          this.isPostgresConnected = false;
        } else {
          throw err;
        }
      }
    }

    const adapter = this.getOrCreateMemDb();
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

  public async close(): Promise<void> {
    await this.pool.end();
  }
}

export const db = PostgresDatabase.getInstance();
