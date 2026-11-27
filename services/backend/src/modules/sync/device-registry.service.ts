import { DeviceRegisterSchema, DeviceRevokeSchema } from '@dfarm/shared-validation';
import { tenantDbManager } from '../../infrastructure/database/TenantDatabaseManager.js';
import { createDeviceToken } from '../../security.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors/app-error.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DeviceAdminActor {
  userId: string;
  role: string;
  organizationId?: string;
  centerIds?: string[];
}

export class DeviceRegistryService {
  private static resolveAuthoritativeOrganizationId(
    actor: DeviceAdminActor,
    requestedOrgId?: string
  ): string {
    const role = String(actor.role || '').trim().toUpperCase();
    const actorOrg = typeof actor.organizationId === 'string' ? actor.organizationId.trim() : '';
    const cleanRequested = typeof requestedOrgId === 'string' ? requestedOrgId.trim() : '';

    if (role === 'SUPER_ADMIN') {
      const targetOrg = cleanRequested || actorOrg;
      if (!targetOrg || !UUID_REGEX.test(targetOrg)) {
        throw new ValidationError('Valid target organizationId is required for device operation');
      }
      return targetOrg;
    }

    if (!actorOrg || !UUID_REGEX.test(actorOrg)) {
      throw new ForbiddenError('Authenticated organization context is required for device operations', 'MISSING_ORGANIZATION_ID');
    }

    if (cleanRequested && cleanRequested.toLowerCase() !== actorOrg.toLowerCase()) {
      throw new ForbiddenError(
        'Cross-tenant device operation denied: client-supplied organizationId cannot override authenticated organization.',
        'CROSS_TENANT_ACCESS_DENIED'
      );
    }

    return actorOrg;
  }

  private static async resolveAuditUserId(
    client: { query: (text: string, params?: any[]) => Promise<{ rows: any[] }> },
    actorUserId: string
  ): Promise<string | null> {
    if (!actorUserId || !UUID_REGEX.test(actorUserId)) {
      return null;
    }
    const res = await client.query(`SELECT id FROM users WHERE id = $1 LIMIT 1;`, [actorUserId]);
    return res.rows.length > 0 ? res.rows[0].id : null;
  }

  public static async registerDevice(params: {
    actor: DeviceAdminActor;
    body: unknown;
    headerOrgId?: string;
  }) {
    const parseResult = DeviceRegisterSchema.safeParse(params.body);
    if (!parseResult.success) {
      throw new ValidationError(`Validation failed: ${JSON.stringify(parseResult.error.format())}`);
    }

    const { centerId, deviceIdentifier, deviceType, publicKey, appVersion, organizationId: bodyOrgId } = parseResult.data;
    const cleanDeviceIdentifier = deviceIdentifier.trim();
    const requestedOrgId = bodyOrgId || params.headerOrgId;

    const organizationId = this.resolveAuthoritativeOrganizationId(params.actor, requestedOrgId);
    if (bodyOrgId && params.headerOrgId && bodyOrgId.trim().toLowerCase() !== params.headerOrgId.trim().toLowerCase()) {
      throw new ForbiddenError(
        'Conflicting organizationId values in request body and headers.',
        'CROSS_TENANT_ACCESS_DENIED'
      );
    }

    const actorRole = String(params.actor.role || '').trim().toUpperCase();
    if (
      actorRole === 'CENTER_MANAGER' &&
      Array.isArray(params.actor.centerIds) &&
      params.actor.centerIds.length > 0 &&
      !params.actor.centerIds.includes(centerId)
    ) {
      throw new ForbiddenError(
        `Actor does not have assigned access to center '${centerId}'`,
        'CENTER_ACCESS_DENIED'
      );
    }

    const tenantDb = await tenantDbManager.getStrictTenantDb(organizationId);

    return await tenantDb.withTransaction(async (client) => {
      // 1. Validate organization exists and is ACTIVE in tenant DB
      const orgRes = await client.query(
        `SELECT id, status FROM organizations WHERE id = $1 LIMIT 1;`,
        [organizationId]
      );
      if (orgRes.rows.length === 0) {
        throw new NotFoundError(`Organization ${organizationId} does not exist in tenant database`);
      }
      if (String(orgRes.rows[0].status || '').toUpperCase() !== 'ACTIVE') {
        throw new ForbiddenError(`Organization ${organizationId} is not active`, 'ORGANIZATION_INACTIVE');
      }

      // 2. Verify center belongs to the same organization and is ACTIVE
      const centerRes = await client.query(
        `SELECT id, organization_id, status FROM dairy_centers WHERE id = $1 AND organization_id = $2 LIMIT 1;`,
        [centerId, organizationId]
      );
      if (centerRes.rows.length === 0) {
        throw new NotFoundError('Center does not exist or does not belong to specified organization');
      }
      if (String(centerRes.rows[0].status || '').toUpperCase() !== 'ACTIVE') {
        throw new ForbiddenError('Cannot register device on an inactive collection center', 'INACTIVE_CENTER');
      }

      // 3. Query center offline policy settings
      let offlinePolicyApproved = false;
      let maxOfflineHours = 72;
      let policyStatus = 'PENDING_OWNER_APPROVAL';
      try {
        const csRes = await client.query(
          `SELECT offline_sync_max_disconnection_hours, offline_auth_policy_approved, approved_max_offline_hours, limits_status
           FROM center_settings WHERE center_id = $1 LIMIT 1;`,
          [centerId]
        );
        if (csRes.rows.length > 0) {
          const cs = csRes.rows[0];
          offlinePolicyApproved = Boolean(cs.offline_auth_policy_approved);
          maxOfflineHours = Number(cs.approved_max_offline_hours || cs.offline_sync_max_disconnection_hours || 72);
          policyStatus = cs.limits_status || (offlinePolicyApproved ? 'APPROVED' : 'PENDING_OWNER_APPROVAL');
        }
      } catch (err: any) {
        const isPgMemMissing = Boolean((client as any)?.__isPgMem && !err?.code);
        // Only ignore missing optional center_settings columns on stripped test doubles
        if (err?.code !== '42703' && err?.code !== '42P01' && !isPgMemMissing) {
          throw err;
        }
      }

      // 4. Check existing device by device_identifier inside tenant DB
      const existingDev = await client.query(
        `SELECT id, organization_id, center_id, status, is_blocked, revoked_at, max_offline_hours
         FROM devices
         WHERE device_identifier = $1
         LIMIT 1;`,
        [cleanDeviceIdentifier]
      );

      let deviceId: string;
      let isReRegistration = false;

      if (existingDev.rows.length > 0) {
        const dev = existingDev.rows[0];
        if (String(dev.organization_id || '').toLowerCase() !== organizationId.toLowerCase()) {
          throw new ForbiddenError(
            `Device identifier '${cleanDeviceIdentifier}' belongs to a different organization.`,
            'DEVICE_IDENTIFIER_CONFLICT'
          );
        }
        if (
          dev.status === 'BLOCKED' ||
          dev.status === 'DECOMMISSIONED' ||
          dev.status === 'REVOKED' ||
          dev.is_blocked === true ||
          dev.revoked_at !== null
        ) {
          throw new ForbiddenError(
            `Device ${cleanDeviceIdentifier} is ${dev.status === 'ACTIVE' ? 'REVOKED' : dev.status}. Re-registration is blocked.`,
            'DEVICE_REVOKED'
          );
        }

        isReRegistration = true;
        deviceId = dev.id;
        maxOfflineHours = Number(dev.max_offline_hours || maxOfflineHours);

        await client.query(
          `UPDATE devices
           SET center_id = $1,
               device_type = $2,
               public_key = COALESCE($3, public_key),
               last_seen_at = NOW()
           WHERE id = $4 AND organization_id = $5;`,
          [centerId, deviceType, publicKey || null, deviceId, organizationId]
        );
      } else {
        const insertRes = await client.query(
          `INSERT INTO devices (
             organization_id, center_id, device_identifier, device_type, public_key,
             status, is_blocked, last_seen_at, max_offline_hours, offline_auth_policy_approved
           ) VALUES ($1, $2, $3, $4, $5, 'ACTIVE', FALSE, NOW(), $6, $7)
           RETURNING id, max_offline_hours;`,
          [organizationId, centerId, cleanDeviceIdentifier, deviceType, publicKey || null, maxOfflineHours, offlinePolicyApproved]
        );
        deviceId = insertRes.rows[0].id;
        maxOfflineHours = Number(insertRes.rows[0].max_offline_hours || maxOfflineHours);
      }

      // 5. Initialize device_sync_state atomically
      await client.query(
        `INSERT INTO device_sync_state (
           device_id, downstream_cursor, downstream_tombstone_cursor, client_app_version, updated_at
         ) VALUES ($1, 0, 0, $2, NOW())
         ON CONFLICT (device_id) DO UPDATE SET
           client_app_version = COALESCE(EXCLUDED.client_app_version, device_sync_state.client_app_version),
           updated_at = NOW();`,
        [deviceId, appVersion || '1.0.0']
      );

      // 6. Generate signed device token bound to device + organization + center + identifier
      const { token, hashedToken } = createDeviceToken({
        sub: deviceId,
        organizationId,
        centerId,
        deviceIdentifier: cleanDeviceIdentifier,
        deviceType: String(deviceType),
      });

      // 7. Store ONLY token hash
      await client.query(
        `UPDATE devices SET device_token_hash = $1 WHERE id = $2 AND organization_id = $3;`,
        [hashedToken, deviceId, organizationId]
      );

      // 8. Record audit log atomically
      const auditUserId = await this.resolveAuditUserId(client, params.actor.userId);
      await client.query(
        `INSERT INTO audit_logs (
           organization_id, center_id, user_id, action, entity_type, entity_id, new_values
         ) VALUES ($1, $2, $3, $4, 'DEVICE', $5, $6);`,
        [
          organizationId,
          centerId,
          auditUserId,
          isReRegistration ? 'DEVICE_REAUTHORIZED' : 'DEVICE_REGISTERED',
          deviceId,
          JSON.stringify({
            deviceIdentifier: cleanDeviceIdentifier,
            deviceType,
            centerId,
            actorUserId: params.actor.userId,
            actorRole,
          }),
        ]
      );

      return {
        deviceId,
        deviceIdentifier: cleanDeviceIdentifier,
        organizationId,
        centerId,
        deviceType,
        status: 'ACTIVE',
        token,
        maxOfflineHours,
        offlinePolicyApproved,
        offlinePolicyStatus: policyStatus,
        registeredAt: new Date().toISOString(),
      };
    });
  }

  public static async revokeDevice(params: {
    actor: DeviceAdminActor;
    body: unknown;
    headerOrgId?: string;
  }) {
    const parseResult = DeviceRevokeSchema.safeParse(params.body);
    if (!parseResult.success) {
      throw new ValidationError(`Validation failed: ${JSON.stringify(parseResult.error.format())}`);
    }

    const { deviceId, deviceIdentifier, reason } = parseResult.data;
    const rawBody = (params.body && typeof params.body === 'object' ? params.body : {}) as Record<string, unknown>;
    const bodyOrgId = typeof rawBody['organizationId'] === 'string'
      ? rawBody['organizationId']
      : (typeof rawBody['dairyId'] === 'string' ? rawBody['dairyId'] : undefined);

    if (!deviceId && !deviceIdentifier) {
      throw new ValidationError('Either deviceId or deviceIdentifier must be provided');
    }

    const organizationId = this.resolveAuthoritativeOrganizationId(params.actor, bodyOrgId || params.headerOrgId);
    const tenantDb = await tenantDbManager.getStrictTenantDb(organizationId);

    return await tenantDb.withTransaction(async (client) => {
      const lookupSql = deviceId
        ? `SELECT id, organization_id, center_id, device_identifier, status, is_blocked, revoked_at
           FROM devices
           WHERE id = $1 AND organization_id = $2
           LIMIT 1;`
        : `SELECT id, organization_id, center_id, device_identifier, status, is_blocked, revoked_at
           FROM devices
           WHERE device_identifier = $1 AND organization_id = $2
           LIMIT 1;`;

      const lookupParam = deviceId ? deviceId.trim() : deviceIdentifier!.trim();
      const devRes = await client.query(lookupSql, [lookupParam, organizationId]);

      if (devRes.rows.length === 0) {
        throw new NotFoundError(
          deviceId
            ? `Device with ID ${deviceId} not found in organization`
            : `Device with identifier ${deviceIdentifier} not found in organization`
        );
      }

      const dev = devRes.rows[0];
      if (deviceId && deviceIdentifier && dev.device_identifier !== deviceIdentifier.trim()) {
        throw new ValidationError('Provided deviceId and deviceIdentifier do not refer to the same device');
      }

      const updateRes = await client.query(
        `UPDATE devices
         SET status = 'BLOCKED',
             is_blocked = TRUE,
             revoked_at = COALESCE(revoked_at, NOW()),
             revocation_reason = $3,
             public_key = NULL,
             device_token_hash = NULL
         WHERE id = $1 AND organization_id = $2
         RETURNING id, device_identifier, center_id, status, revoked_at;`,
        [dev.id, organizationId, reason]
      );

      const updated = updateRes.rows[0];
      const revokedAtIso = updated.revoked_at?.toISOString?.() || new Date().toISOString();
      const auditUserId = await this.resolveAuditUserId(client, params.actor.userId);

      await client.query(
        `INSERT INTO audit_logs (
           organization_id, center_id, user_id, action, entity_type, entity_id, old_values, new_values
         ) VALUES ($1, $2, $3, 'DEVICE_REVOKED', 'DEVICE', $4, $5, $6);`,
        [
          organizationId,
          updated.center_id,
          auditUserId,
          updated.id,
          JSON.stringify({ status: dev.status, isBlocked: Boolean(dev.is_blocked), revokedAt: dev.revoked_at }),
          JSON.stringify({
            status: 'BLOCKED',
            isBlocked: true,
            revokedAt: revokedAtIso,
            reason,
            revokedBy: params.actor.userId,
          }),
        ]
      );

      return {
        deviceId: updated.id,
        deviceIdentifier: updated.device_identifier,
        organizationId,
        status: 'BLOCKED',
        reason,
        revokedAt: revokedAtIso,
      };
    });
  }
}
