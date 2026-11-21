import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const BACKEND_PORT = 4000;

const APPS = {
  dairyAdmin: {
    name: 'Dairy Admin Portal',
    port: 5174,
    distDir: path.resolve(rootDir, 'apps', 'dfarm-dairy-admin', 'dist'),
    pathPrefix: '/dairy-admin',
  },
  superAdmin: {
    name: 'Super Admin Portal',
    port: 5173,
    distDir: path.resolve(rootDir, 'apps', 'dfarm-super-admin', 'dist'),
    pathPrefix: '/super-admin',
  },
  collectionApp: {
    name: 'Milk Collection Terminal',
    port: 5175,
    distDir: path.resolve(rootDir, 'apps', 'dfarm-collection-app', 'dist'),
    pathPrefix: '/collection',
  },
  customerApp: {
    name: 'Customer Mobile & Web App',
    port: 8081,
    distDir: path.resolve(rootDir, 'apps', 'dfarm-customer-app', 'dist'),
    pathPrefix: '/customer',
  },
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
};

function serveFile(res, filePath) {
  try {
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      return false;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const content = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    });
    res.end(content);
    return true;
  } catch (_err) {
    return false;
  }
}

function proxyRequest(req, res, targetPort = BACKEND_PORT) {
  const options = {
    hostname: '127.0.0.1',
    port: targetPort,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: `127.0.0.1:${targetPort}`,
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (_err) => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        success: false,
        error: {
          code: 'BAD_GATEWAY',
          message: `Service at port ${targetPort} is currently offline or starting up.`,
        },
      })
    );
  });

  req.pipe(proxyReq, { end: true });
}

function renderPortalPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DFarm — Smart Dairy Management System Hub</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🥛</text></svg>">
  <style>
    :root {
      --primary: #FF6A00;
      --primary-hover: #E55E00;
      --bg: #F8FAFC;
      --card-bg: #FFFFFF;
      --text: #0F172A;
      --text-muted: #64748B;
      --border: #E2E8F0;
      --success: #16A34A;
      --shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.04);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 30px 20px;
    }
    .container {
      max-width: 1040px;
      margin: 0 auto;
    }
    header {
      text-align: center;
      margin-bottom: 40px;
    }
    .badge {
      display: inline-block;
      background: #FFF7ED;
      color: #C2410C;
      font-weight: 600;
      font-size: 0.8rem;
      padding: 4px 12px;
      border-radius: 9999px;
      border: 1px solid #FFEDD5;
      margin-bottom: 12px;
    }
    h1 {
      font-size: 2.2rem;
      font-weight: 800;
      color: #1E293B;
      margin-bottom: 8px;
    }
    h1 span {
      color: var(--primary);
    }
    p.subtitle {
      color: var(--text-muted);
      font-size: 1.05rem;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 24px;
      margin-bottom: 40px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px;
      box-shadow: var(--shadow);
      transition: all 0.2s ease-in-out;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .card:hover {
      transform: translateY(-4px);
      box-shadow: 0 20px 30px -10px rgba(255, 106, 0, 0.15);
      border-color: #FED7AA;
    }
    .card-header {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 14px;
    }
    .icon {
      font-size: 2rem;
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #FFF5EE;
      border-radius: 12px;
      border: 1px solid #FFEDD5;
    }
    .card-title {
      font-size: 1.2rem;
      font-weight: 700;
      color: #1E293B;
    }
    .port-tag {
      font-size: 0.75rem;
      font-family: monospace;
      color: var(--text-muted);
      background: #F1F5F9;
      padding: 2px 6px;
      border-radius: 4px;
      display: inline-block;
      margin-top: 2px;
    }
    .card-desc {
      color: var(--text-muted);
      font-size: 0.92rem;
      margin-bottom: 20px;
      flex-grow: 1;
    }
    .btn {
      display: block;
      width: 100%;
      text-align: center;
      background: var(--primary);
      color: white;
      text-decoration: none;
      font-weight: 600;
      padding: 10px 16px;
      border-radius: 10px;
      transition: background 0.15s ease;
    }
    .btn:hover {
      background: var(--primary-hover);
    }
    .btn-secondary {
      background: #F1F5F9;
      color: #334155;
      margin-top: 8px;
    }
    .btn-secondary:hover {
      background: #E2E8F0;
    }
    .footer {
      text-align: center;
      border-top: 1px solid var(--border);
      padding-top: 24px;
      color: var(--text-muted);
      font-size: 0.88rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <span class="badge">DFarm Multi-App Ecosystem</span>
      <h1>Welcome to <span>DFarm</span> Platform</h1>
      <p class="subtitle">Complete Smart Dairy Management Ecosystem — Unified Local Hub</p>
    </header>

    <div class="grid">
      <!-- Dairy Admin -->
      <div class="card">
        <div>
          <div class="card-header">
            <div class="icon">🏢</div>
            <div>
              <div class="card-title">Dairy Admin Portal</div>
              <span class="port-tag">Port 5174</span>
            </div>
          </div>
          <p class="card-desc">Dairy operations dashboard, rate charts, farmer KYC approvals, milk collection sessions, feed inventory, and customer ledgers.</p>
        </div>
        <div>
          <a class="btn" href="http://localhost:5174" target="_blank">Open Dairy Admin (Dev :5174)</a>
          <a class="btn btn-secondary" href="/dairy-admin" target="_blank">View Static Build</a>
        </div>
      </div>

      <!-- Super Admin -->
      <div class="card">
        <div>
          <div class="card-header">
            <div class="icon">⚡</div>
            <div>
              <div class="card-title">Super Admin Portal</div>
              <span class="port-tag">Port 5173</span>
            </div>
          </div>
          <p class="card-desc">Multi-tenant dairy center management, Google Maps geospatial center picker, tenant onboarding, and global audits.</p>
        </div>
        <div>
          <a class="btn" href="http://localhost:5173" target="_blank">Open Super Admin (Dev :5173)</a>
          <a class="btn btn-secondary" href="/super-admin" target="_blank">View Static Build</a>
        </div>
      </div>

      <!-- Milk Collection Terminal -->
      <div class="card">
        <div>
          <div class="card-header">
            <div class="icon">🥛</div>
            <div>
              <div class="card-title">Milk Collection Terminal</div>
              <span class="port-tag">Port 5175</span>
            </div>
          </div>
          <p class="card-desc">Intake terminal with YuNet/SFace biometric identification, RFID card tap, manual override, Fat/SNF calculations, and offline sync.</p>
        </div>
        <div>
          <a class="btn" href="http://localhost:5175" target="_blank">Open Collection App (Dev :5175)</a>
          <a class="btn btn-secondary" href="/collection" target="_blank">View Static Build</a>
        </div>
      </div>

      <!-- Customer App (Mobile / Web) -->
      <div class="card">
        <div>
          <div class="card-header">
            <div class="icon">📱</div>
            <div>
              <div class="card-title">Customer App (Expo / Web / Android)</div>
              <span class="port-tag">Port 8081</span>
            </div>
          </div>
          <p class="card-desc">React Native Expo app for farmers: daily milk deliveries, digital passbook, milk payment slips, bill history, and biometric setup.</p>
        </div>
        <div>
          <a class="btn" href="http://localhost:8081" target="_blank">Open Metro / Web (Port 8081)</a>
          <a class="btn btn-secondary" href="/customer" target="_blank">View Static Build</a>
        </div>
      </div>

      <!-- Backend API -->
      <div class="card">
        <div>
          <div class="card-header">
            <div class="icon">⚙️</div>
            <div>
              <div class="card-title">Backend API Service</div>
              <span class="port-tag">Port 4000</span>
            </div>
          </div>
          <p class="card-desc">Clean Architecture Node.js REST API with double-entry ledger, rate matrices, biometric encryption, SMS/WhatsApp gateways, and PostgreSQL sync.</p>
        </div>
        <div>
          <a class="btn" href="http://localhost:4000/health/live" target="_blank">Check Health (Port 4000)</a>
          <a class="btn btn-secondary" href="/api/v1/health" target="_blank">Check API Health (/api/v1)</a>
        </div>
      </div>
    </div>

    <div class="footer">
      <p>💡 Tip: Run <code>run.bat</code> or <code>./run.ps1</code> in terminal to start all applications together.</p>
    </div>
  </div>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  // Enable CORS
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers':
        'Content-Type, Authorization, X-Request-Id, Accept, X-Dairy-Id, X-Dairy-Tenant-ID, x-dairy-id, x-dairy-tenant-id, X-Client-App, x-client-app, X-Client-Version, x-client-version, X-Device-Id, x-device-id, X-Idempotency-Key, x-idempotency-key, X-Access-Token, x-access-token',
    });
    res.end();
    return;
  }

  // Proxy API requests
  if (urlPath.startsWith('/api/') || urlPath.startsWith('/health')) {
    proxyRequest(req, res, BACKEND_PORT);
    return;
  }

  // Root landing hub
  if (urlPath === '/' || urlPath === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderPortalPage());
    return;
  }

  // Handle static sub-app prefixes
  for (const [_key, appInfo] of Object.entries(APPS)) {
    if (urlPath.startsWith(appInfo.pathPrefix)) {
      const subPath = urlPath.slice(appInfo.pathPrefix.length) || '/';
      const cleanSubPath = subPath === '/' ? 'index.html' : subPath.replace(/^\//, '');
      const candidate = path.join(appInfo.distDir, cleanSubPath);

      if (serveFile(res, candidate)) {
        return;
      }

      // SPA fallback to app's index.html
      const appIndex = path.join(appInfo.distDir, 'index.html');
      if (serveFile(res, appIndex)) {
        return;
      }
    }
  }

  // Fallback to Dairy Admin dist if available
  const dairyAdminDist = APPS.dairyAdmin.distDir;
  const relativePath = urlPath.replace(/^\//, '');
  const candidate = path.join(dairyAdminDist, relativePath);
  if (serveFile(res, candidate)) {
    return;
  }

  // Fallback to root hub page
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(renderPortalPage());
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 DFarm Unified Platform Hub running at http://localhost:${PORT}`);
  console.log(`👉 Proxying API requests to Backend at http://localhost:${BACKEND_PORT}`);
  console.log(`======================================================\n`);
});
