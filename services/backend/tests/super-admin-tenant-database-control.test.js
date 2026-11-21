import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../dist/app.js';
import {
  TenantDatabaseManager,
  HmacJwtTokenService,
} from '../dist/infrastructure/index.js';

test('DFarm Super Admin Tenant Database Control Test Suite', async (t) => {
  const tenantManager = TenantDatabaseManager.getInstance();
  const tokenService = new HmacJwtTokenService();
  const app = createApp();

  const superAdminToken = tokenService.signToken({
    userId: '00000000-0000-0000-0000-000000000099',
    role: 'SUPER_ADMIN',
    actorType: 'STAFF',
    fullName: 'Platform Super Administrator',
  });

  const testDairyId = 'd0000000-0000-0000-0000-000000000001';
  const testDairyCode = 'BARAMATI_COOP';
  const testDairyName = 'Baramati Cooperative Milk Producers Union';

  // Provision the test dairy database first
  await tenantManager.provisionTenantDatabase(testDairyId, testDairyCode, testDairyName);

  // --------------------------------------------------------------------------
  // TEST 1: Database Overview Endpoint
  // --------------------------------------------------------------------------
  await t.test('Test 1: GET /api/v1/super-admin/tenants/:dairyId/database/overview returns actual tenant metadata', async () => {
    const res = await request(app)
      .get(`/api/v1/super-admin/tenants/${testDairyId}/database/overview`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .expect(200);

    assert.strictEqual(res.body.success, true);
    const data = res.body.data;
    assert.strictEqual(data.dairyId, testDairyId);
    assert.strictEqual(data.dairyCode, testDairyCode);
    assert.strictEqual(data.connectionHealth, 'HEALTHY');
    assert.ok(data.totalTables > 0, 'Table count must be greater than 0');
    assert.ok(data.databaseName.startsWith('dfarm_tenant_'), 'DB name must follow canonical prefix');
    assert.ok(['ACTIVE', 'READY'].includes(data.provisioningStatus));
  });

  // --------------------------------------------------------------------------
  // TEST 2: Dynamic Tables Discovery and Data Classification
  // --------------------------------------------------------------------------
  await t.test('Test 2: GET /api/v1/super-admin/tenants/:dairyId/database/tables lists tables with proper classification', async () => {
    const res = await request(app)
      .get(`/api/v1/super-admin/tenants/${testDairyId}/database/tables`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .expect(200);

    assert.strictEqual(res.body.success, true);
    const tables = res.body.data;
    assert.ok(Array.isArray(tables));
    assert.ok(tables.length >= 10, 'Expected at least 10 core tables in tenant database');

    const customerTable = tables.find((t) => t.tableName === 'customers');
    assert.ok(customerTable, 'customers table must exist');
    assert.strictEqual(customerTable.category, 'CATEGORY_B_LIFECYCLE');
    assert.strictEqual(customerTable.accessMode, 'LIFECYCLE_ACTION_ONLY');

    const financialTable = tables.find((t) => t.tableName === 'monthly_bills' || t.tableName === 'customer_ledger_accounts');
    assert.ok(financialTable, 'financial table must exist');
    assert.strictEqual(financialTable.category, 'CATEGORY_C_FINANCIAL');
    assert.strictEqual(financialTable.accessMode, 'IMMUTABLE_FINANCIAL');

    const ledgerTable = tables.find((t) => t.tableName === 'ledger_transactions');
    if (ledgerTable) {
      assert.strictEqual(ledgerTable.category, 'CATEGORY_C_FINANCIAL');
      assert.strictEqual(ledgerTable.accessMode, 'IMMUTABLE_FINANCIAL');
    }
  });

  // --------------------------------------------------------------------------
  // TEST 3: Table Schema Inspection
  // --------------------------------------------------------------------------
  await t.test('Test 3: GET /api/v1/super-admin/tenants/:dairyId/database/tables/:tableName/schema returns column definitions', async () => {
    const res = await request(app)
      .get(`/api/v1/super-admin/tenants/${testDairyId}/database/tables/customers/schema`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .expect(200);

    assert.strictEqual(res.body.success, true);
    const schema = res.body.data;
    assert.strictEqual(schema.tableName, 'customers');
    assert.ok(Array.isArray(schema.columns));
    assert.ok(schema.columns.length > 5);

    const idCol = schema.columns.find((c) => c.columnName === 'id');
    assert.ok(idCol);
    assert.strictEqual(idCol.isPrimaryKey, true);

    const phoneCol = schema.columns.find((c) => c.columnName === 'normalized_mobile_number' || c.columnName === 'phone');
    assert.ok(phoneCol);
  });

  // --------------------------------------------------------------------------
  // TEST 4: Controlled Record Insertion & Update (Category A Operational)
  // --------------------------------------------------------------------------
  let testCenterId = '';
  await t.test('Test 4: Controlled insert and update on operational table', async () => {
    const uniqueCenterCode = `C${Math.floor(1000 + Math.random() * 9000)}`;
    const newCenter = {
      organization_id: testDairyId,
      code: uniqueCenterCode,
      name: 'Super Admin Test Collection Branch',
      address_line1: 'Station Road Near Market Yard',
      village_town: 'Baramati',
      district: 'Pune',
      state: 'Maharashtra',
      postal_code: '413102',
      contact_phone: '+919822099999',
      status: 'ACTIVE',
    };

    // Insert record
    const insertRes = await request(app)
      .post(`/api/v1/super-admin/tenants/${testDairyId}/database/tables/dairy_centers/records`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        data: newCenter,
        reason: 'Integration test insertion for Super Admin control',
      })
      .expect(201);

    assert.strictEqual(insertRes.body.success, true);
    testCenterId = insertRes.body.data.id;
    assert.ok(testCenterId, 'Inserted record must have an ID');

    // Fetch records list and verify presence
    const listRes = await request(app)
      .get(`/api/v1/super-admin/tenants/${testDairyId}/database/tables/dairy_centers/records?search=${uniqueCenterCode}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .expect(200);

    assert.strictEqual(listRes.body.success, true);
    assert.ok(listRes.body.records.length > 0);
    const found = listRes.body.records.find((r) => r.id === testCenterId);
    assert.ok(found);
    assert.strictEqual(found.code, uniqueCenterCode);

    // Update record
    const updateRes = await request(app)
      .put(`/api/v1/super-admin/tenants/${testDairyId}/database/tables/dairy_centers/records/${testCenterId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        updates: { name: 'Super Admin Updated Collection Branch' },
        reason: 'Integration test controlled update',
      })
      .expect(200);

    assert.strictEqual(updateRes.body.success, true);
    assert.strictEqual(updateRes.body.data.name, 'Super Admin Updated Collection Branch');
  });

  // --------------------------------------------------------------------------
  // TEST 5: Financial Immutability (Category C Rejection)
  // --------------------------------------------------------------------------
  await t.test('Test 5: Direct UPDATE and DELETE on Category C (Immutable Financial) are strictly rejected', async () => {
    // Attempt to update farmer_bills
    const fakeBillId = crypto.randomUUID();
    const updateRes = await request(app)
      .put(`/api/v1/super-admin/tenants/${testDairyId}/database/tables/farmer_bills/records/${fakeBillId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        updates: { gross_amount: 999999 },
        reason: 'Illegal direct financial modification attempt',
      })
      .expect(400);

    assert.strictEqual(updateRes.body.success, false);
    assert.ok(
      updateRes.body.error.includes('immutable financial') ||
        updateRes.body.error.includes('prohibited'),
      'Must explain that Category C is immutable'
    );

    // Attempt to delete farmer_bills
    const deleteRes = await request(app)
      .delete(`/api/v1/super-admin/tenants/${testDairyId}/database/tables/farmer_bills/records/${fakeBillId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        reason: 'Illegal financial deletion attempt',
      })
      .expect(400);

    assert.strictEqual(deleteRes.body.success, false);
    assert.ok(
      deleteRes.body.error.includes('immutable financial') ||
        deleteRes.body.error.includes('prohibited'),
      'Must explain that financial deletion is prohibited'
    );
  });

  // --------------------------------------------------------------------------
  // TEST 6: Actions - Connection Verification, Schema Validation, Migration History
  // --------------------------------------------------------------------------
  await t.test('Test 6: Database management actions work as expected', async () => {
    // Verify connection
    const verifyRes = await request(app)
      .post(`/api/v1/super-admin/tenants/${testDairyId}/database/actions/verify-connection`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .expect(200);

    assert.strictEqual(verifyRes.body.success, true);
    assert.strictEqual(verifyRes.body.data.health, 'HEALTHY');

    // Validate schema
    const schemaRes = await request(app)
      .post(`/api/v1/super-admin/tenants/${testDairyId}/database/actions/validate-schema`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .expect(200);

    assert.strictEqual(schemaRes.body.success, true);
    assert.ok(schemaRes.body.data.discoveredTablesCount > 0);
    assert.ok(typeof schemaRes.body.data.isValid === 'boolean');

    // Migration history
    const migRes = await request(app)
      .get(`/api/v1/super-admin/tenants/${testDairyId}/database/migrations`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .expect(200);

    assert.strictEqual(migRes.body.success, true);
    assert.ok(migRes.body.data.totalManifest > 0);
  });

  // --------------------------------------------------------------------------
  // TEST 7: Customer App Discovery Eligibility Gating
  // --------------------------------------------------------------------------
  await t.test('Test 7: Nearby Dairies API gates registration eligibility based on real tenant DB health', async () => {
    const nearbyRes = await request(app)
      .get('/api/v1/dairies/nearby?lat=16.6644&lng=74.2588&radiusKm=100')
      .expect(200);

    assert.strictEqual(nearbyRes.body.success, true);
    const dairies = nearbyRes.body.data;
    assert.ok(Array.isArray(dairies));

    // For any returned dairy, check that eligibility fields exist and are accurate
    for (const d of dairies) {
      assert.ok('provisioningStatus' in d, 'Must expose provisioningStatus');
      assert.ok('isRegistrationEligible' in d, 'Must expose isRegistrationEligible');
      if (d.provisioningStatus === 'READY' && (d.databaseHealth === 'HEALTHY' || d.databaseHealth === 'AVAILABLE') && d.status === 'ACTIVE') {
        assert.strictEqual(d.isRegistrationEligible, true);
      } else {
        assert.strictEqual(d.isRegistrationEligible, false);
        assert.ok(typeof d.registrationBlockReason === 'string');
      }
    }
  });
});
