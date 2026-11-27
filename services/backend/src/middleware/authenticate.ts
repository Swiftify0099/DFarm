import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { UserRole } from '@dfarm/shared-types';
import { getAdminSupabaseClient, createUserSupabaseClient } from '../config/supabase.js';
import { UnauthorizedError, ForbiddenError } from '../shared/errors/app-error.js';
import { verifyJwt } from '../jwt.js';
import { hashToken, verifyDeviceToken } from '../security.js';
import { tokenRevocationService } from '../infrastructure/security/TokenRevocationService.js';
import { accountAuthorityService } from '../infrastructure/security/AccountAuthorityService.js';
import { tenantDbManager, TenantDatabaseUnavailableError } from '../infrastructure/database/TenantDatabaseManager.js';

export interface AuthContext {
  authUser: {
    id: string;
    email?: string;
    phone?: string;
    user_metadata?: Record<string, any>;
  };
  actorType: 'STAFF' | 'CUSTOMER';
  userId: string; // internal UUID
  organizationId: string;
  role: UserRole;
  centerIds: string[]; // authorized centers
  primaryCenterId?: string;
  centerId?: string;
  customerProfile?: {
    customerId: string;
    farmerCode: string;
  };
  token: string;
  userSupabaseClient: SupabaseClient;
}

export interface DeviceAuthContext {
  deviceId: string;
  organizationId: string;
  centerId: string;
  deviceIdentifier: string;
  deviceType?: string;
  tokenHash: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      deviceId?: string;
      device?: DeviceAuthContext;
    }
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    // 1. Read the Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedError('Missing Authorization header. Expected Bearer token format.', 'UNAUTHORIZED');
    }

    // 2. Require Bearer token format
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match || !match[1]) {
      throw new UnauthorizedError('Invalid Authorization header format. Must be Bearer <token>', 'UNAUTHORIZED');
    }

    const token = match[1].trim();
    if (!token) {
      throw new UnauthorizedError('Empty Bearer token provided', 'UNAUTHORIZED');
    }

    // 3. Validate token: check local JWT / UUID signature first, fallback to Supabase Auth
    const adminClient = getAdminSupabaseClient();
    let authUser: { id: string; email?: string; phone?: string } | null = null;
    let decodedToken: Record<string, unknown> | null = null;

    try {
      const decoded = verifyJwt(token);
      decodedToken = decoded as unknown as Record<string, unknown>;
      const idClaim = (decoded.sub || decoded['userId'] || decoded['id']) as string | undefined;
      if (idClaim) {
        authUser = {
          id: idClaim,
          email: typeof decoded['email'] === 'string' ? decoded['email'] : undefined,
          phone: typeof decoded['phone'] === 'string' ? decoded['phone'] : undefined,
        };
      }
    } catch {
      // Local JWT verification failed, fall back to Supabase Auth
    }

    if (decodedToken) {
      if (decodedToken['tokenType'] === 'refresh') {
        throw new UnauthorizedError('Refresh tokens cannot be used as access tokens', 'INVALID_TOKEN_TYPE');
      }
      if (await tokenRevocationService.isRevoked(token, decodedToken['jti'] as string | undefined)) {
        throw new UnauthorizedError('Authentication token has been revoked', 'TOKEN_REVOKED');
      }
    } else if (await tokenRevocationService.isRevoked(token)) {
      throw new UnauthorizedError('Authentication token has been revoked', 'TOKEN_REVOKED');
    }

    if (!authUser) {
      try {
        const { data, error } = await Promise.race([
          adminClient.auth.getUser(token),
          new Promise<{ data: null; error: Error }>((_, reject) =>
            setTimeout(() => reject(new Error('Supabase auth timeout')), 1000)
          ),
        ]);
        if (!error && data?.user) {
          authUser = {
            id: data.user.id,
            email: data.user.email,
            phone: data.user.phone,
          };
        }
      } catch {
        // Fallback exhausted
      }
    }

    if (!authUser) {
      throw new UnauthorizedError(
        'Authentication token is invalid or has expired',
        'INVALID_TOKEN'
      );
    }

    // 4. Resolve internal application identity via shared AccountAuthorityService (fail closed on DB outage; never trust JWT claims without DB verification)
    const claimedOrgId =
      typeof decodedToken?.['organizationId'] === 'string' && decodedToken['organizationId']
        ? String(decodedToken['organizationId'])
        : undefined;
    const staffAuthority = await accountAuthorityService.verifyStaff({
      userId: authUser.id,
      claimedOrganizationId: claimedOrgId,
      loadCenterAssignments: true,
    });

    if (staffAuthority) {
      req.auth = {
        authUser: {
          id: authUser.id,
          email: authUser.email,
          phone: authUser.phone,
        },
        actorType: 'STAFF',
        userId: staffAuthority.userId,
        organizationId: staffAuthority.organizationId,
        role: staffAuthority.role as UserRole,
        centerIds: staffAuthority.centerIds,
        primaryCenterId: staffAuthority.primaryCenterId,
        centerId: staffAuthority.primaryCenterId || staffAuthority.centerIds[0],
        token,
        userSupabaseClient: createUserSupabaseClient(token),
      };

      return next();
    }

    // Check 2: Customer Identity via shared AccountAuthorityService (strict ACTIVE required for modules/* routes)
    const customerAuthority = await accountAuthorityService.verifyCustomer({
      userId: authUser.id,
      claimedRole: typeof decodedToken?.['role'] === 'string' ? decodedToken['role'] : undefined,
      organizationId: claimedOrgId,
      globalCustomerId:
        typeof decodedToken?.['globalCustomerId'] === 'string'
          ? decodedToken['globalCustomerId']
          : undefined,
      allowGuestFarmer: false,
      strictActiveOnly: true,
    });

    if (customerAuthority) {
      req.auth = {
        authUser: {
          id: authUser.id,
          email: authUser.email,
          phone: authUser.phone,
        },
        actorType: 'CUSTOMER',
        userId: customerAuthority.userId,
        organizationId: customerAuthority.organizationId || '',
        role: UserRole.FARMER_CUSTOMER,
        centerIds: customerAuthority.centerId ? [customerAuthority.centerId] : [],
        primaryCenterId: customerAuthority.centerId,
        customerProfile: {
          customerId: customerAuthority.userId,
          farmerCode: customerAuthority.farmerCode || '',
        },
        token,
        userSupabaseClient: createUserSupabaseClient(token),
      };

      return next();
    }

    // 5. If neither found, unmapped identity is strictly rejected
    throw new ForbiddenError(
      'User identity is not mapped to an internal application user or registered customer',
      'UNMAPPED_IDENTITY'
    );
  } catch (err) {
    next(err);
  }
}

function timingSafeHashEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function authenticateDevice(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    // 1. Extract device token strictly from Authorization: Bearer or X-Device-Token header.
    // X-Device-ID, req.body.deviceId, and req.query.deviceId must NEVER authenticate a device.
    let token: string | undefined;
    const authHeader = req.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.trim().length > 0) {
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      if (!match || !match[1] || !match[1].trim()) {
        throw new UnauthorizedError(
          'Invalid Authorization header format. Expected Bearer <device-token>.',
          'UNAUTHORIZED_DEVICE'
        );
      }
      token = match[1].trim();
    } else if (typeof req.headers['x-device-token'] === 'string' && req.headers['x-device-token'].trim().length > 0) {
      token = req.headers['x-device-token'].trim();
    }

    if (!token) {
      throw new UnauthorizedError(
        'Device authentication token required via Authorization Bearer or X-Device-Token header.',
        'UNAUTHORIZED_DEVICE'
      );
    }

    // 2. Cryptographically verify signature, expiry, type='device', and required tenant/device claims
    const decoded = verifyDeviceToken(token);
    const presentedTokenHash = hashToken(token);
    const authoritativeOrgId = decoded.organizationId;

    // 3. Reject any cross-tenant header/body/query hints contradicting verified token organizationId
    const requestedOrgHints = [
      req.headers['x-dairy-tenant-id'],
      req.headers['x-organization-id'],
      req.headers['x-dairy-id'],
      req.body?.organizationId,
      req.body?.dairyId,
      req.query?.['organizationId'],
      req.query?.['dairyId'],
    ]
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .map((v) => v.trim().toLowerCase());

    for (const hintOrg of requestedOrgHints) {
      if (hintOrg !== authoritativeOrgId.toLowerCase()) {
        throw new ForbiddenError(
          'Cross-tenant device operation denied: Organization mismatch.',
          'CROSS_TENANT_ACCESS_DENIED'
        );
      }
    }

    // 4. Optional consistency hint check for X-Device-ID / body.deviceId / query.deviceId (never used for auth)
    const deviceHints = [
      req.headers['x-device-id'],
      req.body?.deviceId,
      req.query?.['deviceId'],
    ]
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .map((v) => v.trim());

    for (const hintDev of deviceHints) {
      const matchesUuid = hintDev.toLowerCase() === decoded.sub.toLowerCase();
      const matchesIdentifier = hintDev === decoded.deviceIdentifier;
      if (!matchesUuid && !matchesIdentifier) {
        throw new ForbiddenError(
          'Device identity hint does not match verified device token.',
          'DEVICE_IDENTITY_MISMATCH'
        );
      }
    }

    const centerHints = [req.body?.centerId, req.query?.['centerId']]
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .map((v) => v.trim().toLowerCase());

    for (const hintCenter of centerHints) {
      if (hintCenter !== decoded.centerId.toLowerCase()) {
        throw new ForbiddenError(
          'Cross-center device operation denied: Center mismatch.',
          'DEVICE_CENTER_MISMATCH'
        );
      }
    }

    // 5. Resolve exact tenant DB strictly from verified organizationId (never scan tenants or fallback to central pool)
    const tenantDb = await tenantDbManager.getStrictTenantDb(authoritativeOrgId);

    let devRes;
    try {
      devRes = await tenantDb.query(
        `SELECT id, organization_id, center_id, device_identifier, device_type, status,
                is_blocked, revoked_at, public_key, device_token_hash,
                max_offline_hours, offline_auth_policy_approved, approved_max_offline_hours, last_seen_at
         FROM devices
         WHERE id = $1 AND organization_id = $2
         LIMIT 1;`,
        [decoded.sub, authoritativeOrgId]
      );
    } catch (err: any) {
      if (err instanceof TenantDatabaseUnavailableError) {
        throw err;
      }
      throw new TenantDatabaseUnavailableError(
        authoritativeOrgId,
        'DEVICE_LOOKUP_FAILED',
        err?.message || 'Tenant database device lookup failed'
      );
    }

    if (devRes.rows.length === 0) {
      throw new UnauthorizedError(
        `Device ${decoded.sub} is not registered in organization ${authoritativeOrgId}`,
        'DEVICE_NOT_FOUND'
      );
    }

    const device = devRes.rows[0];

    // 6. Permanent revocation check (replay of unexpired JWT cannot restore access)
    if (
      device.status === 'REVOKED' ||
      device.status === 'DECOMMISSIONED' ||
      device.revoked_at !== null
    ) {
      throw new ForbiddenError(
        `Device ${device.device_identifier} credentials have been permanently revoked. Access denied.`,
        'DEVICE_REVOKED'
      );
    }

    // 7. Administrative block check
    if (device.status === 'BLOCKED' || device.is_blocked === true) {
      throw new ForbiddenError(
        `Device ${device.device_identifier} is administratively blocked. Access denied.`,
        'DEVICE_BLOCKED'
      );
    }

    // 8. Strict active status check
    if (device.status !== 'ACTIVE') {
      throw new ForbiddenError(
        `Device ${device.device_identifier} status is ${device.status}. Synchronization is blocked.`,
        'DEVICE_REVOKED'
      );
    }

    // 9. Verify stored token hash matches presented token
    if (!device.device_token_hash || !timingSafeHashEqual(presentedTokenHash, String(device.device_token_hash))) {
      throw new UnauthorizedError(
        'Device credential mismatch or token has been invalidated. Re-registration required.',
        'DEVICE_TOKEN_MISMATCH'
      );
    }

    // 10. Verify authoritative organization, center, and device identifier claims
    if (String(device.organization_id || '').toLowerCase() !== authoritativeOrgId.toLowerCase()) {
      throw new ForbiddenError('Cross-tenant device operation denied: Organization mismatch.', 'CROSS_TENANT_ACCESS_DENIED');
    }
    if (String(device.center_id || '').toLowerCase() !== decoded.centerId.toLowerCase()) {
      throw new ForbiddenError('Device center ownership mismatch.', 'DEVICE_CENTER_MISMATCH');
    }
    if (String(device.device_identifier || '') !== decoded.deviceIdentifier) {
      throw new ForbiddenError('Device identifier claim mismatch.', 'DEVICE_IDENTIFIER_MISMATCH');
    }

    const centerRes = await tenantDb.query(
      `SELECT id, organization_id, status FROM dairy_centers WHERE id = $1 AND organization_id = $2 LIMIT 1;`,
      [device.center_id, authoritativeOrgId]
    );
    if (centerRes.rows.length === 0 || String(centerRes.rows[0].status || '').toUpperCase() !== 'ACTIVE') {
      throw new ForbiddenError('Device assigned center is missing or inactive.', 'DEVICE_CENTER_INVALID');
    }

    // 11. Offline authorization expiry check
    const effectiveMaxHours = device.offline_auth_policy_approved
      ? (device.approved_max_offline_hours || device.max_offline_hours || 72)
      : (device.max_offline_hours || 72);

    if (device.last_seen_at && effectiveMaxHours) {
      const hoursOffline = (Date.now() - new Date(device.last_seen_at).getTime()) / (1000 * 60 * 60);
      if (hoursOffline > Number(effectiveMaxHours)) {
        throw new ForbiddenError(
          `Device authorization has expired (${Math.round(hoursOffline)}h offline > ${effectiveMaxHours}h limit). Re-authentication required.`,
          'OFFLINE_EXPIRED'
        );
      }
    }

    // 12. Populate trusted request device context
    req.deviceId = device.id;
    req.device = {
      deviceId: device.id,
      organizationId: device.organization_id,
      centerId: device.center_id,
      deviceIdentifier: device.device_identifier,
      deviceType: device.device_type,
      tokenHash: presentedTokenHash,
    };
    next();
  } catch (err) {
    next(err);
  }
}
