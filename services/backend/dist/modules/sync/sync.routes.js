import { Router } from 'express';
import { SyncService } from './sync.service.js';
import { DeviceRegistryService } from './device-registry.service.js';
import { ApiResponse } from '../../shared/response/api-response.js';
import { authenticateDevice } from '../../middleware/authenticate.js';
import { authenticate as authenticatePresentation } from '../../presentation/middleware/authenticate.js';
import { authorizePermission, authorizeRoles } from '../../presentation/middleware/authorize.js';
import { ValidationError, UnauthorizedError, ForbiddenError } from '../../shared/errors/app-error.js';
import { SyncAcknowledgeSchema } from '@dfarm/shared-validation';
import { tenantDbManager } from '../../infrastructure/database/TenantDatabaseManager.js';
export const syncRouter = Router();
/**
 * POST /api/v1/sync/push
 * Batch upload offline collection events, customer registrations, and audit logs.
 */
syncRouter.post('/push', authenticateDevice, async (req, res, next) => {
    try {
        if (!req.device) {
            throw new UnauthorizedError('Verified device context is required', 'UNAUTHORIZED_DEVICE');
        }
        const result = await SyncService.pushEvents(req.device, req.body);
        ApiResponse.success(res, result);
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /api/v1/sync/pull
 * Downstream incremental synchronization of customers, rate cards, and encrypted face templates.
 */
syncRouter.get('/pull', authenticateDevice, async (req, res, next) => {
    try {
        if (!req.device) {
            throw new UnauthorizedError('Verified device context is required', 'UNAUTHORIZED_DEVICE');
        }
        const rawCursor = req.query['cursor'] ? Number(req.query['cursor']) : 0;
        const rawTombstoneCursor = req.query['tombstoneCursor'] ? Number(req.query['tombstoneCursor']) : 0;
        const cursor = Number.isInteger(rawCursor) && rawCursor >= 0 ? rawCursor : 0;
        const tombstoneCursor = Number.isInteger(rawTombstoneCursor) && rawTombstoneCursor >= 0 ? rawTombstoneCursor : 0;
        const result = await SyncService.pullChanges(req.device, cursor, tombstoneCursor);
        ApiResponse.success(res, result);
    }
    catch (err) {
        next(err);
    }
});
/**
 * POST /api/v1/sync/acknowledge
 * Acknowledge receipt and advance downstream sync cursor.
 */
syncRouter.post('/acknowledge', authenticateDevice, async (req, res, next) => {
    try {
        if (!req.device) {
            throw new UnauthorizedError('Verified device context is required', 'UNAUTHORIZED_DEVICE');
        }
        const parseResult = SyncAcknowledgeSchema.safeParse(req.body);
        if (!parseResult.success) {
            throw new ValidationError(`Validation failed: ${JSON.stringify(parseResult.error.format())}`);
        }
        const { downstreamCursor, downstreamTombstoneCursor, clientAppVersion, cursor } = parseResult.data;
        const finalDownstreamCursor = downstreamCursor ?? cursor ?? 0;
        const finalTombstoneCursor = downstreamTombstoneCursor ?? 0;
        const result = await SyncService.acknowledge(req.device, finalDownstreamCursor, finalTombstoneCursor, clientAppVersion);
        ApiResponse.success(res, result);
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /api/v1/sync/status
 * Query device synchronization status, health, and timestamps.
 */
syncRouter.get('/status', authenticateDevice, async (req, res, next) => {
    try {
        if (!req.device) {
            throw new UnauthorizedError('Verified device context is required', 'UNAUTHORIZED_DEVICE');
        }
        const result = await SyncService.getStatus(req.device);
        ApiResponse.success(res, result);
    }
    catch (err) {
        next(err);
    }
});
// Device Registration & Revocation Router (delegates to hardened DeviceRegistryService)
export const deviceRouter = Router();
deviceRouter.post('/register', authenticatePresentation, authorizeRoles('SUPER_ADMIN', 'PRIMARY_DAIRY_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'CENTER_MANAGER'), async (req, res, next) => {
    try {
        const headerOrgId = req.headers['x-dairy-tenant-id'] ||
            req.headers['x-organization-id'] ||
            req.headers['x-dairy-id'];
        const data = await DeviceRegistryService.registerDevice({
            actor: {
                userId: req.user.userId,
                role: req.user.role,
                organizationId: req.user.organizationId,
                centerIds: req.user.centerIds,
            },
            body: req.body,
            headerOrgId,
        });
        ApiResponse.success(res, data, 200);
    }
    catch (err) {
        next(err);
    }
});
deviceRouter.post('/revoke', authenticatePresentation, authorizeRoles('SUPER_ADMIN', 'PRIMARY_DAIRY_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'CENTER_MANAGER'), async (req, res, next) => {
    try {
        const headerOrgId = req.headers['x-dairy-tenant-id'] ||
            req.headers['x-organization-id'] ||
            req.headers['x-dairy-id'];
        const data = await DeviceRegistryService.revokeDevice({
            actor: {
                userId: req.user.userId,
                role: req.user.role,
                organizationId: req.user.organizationId,
                centerIds: req.user.centerIds,
            },
            body: req.body,
            headerOrgId,
        });
        ApiResponse.success(res, data, 200);
    }
    catch (err) {
        next(err);
    }
});
deviceRouter.get('/', authenticatePresentation, authorizeRoles('SUPER_ADMIN', 'PRIMARY_DAIRY_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'CENTER_MANAGER', 'SUPERVISOR'), async (req, res, next) => {
    try {
        const orgId = req.user?.organizationId;
        if (!orgId) {
            throw new ForbiddenError('Authenticated organization context is required');
        }
        const tenantDb = await tenantDbManager.getStrictTenantDb(orgId);
        const centerId = req.query['centerId'];
        let q = `
        SELECT d.id, d.organization_id, d.center_id, dc.name as center_name, dc.code as center_code,
               d.device_identifier, d.device_type, d.status, d.last_seen_at, d.created_at,
               d.max_offline_hours, d.offline_auth_policy_approved, d.approved_max_offline_hours,
               dss.downstream_cursor, dss.client_app_version, dss.updated_at as last_synced_at
        FROM devices d
        JOIN dairy_centers dc ON dc.id = d.center_id
        LEFT JOIN device_sync_state dss ON dss.device_id = d.id
        WHERE d.organization_id = $1
      `;
        const params = [orgId];
        if (centerId) {
            params.push(centerId);
            q += ` AND d.center_id = $${params.length}`;
        }
        q += ' ORDER BY d.created_at DESC;';
        const result = await tenantDb.query(q, params);
        ApiResponse.success(res, result.rows);
    }
    catch (err) {
        next(err);
    }
});
deviceRouter.post('/:deviceId/approve-offline', authenticatePresentation, authorizeRoles('SUPER_ADMIN', 'PRIMARY_DAIRY_ADMIN', 'DAIRY_OWNER'), async (req, res, next) => {
    try {
        const orgId = req.user?.organizationId;
        if (!orgId) {
            throw new ForbiddenError('Authenticated organization context is required');
        }
        const tenantDb = await tenantDbManager.getStrictTenantDb(orgId);
        const deviceId = req.params['deviceId'];
        const maxHours = parseInt(req.body['maxOfflineHours'] || '72', 10);
        await tenantDb.query(`UPDATE devices
         SET offline_auth_policy_approved = true,
             approved_max_offline_hours = $1,
             offline_policy_approved_by = $2,
             offline_policy_approved_at = NOW()
         WHERE id = $3 AND organization_id = $4;`, [maxHours, req.user.userId, deviceId, orgId]);
        ApiResponse.success(res, { deviceId, offlinePolicyApproved: true, maxOfflineHours: maxHours });
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /api/v1/sync/conflicts
 * List sync conflicts.
 */
syncRouter.get('/conflicts', authenticatePresentation, authorizePermission('devices:manage', 'collections:view_all', 'sessions:audit', 'dairy:manage_config'), async (req, res, next) => {
    try {
        const orgId = req.user?.organizationId;
        if (!orgId) {
            throw new ForbiddenError('Authenticated organization context is required');
        }
        const tenantDb = await tenantDbManager.getStrictTenantDb(orgId);
        const resData = await tenantDb.query(`SELECT scr.*, d.device_identifier, d.device_type, dc.name as center_name
         FROM sync_conflict_records scr
         JOIN devices d ON d.id = scr.device_id
         JOIN dairy_centers dc ON dc.id = d.center_id
         WHERE d.organization_id = $1
         ORDER BY scr.recorded_at DESC LIMIT 100;`, [orgId]);
        ApiResponse.success(res, resData.rows);
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /api/v1/sync/events
 * List audit synchronization events.
 */
syncRouter.get('/events', authenticatePresentation, authorizePermission('devices:manage', 'collections:view_all', 'sessions:audit', 'dairy:manage_config'), async (req, res, next) => {
    try {
        const orgId = req.user?.organizationId;
        if (!orgId) {
            throw new ForbiddenError('Authenticated organization context is required');
        }
        const tenantDb = await tenantDbManager.getStrictTenantDb(orgId);
        const resData = await tenantDb.query(`SELECT se.*, dc.name as center_name
         FROM sync_events se
         LEFT JOIN dairy_centers dc ON dc.id = se.center_id
         WHERE se.organization_id = $1
         ORDER BY se.event_sequence DESC LIMIT 100;`, [orgId]);
        ApiResponse.success(res, resData.rows);
    }
    catch (err) {
        next(err);
    }
});
//# sourceMappingURL=sync.routes.js.map