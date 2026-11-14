import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const adminWebDir = path.resolve(rootDir, 'apps', 'admin-web');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const BACKEND_PORT = 4000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
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
  } catch (err) {
    return false;
  }
}

function proxyRequest(req, res) {
  const options = {
    hostname: '127.0.0.1',
    port: BACKEND_PORT,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: `127.0.0.1:${BACKEND_PORT}`,
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: { code: 'BAD_GATEWAY', message: 'Backend service at port 4000 unavailable' },
    }));
  });

  req.pipe(proxyReq, { end: true });
}

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  // Enable CORS
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-Id',
    });
    res.end();
    return;
  }

  // Proxy API requests
  if (urlPath.startsWith('/api/') || urlPath.startsWith('/health')) {
    proxyRequest(req, res);
    return;
  }

  // Serve static files
  let targetPath = null;
  if (urlPath === '/' || urlPath === '/index.html') {
    targetPath = path.join(adminWebDir, 'index.html');
  } else if (urlPath.startsWith('/dist/')) {
    targetPath = path.join(adminWebDir, urlPath);
  } else if (urlPath.startsWith('/packages/')) {
    targetPath = path.join(rootDir, urlPath);
  } else {
    // Try adminWebDir first
    const candidate = path.join(adminWebDir, urlPath);
    if (fs.existsSync(candidate) && !fs.statSync(candidate).isDirectory()) {
      targetPath = candidate;
    }
  }

  if (targetPath && serveFile(res, targetPath)) {
    return;
  }

  // Fallback to index.html for SPA routes
  const indexPath = path.join(adminWebDir, 'index.html');
  if (serveFile(res, indexPath)) {
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`DFarm Admin Web Server running at http://localhost:${PORT}`);
  console.log(`Proxying API requests to Backend at http://localhost:${BACKEND_PORT}`);
});

