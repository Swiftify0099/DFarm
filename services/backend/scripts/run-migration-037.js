import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const { Client } = pg;
const client = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
});

async function run() {
  await client.connect();
  console.log('Connected to PostgreSQL.');

  const migrationPath = path.resolve('supabase/migrations/037_multi_dairy_customer_identity_and_membership.sql');
  console.log('Reading migration:', migrationPath);
  const sql = fs.readFileSync(migrationPath, 'utf-8');

  console.log('Executing migration 037...');
  await client.query(sql);
  console.log('Migration 037 executed successfully!');

  const check = await client.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_name IN ('global_customer_identities', 'customer_dairy_memberships');
  `);
  console.log('Found tables:', check.rows.map(r => r.table_name));

  await client.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
