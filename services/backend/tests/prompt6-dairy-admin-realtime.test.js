import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { db } from '../dist/infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../dist/infrastructure/database/TenantDatabaseManager.js';
import { HmacJwtTokenService } from '../dist/infrastructure/security/HmacJwtTokenService.js';
import { createApp } from '../dist/app.js';
import { realtimePublisher } from '../dist/infrastructure/realtime/RealtimeEventPublisher.js';

test('PROMPT 6: Dairy Admin Realtime Dashboard & Live Station Monitoring Suite', async (suite) => {
  let isConnected = await db.checkConnection();
  if (!isConnected) {
    // Retry once in case of cold DNS/pool establishment
    await new Promise((resolve) => setTimeout(resolve, 2000));
    isConnected = await db.checkConnection();
  }
  if (!isConnected) {
    console.log('[PROMPT 6 TEST] Real PostgreSQL connection is unavailable. Suite skipped.');
    await db.close();
    suite.skip('Real PostgreSQL environment unavailable');
    return;
  }

  // Tenant Fixture Identifiers
  const orgAlpha = '00000000-0000-0000-0000-000000006a01';
  const orgBeta = '00000000-0000-0000-0000-000000006b02';
  const centerAlpha1 = '00000000-0000-0000-0000-000000006c01';
  const centerAlpha2 = '00000000-0000-0000-0000-000000006c02';
  const centerBeta = '00000000-0000-0000-0000-000000006c03';

  const operatorAlpha = '00000000-0000-0000-0000-000000006d01';
  const customerAlpha = '00000000-0000-0000-0000-000000006e01';

  const deviceActiveId = '00000000-0000-0000-0000-000000006f01';
  const deviceDegradedId = '00000000-0000-0000-0000-000000006f02';
  const deviceOfflineId = '00000000-0000-0000-0000-000000006f03';
  const deviceBlockedId = '00000000-0000-0000-0000-000000006f04';

  const tokenService = new HmacJwtTokenService();
  const adminTokenAlpha = tokenService.signToken({
    userId: operatorAlpha,
    organizationId: orgAlpha,
    role: 'PRIMARY_DAIRY_ADMIN',
    actorType: 'STAFF',
    fullName: 'Dairy Admin Alpha',
  });

  const adminTokenBeta = tokenService.signToken({
    userId: '00000000-0000-0000-0000-000000006d02',
    organizationId: orgBeta,
    role: 'PRIMARY_DAIRY_ADMIN',
    actorType: 'STAFF',
    fullName: 'Dairy Admin Beta',
  });

  const deviceTokenActive = tokenService.signToken({
    userId: operatorAlpha,
    deviceId: deviceActiveId,
    organizationId: orgAlpha,
    centerId: centerAlpha1,
    role: 'COLLECTION_OPERATOR',
    actorType: 'STAFF',
  });

  const deviceTokenBlocked = tokenService.signToken({
    userId: operatorAlpha,
    deviceId: deviceBlockedId,
    organizationId: orgAlpha,
    centerId: centerAlpha1,
    role: 'COLLECTION_OPERATOR',
    actorType: 'STAFF',
  });

  const today = new Date().toISOString().split('T')[0];

  // Helper to seed database tables
  const seedEnvironment = async () => {
    // 1. Organizations
    await db.query(`
      INSERT INTO organizations (id, name, code, status)
      VALUES 
        ($1, 'Alpha Cooperative', 'ALPHA', 'ACTIVE'),
        ($2, 'Beta Cooperative', 'BETA', 'ACTIVE')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code, status = 'ACTIVE';
    `, [orgAlpha, orgBeta]);

    // 2. Centers
    await db.query(`
      INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status, timezone)
      VALUES
        ($1, $2, 'C-A1', 'Alpha Center North', 'North Rd', 'TownA', 'DistA', 'StateA', '416001', '+919876543210', 'ACTIVE', 'Asia/Kolkata'),
        ($3, $2, 'C-A2', 'Alpha Center South', 'South Rd', 'TownA', 'DistA', 'StateA', '416002', '+919876543211', 'ACTIVE', 'Asia/Kolkata'),
        ($4, $5, 'C-B1', 'Beta Central', 'Beta Rd', 'TownB', 'DistB', 'StateB', '416003', '+919876543212', 'ACTIVE', 'Asia/Kolkata')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code, status = 'ACTIVE';
    `, [centerAlpha1, orgAlpha, centerAlpha2, centerBeta, orgBeta]);

    // 3. Devices
    await db.query(`
      INSERT INTO devices (id, organization_id, center_id, device_identifier, device_type, name, status, is_blocked, public_key, device_token_hash, last_seen_at)
      VALUES
        ($1, $5, $6, 'DEV-A01', 'COUNTER_TERMINAL', 'Station Alpha Active', 'ACTIVE', false, 'pk-dev-1', 'hash-dev-1', NOW()),
        ($2, $5, $6, 'DEV-A02', 'COUNTER_TERMINAL', 'Station Alpha Degraded', 'ACTIVE', false, 'pk-dev-2', 'hash-dev-2', NOW() - INTERVAL '1 minute'),
        ($3, $5, $7, 'DEV-A03', 'COUNTER_TERMINAL', 'Station Alpha Offline', 'ACTIVE', false, 'pk-dev-3', 'hash-dev-3', NOW() - INTERVAL '30 minutes'),
        ($4, $5, $6, 'DEV-A04', 'COUNTER_TERMINAL', 'Station Alpha Blocked', 'BLOCKED', true, 'pk-dev-4', 'hash-dev-4', NOW())
      ON CONFLICT (id) DO UPDATE 
      SET status = EXCLUDED.status, is_blocked = EXCLUDED.is_blocked, revoked_at = NULL,
          public_key = EXCLUDED.public_key, device_token_hash = EXCLUDED.device_token_hash,
          last_seen_at = EXCLUDED.last_seen_at, name = EXCLUDED.name, device_identifier = EXCLUDED.device_identifier;
    `, [deviceActiveId, deviceDegradedId, deviceOfflineId, deviceBlockedId, orgAlpha, centerAlpha1, centerAlpha2]);

    // 4. Device Sync State
    await db.query(`
      INSERT INTO device_sync_state (device_id, last_upstream_sync_at, pending_queue_count, battery_level, network_mode, last_heartbeat_at)
      VALUES
        ($1, NOW(), 0, 95, 'WIFI', NOW()),
        ($2, NOW() - INTERVAL '5 minutes', 25, 60, 'CELLULAR', NOW() - INTERVAL '1 minute'),
        ($3, NOW() - INTERVAL '2 hours', 0, 15, 'CELLULAR', NOW() - INTERVAL '30 minutes'),
        ($4, NOW() - INTERVAL '1 day', 0, 0, 'NONE', NOW())
      ON CONFLICT (device_id) DO UPDATE 
      SET pending_queue_count = EXCLUDED.pending_queue_count, last_upstream_sync_at = EXCLUDED.last_upstream_sync_at, last_heartbeat_at = EXCLUDED.last_heartbeat_at;
    `, [deviceActiveId, deviceDegradedId, deviceOfflineId, deviceBlockedId]);

    // 5. Operator User
    await db.query(`
      INSERT INTO users (id, organization_id, username, phone_number, full_name, role, status)
      VALUES ($1, $2, 'op_alpha_6', '+919876543210', 'Operator Alpha', 'COLLECTION_OPERATOR', 'ACTIVE')
      ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, status = 'ACTIVE';
    `, [operatorAlpha, orgAlpha]);

    // 6. Customer
    await db.query(`
      INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status)
      VALUES ($1, $2, $3, 'F-601', 'Ramesh Sharma', '+919876543210', 'ACTIVE', 'APPROVED')
      ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;
    `, [customerAlpha, orgAlpha, centerAlpha1]);

    // 7. Active Shift Session
    const sessionId = '00000000-0000-0000-0000-000000006501';
    await db.query(`
      INSERT INTO kiosk_shift_sessions (id, session_code, organization_id, center_id, device_identifier, device_name, business_date, shift, status, opened_at, opening_operator_id, total_liters, total_amount, transaction_count)
      VALUES ($1, 'SES-601', $2, $3, 'DEV-A01', 'Counter Terminal', $4, 'MORNING', 'OPEN', NOW() - INTERVAL '2 hours', $5, 25.5, 1251.0, 2)
      ON CONFLICT (id) DO UPDATE SET status = 'OPEN', business_date = $4;
    `, [sessionId, orgAlpha, centerAlpha1, today, operatorAlpha]);

    // 8. Milk Collections for Today (Verified & Replayed check)
    // 8.1 Shift
    const shiftRes = await db.query(`
      INSERT INTO collection_shifts (center_id, shift_type, start_time, end_time)
      VALUES ($1, 'MORNING', '06:00:00', '10:00:00')
      ON CONFLICT (center_id, shift_type) DO UPDATE SET start_time = EXCLUDED.start_time
      RETURNING id;
    `, [centerAlpha1]);
    const shiftId = shiftRes.rows[0].id;

    // 8.2 Rate Chart Version
    let rcvId;
    const rcvCheck = await db.query(`SELECT id FROM rate_chart_versions LIMIT 1`);
    if (rcvCheck.rows.length > 0) {
      rcvId = rcvCheck.rows[0].id;
    } else {
      const chartRes = await db.query(`
        INSERT INTO rate_charts (id, organization_id, center_id, name, milk_category, pricing_type, is_active)
        VALUES (gen_random_uuid(), $1, $2, 'Test Chart', 'COW', 'GRID', true)
        RETURNING id;
      `, [orgAlpha, centerAlpha1]);
      const verRes = await db.query(`
        INSERT INTO rate_chart_versions (id, rate_chart_id, version_number, status, pricing_unit, effective_from, base_fat, base_snf, base_rate, is_approved)
        VALUES (gen_random_uuid(), $1, 1, 'PUBLISHED', 'PER_LITER', NOW(), 3.5, 8.5, 40.0, true)
        RETURNING id;
      `, [chartRes.rows[0].id]);
      rcvId = verRes.rows[0].id;
    }

    // 8.3 Collection Sessions (one-to-one with milk_collections)
    const intakeSession1 = crypto.randomUUID();
    const intakeSession2 = crypto.randomUUID();
    await db.query(`
      INSERT INTO collection_sessions (
        id, center_id, customer_id, business_date, shift_id, shift_type,
        selected_milk_category, identification_method, session_state,
        intake_sequence_uuid, started_at, completed_at, operator_id, device_id
      ) VALUES 
        ($1, $3, $4, $5, $6, 'MORNING', 'COW', 'FACE', 'COMPLETED', gen_random_uuid(), NOW(), NOW(), $7, 'DEV-A01'),
        ($2, $3, $4, $5, $6, 'MORNING', 'BUFFALO', 'RFID', 'COMPLETED', gen_random_uuid(), NOW(), NOW(), $7, 'DEV-A01')
      ON CONFLICT (id) DO NOTHING;
    `, [intakeSession1, intakeSession2, centerAlpha1, customerAlpha, today, shiftId, operatorAlpha]);

    // 8.4 Milk Collections
    const coll1Id = '00000000-0000-0000-0000-000000006101';
    const coll2Id = '00000000-0000-0000-0000-000000006102';
    await db.query(`
      INSERT INTO milk_collections (
        id, session_id, organization_id, center_id, customer_id, 
        milk_category, net_weight, measurement_unit, fat_percentage, snf_percentage, 
        rate_chart_version_id, applied_rate_per_unit, total_amount, business_date, shift_type, 
        transaction_status, client_intake_uuid, idempotency_key, created_at, synced_at
      ) VALUES 
        ($1, $3, $4, $5, $6, 'COW', 15.5, 'LITERS', 4.2, 8.5, $7, 42.00, 651.00, $8, 'MORNING', 'COMPLETED', gen_random_uuid(), 'IDEMP-601', NOW() - INTERVAL '1 hour', NOW()),
        ($2, $9, $4, $5, $6, 'BUFFALO', 10.0, 'LITERS', 7.0, 9.0, $7, 60.00, 600.00, $8, 'MORNING', 'COMPLETED', gen_random_uuid(), 'IDEMP-602', NOW() - INTERVAL '30 minutes', NOW())
      ON CONFLICT (organization_id, idempotency_key) DO NOTHING;
    `, [coll1Id, coll2Id, intakeSession1, orgAlpha, centerAlpha1, customerAlpha, rcvId, today, intakeSession2]);
  };

  tenantDbManager.tenantPools.set(orgAlpha, db.pool);
  tenantDbManager.tenantPools.set(orgBeta, db.pool);

  await seedEnvironment();

  // Spin up test server
  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  try {
    // ========================================================================
    // SUBTEST 1: Authenticated Station Heartbeat & Telemetry Validation
    // ========================================================================
    await suite.test('1. Station Heartbeat: Updates last_seen_at, updates telemetry, rejects blocked (403)', async () => {
      // 1.1 Unauthenticated heartbeat -> 401
      const resUnauth = await fetch(`${baseUrl}/devices/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pendingQueueCount: 3 }),
      });
      assert.equal(resUnauth.status, 401, 'Unauthenticated heartbeat must return 401');

      // 1.2 Valid active station heartbeat -> 200 + updates last_seen_at
      const heartbeatPayload = {
        pendingQueueCount: 2,
        batteryLevel: 88,
        networkMode: 'WIFI',
        appVersion: '1.4.2',
        syncFailureCategory: null,
      };

      const resActive = await fetch(`${baseUrl}/devices/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deviceTokenActive}`,
          'X-Dairy-Tenant-Id': orgAlpha,
        },
        body: JSON.stringify(heartbeatPayload),
      });

      assert.equal(resActive.status, 200, 'Authenticated heartbeat should succeed with 200');
      const bodyActive = await resActive.json();
      assert.equal(bodyActive.success, true);
      assert.equal(bodyActive.data.registrationStatus, 'ACTIVE');
      assert.equal(bodyActive.data.isBlocked, false);

      // Verify PostgreSQL state directly
      const dbCheck = await db.query(
        `SELECT d.last_seen_at, dss.pending_queue_count, dss.battery_level, dss.network_mode
         FROM devices d
         LEFT JOIN device_sync_state dss ON dss.device_id = d.id
         WHERE d.id = $1;`,
        [deviceActiveId]
      );
      assert.ok(dbCheck.rows.length === 1);
      assert.equal(dbCheck.rows[0].pending_queue_count, 2);
      assert.equal(dbCheck.rows[0].battery_level, 88);
      assert.equal(dbCheck.rows[0].network_mode, 'WIFI');
      assert.ok(dbCheck.rows[0].last_seen_at !== null);

      // 1.3 Blocked station heartbeat -> 403 Forbidden
      const resBlocked = await fetch(`${baseUrl}/devices/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deviceTokenBlocked}`,
          'X-Dairy-Tenant-Id': orgAlpha,
        },
        body: JSON.stringify({ pendingQueueCount: 0 }),
      });
      assert.equal(resBlocked.status, 403, 'Blocked station heartbeat must be rejected with 403');
      const bodyBlocked = await resBlocked.json();
      assert.equal(bodyBlocked.errorCode, 'DEVICE_BLOCKED');
    });

    // ========================================================================
    // SUBTEST 2: Authoritative Overview Metrics & Scoping (PG Financial Integrity)
    // ========================================================================
    await suite.test('2. Overview Metrics: Returns real PG aggregates, enforces business date & tenant scoping', async () => {
      // 2.1 Authorized Dairy Admin query for Alpha organization
      const resAlpha = await fetch(`${baseUrl}/dairy-admin/metrics?businessDate=${today}`, {
        headers: {
          Authorization: `Bearer ${adminTokenAlpha}`,
          'X-Dairy-Tenant-Id': orgAlpha,
        },
      });
      assert.equal(resAlpha.status, 200);
      const bodyAlpha = await resAlpha.json();
      assert.equal(bodyAlpha.success, true);

      const m = bodyAlpha.data;
      assert.equal(m.businessDate, today);
      assert.equal(m.organizationId, orgAlpha);
      assert.equal(m.totalMilkLiters, 25.5); // 15.5 cow + 10.0 buffalo
      assert.equal(m.cowLiters, 15.5);
      assert.equal(m.buffaloLiters, 10.0);
      assert.equal(m.totalAmount, 1251.0); // 651 + 600
      assert.equal(m.transactionCount, 2);
      assert.equal(m.activeSessionsCount, 1);
      assert.equal(m.totalStationsCount, 4);
      assert.equal(m.onlineStationsCount, 1); // Station 1 has heartbeat < 3m and queue <= 10
      assert.equal(m.degradedStationsCount, 1); // Station 2 has queue = 25 (> 10)
      assert.equal(m.offlineStationsCount, 1); // Station 3 last seen 30m ago (> 15m)
      assert.equal(m.blockedStationsCount, 1); // Station 4 is blocked
      assert.ok(m.lastCollectionTime !== null);

      // 2.2 Cross-Tenant Access Protection: Admin Alpha attempting to query Beta -> 403
      const resCrossTenant = await fetch(`${baseUrl}/dairy-admin/metrics?organizationId=${orgBeta}`, {
        headers: {
          Authorization: `Bearer ${adminTokenAlpha}`,
          'X-Dairy-Tenant-Id': orgBeta,
        },
      });
      assert.equal(resCrossTenant.status, 403, 'Cross-tenant access must return 403 Forbidden');
      const crossBody = await resCrossTenant.json();
      assert.equal(crossBody.errorCode, 'CROSS_TENANT_ACCESS_DENIED');

      // 2.3 Cross-Center Access Protection: Admin Alpha requesting Center Beta -> 403
      const resCrossCenter = await fetch(`${baseUrl}/dairy-admin/metrics?centerId=${centerBeta}`, {
        headers: {
          Authorization: `Bearer ${adminTokenAlpha}`,
          'X-Dairy-Tenant-Id': orgAlpha,
        },
      });
      assert.equal(resCrossCenter.status, 403, 'Cross-center unauthorized access must return 403');
      const crossCenterBody = await resCrossCenter.json();
      assert.equal(crossCenterBody.errorCode, 'UNAUTHORIZED_CENTER_ACCESS');
    });

    // ========================================================================
    // SUBTEST 3: Centre-Wise Live Metrics & Center Scoping
    // ========================================================================
    await suite.test('3. Centre-Wise Live Overview: Returns authorized center breakdown with telemetry', async () => {
      const res = await fetch(`${baseUrl}/dairy-admin/centers/metrics?businessDate=${today}`, {
        headers: {
          Authorization: `Bearer ${adminTokenAlpha}`,
          'X-Dairy-Tenant-Id': orgAlpha,
        },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.ok(Array.isArray(body.data));

      const centerNorth = body.data.find((c) => c.centerId === centerAlpha1);
      assert.ok(centerNorth, 'Alpha Center North must be in results');
      assert.equal(centerNorth.totalCollections, 2);
      assert.equal(centerNorth.totalLiters, 25.5);
      assert.equal(centerNorth.totalAmount, 1251.0);
      assert.equal(centerNorth.status, 'OPEN');
      assert.ok(centerNorth.activeSession !== null);
      assert.equal(centerNorth.activeSession.shift, 'MORNING');
    });

    // ========================================================================
    // SUBTEST 4: Live Collection Feed & PII Redaction
    // ========================================================================
    await suite.test('4. Live Collection Feed: Redacts PII, masks farmer names, prevents duplicate replay feed items', async () => {
      const res = await fetch(`${baseUrl}/dairy-admin/collections/feed?limit=10`, {
        headers: {
          Authorization: `Bearer ${adminTokenAlpha}`,
          'X-Dairy-Tenant-Id': orgAlpha,
        },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.ok(Array.isArray(body.data));
      assert.equal(body.data.length, 2);

      const firstItem = body.data[0];
      assert.ok(firstItem.maskedFarmerName, 'Farmer name must be present and masked');
      assert.ok(!firstItem.maskedFarmerName.includes('+91'), 'Mobile number must never be in farmer name');
      assert.ok(!firstItem.mobileNumber, 'Raw mobileNumber must NOT be exposed in feed');
      assert.ok(!firstItem.bankDetails, 'Bank details must NOT be exposed in feed');
      assert.equal(firstItem.financialStatus, 'COMPLETED');
      assert.equal(firstItem.syncStatus, 'SYNCED_CLOUD');
    });

    // ========================================================================
    // SUBTEST 5: Station Monitoring & Classification Logic
    // ========================================================================
    await suite.test('5. Station Monitoring: Status classification (ONLINE, DEGRADED, OFFLINE, BLOCKED)', async () => {
      const res = await fetch(`${baseUrl}/dairy-admin/stations`, {
        headers: {
          Authorization: `Bearer ${adminTokenAlpha}`,
          'X-Dairy-Tenant-Id': orgAlpha,
        },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.ok(Array.isArray(body.data));

      const s1 = body.data.find((s) => s.deviceId === deviceActiveId);
      const s2 = body.data.find((s) => s.deviceId === deviceDegradedId);
      const s3 = body.data.find((s) => s.deviceId === deviceOfflineId);
      const s4 = body.data.find((s) => s.deviceId === deviceBlockedId);

      assert.equal(s1?.statusClassification, 'ONLINE', 'Active station with recent heartbeat & clean queue is ONLINE');
      assert.equal(s2?.statusClassification, 'DEGRADED', 'Station with pending queue > 10 is DEGRADED');
      assert.equal(s3?.statusClassification, 'OFFLINE', 'Station with heartbeat > 15m ago is OFFLINE');
      assert.equal(s4?.statusClassification, 'BLOCKED', 'Blocked/revoked station is BLOCKED regardless of heartbeats');
    });

    // ========================================================================
    // SUBTEST 6: Administrative Block and Unblock Actions
    // ========================================================================
    await suite.test('6. Station Admin Actions: Block hardware revokes access and unblock restores it', async () => {
      // 6.1 Block active station 1
      const resBlock = await fetch(`${baseUrl}/dairy-admin/stations/${deviceActiveId}/block`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminTokenAlpha}`,
          'X-Dairy-Tenant-Id': orgAlpha,
        },
        body: JSON.stringify({ reason: 'Hardware inspection pending' }),
      });
      assert.equal(resBlock.status, 200);
      const blockBody = await resBlock.json();
      assert.equal(blockBody.success, true);

      // Verify device is now blocked in DB
      const dbBlocked = await db.query(`SELECT status, is_blocked, revocation_reason FROM devices WHERE id = $1;`, [deviceActiveId]);
      assert.equal(dbBlocked.rows[0].status, 'BLOCKED');
      assert.equal(dbBlocked.rows[0].is_blocked, true);
      assert.equal(dbBlocked.rows[0].revocation_reason, 'Hardware inspection pending');

      // Heartbeat from station 1 must now be rejected with 403
      const resHbAfterBlock = await fetch(`${baseUrl}/devices/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deviceTokenActive}`,
          'X-Dairy-Tenant-Id': orgAlpha,
        },
        body: JSON.stringify({ pendingQueueCount: 0 }),
      });
      assert.equal(resHbAfterBlock.status, 403, 'Blocked station heartbeat must be rejected');

      // 6.2 Unblock station 1
      const resUnblock = await fetch(`${baseUrl}/dairy-admin/stations/${deviceActiveId}/unblock`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminTokenAlpha}`,
          'X-Dairy-Tenant-Id': orgAlpha,
        },
      });
      assert.equal(resUnblock.status, 200);
      const unblockBody = await resUnblock.json();
      assert.equal(unblockBody.success, true);

      // Verify device is restored in DB
      const dbUnblocked = await db.query(`SELECT status, is_blocked, revocation_reason FROM devices WHERE id = $1;`, [deviceActiveId]);
      assert.equal(dbUnblocked.rows[0].status, 'ACTIVE');
      assert.equal(dbUnblocked.rows[0].is_blocked, false);
      assert.equal(dbUnblocked.rows[0].revocation_reason, null);
    });

    // ========================================================================
    // SUBTEST 7: Realtime SSE Stream Handshake & Broadcast (via Secure Ticket or Auth Header)
    // ========================================================================
    await suite.test('7. Realtime SSE: Connects with secure ticket, rejects raw ?token= (400), emits CONNECTED handshake', async () => {
      // 7.1 Verify raw ?token= is explicitly rejected with 400
      const resRawToken = await fetch(`${baseUrl}/dairy-admin/events?token=${encodeURIComponent(adminTokenAlpha)}`, {
        headers: { Accept: 'text/event-stream' },
      });
      assert.equal(resRawToken.status, 400, 'Raw JWT in query token must be rejected with 400');
      const rawTokenBody = await resRawToken.json();
      assert.ok(
        rawTokenBody.errorCode === 'EXPOSED_QUERY_TOKEN_FORBIDDEN' || rawTokenBody.errorCode === 'NORMAL_JWT_IN_QUERY_FORBIDDEN',
        `Expected query token error code, got: ${rawTokenBody.errorCode}`
      );

      // 7.2 Acquire purpose-specific short-lived ticket
      const ticketRes = await fetch(`${baseUrl}/dairy-admin/events/ticket`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminTokenAlpha}`,
          'X-Dairy-Tenant-Id': orgAlpha,
        },
      });
      assert.equal(ticketRes.status, 200, 'Ticket generation must return 200');
      const ticketData = await ticketRes.json();
      const sseTicket = ticketData.ticket || ticketData.data?.ticket;
      assert.ok(sseTicket, 'Must return signed ticket');

      const sseController = new AbortController();
      const ssePromise = new Promise((resolve, reject) => {
        let buffer = '';
        const clientReq = http.get(
          `${baseUrl}/dairy-admin/events?ticket=${encodeURIComponent(sseTicket)}`,
          {
            headers: {
              Accept: 'text/event-stream',
            },
          },
          (res) => {
            assert.equal(res.statusCode, 200);
            assert.ok(res.headers['content-type']?.includes('text/event-stream'));

            res.on('data', (chunk) => {
              buffer += chunk.toString();
              if (buffer.includes('event: CONNECTED')) {
                resolve({ connected: true, buffer });
                clientReq.destroy();
              }
            });
          }
        );

        clientReq.on('error', (err) => {
          if (err.name !== 'AbortError') reject(err);
        });

        setTimeout(() => {
          clientReq.destroy();
          resolve({ connected: false, buffer });
        }, 5000);
      });

      const sseResult = await ssePromise;
      assert.ok(sseResult.connected, `Expected SSE connection to receive CONNECTED handshake, got: ${sseResult.buffer}`);
    });

  } finally {
    realtimePublisher.destroy();
    tenantDbManager.tenantPools.delete(orgAlpha);
    tenantDbManager.tenantPools.delete(orgBeta);
    await new Promise((resolve) => server.close(resolve));
    // Clean up test records
    await db.query(`
      DELETE FROM milk_collections WHERE organization_id IN ($1, $2);
      DELETE FROM collection_sessions WHERE center_id IN ($7, $8, $9);
      DELETE FROM collection_shifts WHERE center_id IN ($7, $8, $9);
      DELETE FROM kiosk_shift_sessions WHERE organization_id IN ($1, $2);
      DELETE FROM device_sync_state WHERE device_id IN ($3, $4, $5, $6);
      DELETE FROM devices WHERE organization_id IN ($1, $2);
      DELETE FROM customers WHERE organization_id IN ($1, $2);
      DELETE FROM users WHERE organization_id IN ($1, $2);
      DELETE FROM dairy_centers WHERE organization_id IN ($1, $2);
      DELETE FROM organizations WHERE id IN ($1, $2);
    `, [orgAlpha, orgBeta, deviceActiveId, deviceDegradedId, deviceOfflineId, deviceBlockedId, centerAlpha1, centerAlpha2, centerBeta]).catch(() => {});
    await db.close();
  }
});
