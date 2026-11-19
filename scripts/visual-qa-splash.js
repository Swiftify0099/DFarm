import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const distDir = path.resolve('apps/dfarm-customer-app/dist');
const artifactsDir = 'C:\\Users\\panka\\.gemini\\antigravity\\brain\\f6dc9af8-08fc-4f3b-8e28-e3e274e1aad2';

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

// Start simple HTTP server for dist
const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || !path.extname(reqPath)) {
    reqPath = '/index.html';
  }
  const filePath = path.join(distDir, reqPath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    // SPA fallback
    const indexHtml = path.join(distDir, 'index.html');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.createReadStream(indexHtml).pipe(res);
  }
});

server.listen(8089, async () => {
  console.log('Static server listening on http://localhost:8089');

  const viewports = [
    { name: 'dfarm-splash-iphone-390x844.png', width: 390, height: 844 },
    { name: 'dfarm-splash-pixel-412x915.png', width: 412, height: 915 },
    { name: 'dfarm-splash-compact-360x780.png', width: 360, height: 780 },
  ];

  try {
    for (const vp of viewports) {
      const outputPath = path.join(artifactsDir, vp.name);
      console.log(`Capturing ${vp.name} (${vp.width}x${vp.height})...`);
      await execFileAsync(chromePath, [
        '--headless=new',
        `--window-size=${vp.width},${vp.height}`,
        '--virtual-time-budget=1500',
        '--hide-scrollbars',
        '--force-device-scale-factor=2',
        `--screenshot=${outputPath}`,
        'http://localhost:8089/',
      ]);
      console.log(`Saved screenshot to ${outputPath}`);
    }
    console.log('All visual QA screenshots captured successfully!');
  } catch (err) {
    console.error('Error during screenshot capture:', err);
  } finally {
    server.close();
    process.exit(0);
  }
});
