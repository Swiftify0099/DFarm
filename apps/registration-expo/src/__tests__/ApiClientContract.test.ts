/**
 * DFarm Registration App - API Client Contract & Error Handling Tests
 * Complete parity with Kotlin CustomerRepositoryApiTest.kt & ApiClient.kt
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ApiClient, ApiError, DuplicateMobileError } from '../api/apiClient';

describe('ApiClientContractTest', () => {
  it('testBaseUrlDiscovery', () => {
    const client = new ApiClient();
    const url = client.getBaseUrl();
    assert.ok(url);
    assert.strictEqual(url.endsWith('/'), true);
  });

  it('testAuthorizationAndCenterHeadersAttachment', async () => {
    let capturedHeaders: Record<string, string> = {};

    const client = new ApiClient();
    client.setToken('test-jwt-token-xyz');
    client.setCenterId('center-kolhapur-01');

    client.setCustomFetch(async (url: string, init?: RequestInit) => {
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      return new Response(
        JSON.stringify({ success: true, data: { status: 'ONLINE' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const res = await client.get<{ status: string }>('api/v1/health');
    assert.strictEqual(res.success, true);
    assert.strictEqual(capturedHeaders['Authorization'], 'Bearer test-jwt-token-xyz');
    assert.strictEqual(capturedHeaders['X-Center-ID'], 'center-kolhapur-01');
  });

  it('testUnauthorizedTriggersListener', async () => {
    let unauthorizedTriggered = false;

    const client = new ApiClient();
    client.setOnUnauthorizedListener(() => {
      unauthorizedTriggered = true;
    });

    client.setCustomFetch(async () => {
      return new Response(
        JSON.stringify({ success: false, message: 'Invalid or expired session token' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    });

    try {
      await client.get('api/v1/customers');
      assert.fail('Should throw on 401');
    } catch (e: any) {
      assert.ok(e instanceof ApiError);
      assert.strictEqual(e.statusCode, 401);
      assert.strictEqual(unauthorizedTriggered, true);
    }
  });

  it('testDuplicateMobileThrowsDuplicateMobileError', async () => {
    const client = new ApiClient();
    client.setCustomFetch(async () => {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'DUPLICATE_MOBILE_NUMBER',
            message: 'A farmer with mobile number +919876543210 is already registered.',
          },
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    });

    try {
      await client.post('api/v1/customers', { mobileNumber: '+919876543210' });
      assert.fail('Should throw DuplicateMobileError on 409');
    } catch (e: any) {
      assert.ok(e instanceof DuplicateMobileError);
      assert.strictEqual(e.statusCode, 409);
      assert.strictEqual(
        e.message.includes('already registered'),
        true
      );
    }
  });
});
