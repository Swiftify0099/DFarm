/**
 * DFarm Smart Dairy Collection Terminal — Production Service Worker
 * Architecture:
 * - App Shell Precaching: HTML, CSS, JS, Branding Icons
 * - Hashed Build Assets: Cache-First
 * - Large WASM/ONNX Assets: On-Demand Runtime Caching (dfarm-wasm-models-v1)
 * - Navigation: Network-First with Offline App-Shell Fallback
 * - API Endpoints (/api/): Strict Network-Only (Zero Caching of Auth / Financial Data)
 * - Safe Cache Management: Only purges obsolete dfarm-* caches, never touches foreign caches
 */

// Placeholders injected by Vite build plugin
const BUILD_VERSION = '__DFARM_BUILD_VERSION__';
const INJECTED_ASSETS = __DFARM_PRECACHE_ASSETS__;

const CACHE_SHELL_PREFIX = 'dfarm-shell-';
const CACHE_RUNTIME_PREFIX = 'dfarm-runtime-';
const CACHE_WASM_PREFIX = 'dfarm-wasm-models-';

const SHELL_CACHE = `${CACHE_SHELL_PREFIX}${BUILD_VERSION}`;
const RUNTIME_CACHE = `${CACHE_RUNTIME_PREFIX}${BUILD_VERSION}`;
const WASM_CACHE = `${CACHE_WASM_PREFIX}v1`;

const STATIC_PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/logo-transparent.png',
];

// Combine static assets with build-injected hashed assets
const PRECACHE_ASSETS = Array.from(
  new Set([
    ...STATIC_PRECACHE,
    ...(Array.isArray(INJECTED_ASSETS) ? INJECTED_ASSETS : []),
  ])
);

// 1. Install Event: Precache Core App Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Cache each asset safely; do not let one missing non-critical asset fail entire installation
      for (const asset of PRECACHE_ASSETS) {
        try {
          await cache.add(new Request(asset, { cache: 'reload' }));
        } catch (err) {
          console.warn(`[DFarm SW] Non-fatal precache failure for ${asset}:`, err.message);
        }
      }
    })()
  );
});

// 2. Activate Event: Safe Cache Invalidation (Strictly DFarm-scoped)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const validCaches = new Set([SHELL_CACHE, RUNTIME_CACHE, WASM_CACHE]);

      await Promise.all(
        keys.map((key) => {
          // Strictly delete obsolete DFarm caches; NEVER delete foreign caches
          if (
            (key.startsWith(CACHE_SHELL_PREFIX) || key.startsWith(CACHE_RUNTIME_PREFIX)) &&
            !validCaches.has(key)
          ) {
            console.info(`[DFarm SW] Purging obsolete cache: ${key}`);
            return caches.delete(key);
          }
          return Promise.resolve();
        })
      );

      // Take control of uncontrolled clients immediately
      await self.clients.claim();
    })()
  );
});

// 3. Fetch Event: Multi-tiered Routing Strategy
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignore non-HTTP/HTTPS schemes (e.g. chrome-extension://)
  if (!url.protocol.startsWith('http')) return;

  // A. API & Authenticated Endpoints: STRICT NETWORK-ONLY
  // Never cache authentication, customer data, session mutations, ledger entries or collections
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname === '/api' ||
    url.pathname.startsWith('/api?') ||
    req.method !== 'GET' ||
    req.headers.has('Authorization') ||
    url.port === '4000' ||
    url.hostname.includes('render.com') ||
    url.hostname.includes('supabase.co')
  ) {
    return; // Pass through to browser default network stack; preserve native error responses
  }

  // A2. Cross-Origin Safety: Only intercept same-origin or explicit model/wasm assets
  if (url.origin !== self.location.origin && !url.pathname.endsWith('.wasm') && !url.pathname.endsWith('.onnx')) {
    return;
  }

  // B. Large WebAssembly & ONNX Model Files: Dedicated Runtime Cache
  // Excluded from precache to protect initial install latency and storage quotas
  if (url.pathname.endsWith('.wasm') || url.pathname.endsWith('.onnx')) {
    event.respondWith(
      (async () => {
        // Exclude Range or partial requests from Cache Storage (Cache API throws TypeError on 206)
        if (req.headers.has('Range')) {
          return fetch(req);
        }

        const wasmCache = await caches.open(WASM_CACHE);
        const cached = await wasmCache.match(req);
        if (cached) return cached;

        try {
          const response = await fetch(req);
          // Only cache complete, successful 200 OK responses, never 206 Partial Content or errors
          if (response.ok && response.status === 200) {
            try {
              await wasmCache.put(req, response.clone());
            } catch (cacheErr) {
              // Gracefully handle QuotaExceededError or other cache errors without failing the request
              console.warn(`[DFarm SW] Failed to cache large WASM/model asset: ${cacheErr.message}`);
            }
          }
          return response;
        } catch (err) {
          if (cached) return cached;
          throw err;
        }
      })()
    );
    return;
  }

  // C. HTML Navigation Requests (mode === 'navigate'): Network-First with Offline App-Shell Fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          // Try network first
          const networkResponse = await fetch(req);
          if (networkResponse.ok) {
            // Keep app shell fresh in cache
            const cache = await caches.open(SHELL_CACHE);
            cache.put('/index.html', networkResponse.clone()).catch(() => {});
            return networkResponse;
          }
        } catch (err) {
          // Network failed or offline: fall back to cached App Shell
        }

        const cache = await caches.open(SHELL_CACHE);
        const cachedShell = (await cache.match('/index.html')) || (await cache.match('/'));
        if (cachedShell) {
          return cachedShell;
        }

        return new Response('DFarm Collection App is offline. Please reconnect to load the application.', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      })()
    );
    return;
  }

  // D. Hashed JavaScript and CSS Bundles: Cache-First
  if (url.pathname.startsWith('/assets/') && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css'))) {
    event.respondWith(
      (async () => {
        const cached = (await caches.match(req)) || (await (await caches.open(SHELL_CACHE)).match(req));
        if (cached) return cached;

        try {
          const networkResponse = await fetch(req);
          if (networkResponse.ok) {
            const runtimeCache = await caches.open(RUNTIME_CACHE);
            runtimeCache.put(req, networkResponse.clone()).catch(() => {});
          }
          return networkResponse;
        } catch (err) {
          if (cached) return cached;
          throw err;
        }
      })()
    );
    return;
  }

  // E. Static Assets (Icons, Images, Manifest): Stale-While-Revalidate
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      const fetchPromise = fetch(req)
        .then(async (networkResponse) => {
          if (networkResponse.ok && networkResponse.status === 200) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(req, networkResponse.clone()).catch(() => {});
          }
          return networkResponse;
        })
        .catch(() => null);

      return cached || (await fetchPromise) || new Response(null, { status: 404 });
    })()
  );
});

// 4. Message Event: Skip Waiting and Lifecycle Communication
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SKIP_WAITING') {
    console.info('[DFarm SW] skipWaiting requested by client');
    self.skipWaiting();
  }

  if (event.data.type === 'GET_VERSION') {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({
        version: BUILD_VERSION,
        shellCache: SHELL_CACHE,
        runtimeCache: RUNTIME_CACHE,
        wasmCache: WASM_CACHE,
      });
    }
  }
});
