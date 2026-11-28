import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MigrationTarget,
  MIGRATION_MANIFEST,
  MIGRATION_FILES,
  CONTROL_PLANE_MIGRATIONS,
  TENANT_OPERATIONAL_MIGRATIONS,
  QUARANTINED_MIGRATIONS,
  QUARANTINED_MIGRATION_FILENAMES,
  validateMigrationCatalog,
  validateMigrationsDirectory,
  computeMigrationLockKey,
  validateMigrationTrackInputs,
} from '../dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '../../../supabase/migrations');

describe('DFarm Migration Catalog Integrity, 031 Quarantine & 040 Ownership Suite', () => {
  it('1. Canonical manifest reconciles 1-to-1 with every SQL file in supabase/migrations/', () => {
    const summary = validateMigrationsDirectory(migrationsDir);
    const diskSqlFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));

    assert.equal(summary.diskSqlFilesChecked, diskSqlFiles.length);
    assert.equal(summary.totalEntries, MIGRATION_MANIFEST.length);
    assert.equal(summary.activeEntries, MIGRATION_FILES.length);
    assert.equal(summary.quarantinedEntries, QUARANTINED_MIGRATIONS.length);

    for (const entry of MIGRATION_MANIFEST) {
      const fullPath = path.join(migrationsDir, entry.filename);
      assert.ok(fs.existsSync(fullPath), `Missing SQL file for manifest entry ${entry.filename}`);
    }
  });

  it('2. Migration 031 active entry and quarantined 031 script are cleanly separated without version collision', () => {
    const prefix031Entries = MIGRATION_MANIFEST.filter(m => m.filename.startsWith('031_'));
    assert.equal(prefix031Entries.length, 2);

    const active031 = MIGRATION_MANIFEST.find(m => m.filename === '031_dairy_database_mappings.sql');
    assert.ok(active031, '031_dairy_database_mappings.sql must exist in MIGRATION_MANIFEST');
    assert.equal(active031.version, '031');
    assert.equal(active031.target, MigrationTarget.CONTROL_PLANE);

    const quarantined031 = MIGRATION_MANIFEST.find(m => m.filename === '031_remove_dairy_admin_7507495615.sql');
    assert.ok(quarantined031, '031_remove_dairy_admin_7507495615.sql must be registered as quarantined');
    assert.equal(quarantined031.version, '031_quarantine');
    assert.equal(quarantined031.target, MigrationTarget.MANUAL_REVIEW_REQUIRED);

    assert.equal(QUARANTINED_MIGRATIONS.length, 1);
    assert.ok(QUARANTINED_MIGRATION_FILENAMES.has('031_remove_dairy_admin_7507495615.sql'));
    assert.equal(MIGRATION_FILES.includes('031_remove_dairy_admin_7507495615.sql'), false);
    assert.equal(MIGRATION_FILES.includes('031_dairy_database_mappings.sql'), true);

    assert.ok(CONTROL_PLANE_MIGRATIONS.some(m => m.filename === '031_dairy_database_mappings.sql'));
    assert.equal(TENANT_OPERATIONAL_MIGRATIONS.some(m => m.filename === '031_dairy_database_mappings.sql'), false);
    assert.equal(CONTROL_PLANE_MIGRATIONS.some(m => m.filename === '031_remove_dairy_admin_7507495615.sql'), false);
    assert.equal(TENANT_OPERATIONAL_MIGRATIONS.some(m => m.filename === '031_remove_dairy_admin_7507495615.sql'), false);
  });

  it('3. Migration 040 belongs exclusively to CONTROL_PLANE and is excluded from TENANT_OPERATIONAL', () => {
    const entry040 = MIGRATION_MANIFEST.find(m => m.version === '040');
    assert.ok(entry040, 'Migration 040 must exist in MIGRATION_MANIFEST');
    assert.equal(entry040.filename, '040_device_auth_challenges.sql');
    assert.equal(entry040.target, MigrationTarget.CONTROL_PLANE);

    assert.ok(MIGRATION_FILES.includes('040_device_auth_challenges.sql'));
    assert.ok(CONTROL_PLANE_MIGRATIONS.some(m => m.version === '040' && m.filename === '040_device_auth_challenges.sql'));
    assert.equal(
      TENANT_OPERATIONAL_MIGRATIONS.some(m => m.version === '040' || m.filename === '040_device_auth_challenges.sql'),
      false,
      '040_device_auth_challenges.sql must NEVER be on TENANT_OPERATIONAL_MIGRATIONS'
    );
  });

  it('3b. Migration 049 belongs exclusively to TENANT_OPERATIONAL and is excluded from CONTROL_PLANE', () => {
    const entry049 = MIGRATION_MANIFEST.find(m => m.version === '049');
    assert.ok(entry049, 'Migration 049 must exist in MIGRATION_MANIFEST');
    assert.equal(entry049.filename, '049_customer_beneficiary_bank_encryption_and_mask.sql');
    assert.equal(entry049.target, MigrationTarget.TENANT_OPERATIONAL);

    assert.ok(MIGRATION_FILES.includes('049_customer_beneficiary_bank_encryption_and_mask.sql'));
    assert.ok(
      TENANT_OPERATIONAL_MIGRATIONS.some(
        m => m.version === '049' && m.filename === '049_customer_beneficiary_bank_encryption_and_mask.sql'
      )
    );
    assert.equal(
      CONTROL_PLANE_MIGRATIONS.some(
        m => m.version === '049' || m.filename === '049_customer_beneficiary_bank_encryption_and_mask.sql'
      ),
      false,
      '049_customer_beneficiary_bank_encryption_and_mask.sql must NEVER be on CONTROL_PLANE_MIGRATIONS'
    );
  });

  it('4. Deterministic track ordering and track partitioning contain zero quarantined or cross-track leaks', () => {
    const cpVersions = CONTROL_PLANE_MIGRATIONS.map(m => m.version);
    const tenantVersions = TENANT_OPERATIONAL_MIGRATIONS.map(m => m.version);

    assert.equal(new Set(cpVersions).size, cpVersions.length);
    assert.equal(new Set(tenantVersions).size, tenantVersions.length);

    for (let i = 1; i < cpVersions.length; i++) {
      assert.ok(Number(cpVersions[i]) > Number(cpVersions[i - 1]), `Non-monotonic control-plane order at ${cpVersions[i]}`);
    }
    for (let i = 1; i < tenantVersions.length; i++) {
      assert.ok(Number(tenantVersions[i]) > Number(tenantVersions[i - 1]), `Non-monotonic tenant order at ${tenantVersions[i]}`);
    }

    for (const q of QUARANTINED_MIGRATIONS) {
      assert.equal(CONTROL_PLANE_MIGRATIONS.some(m => m.filename === q.filename), false);
      assert.equal(TENANT_OPERATIONAL_MIGRATIONS.some(m => m.filename === q.filename), false);
      assert.equal(MIGRATION_FILES.includes(q.filename), false);
    }
  });

  it('5. Negative: rejects duplicate active migration versions', () => {
    assert.throws(
      () =>
        validateMigrationCatalog({
          manifest: [
            { version: '001', filename: '001_a.sql', target: MigrationTarget.SHARED, description: 'A' },
            { version: '001', filename: '001_b.sql', target: MigrationTarget.CONTROL_PLANE, description: 'B' },
          ],
          diskFilenames: ['001_a.sql', '001_b.sql'],
        }),
      /Duplicate migration version|Duplicate active migrations|Duplicate or out-of-order/i
    );
  });

  it('6. Negative: rejects duplicate numeric prefixes across active migrations even with distinct version strings', () => {
    assert.throws(
      () =>
        validateMigrationCatalog({
          manifest: [
            { version: '031', filename: '031_first.sql', target: MigrationTarget.CONTROL_PLANE, description: 'First' },
            { version: '031_alt', filename: '031_second.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Second' },
          ],
          diskFilenames: ['031_first.sql', '031_second.sql'],
        }),
      /must use exact version '031'|Duplicate active migrations/i
    );
  });

  it('7. Negative: rejects unknown .sql files on disk that are neither registered nor quarantined', () => {
    const diskWithRogue = [...fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')), '999_unregistered_rogue.sql'];
    assert.throws(
      () => validateMigrationCatalog({ manifest: MIGRATION_MANIFEST, diskFilenames: diskWithRogue }),
      /Unregistered migration SQL file\(s\) found on disk.*999_unregistered_rogue\.sql/i
    );
  });

  it('8. Negative: rejects missing .sql files declared in manifest', () => {
    const diskMissing040 = fs
      .readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql') && f !== '040_device_auth_challenges.sql');
    assert.throws(
      () => validateMigrationCatalog({ manifest: MIGRATION_MANIFEST, diskFilenames: diskMissing040 }),
      /Missing migration SQL file\(s\) declared in MIGRATION_MANIFEST.*040_device_auth_challenges\.sql/i
    );
  });

  it('9. Negative: rejects non-deterministic out-of-order manifest entries', () => {
    assert.throws(
      () =>
        validateMigrationCatalog({
          manifest: [
            { version: '002', filename: '002_second.sql', target: MigrationTarget.SHARED, description: 'Second' },
            { version: '001', filename: '001_first.sql', target: MigrationTarget.SHARED, description: 'First' },
          ],
          diskFilenames: ['001_first.sql', '002_second.sql'],
        }),
      /Non-deterministic migration ordering/i
    );
  });

  it('10. Negative: rejects quarantined migration using active numeric version instead of NNN_quarantine', () => {
    assert.throws(
      () =>
        validateMigrationCatalog({
          manifest: [
            { version: '031', filename: '031_remove_dairy_admin_7507495615.sql', target: MigrationTarget.MANUAL_REVIEW_REQUIRED, description: 'Bad version' },
            { version: '031', filename: '031_dairy_database_mappings.sql', target: MigrationTarget.CONTROL_PLANE, description: 'Valid' },
          ],
          diskFilenames: ['031_remove_dairy_admin_7507495615.sql', '031_dairy_database_mappings.sql'],
        }),
      /non-colliding version '031_quarantine'/i
    );
  });

  it('11. Advisory lock keys are deterministic signed 64-bit integers and independent across control-plane and tenants', () => {
    const cpKey1 = computeMigrationLockKey('dfarm_migration_lock:control_plane');
    const cpKey2 = computeMigrationLockKey('dfarm_migration_lock:control_plane');
    const tAKey = computeMigrationLockKey('dfarm_migration_lock:tenant_00000000-0000-0000-0000-000000000001');
    const tBKey = computeMigrationLockKey('dfarm_migration_lock:tenant_00000000-0000-0000-0000-000000000002');

    assert.equal(cpKey1, cpKey2);
    assert.match(cpKey1, /^-?\d+$/);
    assert.notEqual(cpKey1, tAKey);
    assert.notEqual(cpKey1, tBKey);
    assert.notEqual(tAKey, tBKey);
  });

  it('12. Negative: validateMigrationTrackInputs rejects cross-track injection, substituted filenames, and arbitrary track names', () => {
    assert.throws(
      () =>
        validateMigrationTrackInputs(
          TENANT_OPERATIONAL_MIGRATIONS,
          'control_plane',
          migrationsDir
        ),
      /Migration track rejection/i
    );

    assert.throws(
      () =>
        validateMigrationTrackInputs(
          CONTROL_PLANE_MIGRATIONS,
          'tenant_00000000-0000-0000-0000-000000000001',
          migrationsDir
        ),
      /Migration track rejection/i
    );

    assert.throws(
      () =>
        validateMigrationTrackInputs(
          CONTROL_PLANE_MIGRATIONS,
          'arbitrary_track_name',
          migrationsDir
        ),
      /Refusing arbitrary migration track/i
    );

    const substitutedTrack = CONTROL_PLANE_MIGRATIONS.map((entry) =>
      entry.version === '031'
        ? { ...entry, filename: '031_substituted_file.sql' }
        : entry
    );
    assert.throws(
      () =>
        validateMigrationTrackInputs(
          substitutedTrack,
          'control_plane',
          migrationsDir
        ),
      /does not match canonical MIGRATION_MANIFEST/i
    );
  });
});
