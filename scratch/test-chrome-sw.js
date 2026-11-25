import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runServiceWorkerVerification() {
  console.log('=== DFarm Prompt 5.2.1: Service Worker Real Chrome Verification ===');

  let serverCallCount = 0;
  let currentRateVersion = 1;

  // 1. Start local HTTP server
  const swPath = path.resolve(__dirname, '../apps/dfarm-collection-app/public/sw.js');
  const swCode = fs.readFileSync(swPath, 'utf-8')
    .replace('__DFARM_BUILD_VERSION__', 'v1.0.p521test')
    .replace('__DFARM_PRECACHE_ASSETS__', '["/index.html"]');

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>DFarm PWA Test</title>
</head>
<body>
  <h1>DFarm PWA Service Worker Verification</h1>
  <script>
    window.__swReady = new Promise((resolve, reject) => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
          .then(reg => {
            if (reg.active) {
              resolve('already_active');
            } else {
              const sw = reg.installing || reg.waiting;
              sw.addEventListener('statechange', () => {
                if (sw.state === 'activated') resolve('activated');
              });
            }
          })
          .catch(reject);
      } else {
        reject(new Error('No service worker support'));
      }
    });

    window.lastEtag = null;

    window.fetchRateSync = async (method = 'POST') => {
      const headers = {
        'Content-Type': 'application/json',
        'X-Rate-Scope': 'ORGANIZATION_WIDE',
        'Authorization': 'Bearer mock-jwt-token'
      };
      if (window.lastEtag) {
        headers['If-None-Match'] = window.lastEtag;
      }
      const opts = {
        method,
        headers
      };
      if (method === 'POST') {
        opts.body = JSON.stringify({ scope: 'ORGANIZATION_WIDE' });
      }
      const res = await fetch('/api/v1/rates/sync?scope=ORGANIZATION_WIDE', opts);
      const etag = res.headers.get('ETag');
      if (etag) window.lastEtag = etag;

      if (res.status === 304) {
        return { status: 304, notModified: true };
      }
      const data = await res.json();
      return { status: res.status, data };
    };

    window.checkCacheEntries = async () => {
      const keys = await caches.keys();
      const apiEntries = [];
      for (const k of keys) {
        const cache = await caches.open(k);
        const reqs = await cache.keys();
        for (const r of reqs) {
          if (r.url.includes('/api/')) apiEntries.push({ cache: k, url: r.url });
        }
      }
      return { keys, apiEntries };
    };
  </script>
</body>
</html>`;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/sw.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(swCode);
      return;
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
      return;
    }

    if (url.pathname.startsWith('/api/v1/rates/sync')) {
      serverCallCount++;
      const etag = `"etag-v${currentRateVersion}"`;
      const ifNoneMatch = req.headers['if-none-match'];

      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');

      if (ifNoneMatch && (ifNoneMatch === etag || ifNoneMatch === `W/${etag}`)) {
        res.writeHead(304);
        res.end();
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: {
          version: currentRateVersion,
          serverCallCount,
          scope: 'ORGANIZATION_WIDE',
          syncedAt: new Date().toISOString()
        }
      }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => server.listen(4005, '127.0.0.1', resolve));
  console.log('[1/5] Local test server running on http://127.0.0.1:4005');

  // 2. Launch Real Google Chrome
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  console.log('[2/5] Real Chrome browser launched successfully from:', chromePath);

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 3. Navigate & register SW
    await page.goto('http://127.0.0.1:4005/index.html');
    const swStatus = await page.evaluate(() => window.__swReady);
    console.log('[3/5] Service Worker registered & active in Chrome:', swStatus);

    // 4. Test POST API request passes directly to backend (Network-Only)
    const call1 = await page.evaluate(() => window.fetchRateSync('POST'));
    console.log('[4/5] POST Rate sync fetch response received:', call1.data);
    if (call1.status !== 200 || call1.data.data.version !== 1) {
      throw new Error(`Expected status 200 and version 1, got ${JSON.stringify(call1)}`);
    }
    if (serverCallCount !== 1) {
      throw new Error(`Expected serverCallCount 1, got ${serverCallCount}`);
    }

    // Confirm /api/v1/ requests are EXCLUDED from CacheStorage
    const cacheReport = await page.evaluate(() => window.checkCacheEntries());
    console.log('[4b/5] Chrome CacheStorage inspected. Caches present:', cacheReport.keys);
    console.log('       API entries found in CacheStorage:', cacheReport.apiEntries);
    if (cacheReport.apiEntries.length > 0) {
      throw new Error(`Inappropriate static/runtime caching detected! Found API entries: ${JSON.stringify(cacheReport.apiEntries)}`);
    }

    // 5. Conditional request: unchanged version returns 304 Not Modified
    const condCall = await page.evaluate(() => window.fetchRateSync('POST'));
    console.log('[5a/5] Conditional Rate sync request returned 304:', condCall);
    if (condCall.status !== 304) {
      throw new Error(`Expected status 304, got ${condCall.status}`);
    }

    // 6. Test that newer server response cannot be overridden by stale cache
    currentRateVersion = 2; // Server updates rate chart to Version 2
    const call2 = await page.evaluate(() => window.fetchRateSync('POST'));
    console.log('[5b/5] Updated rate sync fetch response received:', call2.data);
    if (call2.data.data.version !== 2) {
      throw new Error(`Stale cache override detected! Expected version 2, got ${call2.data.data.version}`);
    }

    // Test GET request as well
    const callGet = await page.evaluate(() => window.fetchRateSync('GET'));
    console.log('[5c/5] GET rate sync with matching ETag returned 304:', callGet);
    if (callGet.status !== 304) {
      throw new Error(`Expected status 304 for GET with matching ETag, got ${callGet.status}`);
    }

    // 7. Test Offline Behavior
    await context.setOffline(true);
    let offlineFetchFailed = false;
    try {
      await page.evaluate(() => window.fetchRateSync('POST'));
    } catch (err) {
      offlineFetchFailed = true;
    }
    if (!offlineFetchFailed) {
      throw new Error('Expected network fetch to fail while offline, but it succeeded (unexpected synthetic or cached response)');
    }
    console.log('[6/5] Confirmed offline API requests fail at network layer without returning stale cache.');

    // Offline app shell navigation test
    const offlineNav = await page.goto('http://127.0.0.1:4005/index.html');
    const pageTitle = await page.title();
    if (pageTitle !== 'DFarm PWA Test') {
      throw new Error(`Expected offline page title 'DFarm PWA Test', got '${pageTitle}'`);
    }
    console.log('[7/5] Confirmed offline navigation loads App Shell from CacheStorage successfully.');

    console.log('=== REAL CHROME SERVICE WORKER VERIFICATION: ALL CHECKS PASSED ===');
  } finally {
    await browser.close();
    server.close();
  }
}

runServiceWorkerVerification().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
