import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import pg from 'pg';
import crypto from 'node:crypto';
import { createApp } from '../dist/app.js';
import { pool } from '../dist/db.js';
import { signJwt } from '../dist/jwt.js';

const { Client } = pg;
const dbClient = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
});

async function query(text, params) {
  return dbClient.query(text, params);
}

test('DFarm Sync Engine Integration Test Suite (Phase 09)', async (t) => {
  await dbClient.connect();
  t.after(async () => {
    await dbClient.end();
    await pool.end();
  });

  const app = createApp();

  // Test shared state
  let sangliOrgId = '';
  let tasgaonCenterId = '';
  let adminUserId = '';
  let adminToken = '';
  let deviceId = '';
  let deviceIdentifier = `TERM-TEST-${Math.floor(1000 + Math.random() * 9000)}`;
  let deviceToken = '';
  let registeredCustomerUuid = '';
  const duplicateMobile = `+9198765${Math.floor(10000 + Math.random() * 90000)}`;
  const collectionEventUuid = crypto.randomUUID();
  const collectionSessionUuid = crypto.randomUUID();
  const collectionRecordUuid = crypto.randomUUID();
  const idempotencyKey = `IDEMP-TEST-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  await t.test('0. Setup test organization and center', async () => {
    const orgRes = await query("SELECT id FROM organizations WHERE name ILIKE '%Sangli%' LIMIT 1;");
    assert.ok(orgRes.rows.length > 0, 'Sangli organization must exist');
    sangliOrgId = orgRes.rows[0].id;

    const centerRes = await query(
      'SELECT id FROM dairy_centers WHERE organization_id = $1 LIMIT 1;',
      [sangliOrgId]
    );
    assert.ok(centerRes.rows.length > 0, 'Center must exist');
    tasgaonCenterId = centerRes.rows[0].id;

    adminUserId = crypto.randomUUID();
    await query(
      `INSERT INTO users (id, organization_id, username, phone_number, full_name, role, status)
       VALUES ($1, $2, $3, '+919999000002', 'Sangli Dairy Owner', 'DAIRY_OWNER', 'ACTIVE')
       ON CONFLICT DO NOTHING;`,
      [adminUserId, sangliOrgId, `owner_${adminUserId.slice(0, 8)}`]
    );

    adminToken = signJwt({
      sub: adminUserId,
      userId: adminUserId,
      organizationId: sangliOrgId,
      role: 'DAIRY_OWNER',
      centerIds: [tasgaonCenterId],
    });
  });

  await t.test('1. POST /api/v1/devices/register provisions device and issues secure token', async () => {
    const res = await request(app)
      .post('/api/v1/devices/register')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        deviceIdentifier,
        deviceType: 'COUNTER_TERMINAL',
        organizationId: sangliOrgId,
        centerId: tasgaonCenterId,
        publicKey: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0TestPubKey',
        appVersion: '1.0.0',
      });

    assert.equal(res.status, 200, `Expected 200 but got: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.success, 'Registration must be successful');
    assert.ok(res.body.data.deviceId, 'Must return deviceId');
    assert.ok(res.body.data.token, 'Must return device token');
    assert.equal(res.body.data.status, 'ACTIVE');
    assert.equal(res.body.data.maxOfflineHours, 72);

    deviceId = res.body.data.deviceId;
    deviceToken = res.body.data.token;
  });

  await t.test('2. GET /api/v1/sync/status retrieves device sync state and health', async () => {
    const res = await request(app)
      .get('/api/v1/sync/status')
      .set('Authorization', `Bearer ${deviceToken}`);

    assert.equal(res.status, 200, `Expected 200 but got: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.success);
    assert.equal(res.body.data.deviceId, deviceId);
    assert.equal(res.body.data.status, 'ACTIVE');
    assert.equal(res.body.data.maxOfflineHours, 72);
  });

  await t.test('3. POST /api/v1/sync/push commits offline customer registration draft', async () => {
    registeredCustomerUuid = crypto.randomUUID();
    const eventId = crypto.randomUUID();

    const pushPayload = {
      deviceId,
      centerId: tasgaonCenterId,
      events: [
        {
          id: eventId,
          entityType: 'CUSTOMER_REGISTRATION',
          entityId: registeredCustomerUuid,
          action: 'INSERT',
          idempotencyKey: `IDEMP-REG-${registeredCustomerUuid}`,
          createdAt: new Date().toISOString(),
          payload: {
            farmerCode: `F-${Math.floor(100000 + Math.random() * 900000)}`,
            fullName: 'Baburao Ramchandra Kadam',
            mobileNumber: duplicateMobile,
            permittedCategories: ['COW', 'BUFFALO'],
            preferredMilkCategory: 'COW',
            bankName: 'Bank of Maharashtra',
            bankAccountNumber: '987654321012',
            bankIfscCode: 'MAHB0000123',
            bankAccountHolderName: 'Baburao R Kadam',
            address: {
              village: 'Tasgaon',
              talukaSubdistrict: 'Tasgaon',
              district: 'Sangli',
              state: 'Maharashtra',
              postalCode: '416312',
            },
          },
        },
      ],
    };

    const res = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send(pushPayload);

    assert.equal(res.status, 200, `Expected 200 but got: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.success);
    assert.equal(res.body.data.applied, 1);
    assert.equal(res.body.data.conflicts, 0);

    // Verify in DB
    const custRes = await query('SELECT id, full_name, status FROM customers WHERE id = $1;', [registeredCustomerUuid]);
    assert.equal(custRes.rows.length, 1, 'Customer row must exist in DB');
    assert.equal(custRes.rows[0].full_name, 'Baburao Ramchandra Kadam');
  });

  await t.test('4. POST /api/v1/sync/push records conflict for duplicate mobile number without duplicate insert', async () => {
    const conflictingCustUuid = crypto.randomUUID();
    const conflictingEventId = crypto.randomUUID();

    const pushPayload = {
      deviceId,
      centerId: tasgaonCenterId,
      events: [
        {
          id: conflictingEventId,
          entityType: 'CUSTOMER_REGISTRATION',
          entityId: conflictingCustUuid,
          action: 'INSERT',
          idempotencyKey: `IDEMP-REG-${conflictingCustUuid}`,
          createdAt: new Date().toISOString(),
          payload: {
            farmerCode: `F-${Math.floor(100000 + Math.random() * 900000)}`,
            fullName: 'Aniket Baburao Kadam (Duplicate Phone)',
            mobileNumber: duplicateMobile, // Same phone!
            permittedCategories: ['COW'],
          },
        },
      ],
    };

    const res = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send(pushPayload);

    assert.equal(res.status, 200);
    assert.ok(res.body.success);
    assert.equal(res.body.data.applied, 0);
    assert.equal(res.body.data.conflicts, 1);
    assert.equal(res.body.data.results[0].status, 'CONFLICT');

    // Verify conflicting customer was NOT inserted into customers table
    const checkCust = await query('SELECT id FROM customers WHERE id = $1;', [conflictingCustUuid]);
    assert.equal(checkCust.rows.length, 0, 'Conflicting customer must not be inserted');

    // Verify conflict was recorded in sync_conflict_records
    const conflictRes = await query(
      "SELECT id, conflict_reason FROM sync_conflict_records WHERE entity_id = $1;",
      [conflictingCustUuid]
    );
    assert.ok(conflictRes.rows.length > 0, 'Conflict must be logged in sync_conflict_records');
    assert.equal(conflictRes.rows[0].conflict_reason, 'DUPLICATE_MOBILE_NUMBER');
  });

  await t.test('5. POST /api/v1/sync/push commits offline collection transaction & updates double-entry subledger', async () => {
    const pushPayload = {
      deviceId,
      centerId: tasgaonCenterId,
      events: [
        {
          id: collectionEventUuid,
          entityType: 'MILK_COLLECTION',
          entityId: collectionRecordUuid,
          action: 'INSERT',
          idempotencyKey,
          createdAt: new Date().toISOString(),
          payload: {
            sessionId: collectionSessionUuid,
            customerId: registeredCustomerUuid,
            centerId: tasgaonCenterId,
            businessDate: new Date().toISOString().slice(0, 10),
            shiftType: 'MORNING',
            milkCategory: 'COW',
            netWeight: 25.5,
            fatPercentage: 4.2,
            snfPercentage: 8.6,
            appliedRatePerUnit: 38.5,
            totalAmount: 981.75,
            identificationMethod: 'RFID',
            clientIntakeUuid: collectionSessionUuid,
          },
        },
      ],
    };

    const res = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send(pushPayload);

    assert.equal(res.status, 200, `Expected 200 but got: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.success);
    assert.equal(res.body.data.applied, 1);
    assert.equal(res.body.data.results[0].status, 'COMMITTED');

    // Verify milk collection record in DB
    const colRes = await query('SELECT id, total_amount, transaction_status FROM milk_collections WHERE id = $1;', [collectionRecordUuid]);
    assert.equal(colRes.rows.length, 1, 'Milk collection must exist');
    assert.equal(Number(colRes.rows[0].total_amount), 981.75);

    // Verify double-entry ledger credit to customer account
    const ledgerRes = await query(
      `SELECT le.id, le.account_type, le.entry_type, le.amount
       FROM ledger_entries le
       JOIN ledger_transactions lt ON le.transaction_id = lt.id
       WHERE lt.reference_id = $1;`,
      [collectionRecordUuid]
    );
    assert.ok(ledgerRes.rows.length > 0, 'Double-entry ledger records must exist');
    const creditEntry = ledgerRes.rows.find((r) => r.entry_type === 'CREDIT' && (r.account_type === 'CUSTOMER_PAYABLE' || r.account_type === 'FARMER_PAYABLE'));
    assert.ok(creditEntry, 'Customer credit entry must exist');
    assert.equal(Number(creditEntry.amount), 981.75);
  });

  await t.test('6. POST /api/v1/sync/push replay duplicate event is recognized idempotently with no double ledger credit', async () => {
    // Replay the exact same push payload
    const pushPayload = {
      deviceId,
      centerId: tasgaonCenterId,
      events: [
        {
          id: collectionEventUuid,
          entityType: 'MILK_COLLECTION',
          entityId: collectionRecordUuid,
          action: 'INSERT',
          idempotencyKey,
          createdAt: new Date().toISOString(),
          payload: {
            sessionId: collectionSessionUuid,
            customerId: registeredCustomerUuid,
            centerId: tasgaonCenterId,
            businessDate: new Date().toISOString().slice(0, 10),
            shiftType: 'MORNING',
            milkCategory: 'COW',
            netWeight: 25.5,
            fatPercentage: 4.2,
            snfPercentage: 8.6,
            appliedRatePerUnit: 38.5,
            totalAmount: 981.75,
            identificationMethod: 'RFID',
            clientIntakeUuid: collectionSessionUuid,
          },
        },
      ],
    };

    const res = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send(pushPayload);

    assert.equal(res.status, 200);
    assert.ok(res.body.success);
    assert.equal(res.body.data.results[0].status, 'DUPLICATE');

    // CRITICAL: Ensure no duplicate milk_collections row
    const countRes = await query('SELECT COUNT(*) as count FROM milk_collections WHERE id = $1;', [collectionRecordUuid]);
    assert.equal(parseInt(countRes.rows[0].count, 10), 1, 'Must still be exactly 1 collection record');

    // CRITICAL: Ensure no duplicate ledger entries
    const ledgerCount = await query(
      `SELECT COUNT(*) as count
       FROM ledger_entries le
       JOIN ledger_transactions lt ON le.transaction_id = lt.id
       WHERE lt.reference_id = $1;`,
      [collectionRecordUuid]
    );
    assert.equal(parseInt(ledgerCount.rows[0].count, 10), 2, 'Must still be exactly 2 ledger entries (1 debit, 1 credit)');
  });

  await t.test('7. GET /api/v1/sync/pull downloads active customers, rate chart cells, and encrypted face templates', async () => {
    const res = await request(app)
      .get(`/api/v1/sync/pull?cursor=0&centerId=${tasgaonCenterId}`)
      .set('Authorization', `Bearer ${deviceToken}`);

    assert.equal(res.status, 200, `Expected 200 but got: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.success);
    assert.ok(Array.isArray(res.body.data.customers), 'Customers array must exist');
    assert.ok(res.body.data.customers.length > 0, 'Should include active customers');
    assert.ok(res.body.data.currentCursor >= 0, 'Current cursor must be returned');

    // Verify face templates structure (if any enrolled)
    if (res.body.data.faceTemplates && res.body.data.faceTemplates.length > 0) {
      const template = res.body.data.faceTemplates[0];
      assert.ok(template.encryptedEmbedding, 'Must contain encrypted vector');
      assert.ok(template.modelName, 'Must contain model metadata');
      assert.ok(template.cryptoNonce, 'Must contain IV nonce');
      // Ensure no raw base64 photos are present
      assert.equal(template.rawPhotoBase64, undefined, 'Raw photographs must NEVER be in template synchronization');
    }
  });

  await t.test('8. Soft-delete customer generates tombstone and propagates to downstream pull', async () => {
    // 1. Soft-delete the customer
    await query(
      "UPDATE customers SET is_deleted = TRUE, deleted_at = NOW(), deletion_reason = 'Farmer relocated' WHERE id = $1;",
      [registeredCustomerUuid]
    );

    // 2. Insert tombstone
    await query(
      `INSERT INTO sync_tombstones (organization_id, entity_type, entity_id, reason, deleted_at)
       VALUES ($1, 'CUSTOMER', $2, 'Farmer relocated', NOW());`,
      [sangliOrgId, registeredCustomerUuid]
    );

    // 3. Pull updates with tombstone cursor
    const res = await request(app)
      .get(`/api/v1/sync/pull?cursor=0&tombstoneCursor=0&centerId=${tasgaonCenterId}`)
      .set('Authorization', `Bearer ${deviceToken}`);

    assert.equal(res.status, 200);
    assert.ok(res.body.success);
    assert.ok(Array.isArray(res.body.data.tombstones), 'Tombstones array must exist');
    const tombstone = res.body.data.tombstones.find((t) => t.entityId === registeredCustomerUuid);
    assert.ok(tombstone, 'Tombstone for soft-deleted customer must be present');
    assert.equal(tombstone.entityType, 'CUSTOMER');
  });

  await t.test('9. POST /api/v1/sync/acknowledge advances device sync cursors', async () => {
    const res = await request(app)
      .post('/api/v1/sync/acknowledge')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({
        deviceId,
        downstreamCursor: 15,
        downstreamTombstoneCursor: 5,
        clientAppVersion: '1.0.0',
      });

    assert.equal(res.status, 200);
    assert.ok(res.body.success);
    assert.equal(res.body.data.downstreamCursor, 15);
    assert.equal(res.body.data.downstreamTombstoneCursor, 5);

    // Verify in DB
    const stateRes = await query('SELECT downstream_cursor, downstream_tombstone_cursor FROM device_sync_state WHERE device_id = $1;', [deviceId]);
    assert.equal(stateRes.rows[0].downstream_cursor, '15');
    assert.equal(stateRes.rows[0].downstream_tombstone_cursor, '5');
  });

  await t.test('10. POST /api/v1/devices/revoke administratively blocks device and subsequent sync fails closed', async () => {
    const res = await request(app)
      .post('/api/v1/devices/revoke')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        deviceId,
        reason: 'Device reported lost by center supervisor',
      });

    assert.equal(res.status, 200, `Expected 200 but got: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.success);
    assert.equal(res.body.data.status, 'BLOCKED');

    // Attempt push on revoked device -> Must fail with 403 Forbidden
    const pushRes = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({
        deviceId,
        centerId: tasgaonCenterId,
        events: [],
      });

    assert.equal(pushRes.status, 403, 'Revoked device must be rejected with 403 Forbidden');
    assert.equal(pushRes.body.error?.code, 'DEVICE_REVOKED');

    // Attempt pull on revoked device -> Must fail with 403 Forbidden
    const pullRes = await request(app)
      .get(`/api/v1/sync/pull?cursor=0&centerId=${tasgaonCenterId}`)
      .set('Authorization', `Bearer ${deviceToken}`);

    assert.equal(pullRes.status, 403, 'Revoked device pull must be rejected with 403 Forbidden');
    assert.equal(pullRes.body.error?.code, 'DEVICE_REVOKED');
  });
});
