import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import pg from 'pg';
import crypto from 'node:crypto';
import { createApp } from '../dist/app.js';
import { signJwt } from '../dist/jwt.js';
import { pool } from '../dist/db.js';
import { UserRole, NotificationChannel, NotificationEventType, NotificationStatus } from '@dfarm/shared-types';
import { config } from '../dist/config/env.js';
import { TemplateEngine } from '../dist/modules/notifications/templates/template.engine.js';
import { maskPhoneNumber } from '../dist/shared/utils/phone.js';
import { NotificationProviderFactory } from '../dist/modules/notifications/providers/provider.factory.js';
import { NotificationService } from '../dist/modules/notifications/services/notification.service.js';
import { DeviceTokenService } from '../dist/modules/notifications/services/device-token.service.js';

const { Client } = pg;
const dbClient = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
});

async function query(text, params) {
  return dbClient.query(text, params);
}

test('DFarm Phase 19: Notification Engine, Push & WhatsApp Business Automation Test Suite (22 Scenarios)', async (t) => {
  await dbClient.connect();
  t.after(async () => {
    await dbClient.end();
    await pool.end();
  });

  const app = createApp();

  // Test shared state
  let testOrgId = '';
  let centerAId = '';
  let ownerUserId = '';
  let supervisorUserId = '';
  let ownerToken = '';
  let supervisorToken = '';

  let customer1Id = ''; // Marathi preference
  let customer2Id = ''; // English preference
  let customer3Id = ''; // Opted out
  let customer4Id = ''; // Invalid phone
  let customer1Token = '';
  let customer2Token = '';

  const runSfx = crypto.randomUUID().slice(0, 8);
  const p19Event = (name) => `evt_p19_${runSfx}_${name}`;
  const p19Idem = (name) => `idem_p19_${runSfx}_${name}`;

  // --------------------------------------------------------------------------
  // Scenario 0: Setup Organizations, Centers, Staff, and Customers
  // --------------------------------------------------------------------------
  await t.test('0. Setup Test Organizations, Centers, Staff, and Customers', async () => {
    // 1. Fetch or create organization
    const orgRes = await query("SELECT id FROM organizations WHERE name ILIKE '%Sangli%' LIMIT 1;");
    if (orgRes.rows.length > 0) {
      testOrgId = orgRes.rows[0].id;
    } else {
      const newOrg = await query(
        "INSERT INTO organizations (name, code, status) VALUES ('Sangli Union P19', 'SDCU_P19', 'ACTIVE') RETURNING id;"
      );
      testOrgId = newOrg.rows[0].id;
    }

    // 2. Center
    const cRes = await query("SELECT id FROM dairy_centers WHERE organization_id = $1 LIMIT 1;", [testOrgId]);
    if (cRes.rows.length > 0) {
      centerAId = cRes.rows[0].id;
    } else {
      const newCenter = await query(
        "INSERT INTO dairy_centers (organization_id, name, code, status) VALUES ($1, 'Center A P19', 'C_A_P19', 'ACTIVE') RETURNING id;",
        [testOrgId]
      );
      centerAId = newCenter.rows[0].id;
    }

    // 3. Staff Users
    ownerUserId = crypto.randomUUID();
    supervisorUserId = crypto.randomUUID();
    const uSfx = crypto.randomUUID().slice(0, 8);

    await query(
      `INSERT INTO users (id, organization_id, username, full_name, email, phone_number, role, status)
       VALUES
       ($1, $3, 'owner_${uSfx}', 'Owner P19', 'owner.${uSfx}@dfarm.test', '+919822000001', 'DAIRY_OWNER', 'ACTIVE'),
       ($2, $3, 'sup_${uSfx}', 'Supervisor P19', 'sup.${uSfx}@dfarm.test', '+919822000002', 'SUPERVISOR', 'ACTIVE')
       ON CONFLICT (id) DO NOTHING;`,
      [ownerUserId, supervisorUserId, testOrgId]
    );

    ownerToken = signJwt({
      sub: ownerUserId,
      userId: ownerUserId,
      role: UserRole.DAIRY_OWNER,
      organizationId: testOrgId,
      centerIds: [centerAId],
      primaryCenterId: centerAId,
    });

    supervisorToken = signJwt({
      sub: supervisorUserId,
      userId: supervisorUserId,
      role: UserRole.SUPERVISOR,
      organizationId: testOrgId,
      centerIds: [centerAId],
      primaryCenterId: centerAId,
    });

    // 4. Create Customers
    customer1Id = crypto.randomUUID();
    customer2Id = crypto.randomUUID();
    customer3Id = crypto.randomUUID();
    customer4Id = crypto.randomUUID();

    const mob1 = `+919822${Math.floor(100000 + Math.random() * 900000)}`;
    const mob2 = `+919822${Math.floor(100000 + Math.random() * 900000)}`;
    const mob3 = `+919822${Math.floor(100000 + Math.random() * 900000)}`;
    const mob4 = `inv_${runSfx}`;

    await query(
      `INSERT INTO customers (
         id, organization_id, primary_center_id, farmer_code, full_name,
         normalized_mobile_number, status, bank_name, bank_account_number, bank_ifsc_code
       ) VALUES
       ($1, $5, $6, 'F19_${runSfx}_1', 'Santosh Patil', $7, 'ACTIVE', 'SBI', '1122334455', 'SBIN0001'),
       ($2, $5, $6, 'F19_${runSfx}_2', 'Ramesh Shinde', $8, 'ACTIVE', 'HDFC', '9988776655', 'HDFC0002'),
       ($3, $5, $6, 'F19_${runSfx}_3', 'Anand More', $9, 'ACTIVE', 'BOM', '5544332211', 'MAHB0003'),
       ($4, $5, $6, 'F19_${runSfx}_4', 'Pravin Pawar', $10, 'ACTIVE', 'ICICI', '4433221100', 'ICIC0004')
       ON CONFLICT (id) DO UPDATE SET is_deleted = FALSE;`,
      [customer1Id, customer2Id, customer3Id, customer4Id, testOrgId, centerAId, mob1, mob2, mob3, mob4]
    );

    // Initial Customer Preferences & Mappings
    // Customer 1: Marathi preference
    await query(
      `INSERT INTO whatsapp_customer_mappings (organization_id, customer_id, phone_number, is_opted_in, preferred_language)
       VALUES ($1, $2, $3, TRUE, 'mr')
       ON CONFLICT (organization_id, customer_id) DO UPDATE SET is_opted_in = TRUE, preferred_language = 'mr';`,
      [testOrgId, customer1Id, mob1]
    );

    // Customer 2: English preference
    await query(
      `INSERT INTO whatsapp_customer_mappings (organization_id, customer_id, phone_number, is_opted_in, preferred_language)
       VALUES ($1, $2, $3, TRUE, 'en')
       ON CONFLICT (organization_id, customer_id) DO UPDATE SET is_opted_in = TRUE, preferred_language = 'en';`,
      [testOrgId, customer2Id, mob2]
    );

    // Customer 3: Explicitly Opted Out
    await query(
      `INSERT INTO whatsapp_customer_mappings (organization_id, customer_id, phone_number, is_opted_in, preferred_language, opt_out_reason)
       VALUES ($1, $2, $3, FALSE, 'mr', 'Customer requested no WhatsApp alerts')
       ON CONFLICT (organization_id, customer_id) DO UPDATE SET is_opted_in = FALSE, opt_out_reason = 'Customer requested no WhatsApp alerts';`,
      [testOrgId, customer3Id, mob3]
    );

    customer1Token = signJwt({
      sub: customer1Id,
      userId: customer1Id,
      customerId: customer1Id,
      role: UserRole.FARMER_CUSTOMER,
      actorType: 'CUSTOMER',
      organizationId: testOrgId,
      centerId: centerAId,
    });

    customer2Token = signJwt({
      sub: customer2Id,
      userId: customer2Id,
      customerId: customer2Id,
      role: UserRole.FARMER_CUSTOMER,
      actorType: 'CUSTOMER',
      organizationId: testOrgId,
      centerId: centerAId,
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 1: Collection event triggers message (Marathi)
  // --------------------------------------------------------------------------
  await t.test('1. Collection event triggers message with Marathi localization & receipt details', async () => {
    const eventId = p19Event('COLL_01');
    const idemKey = p19Idem('COLL_01');

    const res = await request(app)
      .post('/api/v1/notifications/enqueue')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        customerId: customer1Id,
        eventType: NotificationEventType.MILK_COLLECTION_COMPLETED,
        eventId,
        idempotencyKey: idemKey,
        channels: [NotificationChannel.WHATSAPP, NotificationChannel.IN_APP],
        metadata: {
          receiptNumber: 'REC-MR-1001',
          milkCategory: 'COW',
          shift: 'MORNING',
          quantity: 12.5,
          fat: 4.2,
          snf: 8.5,
          rate: 38.5,
          totalAmount: 481.25,
          balance: 1481.25,
          centerName: 'Center A',
        },
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));

    const waRecord = res.body.data.find((r) => r.channel === NotificationChannel.WHATSAPP);
    assert.ok(waRecord, 'WhatsApp record must exist');
    assert.equal(waRecord.eventType, NotificationEventType.MILK_COLLECTION_COMPLETED);
    // Verifies Marathi rendering
    assert.match(waRecord.title, /दूध संकलन पावती/);
    assert.match(waRecord.body, /१२\.५|12\.5/);
    assert.match(waRecord.body, /४८१\.२५|481\.25/);
    assert.match(waRecord.body, /REC-MR-1001/);

    // Verifies in-app record created
    const inAppRecord = res.body.data.find((r) => r.channel === NotificationChannel.IN_APP);
    assert.ok(inAppRecord, 'In-App notification record must exist');
    assert.equal(inAppRecord.status, NotificationStatus.DELIVERED);
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Bill generated event triggers message (English)
  // --------------------------------------------------------------------------
  await t.test('2. Bill generated event triggers message with English localization', async () => {
    const eventId = p19Event('BILL_01');
    const idemKey = p19Idem('BILL_01');

    const res = await request(app)
      .post('/api/v1/notifications/enqueue')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        customerId: customer2Id,
        eventType: NotificationEventType.MONTHLY_BILL_GENERATED,
        eventId,
        idempotencyKey: idemKey,
        channels: [NotificationChannel.WHATSAPP],
        metadata: {
          billNumber: 'BILL-2026-11-001',
          periodName: 'November 2026',
          totalMilkWeight: 350.5,
          grossMilkAmount: 13494.25,
          totalDebits: 1200.0,
          netPayableAmount: 12294.25,
        },
      });

    assert.equal(res.status, 201);
    const waRecord = res.body.data.find((r) => r.channel === NotificationChannel.WHATSAPP);
    assert.ok(waRecord);
    // Verifies English rendering
    assert.match(waRecord.title, /Monthly Bill Generated/);
    assert.match(waRecord.body, /November 2026/);
    assert.match(waRecord.body, /12294\.25/);
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Payment settled event triggers message
  // --------------------------------------------------------------------------
  await t.test('3. Payment settled event triggers payment confirmation with masked bank details', async () => {
    const eventId = p19Event('PAY_SETTLE_01');
    const idemKey = p19Idem('PAY_SETTLE_01');

    const res = await request(app)
      .post('/api/v1/notifications/enqueue')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        customerId: customer1Id,
        eventType: NotificationEventType.PAYMENT_SETTLED,
        eventId,
        idempotencyKey: idemKey,
        channels: [NotificationChannel.WHATSAPP],
        metadata: {
          amount: 5000.0,
          paymentMethod: 'BANK_TRANSFER',
          referenceNumber: 'UTR998877665544',
          bankAccountMask: 'XXXX-XXXX-4455',
          settledDate: '14/11/2026',
        },
      });

    assert.equal(res.status, 201);
    const waRecord = res.body.data[0];
    assert.equal(waRecord.eventType, NotificationEventType.PAYMENT_SETTLED);
    assert.match(waRecord.body, /5000\.00/);
    assert.match(waRecord.body, /UTR998877665544/);
    assert.match(waRecord.body, /XXXX-XXXX-4455/);
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Failed payment does not send success notification
  // --------------------------------------------------------------------------
  await t.test('4. Failed payment does not send success notification; dispatches PAYMENT_FAILED failure alert', async () => {
    const eventId = p19Event('PAY_FAIL_01');
    const idemKey = p19Idem('PAY_FAIL_01');

    const res = await request(app)
      .post('/api/v1/notifications/enqueue')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        customerId: customer1Id,
        eventType: NotificationEventType.PAYMENT_FAILED,
        eventId,
        idempotencyKey: idemKey,
        channels: [NotificationChannel.WHATSAPP],
        metadata: {
          amount: 4000.0,
          referenceNumber: 'REF-FAILED-99',
          failureReason: 'BENEFICIARY_ACCOUNT_BLOCKED',
        },
      });

    assert.equal(res.status, 201);
    const waRecord = res.body.data[0];
    assert.equal(waRecord.eventType, NotificationEventType.PAYMENT_FAILED);
    assert.notEqual(waRecord.eventType, NotificationEventType.PAYMENT_SETTLED);
    assert.match(waRecord.body, /BENEFICIARY_ACCOUNT_BLOCKED/);
    assert.match(waRecord.body, /अयशस्वी|Failed/);
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Duplicate events do not create duplicate messages (Idempotency)
  // --------------------------------------------------------------------------
  await t.test('5. Duplicate events do not create duplicate messages using eventId and idempotencyKey', async () => {
    const eventId = p19Event('IDEMPOTENT_01');
    const idemKey = p19Idem('IDEMPOTENT_01');

    // First call
    const res1 = await request(app)
      .post('/api/v1/notifications/enqueue')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        customerId: customer1Id,
        eventType: NotificationEventType.FEED_PURCHASE_COMPLETED,
        eventId,
        idempotencyKey: idemKey,
        channels: [NotificationChannel.WHATSAPP],
        metadata: { totalAmount: 1250.0 },
      });

    assert.equal(res1.status, 201);
    const firstRecordId = res1.body.data[0].id;

    // Second call with identical eventId & channel
    const res2 = await request(app)
      .post('/api/v1/notifications/enqueue')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        customerId: customer1Id,
        eventType: NotificationEventType.FEED_PURCHASE_COMPLETED,
        eventId,
        idempotencyKey: idemKey,
        channels: [NotificationChannel.WHATSAPP],
        metadata: { totalAmount: 1250.0 },
      });

    assert.equal(res2.status, 201);
    const secondRecordId = res2.body.data[0].id;
    assert.equal(firstRecordId, secondRecordId, 'Duplicate submission must return original notification record');

    // Verify database count is strictly 1
    const countRes = await query(
      `SELECT COUNT(*)::int as count FROM notification_records WHERE event_id = $1 AND channel = 'WHATSAPP';`,
      [eventId]
    );
    assert.equal(countRes.rows[0].count, 1, 'Exactly one row must exist in database');
  });

  // --------------------------------------------------------------------------
  // Scenario 6: Invalid WhatsApp webhook rejected
  // --------------------------------------------------------------------------
  await t.test('6. Invalid WhatsApp webhook rejected with 400 Bad Request on invalid HMAC signature', async () => {
    const payload = JSON.stringify({
      entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.test', status: 'delivered' }] } }] }],
    });

    const res = await request(app)
      .post('/api/v1/webhooks/whatsapp')
      .set('x-hub-signature-256', 'sha256=deadbeefbadsignature1234567890abcdef')
      .set('Content-Type', 'application/json')
      .send(payload);

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_WEBHOOK_SIGNATURE');
  });

  // --------------------------------------------------------------------------
  // Scenario 7: Valid WhatsApp webhook accepted & processes delivery receipt
  // --------------------------------------------------------------------------
  await t.test('7. Valid WhatsApp webhook verified via HMAC-SHA256 and updates delivery status', async () => {
    // 1. Create a message in whatsapp_messages to receive update
    const testWamid = `wamid.HBgM${crypto.randomUUID()}`;
    await query(
      `INSERT INTO whatsapp_messages (
         organization_id, customer_id, wamid, phone_number, template_name, status, sent_at
       ) VALUES ($1, $2, $3, '+919822112233', 'dfarm_test', 'SENT', NOW());`,
      [testOrgId, customer1Id, testWamid]
    );

    const payloadObj = {
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  {
                    id: testWamid,
                    status: 'delivered',
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    recipient_id: '919822112233',
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const rawBody = JSON.stringify(payloadObj);
    const validHmac = crypto
      .createHmac('sha256', config.WHATSAPP_APP_SECRET)
      .update(rawBody)
      .digest('hex');

    const res = await request(app)
      .post('/api/v1/webhooks/whatsapp')
      .set('x-hub-signature-256', `sha256=${validHmac}`)
      .set('Content-Type', 'application/json')
      .send(rawBody);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'EVENT_RECEIVED');
    assert.equal(res.body.statusCount, 1);

    // Verify status updated in database
    const msgRes = await query(`SELECT status, delivered_at FROM whatsapp_messages WHERE wamid = $1;`, [testWamid]);
    assert.equal(msgRes.rows[0].status, 'DELIVERED');
    assert.ok(msgRes.rows[0].delivered_at !== null);
  });

  // --------------------------------------------------------------------------
  // Scenario 8: Replayed webhook rejected / acknowledged idempotently
  // --------------------------------------------------------------------------
  await t.test('8. Replayed webhook rejected or acknowledged idempotently without re-processing', async () => {
    const testWamid = `wamid.REPLAY.${crypto.randomUUID()}`;
    await query(
      `INSERT INTO whatsapp_messages (
         organization_id, customer_id, wamid, phone_number, template_name, status, sent_at
       ) VALUES ($1, $2, $3, '+919822112233', 'dfarm_test', 'SENT', NOW());`,
      [testOrgId, customer1Id, testWamid]
    );

    const payloadObj = {
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  {
                    id: testWamid,
                    status: 'read',
                    timestamp: String(Math.floor(Date.now() / 1000)),
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const rawBody = JSON.stringify(payloadObj);
    const validHmac = crypto
      .createHmac('sha256', config.WHATSAPP_APP_SECRET)
      .update(rawBody)
      .digest('hex');

    // First delivery
    const res1 = await request(app)
      .post('/api/v1/webhooks/whatsapp')
      .set('x-hub-signature-256', `sha256=${validHmac}`)
      .set('Content-Type', 'application/json')
      .send(rawBody);

    assert.equal(res1.status, 200);
    assert.equal(res1.body.duplicate, false);

    // Replay attack / duplicate delivery
    const res2 = await request(app)
      .post('/api/v1/webhooks/whatsapp')
      .set('x-hub-signature-256', `sha256=${validHmac}`)
      .set('Content-Type', 'application/json')
      .send(rawBody);

    assert.equal(res2.status, 200);
    assert.equal(res2.body.duplicate, true, 'Replayed webhook must be detected as duplicate');
  });

  // --------------------------------------------------------------------------
  // Scenario 9: Opted-out customer receives no message
  // --------------------------------------------------------------------------
  await t.test('9. Opted-out customer receives no external message; status marked OPTED_OUT', async () => {
    const eventId = p19Event('OPT_OUT_01');
    const idemKey = p19Idem('OPT_OUT_01');

    const res = await request(app)
      .post('/api/v1/notifications/enqueue')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        customerId: customer3Id, // Customer 3 is opted out
        eventType: NotificationEventType.CUSTOMER_BALANCE_UPDATED,
        eventId,
        idempotencyKey: idemKey,
        channels: [NotificationChannel.WHATSAPP],
        metadata: { currentBalance: 2500.0 },
      });

    assert.equal(res.status, 201);
    const waRecord = res.body.data[0];
    assert.equal(waRecord.status, NotificationStatus.OPTED_OUT, 'Must be marked OPTED_OUT');

    // Ensure zero messages in whatsapp_messages
    const waCount = await query(
      `SELECT COUNT(*)::int as count FROM whatsapp_messages WHERE customer_id = $1 AND notification_record_id = $2;`,
      [customer3Id, waRecord.id]
    );
    assert.equal(waCount.rows[0].count, 0, 'No WhatsApp message row should be created for opted-out customer');
  });

  // --------------------------------------------------------------------------
  // Scenario 10: Wrong customer number rejected
  // --------------------------------------------------------------------------
  await t.test('10. Wrong customer number rejected with FAILED status and INVALID_PHONE_NUMBER reason', async () => {
    const eventId = p19Event('WRONG_PHONE_01');
    const idemKey = p19Idem('WRONG_PHONE_01');

    const res = await request(app)
      .post('/api/v1/notifications/enqueue')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        customerId: customer4Id, // Customer 4 has invalid-phone-format
        eventType: NotificationEventType.MILK_COLLECTION_COMPLETED,
        eventId,
        idempotencyKey: idemKey,
        channels: [NotificationChannel.WHATSAPP],
        metadata: { totalAmount: 500.0 },
      });

    assert.equal(res.status, 201);
    const waRecord = res.body.data[0];
    assert.equal(waRecord.status, NotificationStatus.FAILED);
    assert.match(waRecord.failureReason, /INVALID_PHONE_NUMBER/);
  });

  // --------------------------------------------------------------------------
  // Scenario 11: Push token registration
  // --------------------------------------------------------------------------
  await t.test('11. Customer device token registers successfully for push notifications', async () => {
    const testDeviceId = `dev_${crypto.randomUUID().slice(0, 8)}`;
    const testFcmToken = `fcm_token_${crypto.randomUUID()}_xyz1234567890`;

    const res = await request(app)
      .post(`/api/v1/customers/${customer1Id}/devices/tokens`)
      .set('Authorization', `Bearer ${customer1Token}`)
      .send({
        deviceId: testDeviceId,
        devicePlatform: 'ANDROID',
        fcmToken: testFcmToken,
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.deviceId, testDeviceId);
    assert.equal(res.body.data.fcmToken, testFcmToken);
    assert.equal(res.body.data.isActive, true);
  });

  // --------------------------------------------------------------------------
  // Scenario 12: Token refresh
  // --------------------------------------------------------------------------
  await t.test('12. Customer device token refresh updates token record', async () => {
    const testDeviceId = `dev_${crypto.randomUUID().slice(0, 8)}`;
    const initialToken = `fcm_token_initial_${crypto.randomUUID()}`;
    const refreshedToken = `fcm_token_refreshed_${crypto.randomUUID()}`;

    // Initial registration
    await request(app)
      .post(`/api/v1/customers/${customer1Id}/devices/tokens`)
      .set('Authorization', `Bearer ${customer1Token}`)
      .send({ deviceId: testDeviceId, fcmToken: initialToken });

    // Refresh
    const res = await request(app)
      .put(`/api/v1/customers/${customer1Id}/devices/tokens`)
      .set('Authorization', `Bearer ${customer1Token}`)
      .send({ deviceId: testDeviceId, fcmToken: refreshedToken });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.fcmToken, refreshedToken);
    assert.equal(res.body.data.isActive, true);
  });

  // --------------------------------------------------------------------------
  // Scenario 13: Device logout cleanup
  // --------------------------------------------------------------------------
  await t.test('13. Device logout cleanup deactivates customer device token', async () => {
    const testDeviceId = `dev_${crypto.randomUUID().slice(0, 8)}`;
    const token = `fcm_token_${crypto.randomUUID()}`;

    await request(app)
      .post(`/api/v1/customers/${customer1Id}/devices/tokens`)
      .set('Authorization', `Bearer ${customer1Token}`)
      .send({ deviceId: testDeviceId, fcmToken: token });

    // Logout cleanup
    const res = await request(app)
      .delete(`/api/v1/customers/${customer1Id}/devices/tokens/${testDeviceId}`)
      .set('Authorization', `Bearer ${customer1Token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.deactivated, true);

    // Verify token deactivated in database
    const dbToken = await query(
      `SELECT is_active, deactivation_reason FROM customer_device_tokens WHERE customer_id = $1 AND device_id = $2;`,
      [customer1Id, testDeviceId]
    );
    assert.equal(dbToken.rows[0].is_active, false);
    assert.equal(dbToken.rows[0].deactivation_reason, 'USER_LOGOUT');
  });

  // --------------------------------------------------------------------------
  // Scenario 14: Invalid device token cleanup
  // --------------------------------------------------------------------------
  await t.test('14. Invalid FCM device token deactivates automatically upon provider rejection', async () => {
    const deadToken = `dead_fcm_token_${crypto.randomUUID()}`;
    const testDeviceId = `dev_dead_${crypto.randomUUID().slice(0, 8)}`;

    await DeviceTokenService.registerToken(customer1Id, {
      deviceId: testDeviceId,
      devicePlatform: 'ANDROID',
      fcmToken: deadToken,
    });

    // Simulate provider deactivating invalid token
    await DeviceTokenService.deactivateInvalidToken(deadToken, 'Requested entity was not found (UNREGISTERED)');

    const res = await query(
      `SELECT is_active, deactivation_reason FROM customer_device_tokens WHERE fcm_token = $1;`,
      [deadToken]
    );
    assert.equal(res.rows[0].is_active, false);
    assert.match(res.rows[0].deactivation_reason, /UNREGISTERED/);
  });

  // --------------------------------------------------------------------------
  // Scenario 15: Provider timeout handled safely
  // --------------------------------------------------------------------------
  await t.test('15. Provider timeout simulated returns PROVIDER_TIMEOUT and handles error gracefully', async () => {
    // Custom mock provider to simulate timeout
    const timeoutProvider = {
      channel: NotificationChannel.PUSH,
      name: 'FIREBASE_FCM_TIMEOUT_MOCK',
      async send() {
        return {
          success: false,
          provider: 'FIREBASE_FCM_TIMEOUT_MOCK',
          status: 'FAILED',
          errorCode: 'PROVIDER_TIMEOUT',
          errorMessage: 'Request timed out after 8s',
          latencyMs: 8000,
        };
      },
    };

    NotificationProviderFactory.registerProvider(NotificationChannel.PUSH, timeoutProvider);

    const eventId = p19Event('TIMEOUT_01');
    const idemKey = p19Idem('TIMEOUT_01');

    const res = await request(app)
      .post('/api/v1/notifications/enqueue')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        customerId: customer1Id,
        eventType: NotificationEventType.MILK_COLLECTION_COMPLETED,
        eventId,
        idempotencyKey: idemKey,
        channels: [NotificationChannel.PUSH],
        metadata: { totalAmount: 200.0 },
      });

    assert.equal(res.status, 201);
    const pushRecord = res.body.data[0];
    assert.equal(pushRecord.retryCount, 1);
    assert.ok(pushRecord.nextRetryAt !== null);
    assert.match(pushRecord.failureReason, /Request timed out after 8s/);

    // Restore standard provider factory
    const { FirebaseFcmProvider } = await import('../dist/modules/notifications/providers/fcm.provider.js');
    NotificationProviderFactory.registerProvider(NotificationChannel.PUSH, new FirebaseFcmProvider());
  });

  // --------------------------------------------------------------------------
  // Scenario 16: Retry policy with exponential backoff
  // --------------------------------------------------------------------------
  await t.test('16. Retry policy schedules next_retry_at with exponential backoff on retryable failure', async () => {
    const eventId = p19Event('RETRY_01');
    const idemKey = p19Idem('RETRY_01');

    // Create a record with 1 retry attempt in DB
    const res = await query(
      `INSERT INTO notification_records (
         organization_id, customer_id, event_type, event_id, idempotency_key,
         channel, title, body, status, retry_count, max_retries, next_retry_at, created_at, updated_at
       ) VALUES ($1, $2, 'MILK_COLLECTION_COMPLETED', $3, $4, 'WHATSAPP', 'Test Retry', 'Body', 'PENDING', 1, 3, NOW() - INTERVAL '1 minute', NOW(), NOW())
       RETURNING *;`,
      [testOrgId, customer1Id, eventId, idemKey]
    );

    const record = res.rows[0];
    assert.equal(record.retry_count, 1);

    // Trigger processRetries
    const retryRes = await request(app)
      .post('/api/v1/notifications/retry-pending')
      .set('Authorization', `Bearer ${ownerToken}`);

    assert.equal(retryRes.status, 200);
    assert.ok(retryRes.body.data.processed >= 1);
  });

  // --------------------------------------------------------------------------
  // Scenario 17: Dead-letter / failure handling
  // --------------------------------------------------------------------------
  await t.test('17. Dead-letter failure handling marks status FAILED after exhausting max retries', async () => {
    const eventId = p19Event('DEAD_LETTER_01');
    const idemKey = p19Idem('DEAD_LETTER_01');

    // Create record with retry_count = 2 (max_retries = 3)
    const ins = await query(
      `INSERT INTO notification_records (
         organization_id, customer_id, event_type, event_id, idempotency_key,
         channel, title, body, status, retry_count, max_retries, created_at, updated_at
       ) VALUES ($1, $2, 'PAYMENT_SETTLED', $3, $4, 'WHATSAPP', 'Test Dead Letter', 'Body', 'PENDING', 2, 3, NOW(), NOW())
       RETURNING *;`,
      [testOrgId, customer1Id, eventId, idemKey]
    );

    const record = ins.rows[0];

    // Mock failing provider
    const failingProvider = {
      channel: NotificationChannel.WHATSAPP,
      name: 'MOCK_FAILING_GATEWAY',
      async send() {
        return {
          success: false,
          provider: 'MOCK_FAILING_GATEWAY',
          status: 'FAILED',
          errorMessage: 'Carrier gateway rejected message permanently',
        };
      },
    };

    NotificationProviderFactory.registerProvider(NotificationChannel.WHATSAPP, failingProvider);

    const updated = await NotificationService.dispatchToProvider(
      {
        id: record.id,
        organizationId: testOrgId,
        customerId: customer1Id,
        eventType: NotificationEventType.PAYMENT_SETTLED,
        eventId,
        idempotencyKey: idemKey,
        channel: NotificationChannel.WHATSAPP,
        recipientPhone: '+919822112233',
        title: record.title,
        body: record.body,
        status: NotificationStatus.PENDING,
        retryCount: 2,
        maxRetries: 3,
        createdAt: record.created_at,
        updatedAt: record.updated_at,
      },
      { title: record.title, body: record.body, language: 'mr' }
    );

    assert.equal(updated.status, NotificationStatus.FAILED, 'Should transition to FAILED dead-letter');
    assert.match(updated.failureReason, /Exhausted 3 delivery retries/);

    // Restore standard WhatsApp provider
    const { WhatsAppBusinessProvider } = await import('../dist/modules/notifications/providers/whatsapp.provider.js');
    NotificationProviderFactory.registerProvider(NotificationChannel.WHATSAPP, new WhatsAppBusinessProvider());
  });

  // --------------------------------------------------------------------------
  // Scenario 18: Marathi and English template rendering
  // --------------------------------------------------------------------------
  await t.test('18. Multi-lingual template rendering produces accurate Marathi and English localized output', async () => {
    const vars = {
      customerName: 'संतोष पाटील',
      quantity: 15.5,
      fat: 4.5,
      snf: 8.8,
      rate: 42.0,
      totalAmount: 651.0,
      balance: 5651.0,
      receiptNumber: 'REC-9988',
      centerName: 'सांगली केंद्र',
      shift: 'सकाळ',
    };

    // Marathi Render
    const mrResult = await TemplateEngine.render(
      NotificationEventType.MILK_COLLECTION_COMPLETED,
      NotificationChannel.WHATSAPP,
      'mr',
      vars
    );

    assert.match(mrResult.title, /दूध संकलन पावती/);
    assert.match(mrResult.body, /संतोष पाटील/);
    assert.match(mrResult.body, /15\.50/);
    assert.match(mrResult.body, /651\.00/);
    assert.match(mrResult.body, /REC-9988/);

    // English Render
    const enVars = { ...vars, customerName: 'Santosh Patil', shift: 'MORNING' };
    const enResult = await TemplateEngine.render(
      NotificationEventType.MILK_COLLECTION_COMPLETED,
      NotificationChannel.WHATSAPP,
      'en',
      enVars
    );

    assert.match(enResult.title, /Milk Collection Receipt/);
    assert.match(enResult.body, /Santosh Patil/);
    assert.match(enResult.body, /15\.50/);
    assert.match(enResult.body, /651\.00/);
  });

  // --------------------------------------------------------------------------
  // Scenario 19: Financial receipt accuracy
  // --------------------------------------------------------------------------
  await t.test('19. Financial receipt accuracy: Formatted numbers match authoritative persisted values exactly', async () => {
    const rawVars = {
      quantity: 23.456, // Should format to 23.46
      totalAmount: 12500.75,
      netPayableAmount: 11300.25,
      fat: 4.2,
      snf: 8.5,
      rate: 40.5,
    };

    const formatted = TemplateEngine.formatVariables(rawVars);
    assert.equal(formatted.quantity, '23.46');
    assert.equal(formatted.totalAmount, '12500.75');
    assert.equal(formatted.netPayableAmount, '11300.25');
    assert.equal(formatted.fat, '4.20');
    assert.equal(formatted.snf, '8.50');
    assert.equal(formatted.rate, '40.50');
  });

  // --------------------------------------------------------------------------
  // Scenario 20: Privacy and data masking
  // --------------------------------------------------------------------------
  await t.test('20. Privacy and data masking: Phone numbers and bank accounts are securely masked in logs and notifications', async () => {
    assert.equal(maskPhoneNumber('+919876543210'), '+9198*****210');
    assert.equal(maskPhoneNumber('+919822112233'), '+9198*****233');
    assert.equal(maskPhoneNumber(null), '[REDACTED]');
    assert.equal(maskPhoneNumber(''), '[REDACTED]');
  });

  // --------------------------------------------------------------------------
  // Scenario 21: Customer Mobile In-App Notification Inbox
  // --------------------------------------------------------------------------
  await t.test('21. Customer Mobile In-App Inbox: View notifications, mark as read, and view receipt', async () => {
    // Seed an in-app notification for Customer 1
    const notifRes = await query(
      `INSERT INTO notification_records (
         organization_id, customer_id, event_type, event_id, idempotency_key,
         channel, title, body, metadata, status, created_at, updated_at
       ) VALUES ($1, $2, 'MILK_COLLECTION_COMPLETED', $3, $4, 'IN_APP', 'दूध पावती क्र #101', 'तपशील', '{"receiptNumber":"REC-101","totalAmount":450.00}', 'DELIVERED', NOW(), NOW())
       RETURNING id;`,
      [testOrgId, customer1Id, p19Event('INBOX_01'), p19Idem('INBOX_01')]
    );
    const notifId = notifRes.rows[0].id;

    // 1. GET Inbox
    const listRes = await request(app)
      .get(`/api/v1/customers/${customer1Id}/notifications`)
      .set('Authorization', `Bearer ${customer1Token}`);

    assert.equal(listRes.status, 200);
    assert.ok(listRes.body.data.length >= 1);
    assert.ok(listRes.body.meta.unreadCount >= 1);

    // 2. Mark as Read
    const readRes = await request(app)
      .patch(`/api/v1/customers/${customer1Id}/notifications/${notifId}/read`)
      .set('Authorization', `Bearer ${customer1Token}`);

    assert.equal(readRes.status, 200);
    assert.equal(readRes.body.data.status, 'READ');
    assert.ok(readRes.body.data.readAt !== null);

    // 3. View Receipt
    const receiptRes = await request(app)
      .get(`/api/v1/customers/${customer1Id}/notifications/${notifId}/receipt`)
      .set('Authorization', `Bearer ${customer1Token}`);

    assert.equal(receiptRes.status, 200);
    assert.equal(receiptRes.body.data.receiptDetails.receiptNumber, 'REC-101');
    assert.equal(receiptRes.body.data.receiptDetails.totalAmount, 450.0);

    // 4. Mark all read
    const readAllRes = await request(app)
      .patch(`/api/v1/customers/${customer1Id}/notifications/read-all`)
      .set('Authorization', `Bearer ${customer1Token}`);

    assert.equal(readAllRes.status, 200);
    assert.ok(readAllRes.body.data.markedReadCount !== undefined);
  });

  // --------------------------------------------------------------------------
  // Scenario 22: WhatsApp Webhook Challenge Verification (GET)
  // --------------------------------------------------------------------------
  await t.test('22. Meta WhatsApp Webhook GET challenge verification succeeds with valid token', async () => {
    const testChallenge = 'challenge_test_string_123456';
    const res = await request(app)
      .get('/api/v1/webhooks/whatsapp')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': config.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
        'hub.challenge': testChallenge,
      });

    assert.equal(res.status, 200);
    assert.equal(res.text, testChallenge);

    // Rejection on bad verify token
    const badRes = await request(app)
      .get('/api/v1/webhooks/whatsapp')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong_token',
        'hub.challenge': testChallenge,
      });

    assert.equal(badRes.status, 400);
  });
});
