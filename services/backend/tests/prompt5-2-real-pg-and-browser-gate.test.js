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
import { app } from '../dist/app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');

test('Prompt 5.2: Backend /api/v1/rates/sync & Real Chrome Multi-Tab + Persistent Retry Gate', async (suite) => {
  const isConnected = await db.checkConnection();
  if (!isConnected) {
    console.log('[PROMPT 5.2 GATE] Real PostgreSQL connection is unavailable. Suite skipped.');
    await db.close();
    suite.skip('Real PostgreSQL environment unavailable');
    return;
  }

  const runSuffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  const orgA = crypto.randomUUID();
  const orgB = crypto.randomUUID();
  const centerA1 = crypto.randomUUID();
  const centerA2 = crypto.randomUUID();
  const opA1 = crypto.randomUUID();
  const ownerA = crypto.randomUUID();
  const custA1 = crypto.randomUUID();
  const sessionA1 = crypto.randomUUID();

  const chartCowA1 = crypto.randomUUID();
  const verCowA1 = crypto.randomUUID();
  const chartCowA2 = crypto.randomUUID();
  const verCowA2 = crypto.randomUUID();
  const chartBufOrgA = crypto.randomUUID();
  const verBufOrgA = crypto.randomUUID();

  const today = new Date().toISOString().split('T')[0];

  tenantDbManager.tenantPools.set(orgA, db.pool);
  tenantDbManager.tenantPools.set(orgB, db.pool);

  await db.query(`
    INSERT INTO organizations (id, name, code, status) VALUES
      ('${orgA}', 'DFarm RateSync Coop A ${runSuffix}', 'ORG-53A-${runSuffix}', 'ACTIVE'),
      ('${orgB}', 'DFarm RateSync Coop B ${runSuffix}', 'ORG-53B-${runSuffix}', 'ACTIVE')
    ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE';

    INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status, timezone) VALUES
      ('${centerA1}', '${orgA}', 'C-53A1-${runSuffix}', 'Center 53 A1', 'Rd 1', 'Kop', 'Kolhapur', 'MH', '416001', '+919822005301', 'ACTIVE', 'Asia/Kolkata'),
      ('${centerA2}', '${orgA}', 'C-53A2-${runSuffix}', 'Center 53 A2', 'Rd 2', 'Kop', 'Kolhapur', 'MH', '416002', '+919822005302', 'ACTIVE', 'Asia/Kolkata')
    ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', timezone = 'Asia/Kolkata';

    INSERT INTO users (id, organization_id, username, phone_number, full_name, role, status) VALUES
      ('${opA1}', '${orgA}', 'op_53a1_${runSuffix}', '+919822005311', 'Operator 53 A1', 'COLLECTION_OPERATOR', 'ACTIVE'),
      ('${ownerA}', '${orgA}', 'owner_53a_${runSuffix}', '+919822005312', 'Owner 53 A', 'DAIRY_OWNER', 'ACTIVE')
    ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE';

    DELETE FROM user_center_assignments WHERE user_id IN ('${opA1}', '${ownerA}');
    INSERT INTO user_center_assignments (id, user_id, center_id, is_primary) VALUES
      (gen_random_uuid(), '${opA1}', '${centerA1}', TRUE),
      (gen_random_uuid(), '${ownerA}', '${centerA1}', TRUE);

    INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status, is_deleted)
    VALUES ('${custA1}', '${orgA}', '${centerA1}', 'F-53A1', 'Vikas Pawar 53', '+919822335301', 'ACTIVE', 'APPROVED', FALSE)
    ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', is_deleted = FALSE;

    INSERT INTO customer_milk_categories (customer_id, milk_category, authorized_by)
    VALUES ('${custA1}', 'COW', '${opA1}')
    ON CONFLICT (customer_id, milk_category) DO NOTHING;

    INSERT INTO customer_ledger_accounts (id, customer_id, organization_id, current_balance, currency)
    VALUES (gen_random_uuid(), '${custA1}', '${orgA}', 0.00, 'INR');

    INSERT INTO devices (id, organization_id, center_id, device_identifier, device_type, status)
    VALUES (gen_random_uuid(), '${orgA}', '${centerA1}', 'KIOSK_MAIN', 'COUNTER_TERMINAL', 'ACTIVE')
    ON CONFLICT (device_identifier) DO UPDATE SET status = 'ACTIVE', organization_id = EXCLUDED.organization_id, center_id = EXCLUDED.center_id;

    DELETE FROM kiosk_shift_sessions WHERE organization_id = '${orgA}' AND center_id = '${centerA1}' AND id <> '${sessionA1}';
    INSERT INTO kiosk_shift_sessions (id, session_code, organization_id, center_id, business_date, shift, status, opened_at, opening_operator_id, device_identifier)
    VALUES ('${sessionA1}', 'SES-53-A1-${runSuffix}', '${orgA}', '${centerA1}', '${today}', 'MORNING', 'OPEN', '${today}T06:00:00Z'::timestamptz, '${opA1}', 'KIOSK_MAIN')
    ON CONFLICT (id) DO UPDATE SET status = 'OPEN', business_date = EXCLUDED.business_date;

    INSERT INTO rate_charts (id, organization_id, center_id, name, milk_category, pricing_type, is_active) VALUES
      ('${chartCowA1}', '${orgA}', '${centerA1}', 'Cow A1 Chart', 'COW', 'GRID', TRUE),
      ('${chartCowA2}', '${orgA}', '${centerA2}', 'Cow A2 Chart', 'COW', 'GRID', TRUE),
      ('${chartBufOrgA}', '${orgA}', NULL, 'Buffalo OrgWide Chart', 'BUFFALO', 'TWO_AXIS_FORMULA', TRUE);

    INSERT INTO rate_chart_versions (id, rate_chart_id, version_number, status, pricing_unit, measurement_unit, base_fat, base_snf, base_rate, fat_min, fat_max, snf_min, snf_max, formula_definition, effective_from, is_approved) VALUES
      ('${verCowA1}', '${chartCowA1}', 1, 'DRAFT', 'PER_KG', 'KG', 3.5, 8.5, 41.0, 2.5, 6.0, 7.5, 10.0, NULL, '2020-01-01 00:00:00Z', TRUE),
      ('${verCowA2}', '${chartCowA2}', 1, 'DRAFT', 'PER_KG', 'KG', 3.5, 8.5, 44.0, 2.5, 6.0, 7.5, 10.0, NULL, '2020-01-01 00:00:00Z', TRUE),
      ('${verBufOrgA}', '${chartBufOrgA}', 1, 'DRAFT', 'PER_KG', 'KG', 6.0, 9.0, 61.0, 5.0, 11.0, 8.0, 12.0, '{"fatFactor":5.5,"snfFactor":4.0}'::jsonb, '2020-01-01 00:00:00Z', TRUE);

    INSERT INTO rate_chart_cells (rate_chart_version_id, fat_percentage, snf_percentage, rate_per_unit) VALUES
      ('${verCowA1}', 4.0, 8.5, 41.20),
      ('${verCowA2}', 4.0, 8.5, 44.50);

    UPDATE rate_chart_versions SET status = 'PUBLISHED' WHERE id IN ('${verCowA1}', '${verCowA2}', '${verBufOrgA}');
  `);

  const tokenService = new HmacJwtTokenService();
  const opToken = tokenService.signToken({
    userId: opA1,
    organizationId: orgA,
    centerId: centerA1,
    deviceId: 'KIOSK_MAIN',
    role: 'COLLECTION_OPERATOR',
    actorType: 'STAFF',
    fullName: 'Operator 53 A1',
  });
  const ownerToken = tokenService.signToken({
    userId: ownerA,
    organizationId: orgA,
    centerId: centerA1,
    role: 'DAIRY_OWNER',
    actorType: 'STAFF',
    fullName: 'Owner 53 A',
  });

  // Configurable HTTP interceptor wrapper around real Express app for deterministic network fault simulation
  let failBulkSyncOnce = null;
  let bulkSyncHitCount = 0;

  const backendServer = http.createServer((req, res) => {
    if (req.url && req.url.includes('/collections/sync/bulk') && req.method === 'POST') {
      bulkSyncHitCount++;
      if (failBulkSyncOnce) {
        const fault = failBulkSyncOnce;
        failBulkSyncOnce = null;
        res.statusCode = fault.status;
        if (fault.retryAfter) {
          res.setHeader('Retry-After', String(fault.retryAfter));
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: fault.message, errorCode: fault.code }));
        return;
      }
    }
    return app(req, res);
  });

  await new Promise((resolve) => backendServer.listen(0, '127.0.0.1', resolve));
  const backendPort = backendServer.address().port;
  const baseUrl = `http://127.0.0.1:${backendPort}/api/v1`;

  const createdChartIds = [];

  try {
    // ==========================================================================
    // TEST 1: Registered /api/v1/rates/sync & /api/v1/rates HTTP Integration
    // ==========================================================================
    await suite.test('1. /api/v1/rates/sync enforces auth, tenant/centre isolation, explicit scope, ETag 304, and POST fail-closed scope', async () => {
      // 1.1 Unauthenticated -> 401
      const unauthRes = await fetch(`${baseUrl}/rates/sync`);
      assert.equal(unauthRes.status, 401);

      // 1.2 Cross-tenant header -> 403
      const crossTenantRes = await fetch(`${baseUrl}/rates/sync`, {
        headers: {
          Authorization: `Bearer ${opToken}`,
          'X-Dairy-Tenant-Id': orgB,
        },
      });
      assert.equal(crossTenantRes.status, 403);

      // 1.3 Cross-centre query by center-bound COLLECTION_OPERATOR -> 403
      const crossCenterRes = await fetch(`${baseUrl}/rates/sync?centerId=${centerA2}`, {
        headers: {
          Authorization: `Bearer ${opToken}`,
        },
      });
      assert.equal(crossCenterRes.status, 403);

      // 1.4 Authorized operator for centerA1 -> 200 with CENTER_SPECIFIC COW + ORGANIZATION_WIDE BUFFALO + ETag
      const okRes = await fetch(`${baseUrl}/rates/sync?centerId=${centerA1}`, {
        headers: {
          Authorization: `Bearer ${opToken}`,
        },
      });
      assert.equal(okRes.status, 200);
      const etag1 = okRes.headers.get('etag');
      assert.ok(etag1 && etag1.startsWith('"'), `Expected ETag header, got: ${etag1}`);

      const okBody = await okRes.json();
      assert.equal(okBody.success, true);
      assert.equal(okBody.data.organizationId, orgA);
      assert.equal(okBody.data.centerId, centerA1);

      const cowChart = okBody.data.charts.find((c) => c.milkCategory === 'COW');
      const bufChart = okBody.data.charts.find((c) => c.milkCategory === 'BUFFALO');
      assert.equal(cowChart.centerScope, 'CENTER_SPECIFIC');
      assert.equal(cowChart.centerId, centerA1);
      assert.equal(Number(cowChart.baseRate), 41.0);
      assert.equal(cowChart.gridMatrix['4.0']['8.5'], 41.2);

      assert.equal(bufChart.centerScope, 'ORGANIZATION_WIDE');
      assert.equal(bufChart.centerId, null);
      assert.equal(Number(bufChart.baseRate), 61.0);

      // 1.5 If-None-Match matching ETag -> 304 Not Modified
      const notModifiedRes = await fetch(`${baseUrl}/rates/sync?centerId=${centerA1}`, {
        headers: {
          Authorization: `Bearer ${opToken}`,
          'If-None-Match': etag1,
        },
      });
      assert.equal(notModifiedRes.status, 304);

      // 1.6 Owner accessing centerA2 gets centerA2's chart (not centerA1's!)
      const ownerA2Res = await fetch(`${baseUrl}/rates/sync?centerId=${centerA2}`, {
        headers: {
          Authorization: `Bearer ${ownerToken}`,
        },
      });
      assert.equal(ownerA2Res.status, 200);
      const ownerA2Body = await ownerA2Res.json();
      const cowA2 = ownerA2Body.data.charts.find((c) => c.milkCategory === 'COW');
      assert.equal(cowA2.centerScope, 'CENTER_SPECIFIC');
      assert.equal(cowA2.centerId, centerA2);
      assert.equal(cowA2.gridMatrix['4.0']['8.5'], 44.5);

      // 1.7 Updating rate cell invalidates ETag cleanly
      await db.query(`UPDATE rate_chart_versions SET status = 'DRAFT' WHERE id = $1;`, [verCowA1]);
      await db.query(`UPDATE rate_chart_cells SET rate_per_unit = 42.75 WHERE rate_chart_version_id = $1 AND fat_percentage = 4.0 AND snf_percentage = 8.5;`, [verCowA1]);
      await db.query(`UPDATE rate_chart_versions SET status = 'PUBLISHED' WHERE id = $1;`, [verCowA1]);
      const afterCellChangeRes = await fetch(`${baseUrl}/rates/sync?centerId=${centerA1}`, {
        headers: {
          Authorization: `Bearer ${opToken}`,
          'If-None-Match': etag1,
        },
      });
      assert.equal(afterCellChangeRes.status, 200);
      const etag2 = afterCellChangeRes.headers.get('etag');
      assert.notEqual(etag2, etag1, 'ETag must change when grid cell rates change');

      // 1.8 POST /api/v1/rates fail-closed explicit scope enforcement
      const missingScopeRes = await fetch(`${baseUrl}/rates`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Invalid Missing Scope Chart',
          milkCategory: 'COW',
          centerId: null,
        }),
      });
      assert.equal(missingScopeRes.status, 400, 'Missing centerId without ORGANIZATION_WIDE must fail closed (400)');

      const contradictoryScopeRes = await fetch(`${baseUrl}/rates`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Contradictory Scope Chart',
          milkCategory: 'COW',
          centerScope: 'ORGANIZATION_WIDE',
          centerId: centerA1,
        }),
      });
      assert.equal(contradictoryScopeRes.status, 400, 'ORGANIZATION_WIDE + centerId contradiction must fail closed (400)');

      const validOrgWideRes = await fetch(`${baseUrl}/rates`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Explicit OrgWide Chart',
          milkCategory: 'COW',
          centerScope: 'ORGANIZATION_WIDE',
          centerId: null,
        }),
      });
      assert.equal(validOrgWideRes.status, 201);
      const createdOrg = await validOrgWideRes.json();
      assert.equal(createdOrg.data.centerScope, 'ORGANIZATION_WIDE');
      assert.equal(createdOrg.data.centerId, null);
      if (createdOrg.data?.id) createdChartIds.push(createdOrg.data.id);
    });

    // ==========================================================================
    // Chrome Tests Setup (Vite dev server with clean envDir)
    // ==========================================================================
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    if (!fs.existsSync(chromePath)) {
      console.log('[PROMPT 5.2 GATE] Chrome executable missing — skipping browser subtests.');
      return;
    }

    const userDataDirRetry = path.resolve(os.tmpdir(), `dfarm-p52-retry-${Date.now()}`);
    const userDataDirMultiTab = path.resolve(os.tmpdir(), `dfarm-p52-multitab-${Date.now()}`);
    fs.mkdirSync(userDataDirRetry, { recursive: true });
    fs.mkdirSync(userDataDirMultiTab, { recursive: true });

    const viteEntryPath = path.resolve(rootDir, 'apps/dfarm-collection-app/node_modules/vite/dist/node/index.js');
    const { createServer } = await import(pathToFileURL(viteEntryPath).href);
    const vite = await createServer({
      root: path.resolve(rootDir, 'apps/dfarm-collection-app'),
      envDir: userDataDirRetry,
      define: {
        'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/api/v1'),
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

    try {
      // ========================================================================
      // TEST 2: Real Chrome Persistent Retry Metadata Survival Across Restart
      // ========================================================================
      await suite.test('2. Real Chrome persists retryCount, nextAttemptAt, lastAttemptAt, lastError across restart and retries only after schedule', async () => {
        const clientUuid = crypto.randomUUID();
        const idempKey = `IDEMP-P52-RETRY-${clientUuid}`;
        let context1 = null;
        let context2 = null;

        try {
          context1 = await chromium.launchPersistentContext(userDataDirRetry, {
            executablePath: chromePath,
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
          });
          await context1.addInitScript(
            ({ token, dairyId, centerId, operatorId }) => {
              localStorage.setItem('dfarm_collection_token', token);
              localStorage.setItem('dfarm_collection_dairy_id', dairyId);
              localStorage.setItem(
                'dfarm_collection_operator',
                JSON.stringify({
                  id: operatorId,
                  fullName: 'Operator 53 A1',
                  role: 'COLLECTION_OPERATOR',
                  dairyId,
                  centerId,
                  deviceId: 'KIOSK_MAIN',
                })
              );
            },
            { token: opToken, dairyId: orgA, centerId: centerA1, operatorId: opA1 }
          );
          const page1 = await context1.newPage();
          await page1.goto(`http://127.0.0.1:${vitePort}/`);
          await page1.waitForFunction(() => Boolean(window.__DFARM__?.localDB && window.__DFARM__?.syncEngine && window.__DFARM__?.networkManager));

          // Wait for rate chart and active session offline lease to hydrate
          await page1.waitForFunction(
            async ({ orgA, centerA1, sessionA1 }) => {
              const chart = await window.__DFARM__.localDB.getRateChart(orgA, 'COW', centerA1);
              const session = await window.__DFARM__.localDB.getActiveSession(orgA, centerA1, 'KIOSK_MAIN');
              const lease = await window.__DFARM__.localDB.getSessionOfflineAuth(sessionA1);
              return Boolean(chart && session && lease?.token);
            },
            { orgA, centerA1, sessionA1 },
            { timeout: 15000 }
          );

          // Save transaction with offline lease matching sessionA1, and pause auto-retry while we trigger a controlled 503
          failBulkSyncOnce = { status: 503, retryAfter: 8, message: 'Temporary PG Maintenance', code: 'PG_MAINTENANCE' };
          bulkSyncHitCount = 0;

          await page1.evaluate(
            async ({ clientUuid, idempKey, orgA, centerA1, custA1, sessionA1, today, chartCowA1, verCowA1 }) => {
              window.__DFARM__.networkManager.setStatus('ONLINE');
              const lease = await window.__DFARM__.localDB.getSessionOfflineAuth(sessionA1);
              const txn = {
                id: clientUuid,
                clientIntakeUuid: clientUuid,
                transactionCode: `TXN-${clientUuid.slice(0, 8)}`,
                sessionId: sessionA1,
                dairyId: orgA,
                centerId: centerA1,
                customerId: custA1,
                customerCode: 'F-53A1',
                customerName: 'Vikas Pawar 53',
                timestamp: new Date().toISOString(),
                date: today,
                shift: 'MORNING',
                milkCategory: 'COW',
                weightLiters: 5.0,
                fatPercentage: 4.0,
                snfPercentage: 8.5,
                clrDensity: 28.0,
                appliedRatePerLiter: 42.75,
                rateChartId: chartCowA1,
                rateChartVersionId: verCowA1,
                rateChartVersion: 1,
                totalAmount: 213.75,
                identificationMethod: 'MANUAL_SEARCH',
                syncStatus: 'PENDING_OFFLINE',
                deviceId: 'KIOSK_MAIN',
                operatorName: 'Operator 53 A1',
                idempotencyKey: idempKey,
                offlineAuthorizationToken: lease?.token,
              };
              const qItem = {
                eventId: `EVT-${clientUuid}`,
                transactionId: clientUuid,
                clientIntakeUuid: clientUuid,
                customerCode: 'F-53A1',
                customerName: 'Vikas Pawar 53',
                timestamp: txn.timestamp,
                retryCount: 0,
                status: 'QUEUED',
                syncQueueStatus: 'PENDING',
                errorReason: null,
                lastAttemptedAt: null,
                offlineAuthorizationToken: lease?.token,
                transaction: txn,
              };
              await window.__DFARM__.localDB.saveIntakeAtomically(txn, qItem);
              await window.__DFARM__.syncEngine.triggerSync();
            },
            { clientUuid, idempKey, orgA, centerA1, custA1, sessionA1, today, chartCowA1, verCowA1 }
          );

          assert.equal(bulkSyncHitCount, 1);

          const afterFail1 = await page1.evaluate(async (uuid) => {
            const q = await window.__DFARM__.localDB.getOfflineQueue();
            return q.find((i) => i.clientIntakeUuid === uuid);
          }, clientUuid);

          assert.equal(afterFail1.retryCount, 1);
          assert.ok(afterFail1.lastAttemptAt);
          assert.ok(afterFail1.nextAttemptAt);
          assert.ok(afterFail1.lastError && afterFail1.lastError.includes('Temporary PG Maintenance'));
          const persistedNextAttemptMs = Date.parse(afterFail1.nextAttemptAt);
          assert.ok(persistedNextAttemptMs > Date.now() + 1500, 'Retry-After: 4s should set future nextAttemptAt');

          await context1.close();
          context1 = null;

          // Relaunch real Chrome immediately while nextAttemptAt is still in the future
          bulkSyncHitCount = 0;
          context2 = await chromium.launchPersistentContext(userDataDirRetry, {
            executablePath: chromePath,
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
          });
          await context2.addInitScript(
            ({ token, dairyId, centerId, operatorId }) => {
              localStorage.setItem('dfarm_collection_token', token);
              localStorage.setItem('dfarm_collection_dairy_id', dairyId);
              localStorage.setItem(
                'dfarm_collection_operator',
                JSON.stringify({
                  id: operatorId,
                  fullName: 'Operator 53 A1',
                  role: 'COLLECTION_OPERATOR',
                  dairyId,
                  centerId,
                  deviceId: 'KIOSK_MAIN',
                })
              );
            },
            { token: opToken, dairyId: orgA, centerId: centerA1, operatorId: opA1 }
          );
          const page2 = context2.pages()[0] || (await context2.newPage());
          page2.on('console', (msg) => console.log('[PAGE2 LOG]', msg.text()));
          await page2.goto(`http://127.0.0.1:${vitePort}/`);
          await page2.waitForFunction(() => Boolean(window.__DFARM__?.localDB && window.__DFARM__?.syncEngine && window.__DFARM__?.networkManager));

          await page2.evaluate(() => {
            window.__DFARM__.networkManager.setStatus('ONLINE');
          });

          // Wait slightly (still before schedule elapses) and confirm NO early retry fired!
          await new Promise((r) => setTimeout(r, 700));
          assert.equal(bulkSyncHitCount, 0, 'Chrome must NOT retry before persisted nextAttemptAt elapses');

          const afterRestartEarly = await page2.evaluate(async (uuid) => {
            const q = await window.__DFARM__.localDB.getOfflineQueue();
            return q.find((i) => i.clientIntakeUuid === uuid);
          }, clientUuid);
          assert.equal(afterRestartEarly.retryCount, 1);
          assert.equal(afterRestartEarly.nextAttemptAt, afterFail1.nextAttemptAt);
          assert.equal(afterRestartEarly.lastAttemptAt, afterFail1.lastAttemptAt);
          assert.equal(afterRestartEarly.lastError, afterFail1.lastError);

          // Wait until after persisted nextAttemptAt elapses and complete sync using original UUID/idempKey
          const waitRemaining = Math.max(0, Date.parse(afterFail1.nextAttemptAt) - Date.now() + 500);
          await new Promise((r) => setTimeout(r, waitRemaining));
          console.log('[DEBUG BEFORE TRIGGER] waitRemaining:', waitRemaining, 'bulkSyncHitCount:', bulkSyncHitCount);
          await page2.evaluate(async () => {
            const res = await window.__DFARM__.syncEngine.triggerSync();
            console.log('[DEBUG IN BROWSER TRIGGER RESULT]:', res);
          });
          console.log('[DEBUG BEFORE WAITFUNCTION] bulkSyncHitCount:', bulkSyncHitCount);

          let synced = false;
          const deadline = Date.now() + 20000;
          while (Date.now() < deadline) {
            const t = await page2.evaluate(async (uuid) => {
              return await window.__DFARM__.localDB.getTransactionById(uuid);
            }, clientUuid);
            if (t && t.syncStatus === 'SYNCED_CLOUD') {
              synced = true;
              break;
            }
            await new Promise((r) => setTimeout(r, 250));
          }
          console.log('[DEBUG AFTER POLLING SYNC] synced:', synced, 'bulkSyncHitCount:', bulkSyncHitCount);
          assert.equal(synced, true, 'Transaction should transition to SYNCED_CLOUD in IndexedDB');
          assert.equal(bulkSyncHitCount, 1, 'Chrome should retry once automatically after nextAttemptAt elapses');

          const pgSynced = await db.query(
            'SELECT id FROM milk_collections WHERE organization_id = $1 AND idempotency_key = $2;',
            [orgA, idempKey]
          );
          assert.equal(pgSynced.rows.length, 1);

          await context2.close();
          context2 = null;
        } finally {
          try { if (context1) await context1.close(); } catch {}
          try { if (context2) await context2.close(); } catch {}
        }
      });

      // ========================================================================
      // TEST 3: Real Chrome Multi-Tab Web Locks + IDB Lock & Heartbeat / Crash Reclaim
      // ========================================================================
      await suite.test('3. Two live Chrome tabs enforce mutually exclusive sync lock with heartbeat and reclaim on tab close', async () => {
        let context = null;
        try {
          context = await chromium.launchPersistentContext(userDataDirMultiTab, {
            executablePath: chromePath,
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
          });

          const tabA = await context.newPage();
          const tabB = await context.newPage();

          await Promise.all([
            tabA.goto(`http://127.0.0.1:${vitePort}/`),
            tabB.goto(`http://127.0.0.1:${vitePort}/`),
          ]);
          await Promise.all([
            tabA.waitForFunction(() => Boolean(window.__DFARM__?.multiTabLock)),
            tabB.waitForFunction(() => Boolean(window.__DFARM__?.multiTabLock)),
          ]);

          const lockKey = 'dfarm_sync_lock_p52_multitab_test';

          // Start long lock hold in Tab A (2s TTL, held for 2.6s -> tests heartbeat renewal too)
          await tabA.exposeFunction('__releaseTabALockPromise', () => {});
          const tabAHoldPromise = tabA.evaluate(async (key) => {
            return await window.__DFARM__.multiTabLock.withLock(
              key,
              async () => {
                await new Promise((r) => setTimeout(r, 2600));
                return 'tabA_done';
              },
              1500
            );
          }, lockKey);

          // Give Tab A 300ms to acquire Web Lock + IDB Lock
          await new Promise((r) => setTimeout(r, 300));

          // Tab B attempts concurrent withLock -> MUST YIELD (LOCKED_BY_ANOTHER_TAB_WEBLOCK)
          const tabBAttempt1 = await tabB.evaluate(async (key) => {
            return await window.__DFARM__.multiTabLock.withLock(key, async () => 'tabB_ran', 5000);
          }, lockKey);
          assert.equal(tabBAttempt1.executed, false);
          assert.equal(tabBAttempt1.reason, 'LOCKED_BY_ANOTHER_TAB_WEBLOCK');

          // Wait past original 1500ms TTL while Tab A is STILL running; heartbeat must keep IDB lock alive!
          await new Promise((r) => setTimeout(r, 1500));
          const tabBAttempt2 = await tabB.evaluate(async (key) => {
            return await window.__DFARM__.multiTabLock.withLock(key, async () => 'tabB_ran_2', 5000);
          }, lockKey);
          assert.equal(tabBAttempt2.executed, false);

          const tabARes = await tabAHoldPromise;
          assert.equal(tabARes.executed, true);
          assert.equal(tabARes.result, 'tabA_done');

          // Now simulate Tab A crash while holding an unexpired IDB lock + Web Lock
          let tabAAcquired = false;
          await tabA.exposeFunction('onTabAAcquired', () => { tabAAcquired = true; }).catch(() => {});
          tabA.evaluate(async (key) => {
            window.__DFARM__.multiTabLock.withLock(
              key,
              async () => {
                await window.onTabAAcquired();
                await new Promise(() => {}); // Hung tab
              },
              30000
            );
          }, lockKey).catch(() => {});

          const lockDeadline = Date.now() + 5000;
          while (!tabAAcquired && Date.now() < lockDeadline) {
            await new Promise((r) => setTimeout(r, 50));
          }
          assert.equal(tabAAcquired, true, 'Tab A should have acquired lock before testing Tab B block');

          // Confirm Tab B is blocked while Tab A lives
          const blockedDuringLiveTabA = await tabB.evaluate(async (key) => {
            return await window.__DFARM__.multiTabLock.withLock(key, async () => 'should_not_run', 5000);
          }, lockKey);
          assert.equal(blockedDuringLiveTabA.executed, false);

          // Close Tab A (crashed tab -> releases OS/browser Web Lock asynchronously while IDB lock still has ~30s TTL)
          await tabA.close();

          // Tab B MUST reclaim immediately once Mojo cleans up Web Lock (< 3s) via Web Lock grant + forceReclaimOnWebLock without waiting 30s!
          let reclaimedByTabB = null;
          const reclaimDeadline = Date.now() + 4000;
          while (Date.now() < reclaimDeadline) {
            reclaimedByTabB = await tabB.evaluate(async (key) => {
              return await window.__DFARM__.multiTabLock.withLock(key, async () => 'tabB_reclaimed', 5000);
            }, lockKey);
            if (reclaimedByTabB.executed) break;
            await new Promise((r) => setTimeout(r, 200));
          }
          assert.ok(reclaimedByTabB && reclaimedByTabB.executed === true, `Expected Tab B to reclaim lock after Tab A closed, got: ${JSON.stringify(reclaimedByTabB)}`);
          assert.equal(reclaimedByTabB.result, 'tabB_reclaimed');

          await context.close();
          context = null;
        } finally {
          try { if (context) await context.close(); } catch {}
        }
      });
    } finally {
      await vite.close();
      try { fs.rmSync(userDataDirRetry, { recursive: true, force: true }); } catch {}
      try { fs.rmSync(userDataDirMultiTab, { recursive: true, force: true }); } catch {}
    }
  } finally {
    if (createdChartIds.length > 0) {
      await db.query(`
        UPDATE rate_chart_versions SET status = 'DRAFT' WHERE rate_chart_id = ANY($1::uuid[]);
        DELETE FROM rate_chart_cells WHERE rate_chart_version_id IN (SELECT id FROM rate_chart_versions WHERE rate_chart_id = ANY($1::uuid[]));
        DELETE FROM rate_chart_versions WHERE rate_chart_id = ANY($1::uuid[]);
        DELETE FROM rate_charts WHERE id = ANY($1::uuid[]);
      `, [createdChartIds]).catch(() => {});
    }
    tenantDbManager.tenantPools.delete(orgA);
    tenantDbManager.tenantPools.delete(orgB);
    await new Promise((resolve) => backendServer.close(resolve));
  }
});
