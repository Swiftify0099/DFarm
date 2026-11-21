import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns';
import pg from 'pg';

// Force IPv4 first to avoid IPv6 timeout on Windows / ISP networks
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const { Client } = pg;

// Helper to determine SSL settings for remote hosts (e.g. Supabase, Neon, Render)
function getSslConfig(connectionString) {
  if (process.env.DATABASE_TLS_MODE === 'disable') {
    return false;
  }
  if (process.env.DATABASE_TLS_MODE === 'require') {
    return { rejectUnauthorized: false };
  }
  if (
    connectionString &&
    !connectionString.includes('127.0.0.1') &&
    !connectionString.includes('localhost')
  ) {
    return { rejectUnauthorized: false };
  }
  return false;
}

// Auto load .env if present
function loadEnv() {
  const envCandidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'services/backend/.env'),
  ];

  for (const envPath of envCandidates) {
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const k = trimmed.slice(0, eqIdx).trim();
            let v = trimmed.slice(eqIdx + 1).trim();
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
              v = v.slice(1, -1);
            }
            if (!v.includes('YOUR_PASSWORD_HERE')) {
              process.env[k] = v;
            } else if (!process.env[k]) {
              process.env[k] = v;
            }
          }
        }
      }
    }
  }
}

loadEnv();

const connectionString =
  (process.env.DIRECT_URL && !process.env.DIRECT_URL.includes('YOUR_PASSWORD_HERE') ? process.env.DIRECT_URL : null) ||
  (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('YOUR_PASSWORD_HERE') ? process.env.DATABASE_URL : null) ||
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const ssl = getSslConfig(connectionString);

console.log('------------------------------------------------------------');
console.log('DFARM DATABASE MIGRATION ENGINE');
console.log('Target Connection:', connectionString.replace(/:[^:@]+@/, ':****@'));
console.log('SSL Mode Enabled:', Boolean(ssl));
console.log('------------------------------------------------------------');

const client = new Client({
  connectionString,
  ssl,
  connectionTimeoutMillis: 15000,
});

async function run() {
  try {
    await client.connect();
    console.log('Connected to PostgreSQL successfully.\n');

    // 1. Safely ensure auth helper & migration tracking table
    try {
      await client.query(`
        CREATE SCHEMA IF NOT EXISTS auth;
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$ BEGIN RETURN NULL; END; $$ LANGUAGE plpgsql STABLE;
      `);
    } catch {
      // In Supabase Cloud, auth schema and auth.uid() are natively managed by supabase_admin
    }

    let migrationsTable = 'supabase_migrations.schema_migrations';
    try {
      await client.query(`
        CREATE SCHEMA IF NOT EXISTS supabase_migrations;
        CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
          version VARCHAR(50) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          statements TEXT[],
          inserted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
    } catch {
      migrationsTable = 'schema_migrations';
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version VARCHAR(50) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          statements TEXT[],
          inserted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
    }

    // 2. Read migration files
    const migrationsDir = path.resolve('supabase/migrations');
    if (!fs.existsSync(migrationsDir)) {
      throw new Error(`Migrations directory not found at: ${migrationsDir}`);
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql') && !f.includes('remove_dairy_admin'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    console.log(`Found ${files.length} active migration scripts to execute.\n`);

    // 3. Check already applied migrations
    let appliedSet = new Set();
    try {
      const appliedRes = await client.query(`SELECT version FROM ${migrationsTable};`);
      appliedSet = new Set(appliedRes.rows.map(r => r.version));
    } catch {
      // Table empty or first run
    }

    let appliedCount = 0;
    let skippedCount = 0;

    for (const file of files) {
      const version = file.split('_')[0];
      if (appliedSet.has(version)) {
        skippedCount++;
        continue;
      }

      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      process.stdout.write(`Executing migration ${file}... `);
      const start = Date.now();
      try {
        await client.query(sql);
        try {
          await client.query(
            `INSERT INTO ${migrationsTable} (version, name, statements)
             VALUES ($1, $2, ARRAY[$3])
             ON CONFLICT (version) DO NOTHING;`,
            [version, file, sql]
          );
        } catch {
          // Fallback if statements column or table differs
          await client.query(
            `INSERT INTO ${migrationsTable} (version, name)
             VALUES ($1, $2)
             ON CONFLICT (version) DO NOTHING;`,
            [version, file]
          ).catch(() => {});
        }
        console.log(`DONE (${Date.now() - start}ms)`);
        appliedCount++;
      } catch (migrationErr) {
        console.log('FAILED');
        console.error(`\n[CRITICAL] Migration ${file} failed:`, migrationErr.message);
        throw migrationErr;
      }
    }

    console.log('\n------------------------------------------------------------');
    console.log(`Migration Run Completed: ${appliedCount} applied, ${skippedCount} already up to date.`);
    console.log('------------------------------------------------------------\n');

    // 4. Verify primary tables
    const tableRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    console.log(`Total public tables in database: ${tableRes.rows.length}`);

    // 5. Verify Super Admin seed
    const adminCheck = await client.query(`
      SELECT id, username, full_name, phone_number, role, status
      FROM users
      WHERE phone_number LIKE '%7755995615' OR normalized_mobile_number LIKE '%7755995615'
      LIMIT 1;
    `);
    if (adminCheck.rows.length > 0) {
      console.log('Super Admin User verified:', adminCheck.rows[0].username, `(${adminCheck.rows[0].phone_number})`);
    } else {
      console.warn('Super Admin record not found. Running seed script...');
      const seedSql = fs.readFileSync(path.resolve('supabase/migrations/030_super_admin_pankaj_popat_yewale.sql'), 'utf8');
      await client.query(seedSql);
      console.log('Super Admin seeded successfully.');
    }

    console.log('\nAll database tables and seed records are verified and ready for production!');
  } catch (err) {
    console.error('\nDatabase migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

run();
