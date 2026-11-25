// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// PROMPT 6.2: FINAL MULTI-INSTANCE, SSE REPLAY & PRODUCTION RELIABILITY GATE
// REAL POSTGRESQL + INDEPENDENT TWO-INSTANCE INTEGRATION TEST SUITE
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { db } from '../dist/infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../dist/infrastructure/database/TenantDatabaseManager.js';
import { HmacJwtTokenService } from '../dist/infrastructure/security/HmacJwtTokenService.js';
import { sseTicketService, SseTicketService } from '../dist/infrastructure/security/SseTicketService.js';
import { createApp } from '../dist/app.js';
import { RealtimeEventPublisher } from '../dist/infrastructure/realtime/RealtimeEventPublisher.js';
import { RateService } from '../dist/modules/rates/rate.service.js';

test('PROMPT 6.2: Multi-Instance, Distributed SSE Replay, Device Coverage & SHA-256 ETag Gate Suite', async (suite) => {
  let isConnected = await db.checkConnection();
  if (!isConnected) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    isConnected = await db.checkConnection();
  }
  if (!isConnected) {
    console.log('[PROMPT 6.2 TEST] Real PostgreSQL connection is unavailable. Suite skipped.');
    await db.close();
    suite.skip('Real PostgreSQL environment unavailable');
    return;
  }

  const runSuffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  const orgAlpha = '00000000-0000-0000-0000-0000000062a1';
  const orgBeta = '00000000-0000-0000-0000-0000000062b2';
  const centerAlpha1 = '00000000-0000-0000-0000-0000000062c1';
  const centerAlpha2 = '00000000-0000-0000-0000-0000000062c2';
  const centerBeta1 = '00000000-0000-0000-0000-0000000062c3';

  const adminAlphaId = '00000000-0000-0000-0000-0000000062d1';
  const operatorAlphaId = '00000000-0000-0000-0000-0000000062d2';
  const customerAlphaId = '00000000-0000-0000-0000-0000000062e1';

  const deviceActiveId = '00000000-0000-0000-0000-0000000062f1';
  const deviceBlockedId = '00000000-0000-0000-0000-0000000062f2';
  const deviceRevokedId = '00000000-0000-0000-0000-0000000062f3';

  const tokenService = new HmacJwtTokenService();

  const adminTokenAlpha = tokenService.signToken({
    userId: adminAlphaId,
    organizationId: orgAlpha,
    role: 'PRIMARY_DAIRY_ADMIN',
    actorType: 'STAFF',
    fullName: 'Dairy Admin Alpha',
  });

  const adminTokenBeta = tokenService.signToken({
    userId: '00000000-0000-0000-0000-0000000062d3',
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

  // Seed DB fixtures
  const setupDbFixtures = async () => {
    tenantDbManager.tenantPools.set(orgAlpha, db.pool);
    tenantDbManager.tenantPools.set(orgBeta, db.pool);

    await db.query(`
      CREATE TABLE IF NOT EXISTS sse_ticket_redemptions (
        jti VARCHAR(64) PRIMARY KEY,
        user_id UUID,
        organization_id UUID,
        expires_at TIMESTAMPTZ NOT NULL,
        redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_sse_ticket_redemptions_exp ON sse_ticket_redemptions (expires_at);

      INSERT INTO organizations (id, name, code, status)
      VALUES 
        ('${orgAlpha}', 'Prompt 6.2 Alpha Dairy ${runSuffix}', 'COOP-P62A-${runSuffix}', 'ACTIVE'),
        ('${orgBeta}', 'Prompt 6.2 Beta Dairy ${runSuffix}', 'COOP-P62B-${runSuffix}', 'ACTIVE')
      ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE';

      INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status, timezone)
      VALUES 
        ('${centerAlpha1}', '${orgAlpha}', 'C62-A1', 'Alpha Center 1', 'Line 1', 'Town A', 'District A', 'MH', '416001', '+919822006201', 'ACTIVE', 'Asia/Kolkata'),
        ('${centerAlpha2}', '${orgAlpha}', 'C62-A2', 'Alpha Center 2', 'Line 2', 'Town A', 'District A', 'MH', '416002', '+919822006202', 'ACTIVE', 'Asia/Kolkata'),
        ('${centerBeta1}', '${orgBeta}', 'C62-B1', 'Beta Center 1', 'Line 1', 'Town B', 'District B', 'MH', '416003', '+919822006203', 'ACTIVE', 'Asia/Kolkata')
      ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE';

      INSERT INTO users (id, organization_id, username, phone_number, full_name, role, status)
      VALUES 
        ('${adminAlphaId}', '${orgAlpha}', 'admin_p62_alpha', '+919822006211', 'Admin Alpha', 'PRIMARY_DAIRY_ADMIN', 'ACTIVE'),
        ('${operatorAlphaId}', '${orgAlpha}', 'op_p62_alpha', '+919822006212', 'Operator Alpha', 'COLLECTION_OPERATOR', 'ACTIVE')
      ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE';

      INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status, is_deleted)
      VALUES ('${customerAlphaId}', '${orgAlpha}', '${centerAlpha1}', 'F62-01', 'Ramesh Patil', '+919822006221', 'ACTIVE', 'APPROVED', FALSE)
      ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', is_deleted = FALSE;

      INSERT INTO devices (id, organization_id, center_id, device_identifier, name, device_type, status, is_blocked, public_key, device_token_hash, revoked_at, last_seen_at)
      VALUES 
        ('${deviceActiveId}', '${orgAlpha}', '${centerAlpha1}', 'DEV-ACTIVE-${runSuffix}', 'Active Kiosk 01', 'COUNTER_TERMINAL', 'ACTIVE', FALSE, 'pk-active', 'hash-active', NULL, NOW()),
        ('${deviceBlockedId}', '${orgAlpha}', '${centerAlpha1}', 'DEV-BLOCKED-${runSuffix}', 'Blocked Kiosk 02', 'COUNTER_TERMINAL', 'BLOCKED', TRUE, 'pk-blocked', 'hash-blocked', NULL, NOW()),
        ('${deviceRevokedId}', '${orgAlpha}', '${centerAlpha1}', 'DEV-REVOKED-${runSuffix}', 'Revoked Kiosk 03', 'COUNTER_TERMINAL', 'DECOMMISSIONED', FALSE, NULL, NULL, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        organization_id = EXCLUDED.organization_id,
        center_id = EXCLUDED.center_id,
        status = EXCLUDED.status,
        is_blocked = EXCLUDED.is_blocked,
        public_key = EXCLUDED.public_key,
        device_token_hash = EXCLUDED.device_token_hash,
        revoked_at = EXCLUDED.revoked_at;
    `);
  };

  await setupDbFixtures();

  // Spin up two independent Express HTTP servers simulating a multi-instance deployment
  const app1 = createApp();
  const server1 = http.createServer(app1);
  await new Promise((resolve) => server1.listen(0, '127.0.0.1', resolve));
  const port1 = server1.address().port;

  const app2 = createApp();
  const server2 = http.createServer(app2);
  await new Promise((resolve) => server2.listen(0, '127.0.0.1', resolve));
  const port2 = server2.address().port;

  const makeRequest = (port, path, options = {}) => {
    return new Promise((resolve, reject) => {
      const headers = { ...(options.headers || {}) };
      let bodyData = null;
      if (options.body) {
        bodyData = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
        if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(bodyData);
      }

      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method: options.method || 'GET',
          headers,
        },
        (res) => {
          if (res.statusCode === 200 && path.includes('/events') && !path.includes('/ticket')) {
            // Streaming SSE response
            let firstData = '';
            res.on('data', (d) => {
              firstData += d.toString();
            });
            setTimeout(() => {
              res.destroy();
              req.destroy();
              resolve({
                statusCode: 200,
                headers: res.headers,
                text: firstData,
                json: null,
              });
            }, 300);
            return;
          }

          let chunks = '';
          res.on('data', (d) => (chunks += d));
          res.on('end', () => {
            let json = null;
            try {
              json = JSON.parse(chunks);
            } catch {}
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              text: chunks,
              json,
            });
          });
        }
      );

      req.on('error', (err) => {
        if (req.destroyed) return;
        reject(err);
      });
      if (bodyData) req.write(bodyData);
      req.end();
    });
  };

  const connectSseClient = (port, path) => {
    const events = [];
    const req = http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      res.on('data', (chunk) => {
        const str = chunk.toString();
        if (str.includes('event:') || str.includes('data:')) {
          events.push(str);
        }
      });
    });
    req.on('error', () => {});
    return {
      events,
      close: () => {
        req.destroy();
      },
    };
  };

  // ============================================================================
  // 1. DISTRIBUTED SINGLE-USE SSE TICKET SECURITY & TWO-INSTANCE CONCURRENT REPLAY
  // ============================================================================
  await suite.test('1. Distributed Single-Use SSE Ticket: Atomic redemption across 2 backend instances', async (t) => {
    // 1.1 Issue a valid SSE ticket via Instance 1
    const ticketRes = await makeRequest(port1, '/api/v1/dairy-admin/events/ticket', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminTokenAlpha}`,
        'X-Dairy-Tenant-Id': orgAlpha,
      },
    });

    assert.equal(ticketRes.statusCode, 200);
    assert.equal(ticketRes.json.success, true);
    const ticket = ticketRes.json.ticket;
    assert.ok(ticket, 'SSE ticket must be returned');

    // 1.2 Attempt concurrent redemption against Instance 1 and Instance 2 simultaneously
    const [redemption1, redemption2] = await Promise.all([
      makeRequest(port1, `/api/v1/dairy-admin/events?ticket=${ticket}&organizationId=${orgAlpha}`),
      makeRequest(port2, `/api/v1/dairy-admin/events?ticket=${ticket}&organizationId=${orgAlpha}`),
    ]);

    // Exactly one instance must succeed with 200 (streaming SSE headers), and the other MUST fail with 401
    const statuses = [redemption1.statusCode, redemption2.statusCode];
    assert.ok(statuses.includes(200), 'Exactly one backend instance must successfully redeem the ticket (200)');
    assert.ok(statuses.includes(401), 'The other backend instance must reject the concurrent ticket redemption (401)');

    const failedRes = redemption1.statusCode === 401 ? redemption1 : redemption2;
    assert.match(
      failedRes.json?.error || failedRes.text,
      /already been consumed|ticket reuse prevented/i,
      'Rejection must cite ticket already consumed'
    );

    // 1.3 Sequential replay against the second instance within validity window must fail
    const replayRes = await makeRequest(port2, `/api/v1/dairy-admin/events?ticket=${ticket}&organizationId=${orgAlpha}`);
    assert.equal(replayRes.statusCode, 401, 'Sequential ticket replay must be rejected with 401');
    assert.match(replayRes.json?.error || replayRes.text, /already been consumed/i);

    // 1.4 Restarting a backend node does NOT make previously redeemed ticket valid again
    // Spin up server3 (representing a freshly restarted backend instance)
    const app3 = createApp();
    const server3 = http.createServer(app3);
    await new Promise((resolve) => server3.listen(0, '127.0.0.1', resolve));
    const port3 = server3.address().port;

    try {
      const restartedRes = await makeRequest(port3, `/api/v1/dairy-admin/events?ticket=${ticket}&organizationId=${orgAlpha}`);
      assert.equal(restartedRes.statusCode, 401, 'Restarted backend instance must reject previously redeemed ticket (401)');
      assert.match(restartedRes.json?.error || restartedRes.text, /already been consumed/i);
    } finally {
      server3.close();
    }

    // 1.5 Tampered / forged ticket signature fails closed
    const tamperedTicket = ticket.slice(0, -6) + 'ABCDEF';
    const tamperedRes = await makeRequest(port1, `/api/v1/dairy-admin/events?ticket=${tamperedTicket}&organizationId=${orgAlpha}`);
    assert.equal(tamperedRes.statusCode, 401);
    assert.match(tamperedRes.json?.error || tamperedRes.text, /Invalid SSE ticket signature/i);

    // 1.6 Fresh ticket acquisition succeeds cleanly
    const freshTicketRes = await makeRequest(port2, '/api/v1/dairy-admin/events/ticket', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminTokenAlpha}`,
        'X-Dairy-Tenant-Id': orgAlpha,
      },
    });
    assert.equal(freshTicketRes.statusCode, 200);
    assert.notEqual(freshTicketRes.json.ticket, ticket, 'Every ticket request must generate a distinct single-use ticket');
  });

  // ============================================================================
  // 2. MULTI-NODE SSE BROADCAST & DURABLE POSTGRESQL OUTBOX FAN-OUT
  // ============================================================================
  await suite.test('2. Multi-Node SSE Broadcast: Outbox delivery across independent backend nodes with tenant isolation', async (t) => {
    // 2.1 Acquire fresh tickets for client on Node 1 (Alpha) and client on Node 2 (Alpha)
    const [t1Res, t2Res, tBetaRes] = await Promise.all([
      makeRequest(port1, '/api/v1/dairy-admin/events/ticket', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminTokenAlpha}`, 'X-Dairy-Tenant-Id': orgAlpha },
      }),
      makeRequest(port2, '/api/v1/dairy-admin/events/ticket', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminTokenAlpha}`, 'X-Dairy-Tenant-Id': orgAlpha },
      }),
      makeRequest(port1, '/api/v1/dairy-admin/events/ticket', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminTokenBeta}`, 'X-Dairy-Tenant-Id': orgBeta },
      }),
    ]);

    const ticketNode1Alpha = t1Res.json.ticket;
    const ticketNode2Alpha = t2Res.json.ticket;
    const ticketNode1Beta = tBetaRes.json.ticket;

    // Connect SSE client to Node 1 (Tenant Alpha)
    const clientNode1 = connectSseClient(
      port1,
      `/api/v1/dairy-admin/events?ticket=${ticketNode1Alpha}&organizationId=${orgAlpha}`
    );

    // Connect SSE client to Node 2 (Tenant Alpha)
    const clientNode2 = connectSseClient(
      port2,
      `/api/v1/dairy-admin/events?ticket=${ticketNode2Alpha}&organizationId=${orgAlpha}`
    );

    // Connect SSE client to Node 1 for Tenant Beta (isolation test)
    const clientNode1Beta = connectSseClient(
      port1,
      `/api/v1/dairy-admin/events?ticket=${ticketNode1Beta}&organizationId=${orgBeta}`
    );

    // Wait for connection handshakes
    await new Promise((r) => setTimeout(r, 600));

    // 2.2 Publish an outbox event transactionally for Tenant Alpha on Node 1
    const testEventId = `EVT-MN-${Date.now()}-${runSuffix}`;
    const publisher = RealtimeEventPublisher.getInstance();

    await db.withTransaction(async (client) => {
      await publisher.publishOutboxEvent(client, {
        eventType: 'COLLECTION_ACCEPTED',
        organizationId: orgAlpha,
        centerId: centerAlpha1,
        entityId: 'TX-MN-01',
        payload: {
          transactionId: 'TX-MN-01',
          milkCategory: 'COW',
          weightLiters: 12.5,
          totalAmount: 512.50,
        },
      });
    });

    // Also directly invoke broadcast on Node 1 (simulating immediate publisher dispatch)
    publisher.broadcast({
      eventId: testEventId,
      eventType: 'COLLECTION_ACCEPTED',
      schemaVersion: 1,
      organizationId: orgAlpha,
      centerId: centerAlpha1,
      entityId: 'TX-MN-01',
      aggregateVersion: 1,
      occurredAt: new Date().toISOString(),
      publishedAt: new Date().toISOString(),
      payload: {
        transactionId: 'TX-MN-01',
        milkCategory: 'COW',
        weightLiters: 12.5,
        totalAmount: 512.50,
      },
    });

    // Allow cross-instance outbox worker sync tick (runs every 1000ms)
    await new Promise((r) => setTimeout(r, 1600));

    // Close connections
    clientNode1.close();
    clientNode2.close();
    clientNode1Beta.close();

    // 2.3 Verify Client on Node 1 received the event
    assert.ok(
      clientNode1.events.some((e) => e.includes(testEventId) || e.includes('COLLECTION_ACCEPTED')),
      'Client connected to Node 1 must receive the published event'
    );

    // 2.4 Verify Client on Node 2 received the event via outbox fan-out
    assert.ok(
      clientNode2.events.some((e) => e.includes(testEventId) || e.includes('COLLECTION_ACCEPTED')),
      'Client connected to Node 2 must receive the event delivered via outbox cross-node dispatch'
    );

    // 2.5 Verify Client for Tenant Beta did NOT receive any Tenant Alpha events (Zero cross-tenant leak)
    assert.ok(
      !clientNode1Beta.events.some((e) => e.includes(testEventId) || e.includes('TX-MN-01')),
      'Client belonging to Tenant Beta must receive zero events from Tenant Alpha (Strict cross-tenant boundary)'
    );

    // 2.6 Verify durable outbox record exists in PostgreSQL
    const outboxCheck = await db.query(
      `SELECT status, published_at FROM dashboard_events_outbox WHERE event_id = $1;`,
      [testEventId]
    );
    assert.equal(outboxCheck.rows.length, 1);
    assert.equal(outboxCheck.rows[0].status, 'PUBLISHED');
  });

  // ============================================================================
  // 3. OUTBOX RETENTION CLEANUP SAFETY GATE
  // ============================================================================
  await suite.test('3. Outbox Retention: Purges only expired published events, never pending or recent events', async (t) => {
    const publisher = RealtimeEventPublisher.getInstance();

    const pendingEvtId = `EVT-RET-PENDING-${Date.now()}`;
    const recentPubEvtId = `EVT-RET-RECENT-${Date.now()}`;
    const expiredPubEvtId = `EVT-RET-EXPIRED-${Date.now()}`;

    // 3.1 Seed test outbox events: PENDING, Recent PUBLISHED, and Expired PUBLISHED (10 days old)
    await db.query(`
      INSERT INTO dashboard_events_outbox (event_id, event_type, organization_id, entity_id, status, created_at, payload)
      VALUES ('${pendingEvtId}', 'COLLECTION_SYNCED', '${orgAlpha}', 'ENT-P', 'PENDING', NOW() - INTERVAL '10 days', '{"test":true}');

      INSERT INTO dashboard_events_outbox (event_id, event_type, organization_id, entity_id, status, published_at, created_at, payload)
      VALUES ('${recentPubEvtId}', 'COLLECTION_SYNCED', '${orgAlpha}', 'ENT-R', 'PUBLISHED', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days', '{"test":true}');

      INSERT INTO dashboard_events_outbox (event_id, event_type, organization_id, entity_id, status, published_at, created_at, payload)
      VALUES ('${expiredPubEvtId}', 'COLLECTION_SYNCED', '${orgAlpha}', 'ENT-E', 'PUBLISHED', NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days', '{"test":true}');
    `);

    // 3.2 Execute retention cleanup (retention window = 7 days, batch = 500)
    const purged = await publisher.purgeOldOutboxEvents(7, 500);
    assert.ok(purged >= 1, 'Should purge at least 1 expired event');

    // 3.3 Verify Expired PUBLISHED event WAS purged
    const expiredCheck = await db.query(
      `SELECT id FROM dashboard_events_outbox WHERE event_id = $1;`,
      [expiredPubEvtId]
    );
    assert.equal(expiredCheck.rows.length, 0, 'Expired PUBLISHED outbox event must be deleted');

    // 3.4 Verify PENDING event was NEVER purged (even though created_at > 7 days ago)
    const pendingCheck = await db.query(
      `SELECT id FROM dashboard_events_outbox WHERE event_id = $1;`,
      [pendingEvtId]
    );
    assert.equal(pendingCheck.rows.length, 1, 'PENDING outbox events must NEVER be deleted by retention worker');

    // 3.5 Verify Recent PUBLISHED event was NEVER purged (within 7-day recovery window)
    const recentCheck = await db.query(
      `SELECT id FROM dashboard_events_outbox WHERE event_id = $1;`,
      [recentPubEvtId]
    );
    assert.equal(recentCheck.rows.length, 1, 'Recent PUBLISHED events within recovery window must NEVER be deleted');

    // Clean up test events
    await db.query(`DELETE FROM dashboard_events_outbox WHERE event_id IN ($1, $2);`, [pendingEvtId, recentPubEvtId]);
  });

  // ============================================================================
  // 4. DEVICE ENDPOINT COVERAGE & PERMANENT REVOCATION / BLOCKING GATE
  // ============================================================================
  await suite.test('4. Device Endpoints: Blocked and permanently revoked devices rejected across all protected operations', async (t) => {
    // Endpoints to verify for device authorization:
    // A. POST /api/v1/devices/heartbeat
    // B. POST /api/v1/devices/:id/mapping
    // C. POST /api/v1/devices/:id/calibration
    // D. GET /api/v1/devices/:id/calibration
    // E. POST /api/v1/sync/push
    // F. GET /api/v1/sync/pull
    // G. POST /api/v1/sync/acknowledge
    // H. GET /api/v1/sync/status
    // I. POST /api/v1/collections/bulk

    // 4.1 Active device succeeds on heartbeat
    const activeHeartbeat = await makeRequest(port1, '/api/v1/devices/heartbeat', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${deviceTokenActive}`,
        'X-Dairy-Tenant-Id': orgAlpha,
      },
      body: { deviceId: deviceActiveId, clientAppVersion: 'v2.4.1', pendingQueueCount: 0 },
    });
    assert.equal(activeHeartbeat.statusCode, 200);
    assert.equal(activeHeartbeat.json.success, true);

    // 4.2 Blocked device fails with 403 on heartbeat
    const blockedHeartbeat = await makeRequest(port1, '/api/v1/devices/heartbeat', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${deviceTokenBlocked}`,
        'X-Dairy-Tenant-Id': orgAlpha,
      },
      body: { deviceId: deviceBlockedId },
    });
    assert.equal(blockedHeartbeat.statusCode, 403);
    assert.equal(blockedHeartbeat.json.errorCode, 'DEVICE_BLOCKED');

    // 4.3 Permanently Revoked device fails with 403 on heartbeat
    const revokedHeartbeat = await makeRequest(port1, '/api/v1/devices/heartbeat', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${deviceTokenRevoked}`,
        'X-Dairy-Tenant-Id': orgAlpha,
      },
      body: { deviceId: deviceRevokedId },
    });
    assert.equal(revokedHeartbeat.statusCode, 403);
    assert.equal(revokedHeartbeat.json.errorCode, 'DEVICE_REVOKED');

    // 4.4 Mapping endpoint (/devices/:id/mapping) rejects blocked and revoked devices
    const blockedMapping = await makeRequest(port1, `/api/v1/devices/${deviceBlockedId}/mapping`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${deviceTokenBlocked}`,
        'X-Dairy-Tenant-Id': orgAlpha,
      },
      body: { centerId: centerAlpha1, counterLabel: 'Counter 1' },
    });
    assert.equal(blockedMapping.statusCode, 403, 'Blocked device must be rejected on mapping route');
    assert.equal(blockedMapping.json.errorCode, 'DEVICE_BLOCKED');

    const revokedMapping = await makeRequest(port1, `/api/v1/devices/${deviceRevokedId}/mapping`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${deviceTokenRevoked}`,
        'X-Dairy-Tenant-Id': orgAlpha,
      },
      body: { centerId: centerAlpha1, counterLabel: 'Counter 1' },
    });
    assert.equal(revokedMapping.statusCode, 403, 'Revoked device must be rejected on mapping route');
    assert.equal(revokedMapping.json.errorCode, 'DEVICE_REVOKED');

    // 4.5 Calibration endpoint (/devices/:id/calibration) rejects blocked and revoked devices
    const blockedCalibration = await makeRequest(port1, `/api/v1/devices/${deviceBlockedId}/calibration`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${deviceTokenBlocked}`,
        'X-Dairy-Tenant-Id': orgAlpha,
      },
      body: { calibratedBy: 'Tester' },
    });
    assert.equal(blockedCalibration.statusCode, 403, 'Blocked device must be rejected on calibration post');
    assert.equal(blockedCalibration.json.errorCode, 'DEVICE_BLOCKED');

    const blockedCalibGet = await makeRequest(port1, `/api/v1/devices/${deviceBlockedId}/calibration`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${deviceTokenBlocked}`,
        'X-Dairy-Tenant-Id': orgAlpha,
      },
    });
    assert.equal(blockedCalibGet.statusCode, 403, 'Blocked device must be rejected on calibration get');

    // 4.6 Sync endpoints (/sync/pull, /sync/push, /sync/status) reject blocked device
    const blockedSyncPull = await makeRequest(port1, `/api/v1/sync/pull?deviceId=${deviceBlockedId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${deviceTokenBlocked}`,
        'X-Dairy-Tenant-Id': orgAlpha,
      },
    });
    assert.equal(blockedSyncPull.statusCode, 403, 'Blocked device must be rejected on sync pull');

    const revokedSyncPull = await makeRequest(port1, `/api/v1/sync/pull?deviceId=${deviceRevokedId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${deviceTokenRevoked}`,
        'X-Dairy-Tenant-Id': orgAlpha,
      },
    });
    assert.equal(revokedSyncPull.statusCode, 403, 'Revoked device must be rejected on sync pull');

    // 4.7 Collections bulk sync rejects blocked and revoked devices
    const blockedBulkSync = await makeRequest(port1, '/api/v1/collections/bulk', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${deviceTokenBlocked}`,
        'X-Dairy-Tenant-Id': orgAlpha,
      },
      body: {
        batchId: `BATCH-BLK-${Date.now()}`,
        deviceId: deviceBlockedId,
        transactions: [
          {
            clientIntakeUuid: crypto.randomUUID(),
            customerId: customerAlphaId,
            milkCategory: 'COW',
            weightLiters: 10,
            fatPercentage: 4.0,
            snfPercentage: 8.5,
          },
        ],
      },
    });
    assert.equal(blockedBulkSync.statusCode, 200); // 200 with item-level REJECTED status
    assert.equal(blockedBulkSync.json.results[0].status, 'REJECTED');
    assert.equal(blockedBulkSync.json.results[0].errorCode, 'DEVICE_BLOCKED');

    // 4.8 Cross-tenant device rejection
    const crossTenantDev = await makeRequest(port1, '/api/v1/devices/heartbeat', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${deviceTokenActive}`,
        'X-Dairy-Tenant-Id': orgBeta, // Token is orgAlpha, header is orgBeta
      },
      body: { deviceId: deviceActiveId },
    });
    assert.equal(crossTenantDev.statusCode, 403, 'Cross-tenant device operation must fail-closed with 403');
  });

  // ============================================================================
  // 5. SHA-256 ETag & RATE CACHE KEY REGRESSION
  // ============================================================================
  await suite.test('5. Rate Sync ETag: Cryptographic SHA-256 ETag (64 hex chars), 304 Not Modified & Cache Key isolation', async (t) => {
    // 5.1 Request rate sync from Instance 1
    const res1 = await makeRequest(port1, '/api/v1/rates/sync', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminTokenAlpha}`,
        'X-Dairy-Tenant-Id': orgAlpha,
      },
      body: { scope: 'ORGANIZATION_WIDE' },
    });

    assert.equal(res1.statusCode, 200);
    const etag1 = res1.headers['etag'];
    assert.ok(etag1, 'Rate sync must return an ETag header');

    // Verify it is a true SHA-256 hex digest (64 hex chars without quotes)
    const rawDigest = etag1.replace(/"/g, '').replace(/^W\//, '');
    assert.equal(rawDigest.length, 64, 'ETag digest must be a 64-character SHA-256 hex string (not MD5 32 chars)');
    assert.match(rawDigest, /^[0-9a-f]{64}$/i, 'ETag must be valid 64-character hex SHA-256');

    // 5.2 Same representation returns identical SHA-256 ETag on Instance 2
    const res2 = await makeRequest(port2, '/api/v1/rates/sync', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminTokenAlpha}`,
        'X-Dairy-Tenant-Id': orgAlpha,
      },
      body: { scope: 'ORGANIZATION_WIDE' },
    });
    assert.equal(res2.statusCode, 200);
    assert.equal(res2.headers['etag'], etag1, 'Identical representation on different instances must yield same SHA-256 ETag');

    // 5.3 Conditional request If-None-Match returns HTTP 304 with empty body
    const condRes = await makeRequest(port1, '/api/v1/rates/sync', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminTokenAlpha}`,
        'X-Dairy-Tenant-Id': orgAlpha,
        'If-None-Match': etag1,
      },
      body: { scope: 'ORGANIZATION_WIDE' },
    });
    assert.equal(condRes.statusCode, 304, 'Matching If-None-Match must return 304 Not Modified');
    assert.equal(condRes.text, '', 'HTTP 304 response body must be empty');

    // 5.4 Both /api/v1/rates/sync and /api/v1/rate-charts/sync behave identically
    const chartsSyncRes = await makeRequest(port1, '/api/v1/rate-charts/sync', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminTokenAlpha}`,
        'X-Dairy-Tenant-Id': orgAlpha,
      },
      body: { scope: 'ORGANIZATION_WIDE' },
    });
    assert.equal(chartsSyncRes.statusCode, 200);
    assert.equal(chartsSyncRes.headers['etag'], etag1, 'Both /rates/sync and /rate-charts/sync must return identical SHA-256 ETag');

    // 5.5 Verify composite cache key generation
    const cacheKey = RateService.getRateCacheKey({
      organizationId: orgAlpha,
      scope: 'CENTER_SPECIFIC',
      centerId: centerAlpha1,
      chartId: '11111111-0000-0000-0000-000000000001',
      versionNumber: 3,
      milkCategory: 'COW',
    });

    assert.ok(cacheKey.includes(orgAlpha.toLowerCase()), 'Cache key must encode tenant');
    assert.ok(cacheKey.includes('CENTER_SPECIFIC'), 'Cache key must encode explicit scope');
    assert.ok(cacheKey.includes(centerAlpha1.toLowerCase()), 'Cache key must encode centerId');
    assert.ok(cacheKey.includes('v:3'), 'Cache key must encode versionNumber');
    assert.ok(cacheKey.includes('cat:COW'), 'Cache key must encode milkCategory');
  });

  // Teardown HTTP servers
  server1.close();
  server2.close();
});
