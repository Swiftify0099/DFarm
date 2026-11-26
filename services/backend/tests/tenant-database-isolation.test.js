import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createApp } from '../dist/app.js';
import request from 'supertest';
import {
  TenantDatabaseManager,
  MigrationRunner,
  MigrationTarget,
  MIGRATION_MANIFEST,
  QUARANTINED_MIGRATIONS,
  CredentialEncryption,
} from '../dist/infrastructure/index.js';
import { Customer } from '../dist/domain/entities/Customer.js';
import { PostgresCustomerRepository } from '../dist/infrastructure/repositories/PostgresCustomerRepository.js';

test('DFarm Multi-Tenant Isolation & Provisioning Test Suite', async (t) => {
  const tenantManager = TenantDatabaseManager.getInstance();
  const customerRepo = new PostgresCustomerRepository();
  const app = createApp();

  // --------------------------------------------------------------------------
  // TEST A: Migration Manifest & Quarantined Migration Exclusion
  // --------------------------------------------------------------------------
  await t.test('Test A: Migration Manifest & Quarantined Migration Exclusion', async () => {
    // 1. Quarantined destructive migrations must be present in manifest but tagged MANUAL_REVIEW_REQUIRED
    assert.strictEqual(QUARANTINED_MIGRATIONS.length, 1);
    assert.strictEqual(QUARANTINED_MIGRATIONS[0].filename, '031_remove_dairy_admin_7507495615.sql');
    assert.strictEqual(QUARANTINED_MIGRATIONS[0].target, MigrationTarget.MANUAL_REVIEW_REQUIRED);

    // 2. Control plane track must include authoritative 031_dairy_database_mappings.sql
    const controlPlaneMigrations = MIGRATION_MANIFEST.filter(
      m => m.target === MigrationTarget.CONTROL_PLANE || m.target === MigrationTarget.SHARED
    );
    const hasMappingMigration = controlPlaneMigrations.some(m => m.filename === '031_dairy_database_mappings.sql');
    assert.strictEqual(hasMappingMigration, true, '031_dairy_database_mappings.sql must be in control plane migration track');

    // 3. Destructive migration must NOT be in tenant or control plane track
    assert.strictEqual(controlPlaneMigrations.some(m => m.filename === '031_remove_dairy_admin_7507495615.sql'), false);
    const tenantMigrations = MIGRATION_MANIFEST.filter(
      m => m.target === MigrationTarget.TENANT_OPERATIONAL || m.target === MigrationTarget.SHARED
    );
    assert.strictEqual(tenantMigrations.some(m => m.filename === '031_remove_dairy_admin_7507495615.sql'), false);
  });

  // --------------------------------------------------------------------------
  // TEST B: AES-256-GCM Envelope Credential Encryption
  // --------------------------------------------------------------------------
  await t.test('Test B: AES-256-GCM Envelope Credential Encryption', async () => {
    const rawConnectionString = 'postgresql://dfarm_admin:TopSecretPass_9988@db.cluster.internal:5432/dfarm_tenant_gokul_001?sslmode=require';
    
    // Encrypt
    const encrypted = CredentialEncryption.encrypt(rawConnectionString);
    assert.notStrictEqual(encrypted, rawConnectionString);
    assert.strictEqual(encrypted.includes('TopSecretPass_9988'), false, 'Plaintext password must never appear in encrypted string');

    // Format: iv:authTag:ciphertext (base64)
    const parts = encrypted.split(':');
    assert.strictEqual(parts.length, 3, 'Encrypted format must be IV:AuthTag:Ciphertext');

    // Decrypt
    const decrypted = CredentialEncryption.decrypt(encrypted);
    assert.strictEqual(decrypted, rawConnectionString, 'Decrypted string must match original raw connection string');

    // Tamper detection: Altering auth tag must throw authentication error
    const tamperedParts = [...parts];
    tamperedParts[1] = Buffer.from(crypto.randomBytes(16)).toString('base64');
    const tamperedPayload = tamperedParts.join(':');
    assert.throws(
      () => CredentialEncryption.decrypt(tamperedPayload),
      Error,
      'Tampered ciphertext or auth tag must fail decryption'
    );
  });

  // --------------------------------------------------------------------------
  // TEST C: Tenant Database Provisioning State Machine & Naming Convention
  // --------------------------------------------------------------------------
  await t.test('Test C: Tenant Database Provisioning State Machine & Naming Convention', async () => {
    const dairyAId = 'a0000000-0000-0000-0000-000000000001';
    const dairyACode = 'GOKUL_KOLHAPUR';
    const dairyAName = 'Gokul Kolhapur Zilla Sahakari Dudh Utpadak Sangh';

    // Verify naming convention adheres to PostgreSQL identifier limits (< 63 chars)
    const dbName = tenantManager.generateTenantDatabaseName(dairyAId, dairyACode);
    assert.ok(dbName.startsWith('dfarm_tenant_gokul_kolhapur_'));
    assert.ok(dbName.length <= 63, `Database name ${dbName} must be <= 63 characters`);

    // Provision Tenant A
    const mappingA = await tenantManager.provisionTenantDatabase({
      dairyId: dairyAId,
      dairyCode: dairyACode,
      dairyName: dairyAName,
    });

    assert.strictEqual(mappingA.dairyId, dairyAId);
    assert.strictEqual(mappingA.provisioningStatus, 'ACTIVE');
    assert.strictEqual(mappingA.databaseName, dbName);

    // Verify Idempotency: Second call returns existing active mapping
    const reProvisioned = await tenantManager.provisionTenantDatabase({
      dairyId: dairyAId,
      dairyCode: dairyACode,
      dairyName: dairyAName,
    });
    assert.strictEqual(reProvisioned.id, mappingA.id);
    assert.strictEqual(reProvisioned.provisioningStatus, 'ACTIVE');
  });

  // --------------------------------------------------------------------------
  // TEST D: Physical / Logical Tenant Isolation (Tenant A vs Tenant B)
  // --------------------------------------------------------------------------
  await t.test('Test D: Strict Tenant Data Isolation (Tenant A vs Tenant B)', async () => {
    const dairyAId = 'a0000000-0000-0000-0000-000000000001';
    const dairyBId = 'b0000000-0000-0000-0000-000000000002';

    // Provision Tenant B
    await tenantManager.provisionTenantDatabase({
      dairyId: dairyBId,
      dairyCode: 'WARANA_DAIRY',
      dairyName: 'Shree Warana Sahakari Dudh Utpadak Prakriya Sangh',
    });

    const tenantADb = await tenantManager.getTenantDb(dairyAId);
    const tenantBDb = await tenantManager.getTenantDb(dairyBId);

    // Create a customer in Dairy A
    const customerA = new Customer({
      id: crypto.randomUUID(),
      organizationId: dairyAId,
      centerId: crypto.randomUUID(),
      farmerCode: 'C-701',
      fullName: 'Anand Gopalrao Patil',
      mobileNumber: '+919822119901',
      status: 'ACTIVE',
      registrationStatus: 'APPROVED',
      permittedCategories: ['COW'],
      village: 'Shiroli',
    });

    await customerRepo.save(customerA);

    // 1. Verify customer exists in Dairy A
    const foundInA = await customerRepo.findById(customerA.id, dairyAId);
    assert.ok(foundInA);
    assert.strictEqual(foundInA.fullName, 'Anand Gopalrao Patil');
    assert.strictEqual(foundInA.organizationId, dairyAId);

    // 2. Direct SQL Query on Dairy A DB: Must find record
    const directResA = await tenantADb.query('SELECT id, full_name FROM customers WHERE id = $1;', [customerA.id]);
    assert.strictEqual(directResA.rows.length, 1);
    assert.strictEqual(directResA.rows[0].full_name, 'Anand Gopalrao Patil');

    // 3. Direct SQL Query on Dairy B DB: MUST RETURN ZERO ROWS (Strict Isolation)
    const directResB = await tenantBDb.query('SELECT id, full_name FROM customers WHERE id = $1;', [customerA.id]);
    assert.strictEqual(directResB.rows.length, 0, 'Dairy B database must NOT contain any records from Dairy A');

    // 4. Searching for Customer A using Dairy B tenant context must return null
    const foundInB = await customerRepo.findById(customerA.id, dairyBId);
    assert.strictEqual(foundInB, null, 'Customer from Dairy A must not be accessible via Dairy B context');
  });

  // --------------------------------------------------------------------------
  // TEST E: Cross-Tenant Protection & IDOR Rejection Middleware
  // --------------------------------------------------------------------------
  await t.test('Test E: Cross-Tenant Protection & IDOR Rejection Middleware', async () => {
    const dairyAId = 'a0000000-0000-0000-0000-000000000001';
    const dairyBId = 'b0000000-0000-0000-0000-000000000002';
    const { HmacJwtTokenService } = await import('../dist/infrastructure/security/HmacJwtTokenService.js');
    const { db } = await import('../dist/infrastructure/database/PostgresPool.js');
    const tokenService = new HmacJwtTokenService();
    await db.query(
      `INSERT INTO organizations (id, name, code, status)
       VALUES ($1, 'Tenant A Isolation', 'ISO-A', 'ACTIVE')
       ON CONFLICT (id) DO NOTHING;`,
      [dairyAId]
    );
    await db.query(
      `INSERT INTO users (id, organization_id, username, full_name, phone_number, role, status)
       VALUES
         ('a0000000-0000-0000-0000-000000000099', $1, 'iso_admin_a', 'Iso Admin A', '+919800090099', 'DAIRY_ADMIN', 'ACTIVE'),
         ('a0000000-0000-0000-0000-000000000098', $1, 'iso_super_admin', 'Iso Super Admin', '+919800090098', 'SUPER_ADMIN', 'ACTIVE')
       ON CONFLICT (id) DO NOTHING;`,
      [dairyAId]
    );
    const adminAToken = tokenService.signToken({
      userId: 'a0000000-0000-0000-0000-000000000099',
      organizationId: dairyAId,
      role: 'DAIRY_ADMIN',
      actorType: 'STAFF',
    });
    const superAdminNoOrgToken = tokenService.signToken({
      userId: 'a0000000-0000-0000-0000-000000000098',
      role: 'SUPER_ADMIN',
      actorType: 'STAFF',
    });

    // 0. Unauthenticated request rejected with 401
    const unauthRes = await request(app).get('/api/v1/customers');
    assert.strictEqual(unauthRes.status, 401);

    // 1. Querying customer list with Dairy A context vs Dairy B in query (IDOR attack)
    const idorRes = await request(app)
      .get(`/api/v1/customers?organizationId=${dairyBId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .set('x-dairy-tenant-id', dairyAId);

    // Mismatched tenant headers/params must be rejected with 403 Forbidden
    assert.strictEqual(idorRes.status, 403);
    assert.strictEqual(idorRes.body.success, false);
    assert.ok(idorRes.body.error.includes('Cross-dairy query blocked'));

    // 2. Omitting tenant context for SUPER_ADMIN where tenant context is mandatory
    const noTenantRes = await request(app)
      .get('/api/v1/customers')
      .set('Authorization', `Bearer ${superAdminNoOrgToken}`);
    assert.strictEqual(noTenantRes.status, 400);
    assert.strictEqual(noTenantRes.body.success, false);
    assert.ok(noTenantRes.body.error.includes('Dairy context'));
  });

  // --------------------------------------------------------------------------
  // TEST F: Tenant Pool Eviction & Clean Lifecycle Management
  // --------------------------------------------------------------------------
  await t.test('Test F: Tenant Pool Eviction & Clean Lifecycle Management', async () => {
    const dairyAId = 'a0000000-0000-0000-0000-000000000001';

    // Verify tenant mapping is active and pool can be evicted cleanly
    const mapping = tenantManager.getTenantMapping(dairyAId);
    assert.ok(mapping);
    assert.strictEqual(mapping.provisioningStatus, 'ACTIVE');

    // Evict pool
    await assert.doesNotReject(async () => {
      await tenantManager.evictTenantPool(dairyAId);
    });

    // Re-accessing tenant DB re-initializes bounded connection safely
    const client = await tenantManager.getTenantDb(dairyAId);
    assert.ok(client);
    const testQuery = await client.query('SELECT 1 as alive;');
    assert.strictEqual(testQuery.rows[0].alive, 1);
  });
});
