// DFarm Phase 12 — Chrome DevTools Protocol Screenshot Automation
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const SCREENSHOT_DIR = path.resolve(__dirname, '../docs/implementation/phase-12-collection-ui/screenshots/after');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

function putJson(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: 'PUT',
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(JSON.parse(data)));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  console.log('Connecting to Chrome CDP on port 9222...');
  const version = await getJson('http://127.0.0.1:9222/json/version');
  console.log('Browser version:', version.Browser);

  // Create new page using PUT
  const target = await putJson('http://127.0.0.1:9222/json/new?http://localhost:5175/collection');
  console.log('Target created:', target.id);

  const ws = new WebSocket(target.webSocketDebuggerUrl);

  let idCounter = 1;
  const pending = new Map();

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = idCounter++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.on('message', (msg) => {
    const res = JSON.parse(msg);
    if (res.id && pending.has(res.id)) {
      const { resolve, reject } = pending.get(res.id);
      pending.delete(res.id);
      if (res.error) reject(res.error);
      else resolve(res.result);
    }
  });

  await new Promise((resolve) => ws.on('open', resolve));
  console.log('WebSocket connected to page target.');

  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');

  // Set 1920x1080 Viewport
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  });

  // Inject LocalStorage Session
  await send('Runtime.evaluate', {
    expression: `
      localStorage.setItem('dfarm_collection_token', 'demo-token');
      localStorage.setItem('dfarm_collection_dairy_id', 'dairy-ten-9801');
      localStorage.setItem('dfarm_collection_operator', JSON.stringify({
        id: 'op-superadmin',
        fullName: 'Pankaj Popat Yewale',
        role: 'SUPER_ADMIN',
        dairyId: 'dairy-ten-9801',
        dairyName: 'Gokul Primary Cooperative',
        dairyCode: 'GOKUL-01',
        mobileNumber: '7755995615'
      }));
    `,
  });

  // Navigate to collection
  await send('Page.navigate', { url: 'http://localhost:5175/collection' });
  await sleep(2500);

  async function takeScreenshot(fileName) {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    const filePath = path.join(SCREENSHOT_DIR, fileName);
    fs.writeFileSync(filePath, Buffer.from(data, 'base64'));
    console.log(`Saved screenshot: ${fileName}`);
  }

  // 1. Main collection workspace — no customer selected
  await takeScreenshot('01_main_workspace_no_customer.png');

  // 2. Main collection workspace — farmer identified (via Face C-101 simulation)
  await send('Runtime.evaluate', {
    expression: `
      Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Face C-101'))?.click();
    `,
  });
  await sleep(1500);
  await takeScreenshot('02_main_workspace_farmer_identified.png');

  // 3. Main collection workspace — valid live measurements (enable manual input and enter readings)
  await send('Runtime.evaluate', {
    expression: `
      // Enable manual input
      Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Enable Manual Input'))?.click();
    `,
  });
  await sleep(500);

  await send('Runtime.evaluate', {
    expression: `
      // Set values on the inputs
      const inputs = document.querySelectorAll('input[type="number"]');
      if (inputs.length >= 4) {
        // Fat
        inputs[0].value = '4.2';
        inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
        // SNF
        inputs[1].value = '8.6';
        inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
        // CLR
        inputs[2].value = '28.0';
        inputs[2].dispatchEvent(new Event('change', { bubbles: true }));
        // Liters
        inputs[3].value = '14.5';
        inputs[3].dispatchEvent(new Event('change', { bubbles: true }));
      }
      // Ensure scale is STABLE
      const scaleBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Scale: UNSTABLE'));
      if (scaleBtn) scaleBtn.click();
    `,
  });
  await sleep(1200);
  await takeScreenshot('03_main_workspace_valid_measurements.png');

  // 4. Main collection workspace — Save Intake available
  await takeScreenshot('04_main_workspace_save_available.png');

  // 5. Main collection workspace — successful intake (click save button)
  await send('Runtime.evaluate', {
    expression: `
      const submitBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('CONFIRM & RECORD INTAKE'));
      if (submitBtn) submitBtn.click();
    `,
  });
  await sleep(1800);
  await takeScreenshot('05_main_workspace_successful_intake.png');

  // 6. F2 Customer Directory open
  await send('Runtime.evaluate', {
    expression: `
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true }));
    `,
  });
  await sleep(1000);
  await takeScreenshot('06_f2_customer_directory_open.png');

  // Close F2 and open F3
  await send('Runtime.evaluate', {
    expression: `
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    `,
  });
  await sleep(500);

  // 7. F3 Shift Sessions open
  await send('Runtime.evaluate', {
    expression: `
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F3', bubbles: true }));
    `,
  });
  await sleep(1000);
  await takeScreenshot('07_f3_shift_sessions_open.png');

  // Close F3 and open F4
  await send('Runtime.evaluate', {
    expression: `
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    `,
  });
  await sleep(500);

  // 8. F4 Hardware Diagnostics open
  await send('Runtime.evaluate', {
    expression: `
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F4', bubbles: true }));
    `,
  });
  await sleep(1000);
  await takeScreenshot('08_f4_hardware_diagnostics_open.png');

  // Close F4 and open F5
  await send('Runtime.evaluate', {
    expression: `
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    `,
  });
  await sleep(500);

  // 9. F5 Offline Queue open
  await send('Runtime.evaluate', {
    expression: `
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F5', bubbles: true }));
    `,
  });
  await sleep(1000);
  await takeScreenshot('09_f5_offline_queue_open.png');

  // Close F5 and open F6
  await send('Runtime.evaluate', {
    expression: `
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    `,
  });
  await sleep(500);

  // 10. F6 Kiosk Settings open
  await send('Runtime.evaluate', {
    expression: `
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F6', bubbles: true }));
    `,
  });
  await sleep(1000);
  await takeScreenshot('10_f6_kiosk_settings_open.png');

  // Close F6
  await send('Runtime.evaluate', {
    expression: `
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    `,
  });
  await sleep(500);

  // 11. Face/RFID mismatch state
  // Simulate face C-101 and RFID for someone else (C-102)
  await send('Runtime.evaluate', {
    expression: `
      Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Face C-101'))?.click();
    `,
  });
  await sleep(800);
  await send('Runtime.evaluate', {
    expression: `
      // Tap RFID for Patil while face is C-102
      Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Face C-102'))?.click();
    `,
  });
  await sleep(800);
  await takeScreenshot('11_identity_conflict_mismatch.png');

  // 12. Offline state
  await send('Runtime.evaluate', {
    expression: `
      window.dispatchEvent(new Event('offline'));
    `,
  });
  await sleep(800);
  await takeScreenshot('12_offline_mode_state.png');

  // 13. Responsive 1366x768 Viewport verification
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1366,
    height: 768,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await sleep(1000);
  await takeScreenshot('13_responsive_1366x768_counter.png');

  console.log('All screenshots captured successfully!');
  ws.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('Screenshot error:', err);
  process.exit(1);
});
