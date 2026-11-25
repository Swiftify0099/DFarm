// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// PROMPT 5.2.1: FINAL RATE API ROUTE, ETAG & SCOPE VERIFICATION GATE
// REAL POSTGRESQL + REAL EXPRESS ROUTE INTEGRATION TEST SUITE
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../dist/app.js';
import { signJwt } from '../dist/jwt.js';
import { db } from '../dist/infrastructure/database/PostgresPool.js';

test('DFarm Prompt 5.2.1: Final Rate API Route, ETag & Scope Verification Gate', async (t) => {
  const app = createApp();

  // Test Fixtures
  const tenantA = '99999999-5201-4999-a999-000000000001';
  const tenantB = '99999999-5201-4999-a999-000000000002';
  const centerA1 = '99999999-5201-4999-a999-0000000000c1';
  const centerA2 = '99999999-5201-4999-a999-0000000000c2';
  const centerB1 = '99999999-5201-4999-a999-0000000000b1';

  const ownerAUserId = '99999999-5201-4999-a999-0000000000u1';
  const operatorA1UserId = '99999999-5201-4999-a999-0000000000u2';
  const operatorB1UserId = '99999999-5201-4999-a999-0000000000u3';

  // JWT Tokens
  const ownerAToken = signJwt({
    userId: ownerAUserId,
    organizationId: tenantA,
    role: 'DAIRY_OWNER',
    email: 'owner.a@dfarm.internal',
    primaryCenterId: centerA1,
    assignedCenters: [centerA1, centerA2],
    centerIds: [centerA1, centerA2],
  });

  const operatorA1Token = signJwt({
    userId: operatorA1UserId,
    organizationId: tenantA,
    role: 'COLLECTION_OPERATOR',
    email: 'operator.a1@dfarm.internal',
    primaryCenterId: centerA1,
    assignedCenters: [centerA1],
    centerIds: [centerA1],
  });

  const operatorB1Token = signJwt({
    userId: operatorB1UserId,
    organizationId: tenantB,
    role: 'COLLECTION_OPERATOR',
    email: 'operator.b1@dfarm.internal',
    primaryCenterId: centerB1,
    assignedCenters: [centerB1],
    centerIds: [centerB1],
  });

  // Rate Chart Identifiers
  const orgChartId = '99999999-5201-4999-a999-000000000101';
  const orgVer1Id = '99999999-5201-4999-a999-000000000102';
  const orgVer2Id = '99999999-5201-4999-a999-000000000103';

  const centerA1ChartId = '99999999-5201-4999-a999-000000000201';
  const centerA1Ver1Id = '99999999-5201-4999-a999-000000000202';

  const tenantBOrgChartId = '99999999-5201-4999-a999-000000000301';
  const tenantBOrgVer1Id = '99999999-5201-4999-a999-000000000302';

  // 0. Database Setup & Teardown
  await t.test('0. Database Fixture Initialization', async () => {
    // Clean up any existing records from prior runs
    await db.query(`DELETE FROM rate_chart_cells WHERE rate_chart_version_id IN ($1, $2, $3, $4, $5);`, [
      orgVer1Id,
      orgVer2Id,
      centerA1Ver1Id,
      tenantBOrgVer1Id,
      '99999999-5201-4999-a999-000000000999',
    ]);
    await db.query(`DELETE FROM milk_collections WHERE rate_chart_version_id IN ($1, $2, $3, $4);`, [
      orgVer1Id,
      orgVer2Id,
      centerA1Ver1Id,
      tenantBOrgVer1Id,
    ]);
    await db.query(`DELETE FROM rate_chart_versions WHERE id IN ($1, $2, $3, $4);`, [
      orgVer1Id,
      orgVer2Id,
      centerA1Ver1Id,
      tenantBOrgVer1Id,
    ]);
    await db.query(`DELETE FROM rate_charts WHERE id IN ($1, $2, $3);`, [
      orgChartId,
      centerA1ChartId,
      tenantBOrgChartId,
    ]);
    await db.query(`DELETE FROM dairy_centers WHERE id IN ($1, $2, $3);`, [
      centerA1,
      centerA2,
      centerB1,
    ]);
    await db.query(`DELETE FROM organizations WHERE id IN ($1, $2);`, [
      tenantA,
      tenantB,
    ]);

    // Insert organizations
    await db.query(`
      INSERT INTO organizations (id, name, code, status)
      VALUES 
        ($1, 'Prompt 5.2.1 Dairy A', 'P521A', 'ACTIVE'),
        ($2, 'Prompt 5.2.1 Dairy B', 'P521B', 'ACTIVE')
      ON CONFLICT (id) DO NOTHING;
    `, [tenantA, tenantB]);

    // Insert dairy centers
    await db.query(`
      INSERT INTO dairy_centers (id, organization_id, name, code, status, address_line1, village_town, district, state, postal_code, contact_phone)
      VALUES
        ($1, $2, 'Centre A1', 'C-A1', 'ACTIVE', 'Address 1', 'Town A', 'District A', 'State A', '416001', '+919876543210'),
        ($3, $2, 'Centre A2', 'C-A2', 'ACTIVE', 'Address 2', 'Town A', 'District A', 'State A', '416001', '+919876543211'),
        ($4, $5, 'Centre B1', 'C-B1', 'ACTIVE', 'Address 3', 'Town B', 'District B', 'State B', '416002', '+919876543212')
      ON CONFLICT (id) DO NOTHING;
    `, [centerA1, tenantA, centerA2, centerB1, tenantB]);

    // 1. Insert Tenant A Organization-Wide Rate Chart (Cow, Base Rate 42.00)
    await db.query(`
      INSERT INTO rate_charts (id, organization_id, center_id, name, milk_category, pricing_type, is_active)
      VALUES ($1, $2, NULL, 'Dairy A Org-Wide Cow Chart', 'COW', 'GRID', TRUE);
    `, [orgChartId, tenantA]);

    await db.query(`
      INSERT INTO rate_chart_versions (id, rate_chart_id, version_number, effective_from, base_rate, base_fat, base_snf, is_approved)
      VALUES ($1, $2, 1, '2026-01-01T00:00:00Z', 42.00, 3.5, 8.5, TRUE);
    `, [orgVer1Id, orgChartId]);

    await db.query(`
      INSERT INTO rate_chart_cells (id, rate_chart_version_id, fat_percentage, snf_percentage, rate_per_unit)
      VALUES (gen_random_uuid(), $1, 4.0, 8.5, 45.00);
    `, [orgVer1Id]);

    // 2. Insert Tenant A Center-Specific Rate Chart for Centre A1 (Cow, Base Rate 48.00)
    await db.query(`
      INSERT INTO rate_charts (id, organization_id, center_id, name, milk_category, pricing_type, is_active)
      VALUES ($1, $2, $3, 'Dairy A Centre A1 Cow Chart', 'COW', 'GRID', TRUE);
    `, [centerA1ChartId, tenantA, centerA1]);

    await db.query(`
      INSERT INTO rate_chart_versions (id, rate_chart_id, version_number, effective_from, base_rate, base_fat, base_snf, is_approved)
      VALUES ($1, $2, 1, '2026-01-01T00:00:00Z', 48.00, 3.5, 8.5, TRUE);
    `, [centerA1Ver1Id, centerA1ChartId]);

    await db.query(`
      INSERT INTO rate_chart_cells (id, rate_chart_version_id, fat_percentage, snf_percentage, rate_per_unit)
      VALUES (gen_random_uuid(), $1, 4.0, 8.5, 51.00);
    `, [centerA1Ver1Id]);

    // 3. Insert Tenant B Organization-Wide Rate Chart (Cow, Base Rate 39.00)
    await db.query(`
      INSERT INTO rate_charts (id, organization_id, center_id, name, milk_category, pricing_type, is_active)
      VALUES ($1, $2, NULL, 'Dairy B Org-Wide Cow Chart', 'COW', 'GRID', TRUE);
    `, [tenantBOrgChartId, tenantB]);

    await db.query(`
      INSERT INTO rate_chart_versions (id, rate_chart_id, version_number, effective_from, base_rate, base_fat, base_snf, is_approved)
      VALUES ($1, $2, 1, '2026-01-01T00:00:00Z', 39.00, 3.5, 8.5, TRUE);
    `, [tenantBOrgVer1Id, tenantBOrgChartId]);
  });

  t.after(async () => {
    // Teardown test fixtures
    await db.query(`DELETE FROM rate_chart_cells WHERE rate_chart_version_id IN ($1, $2, $3, $4);`, [
      orgVer1Id,
      orgVer2Id,
      centerA1Ver1Id,
      tenantBOrgVer1Id,
    ]);
    await db.query(`DELETE FROM milk_collections WHERE rate_chart_version_id IN ($1, $2, $3, $4);`, [
      orgVer1Id,
      orgVer2Id,
      centerA1Ver1Id,
      tenantBOrgVer1Id,
    ]);
    await db.query(`DELETE FROM rate_chart_versions WHERE id IN ($1, $2, $3, $4);`, [
      orgVer1Id,
      orgVer2Id,
      centerA1Ver1Id,
      tenantBOrgVer1Id,
    ]);
    await db.query(`DELETE FROM rate_charts WHERE id IN ($1, $2, $3);`, [
      orgChartId,
      centerA1ChartId,
      tenantBOrgChartId,
    ]);
    await db.query(`DELETE FROM dairy_centers WHERE id IN ($1, $2, $3);`, [
      centerA1,
      centerA2,
      centerB1,
    ]);
    await db.query(`DELETE FROM organizations WHERE id IN ($1, $2);`, [
      tenantA,
      tenantB,
    ]);
  });

  // ============================================================================
  // 1. ACTUAL API ROUTE & MIDDLEWARE VERIFICATION
  // ============================================================================
  await t.test('1. POST /api/v1/rates/sync is registered, reachable, and executes auth middleware', async () => {
    // 1.1 Unauthenticated request must fail with 401 Unauthorized
    const unauthRes = await request(app)
      .post('/api/v1/rates/sync')
      .send({ scope: 'ORGANIZATION_WIDE' });

    assert.equal(unauthRes.status, 401, 'Unauthenticated request must return 401');
    assert.equal(unauthRes.body.success, false);

    // 1.2 Authenticated request executes auth middleware and reaches endpoint
    const authRes = await request(app)
      .post('/api/v1/rates/sync')
      .set('Authorization', `Bearer ${operatorA1Token}`)
      .send({ scope: 'ORGANIZATION_WIDE' });

    assert.equal(authRes.status, 200, 'Authenticated request must reach route and return 200');
    assert.equal(authRes.body.success, true);
    assert.equal(authRes.body.data.organizationId, tenantA);
  });

  await t.test('1b. Tenant isolation: authenticated server-side identity enforced, client-supplied mismatch rejected', async () => {
    // 1.3 Client sends token for Tenant A, but supplies header claiming Tenant B -> 403 Forbidden
    const headerMismatch = await request(app)
      .post('/api/v1/rates/sync')
      .set('Authorization', `Bearer ${operatorA1Token}`)
      .set('X-Dairy-Tenant-Id', tenantB)
      .send({ scope: 'ORGANIZATION_WIDE' });

    assert.equal(headerMismatch.status, 403, 'Cross-tenant header mismatch must return 403');
    assert.match(headerMismatch.body.error, /cross-tenant/i);

    // 1.4 Client sends token for Tenant A, but supplies body claiming Tenant B -> 403 Forbidden
    const bodyMismatch = await request(app)
      .post('/api/v1/rates/sync')
      .set('Authorization', `Bearer ${operatorA1Token}`)
      .send({ scope: 'ORGANIZATION_WIDE', organizationId: tenantB });

    assert.equal(bodyMismatch.status, 403, 'Cross-tenant body mismatch must return 403');
    assert.match(bodyMismatch.body.error, /cross-tenant/i);

    // 1.5 Client does not supply tenant in body or headers -> server uses server-side JWT claims securely
    const serverIdentity = await request(app)
      .post('/api/v1/rates/sync')
      .set('Authorization', `Bearer ${operatorA1Token}`)
      .send({ scope: 'ORGANIZATION_WIDE' });

    assert.equal(serverIdentity.status, 200);
    assert.equal(serverIdentity.body.data.organizationId, tenantA, 'Server must enforce authenticated server identity');
  });

  await t.test('1c. Centre-specific requests cannot access another centre rate data', async () => {
    // Operator A1 is assigned ONLY to Center A1.
    // Operator A1 requests rates for Center A2 -> 403 Forbidden
    const crossCenter = await request(app)
      .post('/api/v1/rates/sync')
      .set('Authorization', `Bearer ${operatorA1Token}`)
      .send({ scope: 'CENTER_SPECIFIC', centerId: centerA2 });

    assert.equal(crossCenter.status, 403, 'Operator requesting unassigned center must return 403');
    assert.match(crossCenter.body.error, /cross-centre/i);

    // Operator A1 requests rates for Center B1 (different dairy) -> 403 Forbidden
    const crossTenantCenter = await request(app)
      .post('/api/v1/rates/sync')
      .set('Authorization', `Bearer ${operatorA1Token}`)
      .send({ scope: 'CENTER_SPECIFIC', centerId: centerB1 });

    assert.equal(crossTenantCenter.status, 403, 'Operator requesting foreign center must return 403');

    // Operator A1 requests rates for assigned Center A1 -> 200 OK
    const validCenter = await request(app)
      .post('/api/v1/rates/sync')
      .set('Authorization', `Bearer ${operatorA1Token}`)
      .send({ scope: 'CENTER_SPECIFIC', centerId: centerA1 });

    assert.equal(validCenter.status, 200);
    assert.equal(validCenter.body.data.charts.length, 1);
    assert.equal(validCenter.body.data.charts[0].centerId, centerA1);
    assert.equal(validCenter.body.data.charts[0].baseRate, 48.00);

    // Dairy Owner A (authorized organization-wide) can request Center A2 -> 200 OK
    const ownerAccess = await request(app)
      .post('/api/v1/rates/sync')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ scope: 'CENTER_SPECIFIC', centerId: centerA2 });

    assert.equal(ownerAccess.status, 200);
  });

  // ============================================================================
  // 2. EXPLICIT RATE SCOPE DISCRIMINATION
  // ============================================================================
  await t.test('2. Case A — ORGANIZATION_WIDE: accepted only without centerId and never resolves to centre chart', async () => {
    // Explicit scope is ORGANIZATION_WIDE, no centerId supplied
    const res = await request(app)
      .post('/api/v1/rates/sync')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ scope: 'ORGANIZATION_WIDE' });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.centerId, null);
    assert.equal(res.body.data.scope, 'ORGANIZATION_WIDE');

    // COW chart returned MUST be the organization-wide chart (baseRate: 42.00, centerId: null)
    // and NEVER the center-specific chart (baseRate: 48.00)
    const cowChart = res.body.data.charts.find((c) => c.milkCategory === 'COW');
    assert.ok(cowChart, 'COW chart must be returned');
    assert.equal(cowChart.centerScope, 'ORGANIZATION_WIDE');
    assert.equal(cowChart.centerId, null);
    assert.equal(cowChart.baseRate, 42.00);
    assert.equal(cowChart.chartId, orgChartId);
  });

  await t.test('2b. Case B — CENTER_SPECIFIC: valid authorized centerId returns correct centre chart, missing fails closed', async () => {
    // 2b.1 Missing centerId must fail closed (400)
    const missingCenter = await request(app)
      .post('/api/v1/rates/sync')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ scope: 'CENTER_SPECIFIC' });

    assert.equal(missingCenter.status, 400, 'CENTER_SPECIFIC without centerId must return 400');
    assert.match(missingCenter.body.error, /centerId is required/i);

    // 2b.2 Invalid centerId UUID must fail closed (400)
    const invalidUuid = await request(app)
      .post('/api/v1/rates/sync')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ scope: 'CENTER_SPECIFIC', centerId: 'not-a-valid-uuid' });

    assert.equal(invalidUuid.status, 400);
    assert.match(invalidUuid.body.error, /invalid centerId UUID format/i);

    // 2b.3 Valid authorized centerId (Center A1) returns Centre A1 chart (baseRate 48.00)
    const validCenterRes = await request(app)
      .post('/api/v1/rates/sync')
      .set('Authorization', `Bearer ${operatorA1Token}`)
      .send({ scope: 'CENTER_SPECIFIC', centerId: centerA1 });

    assert.equal(validCenterRes.status, 200);
    const chart = validCenterRes.body.data.charts[0];
    assert.equal(chart.centerScope, 'CENTER_SPECIFIC');
    assert.equal(chart.centerId, centerA1);
    assert.equal(chart.baseRate, 48.00);
    assert.equal(chart.chartId, centerA1ChartId);

    // 2b.4 Authorized center without specific chart (Center A2) must NOT return Center A1 or fallback to org-wide
    const centerWithoutChart = await request(app)
      .post('/api/v1/rates/sync')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ scope: 'CENTER_SPECIFIC', centerId: centerA2 });

    assert.equal(centerWithoutChart.status, 200);
    assert.equal(centerWithoutChart.body.data.charts.length, 0, 'Must NOT resolve to another center or org-wide chart');
  });

  await t.test('2c. Case C — Invalid/Ambiguous Scope: missing, unknown, contradictory fail closed', async () => {
    // 2c.1 Missing scope must fail closed (400) - Missing centerId never implies organization-wide
    const missingScope = await request(app)
      .post('/api/v1/rates/sync')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({});

    assert.equal(missingScope.status, 400, 'Missing scope must return 400');
    assert.match(missingScope.body.error, /explicit rate scope.*required/i);

    // 2c.2 Unknown scope must fail closed (400)
    const unknownScope = await request(app)
      .post('/api/v1/rates/sync')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ scope: 'ALL_CHARTS' });

    assert.equal(unknownScope.status, 400, 'Unknown scope must return 400');
    assert.match(unknownScope.body.error, /invalid rate scope/i);

    // 2c.3 Contradictory scope: ORGANIZATION_WIDE with centerId must fail closed (400)
    const contradictoryOrg = await request(app)
      .post('/api/v1/rates/sync')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ scope: 'ORGANIZATION_WIDE', centerId: centerA1 });

    assert.equal(contradictoryOrg.status, 400, 'ORGANIZATION_WIDE with centerId must return 400');
    assert.match(contradictoryOrg.body.error, /contradictory scope/i);
  });

  // ============================================================================
  // 3. ACTUAL ETAG / CONDITIONAL REQUEST VERIFICATION (HTTP 304)
  // ============================================================================
  await t.test('3. ETag generation, HTTP 304 Not Modified, version invalidation, and tenant/centre isolation', async () => {
    // 3.1 Initial authenticated rate-sync request
    const initRes = await request(app)
      .post('/api/v1/rates/sync')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ scope: 'ORGANIZATION_WIDE' });

    assert.equal(initRes.status, 200);
    const etag1 = initRes.headers['etag'];
    assert.ok(etag1, 'Response must contain ETag header');
    assert.match(initRes.headers['cache-control'], /private.*must-revalidate/);

    // 3.2 Repeat request with matching If-None-Match header returns 304 Not Modified with empty body
    const condRes = await request(app)
      .post('/api/v1/rates/sync')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .set('If-None-Match', etag1)
      .send({ scope: 'ORGANIZATION_WIDE' });

    assert.equal(condRes.status, 304, 'Matching If-None-Match must return 304 Not Modified');
    assert.equal(condRes.text, '', 'HTTP 304 response body must be empty');
    assert.equal(condRes.headers['etag'], etag1);

    // 3.3 Repeat request with weak ETag format (W/<etag>) returns 304
    const weakRes = await request(app)
      .post('/api/v1/rates/sync')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .set('If-None-Match', `W/${etag1}`)
      .send({ scope: 'ORGANIZATION_WIDE' });

    assert.equal(weakRes.status, 304, 'Weak ETag must return 304');
    assert.equal(weakRes.text, '');

    // 3.4 Change rate chart version: publish Version 2 for Org-Wide chart (baseRate 46.00)
    await db.query(`
      INSERT INTO rate_chart_versions (id, rate_chart_id, version_number, effective_from, base_rate, base_fat, base_snf, is_approved)
      VALUES ($1, $2, 2, '2026-02-01T00:00:00Z', 46.00, 3.5, 8.5, TRUE);
    `, [orgVer2Id, orgChartId]);

    // Repeat request with old ETag -> old ETag must NO LONGER produce 304!
    const updatedRes = await request(app)
      .post('/api/v1/rates/sync')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .set('If-None-Match', etag1)
      .send({ scope: 'ORGANIZATION_WIDE' });

    assert.equal(updatedRes.status, 200, 'After version bump, old ETag must return 200 OK (never 304)');
    const etag2 = updatedRes.headers['etag'];
    assert.notEqual(etag2, etag1, 'New version must generate different ETag');
    const updatedCowChart = updatedRes.body.data.charts.find((c) => c.milkCategory === 'COW');
    assert.equal(updatedCowChart.versionNumber, 2);
    assert.equal(updatedCowChart.baseRate, 46.00);

    // 3.5 Tenant & Centre Isolation in ETag generation
    // Request Tenant B org-wide rates
    const tenantBRes = await request(app)
      .post('/api/v1/rates/sync')
      .set('Authorization', `Bearer ${operatorB1Token}`)
      .send({ scope: 'ORGANIZATION_WIDE' });

    assert.equal(tenantBRes.status, 200);
    const tenantBEtag = tenantBRes.headers['etag'];
    assert.notEqual(tenantBEtag, etag2, 'Tenant A and Tenant B must generate different ETags');

    // Request Centre A1 rates vs Org-Wide rates
    const centerA1Res = await request(app)
      .post('/api/v1/rates/sync')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ scope: 'CENTER_SPECIFIC', centerId: centerA1 });

    assert.equal(centerA1Res.status, 200);
    const centerA1Etag = centerA1Res.headers['etag'];
    assert.notEqual(centerA1Etag, etag2, 'Center-specific and Org-Wide must generate different ETags');
  });

  // ============================================================================
  // 4. CANONICAL GET /api/v1/rates/sync BACKWARDS-COMPATIBILITY
  // ============================================================================
  await t.test('4. GET /api/v1/rates/sync supports explicit scope, ETag, and 304', async () => {
    // 4.1 GET with explicit scope query param
    const getRes = await request(app)
      .get('/api/v1/rates/sync?scope=ORGANIZATION_WIDE')
      .set('Authorization', `Bearer ${ownerAToken}`);

    assert.equal(getRes.status, 200);
    const getEtag = getRes.headers['etag'];
    assert.ok(getEtag);

    // 4.2 GET with matching If-None-Match returns 304
    const get304 = await request(app)
      .get('/api/v1/rates/sync?scope=ORGANIZATION_WIDE')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .set('If-None-Match', getEtag);

    assert.equal(get304.status, 304);
    assert.equal(get304.text, '');

    // 4.3 GET without scope returns 400 (fail-closed)
    const getMissingScope = await request(app)
      .get('/api/v1/rates/sync')
      .set('Authorization', `Bearer ${ownerAToken}`);

    assert.equal(getMissingScope.status, 400);
  });

  t.after(async () => {
    try {
      await db.pool.end();
    } catch (_) {}
  });
});
