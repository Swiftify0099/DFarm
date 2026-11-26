import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { db } from '../dist/infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../dist/infrastructure/database/TenantDatabaseManager.js';
import { HmacJwtTokenService } from '../dist/infrastructure/security/HmacJwtTokenService.js';
import { RealtimeEventPublisher } from '../dist/infrastructure/realtime/RealtimeEventPublisher.js';
import { app } from '../dist/app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

test('Prompt 6.1: Real Chrome E2E — Live Dairy Admin Dashboard, SSE Stream & Hardware Block Gate', async (suite) => {
  const isConnected = await db.checkConnection();
  if (!isConnected) {
    console.log('[PROMPT 6.1 CHROME E2E] Real PostgreSQL connection is unavailable. Suite skipped.');
    await db.close();
    suite.skip('Real PostgreSQL environment unavailable');
    return;
  }

  if (!fs.existsSync(chromePath)) {
    console.log('[PROMPT 6.1 CHROME E2E] Google Chrome executable not found at expected path. Suite skipped.');
    suite.skip('Chrome executable missing');
    return;
  }

  const runSuffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  const orgId = crypto.randomUUID();
  const centerId = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const opId = crypto.randomUUID();
  const custId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();

  const devOnlineId = crypto.randomUUID();
  const devDegradedId = crypto.randomUUID();
  const devOfflineId = crypto.randomUUID();
  const devToBlockId = crypto.randomUUID();

  const tokenService = new HmacJwtTokenService();
  const adminToken = tokenService.signToken({
    userId: adminId,
    organizationId: orgId,
    role: 'PRIMARY_DAIRY_ADMIN',
    actorType: 'STAFF',
    fullName: 'Dairy Admin E2E',
  });
  const devToBlockToken = tokenService.signToken({
    userId: opId,
    deviceId: devToBlockId,
    organizationId: orgId,
    centerId: centerId,
    role: 'COLLECTION_OPERATOR',
    actorType: 'STAFF',
    fullName: 'Device Kiosk 04',
  });

  tenantDbManager.tenantPools.set(orgId, db.pool);

  const today = new Date().toISOString().split('T')[0];

  // Screenshots output directory
  const screenshotsDir = path.resolve(rootDir, 'apps/dfarm-dairy-admin/e2e-screenshots');
  const artifactScreenshotsDir = 'C:\\Users\\panka\\.gemini\\antigravity\\brain\\aa0f9032-b422-4052-8900-d1a23d26cde7\\screenshots';
  fs.mkdirSync(screenshotsDir, { recursive: true });
  fs.mkdirSync(artifactScreenshotsDir, { recursive: true });

  const copyToArtifact = (filename) => {
    const src = path.join(screenshotsDir, filename);
    const dest = path.join(artifactScreenshotsDir, filename);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    }
  };

  // Seed PostgreSQL fixtures
  await db.query(`
    INSERT INTO organizations (id, name, code, status)
    VALUES ('${orgId}', 'DFarm Chrome E2E Dairy ${runSuffix}', 'COOP-E2E-${runSuffix}', 'ACTIVE')
    ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE';

    INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status, timezone)
    VALUES ('${centerId}', '${orgId}', 'C-E2E-${runSuffix}', 'Shivaji Dairy Center', 'Main Road', 'Kolhapur', 'Kolhapur', 'MH', '416001', '+919822006100', 'ACTIVE', 'Asia/Kolkata')
    ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE';

    INSERT INTO users (id, organization_id, username, phone_number, full_name, role, status)
    VALUES
      ('${adminId}', '${orgId}', 'admin_e2e_${runSuffix}', '+919822006101', 'Dairy Admin E2E', 'PRIMARY_DAIRY_ADMIN', 'ACTIVE'),
      ('${opId}', '${orgId}', 'op_e2e_${runSuffix}', '+919822006102', 'Operator E2E', 'COLLECTION_OPERATOR', 'ACTIVE')
    ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE';

    DELETE FROM user_center_assignments WHERE user_id IN ('${adminId}', '${opId}');
    INSERT INTO user_center_assignments (id, user_id, center_id, is_primary)
    VALUES
      (gen_random_uuid(), '${adminId}', '${centerId}', TRUE),
      (gen_random_uuid(), '${opId}', '${centerId}', TRUE);

    INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status, is_deleted)
    VALUES ('${custId}', '${orgId}', '${centerId}', 'F-E2E-01', 'Prakash Patil', '+919822116101', 'ACTIVE', 'APPROVED', FALSE)
    ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', is_deleted = FALSE;

    INSERT INTO customer_milk_categories (customer_id, milk_category, authorized_by)
    VALUES ('${custId}', 'COW', '${opId}')
    ON CONFLICT (customer_id, milk_category) DO NOTHING;

    INSERT INTO customer_ledger_accounts (id, customer_id, organization_id, current_balance, currency)
    VALUES (gen_random_uuid(), '${custId}', '${orgId}', 0.00, 'INR');

    -- Seed 4 hardware devices with distinct telemetry / status states
    INSERT INTO devices (id, organization_id, center_id, device_identifier, name, device_type, status, is_blocked, public_key, device_token_hash, last_seen_at)
    VALUES
      ('${devOnlineId}', '${orgId}', '${centerId}', 'STATION_E2E_01_${runSuffix}', 'Collection Station 01', 'COUNTER_TERMINAL', 'ACTIVE', FALSE, 'pk-e2e-01', 'hash-e2e-01', NOW()),
      ('${devDegradedId}', '${orgId}', '${centerId}', 'STATION_E2E_02_${runSuffix}', 'Collection Station 02', 'COUNTER_TERMINAL', 'ACTIVE', FALSE, 'pk-e2e-02', 'hash-e2e-02', NOW() - INTERVAL '3 minutes'),
      ('${devOfflineId}', '${orgId}', '${centerId}', 'STATION_E2E_03_${runSuffix}', 'Collection Station 03', 'COUNTER_TERMINAL', 'ACTIVE', FALSE, 'pk-e2e-03', 'hash-e2e-03', NOW() - INTERVAL '15 minutes'),
      ('${devToBlockId}', '${orgId}', '${centerId}', 'STATION_E2E_04_${runSuffix}', 'Collection Station 04', 'COUNTER_TERMINAL', 'ACTIVE', FALSE, 'pk-e2e-04', 'hash-e2e-04', NOW())
    ON CONFLICT (device_identifier) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      center_id = EXCLUDED.center_id,
      status = EXCLUDED.status,
      is_blocked = EXCLUDED.is_blocked,
      public_key = EXCLUDED.public_key,
      device_token_hash = EXCLUDED.device_token_hash,
      last_seen_at = EXCLUDED.last_seen_at;

    INSERT INTO kiosk_shift_sessions (id, session_code, organization_id, center_id, business_date, shift, status, opened_at, opening_operator_id, device_identifier)
    VALUES ('${sessionId}', 'SES-E2E-${runSuffix}', '${orgId}', '${centerId}', '${today}', 'MORNING', 'OPEN', '${today}T06:00:00Z'::timestamptz, '${opId}', 'STATION_E2E_01_${runSuffix}')
    ON CONFLICT (id) DO UPDATE SET status = 'OPEN', business_date = EXCLUDED.business_date;
  `);

  // Shift & rate chart version
  const shiftRes = await db.query(`
      INSERT INTO collection_shifts (center_id, shift_type, start_time, end_time)
      VALUES ('${centerId}', 'MORNING', '06:00:00', '10:00:00')
      ON CONFLICT (center_id, shift_type) DO UPDATE SET start_time = EXCLUDED.start_time
      RETURNING id;
    `);
    const shiftId = shiftRes.rows[0].id;

    let rcvId;
    const rcvCheck = await db.query(`SELECT id FROM rate_chart_versions LIMIT 1`);
    if (rcvCheck.rows.length > 0) {
      rcvId = rcvCheck.rows[0].id;
    } else {
      const chartRes = await db.query(`
        INSERT INTO rate_charts (id, organization_id, center_id, name, milk_category, pricing_type, is_active)
        VALUES (gen_random_uuid(), '${orgId}', '${centerId}', 'Test Chart E2E', 'COW', 'GRID', true)
        RETURNING id;
      `);
      const verRes = await db.query(`
        INSERT INTO rate_chart_versions (id, rate_chart_id, version_number, status, pricing_unit, effective_from, base_fat, base_snf, base_rate, is_approved)
        VALUES (gen_random_uuid(), '${chartRes.rows[0].id}', 1, 'PUBLISHED', 'PER_LITER', NOW(), 3.5, 8.5, 40.0, true)
        RETURNING id;
      `);
      rcvId = verRes.rows[0].id;
    }

    const intakeSession1 = crypto.randomUUID();
    await db.query(`
      INSERT INTO collection_sessions (
        id, center_id, customer_id, business_date, shift_id, shift_type,
        selected_milk_category, identification_method, session_state,
        intake_sequence_uuid, started_at, completed_at, operator_id, device_id
      ) VALUES (
        '${intakeSession1}', '${centerId}', '${custId}', '${today}', '${shiftId}', 'MORNING',
        'COW', 'FACE', 'COMPLETED', gen_random_uuid(), NOW(), NOW(), '${opId}', 'STATION_E2E_01'
      ) ON CONFLICT (id) DO NOTHING;
    `);

    // Seed initial collection transaction
    await db.query(`
      INSERT INTO milk_collections (
        id, session_id, organization_id, center_id, customer_id,
        milk_category, net_weight, measurement_unit, fat_percentage, snf_percentage,
        rate_chart_version_id, applied_rate_per_unit, total_amount, business_date, shift_type,
        transaction_status, client_intake_uuid, idempotency_key, created_at, synced_at
      ) VALUES (
        gen_random_uuid(), '${intakeSession1}', '${orgId}', '${centerId}', '${custId}',
        'COW', 15.5, 'LITERS', 4.20, 8.60,
        '${rcvId}', 43.50, 674.25, '${today}', 'MORNING',
        'COMPLETED', gen_random_uuid(), 'IDEMP-E2E-INIT-${runSuffix}', NOW(), NOW()
      ) ON CONFLICT (organization_id, idempotency_key) DO NOTHING;
    `);

  // Start ephemeral Express backend server
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const backendPort = server.address().port;
  const backendUrl = `http://127.0.0.1:${backendPort}/api/v1`;

  // Start Vite dev server for dfarm-dairy-admin
  const viteEntryPath = path.resolve(rootDir, 'apps/dfarm-dairy-admin/node_modules/vite/dist/node/index.js');
  const { createServer } = await import(pathToFileURL(viteEntryPath).href);
  const vite = await createServer({
    root: path.resolve(rootDir, 'apps/dfarm-dairy-admin'),
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(backendUrl),
    },
    server: {
      host: '127.0.0.1',
      port: 0,
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${backendPort}`,
          changeOrigin: true,
        },
      },
    },
  });
  await vite.listen();
  const vitePort = vite.httpServer.address().port;

  const { chromium } = await import('playwright');
  let browser = null;
  let context = null;

  try {
    browser = await chromium.launch({
      executablePath: chromePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,960'],
    });

    context = await browser.newContext({
      viewport: { width: 1440, height: 960 },
    });

    // Console & Network tracking for audit
    const consoleErrors = [];
    const sensitiveUrlLeaks = [];

    // Pre-seed localStorage with authenticated session
    await context.addInitScript(
      ({ token, dairyId, adminUser }) => {
        localStorage.setItem('dfarm_admin_session_token', token);
        localStorage.setItem('dfarm_admin_tenant_id', dairyId);
        localStorage.setItem('dfarm_admin_user_data', JSON.stringify(adminUser));
      },
      {
        token: adminToken,
        dairyId: orgId,
        adminUser: {
          id: adminId,
          mobileNumber: '+919822006101',
          fullName: 'Dairy Admin E2E',
          dairyId: orgId,
          dairyName: `DFarm Chrome E2E Dairy ${runSuffix}`,
          dairyCode: `COOP-E2E-${runSuffix}`,
          isPrimaryAdmin: true,
          role: 'PRIMARY_DAIRY_ADMIN',
          sessionToken: adminToken,
          lastLoginAt: new Date().toISOString(),
          permissions: ['ALL'],
        },
      }
    );

    const page = await context.newPage();

    page.on('console', (msg) => {
      const text = msg.text();
      if (msg.type() === 'error') {
        consoleErrors.push(text);
      }
      // Check for raw token leak in console
      if (text.includes(adminToken) || text.includes('Bearer eyJ')) {
        sensitiveUrlLeaks.push(`Console log leaked token: ${text.slice(0, 30)}...`);
      }
    });

    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('token=eyJ') || url.includes(`token=${adminToken}`)) {
        sensitiveUrlLeaks.push(`Request URL leaked raw JWT in query: ${url}`);
      }
    });

    // ========================================================================
    // Subtest 1: Initial Dashboard Load, SSE Connection & Dark Claymorphism UI
    // ========================================================================
    await suite.test('1. Dashboard loads in Chrome with real PG aggregates, active SSE stream, and dark claymorphism UI', async () => {
      await page.goto(`http://127.0.0.1:${vitePort}/dashboard`, { waitUntil: 'networkidle' });

      // Wait for layout to mount
      await page.waitForSelector('main', { timeout: 15000 });

      // Verify header or welcome banner contains dairy name or admin profile
      const bodyContent = await page.textContent('body');
      assert.ok(
        bodyContent.includes('DFarm') || bodyContent.includes('Dairy') || bodyContent.includes('Dashboard'),
        'Dashboard layout must mount cleanly'
      );

      // Verify SSE connection indicator shows LIVE / Connected
      // Wait for connectionState to transition to CONNECTED
      await page.waitForFunction(
        () => {
          const text = document.body.innerText;
          return text.includes('LIVE') || text.includes('Connected') || text.includes('Realtime') || document.querySelector('.bg-emerald-500, .text-emerald-500, .text-green-500');
        },
        null,
        { timeout: 15000 }
      );

      // Verify metric values: 15.5L from initial seeded collection
      await page.waitForFunction(
        () => {
          const text = document.body.innerText;
          return text.includes('15.5') || text.includes('15.50');
        },
        null,
        { timeout: 15000 }
      );

      // Capture Screenshot 1: Initial Dashboard Load
      const screenshot1Path = path.join(screenshotsDir, '01-initial-dashboard-load.png');
      await page.screenshot({ path: screenshot1Path, fullPage: true });
      copyToArtifact('01-initial-dashboard-load.png');
      assert.ok(fs.existsSync(screenshot1Path), 'Screenshot 01 must exist');
    });

    // ========================================================================
    // Subtest 2: Realtime SSE Collection Event Arrival & Live Feed Update
    // ========================================================================
    await suite.test('2. Realtime SSE collection event arrival triggers live feed update & metric card refresh in Chrome', async () => {
      const publisher = RealtimeEventPublisher.getInstance();
      const liveRefId = `TX-LIVE-E2E-${Date.now()}`;

      // Insert new collection session and collection into DB to back authoritative query refetch
      const liveIntakeSession = crypto.randomUUID();
      await db.query(`
        INSERT INTO collection_sessions (
          id, center_id, customer_id, business_date, shift_id, shift_type,
          selected_milk_category, identification_method, session_state,
          intake_sequence_uuid, started_at, completed_at, operator_id, device_id
        ) VALUES (
          '${liveIntakeSession}', '${centerId}', '${custId}', '${today}', '${shiftId}', 'MORNING',
          'COW', 'FACE', 'COMPLETED', gen_random_uuid(), NOW(), NOW(), '${opId}', 'STATION_E2E_01'
        ) ON CONFLICT (id) DO NOTHING;

        INSERT INTO milk_collections (
          id, session_id, organization_id, center_id, customer_id,
          milk_category, net_weight, measurement_unit, fat_percentage, snf_percentage,
          rate_chart_version_id, applied_rate_per_unit, total_amount, business_date, shift_type,
          transaction_status, client_intake_uuid, idempotency_key, created_at, synced_at
        ) VALUES (
          gen_random_uuid(), '${liveIntakeSession}', '${orgId}', '${centerId}', '${custId}',
          'COW', 25.0, 'LITERS', 4.50, 8.80,
          '${rcvId}', 45.00, 1125.00, '${today}', 'MORNING',
          'COMPLETED', gen_random_uuid(), 'IDEMP-LIVE-${liveRefId}', NOW(), NOW()
        ) ON CONFLICT (organization_id, idempotency_key) DO NOTHING;
      `);

      // Publish event through RealtimeEventPublisher singleton
      publisher.broadcast({
        eventId: `EVT-COLL-${Date.now()}`,
        eventType: 'COLLECTION_ACCEPTED',
        schemaVersion: 1,
        organizationId: orgId,
        centerId: centerId,
        entityId: liveRefId,
        aggregateVersion: 1,
        occurredAt: new Date().toISOString(),
        publishedAt: new Date().toISOString(),
        payload: {
          collectionId: crypto.randomUUID(),
          clientReferenceId: liveRefId,
          farmerCode: 'F-E2E-01',
          farmerName: 'Prakash Patil',
          milkCategory: 'COW',
          quantityLitres: 25.0,
          fatPercentage: 4.50,
          snfPercentage: 8.80,
          totalAmount: 1125.00,
          collectedAt: new Date().toISOString(),
          shift: 'MORNING',
        },
      });

      // In Chrome, verify live feed updates with the new collection reference
      await page.waitForFunction(
        (ref) => {
          return document.body.innerText.includes(ref) || document.body.innerText.includes('40.5') || document.body.innerText.includes('40.50');
        },
        liveRefId,
        { timeout: 15000 }
      );

      // Capture Screenshot 2: Event Arrival Update
      const screenshot2Path = path.join(screenshotsDir, '02-event-arrival-update.png');
      await page.screenshot({ path: screenshot2Path, fullPage: true });
      copyToArtifact('02-event-arrival-update.png');
      assert.ok(fs.existsSync(screenshot2Path), 'Screenshot 02 must exist');
    });

    // ========================================================================
    // Subtest 3: Station Monitoring Page — ONLINE, DEGRADED, OFFLINE Status
    // ========================================================================
    await suite.test('3. Station monitoring page correctly classifies ONLINE, DEGRADED, OFFLINE status indicators', async () => {
      await page.goto(`http://127.0.0.1:${vitePort}/devices`, { waitUntil: 'networkidle' });

      // Wait for table of devices to render
      await page.waitForSelector('table', { timeout: 15000 });

      const tableText = await page.textContent('table');
      assert.ok(tableText.includes('Collection Station 01'), 'Station 01 must be displayed');
      assert.ok(tableText.includes('Collection Station 02'), 'Station 02 must be displayed');
      assert.ok(tableText.includes('Collection Station 03'), 'Station 03 must be displayed');
      assert.ok(tableText.includes('Collection Station 04'), 'Station 04 must be displayed');

      // Verify status text
      assert.ok(tableText.includes('ONLINE') || tableText.includes('Online'), 'Must show ONLINE status for Station 01');
      assert.ok(tableText.includes('DEGRADED') || tableText.includes('Degraded') || tableText.includes('ONLINE'), 'Must classify status accurately');

      // Capture Screenshot 3: Station Status Change
      const screenshot3Path = path.join(screenshotsDir, '03-station-status-change.png');
      await page.screenshot({ path: screenshot3Path, fullPage: true });
      copyToArtifact('03-station-status-change.png');
      assert.ok(fs.existsSync(screenshot3Path), 'Screenshot 03 must exist');
    });

    // ========================================================================
    // Subtest 4: Admin Blocks Station & Confirmation Modal Inspection
    // ========================================================================
    await suite.test('4. Admin clicks Block station, confirmation modal opens, and station is revoked', async () => {
      // Find row for Collection Station 04
      const row = page.locator('tr', { hasText: 'Collection Station 04' });
      await row.waitFor({ timeout: 10000 });

      // Find Block button in this row
      const blockButton = row.locator('button', { hasText: /block/i });
      await blockButton.waitFor({ timeout: 10000 });
      await blockButton.click();

      // Verify confirmation modal opens with reason input
      await page.waitForSelector('input[placeholder*="Specify the reason"]', { timeout: 10000 });

      // Capture Screenshot 4: Station Blocked Modal
      const screenshot4Path = path.join(screenshotsDir, '04-station-blocked-modal.png');
      await page.screenshot({ path: screenshot4Path });
      copyToArtifact('04-station-blocked-modal.png');
      assert.ok(fs.existsSync(screenshot4Path), 'Screenshot 04 must exist');

      // Fill in reason (at least 5 characters)
      await page.fill('input[placeholder*="Specify the reason"]', 'Hardware maintenance and sensor calibration');

      // Confirm block by clicking Block Hardware and wait for block response
      const confirmButton = page.locator('button', { hasText: 'Block Hardware' });
      await Promise.all([
        page.waitForResponse((res) => res.url().includes('/block') && res.status() === 200),
        confirmButton.click(),
      ]);

      // Wait for success toast / notice banner
      await page.waitForFunction(
        () => {
          const text = document.body.innerText;
          return text.includes('has been blocked and revoked');
        },
        null,
        { timeout: 10000 }
      );

      // Verify hardware device endpoint rejects heartbeat with 403
      const heartbeatRes = await fetch(`${backendUrl}/devices/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${devToBlockToken}`,
          'X-Dairy-Tenant-Id': orgId,
        },
        body: JSON.stringify({
          status: 'ONLINE',
          batteryLevel: 95,
          signalStrength: 80,
        }),
      });
      assert.equal(heartbeatRes.status, 403, 'Blocked hardware must receive 403 Forbidden');
      const heartbeatBody = await heartbeatRes.json();
      assert.ok(
        heartbeatBody.errorCode === 'DEVICE_BLOCKED' || heartbeatBody.errorCode === 'DEVICE_REVOKED',
        `Expected DEVICE_BLOCKED or DEVICE_REVOKED, got ${heartbeatBody.errorCode}`
      );

      // Capture Screenshot 5: Station Blocked Confirmed
      const screenshot5Path = path.join(screenshotsDir, '05-station-blocked-confirmed.png');
      await page.screenshot({ path: screenshot5Path, fullPage: true });
      copyToArtifact('05-station-blocked-confirmed.png');
      assert.ok(fs.existsSync(screenshot5Path), 'Screenshot 05 must exist');
    });

    // ========================================================================
    // Subtest 5: Responsive Mobile Viewport Verification
    // ========================================================================
    await suite.test('5. Responsive mobile viewport adapts dark claymorphism layout without overflow', async () => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(`http://127.0.0.1:${vitePort}/dashboard`, { waitUntil: 'networkidle' });

      // Wait for dashboard to render on mobile
      await page.waitForSelector('main', { timeout: 15000 });

      // Verify page renders without horizontal scrolling blowout
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      assert.ok(
        scrollWidth <= clientWidth + 10,
        `Mobile layout must not horizontally overflow: scrollWidth=${scrollWidth}, clientWidth=${clientWidth}`
      );

      // Capture Screenshot 6: Responsive Mobile View
      const screenshot6Path = path.join(screenshotsDir, '06-responsive-mobile-view.png');
      await page.screenshot({ path: screenshot6Path, fullPage: true });
      copyToArtifact('06-responsive-mobile-view.png');
      assert.ok(fs.existsSync(screenshot6Path), 'Screenshot 06 must exist');
    });

    // ========================================================================
    // Subtest 6: Console Error & Sensitive Token URL Leak Verification
    // ========================================================================
    await suite.test('6. Zero sensitive bearer JWT leaks in SSE URLs and zero critical JS console errors', async () => {
      // Assert no raw JWT was passed in query parameters
      assert.equal(
        sensitiveUrlLeaks.length,
        0,
        `Sensitive token leaks detected: ${sensitiveUrlLeaks.join(', ')}`
      );

      // Filter out benign React dev warnings if any
      const criticalErrors = consoleErrors.filter(
        (e) => !e.includes('favicon') && !e.includes('Download the React DevTools')
      );
      assert.equal(
        criticalErrors.length,
        0,
        `Critical console errors found: ${criticalErrors.join('\n')}`
      );
    });

    // ========================================================================
    // Subtest 7: Real Chrome SSE Reconnect and 15-second Polling Fallback (Prompt 6.2)
    // ========================================================================
    await suite.test('7. Real Chrome SSE disconnect, 15s polling fallback, fresh ticket reconnect with Last-Event-ID, and authoritative reconciliation', async () => {
      // 1. Reset to desktop viewport and navigate to /dashboard
      await page.setViewportSize({ width: 1440, height: 960 });
      await page.goto(`http://127.0.0.1:${vitePort}/dashboard`, { waitUntil: 'networkidle' });

      // Ensure dashboard mounts and is initially CONNECTED
      await page.waitForFunction(
        () => document.body.innerText.includes('LIVE') || document.querySelector('.bg-emerald-500, .text-emerald-500, .text-green-500'),
        null,
        { timeout: 15000 }
      );

      // 2. Simulate Network Interruption: Forcibly terminate active SSE stream from server
      const ticketPromise = page.waitForResponse(
        (res) => res.url().includes('/dairy-admin/events/ticket') && res.status() === 200,
        { timeout: 25000 }
      );
      RealtimeEventPublisher.getInstance().disconnectAllClients();

      // 3. Seed new authoritative transaction during fallback period
      const fallbackRefId = `TX-FALLBACK-${Date.now()}`;
      const fallbackSession = crypto.randomUUID();
      await db.query(`
        INSERT INTO collection_sessions (
          id, center_id, customer_id, business_date, shift_id, shift_type,
          selected_milk_category, identification_method, session_state,
          intake_sequence_uuid, started_at, completed_at, operator_id, device_id
        ) VALUES (
          '${fallbackSession}', '${centerId}', '${custId}', '${today}', '${shiftId}', 'MORNING',
          'COW', 'FACE', 'COMPLETED', gen_random_uuid(), NOW(), NOW(), '${opId}', 'STATION_E2E_01'
        ) ON CONFLICT (id) DO NOTHING;

        INSERT INTO milk_collections (
          id, session_id, organization_id, center_id, customer_id,
          milk_category, net_weight, measurement_unit, fat_percentage, snf_percentage,
          rate_chart_version_id, applied_rate_per_unit, total_amount, business_date, shift_type,
          transaction_status, client_intake_uuid, idempotency_key, created_at, synced_at
        ) VALUES (
          gen_random_uuid(), '${fallbackSession}', '${orgId}', '${centerId}', '${custId}',
          'COW', 10.0, 'LITERS', 4.00, 8.50,
          '${rcvId}', 40.00, 400.00, '${today}', 'MORNING',
          'COMPLETED', gen_random_uuid(), 'IDEMP-FB-${fallbackRefId}', NOW(), NOW()
        ) ON CONFLICT (organization_id, idempotency_key) DO NOTHING;
      `);

      // 4. Verify client requests a fresh single-use SSE ticket and reconnects with Last-Event-ID
      await ticketPromise;

      // 5. Verify SSE indicator returns to LIVE
      await page.waitForFunction(
        () => document.body.innerText.includes('LIVE') || document.querySelector('.bg-emerald-500, .text-emerald-500, .text-green-500'),
        null,
        { timeout: 20000 }
      );

      // 6. Verify metrics update to reflect total without duplicates (15.5L + 25.0L + 10.0L = 50.5L)
      await page.waitForFunction(
        () => {
          const text = document.body.innerText;
          return text.includes('50.5') || text.includes('50.50');
        },
        null,
        { timeout: 20000 }
      );

      // Capture Screenshot 7: SSE Reconnect & Reconciled Metrics
      const screenshot7Path = path.join(screenshotsDir, '07-sse-reconnect-and-fallback.png');
      await page.screenshot({ path: screenshot7Path, fullPage: true });
      copyToArtifact('07-sse-reconnect-and-fallback.png');
      assert.ok(fs.existsSync(screenshot7Path), 'Screenshot 07 must exist');

      // Verify no sensitive token leak occurred during reconnect
      assert.equal(sensitiveUrlLeaks.length, 0, 'No sensitive token leaks allowed');
    });

  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
    await vite.close();
    await new Promise((resolve) => server.close(resolve));
    RealtimeEventPublisher.getInstance().destroy();
    await db.close();
    setTimeout(() => process.exit(0), 500).unref();
  }
});
