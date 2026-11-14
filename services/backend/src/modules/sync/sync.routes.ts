import { Router, Request, Response, NextFunction } from 'express';
import { SyncService } from './sync.service.js';
import { ApiResponse } from '../../shared/response/api-response.js';
import { authenticate, authenticateDevice } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/authorize.js';
import { UserRole } from '@dfarm/shared-types';
import { ValidationError, NotFoundError, ForbiddenError } from '../../shared/errors/app-error.js';
import { DeviceRegisterSchema, DeviceRevokeSchema, SyncAcknowledgeSchema } from '@dfarm/shared-validation';
import { pool } from '../../config/db.js';
import { createDeviceToken } from '../../security.js';

export const syncRouter = Router();

/**
 * POST /api/v1/sync/push
 * Batch upload offline collection events, customer registrations, and audit logs.
 */
syncRouter.post('/push', authenticateDevice, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const deviceId = req.deviceId || req.body.deviceId;
    if (!deviceId) {
      throw new ValidationError('Device ID is required');
    }
    const result = await SyncService.pushEvents({
      ...req.body,
      deviceId,
    });
    ApiResponse.success(res, result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/sync/pull
 * Downstream incremental synchronization of customers, rate cards, and encrypted face templates.
 */
syncRouter.get('/pull', authenticateDevice, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const deviceId = req.deviceId || (req.query['deviceId'] as string);
    if (!deviceId) {
      throw new ValidationError('Device identification required');
    }

    const cursor = req.query['cursor'] ? parseInt(req.query['cursor'] as string, 10) : 0;
    const tombstoneCursor = req.query['tombstoneCursor']
      ? parseInt(req.query['tombstoneCursor'] as string, 10)
      : 0;
    const centerId = req.query['centerId'] as string | undefined;

    const result = await SyncService.pullChanges(deviceId, cursor, tombstoneCursor, centerId);
    ApiResponse.success(res, result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/sync/acknowledge
 * Acknowledge receipt and advance downstream sync cursor.
 */
syncRouter.post('/acknowledge', authenticateDevice, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const deviceId = req.deviceId || (req.body['deviceId'] as string);
    if (!deviceId) {
      throw new ValidationError('Device identification required');
    }

    const parseResult = SyncAcknowledgeSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError(`Validation failed: ${JSON.stringify(parseResult.error.format())}`);
    }

    const { downstreamCursor, downstreamTombstoneCursor, clientAppVersion, cursor } = parseResult.data;
    const finalDownstreamCursor = downstreamCursor ?? cursor ?? 0;
    const finalTombstoneCursor = downstreamTombstoneCursor ?? 0;
    const result = await SyncService.acknowledge(deviceId, finalDownstreamCursor, finalTombstoneCursor, clientAppVersion);
    ApiResponse.success(res, result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/sync/status
 * Query device synchronization status, health, and timestamps.
 */
syncRouter.get('/status', authenticateDevice, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const deviceId = req.deviceId || (req.query['deviceId'] as string);
    if (!deviceId) {
      throw new ValidationError('Device identification required');
    }

    const result = await SyncService.getStatus(deviceId);
    ApiResponse.success(res, result);
  } catch (err) {
    next(err);
  }
});

// Device Registration & Revocation Router
export const deviceRouter = Router();

/**
 * POST /api/v1/devices/register
 * Provision and authorize a counter terminal or registration tablet.
 * Requires authenticated administrative actor (SUPER_ADMIN, DAIRY_OWNER, or CENTER_MANAGER).
 */
deviceRouter.post(
  '/register',
  authenticate,
  requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parseResult = DeviceRegisterSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError(`Validation failed: ${JSON.stringify(parseResult.error.format())}`);
    }

    const { centerId, deviceIdentifier, deviceType, publicKey, appVersion } = parseResult.data;
    let organizationId = parseResult.data.organizationId;
    if (!organizationId) {
      const orgRes = await pool.query('SELECT organization_id FROM dairy_centers WHERE id = $1;', [centerId]);
      if (orgRes.rows.length === 0) {
        throw new NotFoundError('Center does not exist');
      }
      organizationId = orgRes.rows[0].organization_id;
    }

    // Verify center belongs to organization
    const centerRes = await pool.query(
      'SELECT id FROM dairy_centers WHERE id = $1 AND organization_id = $2;',
      [centerId, organizationId]
    );
    if (centerRes.rows.length === 0) {
      throw new NotFoundError('Center does not exist or does not belong to specified organization');
    }

    // Query center offline policy settings
    const csRes = await pool.query(
      'SELECT offline_sync_max_disconnection_hours, offline_auth_policy_approved, approved_max_offline_hours, limits_status FROM center_settings WHERE center_id = $1;',
      [centerId]
    );
    let offlinePolicyApproved = false;
    let maxOfflineHours = 72;
    let policyStatus = 'PENDING_OWNER_APPROVAL';
    if (csRes.rows.length > 0) {
      const cs = csRes.rows[0];
      offlinePolicyApproved = Boolean(cs.offline_auth_policy_approved);
      maxOfflineHours = cs.approved_max_offline_hours || cs.offline_sync_max_disconnection_hours || 72;
      policyStatus = cs.limits_status || (offlinePolicyApproved ? 'APPROVED' : 'PENDING_OWNER_APPROVAL');
    }

    const existingDev = await pool.query(
      'SELECT id, status, max_offline_hours FROM devices WHERE device_identifier = $1;',
      [deviceIdentifier]
    );

    let deviceId: string;

    if (existingDev.rows.length > 0) {
      const dev = existingDev.rows[0];
      if (dev.status === 'BLOCKED' || dev.status === 'DECOMMISSIONED') {
        throw new ForbiddenError(`Device ${deviceIdentifier} is ${dev.status}. Re-registration is blocked.`);
      }
      deviceId = dev.id;
      maxOfflineHours = dev.max_offline_hours || maxOfflineHours;

      await pool.query(
        'UPDATE devices SET center_id = $1, public_key = COALESCE($2, public_key), last_seen_at = NOW() WHERE id = $3;',
        [centerId, publicKey || null, deviceId]
      );
    } else {
      const insertRes = await pool.query(
        `INSERT INTO devices (
           organization_id, center_id, device_identifier, device_type, public_key, status, last_seen_at, max_offline_hours, offline_auth_policy_approved
         ) VALUES ($1, $2, $3, $4, $5, 'ACTIVE', NOW(), $6, $7) RETURNING id, max_offline_hours;`,
        [organizationId, centerId, deviceIdentifier, deviceType, publicKey || null, maxOfflineHours, offlinePolicyApproved]
      );
      deviceId = insertRes.rows[0].id;
      maxOfflineHours = insertRes.rows[0].max_offline_hours || maxOfflineHours;

      await pool.query(
        `INSERT INTO device_sync_state (
           device_id, downstream_cursor, downstream_tombstone_cursor, client_app_version, updated_at
         ) VALUES ($1, 0, 0, $2, NOW()) ON CONFLICT (device_id) DO NOTHING;`,
        [deviceId, appVersion || '1.0.0']
      );
    }

    const { token, hashedToken } = createDeviceToken({
      sub: deviceId,
      organizationId,
      centerId,
      deviceIdentifier,
      deviceType: String(deviceType),
    });

    const tokenHash = hashedToken;
    await pool.query('UPDATE devices SET device_token_hash = $1 WHERE id = $2;', [tokenHash, deviceId]);

    ApiResponse.success(
      res,
      {
        deviceId,
        deviceIdentifier,
        organizationId,
        centerId,
        deviceType,
        status: 'ACTIVE',
        token,
        maxOfflineHours,
        offlinePolicyApproved,
        offlinePolicyStatus: policyStatus,
        registeredAt: new Date().toISOString(),
      },
      200
    );
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/devices/revoke
 * Administratively block or revoke a lost or compromised device.
 * Requires authenticated administrative actor (SUPER_ADMIN, DAIRY_OWNER, or CENTER_MANAGER).
 */
deviceRouter.post(
  '/revoke',
  authenticate,
  requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parseResult = DeviceRevokeSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError(`Validation failed: ${JSON.stringify(parseResult.error.format())}`);
    }

    const { deviceId, deviceIdentifier, reason } = parseResult.data;

    let targetDeviceId = deviceId;
    if (!targetDeviceId && deviceIdentifier) {
      const d = await pool.query('SELECT id FROM devices WHERE device_identifier = $1;', [deviceIdentifier]);
      if (d.rows.length === 0) {
        throw new NotFoundError(`Device with identifier ${deviceIdentifier} not found`);
      }
      targetDeviceId = d.rows[0].id;
    }
    if (!targetDeviceId) {
      throw new ValidationError('Either deviceId or deviceIdentifier must be provided');
    }

    const devRes = await pool.query('SELECT id, device_identifier, status, organization_id FROM devices WHERE id = $1;', [targetDeviceId]);
    if (devRes.rows.length === 0) {
      throw new NotFoundError(`Device with ID ${targetDeviceId} not found`);
    }

    const dev = devRes.rows[0];

    await pool.query(
      `UPDATE devices SET status = 'BLOCKED', public_key = NULL, device_token_hash = NULL WHERE id = $1;`,
      [targetDeviceId]
    );

    await pool.query(
      `INSERT INTO audit_logs (
         organization_id, action, entity_type, entity_id, old_values, new_values
       ) VALUES ($1, 'DEVICE_REVOKED', 'DEVICE', $2, $3, $4);`,
      [
        dev.organization_id,
        targetDeviceId,
        JSON.stringify({ status: dev.status }),
        JSON.stringify({ status: 'BLOCKED', reason }),
      ]
    );

    ApiResponse.success(res, {
      deviceId: targetDeviceId,
      status: 'BLOCKED',
      reason,
      revokedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/devices
 * List devices with center metadata and sync state. Never exposes private keys or biometrics.
 */
deviceRouter.get(
  '/',
  authenticate,
  requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER, UserRole.SUPERVISOR]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = req.auth!.organizationId;
      const centerId = req.query['centerId'] as string | undefined;
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
      const params: any[] = [orgId];
      if (centerId) {
        params.push(centerId);
        q += ` AND d.center_id = $${params.length}`;
      }
      q += ' ORDER BY d.created_at DESC;';
      const result = await pool.query(q, params);
      ApiResponse.success(res, result.rows);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/devices/:deviceId/approve-offline
 * Approve offline authorization policy for device.
 */
deviceRouter.post(
  '/:deviceId/approve-offline',
  authenticate,
  requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const deviceId = req.params['deviceId'];
      const maxHours = parseInt(req.body['maxOfflineHours'] || '72', 10);
      await pool.query(
        `UPDATE devices
         SET offline_auth_policy_approved = true,
             approved_max_offline_hours = $1,
             offline_policy_approved_by = $2,
             offline_policy_approved_at = NOW()
         WHERE id = $3;`,
        [maxHours, req.auth!.userId, deviceId]
      );
      ApiResponse.success(res, { deviceId, offlinePolicyApproved: true, maxOfflineHours: maxHours });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/sync/conflicts
 * List sync conflicts.
 */
syncRouter.get(
  '/conflicts',
  authenticate,
  requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER, UserRole.SUPERVISOR]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = req.auth!.organizationId;
      const resData = await pool.query(
        `SELECT scr.*, d.device_identifier, d.device_type, dc.name as center_name
         FROM sync_conflict_records scr
         JOIN devices d ON d.id = scr.device_id
         JOIN dairy_centers dc ON dc.id = d.center_id
         WHERE d.organization_id = $1
         ORDER BY scr.recorded_at DESC LIMIT 100;`,
        [orgId]
      );
      ApiResponse.success(res, resData.rows);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/sync/events
 * List audit synchronization events.
 */
syncRouter.get(
  '/events',
  authenticate,
  requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = req.auth!.organizationId;
      const resData = await pool.query(
        `SELECT se.*, dc.name as center_name
         FROM sync_events se
         LEFT JOIN dairy_centers dc ON dc.id = se.center_id
         WHERE se.organization_id = $1
         ORDER BY se.event_sequence DESC LIMIT 100;`,
        [orgId]
      );
      ApiResponse.success(res, resData.rows);
    } catch (err) {
      next(err);
    }
  }
);
