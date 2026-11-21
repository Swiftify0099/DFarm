import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const client = new Client({ connectionString });

async function main() {
  console.log(`Connecting to PostgreSQL at ${connectionString}...`);
  try {
    await client.connect();
    console.log('PostgreSQL connected.');

    const sqlPath = path.resolve('supabase/migrations/030_super_admin_pankaj_popat_yewale.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    console.log('Applying Migration 030: Super Admin Pankaj Popat Yewale...');
    await client.query(sql);
    console.log('Migration 030 applied successfully!');

    const res = await client.query(`
      SELECT id, username, full_name, phone_number, role, status
      FROM users
      WHERE phone_number LIKE '%7755995615' OR normalized_mobile_number LIKE '%7755995615'
      LIMIT 1;
    `);

    if (res.rows.length > 0) {
      console.log('Super Admin User verified in database:', res.rows[0]);
    } else {
      console.warn('Super Admin user record not found after migration.');
    }
  } catch (err) {
    console.error('Error during super admin seeding:', err.message);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
