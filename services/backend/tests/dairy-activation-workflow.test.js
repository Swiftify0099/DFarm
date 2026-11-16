import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../dist/app.js';

describe('DFarm Dairy Admin Activation & Real Email Workflow Test Suite', () => {
  let server;
  let baseUrl;

  it('setup backend test server', async () => {
    const app = createApp();
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve(null);
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // 1. Mandatory Email Validation
  it('should reject dairy creation when businessEmail is missing', async () => {
    const res = await fetch(`${baseUrl}/api/v1/dairies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'No Email Dairy',
        primaryAdminMobile: '9822112233',
        businessPhone: '9822112233',
        primaryAdminName: 'Ramesh Patil',
        pincode: '416001',
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.error, /email/i);
  });

  it('should reject dairy creation when businessEmail is malformed', async () => {
    const res = await fetch(`${baseUrl}/api/v1/dairies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Malformed Email Dairy',
        businessEmail: 'not-an-email',
        primaryAdminMobile: '9822112233',
        businessPhone: '9822112233',
        primaryAdminName: 'Ramesh Patil',
        pincode: '416001',
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.error, /valid email/i);
  });

  it('should reject dairy creation when primary admin mobile is invalid', async () => {
    const res = await fetch(`${baseUrl}/api/v1/dairies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bad Mobile Dairy',
        businessEmail: 'admin@dairy.org',
        primaryAdminMobile: '12345',
        primaryAdminName: 'Ramesh Patil',
        pincode: '416001',
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.error, /mobile/i);
  });

  let createdDairyId;
  let activationToken;
  let activationLink;
  const testEmail = `primary.admin+test${Date.now()}@dfarm.in`;
  const testMobile = '9822334455';

  // 2. Successful Dairy Creation & Secure Activation Link Generation
  it('should provision dairy tenant and return 256-bit activation token & link', async () => {
    const res = await fetch(`${baseUrl}/api/v1/dairies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Sahyadri Cooperative ${Date.now()}`,
        businessEmail: testEmail,
        primaryAdminMobile: testMobile,
        businessPhone: testMobile,
        primaryAdminName: 'Santosh Yewale',
        pincode: '416001',
        district: 'Kolhapur',
        state: 'Maharashtra',
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.id, 'Dairy ID must be returned');
    assert.ok(body.data.activationToken, 'Activation token must be returned');
    assert.ok(body.data.activationLink, 'Activation link must be returned');

    createdDairyId = body.data.id;
    activationToken = body.data.activationToken;
    activationLink = body.data.activationLink;

    // Check token entropy (32 bytes = 64 hex characters)
    assert.equal(activationToken.length, 64, 'Token must be 256 bits (64 hex characters)');
    assert.ok(activationLink.includes('/activate?token='), 'Link must point to /activate route');
    assert.ok(body.data.invitation.deliveryStatus, 'Delivery status must be captured');
  });

  // 3. Validation Endpoint
  it('should validate activation token and return masked admin metadata', async () => {
    const res = await fetch(`${baseUrl}/api/v1/dairies/invitations/validate?token=${activationToken}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.code, 'VALID');
    assert.ok(body.data.maskedEmail.includes('***'));
    assert.ok(body.data.maskedMobile.includes('***'));
    assert.equal(body.data.dairyId, createdDairyId);
  });

  it('should reject invalid or non-existent token with INVALID_TOKEN', async () => {
    const res = await fetch(`${baseUrl}/api/v1/dairies/invitations/validate?token=non_existent_token_1234567890`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.code, 'INVALID_TOKEN');
  });

  // 4. Request Activation OTP
  let receivedOtp = '123456';
  it('should dispatch activation OTP for valid invitation', async () => {
    const res = await fetch(`${baseUrl}/api/v1/dairies/invitations/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: activationToken }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.message);
    if (body.previewOtp) {
      receivedOtp = body.previewOtp;
    }
  });

  // 5. Complete Account Activation
  it('should atomically activate Primary Dairy Admin with valid token and OTP', async () => {
    const res = await fetch(`${baseUrl}/api/v1/dairies/invitations/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: activationToken,
        otp: receivedOtp,
        confirmed: true,
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.primaryAdminActivated, true);
    assert.equal(body.data.operationalReadinessScore, 50);
  });

  // 6. Single-Use Token Guard
  it('should reject already consumed token on second activation attempt', async () => {
    const res = await fetch(`${baseUrl}/api/v1/dairies/invitations/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: activationToken,
        otp: receivedOtp,
        confirmed: true,
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.code, 'ALREADY_CONSUMED');
  });

  it('should return ALREADY_CONSUMED on validate endpoint for used token', async () => {
    const res = await fetch(`${baseUrl}/api/v1/dairies/invitations/validate?token=${activationToken}`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.code, 'ALREADY_CONSUMED');
  });

  // 7. Resend Invitation Flow
  it('should reject resend on already activated Primary Admin account', async () => {
    const res = await fetch(`${baseUrl}/api/v1/dairies/invitations/resend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dairyId: createdDairyId }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.error, /activated/i);
  });

  it('should resend invitation for pending dairy, revoke previous token, and generate fresh token', async () => {
    // 1. Create a fresh pending dairy
    const createRes = await fetch(`${baseUrl}/api/v1/dairies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Pending Dairy For Resend ${Date.now()}`,
        businessEmail: `pending.resend+${Date.now()}@dfarm.in`,
        primaryAdminMobile: '9822998877',
        businessPhone: '9822998877',
        primaryAdminName: 'Anil Deshmukh',
        pincode: '416002',
      }),
    });
    assert.equal(createRes.status, 201);
    const createBody = await createRes.json();
    const pendingDairyId = createBody.data.id;
    const initialToken = createBody.data.activationToken;

    // 2. Resend invitation
    const resendRes = await fetch(`${baseUrl}/api/v1/dairies/invitations/resend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dairyId: pendingDairyId }),
    });

    assert.equal(resendRes.status, 200);
    const resendBody = await resendRes.json();
    assert.equal(resendBody.success, true);
    assert.ok(resendBody.data.activationToken, 'Must generate fresh token');
    assert.notEqual(resendBody.data.activationToken, initialToken, 'Fresh token must differ from old token');

    const freshToken = resendBody.data.activationToken;

    // 3. Initial token must now be REVOKED
    const revokedRes = await fetch(`${baseUrl}/api/v1/dairies/invitations/validate?token=${initialToken}`);
    assert.equal(revokedRes.status, 400);
    const revokedBody = await revokedRes.json();
    assert.equal(revokedBody.code, 'INVITATION_REVOKED');

    // 4. Fresh token must be VALID
    const validRes = await fetch(`${baseUrl}/api/v1/dairies/invitations/validate?token=${freshToken}`);
    assert.equal(validRes.status, 200);
    const validBody = await validRes.json();
    assert.equal(validBody.code, 'VALID');
  });
});
