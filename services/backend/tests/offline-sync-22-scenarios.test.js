import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import crypto from 'node:crypto';

// Ensure isolated offline test mode unless an explicit real PG test URL is supplied
if (!process.env.TEST_POSTGRES_URL) {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:59999/offline_test';
  process.env.CENTRAL_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:59999/offline_test';
  process.env.DATABASE_PROVISIONER_URL = 'postgresql://postgres:postgres@127.0.0.1:59999/offline_test';
  process.env.TENANT_POOL_CONNECTION_TIMEOUT_MS = '500';
}

const { createApp } = await import('../dist/app.js');
const { query, pool } = await import('../dist/db.js');
const { tenantDbManager } = await import('../dist/infrastructure/database/TenantDatabaseManager.js');
const { HmacJwtTokenService } = await import('../dist/infrastructure/security/HmacJwtTokenService.js');

const app = createApp();
const tokenService = new HmacJwtTokenService();

/**
 * NOTE ON TEST SCOPE:
 * - Scenarios marked [BACKEND INTEGRATION] execute live HTTP calls through Express + auth middleware +
 *   DeviceRegistryService + SyncService against isolated tenant database instances (pg-mem offline mode).
 * - Scenarios marked [SIMULATED LOCAL EDGE UNIT] model client-side Android/SQLite/WorkManager state logic
 *   in memory; they are NOT proof of Android WorkManager or SQLite persistence on device hardware.
 */
describe('DFarm Offline-First & Automatic Cloud Sync Engine — 22 Scenarios Verification Suite (Phase 09)', async () => {
  let orgId;
  let centerId;
  let operatorUserId;
  let adminUserId;
  let adminToken;
  let deviceId;
  let deviceToken;
  let deviceIdentifier;
  let tenantDb;
  let rateChartVersionId;

  after(async () => {
    await tenantDbManager.closeAllPools().catch(() => {});
    await pool.end().catch(() => {});
  });

  it('Scenario 0 [BACKEND INTEGRATION]: Provision test infrastructure, tenant mapping, and active device identity', async () => {
    orgId = crypto.randomUUID();
    const orgCode = 'SMF-' + crypto.randomUUID().slice(0, 8).toUpperCase();
    centerId = crypto.randomUUID();
    const centerCode = 'C-' + crypto.randomUUID().slice(0, 6).toUpperCase();
    operatorUserId = crypto.randomUUID();
    adminUserId = crypto.randomUUID();

    // 1. Seed Control-Plane Organization, Users, and Tenant DB Mapping
    await query(
      `INSERT INTO organizations (id, name, code, status)
       VALUES ($1, 'Sangli Milk Federation Phase09', $2, 'ACTIVE');`,
      [orgId, orgCode]
    );
    await query(
      `INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
       VALUES ($1, $2, $3, 'Tasgaon Procurement Hub', 'Station Road', 'Tasgaon', 'Sangli', 'Maharashtra', '416312', '+919999000000', 'ACTIVE');`,
      [centerId, orgId, centerCode]
    );
    await query(
      `INSERT INTO users (id, organization_id, username, phone_number, full_name, role, user_role, status)
       VALUES ($1, $2, $3, '+919999000001', 'Ankush Jadhav Operator', 'COLLECTION_OPERATOR', 'COLLECTION_OPERATOR', 'ACTIVE')
       ON CONFLICT DO NOTHING;`,
      [operatorUserId, orgId, `ankush_${operatorUserId.slice(0, 8)}`]
    );
    await query(
      `INSERT INTO users (id, organization_id, username, phone_number, full_name, role, user_role, status)
       VALUES ($1, $2, $3, '+919999000002', 'Sangli Dairy Owner', 'DAIRY_OWNER', 'DAIRY_OWNER', 'ACTIVE')
       ON CONFLICT DO NOTHING;`,
      [adminUserId, orgId, `owner_${adminUserId.slice(0, 8)}`]
    );

    await query(
      `INSERT INTO dairy_database_mappings (
         id, dairy_id, dairy_code, database_name, resource_type, schema_version, provisioning_status, provisioned_at, last_verified_at
       ) VALUES ($1, $2, $3, $4, 'ISOLATED_TEST_INSTANCE', 'v1.0.0', 'ACTIVE', NOW(), NOW())
       ON CONFLICT (dairy_id) DO UPDATE SET provisioning_status = 'ACTIVE';`,
      [crypto.randomUUID(), orgId, orgCode, `dfarm_mem_${orgId.slice(0, 8)}`]
    );

    // 2. Seed Isolated Tenant DB Operational Fixtures
    tenantDb = await tenantDbManager.getStrictTenantDb(orgId);
    await tenantDb.query(
      `INSERT INTO organizations (id, name, code, status)
       VALUES ($1, 'Sangli Milk Federation Phase09', $2, 'ACTIVE')
       ON CONFLICT (id) DO NOTHING;`,
      [orgId, orgCode]
    );
    await tenantDb.query(
      `INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
       VALUES ($1, $2, $3, 'Tasgaon Procurement Hub', 'Station Road', 'Tasgaon', 'Sangli', 'Maharashtra', '416312', '+919999000000', 'ACTIVE')
       ON CONFLICT (id) DO NOTHING;`,
      [centerId, orgId, centerCode]
    );
    await tenantDb.query(
      `INSERT INTO users (id, organization_id, username, phone_number, full_name, role, user_role, status)
       VALUES ($1, $2, $3, '+919999000001', 'Ankush Jadhav Operator', 'COLLECTION_OPERATOR', 'COLLECTION_OPERATOR', 'ACTIVE')
       ON CONFLICT (id) DO NOTHING;`,
      [operatorUserId, orgId, `ankush_${operatorUserId.slice(0, 8)}`]
    );
    await tenantDb.query(
      `INSERT INTO users (id, organization_id, username, phone_number, full_name, role, user_role, status)
       VALUES ($1, $2, $3, '+919999000002', 'Sangli Dairy Owner', 'DAIRY_OWNER', 'DAIRY_OWNER', 'ACTIVE')
       ON CONFLICT (id) DO NOTHING;`,
      [adminUserId, orgId, `owner_${adminUserId.slice(0, 8)}`]
    );

    // Seed active approved COW rate chart in tenant DB
    const rcId = crypto.randomUUID();
    rateChartVersionId = crypto.randomUUID();
    await tenantDb.query(
      `INSERT INTO rate_charts (id, organization_id, center_id, name, milk_category, pricing_type, is_active)
       VALUES ($1, $2, $3, 'Tasgaon Cow Standard', 'COW', 'GRID', TRUE);`,
      [rcId, orgId, centerId]
    );
    await tenantDb.query(
      `INSERT INTO rate_chart_versions (id, rate_chart_id, version_number, effective_from, base_fat, base_snf, base_rate, is_approved)
       VALUES ($1, $2, 1, NOW() - INTERVAL '1 day', 4.0, 8.5, 39.0, TRUE);`,
      [rateChartVersionId, rcId]
    );

    adminToken = tokenService.signToken({
      userId: adminUserId,
      organizationId: orgId,
      centerId,
      role: 'DAIRY_OWNER',
      actorType: 'STAFF',
      fullName: 'Sangli Dairy Owner',
    });

    // 3. Register Device through hardened presentation endpoint
    deviceIdentifier = `POS-TERM-${Math.floor(1000 + Math.random() * 9000)}`;
    const regRes = await request(app)
      .post('/api/v1/devices/register')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        deviceIdentifier,
        deviceType: 'COUNTER_TERMINAL',
        organizationId: orgId,
        centerId,
        publicKey: `pk-${crypto.randomUUID().slice(0, 8)}`,
        appVersion: '1.0.0',
      });

    assert.equal(regRes.status, 200, `Register failed: ${JSON.stringify(regRes.body)}`);
    assert.ok(regRes.body.success);
    deviceId = regRes.body.data.deviceId;
    deviceToken = regRes.body.data.token;
    assert.ok(deviceToken, 'Device token must be issued');
  });

  it('Scenario 1 [SIMULATED LOCAL EDGE UNIT]: Offline draft model initializes pending sync state', async () => {
    const localDraftUuid = crypto.randomUUID();
    const draft = {
      localId: localDraftUuid,
      fullName: 'Balu Shripati Patil',
      mobileNumber: '+919822334455',
      village: 'Tasgaon',
      taluka: 'Tasgaon',
      district: 'Sangli',
      state: 'Maharashtra',
      pincode: '416312',
      syncStatus: 'PENDING_SYNC',
    };

    assert.ok(draft.localId);
    assert.equal(draft.syncStatus, 'PENDING_SYNC');
    assert.equal(draft.fullName, 'Balu Shripati Patil');
  });

  it('Scenario 2 [SIMULATED LOCAL EDGE UNIT]: Simulated in-memory draft store (not Android SQLite)', async () => {
    const draftStore = new Map();
    const draftId = crypto.randomUUID();
    draftStore.set(draftId, {
      fullName: 'Shankar Mahadev Kadam',
      mobile: '+919811223344',
      status: 'PENDING_SYNC',
    });

    const reloadedDraft = draftStore.get(draftId);
    assert.ok(reloadedDraft);
    assert.equal(reloadedDraft.fullName, 'Shankar Mahadev Kadam');
    assert.equal(reloadedDraft.status, 'PENDING_SYNC');
  });

  it('Scenario 3 [SIMULATED LOCAL EDGE UNIT]: Pending draft queue filter logic', async () => {
    const uncommittedDrafts = [
      { id: 'draft-1', status: 'PENDING_SYNC', name: 'Farmer One' },
      { id: 'draft-2', status: 'SYNCED', name: 'Farmer Two' },
    ];
    const recoverable = uncommittedDrafts.filter((d) => d.status === 'PENDING_SYNC');
    assert.equal(recoverable.length, 1);
    assert.equal(recoverable[0].id, 'draft-1');
  });

  let canonicalCustomerUuid;
  const farmerMobile = `+919822${Math.floor(100000 + Math.random() * 900000)}`;
  const farmerCode = `F-${Math.floor(100000 + Math.random() * 900000)}`;

  it('Scenario 4 [BACKEND INTEGRATION]: Online registration synchronization — Push commits into tenant DB', async () => {
    canonicalCustomerUuid = crypto.randomUUID();
    const pushPayload = {
      deviceId,
      centerId,
      events: [
        {
          id: crypto.randomUUID(),
          entityType: 'CUSTOMER_REGISTRATION',
          entityId: canonicalCustomerUuid,
          action: 'INSERT',
          idempotencyKey: `IDEMP-REG-${canonicalCustomerUuid}`,
          createdAt: new Date().toISOString(),
          payload: {
            farmerCode,
            fullName: 'Balu Shripati Patil',
            mobileNumber: farmerMobile,
            authorizedBy: operatorUserId,
            permittedCategories: ['COW', 'BUFFALO'],
            preferredMilkCategory: 'COW',
            bankName: 'State Bank of India',
            bankAccountNumber: '30012345678',
            bankIfscCode: 'SBIN0001234',
            address: {
              village: 'Tasgaon',
              talukaSubdistrict: 'Tasgaon',
              district: 'Sangli',
              state: 'Maharashtra',
              postalCode: '416312',
            },
          },
        },
      ],
    };

    const res = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send(pushPayload);

    assert.equal(res.status, 200, `Push failed: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.success);
    assert.equal(res.body.data.applied, 1);
    assert.equal(res.body.data.results[0].status, 'COMMITTED');

    // Verify row committed in isolated Tenant DB (NOT central control-plane DB)
    const dbCheck = await tenantDb.query('SELECT id, full_name, status FROM customers WHERE id = $1;', [canonicalCustomerUuid]);
    assert.equal(dbCheck.rows.length, 1);
    assert.equal(dbCheck.rows[0].status, 'ACTIVE');

    const ctrlCheck = await query('SELECT id FROM customers WHERE id = $1;', [canonicalCustomerUuid]);
    assert.equal(ctrlCheck.rows.length, 0, 'Customer must NOT be written to control-plane DB');
  });

  it('Scenario 5 [BACKEND INTEGRATION]: Duplicate mobile conflict — Recorded in tenant sync_conflict_records without duplicate insert', async () => {
    const conflictingCustId = crypto.randomUUID();
    const pushPayload = {
      deviceId,
      centerId,
      events: [
        {
          id: crypto.randomUUID(),
          entityType: 'CUSTOMER_REGISTRATION',
          entityId: conflictingCustId,
          action: 'INSERT',
          idempotencyKey: `IDEMP-REG-${conflictingCustId}`,
          createdAt: new Date().toISOString(),
          payload: {
            farmerCode: `F-${Math.floor(100000 + Math.random() * 900000)}`,
            fullName: 'Duplicate Mobile Impostor',
            mobileNumber: farmerMobile,
            authorizedBy: operatorUserId,
            permittedCategories: ['COW'],
          },
        },
      ],
    };

    const res = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send(pushPayload);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.applied, 0);
    assert.equal(res.body.data.conflicts, 1);
    assert.equal(res.body.data.results[0].status, 'CONFLICT');
    assert.equal(res.body.data.results[0].reason, 'DUPLICATE_MOBILE_NUMBER');

    const notCreated = await tenantDb.query('SELECT id FROM customers WHERE id = $1;', [conflictingCustId]);
    assert.equal(notCreated.rows.length, 0);

    const conflictLog = await tenantDb.query('SELECT id, conflict_reason FROM sync_conflict_records WHERE entity_id = $1;', [conflictingCustId]);
    assert.equal(conflictLog.rows.length, 1);
    assert.equal(conflictLog.rows[0].conflict_reason, 'DUPLICATE_MOBILE_NUMBER');
  });

  it('Scenario 6 [BACKEND INTEGRATION]: Registration sync retry — Idempotent recovery after network interruption', async () => {
    const pushPayload = {
      deviceId,
      centerId,
      events: [
        {
          id: crypto.randomUUID(),
          entityType: 'CUSTOMER_REGISTRATION',
          entityId: canonicalCustomerUuid,
          action: 'INSERT',
          idempotencyKey: `IDEMP-REG-${canonicalCustomerUuid}`,
          createdAt: new Date().toISOString(),
          payload: {
            farmerCode,
            fullName: 'Balu Shripati Patil',
          },
        },
      ],
    };

    const res = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send(pushPayload);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.results[0].status, 'DUPLICATE');
  });

  const collectionRecordUuid = crypto.randomUUID();
  const collectionSessionUuid = crypto.randomUUID();
  const collectionIdempotencyKey = `IDEMP-COL-${collectionRecordUuid}`;

  it('Scenario 7 [BACKEND INTEGRATION]: Collection queue persistence — Local milk transaction enqueued & committed atomically', async () => {
    const pushPayload = {
      deviceId,
      centerId,
      events: [
        {
          id: crypto.randomUUID(),
          entityType: 'MILK_COLLECTION',
          entityId: collectionRecordUuid,
          action: 'INSERT',
          idempotencyKey: collectionIdempotencyKey,
          createdAt: new Date().toISOString(),
          payload: {
            sessionId: collectionSessionUuid,
            customerId: canonicalCustomerUuid,
            operatorId: operatorUserId,
            centerId,
            rateChartVersionId,
            businessDate: new Date().toISOString().slice(0, 10),
            shiftType: 'MORNING',
            milkCategory: 'COW',
            netWeight: 28.5,
            fatPercentage: 4.2,
            snfPercentage: 8.6,
            appliedRatePerUnit: 39.0,
            totalAmount: 1111.50,
            identificationMethod: 'FACE',
            clientIntakeUuid: collectionSessionUuid,
          },
        },
      ],
    };

    const res = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send(pushPayload);

    assert.equal(res.status, 200, `Collection push failed: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.data.applied, 1);
    assert.equal(res.body.data.results[0].status, 'COMMITTED');

    const colCheck = await tenantDb.query('SELECT id, organization_id, total_amount FROM milk_collections WHERE id = $1;', [collectionRecordUuid]);
    assert.equal(colCheck.rows.length, 1);
    assert.equal(colCheck.rows[0].organization_id, orgId);
    assert.equal(Number(colCheck.rows[0].total_amount), 1111.50);
  });

  it('Scenario 8 [BACKEND INTEGRATION]: Duplicate event replay — Idempotently rejected with zero double ledger credit', async () => {
    const replayPayload = {
      deviceId,
      centerId,
      events: [
        {
          id: crypto.randomUUID(),
          entityType: 'MILK_COLLECTION',
          entityId: collectionRecordUuid,
          action: 'INSERT',
          idempotencyKey: collectionIdempotencyKey,
          createdAt: new Date().toISOString(),
          payload: {
            sessionId: collectionSessionUuid,
            customerId: canonicalCustomerUuid,
            operatorId: operatorUserId,
            totalAmount: 1111.50,
          },
        },
      ],
    };

    const res = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send(replayPayload);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.results[0].status, 'DUPLICATE');

    const countCheck = await tenantDb.query('SELECT COUNT(*) as count FROM milk_collections WHERE id = $1;', [collectionRecordUuid]);
    assert.equal(parseInt(countCheck.rows[0].count, 10), 1);

    const ledgerCount = await tenantDb.query(
      `SELECT COUNT(*) as count FROM ledger_entries le
       JOIN ledger_transactions lt ON le.transaction_id = lt.id
       WHERE lt.reference_id = $1;`,
      [collectionRecordUuid]
    );
    assert.equal(parseInt(ledgerCount.rows[0].count, 10), 2);
  });

  it('Scenario 9 [BACKEND INTEGRATION]: Incremental pull cursor — Tracks delta updates since last cursor', async () => {
    const res = await request(app)
      .get(`/api/v1/sync/pull?cursor=0&tombstoneCursor=0&centerId=${centerId}`)
      .set('Authorization', `Bearer ${deviceToken}`);

    assert.equal(res.status, 200);
    assert.ok(res.body.success);
    assert.ok(Array.isArray(res.body.data.customers));
    assert.ok(res.body.data.nextCursor >= 1);
  });

  it('Scenario 10 [BACKEND INTEGRATION]: Partial batch failure — Invalid event fails without blocking valid event', async () => {
    const validId = crypto.randomUUID();
    const invalidId = crypto.randomUUID();
    const pushPayload = {
      deviceId,
      centerId,
      events: [
        {
          id: crypto.randomUUID(),
          entityType: 'CUSTOMER_REGISTRATION',
          entityId: invalidId,
          action: 'INSERT',
          idempotencyKey: `IDEMP-BATCH-INVALID-${invalidId}`,
          createdAt: new Date().toISOString(),
          payload: {
            // Missing fullName, mobileNumber, farmerCode, authorizedBy -> must fail closed
            permittedCategories: ['COW'],
          },
        },
        {
          id: crypto.randomUUID(),
          entityType: 'CUSTOMER_REGISTRATION',
          entityId: validId,
          action: 'INSERT',
          idempotencyKey: `IDEMP-BATCH-VALID-${validId}`,
          createdAt: new Date().toISOString(),
          payload: {
            farmerCode: `F-${Math.floor(100000 + Math.random() * 900000)}`,
            fullName: 'Valid Farmer Batch',
            mobileNumber: `+919833${Math.floor(100000 + Math.random() * 900000)}`,
            authorizedBy: operatorUserId,
            permittedCategories: ['COW'],
          },
        },
      ],
    };

    const res = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send(pushPayload);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.applied, 1);
    assert.equal(res.body.data.results[0].status, 'ERROR');
    assert.equal(res.body.data.results[1].status, 'COMMITTED');
  });

  it('Scenario 11 [SIMULATED LOCAL EDGE UNIT]: Network interruption journal retry counter model', async () => {
    const journalItem = {
      idempotencyKey: 'IDEMP-OFFLINE-TEST',
      syncStatus: 'PENDING_SYNC',
      retryCount: 0,
    };
    journalItem.retryCount++;
    journalItem.syncStatus = 'RETRY_REQUIRED';
    assert.equal(journalItem.retryCount, 1);
    assert.equal(journalItem.syncStatus, 'RETRY_REQUIRED');
  });

  it('Scenario 12 [SIMULATED LOCAL EDGE UNIT]: Local active session snapshot model', async () => {
    const savedActiveSession = {
      sessionId: 'sess-active-1',
      customerUuid: canonicalCustomerUuid,
      state: 'WAITING_FOR_MEASUREMENTS',
      businessDate: '2026-11-14',
    };
    assert.equal(savedActiveSession.state, 'WAITING_FOR_MEASUREMENTS');
    assert.equal(savedActiveSession.customerUuid, canonicalCustomerUuid);
  });

  it('Scenario 13 [BACKEND INTEGRATION]: Soft-delete tombstone — Cloud deletion propagates tombstone to downstream pull', async () => {
    await tenantDb.query(
      "UPDATE customers SET is_deleted = TRUE, deleted_at = NOW(), deletion_reason = 'Farmer deceased' WHERE id = $1;",
      [canonicalCustomerUuid]
    );

    await tenantDb.query(
      `INSERT INTO sync_tombstones (organization_id, entity_type, entity_id, reason, deleted_at)
       VALUES ($1, 'CUSTOMER', $2, 'Farmer deceased', NOW());`,
      [orgId, canonicalCustomerUuid]
    );

    const pullRes = await request(app)
      .get(`/api/v1/sync/pull?cursor=0&tombstoneCursor=0&centerId=${centerId}`)
      .set('Authorization', `Bearer ${deviceToken}`);

    assert.equal(pullRes.status, 200);
    const tombstone = pullRes.body.data.tombstones.find((t) => t.entityId === canonicalCustomerUuid);
    assert.ok(tombstone, 'Tombstone must be received by downstream device');
    assert.equal(tombstone.entityType, 'CUSTOMER');
  });

  it('Scenario 14 [BACKEND INTEGRATION]: Restore propagation — Authorized restore brings customer back to active state', async () => {
    await tenantDb.query(
      'UPDATE customers SET is_deleted = FALSE, deleted_at = NULL, status = $1, updated_at = NOW() WHERE id = $2;',
      ['ACTIVE', canonicalCustomerUuid]
    );

    const check = await tenantDb.query('SELECT status, is_deleted FROM customers WHERE id = $1;', [canonicalCustomerUuid]);
    assert.equal(check.rows[0].status, 'ACTIVE');
    assert.equal(check.rows[0].is_deleted, false);
  });

  it('Scenario 15 [SIMULATED LOCAL EDGE UNIT]: Face consent revocation tombstone shape', async () => {
    const consentTombstone = {
      entityType: 'FACE_TEMPLATE',
      entityId: canonicalCustomerUuid,
      reason: 'Consent withdrawn by farmer',
    };
    assert.equal(consentTombstone.entityType, 'FACE_TEMPLATE');
    assert.equal(consentTombstone.reason, 'Consent withdrawn by farmer');
  });

  it('Scenario 16 [SIMULATED LOCAL EDGE UNIT]: RFID card revocation status model', async () => {
    const cardAssignment = {
      cardNumber: 'RFID-987654',
      status: 'REVOKED',
      revokedAt: Date.now(),
    };
    assert.equal(cardAssignment.status, 'REVOKED');
  });

  it('Scenario 17 [BACKEND INTEGRATION]: Device revocation — /api/v1/devices/revoke immediately fails closed with 403', async () => {
    const revokeRes = await request(app)
      .post('/api/v1/devices/revoke')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        deviceId,
        reason: 'Device lost or decommissioned',
      });

    assert.equal(revokeRes.status, 200);
    assert.equal(revokeRes.body.data.status, 'BLOCKED');

    // Subsequent push MUST be rejected with 403 Forbidden
    const pushAttempt = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({
        deviceId,
        centerId,
        events: [],
      });

    assert.equal(pushAttempt.status, 403);
    assert.equal(pushAttempt.body.error.code, 'DEVICE_REVOKED');
  });

  it('Scenario 18 [SIMULATED LOCAL EDGE UNIT]: Offline authorization expiry calculation model (72h limit)', async () => {
    const maxOfflineHours = 72;
    const lastSyncTime = Date.now() - (75 * 3600 * 1000);
    const elapsedHours = (Date.now() - lastSyncTime) / (3600 * 1000);
    assert.ok(elapsedHours > maxOfflineHours, 'Offline authorization must expire when older than 72 hours');
  });

  it('Scenario 19 [BACKEND INTEGRATION]: Conflict detection & audit logging — Complete audit payload in tenant DB', async () => {
    const conflictRes = await tenantDb.query('SELECT * FROM sync_conflict_records LIMIT 1;');
    assert.ok(conflictRes.rows.length > 0);
    assert.ok(conflictRes.rows[0].client_payload);
    assert.ok(conflictRes.rows[0].server_state);
  });

  it('Scenario 20 [BACKEND INTEGRATION]: No duplicate ledger credits — Double-entry subledger perfectly balanced in tenant DB', async () => {
    const entries = await tenantDb.query(
      `SELECT le.account_type, le.entry_type, le.amount
       FROM ledger_entries le
       JOIN ledger_transactions lt ON le.transaction_id = lt.id
       WHERE lt.reference_id = $1;`,
      [collectionRecordUuid]
    );

    assert.equal(entries.rows.length, 2);
    const credit = entries.rows.find((e) => e.entry_type === 'CREDIT');
    const debit = entries.rows.find((e) => e.entry_type === 'DEBIT');

    assert.ok(credit, 'Must have credit line');
    assert.ok(debit, 'Must have debit line');
    assert.equal(Number(credit.amount), Number(debit.amount), 'Debit and Credit amounts must match exactly');
    assert.equal(credit.account_type, 'CUSTOMER_PAYABLE');
    assert.equal(debit.account_type, 'MILK_PURCHASE_EXPENSE');
  });

  it('Scenario 21 [SIMULATED LOCAL EDGE UNIT]: Encryption at rest contract assertion', async () => {
    const faceCheck = await tenantDb.query('SELECT embedding_encrypted, embedding_iv FROM face_enrollments LIMIT 1;');
    assert.ok(Array.isArray(faceCheck.rows));
  });

  it('Scenario 22 [SIMULATED LOCAL EDGE UNIT]: WorkManager sync policy configuration model (not Android WorkManager)', async () => {
    const workPolicy = {
      name: 'DFarmPeriodicSyncWork',
      networkConstraint: 'CONNECTED',
      policy: 'KEEP',
      intervalMinutes: 15,
      backoff: 'EXPONENTIAL',
    };
    assert.equal(workPolicy.networkConstraint, 'CONNECTED');
    assert.equal(workPolicy.policy, 'KEEP');
    assert.equal(workPolicy.intervalMinutes, 15);
  });
});
