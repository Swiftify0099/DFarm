import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';

// Force isolated offline test double before importing app/env
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:59999/offline_test';
process.env.CENTRAL_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:59999/offline_test';
process.env.DATABASE_PROVISIONER_URL = 'postgresql://postgres:postgres@127.0.0.1:59999/offline_test';
process.env.TENANT_POOL_CONNECTION_TIMEOUT_MS = '500';

const { createApp } = await import('../dist/app.js');
const { query, pool } = await import('../dist/db.js');
const { tenantDbManager } = await import('../dist/infrastructure/database/TenantDatabaseManager.js');
const { HmacJwtTokenService } = await import('../dist/infrastructure/security/HmacJwtTokenService.js');
const { createDeviceToken, verifyDeviceToken, hashToken } = await import('../dist/security.js');
const { signJwt } = await import('../dist/jwt.js');
const { SyncService } = await import('../dist/modules/sync/sync.service.js');

const app = createApp();
const tokenService = new HmacJwtTokenService();

test('RESTART-04 Device Auth, Route Shadowing Removal & Strict Tenant Isolation Suite (Offline)', async (suite) => {
  const orgA = crypto.randomUUID();
  const orgB = crypto.randomUUID();
  const centerA1 = crypto.randomUUID();
  const centerA2 = crypto.randomUUID();
  const centerB1 = crypto.randomUUID();
  const ownerA = crypto.randomUUID();
  const opA = crypto.randomUUID();
  const accountantA = crypto.randomUUID();
  const opB = crypto.randomUUID();
  const custA = crypto.randomUUID();

  let tenantDbA;
  let tenantDbB;
  let ownerTokenA;
  let opTokenA;
  let accountantTokenA;
  let custTokenA;
  let deviceAId;
  let deviceAIdentifier;
  let deviceAToken;

  suite.after(async () => {
    await tenantDbManager.closeAllPools().catch(() => {});
    await pool.end().catch(() => {});
  });

  // Seed control-plane and two isolated tenant DBs
  await query(`INSERT INTO organizations (id, name, code, status) VALUES ($1, 'Dairy A', 'R04-A', 'ACTIVE'), ($2, 'Dairy B', 'R04-B', 'ACTIVE');`, [orgA, orgB]);
  await query(
    `INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
     VALUES ($1, $2, 'CA1', 'Center A1', 'Road 1', 'Town A', 'Dist A', 'MH', '416312', '+919800000001', 'ACTIVE'),
            ($3, $2, 'CA2', 'Center A2', 'Road 2', 'Town A2', 'Dist A', 'MH', '416313', '+919800000002', 'ACTIVE'),
            ($4, $5, 'CB1', 'Center B1', 'Road 3', 'Town B', 'Dist B', 'MH', '416314', '+919800000003', 'ACTIVE');`,
    [centerA1, orgA, centerA2, centerB1, orgB]
  );
  await query(
    `INSERT INTO users (id, organization_id, username, phone_number, full_name, role, user_role, status)
     VALUES ($1, $2, 'r04_owner_a', '+919800000011', 'Owner A', 'DAIRY_OWNER', 'DAIRY_OWNER', 'ACTIVE'),
            ($3, $2, 'r04_op_a', '+919800000012', 'Op A', 'COLLECTION_OPERATOR', 'COLLECTION_OPERATOR', 'ACTIVE'),
            ($4, $2, 'r04_acc_a', '+919800000014', 'Acc A', 'ACCOUNTANT', 'ACCOUNTANT', 'ACTIVE'),
            ($5, $6, 'r04_op_b', '+919800000013', 'Op B', 'COLLECTION_OPERATOR', 'COLLECTION_OPERATOR', 'ACTIVE');`,
    [ownerA, orgA, opA, accountantA, opB, orgB]
  );
  await query(
    `INSERT INTO dairy_database_mappings (
       id, dairy_id, dairy_code, database_name, resource_type, schema_version, provisioning_status, provisioned_at, last_verified_at
     ) VALUES
       ($1, $2, 'R04-A', 'dfarm_mem_r04_a', 'ISOLATED_TEST_INSTANCE', 'v1.0.0', 'ACTIVE', NOW(), NOW()),
       ($3, $4, 'R04-B', 'dfarm_mem_r04_b', 'ISOLATED_TEST_INSTANCE', 'v1.0.0', 'ACTIVE', NOW(), NOW())
     ON CONFLICT (dairy_id) DO UPDATE SET provisioning_status = 'ACTIVE';`,
    [crypto.randomUUID(), orgA, crypto.randomUUID(), orgB]
  );

  tenantDbA = await tenantDbManager.getStrictTenantDb(orgA);
  tenantDbB = await tenantDbManager.getStrictTenantDb(orgB);

  await tenantDbA.query(`INSERT INTO organizations (id, name, code, status) VALUES ($1, 'Dairy A', 'R04-A', 'ACTIVE') ON CONFLICT DO NOTHING;`, [orgA]);
  await tenantDbA.query(
    `INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
     VALUES ($1, $2, 'CA1', 'Center A1', 'Road 1', 'Town A', 'Dist A', 'MH', '416312', '+919800000001', 'ACTIVE'),
            ($3, $2, 'CA2', 'Center A2', 'Road 2', 'Town A2', 'Dist A', 'MH', '416313', '+919800000002', 'ACTIVE')
     ON CONFLICT DO NOTHING;`,
    [centerA1, orgA, centerA2]
  );
  await tenantDbA.query(
    `INSERT INTO users (id, organization_id, username, phone_number, full_name, role, user_role, status)
     VALUES ($1, $2, 'r04_owner_a', '+919800000011', 'Owner A', 'DAIRY_OWNER', 'DAIRY_OWNER', 'ACTIVE'),
            ($3, $2, 'r04_op_a', '+919800000012', 'Op A', 'COLLECTION_OPERATOR', 'COLLECTION_OPERATOR', 'ACTIVE')
     ON CONFLICT DO NOTHING;`,
    [ownerA, orgA, opA]
  );
  await tenantDbA.query(
    `INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status, is_deleted)
     VALUES ($1, $2, $3, 'FA-100', 'Farmer Alpha', '+919811112222', 'ACTIVE', 'APPROVED', FALSE);`,
    [custA, orgA, centerA1]
  );
  await tenantDbA.query(
    `INSERT INTO customer_milk_categories (customer_id, milk_category, is_authorized, authorized_by)
     VALUES ($1, 'COW', TRUE, $2);`,
    [custA, ownerA]
  );
  await tenantDbA.query(
    `INSERT INTO kiosk_shift_sessions (
       id, session_code, organization_id, center_id, business_date, shift, status, opening_operator_id, device_identifier, total_liters, cow_liters, buffalo_liters, transaction_count, total_amount, average_fat, average_snf
     ) VALUES ($1, 'SH-R04-A1', $2, $3, CURRENT_DATE, 'MORNING', 'OPEN', $4, 'KIOSK-R04-01', 0, 0, 0, 0, 0, 0, 0);`,
    [crypto.randomUUID(), orgA, centerA1, opA]
  );
  const rcA = crypto.randomUUID();
  await tenantDbA.query(`INSERT INTO rate_charts (id, organization_id, center_id, name, milk_category, pricing_type, is_active) VALUES ($1, $2, $3, 'A Cow', 'COW', 'GRID', TRUE);`, [rcA, orgA, centerA1]);
  await tenantDbA.query(`INSERT INTO rate_chart_versions (id, rate_chart_id, version_number, effective_from, base_fat, base_snf, base_rate, is_approved) VALUES ($1, $2, 1, NOW() - INTERVAL '1 day', 4.0, 8.5, 40.0, TRUE);`, [crypto.randomUUID(), rcA]);

  await tenantDbB.query(`INSERT INTO organizations (id, name, code, status) VALUES ($1, 'Dairy B', 'R04-B', 'ACTIVE') ON CONFLICT DO NOTHING;`, [orgB]);
  await tenantDbB.query(
    `INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
     VALUES ($1, $2, 'CB1', 'Center B1', 'Road 3', 'Town B', 'Dist B', 'MH', '416314', '+919800000003', 'ACTIVE')
     ON CONFLICT DO NOTHING;`,
    [centerB1, orgB]
  );
  await tenantDbB.query(
    `INSERT INTO users (id, organization_id, username, phone_number, full_name, role, user_role, status)
     VALUES ($1, $2, 'r04_op_b', '+919800000013', 'Op B', 'COLLECTION_OPERATOR', 'COLLECTION_OPERATOR', 'ACTIVE')
     ON CONFLICT DO NOTHING;`,
    [opB, orgB]
  );

  ownerTokenA = tokenService.signToken({
    userId: ownerA,
    organizationId: orgA,
    centerId: centerA1,
    role: 'DAIRY_OWNER',
    actorType: 'STAFF',
    fullName: 'Owner A',
  });
  opTokenA = tokenService.signToken({
    userId: opA,
    organizationId: orgA,
    centerId: centerA1,
    role: 'COLLECTION_OPERATOR',
    actorType: 'STAFF',
    fullName: 'Op A',
  });
  accountantTokenA = tokenService.signToken({
    userId: accountantA,
    organizationId: orgA,
    centerId: centerA1,
    role: 'ACCOUNTANT',
    actorType: 'STAFF',
    fullName: 'Acc A',
  });
  custTokenA = tokenService.signToken({
    userId: custA,
    organizationId: orgA,
    centerId: centerA1,
    role: 'FARMER_CUSTOMER',
    actorType: 'CUSTOMER',
    fullName: 'Farmer Alpha',
  });

  await suite.test('1. Device registration requires admin authority, rejects cross-tenant org override, and stores only token hash', async () => {
    // Unauthenticated rejected
    const unauth = await request(app).post('/api/v1/devices/register').send({
      deviceIdentifier: 'DEV-UNAUTH',
      deviceType: 'COUNTER_TERMINAL',
      centerId: centerA1,
    });
    assert.equal(unauth.status, 401);

    // Operator (non-admin) rejected 403
    const opAttempt = await request(app)
      .post('/api/v1/devices/register')
      .set('Authorization', `Bearer ${opTokenA}`)
      .send({
        deviceIdentifier: 'DEV-OP-ATTEMPT',
        deviceType: 'COUNTER_TERMINAL',
        centerId: centerA1,
      });
    assert.equal(opAttempt.status, 403);

    // Cross-tenant organizationId override rejected 403
    const crossOrg = await request(app)
      .post('/api/v1/devices/register')
      .set('Authorization', `Bearer ${ownerTokenA}`)
      .send({
        deviceIdentifier: 'DEV-CROSS-ORG',
        deviceType: 'COUNTER_TERMINAL',
        organizationId: orgB,
        centerId: centerA1,
      });
    assert.equal(crossOrg.status, 403);

    // Center belonging to Tenant B rejected by Tenant A owner
    const crossCenter = await request(app)
      .post('/api/v1/devices/register')
      .set('Authorization', `Bearer ${ownerTokenA}`)
      .send({
        deviceIdentifier: 'DEV-CROSS-CENTER',
        deviceType: 'COUNTER_TERMINAL',
        centerId: centerB1,
      });
    assert.equal(crossCenter.status, 404);

    // Valid registration succeeds
    deviceAIdentifier = `KIOSK-R04-${crypto.randomUUID().slice(0, 6)}`;
    const reg = await request(app)
      .post('/api/v1/devices/register')
      .set('Authorization', `Bearer ${ownerTokenA}`)
      .send({
        deviceIdentifier: deviceAIdentifier,
        deviceType: 'COUNTER_TERMINAL',
        centerId: centerA1,
        publicKey: 'pk-test-r04',
        appVersion: '2.0.0',
      });
    assert.equal(reg.status, 200, `Register failed: ${JSON.stringify(reg.body)}`);
    deviceAId = reg.body.data.deviceId;
    deviceAToken = reg.body.data.token;
    assert.ok(deviceAToken);

    // Signed token carries verified claims
    const verified = verifyDeviceToken(deviceAToken);
    assert.equal(verified.sub, deviceAId);
    assert.equal(verified.organizationId, orgA);
    assert.equal(verified.centerId, centerA1);
    assert.equal(verified.deviceIdentifier, deviceAIdentifier);
    assert.equal(verified.type, 'device');

    // Stored in Tenant A DB with hash only (not plaintext token) and NOT in control plane
    const devRow = await tenantDbA.query(`SELECT device_token_hash FROM devices WHERE id = $1;`, [deviceAId]);
    assert.equal(devRow.rows.length, 1);
    assert.equal(devRow.rows[0].device_token_hash, hashToken(deviceAToken));
    assert.notEqual(devRow.rows[0].device_token_hash, deviceAToken);

    const ctrlDev = await query(`SELECT id FROM devices WHERE id = $1;`, [deviceAId]);
    assert.equal(ctrlDev.rows.length, 0);
  });

  await suite.test('2. Route security: /sync/push uses device auth (not shadowed), while /sync/transactions preserves operator RBAC', async () => {
    // Missing token rejected
    const missing = await request(app).post('/api/v1/sync/push').send({ events: [] });
    assert.equal(missing.status, 401);

    // App/user JWT alone cannot authenticate as a device on /sync/push, /pull, /acknowledge, /status
    for (const [method, url, body] of [
      ['post', '/api/v1/sync/push', { events: [] }],
      ['get', '/api/v1/sync/pull', null],
      ['post', '/api/v1/sync/acknowledge', { downstreamCursor: 1 }],
      ['get', '/api/v1/sync/status', null],
    ]) {
      const req = request(app)[method](url).set('Authorization', `Bearer ${opTokenA}`);
      const res = body ? await req.send(body) : await req;
      assert.equal(res.status, 401, `${method.toUpperCase()} ${url} must reject user JWT`);
      assert.equal(res.body.error.code, 'INVALID_DEVICE_TOKEN_TYPE');
    }

    // Valid device token reaches /sync/push handler
    const validPush = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${deviceAToken}`)
      .send({ events: [] });
    assert.equal(validPush.status, 200);
    assert.equal(validPush.body.success, true);

    // /sync/transactions still requires valid user auth + authorization
    const txNoAuth = await request(app).post('/api/v1/sync/transactions').send({ transactions: [] });
    assert.equal(txNoAuth.status, 401);

    const txDeviceToken = await request(app)
      .post('/api/v1/sync/transactions')
      .set('Authorization', `Bearer ${deviceAToken}`)
      .send({ transactions: [] });
    assert.equal(txDeviceToken.status, 401);

    const txAccountant = await request(app)
      .post('/api/v1/sync/transactions')
      .set('Authorization', `Bearer ${accountantTokenA}`)
      .send({ transactions: [] });
    assert.equal(txAccountant.status, 403);

    const txCustomer = await request(app)
      .post('/api/v1/sync/transactions')
      .set('Authorization', `Bearer ${custTokenA}`)
      .send({ transactions: [] });
    assert.ok(txCustomer.status === 401 || txCustomer.status === 403);

    const txOperator = await request(app)
      .post('/api/v1/sync/transactions')
      .set('Authorization', `Bearer ${opTokenA}`)
      .send({
        deviceId: deviceAIdentifier,
        transactions: [
          {
            clientIntakeUuid: crypto.randomUUID(),
            sessionCode: 'SH-R04-A1',
            customerId: custA,
            milkCategory: 'COW',
            weightLiters: 5,
            fatPercentage: 4.0,
            snfPercentage: 8.5,
            identificationMethod: 'RFID_TAG',
          },
        ],
      });
    assert.equal(txOperator.status, 200);
    assert.equal(txOperator.body.data.succeeded, 1);
  });

  await suite.test('3. All 16+ device authentication negative scenarios fail closed', async () => {
    // 1. No token + valid device UUID
    const noTokWithUuid = await request(app)
      .post('/api/v1/sync/push')
      .set('X-Device-ID', deviceAId)
      .send({ deviceId: deviceAId, events: [] });
    assert.equal(noTokWithUuid.status, 401);

    // 2. Body deviceId only
    const bodyOnly = await request(app).post('/api/v1/sync/push').send({ deviceId: deviceAId, events: [] });
    assert.equal(bodyOnly.status, 401);

    // 3. Query deviceId only
    const queryOnly = await request(app).get(`/api/v1/sync/status?deviceId=${deviceAId}`);
    assert.equal(queryOnly.status, 401);

    // 4. X-Device-ID only
    const headerOnly = await request(app).get('/api/v1/sync/pull').set('X-Device-ID', deviceAIdentifier);
    assert.equal(headerOnly.status, 401);

    // 5. Random UUID as Bearer token
    const randomUuidBearer = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${crypto.randomUUID()}`)
      .send({ events: [] });
    assert.equal(randomUuidBearer.status, 401);

    // 6. Invalid JWT signature
    const tampered = `${deviceAToken.slice(0, -4)}AAAA`;
    const badSig = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${tampered}`)
      .send({ events: [] });
    assert.equal(badSig.status, 401);

    // 7. Expired JWT
    const { token: expiredToken } = createDeviceToken({
      sub: deviceAId,
      organizationId: orgA,
      centerId: centerA1,
      deviceIdentifier: deviceAIdentifier,
      expiresInSeconds: 1,
    });
    // Craft explicitly expired token with past exp using signJwt(-60)
    const pastToken = signJwt(
      { sub: deviceAId, type: 'device', organizationId: orgA, centerId: centerA1, deviceIdentifier: deviceAIdentifier },
      -60
    );
    const expRes = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${pastToken}`)
      .send({ events: [] });
    assert.equal(expRes.status, 401);
    assert.equal(expRes.body.error.code, 'DEVICE_TOKEN_EXPIRED');
    assert.ok(expiredToken);

    // 8. Legacy device token lacking organization/center claims -> DEVICE_RE_REGISTRATION_REQUIRED
    const legacyToken = signJwt({ sub: deviceAId, type: 'device' }, 3600);
    const legacyRes = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${legacyToken}`)
      .send({ events: [] });
    assert.equal(legacyRes.status, 401);
    assert.equal(legacyRes.body.error.code, 'DEVICE_RE_REGISTRATION_REQUIRED');

    // 9. App/user JWT used as device token
    const userJwtRes = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${ownerTokenA}`)
      .send({ events: [] });
    assert.equal(userJwtRes.status, 401);
    assert.equal(userJwtRes.body.error.code, 'INVALID_DEVICE_TOKEN_TYPE');

    // 10. Token hash mismatch (signed for device A, but stored hash differs)
    const { token: rotatedOutToken } = createDeviceToken({
      sub: deviceAId,
      organizationId: orgA,
      centerId: centerA1,
      deviceIdentifier: deviceAIdentifier,
    });
    const mismatchRes = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${rotatedOutToken}`)
      .send({ events: [] });
    assert.equal(mismatchRes.status, 401);
    assert.equal(mismatchRes.body.error.code, 'DEVICE_TOKEN_MISMATCH');

    // 11. Wrong organization claim (token signed for orgB pointing to orgA's device)
    const wrongOrgToken = createDeviceToken({
      sub: deviceAId,
      organizationId: orgB,
      centerId: centerB1,
      deviceIdentifier: deviceAIdentifier,
    }).token;
    const wrongOrgRes = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${wrongOrgToken}`)
      .send({ events: [] });
    assert.equal(wrongOrgRes.status, 401);

    // Cross-tenant header with valid deviceA token rejected 403
    const crossHeaderRes = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${deviceAToken}`)
      .set('X-Organization-Id', orgB)
      .send({ events: [] });
    assert.equal(crossHeaderRes.status, 403);
    assert.equal(crossHeaderRes.body.error.code, 'CROSS_TENANT_ACCESS_DENIED');

    // 12. Wrong center claim
    const wrongCenterToken = createDeviceToken({
      sub: deviceAId,
      organizationId: orgA,
      centerId: centerA2,
      deviceIdentifier: deviceAIdentifier,
    }).token;
    // Even if hash matched in DB, center check rejects 403; here hash mismatches first unless updated; test both!
    await tenantDbA.query(`UPDATE devices SET device_token_hash = $1 WHERE id = $2;`, [hashToken(wrongCenterToken), deviceAId]);
    const wrongCenterRes = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${wrongCenterToken}`)
      .send({ events: [] });
    assert.equal(wrongCenterRes.status, 403);
    assert.equal(wrongCenterRes.body.error.code, 'DEVICE_CENTER_MISMATCH');
    // Restore deviceA's active token hash
    await tenantDbA.query(`UPDATE devices SET device_token_hash = $1 WHERE id = $2;`, [hashToken(deviceAToken), deviceAId]);

    // 13. Offline authorization expired
    await tenantDbA.query(`UPDATE devices SET last_seen_at = NOW() - INTERVAL '100 hours' WHERE id = $1;`, [deviceAId]);
    const offlineExpRes = await request(app)
      .get('/api/v1/sync/status')
      .set('Authorization', `Bearer ${deviceAToken}`);
    assert.equal(offlineExpRes.status, 403);
    assert.equal(offlineExpRes.body.error.code, 'OFFLINE_EXPIRED');
    await tenantDbA.query(`UPDATE devices SET last_seen_at = NOW() WHERE id = $1;`, [deviceAId]);

    // 14. Blocked device
    await tenantDbA.query(`UPDATE devices SET status = 'BLOCKED', is_blocked = TRUE WHERE id = $1;`, [deviceAId]);
    const blockedRes = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${deviceAToken}`)
      .send({ events: [] });
    assert.equal(blockedRes.status, 403);
    assert.equal(blockedRes.body.error.code, 'DEVICE_BLOCKED');
    await tenantDbA.query(`UPDATE devices SET status = 'ACTIVE', is_blocked = FALSE WHERE id = $1;`, [deviceAId]);

    // 15. Tenant DB mapping unavailable (503)
    const unmappedOrg = crypto.randomUUID();
    const unmappedToken = createDeviceToken({
      sub: crypto.randomUUID(),
      organizationId: unmappedOrg,
      centerId: crypto.randomUUID(),
      deviceIdentifier: 'DEV-UNMAPPED',
    }).token;
    const unmappedRes = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${unmappedToken}`)
      .send({ events: [] });
    assert.equal(unmappedRes.status, 503);

    // 16. Revoked device + cannot reactivate via re-registration
    const revRes = await request(app)
      .post('/api/v1/devices/revoke')
      .set('Authorization', `Bearer ${ownerTokenA}`)
      .send({ deviceId: deviceAId, reason: 'Compromised terminal' });
    assert.equal(revRes.status, 200);
    assert.equal(revRes.body.data.status, 'BLOCKED');

    const revReplay = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${deviceAToken}`)
      .send({ events: [] });
    assert.equal(revReplay.status, 403);
    assert.equal(revReplay.body.error.code, 'DEVICE_REVOKED');

    const reRegBlocked = await request(app)
      .post('/api/v1/devices/register')
      .set('Authorization', `Bearer ${ownerTokenA}`)
      .send({
        deviceIdentifier: deviceAIdentifier,
        deviceType: 'COUNTER_TERMINAL',
        centerId: centerA1,
      });
    assert.equal(reRegBlocked.status, 403);
    assert.equal(reRegBlocked.body.error.code, 'DEVICE_REVOKED');
  });

  await suite.test('4. Savepoint failures on non-pg-mem adapters are NEVER suppressed by NODE_ENV=test', async () => {
    const fakeNonPgMemClient = {
      query: async (sql) => {
        if (String(sql).startsWith('SAVEPOINT')) {
          const err = new Error('Simulated PostgreSQL savepoint failure');
          err.code = '25P02';
          throw err;
        }
        if (String(sql).includes('FROM devices')) {
          return {
            rows: [
              {
                id: deviceAId,
                organization_id: orgA,
                center_id: centerA1,
                device_identifier: deviceAIdentifier,
                status: 'ACTIVE',
                is_blocked: false,
                revoked_at: null,
              },
            ],
          };
        }
        return { rows: [] };
      },
    };
    const origGetStrict = tenantDbManager.getStrictTenantDb.bind(tenantDbManager);
    tenantDbManager.getStrictTenantDb = async () => ({
      query: fakeNonPgMemClient.query,
      withTransaction: async (cb) => cb(fakeNonPgMemClient),
    });

    try {
      await assert.rejects(
        () =>
          SyncService.pushEvents(
            {
              deviceId: deviceAId,
              organizationId: orgA,
              centerId: centerA1,
              deviceIdentifier: deviceAIdentifier,
              tokenHash: 'hash',
            },
            { events: [{ id: crypto.randomUUID(), entityType: 'CUSTOMER_REGISTRATION', entityId: crypto.randomUUID(), payload: {} }] }
          ),
        (err) => err.code === '25P02'
      );
    } finally {
      tenantDbManager.getStrictTenantDb = origGetStrict;
    }
  });
});
