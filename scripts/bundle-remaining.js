import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('supabase/migrations');
const files = fs
  .readdirSync(dir)
  .filter(f => f.endsWith('.sql') && !f.includes('remove_dairy_admin'))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  .filter(f => {
    const num = parseInt(f.split('_')[0], 10);
    return num >= 30;
  });

let content = '-- ========================================================\n';
content += '-- DFARM REMAINING MIGRATIONS (030 TO 037)\n';
content += '-- Run directly in Supabase SQL Editor\n';
content += '-- ========================================================\n\n';

for (const file of files) {
  content += `\n-- ========================================================\n`;
  content += `-- Migration: ${file}\n`;
  content += `-- ========================================================\n`;
  content += fs.readFileSync(path.join(dir, file), 'utf8') + '\n';
  const ver = file.split('_')[0];
  content += `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('${ver}', '${file}') ON CONFLICT (version) DO NOTHING;\n`;
}

const outPath = path.resolve('supabase/remaining_migrations_030_to_037.sql');
fs.writeFileSync(outPath, content, 'utf8');
console.log(`Generated ${outPath} with ${files.length} files (${(content.length / 1024).toFixed(1)} KB)`);
