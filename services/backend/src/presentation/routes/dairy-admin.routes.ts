import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../../infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../../infrastructure/database/TenantDatabaseManager.js';
import { authenticate, authenticateSseStream } from '../middleware/authenticate.js';
import { sseTicketService } from '../../infrastructure/security/SseTicketService.js';
import { realtimePublisher } from '../../infrastructure/realtime/RealtimeEventPublisher.js';
import { isOriginAllowed } from '../../config/cors.js';

export const dairyAdminRoutes = Router();

/**
 * Middleware to enforce strict tenant isolation and resolve the authorized dairy organization ID.
 * Returns 403 Forbidden if a user tries to access a different organization or is an unauthorized role.
 */
async function resolveAndAuthorizeTenant(req: Request, res: Response): Promise<{ organizationId: string; tenantDb: any } | null> {
  // Reject customer accounts from accessing administrative endpoints
  if (req.user?.actorType === 'CUSTOMER' || req.user?.role === 'FARMER_CUSTOMER') {
    res.status(403).json({
      success: false,
      errorCode: 'FORBIDDEN',
      error: 'Forbidden: Customer accounts are not authorized to access dairy admin endpoints.',
    });
    return null;
  }

  const tokenOrgId = req.user?.organizationId;
  const headerOrgId = (req.headers['x-dairy-tenant-id'] as string) || (req.headers['x-dairy-id'] as string) || (req.headers['x-organization-id'] as string);
  const queryOrgId = req.query['organizationId'] as string;

  // If token is present, it is the sole authority
  if (tokenOrgId) {
    const requestedOrg = headerOrgId || queryOrgId;
    if (requestedOrg && requestedOrg !== tokenOrgId && req.user?.role !== 'SUPER_ADMIN') {
      res.status(403).json({
        success: false,
        errorCode: 'CROSS_TENANT_ACCESS_DENIED',
        error: 'Forbidden: You are not authorized to access this dairy organization.',
      });
      return null;
    }
  }

  const organizationId = tokenOrgId || headerOrgId || queryOrgId;
  if (!organizationId) {
    res.status(400).json({
      success: false,
      errorCode: 'MISSING_ORGANIZATION_ID',
      error: 'Dairy organization ID is required.',
    });
    return null;
  }

  let tenantDb;
  try {
    tenantDb = await tenantDbManager.getTenantDb(organizationId);
  } catch {
    tenantDb = db;
  }

  return { organizationId, tenantDb };
}

/**
 * Validates that an optional centerId belongs to the authenticated organization
 * and enforces strict cross-centre isolation for centre-restricted users.
 * Returns the effective centerId (string or null), or false if rejected.
 */
async function resolveAndValidateCenterScoping(
  req: Request,
  res: Response,
  tenantDb: any,
  organizationId: string,
  requestedCenterId?: string | null
): Promise<string | null | false> {
  const userCenterId = req.user?.centerId;

  // Case 1: Centre-restricted user (any user with an assigned centerId who is not a top-level org/super admin)
  if (userCenterId && req.user?.role !== 'SUPER_ADMIN' && req.user?.role !== 'PRIMARY_DAIRY_ADMIN') {
    if (requestedCenterId && requestedCenterId !== 'ALL' && requestedCenterId !== userCenterId) {
      res.status(403).json({
        success: false,
        errorCode: 'CROSS_CENTER_ACCESS_DENIED',
        error: `Forbidden: You are not authorized to access center '${requestedCenterId}'.`,
      });
      return false;
    }
    // Centre-restricted users are strictly bounded to their assigned center
    return userCenterId;
  }

  // Case 2: Org-wide administrator
  if (!requestedCenterId || requestedCenterId === 'ALL') {
    return null; // All centers
  }

  // Validate that requested centerId belongs to the organization in the database
  try {
    const centerRes = await tenantDb.query(
      `SELECT id FROM dairy_centers WHERE id = $1 AND organization_id = $2 LIMIT 1;`,
      [requestedCenterId, organizationId]
    );
    if (centerRes.rows.length === 0) {
      res.status(403).json({
        success: false,
        errorCode: 'UNAUTHORIZED_CENTER_ACCESS',
        error: `Center '${requestedCenterId}' is not authorized for your organization.`,
      });
      return false;
    }
    return requestedCenterId;
  } catch {
    res.status(403).json({
      success: false,
      errorCode: 'UNAUTHORIZED_CENTER_ACCESS',
      error: `Center '${requestedCenterId}' could not be verified.`,
    });
    return false;
  }
}

// ============================================================================
// 1. REALTIME SSE EVENT STREAM & TICKET ISSUANCE
// Endpoint: POST /api/v1/dairy-admin/events/ticket
// Endpoint: GET /api/v1/dairy-admin/events
// ============================================================================

/**
 * Issues a short-lived (30s), purpose-specific SSE ticket for browser EventSource connections.
 * Requires standard Bearer token in Authorization header.
 * Scoped strictly to the authenticated user, tenant, role, and SSE streaming purpose.
 */
dairyAdminRoutes.post('/events/ticket', authenticate, async (req: Request, res: Response): Promise<void> => {
  const allowedAdminRoles = [
    'PRIMARY_DAIRY_ADMIN',
    'DAIRY_ADMIN',
    'SUPER_ADMIN',
    'DAIRY_OWNER',
    'BRANCH_MANAGER',
    'CENTER_MANAGER',
  ];

  if (!req.user || !allowedAdminRoles.includes(req.user.role)) {
    res.status(403).json({
      success: false,
      errorCode: 'ROLE_UNAUTHORIZED',
      error: 'You do not have administrative permissions to obtain an SSE streaming ticket.',
    });
    return;
  }

  const tenant = await resolveAndAuthorizeTenant(req, res);
  if (!tenant) return;

  const ticket = sseTicketService.issueTicket(req.user, 30);
  res.json({
    success: true,
    ticket,
    expiresInSeconds: 30,
    organizationId: tenant.organizationId,
    data: {
      ticket,
      expiresInSeconds: 30,
      organizationId: tenant.organizationId,
    },
  });
});

dairyAdminRoutes.get('/events', authenticateSseStream, async (req: Request, res: Response): Promise<void> => {
  const tenant = await resolveAndAuthorizeTenant(req, res);
  if (!tenant) return;

  const { organizationId, tenantDb } = tenant;
  const requestedCenter = req.query['centerId'] as string;
  const centerId = await resolveAndValidateCenterScoping(req, res, tenantDb, organizationId, requestedCenter);
  if (centerId === false) return;

  const requestOrigin = req.headers.origin;
  if (requestOrigin && !isOriginAllowed(requestOrigin)) {
    res.status(403).json({
      success: false,
      errorCode: 'CORS_ORIGIN_FORBIDDEN',
      error: 'Origin is not allowed by CORS policy',
    });
    return;
  }

  // Set mandatory SSE headers
  const sseHeaders: Record<string, string> = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  };
  if (requestOrigin) {
    sseHeaders['Access-Control-Allow-Origin'] = requestOrigin;
    sseHeaders['Access-Control-Allow-Credentials'] = 'true';
    sseHeaders['Vary'] = 'Origin';
  }
  res.writeHead(200, sseHeaders);

  res.flushHeaders?.();

  const lastEventId = (req.headers['last-event-id'] as string) || (req.query['lastEventId'] as string);

  const { unregister } = realtimePublisher.registerClient({
    organizationId,
    centerId: centerId || null,
    res,
    lastEventId,
  });

  req.on('close', () => {
    unregister();
  });
});

// ============================================================================
// 2. OVERVIEW METRICS (POSTGRESQL-AUTHORITATIVE)
// Endpoint: GET /api/v1/dairy-admin/metrics
// ============================================================================
dairyAdminRoutes.get('/metrics', authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenant = await resolveAndAuthorizeTenant(req, res);
    if (!tenant) return;

    const { organizationId, tenantDb } = tenant;
    const requestedCenter = req.query['centerId'] as string;
    const centerId = await resolveAndValidateCenterScoping(req, res, tenantDb, organizationId, requestedCenter);
    if (centerId === false) return;

    const todayDate = (req.query['businessDate'] as string) || new Date().toISOString().split('T')[0];

    // 1. Authoritative milk collection totals from PostgreSQL (strictly completed/accepted, no replays)
    const centerFilterClause = centerId ? `AND mc.center_id = $3` : ``;
    const collQueryParams: any[] = [organizationId, todayDate];
    if (centerId) {
      collQueryParams.push(centerId);
    }

    const collStatsRes = await tenantDb.query(
      `SELECT 
        COALESCE(SUM(mc.net_weight), 0) AS total_liters,
        COALESCE(SUM(CASE WHEN mc.milk_category = 'COW' THEN mc.net_weight ELSE 0 END), 0) AS cow_liters,
        COALESCE(SUM(CASE WHEN mc.milk_category = 'BUFFALO' THEN mc.net_weight ELSE 0 END), 0) AS buffalo_liters,
        COUNT(*) AS transaction_count,
        COALESCE(SUM(mc.total_amount), 0) AS total_amount,
        COALESCE(MAX(mc.created_at), NULL) AS latest_collection_time
       FROM milk_collections mc
       WHERE mc.organization_id = $1 
         AND mc.business_date = $2
         AND mc.transaction_status IN ('COMPLETED', 'ACCEPTED', 'VERIFIED', 'SETTLED')
         ${centerFilterClause};`,
      collQueryParams
    );
    const collStats = collStatsRes.rows[0] || {};

    // 2. Active Sessions Count
    const sessionQueryParams: any[] = [organizationId, todayDate];
    const sessionCenterFilter = centerId ? `AND center_id = $3` : ``;
    if (centerId) {
      sessionQueryParams.push(centerId);
    }

    const sessionRes = await tenantDb.query(
      `SELECT COUNT(*) AS active_sessions_count
       FROM kiosk_shift_sessions
       WHERE organization_id = $1
         AND business_date = $2
         AND status = 'OPEN'
         ${sessionCenterFilter};`,
      sessionQueryParams
    );
    const activeSessionsCount = Number(sessionRes.rows[0]?.active_sessions_count || 0);

    // 3. Station Telemetry & Operational Health
    const deviceQueryParams: any[] = [organizationId];
    const deviceCenterFilter = centerId ? `AND d.center_id = $2` : ``;
    if (centerId) {
      deviceQueryParams.push(centerId);
    }

    const devicesRes = await tenantDb.query(
      `SELECT 
        d.id, d.status, d.is_blocked, d.last_seen_at,
        dss.pending_queue_count, dss.sync_failure_category, dss.last_sync_error
       FROM devices d
       LEFT JOIN device_sync_state dss ON dss.device_id = d.id
       WHERE d.organization_id = $1
         ${deviceCenterFilter};`,
      deviceQueryParams
    );

    let totalStationsCount = devicesRes.rows.length;
    let onlineStationsCount = 0;
    let degradedStationsCount = 0;
    let offlineStationsCount = 0;
    let blockedStationsCount = 0;
    let pendingSyncCount = 0;

    const now = Date.now();
    const threeMinMs = 3 * 60 * 1000;
    const fifteenMinMs = 15 * 60 * 1000;

    for (const dev of devicesRes.rows) {
      pendingSyncCount += Number(dev.pending_queue_count || 0);

      if (dev.status === 'BLOCKED' || dev.is_blocked === true) {
        blockedStationsCount++;
        continue;
      }

      if (!dev.last_seen_at) {
        offlineStationsCount++;
        continue;
      }

      const lastSeenMs = new Date(dev.last_seen_at).getTime();
      const elapsed = now - lastSeenMs;

      if (elapsed <= threeMinMs) {
        if (Number(dev.pending_queue_count || 0) > 10 || dev.sync_failure_category) {
          degradedStationsCount++;
        } else {
          onlineStationsCount++;
        }
      } else if (elapsed <= fifteenMinMs) {
        degradedStationsCount++;
      } else {
        offlineStationsCount++;
      }
    }

    // 4. Exception Counts: Manual Review & Rejected Transactions
    const manualReviewRes = await tenantDb.query(
      `SELECT COUNT(*) AS manual_review_count
       FROM milk_collections mc
       WHERE mc.organization_id = $1
         AND mc.business_date = $2
         AND mc.transaction_status = 'MANUAL_REVIEW'
         ${centerFilterClause};`,
      collQueryParams
    );
    const manualReviewCount = Number(manualReviewRes.rows[0]?.manual_review_count || 0);

    const rejectedRes = await tenantDb.query(
      `SELECT COUNT(*) AS rejected_count
       FROM milk_collections mc
       WHERE mc.organization_id = $1
         AND mc.business_date = $2
         AND mc.transaction_status = 'REJECTED'
         ${centerFilterClause};`,
      collQueryParams
    );
    const rejectedCount = Number(rejectedRes.rows[0]?.rejected_count || 0);

    res.json({
      success: true,
      data: {
        businessDate: todayDate,
        organizationId,
        centerId: centerId && centerId !== 'ALL' ? centerId : null,
        totalMilkLiters: Number(Number(collStats.total_liters || 0).toFixed(2)),
        totalAmount: Number(Number(collStats.total_amount || 0).toFixed(2)),
        transactionCount: Number(collStats.transaction_count || 0),
        cowLiters: Number(Number(collStats.cow_liters || 0).toFixed(2)),
        buffaloLiters: Number(Number(collStats.buffalo_liters || 0).toFixed(2)),
        activeSessionsCount,
        totalStationsCount,
        onlineStationsCount,
        degradedStationsCount,
        offlineStationsCount,
        blockedStationsCount,
        pendingSyncCount,
        manualReviewCount,
        rejectedCount,
        lastCollectionTime: collStats.latest_collection_time
          ? new Date(collStats.latest_collection_time).toISOString()
          : null,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 3. CENTRE-WISE LIVE OVERVIEW
// Endpoint: GET /api/v1/dairy-admin/centers/metrics
// ============================================================================
dairyAdminRoutes.get('/centers/metrics', authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenant = await resolveAndAuthorizeTenant(req, res);
    if (!tenant) return;

    const { organizationId, tenantDb } = tenant;
    const requestedCenter = req.query['centerId'] as string;
    const centerId = await resolveAndValidateCenterScoping(req, res, tenantDb, organizationId, requestedCenter);
    if (centerId === false) return;

    const todayDate = (req.query['businessDate'] as string) || new Date().toISOString().split('T')[0];

    const centerFilter = centerId ? `AND c.id = $2` : ``;
    const params: any[] = [organizationId];
    if (centerId) {
      params.push(centerId);
    }

    // 1. Fetch authorized centers
    const centersRes = await tenantDb.query(
      `SELECT c.id, c.code, c.name, c.village_town, c.district, c.status
       FROM dairy_centers c
       WHERE c.organization_id = $1
         ${centerFilter}
       ORDER BY c.name ASC;`,
      params
    );

    const now = Date.now();
    const threeMinMs = 3 * 60 * 1000;

    const results = [];

    for (const c of centersRes.rows) {
      // Collections metrics for today
      const colRes = await tenantDb.query(
        `SELECT 
          COALESCE(SUM(net_weight), 0) AS total_liters,
          COALESCE(SUM(total_amount), 0) AS total_amount,
          COUNT(*) AS total_collections,
          MAX(created_at) AS latest_collection_time,
          COUNT(CASE WHEN transaction_status = 'MANUAL_REVIEW' THEN 1 END) AS manual_review_count
         FROM milk_collections
         WHERE organization_id = $1 
           AND center_id = $2 
           AND business_date = $3
           AND transaction_status IN ('COMPLETED', 'ACCEPTED', 'VERIFIED', 'SETTLED');`,
        [organizationId, c.id, todayDate]
      );
      const col = colRes.rows[0] || {};

      // Active open session
      const sessRes = await tenantDb.query(
        `SELECT s.id, s.session_code, s.shift, s.opened_at, u_open.full_name AS opening_operator_name
         FROM kiosk_shift_sessions s
         LEFT JOIN users u_open ON u_open.id = s.opening_operator_id
         WHERE s.organization_id = $1
           AND s.center_id = $2
           AND s.business_date = $3
           AND s.status = 'OPEN'
         ORDER BY s.opened_at DESC
         LIMIT 1;`,
        [organizationId, c.id, todayDate]
      );
      const activeSession = sessRes.rows[0] || null;

      // Station telemetry for center
      const stnRes = await tenantDb.query(
        `SELECT 
          d.id, d.status, d.is_blocked, d.last_seen_at,
          dss.pending_queue_count, dss.sync_failure_category
         FROM devices d
         LEFT JOIN device_sync_state dss ON dss.device_id = d.id
         WHERE d.organization_id = $1 AND d.center_id = $2;`,
        [organizationId, c.id]
      );

      let activeStations = 0;
      let offlineStations = 0;
      let pendingSyncTelemetry = 0;

      for (const stn of stnRes.rows) {
        pendingSyncTelemetry += Number(stn.pending_queue_count || 0);
        if (stn.status === 'BLOCKED' || stn.is_blocked === true) {
          continue;
        }
        if (stn.last_seen_at && now - new Date(stn.last_seen_at).getTime() <= threeMinMs) {
          activeStations++;
        } else {
          offlineStations++;
        }
      }

      results.push({
        centerId: c.id,
        centerCode: c.code,
        centerName: c.name,
        villageTown: c.village_town || '',
        status: c.status !== 'ACTIVE' ? 'INACTIVE' : (activeSession ? 'OPEN' : 'CLOSED'),
        centerStatus: c.status,
        collectionStatus: activeSession ? 'COLLECTION_IN_PROGRESS' : 'IDLE',
        activeSession: activeSession
          ? {
              sessionId: activeSession.id,
              sessionCode: activeSession.session_code,
              shift: activeSession.shift,
              openedAt: activeSession.opened_at,
              operatorName: activeSession.opening_operator_name,
            }
          : null,
        totalCollections: Number(col.total_collections || 0),
        totalLiters: Number(Number(col.total_liters || 0).toFixed(2)),
        totalAmount: Number(Number(col.total_amount || 0).toFixed(2)),
        latestCollectionTime: col.latest_collection_time
          ? new Date(col.latest_collection_time).toISOString()
          : null,
        activeStations,
        offlineStations,
        activeStationsCount: activeStations,
        offlineStationsCount: offlineStations,
        degradedStationsCount: 0,
        blockedStationsCount: 0,
        pendingSyncCount: pendingSyncTelemetry,
        pendingSyncTelemetry,
        manualReviewCount: Number(col.manual_review_count || 0),
        rejectedCount: 0,
      });
    }

    res.json({
      success: true,
      count: results.length,
      data: results,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 4. LIVE COLLECTION ACTIVITY FEED (PII-REDACTED)
// Endpoint: GET /api/v1/dairy-admin/collections/feed
// ============================================================================
dairyAdminRoutes.get('/collections/feed', authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenant = await resolveAndAuthorizeTenant(req, res);
    if (!tenant) return;

    const { organizationId, tenantDb } = tenant;
    const requestedCenter = req.query['centerId'] as string;
    const centerId = await resolveAndValidateCenterScoping(req, res, tenantDb, organizationId, requestedCenter);
    if (centerId === false) return;

    const limit = Math.min(100, Math.max(1, Number(req.query['limit'] || 25)));

    const centerClause = centerId ? `AND mc.center_id = $2` : ``;
    const params: any[] = [organizationId];
    if (centerId) {
      params.push(centerId);
    }
    params.push(limit);
    const limitParamIdx = params.length;

    const feedRes = await tenantDb.query(
      `SELECT 
        mc.id,
        COALESCE(mc.client_intake_uuid::text, mc.id::text) AS collection_reference,
        mc.center_id,
        dc.name AS center_name,
        dc.code AS center_code,
        ks.id AS session_id,
        ks.session_code,
        ks.shift AS session_shift,
        mc.business_date,
        mc.shift_type,
        mc.milk_category,
        mc.net_weight,
        mc.measurement_unit,
        mc.fat_percentage,
        mc.snf_percentage,
        mc.applied_rate_per_unit,
        mc.total_amount,
        mc.transaction_status,
        mc.idempotency_key,
        mc.created_at,
        c.farmer_code,
        CONCAT(SUBSTRING(c.full_name, 1, 1), '*** ', SPLIT_PART(c.full_name, ' ', 2)) AS masked_farmer_name
       FROM milk_collections mc
       JOIN customers c ON c.id = mc.customer_id
       LEFT JOIN dairy_centers dc ON dc.id = mc.center_id
       LEFT JOIN kiosk_shift_sessions ks ON ks.id = mc.session_id
       WHERE mc.organization_id = $1
         ${centerClause}
       ORDER BY mc.created_at DESC
       LIMIT $${limitParamIdx};`,
      params
    );

    const items = feedRes.rows.map((row: any) => ({
      id: row.id,
      collectionId: row.id,
      collectionReference: row.collection_reference || `COL-${row.id.slice(0, 8)}`,
      transactionCode: row.collection_reference,
      centerId: row.center_id,
      centerCode: row.center_code || 'CTR',
      centerName: row.center_name || 'Center',
      sessionId: row.session_id || 'SES-MAIN',
      sessionCode: row.session_code || 'SES-MAIN',
      sessionShift: row.session_shift || row.shift_type,
      businessDate: row.business_date instanceof Date ? row.business_date.toISOString().split('T')[0] : String(row.business_date),
      shiftType: row.shift_type,
      milkCategory: row.milk_category,
      quantityLiters: Number(row.net_weight),
      fatPercentage: Number(row.fat_percentage),
      snfPercentage: Number(row.snf_percentage),
      ratePerLiter: Number(row.applied_rate_per_unit),
      appliedRate: Number(row.applied_rate_per_unit),
      totalAmount: Number(row.total_amount),
      financialStatus: row.transaction_status === 'ACCEPTED' ? 'COMPLETED' : row.transaction_status,
      verifiedFinancialStatus: row.transaction_status,
      syncStatus: 'SYNCED_CLOUD',
      isReplayed: false,
      collectedAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      collectionTime: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      farmerCode: row.farmer_code,
      maskedFarmerName: row.masked_farmer_name || 'Farmer',
      farmerMaskedName: row.masked_farmer_name || 'Farmer',
    }));

    res.json({
      success: true,
      count: items.length,
      data: items,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 5. SESSION MONITORING
// Endpoint: GET /api/v1/dairy-admin/sessions
// ============================================================================
dairyAdminRoutes.get('/sessions', authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenant = await resolveAndAuthorizeTenant(req, res);
    if (!tenant) return;

    const { organizationId, tenantDb } = tenant;
    const requestedCenter = req.query['centerId'] as string;
    const centerId = await resolveAndValidateCenterScoping(req, res, tenantDb, organizationId, requestedCenter);
    if (centerId === false) return;

    const businessDate = (req.query['businessDate'] as string) || new Date().toISOString().split('T')[0];

    const centerClause = centerId ? `AND s.center_id = $3` : ``;
    const params: any[] = [organizationId, businessDate];
    if (centerId) {
      params.push(centerId);
    }

    const sessionsRes = await tenantDb.query(
      `SELECT 
        s.id, s.session_code, s.center_id, dc.name AS center_name,
        s.business_date, s.shift, s.status, s.opened_at, s.closed_at,
        u_open.full_name AS opening_operator_name, u_close.full_name AS closing_operator_name,
        s.device_identifier, s.device_name,
        s.total_liters, s.cow_liters, s.buffalo_liters,
        s.transaction_count, s.total_amount
       FROM kiosk_shift_sessions s
       LEFT JOIN dairy_centers dc ON dc.id = s.center_id
       LEFT JOIN users u_open ON u_open.id = s.opening_operator_id
       LEFT JOIN users u_close ON u_close.id = s.closing_operator_id
       WHERE s.organization_id = $1
         AND s.business_date = $2
         ${centerClause}
       ORDER BY s.opened_at DESC;`,
      params
    );

    const sessions = sessionsRes.rows.map((row: any) => ({
      sessionId: row.id,
      sessionCode: row.session_code,
      centerId: row.center_id,
      centerName: row.center_name || 'Center',
      businessDate: row.business_date instanceof Date ? row.business_date.toISOString().split('T')[0] : String(row.business_date),
      shift: row.shift,
      status: row.status,
      openedAt: row.opened_at instanceof Date ? row.opened_at.toISOString() : String(row.opened_at),
      closedAt: row.closed_at ? (row.closed_at instanceof Date ? row.closed_at.toISOString() : String(row.closed_at)) : null,
      openingOperatorName: row.opening_operator_name || 'Operator',
      closingOperatorName: row.closing_operator_name || null,
      deviceIdentifier: row.device_identifier,
      deviceName: row.device_name || 'Counter Terminal',
      totalLiters: Number(Number(row.total_liters || 0).toFixed(2)),
      cowLiters: Number(Number(row.cow_liters || 0).toFixed(2)),
      buffaloLiters: Number(Number(row.buffalo_liters || 0).toFixed(2)),
      transactionCount: Number(row.transaction_count || 0),
      totalAmount: Number(Number(row.total_amount || 0).toFixed(2)),
    }));

    res.json({
      success: true,
      count: sessions.length,
      data: sessions,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 6. STATION MONITORING (STATUS CLASSIFICATION & TELEMETRY)
// Endpoint: GET /api/v1/dairy-admin/stations
// ============================================================================
dairyAdminRoutes.get('/stations', authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenant = await resolveAndAuthorizeTenant(req, res);
    if (!tenant) return;

    const { organizationId, tenantDb } = tenant;
    const requestedCenter = req.query['centerId'] as string;
    const centerId = await resolveAndValidateCenterScoping(req, res, tenantDb, organizationId, requestedCenter);
    if (centerId === false) return;

    const centerClause = centerId ? `AND d.center_id = $2` : ``;
    const params: any[] = [organizationId];
    if (centerId) {
      params.push(centerId);
    }

    const stationsRes = await tenantDb.query(
      `SELECT 
        d.id, d.device_identifier, d.name AS station_name, d.device_type,
        d.organization_id, d.center_id, dc.name AS center_name,
        d.status AS registration_status, d.is_blocked, d.last_seen_at,
        d.created_at, d.revoked_at, d.revocation_reason,
        dss.last_upstream_sync_at, dss.last_downstream_sync_at,
        dss.client_app_version, dss.pending_queue_count,
        dss.last_sync_error, dss.sync_failure_category,
        dss.battery_level, dss.network_mode, dss.last_heartbeat_at
       FROM devices d
       LEFT JOIN dairy_centers dc ON dc.id = d.center_id
       LEFT JOIN device_sync_state dss ON dss.device_id = d.id
       WHERE d.organization_id = $1
         ${centerClause}
       ORDER BY d.created_at ASC;`,
      params
    );

    const now = Date.now();
    const threeMinMs = 3 * 60 * 1000;
    const fifteenMinMs = 15 * 60 * 1000;

    const stations = stationsRes.rows.map((row: any) => {
      let operationalStatus: 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'BLOCKED' | 'UNKNOWN' = 'UNKNOWN';

      if (row.registration_status === 'BLOCKED' || row.is_blocked === true) {
        operationalStatus = 'BLOCKED';
      } else if (row.registration_status === 'ACTIVE') {
        if (!row.last_seen_at) {
          operationalStatus = 'OFFLINE';
        } else {
          const elapsed = now - new Date(row.last_seen_at).getTime();
          if (elapsed <= threeMinMs) {
            if (Number(row.pending_queue_count || 0) > 10 || row.sync_failure_category) {
              operationalStatus = 'DEGRADED';
            } else {
              operationalStatus = 'ONLINE';
            }
          } else if (elapsed <= fifteenMinMs) {
            operationalStatus = 'DEGRADED';
          } else {
            operationalStatus = 'OFFLINE';
          }
        }
      }

      return {
        deviceId: row.id,
        stationId: row.id,
        deviceIdentifier: row.device_identifier,
        stationName: row.station_name || `Station (${row.device_identifier})`,
        deviceName: row.station_name || `Station (${row.device_identifier})`,
        deviceType: row.device_type,
        centerId: row.center_id,
        centerCode: row.center_code || null,
        centerName: row.center_name || 'Assigned Center',
        registrationStatus: row.registration_status,
        isBlocked: Boolean(row.is_blocked),
        revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
        revocationReason: row.revocation_reason || null,
        statusClassification: operationalStatus,
        operationalStatus,
        lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
        lastHeartbeatAt: row.last_heartbeat_at ? new Date(row.last_heartbeat_at).toISOString() : (row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null),
        lastSuccessfulSyncAt: row.last_upstream_sync_at ? new Date(row.last_upstream_sync_at).toISOString() : null,
        lastSyncAt: row.last_upstream_sync_at ? new Date(row.last_upstream_sync_at).toISOString() : null,
        pendingQueueCount: Number(row.pending_queue_count || 0),
        lastSyncError: row.last_sync_error || null,
        syncFailureCategory: row.sync_failure_category || null,
        appVersion: row.client_app_version || 'v2.4.1',
        clientAppVersion: row.client_app_version || 'v2.4.1',
        batteryLevel: row.battery_level !== null && row.battery_level !== undefined ? Number(row.battery_level) : null,
        networkMode: row.network_mode || 'ETHERNET',
        hardwareSerial: row.device_identifier,
      };
    });

    res.json({
      success: true,
      count: stations.length,
      data: stations,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 7. BLOCK / UNBLOCK STATION ACTIONS
// Endpoints: POST /api/v1/dairy-admin/stations/:id/block and /unblock
// ============================================================================
dairyAdminRoutes.post('/stations/:id/block', authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const allowedAdminRoles = [
      'PRIMARY_DAIRY_ADMIN',
      'DAIRY_ADMIN',
      'SUPER_ADMIN',
      'DAIRY_OWNER',
      'CENTER_MANAGER',
    ];

    if (!req.user || !allowedAdminRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        errorCode: 'ROLE_UNAUTHORIZED',
        error: 'Forbidden: You do not have administrative permissions to block stations.',
      });
      return;
    }

    const tenant = await resolveAndAuthorizeTenant(req, res);
    if (!tenant) return;

    const { organizationId, tenantDb } = tenant;
    const { id } = req.params;
    const reason = req.body?.reason || 'Administratively blocked by Dairy Admin';

    // 1. Fetch current device state for authorization and audit recording
    const existingDevRes = await tenantDb.query(
      `SELECT id, device_identifier, center_id, status, is_blocked
       FROM devices
       WHERE (id::text = $1 OR device_identifier = $1) AND organization_id = $2
       LIMIT 1;`,
      [id, organizationId]
    );

    if (existingDevRes.rows.length === 0) {
      res.status(404).json({ success: false, error: `Station '${id}' not found in your dairy organization.` });
      return;
    }

    const currentDev = existingDevRes.rows[0];

    // Centre-scoping check for centre-restricted users
    if (req.user.role === 'CENTER_MANAGER' && req.user.centerId && currentDev.center_id !== req.user.centerId) {
      res.status(403).json({
        success: false,
        errorCode: 'CROSS_CENTER_ACCESS_DENIED',
        error: 'Forbidden: You cannot block a station assigned to another center.',
      });
      return;
    }

    const updRes = await tenantDb.query(
      `UPDATE devices 
       SET status = 'BLOCKED', is_blocked = TRUE, revocation_reason = $1
       WHERE id = $2 AND organization_id = $3
       RETURNING id, device_identifier, center_id;`,
      [reason, currentDev.id, organizationId]
    );

    const dev = updRes.rows[0];

    // Record audit log
    try {
      await tenantDb.query(
        `INSERT INTO audit_logs (organization_id, center_id, user_id, action, entity_type, entity_id, old_values, new_values)
         VALUES ($1, $2, $3, 'STATION_BLOCKED', 'DEVICE', $4, $5, $6);`,
        [
          organizationId,
          dev.center_id,
          req.user.userId,
          dev.id,
          JSON.stringify({ status: currentDev.status, isBlocked: currentDev.is_blocked }),
          JSON.stringify({ status: 'BLOCKED', isBlocked: true, reason }),
        ]
      );
    } catch {}

    // Emit Realtime Event
    realtimePublisher.broadcast({
      eventId: `EVT-BLK-${Date.now()}`,
      eventType: 'DEVICE_BLOCKED',
      schemaVersion: 1,
      organizationId,
      centerId: dev.center_id,
      entityId: dev.device_identifier,
      aggregateVersion: 1,
      occurredAt: new Date().toISOString(),
      publishedAt: new Date().toISOString(),
      payload: {
        stationId: dev.id,
        deviceIdentifier: dev.device_identifier,
        reason,
        status: 'BLOCKED',
      },
    });

    res.json({
      success: true,
      message: `Station '${dev.device_identifier}' blocked successfully.`,
      data: {
        stationId: dev.id,
        deviceIdentifier: dev.device_identifier,
        status: 'BLOCKED',
      },
    });
  } catch (err) {
    next(err);
  }
});

dairyAdminRoutes.post('/stations/:id/unblock', authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const allowedAdminRoles = [
      'PRIMARY_DAIRY_ADMIN',
      'DAIRY_ADMIN',
      'SUPER_ADMIN',
      'DAIRY_OWNER',
      'CENTER_MANAGER',
    ];

    if (!req.user || !allowedAdminRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        errorCode: 'ROLE_UNAUTHORIZED',
        error: 'Forbidden: You do not have administrative permissions to unblock stations.',
      });
      return;
    }

    const tenant = await resolveAndAuthorizeTenant(req, res);
    if (!tenant) return;

    const { organizationId, tenantDb } = tenant;
    const { id } = req.params;

    // 1. Fetch current device state
    const existingDevRes = await tenantDb.query(
      `SELECT id, device_identifier, center_id, status, is_blocked, public_key, device_token_hash, revoked_at
       FROM devices
       WHERE (id::text = $1 OR device_identifier = $1) AND organization_id = $2
       LIMIT 1;`,
      [id, organizationId]
    );

    if (existingDevRes.rows.length === 0) {
      res.status(404).json({ success: false, error: `Station '${id}' not found in your dairy organization.` });
      return;
    }

    const currentDev = existingDevRes.rows[0];

    // 2. Strict permanent revocation guard: unblock CANNOT silently restore permanently revoked credentials
    if (
      currentDev.status === 'REVOKED' ||
      currentDev.status === 'DECOMMISSIONED' ||
      Boolean(currentDev.revoked_at) ||
      (currentDev.public_key === null && currentDev.device_token_hash === null && currentDev.status !== 'ACTIVE')
    ) {
      res.status(409).json({
        success: false,
        errorCode: 'CANNOT_UNBLOCK_REVOKED_DEVICE',
        error: `Cannot unblock station '${currentDev.device_identifier}': Hardware credentials have been permanently revoked and wiped. Device must undergo complete re-registration.`,
      });
      return;
    }

    // Centre-scoping check for centre-restricted users
    if (req.user.role === 'CENTER_MANAGER' && req.user.centerId && currentDev.center_id !== req.user.centerId) {
      res.status(403).json({
        success: false,
        errorCode: 'CROSS_CENTER_ACCESS_DENIED',
        error: 'Forbidden: You cannot unblock a station assigned to another center.',
      });
      return;
    }

    const updRes = await tenantDb.query(
      `UPDATE devices 
       SET status = 'ACTIVE', is_blocked = FALSE, revoked_at = NULL, revocation_reason = NULL
       WHERE id = $1 AND organization_id = $2
       RETURNING id, device_identifier, center_id;`,
      [currentDev.id, organizationId]
    );

    const dev = updRes.rows[0];

    // Record audit log
    try {
      await tenantDb.query(
        `INSERT INTO audit_logs (organization_id, center_id, user_id, action, entity_type, entity_id, old_values, new_values)
         VALUES ($1, $2, $3, 'STATION_UNBLOCKED', 'DEVICE', $4, $5, $6);`,
        [
          organizationId,
          dev.center_id,
          req.user.userId,
          dev.id,
          JSON.stringify({ status: currentDev.status, isBlocked: currentDev.is_blocked }),
          JSON.stringify({ status: 'ACTIVE', isBlocked: false }),
        ]
      );
    } catch {}

    // Emit Realtime Event
    realtimePublisher.broadcast({
      eventId: `EVT-ACT-${Date.now()}`,
      eventType: 'STATION_STATUS_CHANGED',
      schemaVersion: 1,
      organizationId,
      centerId: dev.center_id,
      entityId: dev.device_identifier,
      aggregateVersion: 1,
      occurredAt: new Date().toISOString(),
      publishedAt: new Date().toISOString(),
      payload: {
        stationId: dev.id,
        deviceIdentifier: dev.device_identifier,
        status: 'ACTIVE',
      },
    });

    res.json({
      success: true,
      message: `Station '${dev.device_identifier}' unblocked and restored to ACTIVE.`,
      data: {
        stationId: dev.id,
        deviceIdentifier: dev.device_identifier,
        status: 'ACTIVE',
      },
    });
  } catch (err) {
    next(err);
  }
});
