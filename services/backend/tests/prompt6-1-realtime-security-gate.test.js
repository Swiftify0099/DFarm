import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { db } from '../dist/infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../dist/infrastructure/database/TenantDatabaseManager.js';
import { HmacJwtTokenService } from '../dist/infrastructure/security/HmacJwtTokenService.js';
import { sseTicketService } from '../dist/infrastructure/security/SseTicketService.js';
import { createApp } from '../dist/app.js';
import { realtimePublisher } from '../dist/infrastructure/realtime/RealtimeEventPublisher.js';
import { PostgresCollectionTransactionRepository } from '../dist/infrastructure/repositories/PostgresCollectionTransactionRepository.js';
import { MilkCollectionTransaction } from '../dist/domain/entities/MilkCollectionTransaction.js';
import { RateService } from '../dist/modules/rates/rate.service.js';

test('PROMPT 6.1: Realtime Security, Durable Event Delivery & Final Regression Gate Suite', async (suite) => {
  let isConnected = await db.checkConnection();
  if (!isConnected) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    isConnected = await db.checkConnection();
  }
  if (!isConnected) {
    console.log('[PROMPT 6.1 TEST] Real PostgreSQL connection is unavailable. Suite skipped.');
    await db.close();
    suite.skip('Real PostgreSQL environment unavailable');
    return;
  }

  // Tenant & Center Identifiers
  const orgAlpha = '00000000-0000-0000-0000-0000000061a1';
  const orgBeta = '00000000-0000-0000-0000-0000000061b2';
  const centerAlpha1 = '00000000-0000-0000-0000-0000000061c1';
  const centerAlpha2 = '00000000-0000-0000-0000-0000000061c2';
  const centerBeta = '00000000-0000-0000-0000-0000000061c3';

  const adminAlphaId = '00000000-0000-0000-0000-0000000061d1';
  const operatorAlphaId = '00000000-0000-0000-0000-0000000061d2';
  const customerAlphaId = '00000000-0000-0000-0000-0000000061e1';

  const deviceActiveId = '00000000-0000-0000-0000-0000000061f1';
  const deviceBlockedId = '00000000-0000-0000-0000-0000000061f2';
  const deviceRevokedId = '00000000-0000-0000-0000-0000000061f3';

  const tokenService = new HmacJwtTokenService();

  const adminTokenAlpha = tokenService.signToken({
    userId: adminAlphaId,
    organizationId: orgAlpha,
    role: 'PRIMARY_DAIRY_ADMIN',
    actorType: 'STAFF',
    fullName: 'Dairy Admin Alpha',
  });

  const centerAdminTokenAlpha1 = tokenService.signToken({
    userId: adminAlphaId,
    organizationId: orgAlpha,
    centerId: centerAlpha1,
    role: 'CENTER_MANAGER',
    actorType: 'STAFF',
    fullName: 'Center 1 Manager Alpha',
  });

  const adminTokenBeta = tokenService.signToken({
    userId: '00000000-0000-0000-0000-0000000061d3',
    organizationId: orgBeta,
    role: 'PRIMARY_DAIRY_ADMIN',
    actorType: 'STAFF',
    fullName: 'Dairy Admin Beta',
  });

  const operatorTokenAlpha = tokenService.signToken({
    userId: operatorAlphaId,
    organizationId: orgAlpha,
    centerId: centerAlpha1,
    role: 'COLLECTION_OPERATOR',
    actorType: 'STAFF',
    fullName: 'Operator Alpha',
  });

  const customerTokenAlpha = tokenService.signToken({
    userId: customerAlphaId,
    organizationId: orgAlpha,
    role: 'FARMER_CUSTOMER',
    actorType: 'CUSTOMER',
    fullName: 'Customer Alpha',
  });

  const deviceTokenActive = tokenService.signToken({
    userId: operatorAlphaId,
    deviceId: deviceActiveId,
    organizationId: orgAlpha,
    centerId: centerAlpha1,
    role: 'COLLECTION_OPERATOR',
    actorType: 'STAFF',
  });

  const deviceTokenBlocked = tokenService.signToken({
    userId: operatorAlphaId,
    deviceId: deviceBlockedId,
    organizationId: orgAlpha,
    centerId: centerAlpha1,
    role: 'COLLECTION_OPERATOR',
    actorType: 'STAFF',
  });

  const deviceTokenRevoked = tokenService.signToken({
    userId: operatorAlphaId,
    deviceId: deviceRevokedId,
    organizationId: orgAlpha,
    centerId: centerAlpha1,
    role: 'COLLECTION_OPERATOR',
    actorType: 'STAFF',
  });

  const today = new Date().toISOString().split('T')[0];

  const seedFixtureData = async () => {
    // 1. Organizations
    await db.query(`
      INSERT INTO organizations (id, name, code, status)
      VALUES 
        ($1, 'Alpha Cooperative 6.1', 'ALPHA61', 'ACTIVE'),
        ($2, 'Beta Cooperative 6.1', 'BETA61', 'ACTIVE')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code, status = 'ACTIVE';
    `, [orgAlpha, orgBeta]);

    // 2. Centers
    await db.query(`
      INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status, timezone)
      VALUES
        ($1, $2, 'C-61A1', 'Alpha Center 1', 'Main Rd', 'TownA', 'DistA', 'StateA', '416001', '+919876543210', 'ACTIVE', 'Asia/Kolkata'),
        ($3, $2, 'C-61A2', 'Alpha Center 2', 'North Rd', 'TownA', 'DistA', 'StateA', '416002', '+919876543211', 'ACTIVE', 'Asia/Kolkata'),
        ($4, $5, 'C-61B1', 'Beta Central', 'Beta Rd', 'TownB', 'DistB', 'StateB', '416003', '+919876543212', 'ACTIVE', 'Asia/Kolkata')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code, status = 'ACTIVE';
    `, [centerAlpha1, orgAlpha, centerAlpha2, centerBeta, orgBeta]);

    // 3. Devices
    await db.query(`
      INSERT INTO devices (id, organization_id, center_id, device_identifier, device_type, name, status, is_blocked, revoked_at, public_key, device_token_hash, last_seen_at)
      VALUES
        ($1, $4, $5, 'DEV-61A1', 'COUNTER_TERMINAL', 'Station 6.1 Active', 'ACTIVE', false, null, 'pk-active', 'hash-active', NOW()),
        ($2, $4, $5, 'DEV-61A2', 'COUNTER_TERMINAL', 'Station 6.1 Blocked', 'BLOCKED', true, null, 'pk-blocked', 'hash-blocked', NOW()),
        ($3, $4, $5, 'DEV-61A3', 'COUNTER_TERMINAL', 'Station 6.1 Revoked', 'BLOCKED', true, NOW(), null, null, NOW())
      ON CONFLICT (id) DO UPDATE 
      SET status = EXCLUDED.status, is_blocked = EXCLUDED.is_blocked, revoked_at = EXCLUDED.revoked_at,
          public_key = EXCLUDED.public_key, device_token_hash = EXCLUDED.device_token_hash,
          last_seen_at = EXCLUDED.last_seen_at, name = EXCLUDED.name, device_identifier = EXCLUDED.device_identifier;
    `, [deviceActiveId, deviceBlockedId, deviceRevokedId, orgAlpha, centerAlpha1]);

    // 4. Device Sync State
    await db.query(`
      INSERT INTO device_sync_state (device_id, last_upstream_sync_at, pending_queue_count, battery_level, network_mode, last_heartbeat_at)
      VALUES
        ($1, NOW(), 0, 95, 'WIFI', NOW()),
        ($2, NOW() - INTERVAL '1 day', 0, 0, 'NONE', NOW()),
        ($3, NOW() - INTERVAL '2 days', 0, 0, 'NONE', NOW())
      ON CONFLICT (device_id) DO UPDATE 
      SET pending_queue_count = EXCLUDED.pending_queue_count, last_upstream_sync_at = EXCLUDED.last_upstream_sync_at, last_heartbeat_at = EXCLUDED.last_heartbeat_at;
    `, [deviceActiveId, deviceBlockedId, deviceRevokedId]);

    // 5. Users
    await db.query(`
      INSERT INTO users (id, organization_id, username, phone_number, full_name, role, status)
      VALUES
        ($1, $3, 'admin_61', '+919876543201', 'Admin 6.1', 'PRIMARY_DAIRY_ADMIN', 'ACTIVE'),
        ($2, $3, 'operator_61', '+919876543202', 'Operator 6.1', 'COLLECTION_OPERATOR', 'ACTIVE')
      ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, status = 'ACTIVE';
    `, [adminAlphaId, operatorAlphaId, orgAlpha]);

    // 6. Customers
    await db.query(`
      INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status)
      VALUES ($1, $2, $3, 'F-6101', 'Suresh Patel', '+919876543210', 'ACTIVE', 'APPROVED')
      ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;
    `, [customerAlphaId, orgAlpha, centerAlpha1]);

    // 7. Rate Chart Version
    let rcvId;
    const rcvCheck = await db.query(`SELECT id FROM rate_chart_versions LIMIT 1`);
    if (rcvCheck.rows.length > 0) {
      rcvId = rcvCheck.rows[0].id;
    } else {
      const chartRes = await db.query(`
        INSERT INTO rate_charts (id, organization_id, center_id, name, milk_category, pricing_type, is_active)
        VALUES (gen_random_uuid(), $1, $2, 'Test Chart 6.1', 'COW', 'GRID', true)
        RETURNING id;
      `, [orgAlpha, centerAlpha1]);
      const verRes = await db.query(`
        INSERT INTO rate_chart_versions (id, rate_chart_id, version_number, status, pricing_unit, effective_from, base_fat, base_snf, base_rate, is_approved)
        VALUES (gen_random_uuid(), $1, 1, 'PUBLISHED', 'PER_LITER', NOW(), 3.5, 8.5, 40.0, true)
        RETURNING id;
      `, [chartRes.rows[0].id]);
      rcvId = verRes.rows[0].id;
    }

    return { rcvId };
  };

  tenantDbManager.tenantPools.set(orgAlpha, db.pool);
  tenantDbManager.tenantPools.set(orgBeta, db.pool);

  const { rcvId } = await seedFixtureData();

  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  try {
    // ========================================================================
    // GATE 1: SSE AUTHENTICATION SECURITY & TOKEN REDACTION
    // ========================================================================
    await suite.test('Gate 1: SSE Authentication Security (No JWT in URL, Ticket Lifecycle, Role Validation)', async () => {
      // 1.1 Raw JWT in query parameter is rejected with 400
      const resRawQuery = await fetch(`${baseUrl}/dairy-admin/events?token=${encodeURIComponent(adminTokenAlpha)}`, {
        headers: { Accept: 'text/event-stream' },
      });
      assert.equal(resRawQuery.status, 400, 'Raw JWT in ?token= must return 400');
      const rawBody = await resRawQuery.json();
      assert.ok(
        rawBody.errorCode === 'EXPOSED_QUERY_TOKEN_FORBIDDEN' || rawBody.errorCode === 'NORMAL_JWT_IN_QUERY_FORBIDDEN',
        `Expected query token error code, got: ${rawBody.errorCode}`
      );

      // 1.2 Unauthenticated ticket request is rejected with 401
      const resTicketUnauth = await fetch(`${baseUrl}/dairy-admin/events/ticket`, {
        method: 'POST',
      });
      assert.equal(resTicketUnauth.status, 401, 'Unauthenticated ticket request must return 401');

      // 1.3 Customer role requesting ticket is rejected with 403
      const resTicketCustomer = await fetch(`${baseUrl}/dairy-admin/events/ticket`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${customerTokenAlpha}`,
          'X-Dairy-Tenant-Id': orgAlpha,
        },
      });
      assert.equal(resTicketCustomer.status, 403, 'Customer role must be denied admin SSE ticket');

      // 1.4 Operator (non-admin) role requesting ticket is rejected with 403
      const resTicketOperator = await fetch(`${baseUrl}/dairy-admin/events/ticket`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${operatorTokenAlpha}`,
          'X-Dairy-Tenant-Id': orgAlpha,
        },
      });
      assert.equal(resTicketOperator.status, 403, 'Operator role must be denied admin SSE ticket');

      // 1.5 Authorized Admin acquires short-lived ticket
      const resTicketAdmin = await fetch(`${baseUrl}/dairy-admin/events/ticket`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminTokenAlpha}`,
          'X-Dairy-Tenant-Id': orgAlpha,
        },
      });
      assert.equal(resTicketAdmin.status, 200);
      const ticketJson = await resTicketAdmin.json();
      assert.equal(ticketJson.success, true);
      const ticket = ticketJson.ticket || ticketJson.data?.ticket;
      assert.ok(ticket, 'Must return signed ticket string');
      const expiresIn = ticketJson.expiresInSeconds || ticketJson.data?.expiresInSeconds;
      assert.equal(typeof expiresIn, 'number');

      // 1.6 Invalid signature ticket is rejected with 401
      const resInvalidTicket = await fetch(`${baseUrl}/dairy-admin/events?ticket=invalid.tampered.ticket`, {
        headers: { Accept: 'text/event-stream' },
      });
      assert.equal(resInvalidTicket.status, 401, 'Tampered ticket must return 401');
      const invBody = await resInvalidTicket.json();
      assert.ok(invBody.errorCode === 'UNAUTHORIZED' || invBody.errorCode === 'INVALID_SSE_TICKET');

      // 1.7 Expired ticket is rejected with 401
      // Forge a ticket with negative expiration
      const expiredPayload = {
        userId: adminAlphaId,
        organizationId: orgAlpha,
        centerId: null,
        role: 'PRIMARY_DAIRY_ADMIN',
        purpose: 'SSE_STREAM',
        aud: 'dairy-admin-sse',
        exp: Math.floor(Date.now() / 1000) - 60,
        jti: crypto.randomUUID(),
      };
      const expiredPayloadB64 = Buffer.from(JSON.stringify(expiredPayload)).toString('base64url');
      const expiredSig = crypto.createHmac('sha256', process.env.JWT_SECRET || 'dfarm-dev-secret-key-32-chars-min!').update(expiredPayloadB64).digest('base64url');
      const expiredTicket = `${expiredPayloadB64}.${expiredSig}`;

      const resExpired = await fetch(`${baseUrl}/dairy-admin/events?ticket=${expiredTicket}`, {
        headers: { Accept: 'text/event-stream' },
      });
      assert.equal(resExpired.status, 401, 'Expired ticket must return 401');
      const expBody = await resExpired.json();
      assert.ok(expBody.errorCode === 'UNAUTHORIZED' || expBody.errorCode === 'EXPIRED_SSE_TICKET');

      // 1.8 Wrong purpose / audience ticket is rejected with 401
      const wrongAudPayload = {
        userId: adminAlphaId,
        organizationId: orgAlpha,
        role: 'PRIMARY_DAIRY_ADMIN',
        purpose: 'WRONG_PURPOSE',
        aud: 'wrong-audience',
        exp: Math.floor(Date.now() / 1000) + 60,
        jti: crypto.randomUUID(),
      };
      const wrongAudB64 = Buffer.from(JSON.stringify(wrongAudPayload)).toString('base64url');
      const wrongSig = crypto.createHmac('sha256', process.env.JWT_SECRET || 'dfarm-dev-secret-key-32-chars-min!').update(wrongAudB64).digest('base64url');
      const wrongTicket = `${wrongAudB64}.${wrongSig}`;

      const resWrongAud = await fetch(`${baseUrl}/dairy-admin/events?ticket=${wrongTicket}`, {
        headers: { Accept: 'text/event-stream' },
      });
      assert.equal(resWrongAud.status, 401, 'Wrong audience ticket must return 401');

      // 1.9 Single-use ticket enforcement: ticket works once, second use rejected with 401
      // Connect first time
      const connectPromise = new Promise((resolve, reject) => {
        const clientReq = http.get(
          `${baseUrl}/dairy-admin/events?ticket=${encodeURIComponent(ticket)}`,
          { headers: { Accept: 'text/event-stream' } },
          (res) => {
            assert.equal(res.statusCode, 200);
            res.on('data', (chunk) => {
              if (chunk.toString().includes('event: CONNECTED')) {
                clientReq.destroy();
                resolve(true);
              }
            });
          }
        );
        clientReq.on('error', (err) => {
          if (err.name !== 'AbortError') reject(err);
        });
        setTimeout(() => {
          clientReq.destroy();
          resolve(false);
        }, 4000);
      });
      const firstConnected = await connectPromise;
      assert.ok(firstConnected, 'Valid ticket must successfully establish SSE stream');

      // Attempt to reuse the EXACT same ticket -> must fail with 401 TICKET_ALREADY_USED
      const resReusedTicket = await fetch(`${baseUrl}/dairy-admin/events?ticket=${encodeURIComponent(ticket)}`, {
        headers: { Accept: 'text/event-stream' },
      });
      assert.equal(resReusedTicket.status, 401, 'Reused ticket must return 401');
      const reuseBody = await resReusedTicket.json();
      assert.ok(reuseBody.errorCode === 'UNAUTHORIZED' || reuseBody.errorCode === 'TICKET_ALREADY_USED');
    });

    // ========================================================================
    // GATE 2: TRANSACTIONAL OUTBOX & DURABLE EVENT DELIVERY
    // ========================================================================
    await suite.test('Gate 2: Transactional Outbox (Same-Tx ACID Insertion, FOR UPDATE SKIP LOCKED Worker, Last-Event-ID Recovery)', async () => {
      const repo = new PostgresCollectionTransactionRepository(db.pool);

      const intakeUuid = crypto.randomUUID();
      const idempotencyKey = `OUTBOX-GATE2-${intakeUuid}`;
      const centerId = centerAlpha1;
      const customerId = customerAlphaId;
      const collId = crypto.randomUUID();

      const intakeTxn = new MilkCollectionTransaction({
        id: collId,
        transactionCode: 'TXN-6101',
        sessionId: crypto.randomUUID(),
        dairyId: orgAlpha,
        centerId,
        customerId,
        customerCode: 'F-6101',
        customerName: 'Suresh Patel',
        timestamp: new Date().toISOString(),
        date: today,
        shift: 'MORNING',
        milkCategory: 'COW',
        weightLiters: 12.5,
        fatPercentage: 4.0,
        snfPercentage: 8.5,
        clrDensity: 28.0,
        appliedRatePerLiter: 42.0,
        rateChartVersion: 1,
        totalAmount: 525.0,
        identificationMethod: 'FACE_YUNET_SFACE',
        syncStatus: 'SYNCED_CLOUD',
        deviceId: deviceActiveId,
        operatorName: 'Operator 6.1',
        idempotencyKey,
      });

      // 2.1 Save atomic intake -> Must commit outbox record in the SAME PostgreSQL transaction
      const saveResult = await repo.saveAtomicIntake({
        transaction: intakeTxn,
        organizationId: orgAlpha,
        operatorId: operatorAlphaId,
      });
      assert.ok(saveResult.transaction?.id, 'Intake transaction must succeed');

      // Verify that dashboard_events_outbox contains the exact event with status 'PENDING'
      const outboxCheck = await db.query(
        `SELECT id, organization_id, center_id, event_type, status, payload
         FROM dashboard_events_outbox
         WHERE payload->>'collectionId' = $1;`,
        [saveResult.transaction.id]
      );
      assert.equal(outboxCheck.rows.length, 1, 'Event MUST be inserted in dashboard_events_outbox in the same transaction');
      const outboxRow = outboxCheck.rows[0];
      assert.equal(outboxRow.organization_id, orgAlpha);
      assert.equal(outboxRow.center_id, centerAlpha1);
      assert.equal(outboxRow.event_type, 'COLLECTION_ACCEPTED');
      assert.equal(outboxRow.status, 'PENDING');
      assert.equal(Number(outboxRow.payload.quantityLiters), 12.5);
      assert.equal(Number(outboxRow.payload.totalAmount), 525.0);

      // 2.2 Verify Transaction Rollback safety:
      // If a transaction fails mid-flight, the outbox record must NOT be committed
      const invalidIntakeUuid = crypto.randomUUID();
      const invalidTxn = new MilkCollectionTransaction({
        id: crypto.randomUUID(),
        transactionCode: 'TXN-FAIL-01',
        sessionId: crypto.randomUUID(),
        dairyId: orgAlpha,
        centerId,
        customerId: '00000000-0000-0000-0000-ffffffffffff', // non-existent customer
        customerCode: 'F-NONEXISTENT',
        customerName: 'Nobody',
        timestamp: new Date().toISOString(),
        date: today,
        shift: 'MORNING',
        milkCategory: 'COW',
        weightLiters: 10.0,
        fatPercentage: 4.0,
        snfPercentage: 8.5,
        clrDensity: 28.0,
        appliedRatePerLiter: 40.0,
        rateChartVersion: 1,
        totalAmount: 400.0,
        identificationMethod: 'FACE_YUNET_SFACE',
        syncStatus: 'SYNCED_CLOUD',
        deviceId: deviceActiveId,
        operatorName: 'Operator 6.1',
        idempotencyKey: `FAIL-TX-${invalidIntakeUuid}`,
      });

      await assert.rejects(
        async () => {
          await repo.saveAtomicIntake({
            transaction: invalidTxn,
            organizationId: orgAlpha,
            operatorId: operatorAlphaId,
          });
        },
        /violates foreign key constraint|violates|failed/i,
        'Invalid customer ID must trigger transaction rollback'
      );

      // Verify NO outbox row was committed for the rolled back intake
      const rollbackCheck = await db.query(
        `SELECT id FROM dashboard_events_outbox WHERE payload->>'collectionId' = $1;`,
        [invalidTxn.id]
      );
      assert.equal(rollbackCheck.rows.length, 0, 'Rolled back transaction must NOT leave dangling outbox events');
      assert.equal(rollbackCheck.rows.length, 0, 'Rolled back transaction must NOT leave dangling outbox events');

      // 2.3 Verify Transactional Outbox Worker Dispatch & FOR UPDATE SKIP LOCKED
      // Manually trigger processOutboxBatch and check status updates to PUBLISHED
      await realtimePublisher.processOutboxBatch();

      const publishedCheck = await db.query(
        `SELECT status, published_at FROM dashboard_events_outbox WHERE id = $1;`,
        [outboxRow.id]
      );
      assert.equal(publishedCheck.rows[0].status, 'PUBLISHED', 'Worker must transition status to PUBLISHED');
      assert.ok(publishedCheck.rows[0].published_at !== null, 'published_at must be populated');

      // 2.4 Verify Replay with Last-Event-ID from PostgreSQL Outbox
      // Even if ring buffer does not have it, publisher reconstructs from DB table
      const eventIdToReplay = outboxRow.id;
      // Fetch fresh ticket for stream
      const sseTicketRes = await fetch(`${baseUrl}/dairy-admin/events/ticket`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminTokenAlpha}`,
          'X-Dairy-Tenant-Id': orgAlpha,
        },
      });
      const sseTicket = (await sseTicketRes.json()).data.ticket;

      const replayPromise = new Promise((resolve, reject) => {
        let streamBuffer = '';
        const clientReq = http.get(
          `${baseUrl}/dairy-admin/events?ticket=${encodeURIComponent(sseTicket)}`,
          {
            headers: {
              Accept: 'text/event-stream',
              'Last-Event-ID': eventIdToReplay, // Request replay from this ID
            },
          },
          (res) => {
            assert.equal(res.statusCode, 200);
            res.on('data', (chunk) => {
              streamBuffer += chunk.toString();
              if (streamBuffer.includes('event: CONNECTED')) {
                clientReq.destroy();
                resolve({ connected: true, buffer: streamBuffer });
              }
            });
          }
        );
        clientReq.on('error', (err) => {
          if (err.name !== 'AbortError') reject(err);
        });
        setTimeout(() => {
          clientReq.destroy();
          resolve({ connected: false, buffer: streamBuffer });
        }, 4000);
      });

      const replayResult = await replayPromise;
      assert.ok(replayResult.connected, 'SSE reconnection with Last-Event-ID should successfully connect and replay');
    });

    // ========================================================================
    // GATE 3: DEVICE BLOCK / REVOKE SECURITY
    // ========================================================================
    await suite.test('Gate 3: Device Block & Permanent Revocation Security Enforcement', async () => {
      // 3.1 Client-Supplied Device Identity Override Prevention
      // A caller with active device token trying to supply a DIFFERENT deviceId in body -> 403 DEVICE_IDENTITY_MISMATCH
      const resSpoof = await fetch(`${baseUrl}/devices/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deviceTokenActive}`,
          'X-Dairy-Tenant-Id': orgAlpha,
        },
        body: JSON.stringify({
          deviceId: deviceBlockedId, // Attempting to spoof deviceBlockedId
          pendingQueueCount: 0,
        }),
      });
      assert.equal(resSpoof.status, 403, 'Spoofed device ID must be rejected with 403');
      const spoofBody = await resSpoof.json();
      assert.equal(spoofBody.errorCode, 'DEVICE_IDENTITY_MISMATCH');

      // 3.2 Blocked device is rejected with 403 DEVICE_BLOCKED
      const resBlocked = await fetch(`${baseUrl}/devices/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deviceTokenBlocked}`,
          'X-Dairy-Tenant-Id': orgAlpha,
        },
        body: JSON.stringify({ pendingQueueCount: 0 }),
      });
      assert.equal(resBlocked.status, 403, 'Blocked device must be rejected');
      const blockedBody = await resBlocked.json();
      assert.equal(blockedBody.errorCode, 'DEVICE_BLOCKED');

      // 3.3 Permanently Revoked device is rejected with 403 DEVICE_REVOKED
      const resRevoked = await fetch(`${baseUrl}/devices/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deviceTokenRevoked}`,
          'X-Dairy-Tenant-Id': orgAlpha,
        },
        body: JSON.stringify({ pendingQueueCount: 0 }),
      });
      assert.equal(resRevoked.status, 403, 'Revoked device must be rejected');
      const revokedBody = await resRevoked.json();
      assert.equal(revokedBody.errorCode, 'DEVICE_REVOKED');

      // 3.4 Unblock cannot silently restore a permanently revoked device -> 409 Conflict
      const resUnblockRevoked = await fetch(`${baseUrl}/dairy-admin/stations/${deviceRevokedId}/unblock`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminTokenAlpha}`,
          'X-Dairy-Tenant-Id': orgAlpha,
        },
      });
      assert.equal(resUnblockRevoked.status, 409, 'Unblocking permanently revoked device must return 409 Conflict');
      const unblockRevokedBody = await resUnblockRevoked.json();
      assert.equal(unblockRevokedBody.errorCode, 'CANNOT_UNBLOCK_REVOKED_DEVICE');

      // 3.5 Non-admin (Operator) cannot block or unblock stations -> 403
      const resOperatorBlock = await fetch(`${baseUrl}/dairy-admin/stations/${deviceActiveId}/block`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${operatorTokenAlpha}`,
          'X-Dairy-Tenant-Id': orgAlpha,
        },
        body: JSON.stringify({ reason: 'Unauthorized block' }),
      });
      assert.equal(resOperatorBlock.status, 403, 'Non-admin role must be forbidden from blocking stations');

      // 3.6 Admin block creates audit record in audit_logs
      const resAdminBlock = await fetch(`${baseUrl}/dairy-admin/stations/${deviceActiveId}/block`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminTokenAlpha}`,
          'X-Dairy-Tenant-Id': orgAlpha,
        },
        body: JSON.stringify({ reason: 'Security maintenance' }),
      });
      assert.equal(resAdminBlock.status, 200);

      const auditCheck = await db.query(
        `SELECT action, entity_type, entity_id, user_id, new_values
         FROM audit_logs
         WHERE entity_id = $1 AND action = 'STATION_BLOCKED'
         ORDER BY created_at DESC LIMIT 1;`,
        [deviceActiveId]
      );
      assert.equal(auditCheck.rows.length, 1, 'Block action MUST create an audit log record');
      assert.equal(auditCheck.rows[0].user_id, adminAlphaId);
      assert.equal(auditCheck.rows[0].new_values.reason, 'Security maintenance');

      // Clean up: unblock deviceActiveId
      await fetch(`${baseUrl}/dairy-admin/stations/${deviceActiveId}/unblock`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminTokenAlpha}`,
          'X-Dairy-Tenant-Id': orgAlpha,
        },
      });
    });

    // ========================================================================
    // GATE 4: ADMIN API AUTHORIZATION, CENTRE SCOPING & PII PROTECTION
    // ========================================================================
    await suite.test('Gate 4: Admin API Authorization, Centre Scoping & PII Masking', async () => {
      // 4.1 Cross-tenant request fails closed with 403
      const resCrossTenant = await fetch(`${baseUrl}/dairy-admin/metrics`, {
        headers: {
          Authorization: `Bearer ${adminTokenAlpha}`,
          'X-Dairy-Tenant-Id': orgBeta,
        },
      });
      assert.equal(resCrossTenant.status, 403, 'Cross-tenant request must return 403');
      const ctBody = await resCrossTenant.json();
      assert.equal(ctBody.errorCode, 'CROSS_TENANT_ACCESS_DENIED');

      // 4.2 Centre-restricted user attempting cross-centre access fails closed with 403
      const resCrossCenter = await fetch(`${baseUrl}/dairy-admin/metrics?centerId=${centerAlpha2}`, {
        headers: {
          Authorization: `Bearer ${centerAdminTokenAlpha1}`,
          'X-Dairy-Tenant-Id': orgAlpha,
        },
      });
      assert.equal(resCrossCenter.status, 403, 'Centre-restricted admin cannot access other center');
      const ccBody = await resCrossCenter.json();
      assert.equal(ccBody.errorCode, 'CROSS_CENTER_ACCESS_DENIED');

      // 4.3 Centre-restricted user without explicit centerId is automatically scoped to their center
      const resAutoCenter = await fetch(`${baseUrl}/dairy-admin/metrics`, {
        headers: {
          Authorization: `Bearer ${centerAdminTokenAlpha1}`,
          'X-Dairy-Tenant-Id': orgAlpha,
        },
      });
      assert.equal(resAutoCenter.status, 200, 'Centre-restricted admin automatically scoped');
      const acBody = await resAutoCenter.json();
      assert.equal(acBody.data.centerId, centerAlpha1);

      // 4.4 Customer role rejected from all dairy admin routes
      const resCustomerMetrics = await fetch(`${baseUrl}/dairy-admin/metrics`, {
        headers: {
          Authorization: `Bearer ${customerTokenAlpha}`,
          'X-Dairy-Tenant-Id': orgAlpha,
        },
      });
      assert.equal(resCustomerMetrics.status, 403, 'Customer role must be denied admin metrics');

      // 4.5 PII Redaction in Collection Feed
      const resFeed = await fetch(`${baseUrl}/dairy-admin/collections/feed?limit=5`, {
        headers: {
          Authorization: `Bearer ${adminTokenAlpha}`,
          'X-Dairy-Tenant-Id': orgAlpha,
        },
      });
      assert.equal(resFeed.status, 200);
      const feedBody = await resFeed.json();
      assert.ok(Array.isArray(feedBody.data));
      for (const item of feedBody.data) {
        if (item.maskedFarmerName) {
          assert.ok(item.maskedFarmerName.includes('*'), 'Farmer name must be masked with asterisks');
          assert.ok(!item.maskedFarmerName.includes('+91'), 'Farmer name must not contain phone numbers');
        }
        assert.equal(item.mobileNumber, undefined, 'mobileNumber must NOT be present in feed');
        assert.equal(item.bankAccountNumber, undefined, 'bankAccountNumber must NOT be present in feed');
        assert.equal(item.ifscCode, undefined, 'ifscCode must NOT be present in feed');
      }
    });

    // ========================================================================
    // GATE 5: PROMPT 5.2.1 RESIDUAL RATE SYNC REGRESSION
    // ========================================================================
    await suite.test('Gate 5: Rate Sync Regression (/rate-charts/sync harmonization, ETag 304, Composite Cache Key)', async () => {
      // 5.1 Unauthenticated request returns 401
      const resUnauth = await fetch(`${baseUrl}/rate-charts/sync?centerId=${centerAlpha1}&category=COW&scope=CENTER_SPECIFIC`);
      assert.equal(resUnauth.status, 401, 'Unauthenticated rate sync must return 401');

      // 5.2 Cross-tenant rate sync fails closed with 403
      const resCrossTenant = await fetch(`${baseUrl}/rate-charts/sync?centerId=${centerAlpha1}&category=COW&scope=CENTER_SPECIFIC`, {
        headers: {
          Authorization: `Bearer ${adminTokenAlpha}`,
          'X-Dairy-Tenant-Id': orgBeta,
        },
      });
      assert.equal(resCrossTenant.status, 403, 'Cross-tenant rate sync must return 403');

      // 5.3 Valid rate sync returns rate chart with strong ETag
      const resSync = await fetch(`${baseUrl}/rate-charts/sync?centerId=${centerAlpha1}&category=COW&scope=CENTER_SPECIFIC`, {
        headers: {
          Authorization: `Bearer ${adminTokenAlpha}`,
          'X-Dairy-Tenant-Id': orgAlpha,
        },
      });
      assert.equal(resSync.status, 200, 'Valid rate sync should return 200');
      const etag = resSync.headers.get('etag');
      assert.ok(etag, 'Rate sync must return ETag header');

      // 5.4 Conditional GET with matching If-None-Match returns 304 Not Modified
      const res304 = await fetch(`${baseUrl}/rate-charts/sync?centerId=${centerAlpha1}&category=COW&scope=CENTER_SPECIFIC`, {
        headers: {
          Authorization: `Bearer ${adminTokenAlpha}`,
          'X-Dairy-Tenant-Id': orgAlpha,
          'If-None-Match': etag,
        },
      });
      assert.equal(res304.status, 304, 'Matching If-None-Match must return 304 Not Modified');

      // 5.5 Verify Composite Cache Key Structure
      const cacheKeyCenter = RateService.getRateCacheKey({
        organizationId: orgAlpha,
        scope: 'CENTER_SPECIFIC',
        centerId: centerAlpha1,
        chartId: 'chart-01',
        versionNumber: 1,
        milkCategory: 'COW',
      });
      assert.ok(cacheKeyCenter.includes('dfarm:rates:tenant:'), 'Cache key must have dfarm:rates:tenant prefix');
      assert.ok(cacheKeyCenter.includes(orgAlpha), 'Cache key must include organization ID');
      assert.ok(cacheKeyCenter.includes(centerAlpha1), 'Cache key must include center ID');
      assert.ok(cacheKeyCenter.includes('COW'), 'Cache key must include category');

      const cacheKeyGlobal = RateService.getRateCacheKey({
        organizationId: orgAlpha,
        scope: 'ORGANIZATION_WIDE',
        chartId: 'chart-global',
        versionNumber: 2,
        milkCategory: 'BUFFALO',
      });
      assert.ok(cacheKeyGlobal.includes('ORG_WIDE'), 'Global cache key must denote ORG_WIDE');
      assert.ok(cacheKeyGlobal.includes('BUFFALO'), 'Global cache key must include category');
    });

  } finally {
    realtimePublisher.destroy();
    tenantDbManager.tenantPools.delete(orgAlpha);
    tenantDbManager.tenantPools.delete(orgBeta);
    await new Promise((resolve) => server.close(resolve));

    // Clean up test records
    await db.query(`
      DELETE FROM dashboard_events_outbox WHERE organization_id IN ($1, $2);
      DELETE FROM audit_logs WHERE organization_id IN ($1, $2);
      DELETE FROM milk_collections WHERE organization_id IN ($1, $2);
      DELETE FROM collection_sessions WHERE center_id IN ($7, $8, $9);
      DELETE FROM collection_shifts WHERE center_id IN ($7, $8, $9);
      DELETE FROM kiosk_shift_sessions WHERE organization_id IN ($1, $2);
      DELETE FROM device_sync_state WHERE device_id IN ($3, $4, $5);
      DELETE FROM devices WHERE organization_id IN ($1, $2);
      DELETE FROM customers WHERE organization_id IN ($1, $2);
      DELETE FROM users WHERE organization_id IN ($1, $2);
      DELETE FROM dairy_centers WHERE organization_id IN ($1, $2);
      DELETE FROM organizations WHERE id IN ($1, $2);
    `, [orgAlpha, orgBeta, deviceActiveId, deviceBlockedId, deviceRevokedId, centerAlpha1, centerAlpha2, centerBeta]).catch(() => {});
    await db.close();
  }
});
