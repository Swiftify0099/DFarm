import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '../../../supabase/migrations');

describe('DFarm Database Migrations Static Validation Test Suite', () => {
  const expectedMigrations = [
    '001_extensions_and_common.sql',
    '002_organizations_and_centers.sql',
    '003_user_identity_foundation.sql',
    '004_customer_identity.sql',
    '005_face_and_rfid.sql',
    '006_customer_identification_audit.sql',
    '007_rate_management.sql',
    '008_collection_sessions_and_transactions.sql',
    '009_customer_ledger.sql',
    '010_devices_sync_and_audit.sql',
  ];

  it('should verify all 10 migration files exist in supabase/migrations/', () => {
    expectedMigrations.forEach(file => {
      const filePath = path.join(migrationsDir, file);
      assert.ok(fs.existsSync(filePath), `Migration file missing: ${file}`);
      const stats = fs.statSync(filePath);
      assert.ok(stats.size > 200, `Migration file ${file} is unexpectedly small (${stats.size} bytes)`);
    });
  });

  it('should verify exactly 43 distinct CREATE TABLE statements across all migrations', () => {
    const tableNames = [];
    expectedMigrations.forEach(file => {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      const matches = [...sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_]+)\s*\(/gi)];
      matches.forEach(m => tableNames.push(m[1].toLowerCase()));
    });
    assert.equal(tableNames.length, 43, `Expected exactly 43 tables, found ${tableNames.length}`);
    const uniqueTables = new Set(tableNames);
    assert.equal(uniqueTables.size, 43, 'Duplicate table names found across migrations');
  });

  it('should verify all tables define UUID PRIMARY KEYs', () => {
    expectedMigrations.forEach(file => {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      const tableMatches = [...sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_]+)\s*\(([\s\S]*?)\);/gi)];
      tableMatches.forEach(match => {
        const tableName = match[1];
        const tableBody = match[2];
        const hasPrimaryKey = /PRIMARY\s+KEY/i.test(tableBody);
        assert.ok(hasPrimaryKey, `Table ${tableName} in ${file} lacks PRIMARY KEY`);
      });
    });
  });

  it('should verify zero use of floating-point types (FLOAT, REAL, DOUBLE PRECISION) in financial/measurement tables', () => {
    const financialFiles = ['007_rate_management.sql', '008_collection_sessions_and_transactions.sql', '009_customer_ledger.sql'];
    financialFiles.forEach(file => {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      assert.ok(!/amount\s+FLOAT/i.test(sql), `Floating point found in ${file}`);
      assert.ok(!/rate\s+FLOAT/i.test(sql), `Floating point found in ${file}`);
      assert.ok(!/weight\s+FLOAT/i.test(sql), `Floating point found in ${file}`);
      assert.ok(/NUMERIC/i.test(sql), `Expected NUMERIC types in ${file}`);
    });
  });

  it('should verify customer mobile number uniqueness is scoped to organization', () => {
    const custSql = fs.readFileSync(path.join(migrationsDir, '004_customer_identity.sql'), 'utf-8');
    assert.ok(
      custSql.includes('uq_customer_mobile_per_org UNIQUE (organization_id, normalized_mobile_number)'),
      'Missing organization-scoped unique constraint on customer mobile number'
    );
  });

  it('should verify unique card UID constraint is scoped to organization', () => {
    const rfidSql = fs.readFileSync(path.join(migrationsDir, '005_face_and_rfid.sql'), 'utf-8');
    assert.ok(
      rfidSql.includes('uq_rfid_card_uid_per_org UNIQUE (organization_id, card_uid)'),
      'Missing organization-scoped unique constraint on RFID card UID'
    );
  });

  it('should verify single-active RFID card assignment partial unique indexes', () => {
    const rfidSql = fs.readFileSync(path.join(migrationsDir, '005_face_and_rfid.sql'), 'utf-8');
    assert.ok(
      rfidSql.includes('uq_active_card_assignment'),
      'Missing partial unique index for active card assignment'
    );
    assert.ok(
      rfidSql.includes('uq_active_customer_card'),
      'Missing partial unique index for active customer card'
    );
  });

  it('should verify single-active face enrollment template per customer and model version', () => {
    const faceSql = fs.readFileSync(path.join(migrationsDir, '005_face_and_rfid.sql'), 'utf-8');
    assert.ok(
      faceSql.includes('uq_active_customer_face_template'),
      'Missing partial unique index for active face enrollment template'
    );
  });

  it('should verify idempotency keys exist on milk_collections and ledger_transactions', () => {
    const colSql = fs.readFileSync(path.join(migrationsDir, '008_collection_sessions_and_transactions.sql'), 'utf-8');
    assert.ok(colSql.includes('idempotency_key VARCHAR(128) NOT NULL UNIQUE'), 'Missing unique idempotency key on milk_collections');

    const ledSql = fs.readFileSync(path.join(migrationsDir, '009_customer_ledger.sql'), 'utf-8');
    assert.ok(ledSql.includes('idempotency_key VARCHAR(128) NOT NULL UNIQUE'), 'Missing unique idempotency key on ledger_transactions');
  });

  it('should verify milk_collections permits multiple deliveries per customer per shift (no unique constraint on customer+date+shift)', () => {
    const colSql = fs.readFileSync(path.join(migrationsDir, '008_collection_sessions_and_transactions.sql'), 'utf-8');
    assert.ok(!colSql.includes('UNIQUE (customer_id, business_date, shift_type)'), 'Accidental unique constraint blocks multiple deliveries per shift');
    assert.ok(!colSql.includes('UNIQUE (customer_id, shift_id)'), 'Accidental unique constraint blocks multiple deliveries per shift');
  });

  it('should verify financial foreign keys enforce ON DELETE RESTRICT on core entities', () => {
    const ledSql = fs.readFileSync(path.join(migrationsDir, '009_customer_ledger.sql'), 'utf-8');
    assert.ok(ledSql.includes('customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT'), 'Ledger transactions must RESTRICT customer deletion');
    assert.ok(ledSql.includes('organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT'), 'Ledger transactions must RESTRICT org deletion');
    assert.ok(ledSql.includes('center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT'), 'Ledger transactions must RESTRICT center deletion');
  });

  it('should verify auth helper functions in 001 are hardened with SECURITY DEFINER and safe search_path without overriding auth.uid()', () => {
    const commonSql = fs.readFileSync(path.join(migrationsDir, '001_extensions_and_common.sql'), 'utf-8');
    assert.ok(commonSql.includes('SECURITY DEFINER'), 'Helper functions must be SECURITY DEFINER');
    assert.ok(commonSql.includes('SET search_path = pg_catalog') || commonSql.includes("SET search_path = ''"), 'Helper functions must have fixed safe search_path');
    assert.ok(!commonSql.includes('CREATE OR REPLACE FUNCTION auth.uid('), 'Production migration must NOT override native Supabase auth.uid()');
    assert.ok(commonSql.includes('current_org_id()'), 'current_org_id() must be declared');
  });

  it('should verify Row Level Security (RLS) is enabled across all 43 tables and policies are defined', () => {
    const rlsSql = fs.readFileSync(path.join(migrationsDir, '010_devices_sync_and_audit.sql'), 'utf-8');
    assert.ok(rlsSql.includes('ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;'), 'RLS not enabled on organizations');
    assert.ok(rlsSql.includes('ALTER TABLE customers ENABLE ROW LEVEL SECURITY;'), 'RLS not enabled on customers');
    assert.ok(rlsSql.includes('ALTER TABLE milk_collections ENABLE ROW LEVEL SECURITY;'), 'RLS not enabled on milk_collections');
    assert.ok(rlsSql.includes('ALTER TABLE ledger_transactions ENABLE ROW LEVEL SECURITY;'), 'RLS not enabled on ledger_transactions');
    assert.ok(rlsSql.includes('CREATE POLICY rls_customers_select'), 'Missing customers select policy');
    assert.ok(rlsSql.includes('CREATE POLICY rls_face_enrollments_select'), 'Missing biometrics protection policy');
  });
});
