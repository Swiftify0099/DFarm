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

test('Prompt 5.2: Real Windows Chrome UI Flow, Fault Injection & Crash Recovery Test Suite', async (suite) => {
  const isConnected = await db.checkConnection();
  if (!isConnected) {
    console.log('[PROMPT 5.2 BROWSER CRASH TEST] Real PostgreSQL connection is unavailable. Suite skipped.');
    suite.skip('Real PostgreSQL environment unavailable');
    return;
  }

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if (!fs.existsSync(chromePath)) {
    console.log('[PROMPT 5.2 BROWSER CRASH TEST] Chrome executable not found at: ' + chromePath);
    suite.skip('Google Chrome executable unavailable on Windows');
    return;
  }

  // ==========================================================================
  // TEST 1: Verify Fault Injection is Strictly Excluded from Production Bundle
  // ==========================================================================
  await suite.test('1. Production bundle strictly excludes fault injection hook (__DFARM_TEST_CRASH_BEFORE_ACK__)', async () => {
    const distAssetsDir = path.resolve(rootDir, 'apps/dfarm-collection-app/dist/assets');
    assert.ok(fs.existsSync(distAssetsDir), 'Production dist/assets directory must exist (run npm run build first)');

    const files = fs.readdirSync(distAssetsDir).filter((f) => f.endsWith('.js'));
    assert.ok(files.length > 0, 'Production bundle must contain compiled JS files');

    for (const file of files) {
      const content = fs.readFileSync(path.join(distAssetsDir, file), 'utf-8');
      assert.ok(
        !content.includes('__DFARM_TEST_CRASH_BEFORE_ACK__'),
        `Production JS chunk ${file} must NEVER contain __DFARM_TEST_CRASH_BEFORE_ACK__`
      );
      assert.ok(
        !content.includes('__DFARM__'),
        `Production JS chunk ${file} must NEVER contain __DFARM__ dev test harness`
      );
    }
  });

  // ==========================================================================
  // TEST 2: Real Chrome UI Intake -> IndexedDB Atomic Commit -> PostgreSQL Commit
  //         -> Fault Before Ack -> Chrome Crash -> Relaunch -> Auto Recovery REPLAYED
  // ==========================================================================
  await suite.test('2. Real Chrome UI collection -> PostgreSQL commit -> crash before IndexedDB ack -> restart auto-replays REPLAYED with 1x PG financial state', async () => {
    const runSuffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
    const orgId = crypto.randomUUID();
    const centerId = crypto.randomUUID();
    const operatorId = crypto.randomUUID();
    const customerId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const chartId = crypto.randomUUID();
    const versionId = crypto.randomUUID();

    const today = new Date().toISOString().split('T')[0];
    const sessionOpenTime = `${today}T06:00:00Z`;

    tenantDbManager.tenantPools.set(orgId, db.pool);

    // Deterministic clean setup in PostgreSQL
    await db.query(`
      ALTER TABLE milk_collections
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;

      ALTER TABLE milk_collections DROP CONSTRAINT IF EXISTS milk_collections_idempotency_key_key;

      CREATE UNIQUE INDEX IF NOT EXISTS uq_milk_collections_org_idempotency
      ON milk_collections (organization_id, idempotency_key);

      INSERT INTO organizations (id, name, code, status)
      VALUES ('${orgId}', 'DFarm Crash Test Cooperative P5.2 ${runSuffix}', 'ORG-P52-${runSuffix}', 'ACTIVE')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE';

      INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status, timezone)
      VALUES ('${centerId}', '${orgId}', 'C-P52-${runSuffix}', 'Center P52', 'Main St', 'KopTown', 'Kolhapur', 'Maharashtra', '416001', '+919822005252', 'ACTIVE', 'Asia/Kolkata')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE', timezone = 'Asia/Kolkata';

      INSERT INTO users (id, organization_id, username, phone_number, full_name, role, status)
      VALUES ('${operatorId}', '${orgId}', 'op_p52_${runSuffix}', '+919822005252', 'Operator P52', 'COLLECTION_OPERATOR', 'ACTIVE')
      ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', full_name = 'Operator P52';

      DELETE FROM user_center_assignments WHERE user_id = '${operatorId}';
      INSERT INTO user_center_assignments (id, user_id, center_id, is_primary)
      VALUES (gen_random_uuid(), '${operatorId}', '${centerId}', TRUE);

      INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status, is_deleted)
      VALUES ('${customerId}', '${orgId}', '${centerId}', 'F-P52', 'Suresh Patil P52', '+919822335252', 'ACTIVE', 'APPROVED', FALSE)
      ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', is_deleted = FALSE, primary_center_id = EXCLUDED.primary_center_id, farmer_code = 'F-P52', full_name = 'Suresh Patil P52';

      INSERT INTO customer_milk_categories (customer_id, milk_category, authorized_by)
      VALUES ('${customerId}', 'COW', '${operatorId}')
      ON CONFLICT (customer_id, milk_category) DO NOTHING;

      INSERT INTO customer_ledger_accounts (id, customer_id, organization_id, current_balance, currency)
      VALUES (gen_random_uuid(), '${customerId}', '${orgId}', 0.00, 'INR');

      INSERT INTO devices (id, organization_id, center_id, device_identifier, device_type, status)
      VALUES (gen_random_uuid(), '${orgId}', '${centerId}', 'KIOSK_MAIN', 'COUNTER_TERMINAL', 'ACTIVE')
      ON CONFLICT (device_identifier) DO UPDATE SET status = 'ACTIVE', organization_id = EXCLUDED.organization_id, center_id = EXCLUDED.center_id;

      DELETE FROM kiosk_shift_sessions WHERE organization_id = '${orgId}' AND center_id = '${centerId}' AND id <> '${sessionId}';
      INSERT INTO kiosk_shift_sessions (id, session_code, organization_id, center_id, business_date, shift, status, opened_at, opening_operator_id, device_identifier, total_liters, cow_liters, buffalo_liters, total_amount, transaction_count)
      VALUES ('${sessionId}', 'SES-P52-CRASH-${runSuffix}', '${orgId}', '${centerId}', '${today}', 'MORNING', 'OPEN', '${sessionOpenTime}'::timestamptz, '${operatorId}', 'KIOSK_MAIN', 0, 0, 0, 0, 0)
      ON CONFLICT (id) DO UPDATE SET status = 'OPEN', business_date = EXCLUDED.business_date, total_liters = 0, cow_liters = 0, buffalo_liters = 0, total_amount = 0, transaction_count = 0;

      INSERT INTO rate_charts (id, organization_id, center_id, name, milk_category, pricing_type, is_active)
      VALUES ('${chartId}', '${orgId}', '${centerId}', 'Crash Test Rate Chart P52', 'COW', 'GRID', TRUE)
      ON CONFLICT (id) DO UPDATE SET is_active = TRUE, pricing_type = 'GRID', center_id = EXCLUDED.center_id;

      ALTER TABLE rate_chart_versions
      ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'DRAFT',
      ADD COLUMN IF NOT EXISTS pricing_unit VARCHAR(20) DEFAULT 'PER_KG',
      ADD COLUMN IF NOT EXISTS measurement_unit VARCHAR(10) DEFAULT 'KG',
      ADD COLUMN IF NOT EXISTS fat_min NUMERIC(5,2),
      ADD COLUMN IF NOT EXISTS fat_max NUMERIC(5,2),
      ADD COLUMN IF NOT EXISTS snf_min NUMERIC(5,2),
      ADD COLUMN IF NOT EXISTS snf_max NUMERIC(5,2),
      ADD COLUMN IF NOT EXISTS formula_definition JSONB;

      INSERT INTO rate_chart_versions (id, rate_chart_id, version_number, status, pricing_unit, measurement_unit, base_fat, base_snf, base_rate, fat_min, fat_max, snf_min, snf_max, formula_definition, effective_from, is_approved)
      VALUES ('${versionId}', '${chartId}', 1, 'DRAFT', 'PER_KG', 'KG', 3.5, 8.5, 38.0, 2.5, 6.0, 7.5, 10.0, NULL, '2020-01-01 00:00:00Z', TRUE)
      ON CONFLICT (id) DO UPDATE SET status = 'DRAFT', is_approved = TRUE, effective_from = '2020-01-01 00:00:00Z';

      INSERT INTO rate_chart_cells (rate_chart_version_id, fat_percentage, snf_percentage, rate_per_unit)
      VALUES ('${versionId}', 4.0, 8.5, 40.10)
      ON CONFLICT DO NOTHING;

      UPDATE rate_chart_versions SET status = 'PUBLISHED' WHERE id = '${versionId}';
    `);

    const tokenService = new HmacJwtTokenService();
    const operatorToken = tokenService.signToken({
      userId: operatorId,
      organizationId: orgId,
      centerId: centerId,
      deviceId: 'KIOSK_MAIN',
      role: 'COLLECTION_OPERATOR',
      actorType: 'STAFF',
      fullName: 'Operator P52',
    });

    const backendServer = http.createServer(app);
    await new Promise((resolve) => backendServer.listen(0, '127.0.0.1', resolve));
    const backendPort = backendServer.address().port;

    const userDataDir = path.resolve(os.tmpdir(), `dfarm-p52-crash-test-${Date.now()}`);
    fs.mkdirSync(userDataDir, { recursive: true });

    // Use empty userDataDir as Vite envDir so apps/dfarm-collection-app/.env does not override local /api/v1 proxy
    const viteEntryPath = path.resolve(rootDir, 'apps/dfarm-collection-app/node_modules/vite/dist/node/index.js');
    const { createServer } = await import(pathToFileURL(viteEntryPath).href);
    const vite = await createServer({
      root: path.resolve(rootDir, 'apps/dfarm-collection-app'),
      envDir: userDataDir,
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
    console.log(`[PROMPT 5.2 CRASH TEST] Backend :${backendPort}, Vite :${vitePort}`);

    const { chromium } = await import('playwright');

    let capturedUuid = null;
    let capturedIdempotencyKey = null;
    let committedResponseItem = null;
    let context1 = null;
    let context2 = null;

    try {
      // ======================================================================
      // PHASE 1: Launch Real Chrome, Create Collection via Real UI, Crash Before Ack
      // ======================================================================
      context1 = await chromium.launchPersistentContext(userDataDir, {
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
              fullName: 'Operator P52',
              role: 'COLLECTION_OPERATOR',
              dairyId,
              centerId,
              dairyCode: 'ORG-P52',
              centerCode: 'C-P52',
            })
          );
        },
        { token: operatorToken, dairyId: orgId, centerId, operatorId }
      );
      const page1 = await context1.newPage();
      page1.on('console', (msg) => console.log('[CHROME 1 LOG]', msg.text()));
      page1.on('response', async (res) => {
        if (res.status() >= 400) {
          let body = '';
          try { body = await res.text(); } catch {}
          console.log('[BAD HTTP RESPONSE]', res.status(), res.url(), body);
        }
      });
      page1.on('pageerror', (err) => console.error('[CHROME 1 ERR]', err));

      await page1.goto(`http://127.0.0.1:${vitePort}/`);
      await page1.waitForSelector('#farmer-code-input', { timeout: 15000 });
      await page1.waitForFunction(() => Boolean(window.__DFARM__?.localDB && window.__DFARM__?.syncEngine && window.__DFARM__?.networkManager));

      // Wait for real app startup sync to hydrate active session lease, rate chart, and farmer cache from backend
      await page1.waitForFunction(
        async ({ orgId, centerId, sessionId }) => {
          const chart = await window.__DFARM__.localDB.getRateChart(orgId, 'COW', centerId);
          const session = await window.__DFARM__.localDB.getActiveSession(orgId, centerId, 'KIOSK_MAIN');
          const lease = await window.__DFARM__.localDB.getSessionOfflineAuth(sessionId);
          return Boolean(chart && session && lease?.token);
        },
        { orgId, centerId, sessionId },
        { timeout: 15000 }
      );

      let onFaultInjectedResolve;
      const faultInjectedPromise = new Promise((resolve) => {
        onFaultInjectedResolve = resolve;
      });
      await page1.exposeFunction('__notifyBackendCommitted', (data) => {
        onFaultInjectedResolve(data);
      });

      // Install test-only fault hook BEFORE submitting so ack cannot be persisted
      await page1.evaluate(() => {
        window.__DFARM_TEST_CRASH_BEFORE_ACK__ = async (info) => {
          await window.__notifyBackendCommitted(info);
          await new Promise(() => {});
        };
      });

      // Drive REAL UI: 1. Search farmer by code F-P52
      await page1.fill('#farmer-code-input', 'F-P52');
      const findBtn = page1.getByRole('button', { name: /Find/i });
      if (await findBtn.isVisible()) {
        await findBtn.click();
      } else {
        await page1.press('#farmer-code-input', 'Enter');
      }

      try {
        await page1.waitForFunction(() => document.body.innerText.includes('Suresh Patil P52'), null, { timeout: 10000 });
      } catch (err) {
        const bodyText = await page1.evaluate(() => document.body.innerText);
        console.error('[DIAGNOSTIC BODY ON SEARCH TIMEOUT]:\n' + bodyText);
        throw err;
      }

      // If customer appears as a selectable result pill, click it to select
      const resultPill = page1.locator('button').filter({ hasText: 'F-P52' });
      if (await resultPill.count() > 0) {
        await resultPill.first().click();
      }

      // Drive REAL UI: 2. Enable manual measurements and enter 4.0% Fat, 8.5% SNF, 10.0 L
      await page1.getByRole('button', { name: /Enable Manual Input/i }).click();
      const numInputs = page1.locator('input[type="number"]');
      await numInputs.nth(0).fill('4.0');
      await numInputs.nth(1).fill('8.5');
      await numInputs.nth(3).fill('10');

      const scaleBtn = page1.getByRole('button', { name: /Scale:/i });
      const scaleText = await scaleBtn.innerText();
      if (scaleText.includes('UNSTABLE')) {
        await scaleBtn.click();
      }

      // Hold network offline only long enough to inspect atomic IndexedDB save before bulk sync fires
      await page1.evaluate(() => {
        window.__DFARM__.networkManager.setStatus('BROWSER_OFFLINE');
      });

      // Drive REAL UI: 3. Wait for calculated button "₹ 401.00" and click Confirm & Record Intake
      const submitBtn = page1.getByRole('button', { name: /CONFIRM & RECORD INTAKE.*401\.00/i });
      try {
        await submitBtn.waitFor({ state: 'visible', timeout: 5000 });
      } catch (err) {
        const uiDiagnostics = await page1.evaluate(() => {
          return {
            body: document.body.innerText,
            inputs: Array.from(document.querySelectorAll('input')).map((i) => ({ id: i.id, val: i.value })),
          };
        });
        console.error('[DIAGNOSTICS UI STATE]', JSON.stringify(uiDiagnostics, null, 2));
        throw err;
      }
      await submitBtn.click();

      // Verify atomic IndexedDB persistence of BOTH completed_transactions and offline_queue
      await page1.waitForFunction(
        async () => {
          const txns = await window.__DFARM__.localDB.getTransactions();
          const q = await window.__DFARM__.localDB.getOfflineQueue();
          return txns.length === 1 && q.length === 1;
        },
        null,
        { timeout: 10000 }
      );

      const preSyncIdb = await page1.evaluate(async () => {
        const txns = await window.__DFARM__.localDB.getTransactions();
        const q = await window.__DFARM__.localDB.getOfflineQueue();
        return { txn: txns[0], queueItem: q[0] };
      });

      capturedUuid = preSyncIdb.txn.clientIntakeUuid || preSyncIdb.txn.id;
      capturedIdempotencyKey = preSyncIdb.txn.idempotencyKey;
      assert.ok(capturedUuid, 'UI collection must generate permanent clientIntakeUuid');
      assert.ok(capturedIdempotencyKey, 'UI collection must generate immutable idempotencyKey');
      assert.equal(preSyncIdb.txn.syncStatus, 'PENDING_OFFLINE');
      assert.equal(preSyncIdb.queueItem.clientIntakeUuid, capturedUuid);
      assert.equal(Number(preSyncIdb.txn.totalAmount), 401.0);
      assert.ok(preSyncIdb.txn.offlineAuthorizationToken, 'UI collection must capture session offline lease');

      // Now go ONLINE -> real syncEngine triggers bulk sync -> PostgreSQL commits -> fault hook triggers before IDB ack
      await page1.evaluate(() => {
        window.__DFARM__.networkManager.setStatus('ONLINE');
      });

      const faultInfo = await faultInjectedPromise;
      committedResponseItem = faultInfo.responseItem;
      assert.equal(committedResponseItem.status, 'ACCEPTED');
      assert.ok(committedResponseItem.serverTransactionId);
      assert.ok(committedResponseItem.receiptNumber);

      // Kill real Chrome immediately before IndexedDB ack is saved!
      await context1.close();
      context1 = null;

      // Verify PostgreSQL committed BEFORE Chrome crash while IndexedDB remained unacked
      const pgMid = await db.query(
        'SELECT id, total_amount FROM milk_collections WHERE organization_id = $1 AND idempotency_key = $2;',
        [orgId, capturedIdempotencyKey]
      );
      assert.equal(pgMid.rows.length, 1);

      // ======================================================================
      // PHASE 2: Relaunch Chrome, Verify Unacked State & Automatic REPLAYED Recovery
      // ======================================================================
      context2 = await chromium.launchPersistentContext(userDataDir, {
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
              fullName: 'Operator P52',
              role: 'COLLECTION_OPERATOR',
              dairyId,
              centerId,
              dairyCode: 'ORG-P52',
              centerCode: 'C-P52',
            })
          );
        },
        { token: operatorToken, dairyId: orgId, centerId, operatorId }
      );
      const page2 = await context2.newPage();
      page2.on('console', (msg) => console.log('[CHROME 2 LOG]', msg.text()));
      page2.on('pageerror', (err) => console.error('[CHROME 2 ERR]', err));

      const replayedSyncPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timed out waiting for automatic REPLAYED sync on relaunch')), 20000);
        page2.on('response', async (response) => {
          if (response.url().includes('/collections/sync/bulk') && response.request().method() === 'POST') {
            try {
              const reqBody = response.request().postDataJSON();
              const resBody = await response.json();
              clearTimeout(timeout);
              resolve({ reqBody, resBody });
            } catch (e) {
              clearTimeout(timeout);
              reject(e);
            }
          }
        });
      });

      // Navigate without injecting any manual recovery calls — real PWA startup syncEngine.init() must auto-recover!
      await page2.goto(`http://127.0.0.1:${vitePort}/`);

      const replayExchange = await replayedSyncPromise;
      const sentItem = replayExchange.reqBody.transactions.find((t) => t.clientIntakeUuid === capturedUuid);
      assert.ok(sentItem, 'Recovered sync must resend the original clientIntakeUuid');
      assert.equal(sentItem.idempotencyKey, capturedIdempotencyKey, 'Recovered sync must reuse the exact original idempotencyKey');

      const resultList = replayExchange.resBody.results || replayExchange.resBody.items || [];
      const replayItem = resultList.find((r) => r.clientIntakeUuid === capturedUuid);
      assert.ok(replayItem, 'Backend bulk sync response must include the replayed transaction');
      assert.equal(replayItem.status, 'REPLAYED', 'Backend must return canonical REPLAYED status on post-crash retry');
      assert.equal(replayItem.receiptNumber, committedResponseItem.receiptNumber);

      // Wait for Chrome to persist the canonical acknowledgement in IndexedDB automatically
      await page2.waitForFunction(() => Boolean(window.__DFARM__?.localDB), null, { timeout: 10000 });
      await page2.waitForFunction(
        async (uuid) => {
          const t = await window.__DFARM__.localDB.getTransactionById(uuid);
          const q = await window.__DFARM__.localDB.getOfflineQueue();
          return Boolean(t && t.syncStatus === 'SYNCED_CLOUD' && q.length === 0);
        },
        capturedUuid,
        { timeout: 15000 }
      );

      const postRecovery = await page2.evaluate(async (uuid) => {
        const t = await window.__DFARM__.localDB.getTransactionById(uuid);
        const q = await window.__DFARM__.localDB.getOfflineQueue();
        return { txn: t, queueCount: q.length };
      }, capturedUuid);

      assert.equal(postRecovery.txn.syncStatus, 'SYNCED_CLOUD');
      assert.equal(postRecovery.txn.receiptNumber, committedResponseItem.receiptNumber);
      assert.equal(postRecovery.txn.serverTransactionId, committedResponseItem.serverTransactionId);
      assert.equal(postRecovery.queueCount, 0);

      await context2.close();
      context2 = null;

      // ======================================================================
      // PHASE 3: Direct PostgreSQL Verification (1x Collection, 1x Tally, 1x Ledger)
      // ======================================================================
      const pgCollections = await db.query(
        'SELECT id, total_amount FROM milk_collections WHERE organization_id = $1 AND idempotency_key = $2;',
        [orgId, capturedIdempotencyKey]
      );
      assert.equal(pgCollections.rows.length, 1, 'PostgreSQL must contain exactly 1 milk_collections row');
      assert.equal(Number(pgCollections.rows[0].total_amount), 401.0);

      const sessionRow = await db.query(
        'SELECT total_liters, cow_liters, total_amount, transaction_count FROM kiosk_shift_sessions WHERE id = $1;',
        [sessionId]
      );
      assert.equal(Number(sessionRow.rows[0].transaction_count), 1, 'Session tally must count exactly 1 collection');
      assert.equal(Number(sessionRow.rows[0].total_liters), 10.0);
      assert.equal(Number(sessionRow.rows[0].cow_liters), 10.0);
      assert.equal(Number(sessionRow.rows[0].total_amount), 401.0);

      const ledgerAccountRow = await db.query(
        'SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1 AND organization_id = $2;',
        [customerId, orgId]
      );
      assert.equal(Number(ledgerAccountRow.rows[0].current_balance), 401.0, 'Farmer ledger balance must be credited once (₹401.00)');

      const ledgerTxnRows = await db.query(
        'SELECT id, direction, amount FROM ledger_transactions WHERE organization_id = $1 AND idempotency_key = $2;',
        [orgId, `LEDGER-COLL-${orgId}-${capturedIdempotencyKey}`]
      );
      assert.equal(ledgerTxnRows.rows.length, 1, 'PostgreSQL must contain exactly 1 ledger_transactions credit');
      assert.equal(ledgerTxnRows.rows[0].direction, 'CREDIT');
      assert.equal(Number(ledgerTxnRows.rows[0].amount), 401.0);
    } finally {
      try { if (context1) await context1.close(); } catch {}
      try { if (context2) await context2.close(); } catch {}
      tenantDbManager.tenantPools.delete(orgId);
      await vite.close();
      await new Promise((resolve) => backendServer.close(resolve));
      try {
        fs.rmSync(userDataDir, { recursive: true, force: true });
      } catch {}
    }
  });
});
