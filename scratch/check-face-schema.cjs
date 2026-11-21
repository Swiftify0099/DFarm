const pg = require('pg');
const fs = require('fs');

const envContent = fs.readFileSync('.env', 'utf8');
const dbUrlMatch = envContent.match(/DATABASE_URL=["']?([^"'\r\n]+)["']?/);
const dbUrl = dbUrlMatch ? dbUrlMatch[1] : process.env.DATABASE_URL;

async function check() {
  const pool = new pg.Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  const res = await pool.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'customers' AND column_name LIKE '%face%';"
  );
  console.log('Face columns in customers table:', res.rows);

  const feRes = await pool.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'face_enrollments' ORDER BY ordinal_position;"
  );
  console.log('Columns in face_enrollments table:');
  feRes.rows.forEach(r => console.log(`  - ${r.column_name}: ${r.data_type}`));

  const fmvRes = await pool.query(
    "SELECT id, model_name, model_version, embedding_dimension, is_active FROM face_model_versions;"
  );
  console.log('Face model versions:', fmvRes.rows);

  await pool.end();
}

check().catch(console.error);
