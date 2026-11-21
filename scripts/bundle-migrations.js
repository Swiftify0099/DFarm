import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('supabase/migrations');
const files = fs
  .readdirSync(dir)
  .filter(f => f.endsWith('.sql') && !f.includes('remove_dairy_admin'))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

let full = '-- ========================================================\n';
full += '-- DFARM COMPLETE DATABASE SCHEMA BUNDLE\n';
full += '-- Generated for single-click execution in Supabase SQL Editor\n';
full += '-- ========================================================\n\n';
full += 'CREATE SCHEMA IF NOT EXISTS auth;\n';
full += 'CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$ BEGIN RETURN NULL; END; $$ LANGUAGE plpgsql STABLE;\n';
full += 'CREATE SCHEMA IF NOT EXISTS supabase_migrations;\n';
full += 'CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (\n';
full += '  version VARCHAR(50) PRIMARY KEY,\n';
full += '  name VARCHAR(255) NOT NULL,\n';
full += '  statements TEXT[],\n';
full += '  inserted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n';
full += ');\n\n';

for (const file of files) {
  full += `\n-- ========================================================\n`;
  full += `-- Migration: ${file}\n`;
  full += `-- ========================================================\n`;
  const content = fs.readFileSync(path.join(dir, file), 'utf8');
  full += content + '\n';
  const ver = file.split('_')[0];
  full += `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('${ver}', '${file}') ON CONFLICT (version) DO NOTHING;\n`;
}

const outPath = path.resolve('supabase/full_schema.sql');
fs.writeFileSync(outPath, full, 'utf8');
console.log(`full_schema.sql generated successfully with ${files.length} migrations (${(full.length / 1024).toFixed(1)} KB)`);
