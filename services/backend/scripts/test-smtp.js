import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../../../.env');

const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of envContent.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      env[key] = val;
    }
  }
}

const user = env.SMTP_USER || 'd.farm.expart@gmail.com';
const rawPass = env.SMTP_PASS || '';
const cleanPass = rawPass.replace(/\s+/g, '');

console.log('Testing SMTP connection with:');
console.log('User:', user);
console.log('Raw Pass in .env:', JSON.stringify(rawPass));
console.log('Clean Pass (no spaces):', JSON.stringify(cleanPass));
console.log('Current SMTP_HOST in .env:', env.SMTP_HOST);

async function testConfig(name, config, fromAddress) {
  console.log(`\n================ Testing ${name} ================`);
  console.log('Host:', config.host);
  console.log('Port:', config.port);
  console.log('Secure:', config.secure);
  console.log('From:', fromAddress);

  const transporter = nodemailer.createTransport(config);

  try {
    console.log('1. Verifying transporter connection...');
    await transporter.verify();
    console.log('>>> SUCCESS: Transporter connection verified! <<<');

    console.log('2. Sending trial test email to:', user);
    const info = await transporter.sendMail({
      from: fromAddress,
      to: user,
      subject: `[DFarm Trial Test] Manual Confirmation - ${new Date().toLocaleTimeString()}`,
      text: `Hello,\n\nThis is a trial confirmation email from DFarm Platform to verify SMTP delivery.\n\nTimestamp: ${new Date().toISOString()}\nHost: ${config.host}\nPort: ${config.port}\n\nDFarm System`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; background: #FAF6F3; border-radius: 12px; border: 1px solid #EBE3DE;">
          <h2 style="color: #FF6A00;">DFarm Platform SMTP Trial Test</h2>
          <p>This is a manual confirmation trial email confirming that your email credentials are functional.</p>
          <hr style="border: 0; border-top: 1px solid #EBE3DE;" />
          <p><strong>Authenticated User:</strong> ${user}</p>
          <p><strong>SMTP Host:</strong> ${config.host}</p>
          <p><strong>SMTP Port:</strong> ${config.port}</p>
          <p><strong>Sent At:</strong> ${new Date().toLocaleString()}</p>
          <p style="color: #2e7d32; font-weight: bold; font-size: 16px;">Status: DELIVERED TO INBOX</p>
        </div>
      `,
    });

    console.log('>>> EMAIL SENT SUCCESSFULLY! <<<');
    console.log('Message ID:', info.messageId);
    console.log('Response:', info.response);
    console.log('Accepted recipients:', info.accepted);
    return { success: true, info };
  } catch (err) {
    console.error('>>> FAILED <<<');
    console.error('Error Code:', err.code);
    console.error('Error Message:', err.message);
    if (err.response) console.error('Server Response:', err.response);
    return { success: false, error: err };
  }
}

async function run() {
  // Test A: Using current .env host
  console.log('\n--- TEST A: Testing current .env host ---');
  await testConfig('Current .env configuration', {
    host: env.SMTP_HOST,
    port: parseInt(env.SMTP_PORT || '587', 10),
    secure: env.SMTP_SECURE === 'true',
    auth: { user, pass: rawPass },
  }, env.SMTP_FROM || user);

  // Test B: Using smtp.gmail.com port 587 with raw password
  console.log('\n--- TEST B: Testing smtp.gmail.com port 587 (raw pass) ---');
  const resB = await testConfig('Gmail SMTP port 587 (raw pass)', {
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user, pass: rawPass },
  }, `DFarm Platform <${user}>`);

  // Test C: Using smtp.gmail.com port 587 with clean password (no spaces)
  if (!resB.success) {
    console.log('\n--- TEST C: Testing smtp.gmail.com port 587 (clean pass) ---');
    await testConfig('Gmail SMTP port 587 (clean pass)', {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user, pass: cleanPass },
    }, `DFarm Platform <${user}>`);
  }

  // Test D: Using smtp.gmail.com port 465 (SSL) with clean password
  console.log('\n--- TEST D: Testing smtp.gmail.com port 465 (SSL, clean pass) ---');
  await testConfig('Gmail SMTP port 465 (SSL)', {
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass: cleanPass },
  }, `DFarm Platform <${user}>`);
}

run();
